import AxeBuilder from '@axe-core/playwright';

export function analyzePublicPage(page) {
  // KindPath needs full violations and manual-review details, but only counts
  // passing and inapplicable rules. Keep the existing rule and frame options.
  return new AxeBuilder({ page }).options({
    iframes: false,
    resultTypes: ['violations', 'incomplete'],
  }).analyze();
}

// Bound worker output without presenting a shortened list as the complete result.
export function summarizeRules(rules) {
  const selected = rules.slice(0, 100).map(rule => ({
    id: rule.id, impact: rule.impact ?? 'unknown', help: rule.help,
    description: rule.description, helpUrl: rule.helpUrl,
    nodes: rule.nodes.slice(0, 20).flatMap(node => {
      if (node.target.length > 100) return [];
      const target = node.target.map(selector => typeof selector === 'string' ? selector : JSON.stringify(selector));
      // A shortened selector could point to the wrong element.
      if (target.some(selector => selector.length > 4000)) return [];
      return [{ target, summary: (node.failureSummary ?? '').slice(0, 2000) }];
    }),
  }));
  return {
    omittedRules: rules.length - selected.length,
    omittedNodes: rules.reduce((count, rule) => count + rule.nodes.length, 0)
      - selected.reduce((count, rule) => count + rule.nodes.length, 0),
    rules: selected,
  };
}

// Runs inside the guarded browser. Return only a fixed code, never page text.
export function detectScanPageNotice() {
  const normalize = text => text.trim().replace(/\s+/g, ' ').toLowerCase();
  const visible = element => element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const main = document.querySelector('main, [role="main"]') ?? document.body;
  if (!main || !visible(main)) return undefined;

  const heading = [...main.querySelectorAll('h1')].find(visible);
  const headingText = heading ? normalize(heading.innerText) : '';
  const verification = /^(?:checking your browser|verify (?:that )?you are human|verifying (?:your browser|that you are human)|(?:[a-z0-9.-]+ )?is verifying your browser)[.!…]*$/;
  const rendered = main.innerText;
  if (rendered.length <= 200) {
    const text = normalize(rendered);
    const supportingText = text.startsWith(headingText) ? text.slice(headingText.length).trim() : '';
    if (verification.test(text) || (verification.test(headingText) && /^(?:please wait|this may take a few seconds)\b/.test(supportingText))) {
      return 'browser-verification';
    }
  }

  if (/^(?:sign in|log in|login)(?: to (?:your account|[a-z0-9][a-z0-9 .&'-]{0,60}))?[.!]?$/.test(headingText)) {
    if ([...main.querySelectorAll('form input[type="password"]')].some(visible)) return 'sign-in';
  }
  return undefined;
}
