// A bounded visual approximation. No source HTML, stylesheet text, image URLs or form values leave the worker.
export async function captureSiteSnapshot(page) {
  const snapshot = await page.evaluate(() => {
    const tags = new Set(['header','nav','main','section','article','aside','footer','div','span','p','h1','h2','h3','h4','h5','h6','blockquote','figure','figcaption','dl','dt','dd','table','caption','thead','tbody','tfoot','tr','th','td','hr','a','form','input','button','label','strong','em','small','br','ul','ol','li']);
    const length = /^(?:auto|none|normal|-?(?:\d{1,5})(?:\.\d{1,4})?px)(?: (?:auto|-?\d{1,5}(?:\.\d{1,4})?px)){0,3}$/;
    const color = /^(?:transparent|[a-z]{1,24}|#[a-fA-F0-9]{3,8}|rgba?\([0-9.,% ]{1,80}\))$/;
    const rules = new Map([
      ...['width','height','max-width','max-height','min-width','min-height','margin','padding','gap','font-size','line-height','border-width','border-radius'].map(key => [key,length]),
      ...['color','background-color','border-color'].map(key => [key,color]),
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
    let nodes = 0, visited = 0, textLeft = 8000, styleLeft = 20000, omittedSubtrees = 0, omittedText = 0, omittedStyles = 0;
    function styles(declaration) {
      const result = {};
      for (const [key, valid] of rules) {
        const value = declaration.getPropertyValue(key).trim();
        if (!value) continue;
        const cost = key.length + value.length + 2;
        if (!valid.test(value) || cost > styleLeft) { omittedStyles++; continue; }
        styleLeft -= cost; result[key] = value;
      }
      return result;
    }
    // Only simple terminal :hover selectors from readable, top-level rules are supported.
    const hover = []; let checkedRules = 0;
    for (let sheetIndex=0; sheetIndex<Math.min(document.styleSheets.length,20); sheetIndex++) {
      const sheet=document.styleSheets[sheetIndex];
      try {
        for (const rule of sheet.cssRules) {
          if (++checkedRules > 500) break;
          if (!(rule instanceof CSSStyleRule) || rule.selectorText.length > 180) continue;
          for (const selector of rule.selectorText.split(',')) {
            const value = selector.trim();
            if (/^[a-zA-Z0-9_.*# >+~-]{1,170}:hover$/.test(value)) hover.push([value.slice(0,-6), rule.style]);
          }
        }
      } catch { /* Cross-origin stylesheet rules are intentionally not read. */ }
      if (checkedRules > 500) break;
    }
    function children(parent, depth) {
      const result = [];
      for (let i = 0; i < parent.childNodes.length; i++) {
        if (nodes >= 250 || visited >= 1000) { omittedSubtrees += parent.childNodes.length-i; break; }
        const child = capture(parent.childNodes[i],depth);
        if (child) result.push(child);
      }
      return result;
    }
    // These tags remain block-level if the output style budget is exhausted.
    // Omitted/hidden nodes and styled inline tags cannot justify removing a separator.
    const blockTags = new Set(['header','nav','main','section','article','aside','footer','div','p','h1','h2','h3','h4','h5','h6','blockquote','figure','figcaption','dl','dt','dd','table','hr','ul','ol','li','form']);
    function blockInFlow(node) {
      if (!(node instanceof HTMLElement) || !blockTags.has(node.localName) || node.hidden) return false;
      const computed = getComputedStyle(node);
      return ['block','flow-root','list-item','flex','grid','table'].includes(computed.display)
        && !['hidden','collapse'].includes(computed.visibility)
        && !['absolute','fixed'].includes(computed.position) && computed.getPropertyValue('float') === 'none';
    }
    function formattingSpace(node, text) {
      // Discard only short, collapsible ASCII spacing beside normal-flow blocks.
      // Inline word separators and preformatted/out-of-flow spacing must survive.
      if (text.length > 4000 || !/^[ \t\r\n]+$/.test(text) || !node.parentElement
        || !['normal','nowrap'].includes(getComputedStyle(node.parentElement).whiteSpace)) return false;
      const before = node.previousSibling, after = node.nextSibling;
      return !!(before || after) && (!before || blockInFlow(before)) && (!after || blockInFlow(after));
    }
    function capture(node, depth) {
      visited++;
      if (depth > 15) { omittedSubtrees++; return null; }
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? '';
        if (formattingSpace(node, text)) return null;
        const value = text.slice(0,Math.min(textLeft,4000));
        omittedText += text.length-value.length; textLeft -= value.length;
        if (!value) return null;
        nodes++; return {text:value};
      }
      if (!(node instanceof HTMLElement) || (!tags.has(node.localName) && !(node instanceof HTMLImageElement))) { omittedSubtrees++; return null; }
      const computed=getComputedStyle(node);
      if (node.hidden || computed.display === 'none' || ['hidden','collapse'].includes(computed.visibility)) { omittedSubtrees++; return null; }
      if (node instanceof HTMLImageElement) return capture(document.createTextNode('[Image omitted]'),depth);
      nodes++;
      const attributes = {};
      for (const key of ['aria-label','aria-hidden']) {
        const value = node.getAttribute(key);
        if (value && value.length <= 120) attributes[key] = value;
      }
      if (['td','th'].includes(node.localName)) {
        for (const key of ['colspan','rowspan']) {
          const value=node.getAttribute(key); if (value && /^(?:[1-9][0-9]?|100)$/.test(value)) attributes[key]=value;
        }
        const scope=node.getAttribute('scope');
        if (node.localName === 'th' && ['row','col','rowgroup','colgroup'].includes(scope)) attributes.scope=scope;
      }
      const normal = styles(computed); const highlighted = {};
      if (node.localName === 'a' || node.localName === 'button') {
        for (const [selector, declaration] of hover) {
          try { if (node.matches(selector)) Object.assign(highlighted,styles(declaration)); } catch {}
        }
      }
      return {tag:node.localName,attributes,style:normal,hover:highlighted,children:children(node,depth+1)};
    }
    return {url:location.href,nodes:children(document.body,0),omittedSubtrees,omittedText,omittedStyles};
  });
  return {...snapshot,capturedAt:new Date().toISOString()};
}
