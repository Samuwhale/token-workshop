import { describe, it, expect } from 'vitest';
import { TokenValidator, type ValidationResult } from '../validator.js';
import type { Token, TokenGroup } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToken(value: Token['$value'], type?: Token['$type']): Token {
  return { $value: value, ...(type ? { $type: type } : {}) };
}

function expectValid(result: ValidationResult): void {
  expect(result.valid).toBe(true);
  expect(result.errors).toHaveLength(0);
}

function expectInvalid(result: ValidationResult, partialMessage?: string): void {
  expect(result.valid).toBe(false);
  expect(result.errors.length).toBeGreaterThan(0);
  if (partialMessage) {
    expect(result.errors.some((e) => e.includes(partialMessage))).toBe(true);
  }
}

const validator = new TokenValidator();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TokenValidator', () => {
  describe('color', () => {
    it('accepts valid hex colors', () => {
      expectValid(validator.validate(makeToken('#fff', 'color'), 'c'));
      expectValid(validator.validate(makeToken('#FF00FF', 'color'), 'c'));
      expectValid(validator.validate(makeToken('#ff00ff80', 'color'), 'c'));
    });

    it('accepts CSS color function strings', () => {
      expectValid(validator.validate(makeToken('rgb(255, 0, 0)', 'color'), 'c'));
      expectValid(validator.validate(makeToken('hsl(120, 100%, 50%)', 'color'), 'c'));
      expectValid(validator.validate(makeToken('oklch(0.7 0.15 180)', 'color'), 'c'));
    });

    it('accepts named colors', () => {
      expectValid(validator.validate(makeToken('red', 'color'), 'c'));
      expectValid(validator.validate(makeToken('transparent', 'color'), 'c'));
      expectValid(validator.validate(makeToken('rebeccapurple', 'color'), 'c'));
    });

    it('rejects invalid color values', () => {
      expectInvalid(validator.validate(makeToken('#xyz', 'color'), 'c'), 'invalid color');
      expectInvalid(validator.validate(makeToken(42, 'color'), 'c'), 'invalid color');
      expectInvalid(validator.validate(makeToken('notacolor', 'color'), 'c'), 'invalid color');
      expectInvalid(validator.validate(makeToken('#12345', 'color'), 'c'), 'invalid color');
    });
  });

  describe('dimension', () => {
    it('accepts valid dimensions', () => {
      expectValid(validator.validate(makeToken({ value: 16, unit: 'px' }, 'dimension'), 'd'));
      expectValid(validator.validate(makeToken({ value: 1.5, unit: 'rem' }, 'dimension'), 'd'));
    });

    it('rejects invalid dimensions', () => {
      expectInvalid(validator.validate(makeToken('16px', 'dimension'), 'd'), 'dimension');
      expectInvalid(validator.validate(makeToken(16, 'dimension'), 'd'), 'dimension');
      expectInvalid(validator.validate(makeToken({ value: 'abc', unit: 'px' }, 'dimension'), 'd'), 'dimension');
    });
  });

  describe('fontFamily', () => {
    it('accepts string or string array', () => {
      expectValid(validator.validate(makeToken('Inter', 'fontFamily'), 'f'));
      expectValid(validator.validate(makeToken(['Inter', 'sans-serif'], 'fontFamily'), 'f'));
    });

    it('rejects non-string values', () => {
      expectInvalid(validator.validate(makeToken(42, 'fontFamily'), 'f'));
      expectInvalid(validator.validate(makeToken([42], 'fontFamily'), 'f'));
    });
  });

  describe('fontWeight', () => {
    it('accepts valid numeric weights', () => {
      expectValid(validator.validate(makeToken(400, 'fontWeight'), 'fw'));
      expectValid(validator.validate(makeToken(1, 'fontWeight'), 'fw'));
      expectValid(validator.validate(makeToken(999, 'fontWeight'), 'fw'));
    });

    it('accepts named weights', () => {
      expectValid(validator.validate(makeToken('bold', 'fontWeight'), 'fw'));
      expectValid(validator.validate(makeToken('thin', 'fontWeight'), 'fw'));
      expectValid(validator.validate(makeToken('semibold', 'fontWeight'), 'fw'));
    });

    it('rejects out-of-range numeric weights', () => {
      expectInvalid(validator.validate(makeToken(0, 'fontWeight'), 'fw'), 'between 1 and 999');
      expectInvalid(validator.validate(makeToken(1000, 'fontWeight'), 'fw'), 'between 1 and 999');
    });

    it('rejects unknown named weights', () => {
      expectInvalid(validator.validate(makeToken('superduper', 'fontWeight'), 'fw'), 'unknown fontWeight');
    });
  });

  describe('duration', () => {
    it('accepts valid durations', () => {
      expectValid(validator.validate(makeToken({ value: 200, unit: 'ms' }, 'duration'), 'dur'));
      expectValid(validator.validate(makeToken({ value: 0.3, unit: 's' }, 'duration'), 'dur'));
    });

    it('rejects invalid durations', () => {
      expectInvalid(validator.validate(makeToken({ value: 200, unit: 'px' }, 'duration'), 'dur'), 'duration');
      expectInvalid(validator.validate(makeToken(200, 'duration'), 'dur'), 'duration');
    });
  });

  describe('cubicBezier', () => {
    it('accepts valid cubic bezier values', () => {
      expectValid(validator.validate(makeToken([0.25, 0.1, 0.25, 1], 'cubicBezier'), 'cb'));
      expectValid(validator.validate(makeToken([0, 0, 1, 1], 'cubicBezier'), 'cb'));
    });

    it('rejects arrays with wrong length', () => {
      expectInvalid(validator.validate(makeToken([0, 0, 1], 'cubicBezier'), 'cb'), 'exactly 4');
      expectInvalid(validator.validate(makeToken([0, 0, 1, 1, 0], 'cubicBezier'), 'cb'), 'exactly 4');
    });

    it('rejects non-numeric values', () => {
      expectInvalid(validator.validate(makeToken([0, 'a', 1, 1], 'cubicBezier'), 'cb'), 'must be numbers');
    });

    it('rejects x values outside 0-1', () => {
      expectInvalid(validator.validate(makeToken([-0.1, 0, 1, 1], 'cubicBezier'), 'cb'), 'x1 must be between 0 and 1');
      expectInvalid(validator.validate(makeToken([0, 0, 1.5, 1], 'cubicBezier'), 'cb'), 'x2 must be between 0 and 1');
    });

    it('allows y values outside 0-1 (y can overshoot)', () => {
      expectValid(validator.validate(makeToken([0.5, -1, 0.5, 2], 'cubicBezier'), 'cb'));
    });
  });

  describe('number', () => {
    it('accepts numbers', () => {
      expectValid(validator.validate(makeToken(0, 'number'), 'n'));
      expectValid(validator.validate(makeToken(3.14, 'number'), 'n'));
    });

    it('rejects non-numbers', () => {
      expectInvalid(validator.validate(makeToken('42', 'number'), 'n'), 'expected number');
    });
  });

  describe('typography (composite)', () => {
    const validTypography = {
      fontFamily: 'Inter',
      fontSize: { value: 16, unit: 'px' },
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: { value: 0, unit: 'px' },
    };

    it('accepts valid typography', () => {
      expectValid(validator.validate(makeToken(validTypography, 'typography'), 'typo'));
    });

    it('rejects typography missing required fields', () => {
      const { fontFamily: _fontFamily, ...missing } = validTypography;
      expectInvalid(
        validator.validate(makeToken(missing, 'typography'), 'typo'),
        'missing required field "fontFamily"',
      );
    });

    it('rejects typography with invalid fontSize', () => {
      expectInvalid(
        validator.validate(
          makeToken({ ...validTypography, fontSize: '16px' }, 'typography'),
          'typo',
        ),
        'fontSize',
      );
    });
  });

  describe('shadow (composite)', () => {
    const validShadow = {
      color: '#00000033',
      offsetX: { value: 0, unit: 'px' },
      offsetY: { value: 4, unit: 'px' },
      blur: { value: 8, unit: 'px' },
      spread: { value: 0, unit: 'px' },
    };

    it('accepts valid shadow', () => {
      expectValid(validator.validate(makeToken(validShadow, 'shadow'), 's'));
    });

    it('accepts shadow with optional type field', () => {
      expectValid(
        validator.validate(makeToken({ ...validShadow, type: 'innerShadow' }, 'shadow'), 's'),
      );
    });

    it('rejects shadow missing required fields', () => {
      const { blur: _blur, ...missing } = validShadow;
      expectInvalid(
        validator.validate(makeToken(missing, 'shadow'), 's'),
        'missing required field "blur"',
      );
    });

    it('rejects shadow with invalid color', () => {
      expectInvalid(
        validator.validate(makeToken({ ...validShadow, color: 123 }, 'shadow'), 's'),
        'invalid color',
      );
    });

    it('rejects shadow with invalid type', () => {
      expectInvalid(
        validator.validate(makeToken({ ...validShadow, type: 'wrong' }, 'shadow'), 's'),
        'dropShadow',
      );
    });
  });

  describe('border (composite)', () => {
    it('accepts valid border', () => {
      expectValid(
        validator.validate(
          makeToken({ color: '#000', width: { value: 1, unit: 'px' }, style: 'solid' }, 'border'),
          'b',
        ),
      );
    });

    it('rejects border missing fields', () => {
      expectInvalid(
        validator.validate(makeToken({ color: '#000' }, 'border'), 'b'),
        'missing required field',
      );
    });
  });

  describe('transition (composite)', () => {
    const validTransition = {
      duration: { value: 200, unit: 'ms' },
      delay: { value: 0, unit: 'ms' },
      timingFunction: [0.25, 0.1, 0.25, 1],
    };

    it('accepts valid transition', () => {
      expectValid(validator.validate(makeToken(validTransition, 'transition'), 't'));
    });

    it('rejects transition missing fields', () => {
      expectInvalid(
        validator.validate(makeToken({ duration: { value: 200, unit: 'ms' } }, 'transition'), 't'),
        'missing required field',
      );
    });
  });

  describe('gradient', () => {
    it('accepts valid gradient', () => {
      expectValid(
        validator.validate(
          makeToken(
            [
              { color: '#ff0000', position: 0 },
              { color: '#0000ff', position: 1 },
            ],
            'gradient',
          ),
          'g',
        ),
      );
    });

    it('rejects non-array gradient', () => {
      expectInvalid(validator.validate(makeToken('red', 'gradient'), 'g'), 'array');
    });

    it('rejects gradient stops without color', () => {
      expectInvalid(
        validator.validate(makeToken([{ position: 0 }], 'gradient'), 'g'),
        'missing "color"',
      );
    });
  });

  describe('strokeStyle', () => {
    it('accepts keyword strings', () => {
      expectValid(validator.validate(makeToken('solid', 'strokeStyle'), 'ss'));
      expectValid(validator.validate(makeToken('dashed', 'strokeStyle'), 'ss'));
    });

    it('accepts object form', () => {
      expectValid(
        validator.validate(
          makeToken(
            { dashArray: [{ value: 2, unit: 'px' }], lineCap: 'round' },
            'strokeStyle',
          ),
          'ss',
        ),
      );
    });

    it('rejects unknown keywords', () => {
      expectInvalid(validator.validate(makeToken('zigzag', 'strokeStyle'), 'ss'), 'unknown strokeStyle');
    });

    it('rejects object form with invalid lineCap', () => {
      expectInvalid(
        validator.validate(
          makeToken({ dashArray: [{ value: 2, unit: 'px' }], lineCap: 'flat' }, 'strokeStyle'),
          'ss',
        ),
        'lineCap',
      );
    });

    it('rejects object form missing dashArray', () => {
      expectInvalid(
        validator.validate(makeToken({ lineCap: 'round' }, 'strokeStyle'), 'ss'),
        'dashArray',
      );
    });
  });

  describe('lineHeight / letterSpacing / fontStyle / textDecoration / textTransform', () => {
    it('accepts lineHeight as number', () => {
      expectValid(validator.validate(makeToken(1.5, 'lineHeight'), 'lh'));
    });

    it('accepts lineHeight as dimension', () => {
      expectValid(validator.validate(makeToken({ value: 24, unit: 'px' }, 'lineHeight'), 'lh'));
    });

    it('rejects lineHeight as string', () => {
      expectInvalid(validator.validate(makeToken('1.5', 'lineHeight'), 'lh'), 'lineHeight');
    });

    it('accepts letterSpacing as dimension', () => {
      expectValid(validator.validate(makeToken({ value: 0.5, unit: 'px' }, 'letterSpacing'), 'ls'));
    });

    it('rejects letterSpacing as bare number', () => {
      expectInvalid(validator.validate(makeToken(0.5, 'letterSpacing'), 'ls'), 'dimension');
    });

    it('accepts fontStyle as string', () => {
      expectValid(validator.validate(makeToken('italic', 'fontStyle'), 'fs'));
    });

    it('rejects fontStyle as non-string', () => {
      expectInvalid(validator.validate(makeToken(1, 'fontStyle'), 'fs'), 'fontStyle');
    });

    it('accepts textDecoration as string', () => {
      expectValid(validator.validate(makeToken('underline', 'textDecoration'), 'td'));
    });

    it('rejects textDecoration as non-string', () => {
      expectInvalid(validator.validate(makeToken(true, 'textDecoration'), 'td'), 'textDecoration');
    });

    it('accepts textTransform as string', () => {
      expectValid(validator.validate(makeToken('uppercase', 'textTransform'), 'tt'));
    });

    it('rejects textTransform as non-string', () => {
      expectInvalid(validator.validate(makeToken(42, 'textTransform'), 'tt'), 'textTransform');
    });
  });

  describe('boolean / string / percentage / link', () => {
    it('validates boolean', () => {
      expectValid(validator.validate(makeToken(true, 'boolean'), 'b'));
      expectInvalid(validator.validate(makeToken('true', 'boolean'), 'b'), 'expected boolean');
    });

    it('validates string', () => {
      expectValid(validator.validate(makeToken('hello', 'string'), 's'));
      expectInvalid(validator.validate(makeToken(42, 'string'), 's'), 'expected string');
    });

    it('validates percentage', () => {
      expectValid(validator.validate(makeToken(50, 'percentage'), 'p'));
      expectInvalid(validator.validate(makeToken('50%', 'percentage'), 'p'), 'expected number');
    });

    it('validates link', () => {
      expectValid(validator.validate(makeToken('https://example.com', 'link'), 'l'));
      expectInvalid(validator.validate(makeToken(42, 'link'), 'l'), 'expected string');
    });
  });

  describe('asset', () => {
    it('accepts string URIs', () => {
      expectValid(validator.validate(makeToken('https://example.com/icon.svg', 'asset'), 'a'));
      expectValid(validator.validate(makeToken('data:image/png;base64,abc', 'asset'), 'a'));
      expectValid(validator.validate(makeToken('./icons/star.svg', 'asset'), 'a'));
    });

    it('rejects non-string values', () => {
      expectInvalid(validator.validate(makeToken(42, 'asset'), 'a'), 'asset must be a string');
      expectInvalid(validator.validate(makeToken(true, 'asset'), 'a'), 'asset must be a string');
      expectInvalid(validator.validate(makeToken({ url: 'x' }, 'asset'), 'a'), 'asset must be a string');
    });
  });

  describe('references are skipped', () => {
    it('skips validation for reference values', () => {
      expectValid(validator.validate(makeToken('{colors.primary}', 'color'), 'ref'));
      expectValid(validator.validate(makeToken('{some.path}', 'dimension'), 'ref'));
      expectValid(validator.validate(makeToken('{any.ref}', 'typography'), 'ref'));
    });
  });

  describe('tokens without $type', () => {
    it('passes validation when $type is not specified', () => {
      expectValid(validator.validate(makeToken('anything'), 'untyped'));
      expectValid(validator.validate(makeToken(42), 'untyped'));
    });
  });

  describe('validateSet', () => {
    it('validates all tokens in a group recursively', () => {
      const group: TokenGroup = {
        colors: {
          $type: 'color',
          primary: { $value: '#ff0000' },
          invalid: { $value: 123 },
        } as TokenGroup,
      };

      const results = validator.validateSet(group);
      expect(results).toHaveLength(2);

      const primary = results.find((r) => r.path === 'colors.primary');
      const invalid = results.find((r) => r.path === 'colors.invalid');

      expect(primary?.valid).toBe(true);
      expect(invalid?.valid).toBe(false);
    });

    it('inherits $type from parent group', () => {
      const group: TokenGroup = {
        $type: 'color',
        primary: { $value: '#ff0000' } as Token,
        secondary: { $value: 'not-a-color' } as Token,
      };

      const results = validator.validateSet(group);
      const secondary = results.find((r) => r.path === 'secondary');

      expect(secondary?.valid).toBe(false);
      expect(secondary?.errors[0]).toContain('invalid color');
    });
  });
});
