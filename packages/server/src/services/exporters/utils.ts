import StyleDictionary from 'style-dictionary';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  isReference,
  makeReferenceGlobalRegex,
  resolveRefValue,
  stableStringify,
} from '@tokenmanager/core';
import type { ExporterContext, FlatToken } from './types.js';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

type TokenLeaf = JsonObject & {
  $value: JsonValue;
  $type?: JsonValue;
};

function isPlainObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTokenLeaf(value: unknown): value is TokenLeaf {
  return isPlainObject(value) && '$value' in value;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) {
    return true;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).every((item) => isJsonValue(item));
}

function cloneJsonValue<T extends JsonValue>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item)) as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const clone: JsonObject = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    clone[key] = cloneJsonValue(nestedValue);
  }
  return clone as T;
}

function jsonValuesEqual(left: JsonValue | undefined, right: JsonValue): boolean {
  return left !== undefined && stableStringify(left) === stableStringify(right);
}

function isGradientStop(value: unknown): value is JsonObject & { color: JsonValue; position: JsonValue } {
  return (
    isPlainObject(value) &&
    isJsonValue(value.color) &&
    isJsonValue(value.position)
  );
}

/**
 * Build a flat path→rawValue lookup from a merged DTCG token object.
 * Skips $-prefixed metadata keys and descends into nested groups.
 */
export function buildFlatValueMap(obj: JsonObject, prefix = ''): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;

    if (!isPlainObject(val)) {
      continue;
    }

    const tokenPath = prefix ? `${prefix}.${key}` : key;
    if (isTokenLeaf(val)) {
      map[tokenPath] = val.$value;
      continue;
    }

    Object.assign(map, buildFlatValueMap(val, tokenPath));
  }
  return map;
}

/**
 * Build a flat list of tokens from a merged DTCG token object, resolving
 * alias references using the provided flat value map.
 */
export function buildFlatTokenList(
  obj: JsonObject,
  flatMap: Record<string, unknown>,
  prefix = '',
  inheritedType?: string,
): FlatToken[] {
  const tokens: FlatToken[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;

    if (!isPlainObject(val)) {
      continue;
    }

    const tokenPath = prefix ? `${prefix}.${key}` : key;
    if (isTokenLeaf(val)) {
      let value = val.$value;
      if (typeof value === 'string' && isReference(value)) {
        const resolved = resolveRefValue(value, flatMap);
        if (resolved !== undefined) {
          value = resolved as JsonValue;
        }
      }

      tokens.push({
        path: tokenPath,
        value,
        type: typeof val.$type === 'string' ? val.$type : inheritedType,
      });
      continue;
    }

    tokens.push(
      ...buildFlatTokenList(
        val,
        flatMap,
        tokenPath,
        typeof val['$type'] === 'string' ? val['$type'] : inheritedType,
      ),
    );
  }
  return tokens;
}

/** Set a value at a nested path within an object, creating intermediate objects as needed. */
export function setNested(obj: Record<string, unknown>, segments: string[], value: unknown): void {
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const next = cur[seg];
    if (!isPlainObject(next)) {
      cur[seg] = {};
    }
    cur = cur[seg] as Record<string, unknown>;
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
  dst: JsonObject,
  src: JsonObject,
  conflicts: string[],
  prefix = '',
): void {
  for (const [key, srcVal] of Object.entries(src)) {
    const dstVal = dst[key];
    const fullPath = prefix ? `${prefix}.${key}` : key;

    if (
      isPlainObject(dstVal) &&
      !isTokenLeaf(dstVal) &&
      isPlainObject(srcVal) &&
      !isTokenLeaf(srcVal)
    ) {
      deepMergeInto(dstVal, srcVal, conflicts, fullPath);
      continue;
    }

    if (!key.startsWith('$') && dstVal !== undefined && !jsonValuesEqual(dstVal, srcVal)) {
      conflicts.push(fullPath);
    }

    dst[key] = cloneJsonValue(srcVal);
  }
}

/**
 * Walk the merged DTCG token tree and pre-resolve alias references inside
 * gradient stop `color` fields. This ensures Style Dictionary receives
 * concrete color values for gradient stops rather than `{path}` references
 * that it may not resolve inside array values.
 */
export function resolveGradientStopAliases(merged: JsonObject): JsonObject {
  const flatMap = buildFlatValueMap(merged);

  const processValue = (value: JsonValue): JsonValue => {
    if (Array.isArray(value)) {
      if (value.every(isGradientStop)) {
        return value.map((stop) => {
          const color = stop.color;
          if (!isReference(color)) {
            return cloneJsonValue(stop);
          }
          const resolvedColor = resolveRefValue(color, flatMap);
          return {
            ...cloneJsonValue(stop),
            color: resolvedColor === undefined ? color : (resolvedColor as JsonValue),
          };
        });
      }

      return value.map((item) => {
        if (isPlainObject(item)) {
          return processObject(item);
        }
        return cloneJsonValue(item);
      });
    }

    if (isPlainObject(value)) {
      return processObject(value);
    }

    return value;
  };

  const processObject = (obj: JsonObject): JsonObject => {
    const result: JsonObject = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = processValue(val);
    }
    return result;
  };

  return processObject(merged);
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
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Style Dictionary did not produce "${destination}" for platform "${platformKey}": ${detail}`,
    );
  }
}

/**
 * Walk a merged DTCG token tree and replace formula tokens' $value with
 * a CSS calc() expression. Used for CSS-family platforms (css, scss, less).
 *
 * Example: a token with $value=16 and $extensions.tokenmanager.formula="{spacing.base} * 2"
 * becomes $value="calc(var(--spacing-base) * 2)".
 */
export function injectFormulaCalc(obj: JsonObject): JsonObject {
  const result: JsonObject = {};
  for (const [key, val] of Object.entries(obj)) {
    if (isTokenLeaf(val)) {
      const extensions = isPlainObject(val.$extensions) ? val.$extensions : undefined;
      const tokenManagerExtensions = extensions && isPlainObject(extensions.tokenmanager)
        ? extensions.tokenmanager
        : undefined;
      const formula = tokenManagerExtensions?.formula;
      if (typeof formula === 'string') {
        const cssFormula = formula.replace(makeReferenceGlobalRegex(), (_: string, refPath: string) => {
          return `var(--${refPath.replace(/\./g, '-')})`;
        });
        result[key] = { ...cloneJsonValue(val), $value: `calc(${cssFormula})` };
        continue;
      }

      result[key] = cloneJsonValue(val);
      continue;
    }

    if (isPlainObject(val)) {
      result[key] = injectFormulaCalc(val);
      continue;
    }

    result[key] = cloneJsonValue(val);
  }
  return result;
}
