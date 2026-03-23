import { describe, it, expect } from 'vitest';
import { TokenResolver } from '../resolver.js';
import { TOKEN_TYPES } from '../constants.js';
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

  describe('setName', () => {
    it('attaches setName to resolved tokens', () => {
      const tokens: Record<string, Token> = {
        'x': makeToken(1, 'number'),
      };

      const resolver = new TokenResolver(tokens, 'my-set');
      const result = resolver.resolve('x');

      expect(result.setName).toBe('my-set');
    });
  });
});
