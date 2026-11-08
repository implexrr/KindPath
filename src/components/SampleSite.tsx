import type { Effect } from './visualEffects';

export function SampleSite({ modified, effect, strength }: { modified: boolean; effect: Effect; strength: number }) {
  const filter = !modified ? undefined
    : effect === 'colour' ? 'url(#colour-filter)'
    : effect === 'contrast' ? `contrast(${1 - strength / 150})`
    : effect === 'blur' ? `blur(${strength / 25}px)`
    : undefined;

  return <div className="sample-window" aria-label={`${modified ? 'Modified' : 'Original'} fictional website. Navigation and submissions disabled.`}>
    <div className="sample" style={{ filter }}>
      <div className="sample-nav">
        <strong>fern & form<span>●</span></strong>
        <span>Objects for everyday living</span>
      </div>
      <div className="sample-content">
        <span className="eyebrow">A LITTLE ROOM TO GROW</span>
        <h3>Good things.<br/>Growing slowly.</h3>
        <p>Bring a little of the outside in.<br/>Thoughtful objects for a greener home.</p>
        <a href="#collection" aria-disabled="true" tabIndex={-1} onClick={e => e.preventDefault()}>
          Explore the collection <span>↗</span>
        </a>
        <div className="plant-art" aria-hidden="true"><i/><i/><i/><i/><div className="pot"/></div>
      </div>
      <div className="sample-bottom"><span>Made with care. Made to last.</span><span>01 — 03</span></div>
      <aside className="sample-ad"><small>ADVERTISEMENT · DEMO</small><span>A greener corner starts here.</span></aside>
    </div>
    {modified && effect === 'peripheral' && <div
      className="field-mask"
      style={{
        opacity: strength / 100,
        background: `radial-gradient(ellipse at center, transparent ${48 - strength * .35}%, rgba(12,20,16,.96) ${85 - strength * .35}%)`,
      }}
      aria-hidden="true"
    />}
  </div>;
}
