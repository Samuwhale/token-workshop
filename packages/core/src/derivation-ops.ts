/**
 * Derivation op registry.
 *
 * Pure 1→1 transformations applied during resolution to a token's resolved
 * `$value`. Ops are dispatched by `(op.kind, $type)` and run in the order
 * stored on `$extensions.tokenmanager.derivation.ops`.
 *
 * Color ops work in CIELAB space; numeric ops (scaleBy/add) preserve the
 * source's `{value, unit}` shape for dimension/duration tokens and operate
 * on bare numbers for `number` tokens.
 */

import { hexToLab, labToHex, setHexAlpha, normalizeHex } from './color-math.js';
import type {
  TokenType,
  DimensionValue,
  DurationValue,
  DerivationOp,
} from './types.js';

export type { DerivationOp, Derivation } from './types.js';

// ---------------------------------------------------------------------------
// Op classification
// ---------------------------------------------------------------------------

const COLOR_OP_KINDS = new Set<DerivationOp['kind']>([
  'alpha',
  'lighten',
  'darken',
  'mix',
  'invertLightness',
]);

const NUMERIC_OP_KINDS = new Set<DerivationOp['kind']>([
  'scaleBy',
  'add',
]);

const NUMERIC_TOKEN_TYPES = new Set<TokenType>(['dimension', 'number', 'duration']);

/** Token types each op kind accepts as input (and produces, since all ops are same-kind). */
export function opSupportedTypes(kind: DerivationOp['kind']): readonly TokenType[] {
  if (COLOR_OP_KINDS.has(kind)) return ['color'];
  return ['dimension', 'number', 'duration'];
}

export function isColorOpKind(kind: DerivationOp['kind']): boolean {
  return COLOR_OP_KINDS.has(kind);
}

export function isNumericOpKind(kind: DerivationOp['kind']): boolean {
  return NUMERIC_OP_KINDS.has(kind);
}

// ---------------------------------------------------------------------------
// Color ops (CIELAB)
// ---------------------------------------------------------------------------

function extractAlpha(hex: string): number | null {
  const h = hex.replace('#', '');
  if (h.length === 8) return parseInt(h.slice(6, 8), 16);
  return null;
}

function reapplyAlpha(result: string, alpha: number | null): string {
  if (alpha === null) return result;
  const base = normalizeHex(result).slice(0, 7);
  return `${base}${alpha.toString(16).padStart(2, '0')}`;
}

export function opLighten(hex: string, amount: number): string {
  const alpha = extractAlpha(hex);
  const lab = hexToLab(hex);
  if (!lab) throw new Error(`Derivation op 'lighten': invalid source color "${hex}"`);
  const [L, a, b] = lab;
  return reapplyAlpha(labToHex(Math.min(100, L + amount), a, b), alpha);
}

export function opDarken(hex: string, amount: number): string {
  const alpha = extractAlpha(hex);
  const lab = hexToLab(hex);
  if (!lab) throw new Error(`Derivation op 'darken': invalid source color "${hex}"`);
  const [L, a, b] = lab;
  return reapplyAlpha(labToHex(Math.max(0, L - amount), a, b), alpha);
}

export function opAlpha(hex: string, amount: number): string {
  const alpha = Math.round(Math.max(0, Math.min(1, amount)) * 255);
  const result = setHexAlpha(hex, alpha);
  if (!result) throw new Error(`Derivation op 'alpha': invalid source color "${hex}"`);
  return result;
}

export function opMix(hex: string, mixWith: string, ratio: number): string {
  const alphaA = extractAlpha(hex) ?? 255;
  const alphaB = extractAlpha(mixWith) ?? 255;
  const labA = hexToLab(hex);
  const labB = hexToLab(mixWith);
  if (!labA) throw new Error(`Derivation op 'mix': invalid source color "${hex}"`);
  if (!labB) throw new Error(`Derivation op 'mix': invalid mix color "${mixWith}"`);
  const r = Math.max(0, Math.min(1, ratio));
  const L = labA[0] * (1 - r) + labB[0] * r;
  const a = labA[1] * (1 - r) + labB[1] * r;
  const b = labA[2] * (1 - r) + labB[2] * r;
  const mixedAlpha = Math.round(alphaA * (1 - r) + alphaB * r);
  const hasAlpha = extractAlpha(hex) !== null || extractAlpha(mixWith) !== null;
  return reapplyAlpha(labToHex(L, a, b), hasAlpha ? mixedAlpha : null);
}

