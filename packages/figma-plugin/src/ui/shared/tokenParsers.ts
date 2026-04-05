import { flattenTokenGroup, isReference, type DTCGGroup } from '@tokenmanager/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedToken {
  path: string;
  $type: string;
  $value: unknown;
}

export interface SkippedEntry {
  path: string;
  originalExpression: string;
  reason: string;
}

export type ParseFormat = 'dtcg' | 'lines' | 'css' | 'csv' | 'tailwind' | 'tokens-studio' | 'empty' | 'error';

export interface ParseResult {
  tokens: ParsedToken[];
  errors: string[];
  skipped: SkippedEntry[];
  format: ParseFormat;
}

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

export function inferType(value: string): { $type: string; $value: unknown } {
  const trimmed = value.trim();
  if (isReference(trimmed)) {
    return { $type: 'color', $value: trimmed }; // alias — type unknown at parse time
  }
  if (/^#([0-9a-fA-F]{3,8})$/.test(trimmed)) {
    return { $type: 'color', $value: trimmed };
  }
  if (/^(rgb|hsl|hwb|lab|lch|oklch|oklab|color)a?\s*\(/i.test(trimmed)) {
    return { $type: 'color', $value: trimmed };
  }
  // Duration: 200ms, 0.3s
  const durMatch = trimmed.match(/^(-?\d+(\.\d+)?)(ms|s)$/);
  if (durMatch) {
    return { $type: 'duration', $value: { value: parseFloat(durMatch[1]), unit: durMatch[3] } };
  }
  const dimMatch = trimmed.match(/^(-?\d+(\.\d+)?)(px|em|rem|%|vh|vw|pt)$/);
  if (dimMatch) {
    return { $type: 'dimension', $value: { value: parseFloat(dimMatch[1]), unit: dimMatch[3] } };
  }
  // Boolean
  if (/^(true|false)$/i.test(trimmed)) {
    return { $type: 'boolean', $value: trimmed.toLowerCase() === 'true' };
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { $type: 'number', $value: parseFloat(trimmed) };
  }
  return { $type: 'string', $value: trimmed };
}

// ---------------------------------------------------------------------------
// DTCG flattener
// ---------------------------------------------------------------------------

export function flattenDTCG(obj: DTCGGroup): ParsedToken[] {
  const results: ParsedToken[] = [];
  for (const [path, token] of flattenTokenGroup(obj)) {
    results.push({
      path,
      $type: typeof token.$type === 'string' ? token.$type : 'string',
      $value: token.$value,
    });
  }
  return results;
}

// ---------------------------------------------------------------------------
// CSS Custom Properties parser
// ---------------------------------------------------------------------------

/** Convert CSS custom property name to dot-separated token path: --color-primary → color.primary */
export function cssVarToPath(name: string): string {
  return name
    .replace(/^--/, '')
    .replace(/-/g, '.');
}

/** CSS expressions that cannot be resolved to a static value */
const DYNAMIC_CSS_PATTERN = /\b(calc|env|min|max|clamp)\s*\(/i;

export function parseCSSCustomProperties(raw: string): ParseResult {
  const lines = raw.trim().split('\n');
  const tokens: ParsedToken[] = [];
  const errors: string[] = [];
  const skipped: SkippedEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line || line.startsWith('//') || line.startsWith('/*') || line === '}' || line === '{' || /^[a-z.*:]+\s*\{/.test(line)) continue;
    // Strip trailing semicolon and !important
    line = line.replace(/\s*!important\s*/, '').replace(/;\s*$/, '');
    const match = line.match(/^(--[\w-]+)\s*:\s*(.+)$/);
    if (!match) {
      errors.push(`Line ${i + 1}: expected "--name: value"`);
      continue;
    }
    const path = cssVarToPath(match[1]);
    let rawValue = match[2].trim();
    // Convert var(--x) references to DTCG alias syntax
    const simpleVarRef = rawValue.match(/^var\((--[\w-]+)\)$/);
    if (simpleVarRef) {
      rawValue = `{${cssVarToPath(simpleVarRef[1])}}`;
    } else if (DYNAMIC_CSS_PATTERN.test(rawValue) || rawValue.includes('var(')) {
      // Dynamic expression — cannot be resolved to a static design token value
      const entry: SkippedEntry = {
        path,
        originalExpression: rawValue,
        reason: 'Dynamic CSS expression — cannot be resolved statically',
      };
      skipped.push(entry);
      console.debug('[tokenParsers] CSS skipped:', entry.path, '—', entry.reason, `(${rawValue})`);
      continue;
    }
    tokens.push({ path, ...inferType(rawValue) });
  }

  return { tokens, errors, skipped, format: errors.length > 0 && tokens.length === 0 ? 'error' : 'css' };
}

// ---------------------------------------------------------------------------
// CSV / TSV parser
// ---------------------------------------------------------------------------

export function detectCSVSeparator(firstDataLine: string): ',' | '\t' | null {
  const tabs = (firstDataLine.match(/\t/g) || []).length;
  const commas = (firstDataLine.match(/,/g) || []).length;
  if (tabs >= 1) return '\t';
  if (commas >= 1) return ',';
  return null;
}

const CSV_HEADER_NAMES = /^(name|token|path|key)$/i;
const CSV_TYPE_NAMES = /^(type|\$type|kind)$/i;
const CSV_VALUE_NAMES = /^(value|\$value|val)$/i;

export function parseCSV(raw: string): ParseResult {
  const lines = raw.trim().split('\n').filter(l => l.trim());
  if (lines.length < 1) return { tokens: [], errors: [], skipped: [], format: 'empty' };

  const sep = detectCSVSeparator(lines[0]);
  if (!sep) return { tokens: [], errors: ['Could not detect CSV/TSV separator'], skipped: [], format: 'error' };

  const headerCells = lines[0].split(sep).map(c => c.trim());
  const hasHeader = headerCells.some(c => CSV_HEADER_NAMES.test(c));

  let nameCol = 0;
  let typeCol = -1;
  let valueCol = 1;

  if (hasHeader) {
    nameCol = headerCells.findIndex(c => CSV_HEADER_NAMES.test(c));
    typeCol = headerCells.findIndex(c => CSV_TYPE_NAMES.test(c));
    valueCol = headerCells.findIndex(c => CSV_VALUE_NAMES.test(c));
    if (nameCol < 0 || valueCol < 0) {
      return { tokens: [], errors: ['CSV header must include "name" and "value" columns'], skipped: [], format: 'error' };
    }
  }

  const tokens: ParsedToken[] = [];
  const errors: string[] = [];
  const startRow = hasHeader ? 1 : 0;

  for (let i = startRow; i < lines.length; i++) {
    const cells = lines[i].split(sep).map(c => c.trim());
    const name = cells[nameCol] || '';
    const value = cells[valueCol] || '';
    const explicitType = typeCol >= 0 ? (cells[typeCol] || '') : '';

    if (!name) {
      errors.push(`Row ${i + 1}: empty name`);
      continue;
    }
    if (!value) {
      errors.push(`Row ${i + 1}: empty value`);
      continue;
    }

    if (explicitType) {
      const inferred = inferType(value);
      tokens.push({ path: name, $type: explicitType, $value: inferred.$value });
    } else {
      tokens.push({ path: name, ...inferType(value) });
    }
  }

  return { tokens, errors, skipped: [], format: errors.length > 0 && tokens.length === 0 ? 'error' : 'csv' };
}

// ---------------------------------------------------------------------------
// Tailwind / JS object parser
// ---------------------------------------------------------------------------

/** Best-effort conversion of a JS-style object literal to JSON */
export function jsObjectToJSON(raw: string): string {
  let s = raw;
  // Remove trailing commas before } or ]
  s = s.replace(/,(\s*[}\]])/g, '$1');
  // Quote unquoted keys: word chars (including hyphens) before colons
  // but not already quoted and not inside strings
  s = s.replace(/(?<=[{,]\s*)([a-zA-Z_$][\w-]*)\s*:/g, '"$1":');
  // Convert single quotes to double quotes (simple — doesn't handle escaped quotes in strings)
  s = s.replace(/'/g, '"');
  return s;
}

export function flattenJSObject(
  obj: Record<string, unknown>,
  prefix = '',
  skipped: SkippedEntry[] = [],
): ParsedToken[] {
  const results: ParsedToken[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('$')) continue; // skip DTCG meta
    // Tailwind DEFAULT key maps to the parent path
    const path = key === 'DEFAULT'
      ? (prefix || key)
      : prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      results.push(...flattenJSObject(val as Record<string, unknown>, path, skipped));
    } else if (typeof val === 'string' || typeof val === 'number') {
      const strVal = String(val);
      results.push({ path, ...inferType(strVal) });
    } else if (Array.isArray(val)) {
      const entry: SkippedEntry = { path, originalExpression: JSON.stringify(val), reason: 'Array value — not a scalar design token' };
      skipped.push(entry);
      console.debug('[tokenParsers] Tailwind skipped:', entry.path, '—', entry.reason);
    } else if (typeof val === 'function') {
      const entry: SkippedEntry = { path, originalExpression: '[function]', reason: 'Function value — cannot be resolved statically' };
      skipped.push(entry);
      console.debug('[tokenParsers] Tailwind skipped:', entry.path, '—', entry.reason);
    } else if (typeof val === 'boolean') {
      const entry: SkippedEntry = { path, originalExpression: String(val), reason: 'Boolean value — not a supported token type' };
      skipped.push(entry);
      console.debug('[tokenParsers] Tailwind skipped:', entry.path, '—', entry.reason);
    } else if (val === null) {
      const entry: SkippedEntry = { path, originalExpression: 'null', reason: 'Null value — no token value to import' };
      skipped.push(entry);
      console.debug('[tokenParsers] Tailwind skipped:', entry.path, '—', entry.reason);
    }
  }
  return results;
}

