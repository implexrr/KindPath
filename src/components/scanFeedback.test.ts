import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanErrorMessage, scanCoverageFeedback } from './scanFeedback.js';
test('scan failures give bounded guidance without exposing internal diagnostics',()=>{
  assert.match(scanErrorMessage({code:'SCANNER_BUSY',error:'private diagnostic'},429),/finishing/);
  assert.match(scanErrorMessage({code:'SCANNER_CLEANUP_FAILED'},503),/safely/);
  assert.match(scanErrorMessage({code:'PUBLIC_SCANNING_DISABLED'},503),/built-in page/);
  assert.equal(scanErrorMessage({error:'Use a public HTTP/HTTPS URL.'},400),'Use a public HTTP/HTTPS URL.');
  for(const value of [{code:'constructor',error:'private diagnostic'}, {code:'__proto__'}, {error:'private diagnostic'}, null]) {
    assert.equal(scanErrorMessage(value,503),'The request could not finish. No report was created. Try again.');
  }
  assert.doesNotMatch(scanErrorMessage({error:'x'.repeat(501)},400),/xxx/);
});

const coverage = { blockedRequests: 2, failedRequests: 3, omittedRules: 0, omittedNodes: 0 };
test('coverage distinguishes request omissions, result truncation and zero counts without promising conformance',()=>{
  const limited = scanCoverageFeedback({mode:'public',coverage})!;
  assert.equal(limited.title,'Scan coverage is limited');
  assert.match(limited.details.join(' '),/2 requests blocked.*3 requests failed.*overlap.*Missing resources/);
  const truncated = scanCoverageFeedback({mode:'public',coverage:{...coverage,blockedRequests:0,failedRequests:0,omittedRules:1,omittedNodes:4}})!;
  assert.equal(truncated.title,'Scan coverage is limited');
  assert.match(truncated.details.join(' '),/1 rules and 4 affected elements.*partial/);
  const zero = scanCoverageFeedback({mode:'public',coverage:{blockedRequests:0,failedRequests:0,omittedRules:0,omittedNodes:0}})!;
  assert.equal(zero.title,'Scan coverage');
  assert.match(zero.details.join(' '),/Other scan limitations still apply/);
  for(const feedback of [limited,truncated,zero]) assert.match(feedback.details.join(' '),/does not establish accessibility conformance/);
});
test('missing and malformed coverage stays unknown; built-in and demo reports get no public coverage notice',()=>{
  for(const value of [undefined,null,[],Object.create(coverage),{...coverage,failedRequests:'3'},{...coverage,omittedRules:-1},{...coverage,blockedRequests:Infinity}]) {
    const feedback=scanCoverageFeedback({mode:'public',coverage:value as any})!;
    assert.equal(feedback.title,'Scan coverage details unavailable');
    assert.match(feedback.details[0],/Do not assume/);
  }
  assert.equal(scanCoverageFeedback({mode:'fixture',coverage}),undefined);
  assert.equal(scanCoverageFeedback({mode:'demo',coverage}),undefined);
});

test('redirect failures explain the policy using only validated fixed diagnostics', () => {
  for (const [code, pattern] of [['REDIRECT_HOST_CHANGED',/hostname/],['REDIRECT_PATH_CHANGED',/path or query/],
    ['REDIRECT_DOWNGRADE',/HTTPS to HTTP/],['REDIRECT_LOOP',/loop/],['REDIRECT_LIMIT',/limit/]] as const) {
    const message=scanErrorMessage({code:'SCAN_FAILED',error:'PRIVATE_SENTINEL',diagnostic:{stage:'page-loading',code}},503);
    assert.match(message,pattern); assert.doesNotMatch(message,/PRIVATE_SENTINEL/);
  }
  for (const diagnostic of [{stage:'dns',code:'REDIRECT_HOST_CHANGED'},
    {stage:'page-loading',code:'REDIRECT_HOST_CHANGED',url:'PRIVATE_SENTINEL'},
    {stage:'page-loading',code:'constructor'}]) {
    assert.equal(scanErrorMessage({code:'SCAN_FAILED',diagnostic},503),'The scan could not finish. No report was created. Try again.');
  }
  assert.match(scanErrorMessage({code:'SCANNER_CLEANUP_FAILED',diagnostic:{stage:'page-loading',code:'REDIRECT_LOOP'}},503),/safely/);
});
