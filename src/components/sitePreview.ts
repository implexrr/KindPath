import type { Report } from '../../shared/types';
import { PREVIEW_GUARD } from '../../shared/previewPolicy';

export function hasMatchingSitePreview(report: Report): boolean {
  const value = report.sitePreview;
  try {
    return report.mode === 'public' && typeof report.requestedUrl === 'string' && !!value && value.mode === 'public'
      && typeof report.scanId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(report.scanId)
      && value.scanId === report.scanId && value.requestedUrl === report.requestedUrl && value.url === report.url
      && value.title === new URL(report.url).hostname
      && typeof value.html === 'string' && value.html.length <= 100000 && value.html.startsWith(PREVIEW_GUARD)
      && typeof value.capturedAt === 'string' && value.capturedAt.length <= 30 && Number.isFinite(Date.parse(value.capturedAt))
      && Array.isArray(value.limitations) && value.limitations.length > 0 && value.limitations.length <= 6
      && value.limitations.every(text => typeof text === 'string' && text.length <= 500);
  } catch { return false; }
}

// Text quantity is a hint, not a measurement of visual fidelity or accessibility.
export function previewTextFeedback(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 10000) return {
    kind: 'unknown' as const, title: 'Preview detail could not be assessed',
    message: 'Text detail information is unavailable. This snapshot may be incomplete; review the report and its limitations.',
  };
  if (value === 0) return {
    kind: 'empty' as const, title: 'Website preview unavailable',
    message: 'No text was captured, so a useful visual preview is unavailable for this scan. Accessibility findings and report exports are still available.',
  };
  if (value < 100) return {
    kind: 'sparse' as const, title: 'Limited preview detail',
    message: 'Very little text was captured. This preview may omit important content, or the page may simply be short. Review the report and its limitations.',
  };
  return undefined;
}
