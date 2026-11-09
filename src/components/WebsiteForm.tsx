import { FIXTURES, fixtureTitle } from '../../shared/fixtures';
import type { FixtureId } from '../../shared/fixtures';
import type { FormEvent } from 'react';

interface WebsiteFormProps {
  url: string;
  activity: string;
  onCancel: () => void;
  onRetry: () => void;
  canRetry: boolean;
  publicScanningEnabled: boolean;
  allowedHosts: string[];
  busy: boolean;
  error: string;
  onUrlChange: (url: string) => void;
  onSubmit: (event: FormEvent) => void;
  onExample: () => void;
  fixture: FixtureId;
  onFixtureChange: (fixture: FixtureId) => void;
  onFixtureScan: () => void;
}

export function WebsiteForm({ url, activity, onCancel, onRetry, canRetry, busy, error, onUrlChange, onSubmit, onExample, onFixtureScan, fixture, onFixtureChange, publicScanningEnabled, allowedHosts }: WebsiteFormProps) {
  return <>
    <form onSubmit={onSubmit} aria-busy={busy}>
      <label htmlFor="website">Your website URL</label>
      <div className="url-field">
        <span aria-hidden="true">↗</span>
        <input
          id="website" type="url" disabled={busy} placeholder="https://your-website.com" value={url}
          onChange={e => onUrlChange(e.target.value)} required maxLength={2048}
          aria-describedby={error ? 'url-error demo-note' : 'demo-note'}
        />
        <button disabled={busy} type="submit">
          {busy ? 'Preparing…' : publicScanningEnabled ? 'Scan allowlisted website' : 'Explore accessibility'} <span aria-hidden="true">→</span>
        </button>
      </div>
      <p id="demo-note" className="form-note">{publicScanningEnabled ? `Allowed hosts: ${allowedHosts.join(', ')}. Automated single-page checks only.` : 'Demo mode · URLs aren’t fetched. Findings are illustrative.'}</p>
      <p className="form-note" role="status" aria-live="polite">{activity}</p>
      {busy && <button type="button" className="secondary" onClick={onCancel}>Cancel request</button>}
      {canRetry && <button type="button" className="secondary" onClick={onRetry}>Try again</button>}
      {error && <p role="alert" id="url-error" className="error">{error}</p>}
    </form>
    <button className="text-button" disabled={busy} onClick={onExample}>
      Just exploring? Try an example <span aria-hidden="true">↗</span>
    </button>
    <div className="fixture-scan">
      <label htmlFor="scan-fixture">Built-in page</label>
      <select id="scan-fixture" value={fixture} onChange={event => onFixtureChange(event.target.value as FixtureId)} aria-describedby="fixture-selection-note">
        {FIXTURES.map(id => <option key={id} value={id}>{fixtureTitle(id)}</option>)}
      </select>
      <button className="secondary" disabled={busy} onClick={onFixtureScan}>Scan built-in page</button>
      <p className="form-note" id="fixture-selection-note">Scan this built-in page, then preview the same page. Changing the selection clears current results.{!publicScanningEnabled && ' Public URL scanning is disabled.'}</p>
    </div>
  </>;
}
