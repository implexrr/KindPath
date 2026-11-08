import { Router } from 'express';
import { createDemoReport } from '../services/analyze.js';
import { validateWebsiteUrl } from '../validation/websiteUrl.js';

export const analyzeRouter = Router();
analyzeRouter.post('/analyze', (req, res) => {
  const result = validateWebsiteUrl(req.body?.url);
  if (result.error !== undefined) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(createDemoReport(result.url));
});
