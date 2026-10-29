import dotenv from 'dotenv';

import { createApp } from './app.js';
import { config } from './config.js';

dotenv.config();

const app = createApp({ apiKey: process.env.AGNES_API_KEY || '' });
const PORT = Number(config.port) || 3001;

const server = app.listen(PORT, () => {
  console.log(`Agnes proxy server running on http://localhost:${PORT}`);
  const trustProxy = app.get('trust proxy');
  if (trustProxy === false) {
    console.log('trust proxy: disabled (req.ip = socket address — set TRUST_PROXY when behind a reverse proxy)');
  } else {
    console.log(`trust proxy: ${JSON.stringify(trustProxy)} (rate-limit keys use X-Forwarded-For)`);
  }
  if (!process.env.PROXY_TOKEN?.trim()) {
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