export function parseTailwindConfig(raw: string): ParseResult {
  try {
    const json = jsObjectToJSON(raw);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    // Check if it looks like DTCG (has $value somewhere) — if so, prefer DTCG parser
    const hasDTCG = JSON.stringify(parsed).includes('"$value"');
    if (hasDTCG) return { tokens: [], errors: [], skipped: [], format: 'empty' }; // signal to fall through
    const skipped: SkippedEntry[] = [];
    const tokens = flattenJSObject(parsed, '', skipped);
    if (tokens.length === 0) {
      return { tokens: [], errors: ['No tokens found in object'], skipped, format: 'error' };
    }
    return { tokens, errors: [], skipped, format: 'tailwind' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { tokens: [], errors: [`Object parse error: ${msg}`], skipped: [], format: 'error' };
  }
}

// ---------------------------------------------------------------------------
// Tailwind config file parser (handles module.exports / export default wrappers)
// ---------------------------------------------------------------------------

/**
 * Extract the theme object from a Tailwind config file.
 * Strips module.exports, export default, defineConfig() wrappers, etc.
 * Returns the theme object content as a JS-style string, or null if not found.
 */
export function extractTailwindTheme(raw: string): string | null {
  // Try to find `theme:` key and extract its balanced-brace content
  const themeIdx = raw.search(/\btheme\s*:/);
  if (themeIdx >= 0) {
    const afterTheme = raw.slice(themeIdx).replace(/^theme\s*:\s*/, '');
    const extracted = extractBalancedBraces(afterTheme);
    if (extracted) {
      // Check for theme.extend pattern — if the extracted object only has `extend`,
      // use its content directly
      const extendIdx = extracted.search(/\bextend\s*:/);
      if (extendIdx >= 0) {
        const afterExtend = extracted.slice(extendIdx).replace(/^extend\s*:\s*/, '');
        const extendContent = extractBalancedBraces(afterExtend);
        if (extendContent) return extendContent;
      }
      return extracted;
    }
  }

  // No theme key — try to strip module.exports / export default and parse the whole thing
  const cleaned = raw
    .replace(/^(?:export\s+default|module\.exports\s*=)\s*/m, '')
    .replace(/^defineConfig\s*\(\s*/m, '')
    .replace(/\)\s*;?\s*$/, '')
    .replace(/;\s*$/, '')
    .trim();

  if (cleaned.startsWith('{')) return cleaned;
  return null;
}

/** Extract the first balanced `{ ... }` substring from the input */
function extractBalancedBraces(input: string): string | null {
  const start = input.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < input.length; i++) {
    if (input[i] === '{') depth++;
    else if (input[i] === '}') depth--;
    if (depth === 0) return input.slice(start, i + 1);
  }
  return null;
}

