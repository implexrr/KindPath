import type { RequestHandler } from 'express';

// Local development API only. Loopback binding alone does not stop DNS rebinding.
export const localRequests: RequestHandler = (req, res, next) => {
  const host = req.headers.host;
  const origins = ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://[::1]:5173'];
  if (!host || !/^(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/i.test(host)
    || (req.headers.origin && !origins.includes(req.headers.origin))) {
    res.status(403).json({ error: 'Only the local KindPath interface may access this API.' });
    return;
  }
  next();
};
