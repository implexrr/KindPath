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
  let previews = 0; const unexpected = [];
  let activeReport = data.report;
  let apiRequests = 0;
  let publicCapabilities = false, publicCalls = 0, captureCapabilities = false;
  const publicReport = { ...data.report, mode: 'public', scanId:data.sitePreview.scanId, requestedUrl: 'https://example.com/start', url: 'https://www.example.com/en/start?locale=en',
    coverage: {blockedRequests:2,failedRequests:3,omittedRules:1,omittedNodes:4},
    scanner: { ...data.report.scanner, fixture: 'public' }, limitations: ['Controlled URL-report UI response; no public site fetched.'] };
  let publicResponse = publicReport, publicStatus = 200;
  let demoFailure = false; const demoRequests = [];
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
    assert.equal(exported.source.label, expected.mode === 'demo' ? 'Illustrative report' : expected.mode === 'fixture' ? 'Real fixture scan' : 'Automated page scan');
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
  let delayScan = false, releaseScan, scanHeld = false;
  let fixtureResponseOverride;
  let delayPreview = false, releasePreview, previewHeld = false;
  let wrongPreview = false;
  const capturedFixtures = [];
  const snapshots = new Map([['garden', data.snapshot], ['barriers', data.barriersSnapshot], ['clear', data.clearSnapshot]]);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    // WebKit routes revoked Blob fetches through this handler; let the browser resolve its own local Blob store.
    if (url.protocol === 'blob:' && url.origin === 'http://kindpath-ui.invalid') { await route.continue(); return; }
    if (url.pathname.startsWith('/api/')) apiRequests++;
    if (url.hostname !== 'kindpath-ui.invalid') { unexpected.push(url.hostname); await route.abort(); return; }
    if (url.pathname === '/api/scanning-capabilities') { if(delayCapabilities){capabilitiesHeld=true;await new Promise(resolve=>releaseCapabilities=resolve);} await route.fulfill({ json: { publicScanningEnabled: publicCapabilities, publicCaptureEnabled: captureCapabilities, urlPolicy: 'public-http-https' } }); return; }
    if (url.pathname === '/api/analyze') {
      demoRequests.push(route.request().postDataJSON());
      await route.fulfill(demoFailure?{status:503,json:{error:'Controlled failure'}}:{json:data.demoReport});return;
    }
    if (url.pathname === '/api/scan-public') {
      publicCalls++;
      assert.deepEqual(route.request().postDataJSON(), { url: publicReport.requestedUrl });
      const response = publicResponse, status = publicStatus, delayed = delayPublic;
      if (delayed) { publicHeld = true; notifyPublic?.(); await new Promise(resolve => { releasePublic = resolve; }); }
      try { await route.fulfill({ status, json: response }); } catch (error) { if (!delayed) throw error; }
      return;
    }
    if (url.pathname === '/api/scan-fixture') {
      assert.ok(['barriers', 'clear'].includes(route.request().postDataJSON().fixture));
      const response = fixtureResponseOverride ?? { json: activeReport };
      const delayed = delayScan;
      if (delayed) { scanHeld = true; await new Promise(resolve => { releaseScan = resolve; }); }
      try { await route.fulfill(response); } catch (error) { if (!delayed) throw error; } // The delayed request is deliberately cancelled below.
      return;
    }
    if (url.pathname === '/api/preview-fixture') {
      previews++;
      const { fixture } = route.request().postDataJSON();
      assert.deepEqual(Object.keys(route.request().postDataJSON()), ['fixture']);
      assert.ok(snapshots.has(fixture)); capturedFixtures.push(fixture);
      const snapshot = wrongPreview ? data.clearSnapshot : snapshots.get(fixture);
      wrongPreview = false;
      const delayed = delayPreview;
      if (delayed) { previewHeld = true; await new Promise(resolve => { releasePreview = resolve; }); }
      await new Promise(done => setTimeout(done, 300));
      try { await route.fulfill(previews === 1 ? { status: 503, json: { error: 'Fixture preview is temporarily unavailable. Try again.' } } : { json: snapshot }); } catch (error) { if (!delayed) throw error; }
      return;
    }
    const asset = data.assets[url.pathname];
    await route.fulfill(asset ? { body: asset.body, contentType: asset.type } : { status: 404, body: '' });
  });
  await page.goto('http://kindpath-ui.invalid/');
  const websiteEntry=page.getByLabel('Your website URL');
  assert.equal(await websiteEntry.getAttribute('type'),'text');
  assert.equal(await websiteEntry.getAttribute('inputmode'),'url');
  assert.match(await websiteEntry.getAttribute('aria-describedby'),/website-entry-note/);
  await page.getByText('Enter a website address. HTTPS is added if you leave it out.',{exact:true}).waitFor();
  demoFailure=true;
  await websiteEntry.fill('  Example.com  ');await page.getByRole('button',{name:'Just exploring? Try an example',exact:true}).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await websiteEntry.inputValue(),'https://example.com/');
  assert.deepEqual(demoRequests.at(-1),{url:'https://example.com/'});
  demoFailure=false;
  const demoRetry=page.getByRole('button',{name:'Try again',exact:true});
  assert.equal(await demoRetry.evaluate(node=>node===document.activeElement),true);
  await demoRetry.click();
  await page.getByRole('region',{name:'Example issues to explore',exact:true}).waitFor();
  assert.deepEqual(demoRequests.slice(-2),[{url:'https://example.com/'},{url:'https://example.com/'}]);
  assert.equal(publicCalls,0,'Disabled mode must not submit a public scan');
  const demosBeforeDisabled=demoRequests.length;
  await websiteEntry.fill('example.com');await websiteEntry.press('Enter');
  await page.getByRole('alert').filter({hasText:'Website scanning is unavailable'}).waitFor();
  assert.equal(demoRequests.length,demosBeforeDisabled,'Normal URL submission must never become demo findings');
  for(const entry of ['javascript:alert(1)','https:/example.com','https:///example.com','user@example.com','https://user:pass@example.com']) {
    const before=apiRequests;await websiteEntry.fill(entry);await websiteEntry.press('Enter');
    await page.getByRole('alert').waitFor();assert.equal(apiRequests,before);
    assert.equal(await page.locator('.results').count(),0);
  }
  await websiteEntry.fill('');
  await page.getByRole('button',{name:'Scan website',exact:true}).click();
  assert.equal(await websiteEntry.evaluate(node=>node.validity.valueMissing),true);
  await page.getByRole('button', { name: 'Scan built-in page' }).click();
  // First exercise the actual bounded report returned by the fixture scanner.
  const violations = page.getByRole('region', { name: 'Confirmed automated violations', exact: true });
  await violations.waitFor();
  assert.equal(await violations.locator('article').count(), data.report.findings.length);
  const firstWithElements = data.report.findings.find(finding => finding.elements.length > 0);
  if (firstWithElements) {
    const card = violations.locator('article').filter({ has: page.getByRole('heading', { name: firstWithElements.title, exact: true }) });
    await card.locator('summary').click();
    assert.equal(await card.locator('.element-target code').first().textContent(), firstWithElements.elements[0].targets.join(' → ') || 'Page (no selector provided)');
    assert.equal(await card.locator('.element-summary').first().textContent(), firstWithElements.elements[0].guidance);
  }
  await page.getByRole('button', { name: 'Just exploring? Try an example', exact: true }).click();
  await page.getByRole('region', { name: 'Example issues to explore', exact: true }).waitFor();
  await page.getByRole('button', { name: /Visual preview/ }).click();
  assert.equal(await page.locator('iframe').count(), 0);
  await page.getByRole('button', { name: 'Generate fixture snapshot' }).click();
  await page.getByRole('button', { name: 'Generating snapshot…' }).waitFor();
  await page.getByRole('alert').filter({ hasText: 'temporarily unavailable' }).waitFor();
  await page.getByRole('button', { name: 'Generate fixture snapshot' }).click();
  const original = page.frameLocator('iframe').first();
  await original.locator('.cta').waitFor();
  assert.equal(await page.locator('iframe').count(), 2);
  for (const frame of await page.locator('iframe').all()) assert.equal(await frame.getAttribute('sandbox'), '');
  assert.equal(await page.evaluate(() => document.querySelector('iframe').contentDocument), null);
  assert.equal(await original.locator('script, form, [href], [src], [onclick]').count(), 0);
  assert.equal(await original.locator('input').isDisabled(), true);
  assert.equal(await original.locator('button').isDisabled(), true);
  assert.equal(await original.locator('html').getAttribute('lang'), 'en');
  const before = await original.locator('.cta').evaluate(element => getComputedStyle(element).backgroundColor);
  await original.locator('.cta').hover(); await page.waitForTimeout(200);
  assert.notEqual(await original.locator('.cta').evaluate(element => getComputedStyle(element).backgroundColor), before);
  const addresses = page.frames().map(frame => frame.url());
  await original.locator('.cta').click();
  assert.deepEqual(page.frames().map(frame => frame.url()), addresses);
  assert.equal(page.context().pages().length, 1);
  await original.locator('.ad').scrollIntoViewIfNeeded(); assert.equal(await original.locator('.ad').isVisible(), true);
  const modified = page.locator('iframe').nth(1);
  const slider = name => page.getByRole('slider', { name, exact: true });
  const names = ['Colour strength', 'Contrast reduction', 'Blur strength', 'Peripheral restriction'];
  assert.equal(await page.getByRole('slider').count(), 4);
  assert.equal(await slider('Colour strength').inputValue(), '100');
  for (const name of names.slice(1)) assert.equal(await slider(name).inputValue(), '0');
  const modifiedBody = page.frameLocator('iframe').nth(1).locator('body');
  const matrix = page.frameLocator('iframe').nth(1).locator('feColorMatrix');
  const waitForModifiedDocument=async()=>{
    const source=await modified.getAttribute('srcdoc');
    const expectedFilter=source.match(/<body style="filter:([^"]*)"/)?.[1]??'';
    const normalizedFilter=await page.evaluate(value=>{const element=document.createElement('div');element.style.filter=value;return element.style.filter;},expectedFilter);
    let last;
    const expectedMatrix=source.match(/<feColorMatrix type="matrix" values="([^"]*)"/)?.[1]??null;
    for(let attempt=0;attempt<100;attempt++){
      try{
        const actual=await modifiedBody.evaluate(body=>({filter:body.style.filter,matrix:body.ownerDocument.querySelector('feColorMatrix')?.getAttribute('values')??null}));
        last=actual;
        if(actual.filter===normalizedFilter&&actual.matrix===expectedMatrix)return actual.filter;
      }catch{/* A preset replaces srcdoc; wait for the new opaque document. */}
      await page.waitForTimeout(20);
    }
    throw new Error('The modified preview did not finish loading its current effects: '+JSON.stringify({expected:normalizedFilter,expectedMatrix,actual:last}));
  };
  const matrixValues=async()=>{await waitForModifiedDocument();return matrix.getAttribute('values');};

  const presets = page.getByRole('group', {name:'Vision presets',exact:true});
  const selectedPreset = () => presets.getByRole('button', {pressed:true});
  const presetCases = [
    ['Original',[0,0,0,0]], ['Protanopia',[100,0,0,0]],
    ['Deuteranopia',[100,0,0,0]], ['Tritanopia',[100,0,0,0]], ['Blurred vision',[0,0,50,0]],
    ['Reduced peripheral vision',[0,0,0,65]],
  ];
  assert.equal(await presets.getByRole('button').count(),6);
  assert.equal(await selectedPreset().innerText(),'Deuteranopia');
  const callsBeforePresets = apiRequests;
  const frameAddressesBeforePresets = page.frames().map(frame=>frame.url());
  for (const [name,strengths] of presetCases) {
    const button = presets.getByRole('button',{name,exact:true});
    await button.focus(); await button.press('Enter');
    assert.equal(await button.evaluate(element=>element===document.activeElement),true);
    assert.equal(await selectedPreset().count(),1);assert.equal(await selectedPreset().innerText(),name);
    for (let index=0;index<names.length;index++)assert.equal(await slider(names[index]).inputValue(),String(strengths[index]));
    assert.equal(await page.locator('iframe').first().evaluate(element=>element.style.filter),'');
    if(name==='Original') {
      assert.equal(await waitForModifiedDocument(),'');assert.equal(await page.locator('.field-mask').count(),0);
    } else if(name==='Blurred vision') {
      assert.equal(await waitForModifiedDocument(),'blur(2px)');assert.equal(await page.locator('.field-mask').count(),0);
    } else if(name==='Reduced peripheral vision') {
      assert.equal(await waitForModifiedDocument(),'');assert.equal(await page.locator('.field-mask').evaluate(element=>element.style.opacity),'0.65');
    } else {
      assert.match(await waitForModifiedDocument(),/url\(/);
      assert.equal(await page.getByLabel('Colour preset',{exact:true}).inputValue(),name.toLowerCase());
    }
  }
  await page.getByRole('button',{name:'Apply visual effects',exact:true}).press('Space');
  assert.equal(await selectedPreset().count(),0);assert.equal(await page.locator('.field-mask').count(),0);
  await presets.getByRole('button',{name:'Blurred vision',exact:true}).press('Space');
  assert.equal(await selectedPreset().innerText(),'Blurred vision');assert.equal(await waitForModifiedDocument(),'blur(2px)');
  await slider('Blur strength').press('ArrowRight');
  assert.equal(await selectedPreset().count(),0);
  await page.getByText('Custom visual settings are applied to the modified snapshot only.',{exact:true}).waitFor();
  assert.equal(apiRequests,callsBeforePresets,'Preset changes must not fetch or recapture a page');
  assert.deepEqual(page.frames().map(frame=>frame.url()),frameAddressesBeforePresets);
  await page.getByRole('button',{name:'Reset effects',exact:true}).press('Enter');
  assert.equal(await selectedPreset().innerText(),'Deuteranopia');
  await slider('Colour strength').press('ArrowLeft');
  assert.equal(await slider('Colour strength').inputValue(), '99');
  assert.equal((await matrixValues()).split(' ')[0], '0.369885');
  assert.equal(await selectedPreset().count(),0);
  await slider('Colour strength').press('End');
  const deuteranopia = await matrixValues();
  await page.getByLabel('Colour preset', { exact: true }).selectOption('tritanopia');
  assert.notEqual(await matrixValues(), deuteranopia);
  await page.getByLabel('Colour preset', { exact: true }).selectOption('grayscale');
  await slider('Colour strength').press('End');
  const gray = (await matrixValues()).split(' ').map(Number);
  assert.deepEqual(gray.slice(0,3), gray.slice(5,8)); assert.deepEqual(gray.slice(0,3), gray.slice(10,13));
  await slider('Blur strength').press('End');
  await slider('Contrast reduction').press('End');
  await slider('Peripheral restriction').press('End');
  assert.match(await waitForModifiedDocument(), /url\(["']?#vision-.*contrast\(.*blur\(4px\)/);
  assert.equal(await page.locator('.field-mask').evaluate(element => element.style.opacity), '1');
  assert.equal(await page.locator('iframe').first().evaluate(element => element.style.filter), '');
  const toggle = page.getByRole('button', { name: 'Apply visual effects', exact: true });
  await toggle.press('Space');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
  assert.equal(await waitForModifiedDocument(), '');
  assert.equal(await page.locator('.field-mask').count(), 0);
  for (const name of names) assert.equal(await slider(name).inputValue(), '100');
  await slider('Blur strength').press('Home'); await slider('Blur strength').press('ArrowRight');
  assert.equal(await slider('Blur strength').inputValue(), '1');
  assert.equal(await waitForModifiedDocument(), '');
  await toggle.press('Space');
  assert.match(await waitForModifiedDocument(), /blur\(0.04px\)/);
  for (const [name, value] of [['Mild',25], ['Moderate',50], ['Strong',80]]) {
    await page.getByRole('button', { name, exact: true }).press('Enter');
    for (const label of names) assert.equal(await slider(label).inputValue(), String(value));
    assert.equal(await page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByLabel('Colour preset', { exact: true }).inputValue(), 'grayscale');
  }
  await page.getByRole('button', { name: 'Reset effects' }).press('Enter');
  assert.equal(await page.getByLabel('Colour preset', { exact: true }).inputValue(), 'deuteranopia');
  assert.equal(await slider('Colour strength').inputValue(), '100');
  for (const name of names.slice(1)) assert.equal(await slider(name).inputValue(), '0');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  for (const name of names) await slider(name).press('Home');
  assert.equal(await waitForModifiedDocument(), '');
  assert.equal(await page.locator('.field-mask').count(), 0);
  await page.getByText('All strengths are zero. Both snapshots show the original appearance.', { exact: true }).waitFor();
  const neutralPixels = await modified.screenshot();
  await slider('Blur strength').press('End');
  const blurPixels = await modified.screenshot();
  assert.notDeepEqual(blurPixels, neutralPixels, 'Blur must change rendered pixels, not just the style attribute');
  await slider('Colour strength').press('End');
  const combinedPixels = await modified.screenshot();
  assert.notDeepEqual(combinedPixels, neutralPixels, 'Combined colour and blur must change the rendered snapshot');
  assert.notDeepEqual(combinedPixels, blurPixels, 'Colour must still affect pixels when combined with blur');

  await page.getByRole('button', { name: 'Mild', exact: true }).click();
  await page.getByLabel('Colour preset', { exact: true }).selectOption('tritanopia');
  await page.getByRole('button', { name: /Accessibility findings/ }).click();
  await page.getByRole('button', { name: /Visual preview/ }).click();
  assert.equal(previews, 2, 'Tab switches must retain the snapshot');
  assert.equal(await page.getByLabel('Colour preset', { exact: true }).inputValue(), 'tritanopia');
  for (const name of names) assert.equal(await slider(name).inputValue(), '25');
  await page.getByRole('button', { name: 'Refresh fixture snapshot' }).click();
  await page.getByRole('button', { name: 'Refresh fixture snapshot' }).waitFor();
  assert.equal(previews, 3);
  for (const name of names) assert.equal(await slider(name).inputValue(), '25');
  await page.setViewportSize({ width: 1280, height: 2200 });
  await page.locator('.results').scrollIntoViewIfNeeded();
  for (const frame of page.frames().slice(1)) await frame.evaluate(() => scrollTo(0, 0));
  const desktop = (await page.locator('.results').screenshot()).toString('base64');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('iframe').first().scrollIntoViewIfNeeded();
  await original.locator('.cta').scrollIntoViewIfNeeded();
  assert.equal(await original.locator('.cta').isVisible(), true);
  // Paint both opaque frames in-view before taking the complete narrow-layout figure.
  await page.setViewportSize({ width: 390, height: 3600 });
  await page.locator('.results').scrollIntoViewIfNeeded();
  for (const frame of page.frames().slice(1)) await frame.evaluate(() => scrollTo(0, 0));
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const mobile = (await page.locator('.results').screenshot()).toString('base64');
  // Controlled UI responses cover severity ordering and review/empty states without scanning a public URL.
  const makeFinding = (severity, index) => ({ id: `controlled-${index}`, severity,
    title: `${severity} controlled rule`, impact: 'Controlled explanation', elements: [
      { targets: ['#first'], guidance: 'Repair the first element' },
      { targets: ['#second', '#nested'], guidance: '<img src=x onerror=alert(1)>\nRepair the second element' },
    ] });
  activeReport = { ...data.report, generatedAt: '2026-11-08T00:00:00.000Z', findings:
    ['Minor', 'Unknown', 'Moderate', 'Critical', 'Serious'].map(makeFinding),
    scanner: { ...data.report.scanner, incomplete: [{ ...makeFinding('Serious', 8), title: 'Controlled inconclusive check', elements: [] }] }, limitations: ['Controlled coverage limitation'] };
  await page.getByRole('button', { name: 'Scan built-in page' }).click();
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
  const exportedUrl = await assertDownload(activeReport);
  await page.evaluate(() => { window.__kindpathPrintCalls = 0; window.print = () => { window.__kindpathPrintCalls++; }; });
  await page.getByRole('button', { name: 'Print / save as PDF', exact: true }).press('Enter');
  assert.equal(await page.evaluate(() => window.__kindpathPrintCalls), 1);
  const fixturePdf = await printablePdf(activeReport);
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
  activeReport = { ...activeReport, generatedAt: '2026-11-08T00:00:01.000Z', findings: [makeFinding('Serious', 0)] };
  await page.getByRole('button', { name: 'Scan built-in page' }).click();
  await page.getByRole('heading', { name: 'Serious controlled rule', exact: true }).waitFor();
  assert.equal(await page.evaluate(async url => { try { await fetch(url); return false; } catch { return true; } }, exportedUrl), true, 'The old export Blob URL must be revoked');
  assert.equal(await filter.inputValue(), 'All');
  await filter.selectOption('Critical');
  await page.getByText('No violations match this severity. Other findings are still in this report.', { exact: true }).waitFor();
  assert.equal(await reviews.locator('article').count(), 1);
  await page.getByLabel('Built-in page', { exact: true }).selectOption('clear');
  activeReport = { ...data.clearReport, generatedAt: '2026-11-08T00:00:02.000Z' };
  await page.getByRole('button', { name: 'Scan built-in page' }).click();
  await page.getByText('No automated violations were reported. This does not establish accessibility conformance; review the checks below and test manually.', { exact: true }).waitFor();
  assert.equal(await filter.inputValue(), 'All');
  if (!data.clearReport.scanner.incomplete.length) await page.getByText('No inconclusive checks were returned. Keyboard, screen reader, and usability review are still needed.', { exact: true }).waitFor();
  await assertDownload(activeReport);
  await page.getByRole('button', { name: 'Just exploring? Try an example', exact: true }).click();
  const examples = page.getByRole('region', { name: 'Example issues to explore', exact: true });
  await examples.waitFor();
  assert.equal(await examples.locator('article').count(), 3);
  assert.equal(await page.getByRole('region', { name: /Checks needing manual review/ }).count(), 0);
  await page.getByText('Illustrative report', { exact: true }).waitFor();
  await examples.locator('article').first().locator('summary').click();
  assert.equal(await examples.locator('article').first().locator('.element-summary').textContent(), data.demoReport.findings[0].elements[0].guidance);
  // Match real scanning fixtures to their own previews and discard old work on selection changes.
  const fixtureChoice = page.getByLabel('Built-in page', { exact: true });
  const scanButton = page.getByRole('button', { name: 'Scan built-in page', exact: true });
  const results = page.locator('.results');
  await fixtureChoice.selectOption('barriers');
  assert.equal(await results.count(), 0);
  activeReport = data.report;
  await scanButton.click(); await violations.waitFor();
  await page.getByText('Scanned fixture: Garden form with barriers', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Visual preview/ }).click();
  assert.equal(await page.locator('iframe').count(), 0, 'The previous demo snapshot must not appear for a scanned page');
  wrongPreview = true;
  await page.getByRole('button', { name: 'Generate fixture snapshot', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'preview response was invalid' }).waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
  await page.getByRole('button', { name: 'Generate fixture snapshot', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh fixture snapshot', exact: true }).waitFor();
  assert.equal(capturedFixtures.at(-1), 'barriers');
  await page.getByRole('heading', { name: 'Built-in Garden form with barriers snapshot', exact: true }).waitFor();
  assert.equal(await page.locator('iframe').first().getAttribute('title'), 'Original Garden form with barriers fixture snapshot');
  assert.equal(await page.frameLocator('iframe').first().locator('.kindpath-image-placeholder').count(), 1);
  for (const frame of await page.locator('iframe').all()) assert.equal(await frame.getAttribute('sandbox'), '');
  assert.equal(await page.evaluate(() => document.querySelector('iframe').contentDocument), null);
  assert.equal(await page.frameLocator('iframe').first().locator('input').isDisabled(), true);
  assert.equal(await page.frameLocator('iframe').first().locator('button').isDisabled(), true);
  await page.setViewportSize({ width: 1280, height: 2200 });
  await results.scrollIntoViewIfNeeded();
  const matchingDesktop = (await results.screenshot()).toString('base64');
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('.print-report').isVisible(), true);
  for (const frame of await page.locator('iframe').all()) assert.equal(await frame.isVisible(), false, 'Loaded preview frames must not appear in print');
  await page.emulateMedia({ media: 'screen' });

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 390, height: 3600 });
  await results.scrollIntoViewIfNeeded();
  const matchingMobile = (await results.screenshot()).toString('base64');
  delayPreview = true;
  const heldPreviewRequest = page.waitForRequest(request => request.url().endsWith('/api/preview-fixture'));
  await page.getByRole('button', { name: 'Refresh fixture snapshot', exact: true }).click(); await heldPreviewRequest;
  assert.equal(previewHeld, true);
  await fixtureChoice.selectOption('clear');
  assert.equal(await results.count(), 0);
  assert.equal(await page.locator('iframe').count(), 0);
  delayPreview = false; releasePreview();
  activeReport = data.clearReport;
  await scanButton.click();
  await page.getByText('Scanned fixture: Labelled garden form', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Visual preview/ }).click();
  assert.equal(await page.locator('iframe').count(), 0);
  await page.getByRole('button', { name: 'Generate fixture snapshot', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh fixture snapshot', exact: true }).waitFor();
  assert.equal(capturedFixtures.at(-1), 'clear');
  assert.equal(await page.locator('iframe').first().getAttribute('title'), 'Original Labelled garden form fixture snapshot');
  await page.frameLocator('iframe').first().getByText('Email address', { exact: true }).waitFor();
  assert.equal(await page.frameLocator('iframe').first().locator('.kindpath-image-placeholder').count(), 0);
  // A delayed scan response for clear must not replace a newly selected barriers page.
  delayScan = true;
  const heldScanRequest = page.waitForRequest(request => request.url().endsWith('/api/scan-fixture'));
  await scanButton.click(); await heldScanRequest;
  assert.equal(scanHeld, true);
  assert.equal(await results.count(), 0, 'Starting another scan clears its old report and snapshot');
  await fixtureChoice.selectOption('barriers');
  delayScan = false; releaseScan();
  activeReport = data.clearReport; // Deliberate mismatched response.
  await scanButton.click();
  await page.getByRole('alert').filter({ hasText: 'report did not match' }).waitFor();
  assert.equal(await results.count(), 0);
  activeReport = data.report;
  await scanButton.click(); await violations.waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
  await page.getByText('Scanned fixture: Garden form with barriers', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Just exploring? Try an example', exact: true }).click();
  await page.getByRole('region', { name: 'Example issues to explore', exact: true }).waitFor();
  await page.waitForFunction(() => document.activeElement?.matches('.results'));
  await assertDownload(data.demoReport);
  const demoPdf = await printablePdf(data.demoReport);
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
  await page.getByRole('button', { name: /Visual preview/ }).click();
  assert.equal(await page.locator('iframe').count(), 0);
  await page.getByText('This built-in illustration is separate from the website report. Public websites are not captured.', { exact: true }).waitFor();
  // Example exploration must remain a demo even when URL scanning is available.
  const scansBeforeExample = publicCalls;
  await page.getByRole('button', { name: 'Just exploring? Try an example', exact: true }).click();
  await page.getByRole('region', { name: 'Example issues to explore', exact: true }).waitFor();
  assert.equal(publicCalls, scansBeforeExample);
  assert.equal(await page.locator('.results .scan-coverage').count(),0,'Demo reports do not inherit public coverage');
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
    { ...publicReport, url: 'https://example.org:8443/' }, data.demoReport]) {
    publicResponse = wrong;
    await publicButton.click();
    await page.getByRole('alert').filter({ hasText: 'report did not match' }).waitFor();
    assert.equal(await page.locator('.results').count(), 0);
  }
  for (const [status, code] of [[429, 'SCANNER_BUSY'], [503, 'SCAN_FAILED']]) {
    publicStatus = status; publicResponse = { error: 'Controlled unavailable scan', code };
    await publicButton.click();
    await page.getByRole('alert').filter({ hasText: status === 429 ? 'Another scan is still finishing' : 'The scan could not finish' }).waitFor();
    assert.equal(await page.locator('.results').count(), 0);
  }
  publicStatus = 503; publicResponse = {code:'SCAN_FAILED',error:'PRIVATE_SENTINEL',diagnostic:{stage:'page-loading',code:'HTTP_STATUS',httpStatus:403}};
  await publicButton.click();
  await page.getByRole('alert').filter({hasText:'Access to the page was refused (HTTP 403)'}).waitFor();
  assert.equal(await page.locator('.results').count(),0);
  assert.equal(await page.getByText('PRIVATE_SENTINEL').count(),0);
  publicStatus = 200; publicResponse = publicReport;
  delayPublic = true;
  const publicStarted = new Promise(resolve => { notifyPublic = resolve; });
  await publicButton.click();
  await page.waitForFunction(() => document.querySelector('form').getAttribute('aria-busy') === 'true');
  let heldTimer;
  try { await Promise.race([publicStarted, new Promise((_, reject) => { heldTimer = setTimeout(() => reject(new Error('Controlled URL request was not intercepted')), 10000); })]); }
  finally { clearTimeout(heldTimer); }
  assert.equal(publicHeld, true);
  await page.getByLabel('Built-in page').selectOption('clear');
  activeReport = data.clearReport;
  delayPublic = false; releasePublic();
  await page.getByRole('button', { name: 'Scan built-in page' }).click();
  await page.getByText('Scanned fixture: Labelled garden form', { exact: true }).waitFor();
  assert.equal(await page.locator('.results').getByText('Scanned page: ' + publicReport.url, { exact: true }).count(), 0);
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
  await page.getByRole('heading', {name:'Scanned website snapshot',exact:true}).waitFor();
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
  await page.getByRole('button',{name:'Apply visual effects',exact:true}).click();
  assert.equal(await page.getByRole('heading',{name:'Effects paused — original appearance',exact:true}).count(),1);
  const oldFrame = await page.locator('iframe').first().elementHandle();
  const nextId='22222222-2222-4222-8222-222222222222';
  publicResponse={...publicResponse,scanId:nextId,sitePreview:{...data.sitePreview,scanId:nextId,html:data.sitePreview.html.replace('Captured website marker','New captured page marker')}};
  await publicButton.click();
  await oldFrame.waitForElementState('hidden');
  await page.getByRole('button',{name:/Visual preview/}).click();
  await page.frameLocator('iframe').first().getByText('New captured page marker',{exact:true}).waitFor();
  assert.equal(await oldFrame.evaluate(node=>node.isConnected),false);
  assert.equal(await page.getByRole('heading',{name:'With visual effects',exact:true}).count(),1);
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
  await publicButton.click();await page.locator('.results').waitFor();await assertDownload(publicResponse);
  await page.getByRole('button',{name:/Visual preview/}).click();
  await page.getByText('The website image could not be captured. Your accessibility report and JSON download are still available. Try another scan to request a new image.',{exact:true}).waitFor();
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
      assert.equal(await page.getByRole('button',{name:'Apply visual effects',exact:true}).count(),0);
      if(kind==='empty') {
        await page.setViewportSize({width:390,height:844});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        qualityEmpty=(await page.locator('.preview-workspace').screenshot()).toString('base64');
        await page.setViewportSize({width:1280,height:900});
        await assertDownload(publicResponse);await printablePdf(publicResponse);
      }
    }else {
      assert.equal(await page.locator('iframe').count(),2);
      assert.equal(await page.getByRole('button',{name:'Apply visual effects',exact:true}).count(),1);
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
  // Cancellation and retry preserve the selected action and reject late responses.
  publicCapabilities=false; captureCapabilities=false;
  await page.reload();
  activeReport=data.clearReport; delayScan=true; scanHeld=false;
  const heldCancellation=page.waitForRequest(request=>request.url().endsWith('/api/scan-fixture'));
  await page.getByRole('button',{name:'Scan built-in page',exact:true}).click(); await heldCancellation;
  assert.equal(await page.getByLabel('Your website URL').isDisabled(),true);
  await page.getByRole('button',{name:'Cancel request',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Request cancelled'}).waitFor();
  assert.equal(await page.locator('.results').count(),0);
  assert.equal(await page.getByRole('button',{name:'Try again',exact:true}).evaluate(node=>node===document.activeElement),true);
  delayScan=false; activeReport=data.report; releaseScan();
  // Malformed proxy/error bodies must not become UI diagnostics, and a failed retry keeps usable focus.
  const retryButton=page.getByRole('button',{name:'Try again',exact:true});
  for (const response of [
    {status:503,contentType:'text/html',body:'private-response-marker: invalid response'},
    {json:null},
  ]) {
    fixtureResponseOverride=response;
    await retryButton.click();
    await page.getByRole('alert').filter({hasText: response.status ? 'The response could not be read.' : 'The report did not match the requested scan.'}).waitFor();
    assert.equal(await page.locator('.results').count(),0);
    assert.equal(await page.getByText(/private-response-marker/).count(),0);
    assert.equal(await retryButton.evaluate(node=>node===document.activeElement),true);
  }
  fixtureResponseOverride=undefined;
  await retryButton.click();
  await page.getByText('Scanned fixture: Garden form with barriers',{exact:true}).waitFor();
  assert.equal(await page.getByText('Scanned fixture: Labelled garden form',{exact:true}).count(),0);
  // Editing a URL clears the prior report instead of showing it under a new address.
  await page.getByLabel('Your website URL').fill('https://example.com/new-request');
  assert.equal(await page.locator('.results').count(),0);
  assert.deepEqual(unexpected, []);
  process.stdout.write(JSON.stringify({ passed: true, engine, version: browser.version(), desktop, mobile, findingsDesktop, findingsMobile, matchingDesktop, matchingMobile, coverageDesktop, coverageMobile, qualityEmpty, qualitySparse, fixturePdf, demoPdf }));
} finally { await browser.close(); }
