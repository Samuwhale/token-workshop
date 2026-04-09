import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeBacklogRunnerConfig } from '../config.js';
import {
  validateBacklogState,
  validateCommandReadiness,
  validateGitReadiness,
} from '../validate.js';
import type { BacklogRunnerConfig, CommandResult, CommandRunner } from '../types.js';

const tempDirs: string[] = [];

function createCommandRunner(overrides: {
  run?: (command: string, args: string[]) => Promise<CommandResult>;
  runShell?: (command: string) => Promise<CommandResult>;
  which?: (command: string) => Promise<string | null>;
} = {}): CommandRunner {
  return {
    async run(command: string, args: string[]): Promise<CommandResult> {
      if (overrides.run) {
        return overrides.run(command, args);
      }
      if (command === 'git' && args[0] === 'rev-parse') {
        return { code: 0, stdout: 'true', stderr: '' };
      }
      return { code: 0, stdout: '', stderr: '' };
    },
    async runShell(command: string): Promise<CommandResult> {
      if (overrides.runShell) {
        return overrides.runShell(command);
      }
      return { code: 0, stdout: '/usr/bin/mock\n', stderr: '' };
    },
    async which(command: string): Promise<string | null> {
      if (overrides.which) {
        return overrides.which(command);
      }
      return command === 'git' ? '/usr/bin/git' : '/usr/bin/mock';
    },
  };
}

