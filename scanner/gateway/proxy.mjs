import http from 'node:http';
import { MAX_RESOURCE_REQUESTS } from './limits.mjs';
import net from 'node:net';
import { resolveTarget, pinnedDestination } from './policy.mjs';

// Connection can nominate additional headers that apply only to this proxy hop.
export function forwardHeaders(headers) {
  const result = { ...headers };
  const nominated = String(headers.connection ?? '').toLowerCase().split(',').map(value => value.trim());
  for (const name of [...nominated, 'connection', 'keep-alive', 'proxy-authenticate',
    'proxy-authorization', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'authorization']) {
    delete result[name];
  }
  return result;
}

// Dependencies are injectable only for controlled tests, never through user input or environment.
export function createGateway(allowed, { resolve = resolveTarget, request = http.request, connect = net.connect } = {}) {
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
      if (++requests > MAX_RESOURCE_REQUESTS || !['GET', 'HEAD'].includes(req.method)
        || req.headers['transfer-encoding'] !== undefined
        || (req.headers['content-length'] !== undefined && req.headers['content-length'] !== '0')) throw new Error('Blocked request');
      const target = await resolve(req.url, allowed);
      if (req.aborted || res.destroyed || req.socket.destroyed || req.socket.readableEnded) return;
      if (target.url.protocol !== 'http:') throw new Error('HTTPS requires CONNECT');
      const headers = { ...forwardHeaders(req.headers), host: target.url.host, connection: 'close' };
      // Numeric address pins this connection: the HTTP client must not resolve the hostname again.
      upstream = request({ ...pinnedDestination(target),
        method: req.method, path: target.url.pathname + target.url.search, headers, agent: false, maxHeaderSize: 16_384 }, response => {
        res.writeHead(response.statusCode ?? 502, { ...forwardHeaders(response.headers), connection: 'close' });
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
    // HTTP's CONNECT socket permits half-close; destroy it on EOF before or after DNS.
    client.once('end', () => client.destroy());
    let upstream;
    try {
      if (++requests > MAX_RESOURCE_REQUESTS) throw new Error('Too many requests');
      const target = await resolve(req.url, allowed, true);
      if (client.destroyed) return;
      // Only a validated numeric public IP is dialled. TLS verification remains in Chromium.
      upstream = connect(pinnedDestination(target));
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
  server.maxRequestsPerSocket = MAX_RESOURCE_REQUESTS;
  return server;
}
