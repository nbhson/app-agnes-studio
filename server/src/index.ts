import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createHmac, timingSafeEqual } from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const API_BASE_URL = process.env.API_BASE_URL || 'https://apihub.agnes-ai.com';
let API_KEY = process.env.AGNES_API_KEY || '';

// Optional shared-token protection: set PROXY_TOKEN to require clients to send
// `x-proxy-token: <PROXY_TOKEN>` (or `Authorization: Bearer <PROXY_TOKEN>`) on
// every call. Unset = auth disabled — chỉ chấp nhận được khi server thực sự
// chỉ nghe trên loopback; một số trường hợp như vậy vẫn log warning to.
const PROXY_TOKEN = (process.env.PROXY_TOKEN || '').trim();

// CORS: luôn allowlist — `origin: true` (reflect mọi origin) kết hợp route
// key-management nghĩa là MỌI trang web victim mở đều thao tác được proxy.
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
app.use(
  cors({
    origin: CLIENT_ORIGIN.split(',').map((s) => s.trim()),
    credentials: false,
  })
);
app.use(express.json());

/** So sánh token constant-time (HMAC wrapper cho khác độ dài). */
function tokensMatch(presented: string, expected: string): boolean {
  const mac = (s: string) => createHmac('sha256', 'proxy-token').update(s).digest();
  return timingSafeEqual(mac(presented), mac(expected));
}

// Shared-token gate for key management + proxy routes.
function requireProxyAuth(req: Request, res: Response, next: NextFunction) {
  if (!PROXY_TOKEN) return next(); // auth disabled in local dev (warned at startup)
  const presented =
    (req.headers['x-proxy-token'] as string | undefined) ||
    (req.headers['authorization'] as string | undefined)?.replace(/^Bearer\s+/i, '');
  if (!presented || !tokensMatch(presented, PROXY_TOKEN)) {
    return res.status(401).json({ error: 'Unauthorized: missing or invalid proxy token' });
  }
  next();
}

// LƯU Ý: middleware "X-Api-Key per-request override" cũ đã XÓA — nó ghi vào
// req.headers.authorization nhưng các route build header fetch riêng nên
// không bao giờ dùng (dead code), và ngược lại cho phép bất kỳ caller nào
// lặng lẽ hoán đổi upstream key.

app.put('/api/key', requireProxyAuth, (req, res) => {
  const { key } = req.body;
  if (!key || typeof key !== 'string' || key.length > 200) {
    return res.status(400).json({ error: 'Invalid key' });
  }
  API_KEY = key.trim();
  // Chỉ log độ dài — không log manh mối của key.
  console.log(`API key updated (length ${API_KEY.length})`);
  res.json({ status: 'ok' });
});

app.get('/api/key', requireProxyAuth, (_req, res) => {
  res.json({ hasKey: !!API_KEY && API_KEY !== 'your_api_key_here', maskedKey: API_KEY ? API_KEY.slice(0, 6) + '...' + API_KEY.slice(-4) : '' });
});

/** Forward raw upstream error text to logs, generic message to the client. */
function upstreamError(route: string, res: Response, err: unknown, streamStarted: boolean): void {
  console.error(`${route} proxy error:`, err instanceof Error ? err.message : err);
  if (streamStarted || res.headersSent) {
    // SSE đã bắt đầu: không thể đổi status — kết thúc stream để client biết dừng.
    res.end();
    return;
  }
  res.status(502).json({ error: 'Upstream request failed' });
}

const UPSTREAM_TIMEOUT_MS = 300_000; // 5 phút — hung upstream không giữ socket vô hạn

function buildUpstreamSignal(clientGone: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
  // Node >= 20 có AbortSignal.any: hủy khi client ngắt KHIỂN timeout hết.
  return AbortSignal.any([clientGone, timeout]);
}

/** Pump upstream SSE body vào res; hủy upstream khi client ngắt kết nối. */
function pumpStream(
  upstream: globalThis.Response,
  res: Response,
  clientGone: AbortSignal
): void {
  const reader = upstream.body?.getReader();
  if (!reader) {
    res.end();
    return;
  }
  const onClientClose = () => {
    reader.cancel().catch(() => {});
  };
  clientGone.addEventListener('abort', onClientClose, { once: true });
  const decoder = new TextDecoder();
  const pump = (): Promise<void> =>
    reader.read().then(({ done, value }) => {
      if (done) {
        clientGone.removeEventListener('abort', onClientClose);
        res.end();
        return;
      }
      res.write(decoder.decode(value, { stream: true }));
      return pump();
    }).catch((err) => {
      clientGone.removeEventListener('abort', onClientClose);
      // Lỗi giữa stream (client ngắt/hung upstream): kết thúc sạch.
      console.error('stream pump error:', err instanceof Error ? err.message : err);
      res.end();
    });
  void pump();
}

