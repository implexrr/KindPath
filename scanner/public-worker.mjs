import { classifyFailure, DIAGNOSTIC_PREFIX } from './gateway/diagnostics.mjs';
import { captureSiteSnapshot } from './site-preview.mjs';
import net from 'node:net';
import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { access } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { validateTarget } from './gateway/policy.mjs';
import { navigationRejection } from './gateway/navigation.mjs';
import { installNavigationGuard } from './gateway/navigation-guard.mjs';
import { summarizeRules } from './public-report.mjs';

const socketPath = '/run/kindpath/egress.sock';
const allowed = JSON.parse(process.env.KINDPATH_ALLOWED_HOSTS ?? '[]');
const target = process.argv[2];
const capture = process.argv[3] === '--capture';
let stage = 'worker-setup';
let rejectedStatus;
let missingResponse = false;
let diagnosticEmitted = false;
function emitDiagnostic(value) {
  if (diagnosticEmitted) return;
  diagnosticEmitted=true;process.stderr.write(DIAGNOSTIC_PREFIX + JSON.stringify(value) + '\n');
}
const deadline = setTimeout(() => {emitDiagnostic({stage,code:'TIMEOUT'});process.exit(2);}, 40_000);
let browser;
let relay;
let rejectedNavigation = false;
let pageChanged = false;
let redirectFailure;
let navigationGuard;
try {
  if (process.argv.length > 4 || (process.argv[3] && !capture) || (capture && target === 'verify-public-isolation')) throw new Error('Invalid worker task');
  if (process.getuid() === 0 || Object.values(networkInterfaces()).flat().some(a => a && !a.internal)) throw new Error('Isolation missing');
  // Wait briefly for the separate gateway to create its private socket.
  for (let i = 0; ; i++) {
    try { await access(socketPath); break; } catch { if (i >= 30) throw new Error('Gateway unavailable'); await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  relay = net.createServer(client => {
    const upstream = net.connect(socketPath);
    client.on('error', () => upstream.destroy()); upstream.on('error', () => client.destroy());
    client.once('close', () => upstream.destroy()); upstream.once('close', () => client.destroy());
    client.pipe(upstream); upstream.pipe(client);
  });
  await new Promise((resolve, reject) => relay.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = relay.address().port;
  if (target === 'verify-public-isolation') {
    for (const url of ['http://127.0.0.1/', 'http://10.0.0.1/', 'http://169.254.169.254/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://not-allowlisted.invalid/']) {
      await new Promise((resolve, reject) => {
        const request = http.get({ host: '127.0.0.1', port, path: url }, response => {
          response.resume(); response.once('end', () => response.statusCode === 403 ? resolve() : reject(new Error('Gateway allowed forbidden target')));
        });
        request.setTimeout(5000, () => request.destroy()); request.on('error', reject);
      });
    }
    for (const authority of ['127.0.0.1:443', '[::1]:443', 'example.com:22', 'example.com:443@127.0.0.1:443']) {
      await new Promise((resolve, reject) => {
        const request = http.request({ host: '127.0.0.1', port, method: 'CONNECT', path: authority });
        request.on('connect', (response, socket) => { socket.destroy(); response.statusCode === 403 ? resolve() : reject(new Error('Forbidden CONNECT allowed')); });
        request.setTimeout(5000, () => request.destroy()); request.on('error', reject); request.end();
      });
    }
    process.stdout.write(JSON.stringify({ isolation: 'passed', forbiddenRequests: 10 }));
  } else {
    validateTarget(target, allowed);
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, proxy: { server: `http://127.0.0.1:${port}` }, args: ['--proxy-bypass-list=<-loopback>'] });
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, ignoreHTTPSErrors: false });
    let requests = 0;
    let blockedRequests = 0;
    let failedRequests = 0;
    await context.route('**/*', route => {
      try {
        validateTarget(route.request().url(), allowed);
        if (++requests > 100 || !['GET', 'HEAD'].includes(route.request().method())) throw new Error('Blocked request');
        return route.continue();
      } catch { blockedRequests++; if (route.request().isNavigationRequest()) rejectedNavigation = true; return route.abort(); }
    });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage();
    page.on('popup', popup => popup.close());
    let scanningDocument = false;
    let latestDocumentRequest;
    page.on('request', request => {
      if (request.isNavigationRequest()) {
        if(request.frame()===page.mainFrame()){
          latestDocumentRequest=request;
          if(scanningDocument)pageChanged=true;
        }
        try { validateTarget(request.url(), allowed); } catch { rejectedNavigation = true; }
      }
    });
    page.on('requestfailed', () => { failedRequests++; });
    page.on('response', response => { if (response.status() >= 400) failedRequests++; });
    navigationGuard = await installNavigationGuard(page, target, {
      isScanning: () => scanningDocument,
      onPageChange: () => { pageChanged = true; },
    });
    stage = 'page-loading';
    const response = await page.goto(target, { waitUntil: 'load', timeout: 15_000 });
    if (!response) {missingResponse=true;throw new Error('Navigation failed');}
    if (!response.ok()) {rejectedStatus=response.status();throw new Error('Navigation failed');}
    if (navigationGuard.failure || navigationGuard.failed) throw new Error('Navigation rejected');
    const scannedUrl = page.url();
    redirectFailure = navigationRejection(target, scannedUrl, navigationGuard.lastUrl);
    if (redirectFailure) throw new Error('Invalid final page');
    if(latestDocumentRequest!==response.request()){pageChanged=true;throw new Error('Pending document navigation');}
    scanningDocument=true;
    // History API events at the same URL do not replace the document. Actual
    // main-document requests, URL changes and document identity changes still invalidate it.
    page.on('framenavigated', frame => { if (frame === page.mainFrame() && frame.url()!==scannedUrl) pageChanged = true; });
    validateTarget(scannedUrl, allowed);
    const scannedDocument=await page.evaluateHandle(()=>document);
    stage = 'accessibility-analysis';
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).options({ iframes: false }).analyze();
    // Do not label findings from one document with another URL, including same-URL reloads.
    if (navigationGuard.failed || navigationGuard.failure || redirectFailure || pageChanged || page.url() !== scannedUrl || result.url !== scannedUrl || !(await page.evaluate(original=>original===document,scannedDocument))) {
      pageChanged = true; throw new Error('Page changed during scan');
    }
    if (capture) stage = 'capture';
    const preview = capture ? await captureSiteSnapshot(page) : undefined;
    if (navigationGuard.failed || navigationGuard.failure || redirectFailure || pageChanged || page.url() !== scannedUrl || (preview && preview.url !== scannedUrl) || !(await page.evaluate(original=>original===document,scannedDocument))) {
      pageChanged = true; throw new Error('Page changed during capture');
    }
    stage = 'worker-result';
    const violations = summarizeRules(result.violations);
    const incomplete = summarizeRules(result.incomplete);
    process.stdout.write(JSON.stringify({ fixture: 'public', url: scannedUrl, ...(preview ? {preview} : {}),
      coverage: { blockedRequests, failedRequests, omittedRules: violations.omittedRules + incomplete.omittedRules,
        omittedNodes: violations.omittedNodes + incomplete.omittedNodes },
      engine: result.testEngine.version, violations: violations.rules, incomplete: incomplete.rules,
      passes: result.passes.length, inapplicable: result.inapplicable.length }));
  }
} catch (error) {
  redirectFailure ??= navigationGuard?.failure;
  const diagnostic = redirectFailure ? {stage:'page-loading',code:redirectFailure}
    : pageChanged ? {stage,code:'PAGE_CHANGED_DURING_SCAN'}
    : missingResponse ? {stage,code:'NO_RESPONSE'} : rejectedStatus !== undefined ? {stage:'page-loading',code:'HTTP_STATUS',httpStatus:rejectedStatus}
    : classifyFailure(error,stage);
  const code = diagnostic?.code ?? (rejectedNavigation ? 'DESTINATION_REJECTED' : 'SCAN_FAILED');
  emitDiagnostic(diagnostic);
  process.stderr.write(`Isolated gateway scan failed: ${code}.\n`); process.exitCode = 1;
}
finally { stage='cleanup'; if (browser) await browser.close(); if (relay) relay.close(); clearTimeout(deadline); }
