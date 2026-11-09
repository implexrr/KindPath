import { test } from 'node:test';
import assert from 'node:assert/strict';
import { websiteUrl } from '../../scanner/gateway/url.mjs';
import { createDestinationApprover, MAX_SCAN_HOSTS } from './destinationApproval.js';
import { createDestinationPlan } from './destinationSnapshot.js';

const plan = (target: string, address = '93.184.216.34') => createDestinationPlan(target, async () => [{address,family:4}]);
test('public URL syntax accepts unrelated domains and rejects local names and numeric variants', () => {
  for (const url of ['https://www.wikipedia.org/wiki/Accessibility','http://example.org/a?b=1','https://xn--bcher-kva.de/']) assert.ok(websiteUrl(url));
  for (const url of ['file:///etc/passwd','http://localhost/','http://printer.local/','http://metadata.google.internal/',
    'http://router.home.arpa/','http://127.1/','http://2130706433/','http://0x7f000001/','http://[::1]/',
    'http://example.org./','http://example.org:8080/','https://user:pass@example.org/','https://example.org/#fragment',
    'https://bad_label.org/','https://example.org/\n']) assert.throws(() => websiteUrl(url), url);
});
// New hosts are exercised through a public-shaped plan supplied locally; no real DNS.
// General URL policy is switched on when the broker is integrated.
test('destination approval caches the initial snapshot without another lookup or install', async () => {
  const approve = createDestinationApprover(await plan('https://example.com/'), async () => assert.fail('DNS repeated'), async () => assert.fail('Firewall repeated'), AbortSignal.timeout(1000));
  assert.deepEqual(await approve('example.com'),['93.184.216.34']);
  for (const host of ['localhost','127.0.0.1','example.com:443','example.com/path','EXAMPLE.com']) assert.throws(() => approve(host));
});
test('failed lookups are cached and bounded, and cancellation prevents new approval', async () => {
  let calls=0;
  const abort=new AbortController();
  const approve=createDestinationApprover(await plan('https://example.com/'),async()=>{calls++;throw new Error('Blocked DNS');},async()=>assert.fail('Rejected DNS changed firewall'),abort.signal);
  for(let i=0;i<MAX_SCAN_HOSTS+5;i++)assert.equal(await approve(`asset${i}.example.org`),null);
  assert.equal(await approve('asset0.example.org'),null);assert.equal(calls,MAX_SCAN_HOSTS-1);
  abort.abort();assert.throws(()=>approve('example.com'));
});

const hostPlan = async (target: string, _signal?: AbortSignal) => ({target,addresses:['93.184.216.35'],destinations:{[new URL(target).hostname]:['93.184.216.35']}});
test('new host addresses are returned only after a serialized, verified firewall install', async () => {
  const events: string[]=[];let release!:()=>void;
  const approve=createDestinationApprover(await plan('https://example.com/'),async(target)=>{events.push('dns');return hostPlan(target);},async addresses=>{assert.deepEqual(addresses,['93.184.216.34','93.184.216.35']);events.push('install');await new Promise<void>(resolve=>release=resolve);events.push('verified');},AbortSignal.timeout(1000));
  const first=approve('example.org');const duplicate=approve('example.org');assert.equal(first,duplicate);
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(events,['dns','install']);
  release();assert.deepEqual(await first,['93.184.216.35']);assert.deepEqual(events,['dns','install','verified']);
  assert.deepEqual(await approve('example.org'),['93.184.216.35']);assert.equal(events.length,3);
});
test('private/mismatched plans and failed firewall verification cannot grant destinations', async () => {
  for(const candidate of [async(target:string)=>({...await hostPlan(target),addresses:['127.0.0.1']}),async()=>hostPlan('https://wrong.example.org/')]) {
    const approve=createDestinationApprover(await plan('https://example.com/'),candidate,async()=>assert.fail('Unsafe plan installed'),AbortSignal.timeout(1000));
    await assert.rejects(approve('example.org'));
  }
  let calls=0;
  const approve=createDestinationApprover(await plan('https://example.com/'),async target=>{calls++;return hostPlan(target);},async()=>{throw new Error('Unverified firewall');},AbortSignal.timeout(1000));
  await assert.rejects(approve('example.org'));await assert.rejects(approve('www.example.org'));assert.equal(calls,1);
});
