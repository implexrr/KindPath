import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controllerResolver } from './controller.mjs';
import { validateTarget, resolveTarget } from './policy.mjs';

test('public redirect/resource hosts require controller approval and remain pinned', async () => {
  let calls=0;
  const lookup=controllerResolver({'example.com':['93.184.216.34']},async host=>{calls++;assert.equal(host,'example.org');return ['93.184.216.35'];});
  assert.equal(validateTarget('https://example.org/style.css',null).host,'example.org');
  assert.equal(validateTarget('example.org:443',null,true).host,'example.org');
  assert.deepEqual(await lookup('example.com'),[{address:'93.184.216.34',family:4}]);
  const first=await lookup('example.org');first[0].address='127.0.0.1';
  // The caller cannot mutate a cached destination into another address.
  assert.equal((await lookup('example.org'))[0].address,'93.184.216.35'); assert.equal(calls,1);
});
test('controller cannot grant private addresses or missing answers, and failures are cached', async () => {
  for(const answers of [null,[],['127.0.0.1'],['93.184.216.34','10.0.0.1']]) {
    let calls=0;const lookup=controllerResolver({},async()=>{calls++;return answers;});
    await assert.rejects(lookup('example.org'));await assert.rejects(lookup('example.org'));assert.equal(calls,1);
  }
  for(const url of ['http://metadata.google.internal/','http://127.0.0.1/','http://localhost/'])assert.throws(()=>validateTarget(url,null));
});


test('controller approval can outlast a DNS-only deadline without connecting before approval', async () => {
  let grant;
  const granted=new Promise(resolve=>grant=resolve);
  let settled=false;
  const plan=resolveTarget('https://example.org/style.css',null,false,async()=>{
    await granted;return [{address:'93.184.216.35',family:4}];
  },1000).then(value=>{settled=true;return value;});
  // The short DNS-only boundary expires first. No controller answer is returned
  // until the simulated verified firewall grant has finished.
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(settled,false);
  grant();assert.equal((await plan).address,'93.184.216.35');
  const hold=new Promise(resolve=>setTimeout(()=>resolve([{address:'93.184.216.35',family:4}]),20));
  await assert.rejects(resolveTarget('https://example.org/',null,false,()=>hold,1),/DNS timeout/);
});
