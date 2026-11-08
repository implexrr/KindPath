export interface Finding {
  id: string;
  severity: 'Serious' | 'Moderate';
  title: string;
  location: string;
  impact: string;
  fix: string;
}
export interface Report {
  mode: 'demo';
  url: string;
  generatedAt: string;
  manualChecks: string[];
  findings: Finding[];
}
