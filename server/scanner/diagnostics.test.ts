import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyFailure,readDiagnostic,workerDiagnostic,DIAGNOSTIC_PREFIX} from '../../scanner/gateway/diagnostics.mjs';

test('diagnostics reconstruct only enumerated stages/codes and bounded HTTP status',()=>{
 assert.deepEqual(readDiagnostic({stage:'page-loading',code:'HTTP_STATUS',httpStatus:403}),{stage:'page-loading',code:'HTTP_STATUS',httpStatus:403});
 for(const value of [null,[],{stage:'constructor',code:'FAILED'},{stage:'dns',code:'__proto__'},
  {stage:'dns',code:'FAILED',message:'private secret'},{stage:'page-loading',code:'HTTP_STATUS',httpStatus:'403'},
  {stage:'page-loading',code:'HTTP_STATUS',httpStatus:600},{stage:'dns',code:'HTTP_STATUS',httpStatus:403},
  {stage:'dns',code:'FAILED',httpStatus:403}])assert.equal(readDiagnostic(value),undefined);
});
test('raw errors, URLs, credentials, HTML and unknown network codes cannot be copied into diagnostics',()=>{
 const secret='PRIVATE_SENTINEL_token_and_hostname';
 for(const error of [new Error(secret+' https://user:pass@internal/path <script>'),{message:'net::ERR_'+secret,code:secret},
  {stderr:DIAGNOSTIC_PREFIX+JSON.stringify({stage:'dns',code:secret})},
  {stderr:DIAGNOSTIC_PREFIX+JSON.stringify({stage:'dns',code:'FAILED',headers:{Authorization:secret}})}]) {
  const result=classifyFailure(error,'worker-execution');assert.deepEqual(result,{stage:'worker-execution',code:'FAILED'});
  assert.ok(!JSON.stringify(result).includes(secret));
 }
 assert.deepEqual(classifyFailure({message:'page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at https://secret.invalid/'},'page-loading'),{stage:'page-loading',code:'ERR_HTTP2_PROTOCOL_ERROR'});
});
test('worker stderr requires exactly one complete valid diagnostic marker',()=>{
 const line=DIAGNOSTIC_PREFIX+'{"stage":"page-loading","code":"TIMEOUT"}';
 assert.deepEqual(workerDiagnostic('private native stderr\n'+line+'\n'),{stage:'page-loading',code:'TIMEOUT'});
 for(const raw of [line+'\n'+line,DIAGNOSTIC_PREFIX+'bad-json',DIAGNOSTIC_PREFIX+'x'.repeat(513),'x'.repeat(1024*1024+1)])assert.equal(workerDiagnostic(raw),undefined);
});
test('cancellation and timeout are distinguished only from explicit signals or error types',()=>{
 const cancelled=new AbortController();cancelled.abort();
 assert.deepEqual(classifyFailure(new Error('not a diagnostic'),'dns',cancelled.signal),{stage:'dns',code:'CANCELLED'});
 const timed=new AbortController();timed.abort(new DOMException('private reason','TimeoutError'));
 assert.deepEqual(classifyFailure({},'dns',timed.signal),{stage:'dns',code:'TIMEOUT'});
 assert.deepEqual(classifyFailure(new Error('timed out maybe'),'dns'),{stage:'dns',code:'FAILED'});
});

