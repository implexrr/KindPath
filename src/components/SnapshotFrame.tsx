import type { FixturePreview } from '../../shared/types';
import { PREVIEW_GUARD } from '../../shared/previewPolicy';
import type { Effect } from './visualEffects';

export function SnapshotFrame({ snapshot, modified, effect, strength }: {
  snapshot: FixturePreview; modified: boolean; effect: Effect; strength: number;
}) {
  const filter = !modified ? undefined
    : effect === 'colour' ? 'url(#colour-filter)'
    : effect === 'contrast' ? `contrast(${1 - strength / 150})`
    : effect === 'blur' ? `blur(${strength / 25}px)` : undefined;
  return <div className="snapshot-window">
    <iframe className="snapshot-frame" title={`${modified ? 'Modified' : 'Original'} ${snapshot.title} fixture snapshot`}
      sandbox="" referrerPolicy="no-referrer" srcDoc={PREVIEW_GUARD + snapshot.html} style={{ filter }}/>
    {modified && effect === 'peripheral' && <div className="field-mask" aria-hidden="true" style={{
      opacity: strength / 100,
      background: `radial-gradient(ellipse at center, transparent ${48 - strength * .35}%, rgba(12,20,16,.96) ${85 - strength * .35}%)`,
    }}/>}
  </div>;
}
