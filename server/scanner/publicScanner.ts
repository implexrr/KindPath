import { readDiagnostic, classifyFailure } from '../../scanner/gateway/diagnostics.mjs';
import { randomUUID } from 'node:crypto';
import { mapSitePreview } from './sitePreview.js';
import { PUBLIC_SCANNING_ENABLED, PUBLIC_CAPTURE_ENABLED, validatePublicUrl } from './publicPolicy.js';
import { runPublicUrlWorker } from './publicUrlWorker.js';
import { ScannerError } from './dockerWorker.js';
import { mapWorkerReport } from './fixtureScanner.js';

export function mapPublicReport(raw: unknown, requestedUrl?: string) {
  const report = mapWorkerReport(raw, 'public');
  const result = raw as { url?: unknown; coverage?: { blockedRequests?: unknown; failedRequests?: unknown; omittedRules?: unknown; omittedNodes?: unknown } };
  const finalUrl = validatePublicUrl(result.url);
  const coverage = result.coverage;
  if (!coverage || !Number.isSafeInteger(coverage.blockedRequests) || Number(coverage.blockedRequests) < 0
    || !Number.isSafeInteger(coverage.failedRequests) || Number(coverage.failedRequests) < 0
    || !Number.isSafeInteger(coverage.omittedRules) || Number(coverage.omittedRules) < 0
    || !Number.isSafeInteger(coverage.omittedNodes) || Number(coverage.omittedNodes) < 0) throw new Error('Invalid scan coverage.');
  return { ...report, mode: 'public' as const, url: finalUrl, ...(requestedUrl ? { requestedUrl: validatePublicUrl(requestedUrl) } : {}), limitations: [
    'Only the initial top-level page at the default viewport was scanned; embedded frames and interactive states are excluded.',
    `${coverage.blockedRequests} requests were blocked by policy and ${coverage.failedRequests} requests failed (including gateway denials). Missing resources can change the result.`,
    ...(Number(coverage.omittedRules) || Number(coverage.omittedNodes) ? [
      `Result limits omitted ${coverage.omittedRules} rules and ${coverage.omittedNodes} affected elements. The displayed list is partial.`,
    ] : []),
    'Automated findings do not establish accessibility conformance.',
  ] };
}
interface Dependencies {
  enabled?: () => boolean;
  captureEnabled?: () => boolean;
  worker?: (target: string, signal?: AbortSignal) => Promise<unknown>;
}
export function createPublicSiteScanner({ enabled = () => PUBLIC_SCANNING_ENABLED, captureEnabled = () => PUBLIC_CAPTURE_ENABLED, worker = runPublicUrlWorker }: Dependencies = {}) {
  return async (value: unknown, signal?: AbortSignal) => {
    if (!enabled()) throw new ScannerError('SCANNER_UNAVAILABLE', 'Public URL scanning is disabled pending security review.');
    const target = validatePublicUrl(value);
    signal?.throwIfAborted();
    const capture = captureEnabled();
    let stage: 'worker-execution'|'worker-result' = 'worker-execution';
    try {
      const raw = await worker(target, signal);
      signal?.throwIfAborted();
      stage = 'worker-result';
      const report = mapPublicReport(raw, target);
      const preview = (raw as {preview?: unknown}).preview;
      if (!capture && preview !== undefined) throw new Error('Capture is disabled');
      const scanId = randomUUID();
      return {...report,scanId,...(capture ? {sitePreview:mapSitePreview(preview,{scanId,requestedUrl:target,url:report.url})} : {})};
    } catch (error) {
      if (error instanceof ScannerError && error.code !== 'SCAN_FAILED') throw error;
      // Never expose raw DNS, browser, Docker or worker error text to the caller.
      throw new ScannerError('SCAN_FAILED', 'The website scan failed or timed out. No report was produced.',
        readDiagnostic(error instanceof ScannerError ? error.diagnostic : undefined)
          ?? (stage==='worker-result' ? {stage,code:'INVALID_OUTPUT'} : classifyFailure(error,stage,signal)));
    }
  };
}
export const scanPublicSite = createPublicSiteScanner();
