import { useId } from 'react';
import type { FixturePreview, SitePreview } from '../../shared/types';
import { IMAGE_PREVIEW_GUARD,PREVIEW_GUARD } from '../../shared/previewPolicy';
import { colourMatrix, peripheralMask, snapshotFilter } from './visualEffects';
import type { VisionSettings } from './visualEffects';

export function SnapshotFrame({ snapshot, modified, settings, actualSize=false }: {
  snapshot: FixturePreview | SitePreview; modified: boolean; settings: VisionSettings; actualSize?:boolean;
}) {
  const image=snapshot.mode==='public'&&snapshot.kind==='image';
  const html=snapshot.html+(image&&actualSize?`<style>.kp-canvas{width:${snapshot.width}px;max-width:none}</style>`:'');
  const colourId = `vision-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const filter = modified ? snapshotFilter(settings, colourId) : undefined;
  const mask = modified ? peripheralMask(settings) : undefined;
  return <div className="snapshot-window">
    {modified && settings.enabled && settings.strengths.colour > 0 && <svg width="0" height="0" aria-hidden="true" focusable="false" className="filter-defs">
      <defs><filter id={colourId} colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values={colourMatrix(settings.colourPreset, settings.strengths.colour).join(' ')}/></filter></defs>
    </svg>}
    <iframe className="snapshot-frame" title={`${modified ? 'Modified' : 'Original'} ${snapshot.title} ${snapshot.mode === 'public' ? 'website' : 'fixture'} snapshot`}
      sandbox="" referrerPolicy="no-referrer" srcDoc={(image?IMAGE_PREVIEW_GUARD:PREVIEW_GUARD) + html} style={{ filter }}/>
    {mask && <div className="field-mask" aria-hidden="true" style={mask}/>}
  </div>;
}
