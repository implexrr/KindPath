export interface Finding {
  id: string;
  severity: 'Critical' | 'Serious' | 'Moderate' | 'Minor' | 'Unknown';
  title: string;
  location: string;
  impact: string;
  fix: string;
}
export interface Report {
  mode: 'demo' | 'fixture';
  url: string;
  generatedAt: string;
  manualChecks: string[];
  findings: Finding[];
  scanner?: { engineVersion: string; fixture: string; incomplete: Finding[]; passedChecks: number; inapplicableChecks: number };
}
