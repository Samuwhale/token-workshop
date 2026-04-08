import { describe, expect, it } from 'vitest';
import { normalizeBacklogRunnerConfig } from '../../src/config.js';
import { resolveToolChoice, summarizeRunOverrides } from '../interactive.js';

const config = normalizeBacklogRunnerConfig({
  files: {
    backlog: './backlog.md',
    inbox: './backlog-inbox.md',
    stop: './backlog-stop',
    patterns: './scripts/backlog/patterns.md',
    progress: './scripts/backlog/progress.txt',
    archive: './scripts/backlog/archive.md',
    counter: './scripts/backlog/.completed-count',
  },
  prompts: {
    agent: './scripts/backlog/agent.md',
    product: './scripts/backlog/product.md',
    ux: './scripts/backlog/ux.md',
    code: './scripts/backlog/code.md',
  },
  validationCommand: 'bash scripts/backlog/validate.sh',
});

describe('interactive helpers', () => {
  it('resolves tools from number or name', () => {
    expect(resolveToolChoice('2', 'claude')).toBe('codex');
    expect(resolveToolChoice('codex', 'claude')).toBe('codex');
    expect(resolveToolChoice('', 'codex')).toBe('codex');
    expect(resolveToolChoice('unknown', 'codex')).toBe('codex');
  });

  it('renders a readable summary of selected options', () => {
    const summary = summarizeRunOverrides(config, {
      tool: 'codex',
      model: '',
      passModel: '',
      passes: true,
      passFrequency: 10,
      worktrees: false,
    });

    expect(summary).toContain('Tool:           codex');
    expect(summary).toContain('Model:          CLI default');
    expect(summary).toContain('Pass model:     same as main model / CLI default');
    expect(summary).toContain('Worktrees:      disabled');
  });
});
