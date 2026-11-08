import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertContainerIsolation, containerArguments, isFixture } from './containerPolicy.js';
import { reserveScanner } from './admission.js';
import type { FixtureId } from './containerPolicy.js';

const exec = promisify(execFile);
const profile = fileURLToPath(new URL('../../scanner/seccomp.json', import.meta.url));
type WorkerTask = FixtureId | 'verify-isolation';
export type Command = (args: string[], signal?: AbortSignal, timeout?: number) => Promise<string>;
export interface DockerSession { command: Command; dispose: () => Promise<void> }

export class ScannerError extends Error {
  constructor(public code: 'SCANNER_BUSY' | 'SCANNER_UNAVAILABLE' | 'SCAN_FAILED' | 'SCANNER_CLEANUP_FAILED', message: string) { super(message); }
}
function cleanupError(): ScannerError {
  return new ScannerError('SCANNER_CLEANUP_FAILED', 'Scanner cleanup could not be confirmed. No report was produced. Restore Docker Desktop and retry; new workers remain blocked until cleanup is verified.');
}

export async function removeAndConfirm(command: Command, name: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    // A removal error may mean --rm already removed it, but must never be assumed harmless.
    try { await command(['rm', '--force', name], undefined, 3000); } catch { /* Verify with the daemon below. */ }
    try {
      const remaining = await command(['ps', '--all', '--quiet', '--filter', `name=^/${name}$`], undefined, 3000);
      if (!remaining.trim()) return;
    } catch { /* An unavailable daemon cannot confirm containment cleanup. */ }
  }
  throw cleanupError();
}

// Keep lifecycle state independent of CLI wiring so failure paths can be tested without Docker.
export function createWorkerRunner(openSession: () => Promise<DockerSession>) {
  let active = false;
  let pendingContainer: string | undefined;
  return async (task: WorkerTask, signal?: AbortSignal): Promise<unknown> => {
    if (!isFixture(task) && task !== 'verify-isolation') throw new Error('Unknown fixture.');
    if (active) throw new ScannerError('SCANNER_BUSY', 'A fixture scan is already running. Try again shortly.');
    const release = reserveScanner();
    if (!release) throw new ScannerError('SCANNER_BUSY', 'A scan is already running.');
    active = true;
    signal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(45_000)]);
    let session: DockerSession | undefined;
    let name: string | undefined;
    let created = false;
    try {
      session = await openSession();
      await session.command(['version', '--format', '{{.Server.Version}}'], signal);
      if (pendingContainer) {
        // After a previous failure, confirm removal before creating another worker.
        await removeAndConfirm(session.command, pendingContainer);
        pendingContainer = undefined;
      }
      // Also fail closed after an API restart, when an old worker name is no longer in memory.
      const leftovers = await session.command(['ps', '--all', '--quiet', '--filter', 'label=kindpath.scanner=fixture'], signal);
      if (leftovers.trim()) throw cleanupError();
      if ((await session.command(['ps', '--all', '--quiet', '--filter', 'label=kindpath.scanner=public'], signal)).trim()) throw cleanupError();
      name = `kindpath-fixture-${randomUUID()}`;
      pendingContainer = name;
      await session.command(containerArguments(name, profile, task), signal);
      created = true;
      assertContainerIsolation(JSON.parse(await session.command(['inspect', name], signal)));
      const stdout = await session.command(['start', '--attach', name], signal, 40_000);
      return JSON.parse(stdout);
    } catch (error) {
      if (error instanceof ScannerError) throw error;
      if (pendingContainer && !name) throw cleanupError();
      throw new ScannerError(created ? 'SCAN_FAILED' : 'SCANNER_UNAVAILABLE', created
        ? 'The isolated fixture scan failed. No report was produced.'
        : 'The isolated scanner is unavailable. Start Docker Desktop and build the scanner image; no host-browser fallback is used.');
    } finally {
      try {
        if (name && session) {
          // A failed verification overrides any successful result and retains the pending name.
          await removeAndConfirm(session.command, name);
          pendingContainer = undefined;
        }
      } finally {
        try { await session?.dispose(); } finally { active = false; release(); }
      }
    }
  };
}

export async function openLocalDockerSession(): Promise<DockerSession> {
  const docker = process.platform === 'darwin'
    ? '/Applications/Docker.app/Contents/Resources/bin/docker' : '/usr/bin/docker';
  // Explicit local socket: ignore DOCKER_HOST/contexts and never forward host credentials.
  const socket = process.platform === 'darwin' ? join(homedir(), '.docker/run/docker.sock') : '/var/run/docker.sock';
  if (!(await stat(socket)).isSocket()) throw new Error('Local engine unavailable');
  const config = await mkdtemp(join(tmpdir(), 'kindpath-docker-'));
  const prefix = ['--config', config, '--host', `unix://${socket}`];
  return {
    command: async (args, signal, timeout = 10_000) => {
      const { stdout } = await exec(docker, [...prefix, ...args], {
        env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
        timeout, maxBuffer: 1024 * 1024, signal,
      });
      return stdout;
    },
    dispose: () => rm(config, { recursive: true, force: true }),
  };
}

export const runIsolatedWorker = createWorkerRunner(openLocalDockerSession);
