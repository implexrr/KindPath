import { randomUUID } from 'node:crypto';
import type { Command } from './dockerWorker.js';
import type { Resources } from './resources.js';
import { IMAGE } from './containerPolicy.js';
import { PUBLIC_LABEL } from './publicPolicy.js';

export const FIREWALL_IMAGE = 'kindpath-firewall:local';
export const FIXTURE_IP = '198.18.0.2';
export type Namespace = { id: string; network: string; addresses: string[]; hash?: string };
export const memoryTmpfs = '/tmp:rw,nosuid,nodev,noexec,size=16777216';

export function firewallArguments(name: string, network: string, role: 'holder' | 'admin' | 'probe' | 'origin', args: string[]) {
  const admin = role === 'admin';
  if (admin && !/^container:[a-f0-9]{64}$/.test(network)) throw new Error('Firewall administration requires an owned container namespace');
  return ['create', '--pull=never', '--rm', '--name', name, '--label', PUBLIC_LABEL, `--network=${network}`,
    '--read-only', `--user=${admin ? '0:0' : '1000:1000'}`, '--cap-drop=ALL', ...(admin ? ['--cap-add=NET_ADMIN'] : []),
    '--security-opt=no-new-privileges:true', '--ipc=private', '--memory=128m', '--cpus=0.5', '--pids-limit=64',
    `--tmpfs=${memoryTmpfs}`, '--init', '--entrypoint=node', role === 'origin' ? IMAGE : FIREWALL_IMAGE, ...args];
}
export function assertFirewallContainer(value: unknown, network: string, admin: boolean) {
  const fail = () => { throw new Error('Firewall container isolation mismatch'); };
  if (!Array.isArray(value) || value.length !== 1 || (admin && !/^container:[a-f0-9]{64}$/.test(network))) return fail();
  const c = value[0]; const h = c?.HostConfig;
  if (!h || c.State?.Running !== false || c.Config?.User !== (admin ? '0:0' : '1000:1000')
    || h.NetworkMode !== network || h.Privileged !== false || h.ReadonlyRootfs !== true || h.AutoRemove !== true
    || !h.CapDrop?.includes('ALL') || JSON.stringify((h.CapAdd ?? []).map((cap: string) => cap.replace(/^CAP_/, ''))) !== JSON.stringify(admin ? ['NET_ADMIN'] : [])
    || !h.SecurityOpt?.some((s: string) => ['no-new-privileges', 'no-new-privileges:true'].includes(s))
    || h.IpcMode !== 'private' || (h.PidMode ?? '') !== '' || (c.Mounts ?? []).length
    || (h.Binds ?? []).length || (h.Devices ?? []).length || (h.DeviceRequests ?? []).length || (h.VolumesFrom ?? []).length
    || Object.keys(c.Config?.Volumes ?? {}).length || Object.keys(h.PortBindings ?? {}).length || h.PublishAllPorts
    || h.Memory !== 134217728 || h.NanoCpus !== 500000000 || h.PidsLimit !== 64
    || h.Tmpfs?.['/tmp'] !== memoryTmpfs.slice(5)) return fail();
}
export async function createFirewallContainer(command: Command, resources: Resources, network: string,
  role: 'holder' | 'admin' | 'probe' | 'origin', args: string[], signal: AbortSignal, address?: string) {
  const name = `kindpath-firewall-${role}-${randomUUID()}`;
  resources.containers.push(name); // Record ownership before a potentially interrupted create.
  const flags = firewallArguments(name, network, role, args);
  if (address) flags.splice(flags.indexOf('--read-only'), 0, `--ip=${address}`);
  await command(flags, signal);
  const inspect = JSON.parse(await command(['inspect', name], signal));
  assertFirewallContainer(inspect, network, role === 'admin');
  if (typeof inspect[0].Id !== 'string' || !/^[a-f0-9]{64}$/.test(inspect[0].Id)) throw new Error('Missing namespace identity');
  return { name, id: inspect[0].Id as string };
}
export async function prepareNamespace(command: Command, resources: Resources, signal: AbortSignal, fixture = false): Promise<Namespace> {
  const network = `kindpath-firewall-${randomUUID()}`;
  resources.networks.push(network);
  await command(['network', 'create', '--driver=bridge', '--internal', '--ipv6=false',
    '--opt=com.docker.network.bridge.gateway_mode_ipv4=isolated', '--label', PUBLIC_LABEL,
    ...(fixture ? ['--subnet=198.18.0.0/24'] : []), network], signal);
  const info = JSON.parse(await command(['network', 'inspect', network], signal));
  const n = info?.[0];
  if (info.length !== 1 || n.Name !== network || n.Driver !== 'bridge' || n.Internal !== true || n.EnableIPv6 !== false
    || n.Options?.['com.docker.network.bridge.gateway_mode_ipv4'] !== 'isolated'
    || (fixture && n.IPAM?.Config?.[0]?.Subnet !== '198.18.0.0/24')) throw new Error('Unsafe firewall network');
  const holder = await createFirewallContainer(command, resources, network, 'holder', ['firewall/control.mjs', fixture ? 'hold-fixture' : 'hold'], signal, fixture ? '198.18.0.3' : undefined);
  await command(['start', holder.name], signal);
  return { id: holder.id, network, addresses: fixture ? [FIXTURE_IP] : [] };
}
export async function firewallControl(command: Command, resources: Resources, ns: Namespace, task: 'setup' | 'verify', signal: AbortSignal) {
  const helper = await createFirewallContainer(command, resources, `container:${ns.id}`, 'admin',
    ['firewall/control.mjs', task, JSON.stringify(ns.addresses), ...(task === 'verify' ? [ns.hash ?? ''] : [])], signal);
  const proof = JSON.parse(await command(['start', '--attach', helper.name], signal));
  if (!/^[a-f0-9]{64}$/.test(proof?.policyHash) || !Number.isSafeInteger(proof?.droppedPackets) || proof.droppedPackets < 0
    || (task === 'verify' && proof.policyHash !== ns.hash)) throw new Error('Invalid firewall verification');
  ns.hash = proof.policyHash;
  return proof as { policyHash: string; droppedPackets: number };
}
