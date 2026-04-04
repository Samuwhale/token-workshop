import { describe, it, expect } from 'vitest';
import { TokenResolver } from '../resolver.js';
import type { Token } from '../types.js';

function makeToken(value: Token['$value'], type?: Token['$type']): Token {
  return { $value: value, ...(type ? { $type: type } : {}) };
}

describe('formula unit inheritance', () => {
  // --- Standard cases (explicit {value, unit} dimension tokens) ---

  it('inherits em unit directly from referenced dimension token', () => {
    const tokens: Record<string, Token> = {
      'spacing.base': makeToken({ value: 8, unit: 'em' }, 'dimension'),
      'spacing.lg': makeToken('{spacing.base} * 2', 'dimension'),
    };
    const r = new TokenResolver(tokens);
    expect(r.resolve('spacing.lg').$value).toEqual({ value: 16, unit: 'em' });
  });

  it('inherits rem unit from a different dimension token', () => {
    const tokens: Record<string, Token> = {
      'spacing.base': makeToken({ value: 1, unit: 'rem' }, 'dimension'),
      'spacing.lg': makeToken('{spacing.base} * 2', 'dimension'),
    };
    const r = new TokenResolver(tokens);
    expect(r.resolve('spacing.lg').$value).toEqual({ value: 2, unit: 'rem' });
  });

  it('inherits unit through alias chain: formula → alias → dimension with unit', () => {
    const tokens: Record<string, Token> = {
      'primitives.base': makeToken({ value: 8, unit: 'em' }, 'dimension'),
      'spacing.base': makeToken('{primitives.base}', 'dimension'),
      'spacing.lg': makeToken('{spacing.base} * 2', 'dimension'),
    };
    const r = new TokenResolver(tokens);
    expect(r.resolve('spacing.lg').$value).toEqual({ value: 16, unit: 'em' });
  });

  it('inherits unit through formula chain: formula → formula → dimension with unit', () => {
    const tokens: Record<string, Token> = {
      'base.em': makeToken({ value: 8, unit: 'em' }, 'dimension'),
      'spacing.base': makeToken('{base.em} * 1', 'dimension'),
      'spacing.lg': makeToken('{spacing.base} * 2', 'dimension'),
    };
    const r = new TokenResolver(tokens);
    expect(r.resolve('spacing.lg').$value).toEqual({ value: 16, unit: 'em' });
  });

  it('formula multiplied by a number token: inherits unit from dimension ref', () => {
    const tokens: Record<string, Token> = {
      'scale': makeToken(2, 'number'),
      'spacing.base': makeToken({ value: 8, unit: 'em' }, 'dimension'),
      'spacing.lg': makeToken('{spacing.base} * {scale}', 'dimension'),
    };
    const r = new TokenResolver(tokens);
    expect(r.resolve('spacing.lg').$value).toEqual({ value: 16, unit: 'em' });
  });

  it('formula with number token first: still inherits unit from dimension ref', () => {
    const tokens: Record<string, Token> = {
      'scale': makeToken(2, 'number'),
      'spacing.base': makeToken({ value: 8, unit: 'em' }, 'dimension'),
      // scale appears BEFORE spacing.base in the formula
      'spacing.lg': makeToken('{scale} * {spacing.base}', 'dimension'),
    };
    const r = new TokenResolver(tokens);
    expect(r.resolve('spacing.lg').$value).toEqual({ value: 16, unit: 'em' });
  });

  it('inherits s unit for duration formula', () => {
    const tokens: Record<string, Token> = {
      'anim.base': makeToken({ value: 0.2, unit: 's' }, 'duration'),
      'anim.slow': makeToken('{anim.base} * 3', 'duration'),
    };
    const r = new TokenResolver(tokens);
    expect(r.resolve('anim.slow').$value).toEqual({ value: 0.6000000000000001, unit: 's' });
  });

  it('inherits unit after updateToken changes base unit', () => {
    const tokens: Record<string, Token> = {
      'spacing.base': makeToken({ value: 8, unit: 'px' }, 'dimension'),
      'spacing.lg': makeToken('{spacing.base} * 2', 'dimension'),
    };
    const r = new TokenResolver(tokens);
    expect(r.resolve('spacing.lg').$value).toEqual({ value: 16, unit: 'px' });

    r.updateToken('spacing.base', makeToken({ value: 4, unit: 'em' }, 'dimension'));
    r.invalidate('spacing.lg');
    expect(r.resolve('spacing.lg').$value).toEqual({ value: 8, unit: 'em' });
  });

  // --- Bare-number dimension/duration normalization ---

  it('normalises a bare-number dimension token to {value, unit:"px"}', () => {
    const tokens: Record<string, Token> = {
      'spacing.px': makeToken(8, 'dimension'),
    };
    const r = new TokenResolver(tokens);
    expect(r.resolve('spacing.px').$value).toEqual({ value: 8, unit: 'px' });
  });

  it('normalises a bare-number duration token to {value, unit:"ms"}', () => {
    const tokens: Record<string, Token> = {
      'anim.dur': makeToken(200, 'duration'),
    };
    const r = new TokenResolver(tokens);
    expect(r.resolve('anim.dur').$value).toEqual({ value: 200, unit: 'ms' });
  });

  it('formula referencing a bare-number dimension inherits px via type inference', () => {
    // A dimension token stored as a bare number normalises to {value, unit:'px'};
    // a formula referencing it should see the 'px' unit via extractFormulaUnit's
    // type-based inference rather than using a hardcoded '?? px' fallback.
    const tokens: Record<string, Token> = {
      'spacing.base': makeToken(8, 'dimension'),
      'spacing.lg': makeToken('{spacing.base} * 2', 'dimension'),
    };
    const r = new TokenResolver(tokens);
    expect(r.resolve('spacing.lg').$value).toEqual({ value: 16, unit: 'px' });
  });

  it('formula referencing a bare-number duration inherits ms via type inference', () => {
    const tokens: Record<string, Token> = {
      'anim.base': makeToken(200, 'duration'),
      'anim.slow': makeToken('{anim.base} * 3', 'duration'),
    };
    const r = new TokenResolver(tokens);
    expect(r.resolve('anim.slow').$value).toEqual({ value: 600, unit: 'ms' });
  });
});
