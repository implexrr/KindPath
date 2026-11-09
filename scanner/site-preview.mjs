// A bounded visual approximation. No source HTML, stylesheet text, image URLs or form values leave the worker.
export async function captureSiteSnapshot(page) {
  const snapshot = await page.evaluate(() => {
    const tags = new Set(['header','nav','main','section','article','aside','footer','div','span','p','h1','h2','h3','a','form','input','button','label','strong','em','small','br','ul','ol','li']);
    const length = /^(?:auto|none|normal|-?(?:\d{1,5})(?:\.\d{1,4})?px)(?: (?:auto|-?\d{1,5}(?:\.\d{1,4})?px)){0,3}$/;
    const color = /^(?:transparent|[a-z]{1,24}|#[a-fA-F0-9]{3,8}|rgba?\([0-9.,% ]{1,80}\))$/;
    const rules = new Map([
      ...['width','max-width','min-height','margin','padding','gap','font-size','line-height','border-width','border-radius'].map(key => [key,length]),
      ...['color','background-color','border-color'].map(key => [key,color]),
      ['display', /^(?:none|block|inline|inline-block|flex|inline-flex|grid|list-item)$/],
      ['font-weight', /^(?:normal|bold|[1-9]00)$/], ['font-style', /^(?:normal|italic|oblique)$/],
      ['text-align', /^(?:start|end|left|right|center|justify)$/], ['text-decoration-line', /^(?:none|underline|line-through|overline)$/],
      ['border-style', /^(?:none|solid|dashed|dotted|double)$/], ['flex-direction', /^(?:row|column|row-reverse|column-reverse)$/],
      ['flex-wrap', /^(?:nowrap|wrap|wrap-reverse)$/], ['align-items', /^(?:normal|start|end|center|stretch|flex-start|flex-end|baseline)$/],
      ['justify-content', /^(?:normal|start|end|center|flex-start|flex-end|space-between|space-around|space-evenly)$/],
    ]);
    let nodes = 0, textLeft = 8000, styleLeft = 20000, omittedSubtrees = 0, omittedText = 0, omittedStyles = 0;
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
    for (const sheet of [...document.styleSheets].slice(0,20)) {
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
        if (nodes >= 250) { omittedSubtrees += parent.childNodes.length-i; break; }
        const child = capture(parent.childNodes[i],depth);
        if (child) result.push(child);
      }
      return result;
    }
    function capture(node, depth) {
      if (depth > 15) { omittedSubtrees++; return null; }
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? '';
        const value = text.slice(0,Math.min(textLeft,4000));
        omittedText += text.length-value.length; textLeft -= value.length;
        if (!value) return null;
        nodes++; return {text:value};
      }
      if (!(node instanceof HTMLElement) || (!tags.has(node.localName) && !(node instanceof HTMLImageElement))) { omittedSubtrees++; return null; }
      if (node instanceof HTMLImageElement) return capture(document.createTextNode('[Image omitted]'),depth);
      nodes++;
      const attributes = {};
      for (const key of ['aria-label','aria-hidden']) {
        const value = node.getAttribute(key);
        if (value && value.length <= 120) attributes[key] = value;
      }
      const normal = styles(getComputedStyle(node)); const highlighted = {};
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
