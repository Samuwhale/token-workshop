import { describe, expect, it } from 'vitest';
import { resolveLaneChoice, resolveToolChoice, summarizeRunOverrides } from '../interactive.js';

describe('interactive helpers', () => {
  it('resolves tools from number or name', () => {
    expect(resolveToolChoice('2', 'claude')).toBe('codex');
    expect(resolveToolChoice('codex', 'claude')).toBe('codex');
    expect(resolveToolChoice('', 'codex')).toBe('codex');
    expect(resolveToolChoice('unknown', 'codex')).toBe('codex');
  });

  it('resolves lanes from number or name', () => {
    expect(resolveLaneChoice('2', 'executor')).toBe('planner');
    expect(resolveLaneChoice('planner', 'executor')).toBe('planner');
    expect(resolveLaneChoice('', 'planner')).toBe('planner');
    expect(resolveLaneChoice('unknown', 'planner')).toBe('planner');
  });

  it('renders a readable summary of selected options', () => {
    const summary = summarizeRunOverrides({
      tool: 'codex',
      lane: 'planner',
      model: '',
      passModel: '',
      passes: true,
      worktrees: false,
    });

    expect(summary).toContain('Tool:           codex');
    expect(summary).toContain('Lane:           planner');
    expect(summary).toContain('Model:          CLI default');
    expect(summary).toContain('Pass model:     same as main model / CLI default');
    expect(summary).toContain('Worktrees:      disabled');
  });
});
