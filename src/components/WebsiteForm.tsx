import type { FormEvent } from 'react';

interface WebsiteFormProps {
  url: string;
  publicScanningEnabled: boolean;
  allowedHosts: string[];
  busy: boolean;
  error: string;
  onUrlChange: (url: string) => void;
  onSubmit: (event: FormEvent) => void;
  onExample: () => void;
  onFixtureScan: () => void;
}

export function WebsiteForm({ url, busy, error, onUrlChange, onSubmit, onExample, onFixtureScan, publicScanningEnabled, allowedHosts }: WebsiteFormProps) {
  return <>
    <form onSubmit={onSubmit} aria-busy={busy}>
      <label htmlFor="website">Your website URL</label>
      <div className="url-field">
        <span aria-hidden="true">↗</span>
        <input
          id="website" type="url" placeholder="https://your-website.com" value={url}
          onChange={e => onUrlChange(e.target.value)} required maxLength={2048}
          aria-describedby={error ? 'url-error demo-note' : 'demo-note'}
        />
        <button disabled={busy} type="submit">
          {busy ? 'Preparing…' : publicScanningEnabled ? 'Scan allowlisted website' : 'Explore accessibility'} <span aria-hidden="true">→</span>
        </button>
      </div>
      <p id="demo-note" className="form-note">{publicScanningEnabled ? `Allowed hosts: ${allowedHosts.join(', ')}. Automated single-page checks only.` : 'Demo mode · URLs aren’t fetched. Findings are illustrative.'}</p>
      {error && <p role="alert" id="url-error" className="error">{error}</p>}
    </form>
    <button className="text-button" disabled={busy} onClick={onExample}>
      Just exploring? Try an example <span aria-hidden="true">↗</span>
    </button>
    <div className="fixture-scan">
      <button className="secondary" disabled={busy} onClick={onFixtureScan}>Run isolated fixture scan</button>
      <p className="form-note">Real axe-core checks on a built-in example. Public URL scanning is disabled.</p>
    </div>
  </>;
}
