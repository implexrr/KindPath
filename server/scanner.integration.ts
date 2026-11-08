import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runIsolatedWorker } from './scanner/dockerWorker.js';
import { scanFixture } from './scanner/fixtureScanner.js';
import { app } from './app.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { join } from 'node:path';

test('worker has no external interface, host mounts/credentials, root privileges, or writable root', async () => {
  process.env.KINDPATH_HOST_CANARY = 'not-a-secret-test-marker';
  try { assert.deepEqual(await runIsolatedWorker('verify-isolation'), { isolation: 'passed' }); }
  finally { delete process.env.KINDPATH_HOST_CANARY; }
});
test('fixture API returns real axe results for the known barriers', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/scan-fixture`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fixture: 'barriers' }),
    });
    assert.equal(response.status, 200);
    const report = await response.json();
    assert.equal(report.mode, 'fixture');
    const ids = report.findings.map((finding: { id: string }) => finding.id);
    for (const id of ['image-alt', 'label', 'button-name']) assert.ok(ids.includes(id), `Missing expected rule: ${id}`);
    assert.ok(report.scanner?.engineVersion);
    const label = report.findings.find((finding: { id: string }) => finding.id === 'label');
    assert.ok(label.elements.length > 0);
    assert.ok(label.elements[0].targets.length > 0);
    assert.equal(typeof label.elements[0].guidance, 'string');
    assert.ok(!('html' in label.elements[0]));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
test('labelled fixture has no violations in the selected automated checks', async () => {
  const report = await scanFixture('clear');
  assert.equal(report.findings.length, 0);
  assert.ok((report.scanner?.passedChecks ?? 0) > 0);
});

test('concurrency and cancellation fail safely and allow a later scan', async () => {
  const abort = new AbortController();
  const run = runIsolatedWorker('barriers', abort.signal);
  await assert.rejects(runIsolatedWorker('clear'), (error: any) => error.code === 'SCANNER_BUSY');
  const timer = setTimeout(() => abort.abort(), 200);
  try { await assert.rejects(run); } finally { clearTimeout(timer); }
  const report = await scanFixture('clear');
  assert.equal(report.mode, 'fixture');
});

test('all fixture containers are removed after success and cancellation', async () => {
  const docker = process.platform === 'darwin' ? '/Applications/Docker.app/Contents/Resources/bin/docker' : '/usr/bin/docker';
  const socket = process.platform === 'darwin' ? join(homedir(), '.docker/run/docker.sock') : '/var/run/docker.sock';
  const { stdout } = await promisify(execFile)(docker, ['--host', `unix://${socket}`, 'ps', '--all', '--quiet', '--filter', 'label=kindpath.scanner=fixture'], { env: { PATH: '/usr/bin:/bin' } });
  assert.equal(stdout.trim(), '', 'A fixture container was left behind');
});

test('preview API returns an inert snapshot captured from the rendered garden fixture', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/preview-fixture`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fixture: 'garden' }),
    });
    assert.equal(response.status, 200);
    const snapshot = await response.json();
    assert.equal(snapshot.mode, 'fixture'); assert.equal(snapshot.fixture, 'garden');
    assert.ok(Number.isFinite(Date.parse(snapshot.capturedAt)));
    assert.match(snapshot.html, /Rendered garden introduction/); // Set by the fixture's script before capture.
    assert.match(snapshot.html, /\.cta:hover/); assert.match(snapshot.html, /ADVERTISEMENT/);
    assert.match(snapshot.html, /<input[^>]* disabled>/);
    assert.equal(/<(script|form|iframe|object)\b|\bhref\s*=|\bonclick\s*=/i.test(snapshot.html), false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
