import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasMatchingSitePreview } from './sitePreview.js';
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
});
