import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerRunner, removeAndConfirm, ScannerError, settleResourceCreates } from './dockerWorker.js';

// Simulates the daemon, including failures after a container has been created.
function fakeDocker() {
  const containers = new Set<string>();
  const calls: string[][] = [];
  let daemonDown = false;
  let failRemovals = 0;
  let autoRemove = false;
  let failStart = false;
  let failCreate = false;
  let failVerification = false;
  let publicVolume = false;
  let volumeQueryFails = false;
  let publicNetwork = false;
  let networkQueryFails = false;
  const command = async (args: string[]) => {
    calls.push(args);
    if (daemonDown) throw new Error('Daemon unavailable');
    const name = args[args.indexOf('--name') + 1];
    switch (args[0]) {
      case 'version': return 'test';
      case 'create':
        assert.equal(containers.size, 0, 'A worker was created before leftover cleanup');
        containers.add(name);
        if (failCreate) throw new Error('Interrupted create response');
        return name;
      case 'inspect': return JSON.stringify([{
        Config: { User: '1000:1000' }, State: { Running: false }, Mounts: [], HostConfig: {
          NetworkMode: 'none', ReadonlyRootfs: true, Privileged: false, AutoRemove: true,
          IpcMode: 'private', Memory: 536870912, NanoCpus: 1000000000, PidsLimit: 256,
          CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges:true', 'seccomp={"defaultAction":"SCMP_ACT_ERRNO"}'],
          Tmpfs: { '/tmp': 'rw,nosuid,nodev,noexec,size=134217728' },
        },
      }]);
      case 'start':
        if (autoRemove) containers.delete(args[2]);
        if (failStart) { daemonDown = true; throw new Error('Scan aborted and daemon disconnected'); }
        if (failRemovals === -1) daemonDown = true;
        return '{"isolation":"passed"}';
      case 'rm':
        if (failRemovals > 0) { failRemovals--; throw new Error('Temporary removal failure'); }
        if (!containers.delete(args[2])) throw new Error('Container already removed');
        return args[2];
      case 'network':
        if (networkQueryFails) throw new Error('Cannot inspect networks');
        return publicNetwork ? 'orphaned-firewall-network' : '';
      case 'volume':
        assert.deepEqual(args.slice(0, 3), ['volume', 'ls', '--quiet']);
        if (volumeQueryFails) throw new Error('Cannot inspect volumes');
        return publicVolume ? 'orphaned-public-socket' : '';
      case 'ps':
        if (failVerification && args.some(arg => arg.startsWith('name='))) throw new Error('Cannot verify absence');
        return [...containers].join('\n');
      default: throw new Error('Unexpected command');
    }
  };
  const run = createWorkerRunner(async () => ({ command, dispose: async () => {} }));
  return {
    run, calls, containers,
    set publicNetwork(value: boolean) { publicNetwork = value; },
    set networkQueryFails(value: boolean) { networkQueryFails = value; },
    set publicVolume(value: boolean) { publicVolume = value; },
    set volumeQueryFails(value: boolean) { volumeQueryFails = value; },
    newRunner: () => createWorkerRunner(async () => ({ command, dispose: async () => {} })),
    set down(value: boolean) { daemonDown = value; },
    set removalFailures(value: number) { failRemovals = value; },
    set removesItself(value: boolean) { autoRemove = value; },
    set startFails(value: boolean) { failStart = value; },
    set createFails(value: boolean) { failCreate = value; },
    set verificationFails(value: boolean) { failVerification = value; },
  };
}
function cleanupFailed(error: unknown): boolean {
  return error instanceof ScannerError && error.code === 'SCANNER_CLEANUP_FAILED';
}

test('cleanup failure suppresses success and blocks new containers until daemon recovery', async () => {
  const docker = fakeDocker();
  docker.removalFailures = -1; // Disconnect immediately after successful start output.
  await assert.rejects(docker.run('verify-isolation'), cleanupFailed);
  assert.equal(docker.containers.size, 1);
  await assert.rejects(docker.run('clear'), cleanupFailed);
  assert.equal(docker.calls.filter(args => args[0] === 'create').length, 1);
  docker.down = false;
  docker.removalFailures = 0;
  assert.deepEqual(await docker.run('verify-isolation'), { isolation: 'passed' });
  assert.equal(docker.containers.size, 0);
  const creates = docker.calls.flatMap((args, index) => args[0] === 'create' ? [index] : []);
  assert.ok(docker.calls.slice(creates[0] + 1, creates[1]).some(args => args[0] === 'ps'));
});
test('a successful rm is insufficient if absence cannot be verified', async () => {
  const docker = fakeDocker();
  docker.verificationFails = true;
  await assert.rejects(docker.run('verify-isolation'), cleanupFailed);
  assert.equal(docker.calls.filter(args => args[0] === 'rm').length, 2);
  assert.equal(docker.calls.filter(args => args[0] === 'ps' && args.some(arg => arg.startsWith('name='))).length, 12);
  await assert.rejects(docker.run('clear'), cleanupFailed);
  assert.equal(docker.calls.filter(args => args[0] === 'create').length, 1);
});
test('already auto-removed container is harmless only after successful absence verification', async () => {
  const docker = fakeDocker(); docker.removesItself = true;
  assert.deepEqual(await docker.run('verify-isolation'), { isolation: 'passed' });
  assert.equal(docker.containers.size, 0);
  assert.equal(docker.calls.at(-1)?.[0], 'ps');
});
test('transient removal failure retries and confirms absence before returning a report', async () => {
  const docker = fakeDocker(); docker.removalFailures = 1;
  assert.deepEqual(await docker.run('verify-isolation'), { isolation: 'passed' });
  assert.equal(docker.calls.filter(args => args[0] === 'rm').length, 2);
  assert.equal(docker.containers.size, 0);
});
test('cancellation plus cleanup failure remains blocked until cleanup can be verified', async () => {
  const docker = fakeDocker(); docker.startFails = true;
  await assert.rejects(docker.run('barriers'), cleanupFailed);
  await assert.rejects(docker.run('clear'), cleanupFailed);
  assert.equal(docker.calls.filter(args => args[0] === 'create').length, 1);
});
test('partially completed create is also removed and verified', async () => {
  const docker = fakeDocker(); docker.createFails = true;
  await assert.rejects(docker.run('barriers'), (error: unknown) => error instanceof ScannerError && error.code === 'SCANNER_UNAVAILABLE');
  assert.equal(docker.containers.size, 0);
  assert.equal(docker.calls.at(-1)?.[0], 'ps');
});

