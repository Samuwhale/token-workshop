import { describe, it, expect } from 'vitest';
import { SET_NAME_RE, stableStringify, getErrorMessage, adaptShortcut, countLeafNodes } from '../ui/shared/utils';

describe('SET_NAME_RE', () => {
  it('allows simple names', () => {
    expect(SET_NAME_RE.test('primitives')).toBe(true);
    expect(SET_NAME_RE.test('my-set')).toBe(true);
    expect(SET_NAME_RE.test('set_1')).toBe(true);
  });

  it('allows folder hierarchy', () => {
    expect(SET_NAME_RE.test('brand/light')).toBe(true);
    expect(SET_NAME_RE.test('a/b/c')).toBe(true);
  });

  it('rejects invalid names', () => {
    expect(SET_NAME_RE.test('')).toBe(false);
    expect(SET_NAME_RE.test('has space')).toBe(false);
    expect(SET_NAME_RE.test('/leading-slash')).toBe(false);
    expect(SET_NAME_RE.test('trailing/')).toBe(false);
  });
});

describe('stableStringify', () => {
  it('sorts keys deterministically', () => {
    const a = stableStringify({ b: 1, a: 2 });
    const b = stableStringify({ a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it('handles primitives and arrays', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify([1, 2])).toBe('[1,2]');
    expect(stableStringify('hello')).toBe('"hello"');
  });

  it('handles nested objects', () => {
    const result = stableStringify({ z: { b: 1, a: 2 }, a: 0 });
    expect(result).toBe('{"a":0,"z":{"a":2,"b":1}}');
  });
});

describe('getErrorMessage', () => {
  it('extracts message from Error', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns fallback for non-Error', () => {
    expect(getErrorMessage('string', 'fallback')).toBe('fallback');
    expect(getErrorMessage(null)).toBe('An unexpected error occurred');
  });
});

describe('countLeafNodes', () => {
  it('counts flat tokens', () => {
    const group = {
      red: { $value: '#f00', $type: 'color' },
      blue: { $value: '#00f', $type: 'color' },
      sm: { $value: '4px', $type: 'dimension' },
    };
    const result = countLeafNodes(group);
    expect(result.total).toBe(3);
    expect(result.byType.color).toBe(2);
    expect(result.byType.dimension).toBe(1);
  });

  it('counts nested tokens', () => {
    const group = {
      colors: {
        red: { $value: '#f00', $type: 'color' },
        brand: {
          primary: { $value: '#00f', $type: 'color' },
        },
      },
    };
    const result = countLeafNodes(group);
    expect(result.total).toBe(2);
    expect(result.byType.color).toBe(2);
  });
});
