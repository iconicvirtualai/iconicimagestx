export interface RateLimitOptions {
  windowMs: number;
  max: number;
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

/**
 * In-memory sliding window. One process only — enough to stop a public
 * endpoint from hammering email and SMS. Resets when the server restarts.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const hits = new Map<string, number[]>();

  return {
    check(key: string): RateLimitResult {
      const now = options.now ? options.now() : Date.now();
      const windowStart = now - options.windowMs;
      const recent = (hits.get(key) ?? []).filter((stamp) => stamp > windowStart);

      if (recent.length >= options.max) {
        const retryAfterSec = Math.max(1, Math.ceil((recent[0] + options.windowMs - now) / 1000));
        hits.set(key, recent);
        return { allowed: false, retryAfterSec };
      }

      recent.push(now);
      hits.set(key, recent);

      if (hits.size > 5000) {
        const oldest = hits.keys().next().value;
        if (oldest) hits.delete(oldest);
      }

      return { allowed: true, retryAfterSec: 0 };
    },

    reset() {
      hits.clear();
    },
  };
}