test('a fresh runner refuses orphaned workers after losing in-memory lifecycle state', async () => {
  const docker = fakeDocker(); docker.removalFailures = -1;
  await assert.rejects(docker.run('verify-isolation'), cleanupFailed);
  docker.down = false;
  const restarted = docker.newRunner();
  await assert.rejects(restarted('clear'), cleanupFailed);
  assert.equal(docker.calls.filter(args => args[0] === 'create').length, 1);
  assert.equal(docker.containers.size, 1, 'The restarted runner must not delete an unknown worker');
  docker.removalFailures = 0;
  await docker.run('verify-isolation');
  assert.equal(docker.containers.size, 0);
});

test('fixture scans cannot bypass an orphaned public socket volume', async () => {
  const docker = fakeDocker();
  docker.publicVolume = true;
  await assert.rejects(docker.run('clear'), cleanupFailed);
  await assert.rejects(docker.newRunner()('clear'), cleanupFailed);
  assert.equal(docker.calls.filter(args => args[0] === 'create').length, 0);
  assert.equal(docker.calls.some(args => args[0] === 'volume' && args[1] === 'rm'), false);
  docker.publicVolume = false;
  assert.deepEqual(await docker.run('verify-isolation'), { isolation: 'passed' });
});
test('fixture scans fail closed if public volume absence cannot be checked', async () => {
  const docker = fakeDocker();
  docker.volumeQueryFails = true;
  await assert.rejects(docker.run('clear'));
  assert.equal(docker.calls.filter(args => args[0] === 'create').length, 0);
  docker.volumeQueryFails = false;
  await docker.run('clear');
});

test('fixture admission blocks orphaned firewall networks and unconfirmed network queries', async () => {
  const docker = fakeDocker(); docker.publicNetwork = true;
  await assert.rejects(docker.run('clear'), cleanupFailed);
  assert.equal(docker.calls.some(args => args[0] === 'create' || (args[0] === 'network' && args[1] === 'rm')), false);
  docker.publicNetwork = false; docker.networkQueryFails = true;
  await assert.rejects(docker.run('clear'), cleanupFailed);
  assert.equal(docker.calls.some(args => args[0] === 'create'), false);
  docker.networkQueryFails = false; await docker.run('clear');
});


test('cancelled resource creation settles before cleanup can confirm absence', async () => {
  for (const args of [['create', '--name', 'owned-container'], ['network', 'create', 'owned-network'], ['volume', 'create', 'owned-volume']]) {
    const abort = new AbortController();
    let finish: () => void = () => {};
    let present = false, settled = false;
    const raw = async (_args: string[], signal?: AbortSignal, timeout?: number) => {
      assert.equal(timeout, 3000, 'Creation keeps its bounded command timeout');
      await new Promise<void>((resolve, reject) => {
        finish = () => { present = true; resolve(); };
        signal?.addEventListener('abort', () => reject(new Error('CLI aborted before daemon acknowledgement')), {once:true});
      });
      return 'owned-resource';
    };
    const command = settleResourceCreates(raw);
    const pending = command(args, abort.signal, 3000).finally(() => { settled = true; });
    const rejection = assert.rejects(pending, error => error === abort.signal.reason);
    abort.abort();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(settled, false, 'Cleanup cannot race a still-pending daemon create');
    finish();
    await rejection;
    assert.equal(present, true, 'The owned resource exists before cancellation is delivered to cleanup');
  }
});
test('already cancelled Docker work never dispatches and attached runs remain abortable', async () => {
  const abort = new AbortController(); abort.abort();
  let calls = 0;
  const command = settleResourceCreates(async () => { calls++; return ''; });
  await assert.rejects(command(['create'], abort.signal)); assert.equal(calls, 0);
  const attached = new AbortController();
  const running = settleResourceCreates(async (_args, signal) => {
    assert.equal(signal, attached.signal);
    return new Promise<string>((_resolve, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), {once:true}));
  })(['start', '--attach', 'owned-container'], attached.signal);
  const rejected = assert.rejects(running, error => error === attached.signal.reason);
  attached.abort(); await rejected;
});

test('asynchronous auto-removal must settle and be verified before cleanup returns', async () => {
  let queries=0, removals=0;
  await removeAndConfirm(async args=>{
    if(args[0]==='rm'){removals++;throw new Error('Removal in progress');}
    assert.equal(args[0],'ps');
    return ++queries<5 ? 'owned-container' : '';
  },'owned-container');
  assert.equal(removals,2);assert.equal(queries,5);
});
