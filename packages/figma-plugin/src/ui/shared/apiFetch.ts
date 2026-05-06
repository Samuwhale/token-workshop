/**
 * Shared API fetch utility.
 *
 * Wraps `fetch` with standard error handling: checks `res.ok`, extracts a
 * server-provided error message from the response body, and throws an `ApiError`.
 * Callers only need to handle
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
 * Detect network errors from `fetch()` cross-browser.
 * Chrome: 'Failed to fetch', Firefox: 'NetworkError…', Safari: 'Load failed'.
 * Intentionally narrow — only matches TypeErrors from the fetch infrastructure,
 * NOT all TypeErrors (property access on null etc. must not be misclassified).
 */
export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof TypeError)) {
    return false;
  }
  const msg = err.message;
  return (
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('Load failed') ||
    msg.includes('fetch failed')
  );
}

function getAbortReason(signal: AbortSignal): unknown {
  return 'reason' in signal
    ? (signal as AbortSignal & { reason?: unknown }).reason
    : undefined;
}

function createAbortException(name: 'AbortError' | 'TimeoutError', message: string): Error {
  if (typeof DOMException === 'function') {
    return new DOMException(message, name);
  }
  const error = new Error(message);
  error.name = name;
  return error;
}

export function createTimeoutSignal(timeoutMs = 5000): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => {
    controller.abort(
      createAbortException(
        'TimeoutError',
        `Timed out after ${timeoutMs} ms.`,
      ),
    );
  }, timeoutMs);

  controller.signal.addEventListener(
    'abort',
    () => {
      globalThis.clearTimeout(timer);
    },
    { once: true },
  );

  return controller.signal;
}

export function combineAbortSignals(
  signals: ReadonlyArray<AbortSignal | null | undefined>,
): AbortSignal | undefined {
  const activeSignals = signals.filter(
    (signal): signal is AbortSignal => signal != null,
  );
  if (activeSignals.length === 0) {
    return undefined;
  }
  if (activeSignals.length === 1) {
    return activeSignals[0];
  }

  const alreadyAborted = activeSignals.find((signal) => signal.aborted);
  if (alreadyAborted) {
    return alreadyAborted;
  }

  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(activeSignals);
  }

  const controller = new AbortController();
  const removers: Array<() => void> = [];

  const cleanup = () => {
    for (const remove of removers.splice(0, removers.length)) {
      remove();
    }
  };

  const abortFrom = (signal: AbortSignal) => {
    cleanup();
    controller.abort(
      getAbortReason(signal) ??
        createAbortException('AbortError', 'This operation was aborted.'),
    );
  };

  for (const signal of activeSignals) {
    const onAbort = () => abortFrom(signal);
    signal.addEventListener('abort', onAbort, { once: true });
    removers.push(() => signal.removeEventListener('abort', onAbort));
  }

  controller.signal.addEventListener('abort', cleanup, { once: true });
  return controller.signal;
}

/**
 * Create an AbortSignal that fires after `timeoutMs` ms (default 5 s) OR when `disconnectSignal`
 * fires — whichever comes first.  Pass this to every background data-fetch so that hung
 * requests don't accumulate indefinitely.
 *
 * For hooks that need to combine more than one extra signal (e.g. disconnect + unmount),
 * pre-combine them with `combineAbortSignals([s1, s2])` before passing here.
 *
 * @example
 *   const signal = createFetchSignal(controller.signal);
 *   await apiFetch(url, { signal });
 */
export function createFetchSignal(disconnectSignal?: AbortSignal, timeoutMs = 5000): AbortSignal {
  if (!disconnectSignal) {
    return createTimeoutSignal(timeoutMs);
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => {
    controller.abort(
      createAbortException(
        'TimeoutError',
        `Timed out after ${timeoutMs} ms.`,
      ),
    );
  }, timeoutMs);

  const cleanup = () => {
    globalThis.clearTimeout(timeout);
    disconnectSignal.removeEventListener('abort', abortFromDisconnect);
  };

  const abortFromDisconnect = () => {
    controller.abort(
      getAbortReason(disconnectSignal) ??
        createAbortException('AbortError', 'This operation was aborted.'),
    );
  };

  controller.signal.addEventListener('abort', cleanup, { once: true });

  if (disconnectSignal.aborted) {
    abortFromDisconnect();
    return controller.signal;
  }

  disconnectSignal.addEventListener('abort', abortFromDisconnect, {
    once: true,
  });

  return controller.signal;
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
  if (body !== null && typeof body === 'object') {
    const fields = body as { error?: unknown; message?: unknown };
    if (typeof fields.message === 'string' && fields.message.trim() !== '') {
      return fields.message;
    }
    if (typeof fields.error === 'string' && fields.error.trim() !== '') {
      return fields.error;
    }
  }
  if (typeof body === 'string' && body.trim() !== '') {
    return body;
  }
  return `Request failed (${status})`;
}

/**
 * Fetch `url` with `options`, parse JSON response, and return it as `T`.
 * Throws `ApiError` with the server's message on non-2xx responses.
 */
export async function apiFetch<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const body = await readResponseBody(res);
  if (!res.ok) {
    throw new ApiError(getErrorMessageFromBody(body, res.status), res.status);
  }
  return body as T;
}
