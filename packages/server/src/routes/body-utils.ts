export type StringFieldResult =
  | { ok: true; value: string | undefined }
  | { ok: false; error: string };

export type RequiredStringFieldResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function isRequestBodyObject(
  body: unknown,
): body is Record<string, unknown> {
  return body !== null && typeof body === "object" && !Array.isArray(body);
}

export function hasBodyField(
  body: Record<string, unknown>,
  field: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(body, field);
}

export function readOptionalTrimmedStringField(
  body: Record<string, unknown>,
  field: string,
  label: string,
): StringFieldResult {
  if (!hasBodyField(body, field) || body[field] == null) {
    return { ok: true, value: undefined };
  }
  if (typeof body[field] !== "string") {
    return { ok: false, error: `${label} must be a string` };
  }
  return { ok: true, value: body[field].trim() || undefined };
}

export function readRequiredTrimmedStringField(
  body: Record<string, unknown> | undefined,
  field: string,
  label: string,
): RequiredStringFieldResult {
  if (!body || !hasBodyField(body, field)) {
    return { ok: false, error: `${label} is required` };
  }
  if (typeof body[field] !== "string" || !body[field].trim()) {
    return { ok: false, error: `${label} must be a non-empty string` };
  }
  return { ok: true, value: body[field].trim() };
}
