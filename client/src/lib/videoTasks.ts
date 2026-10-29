/**
 * Persistence for video generation tasks (Round 4) — survives reloads.
 * localStorage, same defensive pattern as conversations.ts. Tasks are small
 * (prompt + status + URL), so the main quota risk is a long prompt backlog;
 * on quota pressure we keep the newest half.
 */

import type { VideoItem } from '../components/VideoModule';

const STORAGE_KEY = 'agnes_video_tasks';
const MAX_TASKS = 40;

const VALID_STATUS = new Set(['queued', 'in_progress', 'completed', 'failed']);

export function loadVideoTasks(): VideoItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t) => t && typeof t.task_id === 'string' && typeof t.video_id === 'string')
      .map((t) => ({
        video_id: typeof t.video_id === 'string' ? t.video_id : t.task_id,
        task_id: t.task_id,
        status: VALID_STATUS.has(t.status) ? t.status : 'failed',
        progress: Number(t.progress) || 0,
        prompt: typeof t.prompt === 'string' ? t.prompt : '',
        size: typeof t.size === 'string' ? t.size : '',
        seconds: typeof t.seconds === 'string' ? t.seconds : '0',
        created_at: Number(t.created_at) || 0,
        completed_at: Number(t.completed_at) || undefined,
        video_url: typeof t.video_url === 'string' ? t.video_url : undefined,
        error: typeof t.error === 'string' ? t.error : undefined,
      }))
      .slice(-MAX_TASKS);
  } catch {
    return [];
  }
}

export function saveVideoTasks(tasks: Iterable<VideoItem>): void {
  // Newest last, capped; completed videos keep their URL for replay.
  const persistable = Array.from(tasks).slice(-MAX_TASKS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  } catch {
    // Quota exceeded (long prompt backlog) — keep the newest half and retry.
    try {
      const trimmed = Array.from(tasks).slice(-Math.ceil(MAX_TASKS / 2));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      /* give up silently — persistence is best-effort */
    }
  }
}
