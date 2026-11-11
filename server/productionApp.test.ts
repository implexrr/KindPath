import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { connect } from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';
import { createProductionApp, createProductionServer, productionConfig } from './productionApp.js';

const origin = 'https://staging.example.test';
const host = new URL(origin).host;
const password = randomBytes(32).toString('hex');
const authorization = 'Basic ' + Buffer.from(`kindpath:${password}`).toString('base64');
const settings = {
  KINDPATH_STAGE_ORIGIN: origin,
  KINDPATH_STAGE_PASSWORD_SHA256: createHash('sha256').update(password).digest('hex'),
  KINDPATH_PUBLIC_SCANNING: 'false',
  KINDPATH_PUBLIC_CAPTURE: 'false',
};

test('staging requires an exact HTTPS origin, a password digest, and explicit scan flags', () => {
  for (const invalid of ['http://staging.example.test', origin + '/', origin + '?q=1', 'https://user@staging.example.test']) {
    assert.throws(() => productionConfig({ ...settings, KINDPATH_STAGE_ORIGIN: invalid }), /HTTPS origin/);
  }
  assert.throws(() => productionConfig({ ...settings, KINDPATH_STAGE_PASSWORD_SHA256: undefined }), /SHA256/);
  assert.throws(() => productionConfig({ ...settings, KINDPATH_PUBLIC_CAPTURE: undefined }), /PUBLIC_CAPTURE/);
});

test('staging protects the frontend and API, then limits authenticated POST requests', async (t) => {
  await mkdir('build', { recursive: true });
  const root = await mkdtemp(join('build', 'staging-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const staticRoot = join(process.cwd(), root);
  await mkdir(join(staticRoot, 'assets'));
  await writeFile(join(staticRoot, 'index.html'), '<title>Staging</title>');
  await writeFile(join(staticRoot, 'assets', 'index.js'), 'console.log("staging")');
  await writeFile(join(staticRoot, 'private.txt'), 'excluded from routes');
  const linkedAsset = join(staticRoot, 'assets', 'linked.txt');
  await symlink('../private.txt', linkedAsset);
  assert.throws(() => createProductionApp(productionConfig(settings), staticRoot), /only regular files/);
  await rm(linkedAsset);
  let time = 0;
  const app = createProductionApp(productionConfig(settings), staticRoot, () => time);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => server.once('listening', resolve).once('error', reject));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const send = (path: string, headers: Record<string, string> = {}, method = 'GET', body?: string) =>
    new Promise<{ status: number | undefined; headers: Record<string, unknown>; body: string }>((resolve, reject) => {
      const req = request({
        host: '127.0.0.1', port: address.port, path, method,
        headers: { Host: host, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      }, res => {
        res.setEncoding('utf8');
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end(body);
    });

  for (const path of ['/', '/assets/index.js', '/api/health']) {
    const denied = await send(path);
    assert.equal(denied.status, 401);
    assert.match(String(denied.headers['www-authenticate']), /^Basic /);
    assert.equal(denied.headers['cache-control'], 'no-store');
  }
  const auth = { Authorization: authorization };
  assert.equal((await send('/', { Authorization: 'Basic invalid' })).status, 401);
  const wrongPassword = Buffer.from(`kindpath:${randomBytes(32).toString('hex')}`).toString('base64');
  assert.equal((await send('/', { Authorization: `Basic ${wrongPassword}` })).status, 401);
  assert.equal((await send('/', { ...auth, Host: 'invalid.test', 'X-Forwarded-Host': host })).status, 403);
  assert.match((await send('/', auth)).body, /<title>Staging/);
  const asset = await send('/assets/index.js', auth);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers['cache-control'], 'no-store');
  assert.equal((await send('/private.txt', auth)).status, 404);
  assert.equal((await send('/assets/../private.txt', auth)).status, 404);
  assert.deepEqual(JSON.parse((await send('/api/health', auth)).body), { status: 'ok', mode: 'demo' });

  const post = { ...auth, Origin: origin };
  const scanPath = '/api/scan-public';
  assert.equal((await send('/assets/index.js', post, 'POST', '{')).status, 404);
  assert.equal((await send(scanPath, auth, 'POST')).status, 403);
  assert.equal((await send(scanPath, { ...auth, Origin: 'https://other.example.test' }, 'POST')).status, 403);
  assert.equal((await send(scanPath, { Origin: origin }, 'POST')).status, 401);

  for (let i = 0; i < 6; i++) {
    const response = await send(scanPath, post, 'POST', '{"url":"https://example.test/"}');
    assert.equal(JSON.parse(response.body).code, 'PUBLIC_SCANNING_DISABLED');
  }
  const limited = await send('/API/scan-public/', post, 'POST', '{');
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['retry-after'], '60');
  assert.equal(JSON.parse(limited.body).code, 'SCAN_RATE_LIMITED');
  assert.equal((await send('/api/health', auth)).status, 200);
  time = 60_000;
  assert.equal((await send(scanPath, post, 'POST', '{')).status, 400);
});

test('staging drains an active request and rejects pipelined work during shutdown', { timeout: 5000 }, async (t) => {
  let finishActive: (() => void) | undefined;
  let started = 0;
  const { server, stop } = createProductionServer((_req, res) => {
    started++;
    finishActive = () => res.end('completed');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(stop);
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const socket = connect(address.port, '127.0.0.1');
  t.after(() => socket.destroy());
  await once(socket, 'connect');
  let raw = '';
  socket.setEncoding('utf8').on('data', chunk => { raw += chunk; });

  const rejected = once(server, 'request').then(() => {
    assert.ok(finishActive);
    stop();
    socket.write('GET /second HTTP/1.1\r\nHost: localhost\r\n\r\n');
    return once(server, 'request');
  });
  socket.write('GET /first HTTP/1.1\r\nHost: localhost\r\n\r\n');
  await rejected;
  finishActive?.();
  await once(socket, 'close');
  assert.equal(started, 1);
  assert.match(raw, /HTTP\/1.1 200 OK[\s\S]*completed[\s\S]*HTTP\/1.1 503 Service Unavailable/);
});
