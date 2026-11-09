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
  coverage?: ScanCoverage;
  mode: 'demo' | 'fixture' | 'public';
  requestedUrl?: string;
  scanId?: string;
  sitePreview?: SitePreview;
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
