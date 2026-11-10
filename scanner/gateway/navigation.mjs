import { websiteUrl } from './url.mjs';

// URL relationship only: every destination still needs independent DNS,
// firewall and TLS validation. Never use this as network authorization.
export function navigationRejection(requested, destination, previous = requested) {
  let initial, next, prior;
  try {
    initial = websiteUrl(requested); next = websiteUrl(destination); prior = websiteUrl(previous);
  } catch { return 'DESTINATION_REJECTED'; }
  const counterpart = initial.hostname.startsWith('www.')
    ? initial.hostname.slice(4) : `www.${initial.hostname}`;
  if (next.hostname !== initial.hostname && next.hostname !== counterpart) return 'REDIRECT_HOST_CHANGED';
  // URL.search collapses an absent query and an explicitly empty '?' query.
  // Compare the serialized path/query to preserve that server-visible distinction.
  if (next.href.slice(next.origin.length) !== initial.href.slice(initial.origin.length)) return 'REDIRECT_PATH_CHANGED';
  if (next.protocol === 'http:' && (initial.protocol === 'https:' || prior.protocol === 'https:')) return 'REDIRECT_DOWNGRADE';
  return undefined;
}

const messages = new Map([
  ['DESTINATION_REJECTED', 'The page tried to navigate to a destination KindPath does not allow. No report was created.'],
  ['REDIRECT_HOST_CHANGED', 'This page redirects to a different hostname. KindPath only allows adding or removing www. from the submitted hostname. No report was created.'],
  ['REDIRECT_PATH_CHANGED', 'This page redirects to a different path or query. KindPath currently scans only the submitted page. No report was created.'],
  ['REDIRECT_DOWNGRADE', 'This page redirects from HTTPS to HTTP. KindPath does not allow insecure downgrades. No report was created.'],
  ['REDIRECT_LOOP', 'This page repeats a navigation URL. KindPath stops repeated redirects to prevent loops. No report was created.'],
  ['REDIRECT_LIMIT', 'This page exceeds the redirect limit. No report was created.'],
]);
export function redirectMessage(code) { return messages.get(code); }
