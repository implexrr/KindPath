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
    <h3 id="export-report-title" className="visually-hidden">Export report</h3>
    <div className="report-export-actions">
      {download ? <a className="secondary" href={download.url} download={download.filename} aria-describedby="export-report-note">Download report JSON</a>
        : <button type="button" className="secondary" disabled>Preparing JSON download…</button>}
      <button type="button" className="secondary" aria-describedby="export-report-note" onClick={() => window.print()}>Print / save as PDF</button>
    </div>
    <p id="export-report-note">Exports include all findings and exclude website previews. For PDF, choose a PDF destination in the print dialog. PDF accessibility tagging varies by browser.</p>
    {error && <p role="alert">{error}</p>}
  </section>;
}
