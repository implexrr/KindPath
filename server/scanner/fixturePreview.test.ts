import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapFixturePreview } from './fixturePreview.js';
const element = (tag: string, attributes = {}, children: unknown[] = []) => ({ tag, attributes, children });
const snapshot = (nodes: unknown[]) => ({ task: 'preview-garden', styles: 'a:hover{color:brown}', nodes });

test('fixture snapshots escape text and remove active form/navigation behavior', () => {
  const result = mapFixturePreview(snapshot([element('form', {}, [element('input'), element('button', {}, [{ text: 'Join' }])]),
    element('a', { class: 'cta' }, [{ text: '<script>not markup</script>' }])]));
  assert.equal(result.fixture, 'garden');
  assert.match(result.html, /Content-Security-Policy/);
  assert.match(result.html, /<input disabled>/);
  assert.match(result.html, /<button disabled>Join/);
  assert.match(result.html, /aria-disabled="true"/);
  assert.match(result.html, /&lt;script&gt;/);
  assert.equal(result.html.includes('<form'), false);
});
test('unsupported markup, executable attributes, CSS breakouts, and excessive snapshot sizes are rejected', () => {
  for (const raw of [null, { ...snapshot([]), task: 'https://example.com' }, snapshot([element('script')]),
    snapshot([element('a', { href: 'http://127.0.0.1' })]), snapshot([element('div', { onclick: 'alert(1)' })]),
    { ...snapshot([]), styles: '</style><a href="https://example.com">' },
    snapshot([{ text: 'x'.repeat(4001) }]), snapshot(Array.from({ length: 301 }, () => ({ text: 'x' })))]) {
    assert.throws(() => mapFixturePreview(raw), /Invalid fixture snapshot/);
  }
});
