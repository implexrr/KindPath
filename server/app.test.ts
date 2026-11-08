import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { app } from './app.js';
let server: Server;
let origin: string;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
function post(body: unknown) {
  return fetch(`${origin}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
test('health identifies demo mode', async () => {
  const response = await fetch(`${origin}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', mode: 'demo' });
});
test('valid URL returns explicit demo findings without requiring a reachable host', async () => {
  const response = await post({ url: 'https://kindpath-test.invalid' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, 'demo');
  assert.equal(body.url, 'https://kindpath-test.invalid/');
  assert.equal(body.findings.length, 3);
  assert.equal(body.manualChecks.length, 3);
  assert.ok(Number.isFinite(Date.parse(body.generatedAt)));
});
test('rejects missing, wrong-type, malformed, long, credential-bearing, and non-HTTP URLs', async () => {
  for (const body of [{}, { url: 42 }, { url: 'hello' }, { url: 'https://a.com/' + 'a'.repeat(2048) }, { url: 'https://user:password@example.com' }, { url: 'file:///etc/hosts' }, { url: 'javascript:alert(1)' }]) {
    const response = await post(body);
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  }
});
test('malformed JSON and oversized JSON have stable error responses', async () => {
  const malformed = await fetch(`${origin}/api/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error, 'Send a valid JSON request.');
  const large = await post({ url: 'x'.repeat(5000) });
  assert.equal(large.status, 413);
  assert.equal((await large.json()).error, 'Request body is too large.');
});
test('unknown API routes return JSON 404', async () => {
  const response = await fetch(`${origin}/api/not-a-route`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, 'API route not found.');
});

test('OPTIONS analysis requests preserve the JSON 404 response', async () => {
  for (const path of ['/api/analyze', '/api/analyze/']) {
    const response = await fetch(`${origin}${path}`, { method: 'OPTIONS' });
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/);
    assert.equal(response.headers.get('allow'), null);
    assert.deepEqual(await response.json(), { error: 'API route not found.' });
  }
});
