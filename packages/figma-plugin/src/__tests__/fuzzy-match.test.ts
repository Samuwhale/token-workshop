import { describe, it, expect } from 'vitest';
import { fuzzyScore } from '../ui/shared/fuzzyMatch';

describe('fuzzyScore', () => {
  it('returns 0 for empty query', () => {
    expect(fuzzyScore('', 'anything')).toBe(0);
  });

  it('returns -1 when query is longer than target', () => {
    expect(fuzzyScore('abcdef', 'abc')).toBe(-1);
  });

  it('returns positive score for matching substring', () => {
    expect(fuzzyScore('color', 'colors.brand.primary')).toBeGreaterThan(0);
  });

  it('returns -1 for non-matching characters', () => {
    expect(fuzzyScore('xyz', 'color')).toBe(-1);
  });

  it('ranks exact prefix higher than mid-string match', () => {
    const prefix = fuzzyScore('col', 'colors.brand');
    const mid = fuzzyScore('col', 'brand.colors');
    expect(prefix).toBeGreaterThan(mid);
  });

  it('handles case-insensitive matching', () => {
    expect(fuzzyScore('COLOR', 'color.brand')).toBeGreaterThan(0);
  });
});
