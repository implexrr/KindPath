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
  const selected = rules.slice(0, 100);
  return {
    omittedRules: rules.length - selected.length,
    omittedNodes: rules.reduce((count, rule) => count + rule.nodes.length, 0)
      - selected.reduce((count, rule) => count + Math.min(rule.nodes.length, 20), 0),
    rules: selected.map(rule => ({
      id: rule.id, impact: rule.impact ?? 'unknown', help: rule.help,
      description: rule.description, helpUrl: rule.helpUrl,
      nodes: rule.nodes.slice(0, 20).map(node => ({
        target: node.target.map(selector => typeof selector === 'string' ? selector : JSON.stringify(selector)),
        summary: (node.failureSummary ?? '').slice(0, 2000),
      })),
    })),
  };
}
