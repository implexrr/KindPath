import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import dgram from 'node:dgram';
import { spawnSync } from 'node:child_process';
import { isPermissionDenied } from './policy.mjs';

const after = process.argv[2] === 'after';
const deadline = setTimeout(() => process.exit(2), 15_000);
const pinned = process.argv[3] === 'pinned';
const allowed = pinned ? '93.184.216.34' : '198.18.0.2';
const blocked = pinned ? '93.184.216.36' : '198.18.0.4';
async function tcp(host, port) {
  return new Promise(done => {
    const socket = net.connect({ host, port }); let settled = false;
    const finish = value => { if (settled) return; settled = true; socket.destroy(); done(value); };
    socket.once('connect', () => finish(true)); socket.once('error', () => finish(false));
    socket.setTimeout(600, () => finish(false));
  });
}
async function udp() {
  return new Promise(done => {
    const socket = dgram.createSocket('udp4'); let settled = false;
    const finish = value => { if (settled) return; settled = true; clearTimeout(timer); socket.close(); done(value); };
    const timer = setTimeout(() => finish(false), 600);
    socket.once('message', data => finish(data.toString() === 'kindpath-dns-fixture'));
    socket.once('error', () => finish(false)); socket.send('fixture', 53, allowed);
  });
}
let stage = 'identity';
async function waitForFixture(check) {
  for (let i = 0; !(await check()); i++) {
    if (i >= 40) throw new Error('Controlled fixture did not start');
    await new Promise(done => setTimeout(done, 100));
  }
}
try {
  assert.equal(process.getuid(), 1000);
  stage = 'fixture-readiness';
  await waitForFixture(() => tcp(allowed, 80));
  if (!after) {
    // Origins bind HTTP, TLS and UDP sequentially; an open HTTP port alone
    // does not prove that all positive canaries are ready on a busy runner.
    await Promise.all([
      () => tcp(allowed, 443), () => tcp(allowed, 81), () => tcp(blocked, 80),
      () => tcp('127.0.0.1', 8888), () => tcp('::1', 8888), udp,
    ].map(waitForFixture));
  }
  stage = 'allowed-tls';
  assert.equal(await tcp(allowed, 443), true);
  stage = 'firewall-canaries';
  const denied = await Promise.all([tcp(allowed, 81), tcp(blocked, 80), tcp('127.0.0.1', 8888), tcp('::1', 8888), udp()]);
  assert.deepEqual(denied, Array(5).fill(!after));
  // This process shares the gateway namespace and privileges, and cannot remove the filter.
  stage = 'capability-denial';
  const attempt = spawnSync('/usr/sbin/nft', ['delete', 'table', 'inet', 'kindpath'], { encoding: 'utf8', timeout: 2000 });
  assert.equal(isPermissionDenied(attempt), true, 'nft must run and report a permission denial');
  stage = 'http-content';
  await new Promise((done, reject) => {
    const req = http.get({ host: allowed, port: 80, path: '/', agent: false }, res => {
      let data = ''; res.on('data', chunk => { data += chunk; }); res.on('error', reject);
      res.once('end', () => { try { assert.equal(res.statusCode, 200); assert.ok(data.includes('<html')); done(); } catch (error) { reject(error); } });
    });
    req.setTimeout(2000, () => req.destroy(new Error('Fixture timeout'))); req.once('error', reject);
  });
  process.stdout.write(JSON.stringify({ phase: after ? 'after' : 'before', allowedConnections: 2, forbiddenConnections: denied.length, cannotAlterRules: true }));
} catch { process.stderr.write(`Controlled firewall probe failed: ${stage}.\n`); process.exitCode = 1; }
finally { clearTimeout(deadline); }
