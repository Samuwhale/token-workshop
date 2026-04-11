import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readTaskSpecs, renderGeneratedBacklog } from '../task-specs.js';
import type { BacklogTaskSpec } from '../types.js';

const tempDirs: string[] = [];

function renderTaskYaml(task: BacklogTaskSpec): string {
  return [
    `id: ${task.id}`,
    `title: ${task.title}`,
    `priority: ${task.priority}`,
    `task_kind: ${task.taskKind}`,
    'depends_on:',
    ...task.dependsOn.map(value => `  - ${value}`),
    'touch_paths:',
    ...task.touchPaths.map(value => `  - ${value}`),
    'capabilities:',
    ...task.capabilities.map(value => `  - ${value}`),
    `validation_profile: ${task.validationProfile}`,
    'status_notes:',
    ...task.statusNotes.map(value => `  - ${value}`),
    `state: ${task.state}`,
    'acceptance_criteria:',
    ...task.acceptanceCriteria.map(value => `  - ${value}`),
    `source: ${task.source}`,
    `created_at: ${task.createdAt}`,
    `updated_at: ${task.updatedAt}`,
    '',
  ].join('\n');
}

function taskSpec(overrides: Partial<BacklogTaskSpec> & Pick<BacklogTaskSpec, 'id' | 'title'>): BacklogTaskSpec {
  return {
    id: overrides.id,
    title: overrides.title,
    priority: overrides.priority ?? 'normal',
    taskKind: overrides.taskKind ?? 'implementation',
    dependsOn: overrides.dependsOn ?? [],
    touchPaths: overrides.touchPaths ?? ['feature.txt'],
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

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('task specs', () => {
  it('reads task specs recursively from nested directories', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'backlog-task-specs-test-'));
    tempDirs.push(root);
    const taskDir = path.join(root, 'backlog/tasks');
    await mkdir(path.join(taskDir, 'done'), { recursive: true });
    await writeFile(path.join(taskDir, 'task-b.yaml'), renderTaskYaml(taskSpec({
      id: 'task-b',
      title: 'Task B',
      createdAt: '2026-04-08T00:01:00.000Z',
      updatedAt: '2026-04-08T00:01:00.000Z',
    })), 'utf8');
    await writeFile(path.join(taskDir, 'done', 'task-a.yaml'), renderTaskYaml(taskSpec({
      id: 'task-a',
      title: 'Task A',
      state: 'done',
    })), 'utf8');

    const tasks = await readTaskSpecs(taskDir);

    expect(tasks.map(task => task.id)).toEqual(['task-a', 'task-b']);
    expect(tasks.map(task => task.state)).toEqual(['done', 'ready']);
  });

  it('renders backlog metadata for nested task spec directories', () => {
    const backlog = renderGeneratedBacklog([taskSpec({ id: 'task-a', title: 'Task A' })]);

    expect(backlog).toContain('backlog/tasks/**/*.yaml');
    expect(backlog).toContain('backlog/tasks/done/');
  });
});
