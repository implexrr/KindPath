import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanErrorMessage } from './scanFeedback.js';
test('scan failures give bounded guidance without exposing internal diagnostics',()=>{
  assert.match(scanErrorMessage({code:'SCANNER_BUSY',error:'private diagnostic'},429),/finishing/);
  assert.match(scanErrorMessage({code:'SCANNER_CLEANUP_FAILED'},503),/safely/);
  assert.match(scanErrorMessage({code:'PUBLIC_SCANNING_DISABLED'},503),/built-in page/);
  assert.equal(scanErrorMessage({error:'Use an allowlisted URL.'},400),'Use an allowlisted URL.');
  for(const value of [{code:'constructor',error:'private diagnostic'}, {code:'__proto__'}, {error:'private diagnostic'}, null]) {
    assert.equal(scanErrorMessage(value,503),'The request could not finish. No report was created. Try again.');
  }
  assert.doesNotMatch(scanErrorMessage({error:'x'.repeat(501)},400),/xxx/);
});
