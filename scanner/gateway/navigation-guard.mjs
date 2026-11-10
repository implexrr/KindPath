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
  session.on('Fetch.requestPaused', event => {
    void (async () => {
      if (event.frameId === frameTree.frame.id) {
        const scanning = isScanning();
        if (scanning) onPageChange();
        const url = event.request.url;
        state.failure ??= navigationRejection(target, url, state.lastUrl);
        if (!scanning && !state.failure && visited.has(url)) state.failure = 'REDIRECT_LOOP';
        if (!scanning && !state.failure && visited.size >= 10) state.failure = 'REDIRECT_LIMIT';
        if (state.failed || state.failure || scanning) {
          await session.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' });
          return;
        }
        visited.add(url); state.lastUrl = url;
      }
      await session.send('Fetch.continueRequest', { requestId: event.requestId });
    })().catch(fail);
  });
  await session.send('Fetch.enable', { patterns: [{ resourceType: 'Document', requestStage: 'Request' }] });
  return state;
}
