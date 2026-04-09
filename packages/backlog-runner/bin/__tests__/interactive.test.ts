import { afterEach, describe, expect, it } from 'vitest';
import { resolveLaneChoice, resolveToolChoice, shouldPromptInteractively, summarizeRunOverrides } from '../interactive.js';

const originalStdinTty = process.stdin.isTTY;
const originalStdoutTty = process.stdout.isTTY;

function setTtyState(stdinTty: boolean | undefined, stdoutTty: boolean | undefined): void {
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: stdinTty });
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: stdoutTty });
}

afterEach(() => {
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: originalStdinTty });
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: originalStdoutTty });
});

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

  it('only prompts interactively for run when a TTY is present and no explicit overrides were supplied', () => {
    setTtyState(true, true);

    expect(shouldPromptInteractively('run', {})).toBe(true);
    expect(shouldPromptInteractively('validate', {})).toBe(false);
    expect(shouldPromptInteractively('run', { lane: 'planner' })).toBe(false);
  });

  it('honors explicit interactive overrides and non-tty sessions', () => {
    setTtyState(false, false);
    expect(shouldPromptInteractively('run', {})).toBe(false);

    setTtyState(true, true);
    expect(shouldPromptInteractively('run', { interactive: false })).toBe(false);
    expect(shouldPromptInteractively('run', { interactive: true, lane: 'planner' })).toBe(true);
  });
});
