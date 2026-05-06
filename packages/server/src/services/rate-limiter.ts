/**
 * Sliding-window rate limiter for mutation (POST/PUT/PATCH/DELETE) requests.
 *
 * Protects token files from runaway UI loops or external scripting. Each unique
 * client IP keeps recent mutation timestamps for the configured rolling window.
 * Read-only methods (GET, HEAD, OPTIONS) are always exempt.
 *
 * Stale entries are pruned on each request, so memory stays bounded even if
 * many different IPs connect briefly.
 */

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface RateLimitOptions {
  /** Maximum mutation requests allowed within the time window (default: 200). */
  max: number;
  /** Length of the sliding window in milliseconds (default: 60 000). */
  windowMs: number;
}

export const DEFAULT_RATE_LIMIT_OPTIONS: RateLimitOptions = {
  max: 200,
  windowMs: 60_000,
};

export class RateLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly store = new Map<string, number[]>();

  constructor(options: Partial<RateLimitOptions> = {}) {
    this.max =
      typeof options.max === "number" &&
      Number.isFinite(options.max) &&
      options.max > 0
        ? Math.floor(options.max)
        : DEFAULT_RATE_LIMIT_OPTIONS.max;
    this.windowMs =
      typeof options.windowMs === "number" &&
      Number.isFinite(options.windowMs) &&
      options.windowMs > 0
        ? Math.floor(options.windowMs)
        : DEFAULT_RATE_LIMIT_OPTIONS.windowMs;
  }

  /**
   * Check whether the request should be allowed.
   *
   * Returns `null` when the request is allowed, or an object with `retryAfterSec`
   * when the caller should respond with HTTP 429.
   *
   * Only POST/PUT/PATCH/DELETE requests are counted; all other methods always pass.
   */
  check(method: string, ip: string): { retryAfterSec: number } | null {
    const normalizedMethod = method.toUpperCase();
    if (!MUTATION_METHODS.has(normalizedMethod)) return null;

    const now = Date.now();
    this.prune(now);

    const key = ip.trim() || "unknown";
    const cutoff = now - this.windowMs;
    const timestamps = (this.store.get(key) ?? []).filter(
      (timestamp) => timestamp > cutoff,
    );

    if (timestamps.length >= this.max) {
      this.store.set(key, timestamps);
      const retryAfterMs = timestamps[0] + this.windowMs - now;
      return { retryAfterSec: Math.ceil(retryAfterMs / 1000) };
    }

    timestamps.push(now);
    this.store.set(key, timestamps);
    return null;
  }

  /** Remove entries whose window has fully expired to keep memory bounded. */
  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    for (const [key, timestamps] of this.store) {
      const activeTimestamps = timestamps.filter(
        (timestamp) => timestamp > cutoff,
      );
      if (activeTimestamps.length === 0) {
        this.store.delete(key);
      } else if (activeTimestamps.length !== timestamps.length) {
        this.store.set(key, activeTimestamps);
      }
    }
  }
}
