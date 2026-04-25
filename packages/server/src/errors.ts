/**
 * Typed HTTP error classes.
 *
 * Services throw these instead of plain `new Error(...)` so route handlers
 * can map them to HTTP status codes without fragile string matching.
 */

class HttpError extends Error {
  readonly statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

/** 400 Bad Request — invalid input, validation failure */
export class BadRequestError extends HttpError {
  constructor(message: string) {
    super(400, message);
    this.name = 'BadRequestError';
  }
}

/** 404 Not Found — resource does not exist */
export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

/** 409 Conflict — resource already exists, circular reference, etc. */
export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
    this.name = 'ConflictError';
  }
}

/** 408 Request Timeout — a git network operation (fetch/pull/push) exceeded the configured timeout */
export class GitTimeoutError extends HttpError {
  constructor(operation: string, timeoutMs: number) {
    super(408, `Git ${operation} timed out after ${timeoutMs / 1000}s. Check your network connection or remote URL.`);
    this.name = 'GitTimeoutError';
  }
}

/**
 * If `err` is an HttpError, return its statusCode. Otherwise return undefined.
 */
interface StatusCodeCarrier {
  statusCode: number;
}

function hasStatusCode(err: unknown): err is StatusCodeCarrier {
  return (
    !!err &&
    typeof err === "object" &&
    "statusCode" in err &&
    typeof (err as { statusCode?: unknown }).statusCode === "number"
  );
}

export function getHttpStatusCode(err: unknown): number | undefined {
  if (err instanceof HttpError) return err.statusCode;
  if (hasStatusCode(err)) return err.statusCode;
  return undefined;
}

/**
 * Extract a human-readable message from an unknown caught value.
 */
export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function extractExtraErrorFields(err: unknown): Record<string, unknown> {
  if (!err || typeof err !== "object") return {};
  const extras: Record<string, unknown> = {};
  const maybe = err as Record<string, unknown>;
  if (Array.isArray(maybe.blockers)) extras.blockers = maybe.blockers;
  if (Array.isArray(maybe.conflicts)) extras.conflicts = maybe.conflicts;
  return extras;
}

/**
 * Shared route error handler.
 * Sends the appropriate HTTP status based on the error type.
 *
 * Usage in route catch blocks:
 *   } catch (err) { return handleRouteError(reply, err, 'Failed to do X'); }
 */
export function handleRouteError(
  reply: { status(code: number): { send(payload: unknown): unknown } },
  err: unknown,
  fallbackMessage?: string,
): unknown {
  const statusCode = getHttpStatusCode(err);
  const msg = getErrorMessage(err);
  const extras = extractExtraErrorFields(err);
  if (statusCode) {
    return reply.status(statusCode).send({ error: msg, ...extras });
  }
  return reply.status(500).send({
    error: fallbackMessage ?? msg,
    ...(fallbackMessage ? { detail: msg } : {}),
    ...extras,
  });
}
