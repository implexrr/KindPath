import type { Report } from '../../shared/types';

export function FindingsReport({ report }: { report: Report }) {
  return <div className="findings-layout">
    <div>
      <div className="finding-intro">
        <h3>{report.mode === 'fixture' ? `${report.findings.length} automated findings` : `${report.findings.length} example issues to explore`}</h3>
        <p>Start with the barriers that can have the greatest impact.</p>
      </div>
      {report.findings.map((finding, index) => <article className="finding" key={finding.id}>
        <div className="finding-number">0{index + 1}</div>
        <div>
          <span className={`severity ${finding.severity.toLowerCase()}`}>{finding.severity}</span>
          <h3>{finding.title}</h3>
          <p className="location">{finding.location}</p>
          <p>{finding.impact}</p>
          <details>
            <summary>How to improve this</summary>
            <p>{finding.fix}</p>
          </details>
        </div>
      </article>)}
    </div>
    <aside className="manual-card">
      <span aria-hidden="true">✳</span>
      <h3>People complete<br/>the picture.</h3>
      <p>Automated checks are a starting point. Make room for manual review and feedback from disabled people.</p>
      {report.mode === 'fixture' && report.scanner && <>
        <p>axe-core {report.scanner.engineVersion} · {report.scanner.passedChecks} checks passed. Zero findings would not establish accessibility conformance.</p>
        <h4>{report.scanner.incomplete.length} automated checks need review</h4>
        <ul>{report.scanner.incomplete.map(finding => <li key={finding.id}>{finding.title}: {finding.location}</li>)}</ul>
      </>}
      <h4>Try these checks</h4>
      <ul>{report.manualChecks.map(check => <li key={check}>{check}</li>)}</ul>
    </aside>
  </div>;
}
