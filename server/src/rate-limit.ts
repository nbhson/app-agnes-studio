/**
 * Minimal in-memory fixed-window rate limiter, per client key (IP).
 *
 * Enough to protect the upstream API key budget when the proxy is exposed
 * beyond loopback; not a distributed limiter (single process by design).
 */

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets — surfaced as Retry-After. */
  retryAfterSec: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
  /** Number of tracked keys (for tests / health reporting). */
  size(): number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_TRACKED_KEYS = 10_000; // cap memory against spoofed-IP floods

export function createRateLimiter(opts: {
  windowMs: number;
  max: number;
}): RateLimiter {
  const buckets = new Map<string, Bucket>();

  function evictExpired(now: number): void {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    // Still at cap (all fresh): drop oldest-inserted (Map keeps insertion order).
    while (buckets.size >= MAX_TRACKED_KEYS) {
      const oldest = buckets.keys().next().value;
      if (oldest === undefined) break;
      buckets.delete(oldest);
    }
  }

  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      const bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        if (buckets.size >= MAX_TRACKED_KEYS) evictExpired(now);
        buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
        return { ok: true, retryAfterSec: 0 };
      }
      bucket.count += 1;
      if (bucket.count > opts.max) {
        const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
        return { ok: false, retryAfterSec };
      }
      return { ok: true, retryAfterSec: 0 };
    },
    size() {
      return buckets.size;
    },
  };
}
