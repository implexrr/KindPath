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
 assert.deepEqual(classifyFailure({message:'goto: net::ERR_HTTP2_PROTOCOL_ERROR at https://secret.invalid/'},'page-loading'),{stage:'page-loading',code:'ERR_HTTP2_PROTOCOL_ERROR'});
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
