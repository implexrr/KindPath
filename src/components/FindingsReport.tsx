import { useRef, useState } from 'react';
import type { Finding, Report } from '../../shared/types';

import { severityOrder } from './reportExport';

function ElementGuidance({ finding, review = false }: { finding: Finding; review?: boolean }) {
  return <details className="element-guidance">
    <summary>{review ? 'Inspect elements and review guidance' : 'Affected elements and repair guidance'} ({finding.elements.length})</summary>
    {finding.elements.length ? <ol>{finding.elements.map((element, index) => <li key={index}>
      <p className="element-target"><strong>Element {index + 1}</strong><code>{element.targets.length ? element.targets.join(' → ') : 'Page (no selector provided)'}</code></p>
      <p className="element-summary">{element.guidance}</p>
    </li>)}</ol> : <p>No element details were returned. Review this rule manually.</p>}
  </details>;
}

export function FindingsReport({ report }: { report: Report }) {
  const filter = useRef<HTMLSelectElement>(null);
  const [severity, setSeverity] = useState<Finding['severity'] | 'All'>('All');
  const sorted = [...report.findings].sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity));
  const visible = sorted.filter(finding => severity === 'All' || finding.severity === severity);
  const incomplete = report.scanner?.incomplete ?? [];
  return <div className="findings-layout">
    <div className="findings-main">
      <section aria-labelledby="confirmed-findings-title">
        <div className="finding-intro">
          <h3 id="confirmed-findings-title">{report.mode === 'demo' ? 'Example issues to explore' : 'Confirmed automated violations'}</h3>
          <p>{report.findings.length} {report.mode === 'demo' ? 'example rules' : 'rules with violations'}. Highest impact first; counts refer to rules, not individual elements.</p>
        </div>
        <ul className="severity-counts" aria-label="Violation counts by severity">
          {severityOrder.map(level => <li key={level}><span>{level}</span> <strong>{report.findings.filter(finding => finding.severity === level).length}</strong></li>)}
        </ul>
        <div className="finding-filter">
          <label htmlFor="finding-severity">Filter violations by severity</label>
          <select ref={filter} id="finding-severity" value={severity} onChange={event => setSeverity(event.target.value as Finding['severity'] | 'All')}>
            <option value="All">All severities</option>
            {severityOrder.map(level => <option key={level} value={level}>{level}</option>)}
          </select>
          {severity !== 'All' && <button type="button" className="secondary" onClick={() => { setSeverity('All'); filter.current?.focus(); }}>Clear severity filter</button>}
        </div>
        <p className="finding-status" role="status">Showing {visible.length} of {report.findings.length} {report.mode === 'demo' ? 'example rules' : 'rules with violations'}.</p>
        {report.findings.length === 0 ? <p className="findings-empty">No automated violations were reported. This does not establish accessibility conformance; review the checks below and test manually.</p>
          : visible.length === 0 ? <p className="findings-empty">No violations match this severity. Other findings are still in this report.</p>
          : visible.map(finding => <article className="finding" key={finding.id}>
            <div>
              <span className={`severity ${finding.severity.toLowerCase()}`}>{finding.severity}</span>
              <h4>{finding.title}</h4>
              <p>{finding.impact}</p>
              <ElementGuidance finding={finding}/>
            </div>
          </article>)}
      </section>
      {report.scanner && <section className="review-findings" aria-labelledby="review-findings-title">
        <h3 id="review-findings-title">Checks needing manual review ({incomplete.length})</h3>
        <p>These checks are inconclusive, not confirmed violations. The severity filter above does not hide them.</p>
        {incomplete.length ? incomplete.map(finding => <article className="review-finding" key={finding.id}>
          <span className="review-label">Needs review</span>
          <h4>{finding.title}</h4><p>{finding.impact}</p>
          <ElementGuidance finding={finding} review/>
        </article>) : <p>No inconclusive checks were returned. Keyboard, screen reader, and usability review are still needed.</p>}
      </section>}
    </div>
    <aside className="manual-card">
      <span aria-hidden="true">✳</span>
      <h3>People complete<br/>the picture.</h3>
      <p>Automated checks are a starting point. Make room for manual review and feedback from disabled people.</p>
      {report.limitations && <><h4>Scan limitations</h4><ul>{report.limitations.map(limit => <li key={limit}>{limit}</li>)}</ul></>}
      <h4>Try these checks</h4>
      <ul>{report.manualChecks.map(check => <li key={check}>{check}</li>)}</ul>
    </aside>
  </div>;
}
