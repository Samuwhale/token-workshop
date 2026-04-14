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
/**
 * Detect network errors from `fetch()` cross-browser.
 * Chrome: 'Failed to fetch', Firefox: 'NetworkError…', Safari: 'Load failed'.
 * Intentionally narrow — only matches TypeErrors from the fetch infrastructure,
 * NOT all TypeErrors (property access on null etc. must not be misclassified).
 */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message;
    return (
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('Load failed') ||
      msg.includes('fetch failed')
    );
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

/**
 * Standard pagination envelope returned by all list endpoints.
 * `total` may be -1 when the server cannot cheaply compute it (e.g. git log).
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}

function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const normalized = contentType.toLowerCase();
  return normalized.includes('application/json') || normalized.includes('+json');
}

async function readResponseBody(res: Response): Promise<unknown> {
  const raw = await res.text();
  if (raw.trim() === '') return undefined;
  if (!isJsonContentType(res.headers.get('content-type'))) return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    if (!res.ok) return raw;
    const detail = error instanceof Error ? error.message : String(error);
    throw new ApiError(`Invalid JSON response from server: ${detail}`, res.status);
  }
}

function getErrorMessageFromBody(body: unknown, status: number): string {
  if (
    body !== null &&
    typeof body === 'object' &&
    'error' in body &&
    typeof (body as { error?: unknown }).error === 'string'
  ) {
    return (body as { error: string }).error;
  }
  if (typeof body === 'string' && body.trim() !== '') {
    return body;
  }
  return `Request failed (${status})`;
}

/**
 * Fetch a paginated list endpoint and return the standard envelope.
 * Builds the URL with `limit` and `offset` appended (or overriding existing ones).
 */
export async function fetchPage<T>(
  baseUrl: string,
  limit: number,
  offset: number,
  options?: RequestInit,
): Promise<PaginatedResponse<T>> {
  const url = new URL(baseUrl, 'http://localhost');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  // Re-build as a relative URL with the same path+query (strip the fake origin)
  const fullUrl = baseUrl.includes('://') ? url.toString() : url.pathname + url.search;
  return apiFetch<PaginatedResponse<T>>(fullUrl, options);
}

export async function apiFetch<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const body = await readResponseBody(res);
  if (!res.ok) {
    throw new ApiError(getErrorMessageFromBody(body, res.status), res.status);
  }
  return body as T;
}
