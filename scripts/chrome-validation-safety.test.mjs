import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readdir,rm,symlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {allowsUiRequest,createValidationDirectory,readValidationBody,assertColourPixel} from './chrome-validation-safety.mjs';

test('Chrome relay permits only the intended loopback UI routes',()=>{
 for(const path of ['/','/src/App.tsx','/node_modules/.vite/deps/react.js','/@vite/client'])assert.equal(allowsUiRequest('http://127.0.0.1:5173'+path,'GET'),true);
 assert.equal(allowsUiRequest('http://127.0.0.1:5173/api/scan-public','POST'),true);
 for(const [url,method] of [
  ['https://example.com/src/App.tsx','GET'],['http://127.0.0.1:3001/src/App.tsx','GET'],
  ['http://127.0.0.1:5173/@fs/private/file','GET'],['http://127.0.0.1:5173/AGENTS.md','GET'],
  ['http://127.0.0.1:5173/logs/profile/Preferences','GET'],['http://127.0.0.1:5173/src/%2e%2e%2flogs/private','GET'],
  ['http://127.0.0.1:5173/src/%252e%252e%252flogs/private','GET'],
  ['http://127.0.0.1:5173/api/scan-fixture','POST'],['http://127.0.0.1:5173/api/scan-public','DELETE'],
 ])assert.equal(allowsUiRequest(url,method),false);
});

test('output creation rejects symlinks before writing beyond the designated project',async()=>{
 const logs=fileURLToPath(new URL('../logs/',import.meta.url));await mkdir(logs,{recursive:true});
 const temporary=await mkdtemp(join(logs,'chrome-path-test-'));
 try{
  const project=join(temporary,'project'),outside=join(temporary,'other-fixture');await mkdir(project);await mkdir(outside);
  await symlink(outside,join(project,'logs'),'dir');
  await assert.rejects(createValidationDirectory(project),/symbolic links/);assert.deepEqual(await readdir(outside),[]);
  await rm(join(project,'logs'));await mkdir(join(project,'logs'));
  await symlink(outside,join(project,'logs','chrome-validation'),'dir');
  await assert.rejects(createValidationDirectory(project),/symbolic links/);assert.deepEqual(await readdir(outside),[]);
  await rm(join(project,'logs','chrome-validation'));
  assert.ok((await createValidationDirectory(project)).startsWith(join(project,'logs','chrome-validation','run-')));
 }finally{await rm(temporary,{recursive:true,force:true});}
});

test('relay body limit stops reading and cancels an oversized response',async()=>{
 assert.equal((await readValidationBody(new Response('valid'),5)).toString(),'valid');
 let reads=0,cancelled=false;
 const body=new ReadableStream({pull(controller){reads++;controller.enqueue(new Uint8Array(4));},cancel(){cancelled=true;}},{highWaterMark:0});
 await assert.rejects(readValidationBody(new Response(body),5),/exceeds/);
 assert.equal(reads,2);assert.equal(cancelled,true);
});

test('unchanged colour pixels cannot pass merely by falling within numerical tolerance',()=>{
 const original=[200,40,40],expected=[194,45,42];
 assert.throws(()=>assertColourPixel(original,expected,original),/must change/);
 assert.doesNotThrow(()=>assertColourPixel(original,expected,expected));
 assert.throws(()=>assertColourPixel(original,expected,[100,100,100]),/does not match/);
});
