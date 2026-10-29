import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { config } from './config.js';
import { tokensMatch } from './secure-compare.js';
import { createRateLimiter } from './rate-limit.js';
import { forwardJson, forwardSse } from './proxy.js';

dotenv.config();

const app = express();
app.disable('x-powered-by');

let API_KEY = process.env.AGNES_API_KEY || '';

// --- Security headers + CORS allowlist -------------------------------------
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// CORS luôn allowlist — reflect-every-origin kết hợp route key-management
// nghĩa là mọi trang web victim mở đều thao tác được proxy (Round-1 fix #1).
app.use(
  cors({
    origin: config.clientOrigins,
    credentials: false,
  })
);

app.use(express.json({ limit: config.jsonBodyLimit }));

// --- Rate limiting ----------------------------------------------------------
// Bảo vệ ngân sách API key upstream khi proxy mở ra ngoài loopback.
function createRateLimiterFor(max: number, windowMs: number) {
  const limiter = createRateLimiter({ windowMs, max });
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || 'unknown';
    const result = limiter.check(ip);
    if (!result.ok) {
      res.set('Retry-After', String(result.retryAfterSec));
      res.status(429).json({ error: 'Too many requests — slow down' });
      return;
    }
    next();
  };
}

const proxyLimiter = createRateLimiterFor(config.rateLimitMax, config.rateLimitWindowMs);
const keyMgmtLimiter = createRateLimiterFor(10, 60_000); // key endpoints: chặt hơn

// --- Request logging (concise, skips health) --------------------------------
app.use((req, res, next) => {
  if (req.path === '/api/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl.split('?')[0]} → ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

// --- Shared-token auth -------------------------------------------------------
function requireProxyAuth(req: Request, res: express.Response, next: express.NextFunction) {
  if (!config.proxyToken) return next(); // auth disabled in local dev (warned at startup)
  const presented =
    (req.headers['x-proxy-token'] as string | undefined) ||
    (req.headers['authorization'] as string | undefined)?.replace(/^Bearer\s+/i, '');
  if (!presented || !tokensMatch(presented, config.proxyToken)) {
    return res.status(401).json({ error: 'Unauthorized: missing or invalid proxy token' });
  }
  next();
}

// --- Key management ----------------------------------------------------------
app.put('/api/key', keyMgmtLimiter, requireProxyAuth, (req, res) => {
  const { key } = req.body;
  if (!key || typeof key !== 'string' || key.length > 200) {
    return res.status(400).json({ error: 'Invalid key' });
  }
  API_KEY = key.trim();
  // Chỉ log độ dài — không log manh mối của key (Round-1 fix #11).
  console.log(`API key updated (length ${API_KEY.length})`);
  res.json({ status: 'ok' });
});

app.get('/api/key', keyMgmtLimiter, (_req, res) => {
  res.json({
    hasKey: !!API_KEY && API_KEY !== 'your_api_key_here',
    maskedKey: API_KEY ? API_KEY.slice(0, 6) + '...' + API_KEY.slice(-4) : '',
  });
});

// --- Proxy routes -------------------------------------------------------------
const bearerHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${API_KEY}`,
});

function postBody(req: Request): string {
  return JSON.stringify(req.body);
}

app.post('/v1/chat/completions', proxyLimiter, requireProxyAuth, (req, res) => {
  void forwardSse('chat', req, res, `${config.apiBaseUrl}/v1/chat/completions`, bearerHeaders(), postBody(req));
});

app.post('/v1/responses', proxyLimiter, requireProxyAuth, (req, res) => {
  void forwardJson('responses', res, `${config.apiBaseUrl}/v1/responses`, {
    method: 'POST',
    headers: bearerHeaders(),
    body: postBody(req),
  });
});

app.post('/v1/messages', proxyLimiter, requireProxyAuth, (req, res) => {
  void forwardSse('messages', req, res, `${config.apiBaseUrl}/v1/messages`, {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
    'anthropic-version': '2023-06-01',
  }, postBody(req));
});

app.post('/v1/images/generations', proxyLimiter, requireProxyAuth, (req, res) => {
  void forwardJson('image', res, `${config.apiBaseUrl}/v1/images/generations`, {
    method: 'POST',
    headers: bearerHeaders(),
    body: postBody(req),
  });
});

app.post('/v1/videos', proxyLimiter, requireProxyAuth, (req, res) => {
  void forwardJson('video', res, `${config.apiBaseUrl}/v1/videos`, {
    method: 'POST',
    headers: bearerHeaders(),
    body: postBody(req),
  });
});

app.get('/agnesapi', proxyLimiter, requireProxyAuth, (req, res) => {
  // Encode + validate query params trước khi ghép URL (Round-1 fix #2).
  const videoId = String(req.query.video_id ?? '');
  if (!/^[\w-]{1,128}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video_id' });
  }
  const modelName = String(req.query.model_name ?? '');
  if (modelName && !/^[\w.-]{1,128}$/.test(modelName)) {
    return res.status(400).json({ error: 'Invalid model_name' });
  }
  const url = `${config.apiBaseUrl}/agnesapi?video_id=${encodeURIComponent(videoId)}` +
    (modelName ? `&model_name=${encodeURIComponent(modelName)}` : '');

  void forwardJson('video result', res, url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
});

// --- Health + error handling --------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!API_KEY && API_KEY !== 'your_api_key_here',
    uptimeSec: Math.round(process.uptime()),
    auth: config.proxyToken ? 'token' : 'disabled',
  });
});

// body-parser lỗi JSON → 400 (Round-1 fix #14); lỗi còn lại → 500.
app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: express.NextFunction) => {
  if (err.type === 'entity.parse.failed' || err.status === 400) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Catch-all 404 cho mọi route lạ.
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

const server = app.listen(config.port, () => {
  console.log(`Agnes proxy server running on http://localhost:${config.port}`);
  if (!config.proxyToken) {
    console.warn(
      '[WARNING] PROXY_TOKEN is unset — key management and proxy routes are UNAUTHENTICATED. ' +
        'Only safe when bound to loopback with no other users. Set PROXY_TOKEN for anything shared.'
    );
  }
  if (process.env.CLIENT_ORIGIN === undefined) {
    console.warn('[WARNING] CLIENT_ORIGIN unset — CORS allowlist defaults to http://localhost:5173');
  }
});

// Graceful shutdown — deploy/restart không cắt giữa chừng các stream đang chạy.
function shutdown(signal: string): void {
  console.log(`Received ${signal} — closing server...`);
  server.close(() => process.exit(0));
  // Streams có thể kéo dài: ép thoát sau 10s.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
