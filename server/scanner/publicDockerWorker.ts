import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { IMAGE } from './containerPolicy.js';
import { openLocalDockerSession, ScannerError } from './dockerWorker.js';
import type { DockerSession } from './dockerWorker.js';
import { ALLOWED_PUBLIC_HOSTS, PUBLIC_LABEL, assertPublicIsolation } from './publicPolicy.js';
import { createResourceRunner } from './resources.js';
import { firewallControl, prepareNamespace } from './firewallDocker.js';

const profile = fileURLToPath(new URL('../../scanner/seccomp.json', import.meta.url));
function args(name: string, volume: string, role: 'browser' | 'gateway', namespace: string) {
  const browser = role === 'browser';
  return ['create', '--pull=never', '--rm', '--name', name, '--label', PUBLIC_LABEL,
    `--network=${browser ? 'none' : `container:${namespace}`}`, '--read-only', '--user=1000:1000', '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true', ...(browser ? [`--security-opt=seccomp=${profile}`] : []),
    `--memory=${browser ? '512m' : '128m'}`, `--cpus=${browser ? '1' : '0.5'}`, `--pids-limit=${browser ? '256' : '64'}`,
    '--ipc=private', '--shm-size=128m', '--tmpfs=/tmp:rw,nosuid,nodev,noexec,size=134217728', '--init',
    `--mount=type=volume,src=${volume},dst=/run/kindpath,volume-nocopy${browser ? ',readonly' : ''}`,
    '--env=HOME=/tmp/kindpath-home', `--env=KINDPATH_ALLOWED_HOSTS=${JSON.stringify(ALLOWED_PUBLIC_HOSTS)}`,
    '--env=KINDPATH_PINNED_DESTINATIONS={}',
    '--entrypoint=node', IMAGE, ...(browser ? ['public-worker.mjs', 'verify-public-isolation'] : ['gateway/server.mjs'])];
}
export function createPublicWorkerRunner(openSession: () => Promise<DockerSession>) {
  const run = createResourceRunner(async (command, resources, _task, signal) => {
    // Controlled verification only: no public IP snapshot or outbound network is attached.
    const ns = await prepareNamespace(command, resources, signal);
    await firewallControl(command, resources, ns, 'setup', signal);
    await firewallControl(command, resources, ns, 'verify', signal);
    const id = randomUUID();
    const volume = `kindpath-public-ipc-${id}`;
    resources.volumes.push(volume);
    await command(['volume', 'create', '--driver=local', '--opt=type=tmpfs', '--opt=device=tmpfs',
      '--opt=o=uid=1000,gid=1000,mode=0700,size=1m', '--label', PUBLIC_LABEL, volume], signal);
    const volumes = JSON.parse(await command(['volume', 'inspect', volume], signal));
    if (!Array.isArray(volumes) || volumes.length !== 1 || volumes[0].Driver !== 'local' || volumes[0].Options?.type !== 'tmpfs'
      || volumes[0].Options?.device !== 'tmpfs' || volumes[0].Options?.o !== 'uid=1000,gid=1000,mode=0700,size=1m') throw new Error('Unsafe socket volume');
    const names = { gateway: `kindpath-public-gateway-${id}`, browser: `kindpath-public-browser-${id}` };
    for (const role of ['gateway', 'browser'] as const) {
      resources.containers.push(names[role]);
      await command(args(names[role], volume, role, ns.id), signal);
      assertPublicIsolation(JSON.parse(await command(['inspect', names[role]], signal)), role, volume, ns.id);
    }
    await command(['start', names.gateway], signal);
    const raw = await command(['start', '--attach', names.browser], signal, 45_000);
    await firewallControl(command, resources, ns, 'verify', signal);
    return JSON.parse(raw);
  }, openSession);
  return (target: string, signal?: AbortSignal) => {
    if (target !== 'verify-public-isolation') return Promise.reject(new ScannerError('SCANNER_UNAVAILABLE', 'Public target execution is disabled during controlled firewall verification.'));
    return run(target, signal);
  };
}
export const runPublicWorker = createPublicWorkerRunner(openLocalDockerSession);
