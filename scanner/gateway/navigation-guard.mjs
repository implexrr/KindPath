import { navigationRejection } from './navigation.mjs';

// A separate CDP session pauses each document request, including redirect hops
// not intercepted by Playwright routing. Resource routing remains independent.
export async function installNavigationGuard(page, target, { isScanning, onPageChange }) {
  const session = await page.context().newCDPSession(page);
  const state = { failure: undefined, failed: false, lastUrl: target };
  const fail = () => {
    state.failed = true;
    void page.close().catch(() => {});
  };
  // Detachment can disable interception without rejecting a pending command.
  // Never allow that loss to leave the scan running with a healthy guard flag.
  session.on('close', fail);
  const { frameTree } = await session.send('Page.getFrameTree');
  const visited = new Set();
  let lastRequest, restarted=false, documents=0;
  session.on('Fetch.requestPaused', event => {
    void (async () => {
      if (event.frameId === frameTree.frame.id) {
        const scanning = isScanning();
        if (scanning) onPageChange();
        const url = event.request.url;
        state.failure ??= navigationRejection(target, url, state.lastUrl);
        // Fetch may re-intercept an existing network request. Server redirect
        // hops carry redirectedRequestId; a browser restart of the original
        // request does not. Permit one such restart without resetting budgets.
        const sameNetworkRequest = typeof event.networkId === 'string' && event.networkId.length > 0
          && lastRequest?.networkId === event.networkId && !event.redirectedRequestId;
        const repeatedInterception = sameNetworkRequest && lastRequest.url === url;
        const originalRequestRestart = sameNetworkRequest && !repeatedInterception
          && !restarted && url === target;
        if (!scanning && !state.failure && originalRequestRestart) {visited.clear();restarted=true;}
        if (!scanning && !state.failure && !repeatedInterception && visited.has(url)) state.failure = 'REDIRECT_LOOP';
        if (!scanning && !state.failure && !repeatedInterception && documents >= 10) state.failure = 'REDIRECT_LIMIT';
        if (state.failed || state.failure || scanning) {
          await session.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
          return;
        }
        if(!repeatedInterception)documents++;
        visited.add(url); state.lastUrl = url;
        lastRequest = {networkId:event.networkId,url};
      }
      await session.send('Fetch.continueRequest', { requestId: event.requestId });
    })().catch(fail);
  });
  await session.send('Fetch.enable', { patterns: [{ resourceType: 'Document', requestStage: 'Request' }] });
  // Use the browser control channel, not a window.stop implementation supplied
  // by the untrusted page. A failed stop must never permit a partial report.
  state.stopLoading = async () => {
    if (state.failed || state.failure) throw new Error('Navigation guard unavailable');
    try { await session.send('Page.stopLoading'); }
    catch (error) { fail(); throw error; }
    if (state.failed || state.failure) throw new Error('Navigation guard unavailable');
  };
  return state;
}
