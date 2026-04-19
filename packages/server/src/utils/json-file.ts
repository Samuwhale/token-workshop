import path from "node:path";
import { ConflictError } from "../errors.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function formatJsonFilePath(
  filePath: string,
  relativeTo?: string,
): string {
  if (!relativeTo) {
    return filePath;
  }
  const relativePath = path.relative(relativeTo, filePath);
  if (
    !relativePath ||
    relativePath === "." ||
    relativePath.startsWith(`..${path.sep}`) ||
    relativePath === ".."
  ) {
    return filePath;
  }
  return relativePath;
}

export function parseJsonFile(
  content: string,
  options: { filePath: string; relativeTo?: string },
): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    const label = formatJsonFilePath(options.filePath, options.relativeTo);
    throw new ConflictError(`File "${label}" contains malformed JSON.`);
  }
}

export function expectJsonObject(
  value: unknown,
  options: {
    filePath: string;
    relativeTo?: string;
    expectation?: string;
  },
): Record<string, unknown> {
  if (isPlainObject(value)) {
    return value;
  }
  const label = formatJsonFilePath(options.filePath, options.relativeTo);
  throw new ConflictError(
    `File "${label}" must ${options.expectation ?? "contain a top-level JSON object"}.`,
  );
}

export function expectJsonArray<T = unknown>(
  value: unknown,
  options: {
    filePath: string;
    relativeTo?: string;
    expectation?: string;
  },
): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  const label = formatJsonFilePath(options.filePath, options.relativeTo);
  throw new ConflictError(
    `File "${label}" must ${options.expectation ?? "contain a top-level JSON array"}.`,
  );
}
