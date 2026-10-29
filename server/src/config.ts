/**
 * Central env config — read once at boot so routes never scatter process.env
 * access and defaults/warnings live in one place.
 */

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  port: process.env.PORT || 3001,
  apiBaseUrl: (process.env.API_BASE_URL || 'https://apihub.agnes-ai.com').replace(/\/+$/, ''),
  /** Comma-separated CORS allowlist. */
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  /** Optional shared-token auth for key management + proxy routes. */
  proxyToken: (process.env.PROXY_TOKEN || '').trim(),
  /** Large enough for long chat history + base64 image payloads. */
  jsonBodyLimit: process.env.BODY_LIMIT || '2mb',
  /** Upstream call timeout (ms) — hung upstream must not hold sockets forever. */
  upstreamTimeoutMs: 300_000,
  /** Proxy rate limit: requests per IP per window. */
  rateLimitMax: 120,
  rateLimitWindowMs: 60_000,
} as const;