app.post('/v1/chat/completions', requireProxyAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const clientGone = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) clientGone.abort();
  });

  fetch(`${API_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(req.body),
    signal: buildUpstreamSignal(clientGone.signal),
  })
    .then((r) => {
      if (!r.ok) return r.text().then((t) => { throw new Error(t); });
      return r;
    })
    .then((r) => pumpStream(r, res, clientGone.signal))
    .catch((err) => upstreamError('chat', res, err, res.headersSent));
});

app.post('/v1/responses', requireProxyAuth, (req, res) => {
  const clientGone = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) clientGone.abort();
  });
  fetch(`${API_BASE_URL}/v1/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(req.body),
    signal: buildUpstreamSignal(clientGone.signal),
  })
    .then((r) => (r.ok ? r.json() : r.text().then((t) => { throw new Error(t); })))
    .then((data) => res.json(data))
    .catch((err) => upstreamError('responses', res, err, res.headersSent));
});

app.post('/v1/messages', requireProxyAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const clientGone = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) clientGone.abort();
  });

  fetch(`${API_BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(req.body),
    signal: buildUpstreamSignal(clientGone.signal),
  })
    .then((r) => {
      if (!r.ok) return r.text().then((t) => { throw new Error(t); });
      return r;
    })
    .then((r) => pumpStream(r, res, clientGone.signal))
    .catch((err) => upstreamError('messages', res, err, res.headersSent));
});

app.post('/v1/images/generations', requireProxyAuth, (req, res) => {
  fetch(`${API_BASE_URL}/v1/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(req.body),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })
    .then((r) => (r.ok ? r.json() : r.text().then((t) => { throw new Error(t); })))
    .then((data) => res.json(data))
    .catch((err) => upstreamError('image', res, err, res.headersSent));
});

app.post('/v1/videos', requireProxyAuth, (req, res) => {
  fetch(`${API_BASE_URL}/v1/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(req.body),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })
    .then((r) => (r.ok ? r.json() : r.text().then((t) => { throw new Error(t); })))
    .then((data) => res.json(data))
    .catch((err) => upstreamError('video', res, err, res.headersSent));
});

app.get('/agnesapi', requireProxyAuth, (req, res) => {
  // Encode + validate query params trước khi ghép URL: trước đây video_id/
  // model_name được nối thẳng vào URL (query injection: `&`, `#`, params lạ).
  const videoId = String(req.query.video_id ?? '');
  if (!/^[\w-]{1,128}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video_id' });
  }
  const modelName = String(req.query.model_name ?? '');
  if (modelName && !/^[\w.-]{1,128}$/.test(modelName)) {
    return res.status(400).json({ error: 'Invalid model_name' });
  }
  const url = `${API_BASE_URL}/agnesapi?video_id=${encodeURIComponent(videoId)}` +
    (modelName ? `&model_name=${encodeURIComponent(modelName)}` : '');

  fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}` },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  })
    .then((r) => (r.ok ? r.json() : r.text().then((t) => { throw new Error(t); })))
    .then((data) => res.json(data))
    .catch((err) => upstreamError('video result', res, err, res.headersSent));
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', hasApiKey: !!API_KEY && API_KEY !== 'your_api_key_here' });
});

// body-parser lỗi JSON → 400 (trước đây 500 chung chung); lỗi còn lại → 500.
app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
  if (err.type === 'entity.parse.failed' || err.status === 400) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Catch-all 404 cho mọi route lạ (trước đây rơi vào error handler thành 500).
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`Agnes proxy server running on http://localhost:${PORT}`);
  if (!PROXY_TOKEN) {
    console.warn(
      '[WARNING] PROXY_TOKEN is unset — key management and proxy routes are UNAUTHENTICATED. ' +
        'Only safe when bound to loopback with no other users. Set PROXY_TOKEN for anything shared.'
    );
  }
  if (!CLIENT_ORIGIN) {
    console.warn('[WARNING] CLIENT_ORIGIN unset — using http://localhost:5173');
  }
});
