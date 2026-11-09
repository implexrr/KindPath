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

test('atomic destination updates require the prior policy proof and preserve deny rules', {timeout:60000}, async () => {
  const {createResourceRunner}=await import('./scanner/resources.js');
  const {prepareNamespace,createFirewallContainer,firewallControl}=await import('./scanner/firewallDocker.js');
  const run=createResourceRunner(async(command,resources,_task,signal)=>{
    const ns=await prepareNamespace(command,resources,signal,'pinned');
    for(const ip of ['93.184.216.34','93.184.216.36']){
      const origin=await createFirewallContainer(command,resources,ns.network,'origin',['gateway/readiness-origin.mjs'],signal,ip);
      await command(['start',origin.name],signal);
    }
    ns.addresses=['93.184.216.34'];await firewallControl(command,resources,ns,'setup',signal);
    const before=ns.hash;
    const probe=async()=>{
      const code=`const net=require('node:net');(async()=>{const result=[];for(const host of ['93.184.216.34','93.184.216.36'])result.push(await new Promise(resolve=>{const s=net.connect({host,port:80});s.setTimeout(300);s.once('connect',()=>{s.destroy();resolve(true)});s.once('error',()=>resolve(false));s.once('timeout',()=>{s.destroy();resolve(false)});}));console.log(JSON.stringify(result))})()`;
      const c=await createFirewallContainer(command,resources,`container:${ns.id}`,'probe',['-e',code],signal);
      return JSON.parse(await command(['start','--attach',c.name],signal));
    };
    assert.deepEqual(await probe(),[true,false]);
    ns.addresses.push('93.184.216.36');
    ns.hash='0'.repeat(64);await assert.rejects(firewallControl(command,resources,ns,'replace',signal));
    ns.hash=before;await firewallControl(command,resources,ns,'verify',signal);
    await firewallControl(command,resources,ns,'replace',signal);assert.notEqual(ns.hash,before);
    await firewallControl(command,resources,ns,'verify',signal);assert.deepEqual(await probe(),[true,true]);
  });
  await run('controlled-update');
});
