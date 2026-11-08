import { spawnSync } from 'node:child_process';
import http from 'node:http';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { addresses, rules, hash } from './policy.mjs';

const [task, raw = '[]', expected] = process.argv.slice(2);
const deadline = setTimeout(() => process.exit(2), 90_000);
function nft(args, input) {
  const result = spawnSync('/usr/sbin/nft', args, { input, encoding: 'utf8', timeout: 5000, maxBuffer: 256 * 1024 });
  if (result.status !== 0) throw new Error('Firewall command failed');
  return result.stdout;
}
try {
  if (task === 'hold' || task === 'hold-fixture') {
    if (process.getuid() !== 1000) throw new Error('Holder must be unprivileged');
    if (task === 'hold-fixture') {
      for (const host of ['127.0.0.1', '::1']) {
        const server = http.createServer((_req, res) => res.end('kindpath-loopback-fixture'));
        await new Promise((done, reject) => server.listen(8888, host, done).once('error', reject));
      }
    }
    // This is the only long-lived process; it has no network-administration capability.
    await new Promise(() => {});
  } else {
    // NET_ADMIN only, inside the per-scan network namespace. Never host networking.
    if (process.getuid() !== 0 || !/^CapEff:\s+0*1000$/m.test(readFileSync('/proc/self/status', 'utf8'))) throw new Error('Unexpected setup privileges');
    const ips = addresses(JSON.parse(raw));
    if (task === 'setup') {
      const path = '/tmp/kindpath-rules.nft';
      writeFileSync(path, rules(ips), { mode: 0o600, flag: 'wx' });
      try { nft(['--check', '-f', path]); nft(['-f', path]); } finally { unlinkSync(path); }
    } else if (task !== 'verify') throw new Error('Unknown firewall task');
    const canonical = nft(['--stateless', 'list', 'table', 'inet', 'kindpath']);
    const policyHash = hash(canonical);
    if (task === 'verify' && (!/^[a-f0-9]{64}$/.test(expected ?? '') || policyHash !== expected)) throw new Error('Firewall changed');
    const json = JSON.parse(nft(['--json', 'list', 'table', 'inet', 'kindpath']));
    const chains = json.nftables.filter(item => item.chain).map(item => item.chain);
    if (chains.length !== 3 || ['input', 'output', 'forward'].some(hook => !chains.some(chain => chain.name === hook && chain.hook === hook && chain.policy === 'drop'))) throw new Error('Missing deny policy');
    const drops = json.nftables.filter(item => item.rule?.expr?.some(expr => 'drop' in expr));
    const droppedPackets = drops.reduce((sum, item) => sum + item.rule.expr.reduce((n, expr) => n + (expr.counter?.packets ?? 0), 0), 0);
    process.stdout.write(JSON.stringify({ policyHash, droppedPackets }));
    clearTimeout(deadline);
  }
} catch { process.stderr.write('Isolated firewall setup/verification failed.\n'); process.exitCode = 1; clearTimeout(deadline); }
