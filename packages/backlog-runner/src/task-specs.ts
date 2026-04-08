import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import type { BacklogCandidateRecord, BacklogTaskPriority, BacklogTaskSpec, BacklogTaskState } from './types.js';

const TASK_FILE_PATTERN = /\.ya?ml$/i;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeRepoPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+/g, '/').replace(/\/$/, '');
}

function toArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => normalizeWhitespace(String(item))).filter(Boolean)
    : [];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'task';
}

function shortHash(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 8);
}

export function createTaskId(title: string): string {
  const normalized = normalizeWhitespace(title);
  return `${slugify(normalized)}-${shortHash(normalized)}`;
}

export function taskPriorityRank(priority: BacklogTaskPriority): number {
  if (priority === 'high') return 0;
  if (priority === 'normal') return 1;
  return 2;
}

export function taskSort(a: BacklogTaskSpec, b: BacklogTaskSpec): number {
  return (
    taskPriorityRank(a.priority) - taskPriorityRank(b.priority) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.title.localeCompare(b.title)
  );
}

function normalizePriority(value: unknown): BacklogTaskPriority | null {
  const normalized = normalizeWhitespace(String(value ?? 'normal')).toLowerCase();
  if (normalized === 'high' || normalized === 'normal' || normalized === 'low') {
    return normalized;
  }
  return null;
}

function isWorkspaceConfigPath(touchPath: string): boolean {
  const baseName = path.posix.basename(touchPath);
  return touchPath === 'package.json'
    || touchPath === 'pnpm-lock.yaml'
    || touchPath === 'pnpm-workspace.yaml'
    || touchPath.startsWith('.github/')
    || /^tsconfig(?:\..+)?\.json$/i.test(baseName);
}

function isBacklogRuntimePath(touchPath: string): boolean {
  return touchPath === 'backlog.config.mjs'
    || touchPath === 'backlog.md'
    || touchPath === 'backlog/inbox.jsonl'
    || touchPath === 'backlog-stop'
    || touchPath.startsWith('backlog/')
    || touchPath.startsWith('.backlog-runner/')
    || touchPath.startsWith('packages/backlog-runner/')
    || touchPath.startsWith('scripts/backlog/');
}

function inferCapabilities(touchPaths: string[]): string[] {
  const capabilities = new Set<string>();
  for (const touchPath of touchPaths) {
    if (isWorkspaceConfigPath(touchPath)) {
      capabilities.add('workspace-config');
    }
    if (isBacklogRuntimePath(touchPath)) {
      capabilities.add('backlog-runtime');
    }
  }
  return [...capabilities];
}

function inferValidationProfile(
  touchPaths: string[],
  validationProfiles: Record<string, string>,
): string {
  if (touchPaths.length === 0) {
    return validationProfiles.repo ? 'repo' : '';
  }

  const allIn = (prefix: string) => touchPaths.every(item => item === prefix || item.startsWith(`${prefix}/`));
  if (validationProfiles.core && allIn('packages/core')) return 'core';
  if (validationProfiles.server && allIn('packages/server')) return 'server';
  if (validationProfiles.plugin && allIn('packages/figma-plugin')) return 'plugin';
  if (validationProfiles.backlog && touchPaths.every(item => item.startsWith('packages/backlog-runner/') || item.startsWith('scripts/backlog/') || item === 'backlog.config.mjs' || item === 'README.md')) {
    return 'backlog';
  }
  return validationProfiles.repo ? 'repo' : Object.keys(validationProfiles)[0] ?? '';
}

function taskFilename(taskSpecsDir: string, taskId: string): string {
  return path.join(taskSpecsDir, `${taskId}.yaml`);
}

export function touchPathsOverlap(a: string[], b: string[]): boolean {
  return a.some(left => b.some(right => pathsOverlap(left, right)));
}

function pathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

export function isPathWithinTouchPaths(filePath: string, touchPaths: string[]): boolean {
  const normalized = normalizeRepoPath(filePath);
  return touchPaths.some(entry => pathsOverlap(normalized, entry));
}

