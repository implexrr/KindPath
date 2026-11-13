import { useLayoutEffect, useRef } from 'react';
import type { FormEvent } from 'react';

interface WebsiteFormProps {
  url: string;
  activity: string;
  reportReady: boolean;
  onViewReport: () => void;
  onCancel: () => void;
  onRetry: () => void;
  canRetry: boolean;
  cancelled: boolean;
  publicScanningEnabled: boolean;
  capabilitiesLoading: boolean;
  busy: boolean;
  fieldError: string;
  scanError: string;
  onUrlChange: (url: string) => void;
  onSubmit: (event: FormEvent) => void;
}

export function WebsiteForm({ url, activity, reportReady, onViewReport, onCancel, onRetry, canRetry, cancelled, busy, fieldError, scanError, onUrlChange, onSubmit, publicScanningEnabled, capabilitiesLoading }: WebsiteFormProps) {
  const urlInput = useRef<HTMLInputElement>(null);
  const reportButton = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const retryButton=useRef<HTMLButtonElement>(null);
  const errorMessage = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    if (fieldError) urlInput.current?.focus();
    else if ((cancelled || scanError) && canRetry) retryButton.current?.focus();
    else if (scanError) errorMessage.current?.focus();
  }, [cancelled, fieldError, scanError, canRetry]);
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (reportReady && (active === document.body || form.current?.contains(active))) {
      reportButton.current?.focus({ preventScroll: true });
    }
  }, [reportReady]);
  return <form ref={form} onSubmit={event => {
    if (fieldError) urlInput.current?.focus();
    onSubmit(event);
  }}>
    <label htmlFor="website">Your website URL</label>
    <div className={fieldError ? "url-field url-field-invalid" : "url-field"}>
      <input
        id="website" ref={urlInput} aria-invalid={fieldError ? true : undefined} type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        readOnly={busy} placeholder="example.com" value={url}
        onChange={e => onUrlChange(e.target.value)} required maxLength={2048}
        aria-describedby={['website-entry-note', !publicScanningEnabled && 'scanner-note', fieldError && 'url-error'].filter(Boolean).join(' ')}
      />
      <button disabled={busy||capabilitiesLoading} type="submit">
        {capabilitiesLoading ? 'Checking scanner…' : 'Scan website'} <span aria-hidden="true">→</span>
      </button>
    </div>
    <p id="website-entry-note" className="form-note">One public page per scan. HTTPS is added if you leave it out.</p>
    <div className={scanError ? 'scan-feedback scan-feedback-error' : 'scan-feedback'}>
      <div>
        {fieldError && <p role="alert" id="url-error" className="error">{fieldError}</p>}
        {!publicScanningEnabled && <p id="scanner-note">
          {capabilitiesLoading ? 'Checking scanner availability…' : 'Website scanning is currently unavailable.'}
        </p>}
        <div className="scan-activity">
          {busy && <span className="landing-sprite scan-sprout" aria-hidden="true"/>}
          <p role="status">{activity}{busy && <span className="scan-dots" aria-hidden="true">...</span>}</p>
        </div>
        {scanError && <p ref={errorMessage} tabIndex={-1} role="alert" id="scan-error">{scanError}</p>}
      </div>
      {busy && <button type="button" className="secondary" onClick={onCancel}>Cancel request</button>}
      {canRetry && <button ref={retryButton} type="button" className="secondary" aria-describedby={scanError ? 'scan-error' : undefined} onClick={onRetry}>Try again</button>}
      {reportReady && <button ref={reportButton} type="button" className="secondary view-report-action" onClick={onViewReport}>View report <span aria-hidden="true">↓</span></button>}
    </div>
  </form>;
}
