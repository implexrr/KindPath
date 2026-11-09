import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createPublicUrlWorkerRunner, runPublicUrlWorker } from './publicUrlWorker.js';
import { createPublicSiteScanner, scanPublicSite } from './publicScanner.js';
import { createPublicRouter } from '../routes/scanPublic.js';
import { createDestinationPlan } from './destinationSnapshot.js';
import { createWorkerRunner, ScannerError } from './dockerWorker.js';
import { PUBLIC_SCANNING_ENABLED } from './publicPolicy.js';
import { scanInNamespace } from './publicTransport.js';

const raw = { fixture: 'public', url: 'https://example.com/final', engine: 'controlled', violations: [], incomplete: [],
  passes: 2, inapplicable: 0, coverage: { blockedRequests: 0, failedRequests: 0, omittedRules: 0, omittedNodes: 0 } };
const plan = (target: string, signal: AbortSignal) => createDestinationPlan(target, async () => [{ address: '93.184.216.34', family: 4 }], signal);
const emptySession = async () => ({ command: async () => '', dispose: async () => {} });

test('default URL runner and scanner stay disabled before any side effects', async () => {
  assert.equal(PUBLIC_SCANNING_ENABLED, false);
  await assert.rejects(runPublicUrlWorker('https://example.com/'), /disabled/);
  await assert.rejects(scanPublicSite('https://example.com/'), /disabled/);
  const never = async () => { assert.fail('Disabled scan performed work'); };
  const run = createPublicUrlWorkerRunner({ openSession: never, planTarget: never });
  await assert.rejects(run('https://example.com/'), /disabled/);
});
test('URL preflight and existing cancellation reject before opening Docker or DNS', async () => {
  const never = async () => { assert.fail('Invalid request performed work'); };
  const run = createPublicUrlWorkerRunner({ enabled: () => true, openSession: never, planTarget: never });
  for (const value of ['http://127.0.0.1/', 'file:///etc/passwd', 'verify-pinned-scan', 'https://example.com:444/', { url: 'https://example.com/' }]) await assert.rejects(run(value));
  const abort = new AbortController(); abort.abort();
  await assert.rejects(run('https://example.com/', abort.signal));
});
test('DNS rejection and mismatched plans cannot create a network or leak diagnostics', async () => {
  for (const mismatched of [false, true]) {
    const commands: string[][] = [];
    const run = createPublicUrlWorkerRunner({ enabled: () => true,
      openSession: async () => ({ command: async args => { commands.push(args); return ''; }, dispose: async () => {} }),
      planTarget: (target, signal) => mismatched ? plan('https://example.com/another', signal)
        : createDestinationPlan(target, async () => [{address:'127.0.0.1',family:4}], signal),
    });
    const scan = createPublicSiteScanner({ enabled: () => true, worker: run });
    await assert.rejects(scan('https://example.com/'), error => error instanceof ScannerError
      && error.code === 'SCAN_FAILED' && error.message === 'The website scan failed or timed out. No report was produced.');
    assert.equal(commands.some(args => args[0] === 'create' || args[1] === 'create'), false);
  }
});
test('pending DNS shares admission with fixture scans and releases it after cancellation', async () => {
  const abort = new AbortController(); let began!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  let lookups = 0;
  const run = createPublicUrlWorkerRunner({ enabled: () => true, openSession: emptySession,
    planTarget: async (_target, signal) => {
      lookups++; began();
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Controlled cancellation')), { once: true }));
    },
  });
  const pending = run('https://example.com/', abort.signal);
  await started;
  const isBusy = (error: unknown) => error instanceof ScannerError && error.code === 'SCANNER_BUSY';
  try {
    await assert.rejects(run('https://example.com/'), isBusy);
    await assert.rejects(createWorkerRunner(async () => { assert.fail('Must not open'); })('clear'), isBusy);
    assert.equal(lookups, 1);
  } finally { abort.abort(); await assert.rejects(pending); }
  // Another URL operation can now obtain admission, and its setup failure stays sanitized.
  const later = createPublicUrlWorkerRunner({ enabled: () => true, openSession: emptySession, planTarget: plan });
  await assert.rejects(later('https://example.com/'), error => error instanceof ScannerError && error.code === 'SCAN_FAILED');
});
test('transport rejects an unprepared namespace before creating socket volumes or browsers', async () => {
  await assert.rejects(scanInNamespace(async () => { assert.fail('Unverified egress performed work'); },
    { containers: [], networks: [], volumes: [] }, { id: 'a'.repeat(64), network: 'owned', addresses: [] },
    await plan('https://example.com/', AbortSignal.timeout(1000)), AbortSignal.timeout(1000)));
});
test('public reports bind the normalized request to the final scanned page and sanitize invalid output', async () => {
  let called = '';
  const scan = createPublicSiteScanner({ enabled: () => true, worker: async target => { called = target; return raw; } });
  const report = await scan('https://EXAMPLE.com:443/start');
  assert.equal(called, 'https://example.com/start');
  assert.equal(report.requestedUrl, called); assert.equal(report.url, raw.url); assert.equal(report.mode, 'public');
  for (const output of [{ ...raw, url: 'http://127.0.0.1/' }, { ...raw, coverage: null }, { ...raw, violations: [{ impact: 'constructor' }] }]) {
    await assert.rejects(createPublicSiteScanner({ enabled: () => true, worker: async () => output })('https://example.com/'),
      error => error instanceof ScannerError && error.code === 'SCAN_FAILED');
  }
});
test('URL HTTP contract validates bodies and preserves busy, failure and cleanup responses', async () => {
  let calls = 0; let failure: ScannerError | undefined;
  const scan = createPublicSiteScanner({ enabled: () => true, worker: async () => { calls++; if (failure) throw failure; return raw; } });
  const app = express(); app.use(express.json({ limit: '4kb' })); app.use('/api', createPublicRouter({ enabled: () => true, scan }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (body: unknown) => fetch(origin + '/api/scan-public', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    for (const body of [{}, [], { url:'http://127.0.0.1/' }, { url:'https://example.com/', extra:true }]) assert.equal((await request(body)).status, 400);
    assert.equal(calls, 0);
    const response = await request({ url:'https://example.com/start' }); assert.equal(response.status, 200);
    const report = await response.json(); assert.equal(report.requestedUrl,'https://example.com/start'); assert.equal(report.url,raw.url);
    for (const [code, status] of [['SCANNER_BUSY',429],['SCANNER_CLEANUP_FAILED',503],['SCAN_FAILED',503]] as const) {
      failure = new ScannerError(code, code === 'SCAN_FAILED' ? 'Controlled private diagnostic' : 'Controlled fixed status');
      const result = await request({url:'https://example.com/'}); assert.equal(result.status,status);
      const value = await result.json(); assert.equal(value.code,code); assert.ok(!JSON.stringify(value).includes('private diagnostic'));
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
