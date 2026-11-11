import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { navigationRejection } from '../scanner/gateway/navigation.mjs';
import { websiteUrl } from '../scanner/gateway/url.mjs';
import { fixtureTitle, isFixture } from '../shared/fixtures';
import type { FixtureId } from '../shared/fixtures';
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
import { SiteVisualPreview } from './components/SiteVisualPreview';
import { hasMatchingCaptureResult } from './components/sitePreview';
import { VisualPreview } from './components/VisualPreview';
import { SampleSite } from './components/SampleSite';

type AnalysisMode = 'demo' | 'fixture' | 'public';

export function App() {
  const [url, setUrl] = useState('');
  const [selectedFixture, setSelectedFixture] = useState<FixtureId>('barriers');
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
  const [lastAttempt,setLastAttempt] = useState<{value:string;mode:AnalysisMode}|null>(null);
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
  function changeFixture(fixture: FixtureId) {
    if (!isFixture(fixture) || fixture === selectedFixture) return;
    analysisRequest.current?.abort(); analysisRequest.current = null;
    setSelectedFixture(fixture); setReport(null); setFailure(null); setBusy(false); setView('findings');
    setLastAttempt(null); setCancelled(false);
  }
  async function analyze(value: string, mode: AnalysisMode = 'public') {
    if (analysisRequest.current || (mode==='public'&&!capabilitiesReady)) return;
    const abort = new AbortController(); analysisRequest.current = abort;
    setBusy(true); setFailure(null); setReport(null); setView('findings'); setCancelled(false);
    setLastAttempt({value,mode});
    const fixture = mode === 'fixture';
    let timeout: AbortSignal | undefined;
    try {
      if (!fixture) {
        value = normalizeWebsiteEntry(value);
        if (mode === 'public') value = websiteUrl(value).href;
        if (mode === 'demo') setUrl(value);
        setLastAttempt({value,mode});
      }
      if(mode==='public'&&!publicEnabled)throw new Error('Website scanning is unavailable. Start the local API or use the explicitly labelled example.');
      timeout = AbortSignal.timeout(mode === 'demo' ? 10000 : 90000);
      const response = await fetch(mode === 'fixture' ? '/api/scan-fixture' : mode === 'public' ? '/api/scan-public' : '/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fixture ? { fixture: value } : { url: value }),
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
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.mode !== mode) {
        throw new Error('The report did not match the requested scan.');
      }
      if (mode === 'public') {
        let matches = false;
        try {
          // Bind the request and allow only the agreed single-page URL changes.
          const requested = websiteUrl(value), scanned = websiteUrl(data.url);
          matches = data.requestedUrl === requested.href && data.url === scanned.href
            && !navigationRejection(requested.href, scanned.href);
        } catch { /* Reject missing or malformed report URLs without displaying their contents. */ }
        if (!matches) throw new Error('The report did not match the requested website.');
        if (!hasMatchingCaptureResult(data,publicCaptureEnabled)) {
          throw new Error('The website snapshot did not match this scan.');
        }
      }
      if (fixture && (data.mode !== 'fixture' || data.scanner?.fixture !== value || data.url !== `fixture:${value}`)) {
        throw new Error('The report did not match the requested built-in page.');
      }
      if (mode === 'public') setUrl(value);
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
          retryable: timeout !== undefined && mode !== 'public',
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
    <header className="site-header"><a className="brand" href="#"><span className="brand-icon" aria-hidden="true">k<span>↗</span></span>KindPath{import.meta.env.DEV && <span className="beta">LOCAL PREVIEW</span>}</a><nav aria-label="Main"><a href="#how-it-works">How it works <span aria-hidden="true">↗</span></a>{import.meta.env.DEV && <a href="/mockups/index.html">Design mockups <span aria-hidden="true">↗</span></a>}</nav></header>
    <main id="main">
      <section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="tiny-sun" aria-hidden="true">✳</span> A MORE INCLUSIVE INTERNET STARTS HERE</div><h1>A clearer web.<br/><em>For everyone.</em></h1><p>See your website from a different perspective.<br className="desktop-break"/> Find accessibility barriers, understand their impact,<br className="desktop-break"/> and take the next step toward a more welcoming web.</p>
      <WebsiteForm activity={busy ? lastAttempt?.mode === 'demo' ? 'Preparing an example report…' : 'Checking the page and preparing your report…' : !capabilitiesReady ? 'Checking scanner availability…' : cancelled ? 'Request cancelled. You can try again shortly.' : report ? 'Report ready.' : ''}
        onCancel={cancel} cancelled={cancelled} canRetry={!busy && !!lastAttempt && (failure?.retryable === true || cancelled)}
        onRetry={() => { if (lastAttempt) void analyze(lastAttempt.value,lastAttempt.mode); }} capabilitiesLoading={!capabilitiesReady} publicScanningEnabled={publicEnabled} url={url} busy={busy} error={failure?.message ?? ''} onUrlChange={changeUrl} onSubmit={submit}
        onExample={() => { setUrl('https://example.com'); void analyze('https://example.com', 'demo'); }}
        fixture={selectedFixture} onFixtureChange={changeFixture} onFixtureScan={() => { void analyze(selectedFixture, 'fixture'); }}/></div>
      <div className="hero-visual" aria-label="Illustration: a fictional website seen through different visual filters"><div className="visual-top"><span><i/> A DIFFERENT PERSPECTIVE</span><span>↗</span></div><div className="hero-sample"><SampleSite/><div className="comparison-slice" aria-hidden="true"/></div><div className="visual-bottom"><span>Same website. Different experience.</span><span className="visual-toggle" aria-hidden="true">●</span></div><div className="floating-note"><span aria-hidden="true">◉</span> Design with more people in mind.</div></div></section>
      <section className="principles" id="how-it-works" aria-label="How KindPath works"><article><span className="step">01 / DISCOVER</span><h2>Find the barriers.</h2><p>Explore clear findings with context about who they affect and why they matter.</p></article><article><span className="step">02 / SEE DIFFERENTLY</span><h2>Change your perspective.</h2><p>Compare the captured page with visual effects that illustrate potential challenges.</p></article><article><span className="step">03 / MAKE PROGRESS</span><h2>Know your next step.</h2><p>Turn findings into practical improvements, one thoughtful change at a time.</p></article></section>
      {report && <section className="results" ref={results} tabIndex={-1} aria-labelledby="report-title"><div className="section-heading"><div><span className="eyebrow">YOUR EXPLORATION</span><h2 id="report-title">Small changes. Meaningful impact.</h2><p className="report-url">{report.mode === 'fixture' ? 'Scanned fixture' : report.mode === 'public' ? 'Scanned page' : 'Submitted URL'}: {report.mode === 'fixture' && isFixture(report.scanner?.fixture) ? fixtureTitle(report.scanner.fixture) : report.url}</p>{report.mode === 'public' && report.requestedUrl && <p className="report-url">Requested URL: {report.requestedUrl}</p>}</div><span className="demo-badge">{report.mode === 'demo' ? 'Illustrative report' : report.mode === 'fixture' ? 'Real fixture scan' : 'Automated page scan'}</span></div><div className="notice">{report.mode === 'fixture' ? 'These are real automated results for the selected built-in page. The visual preview uses that same page. No public website was fetched.' : report.mode === 'demo' ? `This is demo data, not an assessment of ${new URL(report.url).hostname}.` : 'Automated results for the final scanned page only. Manual review is still required.'}{report.mode === 'demo' && !report.sitePreview && ' The visual preview uses a separate built-in fixture, not the submitted URL.'}</div>{pageNotice && <p className="notice" role="status">{pageNotice}</p>}<ScanCoverageNotice report={report}/><ReportExports key={`${report.mode}:${report.url}:${report.generatedAt}`} report={report}/><div className="view-switch" role="group" aria-label="Report view"><button aria-pressed={view === 'findings'} onClick={() => setView('findings')}>Accessibility findings <span>{report.findings.length}</span></button><button aria-pressed={view === 'preview'} onClick={() => setView('preview')}>Visual preview <span aria-hidden="true">◉</span></button></div>
      <div hidden={view !== 'findings'}><FindingsReport key={`${report.mode}:${report.url}:${report.generatedAt}`} report={report}/></div><div hidden={view !== 'preview'}>{report.mode === 'public' && report.previewUnavailable ? <div className="notice">The website image could not be captured. Your accessibility report and JSON download are still available.</div> : report.mode === 'public' && report.sitePreview ? <SiteVisualPreview key={report.scanId} snapshot={report.sitePreview}/> : <VisualPreview key={report.mode === 'fixture' ? report.scanner?.fixture : 'garden'} fixture={report.mode === 'fixture' && isFixture(report.scanner?.fixture) ? report.scanner.fixture : 'garden'}/>}</div></section>}
      <section className="closing"><span aria-hidden="true">✳</span><p>Accessibility is a practice.<br/><strong>Every step makes a difference.</strong></p></section>
    </main><footer><a className="brand" href="#">KindPath<span aria-hidden="true">↗</span></a><span>A more accessible web starts with a clearer perspective.</span><span>Built with intention.</span></footer>
  </>;
}
