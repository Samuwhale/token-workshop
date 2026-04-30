export function formatTokenValuePreview(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value !== "object") return String(value);

  const parts: string[] = [];
  for (const [key, partValue] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith("$")) continue;
    if (typeof partValue === "string" || typeof partValue === "number") {
      parts.push(String(partValue));
    }
    if (parts.length >= 3) break;
  }
  return parts.join(" / ");
}
