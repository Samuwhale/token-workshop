import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeBacklogRunnerConfig } from '../config.js';
import { runBacklogRunner } from '../scheduler.js';
import { writeTaskSpec } from '../task-specs.js';
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
    validationResponses?: boolean[];
    changedFiles?: string[];
    statusResponses?: string[][];
    initialStagedFiles?: string[];
    clearStagedFilesOnRepair?: boolean;
    remoteName?: string;
    failPushCount?: number;
    calls?: string[];
    plannerOutput?: Record<string, unknown>;
    onGitCommit?: (message: string) => Promise<void> | void;
  } = {},
): CommandRunner {
  const stagedFiles = new Set(options.initialStagedFiles ?? []);
  let remainingPushFailures = options.failPushCount ?? 0;
  const validationResponses = [...(options.validationResponses ?? [true])];

  return {
    async run(command: string, args: string[], runOptions?: { input?: string }): Promise<CommandResult> {
      options.calls?.push(`run:${command} ${args.join(' ')}`.trim());
      if (command === 'claude') {
        if (runOptions?.input) {
          options.calls?.push(`input:${runOptions.input}`);
        }
        const isRepairPrompt = runOptions?.input?.includes('## Workspace Repair Mode') || runOptions?.input?.includes('## Reconciliation Mode');
        if (runOptions?.input === 'planner prompt') {
          return {
            code: 0,
            stdout: JSON.stringify({
              structured_output: options.plannerOutput ?? {
                status: 'done',
                item: 'planner-pass',
                note: 'superseded one parent',
                action: 'supersede',
                parent_task_ids: ['task-a'],
                children: [{
                  title: 'Research test item implementation plan',
                  task_kind: 'research',
                  priority: 'normal',
                  touch_paths: ['backlog/inbox.jsonl', 'scripts/backlog/progress.txt'],
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
        if (args[0] === 'diff' && args[1] === '--cached' && args[2] === '--name-only') {
          return { code: 0, stdout: [...stagedFiles].join('\n'), stderr: '' };
        }
        if (args[0] === 'add') {
          for (const file of args.slice(2)) {
            stagedFiles.add(file);
          }
          return { code: 0, stdout: '', stderr: '' };
        }
        if (args[0] === 'commit' && args[1] === '-m') {
          const message = args[2] ?? '';
          await options.onGitCommit?.(message);
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
        if (args[0] === 'pull' || args[0] === 'worktree' || args[0] === 'merge-tree' || args[0] === 'cherry-pick') {
          return { code: 0, stdout: '', stderr: '' };
        }
      }

      return { code: 0, stdout: '', stderr: '' };
    },
    async runShell(): Promise<CommandResult> {
      const nextValidation = validationResponses.length > 0 ? validationResponses.shift() : true;
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

async function stopAfterFirstSleep(filePath: string): Promise<void> {
  await writeFile(filePath, 'stop\n', 'utf8');
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('runner e2e', () => {
  it('finalizes successfully only after validation and includes the done state in the final commit', async () => {
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
            if (message !== 'chore(backlog): done – test item') return;
            const taskState = await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8');
            events.push(taskState.includes('state: done') ? 'done-at-finalize' : 'not-done-at-finalize');
          },
        }),
        createLogSink: async () => logSink,
        sleep: async () => undefined,
      },
    );

    expect(await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8')).toContain('state: done');
    expect(await readFile(path.join(root, 'backlog.md'), 'utf8')).toContain('- [x] test item');
    expect(events).toEqual(['done-at-finalize']);
    expect(calls.indexOf('run:git commit -m chore(backlog): done – test item')).toBeGreaterThan(calls.indexOf('shell:pass'));
    expect(logSink.lines.join('')).toContain('Marked done after finalize');
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

  it('defers the task when preflight remediation cannot clear unrelated staged files', async () => {
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
    expect(taskYaml).toContain('state: ready');
    expect(taskYaml).toContain('Deferred after remediation: dirty workspace preflight: staged user-staged.txt');
    expect(calls).not.toContain('input:agent prompt');
    expect(calls.some(call => call.includes('## Workspace Repair Mode'))).toBe(true);
    expect(logSink.lines.join('')).toContain('dirty workspace preflight');
  });

  it('defers the task when validation introduces files outside the declared touch paths', async () => {
    const { root, config } = await makeFixture([baseTask({ touchPaths: ['feature.txt'] })]);

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
        createLogSink: async () => new MemoryLogSink(),
        sleep: async () => undefined,
      },
    );

    const taskYaml = await readFile(path.join(root, 'backlog/tasks', 'task-a.yaml'), 'utf8');
    expect(taskYaml).toContain('state: ready');
    expect(taskYaml).toContain('Deferred after remediation: post-validation scope violation: touched packages/server/generated.ts');
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
    expect(calls.filter(call => call === 'run:git push')).toHaveLength(4);
    expect(calls.some(call => call.includes('## Reconciliation Mode'))).toBe(true);
    expect(logSink.lines.join('')).toContain('Reconciliation finalized successfully');
  });

  it('defers the task when reconciliation still cannot finalize', async () => {
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
    expect(taskYaml).toContain('state: ready');
    expect(taskYaml).toContain('Deferred after remediation: git push failed after retries; local commit preserved for inspection');
    expect(calls.filter(call => call === 'run:git push')).toHaveLength(6);
    expect(logSink.lines.join('')).toContain('reconciliation finalize failed');
  });

  it('refines a planned task into planner child work and removes the parent from the live queue', async () => {
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
    expect(await readFile(path.join(root, 'backlog.md'), 'utf8')).toContain('Research test item implementation plan');
    expect(logSink.lines.join('')).toContain('superseded 1 planner candidate');
  });

  it('logs planner no-progress and stops when refinement fails', async () => {
    const { root, config } = await makeFixture([baseTask({
      state: 'failed',
      statusNotes: ['Failed: validation failed: missing dependency'],
    })]);
    const logSink = new MemoryLogSink();
    const calls: string[] = [];

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

  it('planner lane refines planned work without executing ready tasks', async () => {
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
    const logSink = new MemoryLogSink();
    const calls: string[] = [];
    let sleepCalls = 0;

    await runBacklogRunner(
      config,
      { lane: 'planner' },
      {
        commandRunner: createFakeCommandRunner(root, {
          calls,
          statusResponses: [[]],
          plannerOutput: {
            status: 'done',
            item: 'planner-pass',
            note: 'superseded one parent',
            action: 'supersede',
            parent_task_ids: ['task-planned'],
            children: [{
              title: 'Research planned task implementation plan',
              task_kind: 'research',
              priority: 'normal',
              touch_paths: ['backlog/inbox.jsonl', 'scripts/backlog/progress.txt'],
              acceptance_criteria: ['Concrete follow-up implementation tasks are written to backlog/inbox.jsonl'],
              context: 'Inspect the planned task surface and emit concrete implementation follow-ups.',
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

    expect(calls).toContain('input:planner prompt');
    expect(calls).not.toContain('input:agent prompt');
    expect(await readFile(path.join(root, 'backlog/tasks', 'task-planned.yaml'), 'utf8')).toContain('state: superseded');
    expect(logSink.lines.join('')).toContain('Planner buffer satisfied (2/2 ready)');
  });

  it('executor waits when another planner lane is already active', async () => {
    const { root, config } = await makeFixture([baseTask({
      state: 'planned',
      touchPaths: [],
      statusNotes: ['Imported from legacy backlog.md.', 'Planner could not infer touch_paths from the title; refine this task before execution.'],
    })]);
    const logSink = new MemoryLogSink();
    const calls: string[] = [];
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
    expect(logSink.lines.join('')).toContain('planner lane active, waiting for refined work');
  });

  it.each([
    { worktrees: true, expected: 1 },
    { worktrees: false, expected: 0 },
  ])('prunes git worktrees on startup only when worktrees are enabled ($worktrees)', async ({ worktrees, expected }) => {
    const { root, config } = await makeFixture([]);
    const calls: string[] = [];

    await runBacklogRunner(
      config,
      { worktrees },
      {
        commandRunner: createFakeCommandRunner(root, { calls }),
        createLogSink: async () => new MemoryLogSink(),
        sleep: async () => undefined,
      },
    );

    expect(calls.filter(call => call === 'run:git worktree prune --expire now')).toHaveLength(expected);
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
