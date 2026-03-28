import { describe, it, expect, vi } from 'vitest';

vi.mock('simple-git', () => ({ default: () => ({}) }));

import { parseConflictMarkers, resolveConflictContent } from '../services/git-sync';

describe('parseConflictMarkers', () => {
  it('parses a well-formed conflict region', () => {
    const content = [
      '<<<<<<< HEAD',
      'our line',
      '=======',
      'their line',
      '>>>>>>> branch',
    ].join('\n');
    const regions = parseConflictMarkers(content);
    expect(regions).toEqual([{ index: 0, ours: 'our line', theirs: 'their line' }]);
  });

  it('parses multiple regions', () => {
    const content = [
      'before',
      '<<<<<<< HEAD',
      'a',
      '=======',
      'b',
      '>>>>>>> branch',
      'between',
      '<<<<<<< HEAD',
      'c',
      '=======',
      'd',
      '>>>>>>> branch',
      'after',
    ].join('\n');
    const regions = parseConflictMarkers(content);
    expect(regions).toHaveLength(2);
    expect(regions[0]).toEqual({ index: 0, ours: 'a', theirs: 'b' });
    expect(regions[1]).toEqual({ index: 1, ours: 'c', theirs: 'd' });
  });

  it('returns empty array when no markers exist', () => {
    expect(parseConflictMarkers('hello\nworld')).toEqual([]);
  });

  it('handles missing >>>>>>> marker (last line is theirs content)', () => {
    const content = [
      '<<<<<<< HEAD',
      'our line',
      '=======',
      'their line',
      // no >>>>>>> marker
    ].join('\n');
    const regions = parseConflictMarkers(content);
    // Malformed region should be skipped
    expect(regions).toEqual([]);
  });

  it('handles missing ======= marker', () => {
    const content = [
      '<<<<<<< HEAD',
      'our line',
      // no ======= marker, no >>>>>>> marker
    ].join('\n');
    const regions = parseConflictMarkers(content);
    expect(regions).toEqual([]);
  });

  it('handles missing >>>>>>> when followed by valid region', () => {
    // The first region is malformed (no >>>>>>>), parser breaks out,
    // so the second valid region is also not parsed.
    const content = [
      '<<<<<<< HEAD',
      'a',
      '=======',
      'b',
      // missing >>>>>>>
    ].join('\n');
    const regions = parseConflictMarkers(content);
    expect(regions).toEqual([]);
  });

  it('handles >>>>>>> as the very last line (well-formed)', () => {
    const content = [
      '<<<<<<< HEAD',
      'our line',
      '=======',
      'their line',
      '>>>>>>> branch',
    ].join('\n');
    const regions = parseConflictMarkers(content);
    expect(regions).toHaveLength(1);
    expect(regions[0].ours).toBe('our line');
    expect(regions[0].theirs).toBe('their line');
  });
});

describe('resolveConflictContent', () => {
  it('resolves well-formed conflicts choosing ours', () => {
    const content = [
      'before',
      '<<<<<<< HEAD',
      'our line',
      '=======',
      'their line',
      '>>>>>>> branch',
      'after',
    ].join('\n');
    const result = resolveConflictContent(content, { 0: 'ours' });
    expect(result).toBe('before\nour line\nafter');
  });

  it('resolves well-formed conflicts choosing theirs', () => {
    const content = [
      'before',
      '<<<<<<< HEAD',
      'our line',
      '=======',
      'their line',
      '>>>>>>> branch',
      'after',
    ].join('\n');
    const result = resolveConflictContent(content, { 0: 'theirs' });
    expect(result).toBe('before\ntheir line\nafter');
  });

  it('handles missing >>>>>>> marker gracefully', () => {
    const content = [
      'before',
      '<<<<<<< HEAD',
      'our line',
      '=======',
      'their line',
    ].join('\n');
    // Should not throw; emits theirs lines as fallback content
    const result = resolveConflictContent(content, { 0: 'ours' });
    expect(result).toBe('before\ntheir line');
  });

  it('handles missing ======= marker gracefully', () => {
    const content = [
      'before',
      '<<<<<<< HEAD',
      'our line',
    ].join('\n');
    // Should not throw; emits ours lines as fallback content
    const result = resolveConflictContent(content, { 0: 'ours' });
    expect(result).toBe('before\nour line');
  });
});
