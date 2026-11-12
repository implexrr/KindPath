// Executed inside the existing network-disabled browser container; receives only public build assets and fixture data.
import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const data = JSON.parse(Buffer.concat(chunks).toString());
const engine = data.browser ?? 'chromium';
const browserType = new Map([['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]).get(engine);
assert.ok(browserType, 'Choose a fixed browser engine');
const browser = await browserType.launch({ headless: true, ...(engine === 'chromium' ? { chromiumSandbox: true } : {}) });
try {
  if (engine === 'chromium') {
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    const { analyzePublicPage, summarizeRules } = await import('./public-report.mjs');
    const { readFile } = await import('node:fs/promises');
    const markup = await readFile('./fixtures/barriers.html', 'utf8');
    const analyzeFixture = async analyze => {
      const context = await browser.newContext();
      try {
        const fixture = await context.newPage();
        await fixture.setContent(markup);
        return await analyze(fixture);
      } finally {
        await context.close();
      }
    };
    const full = await analyzeFixture(page => new AxeBuilder({ page }).options({ iframes: false }).analyze());
    const compact = await analyzeFixture(analyzePublicPage);
    for (const group of ['violations', 'incomplete']) {
      assert.deepEqual(summarizeRules(compact[group]), summarizeRules(full[group]));
    }
    for (const group of ['passes', 'inapplicable']) {
      assert.deepEqual(compact[group].map(rule => rule.id), full[group].map(rule => rule.id));
    }
    assert.ok(full.passes.some(rule => rule.nodes.length > 1));
    assert.ok(compact.passes.every(rule => rule.nodes.length <= 1));

    const { installNavigationGuard } = await import('./gateway/navigation-guard.mjs');
    for (const analyzing of [false, true]) {
      const guardPage = await browser.newPage({serviceWorkers:'block'});
      const session = await guardPage.context().newCDPSession(guardPage);
      let scanning = false;
      await guardPage.route('**/*', route => route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Guard lifecycle</title><h1>Controlled page</h1>'}));
      // Use a real CDP session while retaining a handle for deliberate detachment.
      const guard = await installNavigationGuard({
        context: () => ({newCDPSession: async () => session}),
        close: () => guardPage.close(),
      }, 'https://example.com/', {isScanning:()=>scanning,onPageChange:()=>assert.fail('Unexpected document change')});
      if (analyzing) {
        await guardPage.goto('https://example.com/');
        assert.equal(guard.failed,false); scanning = true;
      }
      const closed = guardPage.waitForEvent('close');
      await session.detach(); await closed;
      assert.equal(guard.failed,true,'Lost navigation interception must fail closed');
      assert.equal(guardPage.isClosed(),true);
    }
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  page.setDefaultTimeout(10000);
  const unexpected = [];
  let apiRequests = 0;
  let publicCapabilities = true, publicCalls = 0, captureCapabilities = false;
  const publicReport = { ...data.report, mode: 'public', scanId:data.sitePreview.scanId, requestedUrl: 'https://example.com/start', url: 'https://www.example.com/en/start?locale=en',
    coverage: {blockedRequests:2,failedRequests:3,omittedRules:1,omittedNodes:4},
    scanner: { ...data.report.scanner, fixture: 'public' }, limitations: ['Controlled URL-report UI response; no public site fetched.'] };
  let publicResponse = publicReport, publicStatus = 200;
  let publicResponseOverride;
  let delayCapabilities=false,capabilitiesHeld=false,releaseCapabilities;
  let delayPublic = false, releasePublic, publicHeld = false, notifyPublic;
  async function assertDownload(expected, coverage = expected.mode === 'public' ? expected.coverage : undefined) {
    const requestsBefore = apiRequests;
    const pending = page.waitForEvent('download');
    const link = page.getByRole('link', { name: 'Download report JSON', exact: true });
    await link.press('Enter');
    const download = await pending;
    assert.match(download.suggestedFilename(), /^kindpath-(demo|fixture|public)-report-[0-9TZ-]+\.json$/);
    const stream = await download.createReadStream();
    const parts = []; for await (const chunk of stream) parts.push(chunk);
    const exported = JSON.parse(Buffer.concat(parts).toString('utf8'));
    assert.equal(exported.application, 'KindPath'); assert.equal(exported.formatVersion, 1);
    assert.equal(exported.report.mode, expected.mode);
    assert.equal(exported.report.url, expected.url);
    assert.equal(exported.report.requestedUrl, expected.requestedUrl);
    assert.equal(exported.report.generatedAt, expected.generatedAt);
    assert.deepEqual(exported.report.coverage,coverage ?? undefined);
    assert.equal(exported.report.pageLoadIncomplete,expected.pageLoadIncomplete);
    assert.equal(exported.report.pageNotice,expected.pageNotice);
    assert.deepEqual(exported.report.findings, expected.findings);
    assert.deepEqual(exported.report.scanner, expected.scanner);
    assert.deepEqual(exported.report.manualChecks, expected.manualChecks);
    for (const limitation of expected.limitations ?? []) assert.ok(exported.report.limitations.includes(limitation));
    assert.equal(exported.source.label, 'Automated page scan');
    assert.ok(exported.report.limitations.some(text => text.includes('do not establish accessibility conformance')));
    assert.equal('html' in exported.report, false);
    assert.equal('sitePreview' in exported.report, false); assert.equal('scanId' in exported.report, false);
    assert.ok(!JSON.stringify(exported).includes('Captured website marker'));
    assert.equal(apiRequests, requestsBefore, 'Export must not request another scan or capture');
    return await link.getAttribute('href');
  }
  async function printablePdf(expected) {
    const screenCoverage=expected.mode==='public'?await page.locator('.results .scan-coverage').textContent():undefined;
    await page.emulateMedia({ media: 'print' });
    const printed = page.locator('.print-report');
    assert.equal(await printed.isVisible(), true);
    assert.equal(await printed.getByRole('region',{name:'Scan coverage',exact:true}).count(),expected.mode==='public'?1:0);
    if(expected.mode==='public'){
      assert.equal(await printed.locator('.scan-coverage').isVisible(),true);
      assert.equal(await printed.locator('.scan-coverage').textContent(),screenCoverage);
      assert.ok((await printed.textContent()).includes('Zero violations does not establish accessibility conformance.'));
    }
    assert.equal(await page.locator('main').isVisible(), false);
    assert.equal(await printed.locator('.printed-finding').count(), expected.findings.length + (expected.scanner?.incomplete.length ?? 0));
    assert.equal(await printed.locator('iframe, img, script, details').count(), 0);
    for (const finding of [...expected.findings, ...(expected.scanner?.incomplete ?? [])]) {
      assert.ok((await printed.textContent()).includes(finding.title));
      for (const element of finding.elements) assert.ok((await printed.textContent()).includes(element.guidance));
    }
    assert.ok((await printed.textContent()).includes(expected.generatedAt));
    if (expected.requestedUrl) {
      assert.ok((await printed.textContent()).includes(expected.requestedUrl));
      assert.ok((await printed.textContent()).includes(expected.url));
    }
    const pdf = engine === 'chromium' ? await page.pdf({ format: 'A4', printBackground: false, tagged: true, outline: true }) : null;
    if (pdf) {
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
      const syntax = pdf.toString('latin1');
      for (const pattern of [/\/StructTreeRoot\b/, /\/Marked true/, /\/Lang \(en\)/, /\/S \/H1\b/, /\/S \/H2\b/, /\/S \/L\b/, /\/Outlines\b/]) {
        assert.match(syntax, pattern, 'Chromium print samples must retain English language, structural tags and a document outline');
      }
    }
    await page.emulateMedia({ media: 'screen' });
    assert.equal(await printed.isVisible(), false);
    return pdf?.toString('base64') ?? null;
  }
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    // WebKit routes revoked Blob fetches through this handler; let the browser resolve its own local Blob store.
    if (url.protocol === 'blob:' && url.origin === 'http://kindpath-ui.invalid') { await route.continue(); return; }
    if (url.pathname.startsWith('/api/')) apiRequests++;
    if (url.hostname !== 'kindpath-ui.invalid') { unexpected.push(url.hostname); await route.abort(); return; }
    if (url.pathname === '/api/scanning-capabilities') { if(delayCapabilities){capabilitiesHeld=true;await new Promise(resolve=>releaseCapabilities=resolve);} await route.fulfill({ json: { publicScanningEnabled: publicCapabilities, publicCaptureEnabled: captureCapabilities, urlPolicy: 'public-http-https' } }); return; }
    if (url.pathname === '/api/scan-public') {
      publicCalls++;
      assert.deepEqual(route.request().postDataJSON(), { url: publicReport.requestedUrl });
      const response = publicResponseOverride ?? { status: publicStatus, json: publicResponse };
      const delayed = delayPublic;
      if (delayed) { publicHeld = true; notifyPublic?.(); await new Promise(resolve => { releasePublic = resolve; }); }
      try { await route.fulfill(response); } catch (error) { if (!delayed) throw error; }
      return;
    }
    if (url.pathname.startsWith('/api/')) unexpected.push(url.pathname);
    const asset = data.assets[url.pathname];
    await route.fulfill(asset ? { body: asset.body, contentType: asset.type } : { status: 404, body: '' });
  });
  await page.goto('http://kindpath-ui.invalid/');
  const websiteEntry=page.getByLabel('Your website URL');
  assert.equal(await websiteEntry.getAttribute('type'),'text');
  assert.equal(await websiteEntry.getAttribute('inputmode'),'url');
  assert.match(await websiteEntry.getAttribute('aria-describedby'),/website-entry-note/);
  await page.getByText('One public page per scan. HTTPS is added if you leave it out.', {exact:true}).waitFor();
  assert.equal(await page.getByText(/How it works|Local Preview|Design mockups|Try an example|Scan built-in page/i).count(), 0);
  await page.getByRole('button', {name:'Scan website',exact:true}).waitFor();
  await page.getByRole('link', {name:'Skip to content',exact:true}).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'main');
  await page.keyboard.press('Tab');
  assert.equal(await websiteEntry.evaluate(node => node === document.activeElement), true);
  await websiteEntry.blur();
  const landing = page.locator('.hero');
  const panes = landing.locator('.landing-comparison-page');
  assert.equal(await panes.count(), 2);
  const filterId = await panes.nth(1).locator('filter').getAttribute('id');
  assert.equal(await panes.nth(0).locator('filter').count(), 0);
  assert.equal(await panes.nth(1).locator('svg > g').getAttribute('filter'), `url(#${filterId})`);
  assert.equal(await panes.nth(1).locator('feColorMatrix').count(), 1);
  assert.equal(await panes.nth(1).locator('feGaussianBlur').count(), 1);
  const pageFooter = page.getByRole('contentinfo');
  const copyright = pageFooter.getByText('© 2026 Chenhao Wang', {exact:true});
  const repository = pageFooter.getByRole('link', {name:'GitHub repository',exact:true});
  assert.equal(await repository.getAttribute('href'), 'https://github.com/implexrr/KindPath');
  await landing.getByRole('button', {name:'Scan website',exact:true}).focus();
  await page.keyboard.press('Tab');
  assert.ok(await repository.evaluate(node => node === document.activeElement && node.matches(':focus-visible')));
  await repository.blur();
  const landingImages = {};
  for (const [size, width, height] of [['desktop', 1200, 720], ['mobile', 390, 740]]) {
    await page.setViewportSize({width, height});
    const [left, right] = await panes.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
    const form = await landing.locator('form').boundingBox();
    const owner = await copyright.boundingBox();
    const link = await repository.boundingBox();
    assert.ok(owner.x + owner.width < link.x, 'Footer items must sit apart');
    assert.ok(Math.abs(owner.y + owner.height / 2 - link.y - link.height / 2) < 1, 'Footer items must align on the same row');
    assert.ok(link.height >= (size === 'mobile' ? 44 : 24), 'The link must have a usable target height');
    assert.equal(left.top, right.top);
    assert.ok(left.right < right.left);
    if (size === 'mobile') assert.ok(left.top > form.y + form.height);
    else {
      const heading = await landing.getByRole('heading', {level:1}).boundingBox();
      const instructions = await landing.getByText('Scan a public webpage', {exact:false}).boundingBox();
      const comparison = await landing.locator('figure').boundingBox();
      const footer = await page.getByRole('contentinfo').boundingBox();
      assert.ok(comparison.y >= heading.y + heading.height);
      assert.ok(comparison.y + comparison.height <= instructions.y);
      assert.ok(instructions.y + instructions.height <= form.y);
      assert.ok(footer.height <= 38, 'The desktop footer must remain a compact row');
      assert.ok(footer.y + footer.height <= height, 'The compact landing page must fit the desktop viewport');
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    landingImages[size] = (await page.screenshot({fullPage:true})).toString('base64');
  }
  for (const width of [760, 761]) {
    await page.setViewportSize({width,height:800});
    const comparison = await landing.locator('figure').boundingBox();
    const form = await landing.locator('form').boundingBox();
    assert.equal(comparison.y < form.y, width > 760);
  }
  await page.setViewportSize({width:320,height:740});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.ok((await landing.getByRole('button', {name:'Scan website',exact:true}).boundingBox()).height >= 44);
  await page.setViewportSize({width:1280,height:900});
  publicCapabilities = false;
  await page.reload();
  await page.getByRole('button', {name:'Scan website',exact:true}).waitFor();
  await websiteEntry.fill('example.com'); await websiteEntry.press('Enter');
  await page.getByRole('alert').filter({hasText:'Website scanning is unavailable'}).waitFor();
  assert.equal(publicCalls, 0);
  for(const entry of ['javascript:alert(1)','https:/example.com','https:///example.com','user@example.com','https://user:pass@example.com']) {
    const before=apiRequests;await websiteEntry.fill(entry);await websiteEntry.press('Enter');
    await page.getByRole('alert').waitFor();assert.equal(apiRequests,before);
    assert.equal(await page.locator('.results').count(),0);
  }
  await websiteEntry.fill('');
  await page.getByRole('button',{name:'Scan website',exact:true}).click();
  assert.equal(await websiteEntry.evaluate(node=>node.validity.valueMissing),true);
  // Mock capability/HTTP responses inside network-none only. The actual app/API gates stay disabled.
  publicCapabilities = true;delayCapabilities=true;
  await page.reload();
  for(let tries=0;!capabilitiesHeld&&tries<100;tries++)await page.waitForTimeout(50);
  assert.equal(capabilitiesHeld,true);
  assert.equal(await page.getByRole('button',{name:'Checking scanner…',exact:true}).isDisabled(),true);
  await websiteEntry.fill(publicReport.requestedUrl);await websiteEntry.press('Enter');
  assert.equal(publicCalls,0,'A pending capability check must not submit a website scan');
  assert.equal(await page.getByRole('alert').count(),0,'Loading capabilities must not report the scanner unavailable');
  delayCapabilities=false;releaseCapabilities();
  const publicButton = page.getByRole('button', { name: 'Scan website', exact: true });
  await publicButton.waitFor();
  for(const entry of ['127.0.0.1','printer.local','example.com:8443','https://example.com/#section']) {
    const before=apiRequests;await websiteEntry.fill(entry);await publicButton.click();
    await page.getByRole('alert').waitFor();assert.equal(apiRequests,before);
    assert.equal(await page.locator('.results').count(),0);
  }
  await websiteEntry.fill('  example.com/start  ');
  await publicButton.click();
  await page.locator('.results').getByText('Scanned page: ' + publicReport.url, { exact: true }).waitFor();
  assert.equal(await websiteEntry.inputValue(),publicReport.requestedUrl);
  await page.locator('.results').getByText('Requested URL: ' + publicReport.requestedUrl, { exact: true }).waitFor();
  await page.waitForFunction(() => document.activeElement?.matches('.results'));
  assert.equal(await page.locator('.results .manual-card').getByText(/axe-core/).count(), 0);
  const reportSupportFollows = async content => {
    const bottom = await content.evaluate(node => node.getBoundingClientRect().bottom);
    for (const block of [
      page.locator('.results').getByText('Automated results for the final scanned page only. Manual review is still required.', {exact:true}),
      page.locator('.results .scan-coverage'),
      page.locator('.results .report-exports'),
    ]) assert.ok(await block.evaluate(node => node.getBoundingClientRect().top) >= bottom);
  };
  await reportSupportFollows(page.locator('.results .findings-layout'));

  assert.equal(await page.getByText('Automated page scan', { exact: true }).count(), 1);
  const coverageNotice=page.locator('.results').getByRole('region',{name:'Scan coverage',exact:true});
  await coverageNotice.getByText('Scan coverage is limited',{exact:true}).waitFor();
  assert.match(await coverageNotice.textContent(),/2 requests blocked.*3 requests failed.*overlap/);
  assert.match(await coverageNotice.textContent(),/1 rules and 4 affected elements.*partial/);
  await page.setViewportSize({width:1280,height:900});
  const coverageDesktop=(await page.screenshot({fullPage:true})).toString('base64');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await coverageNotice.isVisible(),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Coverage notice must fit the mobile viewport');
  const coverageMobile=(await page.screenshot({fullPage:true})).toString('base64');
  await page.setViewportSize({width:1280,height:900});
  await assertDownload(publicReport);
  await printablePdf(publicReport);
  // Controlled responses exercise zero findings, unavailable data and stale coverage without external requests.
  for(const coverage of [{blockedRequests:0,failedRequests:0,omittedRules:0,omittedNodes:0},undefined,
    {...publicReport.coverage,failedRequests:-1},{blockedRequests:0,failedRequests:0,omittedRules:0,omittedNodes:2}]) {
    publicResponse={...publicReport,findings:[],coverage};
    await publicButton.click();
    await page.waitForFunction(()=>document.querySelector('form').getAttribute('aria-busy')==='false');
    await coverageNotice.waitFor();
    const text=await coverageNotice.textContent();
    assert.ok(text.includes('Zero violations does not establish accessibility conformance.'));
    if(!coverage||coverage.failedRequests<0)assert.ok(text.includes('Scan coverage details unavailable'));
    else if(coverage.omittedNodes)assert.ok(text.includes('returned results are partial'));
    else {
      assert.ok(text.includes('Other scan limitations still apply'));
      assert.ok(!text.includes('Scan coverage is limited'));
    }
    assert.ok(!text.includes('2 requests blocked'),'Earlier request counts must not remain');
    await assertDownload(publicResponse,(!coverage||coverage.failedRequests<0)?null:coverage);
    await printablePdf(publicResponse);
  }
  publicResponse=publicReport;
  await publicButton.click();
  await page.locator('.results').waitFor();
  await page.getByRole('button', { name: /Visual preview/ }).click();
  assert.equal(await page.locator('iframe').count(), 0);
  await page.getByText('Website image capture is disabled. Your accessibility report and JSON download are still available.', {exact:true}).waitFor();
  await assertDownload(publicResponse);
  await page.getByLabel('Your website URL').fill(publicReport.requestedUrl);
  for(const scanId of [undefined,'old']){
    publicResponse={...publicReport,scanId};await publicButton.click();
    await page.getByRole('alert').filter({hasText:'snapshot did not match'}).waitFor();
    assert.equal(await page.locator('.results').count(),0);
  }
  for (const wrong of [{ ...publicReport, requestedUrl: 'https://example.com/old' },
    { ...publicReport, url: 'http://127.0.0.1/' },
    { ...publicReport, url: 'https://example.org/start' },
    { ...publicReport, url: 'https://www.www.example.com/start' },
    { ...publicReport, url: 'https://other.example.com/start' },
    { ...publicReport, url: 'http://example.com/start' },
    { ...publicReport, url: 'http://printer.local/' },
    { ...publicReport, url: 'https://user:pass@example.org/' },
    { ...publicReport, url: 'https://example.org:8443/' }, { ...publicReport, mode: 'demo' }]) {
    publicResponse = wrong;
    await publicButton.click();
    await page.getByRole('alert').filter({ hasText: 'report did not match' }).waitFor();
    assert.equal(await page.locator('.results').count(), 0);
  }
  const scanRetry = page.getByRole('button', { name: 'Try again', exact: true });
  const submittedEntry = '  example.com/start  ';
  await websiteEntry.fill(submittedEntry);
  for (const [diagnostic, explanation] of [
    [{ stage: 'page-loading', code: 'HTTP_STATUS', httpStatus: 403 }, 'Access to the page was refused (HTTP 403)'],
    [{ stage: 'page-loading', code: 'REDIRECT_HOST_CHANGED' }, 'hostname'],
    [undefined, 'The scan could not finish'],
  ]) {
    publicStatus = 503;
    publicResponse = { code: 'SCAN_FAILED', error: 'PRIVATE_SENTINEL', diagnostic };
    await publicButton.click();
    const failure = page.getByRole('alert').filter({ hasText: explanation });
    await failure.waitFor();
    assert.equal(await failure.evaluate(node => node === document.activeElement), true);
    assert.equal(await websiteEntry.inputValue(), submittedEntry);
    assert.equal(await scanRetry.count(), 0);
    assert.equal(await page.locator('.results').count(), 0);
    assert.equal(await page.getByText('PRIVATE_SENTINEL').count(), 0);
  }
  await websiteEntry.fill('example.com/edited');
  assert.equal(await page.getByRole('alert').count(), 0);
  await websiteEntry.fill(submittedEntry);
  publicStatus = 429; publicResponse = { code: 'SCANNER_BUSY' };
  await publicButton.click();
  await page.getByRole('alert').filter({ hasText: 'Another scan is still finishing' }).waitFor();
  assert.equal(await scanRetry.evaluate(node => node === document.activeElement), true);
  assert.equal(await websiteEntry.inputValue(), submittedEntry);
  const retryRequest = page.waitForRequest(request => request.url().endsWith('/api/scan-public'));
  publicStatus = 200; publicResponse = publicReport;
  await scanRetry.click();
  assert.deepEqual((await retryRequest).postDataJSON(), { url: publicReport.requestedUrl });
  await page.locator('.results').waitFor();
  assert.equal(await scanRetry.count(), 0);
  // The capture-enabled test response still never fetches an external page or enables the real API.
  captureCapabilities = true;
  publicResponse = { ...publicReport, scanId:data.sitePreview.scanId, sitePreview:data.sitePreview };
  await page.reload(); await publicButton.waitFor();
  await page.getByLabel('Your website URL').fill(publicReport.requestedUrl);
  await publicButton.click();
  await page.locator('.results').getByText('Requested URL: ' + publicReport.requestedUrl, {exact:true}).waitFor();
  await page.waitForFunction(() => document.activeElement?.matches('.results'));
  await assertDownload(publicResponse);
  await printablePdf(publicResponse);
  await page.getByRole('button', {name:/Visual preview/}).click();
  const captureTime = page.locator('.snapshot-captured time');
  await captureTime.waitFor();
  assert.equal(await captureTime.getAttribute('datetime'), data.sitePreview.capturedAt);
  assert.equal(await page.locator('.snapshot-captured').textContent(), 'Captured at ' + await captureTime.textContent());
  assert.equal(await page.getByText(/Educational approximations|Custom visual settings are applied/).count(), 0);
  assert.equal(await page.getByRole('button',{name:'Apply visual effects',exact:true}).count(), 0);
  await reportSupportFollows(page.locator('.preview-workspace'));
  const captured = page.frameLocator('iframe').first();
  await captured.getByText('Captured website marker',{exact:true}).waitFor();
  assert.equal(await page.locator('iframe').count(),2);
  for(const frame of page.frames().slice(1)) {
    assert.equal(await frame.locator('script,form,img,iframe,a[href]').count(),0);
    assert.equal(await frame.locator('input').isDisabled(),true); assert.equal(await frame.locator('button').isDisabled(),true);
    assert.equal(await frame.evaluate(()=>{try{void parent.document.body;return false;}catch{return true;}}),true);
  }
  const capturedLink = captured.getByText('Captured link',{exact:true});
  await capturedLink.hover();
  assert.equal(await capturedLink.evaluate(node=>getComputedStyle(node).color),'rgb(255, 0, 0)');
  await capturedLink.dispatchEvent('click');
  assert.equal(page.frames().slice(1).every(frame=>frame.url()==='about:srcdoc'),true);
  await captured.getByText('Static captured advertisement',{exact:true}).waitFor();
  const oldFrame = await page.locator('iframe').first().elementHandle();
  const nextId='22222222-2222-4222-8222-222222222222';
  publicResponse={...publicResponse,scanId:nextId,sitePreview:{...data.sitePreview,scanId:nextId,html:data.sitePreview.html.replace('Captured website marker','New captured page marker')}};
  await publicButton.click();
  await oldFrame.waitForElementState('hidden');
  await page.getByRole('button',{name:/Visual preview/}).click();
  await page.frameLocator('iframe').first().getByText('New captured page marker',{exact:true}).waitFor();
  assert.equal(await oldFrame.evaluate(node=>node.isConnected),false);
  assert.equal(await page.getByRole('heading',{name:'With visual impairment',exact:true}).count(),1);
  for(const bad of [undefined,{...data.sitePreview,scanId:nextId},{...data.sitePreview,url:'https://example.com/old'}]) {
    publicResponse={...publicReport,scanId:data.sitePreview.scanId,sitePreview:bad};
    await publicButton.click();
    await page.getByRole('alert').filter({hasText:'snapshot did not match'}).waitFor();
    assert.equal(await page.locator('iframe').count(),0); assert.equal(await page.locator('.results').count(),0);
  }
  publicResponse={...publicReport,pageLoadIncomplete:true,sitePreview:data.sitePreview};
  await publicButton.click();await page.locator('.results').waitFor();
  await page.getByRole('region',{name:'Scan coverage',exact:true}).getByText(/Unfinished loads were stopped, so this partial report/).waitFor();
  await assertDownload(publicResponse);
  for (const [pageNotice, screen] of [['browser-verification', 'browser verification'], ['sign-in', 'sign-in']]) {
    publicResponse = {...publicReport, pageNotice, sitePreview: data.sitePreview};
    await publicButton.click();
    const notice = page.getByRole('status').filter({hasText: `KindPath received a ${screen} screen. The findings and any preview describe that screen.`});
    await notice.waitFor();
    await page.getByRole('button', {name: /Visual preview/}).click();
    await notice.waitFor();
    await assertDownload(publicResponse);
  }
  // Browser-rendered previews: decoded pixels, fitting, scroll access, filters and inert hover areas.
  publicResponse={...publicReport,scanId:data.imagePreview.scanId,sitePreview:data.imagePreview};
  await publicButton.click();await page.locator('.results').waitFor();
  await page.getByRole('button',{name:/Visual preview/}).click();
  assert.equal(await page.getByRole('status').filter({hasText: /KindPath received a .* screen/}).count(), 0);
  const imageFrames=page.locator('iframe');
  for(let i=0;i<2;i++){
    const frame=page.frameLocator('iframe').nth(i);
    await frame.locator('img').evaluate(img=>img.decode());
    const info=await frame.locator('img').evaluate(img=>{
      const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
      const context=canvas.getContext('2d');context.drawImage(img,0,0);
      return {width:img.naturalWidth,height:img.naturalHeight,fit:img.getBoundingClientRect().width<=innerWidth,
        top:[...context.getImageData(1270,100,1,1).data],bottom:[...context.getImageData(1270,1700,1,1).data]};
    });
    assert.equal(info.width,1280);assert.equal(info.height,1800);assert.equal(info.fit,true);
    for(const [actual,expected] of [[info.top,[16,32,48]],[info.bottom,[192,32,64]]])expected.forEach((v,j)=>assert.ok(Math.abs(actual[j]-v)<8));
    assert.equal(await imageFrames.nth(i).getAttribute('sandbox'),'');
    assert.equal(await frame.locator('script,form,iframe,a[href]').count(),0);
    assert.equal(await frame.locator('body').evaluate(()=>{try{void parent.document;return false;}catch{return true;}}),true);
  }
  const slider = name => page.getByRole('slider', { name, exact: true });
  const waitForModifiedDocument=async()=>{
    const source=await page.locator('iframe').nth(1).getAttribute('srcdoc');
    const expectedFilter=source.match(/<body style="filter:([^"]*)"/)?.[1]??'';
    const normalizedFilter=await page.evaluate(value=>{const element=document.createElement('div');element.style.filter=value;return element.style.filter;},expectedFilter);
    let last;
    const expectedMatrix=source.match(/<feColorMatrix type="matrix" values="([^"]*)"/)?.[1]??null;
    for(let attempt=0;attempt<100;attempt++){
      try{
        const actual=await page.frameLocator('iframe').nth(1).locator('body').evaluate(body=>({filter:body.style.filter,matrix:body.ownerDocument.querySelector('feColorMatrix')?.getAttribute('values')??null}));
        last=actual;
        if(actual.filter===normalizedFilter&&actual.matrix===expectedMatrix)return actual.filter;
      }catch{/* A preset replaces srcdoc; wait for the new opaque document. */}
      await page.waitForTimeout(20);
    }
    throw new Error('The modified preview did not finish loading its current effects: '+JSON.stringify({expected:normalizedFilter,expectedMatrix,actual:last}));
  };
  const imageOriginalStyle=await imageFrames.first().getAttribute('style');
  for(const name of ['Original','Protanopia','Deuteranopia','Tritanopia','Blurred vision','Reduced peripheral vision']){
    await page.getByRole('group',{name:'Vision presets',exact:true}).getByRole('button',{name,exact:true}).click();
    assert.equal(await imageFrames.first().getAttribute('style'),imageOriginalStyle);
  }
  const imagePresets=page.getByRole('group',{name:'Vision presets',exact:true});
  await imagePresets.getByRole('button',{name:'Original',exact:true}).click();
  const visiblePixel=async index=>{
    if(index===1)await waitForModifiedDocument();
    const element=imageFrames.nth(index);
    await page.frameLocator('iframe').nth(index).locator('img').evaluate(img=>img.decode());
    await element.scrollIntoViewIfNeeded();
    const box=await element.boundingBox();
    const imageWidth=await page.frameLocator('iframe').nth(index).locator('img').evaluate(img=>img.getBoundingClientRect().width);
    const bytes=await page.screenshot({clip:box});
    return page.evaluate(async({data,x,y})=>{
      const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();
      const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
      const context=canvas.getContext('2d');context.drawImage(img,0,0);
      return [...context.getImageData(x,y,1,1).data].slice(0,3);
    },{data:bytes.toString('base64'),x:Math.floor(imageWidth*1270/1280),y:Math.floor(imageWidth*500/1280)});
  };
  const assertPixel=(actual,expected)=>expected.forEach((value,index)=>assert.ok(Math.abs(actual[index]-value)<=3,`Expected rendered pixel ${expected}, got ${actual}`));
  const originalPixels=await imageFrames.first().screenshot();
  const unfilteredPixels=await imageFrames.nth(1).screenshot();
  assertPixel(await visiblePixel(0),[192,32,64]);
  for(const [name,expected] of [['Protanopia',[82,78,64]],['Deuteranopia',[122,111,59]],['Tritanopia',[211,0,47]]]){
    await imagePresets.getByRole('button',{name,exact:true}).click();
    assertPixel(await visiblePixel(1),expected);
    assertPixel(await visiblePixel(0),[192,32,64]);
    assert.equal(await imageFrames.nth(1).evaluate(el=>el.style.filter),'','No parent filter may cross the opaque iframe boundary');
  }
  await page.getByLabel('Colour preset',{exact:true}).selectOption('grayscale');
  assertPixel(await visiblePixel(1),[68,68,68]);
  await slider('Colour strength').press('Home');
  assertPixel(await visiblePixel(1),[192,32,64]);
  await imagePresets.getByRole('button',{name:'Blurred vision',exact:true}).click();
  assert.notDeepEqual(await imageFrames.nth(1).screenshot(),unfilteredPixels,'Blur must change the raster preview');
  assert.deepEqual(await imageFrames.first().screenshot(),originalPixels,'The original image must remain visually unchanged');
  await page.getByRole('button',{name:'Reset effects',exact:true}).click();
  assert.equal(await slider('Blur strength').inputValue(), '0');
  assert.equal(await slider('Colour strength').inputValue(), '100');
  assertPixel(await visiblePixel(1),[122,111,59]);
  assertPixel(await visiblePixel(0),[192,32,64]);
  const hotspot=page.frameLocator('iframe').first().locator('.kp-link').first();await hotspot.hover();
  assert.equal(await hotspot.evaluate(node=>getComputedStyle(node).outlineStyle),'solid');await hotspot.dispatchEvent('click');
  assert.equal(page.frames().slice(1).every(frame=>frame.url()==='about:srcdoc'),true);assert.equal(page.context().pages().length,1);
  await page.getByLabel('Preview size',{exact:true}).selectOption('actual');
  await page.frameLocator('iframe').first().locator('img').evaluate(img=>img.decode());
  assert.equal(await page.frameLocator('iframe').first().locator('img').evaluate(img=>img.getBoundingClientRect().width),1280);
  const scroll=await page.frameLocator('iframe').first().locator('body').evaluate(()=>{scrollTo(1200,1800);return {x:scrollX,y:scrollY};});
  assert.ok(scroll.x>0&&scroll.y>0,'Actual size must allow access to the right and lower image');
  await page.getByLabel('Preview size',{exact:true}).selectOption('fit');
  await page.setViewportSize({width:390,height:844});
  await page.frameLocator('iframe').first().locator('img').evaluate(img=>img.decode());
  assert.ok(await page.frameLocator('iframe').first().locator('img').evaluate(img=>img.getBoundingClientRect().width<=innerWidth));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1280,height:900});await assertDownload(publicResponse);
  publicResponse={...publicReport,scanId:data.imagePreview.scanId,previewUnavailable:true};
  await publicButton.click();await page.locator('.results').waitFor();
  await page.getByRole('button',{name:/Visual preview/}).click();
  await page.getByText('The website image could not be captured. Your accessibility report and JSON download are still available.',{exact:true}).waitFor();
  await assertDownload(publicResponse);
  assert.equal(await page.locator('iframe').count(),0);
  for(const scanId of [undefined,'old']){
    publicResponse={...publicReport,scanId,previewUnavailable:true};
    await publicButton.click();await page.getByRole('alert').filter({hasText:'snapshot did not match'}).waitFor();
    assert.equal(await page.locator('.results,iframe').count(),0);
  }
  let qualityEmpty,qualitySparse;
  const qualityCases={...data.qualityPreviews,
    unknown:{...data.qualityPreviews.text,capturedTextCharacters:undefined},
    malformed:{...data.qualityPreviews.text,capturedTextCharacters:-1}};
  for(const [kind,snapshot] of Object.entries(qualityCases)) {
    publicResponse={...publicReport,scanId:snapshot.scanId,sitePreview:snapshot};
    await publicButton.click();
    await page.locator('.results').getByText('Requested URL: '+publicReport.requestedUrl,{exact:true}).waitFor();
    const scansBefore=publicCalls;
    await page.getByRole('button',{name:/Visual preview/}).click();
    assert.equal(publicCalls,scansBefore,'Quality feedback must not request another scan');
    assert.equal(await page.getByRole('alert').count(),0,'Quality feedback must not turn a report into an error');
    const feedback=page.getByRole('region',{name:'Preview detail',exact:true});
    if(kind==='empty'||kind==='whitespace') {
      await feedback.getByRole('heading',{name:'Website preview unavailable',exact:true}).waitFor();
      assert.match(await feedback.textContent(),/findings and report exports are still available/);
      assert.equal(await page.locator('iframe').count(),0);
      assert.equal(await page.getByRole('button',{name:'Reset effects',exact:true}).count(),0);
      if(kind==='empty') {
        await page.setViewportSize({width:390,height:844});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        qualityEmpty=(await page.locator('.preview-workspace').screenshot()).toString('base64');
        await page.setViewportSize({width:1280,height:900});
        await assertDownload(publicResponse);await printablePdf(publicResponse);
      }
    }else {
      assert.equal(await page.locator('iframe').count(),2);
      assert.equal(await page.getByRole('button',{name:'Reset effects',exact:true}).count(),1);
      if(kind==='sparse') {
        await page.frameLocator('iframe').first().getByText('Short page',{exact:true}).waitFor();
        await feedback.getByRole('heading',{name:'Limited preview detail',exact:true}).waitFor();
        assert.match(await feedback.textContent(),/page may simply be short/);
        qualitySparse=(await page.locator('.preview-workspace').screenshot()).toString('base64');
      }else if(kind==='text'||kind==='retained')assert.equal(await feedback.count(),0,'Previous empty/sparse feedback must disappear');
      else await feedback.getByRole('heading',{name:'Preview detail could not be assessed',exact:true}).waitFor();
      if(kind!=='sparse')await page.frameLocator('iframe').first().locator('body').filter({hasText:kind==='retained'?'Retained visible guide':'Captured page content.'}).waitFor();
      if(kind==='retained') {
        for(const frame of page.frames().slice(1)) {
          assert.equal(await frame.locator('body').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(16, 24, 40)');
          assert.equal(await frame.locator('body').evaluate(node=>getComputedStyle(node).color),'rgb(248, 250, 252)');
          assert.equal(await frame.locator('body').evaluate(node=>getComputedStyle(node).padding),'24px');
          assert.equal(await frame.locator('body').evaluate(node=>getComputedStyle(node).fontSize),'24px');
          assert.equal(await frame.locator('pre code').textContent(),'if (water < 2) {\n  water += 1;\n}');
          const retainedParagraph=frame.locator('p').filter({hasText:'Paragraph-before'});
          assert.equal(await retainedParagraph.textContent(),'Paragraph-beforeParagraph-innerParagraph-after');
          assert.equal(await retainedParagraph.locator('span').evaluate(node=>getComputedStyle(node).display),'block');
          assert.equal(await frame.locator('b').textContent(),'Important text');assert.equal(await frame.locator('i').textContent(),'Emphasis');
          assert.equal(await frame.locator('time').textContent(),'10 November');assert.equal(await frame.locator('[href],script,form,iframe,img').count(),0);
        }
        const presetGroup=page.getByRole('group',{name:'Vision presets',exact:true});
        await presetGroup.getByRole('button',{name:'Original',exact:true}).press('Enter');
        await presetGroup.getByRole('button',{name:'Blurred vision',exact:true}).press('Enter');
        assert.equal(await waitForModifiedDocument(),'blur(2px)');
        assert.equal(await page.locator('iframe').first().evaluate(node=>node.style.filter),'');
        assert.equal(publicCalls,scansBefore);
      }
    }
    await page.getByRole('button',{name:/Accessibility findings/}).click();
    assert.equal(await page.getByRole('region',{name:'Confirmed automated violations',exact:true}).locator('article').count(),publicReport.findings.length);
    await page.getByRole('link',{name:'Download report JSON',exact:true}).waitFor();
  }
  // Controlled UI responses cover severity ordering and review/empty states without scanning a public URL.
  const violations = page.getByRole('region', { name: 'Confirmed automated violations', exact: true });
  const makeFinding = (severity, index) => ({ id: `controlled-${index}`, severity,
    title: `${severity} controlled rule`, impact: 'Controlled explanation', elements: [
      { targets: ['#first'], guidance: 'Repair the first element' },
      { targets: ['#second', '#nested'], guidance: '<img src=x onerror=alert(1)>\nRepair the second element' },
    ] });
  publicResponse = { ...publicReport, previewUnavailable: true, generatedAt: '2026-11-08T00:00:00.000Z', findings:
    ['Minor', 'Unknown', 'Moderate', 'Critical', 'Serious'].map(makeFinding),
    scanner: { ...publicReport.scanner, incomplete: [{ ...makeFinding('Serious', 8), title: 'Controlled inconclusive check', elements: [] }] }, limitations: ['Controlled coverage limitation'] };
  await publicButton.click();
  const filter = page.getByLabel('Filter violations by severity', { exact: true });
  await violations.getByRole('heading', { name: 'Critical controlled rule', exact: true }).waitFor();
  // Keep named role queries in Playwright's utility world: Firefox 159 crashes when
  // aria-labelledby reflection crosses worlds (microsoft/playwright#43967).
  assert.deepEqual(await Promise.all((await violations.getByRole('heading', { level: 4 }).all()).map(heading => heading.textContent())),
    ['Critical', 'Serious', 'Moderate', 'Minor', 'Unknown'].map(level => `${level} controlled rule`));
  const reviews = page.getByRole('region', { name: 'Checks needing manual review (1)', exact: true });
  await reviews.getByText('Controlled inconclusive check', { exact: true }).waitFor();
  for (const item of await page.getByRole('list', { name: 'Violation counts by severity' }).getByRole('listitem').all()) {
    assert.equal(await item.locator('strong').textContent(), '1');
  }
  // Report completion schedules focus in requestAnimationFrame; observe it before sending keys.
  await page.waitForFunction(() => document.activeElement?.matches('.results'));
  await filter.focus(); await filter.press('Home'); await filter.press('ArrowDown');
  assert.equal(await filter.inputValue(), 'Critical');
  assert.equal(await violations.locator('article').count(), 1);
  assert.equal(await reviews.locator('article').count(), 1);
  assert.equal(await page.locator('.finding-status').textContent(), 'Showing 1 of 5 rules with violations.');
  const exportedUrl = await assertDownload(publicResponse);
  await page.evaluate(() => { window.__kindpathPrintCalls = 0; window.print = () => { window.__kindpathPrintCalls++; }; });
  await page.getByRole('button', { name: 'Print / save as PDF', exact: true }).press('Enter');
  assert.equal(await page.evaluate(() => window.__kindpathPrintCalls), 1);
  const reportPdf = await printablePdf(publicResponse);
  assert.equal(await filter.inputValue(), 'Critical', 'Printing does not change the on-screen filter');
  await page.getByRole('button', { name: /Visual preview/ }).click();
  await page.getByRole('button', { name: /Accessibility findings/ }).click();
  assert.equal(await filter.inputValue(), 'Critical', 'Tab switches retain the severity filter');
  await page.getByRole('button', { name: 'Clear severity filter' }).press('Enter');
  assert.equal(await filter.evaluate(element => element === document.activeElement), true);
  assert.equal(await violations.locator('article').count(), 5);
  const firstCard = violations.locator('article').first();
  await firstCard.locator('summary').press('Enter');
  assert.deepEqual(await Promise.all((await firstCard.locator('.element-target code').all()).map(target => target.textContent())), ['#first', '#second → #nested']);
  assert.equal(await firstCard.locator('.element-summary').nth(1).textContent(), '<img src=x onerror=alert(1)>\nRepair the second element');
  assert.equal(await firstCard.locator('img').count(), 0, 'Guidance must be displayed as text');
  await reviews.locator('summary').click();
  await reviews.getByText('No element details were returned. Review this rule manually.', { exact: true }).waitFor();
  await page.setViewportSize({ width: 1280, height: 1800 });
  const findingsDesktop = (await page.locator('.results').screenshot()).toString('base64');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const findingsMobile = (await page.locator('.results').screenshot()).toString('base64');
  // A new report resets filters; a severity with no matches differs from an empty report.
  await filter.selectOption('Minor');
  publicResponse = { ...publicResponse, generatedAt: '2026-11-08T00:00:01.000Z', findings: [makeFinding('Serious', 0)] };
  await publicButton.click();
  await page.getByRole('heading', { name: 'Serious controlled rule', exact: true }).waitFor();
  assert.equal(await page.evaluate(async url => { try { await fetch(url); return false; } catch { return true; } }, exportedUrl), true, 'The old export Blob URL must be revoked');
  assert.equal(await filter.inputValue(), 'All');
  await filter.selectOption('Critical');
  await page.getByText('No violations match this severity. Other findings are still in this report.', { exact: true }).waitFor();
  assert.equal(await reviews.locator('article').count(), 1);
  publicResponse = { ...publicReport, previewUnavailable: true, findings: [], scanner: {...publicReport.scanner, incomplete: []}, generatedAt: '2026-11-08T00:00:02.000Z' };
  await publicButton.click();
  await page.getByText('No automated violations were reported. This does not establish accessibility conformance; review the checks below and test manually.', { exact: true }).waitFor();
  assert.equal(await filter.inputValue(), 'All');
  await page.getByText('No inconclusive checks were returned. Keyboard, screen reader, and usability review are still needed.', { exact: true }).waitFor();
  await assertDownload(publicResponse);
  // Cancel a held URL scan and retry without accepting its late response.
  publicResponse = {...publicReport, previewUnavailable: true, generatedAt: '2026-11-08T01:00:00.000Z'};
  delayPublic = true;
  const heldCancellation = new Promise(resolve => { notifyPublic = resolve; });
  await publicButton.click();
  await heldCancellation;
  assert.equal(publicHeld, true);
  assert.equal(await websiteEntry.isDisabled(), true);
  await page.getByRole('button', {name:'Cancel request',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Request cancelled'}).waitFor();
  assert.equal(await page.locator('.results').count(), 0);
  assert.equal(await scanRetry.evaluate(node => node === document.activeElement), true);
  delayPublic = false;
  releasePublic();
  publicResponseOverride = {status:503,contentType:'text/html',body:'private-response-marker: invalid response'};
  await scanRetry.click();
  await page.getByRole('alert').filter({hasText:'The response could not be read.'}).waitFor();
  assert.equal(await page.locator('.results').count(), 0);
  assert.equal(await page.getByText(/private-response-marker/).count(), 0);
  assert.equal(await scanRetry.evaluate(node => node === document.activeElement), true);
  publicResponseOverride = undefined;
  await scanRetry.click();
  await page.locator('.results').waitFor();
  await assertDownload(publicResponse);
  // Editing a URL clears the prior report instead of showing it under a new address.
  await page.getByLabel('Your website URL').fill('https://example.com/new-request');
  assert.equal(await page.locator('.results').count(),0);
  assert.deepEqual(unexpected, []);
  process.stdout.write(JSON.stringify({ passed: true, engine, version: browser.version(), landingDesktop: landingImages.desktop, landingMobile: landingImages.mobile, findingsDesktop, findingsMobile, coverageDesktop, coverageMobile, qualityEmpty, qualitySparse, reportPdf }));
} finally { await browser.close(); }
