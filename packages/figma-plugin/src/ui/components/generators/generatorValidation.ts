export function validateGeneratorTokenPath(path: string): string | null {
  const text = path.trim();
  if (!text) return "Path is required.";
  if (text.split(".").some((segment) => !segment)) return "Path segments cannot be empty.";
  if (/[\\/]/.test(text)) return "Use dots instead of slashes.";
  if (text.split(".").some((segment) => segment.startsWith("$"))) return "Path segments cannot start with $.";
  return null;
}
