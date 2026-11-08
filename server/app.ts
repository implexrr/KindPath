import express from 'express';
import type { ErrorRequestHandler } from 'express';
import type { Report } from '../shared/types.js';

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4kb' }));
app.get('/api/health', (_req, res) => { res.json({ status: 'ok', mode: 'demo' }); });

// This boundary validates input. It deliberately never fetches the submitted URL.
app.post('/api/analyze', (req, res) => {
  const value: unknown = req.body?.url;
  if (typeof value !== 'string' || value.length > 2048) {
    res.status(400).json({ error: 'Enter a website URL, up to 2,048 characters.' });
    return;
  }
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { res.status(400).json({ error: 'Enter a complete URL, such as https://example.com.' }); return; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    res.status(400).json({ error: 'Use an HTTP or HTTPS URL without embedded credentials.' });
    return;
  }
  const report: Report = {
    mode: 'demo', url: url.href, generatedAt: new Date().toISOString(),
    manualChecks: ['Navigate the page using only a keyboard.', 'Check reading order and names with a screen reader.', 'Check zoom, reflow, and content clarity.'],
    findings: [
      { id: 'label', severity: 'Serious', title: 'Give every form field a clear label', location: 'Example newsletter · email input', impact: 'A screen reader user may not know what information to enter.', fix: 'Add a visible <label> and connect its htmlFor to the input id.' },
      { id: 'contrast', severity: 'Serious', title: 'Make supporting text easier to read', location: 'Example product card · description', impact: 'Low contrast can make text difficult to distinguish from its background.', fix: 'Check the actual foreground and background colours. Aim for at least 4.5:1 for normal text.' },
      { id: 'link', severity: 'Moderate', title: 'Describe where your links lead', location: 'Example article · “Read more” link', impact: 'A link read out of context may not communicate its destination.', fix: 'Use descriptive link text, such as “Read our guide to growing herbs”.' },
    ],
  };
  res.json(report);
});
app.use('/api', (_req, res) => { res.status(404).json({ error: 'API route not found.' }); });
const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500;
  res.status(status).json({ error: status === 413 ? 'Request body is too large.' : status === 400 ? 'Send a valid JSON request.' : 'Something went wrong. Try again.' });
};
app.use(handleError);
