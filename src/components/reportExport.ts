import { fixtureTitle, isFixture } from '../../shared/fixtures';
import type { Finding, Report } from '../../shared/types';

export const severityOrder: Finding['severity'][] = ['Critical', 'Serious', 'Moderate', 'Minor', 'Unknown'];

export function reportSource(report: Report) {
  if (report.mode === 'demo') return {
    label: 'Illustrative report', page: report.url,
    description: 'These are example findings. The submitted URL was not fetched or assessed.',
  };
  if (report.mode === 'fixture') return {
    label: 'Real fixture scan',
    page: isFixture(report.scanner?.fixture) ? fixtureTitle(report.scanner.fixture) : report.url,
    description: 'Real automated results for a built-in page. No submitted public website was fetched.',
  };
  return { label: 'Automated page scan', page: report.url, description: 'Automated results for the final scanned page only; this may differ from the requested URL after a redirect.' };
}

// Project the known report fields explicitly. Preview HTML and incidental UI/server fields are not exported.
function copyFinding(finding: Finding): Finding {
  return { id: finding.id, severity: finding.severity, title: finding.title, impact: finding.impact,
    elements: finding.elements.map(element => ({ targets: [...element.targets], guidance: element.guidance })) };
}
export function createReportExport(report: Report) {
  const source = reportSource(report);
  const limitations = [...new Set([
    source.description,
    'Automated checks do not establish accessibility conformance. Keyboard, screen reader, and usability review remain essential.',
    ...(report.mode === 'fixture' ? ['Scanner output is bounded to 100 rules per category and 20 elements per rule. Counts describe returned results.'] : []),
    ...(report.limitations ?? []),
  ])];
  const exported: Report = {
    mode: report.mode, url: report.url, generatedAt: report.generatedAt,
    ...(report.mode === 'public' && report.requestedUrl ? { requestedUrl: report.requestedUrl } : {}),
    manualChecks: [...report.manualChecks], findings: report.findings.map(copyFinding), limitations,
    ...(report.scanner ? { scanner: {
      engineVersion: report.scanner.engineVersion, fixture: report.scanner.fixture,
      incomplete: report.scanner.incomplete.map(copyFinding), passedChecks: report.scanner.passedChecks,
      inapplicableChecks: report.scanner.inapplicableChecks,
    } } : {}),
  };
  return { application: 'KindPath', formatVersion: 1 as const, source, report: exported };
}
export function reportFilename(report: Report): string {
  const date = new Date(report.generatedAt);
  const timestamp = Number.isFinite(date.getTime()) ? date.toISOString().replace(/[:.]/g, '-') : 'undated';
  return `kindpath-${report.mode}-report-${timestamp}.json`;
}
