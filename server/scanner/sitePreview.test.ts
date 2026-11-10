import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { mapSitePreview } from './sitePreview.js';
const identity = {scanId:'11111111-1111-4111-8111-111111111111',requestedUrl:'https://example.com/start',url:'https://example.com/final'};
const element = (tag: string, children: unknown[] = [], style = {}, hover = {}, attributes = {}) => ({tag,attributes,style,hover,children});
const raw = (nodes: unknown[] = []) => ({url:identity.url,capturedAt:'2026-11-09T00:00:00.000Z',nodes,omittedSubtrees:0,omittedText:0,omittedStyles:0});
test('site snapshots escape text, serialize only inert nodes and bind to the report identity', () => {
  const result = mapSitePreview(raw([element('form',[element('input'),element('button',[{text:'Submit'}])]),
    element('a',[{text:'<script>text only</script>'}],{color:'rgb(0, 0, 0)'},{color:'rgb(255, 0, 0)'})]),identity);
  assert.equal(result.scanId,identity.scanId); assert.equal(result.requestedUrl,identity.requestedUrl); assert.equal(result.url,identity.url);
  assert.match(result.html,/Content-Security-Policy/); assert.match(result.html,/input[^>]* disabled/);
  assert.match(result.html,/button[^>]* disabled/); assert.match(result.html,/aria-disabled="true"/);
  assert.match(result.html,/:hover\{color:rgb\(255, 0, 0\)/); assert.match(result.html,/&lt;script&gt;/);
  assert.doesNotMatch(result.html,/<form|<script|\bhref=/);
});
test('untrusted CSS, executable elements/attributes, inherited names and excessive captures fail closed', () => {
  for (const node of [element('script'),element('iframe'),element('img'),element('constructor'),
    element('a',[],{},{},{href:'https://example.com/'}),element('div',[],{},{},{onclick:'alert(1)'}),
    element('p',[],{'background-color':'url(//example.com/)'}),element('p',[],{color:'red; background:url(//example.com)'}),
    element('p',[],{color:'</style><script>'}),element('p',[],{position:'fixed'}),element('p',[],{constructor:'red'}),
    element('p',[],JSON.parse('{"__proto__":"red"}')),element('p',[],{}, {color:'red'}),{text:'x'.repeat(4001)}]) {
    assert.throws(()=>mapSitePreview(raw([node]),identity),/Invalid site snapshot/);
  }
  assert.throws(()=>mapSitePreview(raw(Array.from({length:301},()=>({text:'x'}))),identity));
  let deep: unknown = {text:'deep'}; for(let i=0;i<17;i++)deep=element('div',[deep]);
  assert.throws(()=>mapSitePreview(raw([deep]),identity));
});
test('preview URL, capture metadata and omission counts must be valid', () => {
  for(const value of [{...raw(),url:identity.requestedUrl},{...raw(),url:'file:///etc/passwd'},
    {...raw(),capturedAt:'invalid'},{...raw(),omittedSubtrees:-1},{...raw(),omittedText:'3'},{...raw(),omittedStyles:null}]) {
    assert.throws(()=>mapSitePreview(value,identity));
  }
  assert.throws(()=>mapSitePreview(raw(),{...identity,scanId:'old'}));
  const result=mapSitePreview({...raw(),omittedSubtrees:2,omittedText:10,omittedStyles:3},identity);
  assert.ok(result.limitations.some(text=>text.includes('2 subtrees, 10 text characters and 3 style declarations')));
});

test('common article and table structure keeps safe semantics and bounded layout styles',()=>{
  const result=mapSitePreview(raw([element('article',[element('h4',[{text:'Details'}]),element('blockquote',[{text:'Quoted text'}]),
    element('table',[element('caption',[{text:'Garden schedule'}]),element('tbody',[element('tr',[
      element('th',[{text:'Day'}],{},{},{scope:'row'}),element('td',[{text:'Monday'}],{},{},{colspan:'2'})])])],{'border-collapse':'collapse','box-sizing':'border-box'}),element('hr')],
    {'display':'grid','grid-template-columns':'200px 300px','white-space':'pre-wrap'})]),identity);
  assert.match(result.html,/<h4/);assert.match(result.html,/<blockquote/);assert.match(result.html,/<table/);
  assert.match(result.html,/scope="row"/);assert.match(result.html,/colspan="2"/);assert.match(result.html,/<hr[^>]*>/);
  assert.match(result.html,/grid-template-columns:200px 300px;/);
  for(const bad of [element('td',[],{},{},{colspan:'0'}),element('td',[],{},{},{rowspan:'101'}),
    element('th',[],{},{},{scope:'script'}),element('div',[],{},{},{colspan:'1'})])assert.throws(()=>mapSitePreview(raw([bad]),identity));
});

test('snapshot text count is derived from accepted text, excluding whitespace, markup and attributes',()=>{
  const result=mapSitePreview(raw([element('p',[{text:'  Tom & Ada\n'},{text:'<test>'}])]),identity);
  assert.equal(result.capturedTextCharacters,13);
  const empty=mapSitePreview({...raw([element('input',[],{},{},{'aria-label':'Not visible text'}),{text:' \n\t '}]),capturedTextCharacters:999},identity);
  assert.equal(empty.capturedTextCharacters,0,'Do not trust a worker-supplied quality count');
  assert.equal(mapSitePreview(raw([{text:'x'.repeat(4000)},{text:'x'.repeat(4000)},{text:'x'.repeat(2000)}]),identity).capturedTextCharacters,10000);
});


test('body appearance uses independently validated CSS without executable resources',()=>{
 const result=mapSitePreview({...raw([{text:'Light text'}]),bodyStyle:{'background-color':'rgb(16, 24, 40)',color:'rgb(248, 250, 252)',padding:'24px','font-size':'24px'}},identity);
 assert.match(result.html,/body\{[^}]*background-color:rgb\(16, 24, 40\)/);
 assert.equal(result.capturedTextCharacters,9);
 for(const bodyStyle of [null,[],{background:'url(https://example.com/private)'},{color:'red; background:url(//example.com)'},{position:'fixed'},{color:'</style><script>'}]) {
  assert.throws(()=>mapSitePreview({...raw(),bodyStyle},identity),/Invalid site snapshot/);
 }
});
test('passive text markup is retained while raw component tags and active elements remain rejected',()=>{
 const result=mapSitePreview(raw([element('p',[element('b',[{text:'Bold'}]),element('i',[{text:'Italic'}]),element('time',[{text:'Today'}])]),element('pre',[element('code',[{text:'a < b\n  next'}])])]),identity);
 assert.match(result.html,/<b/);assert.match(result.html,/<i/);assert.match(result.html,/<time/);assert.match(result.html,/<pre/);assert.match(result.html,/<code[^>]*>a &lt; b\n  next/);
 for(const tag of ['kindpath-card','textarea','select','option','template','script','style','svg','iframe'])assert.throws(()=>mapSitePreview(raw([element(tag,[{text:'Excluded'}])]),identity));
});

// Generated from controlled project content; real image decoding is also checked in the browser suite.
const jpeg=readFileSync(new URL('../fixtures/preview.jpg',import.meta.url)).toString('base64');
const image=()=>({kind:'image',url:identity.url,capturedAt:'2026-11-10T00:00:00.000Z',width:1280,height:1800,truncated:false,image:jpeg,links:[{x:1,y:2,width:10,height:10}]});
test('image snapshots accept only bounded embedded JPEGs and inert geometry',()=>{
 const result=mapSitePreview(image(),identity);assert.equal(result.kind,'image');assert.equal(result.width,1280);
 assert.match(result.html,/img-src data:/);assert.match(result.html,/data:image\/jpeg;base64,/);assert.match(result.html,/kp-link/);
 assert.doesNotMatch(result.html,/<script|<iframe|\bhref=|\bonerror=/);
 for(const bad of [{width:65},{width:1281},{height:6001},{image:'PHN2Zz4='},{image:'AA=='},{image:jpeg+'==='},
   {image:'A'.repeat(2000001)},{truncated:'false'},{truncated:true},{links:[{x:-1,y:0,width:1,height:1}]},
   {links:[{x:1279,y:0,width:2,height:1}]},{links:[{x:0,y:0,width:1,height:1,url:'https://example.org/'}]},
   {links:Array(201).fill({x:0,y:0,width:1,height:1})}])assert.throws(()=>mapSitePreview({...image(),...bad},identity));
});
