import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResourceRunner } from './resources.js';
import { ScannerError } from './dockerWorker.js';
import type { Resources } from './resources.js';
import type { Command } from './dockerWorker.js';

function daemon() {
  const containers = new Set<string>(); const volumes = new Set<string>(); const networks = new Set<string>();
  let removalFails: 'volume' | 'network' | undefined;
  let absenceQueryFails = false; let partialCreate = false; let startFails = false; let created = 0;
  const command: Command = async args => {
    if (args[0] === 'volume' || args[0] === 'network') {
      const kind = args[0]; const set = kind === 'volume' ? volumes : networks;
      if (args[1] === 'create') { set.add(args.at(-1)!); if (partialCreate) throw Error('Interrupted create'); return ''; }
      if (args[1] === 'ls') {
        if (absenceQueryFails && args.at(-1)!.startsWith('name=')) throw Error('Daemon absence query failed');
        return [...set].filter(name => args.at(-1)!.startsWith('label=') || args.at(-1) === `name=^${name}$`).join('\n');
      }
      if (args[1] === 'rm') { if (removalFails === kind) throw Error('Removal failed'); set.delete(args[2]); return ''; }
    }
    if (args[0] === 'create') { containers.add(args.at(-1)!); created++; return ''; }
    if (args[0] === 'start') { if (startFails) throw Error('Cancelled worker'); return '{}'; }
    if (args[0] === 'rm') { containers.delete(args[2]); return ''; }
    if (args[0] === 'ps') {
      const filter = args.at(-1)!;
      if (filter.startsWith('name=')) return [...containers].filter(name => filter === `name=^/${name}$`).join('\n');
      return filter === 'label=kindpath.scanner=public' ? [...containers].join('\n') : '';
    }
    throw Error('Unexpected daemon command');
  };
  let sequence = 0;
  const operation = async (cmd: Command, resources: Resources) => {
    const id = ++sequence;
    const network = `owned-network-${id}`; resources.networks.push(network); await cmd(['network', 'create', network]);
    const volume = `owned-volume-${id}`; resources.volumes.push(volume); await cmd(['volume', 'create', volume]);
    for (const role of ['gateway', 'browser']) {
      const name = `${role}-${id}`; resources.containers.push(name); await cmd(['create', name]);
    }
    return JSON.parse(await cmd(['start', '--attach', `browser-${id}`]));
  };
  const session = async () => ({ command, dispose: async () => {} });
  return {
    run: createResourceRunner(operation, session), restart: () => createResourceRunner(operation, session),
    volumes, containers, networks, get created() { return created; },
    set removalFails(value: typeof removalFails) { removalFails = value; },
    set absenceQueryFails(value: boolean) { absenceQueryFails = value; },
    set partialCreate(value: boolean) { partialCreate = value; },
    set startFails(value: boolean) { startFails = value; },
  };
}
const failed = (error: unknown) => error instanceof ScannerError && error.code === 'SCANNER_CLEANUP_FAILED';
for (const kind of ['volume', 'network'] as const) {
  test(`unconfirmed ${kind} removal suppresses results and blocks work until recovery`, async () => {
    const docker = daemon(); docker.removalFails = kind;
    await assert.rejects(docker.run('fixture'), failed);
    assert.equal(docker.containers.size, 0);
    await assert.rejects(docker.run('fixture'), failed); assert.equal(docker.created, 2);
    docker.removalFails = undefined; await docker.run('fixture');
    assert.equal(docker.created, 4); assert.equal(docker.volumes.size, 0); assert.equal(docker.networks.size, 0);
  });
  test(`restart blocks unknown orphan ${kind}s without deleting user resources`, async () => {
    const docker = daemon(); docker.removalFails = kind;
    await assert.rejects(docker.run('fixture'), failed);
    await assert.rejects(docker.restart()('fixture'), failed);
    assert.equal(docker.created, 2); assert.equal(kind === 'volume' ? docker.volumes.size : docker.networks.size, 1);
    docker.removalFails = undefined; await docker.run('fixture');
  });
}
test('successful removal is insufficient when a resource absence query fails', async () => {
  const docker = daemon(); docker.absenceQueryFails = true;
  await assert.rejects(docker.run('fixture'), failed);
  await assert.rejects(docker.run('fixture'), failed); assert.equal(docker.created, 2);
  docker.absenceQueryFails = false; await docker.run('fixture');
});
test('interrupted network creation is cleaned before another worker is admitted', async () => {
  const docker = daemon(); docker.partialCreate = true;
  await assert.rejects(docker.run('fixture'));
  assert.equal(docker.networks.size, 0); assert.equal(docker.created, 0);
  docker.partialCreate = false; await docker.run('fixture');
});
test('worker cancellation plus network cleanup failure blocks subsequent work', async () => {
  const docker = daemon(); docker.startFails = true; docker.removalFails = 'network';
  await assert.rejects(docker.run('fixture'), failed);
  await assert.rejects(docker.run('fixture'), failed); assert.equal(docker.created, 2);
  docker.startFails = false; docker.removalFails = undefined; await docker.run('fixture');
});
