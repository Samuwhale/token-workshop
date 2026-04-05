import StyleDictionary from 'style-dictionary';
import path from 'node:path';
import fs from 'node:fs/promises';
import { makeReferenceGlobalRegex, resolveRefValue, isReference } from '@tokenmanager/core';
import type { ExporterContext, FlatToken } from './types.js';

/**
 * Build a flat path→rawValue lookup from a merged DTCG token object.
 * Skips $-prefixed metadata keys and descends into nested groups.
 */
export function buildFlatValueMap(obj: Record<string, any>, prefix = ''): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if ('$value' in val) {
        map[path] = val.$value;
      } else {
        Object.assign(map, buildFlatValueMap(val, path));
      }
    }
  }
  return map;
}

/**
 * Build a flat list of tokens from a merged DTCG token object, resolving
 * alias references using the provided flat value map.
 */
export function buildFlatTokenList(
  obj: Record<string, any>,
  flatMap: Record<string, unknown>,
  prefix = '',
  inheritedType?: string,
): FlatToken[] {
  const tokens: FlatToken[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;
    const tokenPath = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if ('$value' in val) {
        let value = val.$value;
        if (typeof value === 'string' && isReference(value)) {
          const resolved = resolveRefValue(value, flatMap);
          if (resolved !== undefined) value = resolved;
        }
        tokens.push({ path: tokenPath, value, type: (val.$type as string | undefined) ?? inheritedType });
      } else {
        tokens.push(...buildFlatTokenList(val, flatMap, tokenPath, (val.$type as string | undefined) ?? inheritedType));
      }
    }
  }
  return tokens;
}

/** Set a value at a nested path within an object, creating intermediate objects as needed. */
export function setNested(obj: Record<string, any>, segments: string[], value: unknown): void {
  let cur = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (typeof cur[seg] !== 'object' || cur[seg] === null || Array.isArray(cur[seg])) cur[seg] = {};
    cur = cur[seg] as Record<string, any>;
  }
  cur[segments[segments.length - 1]] = value;
}

