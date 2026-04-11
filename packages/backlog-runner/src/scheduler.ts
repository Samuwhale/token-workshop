import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureConfigReady, resolveRunOptions } from './config.js';
import { summarizeCommandOutput } from './command-output.js';
import { buildDiscoveryContext, buildExecutionContext, buildPlannerContext, buildReconciliationContext, buildWorkspaceRepairContext } from './context.js';
import { createDefaultLogSink, RunnerLogger } from './logger.js';
import { withLock, lockPath } from './locks.js';
import { PLANNER_RESULT_SCHEMA, parsePlannerSupersedeAction, plannerBatchSize } from './planner.js';
import { createCommandRunner, sleep as defaultSleep } from './process.js';
import { runProvider } from './providers/index.js';
import { JSON_SCHEMA, isAuthFailure, isRateLimited } from './providers/common.js';
import { createFileBackedTaskStore } from './store/task-store.js';
import { normalizePathForGit, unexpectedFiles } from './git-scope.js';
import { fileExists, parseGitStatusPaths } from './utils.js';
import { isPathWithinTouchPaths, normalizeRepoPath } from './task-specs.js';
import type {
  BacklogCandidateRecord,
  BacklogDrainResult,
  BacklogPassType,
  BacklogRunnerConfig,
  BacklogRunnerLane,
  BacklogSyncResult,
  BacklogTaskClaim,
  CommandRunner,
  ResolvedRunOptions,
  RunnerDependencies,
  RunOverrides,
  ValidationCommandResult,
  WorkspaceApplyResult,
  WorkspaceRepairResult,
  WorkspaceSession,
  WorkspaceStrategy,
} from './types.js';
import { GitWorktreeWorkspaceStrategy } from './workspace/git-worktree.js';
import { InPlaceWorkspaceStrategy } from './workspace/in-place.js';

const PLANNER_LANE_READY_TARGET = 2;
const EXECUTOR_FALLBACK_READY_TARGET = 1;
const RUNNER_POLL_INTERVAL_MS = 15_000;
const EMPTY_QUEUE_POLL_INTERVAL_MS = 30_000;
const RECONCILIATION_MAX_TURNS = 60;
const PREFLIGHT_DEFERRAL_MS = 15 * 60 * 1000;
const BACKGROUND_PLANNER_INTERVAL_MS = 15 * 60 * 1000;
const BACKGROUND_PLANNER_PLANNED_THRESHOLD = 10;
const REPO_PATH_PATTERN =
  /\b(packages\/[^:\s|)]+|scripts\/[^:\s|)]+|backlog\/[^:\s|)]+|README\.md|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|backlog\.config\.mjs)\b/g;
const PACKAGE_RELATIVE_SRC_PATH_PATTERN = /\bsrc\/[^:\s|)]+/g;
const WORKSPACE_VALIDATION_ERROR_PATTERNS = [
  /Failed to load url\b/i,
  /\bCannot find module\b/i,
  /\bERR_MODULE_NOT_FOUND\b/i,
  /\bMODULE_NOT_FOUND\b/i,
  /\bvirtualStoreDir\b/i,
  /\bDoes the file exist\?\b/i,
];

type ValidationFailureClassification =
  | { blocking: true; reason: string }
  | { blocking: false; reason: string; followup: BacklogCandidateRecord };

type RunnerRegistryRecord = {
  runnerId: string;
  pid: number;
  startedAt: number;
  lane?: BacklogRunnerLane;
};

type ActiveRunnerCounts = {
  executor: number;
  planner: number;
};

function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function retryTime(): string {
  return new Date(Date.now() + 60_000).toTimeString().slice(0, 8);
}

function logDrainResult(logger: RunnerLogger, label: string, result: BacklogDrainResult): void {
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

async function changedFiles(commandRunner: CommandRunner, cwd: string): Promise<string[]> {
  const status = await commandRunner.run('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd,
    ignoreFailure: true,
  });
  return status.code === 0 ? parseGitStatusPaths(status.stdout) : [];
}

function scopeViolations(changed: string[], allowed: string[]): string[] {
  return unexpectedFiles(changed, allowed);
}

