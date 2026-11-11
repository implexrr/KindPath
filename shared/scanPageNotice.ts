const notices = {
  'browser-verification': 'KindPath received a browser verification screen. The findings and any preview describe that screen.',
  'sign-in': 'KindPath received a sign-in screen. The findings and any preview describe that screen.',
};

export type ScanPageNotice = keyof typeof notices;

export function readScanPageNotice(value: unknown): ScanPageNotice | undefined {
  return value === 'browser-verification' || value === 'sign-in' ? value : undefined;
}

export function scanPageNoticeText(value: unknown): string | undefined {
  const notice = readScanPageNotice(value);
  return notice && notices[notice];
}
