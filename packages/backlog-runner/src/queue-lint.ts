import path from 'node:path';
import { readTaskSpecs } from './task-specs.js';
import type { BacklogRunnerConfig, BacklogTaskSpec } from './types.js';

const BROAD_PLANNING_VERBS = [
  'define',
  'redesign',
  'reframe',
  'establish',
  'clarify',
  'improve',
  'simplify',
  'codify',
  'merge',
  'unify',
  'replace',
] as const;

const RESEARCH_WRITE_PREFIXES = ['backlog/', 'scripts/backlog/'] as const;

export type ReadyTaskLintIssue = {
  taskId: string;
  title: string;
  reason: string;
};

function allInPrefix(touchPaths: string[], prefix: string): boolean {
  return touchPaths.length > 0 && touchPaths.every(item => item === prefix || item.startsWith(`${prefix}/`));
}

function inferValidationProfile(task: BacklogTaskSpec): string {
  const touchPaths = task.touchPaths;
  if (allInPrefix(touchPaths, 'packages/core')) return 'core';
  if (allInPrefix(touchPaths, 'packages/server')) return 'server';
  if (allInPrefix(touchPaths, 'packages/figma-plugin')) return 'plugin';
  if (touchPaths.length > 0 && touchPaths.every(item => RESEARCH_WRITE_PREFIXES.some(prefix => item.startsWith(prefix)))) {
    return 'backlog';
  }
  if (allInPrefix(touchPaths, 'packages/backlog-runner')) return 'backlog';
  if (touchPaths.every(item => item.startsWith('scripts/backlog/') || item === 'backlog.config.mjs' || item === 'README.md')) {
    return 'backlog';
  }
  return 'repo';
}

function basenameSignals(touchPaths: string[]): string[] {
  const values = new Set<string>();
  for (const touchPath of touchPaths) {
    const base = path.posix.basename(touchPath);
    if (!base) continue;
    const stem = base.replace(/\.[^.]+$/, '');
    values.add(base.toLowerCase());
    values.add(stem.toLowerCase());

    const tokenized = stem
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[-_.]+/g, ' ')
      .toLowerCase()
      .split(/\s+/)
      .filter(token => token.length >= 4 && token !== 'hook' && token !== 'component');
    for (let index = 0; index < tokenized.length; index += 1) {
      if (index + 1 < tokenized.length) {
        values.add(`${tokenized[index]} ${tokenized[index + 1]}`);
      }
    }
  }
  return [...values].filter(Boolean);
}

function hasConcreteSurfaceReference(task: BacklogTaskSpec): boolean {
  const signals = basenameSignals(task.touchPaths);
  return task.acceptanceCriteria.some(criterion => {
    const normalized = criterion.toLowerCase();
    return signals.some(signal => signal.length >= 4 && normalized.includes(signal));
  });
}

function startsWithBroadVerb(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  return BROAD_PLANNING_VERBS.some(verb => normalized.startsWith(`${verb} `));
}

function researchWritesStayBacklogOnly(task: BacklogTaskSpec): boolean {
  return task.touchPaths.length > 0 && task.touchPaths.every(item => RESEARCH_WRITE_PREFIXES.some(prefix => item.startsWith(prefix)));
}

function researchHasFollowupRequirement(task: BacklogTaskSpec): boolean {
  return task.acceptanceCriteria.some(criterion => /follow-?up|candidate queue|backlog item|implementation task/i.test(criterion));
}

export function lintReadyTask(task: BacklogTaskSpec, config: BacklogRunnerConfig): ReadyTaskLintIssue[] {
  const issues: ReadyTaskLintIssue[] = [];

  if (task.state !== 'ready') {
    return issues;
  }

  if (task.touchPaths.length === 0) {
    issues.push({
      taskId: task.id,
      title: task.title,
      reason: 'ready task has no touch_paths',
    });
  }

  if (task.acceptanceCriteria.length === 0) {
    issues.push({
      taskId: task.id,
      title: task.title,
      reason: 'ready task has no acceptance_criteria',
    });
  }

  if (!config.validationProfiles[task.validationProfile]) {
    issues.push({
      taskId: task.id,
      title: task.title,
      reason: `ready task references unknown validation profile "${task.validationProfile}"`,
    });
  } else {
    const expectedProfile = inferValidationProfile(task);
    if (task.validationProfile !== expectedProfile) {
      issues.push({
        taskId: task.id,
        title: task.title,
        reason: `expected validation profile "${expectedProfile}" for the declared touch_paths, found "${task.validationProfile}"`,
      });
    }
  }

  if (task.taskKind === 'research') {
    if (!researchWritesStayBacklogOnly(task)) {
      issues.push({
        taskId: task.id,
        title: task.title,
        reason: 'ready research task must stay backlog-only in its write scope',
      });
    }
    if (!researchHasFollowupRequirement(task)) {
      issues.push({
        taskId: task.id,
        title: task.title,
        reason: 'ready research task must require concrete follow-up backlog output',
      });
    }
    return issues;
  }

  if (startsWithBroadVerb(task.title) && !hasConcreteSurfaceReference(task)) {
    issues.push({
      taskId: task.id,
      title: task.title,
      reason: 'ready implementation task is still planner-shaped; keep it planned or failed until the planner supersedes it into a narrower child task',
    });
  }

  return issues;
}

export async function lintBacklogQueue(
  config: BacklogRunnerConfig,
): Promise<{ ok: boolean; issues: ReadyTaskLintIssue[]; messages: string[] }> {
  const tasks = await readTaskSpecs(config.files.taskSpecsDir);
  const readyTasks = tasks.filter(task => task.state === 'ready');
  const issues = readyTasks.flatMap(task => lintReadyTask(task, config));

  if (issues.length === 0) {
    return {
      ok: true,
      issues,
      messages: ['  ✓ ready-task queue lint passed'],
    };
  }

  return {
    ok: false,
    issues,
    messages: [
      `  ✗ ready-task queue lint failed (${issues.length} issue${issues.length === 1 ? '' : 's'})`,
      ...issues.map(issue => `    - ${issue.taskId}: ${issue.reason}`),
    ],
  };
}
