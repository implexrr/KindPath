import { websiteUrl } from '../../scanner/gateway/url.mjs';
import { validateDestinationPlan } from './destinationSnapshot.js';
import type { DestinationPlan } from './destinationSnapshot.js';

export const MAX_SCAN_HOSTS = 16;
export const MAX_SCAN_ADDRESSES = 64;
export type PlanTarget = (target: string, signal: AbortSignal) => Promise<DestinationPlan>;

// One scan owns this cache. Failed lookups count toward the host limit too.
// Serialize approvals so the firewall union and its proof cannot race.
export function createDestinationApprover(initial: DestinationPlan, planTarget: PlanTarget,
  install: (addresses: string[]) => Promise<void>, signal: AbortSignal) {
  const first = validateDestinationPlan(initial);
  const cache = new Map<string, Promise<readonly string[] | null>>([
    [new URL(first.target).hostname, Promise.resolve(first.addresses)],
  ]);
  let pinned = [...first.addresses];
  let queue: Promise<unknown> = Promise.resolve();
  return (host: unknown): Promise<readonly string[] | null> => {
    signal.throwIfAborted();
    if (typeof host !== 'string' || websiteUrl(`https://${host}/`).hostname !== host) throw new Error('Invalid destination hostname');
    const existing = cache.get(host);
    if (existing) return existing;
    if (cache.size >= MAX_SCAN_HOSTS) return Promise.resolve(null);
    const approval = queue.then(async () => {
      signal.throwIfAborted();
      let candidate: DestinationPlan;
      try { candidate = await planTarget(`https://${host}/`, signal); }
      catch { signal.throwIfAborted(); return null; } // A blocked/missing resource is a coverage limitation.
      const plan = validateDestinationPlan(candidate);
      if (plan.target !== `https://${host}/`) throw new Error('Mismatched destination approval');
      const combined = [...new Set([...pinned, ...plan.addresses])].sort();
      if (combined.length > MAX_SCAN_ADDRESSES) return null;
      signal.throwIfAborted();
      await install(combined); // Includes verification; errors fail the entire scan closed.
      signal.throwIfAborted();
      pinned = combined;
      return plan.addresses;
    });
    cache.set(host, approval);
    queue = approval; // A failed firewall update must poison all subsequent approvals.
    return approval;
  };
}
