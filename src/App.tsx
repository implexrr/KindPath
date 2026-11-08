import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Report } from '../shared/types';
import { WebsiteForm } from './components/WebsiteForm';
import { FindingsReport } from './components/FindingsReport';
import { VisualPreview } from './components/VisualPreview';
import { SampleSite } from './components/SampleSite';
import type { Effect } from './components/visualEffects';

export function App() {
  const [url, setUrl] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'findings' | 'preview'>('findings');
  const [effect, setEffect] = useState<Effect>('colour');
  const [strength, setStrength] = useState(65);
  const results = useRef<HTMLElement>(null);

  async function analyze(value: string) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: value }), signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to create a demo report.');
      setReport(data); setView('findings');
      requestAnimationFrame(() => { results.current?.focus(); results.current?.scrollIntoView({ behavior: 'instant', block: 'start' }); });
    } catch (cause) { setError(cause instanceof Error && cause.name !== 'TimeoutError' ? cause.message : 'The request timed out. Try again.'); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void analyze(url); }

  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <svg width="0" height="0" aria-hidden="true" className="filter-defs"><defs><filter id="colour-filter" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values={`${1 - .433 * strength / 100} ${.433 * strength / 100} 0 0 0 ${.558 * strength / 100} ${1 - .558 * strength / 100} 0 0 0 0 ${.242 * strength / 100} ${1 - .242 * strength / 100} 0 0 0 0 0 1 0`}/></filter></defs></svg>
    <header className="site-header"><a className="brand" href="#"><span className="brand-icon" aria-hidden="true">k<span>↗</span></span>KindPath<span className="beta">LOCAL DEMO</span></a><nav aria-label="Main"><a href="#how-it-works">How it works <span aria-hidden="true">↗</span></a><a href="/mockups/index.html">Design mockups <span aria-hidden="true">↗</span></a></nav></header>
    <main id="main">
      <section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="tiny-sun" aria-hidden="true">✳</span> A MORE INCLUSIVE INTERNET STARTS HERE</div><h1>A clearer web.<br/><em>For everyone.</em></h1><p>See your website from a different perspective.<br className="desktop-break"/> Find accessibility barriers, understand their impact,<br className="desktop-break"/> and take the next step toward a more welcoming web.</p>
      <WebsiteForm url={url} busy={busy} error={error} onUrlChange={setUrl} onSubmit={submit}
        onExample={() => { setUrl('https://example.com'); void analyze('https://example.com'); }}/></div>
      <div className="hero-visual" aria-label="Illustration: a fictional website seen through different visual filters"><div className="visual-top"><span><i/> A DIFFERENT PERSPECTIVE</span><span>↗</span></div><div className="hero-sample"><SampleSite modified={false} effect="colour" strength={65}/><div className="comparison-slice" aria-hidden="true"/></div><div className="visual-bottom"><span>Same website. Different experience.</span><span className="visual-toggle" aria-hidden="true">●</span></div><div className="floating-note"><span aria-hidden="true">◉</span> Design with more people in mind.</div></div></section>
      <section className="principles" id="how-it-works" aria-label="How KindPath works"><article><span className="step">01 / DISCOVER</span><h2>Find the barriers.</h2><p>Explore clear findings with context about who they affect and why they matter.</p></article><article><span className="step">02 / SEE DIFFERENTLY</span><h2>Change your perspective.</h2><p>Compare an example page with visual effects that illustrate potential challenges.</p></article><article><span className="step">03 / MAKE PROGRESS</span><h2>Know your next step.</h2><p>Turn findings into practical improvements, one thoughtful change at a time.</p></article></section>
      {report && <section className="results" ref={results} tabIndex={-1} aria-labelledby="report-title"><div className="section-heading"><div><span className="eyebrow">YOUR EXPLORATION</span><h2 id="report-title">Small changes. Meaningful impact.</h2><p className="report-url">Submitted URL: {report.url}</p></div><span className="demo-badge">Illustrative report</span></div><div className="notice">This is demo data, not an assessment of {new URL(report.url).hostname}. The visual preview always shows our fictional example.</div><div className="view-switch" role="group" aria-label="Report view"><button aria-pressed={view === 'findings'} onClick={() => setView('findings')}>Accessibility findings <span>{report.findings.length}</span></button><button aria-pressed={view === 'preview'} onClick={() => setView('preview')}>Visual preview <span aria-hidden="true">◉</span></button></div>
      {view === 'findings' ? <FindingsReport report={report}/> : <VisualPreview
        effect={effect} strength={strength} onEffectChange={setEffect} onStrengthChange={setStrength}
        onReset={() => { setEffect('colour'); setStrength(65); }}/>}</section>}
      <section className="closing"><span aria-hidden="true">✳</span><p>Accessibility is a practice.<br/><strong>Every step makes a difference.</strong></p></section>
    </main><footer><a className="brand" href="#">KindPath<span aria-hidden="true">↗</span></a><span>A more accessible web starts with a clearer perspective.</span><span>Built with intention.</span></footer>
  </>;
}
