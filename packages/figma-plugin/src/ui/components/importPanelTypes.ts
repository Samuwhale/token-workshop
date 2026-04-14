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

export type ImportSource = 'variables' | 'styles' | 'json' | 'css' | 'tailwind' | 'tokens-studio';
export type SourceFamily = 'figma' | 'token-files' | 'code' | 'migration';
export type ImportWorkflowStage = 'family' | 'format' | 'destination' | 'preview';

export interface ImportFamilyDefinition {
  family: SourceFamily;
  title: string;
  description: string;
  destinationLabel: string;
  destinationDescription: string;
  supportedFileFormats: string[];
}

export interface ImportFileSupportDefinition {
  label: string;
  accept: string;
}

export interface ImportSourceDefinition {
  source: ImportSource;
  family: SourceFamily;
  label: string;
  shortLabel: string;
  description: string;
  destinationLabel: string;
  destinationDescription: string;
  fileSupport?: ImportFileSupportDefinition;
}

export const IMPORT_FAMILY_DEFINITIONS: Record<SourceFamily, ImportFamilyDefinition> = {
  figma: {
    family: 'figma',
    title: 'From Figma',
    description: 'Read variables or styles from this file',
    destinationLabel: 'Map destinations',
    destinationDescription: 'Choose destination sets for each collection or style.',
    supportedFileFormats: [],
  },
  'token-files': {
    family: 'token-files',
    title: 'From token files',
    description: 'Import DTCG-compatible JSON token files',
    destinationLabel: 'Choose destination',
    destinationDescription: 'Pick the destination set for this token file.',
    supportedFileFormats: ['DTCG JSON (.json)'],
  },
  code: {
    family: 'code',
    title: 'From code',
    description: 'Extract tokens from CSS or Tailwind config',
    destinationLabel: 'Choose destination',
    destinationDescription: 'Pick the destination set for extracted tokens.',
    supportedFileFormats: ['CSS files (.css)', 'Tailwind configs (.js, .ts, .mjs, .cjs)'],
  },
  migration: {
    family: 'migration',
    title: 'Migrate from another tool',
    description: 'Import from Tokens Studio or similar tools',
    destinationLabel: 'Choose destination',
    destinationDescription: 'Route imported data into new or existing sets.',
    supportedFileFormats: ['Tokens Studio JSON (.json)'],
  },
};

export const IMPORT_SOURCE_DEFINITIONS: Record<ImportSource, ImportSourceDefinition> = {
  variables: {
    source: 'variables',
    family: 'figma',
    label: 'Figma Variables',
    shortLabel: 'Variables',
    description: 'Read variables and map to token sets',
    destinationLabel: 'Map collections to sets',
    destinationDescription: 'Each enabled mode maps to a token set.',
  },
  styles: {
    source: 'styles',
    family: 'figma',
    label: 'Figma Styles',
    shortLabel: 'Styles',
    description: 'Read paint, text, and effect styles',
    destinationLabel: 'Choose target set',
    destinationDescription: 'Import styles into an existing or new set.',
  },
  json: {
    source: 'json',
    family: 'token-files',
    label: 'DTCG JSON file',
    shortLabel: 'DTCG JSON',
    description: 'Import a DTCG JSON token file',
    destinationLabel: 'Choose target set',
    destinationDescription: 'Choose a destination set for the parsed tokens.',
    fileSupport: {
      label: 'DTCG JSON (.json)',
      accept: '.json,application/json',
    },
  },
  css: {
    source: 'css',
    family: 'code',
    label: 'CSS custom properties',
    shortLabel: 'CSS',
    description: 'Parse static CSS custom properties',
    destinationLabel: 'Choose target set',
    destinationDescription: 'Choose a destination set for parsed CSS tokens.',
    fileSupport: {
      label: 'CSS files (.css)',
      accept: '.css,text/css',
    },
  },
  tailwind: {
    source: 'tailwind',
    family: 'code',
    label: 'Tailwind config',
    shortLabel: 'Tailwind',
    description: 'Parse theme values from a Tailwind config',
    destinationLabel: 'Choose target set',
    destinationDescription: 'Choose a destination set for Tailwind tokens.',
    fileSupport: {
      label: 'Tailwind configs (.js, .ts, .mjs, .cjs)',
      accept: '.js,.ts,.mjs,.cjs',
    },
  },
  'tokens-studio': {
    source: 'tokens-studio',
    family: 'migration',
    label: 'Tokens Studio export',
    shortLabel: 'Tokens Studio',
    description: 'Import Tokens Studio JSON (single or multi-set)',
    destinationLabel: 'Choose destination',
    destinationDescription: 'Single-set goes to one set; multi-set keeps its mapping.',
    fileSupport: {
      label: 'Tokens Studio JSON (.json)',
      accept: '.json,application/json',
    },
  },
};

// ── Pure utility functions ────────────────────────────────────────────────────

export function getSourceFamily(source: ImportSource | null): SourceFamily | null {
  if (!source) return null;
  return IMPORT_SOURCE_DEFINITIONS[source].family;
}

export function getFamilyDefinition(family: SourceFamily | null): ImportFamilyDefinition | null {
  if (!family) return null;
  return IMPORT_FAMILY_DEFINITIONS[family];
}

export function getSourceDefinition(source: ImportSource | null): ImportSourceDefinition | null {
  if (!source) return null;
  return IMPORT_SOURCE_DEFINITIONS[source];
}

export function formatSupportedFileFormats(formats: string[]): string {
  if (formats.length === 0) return '';
  if (formats.length === 1) return formats[0];
  if (formats.length === 2) return `${formats[0]} or ${formats[1]}`;
  return `${formats.slice(0, -1).join(', ')}, or ${formats[formats.length - 1]}`;
}

export function getFamilySupportedFileFormats(family: SourceFamily | null): string[] {
  if (!family) return [];
  return IMPORT_FAMILY_DEFINITIONS[family].supportedFileFormats;
}

export function getAllSupportedFileFormats(): string[] {
  return Object.values(IMPORT_FAMILY_DEFINITIONS).flatMap(definition => definition.supportedFileFormats);
}

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
    return { ...t, _warning: `Duplicate path "${t.path}" — only the last will be saved` };
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
    return 'This is a package.json, not a token file.';
  }
  if ('compilerOptions' in obj || ('include' in obj && 'compilerOptions' in obj)) {
    return 'This is a tsconfig.json, not a token file.';
  }
  if ('eslintConfig' in obj || ('rules' in obj && 'env' in obj)) {
    return 'This is an ESLint config, not a token file.';
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
    return `${knownFile} Token files need $type and $value fields.`;
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
    return `Not DTCG format. Found flat keys (${sample}${topKeys.length > 3 ? ', …' : ''}) but no $value fields. Expected: { "group": { "token": { "$type": "color", "$value": "#fff" } } }`;
  }

  return 'Empty JSON file — no tokens found.';
}
