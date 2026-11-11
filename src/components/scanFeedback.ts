import { httpStatusMessage, readDiagnostic } from '../../scanner/gateway/diagnostics.mjs';
import { redirectMessage } from '../../scanner/gateway/navigation.mjs';
import type { Report } from '../../shared/types';
import { readScanCoverage } from '../../shared/scanCoverage';

export interface ScanFailureFeedback {
  message: string;
  retryable: boolean;
}

const failures = new Map<string, ScanFailureFeedback>([
  ['SCAN_RATE_LIMITED', { message: 'Too many requests. Wait up to a minute and try again.', retryable: true }],
  ['SCANNER_BUSY', { message: 'Another scan is still finishing. Try again shortly.', retryable: true }],
  ['SCANNER_CLEANUP_FAILED', { message: 'The previous scan could not finish safely. Scanning is unavailable until cleanup is verified.', retryable: false }],
  ['SCANNER_UNAVAILABLE', { message: 'The scanner is unavailable. Check that the local scanner is running.', retryable: false }],
  ['PUBLIC_SCANNING_DISABLED', { message: 'Website scanning is not available yet. Scan a built-in page or explore an example.', retryable: false }],
  ['SCAN_FAILED', { message: 'The scan could not finish. No report was created.', retryable: false }],
]);

const temporaryHttpStatuses = new Set([408, 429, 500, 502, 503, 504]);
const temporaryDiagnostics = new Set([
  'TIMEOUT', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'ERR_CONNECTION_RESET',
  'ERR_CONNECTION_TIMED_OUT', 'ERR_TIMED_OUT',
]);

export function scanFailureFeedback(value: unknown, status: number): ScanFailureFeedback {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  if (data.code === 'SCAN_FAILED') {
    const diagnostic = readDiagnostic(data.diagnostic);
    if (diagnostic?.stage === 'page-loading') {
      const redirect = redirectMessage(diagnostic.code);
      if (redirect) return { message: redirect + ' Check the address and submit an eligible public page.', retryable: false };
      if (diagnostic.code === 'HTTP_STATUS' && typeof diagnostic.httpStatus === 'number') {
        const message = httpStatusMessage(diagnostic.httpStatus);
        if (message) return {
          message: diagnostic.httpStatus === 403 ? message + ' If you have a public address for this page, enter it above.' : message,
          retryable: temporaryHttpStatuses.has(diagnostic.httpStatus),
        };
      }
    }
    if (diagnostic && temporaryDiagnostics.has(diagnostic.code)) {
      return { message: 'The scan was interrupted or timed out. No report was created. Try again shortly.', retryable: true };
    }
  }
  const known = typeof data.code === 'string' ? failures.get(data.code) : undefined;
  if (known) return known;
  if (status === 400 && typeof data.error === 'string' && data.error.length <= 500) {
    return { message: data.error, retryable: false };
  }
  return { message: 'The request could not finish. No report was created.', retryable: temporaryHttpStatuses.has(status) };
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
    ...(report.pageLoadIncomplete===true?['Some page resources were still loading when the scan began. Unfinished loads were stopped, so this partial report covers only the rendered content.']:[]),
    missingResources
      ? `${coverage.blockedRequests} requests blocked by policy; ${coverage.failedRequests} requests failed. These counts may overlap. Missing resources can change findings.`
      : 'No blocked or failed requests were reported. Other scan limitations still apply.',
    ...(omittedResults ? [`Result limits omitted ${coverage.omittedRules} rules and ${coverage.omittedNodes} affected elements. The returned results are partial.`] : []),
    'Single-page automated checks only. Zero violations does not establish accessibility conformance.',
  ] };
}
