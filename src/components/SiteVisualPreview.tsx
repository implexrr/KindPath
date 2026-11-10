import { useState } from 'react';
import type { SitePreview } from '../../shared/types';
import { SnapshotFrame } from './SnapshotFrame';
import { VisionControls } from './VisionControls';
import { previewTextFeedback } from './sitePreview';
import { defaultVisionSettings } from './visualEffects';

export function SiteVisualPreview({ snapshot }: { snapshot: SitePreview }) {
  const [settings,setSettings] = useState(defaultVisionSettings);
  const [actualSize,setActualSize]=useState(false);
  const image=snapshot.kind==='image';
  const feedback=image?undefined:previewTextFeedback(snapshot.capturedTextCharacters);
  const empty=feedback?.kind==='empty';
  return <div className="preview-workspace">
    <div className="snapshot-source"><div><h3>Scanned website snapshot</h3>
      <p>{empty ? 'This capture is linked to the same browser visit as the report for ' : 'This snapshot was captured in the same browser visit as this report. It is a limited visual approximation of '}{snapshot.url}.</p>
      <p>Captured at <time dateTime={snapshot.capturedAt}>{new Date(snapshot.capturedAt).toLocaleTimeString()}</time>.{!empty && <> Scroll within each preview to explore the page. This reflects the scan viewport, not a responsive device preview. Run another scan to update both the report and snapshot.</>}</p>
    </div></div>
    {feedback && <section className="notice preview-quality" aria-label="Preview detail"><h4>{feedback.title}</h4><p>{feedback.message}</p></section>}
    {image&&<p className="preview-caption"><label>Preview size <select aria-label="Preview size" value={actualSize?'actual':'fit'} onChange={event=>setActualSize(event.target.value==='actual')}><option value="fit">Fit width</option><option value="actual">Actual size — scroll to explore</option></select></label>{snapshot.truncated&&' · Long page: first 6,000 pixels shown.'}</p>}
    {!empty && <><VisionControls settings={settings} onChange={setSettings}/>
    <div className="comparison">
      <div><h3><span className="status-dot"/>Original snapshot</h3><SnapshotFrame snapshot={snapshot} modified={false} settings={settings} actualSize={actualSize}/></div>
      <div><h3><span className="status-dot altered"/>{settings.enabled ? 'With visual effects' : 'Effects paused — original appearance'}</h3><SnapshotFrame snapshot={snapshot} modified settings={settings} actualSize={actualSize}/></div>
    </div>
    <p className="preview-caption">{image?'This is a static image. Links highlight on hover, but navigation and forms are inactive. Visible advertisements are part of the image.':'Links and form controls are inactive. Visible advertisement text is static; embedded advertisements and tracking are omitted.'}</p></>}
    <ul aria-label="Website snapshot limitations">{snapshot.limitations.map(text=><li key={text}>{text}</li>)}</ul>
    {!empty && <div className="notice">Educational approximations. Vision varies between people; these effects do not reproduce a medical condition or replace accessibility testing.</div>}
  </div>;
}
