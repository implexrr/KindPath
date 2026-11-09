const messages = new Map([
  ['SCANNER_BUSY','Another scan is still finishing. Try again shortly.'],
  ['SCANNER_CLEANUP_FAILED','The previous scan could not finish safely. Scanning is unavailable until cleanup is verified.'],
  ['SCANNER_UNAVAILABLE','The scanner is unavailable. Try again later.'],
  ['PUBLIC_SCANNING_DISABLED','Website scanning is not available yet. Scan a built-in page or explore an example.'],
  ['SCAN_FAILED','The scan could not finish. No report was created. Try again.'],
]);
export function scanErrorMessage(value: unknown, status: number): string {
  const data = value && typeof value === 'object' ? value as Record<string,unknown> : {};
  if (typeof data.code === 'string' && messages.has(data.code)) return messages.get(data.code)!;
  if (status === 400 && typeof data.error === 'string' && data.error.length <= 500) return data.error;
  return 'The request could not finish. No report was created. Try again.';
}
