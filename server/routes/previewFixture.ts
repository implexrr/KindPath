import { Router } from 'express';
import { captureFixturePreview } from '../scanner/fixturePreview.js';
import { ScannerError } from '../scanner/dockerWorker.js';

export const previewRouter = Router();
previewRouter.post('/preview-fixture', async (req, res, next) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
    || Object.keys(req.body).length !== 1 || req.body.fixture !== 'garden') {
    res.status(400).json({ error: 'Choose the built-in garden preview fixture.' }); return;
  }
  const abort = new AbortController();
  res.once('close', () => { if (!res.writableEnded) abort.abort(); });
  try { res.json(await captureFixturePreview(abort.signal)); }
  catch (error) {
    if (res.destroyed) return;
    if (error instanceof ScannerError) res.status(error.code === 'SCANNER_BUSY' ? 429 : 503).json({ error: error.message, code: error.code });
    else next(error);
  }
});
