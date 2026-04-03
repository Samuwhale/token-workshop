import { describe, it, expect } from 'vitest';
import { inferType, parseCSSCustomProperties, flattenJSObject, parseTailwindConfig } from '../ui/shared/tokenParsers';

describe('inferType', () => {
  it('detects hex colors', () => {
    expect(inferType('#ff0000').$type).toBe('color');
    expect(inferType('#f00').$type).toBe('color');
  });

  it('detects alias references', () => {
    const result = inferType('{colors.brand.primary}');
    expect(result.$type).toBe('color'); // alias — type unknown, defaults to color
  });

  it('detects dimensions', () => {
    const result = inferType('16px');
    expect(result.$type).toBe('dimension');
  });

  it('detects rem dimensions', () => {
    const result = inferType('1.5rem');
    expect(result.$type).toBe('dimension');
  });
});

describe('parseCSSCustomProperties', () => {
  it('imports static values and returns empty skipped', () => {
    const result = parseCSSCustomProperties('--color-primary: #ff0000;\n--spacing-sm: 8px;');
    expect(result.tokens).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);
  });

  it('skips calc() expressions and records them', () => {
    const result = parseCSSCustomProperties(
      '--spacing-sm: 8px;\n--spacing-lg: calc(var(--spacing-sm) * 2);'
    );
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].path).toBe('spacing.sm');
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].path).toBe('spacing.lg');
    expect(result.skipped[0].originalExpression).toBe('calc(var(--spacing-sm) * 2)');
    expect(result.skipped[0].reason).toMatch(/Dynamic CSS expression/);
  });

  it('skips min(), max(), clamp() expressions', () => {
    const result = parseCSSCustomProperties(
      '--a: min(10px, 2rem);\n--b: clamp(1rem, 2vw, 3rem);\n--c: max(8px, 1rem);'
    );
    expect(result.tokens).toHaveLength(0);
    expect(result.skipped).toHaveLength(3);
  });

  it('skips complex var() with fallback', () => {
    const result = parseCSSCustomProperties('--color: var(--base, #fff);');
    expect(result.tokens).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].originalExpression).toBe('var(--base, #fff)');
  });

  it('converts simple var() to alias and does NOT skip it', () => {
    const result = parseCSSCustomProperties('--color-secondary: var(--color-primary);');
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0].$value).toBe('{color.primary}');
    expect(result.skipped).toHaveLength(0);
  });

  it('returns skipped: [] in ParseResult shape', () => {
    const result = parseCSSCustomProperties('--size: 16px;');
    expect(result).toHaveProperty('skipped');
    expect(Array.isArray(result.skipped)).toBe(true);
  });
});

describe('flattenJSObject', () => {
  it('imports strings and numbers, tracks skipped arrays and booleans', () => {
    const skipped: import('../ui/shared/tokenParsers').SkippedEntry[] = [];
    const tokens = flattenJSObject(
      {
        spacing: { sm: '8px', lg: '16px' },
        steps: [1, 2, 4, 8],
        enabled: true,
        deprecated: null,
      },
      '',
      skipped,
    );
    expect(tokens).toHaveLength(2);
    expect(tokens.map(t => t.path)).toEqual(['spacing.sm', 'spacing.lg']);
    expect(skipped).toHaveLength(3);
    expect(skipped.map(s => s.path)).toEqual(['steps', 'enabled', 'deprecated']);
  });

  it('records array originalExpression as JSON', () => {
    const skipped: import('../ui/shared/tokenParsers').SkippedEntry[] = [];
    flattenJSObject({ colors: ['red', 'blue'] }, '', skipped);
    expect(skipped[0].originalExpression).toBe('["red","blue"]');
    expect(skipped[0].reason).toMatch(/Array/);
  });

  it('records boolean originalExpression', () => {
    const skipped: import('../ui/shared/tokenParsers').SkippedEntry[] = [];
    flattenJSObject({ darkMode: false }, '', skipped);
    expect(skipped[0].originalExpression).toBe('false');
    expect(skipped[0].reason).toMatch(/Boolean/);
  });
});

describe('parseTailwindConfig', () => {
  it('includes skipped in result for array values', () => {
    const result = parseTailwindConfig('{ "screens": ["sm", "md", "lg"], "spacing": { "sm": "8px" } }');
    expect(result.tokens).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].path).toBe('screens');
    expect(result.skipped[0].reason).toMatch(/Array/);
  });

  it('includes skipped: [] in result shape even with no skips', () => {
    const result = parseTailwindConfig('{ "spacing": { "sm": "8px" } }');
    expect(result).toHaveProperty('skipped');
    expect(result.skipped).toHaveLength(0);
  });
});
