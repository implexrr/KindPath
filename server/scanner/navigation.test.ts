import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navigationRejection, redirectMessage } from '../../scanner/gateway/navigation.mjs';

test('single-page navigation permits only the original host or its single www counterpart and HTTPS upgrades', () => {
  for (const [initial, final] of [
    ['http://example.com/a?q=1', 'http://www.example.com/a?q=1'],
    ['http://www.example.com/a?q=1', 'https://example.com/a?q=1'],
    ['https://example.com/a?q=1', 'https://www.example.com/a?q=1'],
    ['https://www.example.com/a?q=1', 'https://example.com/a?q=1'],
    ['http://example.com/a?q=1', 'https://example.com/a?q=1'],
    ['https://EXAMPLE.com:443/a?q=1', 'https://example.com/a?q=1'],
    ['https://blog.example.com/a', 'https://www.blog.example.com/a'],
  ]) assert.equal(navigationRejection(initial, final), undefined, `${initial} -> ${final}`);
});
test('single-page navigation rejects host tricks and downgrades', () => {
  const initial = 'https://example.com/a?q=1';
  for (const final of ['https://example.org/a?q=1', 'https://example.com.evil.org/a?q=1',
    'https://www.www.example.com/a?q=1', 'https://blog.example.com/a?q=1']) {
    assert.equal(navigationRejection(initial, final), 'REDIRECT_HOST_CHANGED');
  }
  for (const final of ['https://example.com/b?q=1', 'https://example.com/a?q=2',
    'https://example.com/a/?q=1', 'https://example.com/a', 'https://example.com/%61?q=1']) {
    assert.equal(navigationRejection(initial, final), undefined);
  }
  assert.equal(navigationRejection(initial, 'http://example.com/a?q=1'), 'REDIRECT_DOWNGRADE');
  assert.equal(navigationRejection('http://example.com/', 'http://www.example.com/', 'https://example.com/'), 'REDIRECT_DOWNGRADE');
  for (const value of ['http://127.0.0.1/a?q=1', 'https://user:pass@example.com/a?q=1',
    'https://example.com:444/a?q=1', 'https://example.com/a?q=1#other', null, {}]) {
    assert.equal(navigationRejection(initial, value), 'DESTINATION_REJECTED');
  }
});
test('redirect explanations are fixed strings and never echo untrusted fields', () => {
  for (const code of ['DESTINATION_REJECTED', 'REDIRECT_HOST_CHANGED', 'REDIRECT_PATH_CHANGED', 'REDIRECT_DOWNGRADE', 'REDIRECT_LOOP', 'REDIRECT_LIMIT']) {
    assert.match(redirectMessage(code)!, /No report was created/);
  }
  for (const value of ['constructor', '__proto__', 'https://private.invalid/', {}, undefined]) assert.equal(redirectMessage(value), undefined);
});

test('same-site canonical navigation permits absent and empty queries', () => {
  for (const [from,to] of [
    ['https://example.com/page?','https://example.com/page'],
    ['https://example.com/page','https://example.com/page?'],
  ]) assert.equal(navigationRejection(from,to),undefined);
  assert.equal(navigationRejection('http://example.com/page?', 'https://www.example.com/page?'),undefined);
});
