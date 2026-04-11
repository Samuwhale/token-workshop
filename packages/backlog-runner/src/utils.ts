import { access } from 'node:fs/promises';

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function parseGitStatusPaths(stdout: string): string[] {
  const files = new Set<string>();
  for (const rawLine of stdout.split('\n').map(line => line.trimEnd()).filter(Boolean)) {
    const payload = rawLine.slice(3).trim();
    if (!payload) continue;
    const parts = payload.includes(' -> ') ? payload.split(' -> ') : [payload];
    for (const part of parts) {
      const normalized = part.replace(/^"+|"+$/g, '');
      if (normalized) {
        files.add(normalized);
      }
    }
  }
  return [...files];
}
