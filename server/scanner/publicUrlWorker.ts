import { createDestinationPlan, validateDestinationPlan } from './destinationSnapshot.js';
import type { DestinationPlan } from './destinationSnapshot.js';
import { openLocalDockerSession, ScannerError } from './dockerWorker.js';
import type { DockerSession } from './dockerWorker.js';
import { PUBLIC_SCANNING_ENABLED, PUBLIC_CAPTURE_ENABLED, validatePublicUrl } from './publicPolicy.js';
import { createResourceRunner } from './resources.js';
import { prepareNamespace } from './firewallDocker.js';
import type { Namespace } from './firewallDocker.js';
import type { Command } from './dockerWorker.js';
import type { Resources } from './resources.js';
import { preparePublicEgress, scanInNamespace } from './publicTransport.js';

interface Dependencies {
  enabled?: () => boolean;
  captureEnabled?: () => boolean;
  planTarget?: (target: string, signal: AbortSignal) => Promise<DestinationPlan>;
  prepareNetwork?: (command: Command, resources: Resources, signal: AbortSignal) => Promise<Namespace>;
  openSession?: () => Promise<DockerSession>;
}
// Dependencies are supplied by local tests, never by HTTP requests or environment variables.
export function createPublicUrlWorkerRunner({
  enabled = () => PUBLIC_SCANNING_ENABLED,
  captureEnabled = () => PUBLIC_CAPTURE_ENABLED,
  planTarget = (target, signal) => createDestinationPlan(target, undefined, signal),
  openSession = openLocalDockerSession,
  prepareNetwork = prepareNamespace,
}: Dependencies = {}) {
  const run = createResourceRunner(async (command, resources, target, signal, session) => {
    signal.throwIfAborted();
    // DNS and the entire Docker operation share admission, cancellation and the 60-second deadline.
    const plan = validateDestinationPlan(await planTarget(target, signal));
    if (plan.target !== target) throw new Error('Destination plan did not match the requested URL');
    signal.throwIfAborted();
    const ns = await prepareNetwork(command, resources, signal);
    await preparePublicEgress(command, resources, ns, plan, signal);
    if (!session.exchange) throw new Error('Owned gateway channel unavailable');
    return scanInNamespace(command, resources, ns, plan, signal, captureEnabled(), {exchange:session.exchange,planTarget});
  }, openSession);
  return async (value: unknown, signal?: AbortSignal): Promise<unknown> => {
    // Independent of the HTTP gate: direct use of the default URL runner is also disabled.
    if (!enabled()) throw new ScannerError('SCANNER_UNAVAILABLE', 'Public URL scanning is disabled pending security review.');
    const target = validatePublicUrl(value); // Invalid URLs cannot open Docker or perform DNS.
    signal?.throwIfAborted();
    return run(target, signal);
  };
}
export const runPublicUrlWorker = createPublicUrlWorkerRunner();
