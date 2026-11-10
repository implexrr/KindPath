import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

function readFlags(flags:Record<string,string>={}){
 const env={...process.env};delete env.KINDPATH_PUBLIC_SCANNING;delete env.KINDPATH_PUBLIC_CAPTURE;
 const moduleUrl=new URL('./publicPolicy.ts',import.meta.url).href;
 const script=`const m=await import(${JSON.stringify(moduleUrl)});console.log(JSON.stringify([m.PUBLIC_SCANNING_ENABLED,m.PUBLIC_CAPTURE_ENABLED]));`;
 return spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',script],{
  env:{...env,...flags},encoding:'utf8',timeout:5000,maxBuffer:64000,
 });
}
test('fresh processes enable local defaults and honor explicit boolean feature flags',()=>{
 for(const [flags,expected] of [
  [{},[true,true]],
  [{KINDPATH_PUBLIC_SCANNING:'false',KINDPATH_PUBLIC_CAPTURE:'true'},[false,true]],
  [{KINDPATH_PUBLIC_SCANNING:'true',KINDPATH_PUBLIC_CAPTURE:'false'},[true,false]],
 ] as const){const result=readFlags(flags);assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),expected);}
});
test('invalid feature flags stop startup without echoing their values or enabling scanning',()=>{
 for(const key of ['KINDPATH_PUBLIC_SCANNING','KINDPATH_PUBLIC_CAPTURE'])for(const value of ['0','FALSE','','PRIVATE_SENTINEL']){
  const result=readFlags({[key]:value});assert.notEqual(result.status,0,key);
  assert.equal(result.stdout,'');assert.ok(result.stderr.includes(key));assert.doesNotMatch(result.stderr,/PRIVATE_SENTINEL/);
 }
});
