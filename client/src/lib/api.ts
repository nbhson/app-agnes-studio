import { API_BASE_URL, apiHeaders } from '../config';

/**
 * Shared fetch helpers — previously every module hand-rolled its own
 * error handling with three different shapes (R2-6).
 */

/** Build a descriptive Error from a failed HTTP response, reading the body. */
export async function apiErrorFrom(resp: Response): Promise<Error> {
  const raw = await resp.text().catch(() => '');
  let detail = '';
  try {
    const parsed = JSON.parse(raw);
    detail = parsed?.error?.message || parsed?.error || parsed?.message || '';
  } catch {
    detail = raw;
  }
  detail = String(detail).slice(0, 300);
  const hint = resp.status === 401 ? ' — check your API key in Settings' : '';
  return new Error(
    `Request failed (${resp.status}): ${resp.statusText}${hint}${detail ? `: ${detail}` : ''}`
  );
}

async function request<T>(method: 'POST' | 'GET', path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const resp = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: apiHeaders(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    signal,
  });
  if (!resp.ok) throw await apiErrorFrom(resp);
  return (await resp.json()) as T;
}

export function postJson<T = unknown>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>('POST', path, body, signal);
}

export function getJson<T = unknown>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>('GET', path, undefined, signal);
}

/** Parse a newline-separated textarea of URLs into a clean array. */
export function parseUrlList(raw: string): string[] {
  return raw.split('\n').map((u) => u.trim()).filter(Boolean);
}
