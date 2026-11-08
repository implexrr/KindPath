import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFirewallFixture } from './scanner/firewallFixture.js';
import { openLocalDockerSession } from './scanner/dockerWorker.js';
import { PUBLIC_SCANNING_ENABLED } from './scanner/publicPolicy.js';

test('kernel firewall blocks direct TCP, UDP, and IPv6 connections while allowing the controlled origin', async () => {
  assert.equal(PUBLIC_SCANNING_ENABLED, false);
  const result = await runFirewallFixture('verify-firewall') as { isolation: string; allowedConnections: number; blockedConnections: number; droppedPackets: number };
  assert.equal(result.isolation, 'passed'); assert.equal(result.allowedConnections, 2);
  assert.equal(result.blockedConnections, 5); assert.ok(result.droppedPackets >= 5);
});
test('all owned firewall containers, volumes, and networks are absent after fixture verification', async () => {
  const session = await openLocalDockerSession();
  try {
    for (const args of [['ps','--all','--quiet'], ['network','ls','--quiet'], ['volume','ls','--quiet']]) {
      assert.equal((await session.command([...args, '--filter', 'label=kindpath.scanner=public'])).trim(), '');
    }
  } finally { await session.dispose(); }
});
