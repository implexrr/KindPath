import { MAX_RESOURCE_REQUESTS } from './limits.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGateway, forwardHeaders } from './proxy.mjs';
import { resolveTarget } from './policy.mjs';

const allowed = ['example.com'];
const resolve = (url, hosts, tunnel) => resolveTarget(url, hosts, tunnel, async () => [{ address: '93.184.216.34' }]);
async function listen(t, server) {
  const dir = await mkdtemp(join(tmpdir(), 'kp-proxy-'));
  const socketPath = join(dir, 'socket');
  const sockets = new Set();
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise((done, reject) => server.listen(socketPath, done).once('error', reject));
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise(done => server.close(done));
    await rm(dir, { recursive: true, force: true });
  });
  return socketPath;
}
function get(socketPath, options = {}, body) {
  return new Promise((done, reject) => {
    const req = http.request({ socketPath, path: 'http://example.com/page?q=1', agent: false, ...options }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', data => { text += data; });
      res.once('error', reject); res.once('end', () => done({ status: res.statusCode, headers: res.headers, text }));
    });
    req.setTimeout(2000, () => req.destroy(new Error('Test request timed out')));
    req.once('error', reject); req.end(body);
  });
}

test('proxy strips fixed and Connection-nominated headers without mutating input', () => {
  const headers = { connection: 'Keep-Alive, X-Hop', 'x-hop': 'secret', 'keep-alive': 'timeout=5',
    authorization: 'secret', 'proxy-authorization': 'secret', 'proxy-authenticate': 'challenge',
    te: 'trailers', trailer: 'x-end', upgrade: 'websocket', 'transfer-encoding': 'chunked', accept: 'text/html' };
  assert.deepEqual(forwardHeaders(headers), { accept: 'text/html' });
  assert.equal(headers['x-hop'], 'secret');
});

test('HTTP forwarding preserves the validated destination and removes hop headers both ways', { timeout: 5000 }, async t => {
  let received;
  const origin = await listen(t, http.createServer((req, res) => {
    received = { headers: req.headers, path: req.url, method: req.method };
    res.writeHead(200, { connection: 'X-Origin-Hop', 'x-origin-hop': 'hidden', 'x-content': 'kept' }); res.end('fixture');
  }));
  const gateway = await listen(t, createGateway(allowed, { resolve, request: (options, callback) => {
    assert.equal(options.host, '93.184.216.34'); assert.equal(options.family, 4); assert.equal(options.port, 80);
    return http.request({ ...options, socketPath: origin }, callback);
  } }));
  const response = await get(gateway, { headers: { host: 'attacker.invalid', authorization: 'hidden', connection: 'X-Hop', 'x-hop': 'hidden' } });
  assert.equal(response.status, 200); assert.equal(response.text, 'fixture');
  assert.equal(received.headers.host, 'example.com'); assert.equal(received.path, '/page?q=1'); assert.equal(received.method, 'GET');
  assert.equal(received.headers.authorization, undefined); assert.equal(received.headers['x-hop'], undefined);
  assert.equal(response.headers['x-origin-hop'], undefined); assert.equal(response.headers['x-content'], 'kept');
});

test('unsupported methods and request bodies are rejected before DNS or upstream access', { timeout: 5000 }, async t => {
  let lookups = 0;
  const gateway = await listen(t, createGateway(allowed, { resolve: async () => { lookups++; throw new Error('Must not resolve'); } }));
  for (const options of [{ method: 'POST' }, { method: 'GET', headers: { 'content-length': '1' } },
    { method: 'HEAD', headers: { 'transfer-encoding': 'chunked' } }]) {
    assert.equal((await get(gateway, options, options.headers ? 'x' : undefined)).status, 403);
  }
  assert.equal(lookups, 0);
});

