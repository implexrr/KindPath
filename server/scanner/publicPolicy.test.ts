import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_SCANNING_ENABLED, validatePublicUrl, assertPublicIsolation } from './publicPolicy.js';
import { scanPublicSite, mapPublicReport } from './publicScanner.js';

test('public scanning remains disabled even for the candidate allowlisted target', async () => {
  assert.equal(PUBLIC_SCANNING_ENABLED,false);
  await assert.rejects(scanPublicSite('https://example.com/'), /disabled/);
});
test('host preflight permits only the configured public domain and standard ports', () => {
  assert.equal(validatePublicUrl('https://example.com/'),'https://example.com/');
  for (const url of ['file:///etc/passwd','http://127.0.0.1/','https://example.com:8080/','https://user:pass@example.com/','https://example.com.attacker.invalid/']) assert.throws(()=>validatePublicUrl(url));
});
test('the browser can mount only the private, read-only socket volume', () => {
  const c: any = {State:{Running:false},Config:{User:'1000:1000'},Mounts:[{Type:'volume',Name:'owned-volume',Destination:'/run/kindpath',RW:false}],HostConfig:{NetworkMode:'none',Privileged:false,ReadonlyRootfs:true,AutoRemove:true,IpcMode:'private',CapDrop:['ALL'],Memory:536870912,NanoCpus:1000000000,PidsLimit:256,SecurityOpt:['no-new-privileges:true','seccomp={"defaultAction":"SCMP_ACT_ERRNO"}']}};
  assert.doesNotThrow(()=>assertPublicIsolation([c],'browser','owned-volume'));
  for (const mutate of [
    (v:any)=>{v.Mounts[0].Type='bind';}, (v:any)=>{v.Mounts[0].RW=true;},
    (v:any)=>{v.Mounts[0].Name='unowned-volume';},(v:any)=>{v.HostConfig.NetworkMode='bridge';},
    (v:any)=>{v.HostConfig.CapAdd=['SYS_ADMIN'];},(v:any)=>{v.Mounts.push({Type:'bind',Destination:'/host'});},
  ]) {const copy=structuredClone(c);mutate(copy);assert.throws(()=>assertPublicIsolation([copy],'browser','owned-volume'));}
});

test('public reports require valid coverage and a final allowlisted URL', () => {
  const raw={fixture:'public',url:'https://example.com/',engine:'test',violations:[],incomplete:[],passes:1,inapplicable:0,coverage:{blockedRequests:2,failedRequests:1,omittedRules:0,omittedNodes:0}};
  const report=mapPublicReport(raw);
  assert.equal(report.mode,'public');
  assert.ok(report.limitations.some(limit=>limit.includes('2 requests were blocked')));
  for (const value of [{...raw,url:'http://127.0.0.1/'},{...raw,coverage:null},{...raw,coverage:{blockedRequests:-1,failedRequests:0}}]) assert.throws(()=>mapPublicReport(value));
});

test('public reports disclose truncation and reject missing or malformed omission counts', () => {
  const raw = { fixture: 'public', url: 'https://example.com/', engine: 'test', violations: [], incomplete: [],
    passes: 0, inapplicable: 0, coverage: { blockedRequests: 0, failedRequests: 0, omittedRules: 1, omittedNodes: 25 } };
  assert.ok(mapPublicReport(raw).limitations.some(limit => limit.includes('1 rules and 25 affected elements')));
  for (const key of ['omittedRules', 'omittedNodes']) {
    for (const value of [undefined, null, -1, 0.5, '2', Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => mapPublicReport({ ...raw, coverage: { ...raw.coverage, [key]: value } }));
    }
  }
});
