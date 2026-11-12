import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { navigationRejection } from '../scanner/gateway/navigation.mjs';
import { websiteUrl } from '../scanner/gateway/url.mjs';
import { scanPageNoticeText } from '../shared/scanPageNotice';
import type { Report } from '../shared/types';
import { normalizeWebsiteEntry } from './components/websiteEntry';
import { scanFailureFeedback } from './components/scanFeedback';
import type { ScanFailureFeedback } from './components/scanFeedback';
import { WebsiteForm } from './components/WebsiteForm';
import { ReportExports } from './components/ReportExports';
import { ScanCoverageNotice } from './components/ScanCoverageNotice';
import { PrintableReport } from './components/PrintableReport';
import { FindingsReport } from './components/FindingsReport';
import { LandingComparison } from './components/LandingComparison';
import { SiteVisualPreview } from './components/SiteVisualPreview';
import { hasMatchingCaptureResult } from './components/sitePreview';


export function App() {
  const [url, setUrl] = useState('');
  const [capabilitiesReady,setCapabilitiesReady]=useState(false);
  const [publicEnabled, setPublicEnabled] = useState(false);
  const [publicCaptureEnabled,setPublicCaptureEnabled] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/scanning-capabilities', { signal: AbortSignal.any([abort.signal,AbortSignal.timeout(10000)]) }).then(response => {
      if (!response.ok) throw new Error('Capabilities unavailable');
      return response.json();
    }).then(data => {
      if(abort.signal.aborted)return;
      if (data.urlPolicy === 'public-http-https') {
        setPublicEnabled(data.publicScanningEnabled === true);
        setPublicCaptureEnabled(data.publicScanningEnabled === true && data.publicCaptureEnabled === true);
      }
    }).catch(() => {}).finally(()=>{if(!abort.signal.aborted)setCapabilitiesReady(true);}); // Fail closed; the server gate remains authoritative.
    return () => abort.abort();
  }, []);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastAttempt,setLastAttempt] = useState<string | null>(null);
  const [cancelled,setCancelled] = useState(false);
  const [failure, setFailure] = useState<ScanFailureFeedback | null>(null);
  const [view, setView] = useState<'findings' | 'preview'>('findings');
  const results = useRef<HTMLElement>(null);
  // Focus only after React has committed the new report and its result element exists.
  useLayoutEffect(() => {
    if (!report) return;
    results.current?.focus();
    results.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, [report]);

  const analysisRequest = useRef<AbortController | null>(null);
  useEffect(() => () => analysisRequest.current?.abort(), []);
  function cancel() {
    if (!analysisRequest.current) return;
    const pending = analysisRequest.current; analysisRequest.current = null; pending.abort();
    setBusy(false); setReport(null); setFailure(null); setCancelled(true);
  }
  function changeUrl(value: string) {
    setUrl(value); setReport(null); setFailure(null); setCancelled(false); setLastAttempt(null); setView('findings');
  }
  async function analyze(value: string) {
    if (analysisRequest.current || !capabilitiesReady) return;
    const abort = new AbortController();
    analysisRequest.current = abort;
    setBusy(true); setFailure(null); setReport(null); setView('findings'); setCancelled(false);
    setLastAttempt(value);
    let timeout: AbortSignal | undefined;
    try {
      value = websiteUrl(normalizeWebsiteEntry(value)).href;
      setLastAttempt(value);
      if (!publicEnabled) throw new Error('Website scanning is unavailable.');
      timeout = AbortSignal.timeout(90000);
      const response = await fetch('/api/scan-public', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: value }),
        signal: AbortSignal.any([abort.signal, timeout]),
      });
      let data;
      try { data = await response.json(); }
      catch (cause) {
        if (timeout.aborted) throw cause;
        if (abort.signal.aborted || analysisRequest.current !== abort) return;
        const { retryable } = scanFailureFeedback(undefined, response.status);
        setFailure({ message: 'The response could not be read. No report was received.', retryable });
        return;
      }
      if (abort.signal.aborted || analysisRequest.current !== abort) return;
      if (!response.ok) {
        setFailure(scanFailureFeedback(data, response.status));
        return;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.mode !== 'public') {
        throw new Error('The report did not match the requested scan.');
      }
      let matches = false;
      try {
        // Bind the result to the submitted URL and the allowed single-page navigation.
        const scanned = websiteUrl(data.url);
        matches = data.requestedUrl === value && data.url === scanned.href
          && !navigationRejection(value, scanned.href);
      } catch { /* Reject malformed report URLs without displaying their contents. */ }
      if (!matches) throw new Error('The report did not match the requested website.');
      if (!hasMatchingCaptureResult(data, publicCaptureEnabled)) {
        throw new Error('The website snapshot did not match this scan.');
      }
      setUrl(value);
      setReport(data); setView('findings');
    } catch (cause) {
      if (abort.signal.aborted || analysisRequest.current !== abort) return;
      if (timeout?.aborted) {
        setFailure({ message: 'The request timed out. Try again shortly.', retryable: true });
      } else if (timeout && cause instanceof TypeError) {
        setFailure({ message: 'KindPath could not reach the scanner. Check your connection and try again.', retryable: true });
      } else {
        setFailure({
          message: cause instanceof Error ? cause.message : 'The scan could not finish. No report was created.',
          retryable: false,
        });
      }
    } finally {
      if (analysisRequest.current === abort) { analysisRequest.current = null; setBusy(false); }
    }
  }
  function submit(event: FormEvent) { event.preventDefault(); void analyze(url); }

  const pageNotice = report?.mode === 'public' ? scanPageNoticeText(report.pageNotice) : undefined;

  return <>
    {report && <PrintableReport report={report}/>}
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <a className="brand" href="#"><span className="brand-icon" aria-hidden="true">k<span>↗</span></span>KindPath</a>
    </header>
    <main id="main" tabIndex={-1}>
      <section className="hero" aria-labelledby="landing-title">
        <h1 id="landing-title">A clearer web.<br/><em>For everyone.</em></h1>
        <div className="hero-copy">
          <p>Scan a public webpage for accessibility issues and see how it looks with different vision settings.</p>
          <WebsiteForm
            activity={busy ? 'Checking the page and preparing your report…' : cancelled ? 'Request cancelled. You can try again shortly.' : report ? 'Report ready.' : ''}
            onCancel={cancel} cancelled={cancelled} canRetry={!busy && !!lastAttempt && (failure?.retryable === true || cancelled)}
            onRetry={() => { if (lastAttempt) void analyze(lastAttempt); }}
            capabilitiesLoading={!capabilitiesReady} publicScanningEnabled={publicEnabled}
            url={url} busy={busy} error={failure?.message ?? ''} onUrlChange={changeUrl} onSubmit={submit}
          />
        </div>
        <LandingComparison/>
      </section>
      {report && <section className="results" ref={results} tabIndex={-1} aria-labelledby="report-title">
        <div className="section-heading">
          <div>
            <h2 id="report-title">Accessibility report</h2>
            <p className="report-url">Scanned page: {report.url}</p>
            {report.requestedUrl && <p className="report-url">Requested URL: {report.requestedUrl}</p>}
          </div>
          <span className="demo-badge">Automated page scan</span>
        </div>
        <div className="notice">Automated results for the final scanned page only. Manual review is still required.</div>
        {pageNotice && <p className="notice" role="status">{pageNotice}</p>}
        <ScanCoverageNotice report={report}/>
        <ReportExports key={`${report.scanId}:${report.generatedAt}`} report={report}/>
        <div className="view-switch" role="group" aria-label="Report view">
          <button aria-pressed={view === 'findings'} onClick={() => setView('findings')}>Accessibility findings <span>{report.findings.length}</span></button>
          <button aria-pressed={view === 'preview'} onClick={() => setView('preview')}>Visual preview</button>
        </div>
        <div hidden={view !== 'findings'}><FindingsReport key={`${report.scanId}:${report.generatedAt}`} report={report}/></div>
        <div hidden={view !== 'preview'}>
          {report.sitePreview ? <SiteVisualPreview key={report.scanId} snapshot={report.sitePreview}/> :
            <div className="notice">
              {report.previewUnavailable ? 'The website image could not be captured.' : 'Website image capture is disabled.'} Your accessibility report and JSON download are still available.
            </div>}
        </div>
      </section>}
    </main>
    <footer>
      <span>© 2026 Chenhao Wang</span>
      <a href="https://github.com/implexrr/KindPath">GitHub repository <span aria-hidden="true">↗</span></a>
    </footer>
  </>;
}
