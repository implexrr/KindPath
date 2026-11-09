import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createDestinationPlan } from './destinationSnapshot.js';
import type { DestinationPlan } from './destinationSnapshot.js';
import { IMAGE } from './containerPolicy.js';
import { openLocalDockerSession, ScannerError } from './dockerWorker.js';
import type { DockerSession } from './dockerWorker.js';
import { ALLOWED_PUBLIC_HOSTS, PUBLIC_LABEL, assertPublicIsolation } from './publicPolicy.js';
import { createResourceRunner } from './resources.js';
import { attachEgressNetwork, createFirewallContainer, firewallControl, prepareNamespace, PINNED_FIXTURE_IP } from './firewallDocker.js';

const profile = fileURLToPath(new URL('../../scanner/seccomp.json', import.meta.url));
function args(name: string, volume: string, role: 'browser' | 'gateway', namespace: string, plan?: DestinationPlan) {
  const browser = role === 'browser';
  return ['create', '--pull=never', '--rm', '--name', name, '--label', PUBLIC_LABEL,
    `--network=${browser ? 'none' : `container:${namespace}`}`, '--read-only', '--user=1000:1000', '--cap-drop=ALL',
    '--security-opt=no-new-privileges:true', ...(browser ? [`--security-opt=seccomp=${profile}`] : []),
    `--memory=${browser ? '512m' : '128m'}`, `--cpus=${browser ? '1' : '0.5'}`, `--pids-limit=${browser ? '256' : '64'}`,
    '--ipc=private', '--shm-size=128m', '--tmpfs=/tmp:rw,nosuid,nodev,noexec,size=134217728', '--init',
    `--mount=type=volume,src=${volume},dst=/run/kindpath,volume-nocopy${browser ? ',readonly' : ''}`,
    '--env=HOME=/tmp/kindpath-home', `--env=KINDPATH_ALLOWED_HOSTS=${JSON.stringify(ALLOWED_PUBLIC_HOSTS)}`,
    `--env=KINDPATH_PINNED_DESTINATIONS=${JSON.stringify(plan?.destinations ?? {})}`,
    '--entrypoint=node', IMAGE, ...(browser ? ['public-worker.mjs', plan?.target ?? 'verify-public-isolation'] : ['gateway/server.mjs'])];
}
const controlledTargets = new Map([['verify-pinned-scan','http://example.com/redirect'],
  ['verify-pinned-redirect','http://example.com/blocked-redirect'], ['verify-pinned-tls','https://example.com/barriers']]);

export function createPublicWorkerRunner(openSession: () => Promise<DockerSession>) {
  const run = createResourceRunner(async (command, resources, task, signal) => {
    const target = controlledTargets.get(task);
    const ns = await prepareNamespace(command, resources, signal, target ? 'pinned' : false);
    let plan: DestinationPlan | undefined;
    let originName: string | undefined;
    async function probe(phase: 'before' | 'after') {
      const worker = await createFirewallContainer(command, resources, `container:${ns.id}`, 'probe', ['firewall/probe.mjs', phase, 'pinned'], signal);
      const result = JSON.parse(await command(['start','--attach',worker.name], signal, 20000));
      if (result.phase !== phase || result.allowedConnections !== 2 || result.forbiddenConnections !== 5 || result.cannotAlterRules !== true) throw new Error('Invalid controlled egress proof');
    }
    if (target) {
      // Public-shaped IPs are bound to fixed origins on an isolated internal subnet. No real DNS or public target is used.
      for (const address of [PINNED_FIXTURE_IP, '93.184.216.36']) {
        const origin = await createFirewallContainer(command, resources, ns.network, 'origin', ['gateway/readiness-origin.mjs'], signal, address);
        await command(['start',origin.name],signal);
        if (address === PINNED_FIXTURE_IP) originName = origin.name;
      }
      plan = await createDestinationPlan(target, async () => [{address:PINNED_FIXTURE_IP,family:4}], signal);
      ns.addresses = [...plan.addresses];
      await probe('before');
    }
    await firewallControl(command, resources, ns, 'setup', signal);
    await firewallControl(command, resources, ns, 'verify', signal);
    if (plan) {
      await attachEgressNetwork(command,resources,ns,plan,signal);
      const before = await firewallControl(command,resources,ns,'verify',signal);
      await probe('after');
      const after = await firewallControl(command,resources,ns,'verify',signal);
      if (after.droppedPackets < before.droppedPackets + 5) throw new Error('Missing egress drop evidence');
    }
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
      await command(args(names[role], volume, role, ns.id, plan), signal);
      assertPublicIsolation(JSON.parse(await command(['inspect', names[role]], signal)), role, volume, ns.id);
    }
    await command(['start', names.gateway], signal);
    const raw = await command(['start', '--attach', names.browser], signal, 45_000);
    await firewallControl(command, resources, ns, 'verify', signal);
    const result = JSON.parse(raw);
    if (!plan) return result;
    const requests = (await command(['logs',originName!],signal)).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
    if (requests.some(request=>request.method !== 'GET' || !['/','/redirect','/barriers','/subresource-redirect'].includes(request.path))) throw new Error('Unexpected controlled origin request');
    return { result, requests, egressVerified: !!ns.egress };

  }, openSession);
  return (target: string, signal?: AbortSignal) => {
    if (target !== 'verify-public-isolation' && !controlledTargets.has(target)) return Promise.reject(new ScannerError('SCANNER_UNAVAILABLE', 'Public target execution is disabled during controlled firewall verification.'));
    return run(target, signal);
  };
}
export const runPublicWorker = createPublicWorkerRunner(openLocalDockerSession);