async function makeFixture(options: {
  backlogContent?: string;
  taskFiles?: Record<string, string>;
  validationCommand?: string;
  candidateQueue?: boolean;
} = {}): Promise<BacklogRunnerConfig> {
  const root = await mkdtemp(path.join(tmpdir(), 'backlog-validate-test-'));
  tempDirs.push(root);

  await mkdir(path.join(root, 'scripts/backlog'), { recursive: true });
  await mkdir(path.join(root, 'backlog/tasks'), { recursive: true });
  await mkdir(path.join(root, 'backlog'), { recursive: true });
  await writeFile(path.join(root, 'backlog.md'), options.backlogContent ?? '# Backlog\n', 'utf8');
  if (options.candidateQueue !== false) {
    await writeFile(path.join(root, 'backlog/inbox.jsonl'), '', 'utf8');
  }
  await writeFile(path.join(root, 'backlog-stop'), '', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/patterns.md'), '# Patterns\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/progress.txt'), '# Progress\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/agent.md'), 'agent prompt', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/planner.md'), 'planner prompt', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/product.md'), 'product prompt', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/ux.md'), 'ux prompt', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/code.md'), 'code prompt', 'utf8');

  for (const [name, content] of Object.entries(options.taskFiles ?? {})) {
    await writeFile(path.join(root, 'backlog/tasks', name), content, 'utf8');
  }

  return normalizeBacklogRunnerConfig(
    {
      files: {
        backlog: './backlog.md',
        candidateQueue: './backlog/inbox.jsonl',
        taskSpecsDir: './backlog/tasks',
        stop: './backlog-stop',
        runtimeReport: './.backlog-runner/runtime-report.md',
        patterns: './scripts/backlog/patterns.md',
        progress: './scripts/backlog/progress.txt',
        stateDb: './.backlog-runner/state.sqlite',
        runnerLogDir: './.backlog-runner/logs',
        runtimeDir: './.backlog-runner',
      },
      prompts: {
        agent: './scripts/backlog/agent.md',
        planner: './scripts/backlog/planner.md',
        product: './scripts/backlog/product.md',
        ux: './scripts/backlog/ux.md',
        code: './scripts/backlog/code.md',
      },
      validationCommand: options.validationCommand ?? 'bash scripts/backlog/validate.sh',
      defaults: {
        tool: 'codex',
        lane: 'executor',
        passes: false,
        worktrees: false,
      },
    },
    path.join(root, 'backlog.config.mjs'),
  );
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('validate helpers', () => {
  it('flags a missing validation script', async () => {
    const config = await makeFixture();

    await expect(validateCommandReadiness(config, createCommandRunner())).resolves.toEqual({
      ok: false,
      message: '  ✗ validation command script not found',
    });
  });

  it('flags a missing validation executable for non-script commands', async () => {
    const config = await makeFixture({ validationCommand: 'pnpm lint' });

    await expect(
      validateCommandReadiness(
        config,
        createCommandRunner({
          runShell: async () => ({ code: 1, stdout: '', stderr: '' }),
        }),
      ),
    ).resolves.toEqual({
      ok: false,
      message: "  ✗ validation command executable 'pnpm' not found",
    });
  });

  it('detects legacy backlog mode when task specs are empty', async () => {
    const config = await makeFixture({
      backlogContent: '# Backlog\n\n- [ ] Legacy task\n',
    });

    await expect(validateBacklogState(config)).resolves.toMatchObject({
      ok: false,
      messages: [
        '  ✗ backlog is still in legacy markdown mode; create task specs in backlog/tasks before autonomous runs',
      ],
    });
  });

  it('accepts generated report mode when task specs exist', async () => {
    const config = await makeFixture({
      backlogContent: '# UX Improvement Backlog\n\n<!-- This file is generated by packages/backlog-runner from backlog/tasks/*.yaml. -->\n',
      taskFiles: {
        'task-a.yaml': 'id: task-a\ntitle: Task A\npriority: normal\ntask_kind: implementation\ndepends_on: []\ntouch_paths:\n  - feature.txt\ncapabilities: []\nvalidation_profile: repo\nstatus_notes:\n  - Seeded\nstate: ready\nacceptance_criteria:\n  - Task A\nsource: manual\ncreated_at: 2026-04-08T00:00:00.000Z\nupdated_at: 2026-04-08T00:00:00.000Z\n',
      },
    });

    const result = await validateBacklogState(config);
    expect(result.ok).toBe(true);
    expect(result.messages).toContain('  ✓ task spec store is populated (1 task spec)');
    expect(result.messages).toContain('  ✓ backlog.md is the generated report');
    expect(result.messages).toContain('  ✓ candidate queue file found');
  });

  it('flags a missing candidate queue file', async () => {
    const config = await makeFixture({ candidateQueue: false });

    const result = await validateBacklogState(config);
    expect(result.ok).toBe(false);
    expect(result.messages).toContain('  ✗ candidate queue file not found');
  });

  it('checks git readiness without worktree add/remove when worktrees are disabled', async () => {
    const calls: string[] = [];
    const config = await makeFixture();

    const result = await validateGitReadiness(
      config,
      false,
      createCommandRunner({
        run: async (command, args) => {
          calls.push(`${command} ${args.join(' ')}`);
          if (command === 'git' && args[0] === 'rev-parse') {
            return { code: 0, stdout: 'true', stderr: '' };
          }
          return { code: 0, stdout: '', stderr: '' };
        },
      }),
    );

    expect(result.ok).toBe(true);
    expect(calls).toEqual(['git rev-parse --is-inside-work-tree']);
  });

  it('checks git worktree add/remove readiness when worktrees are enabled', async () => {
    const calls: string[] = [];
    const config = await makeFixture();

    const result = await validateGitReadiness(
      config,
      true,
      createCommandRunner({
        run: async (command, args) => {
          calls.push(`${command} ${args.join(' ')}`);
          if (command === 'git' && args[0] === 'rev-parse') {
            return { code: 0, stdout: 'true', stderr: '' };
          }
          return { code: 0, stdout: '', stderr: '' };
        },
      }),
    );

    expect(result.ok).toBe(true);
    expect(calls.some(call => call.startsWith('git worktree add --detach '))).toBe(true);
    expect(calls.some(call => call.startsWith('git worktree remove '))).toBe(true);
    expect(calls).toContain('git worktree prune');
  });
});
