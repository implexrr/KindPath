import { snapshotResolver } from './policy.mjs';
import { websiteUrl } from './url.mjs';

// One immutable answer per host and scan. DNS is performed by the controller,
// which grants addresses only after independently verifying the kernel policy.
export function controllerResolver(initial, request) {
  const fixed = snapshotResolver(initial, Object.keys(initial));
  const cache = new Map(Object.keys(initial).map(host => [host, fixed(host)]));
  return host => {
    if (websiteUrl(`https://${host}/`).hostname !== host) throw new Error('Invalid host');
    if (cache.has(host)) return cache.get(host).then(answers => answers.map(answer => ({...answer})));
    if (cache.size >= 16) return Promise.reject(new Error('Host limit exceeded'));
    const pending = (async () => {
      const answers = await request(host);
      return snapshotResolver({[host]:answers}, [host])(host);
    })();
    cache.set(host, pending);
    return pending.then(answers => answers.map(answer => ({...answer})));
  };
}
