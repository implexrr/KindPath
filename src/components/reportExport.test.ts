import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReportExport, reportFilename } from './reportExport.js';
import { createDemoReport } from '../../server/services/analyze.js';
import type { Report } from '../../shared/types.js';

const fixture = (): Report => ({ ...createDemoReport(new URL('https://example.com')), mode: 'fixture', url: 'fixture:barriers',
  scanner: { fixture: 'barriers', engineVersion: 'test', incomplete: [{ id: 'review', severity: 'Unknown', title: 'Review contrast', impact: 'Inconclusive', elements: [] }], passedChecks: 4, inapplicableChecks: 2 },
  limitations: ['A controlled limitation'],
});
test('export retains every rule, element, review check and limitation independently of UI filtering', () => {
  const report = fixture();
  const exported = createReportExport(report);
  assert.equal(exported.formatVersion, 1);
  assert.equal(exported.source.label, 'Real fixture scan');
  assert.equal(exported.source.page, 'Garden form with barriers');
  assert.deepEqual(exported.report.findings, report.findings);
  assert.deepEqual(exported.report.scanner, report.scanner);
  assert.deepEqual(exported.report.manualChecks, report.manualChecks);
  assert.equal(exported.report.generatedAt, report.generatedAt);
  assert.ok(exported.report.limitations?.includes('A controlled limitation'));
  assert.ok(exported.report.limitations?.some(text => text.includes('do not establish accessibility conformance')));
  exported.report.findings[0].elements[0].targets.push('changed');
  assert.equal(report.findings[0].elements[0].targets.length, 1);
});
test('explicit projection omits incidental fields while preserving guidance as JSON text', () => {
  const report = fixture();
  Object.assign(report, { html: '<script>private preview</script>', token: 'incidental-test-marker' });
  Object.assign(report.findings[0], { html: 'raw node' });
  report.findings[0].elements[0].guidance = '<img src=x onerror=alert(1)>\nRepair guidance';
  const text = JSON.stringify(createReportExport(report));
  assert.ok(!text.includes('incidental-test-marker') && !text.includes('raw node') && !text.includes('private preview'));
  assert.equal(JSON.parse(text).report.findings[0].elements[0].guidance, report.findings[0].elements[0].guidance);
});
test('demo and empty reports preserve source disclosures and safe filenames', () => {
  const report = createDemoReport(new URL('https://example.com/path?name=private'));
  report.generatedAt = '2026-11-08T12:34:56.000Z';
  const exported = createReportExport(report);
  assert.equal(exported.source.label, 'Illustrative report');
  assert.match(exported.source.description, /not fetched or assessed/);
  assert.equal(reportFilename(report), 'kindpath-demo-report-2026-11-08T12-34-56-000Z.json');
  assert.equal(reportFilename({ ...report, generatedAt: 'invalid' }), 'kindpath-demo-report-undated.json');
  const empty = fixture(); empty.findings = []; empty.scanner!.incomplete = [];
  assert.deepEqual(createReportExport(empty).report.findings, []);
  assert.deepEqual(createReportExport(empty).report.scanner?.incomplete, []);
});

test('public exports retain requested and final URLs without changing demo or fixture sources', () => {
  const report: Report = { ...fixture(), mode: 'public', requestedUrl: 'https://example.com/start', url: 'https://example.com/final' };
  const result = createReportExport(report);
  assert.equal(result.source.label, 'Automated page scan');
  assert.equal(result.source.page, report.url);
  assert.equal(result.report.requestedUrl, report.requestedUrl);
  assert.equal(result.report.url, report.url);
  assert.match(result.source.description, /final scanned page/);
  const builtIn = fixture(); builtIn.requestedUrl = 'incidental-test-marker';
  assert.equal(createReportExport(builtIn).report.requestedUrl, undefined);
  assert.match(reportFilename(report), /^kindpath-public-report-/);
});
