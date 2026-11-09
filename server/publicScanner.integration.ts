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
test('forbidden redirects, untrusted TLS and a page changing during analysis never produce a successful report', {timeout:120000},async()=>{
  for(const [task,marker] of [['verify-pinned-redirect','DESTINATION_REJECTED'],['verify-pinned-tls','TLS_CERTIFICATE_REJECTED'],['verify-pinned-moving','PAGE_CHANGED_DURING_SCAN']]) {
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

for (const scenario of [
  {path:'/redirect',final:'/barriers'}, {path:'/content',final:'/content'},
  {path:'/forms',final:'/forms'}, {path:'/missing',final:'/missing'},
]) {
test(`URL scan/capture handles controlled ${scenario.path} without public access`, {timeout:90000}, async () => {
  const { default: express } = await import('express');
  const { createPublicRouter } = await import('./routes/scanPublic.js');
  const { createPublicSiteScanner } = await import('./scanner/publicScanner.js');
  const { createPublicUrlWorkerRunner } = await import('./scanner/publicUrlWorker.js');
  const { createDestinationPlan } = await import('./scanner/destinationSnapshot.js');
  const { prepareNamespace, createFirewallContainer, PINNED_FIXTURE_IP } = await import('./scanner/firewallDocker.js');
  const { localRequests } = await import('./middleware/localRequests.js');
  const target = 'http://example.com'+scenario.path;
  let lookups = 0;
  const worker = createPublicUrlWorkerRunner({
    captureEnabled: () => true,
    enabled: () => true, // Local test instance only; the application's router/runner gates stay false.
    planTarget: async (url, signal) => {
      assert.equal(url, target);
      return createDestinationPlan(url, async host => {
        lookups++; assert.equal(host, 'example.com'); return [{ address: PINNED_FIXTURE_IP, family: 4 }];
      }, signal);
    },
    prepareNetwork: async (command, resources, signal) => {
      // A more specific internal route binds the permitted public-shaped IP to our synthetic origin.
      const ns = await prepareNamespace(command, resources, signal, 'pinned');
      for (const ip of [PINNED_FIXTURE_IP, '93.184.216.36']) {
        const origin = await createFirewallContainer(command, resources, ns.network, 'origin', ['gateway/readiness-origin.mjs'], signal, ip);
        await command(['start', origin.name], signal);
      }
      const probe = await createFirewallContainer(command, resources, `container:${ns.id}`, 'probe', ['firewall/probe.mjs', 'before', 'pinned'], signal);
      const proof = JSON.parse(await command(['start', '--attach', probe.name], signal, 20000));
      assert.equal(proof.phase, 'before'); assert.equal(proof.allowedConnections, 2); assert.equal(proof.forbiddenConnections, 5);
      return ns;
    },
  });
  const scan = createPublicSiteScanner({ enabled: () => true, captureEnabled: () => true, worker });
  const app = express(); app.use('/api', localRequests); app.use(express.json({limit:'4kb'}));
  app.use('/api', createPublicRouter({enabled: () => true, captureEnabled: () => true, scan}));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/scan-public`, {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({url:target}), signal: AbortSignal.timeout(80000),
    });
    if (scenario.path === '/missing') {
      assert.equal(response.status,503); const failure=await response.json();
      assert.equal(failure.code,'SCAN_FAILED'); assert.equal(failure.sitePreview,undefined);
      assert.deepEqual(failure.diagnostic,{stage:'page-loading',code:'HTTP_STATUS',httpStatus:404});
    } else {
    assert.equal(response.status, 200);
    const report = await response.json();
    assert.equal(report.mode, 'public'); assert.equal(report.requestedUrl, target); assert.equal(report.url,'http://example.com'+scenario.final);
    if (scenario.path === '/redirect') for (const id of ['image-alt','label','button-name']) assert.ok(report.findings.some((finding: {id:string}) => finding.id === id));
    assert.ok(report.limitations.some((text: string) => /requests were blocked by policy/.test(text)));
    assert.equal(lookups, 1); assert.equal(PUBLIC_SCANNING_ENABLED, false);
    const { PUBLIC_CAPTURE_ENABLED } = await import('./scanner/publicPolicy.js'); assert.equal(PUBLIC_CAPTURE_ENABLED,false);
    assert.equal(report.sitePreview.scanId,report.scanId); assert.equal(report.sitePreview.requestedUrl,target);
    assert.equal(report.sitePreview.url,report.url);
    if (scenario.path === '/redirect') {
    assert.match(report.sitePreview.html,/Community garden/);
    assert.match(report.sitePreview.html,/Rendered capture marker/); assert.match(report.sitePreview.html,/Controlled advertisement/);
    assert.match(report.sitePreview.html,/:hover\{color:rgb\(255, 0, 0\)/);
    assert.ok(!report.sitePreview.html.includes('controlled-form-value-marker'));
    assert.match(report.sitePreview.html,/input[^>]* disabled/);
    }
    assert.doesNotMatch(report.sitePreview.html,/<(?:script|iframe|form|img|svg)\b|\b(?:href|src|onclick)=/i);
    if (scenario.path === '/content') {
      assert.match(report.sitePreview.html,/Garden accessibility guide/); assert.match(report.sitePreview.html,/<h4/);
      assert.match(report.sitePreview.html,/<table/); assert.match(report.sitePreview.html,/scope="col"/);
      assert.match(report.sitePreview.html,/colspan="2"/); assert.match(report.sitePreview.html,/box-sizing:border-box/);
      assert.ok(!report.sitePreview.html.includes('hidden-content-marker'));
    }
    if (scenario.path === '/forms') {
      assert.ok(report.findings.some((finding:{id:string})=>finding.id==='label'));
      assert.match(report.sitePreview.html,/Static garden supplies advertisement/);
      assert.ok(!report.sitePreview.html.includes('controlled-name-value'));
      assert.ok(!report.sitePreview.html.includes('hidden-style-marker'));
    }
    assert.ok(report.sitePreview.limitations.length>0);
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  const session = await openLocalDockerSession();
  try {
    for (const args of [['ps','--all','--quiet'],['network','ls','--quiet'],['volume','ls','--quiet']]) {
      assert.equal((await session.command([...args,'--filter','label=kindpath.scanner=public'])).trim(),'');
    }
  } finally { await session.dispose(); }
});

}

for (const scenario of ['multi-host','private-redirect','late-policy-failure']) {
 const privateRedirect=scenario==='private-redirect', failLate=scenario==='late-policy-failure';
 test(`public website controller handles controlled ${scenario} without public access`,{timeout:90000},async()=>{
  const {createPublicUrlWorkerRunner}=await import('./scanner/publicUrlWorker.js');
  const {createPublicSiteScanner}=await import('./scanner/publicScanner.js');
  const {createDestinationPlan}=await import('./scanner/destinationSnapshot.js');
  const {prepareNamespace,createFirewallContainer}=await import('./scanner/firewallDocker.js');
  const calls=new Map<string,number>();
  let browserCompleted=false,injectedFailure=false;
  let releaseLate!:()=>void;const lateDns=new Promise<void>(resolve=>releaseLate=resolve);
  const capturedCommands:string[][]=[];
  const worker=createPublicUrlWorkerRunner({enabled:()=>true,captureEnabled:()=>true,
   planTarget:(url,signal)=>createDestinationPlan(url,async host=>{
    calls.set(host,(calls.get(host)??0)+1);
    if(host==='late.example.net')await lateDns;
    // Rebinding or DNS-private resource answers must never create a connection.
    const address=host==='blocked.example.org'||host==='rebind.example.net'&&calls.get(host)!==1?'127.0.0.1':host==='example.com'?'93.184.216.34':'93.184.216.36';
    return [{address,family:4}];
   },signal),
   openSession:async()=>{
    const session=await openLocalDockerSession();
    return {...session,command:async(...args:Parameters<typeof session.command>)=>{
      capturedCommands.push(args[0]);
      if(failLate&&browserCompleted&&args[0].includes('replace')){injectedFailure=true;throw new Error('Controlled late firewall failure');}
      const result=await session.command(...args);
      if(args[0][0]==='start'&&args[0].some(arg=>arg.startsWith('kindpath-public-browser-'))){browserCompleted=true;releaseLate();}
      return result;
    }};
   },
   prepareNetwork:async(command,resources,signal)=>{
    const ns=await prepareNamespace(command,resources,signal,'pinned');
    for(const address of ['93.184.216.34','93.184.216.36']){
     const origin=await createFirewallContainer(command,resources,ns.network,'origin',['gateway/public-origin.mjs'],signal,address);
     await command(['start',origin.name],signal);
    }
    return ns;
   },
  });
  const scan=createPublicSiteScanner({enabled:()=>true,captureEnabled:()=>true,worker});
  const target='http://example.com/'+(privateRedirect?'private-redirect':'redirect');
  if(privateRedirect||failLate)await assert.rejects(scan(target),error=>error instanceof ScannerError&&error.code==='SCAN_FAILED');
  else {
   const report=await scan(target);
   assert.equal(report.mode,'public');assert.equal(report.requestedUrl,target);assert.equal(report.url,'http://example.org/page');
   assert.equal(report.sitePreview?.scanId,report.scanId);assert.equal(report.sitePreview?.url,report.url);
   assert.match(report.sitePreview!.html,/Multi-host rendered marker/);assert.match(report.sitePreview!.html,/Static website advertisement/);
   assert.match(report.sitePreview!.html,/color:rgb\(0, 128, 0\)/);assert.match(report.sitePreview!.html,/:hover\{color:rgb\(255, 0, 0\)/);
   assert.doesNotMatch(report.sitePreview!.html,/<(?:script|iframe|form|img|svg)\b|\b(?:href|src|onclick)=|synthetic-form-value/i);
   for(const host of ['example.com','example.org','static.example.net','rebind.example.net','blocked.example.org','late.example.net'])assert.equal(calls.get(host),1,host);
   assert.ok(report.limitations.some(text=>text.includes('requests failed')));
  }
  if(!privateRedirect)assert.ok(capturedCommands.some(args=>args.includes('replace')),'Additional public host must require a verified firewall update');
  if(failLate)assert.equal(injectedFailure,true,'The late policy failure must be exercised after browser completion');
  assert.equal(calls.get('blocked.example.org'),1);
  const session=await openLocalDockerSession();
  try {
   for(const args of [['ps','--all','--quiet'],['network','ls','--quiet'],['volume','ls','--quiet']])assert.equal((await session.command([...args,'--filter','label=kindpath.scanner=public'])).trim(),'');
  } finally {await session.dispose();}
 });
}
