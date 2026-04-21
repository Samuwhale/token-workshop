function serializeStable(value: unknown, insideArray: boolean): string | undefined {
  if (value === null) {
    return "null";
  }

  const valueType = typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") {
    return JSON.stringify(value);
  }

  if (valueType === "undefined" || valueType === "function" || valueType === "symbol") {
    return insideArray ? "null" : undefined;
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeStable(item, true) ?? "null").join(",")}]`;
  }

  if (valueType !== "object") {
    return JSON.stringify(value);
  }

  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(record).sort()) {
    const serialized = serializeStable(record[key], false);
    if (serialized !== undefined) {
      parts.push(`${JSON.stringify(key)}:${serialized}`);
    }
  }
  return `{${parts.join(",")}}`;
}

/** JSON.stringify with keys sorted recursively, so key-insertion-order differences never produce different strings. */
export function stableStringify(value: unknown): string {
  return serializeStable(value, false) ?? "null";
}