/**
 * Mirror the source's L* around 50 (`100 - L*`) and optionally scale chroma.
 * Replaces the legacy `darkModeInversion` generator as a per-token op.
 */
export function opInvertLightness(hex: string, chromaBoost = 1): string {
  const alpha = extractAlpha(hex);
  const lab = hexToLab(hex);
  if (!lab) throw new Error(`Derivation op 'invertLightness': invalid source color "${hex}"`);
  const [L, a, b] = lab;
  return reapplyAlpha(labToHex(100 - L, a * chromaBoost, b * chromaBoost), alpha);
}

// ---------------------------------------------------------------------------
// Numeric ops (dimension / number / duration)
// ---------------------------------------------------------------------------

type NumericValue = DimensionValue | DurationValue | number;

function isDimensionLike(v: unknown): v is DimensionValue | DurationValue {
  return (
    typeof v === 'object' && v !== null &&
    'value' in v && 'unit' in v &&
    typeof (v as { value: unknown }).value === 'number' &&
    typeof (v as { unit: unknown }).unit === 'string'
  );
}

export function opScaleBy(value: NumericValue, factor: number): NumericValue {
  if (typeof value === 'number') return value * factor;
  if (isDimensionLike(value)) {
    return { ...value, value: value.value * factor };
  }
  throw new Error(`Derivation op 'scaleBy': unsupported value shape ${JSON.stringify(value)}`);
}

export function opAdd(value: NumericValue, delta: DimensionValue | DurationValue | number): NumericValue {
  if (typeof value === 'number') {
    if (typeof delta !== 'number') {
      throw new Error(`Derivation op 'add': source is a bare number but delta has a unit ("${delta.unit}").`);
    }
    return value + delta;
  }
  if (isDimensionLike(value)) {
    if (typeof delta === 'number') {
      throw new Error(`Derivation op 'add': delta must specify a unit matching the source ("${value.unit}").`);
    }
    if (delta.unit !== value.unit) {
      throw new Error(
        `Derivation op 'add': unit mismatch — source is "${value.unit}", delta is "${delta.unit}". ` +
        `Cross-unit addition is not supported.`,
      );
    }
    return { ...value, value: value.value + delta.value };
  }
  throw new Error(`Derivation op 'add': unsupported value shape ${JSON.stringify(value)}`);
}

// ---------------------------------------------------------------------------
// Param helpers
// ---------------------------------------------------------------------------

/** A `{path}`-style reference used as an op parameter (today: `mix.with`). */
export function isParamReference(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('{') && value.endsWith('}') && value.length > 2;
}

