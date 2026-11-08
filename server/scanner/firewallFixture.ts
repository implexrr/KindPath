import { createResourceRunner } from './resources.js';
import { createFirewallContainer, firewallControl, prepareNamespace } from './firewallDocker.js';

export const runFirewallFixture = createResourceRunner(async (command, resources, task, signal) => {
  if (task !== 'verify-firewall') throw new Error('Unknown controlled task');
  const ns = await prepareNamespace(command, resources, signal, true);
  for (const address of ['198.18.0.2', '198.18.0.4']) {
    const origin = await createFirewallContainer(command, resources, ns.network, 'origin', ['firewall/fixture-origin.mjs'], signal, address);
    await command(['start', origin.name], signal);
  }
  async function probe(phase: 'before' | 'after') {
    const worker = await createFirewallContainer(command, resources, `container:${ns.id}`, 'probe', ['firewall/probe.mjs', phase], signal);
    const report = JSON.parse(await command(['start', '--attach', worker.name], signal, 20_000));
    if (report.phase !== phase || report.allowedConnections !== 2 || report.forbiddenConnections !== 5 || report.cannotAlterRules !== true) throw new Error('Invalid firewall probe');
  }
  await probe('before'); // Confirm all controlled canaries are reachable without the filter.
  await firewallControl(command, resources, ns, 'setup', signal);
  const before = await firewallControl(command, resources, ns, 'verify', signal);
  await probe('after'); // Same namespace, no proxy involved, capabilities remain empty.
  const after = await firewallControl(command, resources, ns, 'verify', signal);
  if (after.droppedPackets < before.droppedPackets + 5) throw new Error('No kernel drop evidence');
  return { isolation: 'passed', allowedConnections: 2, blockedConnections: 5, droppedPackets: after.droppedPackets };
});
