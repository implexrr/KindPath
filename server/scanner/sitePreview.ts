import {mapImagePreview} from './imagePreview.js';
import { PREVIEW_GUARD } from '../../shared/previewPolicy.js';
import type { SitePreview } from '../../shared/types.js';
import { validatePublicUrl } from './publicPolicy.js';

const tags = new Set(['header','nav','main','section','article','aside','footer','div','span','p','h1','h2','h3','h4','h5','h6','blockquote','figure','figcaption','dl','dt','dd','table','caption','thead','tbody','tfoot','tr','th','td','hr','a','form','input','button','label','strong','em','small','b','i','pre','code','time','br','ul','ol','li']);
const length = /^(?:auto|none|normal|-?(?:\d{1,5})(?:\.\d{1,4})?px)(?: (?:auto|-?\d{1,5}(?:\.\d{1,4})?px)){0,3}$/;
const color = /^(?:transparent|[a-z]{1,24}|#[a-fA-F0-9]{3,8}|rgba?\([0-9.,% ]{1,80}\))$/;
const styles = new Map<string,RegExp>([
  ...['width','height','max-width','max-height','min-width','min-height','margin','padding','gap','font-size','line-height','border-width','border-radius'].map(key => [key,length] as [string,RegExp]),
  ...['color','background-color','border-color'].map(key => [key,color] as [string,RegExp]),
  ['box-sizing', /^(?:content-box|border-box)$/],
      ['white-space', /^(?:normal|nowrap|pre|pre-wrap|pre-line|break-spaces)$/],
      ['overflow-wrap', /^(?:normal|break-word|anywhere)$/], ['border-collapse', /^(?:collapse|separate)$/],
      ['grid-template-columns', /^(?:none|\d{1,5}(?:\.\d{1,4})?px(?: \d{1,5}(?:\.\d{1,4})?px){0,7})$/],
      ['display', /^(?:none|block|inline|inline-block|flex|inline-flex|grid|list-item|table|inline-table|table-row-group|table-header-group|table-footer-group|table-row|table-cell|table-column-group|table-column|table-caption)$/],
  ['font-weight', /^(?:normal|bold|[1-9]00)$/], ['font-style', /^(?:normal|italic|oblique)$/],
  ['text-align', /^(?:start|end|left|right|center|justify)$/], ['text-decoration-line', /^(?:none|underline|line-through|overline)$/],
  ['border-style', /^(?:none|solid|dashed|dotted|double)$/], ['flex-direction', /^(?:row|column|row-reverse|column-reverse)$/],
  ['flex-wrap', /^(?:nowrap|wrap|wrap-reverse)$/], ['align-items', /^(?:normal|start|end|center|stretch|flex-start|flex-end|baseline)$/],
  ['justify-content', /^(?:normal|start|end|center|flex-start|flex-end|space-between|space-around|space-evenly)$/],
]);
const escape = (text: string) => text.replace(/[&<>"']/g, value => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[value]!);
const invalid = (): never => { throw new Error('Invalid site snapshot.'); };
function record(value: unknown): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string,unknown>;
}
export function mapSitePreview(raw: unknown, identity: {scanId:string;requestedUrl:string;url:string}): SitePreview {
  const snapshot = record(raw);
  const requestedUrl = validatePublicUrl(identity.requestedUrl), url = validatePublicUrl(identity.url);
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(identity.scanId) || snapshot.url !== url || typeof snapshot.capturedAt !== 'string'
    || snapshot.capturedAt.length > 30 || !Number.isFinite(Date.parse(snapshot.capturedAt))) return invalid();
  if(snapshot.kind==='image')return mapImagePreview(snapshot,{...identity,requestedUrl,url});
  if(!Array.isArray(snapshot.nodes))return invalid();
  for (const key of ['omittedSubtrees','omittedText','omittedStyles']) if (!Number.isSafeInteger(snapshot[key]) || Number(snapshot[key]) < 0 || Number(snapshot[key]) > 1000000) return invalid();
  let count = 0, css = '', textLength = 0, capturedTextCharacters = 0;
  function declarations(value: unknown) {
    const entries = Object.entries(record(value));
    if (entries.length > styles.size) return invalid();
    return entries.map(([key,value]) => {
      if (typeof value !== 'string' || value.length > 120 || !styles.get(key)?.test(value)) return invalid();
      return `${key}:${value};`;
    }).join('');
  }
  if (snapshot.bodyStyle !== undefined) css = `body{${declarations(snapshot.bodyStyle)}}`;
  function render(value: unknown, depth = 0): string {
    if (++count > 300 || depth > 15) return invalid();
    const node = record(value);
    if (typeof node.text === 'string') {
      textLength += node.text.length;
      if (Object.keys(node).length !== 1 || node.text.length > 4000 || textLength > 10000) return invalid();
      capturedTextCharacters += node.text.replace(/\s/g, '').length;
      return escape(node.text);
    }
    if (Object.keys(node).sort().join(',') !== 'attributes,children,hover,style,tag' || typeof node.tag !== 'string' || !tags.has(node.tag) || !Array.isArray(node.children)) return invalid();
    const tag = node.tag === 'form' ? 'div' : node.tag;
    const attrs = Object.entries(record(node.attributes));
    if (attrs.some(([key,value]) => {
      if (typeof value !== 'string' || value.length > 120) return true;
      if (['aria-label','aria-hidden'].includes(key)) return false;
      if (['td','th'].includes(tag) && ['colspan','rowspan'].includes(key)) return !/^(?:[1-9][0-9]?|100)$/.test(value);
      if (tag === 'th' && key === 'scope') return !['row','col','rowgroup','colgroup'].includes(value);
      return true;
    })) return invalid();
    const className = `kp-node-${count}`;
    const normal = declarations(node.style), hover = declarations(node.hover);
    if (hover && !['a','button'].includes(tag)) return invalid();
    css += `.${className}{${normal}}` + (hover ? `.${className}:hover{${hover}}` : '');
    if (css.length > 30000) return invalid();
    const attributes = attrs.filter(([key]) => tag !== 'a' || key !== 'aria-hidden').map(([key,value]) => ` ${key}="${escape(value as string)}"`).join('');
    const disabled = tag === 'a' ? ' aria-disabled="true"' : ['input','button'].includes(tag) ? ' disabled' : '';
    if (tag === 'input' || tag === 'br' || tag === 'hr') { if (node.children.length) return invalid(); return `<${tag} class="${className}"${attributes}${disabled}>`; }
    return `<${tag} class="${className}"${attributes}${disabled}>${node.children.map(child => render(child,depth+1)).join('')}</${tag}>`;
  }
  const body = snapshot.nodes.map(node => render(node)).join('');
  const title = new URL(url).hostname;
  const html = `${PREVIEW_GUARD}<title>${escape(title)} page snapshot</title><style>body{margin:0;font-family:Arial,sans-serif}${css}</style><body>${body}</body>`;
  if (html.length > 100000) return invalid();
  return {mode:'public',...identity,requestedUrl,url,title,capturedAt:snapshot.capturedAt,capturedTextCharacters,html,limitations:[
    'A limited visual approximation captured after automated analysis in the same browser visit; dynamic content may differ.',
    'Scripts, embedded frames, images, media, custom fonts, form values, shadow-tree content and unsupported structure/styles are omitted. Some page structure is simplified. Only simple readable link/button hover rules are retained.',
    `At least ${snapshot.omittedSubtrees} subtrees, ${snapshot.omittedText} text characters and ${snapshot.omittedStyles} style declarations were omitted.`,
  ]};
}
