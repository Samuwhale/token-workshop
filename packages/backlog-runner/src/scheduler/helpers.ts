import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { summarizeCommandOutput } from '../command-output.js';
import { normalizePathForGit, unexpectedFiles } from '../git-scope.js';
import type { RunnerLogger } from '../logger.js';
import { parseGitStatusPaths } from '../utils.js';
import type {
  BacklogDrainResult,
  BacklogRunnerConfig,
  BacklogRunnerRole,
  BacklogTaskClaim,
  BacklogWorkerResult,
  CommandRunner,
  ResolvedRunOptions,
  ValidationCommandResult,
} from '../types.js';

export function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export function retryTime(): string {
  return new Date(Date.now() + 60_000).toTimeString().slice(0, 8);
}

export function getRunnerConfig(options: ResolvedRunOptions, role: BacklogRunnerRole) {
  return options.runners[role];
}

export function logDrainResult(logger: RunnerLogger, label: string, result: BacklogDrainResult): void {
  if (!result.drained) return;

  const details = [];
  if (result.createdTasks > 0) {
    details.push(`${result.createdTasks} task${result.createdTasks === 1 ? '' : 's'} created`);
  }
  if (result.skippedDuplicates > 0) {
    details.push(`${result.skippedDuplicates} duplicate${result.skippedDuplicates === 1 ? '' : 's'} skipped`);
  }
  if (result.ignoredInvalidLines > 0) {
    details.push(`${result.ignoredInvalidLines} invalid entr${result.ignoredInvalidLines === 1 ? 'y' : 'ies'} ignored`);
  }
  if (details.length === 0) return;
  logger.line(`  ${label}: ${details.join(' · ')}`);
}

export async function changedFiles(commandRunner: CommandRunner, cwd: string): Promise<string[]> {
  const status = await commandRunner.run('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd,
    ignoreFailure: true,
  });
  return status.code === 0 ? parseGitStatusPaths(status.stdout) : [];
}

export function scopeViolations(changed: string[], allowed: string[]): string[] {
  return unexpectedFiles(changed, allowed);
}

export async function validateWorkspaceScope(
  commandRunner: CommandRunner,
  cwd: string,
  allowedPaths: string[],
  label: string,
): Promise<{ ok: boolean; reason?: string }> {
  const modified = await changedFiles(commandRunner, cwd);
  const unexpected = scopeViolations(modified, allowedPaths);
  if (unexpected.length > 0) {
    return {
      ok: false,
      reason: `${label}: touched ${unexpected.slice(0, 8).join(', ')}`,
    };
  }
  return { ok: true };
}

export async function stagedFiles(commandRunner: CommandRunner, cwd: string): Promise<string[]> {
  const staged = await commandRunner.run('git', ['diff', '--cached', '--name-only'], {
    cwd,
    ignoreFailure: true,
  });
  if (staged.code !== 0) {
    return [];
  }
  return staged.stdout.split('\n').map(line => line.trim()).filter(Boolean);
}

export async function validateStagedWorkspace(
  commandRunner: CommandRunner,
  cwd: string,
  allowedPaths: string[],
  label: string,
): Promise<{ ok: boolean; reason?: string }> {
  const staged = await stagedFiles(commandRunner, cwd);
  const unexpected = unexpectedFiles(staged, allowedPaths);
  if (unexpected.length > 0) {
    return {
      ok: false,
      reason: `${label}: staged ${unexpected.slice(0, 8).join(', ')}`,
    };
  }
  return { ok: true };
}

export function bookkeepingPaths(config: BacklogRunnerConfig): string[] {
  return [
    normalizePathForGit(path.relative(config.projectRoot, config.files.candidateQueue)),
    normalizePathForGit(path.relative(config.projectRoot, config.files.taskSpecsDir)),
    normalizePathForGit(path.relative(config.projectRoot, config.files.backlog)),
    normalizePathForGit(path.relative(config.projectRoot, config.files.progress)),
    normalizePathForGit(path.relative(config.projectRoot, config.files.patterns)),
  ];
}

export function taskCommitPaths(config: BacklogRunnerConfig, touchPaths: string[]): string[] {
  return [...new Set([...touchPaths.map(normalizePathForGit), ...bookkeepingPaths(config)])];
}

export function taskExecutionPaths(config: BacklogRunnerConfig, touchPaths: string[]): string[] {
  return taskCommitPaths(config, touchPaths);
}

export async function runValidationCommand(
  commandRunner: CommandRunner,
  command: string,
  cwd: string,
): Promise<ValidationCommandResult> {
  const startedAt = Date.now();
  const result = await commandRunner.runShell(command, {
    cwd,
    ignoreFailure: true,
  });
  const durationSeconds = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
  return {
    ok: result.code === 0,
    code: result.code,
    summary: summarizeCommandOutput(result.stdout, result.stderr),
    stdout: result.stdout,
    stderr: result.stderr,
    durationSeconds,
  };
}

export async function readPrompt(filePath: string): Promise<string> {
  return readFile(filePath, 'utf8');
}

export async function diffForPaths(
  commandRunner: CommandRunner,
  cwd: string,
  allowedPaths: string[],
): Promise<string> {
  if (allowedPaths.length === 0) {
    return '';
  }
  const result = await commandRunner.run('git', ['diff', '--no-ext-diff', '--', ...allowedPaths], {
    cwd,
    ignoreFailure: true,
  });
  return result.code === 0 ? result.stdout.trim() : '';
}

export function normalizeInlineNote(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function workerDurationSeconds(startedAt: number): number {
  return Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
}

export function taskWorkerResult(
  kind: BacklogWorkerResult['kind'],
  claim: BacklogTaskClaim,
  startedAt: number,
  options: Partial<Omit<BacklogWorkerResult, 'kind' | 'taskId' | 'durationSeconds' | 'queuedFollowups'>> & {
    queuedFollowups?: number;
  } = {},
): BacklogWorkerResult {
  return {
    kind,
    taskId: claim.task.id,
    durationSeconds: workerDurationSeconds(startedAt),
    queuedFollowups: options.queuedFollowups ?? 0,
    note: options.note,
    validationSummary: options.validationSummary,
    retryAt: options.retryAt,
  };
}

export function genericWorkerResult(
  kind: BacklogWorkerResult['kind'],
  startedAt: number,
  options: Partial<Omit<BacklogWorkerResult, 'kind' | 'durationSeconds' | 'queuedFollowups'>> & {
    queuedFollowups?: number;
  } = {},
): BacklogWorkerResult {
  return {
    kind,
    durationSeconds: workerDurationSeconds(startedAt),
    queuedFollowups: options.queuedFollowups ?? 0,
    note: options.note,
    taskId: options.taskId,
    validationSummary: options.validationSummary,
    retryAt: options.retryAt,
  };
}
