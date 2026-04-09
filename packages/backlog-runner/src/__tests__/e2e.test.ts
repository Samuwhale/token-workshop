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
    validationResponses?: boolean[];
    changedFiles?: string[];
    statusResponses?: string[][];
    initialStagedFiles?: string[];
    clearStagedFilesOnRepair?: boolean;
    remoteName?: string;
    failPushCount?: number;
    calls?: string[];
    emitFollowup?: boolean;
    plannerOutput?: Record<string, unknown>;
    plannerOutputs?: Record<string, unknown>[];
    failCommitMessages?: string[];
    failCommitCounts?: Record<string, number>;
    onGitCommit?: (message: string) => Promise<void> | void;
  } = {},
): CommandRunner {
  const stagedFiles = new Set(options.initialStagedFiles ?? []);
  const remainingCommitFailures = new Map<string, number>(
    Object.entries(options.failCommitCounts ?? {}),
  );
  let remainingPushFailures = options.failPushCount ?? 0;
  const validationResponses = [...(options.validationResponses ?? [])];

  return {
    async run(command: string, args: string[], runOptions?: { input?: string }): Promise<CommandResult> {
      options.calls?.push(`run:${command} ${args.join(' ')}`.trim());
      if (command === 'claude') {
        if (runOptions?.input) {
          options.calls?.push(`input:${runOptions.input}`);
        }
        const isRepairPrompt = runOptions?.input?.includes('## Workspace Repair Mode') || runOptions?.input?.includes('## Reconciliation Mode');
        if (runOptions?.input === 'planner prompt') {
          const plannerOutput = options.plannerOutputs?.shift() ?? options.plannerOutput;
          return {
            code: 0,
            stdout: JSON.stringify({
              structured_output: plannerOutput ?? {
                status: 'done',
                item: 'planner-pass',
                note: 'superseded one parent',
                action: 'supersede',
                parent_task_ids: ['task-a'],
                children: [{
                  title: 'Research test item implementation plan',
                  task_kind: 'research',
                  priority: 'normal',
                  touch_paths: ['packages/figma-plugin/src/ui'],
                  acceptance_criteria: ['Concrete follow-up implementation tasks are written to backlog/inbox.jsonl'],
                  context: 'Inspect the test item surface and emit concrete implementation follow-ups.',
                }],
              },
            }),
            stderr: '',
          };
        }
        if (isRepairPrompt && options.clearStagedFilesOnRepair) {
          stagedFiles.clear();
        }
        await writeFile(
          path.join(root, 'scripts/backlog/progress.txt'),
          '# Backlog Progress Log\nStarted: today\n---\n## run\nbody\n---\n',
          'utf8',
        );
        if (options.emitFollowup) {
          await writeFile(
            path.join(root, 'backlog', 'inbox.jsonl'),
            `${JSON.stringify({
              title: 'Audit token import edge cases',
              touch_paths: ['packages/server/src/token-store.ts'],
              acceptance_criteria: ['Audit token import edge cases is captured as a task'],
              context: 'Found while implementing the assigned task',
              priority: 'high',
              source: 'task-followup',
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
        if (args[0] === 'add') {
          for (const file of args.slice(2)) {
            stagedFiles.add(file);
          }
          return { code: 0, stdout: '', stderr: '' };
        }
        if (args[0] === 'diff' && args[1] === '--cached' && args[2] === '--name-only') {
          return { code: 0, stdout: [...stagedFiles].join('\n'), stderr: '' };
        }
        if (args[0] === 'commit' && args[1] === '-m') {
          const message = args[2] ?? '';
          await options.onGitCommit?.(message);
          const remainingFailures = remainingCommitFailures.get(message) ?? 0;
          if (remainingFailures > 0) {
            remainingCommitFailures.set(message, remainingFailures - 1);
            return { code: 1, stdout: '', stderr: 'commit failed' };
          }
          if (options.failCommitMessages?.includes(message)) {
            return { code: 1, stdout: '', stderr: 'commit failed' };
          }
          stagedFiles.clear();
          return { code: 0, stdout: '', stderr: '' };
        }
        if (args[0] === 'remote') {
          return { code: 0, stdout: options.remoteName ?? '', stderr: '' };
        }
        if (args[0] === 'push') {
          if (remainingPushFailures > 0) {
            remainingPushFailures -= 1;
            return { code: 1, stdout: '', stderr: 'push failed' };
          }
          return { code: 0, stdout: '', stderr: '' };
        }
        if (args[0] === 'pull') {
          return { code: 0, stdout: '', stderr: '' };
        }
        return { code: 0, stdout: '', stderr: '' };
      }

      return { code: 0, stdout: '', stderr: '' };
    },
    async runShell(): Promise<CommandResult> {
      const nextValidation = validationResponses.length > 0 ? validationResponses.shift() : options.validationOk !== false;
      options.calls?.push(`shell:${nextValidation === false ? 'fail' : 'pass'}`);
      return nextValidation === false
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
  await mkdir(path.join(root, 'backlog'), { recursive: true });
  await mkdir(path.join(root, '.backlog-runner'), { recursive: true });
  await writeFile(path.join(root, 'backlog.md'), '', 'utf8');
  await writeFile(path.join(root, 'backlog/inbox.jsonl'), '', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/patterns.md'), '# Patterns\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/progress.txt'), '# Backlog Progress Log\nStarted: today\n---\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/archive.md'), '# Backlog Archive\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/agent.md'), 'agent prompt', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/planner.md'), 'planner prompt', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/product.md'), 'product prompt', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/ux.md'), 'ux prompt', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/code.md'), 'code prompt', 'utf8');

  const config = normalizeBacklogRunnerConfig(
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
        runnerLogDir: './scripts/backlog',
        runtimeDir: './.backlog-runner',
      },
      prompts: {
        agent: './scripts/backlog/agent.md',
        planner: './scripts/backlog/planner.md',
        product: './scripts/backlog/product.md',
        ux: './scripts/backlog/ux.md',
        code: './scripts/backlog/code.md',
      },
      validationCommand: 'bash scripts/backlog/validate.sh',
      validationProfiles: {
        repo: 'bash scripts/backlog/validate.sh',
        backlog: 'bash scripts/backlog/validate.sh',
      },
      defaults: {
        tool: 'claude',
        lane: 'executor',
        model: 'default',
        passModel: 'sonnet',
        passes: false,
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
    taskKind: overrides.taskKind ?? 'implementation',
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

async function stopAfterFirstSleep(filePath: string): Promise<void> {
  await writeFile(filePath, 'stop\n', 'utf8');
}

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
              events.push(taskState.includes('state: done') ? 'done-at-finalize' : 'not-done-at-finalize');
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
    expect(events).toContain('done-at-finalize');
    expect(calls.indexOf('shell:pass')).toBeGreaterThan(-1);
    expect(calls.indexOf('run:git commit -m chore(backlog): done – test item')).toBeGreaterThan(calls.indexOf('shell:pass'));
    expect(calls).not.toContain('run:git commit -m chore(backlog): planner sync – test item');
  });

  it('defers the task after remediation when validation still fails', async () => {
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

    const taskYaml = await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8');
    const runtimeReport = await readFile(config.files.runtimeReport, 'utf8');

    expect(taskYaml).toContain('state: ready');
    expect(taskYaml).toContain('Deferred after remediation: validation failed: validation failed');
    expect(logSink.lines.join('')).toContain('Attempting autonomous workspace repair');
    expect(runtimeReport).toContain('remediation: validation failed: validation failed');
  });

  it('defers the task after remediation when the agent edits files outside the declared touch_paths', async () => {
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

    const taskYaml = await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8');
    const runtimeReport = await readFile(config.files.runtimeReport, 'utf8');

    expect(taskYaml).toContain('state: ready');
    expect(taskYaml).toContain('Deferred after remediation: write scope violation: touched feature.txt');
    expect(logSink.lines.join('')).toContain('Attempting autonomous workspace repair');
    expect(runtimeReport).toContain('remediation: write scope violation: touched feature.txt');
  });

  it('defers the task after remediation when validation introduces files outside the declared touch_paths', async () => {
    const { root, config } = await makeFixture([baseTask({ touchPaths: ['feature.txt'] })]);
    const logSink = new MemoryLogSink();

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, {
          statusResponses: [
            ['feature.txt'],
            ['feature.txt', 'packages/server/generated.ts'],
            ['feature.txt', 'packages/server/generated.ts'],
            ['feature.txt', 'packages/server/generated.ts'],
          ],
        }),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    const taskYaml = await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8');
    const runtimeReport = await readFile(config.files.runtimeReport, 'utf8');

    expect(taskYaml).toContain('state: ready');
    expect(taskYaml).toContain('Deferred after remediation: post-validation scope violation: touched packages/server/generated.ts');
    expect(logSink.lines.join('')).toContain('Attempting autonomous workspace repair');
    expect(runtimeReport).toContain('remediation: post-validation scope violation: touched packages/server/generated.ts');
  });

  it('allows bookkeeping files during execution scope validation', async () => {
    const { root, config } = await makeFixture([baseTask({ touchPaths: ['feature.txt'] })]);
    const logSink = new MemoryLogSink();

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, {
          statusResponses: [
            ['feature.txt', 'scripts/backlog/progress.txt', 'scripts/backlog/patterns.md'],
            ['feature.txt', 'scripts/backlog/progress.txt', 'scripts/backlog/patterns.md'],
          ],
        }),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    expect(await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8')).toContain('state: done');
    expect(logSink.lines.join('')).not.toContain('write scope violation');
    expect(logSink.lines.join('')).toContain('Marked done after finalize');
  });

  it('defers the claim when remediation cannot clean unrelated staged files before execution', async () => {
    const { root, config } = await makeFixture([baseTask({ touchPaths: ['feature.txt'] })]);
    const logSink = new MemoryLogSink();
    const calls: string[] = [];

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, {
          calls,
          initialStagedFiles: ['user-staged.txt'],
        }),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    const taskYaml = await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8');
    const runtimeReport = await readFile(config.files.runtimeReport, 'utf8');

    expect(taskYaml).toContain('state: ready');
    expect(taskYaml).toContain('Deferred after remediation: dirty workspace preflight: staged user-staged.txt');
    expect(calls).not.toContain('input:agent prompt');
    expect(calls.some(call => call.includes('## Workspace Repair Mode'))).toBe(true);
    expect(logSink.lines.join('')).toContain('dirty workspace preflight');
    expect(runtimeReport).toContain('Queue: 0 ready · 1 blocked');
    expect(runtimeReport).toContain('remediation: dirty workspace preflight: staged user-staged.txt');
  });

  it('continues execution when remediation clears staged preflight issues', async () => {
    const { root, config } = await makeFixture([baseTask({ touchPaths: ['feature.txt'] })]);
    const calls: string[] = [];

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, {
          calls,
          initialStagedFiles: ['user-staged.txt'],
          clearStagedFilesOnRepair: true,
        }),
        createLogSink: async () => new MemoryLogSink(),
        sleep: async () => undefined,
      },
    );

    const taskYaml = await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8');

    expect(taskYaml).toContain('state: done');
    expect(taskYaml).toContain('Recovered by remediation');
    expect(calls.some(call => call.includes('## Workspace Repair Mode'))).toBe(true);
  });

  it('keeps the completion state in the single final task commit', async () => {
    const { root, config } = await makeFixture([
      baseTask(),
      baseTask({ id: 'task-b', title: 'Task B', dependsOn: ['task-a'], touchPaths: ['other.txt'] }),
    ]);
    const logSink = new MemoryLogSink();
    const commitStates: string[] = [];

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, {
          onGitCommit: async message => {
            if (message !== 'chore(backlog): done – test item') return;
            commitStates.push(await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8'));
          },
        }),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    expect(commitStates.some(content => content.includes('state: done'))).toBe(true);
    expect(await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8')).toContain('state: done');
    expect(logSink.lines.join('')).toContain('Marked done after finalize');
  });

  it('defers the task when the initial finalize commit still fails after remediation', async () => {
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
              events.push(taskState.includes('state: done') ? 'done-at-finalize' : 'not-done-at-finalize');
            }
          },
        }),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    const taskYaml = await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8');

    expect(taskYaml).toContain('state: ready');
    expect(taskYaml).toContain('Deferred after remediation: git commit failed: commit failed');
    expect(events).toContain('done-at-finalize');
    expect(logSink.lines.join('')).toContain('deferred for retry');
    expect(calls).not.toContain('run:git commit -m chore(backlog): planner sync – test item');
  });

  it('reconciles and finalizes autonomously after a transient finalize failure', async () => {
    const { root, config } = await makeFixture([baseTask()]);
    const logSink = new MemoryLogSink();
    const calls: string[] = [];

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, {
          calls,
          remoteName: 'origin',
          failPushCount: 3,
          statusResponses: [
            ['feature.txt'],
            ['feature.txt'],
            ['feature.txt'],
            [],
            [],
            [],
          ],
        }),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    expect(await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8')).toContain('state: done');
    expect(logSink.lines.join('')).toContain('Attempting autonomous reconciliation');
    expect(logSink.lines.join('')).toContain('Reconciliation finalized successfully');
    expect(calls.filter(call => call === 'input:agent prompt')).toHaveLength(1);
    expect(calls.some(call => call.includes('## Reconciliation Mode'))).toBe(true);
    expect(calls.filter(call => call === 'run:git commit -m chore(backlog): done – test item')).toHaveLength(1);
    expect(calls.filter(call => call === 'run:git push')).toHaveLength(4);
  }, 30000);

  it('defers the task when pending-push retry still cannot reach the remote', async () => {
    const { root, config } = await makeFixture([baseTask()]);
    const logSink = new MemoryLogSink();
    const calls: string[] = [];

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, {
          calls,
          remoteName: 'origin',
          failPushCount: 6,
          statusResponses: [
            ['feature.txt'],
            ['feature.txt'],
            ['feature.txt'],
            [],
            [],
            [],
          ],
        }),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    const taskYaml = await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8');
    const runtimeReport = await readFile(config.files.runtimeReport, 'utf8');

    expect(taskYaml).toContain('state: ready');
    expect(taskYaml).toContain('Deferred after remediation: git push failed after retries; local commit preserved for inspection');
    expect(logSink.lines.join('')).toContain('Attempting autonomous reconciliation');
    expect(logSink.lines.join('')).toContain('reconciliation finalize failed');
    expect(calls.filter(call => call === 'run:git commit -m chore(backlog): done – test item')).toHaveLength(1);
    expect(calls.filter(call => call === 'run:git push')).toHaveLength(6);
    expect(runtimeReport).toContain('remediation: git push failed after retries; local commit preserved for inspection');
  }, 30000);

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

  it('prunes git worktrees on startup when worktrees are enabled', async () => {
    const { root, config } = await makeFixture([baseTask()]);
    const calls: string[] = [];

    await runBacklogRunner(
      config,
      { worktrees: true },
      {
        commandRunner: createFakeCommandRunner(root, { calls }),
        createLogSink: async () => new MemoryLogSink(),
        sleep: async () => undefined,
      },
    );

    expect(calls.filter(call => call === 'run:git worktree prune --expire now')).toHaveLength(1);
  });

  it('does not prune git worktrees on startup when worktrees are disabled', async () => {
    const { root, config } = await makeFixture([baseTask()]);
    const calls: string[] = [];

    await runBacklogRunner(
      config,
      { worktrees: false },
      {
        commandRunner: createFakeCommandRunner(root, { calls }),
        createLogSink: async () => new MemoryLogSink(),
        sleep: async () => undefined,
      },
    );

    expect(calls).not.toContain('run:git worktree prune --expire now');
  });

  it('refines planned tasks into research work and clears the parent from the live queue', async () => {
    const { root, config } = await makeFixture([baseTask({
      state: 'planned',
      touchPaths: [],
      statusNotes: ['Imported from legacy backlog.md.', 'Planner could not infer touch_paths from the title; refine this task before execution.'],
    })]);
    const logSink = new MemoryLogSink();

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, {
          statusResponses: [
            [],
            ['scripts/backlog/progress.txt'],
            ['scripts/backlog/progress.txt'],
          ],
        }),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    expect(await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8')).toContain('state: superseded');
    expect(logSink.lines.join('')).toContain('Planner Refinement Pass');
    expect(logSink.lines.join('')).toContain('superseded 1 planner candidate');
    expect(await readFile(path.join(root, 'backlog.md'), 'utf8')).not.toContain('test item (Planned)');
  });

  it('attempts planner refinement before stopping when only failed tasks remain', async () => {
    const { root, config } = await makeFixture([baseTask({
      state: 'failed',
      statusNotes: ['Failed: validation failed: missing dependency'],
    })]);
    const calls: string[] = [];
    const logSink = new MemoryLogSink();

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, {
          calls,
          plannerOutput: {
            status: 'failed',
            item: 'planner-pass',
            note: 'could not safely recover this failed item',
            action: 'supersede',
            parent_task_ids: ['task-a'],
            children: [{
              title: 'Recover failed test item',
              task_kind: 'implementation',
              priority: 'normal',
              touch_paths: ['feature.txt'],
              acceptance_criteria: ['Recover failed task'],
              validation_profile: 'repo',
              capabilities: null,
              context: 'Retry the failed item.',
            }],
          },
        }),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    expect(calls).toContain('input:planner prompt');
    expect(logSink.lines.join('')).toContain('planner refinement skipped');
    expect(logSink.lines.join('')).toContain('No runnable tasks remain and planner refinement made no progress');
  });

  it('recovers failed parents into ready child tasks before executor shutdown', async () => {
    const { root, config } = await makeFixture([baseTask({
      state: 'failed',
      statusNotes: ['Failed: validation failed: missing dependency'],
    })]);
    class StopAfterRecoveryLogSink extends MemoryLogSink {
      override write(line: string): void {
        super.write(line);
        if (line.includes('superseded 1 planner candidate')) {
          void writeFile(path.join(root, 'backlog-stop'), 'stop\n', 'utf8');
        }
      }
    }
    const logSink = new StopAfterRecoveryLogSink();

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, {
          statusResponses: [[]],
          plannerOutput: {
            status: 'done',
            item: 'planner-pass',
            note: 'recovered failed item into a narrower task',
            action: 'supersede',
            parent_task_ids: ['task-a'],
            children: [{
              title: 'Recover failed test item with narrower scope',
              task_kind: 'implementation',
              priority: 'high',
              touch_paths: ['feature.txt'],
              acceptance_criteria: ['Failed task is replaced with a runnable narrower task'],
              validation_profile: 'repo',
              capabilities: null,
              context: 'Recover the failed item with tighter scope.',
            }],
          },
        }),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    const store = createFileBackedTaskStore(config);
    const counts = await store.getQueueCounts();

    try {
      expect(await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8')).toContain('state: superseded');
      expect(logSink.lines.join('')).toContain('superseded 1 planner candidate');
      expect(counts.ready).toBe(1);
      expect(counts.failed).toBe(0);
      const childTask = await store.listPlannerCandidates();
      expect(childTask).toHaveLength(0);
      expect(await readFile(path.join(root, 'backlog.md'), 'utf8')).toContain('Recover failed test item with narrower scope');
    } finally {
      await store.close();
    }
  });

  it('ignores worktree bootstrap node_modules symlinks during planner scope validation', async () => {
    const { root, config } = await makeFixture([baseTask({
      state: 'planned',
      touchPaths: [],
      statusNotes: ['Imported from legacy backlog.md.', 'Planner could not infer touch_paths from the title; refine this task before execution.'],
    })]);
    const logSink = new MemoryLogSink();

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, {
          statusResponses: [
            [
              'node_modules',
              'packages/backlog-runner/node_modules',
              'packages/core/node_modules',
              'packages/figma-plugin/node_modules',
              'packages/server/node_modules',
            ],
            ['scripts/backlog/progress.txt'],
            ['scripts/backlog/progress.txt'],
          ],
        }),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    expect(logSink.lines.join('')).toContain('superseded 1 planner candidate');
    expect(logSink.lines.join('')).not.toContain('planner pass touched repo files');
    expect(logSink.lines.join('')).not.toContain('No runnable tasks remain and planner refinement made no progress');
  });

  it('runs executable work before invoking planner refinement', async () => {
    const { root, config } = await makeFixture([
      baseTask({ id: 'task-ready', title: 'Ready task', touchPaths: ['feature.txt'] }),
      baseTask({
        id: 'task-planned',
        title: 'Planned task',
        state: 'planned',
        touchPaths: [],
        statusNotes: ['Imported from legacy backlog.md.', 'Planner could not infer touch_paths from the title; refine this task before execution.'],
      }),
    ]);
    const calls: string[] = [];

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, { calls }),
        createLogSink: async () => new MemoryLogSink(),
        sleep: async () => undefined,
      },
    );

    const firstPrompt = calls.find(call => call.startsWith('input:'));
    expect(firstPrompt).toBe('input:agent prompt');
    expect(calls).toContain('input:planner prompt');
  });

  it('does not apply planner actions when the planner reports failure', async () => {
    const { root, config } = await makeFixture([baseTask({
      state: 'planned',
      touchPaths: [],
      statusNotes: ['Imported from legacy backlog.md.', 'Planner could not infer touch_paths from the title; refine this task before execution.'],
    })]);
    const logSink = new MemoryLogSink();

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, {
          plannerOutput: {
            status: 'failed',
            item: 'planner-pass',
            note: 'could not safely refine this batch',
            action: 'supersede',
            parent_task_ids: ['task-a'],
            children: [{
              title: 'Research test item implementation plan',
              task_kind: 'research',
              priority: 'normal',
              touch_paths: ['packages/figma-plugin/src/ui'],
              acceptance_criteria: ['Concrete follow-up implementation tasks are written to backlog/inbox.jsonl'],
            }],
          },
          statusResponses: [[]],
        }),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    expect(await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8')).toContain('state: planned');
    expect(logSink.lines.join('')).toContain('planner refinement skipped');
    expect(logSink.lines.join('')).not.toContain('superseded 1 planner candidate');
  });

  it('planner lane refines planned work without executing ready tasks', async () => {
    const { root, config } = await makeFixture([
      baseTask({ id: 'task-ready', title: 'Ready task', touchPaths: ['feature.txt'] }),
      baseTask({
        id: 'task-a',
        title: 'Planned task',
        state: 'planned',
        touchPaths: [],
        statusNotes: ['Imported from legacy backlog.md.', 'Planner could not infer touch_paths from the title; refine this task before execution.'],
      }),
    ]);
    const calls: string[] = [];
    const logSink = new MemoryLogSink();
    let sleepCalls = 0;

    await runBacklogRunner(
      config,
      { lane: 'planner' },
      {
        commandRunner: createFakeCommandRunner(root, {
          calls,
          statusResponses: [[]],
        }),
        createLogSink: async () => logSink,
        sleep: async () => {
          sleepCalls += 1;
          if (sleepCalls === 1) {
            await stopAfterFirstSleep(config.files.stop);
          }
        },
      },
    );

    expect(calls).toContain('input:planner prompt');
    expect(calls).not.toContain('input:agent prompt');
    expect(await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8')).toContain('state: superseded');
    expect(logSink.lines.join('')).toContain('Lane:   planner');
    expect(logSink.lines.join('')).toContain('Planner buffer satisfied (2/2 ready)');
  });

  it('planner lane does not refine when the ready buffer is already full', async () => {
    const { root, config } = await makeFixture([
      baseTask({ id: 'task-ready-a', title: 'Ready A', touchPaths: ['feature-a.txt'] }),
      baseTask({ id: 'task-ready-b', title: 'Ready B', touchPaths: ['feature-b.txt'] }),
      baseTask({
        id: 'task-a',
        title: 'Planned task',
        state: 'planned',
        touchPaths: [],
        statusNotes: ['Imported from legacy backlog.md.', 'Planner could not infer touch_paths from the title; refine this task before execution.'],
      }),
    ]);
    const calls: string[] = [];

    await runBacklogRunner(
      config,
      { lane: 'planner' },
      {
        commandRunner: createFakeCommandRunner(root, { calls }),
        createLogSink: async () => new MemoryLogSink(),
        sleep: async () => {
          await stopAfterFirstSleep(config.files.stop);
        },
      },
    );

    expect(calls).not.toContain('input:planner prompt');
    expect(await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8')).toContain('state: planned');
  });

  it('planner lane polls instead of exiting when refinement makes no progress', async () => {
    const { root, config } = await makeFixture([baseTask({
      state: 'planned',
      touchPaths: [],
      statusNotes: ['Imported from legacy backlog.md.', 'Planner could not infer touch_paths from the title; refine this task before execution.'],
    })]);
    const logSink = new MemoryLogSink();
    let sleepCalls = 0;

    await runBacklogRunner(
      config,
      { lane: 'planner' },
      {
        commandRunner: createFakeCommandRunner(root, {
          plannerOutput: {
            status: 'failed',
            item: 'planner-pass',
            note: 'could not safely refine this batch',
            action: 'supersede',
            parent_task_ids: ['task-a'],
            children: [{
              title: 'Research test item implementation plan',
              task_kind: 'research',
              priority: 'normal',
              touch_paths: ['packages/figma-plugin/src/ui'],
              acceptance_criteria: ['Concrete follow-up implementation tasks are written to backlog/inbox.jsonl'],
            }],
          },
        }),
        createLogSink: async () => logSink,
        sleep: async () => {
          sleepCalls += 1;
          if (sleepCalls === 1) {
            await stopAfterFirstSleep(config.files.stop);
          }
        },
      },
    );

    expect(logSink.lines.join('')).toContain('planner refinement skipped');
    expect(logSink.lines.join('')).toContain('Planner lane made no progress on the current batch');
    expect(logSink.lines.join('')).not.toContain('No runnable tasks remain and planner refinement made no progress');
  });

  it('executor fallback planning waits when another planner lane is active', async () => {
    const { root, config } = await makeFixture([baseTask({
      state: 'planned',
      touchPaths: [],
      statusNotes: ['Imported from legacy backlog.md.', 'Planner could not infer touch_paths from the title; refine this task before execution.'],
    })]);
    const calls: string[] = [];
    const logSink = new MemoryLogSink();
    const runnersDir = path.join(config.files.runtimeDir, 'runners');
    await mkdir(runnersDir, { recursive: true });
    await writeFile(
      path.join(runnersDir, 'other-runner.json'),
      JSON.stringify({ runnerId: 'other-runner', pid: process.pid, startedAt: Date.now(), lane: 'planner' }),
      'utf8',
    );

    await runBacklogRunner(
      config,
      { lane: 'executor' },
      {
        commandRunner: createFakeCommandRunner(root, { calls }),
        createLogSink: async () => logSink,
        sleep: async () => {
          await stopAfterFirstSleep(config.files.stop);
        },
      },
    );

    expect(calls).not.toContain('input:planner prompt');
    expect(logSink.lines.join('')).toContain('Another planner lane: yes');
    expect(logSink.lines.join('')).toContain('planner lane active, waiting for refined work');
  });

  it('planner lane never runs discovery passes', async () => {
    const { root, config } = await makeFixture([]);
    const calls: string[] = [];

    await runBacklogRunner(
      config,
      { lane: 'planner', passes: true },
      {
        commandRunner: createFakeCommandRunner(root, { calls }),
        createLogSink: async () => new MemoryLogSink(),
        sleep: async () => {
          await stopAfterFirstSleep(config.files.stop);
        },
      },
    );

    expect(calls).not.toContain('input:agent prompt');
    expect(calls).not.toContain('input:product prompt');
    expect(calls).not.toContain('input:code prompt');
    expect(calls).not.toContain('input:ux prompt');
  });

  it('prunes dead runner registrations when checking lane presence', async () => {
    const { root, config } = await makeFixture([baseTask()]);
    const runnersDir = path.join(config.files.runtimeDir, 'runners');
    const deadRunnerFile = path.join(runnersDir, 'dead-runner.json');
    await mkdir(runnersDir, { recursive: true });
    await writeFile(
      deadRunnerFile,
      JSON.stringify({ runnerId: 'dead-runner', pid: 999999, startedAt: Date.now(), lane: 'planner' }),
      'utf8',
    );

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root),
        createLogSink: async () => new MemoryLogSink(),
        sleep: async () => undefined,
      },
    );

    await expect(readFile(deadRunnerFile, 'utf8')).rejects.toThrow();
  });
});
  it('continues when remediation repairs validation failure', async () => {
    const { root, config } = await makeFixture([baseTask()]);

    await runBacklogRunner(
      config,
      {},
      {
        commandRunner: createFakeCommandRunner(root, {
          validationResponses: [false, true, true],
        }),
        createLogSink: async () => new MemoryLogSink(),
        sleep: async () => undefined,
      },
    );

    const taskYaml = await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8');
    expect(taskYaml).toContain('state: done');
    expect(taskYaml).toContain('Recovered by remediation');
  });
