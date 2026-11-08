import { Router } from 'express';
import { isFixture } from '../scanner/containerPolicy.js';
import { ScannerError } from '../scanner/dockerWorker.js';
import { scanFixture } from '../scanner/fixtureScanner.js';

export const fixtureRouter = Router();
fixtureRouter.post('/scan-fixture', async (req, res, next) => {
  // Accept a fixed identifier only. Never pass a URL, path, HTML, or browser arguments to the worker.
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 1 || !isFixture(body.fixture)) {
    res.status(400).json({ error: 'Choose a built-in fixture: barriers or clear.' });
    return;
  }
  const abort = new AbortController();
  res.once('close', () => { if (!res.writableEnded) abort.abort(); });
  try {
    res.json(await scanFixture(body.fixture, abort.signal));
  } catch (error) {
    if (res.destroyed) return;
    if (error instanceof ScannerError) {
      res.status(error.code === 'SCANNER_BUSY' ? 429 : 503).json({ error: error.message, code: error.code });
    } else { next(error); }
  }
});
