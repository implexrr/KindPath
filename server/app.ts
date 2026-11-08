import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { analyzeRouter } from './routes/analyze.js';
import { fixtureRouter } from './routes/scanFixture.js';
import { localRequests } from './middleware/localRequests.js';
import { publicRouter } from './routes/scanPublic.js';

export const app = express();
app.disable('x-powered-by');
app.use('/api', localRequests);
app.use(express.json({ limit: '4kb' }));
app.get('/api/health', (_req, res) => { res.json({ status: 'ok', mode: 'demo' }); });

// Preserve the existing API response instead of the router's automatic OPTIONS reply.
app.options('/api/analyze', (_req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});
app.use('/api', analyzeRouter);
app.use('/api', fixtureRouter);
app.use('/api', publicRouter);
app.use('/api', (_req, res) => { res.status(404).json({ error: 'API route not found.' }); });
const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500;
  res.status(status).json({ error: status === 413 ? 'Request body is too large.' : status === 400 ? 'Send a valid JSON request.' : 'Something went wrong. Try again.' });
};
app.use(handleError);
