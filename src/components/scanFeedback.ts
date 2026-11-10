import { httpStatusMessage, readDiagnostic } from '../../scanner/gateway/diagnostics.mjs';
import { redirectMessage } from '../../scanner/gateway/navigation.mjs';
import type { Report } from '../../shared/types';
import { readScanCoverage } from '../../shared/scanCoverage';

const messages = new Map([
  ['SCANNER_BUSY','Another scan is still finishing. Try again shortly.'],
  ['SCANNER_CLEANUP_FAILED','The previous scan could not finish safely. Scanning is unavailable until cleanup is verified.'],
  ['SCANNER_UNAVAILABLE','The scanner is unavailable. Try again later.'],
  ['PUBLIC_SCANNING_DISABLED','Website scanning is not available yet. Scan a built-in page or explore an example.'],
  ['SCAN_FAILED','The scan could not finish. No report was created. Try again.'],
]);
export function scanErrorMessage(value: unknown, status: number): string {
  const data = value && typeof value === 'object' ? value as Record<string,unknown> : {};
  if (data.code === 'SCAN_FAILED') {
    const diagnostic = readDiagnostic(data.diagnostic);
    const explanation = diagnostic?.stage === 'page-loading' ? (diagnostic.code === 'HTTP_STATUS' ? httpStatusMessage(diagnostic.httpStatus) : redirectMessage(diagnostic.code)) : undefined;
    if (explanation) return explanation;
  }
  if (typeof data.code === 'string' && messages.has(data.code)) return messages.get(data.code)!;
  if (status === 400 && typeof data.error === 'string' && data.error.length <= 500) return data.error;
  return 'The request could not finish. No report was created. Try again.';
}

export function scanCoverageFeedback(report: Pick<Report, 'mode' | 'coverage' | 'pageLoadIncomplete'>) {
  if (report.mode !== 'public') return undefined;
  const coverage = readScanCoverage(report.coverage);
  if (!coverage) return { title: 'Scan coverage details unavailable', details: [
    'Coverage counts were not returned in a valid format. Do not assume all resources loaded or all findings were returned.',
    'Single-page automated checks only. Zero violations does not establish accessibility conformance.',
  ] };
  const missingResources = coverage.blockedRequests > 0 || coverage.failedRequests > 0;
  const omittedResults = coverage.omittedRules > 0 || coverage.omittedNodes > 0;
  return { title: report.pageLoadIncomplete===true || missingResources || omittedResults ? 'Scan coverage is limited' : 'Scan coverage', details: [
    ...(report.pageLoadIncomplete===true?['The page did not finish loading within 15 seconds. Unfinished loads were stopped; this partial report covers only the rendered content.']:[]),
    missingResources
      ? `${coverage.blockedRequests} requests blocked by policy; ${coverage.failedRequests} requests failed. These counts may overlap. Missing resources can change findings.`
      : 'No blocked or failed requests were reported. Other scan limitations still apply.',
    ...(omittedResults ? [`Result limits omitted ${coverage.omittedRules} rules and ${coverage.omittedNodes} affected elements. The returned results are partial.`] : []),
    'Single-page automated checks only. Zero violations does not establish accessibility conformance.',
  ] };
}
