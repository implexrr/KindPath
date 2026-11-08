import type { Finding, Report } from '../../shared/types.js';
import type { FixtureId } from './containerPolicy.js';
import { runIsolatedWorker } from './dockerWorker.js';

const severities = new Map<string, Finding['severity']>([
  ['critical', 'Critical'], ['serious', 'Serious'], ['moderate', 'Moderate'], ['minor', 'Minor'], ['unknown', 'Unknown'],
]);

interface WorkerRule {
  id: string; impact: string; help: string; description: string; helpUrl: string;
  nodes: { target: string[]; summary: string }[];
}
function isText(value: unknown): value is string { return typeof value === 'string' && value.length <= 4000; }
function isRules(value: unknown): value is WorkerRule[] {
  return Array.isArray(value) && value.length <= 100 && value.every(rule => rule &&
    ['id', 'impact', 'help', 'description', 'helpUrl'].every(key => isText(rule[key])) && severities.has(rule.impact) &&
    Array.isArray(rule.nodes) && rule.nodes.length <= 20 && rule.nodes.every((node: WorkerRule['nodes'][number]) =>
      node && Array.isArray(node.target) && node.target.length <= 100 && node.target.every(isText) && isText(node.summary)));
}
export function mapFixtureReport(raw: unknown, fixture: FixtureId): Report {
  const r = raw as Record<string, unknown> | null;
  if (!r || r.fixture !== fixture || !isText(r.engine) || !isRules(r.violations) || !isRules(r.incomplete)
    || !Number.isSafeInteger(r.passes) || Number(r.passes) < 0 || !Number.isSafeInteger(r.inapplicable) || Number(r.inapplicable) < 0) {
    throw new Error('Invalid scanner output.');
  }
  const finding = (rule: WorkerRule): Finding => ({
    id: rule.id,
    severity: severities.get(rule.impact) ?? 'Unknown',
    title: rule.help,
    location: rule.nodes.flatMap(node => node.target).join(', ').slice(0, 2000) || 'Page',
    impact: rule.description,
    fix: rule.nodes.map(node => node.summary).filter(Boolean).join('\n').slice(0, 4000) || 'Review this rule manually and consult its accessibility guidance.',
  });
  return {
    mode: 'fixture', url: `fixture:${fixture}`, generatedAt: new Date().toISOString(),
    findings: r.violations.map(finding),
    manualChecks: ['Review reading order and names with a screen reader.', 'Navigate using only a keyboard.', 'Check zoom, reflow, and content clarity.'],
    scanner: { engineVersion: r.engine, fixture, incomplete: r.incomplete.map(finding), passedChecks: Number(r.passes), inapplicableChecks: Number(r.inapplicable) },
  };
}
export async function scanFixture(fixture: FixtureId, signal?: AbortSignal): Promise<Report> {
  return mapFixtureReport(await runIsolatedWorker(fixture, signal), fixture);
}
