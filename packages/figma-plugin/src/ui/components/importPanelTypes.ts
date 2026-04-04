// Shared types and pure utility functions for ImportPanel sub-components.

export interface ImportToken {
  path: string;
  $type: string;
  $value: any;
  collection?: string;
  _warning?: string;
  $description?: string;
  $scopes?: string[];
  $extensions?: Record<string, any>;
}

export interface ModeData {
  modeId: string;
  modeName: string;
  tokens: ImportToken[];
}

export interface CollectionData {
  name: string;
  modes: ModeData[];
}

// ── Pure utility functions ────────────────────────────────────────────────────

export function truncateValue(v: string, max = 24): string {
  return v.length > max ? v.slice(0, max) + '\u2026' : v;
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9/_-]/g, '');
}

export function markDuplicatePaths(importTokens: ImportToken[]): ImportToken[] {
  const pathCounts = new Map<string, number>();
  for (const t of importTokens) pathCounts.set(t.path, (pathCounts.get(t.path) ?? 0) + 1);
  return importTokens.map(t => {
    if ((pathCounts.get(t.path) ?? 1) <= 1) return t;
    return { ...t, _warning: `Path conflict: multiple tokens share "${t.path}" — only the last will be saved` };
  });
}

export function defaultSetName(collectionName: string, modeName: string, totalModes: number): string {
  const base = slugify(collectionName);
  if (totalModes <= 1) return base;
  return `${base}/${slugify(modeName)}`;
}

export function modeKey(collectionName: string, modeId: string): string {
  return `${collectionName}|${modeId}`;
}

/** Known non-token JSON files that users commonly try to import by mistake. */
export function detectKnownNonTokenFile(obj: Record<string, unknown>): string | null {
  if ('name' in obj && 'version' in obj && ('dependencies' in obj || 'devDependencies' in obj)) {
    return 'This looks like a package.json file, not a design token file.';
  }
  if ('compilerOptions' in obj || ('include' in obj && 'compilerOptions' in obj)) {
    return 'This looks like a tsconfig.json file, not a design token file.';
  }
  if ('eslintConfig' in obj || ('rules' in obj && 'env' in obj)) {
    return 'This looks like an ESLint config file, not a design token file.';
  }
  return null;
}

/**
 * Validate that a parsed JSON object has DTCG-compatible structure.
 * Returns an error string if invalid, or null if it looks valid.
 */
export function validateDTCGStructure(obj: Record<string, unknown>): string | null {
  const knownFile = detectKnownNonTokenFile(obj);
  if (knownFile) {
    return `${knownFile} DTCG token files contain objects with $type and $value fields.`;
  }

  let hasNestedObjects = false;
  let hasDollarValue = false;
  let hasPlainValues = false;
  const topKeys: string[] = [];

  function scan(node: Record<string, unknown>, depth: number): void {
    if (depth > 3) return;
    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith('$')) {
        if (key === '$value') hasDollarValue = true;
        continue;
      }
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        hasNestedObjects = true;
        scan(val as Record<string, unknown>, depth + 1);
      } else {
        hasPlainValues = true;
        if (depth === 0) topKeys.push(key);
      }
    }
  }

  scan(obj, 0);

  if (hasDollarValue || hasNestedObjects) {
    return null;
  }

  if (hasPlainValues) {
    const sample = topKeys.slice(0, 3).map(k => `"${k}"`).join(', ');
    return `This JSON file doesn't appear to be in DTCG format. Found flat key-value pairs (${sample}${topKeys.length > 3 ? ', …' : ''}) but no token objects with $value fields. Expected a nested structure like: { "group": { "token": { "$type": "color", "$value": "#fff" } } }`;
  }

  return 'The JSON file is empty — no tokens to import.';
}
