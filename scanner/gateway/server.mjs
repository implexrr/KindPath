import http from 'node:http';
import net from 'node:net';
import { chmod } from 'node:fs/promises';
import { resolveTarget, pinnedDestination } from './policy.mjs';

const allowed = JSON.parse(process.env.KINDPATH_ALLOWED_HOSTS ?? '[]');
if (!Array.isArray(allowed) || !allowed.length || allowed.some(host => typeof host !== 'string' || !/^[a-z0-9.-]+$/.test(host))) throw new Error('Invalid allowlist');
const socketPath = '/run/kindpath/egress.sock';
const byteLimit = 8 * 1024 * 1024;
let requests = 0;
const connections = new Set();
const deny = socket => socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
function track(socket) {
  connections.add(socket);
  socket.once('close', () => connections.delete(socket));
  socket.on('error', () => socket.destroy());
  socket.setTimeout(10_000, () => socket.destroy());
  let bytes = 0;
  socket.on('data', data => { bytes += data.length; if (bytes > byteLimit) socket.destroy(); });
  if (connections.size > 32) socket.destroy();
}
const server = http.createServer({ maxHeaderSize: 16_384 }, async (req, res) => {
  let upstream;
  try {
    if (++requests > 100 || !['GET', 'HEAD'].includes(req.method)) throw new Error('Blocked request');
    const target = await resolveTarget(req.url, allowed);
    if (target.url.protocol !== 'http:') throw new Error('HTTPS requires CONNECT');
    const headers = { ...req.headers, host: target.url.host, connection: 'close' };
    for (const name of ['authorization', 'proxy-authorization', 'proxy-connection', 'upgrade', 'transfer-encoding', 'content-length']) delete headers[name];
    // Numeric address pins this connection: the HTTP client must not resolve the hostname again.
    upstream = http.request({ ...pinnedDestination(target),
      method: req.method, path: target.url.pathname + target.url.search, headers, agent: false, maxHeaderSize: 16_384 }, response => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      let bytes = 0;
      response.on('data', chunk => { bytes += chunk.length; if (bytes > byteLimit) { response.destroy(); res.destroy(); } });
      response.on('error', () => res.destroy());
      response.pipe(res);
    });
    upstream.setTimeout(10_000, () => upstream.destroy());
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    res.once('close', () => upstream.destroy());
    upstream.end();
  } catch { if (!res.headersSent) res.writeHead(403); res.end(); upstream?.destroy(); }
});
server.on('connection', track);
server.on('connect', async (req, client, head) => {
  let upstream;
  try {
    if (++requests > 100) throw new Error('Too many requests');
    const target = await resolveTarget(req.url, allowed, true);
    if (client.destroyed) return;
    // Only a validated numeric public IP is dialled. TLS verification remains in Chromium.
    upstream = net.connect(pinnedDestination(target));
    track(upstream);
    client.once('close', () => upstream.destroy());
    upstream.once('close', () => client.destroy());
    upstream.once('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      client.pipe(upstream); upstream.pipe(client);
    });
  } catch { upstream?.destroy(); deny(client); }
});
server.on('upgrade', (_req, socket) => deny(socket));
server.on('clientError', (_error, socket) => deny(socket));
server.headersTimeout = 5000;
server.requestTimeout = 10_000;
server.maxRequestsPerSocket = 100;
await new Promise((resolve, reject) => server.listen(socketPath, resolve).once('error', reject));
await chmod(socketPath, 0o600);
process.stdout.write('Gateway ready\n');
// A host crash must not leave an indefinitely running gateway.
setTimeout(() => process.exit(0), 60_000);
