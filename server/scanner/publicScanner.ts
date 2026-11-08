import { PUBLIC_SCANNING_ENABLED, validatePublicUrl } from './publicPolicy.js';
import { runPublicWorker } from './publicDockerWorker.js';
import { mapWorkerReport } from './fixtureScanner.js';

export function mapPublicReport(raw: unknown) {
  const report = mapWorkerReport(raw, 'public');
  const result = raw as { url?: unknown; coverage?: { blockedRequests?: unknown; failedRequests?: unknown; omittedRules?: unknown; omittedNodes?: unknown } };
  const finalUrl = validatePublicUrl(result.url);
  const coverage = result.coverage;
  if (!coverage || !Number.isSafeInteger(coverage.blockedRequests) || Number(coverage.blockedRequests) < 0
    || !Number.isSafeInteger(coverage.failedRequests) || Number(coverage.failedRequests) < 0
    || !Number.isSafeInteger(coverage.omittedRules) || Number(coverage.omittedRules) < 0
    || !Number.isSafeInteger(coverage.omittedNodes) || Number(coverage.omittedNodes) < 0) throw new Error('Invalid scan coverage.');
  return { ...report, mode: 'public' as const, url: finalUrl, limitations: [
    'Only the initial top-level page at the default viewport was scanned; embedded frames and interactive states are excluded.',
    `${coverage.blockedRequests} requests were blocked by policy and ${coverage.failedRequests} requests failed. Missing resources can change the result.`,
    ...(Number(coverage.omittedRules) || Number(coverage.omittedNodes) ? [
      `Result limits omitted ${coverage.omittedRules} rules and ${coverage.omittedNodes} affected elements. The displayed list is partial.`,
    ] : []),
    'Automated findings do not establish accessibility conformance.',
  ] };
}
export async function scanPublicSite(value: unknown, signal?: AbortSignal) {
  if (!PUBLIC_SCANNING_ENABLED) throw new Error('Public URL scanning is disabled.');
  return mapPublicReport(await runPublicWorker(validatePublicUrl(value), signal));
}
