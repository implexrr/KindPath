// Capture only the supported structure of the fixed display fixture. This is not a public-site sanitizer.
export async function captureFixtureSnapshot(page) {
  return page.evaluate(() => {
    const tags = new Set(['header','nav','main','section','article','aside','footer','div','span','p','h1','h2','h3','a','form','input','button','label','strong','em','small','br','ul','ol','li']);
    const attributes = new Set(['class','id','aria-label','aria-hidden']);
    function capture(node) {
      if (node.nodeType === Node.TEXT_NODE) return { text: node.textContent ?? '' };
      if (!(node instanceof HTMLElement) || !tags.has(node.localName)) return null;
      return { tag: node.localName,
        attributes: Object.fromEntries([...node.attributes].filter(attribute => attributes.has(attribute.name)).map(attribute => [attribute.name, attribute.value])),
        children: [...node.childNodes].map(capture).filter(Boolean) };
    }
    return { task: 'preview-garden', styles: [...document.querySelectorAll('style')].map(style => style.textContent).join('\n'),
      nodes: [...document.body.childNodes].map(capture).filter(Boolean) };
  });
}
