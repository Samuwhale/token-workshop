import { describe, it, expect } from 'vitest';
import { applyColorModifiers, validateColorModifiers } from '../color-modifier.js';
import { hexToLab } from '../color-math.js';
import { TokenResolver } from '../resolver.js';

describe('applyColorModifiers', () => {
  describe('lighten', () => {
    it('lightens a dark color', () => {
      const result = applyColorModifiers('#000000', [{ type: 'lighten', amount: 30 }]);
      const lab = hexToLab(result)!;
      expect(lab[0]).toBeGreaterThan(25);
    });

    it('white stays white (clamped at 100)', () => {
      const result = applyColorModifiers('#ffffff', [{ type: 'lighten', amount: 50 }]);
      const lab = hexToLab(result)!;
      expect(lab[0]).toBeCloseTo(100, 0);
    });

    it('excess amount does not overflow (clamped at 100)', () => {
      const result = applyColorModifiers('#888888', [{ type: 'lighten', amount: 9999 }]);
      const lab = hexToLab(result)!;
      // Allow tiny floating-point round-trip error (Lab->hex->Lab)
      expect(lab[0]).toBeCloseTo(100, 0);
    });
  });

  describe('darken', () => {
    it('darkens a light color', () => {
      const result = applyColorModifiers('#ffffff', [{ type: 'darken', amount: 30 }]);
      const lab = hexToLab(result)!;
      expect(lab[0]).toBeLessThan(75);
    });

    it('black stays black (clamped at 0)', () => {
      const result = applyColorModifiers('#000000', [{ type: 'darken', amount: 50 }]);
      const lab = hexToLab(result)!;
      expect(lab[0]).toBeCloseTo(0, 0);
    });
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
        { type: 'mix', color: '#ff0000', ratio: 0.5, amount: 0 },
      ];
      expect(validateColorModifiers(input)).toHaveLength(4);
    });

    it('drops entries missing type', () => {
      expect(validateColorModifiers([{ amount: 20 }])).toEqual([]);
    });

    it('drops entries with unknown type', () => {
      expect(validateColorModifiers([{ type: 'saturate', amount: 20 }])).toEqual([]);
    });

    it('drops entries missing amount', () => {
      expect(validateColorModifiers([{ type: 'lighten' }])).toEqual([]);
    });

    it('drops entries with non-number amount', () => {
      expect(validateColorModifiers([{ type: 'lighten', amount: 'high' }])).toEqual([]);
    });

    it('drops mix entries missing color or ratio', () => {
      expect(validateColorModifiers([{ type: 'mix', amount: 0 }])).toEqual([]);
      expect(validateColorModifiers([{ type: 'mix', color: '#fff', amount: 0 }])).toEqual([]);
    });

    it('drops non-object entries', () => {
      expect(validateColorModifiers([null, 42, 'lighten', undefined])).toEqual([]);
    });

    it('drops NaN and Infinity amounts', () => {
      expect(validateColorModifiers([{ type: 'lighten', amount: NaN }])).toEqual([]);
      expect(validateColorModifiers([{ type: 'lighten', amount: Infinity }])).toEqual([]);
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
