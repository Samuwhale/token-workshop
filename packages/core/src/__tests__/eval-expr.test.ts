import { describe, it, expect } from 'vitest';
import { evalExpr, substituteVars } from '../eval-expr.js';

describe('evalExpr', () => {
  it('throws on division by zero', () => {
    expect(() => evalExpr('1 / 0')).toThrow('Division by zero');
  });
});

describe('substituteVars', () => {
  it('substitutes known variables', () => {
    expect(substituteVars('base * ratio', { base: 16, ratio: 1.5 })).toBe('16 * 1.5');
  });

  it('throws on unknown variables', () => {
    expect(() => substituteVars('base * unknown', { base: 16 })).toThrow(
      /Unknown variable.*unknown/,
    );
  });

  it('throws when a variable value is undefined', () => {
    const vars = { base: 16, ratio: undefined as unknown as number };
    expect(() => substituteVars('base * ratio', vars)).toThrow(
      /Variable "ratio" has no value/,
    );
  });

  it('throws when a variable value is null', () => {
    const vars = { base: 16, ratio: null as unknown as number };
    expect(() => substituteVars('base * ratio', vars)).toThrow(
      /Variable "ratio" has no value/,
    );
  });

  it('allows zero as a valid variable value', () => {
    expect(substituteVars('base + offset', { base: 16, offset: 0 })).toBe('16 + 0');
  });
});
