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