/**
 * Parse a full Tailwind config file (tailwind.config.js/ts/mjs/cjs).
 * Extracts the theme object and flattens it into tokens.
 */
export function parseTailwindConfigFile(raw: string): ParseResult {
  const themeStr = extractTailwindTheme(raw);
  if (!themeStr) {
    // Fall back to trying the whole content as an object
    return parseTailwindConfig(raw);
  }
  return parseTailwindConfig(themeStr);
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

export function looksLikeCSS(raw: string): boolean {
  const lines = raw.split('\n').filter(l => {
    const t = l.trim();
    return t && !t.startsWith('//') && !t.startsWith('/*') && t !== '{' && t !== '}' && !/^[a-z.*:]+\s*\{/.test(t);
  });
  if (lines.length === 0) return false;
  const cssLines = lines.filter(l => /^\s*--[\w-]+\s*:/.test(l));
  return cssLines.length >= lines.length * 0.5;
}

export function looksLikeCSV(raw: string): boolean {
  const lines = raw.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return false;
  const sep = detectCSVSeparator(lines[0]);
  if (!sep) return false;
  const cols0 = lines[0].split(sep).length;
  if (cols0 < 2) return false;
  // Check consistency: most lines should have the same column count
  const consistent = lines.filter(l => l.split(sep).length === cols0).length;
  return consistent >= lines.length * 0.7;
}

// ---------------------------------------------------------------------------
// Main parser (auto-detects format from raw text)
// ---------------------------------------------------------------------------

export function parseInput(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { tokens: [], errors: [], skipped: [], format: 'empty' };

  // CSS custom properties detection (before JSON — some CSS might be wrapped in :root {})
  if (looksLikeCSS(trimmed)) {
    return parseCSSCustomProperties(trimmed);
  }

  // CSV/TSV detection (before JSON and name:value — comma/tab structured)
  if (looksLikeCSV(trimmed)) {
    return parseCSV(trimmed);
  }

  // Try JSON / object literal
  if (trimmed.startsWith('{')) {
    // Try DTCG JSON first
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const tokens = flattenDTCG(parsed);
      if (tokens.length > 0) {
        return { tokens, errors: [], skipped: [], format: 'dtcg' };
      }
      // No DTCG tokens — try as plain JS/Tailwind object
      const twResult = parseTailwindConfig(trimmed);
      if (twResult.tokens.length > 0) return twResult;
      return { tokens: [], errors: ['No tokens found in JSON. Expected DTCG format with $value fields, or a plain key/value object.'], skipped: twResult.skipped, format: 'error' };
    } catch (e) {
      console.debug('[tokenParsers] JSON parse failed, trying Tailwind/JS fallback:', e);
      const twResult = parseTailwindConfig(trimmed);
      if (twResult.tokens.length > 0) return twResult;
      // Re-parse for error message
      try { JSON.parse(trimmed); } catch (e2) {
        const msg = e2 instanceof Error ? e2.message : String(e2);
        const looksLikeMixed = /\n\s*[\w.]+\s*:/.test(trimmed);
        const hint = looksLikeMixed ? ' (did you mix JSON and name:value lines? Use one format only)' : '';
        return { tokens: [], errors: [`Parse error: ${msg}${hint}`], skipped: [], format: 'error' };
      }
      return { tokens: [], errors: ['Could not parse input'], skipped: [], format: 'error' };
    }
  }

  // name: value lines
  const lines = trimmed.split('\n');
  const tokens: ParsedToken[] = [];
  const errors: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) {
      errors.push(`Line ${i + 1}: no colon found — expected "name: value"`);
      continue;
    }
    const path = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();
    if (!path) {
      errors.push(`Line ${i + 1}: empty token name`);
      continue;
    }
    if (!rawValue) {
      errors.push(`Line ${i + 1}: empty value`);
      continue;
    }
    tokens.push({ path, ...inferType(rawValue) });
  }
  return { tokens, errors, skipped: [], format: errors.length > 0 && tokens.length === 0 ? 'error' : 'lines' };
}

