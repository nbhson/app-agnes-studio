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

/** Settings accepted by express's `app.set('trust proxy', ...)`. */
export type TrustProxySetting = boolean | number | string | string[];

/** Pure parser for TRUST_PROXY (exported for tests). Unset/empty → false. */
export function parseTrustProxy(raw: string | undefined): TrustProxySetting {
  const value = (raw ?? '').trim();
  if (!value) return false;
  if (/^(true|yes)$/i.test(value)) return true;
  if (/^(false|no|0)$/i.test(value)) return false;
  // Express subnet shorthands pass through verbatim.
  if (/^(loopback|linklocal|uniquelocal)$/i.test(value)) return value.toLowerCase();
  // Hop count, e.g. TRUST_PROXY=1 (single reverse-proxy hop).
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    return hops > 0 ? hops : false;
  }
  // CIDR / IP list (single entry collapses to a plain string).
  const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length === 1 ? parts[0] : parts;
}

export const config = {
  port: process.env.PORT || 3001,
  apiBaseUrl: (process.env.API_BASE_URL || 'https://apihub.agnes-ai.com').replace(/\/+$/, ''),
  /**
   * Express `trust proxy` setting (Round 4). Only set TRUST_PROXY when the
   * proxy actually runs behind a reverse proxy (nginx/caddy/heroku...);
   * default stays `false` so req.ip is the socket address — safe for direct
   * exposure, immune to X-Forwarded-For spoofing.
   *
   *   TRUST_PROXY=1                  hop count
   *   TRUST_PROXY=10.0.0.1,10.0.0.2  CIDR/IP list
   *   TRUST_PROXY=loopback           express subnet shorthand
   *   TRUST_PROXY=true               trust everything (only for trusted networks)
   */
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
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
