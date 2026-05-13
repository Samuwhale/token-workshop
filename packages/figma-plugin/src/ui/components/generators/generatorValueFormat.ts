export function formatGeneratorValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object" && "value" in value && "unit" in value) {
    return `${String((value as { value: unknown }).value)}${String((value as { unit: unknown }).unit)}`;
  }
  return JSON.stringify(value);
}
