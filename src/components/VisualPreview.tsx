import { fixtureTitle } from '../../shared/fixtures';
import type { PreviewFixtureId } from '../../shared/fixtures';
import { useEffect, useRef, useState } from 'react';
import type { FixturePreview } from '../../shared/types';
import { SnapshotFrame } from './SnapshotFrame';
import { defaultVisionSettings } from './visualEffects';
import { VisionControls } from './VisionControls';

export function VisualPreview({ fixture }: { fixture: PreviewFixtureId }) {
  const title = fixtureTitle(fixture);
  const [settings, setSettings] = useState(defaultVisionSettings);
  const [snapshot, setSnapshot] = useState<FixturePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function generate() {
    if (request.current) return;
    const abort = new AbortController(); request.current = abort;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/preview-fixture', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fixture }),
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(90000)]),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to generate the fixture snapshot.');
      if (data.mode !== 'fixture' || data.fixture !== fixture || data.title !== title
        || typeof data.html !== 'string' || data.html.length > 100000 || typeof data.capturedAt !== 'string'
        || !Number.isFinite(Date.parse(data.capturedAt))) throw new Error('The preview response was invalid. Try generating it again.');
      if (!abort.signal.aborted) setSnapshot(data);
    } catch (cause) {
      if (!abort.signal.aborted) setError(cause instanceof Error && cause.name !== 'TimeoutError' ? cause.message : 'Snapshot generation timed out. Try again.');
    } finally {
      request.current = null;
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  return <div className="preview-workspace">
    <div className="snapshot-source">
      <div><h3>Built-in {title} snapshot</h3><p>{fixture === 'garden' ? 'This illustration is separate from the demo report.' : 'This preview uses the same built-in page as the fixture findings above.'} Public websites are not captured.</p>
        {snapshot && <p>Captured at <time dateTime={snapshot.capturedAt}>{new Date(snapshot.capturedAt).toLocaleTimeString()}</time>. Scroll within each preview to explore the whole page.</p>}</div>
      <button className="secondary" disabled={busy} onClick={() => { void generate(); }}>
        {busy ? 'Generating snapshot…' : snapshot ? 'Refresh fixture snapshot' : 'Generate fixture snapshot'}
      </button>
    </div>
    <div role="status" aria-live="polite" className="snapshot-status">{busy ? 'Capturing the built-in fixture in the isolated worker…' : snapshot ? 'Fixture snapshot ready.' : ''}</div>
    {error && <p className="error" role="alert">{error}</p>}
    {snapshot ? <>
      <VisionControls settings={settings} onChange={setSettings}/>
      <div className="comparison" aria-busy={busy}>
        <div><h3><span className="status-dot"/>Original snapshot</h3><SnapshotFrame snapshot={snapshot} modified={false} settings={settings}/></div>
        <div><h3><span className="status-dot altered"/>{settings.enabled ? 'With visual effects' : 'Effects paused — original appearance'}</h3><SnapshotFrame snapshot={snapshot} modified settings={settings}/></div>
      </div>
      <p className="preview-caption">{fixture === 'garden' ? 'Hover over “Explore the garden” to see its style change. The advertisement is a static placeholder. ' : ''}Links and form controls are inactive. Images, when present, are static placeholders.</p>
    </> : <div className="snapshot-placeholder"><h3>A page you can explore without leaving KindPath.</h3><p>Generate the built-in fixture snapshot to compare its appearance with a visual effect.</p></div>}
    <div className="notice">Educational approximations. Vision varies between people; these effects do not reproduce a medical condition or replace accessibility testing.</div>
  </div>;
}
