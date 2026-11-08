import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFirewallContainer, firewallArguments, prepareNamespace, firewallControl } from './firewallDocker.js';
import { createPublicWorkerRunner } from './publicDockerWorker.js';

test('NET_ADMIN belongs only to the short-lived setup role inside an explicit namespace', () => {
  assert.throws(() => firewallArguments('owned', 'host', 'admin', []));
  assert.throws(() => firewallArguments('owned', 'bridge', 'admin', []));
  const namespace = `container:${'a'.repeat(64)}`;
  for (const role of ['holder', 'admin', 'origin', 'probe'] as const) {
    const flags = firewallArguments('owned', namespace, role, []);
    assert.equal(flags.includes('--cap-add=NET_ADMIN'), role === 'admin');
    assert.equal(flags.some(flag => flag.includes('SYS_ADMIN') || flag.includes('privileged') || flag === '--network=host'), false);
    assert.ok(flags.includes('--cap-drop=ALL')); assert.ok(flags.includes('--read-only'));
  }
  const config = { State: { Running: false }, Config: { User: '0:0' }, Mounts: [], HostConfig: {
    NetworkMode: namespace, Privileged: false, ReadonlyRootfs: true, AutoRemove: true, CapDrop: ['ALL'], CapAdd: ['CAP_NET_ADMIN'],
    SecurityOpt: ['no-new-privileges:true'], IpcMode: 'private', Memory: 134217728, NanoCpus: 500000000, PidsLimit: 64,
    Tmpfs: { '/tmp': 'rw,nosuid,nodev,noexec,size=16777216' },
  } };
  assert.doesNotThrow(() => assertFirewallContainer([config], namespace, true));
  for (const mutate of [
    (c: any) => { c.HostConfig.NetworkMode = 'host'; },
    (c: any) => { c.HostConfig.CapAdd.push('SYS_ADMIN'); },
    (c: any) => { c.Mounts.push({ Type: 'bind', Destination: '/host' }); },
    (c: any) => { c.HostConfig.Privileged = true; },
    (c: any) => { c.HostConfig.Tmpfs['/tmp'] = 'rw,exec'; },
  ]) { const copy = structuredClone(config); mutate(copy); assert.throws(() => assertFirewallContainer([copy], namespace, true)); }
  assert.throws(() => assertFirewallContainer([config], namespace, false));
});
test('a public URL cannot open Docker or DNS during controlled verification', async () => {
  let opened = false;
  const run = createPublicWorkerRunner(async () => { opened = true; throw new Error('Must not open'); });
  await assert.rejects(run('https://example.com/'), /disabled/); assert.equal(opened, false);
});
test('unsafe internal network inspection aborts before creating a namespace holder', async () => {
  const calls: string[][] = [];
  await assert.rejects(prepareNamespace(async args => {
    calls.push(args);
    if (args[0] === 'network' && args[1] === 'create') return '';
    return JSON.stringify([{ Name: args.at(-1), Driver: 'bridge', Internal: false, EnableIPv6: false }]);
  }, { containers: [], networks: [], volumes: [] }, AbortSignal.timeout(1000)));
  assert.equal(calls.some(args => args[0] === 'create'), false);
});
test('a failed firewall helper cannot be treated as verified', async () => {
  const resources = { containers: [], networks: [], volumes: [] };
  await assert.rejects(firewallControl(async () => { throw new Error('Setup interrupted'); }, resources,
    { id: 'a'.repeat(64), network: 'owned', addresses: [] }, 'setup', AbortSignal.timeout(1000)));
  assert.equal(resources.containers.length, 1, 'Partial helper creation remains owned for cleanup');
});

for (const failure of ['setup', 'verify']) {
  test(`a ${failure} failure prevents gateway/browser creation and cleans the namespace`, async () => {
    const calls: string[][] = []; const containers = new Map<string, string[]>(); const networks = new Set<string>();
    const command = async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'ps') {
        const name = args.at(-1)!;
        return [...containers.keys()].filter(key => name === `name=^/${key}$` || name === 'label=kindpath.scanner=public').join('\n');
      }
      if (args[0] === 'volume') return '';
      if (args[0] === 'network') {
        if (args[1] === 'create') { networks.add(args.at(-1)!); return ''; }
        if (args[1] === 'rm') { networks.delete(args[2]); return ''; }
        if (args[1] === 'ls') return [...networks].join('\n');
        return JSON.stringify([{ Name: args[2], Driver: 'bridge', Internal: true, EnableIPv6: false, Options: { 'com.docker.network.bridge.gateway_mode_ipv4': 'isolated' } }]);
      }
      if (args[0] === 'create') { containers.set(args[args.indexOf('--name') + 1], args); return ''; }
      if (args[0] === 'rm') { containers.delete(args[2]); return ''; }
      if (args[0] === 'inspect') {
        const flags = containers.get(args[1])!; const admin = flags.includes('--cap-add=NET_ADMIN');
        return JSON.stringify([{ Id: 'a'.repeat(64), State: { Running: false }, Config: { User: admin ? '0:0' : '1000:1000' }, Mounts: [],
          HostConfig: { NetworkMode: flags.find(flag => flag.startsWith('--network='))!.slice(10),
            Privileged: false, ReadonlyRootfs: true, AutoRemove: true, CapDrop: ['ALL'], CapAdd: admin ? ['CAP_NET_ADMIN'] : [],
            SecurityOpt: ['no-new-privileges:true'], IpcMode: 'private', Memory: 134217728, NanoCpus: 500000000, PidsLimit: 64,
            Tmpfs: { '/tmp': 'rw,nosuid,nodev,noexec,size=16777216' } } }]);
      }
      if (args[0] === 'start') {
        if (args[1] !== '--attach') return '';
        const flags = containers.get(args[2])!;
        if (flags.includes('setup') && failure === 'setup') throw Error('nftables setup unavailable');
        return JSON.stringify({ policyHash: (flags.includes('verify') ? 'b' : 'a').repeat(64), droppedPackets: 0 });
      }
      throw Error('Unexpected command');
    };
    const run = createPublicWorkerRunner(async () => ({ command, dispose: async () => {} }));
    await assert.rejects(run('verify-public-isolation'));
    assert.equal(calls.some(args => args.includes('gateway/server.mjs') || args.includes('public-worker.mjs')), false);
    assert.equal(containers.size, 0); assert.equal(networks.size, 0);
  });
}
