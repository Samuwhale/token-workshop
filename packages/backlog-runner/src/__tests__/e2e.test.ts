import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeBacklogRunnerConfig } from '../config.js';
import { runBacklogRunner } from '../scheduler.js';
import { writeTaskSpec } from '../task-specs.js';
import { createFileBackedTaskStore, FileBackedTaskStore } from '../store/task-store.js';
import type { BacklogTaskSpec, CommandResult, CommandRunner, LogSink } from '../types.js';

const tempDirs: string[] = [];

class MemoryLogSink implements LogSink {
  readonly lines: string[] = [];

  write(line: string): void {
    this.lines.push(line);
  }

  async close(): Promise<void> {
    // no-op
  }
}

function createFakeCommandRunner(
  root: string,
  options: {
    validationOk?: boolean;
    changedFiles?: string[];
    statusResponses?: string[][];
    calls?: string[];
    emitFollowup?: boolean;
    failCommitMessages?: string[];
    onGitCommit?: (message: string) => Promise<void> | void;
  } = {},
): CommandRunner {
  return {
    async run(command: string, args: string[]): Promise<CommandResult> {
      options.calls?.push(`run:${command} ${args.join(' ')}`.trim());
      if (command === 'claude') {
        await writeFile(
          path.join(root, 'scripts/backlog/progress.txt'),
          '# Backlog Progress Log\nStarted: today\n---\n## run\nbody\n---\n',
          'utf8',
        );
        if (options.emitFollowup) {
          await writeFile(
            path.join(root, '.backlog-runner', 'followups.jsonl'),
            `${JSON.stringify({
              title: 'Audit token import edge cases',
              context: 'Found while implementing the assigned task',
              priority: 'high',
            })}\n`,
            'utf8',
          );
        }
        return {
          code: 0,
          stdout: JSON.stringify({
            structured_output: { status: 'done', item: 'test item', note: 'implemented' },
          }),
          stderr: '',
        };
      }

      if (command === 'git') {
        if (args[0] === 'status') {
          const files = options.statusResponses?.shift() ?? options.changedFiles ?? ['feature.txt'];
          return {
            code: 0,
            stdout: files.map(file => ` M ${file}`).join('\n'),
            stderr: '',
          };
        }
        if (args[0] === 'commit' && args[1] === '-m') {
          const message = args[2] ?? '';
          await options.onGitCommit?.(message);
          if (options.failCommitMessages?.includes(message)) {
            return { code: 1, stdout: '', stderr: 'commit failed' };
          }
          return { code: 0, stdout: '', stderr: '' };
        }
        if (args[0] === 'remote') {
          return { code: 0, stdout: '', stderr: '' };
        }
        return { code: 0, stdout: '', stderr: '' };
      }

      return { code: 0, stdout: '', stderr: '' };
    },
    async runShell(): Promise<CommandResult> {
      options.calls?.push(`shell:${options.validationOk === false ? 'fail' : 'pass'}`);
      return options.validationOk === false
        ? { code: 1, stdout: '', stderr: 'validation failed' }
        : { code: 0, stdout: 'validation passed', stderr: '' };
    },
    async which(): Promise<string | null> {
      return '/usr/bin/mock';
    },
  };
}

