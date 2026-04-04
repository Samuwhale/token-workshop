import StyleDictionary from 'style-dictionary';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import type { TokenGroup } from '@tokenmanager/core';
import { makeReferenceGlobalRegex, resolveRefValue, isReference } from '@tokenmanager/core';

export type ExportPlatform = 'css' | 'dart' | 'ios-swift' | 'android' | 'json' | 'scss' | 'less' | 'typescript' | 'tailwind' | 'css-in-js';

export interface ExportResult {
  platform: ExportPlatform;
  files: { path: string; content: string }[];
  /** Set when the platform export failed; files will be empty. */
  error?: string;
}

export interface ExportTokensResult {
  results: ExportResult[];
  warnings: string[];
}

const PLATFORM_CONFIGS: Partial<Record<ExportPlatform, any>> = {
  css: {
    transformGroup: 'css',
    buildPath: 'css/',
    files: [{ destination: 'variables.css', format: 'css/variables' }],
  },
  dart: {
    transformGroup: 'flutter',
    buildPath: 'dart/',
    files: [{ destination: 'tokens.dart', format: 'flutter/class.dart' }],
  },
  'ios-swift': {
    transformGroup: 'ios-swift',
    buildPath: 'ios/',
    files: [{ destination: 'Tokens.swift', format: 'ios-swift/class.swift', className: 'Tokens' }],
  },
  android: {
    transformGroup: 'android',
    buildPath: 'android/',
    files: [{ destination: 'tokens.xml', format: 'android/resources' }],
  },
  json: {
    transformGroup: 'js',
    buildPath: 'json/',
    files: [{ destination: 'tokens.json', format: 'json/flat' }],
  },
  scss: {
    transformGroup: 'css',
    buildPath: 'scss/',
    files: [{ destination: '_variables.scss', format: 'scss/variables' }],
  },
  less: {
    transformGroup: 'css',
    buildPath: 'less/',
    files: [{ destination: 'variables.less', format: 'less/variables' }],
  },
  typescript: {
    transformGroup: 'js',
    buildPath: 'ts/',
    files: [{ destination: 'tokens.ts', format: 'javascript/es6' }],
  },
};

/** Maps DTCG $type values to Tailwind CSS theme section keys. */
const TAILWIND_THEME_KEYS: Record<string, string> = {
  color: 'colors',
  spacing: 'spacing',
  dimension: 'spacing',
  fontFamily: 'fontFamily',
  fontSize: 'fontSize',
  fontWeight: 'fontWeight',
  lineHeight: 'lineHeight',
  letterSpacing: 'letterSpacing',
  borderRadius: 'borderRadius',
  borderWidth: 'borderWidth',
  opacity: 'opacity',
  boxShadow: 'boxShadow',
  duration: 'transitionDuration',
  cubicBezier: 'transitionTimingFunction',
};

type FlatToken = { path: string; value: unknown; type?: string };

/**
 * Build a flat list of tokens from a merged DTCG token object, resolving
 * alias references using the provided flat value map.
 */
function buildFlatTokenList(
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
function setNested(obj: Record<string, any>, segments: string[], value: unknown): void {
  let cur = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (typeof cur[seg] !== 'object' || cur[seg] === null || Array.isArray(cur[seg])) cur[seg] = {};
    cur = cur[seg] as Record<string, any>;
  }
  cur[segments[segments.length - 1]] = value;
}