/** Serialize a JS value to a formatted JS/TS source string with indentation. */
export function serializeJsValue(val: unknown, indent: number): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'string') return JSON.stringify(val);
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]';
    return `[${val.map(item => serializeJsValue(item, indent + 2)).join(', ')}]`;
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    const pad = ' '.repeat(indent + 2);
    const closePad = ' '.repeat(indent);
    const lines = entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${serializeJsValue(v, indent + 2)}`);
    return `{\n${lines.join(',\n')}\n${closePad}}`;
  }
  return JSON.stringify(val);
}

/**
 * Recursively merge `src` into `dst` in-place. When both sides have a key
 * and both values are plain objects (token groups, not leaf tokens), their
 * contents are merged recursively. Otherwise the src value wins.
 *
 * Any token path that already exists in `dst` and is being overwritten is
 * pushed onto `conflicts` so the caller can surface a warning.
 */
export function deepMergeInto(
  dst: Record<string, any>,
  src: Record<string, any>,
  conflicts: string[],
  prefix = '',
): void {
  for (const [key, srcVal] of Object.entries(src)) {
    const dstVal = dst[key];
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (
      dstVal !== null &&
      dstVal !== undefined &&
      typeof dstVal === 'object' &&
      !Array.isArray(dstVal) &&
      !('$value' in dstVal) &&
      typeof srcVal === 'object' &&
      srcVal !== null &&
      !Array.isArray(srcVal) &&
      !('$value' in srcVal)
    ) {
      deepMergeInto(dstVal, srcVal, conflicts, fullPath);
    } else {
      if (dstVal !== undefined && dstVal !== null) {
        conflicts.push(fullPath);
      }
      dst[key] = srcVal;
    }
  }
}

/**
 * Walk the merged DTCG token tree and pre-resolve alias references inside
 * gradient stop `color` fields. This ensures Style Dictionary receives
 * concrete color values for gradient stops rather than `{path}` references
 * that it may not resolve inside array values.
 */
export function resolveGradientStopAliases(merged: Record<string, any>): Record<string, any> {
  const flatMap = buildFlatValueMap(merged);

  const processValue = (val: unknown): unknown => {
    if (!Array.isArray(val)) return val;
    if (val.length === 0) return val;
    const first = val[0];
    if (typeof first !== 'object' || first === null || !('color' in first) || !('position' in first)) {
      return val;
    }
    return (val as Array<{ color: unknown; position: unknown } & Record<string, unknown>>).map(stop => {
      const color = stop.color;
      if (isReference(color)) {
        return { ...stop, color: resolveRefValue(color, flatMap) ?? color };
      }
      return stop;
    });
  };

  const processObj = (obj: Record<string, any>): Record<string, any> => {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (key === '$value') {
        result[key] = processValue(val);
      } else if (val && typeof val === 'object' && !Array.isArray(val)) {
        result[key] = processObj(val);
      } else {
        result[key] = val;
      }
    }
    return result;
  };

  return processObj(merged);
}

/**
 * Shared helper for Style Dictionary-based exporters.
 *
 * Creates a StyleDictionary instance with a single platform, calls
 * buildAllPlatforms, reads the output file, and returns it as a
 * { path, content } pair.
 *
 * @param ctx          - Exporter context (tmpDir, flatTokens, cssOptions)
 * @param platformKey  - SD platform key and output subdirectory name
 * @param transformGroup - SD transform group (e.g. 'css', 'js', 'android')
 * @param destination  - Output filename within the build directory
 * @param format       - SD format name (e.g. 'css/variables', 'json/flat')
 * @param sourceFile   - Token source filename in tmpDir (default: 'tokens.json')
 * @param opts.buildDir       - Override build subdirectory (default: platformKey)
 * @param opts.extraFileConfig - Extra properties merged into the SD file config
 */
export async function buildWithStyleDictionary(
  ctx: ExporterContext,
  platformKey: string,
  transformGroup: string,
  destination: string,
  format: string,
  sourceFile?: string,
  opts?: { buildDir?: string; extraFileConfig?: Record<string, unknown> },
): Promise<Array<{ path: string; content: string }>> {
  const src = path.join(ctx.tmpDir, sourceFile ?? 'tokens.json');
  const dir = opts?.buildDir ?? platformKey;
  const buildPath = path.join(ctx.tmpDir, dir);
  await fs.mkdir(buildPath, { recursive: true });

  const fileConfig = { destination, format, ...(opts?.extraFileConfig ?? {}) };

  const sd = new StyleDictionary({
    source: [src],
    platforms: {
      [platformKey]: {
        transformGroup,
        buildPath: buildPath + '/',
        files: [fileConfig],
      },
    },
  });

  await sd.buildAllPlatforms();

  const filePath = path.join(buildPath, destination);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return [{ path: destination, content }];
  } catch {
    return [];
  }
}

/**
 * Walk a merged DTCG token tree and replace formula tokens' $value with
 * a CSS calc() expression. Used for CSS-family platforms (css, scss, less).
 *
 * Example: a token with $value=16 and $extensions.tokenmanager.formula="{spacing.base} * 2"
 * becomes $value="calc(var(--spacing-base) * 2)".
 */
export function injectFormulaCalc(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if ('$value' in val) {
        const formula = val.$extensions?.tokenmanager?.formula;
        if (typeof formula === 'string') {
          const cssFormula = formula.replace(makeReferenceGlobalRegex(), (_m: string, refPath: string) => {
            return `var(--${refPath.replace(/\./g, '-')})`;
          });
          result[key] = { ...val, $value: `calc(${cssFormula})` };
        } else {
          result[key] = val;
        }
      } else {
        result[key] = injectFormulaCalc(val);
      }
    } else {
      result[key] = val;
    }
  }
  return result;
}
