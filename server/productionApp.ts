import { createHash, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import express from 'express';
import type { RequestHandler } from 'express';
import { createApp } from './app.js';

export function productionConfig(env: NodeJS.ProcessEnv) {
  const origin = URL.parse(env.KINDPATH_STAGE_ORIGIN ?? '');
  if (!origin || origin.protocol !== 'https:' || origin.origin !== env.KINDPATH_STAGE_ORIGIN) {
    throw new Error('KINDPATH_STAGE_ORIGIN must be a canonical HTTPS origin.');
  }

  const passwordHash = env.KINDPATH_STAGE_PASSWORD_SHA256 ?? '';
  if (!/^[a-f0-9]{64}$/.test(passwordHash)) {
    throw new Error('KINDPATH_STAGE_PASSWORD_SHA256 must contain 64 lowercase hexadecimal characters.');
  }

  for (const name of ['KINDPATH_PUBLIC_SCANNING', 'KINDPATH_PUBLIC_CAPTURE']) {
    if (env[name] !== 'true' && env[name] !== 'false') {
      throw new Error(`${name} must be explicitly set to true or false for staging.`);
    }
  }
  return { origin, passwordHash: Buffer.from(passwordHash, 'hex') };
}

function stageRequests({ origin, passwordHash }: ReturnType<typeof productionConfig>): RequestHandler {
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Cross-Origin-Resource-Policy', 'same-origin');

    const requestOrigin = req.get('Origin');
    if (req.get('Host') !== origin.host ||
      (requestOrigin !== undefined && requestOrigin !== origin.origin) ||
      (req.method === 'POST' && requestOrigin !== origin.origin)) {
      res.status(403).json({ error: 'Request must come from the configured staging origin.' });
      return;
    }

    const credentials = /^Basic ([A-Za-z0-9+/]{98}==)$/i.exec(req.get('Authorization') ?? '');
    const login = credentials && /^kindpath:([a-f0-9]{64})$/.exec(Buffer.from(credentials[1], 'base64').toString('latin1'));
    if (!login || !timingSafeEqual(createHash('sha256').update(login[1]).digest(), passwordHash)) {
      res.set('WWW-Authenticate', 'Basic realm="KindPath staging", charset="UTF-8"');
      res.status(401).json({ error: 'Staging credentials are required.' });
      return;
    }

    next();
  };
}

function stagePostLimit(now: () => number): RequestHandler {
  const requests: number[] = [];
  const windowMs = 60_000;
  return (req, res, next) => {
    if (req.method === 'POST') {
      const time = now();
      while (requests.length && requests[0] <= time - windowMs) requests.shift();
      if (requests.length >= 6) {
        res.set('Retry-After', String(Math.ceil((requests[0] + windowMs - time) / 1000)));
        res.status(429).json({ error: 'Too many requests. Try again shortly.', code: 'SCAN_RATE_LIMITED' });
        return;
      }
      requests.push(time);
    }
    next();
  };
}

export function createProductionApp(
  config: ReturnType<typeof productionConfig>, staticRoot: string, now = () => performance.now(),
) {
  const app = express();
  app.disable('x-powered-by');
  app.set('env', 'production');
  app.use(stageRequests(config));
  app.use(createApp(stagePostLimit(now)));
  app.get('/', (_req, res) => { res.sendFile(join(staticRoot, 'index.html')); });
  app.use('/assets', express.static(join(staticRoot, 'assets'), {
    index: false, redirect: false, cacheControl: false,
  }));
  return app;
}
