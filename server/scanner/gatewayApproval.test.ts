import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGatewayApprovalHandler } from './gatewayApproval.js';

test('gateway cannot request DNS before readiness or through malformed/replayed messages', async () => {
  let calls=0;
  const handler=createGatewayApprovalHandler(async()=>{calls++;return ['93.184.216.34'];},()=>{});
  await assert.rejects(handler({id:1,host:'example.org'}));assert.equal(calls,0);
  assert.equal(await handler({ready:true}),undefined);
  for(const value of [null,[],{ready:true},{id:0,host:'example.org'},{id:1,host:'example.org',command:'rm'},{id:1,host:42}])await assert.rejects(handler(value));
  assert.equal(calls,0);
  assert.deepEqual(await handler({id:1,host:'example.org'}),{id:1,addresses:['93.184.216.34']});
  await assert.rejects(handler({id:1,host:'example.org'}));assert.equal(calls,1);
});