export function parseTaskSpec(raw: string, filePath: string): BacklogTaskSpec {
  const parsed = YAML.parse(raw) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid task spec in ${filePath}`);
  }

  const id = normalizeWhitespace(String(parsed.id ?? ''));
  const title = normalizeWhitespace(String(parsed.title ?? ''));
  const priorityValue = normalizeWhitespace(String(parsed.priority ?? 'normal')).toLowerCase();
  const priority: BacklogTaskPriority =
    priorityValue === 'high' || priorityValue === 'low' ? (priorityValue as BacklogTaskPriority) : 'normal';
  const stateValue = normalizeWhitespace(String(parsed.state ?? 'ready')).toLowerCase();
  const state: BacklogTaskState =
    stateValue === 'planned' || stateValue === 'done' || stateValue === 'failed'
      ? (stateValue as BacklogTaskState)
      : 'ready';
  const dependsOn = [...new Set(toArray(parsed.depends_on).map(value => normalizeWhitespace(value)))];
  const touchPaths = [...new Set(toArray(parsed.touch_paths).map(value => normalizeRepoPath(value)).filter(Boolean))];
  const capabilities = [...new Set(toArray(parsed.capabilities).map(value => value.toLowerCase()))];
  const validationProfile = normalizeWhitespace(String(parsed.validation_profile ?? ''));
  const statusNotes = toArray(parsed.status_notes);
  const acceptanceCriteria = toArray(parsed.acceptance_criteria);
  const createdAt = normalizeWhitespace(String(parsed.created_at ?? ''));
  const updatedAt = normalizeWhitespace(String(parsed.updated_at ?? createdAt));
  const sourceValue = normalizeWhitespace(String(parsed.source ?? 'manual')).toLowerCase();
  const validSources = new Set<BacklogTaskSpec['source']>(['product-pass', 'ux-pass', 'code-pass', 'task-followup', 'manual']);
  if (!validSources.has(sourceValue as BacklogTaskSpec['source'])) {
    throw new Error(`Task spec ${filePath} has invalid source: ${sourceValue || '<empty>'}`);
  }
  const source = sourceValue as BacklogTaskSpec['source'];

  if (!id || !title || !validationProfile || statusNotes.length === 0 || !createdAt || !updatedAt) {
    throw new Error(`Task spec ${filePath} is missing required fields`);
  }

  return {
    id,
    title,
    priority,
    dependsOn,
    touchPaths,
    capabilities,
    validationProfile,
    statusNotes,
    state,
    acceptanceCriteria,
    source,
    createdAt,
    updatedAt,
  };
}

export async function readTaskSpecs(taskSpecsDir: string): Promise<BacklogTaskSpec[]> {
  await mkdir(taskSpecsDir, { recursive: true });
  const entries = await readdir(taskSpecsDir, { withFileTypes: true });
  const specs = await Promise.all(
    entries
      .filter(entry => entry.isFile() && TASK_FILE_PATTERN.test(entry.name))
      .map(async entry => {
        const filePath = path.join(taskSpecsDir, entry.name);
        return parseTaskSpec(await readFile(filePath, 'utf8'), filePath);
      }),
  );
  return specs.sort(taskSort);
}

export async function writeTaskSpec(taskSpecsDir: string, task: BacklogTaskSpec): Promise<void> {
  const content = YAML.stringify({
    id: task.id,
    title: task.title,
    priority: task.priority,
    depends_on: task.dependsOn,
    touch_paths: task.touchPaths,
    capabilities: task.capabilities,
    validation_profile: task.validationProfile,
    status_notes: task.statusNotes,
    state: task.state,
    acceptance_criteria: task.acceptanceCriteria,
    source: task.source,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  }, { indent: 2, lineWidth: 0 });
  await writeFile(taskFilename(taskSpecsDir, task.id), content, 'utf8');
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value.map(item => normalizeWhitespace(String(item))).filter(Boolean);
  return normalized.length > 0 ? [...new Set(normalized)] : null;
}

function normalizePathArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map(item => normalizeRepoPath(String(item)))
    .filter(Boolean);
  return normalized.length > 0 ? [...new Set(normalized)] : null;
}

function normalizeCandidateSource(value: unknown): BacklogTaskSpec['source'] | null {
  const normalized = normalizeWhitespace(String(value ?? '')).toLowerCase();
  if (
    normalized === 'product-pass' ||
    normalized === 'ux-pass' ||
    normalized === 'code-pass' ||
    normalized === 'task-followup' ||
    normalized === 'manual'
  ) {
    return normalized;
  }
  return null;
}

export function parseCandidateRecord(line: string): BacklogCandidateRecord | null {
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const title = normalizeWhitespace(String(parsed.title ?? ''));
  const priority = normalizePriority(parsed.priority ?? 'normal');
  const touchPaths = normalizePathArray(parsed.touch_paths);
  const acceptanceCriteria = normalizeStringArray(parsed.acceptance_criteria);
  const source = normalizeCandidateSource(parsed.source);
  if (!title || !priority || !touchPaths || !acceptanceCriteria || !source) {
    return null;
  }

  const validationProfile = normalizeWhitespace(String(parsed.validation_profile ?? '')) || undefined;
  const capabilities = Array.isArray(parsed.capabilities)
    ? [...new Set(parsed.capabilities.map(item => normalizeWhitespace(String(item)).toLowerCase()).filter(Boolean))]
    : undefined;
  const context = normalizeWhitespace(String(parsed.context ?? '')) || undefined;

  return {
    title,
    priority,
    touchPaths,
    acceptanceCriteria,
    validationProfile,
    capabilities: capabilities && capabilities.length > 0 ? capabilities : undefined,
    context,
    source,
  };
}

export function createTaskFromCandidate(
  candidate: BacklogCandidateRecord,
  validationProfiles: Record<string, string>,
  nowIso = new Date().toISOString(),
): BacklogTaskSpec | null {
  const title = normalizeWhitespace(candidate.title);
  const touchPaths = [...new Set(candidate.touchPaths.map(value => normalizeRepoPath(value)).filter(Boolean))];
  const acceptanceCriteria = [...new Set(candidate.acceptanceCriteria.map(item => normalizeWhitespace(item)).filter(Boolean))];
  if (!title || touchPaths.length === 0 || acceptanceCriteria.length === 0) {
    return null;
  }

  const validationProfile = candidate.validationProfile
    ? normalizeWhitespace(candidate.validationProfile)
    : inferValidationProfile(touchPaths, validationProfiles);
  if (!validationProfile || !validationProfiles[validationProfile]) {
    return null;
  }

  const capabilities = candidate.capabilities && candidate.capabilities.length > 0
    ? [...new Set(candidate.capabilities.map(item => normalizeWhitespace(item).toLowerCase()).filter(Boolean))]
    : inferCapabilities(touchPaths);
  const statusNotes = [`Imported from ${candidate.source}.`];
  if (candidate.context) {
    statusNotes.push(`Context: ${candidate.context}`);
  }

  return {
    id: createTaskId(title),
    title,
    priority: candidate.priority,
    dependsOn: [],
    touchPaths,
    capabilities,
    validationProfile,
    statusNotes,
    state: 'ready',
    acceptanceCriteria,
    source: candidate.source,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function updateTask(task: BacklogTaskSpec, patch: Partial<BacklogTaskSpec>, nowIso = new Date().toISOString()): BacklogTaskSpec {
  return {
    ...task,
    ...patch,
    updatedAt: nowIso,
  };
}

export function renderGeneratedBacklog(tasks: BacklogTaskSpec[]): string {
  const lines = [
    '# UX Improvement Backlog',
    '',
    '<!-- This file is generated by packages/backlog-runner from backlog/tasks/*.yaml. -->',
    '<!-- Edit task specs in backlog/tasks/; do not edit this report directly. -->',
    '',
  ];

  for (const task of tasks.sort(taskSort)) {
    const priorityPrefix = task.priority === 'high' ? '[HIGH] ' : '';
    const title = `${priorityPrefix}${task.title}`;
    const marker = task.state === 'done'
      ? 'x'
      : task.state === 'failed'
        ? '!'
        : ' ';
    const suffix = task.state === 'planned' ? ' (Planned)' : '';
    lines.push(`- [${marker}] ${title}${suffix}`);
  }

  lines.push('');
  return lines.join('\n');
}
