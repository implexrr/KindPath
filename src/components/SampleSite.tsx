export function SampleSite() {
  return <div className="sample-window" aria-label="Fictional website illustration. Navigation and submissions disabled.">
    <div className="sample" >
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

  </div>;
}