// ---------------------------------------------------------------------------
// Tokens Studio importer
// ---------------------------------------------------------------------------

/**
 * Tokens Studio uses non-standard type names. Map them to DTCG equivalents.
 * Types already matching DTCG names pass through unchanged via the fallback.
 */
const TS_TYPE_MAP: Record<string, string> = {
  fontSizes: 'dimension',
  fontFamilies: 'fontFamily',
  fontWeights: 'fontWeight',
  lineHeights: 'dimension',
  letterSpacing: 'dimension',
  paragraphSpacing: 'dimension',
  textDecoration: 'string',
  textCase: 'string',
  spacing: 'dimension',
  sizing: 'dimension',
  borderRadius: 'dimension',
  borderWidth: 'dimension',
  boxShadow: 'shadow',
  opacity: 'number',
  asset: 'string',
  other: 'string',
};

function normalizeTsType(tsType: string | undefined): string {
  if (!tsType) return 'string';
  return TS_TYPE_MAP[tsType] ?? tsType;
}

/** Recursively flatten a Tokens Studio token group into ParsedToken[]. Handles both
 *  old format (value/type) and new format ($value/$type). */
function flattenTsGroup(obj: Record<string, unknown>, prefix = '', inheritedType?: string): ParsedToken[] {
  const results: ParsedToken[] = [];
  // Pick up group-level $type / type for inheritance
  const levelType =
    typeof obj['$type'] === 'string' ? (obj['$type'] as string) :
    typeof obj['type'] === 'string' ? (obj['type'] as string) :
    inheritedType;

  for (const [key, val] of Object.entries(obj)) {
    // Skip metadata keys at any level
    if (key === '$type' || key === 'type' || key === '$description' || key === 'description' ||
        key === '$extensions' || key === 'extensions') continue;

    const path = prefix ? `${prefix}.${key}` : key;

    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const node = val as Record<string, unknown>;
      const hasNewValue = '$value' in node;
      const hasOldValue = 'value' in node;

      if (hasNewValue || hasOldValue) {
        // Token node
        const rawValue = hasNewValue ? node['$value'] : node['value'];
        const rawType =
          typeof node['$type'] === 'string' ? (node['$type'] as string) :
          typeof node['type'] === 'string' ? (node['type'] as string) :
          levelType;
        results.push({ path, $type: normalizeTsType(rawType), $value: rawValue });
      } else {
        // Group node — recurse
        results.push(...flattenTsGroup(node, path, levelType));
      }
    }
    // Primitive values at group level are metadata, skip them
  }
  return results;
}

