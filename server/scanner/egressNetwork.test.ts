import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachEgressNetwork } from './firewallDocker.js';
import type { Namespace } from './firewallDocker.js';
import type { Command } from './dockerWorker.js';
import type { Resources } from './resources.js';
import { createDestinationPlan } from './destinationSnapshot.js';

async function fixture(failure = '') {
  const calls: string[][] = [];
  const resources: Resources = { containers: [], volumes: [], networks: ['owned-internal'] };
  const ns: Namespace = { id: 'a'.repeat(64), network: 'owned-internal', addresses: ['93.184.216.34'], hash: 'b'.repeat(64) };
  const plan = await createDestinationPlan('http://example.com/', async () => [{address:'93.184.216.34',family:4}]);
  let network = ''; let connected = false;
  function inspected(admin: boolean) {
    return { Id: ns.id, State: { Running: !admin }, Config: { User: admin?'0:0':'1000:1000', Labels:{'kindpath.scanner':'public'} }, Mounts: [],
      HostConfig: { NetworkMode: admin?`container:${ns.id}`:ns.network, Privileged:false, ReadonlyRootfs:true, AutoRemove:true,
        CapDrop:['ALL'], CapAdd:admin?['NET_ADMIN']:[], SecurityOpt:['no-new-privileges:true'], IpcMode:'private', Memory:134217728,
        NanoCpus:500000000,PidsLimit:64,Tmpfs:{'/tmp':'rw,nosuid,nodev,noexec,size=16777216'} },
      NetworkSettings:{Networks:{[ns.network]:{},...(connected?{[network]:{GwPriority:failure==='priority'?0:1}}:{}),...(failure==='extra'?{unexpected:{}}:{})}},
    };
  }
  const command: Command = async args => {
    calls.push(args);
    if (args[0]==='inspect') return JSON.stringify([inspected(args[1]!==ns.id)]);
    if (args[0]==='create') return '';
    if (args[0]==='start') return JSON.stringify({policyHash:(failure==='fingerprint'?'c':'b').repeat(64),droppedPackets:0});
    if (args[0]==='network') {
      if(args[1]==='create'){network=args.at(-1)!;return '';}
      if(args[1]==='connect'){if(failure==='connect')throw Error('Connection interrupted');connected=true;return '';}
      return JSON.stringify([{Name:network,Driver:'bridge',Internal:failure==='network',EnableIPv6:false,
        Labels:{'kindpath.scanner':'public'},Options:{'com.docker.network.bridge.gateway_mode_ipv4':'nat','com.docker.network.bridge.enable_ip_masquerade':'true'}}]);
    }
    throw Error('Unexpected command');
  };
  return { calls,resources,ns,plan,run:()=>attachEgressNetwork(command,resources,ns,plan,AbortSignal.timeout(1000)) };
}
test('egress attachment checks the kernel policy before and after connecting the owned namespace',async()=>{
  const f=await fixture();await f.run();
  const connect=f.calls.findIndex(args=>args[0]==='network'&&args[1]==='connect');
  const proofs=f.calls.map((args,index)=>args[0]==='start'?index:-1).filter(index=>index>=0);
  assert.equal(proofs.length,2);assert.ok(proofs[0]<connect&&proofs[1]>connect);
  assert.ok(f.calls[connect].includes('--gw-priority=1'));assert.equal(f.calls[connect].at(-1),f.ns.id);
  assert.equal(f.resources.networks.length,2);assert.equal(f.ns.egress,f.resources.networks[1]);
});
test('unverified, changed or unexpectedly attached namespaces cannot connect an egress network',async()=>{
  for(const failure of ['fingerprint','extra']){
    const f=await fixture(failure);await assert.rejects(f.run());
    assert.equal(f.calls.some(args=>args[0]==='network'&&args[1]==='connect'),false);
  }
  const f=await fixture();f.ns.hash=undefined;await assert.rejects(f.run());assert.equal(f.calls.length,0);
});
test('bad egress configuration and interrupted attachment stay owned and fail closed',async()=>{
  for(const failure of ['network','connect','priority']){
    const f=await fixture(failure);await assert.rejects(f.run());
    assert.equal(f.resources.networks.length,2);assert.equal(f.ns.egress,undefined);
    if(failure==='network')assert.equal(f.calls.some(args=>args[1]==='connect'),false);
  }
});
