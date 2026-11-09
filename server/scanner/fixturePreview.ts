import { fixtureTitle, isPreviewFixture } from '../../shared/fixtures.js';
import type { PreviewFixtureId } from '../../shared/fixtures.js';
import type { FixturePreview } from '../../shared/types.js';
import { PREVIEW_GUARD } from '../../shared/previewPolicy.js';
import { runIsolatedWorker } from './dockerWorker.js';

const tags = new Set(['header','nav','main','section','article','aside','footer','div','span','p','h1','h2','h3','a','form','input','button','label','strong','em','small','br','ul','ol','li']);
const attributes = new Set(['class','id','aria-label','aria-hidden']);
const escape = (text: string) => text.replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]!);
const invalid = () => { throw new Error('Invalid fixture snapshot.'); };

export function mapFixturePreview(raw: unknown, fixture: PreviewFixtureId = 'garden'): FixturePreview {
  if (!isPreviewFixture(fixture) || !raw || typeof raw !== 'object') return invalid();
  const snapshot = raw as { task?: unknown; styles?: unknown; nodes?: unknown };
  if (snapshot.task !== `preview-${fixture}` || typeof snapshot.styles !== 'string' || snapshot.styles.length > 20000
    || /[<>]/.test(snapshot.styles) || !Array.isArray(snapshot.nodes)) return invalid();
  let count = 0;
  function render(value: unknown, depth = 0): string {
    if (++count > 300 || depth > 15 || !value || typeof value !== 'object' || Array.isArray(value)) return invalid();
    const node = value as Record<string, unknown>;
    if (typeof node.text === 'string') {
      if (Object.keys(node).length !== 1 || node.text.length > 4000) return invalid();
      return escape(node.text);
    }
    if (typeof node.tag !== 'string' || !tags.has(node.tag) || !Array.isArray(node.children)
      || !node.attributes || typeof node.attributes !== 'object' || Array.isArray(node.attributes)) return invalid();
    const attrs = Object.entries(node.attributes);
    if (attrs.some(([key, value]) => !attributes.has(key) || typeof value !== 'string' || value.length > 300)) return invalid();
    // Forms become layout groups; anchors have no destinations, and form controls cannot activate.
    const tag = node.tag === 'form' ? 'div' : node.tag;
    const serialized = attrs.filter(([key]) => node.tag !== 'a' || key !== 'aria-hidden')
      .map(([key, value]) => ` ${key}="${escape(value as string)}"`).join('');
    const inactive = tag === 'a' ? ' aria-disabled="true"' : ['input','button'].includes(tag) ? ' disabled' : '';
    if (tag === 'input' || tag === 'br') {
      if (node.children.length) return invalid();
      return `<${tag}${serialized}${inactive}>`;
    }
    return `<${tag}${serialized}${inactive}>${node.children.map(child => render(child, depth + 1)).join('')}</${tag}>`;
  }
  const body = snapshot.nodes.map(node => render(node)).join('');
  const html = `${PREVIEW_GUARD}<title>${escape(fixtureTitle(fixture))} fixture snapshot</title><style>${snapshot.styles}</style><body>${body}</body>`;
  if (html.length > 100000) return invalid();
  return { mode: 'fixture', fixture, title: fixtureTitle(fixture), capturedAt: new Date().toISOString(), html };
}
export async function captureFixturePreview(fixture: PreviewFixtureId = 'garden', signal?: AbortSignal) {
  return mapFixturePreview(await runIsolatedWorker(`preview-${fixture}`, signal), fixture);
}
