import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDestinationPlan, isPublicIpv4, validateDestinationPlan } from './destinationSnapshot.js';

test('destination snapshots exclude private, special-purpose, multicast and noncanonical addresses', () => {
  for (const address of ['0.0.0.0','10.0.0.1','100.64.0.1','127.0.0.1','169.254.169.254','172.31.0.1','192.0.0.9',
    '192.0.2.1','192.31.196.1','192.52.193.1','192.88.99.1','192.168.0.1','192.175.48.1','198.18.0.1','198.19.0.1',
    '198.51.100.1','203.0.113.1','224.0.0.1','255.255.255.255','::1','::ffff:93.184.216.34','093.184.216.34','2130706433']) assert.equal(isPublicIpv4(address),false,address);
  for (const address of ['93.184.216.34','1.1.1.1','100.63.255.255','100.128.0.0','172.15.255.255','172.32.0.0']) assert.equal(isPublicIpv4(address),true,address);
});
test('only one IPv4 DNS lookup occurs and the normalized plan is deeply frozen', async () => {
  let calls=0;
  const answers=[{address:'93.184.216.35',family:4},{address:'93.184.216.34',family:4},{address:'93.184.216.34',family:4}];
  const plan=await createDestinationPlan('https://example.com/',async(host,options)=>{
    calls++;assert.equal(host,'example.com');assert.deepEqual(options,{all:true,family:4,verbatim:true});return answers;
  });
  answers[0].address='127.0.0.1';
  assert.equal(calls,1);assert.deepEqual(plan.addresses,['93.184.216.34','93.184.216.35']);
  assert.equal(plan.destinations['example.com'],plan.addresses);
  assert.ok(Object.isFrozen(plan)&&Object.isFrozen(plan.addresses)&&Object.isFrozen(plan.destinations));
  assert.deepEqual(validateDestinationPlan(plan),plan);
});
test('unapproved hosts are rejected before DNS, and every returned address must be acceptable', async () => {
  let called=false;
  await assert.rejects(createDestinationPlan('https://localhost/',async()=>{called=true;return [];}));assert.equal(called,false);
  for(const answers of [[],null,[{address:'93.184.216.34',family:4},{address:'10.0.0.1',family:4}],
    [{address:'93.184.216.34',family:6}],[{address:'2606:4700::1111',family:6}],Array(17).fill({address:'93.184.216.34',family:4})]) {
    await assert.rejects(createDestinationPlan('http://example.com/',async()=>answers));
  }
});
test('serialized plans reject changed firewall addresses, missing hosts, and additional snapshot entries', async () => {
  const plan=await createDestinationPlan('http://example.com/',async()=>[{address:'93.184.216.34',family:4}]);
  for(const value of [null,{...plan,addresses:['127.0.0.1']},{...plan,addresses:['93.184.216.35']},
    {...plan,destinations:{}},{...plan,destinations:{...plan.destinations,localhost:['93.184.216.34']}},
    {...plan,destinations:JSON.parse('{"__proto__":["93.184.216.34"]}')},{...plan,extra:true}]) assert.throws(()=>validateDestinationPlan(value));
});
test('cancelled or stalled DNS cannot produce a plan',async()=>{
  const abort=new AbortController();
  const pending=createDestinationPlan('http://example.com/',async()=>new Promise(()=>{}),abort.signal);
  abort.abort();await assert.rejects(pending);
  let called=false;await assert.rejects(createDestinationPlan('http://example.com/',async()=>{called=true;return [];},abort.signal));assert.equal(called,false);
});
