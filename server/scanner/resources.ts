import { classifyFailure } from '../../scanner/gateway/diagnostics.mjs';
import { reserveScanner } from './admission.js';
import { openLocalDockerSession, removeAndConfirm, ScannerError } from './dockerWorker.js';
import type { Command, DockerSession } from './dockerWorker.js';
import { PUBLIC_LABEL } from './publicPolicy.js';

export type Resources = { containers: string[]; volumes: string[]; networks: string[] };
const failure = () => new ScannerError('SCANNER_CLEANUP_FAILED', 'Scanner resource cleanup could not be verified. No new worker will start until Docker confirms cleanup.', {stage:'cleanup',code:'UNCONFIRMED'});
export async function cleanResources(command: Command, resources: Resources) {
  let failed = false;
  for (const name of [...resources.containers].reverse()) {
    try { await removeAndConfirm(command, name); } catch { failed = true; }
  }
  if (failed) throw failure();
  for (const [kind, names] of [['volume', resources.volumes], ['network', resources.networks]] as const) {
    for (const name of names) {
      let absent = false;
      for (let i = 0; i < 2; i++) {
        try { await command([kind, 'rm', name], undefined, 3000); } catch { /* Require an absence query. */ }
        try {
          const value = await command([kind, 'ls', '--quiet', '--filter', `name=^${name}$`], undefined, 3000);
          if (!value.trim()) { absent = true; break; }
        } catch { /* An unavailable daemon is not successful cleanup. */ }
      }
      if (!absent) failed = true;
    }
  }
  if (failed) throw failure();
}
export function createResourceRunner(
  operation: (command: Command, resources: Resources, task: string, signal: AbortSignal, session: DockerSession) => Promise<unknown>,
  openSession: () => Promise<DockerSession> = openLocalDockerSession,
) {
  let pending: Resources | undefined;
  return async (task: string, signal?: AbortSignal): Promise<unknown> => {
    const release = reserveScanner();
    if (!release) throw new ScannerError('SCANNER_BUSY', 'A scan is already running.');
    const deadline = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(60_000)]);
    let session: DockerSession | undefined;
    let owned: Resources | undefined;
    try {
      session = await openSession();
      if (pending) { await cleanResources(session.command, pending); pending = undefined; }
      for (const args of [
        ['ps', '--all', '--quiet', '--filter', `label=${PUBLIC_LABEL}`],
        ['volume', 'ls', '--quiet', '--filter', `label=${PUBLIC_LABEL}`],
        ['network', 'ls', '--quiet', '--filter', `label=${PUBLIC_LABEL}`],
        ['ps', '--all', '--quiet', '--filter', 'label=kindpath.scanner=fixture'],
      ]) if ((await session.command(args, deadline)).trim()) throw failure();
      owned = { containers: [], volumes: [], networks: [] };
      pending = owned;
      return await operation(session.command, owned, task, deadline, session);
    } catch (error) {
      if (error instanceof ScannerError) throw error;
      throw new ScannerError('SCAN_FAILED', 'The isolated firewall operation failed. No report was produced.', classifyFailure(error,'network-setup',deadline));
    } finally {
      try { if (owned && session) { await cleanResources(session.command, owned); pending = undefined; } }
      finally { try { await session?.dispose(); } finally { release(); } }
    }
  };
}
