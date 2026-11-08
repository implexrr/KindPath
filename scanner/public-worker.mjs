import net from 'node:net';
import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { access } from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { validateTarget } from './gateway/policy.mjs';

const socketPath = '/run/kindpath/egress.sock';
const allowed = JSON.parse(process.env.KINDPATH_ALLOWED_HOSTS ?? '[]');
const target = process.argv[2];
const deadline = setTimeout(() => process.exit(2), 40_000);
let browser;
let relay;
try {
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
      } catch { blockedRequests++; return route.abort(); }
    });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage();
    page.on('popup', popup => popup.close());
    page.on('requestfailed', () => { failedRequests++; });
    const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    if (!response || !response.ok()) throw new Error('Navigation failed');
    validateTarget(page.url(), allowed);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).options({ iframes: false }).analyze();
    const summarize = rules => rules.slice(0, 100).map(rule => ({ id: rule.id, impact: rule.impact ?? 'unknown', help: rule.help, description: rule.description, helpUrl: rule.helpUrl,
      nodes: rule.nodes.slice(0, 20).map(node => ({ target: node.target.map(s => typeof s === 'string' ? s : JSON.stringify(s)), summary: (node.failureSummary ?? '').slice(0, 2000) })) }));
    process.stdout.write(JSON.stringify({ fixture: 'public', url: page.url(), coverage: { blockedRequests, failedRequests }, engine: result.testEngine.version, violations: summarize(result.violations), incomplete: summarize(result.incomplete), passes: result.passes.length, inapplicable: result.inapplicable.length }));
  }
} catch { process.stderr.write('Isolated gateway scan failed.\n'); process.exitCode = 1; }
finally { if (browser) await browser.close(); if (relay) relay.close(); clearTimeout(deadline); }
