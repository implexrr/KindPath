type WebsiteUrlResult = { url: URL; error?: never } | { url?: never; error: string };

// Input validation only: not an SSRF safeguard for a future website scanner.
export function validateWebsiteUrl(value: unknown): WebsiteUrlResult {
  if (typeof value !== 'string' || value.length > 2048) {
    return { error: 'Enter a website URL, up to 2,048 characters.' };
  }
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { return { error: 'Enter a complete URL, such as https://example.com.' }; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    return { error: 'Use an HTTP or HTTPS URL without embedded credentials.' };
  }
  return { url };
}
