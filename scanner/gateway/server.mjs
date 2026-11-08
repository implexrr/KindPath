import { chmod } from 'node:fs/promises';
import { createGateway } from './proxy.mjs';
import { resolveTarget, snapshotResolver } from './policy.mjs';

const allowed = JSON.parse(process.env.KINDPATH_ALLOWED_HOSTS ?? '[]');
if (!Array.isArray(allowed) || !allowed.length || allowed.some(host => typeof host !== 'string' || !/^[a-z0-9.-]+$/.test(host))) throw new Error('Invalid allowlist');
const socketPath = '/run/kindpath/egress.sock';
const lookup = snapshotResolver(JSON.parse(process.env.KINDPATH_PINNED_DESTINATIONS ?? '{}'), allowed);
const server = createGateway(allowed, { resolve: (raw, hosts, tunnel) => resolveTarget(raw, hosts, tunnel, lookup) });
await new Promise((resolve, reject) => server.listen(socketPath, resolve).once('error', reject));
await chmod(socketPath, 0o600);
process.stdout.write('Gateway ready\n');
// A host crash must not leave an indefinitely running gateway.
setTimeout(() => process.exit(0), 60_000);
