import { navigationRejection, redirectMessage } from '../../scanner/gateway/navigation.mjs';
import { readScanCoverage } from '../../shared/scanCoverage.js';
import { httpStatusMessage, readDiagnostic, classifyFailure } from '../../scanner/gateway/diagnostics.mjs';
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
  if (requestedUrl && navigationRejection(requestedUrl, finalUrl)) throw new Error('Invalid final page.');
  const coverage = readScanCoverage(result.coverage);
  if (!coverage) throw new Error('Invalid scan coverage.');
  return { ...report, mode: 'public' as const, coverage, url: finalUrl, ...(requestedUrl ? { requestedUrl: validatePublicUrl(requestedUrl) } : {}), limitations: [
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
      if (!capture && (preview !== undefined || (raw as {captureFailure?:unknown}).captureFailure !== undefined)) throw new Error('Capture is disabled');
      const unavailable=(raw as {captureFailure?:unknown}).captureFailure;
      if(unavailable!==undefined&&(unavailable!=='CAPTURE_FAILED'||preview!==undefined))throw new Error('Invalid capture result');
      if(capture&&unavailable)report.limitations.push('The website image could not be captured. The accessibility report is still available.');
      const scanId = randomUUID();
      return {...report,scanId,...(capture ? unavailable ? {previewUnavailable:true} : {sitePreview:mapSitePreview(preview,{scanId,requestedUrl:target,url:report.url})} : {})};
    } catch (error) {
      if (error instanceof ScannerError && error.code !== 'SCAN_FAILED') throw error;
      // Never expose raw DNS, browser, Docker or worker error text to the caller.
      const diagnostic = readDiagnostic(error instanceof ScannerError ? error.diagnostic : undefined)
        ?? (stage==='worker-result' ? {stage,code:'INVALID_OUTPUT'} : classifyFailure(error,stage,signal));
      const explanation = diagnostic?.stage === 'page-loading' ? (diagnostic.code === 'HTTP_STATUS' ? httpStatusMessage(diagnostic.httpStatus) : redirectMessage(diagnostic.code)) : undefined;
      throw new ScannerError('SCAN_FAILED', explanation ?? 'The website scan failed or timed out. No report was produced.', diagnostic);
    }
  };
}
export const scanPublicSite = createPublicSiteScanner();
