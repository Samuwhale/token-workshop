/**
 * Shared API fetch utility.
 *
 * Wraps `fetch` with standard error handling: checks `res.ok`, extracts
 * `{ error }` from the response body on failure, and throws an `ApiError`
 * with the server's message (or a fallback).  Callers only need to handle
 * the `ApiError` in a single `catch` block — no per-call `res.ok` checks.
 */

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Fetch `url` with `options`, parse JSON response, and return it as `T`.
 * Throws `ApiError` (with the server's `error` field if available) on non-2xx.
 */
/** Detect network errors cross-browser (Chrome: 'Failed to fetch', Firefox: 'NetworkError…'). */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof Error) {
    const msg = err.message;
    return msg.includes('Failed to fetch') || msg.includes('NetworkError');
  }
  return false;
}

/**
 * Create an AbortSignal that fires after `timeoutMs` ms (default 5 s) OR when `disconnectSignal`
 * fires — whichever comes first.  Pass this to every background data-fetch so that hung
 * requests don't accumulate indefinitely.
 *
 * For hooks that need to combine more than one extra signal (e.g. disconnect + unmount),
 * pre-combine them with `AbortSignal.any([s1, s2])` before passing here.
 *
 * @example
 *   const signal = createFetchSignal(controller.signal);
 *   await apiFetch(url, { signal });
 */
export function createFetchSignal(disconnectSignal?: AbortSignal, timeoutMs = 5000): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return disconnectSignal ? AbortSignal.any([timeout, disconnectSignal]) : timeout;
}

export async function apiFetch<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}
