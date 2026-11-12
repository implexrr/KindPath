import { useLayoutEffect, useRef } from 'react';
import type { FormEvent } from 'react';

interface WebsiteFormProps {
  url: string;
  activity: string;
  onCancel: () => void;
  onRetry: () => void;
  canRetry: boolean;
  cancelled: boolean;
  publicScanningEnabled: boolean;
  capabilitiesLoading: boolean;
  busy: boolean;
  error: string;
  onUrlChange: (url: string) => void;
  onSubmit: (event: FormEvent) => void;
}

export function WebsiteForm({ url, activity, onCancel, onRetry, canRetry, cancelled, busy, error, onUrlChange, onSubmit, publicScanningEnabled, capabilitiesLoading }: WebsiteFormProps) {
  const retryButton=useRef<HTMLButtonElement>(null);
  const errorMessage = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    if ((cancelled || error) && canRetry) retryButton.current?.focus();
    else if (error) errorMessage.current?.focus();
  }, [cancelled, error, canRetry]);
  return <form onSubmit={onSubmit} aria-busy={busy}>
    <label htmlFor="website">Your website URL</label>
    <div className="url-field">
      <input
        id="website" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        disabled={busy} placeholder="example.com" value={url}
        onChange={e => onUrlChange(e.target.value)} required maxLength={2048}
        aria-describedby={['website-entry-note', !publicScanningEnabled && 'scanner-note', error && 'url-error'].filter(Boolean).join(' ')}
      />
      <button disabled={busy||capabilitiesLoading} type="submit">
        {busy ? 'Preparing…' : capabilitiesLoading ? 'Checking scanner…' : 'Scan website'} <span aria-hidden="true">→</span>
      </button>
    </div>
    <p id="website-entry-note" className="form-note">One public page per scan. HTTPS is added if you leave it out.</p>
    <p id="scanner-note" className="form-note" hidden={publicScanningEnabled}>
      {capabilitiesLoading ? 'Checking scanner availability…' : 'Website scanning is currently unavailable.'}
    </p>
    <p className="form-note" role="status" aria-live="polite">{activity}</p>
    {busy && <button type="button" className="secondary" onClick={onCancel}>Cancel request</button>}
    {canRetry && <button ref={retryButton} type="button" className="secondary" onClick={onRetry}>Try again</button>}
    {error && <p ref={errorMessage} tabIndex={-1} role="alert" id="url-error" className="error">{error}</p>}
  </form>;
}
