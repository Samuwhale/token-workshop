import { describe, it, expect } from 'vitest';
import { TokenResolver } from '../resolver.js';
import type { Token } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToken(value: Token['$value'], type?: Token['$type']): Token {
  return { $value: value, ...(type ? { $type: type } : {}) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TokenResolver', () => {
  describe('basic reference resolution', () => {
    it('resolves a simple direct reference', () => {
      const tokens: Record<string, Token> = {
        'colors.blue': makeToken('#0000ff', 'color'),
        'colors.primary': makeToken('{colors.blue}', 'color'),
      };

      const resolver = new TokenResolver(tokens);
      const result = resolver.resolve('colors.primary');

      expect(result.$value).toBe('#0000ff');
      expect(result.$type).toBe('color');
      expect(result.rawValue).toBe('{colors.blue}');
      expect(result.path).toBe('colors.primary');
    });

    it('resolves a non-reference token as-is', () => {
      const tokens: Record<string, Token> = {
        'spacing.sm': makeToken({ value: 8, unit: 'px' }, 'dimension'),
      };

      const resolver = new TokenResolver(tokens);
      const result = resolver.resolve('spacing.sm');

      expect(result.$value).toEqual({ value: 8, unit: 'px' });
    });
  });

  describe('chain resolution', () => {
    it('resolves a chain A -> B -> C', () => {
      const tokens: Record<string, Token> = {
        'colors.base': makeToken('#ff0000', 'color'),
        'colors.alias': makeToken('{colors.base}', 'color'),
        'colors.deep': makeToken('{colors.alias}', 'color'),
      };

      const resolver = new TokenResolver(tokens);
      const result = resolver.resolve('colors.deep');

      expect(result.$value).toBe('#ff0000');
      expect(result.rawValue).toBe('{colors.alias}');
    });

    it('resolves a longer chain A -> B -> C -> D', () => {
      const tokens: Record<string, Token> = {
        'a': makeToken(42, 'number'),
        'b': makeToken('{a}', 'number'),
        'c': makeToken('{b}', 'number'),
        'd': makeToken('{c}', 'number'),
      };

      const resolver = new TokenResolver(tokens);
      const result = resolver.resolve('d');

      expect(result.$value).toBe(42);
    });
  });

  describe('cycle detection', () => {
    it('throws on a direct cycle A -> B -> A', () => {
      const tokens: Record<string, Token> = {
        'a': makeToken('{b}'),
        'b': makeToken('{a}'),
      };

      const resolver = new TokenResolver(tokens);
      expect(() => resolver.resolve('a')).toThrow(/[Cc]ircular/);
    });

    it('throws on a self-reference', () => {
      const tokens: Record<string, Token> = {
        'a': makeToken('{a}'),
      };

      const resolver = new TokenResolver(tokens);
      expect(() => resolver.resolve('a')).toThrow(/[Cc]ircular/);
    });

    it('throws on a longer cycle A -> B -> C -> A', () => {
      const tokens: Record<string, Token> = {
        'a': makeToken('{b}'),
        'b': makeToken('{c}'),
        'c': makeToken('{a}'),
      };

      const resolver = new TokenResolver(tokens);
      expect(() => resolver.resolve('a')).toThrow(/[Cc]ircular/);
    });
  });

  describe('composite type resolution', () => {
    it('resolves alias references inside gradient stop colors', () => {
      const tokens: Record<string, Token> = {
        'color.red': makeToken('#ff0000', 'color'),
        'color.white': makeToken('#ffffff', 'color'),
        'gradient.hero': makeToken(
          [
            { color: '{color.red}', position: 0 },
            { color: '{color.white}', position: 1 },
          ] as any,
          'gradient',
        ),
      };

      const resolver = new TokenResolver(tokens);
      const result = resolver.resolve('gradient.hero');

      const stops = result.$value as Array<{ color: string; position: number }>;
      expect(stops[0].color).toBe('#ff0000');
      expect(stops[1].color).toBe('#ffffff');
      expect(stops[0].position).toBe(0);
      expect(stops[1].position).toBe(1);
    });

    it('resolves references inside a typography value', () => {
      const tokens: Record<string, Token> = {
        'font.body': makeToken('Inter', 'fontFamily'),
        'font.size.base': makeToken({ value: 16, unit: 'px' }, 'dimension'),
        'font.weight.regular': makeToken(400, 'fontWeight'),
        'typography.body': makeToken(
          {
            fontFamily: '{font.body}',
            fontSize: '{font.size.base}',
            fontWeight: '{font.weight.regular}',
            lineHeight: 1.5,
            letterSpacing: { value: 0, unit: 'px' },
          },
          'typography',
        ),
      };

      const resolver = new TokenResolver(tokens);
      const result = resolver.resolve('typography.body');

      const val = result.$value as Record<string, unknown>;
      expect(val.fontFamily).toBe('Inter');
      expect(val.fontSize).toEqual({ value: 16, unit: 'px' });
      expect(val.fontWeight).toBe(400);
      expect(val.lineHeight).toBe(1.5);
    });

    it('resolves references inside a shadow value', () => {
      const tokens: Record<string, Token> = {
        'colors.shadow': makeToken('#00000033', 'color'),
        'shadow.md': makeToken(
          {
            color: '{colors.shadow}',
            offsetX: { value: 0, unit: 'px' },
            offsetY: { value: 4, unit: 'px' },
            blur: { value: 8, unit: 'px' },
            spread: { value: 0, unit: 'px' },
          },
          'shadow',
        ),
      };

      const resolver = new TokenResolver(tokens);
      const result = resolver.resolve('shadow.md');

      const val = result.$value as Record<string, unknown>;
      expect(val.color).toBe('#00000033');
    });

    it('resolves references inside a border value', () => {
      const tokens: Record<string, Token> = {
        'colors.border': makeToken('#cccccc', 'color'),
        'border.default': makeToken(
          {
            color: '{colors.border}',
            width: { value: 1, unit: 'px' },
            style: 'solid',
          },
          'border',
        ),
      };

      const resolver = new TokenResolver(tokens);
      const result = resolver.resolve('border.default');

      const val = result.$value as Record<string, unknown>;
      expect(val.color).toBe('#cccccc');
      expect(val.width).toEqual({ value: 1, unit: 'px' });
    });
  });

  describe('resolveAll', () => {
    it('resolves all tokens and returns a map', () => {
      const tokens: Record<string, Token> = {
        'a': makeToken('#ff0000', 'color'),
        'b': makeToken('{a}', 'color'),
        'c': makeToken(42, 'number'),
      };

      const resolver = new TokenResolver(tokens);
      const all = resolver.resolveAll();

      expect(all.size).toBe(3);
      expect(all.get('a')!.$value).toBe('#ff0000');
      expect(all.get('b')!.$value).toBe('#ff0000');
      expect(all.get('c')!.$value).toBe(42);
    });

    it('throws on cycles during resolveAll', () => {
      const tokens: Record<string, Token> = {
        'ok': makeToken(1, 'number'),
        'x': makeToken('{y}'),
        'y': makeToken('{x}'),
      };

      const resolver = new TokenResolver(tokens);
      expect(() => resolver.resolveAll()).toThrow(/[Cc]ircular/);
    });
  });

  describe('invalidation', () => {
    it('invalidates a token and its downstream dependents', () => {
      const tokens: Record<string, Token> = {
        'colors.base': makeToken('#ff0000', 'color'),
        'colors.primary': makeToken('{colors.base}', 'color'),
        'colors.accent': makeToken('{colors.primary}', 'color'),
      };

      const resolver = new TokenResolver(tokens);
      resolver.resolveAll();

      // All should be resolved
      expect(resolver.resolve('colors.accent').$value).toBe('#ff0000');

      // Update the base token
      resolver.updateToken('colors.base', makeToken('#00ff00', 'color'));

      // Re-resolve — should pick up the new value
      const result = resolver.resolve('colors.accent');
      expect(result.$value).toBe('#00ff00');
    });

    it('does not affect unrelated tokens on invalidation', () => {
      const tokens: Record<string, Token> = {
        'a': makeToken(1, 'number'),
        'b': makeToken('{a}', 'number'),
        'c': makeToken(99, 'number'),
      };

      const resolver = new TokenResolver(tokens);
      resolver.resolveAll();

      resolver.updateToken('a', makeToken(2, 'number'));

      // 'c' should still be cached
      expect(resolver.resolve('c').$value).toBe(99);
      // 'b' should be re-resolved
      expect(resolver.resolve('b').$value).toBe(2);
    });
  });

  describe('type resolution', () => {
    it('inherits $type from the referenced token when not specified', () => {
      const tokens: Record<string, Token> = {
        'colors.blue': makeToken('#0000ff', 'color'),
        'alias': makeToken('{colors.blue}'),
      };

      const resolver = new TokenResolver(tokens);
      const result = resolver.resolve('alias');

      expect(result.$type).toBe('color');
    });

    it('uses own $type when specified, even if reference has a different one', () => {
      const tokens: Record<string, Token> = {
        'source': makeToken('#ff0000', 'color'),
        'custom': makeToken('{source}', 'custom'),
      };

      const resolver = new TokenResolver(tokens);
      const result = resolver.resolve('custom');

      expect(result.$type).toBe('custom');
    });
  });

  describe('error handling', () => {
    it('throws when resolving a non-existent token', () => {
      const resolver = new TokenResolver({});
      expect(() => resolver.resolve('nonexistent')).toThrow(/not found/i);
    });

    it('throws when a reference points to a non-existent token', () => {
      const tokens: Record<string, Token> = {
        'a': makeToken('{does.not.exist}'),
      };

      const resolver = new TokenResolver(tokens);
      expect(() => resolver.resolve('a')).toThrow(/not found|could not be found/i);
    });
  });

  describe('collectionId', () => {
    it('attaches collectionId to resolved tokens', () => {
      const tokens: Record<string, Token> = {
        'x': makeToken(1, 'number'),
      };

      const resolver = new TokenResolver(tokens, 'my-collection');
      const result = resolver.resolve('x');

      expect(result.collectionId).toBe('my-collection');
    });
  });

  describe('formula resolution', () => {
    it('evaluates a simple formula with a single reference', () => {
      const tokens: Record<string, Token> = {
        'spacing.base': makeToken(8, 'number'),
        'spacing.lg': makeToken('{spacing.base} * 2', 'number'),
      };

      const resolver = new TokenResolver(tokens);
      const result = resolver.resolve('spacing.lg');

      expect(result.$value).toBe(16);
    });

    it('evaluates a formula with two references', () => {
      const tokens: Record<string, Token> = {
        'a': makeToken(10, 'number'),
        'b': makeToken(5, 'number'),
        'c': makeToken('{a} + {b}', 'number'),
      };

      const resolver = new TokenResolver(tokens);
      expect(resolver.resolve('c').$value).toBe(15);
    });

    it('reconstructs DimensionValue from a dimension formula token', () => {
      const tokens: Record<string, Token> = {
        'spacing.base': makeToken({ value: 8, unit: 'px' }, 'dimension'),
        'spacing.lg': makeToken('{spacing.base} * 2', 'dimension'),
      };

      const resolver = new TokenResolver(tokens);
      expect(resolver.resolve('spacing.lg').$value).toEqual({ value: 16, unit: 'px' });
    });

    it('reconstructs DurationValue from a duration formula token', () => {
      const tokens: Record<string, Token> = {
        'anim.base': makeToken({ value: 200, unit: 'ms' }, 'duration'),
        'anim.slow': makeToken('{anim.base} * 3', 'duration'),
      };

      const resolver = new TokenResolver(tokens);
      expect(resolver.resolve('anim.slow').$value).toEqual({ value: 600, unit: 'ms' });
    });

    it('handles parentheses in formulas', () => {
      const tokens: Record<string, Token> = {
        'a': makeToken(6, 'number'),
        'b': makeToken(4, 'number'),
        'result': makeToken('({a} + {b}) / 2', 'number'),
      };

      const resolver = new TokenResolver(tokens);
      expect(resolver.resolve('result').$value).toBe(5);
    });

    it('stores the formula in $extensions.tokenworkshop.formula', () => {
      const tokens: Record<string, Token> = {
        'base': makeToken(10, 'number'),
        'derived': makeToken('{base} * 3', 'number'),
      };

      const resolver = new TokenResolver(tokens);
      const result = resolver.resolve('derived');
      expect(result.$extensions?.tokenworkshop?.formula).toBe('{base} * 3');
    });

    it('includes formula refs in the dependency graph', () => {
      const tokens: Record<string, Token> = {
        'base': makeToken(4, 'number'),
        'derived': makeToken('{base} * 3', 'number'),
      };

      const resolver = new TokenResolver(tokens);
      resolver.resolveAll();
      resolver.updateToken('base', makeToken(10, 'number'));
      expect(resolver.resolve('derived').$value).toBe(30);
    });

    it('throws when a formula references a non-numeric token', () => {
      const tokens: Record<string, Token> = {
        'clr': makeToken('#ff0000', 'color'),
        'bad': makeToken('{clr} * 2', 'number'),
      };

      const resolver = new TokenResolver(tokens);
      expect(() => resolver.resolve('bad')).toThrow(/does not resolve to a number/);
    });

    it('throws on a cycle involving formula tokens', () => {
      const tokens: Record<string, Token> = {
        'a': makeToken('{b} * 2', 'number'),
        'b': makeToken('{a} + 1', 'number'),
      };

      const resolver = new TokenResolver(tokens);
      expect(() => resolver.resolve('a')).toThrow(/[Cc]ircular/);
    });
  });

  describe('gradient stop alias resolution', () => {
    it('resolves chained alias in gradient stop color', () => {
      const tokens: Record<string, Token> = {
        'primitives.blue': makeToken('#0000ff', 'color'),
        'semantic.primary': makeToken('{primitives.blue}', 'color'),
        'gradient.brand': makeToken(
          [{ color: '{semantic.primary}', position: 0 }],
          'gradient',
        ),
      };

      const resolver = new TokenResolver(tokens);
      const result = resolver.resolve('gradient.brand');

      const stops = result.$value as Array<{ color: string; position: number }>;
      expect(stops[0].color).toBe('#0000ff');
    });

    it('correctly tracks gradient stop aliases in dependency graph', () => {
      const tokens: Record<string, Token> = {
        'colors.base': makeToken('#ff0000', 'color'),
        'gradient.test': makeToken(
          [{ color: '{colors.base}', position: 0 }],
          'gradient',
        ),
      };

      const resolver = new TokenResolver(tokens);
      resolver.resolveAll();

      // Update the base color and verify gradient re-resolves
      resolver.updateToken('colors.base', makeToken('#00ff00', 'color'));
      const result = resolver.resolve('gradient.test');

      const stops = result.$value as Array<{ color: string; position: number }>;
      expect(stops[0].color).toBe('#00ff00');
    });

    it('leaves non-alias gradient stop colors unchanged', () => {
      const tokens: Record<string, Token> = {
        'gradient.static': makeToken(
          [
            { color: '#ff0000', position: 0 },
            { color: '#0000ff', position: 1 },
          ],
          'gradient',
        ),
      };

      const resolver = new TokenResolver(tokens);
      const result = resolver.resolve('gradient.static');

      const stops = result.$value as Array<{ color: string; position: number }>;
      expect(stops[0].color).toBe('#ff0000');
      expect(stops[1].color).toBe('#0000ff');
    });
  });

  describe('$extends inheritance', () => {
    function makeExtendingToken(
      value: Token['$value'],
      type: Token['$type'],
      extendsPath: string,
    ): Token {
      return {
        $value: value,
        $type: type,
        $extensions: { tokenworkshop: { extends: extendsPath } },
      };
    }

    it('merges composite typography tokens via $extends', () => {
      const tokens: Record<string, Token> = {
        'typo.base': {
          $value: { fontFamily: 'Inter', fontSize: '16px', fontWeight: 400 },
          $type: 'typography',
        },
        'typo.heading': makeExtendingToken(
          { fontSize: '24px', fontWeight: 700 },
          'typography',
          'typo.base',
        ),
      };

      const resolver = new TokenResolver(tokens);
      const result = resolver.resolve('typo.heading');

      expect(result.$value).toEqual({
        fontFamily: 'Inter',
        fontSize: '24px',
        fontWeight: 700,
      });
    });

    it('throws when base token is not a composite type', () => {
      const tokens: Record<string, Token> = {
        'colors.red': makeToken('#ff0000', 'color'),
        'colors.alias': makeExtendingToken('#ff0000', 'color', 'colors.red'),
      };

      const resolver = new TokenResolver(tokens);
      expect(() => resolver.resolve('colors.alias')).toThrow(
        /not a composite type/,
      );
    });

    it('throws when extending token type does not match base type', () => {
      const tokens: Record<string, Token> = {
        'typo.base': {
          $value: { fontFamily: 'Inter', fontSize: '16px' },
          $type: 'typography',
        },
        'border.weird': makeExtendingToken(
          { color: '#000', width: '1px', style: 'solid' },
          'border',
          'typo.base',
        ),
      };

      const resolver = new TokenResolver(tokens);
      expect(() => resolver.resolve('border.weird')).toThrow(
        /types do not match/,
      );
    });

    it('throws when base value resolved to a non-object (e.g., resolution error produced a primitive)', () => {
      // Simulate a base token that has a composite type but whose value resolved to a string
      // (this can happen if the base's $value is a reference to a primitive token)
      const tokens: Record<string, Token> = {
        'primitives.name': makeToken('Inter', 'string'),
        'typo.base': {
          $value: '{primitives.name}',
          $type: 'typography',
        },
        'typo.child': makeExtendingToken(
          { fontSize: '18px' },
          'typography',
          'typo.base',
        ),
      };

      const resolver = new TokenResolver(tokens);
      expect(() => resolver.resolve('typo.child')).toThrow(
        /is not a plain object/,
      );
    });

    it('throws when extending token value is a primitive but base is composite', () => {
      const tokens: Record<string, Token> = {
        'typo.base': {
          $value: { fontFamily: 'Inter', fontSize: '16px' },
          $type: 'typography',
        },
        'typo.broken': makeExtendingToken(
          'some-string-value',
          'typography',
          'typo.base',
        ),
      };

      const resolver = new TokenResolver(tokens);
      expect(() => resolver.resolve('typo.broken')).toThrow(
        /is not a plain object/,
      );
    });

    it('merges border tokens via $extends', () => {
      const tokens: Record<string, Token> = {
        'border.base': {
          $value: { color: '#000000', width: '1px', style: 'solid' },
          $type: 'border',
        },
        'border.accent': makeExtendingToken(
          { color: '#0066ff' },
          'border',
          'border.base',
        ),
      };

      const resolver = new TokenResolver(tokens);
      const result = resolver.resolve('border.accent');

      expect(result.$value).toEqual({
        color: '#0066ff',
        width: '1px',
        style: 'solid',
      });
    });
  });
});
