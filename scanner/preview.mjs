// Capture only the supported structure of the fixed display fixture. This is not a public-site sanitizer.
export async function captureFixtureSnapshot(page, task) {
  return page.evaluate(task => {
    const tags = new Set(['header','nav','main','section','article','aside','footer','div','span','p','h1','h2','h3','a','form','input','button','label','strong','em','small','br','ul','ol','li']);
    const attributes = new Set(['class','id','aria-label','aria-hidden']);
    function capture(node) {
      if (node.nodeType === Node.TEXT_NODE) return { text: node.textContent ?? '' };
      // Images become a fixed inert marker; no source URL or image data crosses the boundary.
      if (node instanceof HTMLImageElement) return { tag: 'span', attributes: { class: 'kindpath-image-placeholder', 'aria-label': 'Image placeholder' }, children: [{ text: 'Image' }] };
      if (!(node instanceof HTMLElement) || !tags.has(node.localName)) return null;
      return { tag: node.localName,
        attributes: Object.fromEntries([...node.attributes].filter(attribute => attributes.has(attribute.name)).map(attribute => [attribute.name, attribute.value])),
        children: [...node.childNodes].map(capture).filter(Boolean) };
    }
    return { task, styles: [...document.querySelectorAll('style')].map(style => style.textContent).join('\n') + (document.images.length ? '\n.kindpath-image-placeholder{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:#467439;color:white;font:9px Arial;overflow:hidden}' : ''),
      nodes: [...document.body.childNodes].map(capture).filter(Boolean) };
  }, task);
}
