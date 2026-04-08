import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeBacklogRunnerConfig } from '../config.js';
import { createFileBackedTaskStore } from '../store/task-store.js';
import { createTaskFromCandidate, parseTaskSpec, writeTaskSpec } from '../task-specs.js';
import type { BacklogCandidateRecord, BacklogRunnerConfig, BacklogTaskSpec } from '../types.js';

const tempDirs: string[] = [];

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'backlog-task-store-test-'));
  tempDirs.push(root);
  await mkdir(path.join(root, 'scripts/backlog'), { recursive: true });
  await mkdir(path.join(root, 'backlog/tasks'), { recursive: true });
  await mkdir(path.join(root, 'backlog'), { recursive: true });
  await mkdir(path.join(root, '.backlog-runner'), { recursive: true });
  await writeFile(path.join(root, 'backlog.md'), '', 'utf8');
  await writeFile(path.join(root, 'backlog/inbox.jsonl'), '', 'utf8');
  await writeFile(path.join(root, 'backlog-stop'), '', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/patterns.md'), '# Patterns\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/progress.txt'), '# Backlog Progress Log\nStarted: today\n---\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/archive.md'), '# Backlog Archive\n', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/agent.md'), 'agent', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/product.md'), 'product', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/ux.md'), 'ux', 'utf8');
  await writeFile(path.join(root, 'scripts/backlog/code.md'), 'code', 'utf8');

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
        product: './scripts/backlog/product.md',
        ux: './scripts/backlog/ux.md',
        code: './scripts/backlog/code.md',
      },
      validationCommand: 'bash scripts/backlog/validate.sh',
      validationProfiles: {
        repo: 'bash scripts/backlog/validate.sh',
      },
    },
    path.join(root, 'backlog.config.mjs'),
  );

  const store = createFileBackedTaskStore(config);
  await store.ensureProgressFile();
  await store.ensureTaskSpecsReady();
  return { root, config, store };
}

function taskSpec(overrides: Partial<BacklogTaskSpec> & Pick<BacklogTaskSpec, 'id' | 'title'>): BacklogTaskSpec {
  return {
    id: overrides.id,
    title: overrides.title,
    priority: overrides.priority ?? 'normal',
    dependsOn: overrides.dependsOn ?? [],
    touchPaths: overrides.touchPaths ?? ['packages/figma-plugin/src/ui/App.tsx'],
    capabilities: overrides.capabilities ?? [],
    validationProfile: overrides.validationProfile ?? 'repo',
    statusNotes: overrides.statusNotes ?? ['Seeded by test.'],
    state: overrides.state ?? 'ready',
    acceptanceCriteria: overrides.acceptanceCriteria ?? [overrides.title],
    source: overrides.source ?? 'manual',
    createdAt: overrides.createdAt ?? '2026-04-08T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-08T00:00:00.000Z',
  };
}

async function seedTask(config: BacklogRunnerConfig, task: BacklogTaskSpec): Promise<void> {
  await writeTaskSpec(config.files.taskSpecsDir, task);
}