test('worker diagnostics survive cleanup and public error mapping without exposing stderr',async()=>{
 const {createResourceRunner}=await import('./resources.js');
 const {createPublicSiteScanner}=await import('./publicScanner.js');
 const {createPublicRouter}=await import('../routes/scanPublic.js');
 const {default:express}=await import('express');
 let disposed=false;
 const worker=createResourceRunner(async()=>{throw Object.assign(new Error('PRIVATE_RAW_ERROR'),{stderr:'PRIVATE_HEADER\n'+DIAGNOSTIC_PREFIX+'{"stage":"accessibility-analysis","code":"TIMEOUT"}\n'});},async()=>({command:async()=>'',dispose:async()=>{disposed=true;}}));
 const scan=createPublicSiteScanner({enabled:()=>true,worker});
 const app=express();app.use(express.json());app.use('/api',createPublicRouter({enabled:()=>true,scan}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 try{
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const response=await fetch(`http://127.0.0.1:${address.port}/api/scan-public`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://example.com/'})});
  const value=await response.json();assert.equal(response.status,503);assert.equal(value.code,'SCAN_FAILED');
  assert.deepEqual(value.diagnostic,{stage:'accessibility-analysis',code:'TIMEOUT'});assert.ok(disposed);
  assert.ok(!JSON.stringify(value).includes('PRIVATE_'));assert.equal(value.findings,undefined);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('DNS, setup and unclassified operation failures retain only their observed stage/code',async()=>{
 const {createPublicUrlWorkerRunner}=await import('./publicUrlWorker.js');
 const {ScannerError}=await import('./dockerWorker.js');
 const run=createPublicUrlWorkerRunner({enabled:()=>true,openSession:async()=>({command:async()=>'',dispose:async()=>{}}),planTarget:async()=>{throw Object.assign(new Error('private DNS details'),{code:'ENOTFOUND'});}});
 await assert.rejects(run('https://example.com/'),error=>{
  assert.ok(error instanceof ScannerError);assert.deepEqual(error.diagnostic,{stage:'dns',code:'ENOTFOUND'});assert.ok(!error.message.includes('private'));return true;
 });
 const {createResourceRunner}=await import('./resources.js');
 const operation=createResourceRunner(async()=>{throw new Error('private operation error');},async()=>({command:async()=>'',dispose:async()=>{}}));
 await assert.rejects(operation('controlled'),error=>{assert.ok(error instanceof ScannerError);assert.deepEqual(error.diagnostic,{stage:'worker-execution',code:'FAILED'});return true;});
 const unavailable=createResourceRunner(async()=>assert.fail('Setup failed'),async()=>{throw Object.assign(new Error('private connection details'),{code:'ECONNREFUSED'});});
 await assert.rejects(unavailable('controlled'),error=>{assert.ok(error instanceof ScannerError);assert.deepEqual(error.diagnostic,{stage:'network-setup',code:'ECONNREFUSED'});return true;});
});

test('unclassified worker failures are not guessed to be invalid output',async()=>{
 const {createPublicSiteScanner}=await import('./publicScanner.js');
 const {ScannerError}=await import('./dockerWorker.js');
 for(const [worker,expected] of [
  [async()=>{throw new Error('private failure before output');},{stage:'worker-execution',code:'FAILED'}],
  [async()=>({private:'malformed result'}),{stage:'worker-result',code:'INVALID_OUTPUT'}],
 ] as const){
  await assert.rejects(createPublicSiteScanner({enabled:()=>true,worker})('https://example.com/'),error=>{
   assert.ok(error instanceof ScannerError);assert.deepEqual(error.diagnostic,expected);return true;
  });
 }
});

test('network codes inside URLs, command errors and appended logs are not diagnoses',()=>{
 for(const message of [
  'Command failed: docker create worker https://example.com/net::ERR_CERT_AUTHORITY_INVALID',
  'Could not open https://example.com/net::ERR_HTTP2_PROTOCOL_ERROR',
  'Unclassified failure\nprivate log mentions net::ERR_CONNECTION_RESET',
 ])assert.deepEqual(classifyFailure(new Error(message),'worker-setup'),{stage:'worker-setup',code:'FAILED'});
 assert.deepEqual(classifyFailure(new Error('page.goto: net::ERR_CONNECTION_RESET at https://example.com/'),'page-loading'),{stage:'page-loading',code:'ERR_CONNECTION_RESET'});
});

test('redirect explanations survive verified cleanup but never override a cleanup failure', async () => {
 const {createResourceRunner}=await import('./resources.js');
 const {createPublicSiteScanner}=await import('./publicScanner.js');
 const {ScannerError}=await import('./dockerWorker.js');
 for (const cleanupFails of [false,true]) {
  let removed=false;
  const worker=createResourceRunner(async(_command,resources)=>{
   resources.containers.push('controlled-owned-container');
   throw Object.assign(new Error('PRIVATE_SENTINEL'),{stderr:DIAGNOSTIC_PREFIX+'{"stage":"page-loading","code":"REDIRECT_PATH_CHANGED"}\n'});
  },async()=>({dispose:async()=>{},command:async(args:string[])=>{
   if(args[0]==='rm')removed=true;
   if(cleanupFails && args.includes('name=^/controlled-owned-container$'))throw new Error('PRIVATE_DAEMON_FAILURE');
   return '';
  }}));
  await assert.rejects(createPublicSiteScanner({enabled:()=>true,worker})('https://example.com/'),error=>{
   assert.ok(error instanceof ScannerError); assert.ok(removed);
   assert.equal(error.code,cleanupFails?'SCANNER_CLEANUP_FAILED':'SCAN_FAILED');
   assert.deepEqual(error.diagnostic,cleanupFails?{stage:'cleanup',code:'UNCONFIRMED'}:{stage:'page-loading',code:'REDIRECT_PATH_CHANGED'});
   if(!cleanupFails)assert.match(error.message,/different path or query/);
   assert.doesNotMatch(error.message,/PRIVATE/); return true;
  });
 }
});