/** Strip the surrounding braces from a `{path}` op-param reference. */
export function paramReferencePath(ref: string): string {
  return ref.slice(1, -1);
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Apply a single op to a resolved value. `resolveRef` returns the resolved
 * value of a `{path}` op-param reference (used today only by `mix.with`).
 */
export function applyDerivationOp(
  value: unknown,
  $type: TokenType,
  op: DerivationOp,
  resolveRef: (refPath: string) => unknown,
): unknown {
  switch (op.kind) {
    case 'alpha':
      assertColor($type, op.kind);
      return opAlpha(value as string, op.amount);
    case 'lighten':
      assertColor($type, op.kind);
      return opLighten(value as string, op.amount);
    case 'darken':
      assertColor($type, op.kind);
      return opDarken(value as string, op.amount);
    case 'mix': {
      assertColor($type, op.kind);
      const withVal = isParamReference(op.with)
        ? resolveRef(paramReferencePath(op.with))
        : op.with;
      if (typeof withVal !== 'string') {
        throw new Error(
          `Derivation op 'mix': param 'with' must resolve to a color string, got ${JSON.stringify(withVal)}.`,
        );
      }
      return opMix(value as string, withVal, op.ratio);
    }
    case 'invertLightness':
      assertColor($type, op.kind);
      return opInvertLightness(value as string, op.chromaBoost ?? 1);
    case 'scaleBy':
      assertNumeric($type, op.kind);
      return opScaleBy(value as NumericValue, op.factor);
    case 'add':
      assertNumeric($type, op.kind);
      return opAdd(value as NumericValue, op.delta);
  }
}

/**
 * Apply an ordered chain of ops. Order matters:
 * `mix(white, 0.4) → alpha(0.5)` ≠ `alpha(0.5) → mix(white, 0.4)`.
 */
export function applyDerivation(
  value: unknown,
  $type: TokenType,
  ops: readonly DerivationOp[],
  resolveRef: (refPath: string) => unknown,
): unknown {
  let current = value;
  for (const op of ops) {
    current = applyDerivationOp(current, $type, op, resolveRef);
  }
  return current;
}

function assertColor(t: TokenType, kind: string): void {
  if (t !== 'color') {
    throw new Error(`Derivation op '${kind}' cannot apply to type '${t}' (expected color).`);
  }
}

function assertNumeric(t: TokenType, kind: string): void {
  if (!NUMERIC_TOKEN_TYPES.has(t)) {
    throw new Error(
      `Derivation op '${kind}' cannot apply to type '${t}' ` +
      `(expected dimension, number, or duration).`,
    );
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate raw op data, returning only well-formed ops. Silently drops
 * malformed entries — callers can re-check structure if they need stricter
 * feedback.
 */
export function validateDerivationOps(raw: unknown): DerivationOp[] {
  if (!Array.isArray(raw)) return [];
  const valid: DerivationOp[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const kind = obj.kind;
    if (kind === 'alpha' || kind === 'lighten' || kind === 'darken') {
      if (typeof obj.amount === 'number' && Number.isFinite(obj.amount)) {
        valid.push({ kind, amount: obj.amount });
      }
    } else if (kind === 'mix') {
      if (
        typeof obj.with === 'string' && obj.with.length > 0 &&
        typeof obj.ratio === 'number' && Number.isFinite(obj.ratio)
      ) {
        valid.push({ kind: 'mix', with: obj.with, ratio: obj.ratio });
      }
    } else if (kind === 'invertLightness') {
      if (typeof obj.chromaBoost === 'number' && Number.isFinite(obj.chromaBoost)) {
        valid.push({ kind: 'invertLightness', chromaBoost: obj.chromaBoost });
      } else {
        valid.push({ kind: 'invertLightness' });
      }
    } else if (kind === 'scaleBy') {
      if (typeof obj.factor === 'number' && Number.isFinite(obj.factor)) {
        valid.push({ kind: 'scaleBy', factor: obj.factor });
      }
    } else if (kind === 'add') {
      const delta = obj.delta;
      if (typeof delta === 'number' && Number.isFinite(delta)) {
        valid.push({ kind: 'add', delta });
      } else if (isDimensionLike(delta) && Number.isFinite(delta.value)) {
        valid.push({ kind: 'add', delta: { value: delta.value, unit: delta.unit } as DimensionValue });
      }
    }
  }
  return valid;
}

/**
 * Extract `{path}` reference targets from any TokenReference-typed op params.
 * Today only `mix.with` accepts a reference; future ref-typed params should be
 * added here so the resolver's dependency graph and cycle detector pick them up.
 */
export function extractDerivationRefPaths(ops: readonly DerivationOp[]): string[] {
  const paths: string[] = [];
  for (const op of ops) {
    if (op.kind === 'mix' && isParamReference(op.with)) {
      paths.push(paramReferencePath(op.with));
    }
  }
  return paths;
}
