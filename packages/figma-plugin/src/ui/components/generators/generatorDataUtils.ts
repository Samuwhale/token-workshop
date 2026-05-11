export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isPlainRecord) ? value : [];
}

export function asNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map((item) => Number(item)).filter(Number.isFinite)
    : [];
}

export function asNamedNumberSteps(
  value: unknown,
  valueKey: string,
): Record<string, unknown>[] {
  return asRecordArray(value).map((item) => ({
    ...item,
    name: String(item.name ?? ""),
    [valueKey]: Number(item[valueKey] ?? 0),
  }));
}

export function readGeneratorTokenRefs(value: unknown): Record<string, string> {
  return isPlainRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
    : {};
}
