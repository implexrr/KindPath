import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { reserveScanner } from './admission.js';
import { IMAGE } from './containerPolicy.js';
import { openLocalDockerSession, removeAndConfirm, ScannerError } from './dockerWorker.js';
import type { Command, DockerSession } from './dockerWorker.js';
import { ALLOWED_PUBLIC_HOSTS, PUBLIC_LABEL, assertPublicIsolation, validatePublicUrl } from './publicPolicy.js';

type Resources = { browser: string; gateway: string; volume: string };
const profile = fileURLToPath(new URL('../../scanner/seccomp.json', import.meta.url));
const cleanupFailure = () => new ScannerError('SCANNER_CLEANUP_FAILED', 'Gateway cleanup could not be verified. Restore Docker and retry; no new gateway worker will start until cleanup is confirmed.');

async function cleanup(command: Command, resources: Resources) {
  let failed = false;
  for (const name of [resources.browser, resources.gateway]) {
    try { await removeAndConfirm(command, name); } catch { failed = true; }
  }
  if (failed) throw cleanupFailure();
  for (let i = 0; i < 2; i++) {
    try { await command(['volume', 'rm', resources.volume], undefined, 3000); } catch { /* Verify absence, including partial creation. */ }
    try {
      const volumes = await command(['volume', 'ls', '--quiet', '--filter', `name=^${resources.volume}$`], undefined, 3000);
      if (!volumes.trim()) return;
    } catch { /* An unavailable daemon is not successful cleanup. */ }
  }
  throw cleanupFailure();
}
function args(name: string, volume: string, role: 'browser' | 'gateway', target: string) {
  const browser = role === 'browser';
  return ['create', '--pull=never', '--rm', '--name', name, '--label', PUBLIC_LABEL,
    `--network=${browser ? 'none' : 'bridge'}`, '--read-only', '--user=1000:1000', '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true', ...(browser ? [`--security-opt=seccomp=${profile}`] : []),
    `--memory=${browser ? '512m' : '128m'}`, `--cpus=${browser ? '1' : '0.5'}`, `--pids-limit=${browser ? '256' : '64'}`,
    '--ipc=private', '--shm-size=128m', '--tmpfs=/tmp:rw,nosuid,nodev,noexec,size=134217728', '--init',
    `--mount=type=volume,src=${volume},dst=/run/kindpath,volume-nocopy${browser ? ',readonly' : ''}`,
    '--env=HOME=/tmp/kindpath-home', `--env=KINDPATH_ALLOWED_HOSTS=${JSON.stringify(ALLOWED_PUBLIC_HOSTS)}`,
    '--entrypoint=node', IMAGE, ...(browser ? ['public-worker.mjs', target] : ['gateway/server.mjs'])];
}

// Low-level transport used by security tests. The public HTTP route has an additional disabled gate.
export function createPublicWorkerRunner(openSession: () => Promise<DockerSession>) {
  let active = false;
  let pending: Resources | undefined;
  return async (target: string, signal?: AbortSignal): Promise<unknown> => {
  if (target !== 'verify-public-isolation') target = validatePublicUrl(target);
  if (active) throw new ScannerError('SCANNER_BUSY', 'A gateway scan is already running.');
  const release = reserveScanner();
  if (!release) throw new ScannerError('SCANNER_BUSY', 'A scan is already running.');
  active = true;
  signal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(50_000)]);
  let session: DockerSession | undefined;
  let owned: Resources | undefined;
  try {
    session = await openSession();
    const command = session.command;
    if (pending) { await cleanup(command, pending); pending = undefined; }
    for (const commandArgs of [
      ['ps', '--all', '--quiet', '--filter', `label=${PUBLIC_LABEL}`],
      ['volume', 'ls', '--quiet', '--filter', `label=${PUBLIC_LABEL}`],
      ['ps', '--all', '--quiet', '--filter', 'label=kindpath.scanner=fixture'],
    ]) if ((await command(commandArgs, signal)).trim()) throw cleanupFailure();
    const id = randomUUID();
    owned = { browser: `kindpath-public-browser-${id}`, gateway: `kindpath-public-gateway-${id}`, volume: `kindpath-public-ipc-${id}` };
    pending = owned;
    await command(['volume', 'create', '--driver=local', '--opt=type=tmpfs', '--opt=device=tmpfs',
      '--opt=o=uid=1000,gid=1000,mode=0700,size=1m', '--label', PUBLIC_LABEL, owned.volume], signal);
    const volumes = JSON.parse(await command(['volume', 'inspect', owned.volume], signal));
    if (volumes.length !== 1 || volumes[0].Driver !== 'local' || volumes[0].Options?.type !== 'tmpfs'
      || volumes[0].Options?.device !== 'tmpfs' || volumes[0].Options?.o !== 'uid=1000,gid=1000,mode=0700,size=1m') throw cleanupFailure();
    for (const role of ['gateway', 'browser'] as const) {
      const name = owned[role];
      await command(args(name, owned.volume, role, target), signal);
      assertPublicIsolation(JSON.parse(await command(['inspect', name], signal)), role, owned.volume);
    }
    await command(['start', owned.gateway], signal);
    const raw = await command(['start', '--attach', owned.browser], signal, 45_000);
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof ScannerError) throw error;
    throw new ScannerError('SCAN_FAILED', 'The isolated gateway scan failed. No report was produced.');
  } finally {
    try { if (owned && session) { await cleanup(session.command, owned); pending = undefined; } }
    finally { try { await session?.dispose(); } finally { active = false; release(); } }
  }
  };
}

export const runPublicWorker = createPublicWorkerRunner(openLocalDockerSession);
