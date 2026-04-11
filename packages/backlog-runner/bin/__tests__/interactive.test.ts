import { afterEach, describe, expect, it } from 'vitest';
import { resolveToolChoice, resolveWorkerChoice, shouldPromptInteractively, summarizeRunOverrides } from '../interactive.js';

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

  it('resolves worker counts within the allowed range', () => {
    expect(resolveWorkerChoice('3', 1)).toBe(3);
    expect(resolveWorkerChoice('', 2)).toBe(2);
    expect(resolveWorkerChoice('0', 2)).toBe(2);
    expect(resolveWorkerChoice('99', 2, 8)).toBe(2);
  });

  it('renders a readable summary of selected options', () => {
    const summary = summarizeRunOverrides({
      tool: undefined,
      workers: 3,
      model: undefined,
      passes: true,
      worktrees: false,
    });

    expect(summary).toContain('Tool override:  per-runner config');
    expect(summary).toContain('Workers:        3');
    expect(summary).toContain('Model override: per-runner config');
    expect(summary).toContain('Worktrees:      disabled');
  });

  it('only prompts interactively for run when a TTY is present and no explicit overrides were supplied', () => {
    setTtyState(true, true);

    expect(shouldPromptInteractively('run', {})).toBe(true);
    expect(shouldPromptInteractively('validate', {})).toBe(false);
    expect(shouldPromptInteractively('run', { workers: 3 })).toBe(false);
  });

  it('honors explicit interactive overrides and non-tty sessions', () => {
    setTtyState(false, false);
    expect(shouldPromptInteractively('run', {})).toBe(false);

    setTtyState(true, true);
    expect(shouldPromptInteractively('run', { interactive: false })).toBe(false);
    expect(shouldPromptInteractively('run', { interactive: true, workers: 2 })).toBe(true);
  });
});
