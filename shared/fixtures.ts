export const FIXTURES = ['barriers', 'clear'] as const;
export type FixtureId = typeof FIXTURES[number];
export type PreviewFixtureId = FixtureId | 'garden';
export function isFixture(value: unknown): value is FixtureId {
  return typeof value === 'string' && (FIXTURES as readonly string[]).includes(value);
}
export function isPreviewFixture(value: unknown): value is PreviewFixtureId {
  return value === 'garden' || isFixture(value);
}
export function fixtureTitle(fixture: PreviewFixtureId): string {
  switch (fixture) {
    case 'barriers': return 'Garden form with barriers';
    case 'clear': return 'Labelled garden form';
    case 'garden': return 'Community garden';
  }
}
