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
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  page.setDefaultTimeout(10000);
  let previews = 0; const unexpected = [];
  let activeReport = data.report;
  let apiRequests = 0;
  async function assertDownload(expected) {
    const requestsBefore = apiRequests;
    const pending = page.waitForEvent('download');
    const link = page.getByRole('link', { name: 'Download report JSON', exact: true });
    await link.press('Enter');
    const download = await pending;
    assert.match(download.suggestedFilename(), /^kindpath-(demo|fixture)-report-[0-9TZ-]+\.json$/);
    const stream = await download.createReadStream();
    const parts = []; for await (const chunk of stream) parts.push(chunk);
    const exported = JSON.parse(Buffer.concat(parts).toString('utf8'));
    assert.equal(exported.application, 'KindPath'); assert.equal(exported.formatVersion, 1);
    assert.equal(exported.report.mode, expected.mode);
    assert.equal(exported.report.url, expected.url);
    assert.equal(exported.report.generatedAt, expected.generatedAt);
    assert.deepEqual(exported.report.findings, expected.findings);
    assert.deepEqual(exported.report.scanner, expected.scanner);
    assert.deepEqual(exported.report.manualChecks, expected.manualChecks);
    for (const limitation of expected.limitations ?? []) assert.ok(exported.report.limitations.includes(limitation));
    assert.equal(exported.source.label, expected.mode === 'demo' ? 'Illustrative report' : 'Real fixture scan');
    assert.ok(exported.report.limitations.some(text => text.includes('do not establish accessibility conformance')));
    assert.equal('html' in exported.report, false);
    assert.equal(apiRequests, requestsBefore, 'Export must not request another scan or capture');
    return await link.getAttribute('href');
  }
  async function printablePdf(expected) {
    await page.emulateMedia({ media: 'print' });
    const printed = page.locator('.print-report');
    assert.equal(await printed.isVisible(), true);
    assert.equal(await page.locator('main').isVisible(), false);
    assert.equal(await printed.locator('.printed-finding').count(), expected.findings.length + (expected.scanner?.incomplete.length ?? 0));
    assert.equal(await printed.locator('iframe, img, script, details').count(), 0);
    for (const finding of [...expected.findings, ...(expected.scanner?.incomplete ?? [])]) {
      assert.ok((await printed.textContent()).includes(finding.title));
      for (const element of finding.elements) assert.ok((await printed.textContent()).includes(element.guidance));
    }
    assert.ok((await printed.textContent()).includes(expected.generatedAt));
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
    if (url.pathname === '/api/scanning-capabilities') { await route.fulfill({ json: { publicScanningEnabled: false, allowedHosts: ['example.com'] } }); return; }
    if (url.pathname === '/api/analyze') { await route.fulfill({ json: data.demoReport }); return; }
    if (url.pathname === '/api/scan-fixture') {
      assert.ok(['barriers', 'clear'].includes(route.request().postDataJSON().fixture));
      const report = activeReport;
      const delayed = delayScan;
      if (delayed) { scanHeld = true; await new Promise(resolve => { releaseScan = resolve; }); }
      try { await route.fulfill({ json: report }); } catch (error) { if (!delayed) throw error; } // The delayed request is deliberately cancelled below.
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
  await page.getByRole('button', { name: 'Run isolated fixture scan' }).click();
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
  assert.equal(await slider('Colour strength').inputValue(), '65');
  for (const name of names.slice(1)) assert.equal(await slider(name).inputValue(), '0');
  const matrix = page.locator('feColorMatrix');
  const redGreen = await matrix.getAttribute('values');
  await page.getByLabel('Colour preset', { exact: true }).selectOption('blue-yellow');
  assert.notEqual(await matrix.getAttribute('values'), redGreen);
  await page.getByLabel('Colour preset', { exact: true }).selectOption('grayscale');
  await slider('Colour strength').press('End');
  const gray = (await matrix.getAttribute('values')).split(' ').map(Number);
  assert.deepEqual(gray.slice(0,3), gray.slice(5,8)); assert.deepEqual(gray.slice(0,3), gray.slice(10,13));
  await slider('Blur strength').press('End');
  await slider('Contrast reduction').press('End');
  await slider('Peripheral restriction').press('End');
  assert.match(await modified.evaluate(element => element.style.filter), /url\(["']?#vision-.*contrast\(.*blur\(4px\)/);
  assert.equal(await page.locator('.field-mask').evaluate(element => element.style.opacity), '1');
  assert.equal(await page.locator('iframe').first().evaluate(element => element.style.filter), '');
  const toggle = page.getByRole('button', { name: 'Apply visual effects', exact: true });
  await toggle.press('Space');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
  assert.equal(await modified.evaluate(element => element.style.filter), '');
  assert.equal(await page.locator('.field-mask').count(), 0);
  for (const name of names) assert.equal(await slider(name).inputValue(), '100');
  await slider('Blur strength').press('Home'); await slider('Blur strength').press('ArrowRight');
  assert.equal(await slider('Blur strength').inputValue(), '1');
  assert.equal(await modified.evaluate(element => element.style.filter), '');
  await toggle.press('Space');
  assert.match(await modified.evaluate(element => element.style.filter), /blur\(0.04px\)/);
  for (const [name, value] of [['Mild',25], ['Moderate',50], ['Strong',80]]) {
    await page.getByRole('button', { name, exact: true }).press('Enter');
    for (const label of names) assert.equal(await slider(label).inputValue(), String(value));
    assert.equal(await page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.getByLabel('Colour preset', { exact: true }).inputValue(), 'grayscale');
  }
  await page.getByRole('button', { name: 'Reset effects' }).press('Enter');
  assert.equal(await page.getByLabel('Colour preset', { exact: true }).inputValue(), 'red-green');
  assert.equal(await slider('Colour strength').inputValue(), '65');
  for (const name of names.slice(1)) assert.equal(await slider(name).inputValue(), '0');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  for (const name of names) await slider(name).press('Home');
  assert.equal(await modified.evaluate(element => element.style.filter), '');
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
  await page.getByLabel('Colour preset', { exact: true }).selectOption('blue-yellow');
  await page.getByRole('button', { name: /Accessibility findings/ }).click();
  await page.getByRole('button', { name: /Visual preview/ }).click();
  assert.equal(previews, 2, 'Tab switches must retain the snapshot');
  assert.equal(await page.getByLabel('Colour preset', { exact: true }).inputValue(), 'blue-yellow');
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
  await page.getByRole('button', { name: 'Run isolated fixture scan' }).click();
  const filter = page.getByLabel('Filter violations by severity', { exact: true });
  await violations.getByRole('heading', { name: 'Critical controlled rule', exact: true }).waitFor();
  assert.deepEqual(await violations.getByRole('heading', { level: 4 }).allTextContents(),
    ['Critical', 'Serious', 'Moderate', 'Minor', 'Unknown'].map(level => `${level} controlled rule`));
  const reviews = page.getByRole('region', { name: 'Checks needing manual review (1)', exact: true });
  await reviews.getByText('Controlled inconclusive check', { exact: true }).waitFor();
  for (const item of await page.getByRole('list', { name: 'Violation counts by severity' }).getByRole('listitem').all()) {
    assert.equal(await item.locator('strong').textContent(), '1');
  }
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
  assert.deepEqual(await firstCard.locator('.element-target code').allTextContents(), ['#first', '#second → #nested']);
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
  await page.getByRole('button', { name: 'Run isolated fixture scan' }).click();
  await page.getByRole('heading', { name: 'Serious controlled rule', exact: true }).waitFor();
  assert.equal(await page.evaluate(async url => { try { await fetch(url); return false; } catch { return true; } }, exportedUrl), true, 'The old export Blob URL must be revoked');
  assert.equal(await filter.inputValue(), 'All');
  await filter.selectOption('Critical');
  await page.getByText('No violations match this severity. Other findings are still in this report.', { exact: true }).waitFor();
  assert.equal(await reviews.locator('article').count(), 1);
  await page.getByLabel('Built-in page', { exact: true }).selectOption('clear');
  activeReport = { ...data.clearReport, generatedAt: '2026-11-08T00:00:02.000Z' };
  await page.getByRole('button', { name: 'Run isolated fixture scan' }).click();
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
  const scanButton = page.getByRole('button', { name: 'Run isolated fixture scan', exact: true });
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
  await assertDownload(data.demoReport);
  const demoPdf = await printablePdf(data.demoReport);
  assert.deepEqual(unexpected, []);
  process.stdout.write(JSON.stringify({ passed: true, engine, version: browser.version(), desktop, mobile, findingsDesktop, findingsMobile, matchingDesktop, matchingMobile, fixturePdf, demoPdf }));
} finally { await browser.close(); }
