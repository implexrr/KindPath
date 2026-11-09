import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
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
  assert.deepEqual(body.findings[0].elements, [{
    targets: ['Example newsletter · email input'],
    guidance: 'Add a visible <label> and connect its htmlFor to the input id.',
  }]);
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

test('fixture endpoint rejects URLs, paths, and extra fields before starting a worker', async () => {
  for (const body of [{ url: 'http://127.0.0.1' }, { fixture: '../clear' }, { fixture: 'barriers', url: 'https://example.com' }, {}]) {
    const response = await fetch(`${origin}/api/scan-fixture`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 400);
  }
});

test('public scanning endpoint stays disabled and reports its candidate allowlist', async () => {
  const response = await fetch(`${origin}/api/scan-public`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://example.com/'})});
  assert.equal(response.status,503);
  assert.equal((await response.json()).code,'PUBLIC_SCANNING_DISABLED');
  const capabilities=await (await fetch(`${origin}/api/scanning-capabilities`)).json();
  assert.equal(capabilities.publicScanningEnabled,false);
  assert.equal(capabilities.publicCaptureEnabled,false);
  assert.deepEqual(capabilities.allowedHosts,['example.com']);
});

test('local API rejects untrusted hostnames and browser origins before scanner work', async () => {
  const cases: Record<string, string>[] = [{Host:'attacker.invalid'}, {Origin:'https://attacker.invalid'}, {Origin:'null'}];
  for (const headers of cases) {
    const status=await new Promise<number>((resolve,reject)=>{
      const req=request(`${origin}/api/scan-fixture`, {method:'POST',headers:{'Content-Type':'application/json',...headers}}, res=>{
        res.resume(); res.once('end',()=>resolve(res.statusCode ?? 0));
      });
      req.once('error',reject); req.end(JSON.stringify({fixture:'barriers'}));
    });
    assert.equal(status,403);
  }
  const local=await fetch(`${origin}/api/scanning-capabilities`, {headers:{Origin:'http://127.0.0.1:5173'}});
  assert.equal(local.status,200);
});

test('preview endpoint accepts only its fixed fixture identifier and never a URL or HTML', async () => {
  for (const body of [{}, { fixture: 'unknown' }, { fixture: '../garden' }, { url: 'https://example.com' },
    { fixture: 'garden', url: 'https://example.com' }, { fixture: 'garden', html: '<script></script>' }]) {
    const response = await fetch(`${origin}/api/preview-fixture`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 400);
  }
});
