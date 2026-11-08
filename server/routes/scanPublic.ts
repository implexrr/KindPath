import { Router } from 'express';
import { PUBLIC_SCANNING_ENABLED, ALLOWED_PUBLIC_HOSTS, validatePublicUrl } from '../scanner/publicPolicy.js';
import { scanPublicSite } from '../scanner/publicScanner.js';
import { ScannerError } from '../scanner/dockerWorker.js';

export const publicRouter = Router();
publicRouter.get('/scanning-capabilities', (_req, res) => {
  res.json({ publicScanningEnabled: PUBLIC_SCANNING_ENABLED, allowedHosts: ALLOWED_PUBLIC_HOSTS });
});
publicRouter.post('/scan-public', async (req, res, next) => {
  if (!PUBLIC_SCANNING_ENABLED) {
    res.status(503).json({ error: 'Public URL scanning is disabled pending security review.', code: 'PUBLIC_SCANNING_DISABLED' });
    return;
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length !== 1 || !('url' in req.body)) {
    res.status(400).json({ error: 'Supply one allowlisted URL.' }); return;
  }
  try { validatePublicUrl(req.body.url); } catch {
    res.status(400).json({ error: 'Use an allowlisted HTTP/HTTPS URL on its standard port without credentials or fragments.' }); return;
  }
  const abort = new AbortController();
  res.once('close', () => { if (!res.writableEnded) abort.abort(); });
  try { res.json(await scanPublicSite(req.body.url, abort.signal)); }
  catch (error) {
    if (res.destroyed) return;
    if (error instanceof ScannerError) res.status(error.code === 'SCANNER_BUSY' ? 429 : 503).json({ error: error.message, code: error.code });
    else next(error);
  }
});