/** Scan up to `maxDepth` levels for old-format tokens (value without $value). */
function hasOldFormatTokens(obj: Record<string, unknown>, depth: number): boolean {
  if (depth > 3) return false;
  for (const val of Object.values(obj)) {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const node = val as Record<string, unknown>;
      if ('value' in node && !('$value' in node)) return true;
      if (hasOldFormatTokens(node, depth + 1)) return true;
    }
  }
  return false;
}

/** Return true if the root object looks like a Tokens Studio export. */
export function isTokensStudioFormat(obj: Record<string, unknown>): boolean {
  // Strong signal: $metadata.tokenSetOrder array
  const meta = obj['$metadata'];
  if (meta !== null && typeof meta === 'object' && !Array.isArray(meta)) {
    if (Array.isArray((meta as Record<string, unknown>)['tokenSetOrder'])) return true;
  }
  // Strong signal: $themes array
  if (Array.isArray(obj['$themes'])) return true;

  // Moderate signal: old-format tokens anywhere in top-level non-$ groups
  const topKeys = Object.keys(obj).filter(k => !k.startsWith('$'));
  for (const key of topKeys) {
    const val = obj[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      if (hasOldFormatTokens(val as Record<string, unknown>, 0)) return true;
    }
  }
  return false;
}

export interface TokensStudioParseResult {
  /** Map of set name → flat token list, in tokenSetOrder if available. */
  sets: Map<string, ParsedToken[]>;
  errors: string[];
}

