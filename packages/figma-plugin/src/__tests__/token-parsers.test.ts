import { describe, it, expect } from 'vitest';
import { inferType } from '../ui/shared/tokenParsers';

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
