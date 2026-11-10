import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasMatchingCaptureResult, hasMatchingSitePreview, previewTextFeedback } from './sitePreview.js';
import { createReportExport } from './reportExport.js';
import { mapSitePreview } from '../../server/scanner/sitePreview.js';
import { createDemoReport } from '../../server/services/analyze.js';
import type { Report } from '../../shared/types.js';
const identity={scanId:'11111111-1111-4111-8111-111111111111',requestedUrl:'https://example.com/start',url:'https://example.com/final'};
const preview=mapSitePreview({url:identity.url,capturedAt:'2026-11-09T00:00:00.000Z',nodes:[{text:'Captured marker'}],omittedSubtrees:0,omittedText:0,omittedStyles:0},identity);
const report: Report={...createDemoReport(new URL(identity.url)),mode:'public',...identity,sitePreview:preview};
test('site previews require the same scan, requested URL and final page as their report',()=>{
  assert.equal(hasMatchingSitePreview(report),true);
  for(const change of [{scanId:'22222222-2222-4222-8222-222222222222'},{requestedUrl:'https://example.com/old'},
    {url:'https://example.com/other'},{mode:'fixture'},{html:'<script>unsafe</script>'},{capturedAt:'invalid'},
    {title:'Unrelated page'},{limitations:[]},{html:'x'.repeat(100001)}]) {
    assert.equal(hasMatchingSitePreview({...report,sitePreview:{...preview,...change}} as Report),false);
  }
  assert.equal(hasMatchingSitePreview({...report,sitePreview:undefined}),false);
});
test('report exports exclude captured content and ephemeral scan identifiers',()=>{
  const exported=createReportExport(report);
  assert.equal(exported.report.url,report.url);assert.equal(exported.report.requestedUrl,report.requestedUrl);
  assert.equal(exported.report.sitePreview,undefined);assert.equal(exported.report.scanId,undefined);
  assert.ok(!JSON.stringify(exported).includes('Captured marker'));
  assert.ok(!JSON.stringify(exported).includes('capturedTextCharacters'));
});

test('empty previews are unavailable while sparse previews remain a caution rather than a failure',()=>{
  assert.equal(previewTextFeedback(0)?.kind,'empty');
  assert.match(previewTextFeedback(0)!.message,/findings and report exports are still available/);
  for(const value of [1,15,99])assert.equal(previewTextFeedback(value)?.kind,'sparse');
  assert.match(previewTextFeedback(15)!.message,/page may simply be short/);
  for(const value of [100,10000])assert.equal(previewTextFeedback(value),undefined);
});
test('missing and malformed quality hints stay unknown without rejecting an otherwise matching report',()=>{
  for(const value of [undefined,null,-1,1.5,NaN,Infinity,10001,'0','constructor','__proto__',{}]) {
    assert.equal(previewTextFeedback(value)?.kind,'unknown');
    assert.equal(hasMatchingSitePreview({...report,sitePreview:{...preview,capturedTextCharacters:value as any}}),true);
  }
});

test('capture failures and capture-disabled results still require valid public scan identities',()=>{
 const unavailable={...report,sitePreview:undefined,previewUnavailable:true};
 const withoutCapture={...report,sitePreview:undefined};
 assert.equal(hasMatchingCaptureResult(report,true),true);
 assert.equal(hasMatchingCaptureResult(unavailable,true),true);
 assert.equal(hasMatchingCaptureResult(withoutCapture,false),true);
 for(const scanId of [undefined,null,'old','constructor',123]){
  assert.equal(hasMatchingCaptureResult({...unavailable,scanId} as Report,true),false);
  assert.equal(hasMatchingCaptureResult({...withoutCapture,scanId} as Report,false),false);
 }
 for(const value of [{...unavailable,sitePreview:preview},{...unavailable,previewUnavailable:false},{...unavailable,mode:'demo'}])assert.equal(hasMatchingCaptureResult(value as Report,true),false);
 assert.equal(hasMatchingCaptureResult(unavailable,false),false);
 assert.equal(hasMatchingCaptureResult(report,false),false);
});

test('visual filters stay inside the guarded preview document', async()=>{
  const {snapshotDocument}=await import('./snapshotDocument.js');
  const {applyVisionPreset}=await import('./visualEffects.js');
  const settings=applyVisionPreset('red-green');
  const original=snapshotDocument(preview,false,settings,'vision-test',false);
  assert.ok(original.endsWith(preview.html));assert.ok(!original.includes('feColorMatrix'));
  const modified=snapshotDocument(preview,true,settings,'vision-test',false);
  assert.ok(modified.includes('<body style="filter:url(#vision-test)">'));
  assert.ok(modified.includes('<filter id="vision-test"'));
  assert.ok(modified.includes("script-src 'none'"));assert.ok(modified.includes("connect-src 'none'"));
  assert.ok(!modified.includes('<script'));
  const neutral=snapshotDocument(preview,true,applyVisionPreset('original'),'vision-test',false);
  assert.equal(neutral,original);
});

test('JSON export retains the explicit partial-loading marker',()=>{
  const exported=createReportExport({...report,pageLoadIncomplete:true,limitations:['The page was partially loaded.']});
  assert.equal(exported.report.pageLoadIncomplete,true);assert.ok(exported.report.limitations?.includes('The page was partially loaded.'));
});
