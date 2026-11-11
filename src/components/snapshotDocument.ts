import type { FixturePreview, SitePreview } from '../../shared/types';
import { IMAGE_PREVIEW_GUARD, PREVIEW_GUARD } from '../../shared/previewPolicy';
import { clampStrength, colourMatrix, snapshotFilter } from './visualEffects';
import type { VisionSettings } from './visualEffects';

// The filter and its pixels must share the opaque preview document. Applying
// an SVG reference from the parent to a sandboxed iframe is not reliable.
export function snapshotDocument(snapshot: FixturePreview | SitePreview, modified: boolean,
  settings: VisionSettings, colourId: string, actualSize: boolean): string {
  const image = snapshot.mode === 'public' && snapshot.kind === 'image';
  const filter = modified ? snapshotFilter(settings, colourId) : undefined;
  // Machado coefficients operate on linear light. Grayscale retains its sRGB mix.
  const colourSpace = settings.colourPreset === 'grayscale' ? 'sRGB' : 'linearRGB';
  const definitions = filter && clampStrength(settings.strengths.colour) > 0
    ? `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs><filter id="${colourId}" color-interpolation-filters="${colourSpace}"><feColorMatrix type="matrix" values="${colourMatrix(settings.colourPreset, settings.strengths.colour).join(' ')}"/></filter></defs></svg>` : '';
  const content = filter ? snapshot.html.replace('<body>', `<body style="filter:${filter}">${definitions}`) : snapshot.html;
  return (image ? IMAGE_PREVIEW_GUARD : PREVIEW_GUARD) + content
    + (image && actualSize ? `<style>.kp-canvas{width:${snapshot.width}px;max-width:none}</style>` : '');
}
