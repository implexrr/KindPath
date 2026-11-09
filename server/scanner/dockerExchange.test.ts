import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exchangeDockerJson } from './dockerExchange.js';

test('owned gateway JSON exchange serializes approvals and strips host environment', async () => {
  const messages: unknown[]=[];
  await exchangeDockerJson(process.execPath,['-e',`if(['HOME','DOCKER_HOST','GITHUB_TOKEN','NODE_OPTIONS'].some(k=>process.env[k]!==undefined))process.exit(2);process.stdout.write('{"id":1,"host":"example.org"}\\n');process.stdin.once('data',data=>{if(JSON.parse(data).id!==1)process.exit(3);process.exit(0);});`],async message=>{messages.push(message);return {id:1,addresses:['93.184.216.34']};},AbortSignal.timeout(2000));
  assert.deepEqual(messages,[{id:1,host:'example.org'}]);
});
test('malformed and oversized gateway output cannot reach the approval handler', async () => {
  for(const script of [`process.stdout.write('bad-json\\n');`,`process.stdout.write('x'.repeat(9000));`]) {
    await assert.rejects(exchangeDockerJson(process.execPath,['-e',script],async()=>assert.fail('Malformed protocol approved'),AbortSignal.timeout(2000)));
  }
});
test('cancellation settles an in-flight approval before exchange cleanup returns', async () => {
  const abort=new AbortController();let began!:()=>void,release!:()=>void;
  const started=new Promise<void>(resolve=>began=resolve),hold=new Promise<void>(resolve=>release=resolve);
  const run=exchangeDockerJson(process.execPath,['-e',`process.stdout.write('{"id":1}\\n');setInterval(()=>{},1000);`],async()=>{began();await hold;return {id:1};},abort.signal);
  const rejected=assert.rejects(run);let settled=false;void rejected.then(()=>settled=true);
  await started;abort.abort();await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);
  release();await rejected;
});
