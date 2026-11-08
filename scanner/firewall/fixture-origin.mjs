import http from 'node:http';
import dgram from 'node:dgram';
import { readFile } from 'node:fs/promises';
const html = await readFile(new URL('../fixtures/barriers.html', import.meta.url));
for (const port of [80, 81, 443]) {
  const server = http.createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html); });
  await new Promise((done, reject) => server.listen(port, '0.0.0.0', done).once('error', reject));
}
const udp = dgram.createSocket('udp4');
udp.on('message', (_data, peer) => udp.send('kindpath-dns-fixture', peer.port, peer.address));
await new Promise((done, reject) => udp.bind(53, '0.0.0.0', done).once('error', reject));
setTimeout(() => process.exit(0), 90_000);
