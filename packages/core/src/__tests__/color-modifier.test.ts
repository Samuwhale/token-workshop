import { describe, it, expect } from 'vitest';
import { applyColorModifiers, validateColorModifiers } from '../color-modifier.js';
import { hexToLab } from '../color-math.js';
import { TokenResolver } from '../resolver.js';

describe('applyColorModifiers', () => {
  it.each([
    ['lightens a dark color', '#000000', 'lighten', 30, (l: number) => l > 25],
    ['white stays white (clamped)', '#ffffff', 'lighten', 50, (l: number) => Math.abs(l - 100) < 1],
    ['excess lighten clamps at 100', '#888888', 'lighten', 9999, (l: number) => Math.abs(l - 100) < 1],
    ['darkens a light color', '#ffffff', 'darken', 30, (l: number) => l < 75],
    ['black stays black (clamped)', '#000000', 'darken', 50, (l: number) => Math.abs(l) < 1],
  ] as const)('%s', (_label, input, type, amount, check) => {
    const result = applyColorModifiers(input, [{ type: type as 'lighten' | 'darken', amount }]);
    const lab = hexToLab(result)!;
    expect(check(lab[0])).toBe(true);
  });

  describe('alpha', () => {
    it('produces an 8-character hex string', () => {
      const result = applyColorModifiers('#ff0000', [{ type: 'alpha', amount: 0.5 }]);
      expect(result).toMatch(/^#[0-9a-f]{8}$/i);
    });

    it('alpha=1 produces ff alpha bytes', () => {
      const result = applyColorModifiers('#ff0000', [{ type: 'alpha', amount: 1 }]);
      expect(result.toLowerCase()).toBe('#ff0000ff');
    });

    it('alpha=0 produces 00 alpha bytes', () => {
      const result = applyColorModifiers('#ff0000', [{ type: 'alpha', amount: 0 }]);
      expect(result.toLowerCase()).toBe('#ff000000');
    });

    it('clamps alpha above 1', () => {
      const result = applyColorModifiers('#ff0000', [{ type: 'alpha', amount: 2 }]);
      expect(result.toLowerCase()).toBe('#ff0000ff');
    });

    it('clamps alpha below 0', () => {
      const result = applyColorModifiers('#ff0000', [{ type: 'alpha', amount: -1 }]);
      expect(result.toLowerCase()).toBe('#ff000000');
    });
  });

  describe('mix', () => {
    it('50/50 mix of black and white is a mid-gray', () => {
      const result = applyColorModifiers('#000000', [{ type: 'mix', color: '#ffffff', ratio: 0.5 }]);
      const lab = hexToLab(result)!;
      // L* should be around 50
      expect(lab[0]).toBeGreaterThan(40);
      expect(lab[0]).toBeLessThan(60);
    });

    it('ratio=0 returns original color unchanged', () => {
      const result = applyColorModifiers('#ff0000', [{ type: 'mix', color: '#0000ff', ratio: 0 }]);
      expect(result.toLowerCase()).toBe('#ff0000');
    });

    it('ratio=1 returns the mix color', () => {
      const result = applyColorModifiers('#ff0000', [{ type: 'mix', color: '#0000ff', ratio: 1 }]);
      expect(result.toLowerCase()).toBe('#0000ff');
    });

    it('preserves alpha from source when mixing with opaque color', () => {
      // Source has 50% alpha (0x80 = 128 ≈ 0.502)
      const result = applyColorModifiers('#ff000080', [{ type: 'mix', color: '#ffffff', ratio: 0.5 }]);
      expect(result).toHaveLength(9);
      // alpha of source is 0x80=128, mix color is opaque (255), ratio=0.5 → mixed ~191 (0xbf)
      const alphaByte = parseInt(result.slice(7), 16);
      expect(alphaByte).toBeCloseTo(191, -1);
    });

    it('two opaque colors produce no alpha channel', () => {
      const result = applyColorModifiers('#ff0000', [{ type: 'mix', color: '#0000ff', ratio: 0.5 }]);
      expect(result).toHaveLength(7);
    });
  });

  describe('chaining', () => {
    it('applies modifiers in order', () => {
      // lighten first, then apply alpha
      const result = applyColorModifiers('#000000', [
        { type: 'lighten', amount: 50 },
        { type: 'alpha', amount: 0.5 },
      ]);
      // Should be lightened (non-black) AND have alpha
      expect(result).toHaveLength(9); // #rrggbbaa
      const lab = hexToLab(result)!;
      expect(lab[0]).toBeGreaterThan(25);
    });

    it('handles an empty modifier list', () => {
      const result = applyColorModifiers('#ff0000', []);
      expect(result).toBe('#ff0000');
    });
  });

  describe('validateColorModifiers', () => {
    it('returns valid ops unchanged', () => {
      const input = [
        { type: 'lighten', amount: 20 },
        { type: 'darken', amount: 10 },
        { type: 'alpha', amount: 0.5 },
        { type: 'mix', color: '#ff0000', ratio: 0.5 },
      ];
      expect(validateColorModifiers(input)).toHaveLength(4);
    });

    it.each([
      ['missing type', [{ amount: 20 }]],
      ['unknown type', [{ type: 'saturate', amount: 20 }]],
      ['missing amount', [{ type: 'lighten' }]],
      ['non-number amount', [{ type: 'lighten', amount: 'high' }]],
      ['NaN amount', [{ type: 'lighten', amount: NaN }]],
      ['Infinity amount', [{ type: 'lighten', amount: Infinity }]],
      ['mix missing color and ratio', [{ type: 'mix' }]],
      ['mix missing ratio', [{ type: 'mix', color: '#fff' }]],
      ['mix missing color', [{ type: 'mix', ratio: 0.5 }]],
      ['non-object entries', [null, 42, 'lighten', undefined]],
    ] as const)('drops invalid: %s', (_label, input) => {
      expect(validateColorModifiers(input as any)).toEqual([]);
    });

    it('accepts mix without amount field', () => {
      const result = validateColorModifiers([{ type: 'mix', color: '#ffffff', ratio: 0.5 }]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: 'mix', color: '#ffffff', ratio: 0.5 });
    });

    it('keeps valid entries and drops invalid in mixed array', () => {
      const result = validateColorModifiers([
        { type: 'lighten', amount: 20 },
        { type: 'bogus' },
        { type: 'darken', amount: 10 },
      ]);
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('lighten');
      expect(result[1].type).toBe('darken');
    });
  });

  describe('resolver integration', () => {
    it('applies color modifiers through the resolver', () => {
      const tokens = {
        'color.base': { $value: '#000000', $type: 'color' },
        'color.lighter': {
          $value: '{color.base}',
          $type: 'color',
          $extensions: {
            tokenmanager: {
              colorModifier: [{ type: 'lighten', amount: 50 }],
            },
          },
        },
      };

      const resolver = new TokenResolver(tokens);
      const result = resolver.resolve('color.lighter');
      const lab = hexToLab(result.$value)!;
      expect(lab[0]).toBeGreaterThan(25);
    });
    it('silently ignores malformed color modifiers', () => {
      const tokens = {
        'color.base': { $value: '#ff0000', $type: 'color' },
        'color.bad': {
          $value: '{color.base}',
          $type: 'color',
          $extensions: {
            tokenmanager: {
              colorModifier: [{ oops: true }, null, { type: 'lighten' }],
            },
          },
        },
      };

      const resolver = new TokenResolver(tokens);
      const result = resolver.resolve('color.bad');
      // All modifiers are invalid so the original resolved value is returned unchanged
      expect(result.$value.toLowerCase()).toBe('#ff0000');
    });
  });
});
