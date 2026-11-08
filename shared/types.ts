export interface FindingElement {
  targets: string[];
  guidance: string;
}
export interface Finding {
  id: string;
  severity: 'Critical' | 'Serious' | 'Moderate' | 'Minor' | 'Unknown';
  title: string;
  impact: string;
  elements: FindingElement[];
}
export interface Report {
  mode: 'demo' | 'fixture' | 'public';
  url: string;
  generatedAt: string;
  manualChecks: string[];
  findings: Finding[];
  limitations?: string[];
  scanner?: { engineVersion: string; fixture: string; incomplete: Finding[]; passedChecks: number; inapplicableChecks: number };
}

export interface FixturePreview {
  mode: 'fixture';
  fixture: 'garden';
  title: string;
  capturedAt: string;
  html: string;
}
