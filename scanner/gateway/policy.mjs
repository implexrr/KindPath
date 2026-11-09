import { websiteUrl } from './url.mjs';
import ipaddr from 'ipaddr.js';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

export function publicAddress(address) {
  if (typeof address !== 'string' || address.includes('%')) return null;
  try {
    const parsed = ipaddr.process(address);
    if (parsed.range() !== 'unicast') return null;
    if (parsed.kind() === 'ipv6' && !parsed.match(ipaddr.parse('2000::'), 3)) return null;
    return { address: parsed.toString(), family: parsed.kind() === 'ipv4' ? 4 : 6 };
  } catch { return null; }
}

export function validateTarget(raw, allowedHosts, connect = false) {
  if (typeof raw !== 'string' || raw.length > 2048 || /[\s\x00-\x1f\x7f]/.test(raw)) throw new Error('Blocked destination');
  const url = new URL(connect ? `https://${raw}/` : raw);
  if (url.username || url.password || url.hash || !['http:', 'https:'].includes(url.protocol)) throw new Error('Blocked destination');
  const host = url.hostname.toLowerCase();
  if (allowedHosts === null) websiteUrl(url.href);
  if (isIP(host.replace(/^\[|\]$/g, '')) || (allowedHosts !== null && !allowedHosts.includes(host)) || host.endsWith('.')) throw new Error('Blocked destination');
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (port !== (url.protocol === 'https:' ? 443 : 80)) throw new Error('Blocked port');
  if (connect && (raw !== `${host}:443` || url.protocol !== 'https:')) throw new Error('Blocked tunnel');
  return { url, host, port };
}

export async function resolveTarget(raw, allowedHosts, connect = false, resolver = lookup, timeoutMs = 5000) {
  const target = validateTarget(raw, allowedHosts, connect);
  const timeout = AbortSignal.timeout(timeoutMs);
  const answers = await Promise.race([
    resolver(target.host, { all: true, verbatim: true }),
    new Promise((_, reject) => timeout.addEventListener('abort', () => reject(new Error('DNS timeout')), { once: true })),
  ]);
  if (!Array.isArray(answers) || !answers.length || answers.length > 16) throw new Error('Blocked DNS result');
  const addresses = answers.map(answer => publicAddress(answer.address));
  // Reject mixed public/private answers rather than selecting a convenient public answer.
  if (addresses.some(address => !address)) throw new Error('Blocked DNS result');
  return { ...target, ...addresses[0] };
}

export function pinnedDestination(target) {
  const address = publicAddress(target.address);
  if (!address || ![80, 443].includes(target.port)) throw new Error('Blocked connection');
  return { host: address.address, family: address.family, port: target.port };
}

// Runtime lookups use the controller's immutable snapshot, never DNS from the gateway namespace.
export function snapshotResolver(value, allowedHosts) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid snapshot');
  const entries = Object.entries(value);
  if (entries.length > allowedHosts.length) throw new Error('Invalid snapshot');
  const snapshot = new Map(entries.map(([host, answers]) => {
    if ((allowedHosts !== null && !allowedHosts.includes(host)) || !Array.isArray(answers) || !answers.length || answers.length > 16) throw new Error('Invalid snapshot');
    const parsed = answers.map(publicAddress);
    if (parsed.some(item => !item || item.family !== 4)) throw new Error('Invalid snapshot');
    return [host, parsed.map(item => ({ address: item.address, family: 4 }))];
  }));
  return async host => {
    const answers = snapshot.get(host);
    if (!answers) throw new Error('Destination not in frozen snapshot');
    return answers.map(answer => ({ ...answer }));
  };
}
