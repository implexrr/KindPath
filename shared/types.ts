import type { PreviewFixtureId } from './fixtures';

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
export interface ScanCoverage {
  blockedRequests: number;
  failedRequests: number;
  omittedRules: number;
  omittedNodes: number;
}
export interface Report {
  pageLoadIncomplete?: true;
  coverage?: ScanCoverage;
  mode: 'demo' | 'fixture' | 'public';
  requestedUrl?: string;
  scanId?: string;
  sitePreview?: SitePreview;
  previewUnavailable?: boolean;
  url: string;
  generatedAt: string;
  manualChecks: string[];
  findings: Finding[];
  limitations?: string[];
  scanner?: { engineVersion: string; fixture: string; incomplete: Finding[]; passedChecks: number; inapplicableChecks: number };
}

export interface FixturePreview {
  mode: 'fixture';
  fixture: PreviewFixtureId;
  title: string;
  capturedAt: string;
  html: string;
}

export interface SitePreview {
  kind?: 'image';
  width?: number;
  height?: number;
  truncated?: boolean;
  // Non-whitespace UTF-16 units in accepted text nodes; not a visibility or fidelity measure.
  capturedTextCharacters?: number;
  mode: 'public';
  scanId: string;
  requestedUrl: string;
  url: string;
  title: string;
  capturedAt: string;
  html: string;
  limitations: string[];
}
