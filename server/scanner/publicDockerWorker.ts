import { createDestinationPlan } from './destinationSnapshot.js';
import type { DestinationPlan } from './destinationSnapshot.js';
import { openLocalDockerSession, ScannerError } from './dockerWorker.js';
import type { DockerSession } from './dockerWorker.js';
import { preparePublicEgress, scanInNamespace } from './publicTransport.js';
import { createResourceRunner } from './resources.js';
import { createFirewallContainer, firewallControl, prepareNamespace, PINNED_FIXTURE_IP } from './firewallDocker.js';

const controlledTargets = new Map([['verify-pinned-scan','http://example.com/barriers'],
  ['verify-pinned-redirect','http://example.com/blocked-redirect'], ['verify-pinned-tls','https://example.com/barriers'], ['verify-pinned-moving','http://example.com/moving']]);

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
    if (plan) {
      await preparePublicEgress(command, resources, ns, plan, signal);
      const before = await firewallControl(command,resources,ns,'verify',signal);
      await probe('after');
      const after = await firewallControl(command,resources,ns,'verify',signal);
      if (after.droppedPackets < before.droppedPackets + 5) throw new Error('Missing egress drop evidence');
    }
    if (!plan) {
      await firewallControl(command, resources, ns, 'setup', signal);
      await firewallControl(command, resources, ns, 'verify', signal);
    }
    const result = await scanInNamespace(command, resources, ns, plan, signal);
    if (!plan) return result;
    const requests = (await command(['logs',originName!],signal)).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
    if (requests.some(request=>request.method !== 'GET' || !['/','/redirect','/barriers','/subresource-redirect','/moving'].includes(request.path))) throw new Error('Unexpected controlled origin request');
    return { result, requests, egressVerified: !!ns.egress };

  }, openSession);
  return (target: string, signal?: AbortSignal) => {
    if (target !== 'verify-public-isolation' && !controlledTargets.has(target)) return Promise.reject(new ScannerError('SCANNER_UNAVAILABLE', 'Public target execution is disabled during controlled firewall verification.'));
    return run(target, signal);
  };
}
export const runPublicWorker = createPublicWorkerRunner(openLocalDockerSession);
