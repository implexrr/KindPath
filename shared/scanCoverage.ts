import type { ScanCoverage } from './types';

// Reconstruct known counts instead of passing through worker or response fields.
export function readScanCoverage(value: unknown): ScanCoverage | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const counts = value as Record<string, unknown>;
  const keys = ['blockedRequests', 'failedRequests', 'omittedRules', 'omittedNodes'] as const;
  if (!keys.every(key => Object.hasOwn(counts, key) && Number.isSafeInteger(counts[key]) && Number(counts[key]) >= 0)) return undefined;
  return { blockedRequests: counts.blockedRequests as number, failedRequests: counts.failedRequests as number,
    omittedRules: counts.omittedRules as number, omittedNodes: counts.omittedNodes as number };
}
