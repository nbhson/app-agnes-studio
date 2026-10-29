/**
 * Persistence for image generation results (Round 4) — survives reloads.
 * localStorage, same defensive pattern as conversations.ts. Base64-only
 * results are stripped before saving: a data URL of a 1MP PNG is ~1–2MB of
 * base64 and would blow the ~5MB quota for a handful of images. They stay
 * usable in-memory for the current session; persisted history keeps URLs.
 */

import type { ImageResult } from '../components/ImageModule';

const STORAGE_KEY = 'agnes_image_results';
const MAX_RESULTS = 30;

export function loadImageResults(): ImageResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r === 'object' && (typeof r.url === 'string' || typeof r.b64 === 'string'))
      .map((r) => ({
        url: typeof r.url === 'string' ? r.url : '',
        b64: '', // never rehydrate base64 — quota risk with no reload benefit
        revisedPrompt: typeof r.revisedPrompt === 'string' ? r.revisedPrompt : '',
        timestamp: Number(r.timestamp) || 0,
        resolution: typeof r.resolution === 'string' ? r.resolution : '',
      }))
      .filter((r) => r.url); // a b64-only entry is useless after reload
  } catch {
    return [];
  }
}

/** Persist URL-only results; drop b64-only entries (session-only value). */
export function saveImageResults(results: ImageResult[]): void {
  const persistable = results.filter((r) => r.url).slice(-MAX_RESULTS);
  if (persistable.length === 0) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* best-effort */
    }
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  } catch {
    // Quota exceeded (URLs can still be long) — keep the newest half and retry.
    try {
      const trimmed = results.filter((r) => r.url).slice(-Math.ceil(MAX_RESULTS / 2));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      /* give up silently — persistence is best-effort */
    }
  }
}
