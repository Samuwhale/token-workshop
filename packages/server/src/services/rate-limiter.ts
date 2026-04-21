/**
 * Simple sliding-window rate limiter for mutation (POST/PUT/PATCH/DELETE) requests.
 *
 * Protects token files from runaway UI loops or external scripting. Each unique
 * client IP gets its own counter that resets every `windowMs` milliseconds.
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

interface Entry {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly store = new Map<string, Entry>();

  constructor(options: Partial<RateLimitOptions> = {}) {
    this.max =
      typeof options.max === "number" &&
      Number.isFinite(options.max) &&
      options.max > 0
        ? Math.floor(options.max)
        : 200;
    this.windowMs =
      typeof options.windowMs === "number" &&
      Number.isFinite(options.windowMs) &&
      options.windowMs > 0
        ? Math.floor(options.windowMs)
        : 60_000;
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

    const key = ip || "unknown";
    const entry = this.store.get(key);

    if (!entry || now - entry.windowStart >= this.windowMs) {
      // First request in a new window
      this.store.set(key, { count: 1, windowStart: now });
      return null;
    }

    if (entry.count >= this.max) {
      const retryAfterMs = this.windowMs - (now - entry.windowStart);
      return { retryAfterSec: Math.ceil(retryAfterMs / 1000) };
    }

    entry.count += 1;
    return null;
  }

  /** Remove entries whose window has fully expired to keep memory bounded. */
  private prune(now: number): void {
    for (const [key, entry] of this.store) {
      if (now - entry.windowStart >= this.windowMs) {
        this.store.delete(key);
      }
    }
  }
}
