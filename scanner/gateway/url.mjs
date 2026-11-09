import { isIP } from 'node:net';

// Syntax preflight only. The controller must still reject every non-public DNS
// answer and install verified, pinned firewall destinations before connection.
export function websiteUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\x00-\x1f\x7f]/.test(value)) throw new Error('Use a public HTTP/HTTPS website URL.');
  const url = new URL(value);
  const host = url.hostname;
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash
    || (url.port && Number(url.port) !== (url.protocol === 'https:' ? 443 : 80))
    || isIP(host.replace(/^\[|\]$/g, '')) || host.length > 253 || !host.includes('.')
    || !host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    || /(?:^|\.)(?:localhost|local|internal|invalid|test|example|onion)$/.test(host) || host.endsWith('.home.arpa')) {
    throw new Error('Use a public HTTP/HTTPS hostname on its standard port, without credentials or fragments.');
  }
  return url;
}
