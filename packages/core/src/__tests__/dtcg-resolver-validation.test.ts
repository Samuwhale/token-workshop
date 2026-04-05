import { describe, it, expect } from 'vitest';
import { validateDTCGValue, resolveTokens } from '../dtcg-resolver.js';
import type { ResolverFile } from '../types.js';

// ---------------------------------------------------------------------------
// validateDTCGValue unit tests
// ---------------------------------------------------------------------------

describe('validateDTCGValue', () => {
  describe('null / undefined', () => {
    it('rejects null', () => {
      expect(validateDTCGValue(null, undefined, 'a.b')).toMatch(/null/);
    });

    it('rejects undefined', () => {
      expect(validateDTCGValue(undefined, undefined, 'a.b')).toMatch(/undefined/);
    });
  });

  describe('NaN / Infinity', () => {
    it('rejects NaN', () => {
      expect(validateDTCGValue(NaN, undefined, 'a.b')).toMatch(/NaN/);
    });

    it('rejects Infinity', () => {
      expect(validateDTCGValue(Infinity, undefined, 'a.b')).toMatch(/non-finite/);
    });

    it('rejects -Infinity', () => {
      expect(validateDTCGValue(-Infinity, undefined, 'a.b')).toMatch(/non-finite/);
    });

    it('accepts a valid finite number', () => {
      expect(validateDTCGValue(42, undefined, 'a.b')).toBeNull();
    });
  });

  describe('circular references', () => {
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

  describe('type: color', () => {
    it('accepts a hex string', () => {
      expect(validateDTCGValue('#ff0000', 'color', 'c.red')).toBeNull();
    });

    it('accepts an alias reference', () => {
      expect(validateDTCGValue('{base.red}', 'color', 'c.red')).toBeNull();
    });

    it('rejects a number', () => {
      expect(validateDTCGValue(16711680, 'color', 'c.red')).toMatch(/"color"/);
    });

    it('rejects an object', () => {
      expect(validateDTCGValue({ r: 255, g: 0, b: 0 }, 'color', 'c.red')).toMatch(/"color"/);
    });
  });

  describe('type: number', () => {
    it('accepts a number', () => {
      expect(validateDTCGValue(42, 'number', 'n.x')).toBeNull();
    });

    it('accepts a string (could be alias)', () => {
      expect(validateDTCGValue('42', 'number', 'n.x')).toBeNull();
    });

    it('rejects a boolean', () => {
      expect(validateDTCGValue(true, 'number', 'n.x')).toMatch(/"number"/);
    });
  });

  describe('type: boolean', () => {
    it('accepts true / false', () => {
      expect(validateDTCGValue(true, 'boolean', 'f.flag')).toBeNull();
      expect(validateDTCGValue(false, 'boolean', 'f.flag')).toBeNull();
    });

    it('rejects a number', () => {
      expect(validateDTCGValue(1, 'boolean', 'f.flag')).toMatch(/"boolean"/);
    });

    it('rejects a string', () => {
      expect(validateDTCGValue('true', 'boolean', 'f.flag')).toMatch(/"boolean"/);
    });
  });

  describe('type: cubicBezier', () => {
    it('accepts a 4-element number array', () => {
      expect(validateDTCGValue([0.25, 0.1, 0.25, 1], 'cubicBezier', 'e.ease')).toBeNull();
    });

    it('rejects wrong length', () => {
      expect(validateDTCGValue([0, 1, 2], 'cubicBezier', 'e.ease')).toMatch(/cubicBezier/);
    });

    it('rejects non-number elements', () => {
      expect(validateDTCGValue([0, 'a', 1, 1], 'cubicBezier', 'e.ease')).toMatch(/cubicBezier/);
    });

    it('rejects NaN elements', () => {
      expect(validateDTCGValue([0, NaN, 1, 1], 'cubicBezier', 'e.ease')).toMatch(/cubicBezier/);
    });
  });

  describe('type: dimension', () => {
    it('accepts {value, unit} object', () => {
      expect(validateDTCGValue({ value: 16, unit: 'px' }, 'dimension', 'd.x')).toBeNull();
    });

    it('accepts a string (CSS shorthand or alias)', () => {
      expect(validateDTCGValue('16px', 'dimension', 'd.x')).toBeNull();
    });

    it('rejects non-finite value', () => {
      expect(validateDTCGValue({ value: NaN, unit: 'px' }, 'dimension', 'd.x')).toMatch(/finite/);
    });

    it('rejects missing unit', () => {
      expect(validateDTCGValue({ value: 16 }, 'dimension', 'd.x')).toMatch(/unit/);
    });

    it('rejects null', () => {
      expect(validateDTCGValue(null, 'dimension', 'd.x')).toBeTruthy();
    });
  });

  describe('type: gradient', () => {
    it('accepts an array of stops', () => {
      expect(validateDTCGValue(
        [{ color: '#ff0000', position: 0 }, { color: '#0000ff', position: 1 }],
        'gradient', 'g.x',
      )).toBeNull();
    });

    it('rejects a non-array', () => {
      expect(validateDTCGValue({}, 'gradient', 'g.x')).toMatch(/gradient/);
    });
  });

  describe('type: typography', () => {
    it('accepts an object', () => {
      expect(validateDTCGValue(
        { fontFamily: 'Inter', fontSize: { value: 16, unit: 'px' }, fontWeight: 400, lineHeight: 1.5, letterSpacing: { value: 0, unit: 'px' } },
        'typography', 't.body',
      )).toBeNull();
    });

    it('rejects a string (unless alias)', () => {
      expect(validateDTCGValue('Inter', 'typography', 't.body')).toMatch(/typography/);
    });

    it('accepts an alias reference', () => {
      expect(validateDTCGValue('{base.type}', 'typography', 't.body')).toBeNull();
    });
  });

  describe('unknown types', () => {
    it('accepts any value when type is not in TOKEN_TYPE_VALUES', () => {
      expect(validateDTCGValue({ anything: true }, 'customType', 'x.y')).toBeNull();
    });

    it('accepts any value when type is undefined', () => {
      expect(validateDTCGValue([1, 2, 3], undefined, 'x.y')).toBeNull();
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
