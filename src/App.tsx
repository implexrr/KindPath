import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Report } from '../shared/types';

type Effect = 'colour' | 'contrast' | 'blur' | 'peripheral';
const effects: Record<Effect, { name: string; description: string }> = {
  colour: { name: 'Colour vision difference', description: 'An illustrative red–green colour transformation. It does not represent every type of colour vision deficiency.' },
  contrast: { name: 'Reduced contrast', description: 'Softens the distinction between light and dark. Try noticing which details become harder to separate.' },
  blur: { name: 'Blur', description: 'An illustrative loss of sharpness. Blur alone does not capture the experience of low vision.' },
  peripheral: { name: 'Peripheral field restriction', description: 'A simplified illustration of peripheral field restriction. It does not reproduce glaucoma or any individual’s vision.' },
};

function SampleSite({ modified, effect, strength }: { modified: boolean; effect: Effect; strength: number }) {
  const filter = !modified ? undefined : effect === 'colour' ? 'url(#colour-filter)' : effect === 'contrast' ? `contrast(${1 - strength / 150})` : effect === 'blur' ? `blur(${strength / 25}px)` : undefined;
  return <div className="sample-window" aria-label={`${modified ? 'Modified' : 'Original'} fictional website. Navigation and submissions disabled.`}>
    <div className="sample" style={{ filter }}>
      <div className="sample-nav"><strong>fern & form<span>●</span></strong><span>Objects for everyday living</span></div>
      <div className="sample-content"><span className="eyebrow">A LITTLE ROOM TO GROW</span><h3>Good things.<br/>Growing slowly.</h3><p>Bring a little of the outside in.<br/>Thoughtful objects for a greener home.</p><a href="#collection" aria-disabled="true" tabIndex={-1} onClick={e => e.preventDefault()}>Explore the collection <span>↗</span></a><div className="plant-art" aria-hidden="true"><i/><i/><i/><i/><div className="pot"/></div></div>
      <div className="sample-bottom"><span>Made with care. Made to last.</span><span>01 — 03</span></div>
      <aside className="sample-ad"><small>ADVERTISEMENT · DEMO</small><span>A greener corner starts here.</span></aside>
    </div>
    {modified && effect === 'peripheral' && <div className="field-mask" style={{ opacity: strength / 100, background: `radial-gradient(ellipse at center, transparent ${48 - strength * .35}%, rgba(12,20,16,.96) ${85 - strength * .35}%)` }} aria-hidden="true"/>}
  </div>;
}

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
      <form onSubmit={submit} aria-busy={busy}><label htmlFor="website">Your website URL</label><div className="url-field"><span aria-hidden="true">↗</span><input id="website" type="url" placeholder="https://your-website.com" value={url} onChange={e => setUrl(e.target.value)} required maxLength={2048} aria-describedby={error ? 'url-error demo-note' : 'demo-note'}/><button disabled={busy} type="submit">{busy ? 'Preparing…' : 'Explore accessibility'} <span aria-hidden="true">→</span></button></div><p id="demo-note" className="form-note">Demo mode · URLs aren’t fetched. Findings are illustrative.</p>{error && <p role="alert" id="url-error" className="error">{error}</p>}</form>
      <button className="text-button" disabled={busy} onClick={() => { setUrl('https://example.com'); void analyze('https://example.com'); }}>Just exploring? Try an example <span aria-hidden="true">↗</span></button></div>
      <div className="hero-visual" aria-label="Illustration: a fictional website seen through different visual filters"><div className="visual-top"><span><i/> A DIFFERENT PERSPECTIVE</span><span>↗</span></div><div className="hero-sample"><SampleSite modified={false} effect="colour" strength={65}/><div className="comparison-slice" aria-hidden="true"/></div><div className="visual-bottom"><span>Same website. Different experience.</span><span className="visual-toggle" aria-hidden="true">●</span></div><div className="floating-note"><span aria-hidden="true">◉</span> Design with more people in mind.</div></div></section>
      <section className="principles" id="how-it-works" aria-label="How KindPath works"><article><span className="step">01 / DISCOVER</span><h2>Find the barriers.</h2><p>Explore clear findings with context about who they affect and why they matter.</p></article><article><span className="step">02 / SEE DIFFERENTLY</span><h2>Change your perspective.</h2><p>Compare an example page with visual effects that illustrate potential challenges.</p></article><article><span className="step">03 / MAKE PROGRESS</span><h2>Know your next step.</h2><p>Turn findings into practical improvements, one thoughtful change at a time.</p></article></section>
      {report && <section className="results" ref={results} tabIndex={-1} aria-labelledby="report-title"><div className="section-heading"><div><span className="eyebrow">YOUR EXPLORATION</span><h2 id="report-title">Small changes. Meaningful impact.</h2><p className="report-url">Submitted URL: {report.url}</p></div><span className="demo-badge">Illustrative report</span></div><div className="notice">This is demo data, not an assessment of {new URL(report.url).hostname}. The visual preview always shows our fictional example.</div><div className="view-switch" role="group" aria-label="Report view"><button aria-pressed={view === 'findings'} onClick={() => setView('findings')}>Accessibility findings <span>{report.findings.length}</span></button><button aria-pressed={view === 'preview'} onClick={() => setView('preview')}>Visual preview <span aria-hidden="true">◉</span></button></div>
      {view === 'findings' ? <div className="findings-layout"><div><div className="finding-intro"><h3>{report.findings.length} example issues to explore</h3><p>Start with the barriers that can have the greatest impact.</p></div>{report.findings.map((finding, index) => <article className="finding" key={finding.id}><div className="finding-number">0{index + 1}</div><div><span className={`severity ${finding.severity.toLowerCase()}`}>{finding.severity}</span><h3>{finding.title}</h3><p className="location">{finding.location}</p><p>{finding.impact}</p><details><summary>How to improve this</summary><p>{finding.fix}</p></details></div></article>)}</div><aside className="manual-card"><span aria-hidden="true">✳</span><h3>People complete<br/>the picture.</h3><p>Automated checks are a starting point. Make room for manual review and feedback from disabled people.</p><h4>Try these checks</h4><ul>{report.manualChecks.map(check => <li key={check}>{check}</li>)}</ul></aside></div> : <div className="preview-workspace"><div className="preview-controls"><div><label htmlFor="effect">Visual effect</label><select id="effect" value={effect} onChange={e => setEffect(e.target.value as Effect)}>{Object.entries(effects).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}</select></div><div className="strength"><label htmlFor="strength">Effect strength <output htmlFor="strength">{strength}%</output></label><input id="strength" type="range" min="0" max="100" value={strength} onChange={e => setStrength(Number(e.target.value))}/></div><button className="secondary" onClick={() => { setEffect('colour'); setStrength(65); }}>Reset effects</button></div><p className="effect-description">{effects[effect].description}</p><div className="comparison"><div><h3><span className="status-dot"/>Original example</h3><SampleSite modified={false} effect={effect} strength={strength}/></div><div><h3><span className="status-dot altered"/>With visual effect</h3><SampleSite modified effect={effect} strength={strength}/></div></div><p className="preview-caption">Hover over “Explore the collection” to see its style change. Navigation and submissions are disabled. The ad is a static placeholder.</p><div className="notice">Educational approximations. Vision varies between people; these effects do not reproduce a medical condition or replace accessibility testing.</div></div>}</section>}
      <section className="closing"><span aria-hidden="true">✳</span><p>Accessibility is a practice.<br/><strong>Every step makes a difference.</strong></p></section>
    </main><footer><a className="brand" href="#">KindPath<span aria-hidden="true">↗</span></a><span>A more accessible web starts with a clearer perspective.</span><span>Built with intention.</span></footer>
  </>;
}
