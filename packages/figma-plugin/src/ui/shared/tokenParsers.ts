import { flattenTokenGroup, type DTCGGroup } from '@tokenmanager/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedToken {
  path: string;
  $type: string;
  $value: unknown;
}

export type ParseFormat = 'dtcg' | 'lines' | 'css' | 'csv' | 'tailwind' | 'empty' | 'error';

export interface ParseResult {
  tokens: ParsedToken[];
  errors: string[];
  format: ParseFormat;
}

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

export function inferType(value: string): { $type: string; $value: unknown } {
  const trimmed = value.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return { $type: 'color', $value: trimmed }; // alias — type unknown at parse time
  }
  if (/^#([0-9a-fA-F]{3,8})$/.test(trimmed)) {
    return { $type: 'color', $value: trimmed };
  }
  if (/^(rgb|hsl)a?\(/.test(trimmed)) {
    return { $type: 'color', $value: trimmed };
  }
  const dimMatch = trimmed.match(/^(-?\d+(\.\d+)?)(px|em|rem|%|vh|vw|pt)$/);
  if (dimMatch) {
    return { $type: 'dimension', $value: { value: parseFloat(dimMatch[1]), unit: dimMatch[3] } };
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

export function parseCSSCustomProperties(raw: string): ParseResult {
  const lines = raw.trim().split('\n');
  const tokens: ParsedToken[] = [];
  const errors: string[] = [];

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
    const varRef = rawValue.match(/^var\((--[\w-]+)\)$/);
    if (varRef) {
      rawValue = `{${cssVarToPath(varRef[1])}}`;
    }
    tokens.push({ path, ...inferType(rawValue) });
  }

  return { tokens, errors, format: errors.length > 0 && tokens.length === 0 ? 'error' : 'css' };
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
  if (lines.length < 1) return { tokens: [], errors: [], format: 'empty' };

  const sep = detectCSVSeparator(lines[0]);
  if (!sep) return { tokens: [], errors: ['Could not detect CSV/TSV separator'], format: 'error' };

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
      return { tokens: [], errors: ['CSV header must include "name" and "value" columns'], format: 'error' };
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

  return { tokens, errors, format: errors.length > 0 && tokens.length === 0 ? 'error' : 'csv' };
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

export function flattenJSObject(obj: Record<string, unknown>, prefix = ''): ParsedToken[] {
  const results: ParsedToken[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('$')) continue; // skip DTCG meta
    // Tailwind DEFAULT key maps to the parent path
    const path = key === 'DEFAULT'
      ? (prefix || key)
      : prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      results.push(...flattenJSObject(val as Record<string, unknown>, path));
    } else if (typeof val === 'string' || typeof val === 'number') {
      const strVal = String(val);
      results.push({ path, ...inferType(strVal) });
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
    if (hasDTCG) return { tokens: [], errors: [], format: 'empty' }; // signal to fall through
    const tokens = flattenJSObject(parsed);
    if (tokens.length === 0) {
      return { tokens: [], errors: ['No tokens found in object'], format: 'error' };
    }
    return { tokens, errors: [], format: 'tailwind' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { tokens: [], errors: [`Object parse error: ${msg}`], format: 'error' };
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
  if (!trimmed) return { tokens: [], errors: [], format: 'empty' };

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
        return { tokens, errors: [], format: 'dtcg' };
      }
      // No DTCG tokens — try as plain JS/Tailwind object
      const twResult = parseTailwindConfig(trimmed);
      if (twResult.tokens.length > 0) return twResult;
      return { tokens: [], errors: ['No tokens found in JSON. Expected DTCG format with $value fields, or a plain key/value object.'], format: 'error' };
    } catch {
      // JSON parse failed — try Tailwind/JS object conversion
      const twResult = parseTailwindConfig(trimmed);
      if (twResult.tokens.length > 0) return twResult;
      // Re-parse for error message
      try { JSON.parse(trimmed); } catch (e2) {
        const msg = e2 instanceof Error ? e2.message : String(e2);
        const looksLikeMixed = /\n\s*[\w.]+\s*:/.test(trimmed);
        const hint = looksLikeMixed ? ' (did you mix JSON and name:value lines? Use one format only)' : '';
        return { tokens: [], errors: [`Parse error: ${msg}${hint}`], format: 'error' };
      }
      return { tokens: [], errors: ['Could not parse input'], format: 'error' };
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
  return { tokens, errors, format: errors.length > 0 && tokens.length === 0 ? 'error' : 'lines' };
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
