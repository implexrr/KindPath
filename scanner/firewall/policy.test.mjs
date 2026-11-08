import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addresses, rules, hash, isPermissionDenied } from './policy.mjs';
test('firewall snapshots accept only bounded, unique numeric IPv4 addresses', () => {
  for (const value of [null, 'example.com', ['example.com'], ['::1'], ['1.2.3.4; accept'], ['1.2.3.4\n'], ['1.2.3.4','1.2.3.4'], Array(17).fill('1.2.3.4')]) assert.throws(() => addresses(value));
  assert.deepEqual(addresses(['198.18.0.2']), ['198.18.0.2']);
});
test('rules deny every IPv6 path and default to drop without DNS or loopback exceptions', () => {
  const text = rules(['198.18.0.2']);
  assert.equal((text.match(/policy drop/g) ?? []).length, 3);
  assert.ok(text.includes('table inet kindpath'));
  assert.ok(text.includes('priority -150'));
  assert.ok(text.includes('tcp dport { 80, 443 }'));
  assert.equal(text.includes('udp'), false);
  assert.equal(text.includes('lo accept'), false);
  assert.equal(rules([]).includes('accept'), false);
  assert.equal(hash(text), hash(rules(['198.18.0.2'])));
});

test('the privilege probe accepts a completed permission-denied result', () => {
  assert.equal(isPermissionDenied({ status: 1, signal: null, stderr: 'netlink: Operation not permitted' }), true);
});
test('the privilege probe rejects launch failure, timeout, and unrelated command failures', () => {
  for (const result of [
    { status: null, signal: null, error: { code: 'ENOENT' }, stderr: '' },
    { status: null, signal: 'SIGTERM', error: { code: 'ETIMEDOUT' }, stderr: 'Operation not permitted' },
    { status: 1, signal: null, stderr: 'Syntax error' },
    { status: 0, signal: null, stderr: 'Operation not permitted' },
  ]) assert.equal(isPermissionDenied(result), false);
});
