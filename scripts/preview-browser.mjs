// Executed inside the existing network-disabled Chromium container; receives only public build assets and fixture data.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const data = JSON.parse(Buffer.concat(chunks).toString());
const browser = await chromium.launch({ headless: true, chromiumSandbox: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  page.setDefaultTimeout(10000);
  let previews = 0; const unexpected = [];
  let activeReport = data.report;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'kindpath-ui.invalid') { unexpected.push(url.hostname); await route.abort(); return; }
    if (url.pathname === '/api/scanning-capabilities') { await route.fulfill({ json: { publicScanningEnabled: false, allowedHosts: ['example.com'] } }); return; }
    if (url.pathname === '/api/analyze') { await route.fulfill({ json: data.demoReport }); return; }
    if (url.pathname === '/api/scan-fixture') { await route.fulfill({ json: activeReport }); return; }
    if (url.pathname === '/api/preview-fixture') {
      previews++;
      assert.deepEqual(route.request().postDataJSON(), { fixture: 'garden' });
      await new Promise(done => setTimeout(done, 300));
      await route.fulfill(previews === 1 ? { status: 503, json: { error: 'Fixture preview is temporarily unavailable. Try again.' } } : { json: data.snapshot }); return;
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
    scanner: { ...data.report.scanner, incomplete: [{ ...makeFinding('Serious', 8), title: 'Controlled inconclusive check', elements: [] }] } };
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
  assert.equal(await filter.inputValue(), 'All');
  await filter.selectOption('Critical');
  await page.getByText('No violations match this severity. Other findings are still in this report.', { exact: true }).waitFor();
  assert.equal(await reviews.locator('article').count(), 1);
  activeReport = { ...data.clearReport, generatedAt: '2026-11-08T00:00:02.000Z' };
  await page.getByRole('button', { name: 'Run isolated fixture scan' }).click();
  await page.getByText('No automated violations were reported. This does not establish accessibility conformance; review the checks below and test manually.', { exact: true }).waitFor();
  assert.equal(await filter.inputValue(), 'All');
  if (!data.clearReport.scanner.incomplete.length) await page.getByText('No inconclusive checks were returned. Keyboard, screen reader, and usability review are still needed.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Just exploring? Try an example', exact: true }).click();
  const examples = page.getByRole('region', { name: 'Example issues to explore', exact: true });
  await examples.waitFor();
  assert.equal(await examples.locator('article').count(), 3);
  assert.equal(await page.getByRole('region', { name: /Checks needing manual review/ }).count(), 0);
  await page.getByText('Illustrative report', { exact: true }).waitFor();
  await examples.locator('article').first().locator('summary').click();
  assert.equal(await examples.locator('article').first().locator('.element-summary').textContent(), data.demoReport.findings[0].elements[0].guidance);
  assert.deepEqual(unexpected, []);
  process.stdout.write(JSON.stringify({ passed: true, desktop, mobile, findingsDesktop, findingsMobile }));
} finally { await browser.close(); }