async function makeFixture(tasks: BacklogTaskSpec[]) {
  const root = await mkdtemp(path.join(tmpdir(), 'backlog-e2e-test-'));
  tempDirs.push(root);
  await mkdir(path.join(root, 'scripts/backlog'), { recursive: true });
  await mkdir(path.join(root, 'backlog/tasks'), { recursive: true });
  await mkdir(path.join(root, '.backlog-runner'), { recursive: true });
  await writeFile(path.join(root, 'backlog.md'), '', 'utf8');
  await writeFile(path.join(root, 'backlog-inbox.md'), '', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/patterns.md'), '# Patterns\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/progress.txt'), '# Backlog Progress Log\nStarted: today\n---\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/archive.md'), '# Backlog Archive\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/agent.md'), 'agent prompt', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/product.md'), 'product prompt', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/ux.md'), 'ux prompt', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/code.md'), 'code prompt', 'utf8');

  const config = normalizeBacklogRunnerConfig(
    {
      files: {
        backlog: './backlog.md',
        inbox: './backlog-inbox.md',
        taskSpecsDir: './backlog/tasks',
        stop: './backlog-stop',
        patterns: './scripts/backlog/patterns.md',
        progress: './scripts/backlog/progress.txt',
        stateDb: './.backlog-runner/state.sqlite',
        runnerLogDir: './scripts/backlog',
        runtimeDir: './.backlog-runner',
      },
      prompts: {
        agent: './scripts/backlog/agent.md',
        product: './scripts/backlog/product.md',
        ux: './scripts/backlog/ux.md',
        code: './scripts/backlog/code.md',
      },
      validationCommand: 'bash scripts/backlog/validate.sh',
      validationProfiles: {
        repo: 'bash scripts/backlog/validate.sh',
      },
      defaults: {
        tool: 'claude',
        model: 'default',
        passModel: '',
        passes: false,
        passFrequency: 10,
        worktrees: false,
      },
    },
    path.join(root, 'backlog.config.mjs'),
  );

  for (const task of tasks) {
    await writeTaskSpec(config.files.taskSpecsDir, task);
  }
  return { root, config };
}

function baseTask(overrides: Partial<BacklogTaskSpec> = {}): BacklogTaskSpec {
  return {
    id: overrides.id ?? 'task-a',
    title: overrides.title ?? 'test item',
    priority: overrides.priority ?? 'normal',
    dependsOn: overrides.dependsOn ?? [],
    touchPaths: overrides.touchPaths ?? ['feature.txt'],
    capabilities: overrides.capabilities ?? [],
    validationProfile: overrides.validationProfile ?? 'repo',
    statusNotes: overrides.statusNotes ?? ['Seeded by test.'],
    state: overrides.state ?? 'ready',
    acceptanceCriteria: overrides.acceptanceCriteria ?? ['test item'],
    source: overrides.source ?? 'manual',
    createdAt: overrides.createdAt ?? '2026-04-08T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-08T00:00:00.000Z',
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('runner e2e', () => {
  it('finalizes code changes before marking a non-worktree task done', async () => {
    const { root, config } = await makeFixture([baseTask()]);
    const logSink = new MemoryLogSink();
    const calls: string[] = [];
    const events: string[] = [];

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, {
          calls,
          onGitCommit: async message => {
            if (message === 'chore(backlog): done – test item') {
              const taskState = await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8');
              events.push(taskState.includes('state: done') ? 'done-before-finalize' : 'not-done-before-finalize');
            }
          },
        }),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    expect(await readFile(path.join(root, 'backlog.md'), 'utf8')).toContain('- [x] test item');
    expect(await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8')).toContain('state: done');
    expect(logSink.lines.join('')).toContain('validation passed');
    expect(logSink.lines.join('')).toContain('Marked done after finalize');
    expect(events).toContain('not-done-before-finalize');
    expect(calls.indexOf('shell:pass')).toBeGreaterThan(-1);
    expect(calls.indexOf('run:git commit -m chore(backlog): done – test item')).toBeGreaterThan(calls.indexOf('shell:pass'));
    expect(calls.indexOf('run:git commit -m chore(backlog): planner sync – test item')).toBeGreaterThan(
      calls.indexOf('run:git commit -m chore(backlog): done – test item'),
    );
  });

  it('marks the task failed when validation fails', async () => {
    const { root, config } = await makeFixture([baseTask()]);
    const logSink = new MemoryLogSink();

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, { validationOk: false }),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    expect(await readFile(path.join(root, 'backlog.md'), 'utf8')).toContain('- [!] test item');
    expect(await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8')).toContain('state: failed');
    expect(logSink.lines.join('')).toContain('validation failed');
  });

  it('fails the task when the agent edits files outside the declared touch_paths', async () => {
    const { root, config } = await makeFixture([baseTask({ touchPaths: ['allowed.txt'] })]);
    const logSink = new MemoryLogSink();

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, { changedFiles: ['feature.txt'] }),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    expect(await readFile(path.join(root, 'backlog.md'), 'utf8')).toContain('- [!] test item');
    expect(await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8')).toContain('write scope violation');
    expect(logSink.lines.join('')).toContain('write scope violation');
  });

  it('fails the task when validation introduces files outside the declared touch_paths', async () => {
    const { root, config } = await makeFixture([baseTask({ touchPaths: ['feature.txt'] })]);
    const logSink = new MemoryLogSink();

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, {
          statusResponses: [['feature.txt'], ['feature.txt', 'packages/server/generated.ts']],
        }),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    expect(await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8')).toContain('post-validation scope violation');
    expect(logSink.lines.join('')).toContain('validation introduced out-of-scope changes');
  });

  it('does not release a dependency-blocked task during the initial finalize commit', async () => {
    const { root, config } = await makeFixture([
      baseTask(),
      baseTask({ id: 'task-b', title: 'Task B', dependsOn: ['task-a'], touchPaths: ['other.txt'] }),
    ]);
    const logSink = new MemoryLogSink();
    let downstreamClaimId: string | null = 'unexpected';

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, {
          onGitCommit: async message => {
            if (message !== 'chore(backlog): done – test item') return;
            const store = createFileBackedTaskStore(config);
            const claim = await store.claimNextRunnableTask('runner-b');
            downstreamClaimId = claim?.task.id ?? null;
            await store.close();
          },
        }),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    expect(downstreamClaimId).toBeNull();
    expect(await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8')).toContain('state: done');
    expect(logSink.lines.join('')).toContain('Marked done after finalize');
  });

  it('fails the task without ever marking it done when the initial finalize commit fails', async () => {
    const { root, config } = await makeFixture([baseTask()]);
    const logSink = new MemoryLogSink();
    const calls: string[] = [];
    const events: string[] = [];

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, {
          calls,
          failCommitMessages: ['chore(backlog): done – test item'],
          onGitCommit: async message => {
            if (message === 'chore(backlog): done – test item') {
              const taskState = await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8');
              events.push(taskState.includes('state: done') ? 'done-before-finalize' : 'not-done-before-finalize');
            }
          },
        }),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    expect(await readFile(path.join(root, 'backlog.md'), 'utf8')).toContain('- [!] test item');
    expect(await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8')).toContain('state: failed');
    expect(events).toContain('not-done-before-finalize');
    expect(logSink.lines.join('')).toContain('marked failed');
    expect(calls).not.toContain('run:git commit -m chore(backlog): planner sync – test item');
  });

  it('closes the task store during runner shutdown', async () => {
    const { root, config } = await makeFixture([baseTask()]);
    const closeSpy = vi.spyOn(FileBackedTaskStore.prototype, 'close');

    try {
      await runBacklogRunner(
        config,
        {},
        {
          commandRunner: createFakeCommandRunner(root),
          createLogSink: async () => new MemoryLogSink(),
          sleep: async () => undefined,
        },
      );
    } finally {
      expect(closeSpy).toHaveBeenCalledTimes(1);
      closeSpy.mockRestore();
    }
  });
});
