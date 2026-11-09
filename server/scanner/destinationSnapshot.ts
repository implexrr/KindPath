import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { validatePublicUrl } from './publicPolicy.js';

// Conservatively exclude every IANA special-purpose IPv4 block, plus multicast.
// https://www.iana.org/assignments/iana-ipv4-special-registry/
const excluded: [string, number][] = [
  ['0.0.0.0',8], ['10.0.0.0',8], ['100.64.0.0',10], ['127.0.0.0',8], ['169.254.0.0',16],
  ['172.16.0.0',12], ['192.0.0.0',24], ['192.0.2.0',24], ['192.31.196.0',24], ['192.52.193.0',24],
  ['192.88.99.0',24], ['192.168.0.0',16], ['192.175.48.0',24], ['198.18.0.0',15],
  ['198.51.100.0',24], ['203.0.113.0',24], ['224.0.0.0',4], ['240.0.0.0',4],
];
const ipv4Number = (address: string) => address.split('.').reduce((value, part) => value * 256 + Number(part), 0);
export function isPublicIpv4(address: unknown): address is string {
  if (typeof address !== 'string' || isIP(address) !== 4) return false;
  const value = ipv4Number(address);
  return !excluded.some(([base, bits]) => Math.floor(value / 2 ** (32 - bits)) === Math.floor(ipv4Number(base) / 2 ** (32 - bits)));
}
export type DestinationPlan = Readonly<{
  target: string;
  addresses: readonly string[];
  destinations: Readonly<Record<string, readonly string[]>>;
}>;
function freezePlan(target: string, values: unknown): DestinationPlan {
  const url = validatePublicUrl(target);
  if (!Array.isArray(values) || !values.length || values.length > 16 || !values.every(isPublicIpv4)) throw new Error('Invalid destination snapshot');
  const addresses = Object.freeze([...new Set(values as string[])].sort());
  return Object.freeze({ target: url, addresses, destinations: Object.freeze({ [new URL(url).hostname]: addresses }) });
}
export function validateDestinationPlan(value: unknown): DestinationPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid destination plan');
  const plan = value as Record<string, unknown>;
  if (Object.keys(plan).sort().join(',') !== 'addresses,destinations,target' || typeof plan.target !== 'string'
    || !plan.destinations || typeof plan.destinations !== 'object' || Array.isArray(plan.destinations)) throw new Error('Invalid destination plan');
  const normalized = freezePlan(plan.target, plan.addresses);
  const entries = Object.entries(plan.destinations);
  if (entries.length !== 1 || entries[0][0] !== new URL(normalized.target).hostname
    || JSON.stringify(entries[0][1]) !== JSON.stringify(normalized.addresses)
    || JSON.stringify(plan.addresses) !== JSON.stringify(normalized.addresses)) throw new Error('Inconsistent destination plan');
  return normalized;
}
type Resolver = (host: string, options: { all: true; family: 4; verbatim: true }) => Promise<unknown>;
export async function createDestinationPlan(target: string, resolver: Resolver = lookup, signal?: AbortSignal): Promise<DestinationPlan> {
  const url = validatePublicUrl(target); // Never perform DNS for an unapproved URL.
  const deadline = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(5000)]);
  deadline.throwIfAborted();
  let onAbort: () => void = () => {};
  try {
    const answers = await Promise.race([resolver(new URL(url).hostname, { all: true, family: 4, verbatim: true }),
      new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error('Destination DNS lookup cancelled or timed out'));
        if (deadline.aborted) onAbort(); else deadline.addEventListener('abort', onAbort, { once: true });
      })]);
    deadline.throwIfAborted();
    if (!Array.isArray(answers) || answers.some(answer => !answer || answer.family !== 4 || !isPublicIpv4(answer.address))) throw new Error('Invalid destination DNS answers');
    return freezePlan(url, answers.map(answer => answer.address));
  } finally { deadline.removeEventListener('abort', onAbort); }
}
