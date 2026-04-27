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

export interface DerivationOpsValidationResult {
  ops: DerivationOp[];
  errors: string[];
}

const HEX_LITERAL_RE = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return isFiniteNumber(value) && value >= min && value <= max;
}

function isValidMixTarget(value: string): boolean {
  return isParamReference(value) || HEX_LITERAL_RE.test(value);
}

function formatOpPath(index: number, field?: string): string {
  return field ? `derivation.ops[${index}].${field}` : `derivation.ops[${index}]`;
}

/**
 * Parse raw op data without dropping malformed entries. Callers that collect
 * validation errors can use the result directly; resolver paths should call
 * `validateDerivationOps` to fail fast.
 */
export function parseDerivationOps(raw: unknown): DerivationOpsValidationResult {
  if (raw === undefined) {
    return { ops: [], errors: [] };
  }
  if (!Array.isArray(raw)) {
    return { ops: [], errors: ['derivation.ops must be an array'] };
  }

  const ops: DerivationOp[] = [];
  const errors: string[] = [];
  raw.forEach((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      errors.push(`${formatOpPath(index)} must be an object`);
      return;
    }

    const obj = item as Record<string, unknown>;
    const kind = obj.kind;
    if (kind === 'alpha') {
      if (!isNumberInRange(obj.amount, 0, 1)) {
        errors.push(`${formatOpPath(index, 'amount')} must be a number from 0 to 1`);
        return;
      }
      ops.push({ kind, amount: obj.amount });
      return;
    }
    if (kind === 'lighten' || kind === 'darken') {
      if (!isNumberInRange(obj.amount, 0, 100)) {
        errors.push(`${formatOpPath(index, 'amount')} must be a number from 0 to 100`);
        return;
      }
      ops.push({ kind, amount: obj.amount });
      return;
    }
    if (kind === 'mix') {
      if (typeof obj.with !== 'string' || obj.with.length === 0 || !isValidMixTarget(obj.with)) {
        errors.push(`${formatOpPath(index, 'with')} must be a hex color or token reference`);
      }
      if (!isNumberInRange(obj.ratio, 0, 1)) {
        errors.push(`${formatOpPath(index, 'ratio')} must be a number from 0 to 1`);
      }
      if (
        typeof obj.with === 'string' &&
        obj.with.length > 0 &&
        isValidMixTarget(obj.with) &&
        isNumberInRange(obj.ratio, 0, 1)
      ) {
        ops.push({ kind: 'mix', with: obj.with, ratio: obj.ratio });
      }
      return;
    }
    if (kind === 'invertLightness') {
      if (obj.chromaBoost !== undefined && !isFiniteNumber(obj.chromaBoost)) {
        errors.push(`${formatOpPath(index, 'chromaBoost')} must be a finite number`);
        return;
      }
      ops.push(
        obj.chromaBoost === undefined
          ? { kind: 'invertLightness' }
          : { kind: 'invertLightness', chromaBoost: obj.chromaBoost },
      );
      return;
    }
    if (kind === 'scaleBy') {
      if (!isFiniteNumber(obj.factor)) {
        errors.push(`${formatOpPath(index, 'factor')} must be a finite number`);
        return;
      }
      ops.push({ kind: 'scaleBy', factor: obj.factor });
      return;
    }
    if (kind === 'add') {
      const delta = obj.delta;
      if (isFiniteNumber(delta)) {
        ops.push({ kind: 'add', delta });
        return;
      }
      if (isDimensionLike(delta) && Number.isFinite(delta.value)) {
        ops.push({ kind: 'add', delta: { value: delta.value, unit: delta.unit } as DimensionValue });
        return;
      }
      errors.push(`${formatOpPath(index, 'delta')} must be a finite number or { value, unit } object`);
      return;
    }

    errors.push(`${formatOpPath(index, 'kind')} must be a supported derivation op`);
  });

  return { ops, errors };
}

export function validateDerivationOps(raw: unknown): DerivationOp[] {
  const result = parseDerivationOps(raw);
  if (result.errors.length > 0) {
    throw new Error(result.errors.join('; '));
  }
  return result.ops;
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
