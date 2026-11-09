import { createInterface } from 'node:readline';
import { controllerResolver } from './controller.mjs';
import { chmod } from 'node:fs/promises';
import { createGateway } from './proxy.mjs';
import { resolveTarget, snapshotResolver } from './policy.mjs';

const allowed = JSON.parse(process.env.KINDPATH_ALLOWED_HOSTS ?? '[]');
if (allowed !== null && (!Array.isArray(allowed) || !allowed.length || allowed.some(host => typeof host !== 'string' || !/^[a-z0-9.-]+$/.test(host)))) throw new Error('Invalid allowlist');
const socketPath = '/run/kindpath/egress.sock';
const initial = JSON.parse(process.env.KINDPATH_PINNED_DESTINATIONS ?? '{}');
let nextId = 0;
const pending = new Map();
if (allowed === null) {
  const input = createInterface({ input: process.stdin });
  input.on('line', line => {
    if (line.length > 8192) process.exit(1);
    const reply = JSON.parse(line);
    if (!reply || Object.keys(reply).sort().join(',') !== 'addresses,id' || !pending.has(reply.id)) process.exit(1);
    const resolve = pending.get(reply.id); pending.delete(reply.id); resolve(reply.addresses);
  });
  input.on('close', () => process.exit(1));
}
const lookup = allowed === null ? controllerResolver(initial, host => new Promise((resolve, reject) => {
  const id = ++nextId;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error('Destination approval timed out')); }, 55000);
  pending.set(id, answers => { clearTimeout(timer); resolve(answers); });
  process.stdout.write(JSON.stringify({ id, host }) + '\n');
})) : snapshotResolver(initial, allowed);
// Controller approval includes queued DNS and verified firewall updates. Its
// deadline is separate from the controller's five-second per-host DNS limit.
const server = createGateway(allowed, { resolve: (raw, hosts, tunnel) => resolveTarget(raw, hosts, tunnel, lookup, allowed === null ? 55000 : 5000) });
await new Promise((resolve, reject) => server.listen(socketPath, resolve).once('error', reject));
await chmod(socketPath, 0o600);
process.stdout.write(allowed === null ? JSON.stringify({ready:true}) + '\n' : 'Gateway ready\n');
// A host crash must not leave an indefinitely running gateway.
setTimeout(() => process.exit(0), 60_000);
