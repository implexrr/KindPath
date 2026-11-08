import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicWorkerRunner } from './publicDockerWorker.js';
import { ScannerError } from './dockerWorker.js';

function daemon() {
  const containers = new Set<string>(); const volumes = new Set<string>();
  let volumeCleanupFails = true; let created = 0;
  const command = async (args: string[]) => {
    const verb=args[0];
    if (verb==='volume') {
      if(args[1]==='create'){volumes.add(args.at(-1)!);return args.at(-1)!;}
      if(args[1]==='inspect')return JSON.stringify([{Driver:'local',Options:{type:'tmpfs',device:'tmpfs',o:'uid=1000,gid=1000,mode=0700,size=1m'}}]);
      if(args[1]==='ls')return [...volumes].join('\n');
      if(args[1]==='rm'){if(volumeCleanupFails)throw Error('Volume cleanup failed');volumes.delete(args[2]);return '';}
    }
    if(verb==='ps') {
      const filter=args.at(-1)!;
      if(filter.startsWith('name='))return [...containers].filter(name=>filter===`name=^/${name}$`).join('\n');
      return filter==='label=kindpath.scanner=public'?[...containers].join('\n'):'';
    }
    if(verb==='create'){containers.add(args[args.indexOf('--name')+1]);created++;return '';}
    if(verb==='inspect') {
      const browser=args[1].startsWith('kindpath-public-browser-');
      return JSON.stringify([{State:{Running:false},Config:{User:'1000:1000'},Mounts:[{Type:'volume',Name:[...volumes][0],Destination:'/run/kindpath',RW:!browser}],HostConfig:{NetworkMode:browser?'none':'bridge',Privileged:false,ReadonlyRootfs:true,AutoRemove:true,IpcMode:'private',CapDrop:['ALL'],Memory:browser?536870912:134217728,NanoCpus:browser?1000000000:500000000,PidsLimit:browser?256:64,SecurityOpt:['no-new-privileges:true','seccomp={"defaultAction":"SCMP_ACT_ERRNO"}']}}]);
    }
    if(verb==='start')return args[1]==='--attach'?'{}':'';
    if(verb==='rm'){containers.delete(args[2]);return '';}
    throw Error('Unexpected command');
  };
  const session = async () => ({command,dispose:async()=>{}});
  return {run:createPublicWorkerRunner(session),restart:()=>createPublicWorkerRunner(session),volumes,containers,get created(){return created;},restoreCleanup:()=>{volumeCleanupFails=false;}};
}
const failed=(error:unknown)=>error instanceof ScannerError && error.code==='SCANNER_CLEANUP_FAILED';
test('unconfirmed socket-volume removal suppresses results and prevents new workers until recovery',async()=>{
  const docker=daemon();
  await assert.rejects(docker.run('verify-public-isolation'),failed);
  assert.equal(docker.volumes.size,1); assert.equal(docker.containers.size,0);
  await assert.rejects(docker.run('verify-public-isolation'),failed);
  assert.equal(docker.created,2);
  docker.restoreCleanup(); await docker.run('verify-public-isolation');
  assert.equal(docker.created,4); assert.equal(docker.volumes.size,0); assert.equal(docker.containers.size,0);
});
test('a restarted controller blocks orphaned socket volumes without deleting unknown resources',async()=>{
  const docker=daemon(); await assert.rejects(docker.run('verify-public-isolation'),failed);
  await assert.rejects(docker.restart()('verify-public-isolation'),failed);
  assert.equal(docker.created,2); assert.equal(docker.volumes.size,1);
  docker.restoreCleanup(); await docker.run('verify-public-isolation');
});
