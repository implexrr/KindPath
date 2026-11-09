import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicWorkerRunner, runPublicWorker } from './scanner/publicDockerWorker.js';
import { runIsolatedWorker } from './scanner/dockerWorker.js';
import { openLocalDockerSession, ScannerError } from './scanner/dockerWorker.js';
import { mapPublicReport } from './scanner/publicScanner.js';
import { PUBLIC_SCANNING_ENABLED } from './scanner/publicPolicy.js';

test('network-disabled browser reaches only the policy gateway through its private socket', async () => {
  assert.equal(PUBLIC_SCANNING_ENABLED,false);
  assert.deepEqual(await runPublicWorker('verify-public-isolation'), {isolation:'passed',forbiddenRequests:10});
});
test('public target execution is unavailable even through the low-level runner', async () => {
  await assert.rejects(runPublicWorker('https://example.com/'), /disabled/);
  assert.equal(PUBLIC_SCANNING_ENABLED,false);
});

test('gateway scans share admission with fixtures and clean up after cancellation', async () => {
  const abort=new AbortController();
  const run=runPublicWorker('verify-public-isolation',abort.signal);
  await assert.rejects(runIsolatedWorker('clear'), (error: unknown)=>error instanceof ScannerError && error.code==='SCANNER_BUSY');
  const timer=setTimeout(()=>abort.abort(),200);
  try {await assert.rejects(run);} finally {clearTimeout(timer);}
});
test('temporary gateway containers and socket volumes are removed', async () => {
  const session=await openLocalDockerSession();
  try {
    for (const args of [
      ['ps','--all','--quiet','--filter','label=kindpath.scanner=public'],
      ['volume','ls','--quiet','--filter','label=kindpath.scanner=public'],
      ['network','ls','--quiet','--filter','label=kindpath.scanner=public'],
    ]) assert.equal((await session.command(args)).trim(),'');
  } finally {await session.dispose();}
});


test('a frozen destination plan drives real gateway/browser scans behind verified egress filtering', {timeout:90000}, async()=>{
  const proof=await runPublicWorker('verify-pinned-scan') as {result:unknown;requests:{method:string;path:string}[];egressVerified:boolean};
  assert.equal(proof.egressVerified,true);
  const report=mapPublicReport(proof.result);
  assert.equal(report.url,'http://example.com/barriers');
  for(const id of ['image-alt','label','button-name'])assert.ok(report.findings.some(finding=>finding.id===id));
  const coverage=(proof.result as {coverage:{blockedRequests:number;failedRequests:number}}).coverage;
  assert.ok(coverage.blockedRequests>=5);assert.ok(coverage.failedRequests>0);
  assert.ok(proof.requests.some(request=>request.path==='/redirect'));
  assert.ok(proof.requests.some(request=>request.path==='/barriers'));
  assert.equal(PUBLIC_SCANNING_ENABLED,false);
});
test('forbidden redirects and untrusted TLS certificates never produce a successful report', {timeout:120000},async()=>{
  for(const [task,marker] of [['verify-pinned-redirect','DESTINATION_REJECTED'],['verify-pinned-tls','TLS_CERTIFICATE_REJECTED']]) {
    let verifiedRejection=false;
    const run=createPublicWorkerRunner(async()=>{
      const session=await openLocalDockerSession();
      return {dispose:session.dispose,command:async(...args:Parameters<typeof session.command>)=>{
        try{return await session.command(...args);}catch(error){
          if(typeof(error as {stderr?:unknown}).stderr==='string' && (error as {stderr:string}).stderr.includes(marker))verifiedRejection=true;
          throw error;
        }
      }};
    });
    await assert.rejects(run(task),error=>error instanceof ScannerError&&error.code==='SCAN_FAILED');
    assert.equal(verifiedRejection,true,`${task} must fail at the intended browser policy, not an earlier setup step`);
  }
  const session=await openLocalDockerSession();
  try {
    for(const args of [['ps','--all','--quiet'],['network','ls','--quiet'],['volume','ls','--quiet']])assert.equal((await session.command([...args,'--filter','label=kindpath.scanner=public'])).trim(),'');
  } finally {await session.dispose();}
});
