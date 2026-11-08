import { readFile, access } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { connect } from 'node:net';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { captureFixtureSnapshot } from './preview.mjs';

const fixtures = new Set(['barriers', 'clear']);
const task = process.argv[2];
const previewFiles = new Map([['preview-garden', 'preview-garden'], ['preview-barriers', 'barriers'], ['preview-clear', 'clear']]);
const deadline = setTimeout(() => process.exit(2), 30_000);
let browser;
try {
  if (!process.getuid || process.getuid() === 0) throw new Error('Non-root user required');
  if (Object.values(networkInterfaces()).flat().some(address => address && !address.internal)) {
    throw new Error('External network interface detected');
  }
  if (task === 'verify-isolation') {
    const status = await readFile('/proc/self/status', 'utf8');
    if (!/^NoNewPrivs:\s+1$/m.test(status) || !/^CapEff:\s+0+$/m.test(status)) {
      throw new Error('Privilege restrictions missing');
    }
    for (const path of ['/Users', '/host', '/var/run/docker.sock', '/run/host-services/ssh-auth.sock']) {
      let visible = true;
      try { await access(path); } catch { visible = false; }
      if (visible) throw new Error('Unexpected host access');
    }
    if (process.env.KINDPATH_HOST_CANARY) throw new Error('Host environment leaked');
    // These attempts occur only after confirming there is no non-loopback interface.
    for (const host of ['192.0.2.1', '169.254.169.254', '10.255.255.254']) {
      await new Promise((resolve, reject) => {
        const socket = connect({ host, port: 80 });
        socket.setTimeout(500);
        socket.once('connect', () => { socket.destroy(); reject(new Error('Unexpected network access')); });
        socket.once('error', () => { socket.destroy(); resolve(); });
        socket.once('timeout', () => { socket.destroy(); resolve(); });
      });
    }
    let writable = true;
    try {
      const { writeFile } = await import('node:fs/promises');
      await writeFile('/opt/kindpath-worker/unexpected-write', 'probe');
    } catch { writable = false; }
    if (writable) throw new Error('Root filesystem is writable');
    process.stdout.write(JSON.stringify({ isolation: 'passed' }));
  } else {
    if (!fixtures.has(task) && !previewFiles.has(task)) throw new Error('Unknown fixture');
    const html = await readFile(new URL(`./fixtures/${previewFiles.get(task) ?? task}.html`, import.meta.url), 'utf8');
    browser = await chromium.launch({ headless: true, chromiumSandbox: true });
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
    // Defense in depth; --network=none is the actual outbound-network boundary.
    await context.route('**/*', route => route.abort());
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    await page.setContent(html, { waitUntil: 'load', timeout: 10_000 });
    if (previewFiles.has(task)) {
      process.stdout.write(JSON.stringify(await captureFixtureSnapshot(page, task)));
    } else {
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .options({ iframes: false }).analyze();
      const summarize = rules => rules.slice(0, 100).map(rule => ({
        id: rule.id, impact: rule.impact ?? 'unknown', help: rule.help,
        description: rule.description, helpUrl: rule.helpUrl,
        nodes: rule.nodes.slice(0, 20).map(node => ({
          target: node.target.map(selector => typeof selector === 'string' ? selector : JSON.stringify(selector)),
          summary: (node.failureSummary ?? '').slice(0, 2000),
        })),
      }));
      process.stdout.write(JSON.stringify({
        fixture: task, engine: result.testEngine.version,
        violations: summarize(result.violations), incomplete: summarize(result.incomplete),
        passes: result.passes.length, inapplicable: result.inapplicable.length,
      }));
    }
  }
} catch {
  // Never send browser diagnostics, environment values, or paths back to the API.
  process.stderr.write('Isolated fixture worker failed.\n');
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  clearTimeout(deadline);
}
