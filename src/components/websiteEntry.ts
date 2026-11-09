// Form convenience only. Public scans still pass the scanner's URL/DNS policy.
export function normalizeWebsiteEntry(value: string): string {
  const fail = () => new Error('Enter a website address, such as example.com or https://example.com, without credentials.');
  if (value.length > 2048 || /[\x00-\x1f\x7f\\]/.test(value)) throw fail();
  const input = value.trim();
  if (!input || /\s/.test(input) || /^[/?#]/.test(input)) throw fail();
  const explicit = /^https?:\/\//i.test(input);
  // A hostname followed by a numeric port is not a URI scheme.
  const hostPort = /^[^/:?#@]+\.[^/:?#@]+:\d+(?:[/?#]|$)/.test(input);
  if (!explicit && /^[a-z][a-z0-9+.-]*:/i.test(input) && !hostPort) throw fail();
  let url: URL;
  try { url = new URL(explicit ? input : `https://${input}`); } catch { throw fail(); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.href.length > 2048) throw fail();
  return url.href;
}