function candidate(overrides: Partial<BacklogCandidateRecord> & Pick<BacklogCandidateRecord, 'title' | 'touchPaths' | 'acceptanceCriteria' | 'source'>): BacklogCandidateRecord {
  return {
    title: overrides.title,
    priority: overrides.priority ?? 'normal',
    touchPaths: overrides.touchPaths,
    acceptanceCriteria: overrides.acceptanceCriteria,
    validationProfile: overrides.validationProfile,
    capabilities: overrides.capabilities,
    context: overrides.context,
    source: overrides.source,
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('task store', () => {
  it('claims different runnable tasks across runners without double-claiming', async () => {
    const { config } = await makeFixture();
    await seedTask(config, taskSpec({ id: 'task-a', title: 'Task A', touchPaths: ['packages/core/src/a.ts'] }));
    await seedTask(config, taskSpec({ id: 'task-b', title: 'Task B', touchPaths: ['packages/server/src/b.ts'] }));

    const storeA = createFileBackedTaskStore(config);
    const storeB = createFileBackedTaskStore(config);
    const claimA = await storeA.claimNextRunnableTask('runner-a');
    const claimB = await storeB.claimNextRunnableTask('runner-b');

    expect(claimA?.task.id).toBe('task-a');
    expect(claimB?.task.id).toBe('task-b');
  });

  it('allows non-overlapping package-local source tasks to run concurrently', async () => {
    const { config } = await makeFixture();
    const taskA = createTaskFromCandidate(candidate({
      title: 'Update server path A',
      touchPaths: ['packages/server/src/a.ts'],
      acceptanceCriteria: ['Update server path A'],
      source: 'manual',
    }), config.validationProfiles);
    const taskB = createTaskFromCandidate(candidate({
      title: 'Update server path B',
      touchPaths: ['packages/server/src/b.ts'],
      acceptanceCriteria: ['Update server path B'],
      source: 'manual',
    }), config.validationProfiles);

    await seedTask(config, taskA!);
    await seedTask(config, taskB!);

    const storeA = createFileBackedTaskStore(config);
    const storeB = createFileBackedTaskStore(config);
    const claimA = await storeA.claimNextRunnableTask('runner-a');
    const claimB = await storeB.claimNextRunnableTask('runner-b');

    expect(claimA?.task.capabilities).toEqual([]);
    expect(claimB?.task.capabilities).toEqual([]);
    expect(claimA?.task.id).not.toBe(claimB?.task.id);
  });

  it('blocks dependent tasks until upstream work is done', async () => {
    const { config } = await makeFixture();
    await seedTask(config, taskSpec({ id: 'task-a', title: 'Task A', touchPaths: ['packages/core/src/a.ts'] }));
    await seedTask(config, taskSpec({
      id: 'task-b',
      title: 'Task B',
      dependsOn: ['task-a'],
      touchPaths: ['packages/core/src/b.ts'],
    }));

    const storeA = createFileBackedTaskStore(config);
    const storeB = createFileBackedTaskStore(config);
    const claimA = await storeA.claimNextRunnableTask('runner-a');
    const blockedClaim = await storeB.claimNextRunnableTask('runner-b');
    const runtimeReportWhileBlocked = await readFile(config.files.runtimeReport, 'utf8');

    expect(claimA?.task.id).toBe('task-a');
    expect(blockedClaim).toBeNull();
    expect(runtimeReportWhileBlocked).toContain('waiting on dependency: Task A');

    await storeA.completeClaim(claimA!, 'done');
    const claimB = await storeB.claimNextRunnableTask('runner-b');
    expect(claimB?.task.id).toBe('task-b');
  });

  it('blocks overlapping touch_paths while another lease is active', async () => {
    const { config } = await makeFixture();
    await seedTask(config, taskSpec({ id: 'task-a', title: 'Task A', touchPaths: ['packages/server/src/routes'] }));
    await seedTask(config, taskSpec({ id: 'task-b', title: 'Task B', touchPaths: ['packages/server/src/routes/tokens.ts'] }));

    const storeA = createFileBackedTaskStore(config);
    const storeB = createFileBackedTaskStore(config);
    const claimA = await storeA.claimNextRunnableTask('runner-a');
    const blockedClaim = await storeB.claimNextRunnableTask('runner-b');
    const runtimeReport = await readFile(config.files.runtimeReport, 'utf8');

    expect(claimA?.task.id).toBe('task-a');
    expect(blockedClaim).toBeNull();
    expect(runtimeReport).toContain('waiting on active reservation: Task A');
  });

  it('blocks shared workspace config surfaces via inferred capabilities', async () => {
    const { config } = await makeFixture();
    const taskA = createTaskFromCandidate(candidate({
      title: 'Update package config',
      touchPaths: ['package.json'],
      acceptanceCriteria: ['Update package config'],
      source: 'manual',
    }), config.validationProfiles);
    const taskB = createTaskFromCandidate(candidate({
      title: 'Update CI workflow',
      touchPaths: ['.github/workflows/ci.yml'],
      acceptanceCriteria: ['Update CI workflow'],
      source: 'manual',
    }), config.validationProfiles);

    await seedTask(config, taskA!);
    await seedTask(config, taskB!);

    const storeA = createFileBackedTaskStore(config);
    const storeB = createFileBackedTaskStore(config);
    const claimA = await storeA.claimNextRunnableTask('runner-a');
    const blockedClaim = await storeB.claimNextRunnableTask('runner-b');

    expect(claimA?.task.capabilities).toContain('workspace-config');
    expect(blockedClaim).toBeNull();
  });

  it('does not run tasks with unknown scope', async () => {
    const { config, store } = await makeFixture();
    await seedTask(config, taskSpec({
      id: 'task-a',
      title: 'Task A',
      state: 'planned',
      touchPaths: [],
    }));

    const claim = await store.claimNextRunnableTask('runner-a');
    const counts = await store.getQueueCounts();

    expect(claim).toBeNull();
    expect(counts.ready).toBe(0);
    expect(counts.planned).toBe(1);
  });

  it('reclaims expired leases safely', async () => {
    const { config } = await makeFixture();
    await seedTask(config, taskSpec({ id: 'task-a', title: 'Task A', touchPaths: ['packages/core/src/a.ts'] }));

    const storeA = createFileBackedTaskStore(config);
    const storeB = createFileBackedTaskStore(config);
    const claimA = await storeA.claimNextRunnableTask('runner-a');
    expect(claimA?.task.id).toBe('task-a');

    const db = new DatabaseSync(config.files.stateDb);
    db.prepare('UPDATE leases SET expires_at = ? WHERE task_id = ?').run('2000-01-01T00:00:00.000Z', 'task-a');
    db.close();

    const reclaimed = await storeB.claimNextRunnableTask('runner-b');
    expect(reclaimed?.task.id).toBe('task-a');
  });

  it('refreshes queue counts without rewriting backlog.md and writes runtime-report.md', async () => {
    const { config, store } = await makeFixture();
    await seedTask(config, taskSpec({ id: 'task-a', title: 'Task A', touchPaths: ['packages/core/src/a.ts'] }));
    await writeFile(config.files.backlog, 'sentinel backlog', 'utf8');

    expect((await store.getQueueCounts()).ready).toBe(1);
    expect(await store.countReady()).toBe(1);
    expect(await store.countDone()).toBe(0);
    expect(await readFile(config.files.backlog, 'utf8')).toBe('sentinel backlog');
    expect(await readFile(config.files.runtimeReport, 'utf8')).toContain('Queue: 1 ready');
  });

  it('keeps backlog.md stable while recording active leases in runtime-report.md', async () => {
    const { config } = await makeFixture();
    await seedTask(config, taskSpec({ id: 'task-a', title: 'Task A', touchPaths: ['packages/core/src/a.ts'] }));

    const store = createFileBackedTaskStore(config);
    await store.rewriteBacklogReport();
    const claim = await store.claimNextRunnableTask('runner-a');
    const backlogReport = await readFile(config.files.backlog, 'utf8');
    const runtimeReport = await readFile(config.files.runtimeReport, 'utf8');

    expect(claim?.task.id).toBe('task-a');
    expect(backlogReport).toContain('- [ ] Task A');
    expect(backlogReport).not.toContain('- [~] Task A');
    expect(backlogReport).not.toContain('Blocked:');
    expect(runtimeReport).toContain('## Active Leases');
    expect(runtimeReport).toContain('Task A (task-a) — runner runner-a');
  });

  it('closes the runtime store safely more than once', async () => {
    const { store } = await makeFixture();

    await expect(store.close()).resolves.toBeUndefined();
    await expect(store.close()).resolves.toBeUndefined();
  });

  it('drains structured candidate queue records into runnable tasks', async () => {
    const { config, store } = await makeFixture();
    await writeFile(
      config.files.candidateQueue,
      `${JSON.stringify({
        title: 'Implement structured planner',
        priority: 'high',
        touch_paths: ['packages/backlog-runner/src/store/task-store.ts'],
        acceptance_criteria: ['Candidate queue drains into task specs'],
        source: 'manual',
      })}\n`,
      'utf8',
    );

    const result = await store.drainCandidateQueue();
    const claim = await store.claimNextRunnableTask('runner-a');

    expect(result).toMatchObject({ drained: true, createdTasks: 1, skippedDuplicates: 0, ignoredInvalidLines: 0 });
    expect(claim?.task.title).toBe('Implement structured planner');
    expect(claim?.task.priority).toBe('high');
  });

  it('rejects malformed candidate queue records without creating limbo tasks', async () => {
    const { config, store } = await makeFixture();
    await writeFile(
      config.files.candidateQueue,
      [
        '{"title":"broken json"',
        JSON.stringify({
          title: 'Missing touch paths',
          priority: 'normal',
          acceptance_criteria: ['Missing touch paths'],
          source: 'manual',
        }),
      ].join('\n'),
      'utf8',
    );

    const result = await store.drainCandidateQueue();
    const counts = await store.getQueueCounts();

    expect(result).toMatchObject({ drained: true, createdTasks: 0, ignoredInvalidLines: 2 });
    expect(counts.planned).toBe(0);
    expect(counts.ready).toBe(0);
  });

  it('rejects task specs with unknown source values', async () => {
    const { root } = await makeFixture();
    const filePath = path.join(root, 'backlog/tasks', 'invalid-source.yaml');
    const raw = 'id: invalid-source\n'
      + 'title: Invalid source\n'
      + 'priority: normal\n'
      + 'depends_on: []\n'
      + 'touch_paths:\n'
      + '  - packages/core/src/index.ts\n'
      + 'capabilities: []\n'
      + 'validation_profile: core\n'
      + 'status_notes:\n'
      + '  - Seeded by test.\n'
      + 'state: ready\n'
      + 'acceptance_criteria:\n'
      + '  - Reject unknown sources\n'
      + 'source: legacy-backlog\n'
      + 'created_at: 2026-04-08T00:00:00.000Z\n'
      + 'updated_at: 2026-04-08T00:00:00.000Z\n';

    expect(() => parseTaskSpec(raw, filePath)).toThrow(/invalid source/i);
  });
});
