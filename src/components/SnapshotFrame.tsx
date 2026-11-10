import { useId } from 'react';
import type { FixturePreview, SitePreview } from '../../shared/types';
import { peripheralMask } from './visualEffects';
import { snapshotDocument } from './snapshotDocument';
import type { VisionSettings } from './visualEffects';

export function SnapshotFrame({ snapshot, modified, settings, actualSize=false }: {
  snapshot: FixturePreview | SitePreview; modified: boolean; settings: VisionSettings; actualSize?:boolean;
}) {
  const colourId = `vision-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const html = snapshotDocument(snapshot, modified, settings, colourId, actualSize);
  const mask = modified ? peripheralMask(settings) : undefined;
  return <div className="snapshot-window">
    <iframe className="snapshot-frame" title={`${modified ? 'Modified' : 'Original'} ${snapshot.title} ${snapshot.mode === 'public' ? 'website' : 'fixture'} snapshot`}
      sandbox="" referrerPolicy="no-referrer" srcDoc={html}/>
    {mask && <div className="field-mask" aria-hidden="true" style={mask}/>}
  </div>;
}
