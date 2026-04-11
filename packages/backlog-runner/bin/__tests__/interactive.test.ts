import { describe, expect, it } from 'vitest';
import { normalizeBacklogRunnerConfig } from '../../src/config.js';
import {
  promptForStartOverrides,
  resolveToolChoice,
  resolveWorkerChoice,
  shouldPromptInteractively,
  summarizeStartOverrides,
  type InteractivePrompter,
} from '../interactive.js';

function makeConfig() {
  return normalizeBacklogRunnerConfig(
    {
      files: {
        backlog: './backlog.md',
        candidateQueue: './backlog/inbox.jsonl',
        stop: './backlog-stop',
        runtimeReport: './.backlog-runner/runtime-report.md',
        patterns: './scripts/backlog/patterns.md',
        progress: './scripts/backlog/progress.txt',
      },
      prompts: {
        agent: './scripts/backlog/agent.md',
        planner: './scripts/backlog/planner.md',
        product: './scripts/backlog/product.md',
        ux: './scripts/backlog/ux.md',
        code: './scripts/backlog/code.md',
      },
      validationCommand: 'bash scripts/backlog/validate.sh',
      runners: {
        task: { tool: 'codex', model: 'gpt-5.4' },
        planner: { tool: 'claude', model: 'claude-opus-4-6' },
        product: { tool: 'codex', model: 'gpt-5.4' },
        ux: { tool: 'claude', model: 'claude-sonnet-4-6' },
        code: { tool: 'codex', model: 'gpt-5.4' },
      },
      defaults: {
        workers: 2,
        passes: true,
        worktrees: true,
      },
    },
    '/tmp/backlog.config.mjs',
  );
}

class FakePrompter implements InteractivePrompter {
  readonly writes: string[] = [];
  readonly prompts: string[] = [];

  constructor(private readonly answers: string[]) {}

  async question(prompt: string): Promise<string> {
    this.prompts.push(prompt);
    return this.answers.shift() ?? '';
  }

  write(message: string): void {
    this.writes.push(message);
  }

  close(): void {}
}

describe('interactive helpers', () => {
  it('resolves tool overrides from number or name', () => {
    expect(resolveToolChoice('3', 'claude')).toBe('codex');
    expect(resolveToolChoice('claude', 'codex')).toBe('claude');
    expect(resolveToolChoice('', 'codex')).toBeUndefined();
    expect(resolveToolChoice('repo', 'codex')).toBeUndefined();
  });

  it('resolves worker counts within the allowed range', () => {
    expect(resolveWorkerChoice('3', 1)).toBe(3);
    expect(resolveWorkerChoice('', 2)).toBe(2);
    expect(resolveWorkerChoice('0', 2)).toBe(2);
    expect(resolveWorkerChoice('99', 2, 8)).toBe(2);
  });

  it('renders a readable launch summary including shared-workspace worker limits', () => {
    const summary = summarizeStartOverrides({
      tool: undefined,
      runners: undefined,
      repoRunners: makeConfig().runners,
      workers: 3,
      model: undefined,
      passes: true,
      worktrees: false,
    });

    expect(summary).toContain('Workspace mode:            shared workspace');
    expect(summary).toContain('Requested task workers:    3 requested, 1 effective in shared workspace');
    expect(summary).toContain('Discovery when queue is empty: enabled');
    expect(summary).toContain('Runners:');
    expect(summary).toContain('  task    codex · gpt-5.4');
    expect(summary).toContain('  planner claude · claude-opus-4-6');
  });

  it('only prompts interactively for start when a TTY is present, no explicit overrides were supplied, and --yes is absent', () => {
    expect(shouldPromptInteractively('start', {})).toBeTypeOf('boolean');
    expect(shouldPromptInteractively('doctor', {})).toBe(false);
    expect(shouldPromptInteractively('start', { workers: 3 })).toBe(false);
    expect(shouldPromptInteractively('start', {}, { yes: true })).toBe(false);
  });

  it('returns repo defaults immediately when the user accepts them', async () => {
    const config = makeConfig();
    const prompter = new FakePrompter(['']);

    const overrides = await promptForStartOverrides(config, {}, prompter);

    expect(overrides).toMatchObject({
      tool: undefined,
      workers: 2,
      model: undefined,
      passes: true,
      worktrees: true,
      interactive: true,
    });
    expect(prompter.prompts).toHaveLength(1);
    expect(prompter.writes.join('')).toContain('Repo defaults');
  });

  it('guides the user through customizing launch settings', async () => {
    const config = makeConfig();
    const prompter = new FakePrompter([
      'customize',
      '2',
      '4',
      'n',
      '1',
      '2',
      'gpt-5.4-mini',
      '',
    ]);

    const overrides = await promptForStartOverrides(config, {}, prompter);

    expect(overrides).toMatchObject({
      tool: 'claude',
      workers: 4,
      model: 'gpt-5.4-mini',
      passes: false,
      worktrees: false,
      interactive: true,
    });
    expect(prompter.prompts).toEqual([
      'Press Enter to start with repo defaults, type "customize" to change launch settings, or "cancel" to abort: ',
      'Workspace mode [1-2] (1): ',
      'Requested task workers [1-8] (2, shared workspace still runs 1 at a time): ',
      'Enable discovery when the queue is empty? [Y/n] (yes): ',
      'Runner setup [1-2] (1): ',
      'Tool override [1-3 or name] (repo defaults): ',
      'Model override (blank keeps repo defaults) (repo defaults): ',
      'Press Enter to launch, type "edit" to revise, or "cancel" to abort: ',
    ]);
    expect(prompter.writes.join('')).toContain('Runner setup options');
    expect(prompter.writes.join('')).toContain('shared workspace');
  });

  it('guides the user through a mixed per-role runner setup', async () => {
    const config = makeConfig();
    const prompter = new FakePrompter([
      'customize',
      '1',
      '2',
      'y',
      '2',
      '3',
      'gpt-5.4',
      '2',
      'claude-opus-4-6',
      '',
      '',
      '1',
      '',
      '3',
      'gpt-5.4-mini',
      '',
    ]);

    const overrides = await promptForStartOverrides(config, {}, prompter);

    expect(overrides).toMatchObject({
      tool: undefined,
      model: undefined,
      workers: 2,
      passes: true,
      worktrees: true,
      interactive: true,
      runners: {
        task: { tool: 'codex', model: 'gpt-5.4' },
        planner: { tool: 'claude', model: 'claude-opus-4-6' },
        product: { tool: undefined, model: undefined },
        ux: { tool: undefined, model: undefined },
        code: { tool: 'codex', model: 'gpt-5.4-mini' },
      },
    });
    expect(prompter.prompts).toContain('Runner setup [1-2] (1): ');
    expect(prompter.prompts).toContain('  Tool [1-3 or name] (claude): ');
    expect(prompter.prompts).toContain('  Model (blank keeps repo default) (claude-opus-4-6): ');
    expect(prompter.writes.join('')).toContain('Per-role runner setup');
    expect(prompter.writes.join('')).toContain('Planner runner');
    expect(prompter.writes.join('')).toContain('Runners:\n  task    codex · gpt-5.4');
  });
});