/** Serialize a JS value to a formatted JS/TS source string with indentation. */
function serializeJsValue(val: unknown, indent: number): string {
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
 * Generate a Tailwind CSS v3 config file from a flat token list.
 * Tokens are grouped by $type and placed in the appropriate theme.extend section.
 * Tokens with unrecognized $type are skipped.
 */
function generateTailwindConfig(tokens: FlatToken[]): string {
  const themeExtend: Record<string, any> = {};
  for (const token of tokens) {
    const tailwindKey = token.type ? TAILWIND_THEME_KEYS[token.type] : undefined;
    if (!tailwindKey) continue;
    if (!(tailwindKey in themeExtend)) themeExtend[tailwindKey] = {};
    setNested(themeExtend[tailwindKey], token.path.split('.'), token.value);
  }
  const themeContent = serializeJsValue({ extend: themeExtend }, 2);
  return `/** @type {import('tailwindcss').Config} */\nmodule.exports = {\n  theme: ${themeContent},\n};\n`;
}

/**
 * Generate a CSS-in-JS theme object compatible with styled-components and Emotion.
 * All tokens are placed in a nested TypeScript const object keyed by their paths.
 */
function generateCssInJs(tokens: FlatToken[]): string {
  const themeObj: Record<string, any> = {};
  for (const token of tokens) {
    setNested(themeObj, token.path.split('.'), token.value);
  }
  const themeContent = serializeJsValue(themeObj, 0);
  return `export const theme = ${themeContent} as const;\n\nexport type Theme = typeof theme;\n`;
}

/**
 * Build a flat path→rawValue lookup from a merged DTCG token object.
 * Skips $-prefixed metadata keys and descends into nested groups.
 */
function buildFlatValueMap(obj: Record<string, any>, prefix = ''): Record<string, unknown> {
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
 * Walk the merged DTCG token tree and pre-resolve alias references inside
 * gradient stop `color` fields. This ensures Style Dictionary receives
 * concrete color values for gradient stops rather than `{path}` references
 * that it may not resolve inside array values.
 */
function resolveGradientStopAliases(merged: Record<string, any>): Record<string, any> {
  const flatMap = buildFlatValueMap(merged);

  const processValue = (val: unknown): unknown => {
    if (!Array.isArray(val)) return val;
    // Check if this looks like a gradient stop array: [{color, position}, ...]
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
 * Walk a merged DTCG token tree and replace formula tokens' $value with
 * a CSS calc() expression. Only used when building the CSS platform.
 *
 * Example: a token with $value=16 and $extensions.tokenmanager.formula="{spacing.base} * 2"
 * becomes $value="calc(var(--spacing-base) * 2)".
 */
function injectFormulaCalc(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if ('$value' in val) {
        // Check for formula metadata
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

/**
 * Recursively merge `src` into `dst` in-place. When both sides have a key
 * and both values are plain objects (token groups, not leaf tokens), their
 * contents are merged recursively. Otherwise the src value wins.
 *
 * Any token path that already exists in `dst` and is being overwritten is
 * pushed onto `conflicts` so the caller can surface a warning.
 */
function deepMergeInto(
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
      // Record a conflict when we are overwriting an existing value
      if (dstVal !== undefined && dstVal !== null) {
        conflicts.push(fullPath);
      }
      dst[key] = srcVal;
    }
  }
}

export interface CssExportOptions {
  selector?: string;
}

export async function exportTokens(
  tokens: Record<string, TokenGroup>,
  platforms: ExportPlatform[],
  outputDir?: string,
  cssOptions?: CssExportOptions,
): Promise<ExportTokensResult> {
  const isTemp = !outputDir;
  const tmpDir = outputDir || path.join(os.tmpdir(), `tokenmanager-export-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    // Write tokens as a single JSON for Style Dictionary
    const tokenFile = path.join(tmpDir, 'tokens.json');
    // Deep-merge all sets into one object so that shared top-level group keys
    // (e.g. two sets both have a `color` group) have their contents combined
    // rather than the second set silently overwriting the first.
    const merged: Record<string, any> = {};
    const warnings: string[] = [];
    for (const [setName, tokenGroup] of Object.entries(tokens)) {
      const setConflicts: string[] = [];
      deepMergeInto(merged, tokenGroup as Record<string, any>, setConflicts);
      for (const tokenPath of setConflicts) {
        const msg = `Token "${tokenPath}" is defined in multiple sets; value from set "${setName}" will be used`;
        console.warn(`[export] ${msg}`);
        warnings.push(msg);
      }
    }
    // Pre-resolve alias references inside gradient stop color fields so that
    // Style Dictionary receives concrete color values rather than {path} refs.
    const resolvedMerged = resolveGradientStopAliases(merged);
    const tokenFileTmp = `${tokenFile}.tmp`;
    await fs.writeFile(tokenFileTmp, JSON.stringify(resolvedMerged, null, 2));
    await fs.rename(tokenFileTmp, tokenFile);

    // For CSS exports: create a separate token file where formula tokens have
    // their $value replaced with a calc() expression.
    const cssTokenFile = path.join(tmpDir, 'tokens-css.json');
    const cssOptimized = injectFormulaCalc(resolvedMerged);
    const cssTokenFileTmp = `${cssTokenFile}.tmp`;
    await fs.writeFile(cssTokenFileTmp, JSON.stringify(cssOptimized, null, 2));
    await fs.rename(cssTokenFileTmp, cssTokenFile);

    const results: ExportResult[] = [];

    // Handle custom platforms that bypass Style Dictionary
    const flatMapForCustom = buildFlatValueMap(resolvedMerged);
    const flatTokenList = buildFlatTokenList(resolvedMerged, flatMapForCustom);
    for (const platform of platforms) {
      if (platform === 'tailwind') {
        const content = generateTailwindConfig(flatTokenList);
        results.push({ platform, files: [{ path: 'tailwind.config.js', content }] });
      } else if (platform === 'css-in-js') {
        const content = generateCssInJs(flatTokenList);
        results.push({ platform, files: [{ path: 'theme.ts', content }] });
      }
    }

    for (const platform of platforms) {
      const config = PLATFORM_CONFIGS[platform];
      if (!config) continue;

      const buildPath = path.join(tmpDir, config.buildPath);
      await fs.mkdir(buildPath, { recursive: true });

      // Use the CSS-optimized file (formula → calc()) for CSS-family platforms
      const sourceFile = (platform === 'css' || platform === 'scss' || platform === 'less') ? cssTokenFile : tokenFile;

      // Build effective platform config, applying CSS selector override if provided
      let effectiveConfig = config;
      if (platform === 'css' && cssOptions?.selector && cssOptions.selector !== ':root') {
        effectiveConfig = {
          ...config,
          files: config.files.map((f: any) => ({
            ...f,
            options: { ...(f.options ?? {}), selector: cssOptions!.selector },
          })),
        };
      }

      try {
        const sd = new StyleDictionary({
          source: [sourceFile],
          platforms: {
            [platform]: {
              ...effectiveConfig,
              buildPath: buildPath + '/',
            },
          },
        });

        await sd.buildAllPlatforms();

        // Read generated files
        const files: { path: string; content: string }[] = [];
        for (const fileConfig of config.files) {
          const filePath = path.join(buildPath, fileConfig.destination);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            files.push({ path: fileConfig.destination, content });
          } catch {
            // File may not have been generated
          }
        }

        results.push({ platform, files });
      } catch (err) {
        results.push({ platform, files: [], error: String(err) });
      }
    }

    return { results, warnings };
  } finally {
    if (isTemp) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {
        // Non-fatal — temp cleanup failure should not break the export result
      });
    }
  }
}
