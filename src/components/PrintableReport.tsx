import type { Finding, Report } from '../../shared/types';
import { ScanCoverageNotice } from './ScanCoverageNotice';
import { createReportExport, severityOrder } from './reportExport';

function PrintedFinding({ finding }: { finding: Finding }) {
  return <article className="printed-finding">
    <h3>{finding.title}</h3><p><strong>Severity:</strong> {finding.severity} · Rule: {finding.id}</p>
    <p>{finding.impact}</p>
    {finding.elements.length ? <ol>{finding.elements.map((element, index) => <li key={index}>
      <h4>Element {index + 1}</h4><code>{element.targets.join(' → ') || 'Page (no selector provided)'}</code>
      <p className="printed-guidance">{element.guidance}</p>
    </li>)}</ol> : <p>No element details were returned. Review this rule manually.</p>}
  </article>;
}

export function PrintableReport({ report }: { report: Report }) {
  const exported = createReportExport(report);
  const complete = exported.report;
  const sorted = [...complete.findings].sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity));
  return <article className="print-report" aria-label="Complete printable accessibility report">
    <header><p>KindPath · {exported.source.label}</p><h1>Accessibility report</h1>
      <p><strong>Source:</strong> {exported.source.page}</p>
      <p><strong>{report.mode === 'fixture' ? 'Fixture identifier' : report.mode === 'public' ? 'Scanned page' : 'Submitted URL'}:</strong> {complete.url}</p>
      {complete.mode === 'public' && complete.requestedUrl && <p><strong>Requested URL:</strong> {complete.requestedUrl}</p>}
      <p><strong>Report generated:</strong> <time dateTime={complete.generatedAt}>{complete.generatedAt}</time></p>
      <p>{exported.source.description}</p>
      <p>Complete report · All returned findings and element guidance are included, regardless of the on-screen filter. Preview snapshots and visual effects are excluded.</p>
    </header>
    <ScanCoverageNotice report={complete}/>
    <section><h2>{report.mode === 'demo' ? 'Example findings' : 'Confirmed automated violations'} ({sorted.length})</h2>
      <p>Counts refer to rules, not individual elements.</p>
      {sorted.length ? sorted.map(finding => <PrintedFinding key={finding.id} finding={finding}/>)
        : <p>No automated violations were reported. This does not establish accessibility conformance.</p>}
    </section>
    {complete.scanner && <section><h2>Checks needing manual review ({complete.scanner.incomplete.length})</h2>
      <p>These checks are inconclusive, not confirmed violations.</p>
      {complete.scanner.incomplete.length ? complete.scanner.incomplete.map(finding => <PrintedFinding key={finding.id} finding={finding}/>)
        : <p>No inconclusive checks were returned. Manual evaluation is still needed.</p>}
      <p>axe-core {complete.scanner.engineVersion} · {complete.scanner.passedChecks} checks passed · {complete.scanner.inapplicableChecks} checks inapplicable.</p>
    </section>}
    <section><h2>Manual checks</h2><ul>{complete.manualChecks.map(check => <li key={check}>{check}</li>)}</ul></section>
    <section><h2>Scope and limitations</h2><ul>{complete.limitations?.map(limit => <li key={limit}>{limit}</li>)}</ul></section>
  </article>;
}
