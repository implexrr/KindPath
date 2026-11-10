import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {installNavigationGuard} from './navigation-guard.mjs';

async function harness() {
  const session=new EventEmitter(), commands=[];
  session.send=async(method,params)=>{commands.push({method,params});return {frameTree:{frame:{id:'main'}}};};
  let scanning=false, changed=false, closed=false;
  const state=await installNavigationGuard({context:()=>({newCDPSession:async()=>session}),close:async()=>{closed=true;}},'https://example.com/',{
    isScanning:()=>scanning,onPageChange:()=>{changed=true;},
  });
  let id=0;
  const pause=async(url='https://example.com/',extra={})=>{
    session.emit('Fetch.requestPaused',{frameId:'main',requestId:'fetch-'+(++id),networkId:'network-1',request:{url},...extra});
    await new Promise(resolve=>setImmediate(resolve));
    return commands.at(-1);
  };
  return {state,pause,session,scan:()=>{scanning=true;},changed:()=>changed,closed:()=>closed};
}

test('repeated interception of one network request is not a redirect loop',async()=>{
  const h=await harness();
  await h.pause();assert.equal((await h.pause()).method,'Fetch.continueRequest');
  assert.equal(h.state.failure,undefined);assert.equal(h.state.lastUrl,'https://example.com/');
});
test('a real same-URL redirect is rejected even when Chromium reuses its network ID',async()=>{
  const h=await harness();await h.pause();
  assert.equal((await h.pause(undefined,{redirectedRequestId:'fetch-1'})).method,'Fetch.failRequest');
  assert.equal(h.state.failure,'REDIRECT_LOOP');
});
test('a new request reloading a visited URL is still rejected',async()=>{
  const h=await harness();await h.pause();await h.pause(undefined,{networkId:'network-2'});
  assert.equal(h.state.failure,'REDIRECT_LOOP');
});
test('missing network IDs cannot grant a duplicate-request exception',async()=>{
  const h=await harness();await h.pause(undefined,{networkId:undefined});await h.pause(undefined,{networkId:undefined});
  assert.equal(h.state.failure,'REDIRECT_LOOP');
});
test('duplicate interception never bypasses URL policy or analysis stability',async()=>{
  for(const [url,code] of [['https://other.example.com/','REDIRECT_HOST_CHANGED'],['http://example.com/','REDIRECT_DOWNGRADE']]){
    const h=await harness();await h.pause();await h.pause(url);assert.equal(h.state.failure,code);
  }
  const h=await harness();await h.pause();h.scan();
  assert.equal((await h.pause()).method,'Fetch.failRequest');assert.equal(h.changed(),true);
});
test('lost interception still closes the page and fails closed',async()=>{
  const h=await harness();h.session.emit('close');assert.equal(h.state.failed,true);assert.equal(h.closed(),true);
});

test('canonical redirects are allowed but cannot exceed ten document requests',async()=>{
  const h=await harness();await h.pause();
  for(let i=1;i<10;i++)await h.pause('https://example.com/locale?page='+i,{redirectedRequestId:'previous'});
  assert.equal(h.state.failure,undefined);
  await h.pause('https://example.com/locale?page=10',{redirectedRequestId:'previous'});
  assert.equal(h.state.failure,'REDIRECT_LIMIT');
});

test('one browser restart may replay the original chain without masking server loops',async()=>{
  const h=await harness();await h.pause();
  await h.pause('https://example.com/questions',{redirectedRequestId:'fetch-1'});
  await h.pause();
  await h.pause('https://example.com/questions',{redirectedRequestId:'fetch-3'});
  assert.equal(h.state.failure,undefined);
  await h.pause();assert.equal(h.state.failure,'REDIRECT_LOOP','Only one chain restart is allowed');
  const loop=await harness();await loop.pause();
  await loop.pause('https://example.com/questions',{redirectedRequestId:'fetch-1'});
  await loop.pause(undefined,{redirectedRequestId:'fetch-2'});
  assert.equal(loop.state.failure,'REDIRECT_LOOP','A linked server redirect back must still fail');
});
test('a browser restart does not reset the overall document budget',async()=>{
  const h=await harness();await h.pause();
  for(let i=1;i<9;i++)await h.pause('https://example.com/page'+i,{redirectedRequestId:'previous'});
  await h.pause();assert.equal(h.state.failure,undefined);
  await h.pause('https://example.com/final',{redirectedRequestId:'previous'});
  assert.equal(h.state.failure,'REDIRECT_LIMIT');
});
