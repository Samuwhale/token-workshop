import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeBacklogRunnerConfig } from '../config.js';
import { createFileBackedTaskStore } from '../store/task-store.js';
import { createTaskFromBacklogLine, writeTaskSpec } from '../task-specs.js';
import type { BacklogRunnerConfig, BacklogTaskSpec } from '../types.js';

const tempDirs: string[] = [];

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'backlog-task-store-test-'));
  tempDirs.push(root);
  await mkdir(path.join(root, 'scripts/backlog'), { recursive: true });
  await mkdir(path.join(root, 'backlog/tasks'), { recursive: true });
  await mkdir(path.join(root, '.backlog-runner'), { recursive: true });
  await writeFile(path.join(root, 'backlog.md'), '', 'utf8');
  await writeFile(path.join(root, 'backlog-inbox.md'), '', 'utf8');
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
    const taskA = createTaskFromBacklogLine('- [ ] Update `packages/server/src/a.ts`', 'inbox', config.validationProfiles);
    const taskB = createTaskFromBacklogLine('- [ ] Update `packages/server/src/b.ts`', 'inbox', config.validationProfiles);

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
    const reportWhileBlocked = await readFile(config.files.backlog, 'utf8');

    expect(claimA?.task.id).toBe('task-a');
    expect(blockedClaim).toBeNull();
    expect(reportWhileBlocked).toContain('Blocked: waiting on dependency: Task A');

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
    const report = await readFile(config.files.backlog, 'utf8');

    expect(claimA?.task.id).toBe('task-a');
    expect(blockedClaim).toBeNull();
    expect(report).toContain('Blocked: waiting on active reservation: Task A');
  });

  it('blocks shared workspace config surfaces via inferred capabilities', async () => {
    const { config } = await makeFixture();
    const taskA = createTaskFromBacklogLine('- [ ] Update `package.json`', 'inbox', config.validationProfiles);
    const taskB = createTaskFromBacklogLine('- [ ] Update `.github/workflows/ci.yml`', 'inbox', config.validationProfiles);

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

  it('refreshes queue counts without rewriting backlog.md', async () => {
    const { config, store } = await makeFixture();
    await seedTask(config, taskSpec({ id: 'task-a', title: 'Task A', touchPaths: ['packages/core/src/a.ts'] }));
    await writeFile(config.files.backlog, 'sentinel backlog', 'utf8');

    expect((await store.getQueueCounts()).ready).toBe(1);
    expect(await store.countReady()).toBe(1);
    expect(await store.countDone()).toBe(0);
    expect(await readFile(config.files.backlog, 'utf8')).toBe('sentinel backlog');
  });

  it('closes the runtime store safely more than once', async () => {
    const { store } = await makeFixture();

    await expect(store.close()).resolves.toBeUndefined();
    await expect(store.close()).resolves.toBeUndefined();
  });
});