async function validateWorkspaceScope(
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

async function stagedFiles(commandRunner: CommandRunner, cwd: string): Promise<string[]> {
  const staged = await commandRunner.run('git', ['diff', '--cached', '--name-only'], {
    cwd,
    ignoreFailure: true,
  });
  if (staged.code !== 0) {
    return [];
  }
  return staged.stdout.split('\n').map(line => line.trim()).filter(Boolean);
}

async function validateStagedWorkspace(
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

function bookkeepingPaths(config: BacklogRunnerConfig): string[] {
  return [
    normalizePathForGit(path.relative(config.projectRoot, config.files.candidateQueue)),
    normalizePathForGit(path.relative(config.projectRoot, config.files.taskSpecsDir)),
    normalizePathForGit(path.relative(config.projectRoot, config.files.backlog)),
    normalizePathForGit(path.relative(config.projectRoot, config.files.progress)),
    normalizePathForGit(path.relative(config.projectRoot, config.files.patterns)),
  ];
}

function taskCommitPaths(config: BacklogRunnerConfig, touchPaths: string[]): string[] {
  return [...new Set([...touchPaths.map(normalizePathForGit), ...bookkeepingPaths(config)])];
}

function taskExecutionPaths(config: BacklogRunnerConfig, touchPaths: string[]): string[] {
  return taskCommitPaths(config, touchPaths);
}

async function runValidationCommand(
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

async function readPrompt(filePath: string): Promise<string> {
  return readFile(filePath, 'utf8');
}

async function diffForPaths(
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


function normalizeRunnerLane(value: unknown): BacklogRunnerLane {
  return value === 'planner' ? 'planner' : 'executor';
}

function formatRunnerCounts(counts: ActiveRunnerCounts): string {
  return `${counts.executor} executor · ${counts.planner} planner`;
}

function normalizeValidationReason(reason: string): string {
  return reason
    .replace(/^reconciliation\s+validation\s+failed:\s*/i, '')
    .replace(/^validation\s+failed:\s*/i, '')
    .trim();
}

function normalizeInlineNote(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function detectValidationPackageContexts(reason: string): string[] {
  const contexts = new Set<string>();
  if (/packages\/server|\/packages\/server\/|server build|server tests/i.test(reason)) {
    contexts.add('packages/server');
  }
  if (/packages\/core|\/packages\/core\/|core build|core tests|core bootstrap/i.test(reason)) {
    contexts.add('packages/core');
  }
  if (/packages\/figma-plugin|\/packages\/figma-plugin\/|plugin build|plugin tests/i.test(reason)) {
    contexts.add('packages/figma-plugin');
  }
  return [...contexts];
}

function sanitizeValidationPath(filePath: string): string {
  return normalizeRepoPath(filePath.replace(/[(:].*$/, '').replace(/[),.;]+$/, ''));
}

function extractValidationPaths(reason: string): string[] {
  const paths = new Set<string>();
  for (const match of reason.matchAll(REPO_PATH_PATTERN)) {
    paths.add(sanitizeValidationPath(match[1]));
  }

  const contexts = detectValidationPackageContexts(reason);
  if (contexts.length === 1) {
    for (const match of reason.matchAll(PACKAGE_RELATIVE_SRC_PATH_PATTERN)) {
      paths.add(sanitizeValidationPath(`${contexts[0]}/${match[0]}`));
    }
  }

  return [...paths];
}

function buildWorkspaceValidationFollowup(
  claim: BacklogTaskClaim,
  reason: string,
): BacklogCandidateRecord {
  return {
    title: 'Repair worktree validation environment',
    priority: 'high',
    touchPaths: [
      'packages/backlog-runner/src/workspace/git-worktree.ts',
      'scripts/backlog/validate.sh',
    ],
    acceptanceCriteria: [
      'Fresh worktrees bootstrap dependency resolution reliably before validation reruns.',
      'Repo validation reruns no longer fail with missing-module workspace errors unrelated to completed task code.',
    ],
    validationProfile: 'backlog',
    context: `Task "${claim.task.title}" completed its scoped work, but validation surfaced a worktree/bootstrap issue instead of a task-local defect: ${reason}`,
    source: 'task-followup',
  };
}

function buildUnrelatedValidationFollowup(
  claim: BacklogTaskClaim,
  reason: string,
  touchPaths: string[],
): BacklogCandidateRecord {
  return {
    title: `Resolve unrelated validation failure after ${claim.task.title}`,
    priority: 'normal',
    touchPaths,
    acceptanceCriteria: [
      `Validation errors in ${touchPaths.join(', ')} are resolved.`,
      'The unrelated validation failure no longer blocks repo validation.',
    ],
    context: `Task "${claim.task.title}" completed its scoped work, but validation surfaced an unrelated failure outside its touch_paths: ${reason}`,
    source: 'task-followup',
  };
}

function classifyValidationFailure(
  claim: BacklogTaskClaim,
  reason: string,
): ValidationFailureClassification {
  const normalizedReason = normalizeValidationReason(reason);
  const implicatedPaths = extractValidationPaths(normalizedReason);
  if (implicatedPaths.some(filePath => isPathWithinTouchPaths(filePath, claim.task.touchPaths))) {
    return { blocking: true, reason };
  }

  if (WORKSPACE_VALIDATION_ERROR_PATTERNS.some(pattern => pattern.test(normalizedReason))) {
    return {
      blocking: false,
      reason,
      followup: buildWorkspaceValidationFollowup(claim, normalizedReason),
    };
  }

  if (implicatedPaths.length > 0) {
    return {
      blocking: false,
      reason,
      followup: buildUnrelatedValidationFollowup(claim, normalizedReason, implicatedPaths),
    };
  }

  return { blocking: true, reason };
}

async function queueNonBlockingValidationFollowup(
  store: ReturnType<typeof createFileBackedTaskStore>,
  logger: RunnerLogger,
  claim: BacklogTaskClaim,
  failure: Extract<ValidationFailureClassification, { blocking: false }>,
): Promise<void> {
  await store.enqueueCandidate(failure.followup);
  const drained = await store.drainCandidateQueue();
  await store.appendTaskNote(claim.task.id, `Non-blocking validation issue deferred to follow-up: ${normalizeInlineNote(failure.reason)}`);
  logDrainResult(logger, 'Candidate planner', drained);
  logger.line(`  ⚠ Non-blocking validation issue queued as follow-up: ${failure.followup.title}`);
}

function totalRunnerCount(counts: ActiveRunnerCounts): number {
  return counts.executor + counts.planner;
}

function plannerLaneActive(counts: ActiveRunnerCounts): boolean {
  return counts.planner > 0;
}

function backgroundPlannerDue(now: number, lastRunAt: number, plannedCount: number): boolean {
  return plannedCount >= BACKGROUND_PLANNER_PLANNED_THRESHOLD && now - lastRunAt >= BACKGROUND_PLANNER_INTERVAL_MS;
}

function shouldAttemptPlannerBatch(
  batchKey: string,
  waitingPlannerBatchKey: string | null,
  reason: 'recover-failed' | 'fill-buffer' | 'background-backlog',
): boolean {
  if (reason === 'background-backlog') {
    return true;
  }
  return batchKey !== waitingPlannerBatchKey;
}

function reconciliationPrompt(basePrompt: string): string {
  return `${basePrompt}

## Reconciliation Mode
You are reconciling an already-implemented task after a git merge/finalization failure.
- Treat the provided diff and failure reason as primary evidence.
- Inspect current local code before deciding how to adapt the change.
- Resolve conflicts autonomously when you can do so coherently and safely.
- Do not drop the task or narrow scope unless the current repo state makes the acceptance criteria impossible.
- Keep the final edits inside the declared touch_paths plus allowed backlog bookkeeping files.
- End with the same strict JSON success/failure object as normal execution.`;
}

function workspaceRepairPrompt(basePrompt: string): string {
  return `${basePrompt}

## Workspace Repair Mode
You are repairing repo/workspace state for an already-assigned task.
- This repository is agent-operated by default. You may decide what to keep, discard, split into follow-up work, or restage when needed.
- Inspect local code and git state before deciding; do not guess when the repo can answer the question.
- Leave an audit trail in progress notes when you discard or split work.
- If the task is stale or impossible, return failed with a note starting exactly "stale —" or "impossible —".
- Otherwise, repair the workspace so scheduler preflight, scope, validation, and finalization can proceed.
- End with the same strict JSON success/failure object as normal execution.`;
}

function shouldFailFromRepairReason(reason?: string): boolean {
  return /^stale\s+—/i.test(reason ?? '') || /^impossible\s+—/i.test(reason ?? '');
}

async function collectWorkspaceSnapshot(
  commandRunner: CommandRunner,
  cwd: string,
  allowedPaths: string[],
): Promise<{
  changedFiles: string[];
  stagedFiles: string[];
  inScopeFiles: string[];
  outOfScopeFiles: string[];
}> {
  const [currentChangedFiles, currentStagedFiles] = await Promise.all([
    changedFiles(commandRunner, cwd),
    stagedFiles(commandRunner, cwd),
  ]);
  const outOfScopeFiles = scopeViolations(currentChangedFiles, allowedPaths);
  const outOfScope = new Set(outOfScopeFiles);
  return {
    changedFiles: currentChangedFiles,
    stagedFiles: currentStagedFiles,
    inScopeFiles: currentChangedFiles.filter(file => !outOfScope.has(file)),
    outOfScopeFiles,
  };
}

async function appendRepairNotes(
  store: ReturnType<typeof createFileBackedTaskStore>,
  taskId: string,
  note: string | undefined,
  drainResult: BacklogDrainResult,
): Promise<void> {
  if (note) {
    await store.appendTaskNote(taskId, `Recovered by remediation: ${note}`);
  } else {
    await store.appendTaskNote(taskId, 'Recovered by remediation');
  }
  if (drainResult.createdTasks > 0) {
    await store.appendTaskNote(taskId, `Follow-up queued by remediation: ${drainResult.createdTasks} task(s)`);
  }
}

async function attemptWorkspaceRemediation(
  config: BacklogRunnerConfig,
  store: ReturnType<typeof createFileBackedTaskStore>,
  commandRunner: CommandRunner,
  logger: RunnerLogger,
  options: ResolvedRunOptions,
  claim: BacklogTaskClaim,
  remediation: {
    mode: 'preflight' | 'scope' | 'validation';
    cwd: string;
    allowedPaths: string[];
    failureReason: string;
    validationSummary?: string;
    verify: () => Promise<{ ok: boolean; reason?: string }>;
  },
): Promise<WorkspaceRepairResult> {
  logger.line('');
  logger.line(`  Attempting autonomous workspace repair: ${remediation.failureReason}`);

  const snapshot = await collectWorkspaceSnapshot(commandRunner, remediation.cwd, remediation.allowedPaths);
  const context = await buildWorkspaceRepairContext(
    config,
    remediation.cwd,
    claim,
    await store.getTaskDependencies(claim.task.id),
    await store.getActiveReservations(claim.task.id),
    {
      failureReason: remediation.failureReason,
      mode: remediation.mode,
      changedFiles: snapshot.changedFiles,
      stagedFiles: snapshot.stagedFiles,
      inScopeFiles: snapshot.inScopeFiles,
      outOfScopeFiles: snapshot.outOfScopeFiles,
      validationSummary: remediation.validationSummary,
      originalDiff: await diffForPaths(commandRunner, remediation.cwd, remediation.allowedPaths),
    },
  );
  const result = await runProvider(commandRunner, {
    tool: options.tool,
    model: options.model,
    context,
    prompt: workspaceRepairPrompt(await readPrompt(config.prompts.agent)),
    cwd: remediation.cwd,
    maxTurns: RECONCILIATION_MAX_TURNS,
    schema: JSON_SCHEMA,
  });

  logger.line(`  ${result.status === 'done' ? '✓' : '✗'} workspace repair: ${result.item}`);
  if (result.note) logger.line(`    ${result.note}`);

  const drainResult = await store.drainCandidateQueue();
  logDrainResult(logger, 'Candidate planner', drainResult);

  if (result.status !== 'done') {
    return {
      recovered: false,
      deferred: !shouldFailFromRepairReason(result.note),
      failureReason: result.note || 'workspace repair agent reported failure',
      queuedFollowups: drainResult.createdTasks,
    };
  }

  const verification = await remediation.verify();
  if (!verification.ok) {
    logger.line(`  ✗ workspace repair verification failed: ${verification.reason ?? remediation.failureReason}`);
    return {
      recovered: false,
      deferred: true,
      failureReason: verification.reason ?? remediation.failureReason,
      queuedFollowups: drainResult.createdTasks,
    };
  }

  await appendRepairNotes(store, claim.task.id, result.note, drainResult);
  logger.line('  ✓ Workspace repair recovered the task');
  return {
    recovered: true,
    deferred: false,
    queuedFollowups: drainResult.createdTasks,
  };
}

async function applyClaimRepairOutcome(
  store: ReturnType<typeof createFileBackedTaskStore>,
  logger: RunnerLogger,
  claim: BacklogTaskClaim,
  outcome: WorkspaceRepairResult,
  fallbackReason: string,
): Promise<void> {
  const failureReason = outcome.failureReason ?? fallbackReason;
  if (outcome.deferred) {
    await store.deferClaim(claim, failureReason, PREFLIGHT_DEFERRAL_MS, { category: 'remediation' });
    logger.line(`  ⚠ ${failureReason} — deferred for retry`);
    return;
  }
  await store.failClaim(claim, failureReason);
  logger.line(`  ✗ ${failureReason} — marked failed`);
}

async function applyTaskRepairOutcome(
  store: ReturnType<typeof createFileBackedTaskStore>,
  logger: RunnerLogger,
  taskId: string,
  outcome: WorkspaceRepairResult,
  fallbackReason: string,
): Promise<void> {
  const failureReason = outcome.failureReason ?? fallbackReason;
  if (outcome.deferred) {
    await store.deferTaskById(taskId, failureReason, PREFLIGHT_DEFERRAL_MS, { category: 'remediation' });
    logger.line(`  ⚠ ${failureReason} — deferred for retry`);
    return;
  }
  await store.failTaskById(taskId, failureReason);
  logger.line(`  ✗ ${failureReason} — marked failed`);
}

async function attemptTaskReconciliation(
  config: BacklogRunnerConfig,
  store: ReturnType<typeof createFileBackedTaskStore>,
  workspaceStrategy: WorkspaceStrategy,
  commandRunner: CommandRunner,
  logger: RunnerLogger,
  options: ResolvedRunOptions,
  claim: BacklogTaskClaim,
  failureReason: string,
  originalDiff: string,
  taskAlreadyCompleted: boolean,
  commitMessage: string,
  priorFinalizeResult?: WorkspaceApplyResult,
  sleep?: (ms: number) => Promise<void>,
): Promise<WorkspaceRepairResult> {
  logger.line('');
  logger.line(`  Attempting autonomous reconciliation: ${failureReason}`);

  const allowedPaths = taskExecutionPaths(config, claim.task.touchPaths);
  const reconcileInPlace = taskAlreadyCompleted;
  const reconciliationSession = reconcileInPlace ? null : await workspaceStrategy.setup();
  const reconciliationCwd = reconciliationSession?.cwd ?? config.projectRoot;

  try {
    const context = await buildReconciliationContext(
      config,
      reconciliationCwd,
      claim,
      await store.getTaskDependencies(claim.task.id),
      await store.getActiveReservations(claim.task.id),
      failureReason,
      originalDiff,
    );
    const result = await runProvider(commandRunner, {
      tool: options.tool,
      model: options.model,
      context,
      prompt: reconciliationPrompt(await readPrompt(config.prompts.agent)),
      cwd: reconciliationCwd,
      maxTurns: RECONCILIATION_MAX_TURNS,
      schema: JSON_SCHEMA,
    });

    logger.line(`  ${result.status === 'done' ? '✓' : '✗'} reconciliation: ${result.item}`);
    if (result.note) logger.line(`    ${result.note}`);
    if (result.status !== 'done') {
      return {
        recovered: false,
        deferred: !shouldFailFromRepairReason(result.note),
        failureReason: result.note || 'reconciliation agent reported failure',
        queuedFollowups: 0,
      };
    }

    const scopeCheck = await validateWorkspaceScope(commandRunner, reconciliationCwd, allowedPaths, 'reconciliation scope violation');
    if (!scopeCheck.ok) {
      logger.line(`  ✗ ${scopeCheck.reason ?? 'reconciliation scope violation'}`);
      return {
        recovered: false,
        deferred: true,
        failureReason: scopeCheck.reason ?? 'reconciliation scope violation',
        queuedFollowups: 0,
      };
    }

    const validationCommand = config.validationProfiles[claim.task.validationProfile] ?? config.validationCommand;
    logger.line(`  Reconciliation validation: ${validationCommand}`);
    const validation = await runValidationCommand(commandRunner, validationCommand, reconciliationCwd);
    if (!validation.ok) {
      const failureReason = `reconciliation validation failed: ${validation.summary}`;
      const classification = classifyValidationFailure(claim, failureReason);
      if (classification.blocking) {
        logger.line(`  ✗ reconciliation validation failed: ${validation.summary}`);
        return {
          recovered: false,
          deferred: true,
          failureReason,
          queuedFollowups: 0,
        };
      }
      await queueNonBlockingValidationFollowup(store, logger, claim, classification);
    }

    const postValidationScopeCheck = await validateWorkspaceScope(
      commandRunner,
      reconciliationCwd,
      allowedPaths,
      'post-reconciliation scope violation',
    );
    if (!postValidationScopeCheck.ok) {
      logger.line(`  ✗ ${postValidationScopeCheck.reason ?? 'post-reconciliation scope violation'}`);
      return {
        recovered: false,
        deferred: true,
        failureReason: postValidationScopeCheck.reason ?? 'post-reconciliation scope violation',
        queuedFollowups: 0,
      };
    }

    if (reconciliationSession) {
      const mergeResult = await reconciliationSession.merge();
      if (!mergeResult.ok) {
        logger.line(`  ✗ reconciliation merge failed: ${mergeResult.reason ?? 'merge failed'}`);
        return {
          recovered: false,
          deferred: true,
          failureReason: mergeResult.reason ?? 'reconciliation merge failed',
          queuedFollowups: 0,
        };
      }
      logger.line('  ✓ Reconciled changes merged to main');
    }

    const drainResult = await store.drainCandidateQueue();
    logDrainResult(logger, 'Candidate planner', drainResult);
    if (!taskAlreadyCompleted) {
      await store.completeClaim(claim, `completed after reconciliation: ${result.note || 'reconciled successfully'}`);
      if (drainResult.createdTasks > 0) {
        await store.appendTaskNote(claim.task.id, `Follow-up queued by remediation: ${drainResult.createdTasks} task(s)`);
      }
    }

    const finalizeResult = await workspaceStrategy.commitAndPush(
      commitMessage,
      taskCommitPaths(config, claim.task.touchPaths),
      { retryPendingPush: priorFinalizeResult?.pendingPush === true, sleep },
    );
    if (!finalizeResult.ok) {
      logger.line(`  ✗ reconciliation finalize failed: ${finalizeResult.reason ?? 'commit/push failed'}`);
      return {
        recovered: false,
        deferred: true,
        failureReason: finalizeResult.reason ?? 'reconciliation finalize failed',
        queuedFollowups: drainResult.createdTasks,
      };
    }

    if (taskAlreadyCompleted) {
      await appendRepairNotes(store, claim.task.id, result.note, drainResult);
    }
    logger.line('  ✓ Reconciliation finalized successfully');
    return { recovered: true, deferred: false, queuedFollowups: drainResult.createdTasks };
  } finally {
    if (reconciliationSession) {
      await reconciliationSession.teardown();
    }
  }
}

async function registerRunner(
  config: BacklogRunnerConfig,
  lane: BacklogRunnerLane,
): Promise<{ runnerId: string; registryFile: string }> {
  const runnerId = `${process.pid}-${Date.now()}`;
  const runnersDir = path.join(config.files.runtimeDir, 'runners');
  await mkdir(runnersDir, { recursive: true });
  const filePath = path.join(runnersDir, `${runnerId}.json`);
  await writeFile(filePath, JSON.stringify({ runnerId, pid: process.pid, startedAt: Date.now(), lane }), 'utf8');
  return { runnerId, registryFile: filePath };
}

async function activeRunnerCounts(config: BacklogRunnerConfig, ownRunnerId: string): Promise<ActiveRunnerCounts> {
  const runnersDir = path.join(config.files.runtimeDir, 'runners');
  const counts: ActiveRunnerCounts = { executor: 0, planner: 0 };
  try {
    const entries = await readdir(runnersDir);
    for (const entry of entries) {
      const filePath = path.join(runnersDir, entry);
      const fallbackRunnerId = entry.replace(/\.json$/, '');
      let parsed: RunnerRegistryRecord | null = null;
      try {
        parsed = JSON.parse(await readFile(filePath, 'utf8')) as RunnerRegistryRecord;
      } catch {
        parsed = null;
      }

      const runnerId = parsed?.runnerId ?? fallbackRunnerId;
      if (runnerId === ownRunnerId) continue;

      const pid = parsed?.pid ?? Number.parseInt(fallbackRunnerId.split('-')[0] ?? '', 10);
      if (!Number.isFinite(pid)) continue;
      try {
        process.kill(pid, 0);
        counts[normalizeRunnerLane(parsed?.lane)] += 1;
      } catch {
        await rm(filePath, { force: true });
      }
    }
    return counts;
  } catch {
    return counts;
  }
}

async function pruneGitWorktrees(
  commandRunner: CommandRunner,
  config: BacklogRunnerConfig,
  logger: RunnerLogger,
): Promise<void> {
  const result = await commandRunner.run('git', ['worktree', 'prune', '--expire', 'now'], {
    cwd: config.projectRoot,
    ignoreFailure: true,
  });
  if (result.code !== 0) {
    logger.line('  WARNING: git worktree prune --expire now failed');
  }
}

async function runPass(
  config: BacklogRunnerConfig,
  store: ReturnType<typeof createFileBackedTaskStore>,
  workspaceStrategy: WorkspaceStrategy,
  commandRunner: CommandRunner,
  logger: RunnerLogger,
  options: ResolvedRunOptions,
  passType: BacklogPassType,
  sleep?: (ms: number) => Promise<void>,
): Promise<void> {
  logger.line('');
  logger.line('================================================================');
  logger.line(`  ★ Maintenance Pass: ${passType}`);
  logger.line('================================================================');

  const session = await workspaceStrategy.setup();
  try {
    const context = await buildDiscoveryContext(config);
    const result = await runProvider(commandRunner, {
      tool: options.tool,
      model: options.passModel,
      context,
      prompt: await readPrompt(config.passes[passType].promptFile),
      cwd: session.cwd,
      maxTurns: 12,
      schema: JSON_SCHEMA,
    });

    logger.line(`  ✓ ${passType} pass: ${result.item}`);
    if (result.note) logger.line(`    ${result.note}`);

    const workspaceCheck = await validateWorkspaceScope(
      commandRunner,
      session.cwd,
      [
        normalizePathForGit(path.relative(session.cwd, config.files.candidateQueue)),
        normalizePathForGit(path.relative(session.cwd, config.files.progress)),
        normalizePathForGit(path.relative(session.cwd, config.files.patterns)),
      ],
      'discovery pass touched non-planner files',
    );
    if (!workspaceCheck.ok) {
      logger.line(`  WARNING: ${workspaceCheck.reason}`);
      return;
    }

    const commitMessage = `chore(backlog): ${passType} pass – ${result.item || 'maintenance'}`;
    await withLock(lockPath(config, 'git'), 30, async () => {
      const mergeResult = await session.merge();
      if (!mergeResult.ok) {
        logger.line(`  WARNING: ${mergeResult.reason ?? 'pass merge failed'}`);
        return;
      }

      logDrainResult(logger, 'Candidate planner', await store.drainCandidateQueue());
      const finalizeResult = await workspaceStrategy.commitAndPush(commitMessage, bookkeepingPaths(config), { sleep });
      if (!finalizeResult.ok) {
        logger.line(`  WARNING: ${finalizeResult.reason ?? 'pass finalize failed'}`);
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isRateLimited(message)) {
      logger.line(`  ⚠ Rate limit hit during ${passType} pass — skipping`);
      return;
    }
    logger.line(`  · ${passType} pass skipped — ${message}`);
  } finally {
    await session.teardown();
  }
}

async function runPlannerRefinementPass(
  config: BacklogRunnerConfig,
  store: ReturnType<typeof createFileBackedTaskStore>,
  workspaceStrategy: WorkspaceStrategy,
  commandRunner: CommandRunner,
  logger: RunnerLogger,
  options: ResolvedRunOptions,
): Promise<boolean> {
  return withLock(lockPath(config, 'planner'), 30, async () => {
    const plannerCandidates = await store.listPlannerCandidates(plannerBatchSize());
    if (plannerCandidates.length === 0) {
      return false;
    }

    logger.line('');
    logger.line('================================================================');
    logger.line('  ★ Planner Refinement Pass');
    logger.line('================================================================');

    const session = await workspaceStrategy.setup();
    try {
      const context = await buildPlannerContext(config, plannerCandidates);
      const result = await runProvider(commandRunner, {
        tool: options.tool,
        model: options.passModel,
        context,
        prompt: await readPrompt(config.prompts.planner),
        cwd: session.cwd,
        maxTurns: 12,
        schema: PLANNER_RESULT_SCHEMA,
      });

      if (result.status !== 'done') {
        logger.line(`  · planner refinement skipped — ${result.note || 'planner reported failure'}`);
        return false;
      }

      const workspaceCheck = await validateWorkspaceScope(
        commandRunner,
        session.cwd,
        [],
        'planner pass touched repo files',
      );
      if (!workspaceCheck.ok) {
        logger.line(`  WARNING: ${workspaceCheck.reason}`);
        return false;
      }

      const action = parsePlannerSupersedeAction(result.rawOutput, config);
      if (!action) {
        logger.line('  WARNING: planner pass returned invalid structured action payload');
        return false;
      }

      const applied = await store.applyPlannerSupersede(action, {
        allowedParentTaskIds: plannerCandidates.map(task => task.id),
      });
      logger.line(`  ✓ planner pass: ${result.item}`);
      if (result.note) logger.line(`    ${result.note}`);
      logger.line(`  ✓ superseded ${applied.parentTaskIds.length} planner candidate${applied.parentTaskIds.length === 1 ? '' : 's'} with ${applied.childTaskIds.length} child task${applied.childTaskIds.length === 1 ? '' : 's'}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isRateLimited(message)) {
        logger.line('  ⚠ Rate limit hit during planner refinement — skipping');
        return false;
      }
      logger.line(`  · planner refinement skipped — ${message}`);
      return false;
    } finally {
      await session.teardown();
    }
  });
}

async function currentPlannerBatchKey(
  store: ReturnType<typeof createFileBackedTaskStore>,
): Promise<string> {
  const plannerCandidates = await store.listPlannerCandidates(plannerBatchSize());
  return plannerCandidates.map(task => task.id).join(',');
}

export async function syncBacklogRunner(config: BacklogRunnerConfig): Promise<BacklogSyncResult> {
  await ensureConfigReady(config);
  const store = createFileBackedTaskStore(config);
  try {
    await store.ensureProgressFile();
    await store.ensureTaskSpecsReady();
    const candidates = await store.drainCandidateQueue();
    const counts = await store.getQueueCounts();
    return { candidates, counts };
  } finally {
    await store.close();
  }
}

export async function runBacklogRunner(
  config: BacklogRunnerConfig,
  overrides: RunOverrides = {},
  dependencies: RunnerDependencies = {},
): Promise<void> {
  await ensureConfigReady(config);
  const sleep = dependencies.sleep ?? defaultSleep;
  const logSink = await (dependencies.createLogSink?.(config) ?? createDefaultLogSink(config));
  const logger = new RunnerLogger(logSink);
  const commandRunner = dependencies.commandRunner ?? createCommandRunner();
  const store = createFileBackedTaskStore(config);
  const options = await resolveRunOptions(config, overrides);
  const workspaceStrategy: WorkspaceStrategy = options.worktrees
    ? new GitWorktreeWorkspaceStrategy(commandRunner, config)
    : new InPlaceWorkspaceStrategy(commandRunner, config);

  if (options.worktrees) {
    await pruneGitWorktrees(commandRunner, config, logger);
  }

  const { runnerId, registryFile } = await registerRunner(config, options.lane);

  let stopRequested = false;
  const onSignal = () => {
    stopRequested = true;
    logger.line('');
    logger.line('  → Stop requested — will exit after current task completes.');
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    await store.ensureProgressFile();
    await store.ensureTaskSpecsReady();
    logDrainResult(logger, 'Candidate planner', await store.drainCandidateQueue());

    logger.line('');
    logger.line('╔═══════════════════════════════════════════════════════════════╗');
    logger.line('║  TypeScript Backlog Runner                                  ║');
    logger.line('╚═══════════════════════════════════════════════════════════════╝');
    logger.line(`  Runner: ${runnerId}`);
    logger.line(`  Tool:   ${options.tool}`);
    logger.line(`  Lane:   ${options.lane}`);
    logger.line(`  Model:  ${options.model}`);
    logger.line(`  Pass model: ${options.passModel}`);
    logger.line(`  Mode:   ${options.worktrees ? 'parallel (worktrees)' : 'single (no worktrees)'}`);
    logger.line(`  Passes: ${options.passes ? 'enabled (queue-empty only)' : 'disabled'}`);
    const queue = await store.getQueueCounts();
    logger.line(
      `  Queue:  ${queue.ready} ready · ${queue.blocked} blocked · ${queue.planned} planned · ${queue.inProgress} in-progress · ${queue.failed} failed · ${queue.done} done`,
    );
    const otherRunners = await activeRunnerCounts(config, runnerId);
    logger.line(`  Other runners: ${formatRunnerCounts(otherRunners)}`);
    logger.line(`  Another planner lane: ${plannerLaneActive(otherRunners) ? 'yes' : 'no'}`);
    logger.line(`  Stop:  Ctrl+C  (or: touch ${config.files.stop})`);

    let iteration = 0;
    let previousDurationSeconds = 0;
    let waitingPlannerBatchKey: string | null = null;
    let lastBackgroundPlannerPassAt = 0;

    const attemptPlannerPass = () =>
      runPlannerRefinementPass(config, store, workspaceStrategy, commandRunner, logger, options);

    while (true) {
      if (stopRequested || (await fileExists(config.files.stop))) {
        break;
      }

      iteration += 1;
      logDrainResult(logger, 'Candidate planner', await store.drainCandidateQueue());

      const counts = await store.getQueueCounts();
      const otherRunnerCounts = await activeRunnerCounts(config, runnerId);
      const hasPlannerPeer = plannerLaneActive(otherRunnerCounts);
      logger.line('');
      logger.line('═══════════════════════════════════════════════════════════════');
      logger.line(
        `  #${iteration} · ${counts.ready} ready · ${counts.blocked} blocked · ${counts.planned} planned · ${counts.inProgress} in-progress` +
          (previousDurationSeconds ? ` · last took ${formatDuration(previousDurationSeconds)}` : ''),
      );
      logger.line('═══════════════════════════════════════════════════════════════');

      if (options.lane === 'planner') {
        const now = Date.now();
        const plannerReason: 'recover-failed' | 'fill-buffer' | 'background-backlog' | null =
          counts.failed > 0
            ? 'recover-failed'
            : counts.planned > 0 && counts.ready < PLANNER_LANE_READY_TARGET
              ? 'fill-buffer'
              : backgroundPlannerDue(now, lastBackgroundPlannerPassAt, counts.planned)
                ? 'background-backlog'
                : null;

        if (plannerReason) {
          const batchKey = await currentPlannerBatchKey(store);
          if (batchKey && shouldAttemptPlannerBatch(batchKey, waitingPlannerBatchKey, plannerReason)) {
            waitingPlannerBatchKey = batchKey;
            if (plannerReason === 'background-backlog') {
              lastBackgroundPlannerPassAt = now;
            }
            const refined = await attemptPlannerPass();
            if (refined) {
              waitingPlannerBatchKey = null;
              continue;
            }
          }

          if (plannerReason === 'recover-failed') {
            logger.line('  Planner lane made no progress on failed-task recovery — polling in 15s…');
          } else if (plannerReason === 'background-backlog') {
            logger.line('  Planner lane made no progress on background backlog refinement — polling in 15s…');
          } else {
            logger.line('  Planner lane made no progress on the current batch — polling in 15s…');
          }
          await sleep(RUNNER_POLL_INTERVAL_MS);
          continue;
        }

        waitingPlannerBatchKey = null;
        if (counts.ready >= PLANNER_LANE_READY_TARGET) {
          logger.line(`  Planner buffer satisfied (${counts.ready}/${PLANNER_LANE_READY_TARGET} ready) — polling in 15s…`);
        } else if (counts.planned === 0 && counts.failed === 0) {
          logger.line('  No planner candidates to refine — polling in 15s…');
        } else {
          logger.line('  Planner lane is idle — polling in 15s…');
        }
        await sleep(RUNNER_POLL_INTERVAL_MS);
        continue;
      }

      if (!hasPlannerPeer) {
        const now = Date.now();
        const plannerReason: 'recover-failed' | 'background-backlog' | null =
          counts.failed > 0
            ? 'recover-failed'
            : backgroundPlannerDue(now, lastBackgroundPlannerPassAt, counts.planned)
              ? 'background-backlog'
              : null;

        if (plannerReason) {
          const batchKey = await currentPlannerBatchKey(store);
          if (batchKey && shouldAttemptPlannerBatch(batchKey, waitingPlannerBatchKey, plannerReason)) {
            waitingPlannerBatchKey = batchKey;
            if (plannerReason === 'background-backlog') {
              lastBackgroundPlannerPassAt = now;
            }
            const refined = await attemptPlannerPass();
            if (refined) {
              waitingPlannerBatchKey = null;
              continue;
            }
          }
        }
      }

      if (counts.ready === 0) {
        if (counts.inProgress > 0) {
          if ((counts.planned > 0 || counts.failed > 0) && counts.ready < EXECUTOR_FALLBACK_READY_TARGET && !hasPlannerPeer) {
            const batchKey = await currentPlannerBatchKey(store);
            if (batchKey && batchKey !== waitingPlannerBatchKey) {
              waitingPlannerBatchKey = batchKey;
              const refined = await attemptPlannerPass();
              if (refined) {
                waitingPlannerBatchKey = null;
                continue;
              }
            }
          }
          if ((counts.planned > 0 || counts.failed > 0) && hasPlannerPeer) {
            logger.line('  No runnable task available locally — planner lane active, waiting for refined work…');
          } else {
            logger.line('  No runnable task available locally — waiting 15s for other runner activity…');
          }
          await sleep(RUNNER_POLL_INTERVAL_MS);
          continue;
        }

        if (counts.planned > 0 || counts.failed > 0) {
          if (hasPlannerPeer) {
            logger.line('  No runnable task available locally — planner lane active, waiting for refined work…');
            await sleep(RUNNER_POLL_INTERVAL_MS);
            continue;
          }
          waitingPlannerBatchKey = null;
          const refined = await attemptPlannerPass();
          if (refined) {
            continue;
          }
          logger.line('  No runnable tasks remain and planner refinement made no progress — stopping.');
          break;
        }

        if (counts.blocked > 0) {
          logger.line('  No runnable tasks remain. Remaining tasks are blocked; stopping instead of spending tokens on new discovery.');
          break;
        }

        if (!options.passes) {
          logger.line('  Task queue empty and discovery passes are disabled — stopping.');
          break;
        }

        logger.line('  No tasks found — running discovery passes to replenish backlog…');
        for (const passType of ['product', 'code', 'ux'] as const) {
          await runPass(config, store, workspaceStrategy, commandRunner, logger, options, passType, sleep);
        }

        const refreshed = await store.getQueueCounts();
        if (refreshed.ready === 0 && refreshed.planned === 0 && refreshed.inProgress === 0) {
          logger.line('  Still no tasks available. Polling inbox every 30s…');
          await sleep(EMPTY_QUEUE_POLL_INTERVAL_MS);
        }
        continue;
      }

      waitingPlannerBatchKey = null;
      const claim = await store.claimNextRunnableTask(runnerId);
      if (!claim) {
        const refreshed = await store.getQueueCounts();
        const refreshedOtherRunnerCounts = await activeRunnerCounts(config, runnerId);
        const refreshedHasPlannerPeer = plannerLaneActive(refreshedOtherRunnerCounts);
        if ((refreshed.planned > 0 || refreshed.failed > 0) && refreshed.ready < EXECUTOR_FALLBACK_READY_TARGET && !refreshedHasPlannerPeer) {
          const batchKey = await currentPlannerBatchKey(store);
          if (batchKey && batchKey !== waitingPlannerBatchKey) {
            waitingPlannerBatchKey = batchKey;
            const refined = await attemptPlannerPass();
            if (refined) {
              waitingPlannerBatchKey = null;
              continue;
            }
          }
        }
        if ((refreshed.planned > 0 || refreshed.failed > 0) && refreshedHasPlannerPeer) {
          logger.line('  Ready tasks were claimed elsewhere and planner lane is active — waiting for refined work…');
        } else {
          logger.line('  Ready tasks were claimed elsewhere — waiting 15s…');
        }
        await sleep(RUNNER_POLL_INTERVAL_MS);
        continue;
      }

      logger.line(`  → ${claim.task.title} (${claim.task.id})`);
      let session: WorkspaceSession;
      try {
        session = await workspaceStrategy.setup();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await store.deferClaim(claim, `workspace setup failed: ${message}`, PREFLIGHT_DEFERRAL_MS, { category: 'preflight' });
        logger.line(`  ⚠ workspace setup failed: ${message} — deferred for retry`);
        continue;
      }
      if (options.worktrees) {
        logger.line(`  Worktree: ${session.cwd}`);
      }

      const heartbeat = setInterval(() => {
        void store.heartbeatClaim(claim).catch(() => undefined);
      }, 30_000);
      heartbeat.unref?.();

      const startedAt = Date.now();
      try {
        const allowedPaths = taskExecutionPaths(config, claim.task.touchPaths);
        const stagedPreflight = await validateStagedWorkspace(
          commandRunner,
          session.cwd,
          allowedPaths,
          'dirty workspace preflight',
        );
        if (!stagedPreflight.ok) {
          logger.line(`  WARNING: ${stagedPreflight.reason}`);
          const repaired = await attemptWorkspaceRemediation(
            config,
            store,
            commandRunner,
            logger,
            options,
            claim,
            {
              mode: 'preflight',
              cwd: session.cwd,
              allowedPaths,
              failureReason: stagedPreflight.reason ?? 'dirty workspace preflight',
              verify: async () => validateStagedWorkspace(
                commandRunner,
                session.cwd,
                allowedPaths,
                'dirty workspace preflight',
              ),
            },
          );
          if (!repaired.recovered) {
            await applyClaimRepairOutcome(store, logger, claim, repaired, stagedPreflight.reason ?? 'dirty workspace preflight');
            continue;
          }
        }
        if (session.cwd !== config.projectRoot) {
          const mainRepoStagedPreflight = await validateStagedWorkspace(
            commandRunner,
            config.projectRoot,
            allowedPaths,
            'main repo staged preflight',
          );
          if (!mainRepoStagedPreflight.ok) {
            logger.line(`  WARNING: ${mainRepoStagedPreflight.reason}`);
            const repaired = await attemptWorkspaceRemediation(
              config,
              store,
              commandRunner,
              logger,
              options,
              claim,
              {
                mode: 'preflight',
                cwd: config.projectRoot,
                allowedPaths,
                failureReason: mainRepoStagedPreflight.reason ?? 'main repo staged preflight',
                verify: async () => validateStagedWorkspace(
                  commandRunner,
                  config.projectRoot,
                  allowedPaths,
                  'main repo staged preflight',
                ),
              },
            );
            if (!repaired.recovered) {
              await applyClaimRepairOutcome(store, logger, claim, repaired, mainRepoStagedPreflight.reason ?? 'main repo staged preflight');
              continue;
            }
          }
        }

        logger.line(`  Running agent… (started ${new Date().toTimeString().slice(0, 8)})`);
        const context = await buildExecutionContext(
          config,
          session.cwd,
          claim,
          await store.getTaskDependencies(claim.task.id),
          await store.getActiveReservations(claim.task.id),
        );
        const result = await runProvider(commandRunner, {
          tool: options.tool,
          model: options.model,
          context,
          prompt: await readPrompt(config.prompts.agent),
          cwd: session.cwd,
          maxTurns: 40,
          schema: JSON_SCHEMA,
        });

        logger.line('');
        logger.line(`  ${result.status === 'done' ? '✓' : '✗'} ${result.status}: ${result.item}`);
        if (result.note) logger.line(`    ${result.note}`);
        const meta = [
          result.turns ? `${result.turns} turns` : '',
          result.durationSeconds ? formatDuration(result.durationSeconds) : '',
          result.costUsd ? `$${result.costUsd.toFixed(2)}` : '',
        ].filter(Boolean);
        if (meta.length > 0) {
          logger.line(`    ${meta.join(' · ')}`);
        }

        if (result.status !== 'done') {
          await store.failClaim(claim, result.note || 'agent reported failure');
          continue;
        }

        const initialScopeCheck = await validateWorkspaceScope(
          commandRunner,
          session.cwd,
          allowedPaths,
          'write scope violation',
        );
        if (!initialScopeCheck.ok) {
          const repaired = await attemptWorkspaceRemediation(
            config,
            store,
            commandRunner,
            logger,
            options,
            claim,
            {
              mode: 'scope',
              cwd: session.cwd,
              allowedPaths,
              failureReason: initialScopeCheck.reason ?? 'write scope violation',
              verify: async () => validateWorkspaceScope(
                commandRunner,
                session.cwd,
                allowedPaths,
                'write scope violation',
              ),
            },
          );
          if (!repaired.recovered) {
            await applyClaimRepairOutcome(store, logger, claim, repaired, initialScopeCheck.reason ?? 'write scope violation');
            continue;
          }
          logger.line('  ✓ write scope repaired');
        }

        const validationCommand = config.validationProfiles[claim.task.validationProfile] ?? config.validationCommand;
        logger.line('');
        logger.line(`  Running validation profile "${claim.task.validationProfile}": ${validationCommand}`);
        const validation = await runValidationCommand(commandRunner, validationCommand, session.cwd);
        if (!validation.ok) {
          const repaired = await attemptWorkspaceRemediation(
            config,
            store,
            commandRunner,
            logger,
            options,
            claim,
            {
              mode: 'validation',
              cwd: session.cwd,
              allowedPaths,
              failureReason: `validation failed: ${validation.summary}`,
              validationSummary: validation.summary,
              verify: async () => {
                const rerun = await runValidationCommand(commandRunner, validationCommand, session.cwd);
                if (!rerun.ok) {
                  return { ok: false, reason: `validation failed: ${rerun.summary}` };
                }
                const postRepairScope = await validateWorkspaceScope(
                  commandRunner,
                  session.cwd,
                  allowedPaths,
                  'post-validation scope violation',
                );
                return postRepairScope.ok
                  ? { ok: true }
                  : { ok: false, reason: postRepairScope.reason ?? 'post-validation scope violation' };
              },
            },
          );
          if (!repaired.recovered) {
            const failureReason = repaired.failureReason ?? `validation failed: ${validation.summary}`;
            const classification = classifyValidationFailure(claim, failureReason);
            if (classification.blocking) {
              await applyClaimRepairOutcome(store, logger, claim, repaired, `validation failed: ${validation.summary}`);
              continue;
            }
            await queueNonBlockingValidationFollowup(store, logger, claim, classification);
          } else {
            logger.line('  ✓ validation recovered by remediation');
          }
        } else {
          logger.line(
            `  ✓ validation passed (${formatDuration(validation.durationSeconds) || `${validation.durationSeconds}s`})`,
          );
        }

        const postValidationScopeCheck = await validateWorkspaceScope(
          commandRunner,
          session.cwd,
          allowedPaths,
          'post-validation scope violation',
        );
        if (!postValidationScopeCheck.ok) {
          const repaired = await attemptWorkspaceRemediation(
            config,
            store,
            commandRunner,
            logger,
            options,
            claim,
            {
              mode: 'scope',
              cwd: session.cwd,
              allowedPaths,
              failureReason: postValidationScopeCheck.reason ?? 'post-validation scope violation',
              verify: async () => {
                const scopeResult = await validateWorkspaceScope(
                  commandRunner,
                  session.cwd,
                  allowedPaths,
                  'post-validation scope violation',
                );
                if (!scopeResult.ok) {
                  return scopeResult;
                }
                const rerun = await runValidationCommand(commandRunner, validationCommand, session.cwd);
                return rerun.ok
                  ? { ok: true }
                  : { ok: false, reason: `validation failed: ${rerun.summary}` };
              },
            },
          );
          if (!repaired.recovered) {
            await applyClaimRepairOutcome(store, logger, claim, repaired, postValidationScopeCheck.reason ?? 'post-validation scope violation');
            continue;
          }
          logger.line('  ✓ post-validation scope repaired');
        }

        const message = `chore(backlog): done – ${result.item || claim.task.title}`;
        if (options.worktrees) {
          await withLock(lockPath(config, 'git'), 30, async () => {
            logger.line('');
            logger.line(`  Merging to main: ${claim.task.title}`);
            const originalDiff = await diffForPaths(commandRunner, session.cwd, allowedPaths);
            const mergeResult = await session.merge();
            if (!mergeResult.ok) {
              const recovered = await attemptTaskReconciliation(
                config,
                store,
                workspaceStrategy,
                commandRunner,
                logger,
                options,
                claim,
                mergeResult.reason ?? 'merge failed',
                originalDiff,
                false,
                message,
                mergeResult,
                sleep,
              );
              if (!recovered.recovered) {
                await applyClaimRepairOutcome(store, logger, claim, recovered, mergeResult.reason ?? 'merge failed');
              }
              return;
            }

            logger.line('  ✓ Merged code changes to main');
            logDrainResult(logger, 'Candidate planner', await store.drainCandidateQueue());
            await store.completeClaim(claim, result.note || 'completed');

            const finalizeResult = await workspaceStrategy.commitAndPush(
              message,
              taskCommitPaths(config, claim.task.touchPaths),
              { sleep },
            );
            if (!finalizeResult.ok) {
              const recovered = await attemptTaskReconciliation(
                config,
                store,
                workspaceStrategy,
                commandRunner,
                logger,
                options,
                claim,
                finalizeResult.reason ?? 'finalize failed after merge',
                await diffForPaths(commandRunner, config.projectRoot, allowedPaths),
                true,
                message,
                finalizeResult,
                sleep,
              );
              if (!recovered.recovered) {
                await applyTaskRepairOutcome(store, logger, claim.task.id, recovered, finalizeResult.reason ?? 'finalize failed after merge');
              }
              return;
            }

            logger.line('  ✓ Marked done after merge');
          });
        } else {
          await withLock(lockPath(config, 'git'), 30, async () => {
            logger.line('');
            logger.line(`  Finalizing code changes: ${claim.task.title}`);
            logDrainResult(logger, 'Candidate planner', await store.drainCandidateQueue());
            await store.completeClaim(claim, result.note || 'completed');

            const finalizeResult = await workspaceStrategy.commitAndPush(
              message,
              taskCommitPaths(config, claim.task.touchPaths),
              { sleep },
            );
            if (!finalizeResult.ok) {
              const recovered = await attemptTaskReconciliation(
                config,
                store,
                workspaceStrategy,
                commandRunner,
                logger,
                options,
                claim,
                finalizeResult.reason ?? 'commit/push failed',
                await diffForPaths(commandRunner, config.projectRoot, allowedPaths),
                true,
                message,
                finalizeResult,
                sleep,
              );
              if (!recovered.recovered) {
                await applyTaskRepairOutcome(store, logger, claim.task.id, recovered, finalizeResult.reason ?? 'commit/push failed');
              }
              return;
            }

            logger.line('  ✓ Marked done after finalize');
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isAuthFailure(message)) {
          await store.releaseClaim(claim);
          throw new Error('Authentication/permission error — check your API key and tool setup');
        }
        if (isRateLimited(message)) {
          logger.line('');
          logger.line(`  ⚠ Rate limit hit — unclaiming task, retry at ${retryTime()}`);
          await store.releaseClaim(claim);
          await sleep(60_000);
        } else {
          logger.line(`  ⚠ ${message} — unclaiming task`);
          await store.releaseClaim(claim);
        }
      } finally {
        clearInterval(heartbeat);
        previousDurationSeconds = Math.floor((Date.now() - startedAt) / 1000);
        await session.teardown();
      }

    }
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    await rm(registryFile, { force: true });
    try {
      await store.close();
    } finally {
      await logger.close();
    }
  }
}
