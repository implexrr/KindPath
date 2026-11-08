import type { FormEvent } from 'react';

interface WebsiteFormProps {
  url: string;
  busy: boolean;
  error: string;
  onUrlChange: (url: string) => void;
  onSubmit: (event: FormEvent) => void;
  onExample: () => void;
}

export function WebsiteForm({ url, busy, error, onUrlChange, onSubmit, onExample }: WebsiteFormProps) {
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
          {busy ? 'Preparing…' : 'Explore accessibility'} <span aria-hidden="true">→</span>
        </button>
      </div>
      <p id="demo-note" className="form-note">Demo mode · URLs aren’t fetched. Findings are illustrative.</p>
      {error && <p role="alert" id="url-error" className="error">{error}</p>}
    </form>
    <button className="text-button" disabled={busy} onClick={onExample}>
      Just exploring? Try an example <span aria-hidden="true">↗</span>
    </button>
  </>;
}
