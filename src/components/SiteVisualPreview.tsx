import { useState } from 'react';
import type { SitePreview } from '../../shared/types';
import { SnapshotFrame } from './SnapshotFrame';
import { VisionControls } from './VisionControls';
import { defaultVisionSettings } from './visualEffects';

export function SiteVisualPreview({ snapshot }: { snapshot: SitePreview }) {
  const [settings,setSettings] = useState(defaultVisionSettings);
  return <div className="preview-workspace">
    <div className="snapshot-source"><div><h3>Scanned website snapshot</h3>
      <p>This snapshot was captured in the same browser visit as this report. It is a limited visual approximation of {snapshot.url}.</p>
      <p>Captured at <time dateTime={snapshot.capturedAt}>{new Date(snapshot.capturedAt).toLocaleTimeString()}</time>. Scroll within each preview to explore the page. This reflects the scan viewport, not a responsive device preview. Run another scan to update both the report and snapshot.</p>
    </div></div>
    <VisionControls settings={settings} onChange={setSettings}/>
    <div className="comparison">
      <div><h3><span className="status-dot"/>Original snapshot</h3><SnapshotFrame snapshot={snapshot} modified={false} settings={settings}/></div>
      <div><h3><span className="status-dot altered"/>{settings.enabled ? 'With visual effects' : 'Effects paused — original appearance'}</h3><SnapshotFrame snapshot={snapshot} modified settings={settings}/></div>
    </div>
    <p className="preview-caption">Links and form controls are inactive. Visible advertisement text is static; embedded advertisements and tracking are omitted.</p>
    <ul aria-label="Website snapshot limitations">{snapshot.limitations.map(text=><li key={text}>{text}</li>)}</ul>
    <div className="notice">Educational approximations. Vision varies between people; these effects do not reproduce a medical condition or replace accessibility testing.</div>
  </div>;
}