/**
 * Parse a Tokens Studio JSON export.
 * Returns a map of set name → tokens. Special top-level keys ($themes, $metadata,
 * $sets) are skipped. tokenSetOrder from $metadata is respected for ordering.
 */
export function parseTokensStudioFile(raw: string): TokensStudioParseResult {
  const errors: string[] = [];
  const sets = new Map<string, ParsedToken[]>();

  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { sets, errors: ['Expected a JSON object'] };
    }
    obj = parsed as Record<string, unknown>;
  } catch (e) {
    return { sets, errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`] };
  }

  // Extract tokenSetOrder from $metadata for deterministic ordering
  let setOrder: string[] | null = null;
  const meta = obj['$metadata'];
  if (meta !== null && typeof meta === 'object' && !Array.isArray(meta)) {
    const order = (meta as Record<string, unknown>)['tokenSetOrder'];
    if (Array.isArray(order)) {
      setOrder = order.filter((s): s is string => typeof s === 'string');
    }
  }

  const SKIP_KEYS = new Set(['$themes', '$metadata', '$sets']);
  const topKeys = Object.keys(obj).filter(k => !SKIP_KEYS.has(k));

  // Honour setOrder but also include any keys not listed in it
  const orderedKeys = setOrder
    ? [...setOrder.filter(k => topKeys.includes(k)), ...topKeys.filter(k => !(setOrder as string[]).includes(k))]
    : topKeys;

  for (const key of orderedKeys) {
    const val = obj[key];
    if (val === null || typeof val !== 'object' || Array.isArray(val)) continue;
    const tokens = flattenTsGroup(val as Record<string, unknown>);
    if (tokens.length > 0) sets.set(key, tokens);
  }

  if (sets.size === 0 && topKeys.length > 0) {
    errors.push('No tokens found in file. Expected Tokens Studio JSON with nested groups containing "value" or "$value" fields.');
  }

  return { sets, errors };
}

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

export function validateTokenPath(path: string): string | null {
  if (!path) return 'Empty token path';
  const segments = path.split('.');
  for (const seg of segments) {
    if (seg === '') return 'Empty segment (double dot or leading/trailing dot)';
    if (seg.startsWith('$')) return `Segment "${seg}" uses reserved "$" prefix`;
    if (seg.includes('/') || seg.includes('\\')) return `Segment "${seg}" contains a slash`;
    if (/\s/.test(seg)) return `Segment "${seg}" contains whitespace`;
  }
  return null;
}
