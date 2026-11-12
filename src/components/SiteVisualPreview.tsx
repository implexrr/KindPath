import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { SitePreview } from '../../shared/types';
import { SnapshotFrame } from './SnapshotFrame';
import { VisionFineTuning, VisionPresetControls } from './VisionControls';
import { previewTextFeedback } from './sitePreview';
import { activeVisionPreset, defaultVisionSettings, peripheralMask, visionPresets } from './visualEffects';

export function SiteVisualPreview({ snapshot }: { snapshot: SitePreview }) {
  const [settings, setSettings] = useState(defaultVisionSettings);
  const [actualSize, setActualSize] = useState(false);
  const [mobileView, setMobileView] = useState<'original' | 'simulated'>('simulated');
  const image = snapshot.kind === 'image';
  const feedback = image ? undefined : previewTextFeedback(snapshot.capturedTextCharacters);
  const empty = feedback?.kind === 'empty';
  const preset = activeVisionPreset(settings);
  const presetLabel = preset ? visionPresets[preset].name : 'Custom effects';
  const {width, height} = snapshot;
  const imageDimensions = image && width && height ? {
    '--snapshot-width': `${width}px`,
    '--snapshot-height': `${height}px`,
    '--snapshot-ratio': height / width,
  } as CSSProperties : undefined;
  const mobileMask = image && mobileView === 'simulated' ? peripheralMask(settings) : undefined;

  return <div className="preview-workspace">
    <p className="snapshot-captured">Captured at <time dateTime={snapshot.capturedAt}>{new Date(snapshot.capturedAt).toLocaleTimeString()}</time></p>
    {feedback && <section className="notice preview-quality" aria-label="Preview detail"><h4>{feedback.title}</h4><p>{feedback.message}</p></section>}
    {!empty && <>
      <VisionPresetControls settings={settings} onChange={value => { setSettings(value); setMobileView('simulated'); }}/>
      <div className="preview-toolbar">
        <div className="mobile-view-switch" role="group" aria-label="Snapshot view">
          <button type="button" className="secondary" aria-pressed={mobileView === 'original'} onClick={() => setMobileView('original')}>Original</button>
          <button type="button" className="secondary" aria-pressed={mobileView === 'simulated'} onClick={() => setMobileView('simulated')}>Simulated</button>
        </div>
        {image && <div className="preview-size">
          <label htmlFor="preview-size">Preview size</label>
          <div className="select-field">
            <select id="preview-size" value={actualSize ? 'actual' : 'fit'} onChange={event => setActualSize(event.target.value === 'actual')}>
              <option value="fit">Fit width</option><option value="actual">Actual size</option>
            </select>
          </div>
        </div>}
      </div>
      {image && snapshot.truncated && <p className="preview-caption">Long page: first 6,000 pixels shown.</p>}
      <div className={image ? 'snapshot-comparison image-comparison' : 'snapshot-comparison'} data-mobile-view={mobileView} data-actual-size={actualSize} style={imageDimensions}>
        <div className="comparison" tabIndex={image ? 0 : undefined} role={image ? 'region' : undefined} aria-label={image ? 'Snapshot images' : undefined}>
          <div className="original-pane"><h3><span className="status-dot"/>Original snapshot</h3><SnapshotFrame snapshot={snapshot} modified={false} settings={settings} actualSize={actualSize}/></div>
          <div className="simulated-pane"><h3><span className="status-dot altered"/>Simulated preview <span className="active-preset">· {presetLabel}</span></h3><SnapshotFrame snapshot={snapshot} modified settings={settings} actualSize={actualSize}/></div>
        </div>
        {mobileMask && <div className="field-mask mobile-field-mask" aria-hidden="true" style={mobileMask}/>}
      </div>
      <VisionFineTuning settings={settings} onChange={value => { setSettings(value); setMobileView('simulated'); }}/>
      <p className="preview-caption">{image ? 'This is a static image. Links highlight on hover, but navigation and forms are inactive. Visible advertisements are part of the image.' : 'Links and form controls are inactive. Visible advertisement text is static; embedded advertisements and tracking are omitted.'}</p>
    </>}
    <ul className="snapshot-limitations" aria-label="Website snapshot limitations">{snapshot.limitations.map(text => <li key={text}>{text}</li>)}</ul>
  </div>;
}
