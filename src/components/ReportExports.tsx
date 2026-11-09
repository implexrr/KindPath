import { useEffect, useState } from 'react';
import type { Report } from '../../shared/types';
import { createReportExport, reportFilename } from './reportExport';

export function ReportExports({ report }: { report: Report }) {
  const [download, setDownload] = useState<{ url: string; filename: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let url: string | undefined;
    setDownload(null); setError('');
    try {
      const json = JSON.stringify(createReportExport(report), null, 2) + '\n';
      url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
      setDownload({ url, filename: reportFilename(report) });
    } catch { setError('The JSON download could not be prepared. Reload the page and generate the report again.'); }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [report]);
  return <section className="report-exports" aria-labelledby="export-report-title">
    <div><h3 id="export-report-title">Take your report with you</h3>
      <p id="export-report-note">Both exports include the full report, regardless of the severity filter. Website previews and visual effects are not included.</p>
      <p>To save a PDF, choose the PDF destination in your browser’s print dialog.</p></div>
    <div className="report-export-actions">
      {download ? <a className="secondary" href={download.url} download={download.filename} aria-describedby="export-report-note">Download report JSON</a>
        : <button type="button" className="secondary" disabled>Preparing JSON download…</button>}
      <button type="button" className="secondary" aria-describedby="export-report-note" onClick={() => window.print()}>Print / save as PDF</button>
    </div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
