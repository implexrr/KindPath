import { isIP } from 'node:net';
import { createHash } from 'node:crypto';

// Only the trusted controller supplies numeric snapshots. No hostname, script, or rule text is accepted.
export function addresses(value) {
  if (!Array.isArray(value) || value.length > 64 || value.some(ip => typeof ip !== 'string' || isIP(ip) !== 4)) throw new Error('Invalid firewall snapshot');
  if (new Set(value).size !== value.length) throw new Error('Duplicate destination');
  return [...value].sort();
}
export function rules(value) {
  const ips = addresses(value);
  const out = ips.length ? `ip daddr { ${ips.join(', ')} } tcp dport { 80, 443 } ct state { new, established } counter accept` : '';
  const incoming = ips.length ? `ip saddr { ${ips.join(', ')} } tcp sport { 80, 443 } ct state established counter accept` : '';
  return `table inet kindpath {
    chain output { type filter hook output priority -150; policy drop; ${out}
 counter drop; }
    chain input { type filter hook input priority 0; policy drop; ${incoming}
 counter drop; }
    chain forward { type filter hook forward priority 0; policy drop; counter drop; }
  }
`;
}
export const hash = text => createHash('sha256').update(text).digest('hex');

// A failed launch or timeout does not prove the kernel denied permission.
export function isPermissionDenied(result) {
  return result.error === undefined && result.signal === null && result.status === 1
    && typeof result.stderr === 'string' && /Operation not permitted|Permission denied/i.test(result.stderr);
}
