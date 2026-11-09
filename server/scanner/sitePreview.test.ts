import { test } from 'node:test';
import assert from 'node:assert/strict';
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
