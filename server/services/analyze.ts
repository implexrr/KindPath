import type { Report } from '../../shared/types.js';

// Creates illustrative findings; this function does not fetch or scan a website.
export function createDemoReport(url: URL): Report {
  return {
    mode: 'demo', url: url.href, generatedAt: new Date().toISOString(),
    manualChecks: ['Navigate the page using only a keyboard.', 'Check reading order and names with a screen reader.', 'Check zoom, reflow, and content clarity.'],
    findings: [
      { id: 'label', severity: 'Serious', title: 'Give every form field a clear label', impact: 'A screen reader user may not know what information to enter.', elements: [{ targets: ['Example newsletter · email input'], guidance: 'Add a visible <label> and connect its htmlFor to the input id.' }] },
      { id: 'contrast', severity: 'Serious', title: 'Make supporting text easier to read', impact: 'Low contrast can make text difficult to distinguish from its background.', elements: [{ targets: ['Example product card · description'], guidance: 'Check the actual foreground and background colours. Aim for at least 4.5:1 for normal text.' }] },
      { id: 'link', severity: 'Moderate', title: 'Describe where your links lead', impact: 'A link read out of context may not communicate its destination.', elements: [{ targets: ['Example article · “Read more” link'], guidance: 'Use descriptive link text, such as “Read our guide to growing herbs”.' }] },
    ],
  };
}
