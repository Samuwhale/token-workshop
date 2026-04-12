import { describe, it, expect } from 'vitest';
import { validateDTCGValue, resolveTokens } from '../dtcg-resolver.js';
import type { ResolverFile } from '../types.js';

// ---------------------------------------------------------------------------
// validateDTCGValue unit tests
// ---------------------------------------------------------------------------

describe('validateDTCGValue', () => {
  describe('edge cases', () => {
    it.each([
      ['null', null, undefined, /null/],
      ['undefined', undefined, undefined, /undefined/],
      ['NaN', NaN, undefined, /NaN/],
      ['Infinity', Infinity, undefined, /non-finite/],
      ['-Infinity', -Infinity, undefined, /non-finite/],
    ] as const)('rejects %s', (_label, value, type, pattern) => {
      expect(validateDTCGValue(value, type, 'a.b')).toMatch(pattern);
    });

    it('accepts a valid finite number', () => {
      expect(validateDTCGValue(42, undefined, 'a.b')).toBeNull();
    });

    it('rejects circular objects', () => {
      const circ: Record<string, unknown> = {};
      circ.self = circ;
      expect(validateDTCGValue(circ, undefined, 'a.b')).toMatch(/circular/);
    });

    it('rejects deeply nested circular objects', () => {
      const a: Record<string, unknown> = {};
      const b: Record<string, unknown> = { parent: a };
      a.child = b;
      expect(validateDTCGValue(a, undefined, 'a.b')).toMatch(/circular/);
    });

    it('accepts objects with DAG sharing (non-circular)', () => {
      const shared = { x: 1 };
      const val = { a: shared, b: shared };
      expect(validateDTCGValue(val, undefined, 'a.b')).toBeNull();
    });
  });

  describe('accepts valid values', () => {
    it.each([
      ['color: hex string', '#ff0000', 'color'],
      ['color: alias reference', '{base.red}', 'color'],
      ['number: numeric', 42, 'number'],
      ['number: string (alias)', '42', 'number'],
      ['boolean: true', true, 'boolean'],
      ['boolean: false', false, 'boolean'],
      ['cubicBezier: 4-element array', [0.25, 0.1, 0.25, 1], 'cubicBezier'],
      ['dimension: {value, unit}', { value: 16, unit: 'px' }, 'dimension'],
      ['dimension: CSS string', '16px', 'dimension'],
      ['gradient: array of stops', [{ color: '#ff0000', position: 0 }, { color: '#0000ff', position: 1 }], 'gradient'],
      ['typography: object', { fontFamily: 'Inter', fontSize: { value: 16, unit: 'px' }, fontWeight: 400, lineHeight: 1.5, letterSpacing: { value: 0, unit: 'px' } }, 'typography'],
      ['typography: alias', '{base.type}', 'typography'],
      ['unknown type: any value', { anything: true }, 'customType'],
      ['undefined type: any value', [1, 2, 3], undefined],
    ] as const)('%s', (_label, value, type) => {
      expect(validateDTCGValue(value, type as string | undefined, 'x.y')).toBeNull();
    });
  });

  describe('rejects invalid typed values', () => {
    it.each([
      ['color: number', 16711680, 'color'],
      ['color: object', { r: 255, g: 0, b: 0 }, 'color'],
      ['number: boolean', true, 'number'],
      ['boolean: number', 1, 'boolean'],
      ['boolean: string', 'true', 'boolean'],
      ['cubicBezier: wrong length', [0, 1, 2], 'cubicBezier'],
      ['cubicBezier: non-number elements', [0, 'a', 1, 1], 'cubicBezier'],
      ['cubicBezier: NaN elements', [0, NaN, 1, 1], 'cubicBezier'],
      ['dimension: non-finite value', { value: NaN, unit: 'px' }, 'dimension'],
      ['dimension: missing unit', { value: 16 }, 'dimension'],
      ['gradient: non-array', {}, 'gradient'],
      ['typography: plain string', 'Inter', 'typography'],
    ] as const)('%s', (_label, value, type) => {
      expect(validateDTCGValue(value, type, 'x.y')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Integration test: malformed values in resolveTokens produce diagnostics
// ---------------------------------------------------------------------------

describe('resolveTokens malformed value handling', () => {
  const baseFile: ResolverFile = {
    version: '2025.10',
    resolutionOrder: [{ $ref: '#/sets/base' }],
    sets: {
      base: { sources: [] },
    },
  };

  async function resolveInline(
    tokens: Record<string, unknown>,
  ) {
    const file: ResolverFile = {
      ...baseFile,
      sets: {
        base: {
          sources: [tokens as never],
        },
      },
    };
    return resolveTokens(file, {}, async () => ({} as never));
  }

  it('skips a token with null value and emits a warning', async () => {
    const { tokens, diagnostics } = await resolveInline({
      bad: { $value: null, $type: 'color' },
      good: { $value: '#ff0000', $type: 'color' },
    });
    expect(tokens['bad']).toBeUndefined();
    expect(tokens['good']?.$value).toBe('#ff0000');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('warning');
    expect(diagnostics[0].message).toMatch(/bad/);
  });

  it('skips a token with NaN value and emits a warning', async () => {
    const { tokens, diagnostics } = await resolveInline({
      spacing: { $value: NaN, $type: 'number' },
    });
    expect(tokens['spacing']).toBeUndefined();
    expect(diagnostics[0].message).toMatch(/NaN/);
  });

  it('skips a token with a circular structure and emits a warning', async () => {
    const circ: Record<string, unknown> = {};
    circ.self = circ;
    const { tokens, diagnostics } = await resolveInline({
      loop: { $value: circ },
    });
    expect(tokens['loop']).toBeUndefined();
    expect(diagnostics[0].message).toMatch(/circular/);
  });

  it('skips a token with wrong type shape and emits a warning', async () => {
    const { tokens, diagnostics } = await resolveInline({
      oops: { $value: 42, $type: 'color' },
    });
    expect(tokens['oops']).toBeUndefined();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe('warning');
  });

  it('passes through valid tokens unchanged', async () => {
    const { tokens, diagnostics } = await resolveInline({
      colors: {
        red: { $value: '#ff0000', $type: 'color' },
        scale: { $value: 1.5, $type: 'number' },
      },
    });
    expect(tokens['colors.red']?.$value).toBe('#ff0000');
    expect(tokens['colors.scale']?.$value).toBe(1.5);
    expect(diagnostics).toHaveLength(0);
  });
});