test('forbidden HTTP and CONNECT targets never create an upstream connection', { timeout: 5000 }, async t => {
  let upstreams = 0;
  const forbidden = () => { upstreams++; throw new Error('Must not connect'); };
  const gateway = await listen(t, createGateway(allowed, { resolve, request: forbidden, connect: forbidden }));
  for (const path of ['http://127.0.0.1/', 'http://unlisted.invalid/', 'https://example.com/']) assert.equal((await get(gateway, { path })).status, 403);
  await new Promise((done, reject) => {
    const req = http.request({ socketPath: gateway, method: 'CONNECT', path: '127.0.0.1:443' });
    req.once('connect', (res, socket) => { socket.destroy(); try { assert.equal(res.statusCode, 403); done(); } catch (error) { reject(error); } });
    req.once('error', reject); req.end();
  });
  assert.equal(upstreams, 0);
});

test('CONNECT uses the validated address and closes failed upstream connections safely', { timeout: 5000 }, async t => {
  let attempts = 0;
  const gateway = await listen(t, createGateway(allowed, { resolve, connect: options => {
    assert.deepEqual(options, { host: '93.184.216.34', family: 4, port: 443 }); attempts++;
    return net.connect(join(tmpdir(), 'kindpath-missing-socket'));
  } }));
  await new Promise((done, reject) => {
    const req = http.request({ socketPath: gateway, method: 'CONNECT', path: 'example.com:443' });
    req.once('connect', (_res, socket) => { socket.destroy(); reject(new Error('Failed tunnel was accepted')); });
    req.once('error', error => { try { assert.equal(error.code, 'ECONNRESET'); done(); } catch (failure) { reject(failure); } });
    req.end();
  });
  assert.equal(attempts, 1);
  assert.equal((await get(gateway, { path: 'http://unlisted.invalid/' })).status, 403);
});

test('a disconnected client cannot open an upstream after delayed DNS resolution', { timeout: 5000 }, async t => {
  for (const method of ['GET', 'CONNECT']) {
    let release; let started; let upstreams = 0;
    const waiting = new Promise(done => { started = done; });
    let disconnected;
    const serverEnd = new Promise(done => { disconnected = done; });
    const server = createGateway(allowed, { resolve: async (...args) => {
      started(); await new Promise(done => { release = done; }); return resolve(...args);
    }, request: () => { upstreams++; throw new Error('Disconnected client'); }, connect: () => { upstreams++; throw new Error('Disconnected client'); } });
    server.on('connection', socket => socket.once('end', disconnected));
    const gateway = await listen(t, server);
    const req = http.request({ socketPath: gateway, method, path: method === 'CONNECT' ? 'example.com:443' : 'http://example.com/' });
    req.on('error', () => {}); req.end(); await waiting;
    const closed = new Promise(done => req.once('close', done)); req.destroy(); await closed;
    await serverEnd; release();
    await new Promise(done => setImmediate(done)); assert.equal(upstreams, 0);
  }
});

test('CONNECT forwards bytes through a controlled Unix socket without external networking', { timeout: 5000 }, async t => {
  const origin = await listen(t, net.createServer(socket => socket.pipe(socket)));
  const gateway = await listen(t, createGateway(allowed, { resolve, connect: options => {
    assert.equal(options.host, '93.184.216.34'); assert.equal(options.port, 443);
    return net.connect(origin);
  } }));
  await new Promise((done, reject) => {
    const req = http.request({ socketPath: gateway, method: 'CONNECT', path: 'example.com:443' });
    req.once('error', reject);
    req.once('connect', (res, socket) => {
      assert.equal(res.statusCode, 200);
      socket.setTimeout(2000, () => socket.destroy(new Error('Test tunnel timed out')));
      socket.once('error', reject);
      socket.once('data', data => {
        socket.destroy(); try { assert.equal(data.toString(), 'controlled bytes'); done(); } catch (error) { reject(error); }
      });
      socket.write('controlled bytes');
    });
    req.end();
  });
});

test('gateway request budget blocks additional lookups at the configured cap', { timeout: 5000 }, async t => {
  let lookups = 0;
  const gateway = await listen(t, createGateway(allowed, { resolve: async () => { lookups++; throw new Error('Controlled denial'); } }));
  for (let i = 0; i <= MAX_RESOURCE_REQUESTS; i++) assert.equal((await get(gateway)).status, 403);
  assert.equal(lookups, MAX_RESOURCE_REQUESTS);
});
