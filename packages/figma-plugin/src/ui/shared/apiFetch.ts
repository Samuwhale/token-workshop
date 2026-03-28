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

export async function apiFetch<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}
