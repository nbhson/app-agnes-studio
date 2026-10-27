/**
 * Central client configuration — single source of truth for the proxy API URL.
 * Override via Vite env: VITE_API_BASE_URL (e.g. in .env or deployment config).
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ||
  'http://localhost:3001';

/**
 * Shared proxy token (must match server PROXY_TOKEN when the server enables
 * auth). Sent as `x-proxy-token` header on every request.
 */
export const PROXY_TOKEN: string = (import.meta.env.VITE_PROXY_TOKEN as string | undefined) || '';

export function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (PROXY_TOKEN) headers['x-proxy-token'] = PROXY_TOKEN;
  return headers;
}
