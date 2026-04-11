import { readFile, rm, writeFile } from 'node:fs/promises';
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
  BacklogRunnerRole,
  BacklogWorkerResult,
  BacklogRunnerConfig,
  OrchestratorRuntimeStatus,
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
import { BACKLOG_RUNNER_ROLES } from './types.js';

const PLANNER_LANE_READY_TARGET = 2;
const ORCHESTRATOR_POLL_INTERVAL_MS = 3_000;
const EMPTY_QUEUE_POLL_INTERVAL_MS = 30_000;
const RECONCILIATION_MAX_TURNS = 60;
const PREFLIGHT_DEFERRAL_MS = 15 * 60 * 1000;
const PLANNER_NO_PROGRESS_COOLDOWN_MS = 15_000;
const RATE_LIMIT_BACKOFF_MS = 60_000;
const REPO_PATH_PATTERN =
  /\b(packages\/[^:\s|)]+|scripts\/[^:\s|)]+|backlog\/[^:\s|)]+|README\.md|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|backlog\.config\.mjs)\b/g;
const PACKAGE_RELATIVE_SRC_PATH_PATTERN = /\bsrc\/[^:\s|)]+/g;
const MODULE_RESOLUTION_ERROR_PATTERNS = [
  /Failed to load url\b/i,
  /\bCannot find module\b/i,
  /\bERR_MODULE_NOT_FOUND\b/i,
  /\bMODULE_NOT_FOUND\b/i,
  /\bDoes the file exist\?\b/i,
];
const WORKTREE_LOCATION_PATTERNS = [
  /(?:^|[^\w])\/tmp\//i,
  /\/private\/var\//i,
  /\/var\/folders\//i,
  /\bworktree\b/i,
];
const BOOTSTRAP_MARKER_PATTERNS = [
  /\bvirtualStoreDir\b/i,
  /\b\.pnpm\b/i,
  /\bbootstrap\b/i,
  /\bhoist(?:ed|ing)?\b/i,
];

type ValidationFailureClassification =
  | { blocking: true; reason: string }
  | { blocking: false; reason: string; followup: BacklogCandidateRecord };

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

function getRunnerConfig(options: ResolvedRunOptions, role: BacklogRunnerRole) {
  return options.runners[role];
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

function isExplicitWorkspaceValidationIssue(reason: string): boolean {
  const hasModuleResolutionSignal = MODULE_RESOLUTION_ERROR_PATTERNS.some(pattern => pattern.test(reason));
  if (!hasModuleResolutionSignal) {
    return false;
  }

  const hasWorktreeLocation = WORKTREE_LOCATION_PATTERNS.some(pattern => pattern.test(reason));
  const hasBootstrapMarker = BOOTSTRAP_MARKER_PATTERNS.some(pattern => pattern.test(reason));
  return hasWorktreeLocation || hasBootstrapMarker;
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

  if (isExplicitWorkspaceValidationIssue(normalizedReason)) {
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

function shouldAttemptPlannerBatch(
  batchKey: string,
  waitingPlannerBatchKey: string | null,
  reason: 'recover-failed' | 'fill-buffer',
): boolean {
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
    tool: getRunnerConfig(options, 'task').tool,
    model: getRunnerConfig(options, 'task').model,
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
      tool: getRunnerConfig(options, 'task').tool,
      model: getRunnerConfig(options, 'task').model,
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

async function currentPlannerBatchKey(
  store: ReturnType<typeof createFileBackedTaskStore>,
): Promise<string> {
  const plannerCandidates = await store.listPlannerCandidates(plannerBatchSize());
  return plannerCandidates.map(task => task.id).join(',');
}

function workerDurationSeconds(startedAt: number): number {
  return Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
}

function taskWorkerResult(
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

function genericWorkerResult(
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

type ActiveControlWorker = {
  kind: 'planner' | 'discovery';
  promise: Promise<BacklogWorkerResult>;
  batchKey?: string;
  passType?: BacklogPassType;
};

function describeActiveControlWorker(worker: ActiveControlWorker | null): string {
  return worker ? worker.kind : 'idle';
}

function collectActiveControlPromises(worker: ActiveControlWorker | null): Promise<BacklogWorkerResult>[] {
  return worker ? [worker.promise] : [];
}

async function writeOrchestratorStatus(config: BacklogRunnerConfig, status: OrchestratorRuntimeStatus): Promise<void> {
  await writeFile(
    path.join(config.files.runtimeDir, 'orchestrator-status.json'),
    `${JSON.stringify(status, null, 2)}\n`,
    'utf8',
  );
}

async function clearOrchestratorStatus(config: BacklogRunnerConfig): Promise<void> {
  await rm(path.join(config.files.runtimeDir, 'orchestrator-status.json'), { force: true });
}

function renderOrchestratorStatusLines(status: OrchestratorRuntimeStatus): string[] {
  return [
    `Orchestrator: ${status.orchestratorId}`,
    `Workers: ${status.effectiveWorkers}/${status.requestedWorkers}`,
    `Shutdown requested: ${status.shutdownRequested ? 'yes' : 'no'}`,
    `Poll interval: ${Math.floor(status.pollIntervalMs / 1000)}s`,
    `Active task workers: ${status.activeTaskWorkers.length === 0 ? 'none' : status.activeTaskWorkers.map(worker => `${worker.title} (${worker.taskId})`).join(' · ')}`,
    `Active control worker: ${status.activeControlWorker ? status.activeControlWorker.kind === 'discovery' ? `discovery${status.activeControlWorker.passType ? `:${status.activeControlWorker.passType}` : ''}` : 'planner' : 'none'}`,
  ];
}

async function stampRuntimeReport(config: BacklogRunnerConfig, status: OrchestratorRuntimeStatus): Promise<void> {
  const report = await readFile(config.files.runtimeReport, 'utf8').catch(() => '');
  if (!report) {
    return;
  }
  const lines = report.split('\n');
  const generatedIndex = lines.findIndex(line => line.startsWith('Generated:'));
  const queueIndex = lines.findIndex(line => line.startsWith('Queue: '));
  if (generatedIndex === -1 || queueIndex === -1 || queueIndex <= generatedIndex) {
    return;
  }

  const stamped = [
    ...lines.slice(0, generatedIndex + 1),
    '',
    ...renderOrchestratorStatusLines(status),
    '',
    ...lines.slice(queueIndex),
  ];
  await writeFile(config.files.runtimeReport, stamped.join('\n'), 'utf8');
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

async function runSingleDiscoveryPass(
  config: BacklogRunnerConfig,
  store: ReturnType<typeof createFileBackedTaskStore>,
  workspaceStrategy: WorkspaceStrategy,
  commandRunner: CommandRunner,
  logger: RunnerLogger,
  options: ResolvedRunOptions,
  passType: BacklogPassType,
  sleep?: (ms: number) => Promise<void>,
): Promise<BacklogWorkerResult> {
  const startedAt = Date.now();
  logger.line('');
  logger.line('================================================================');
  logger.line(`  ★ Maintenance Pass: ${passType}`);
  logger.line('================================================================');

  const session = await workspaceStrategy.setup();
  try {
    const context = await buildDiscoveryContext(config);
    const runner = getRunnerConfig(options, passType);
    const result = await runProvider(commandRunner, {
      tool: runner.tool,
      model: runner.model,
      context,
      prompt: await readPrompt(config.passes[passType].promptFile),
      cwd: session.cwd,
      maxTurns: 12,
      schema: JSON_SCHEMA,
    });

    if (result.status === 'failed') {
      logger.line(`  ✗ ${passType} pass failed: ${result.item}`);
      if (result.note) logger.line(`    ${result.note}`);
      return genericWorkerResult('no_progress', startedAt, { note: result.note || 'agent reported failure' });
    }

    logger.line(`  ✓ ${passType} pass: ${result.item}`);
    if (result.note) logger.line(`    ${result.note}`);

    const workspaceCheck = await validateWorkspaceScope(
      commandRunner,
      session.cwd,
      [
        normalizePathForGit(path.relative(config.projectRoot, config.files.candidateQueue)),
        normalizePathForGit(path.relative(config.projectRoot, config.files.progress)),
        normalizePathForGit(path.relative(config.projectRoot, config.files.patterns)),
      ],
      'discovery pass touched non-planner files',
    );
    if (!workspaceCheck.ok) {
      logger.line(`  WARNING: ${workspaceCheck.reason}`);
      return genericWorkerResult('no_progress', startedAt, { note: workspaceCheck.reason });
    }

    const commitMessage = `chore(backlog): ${passType} pass – ${result.item || 'maintenance'}`;
    let persisted = false;
    await withLock(lockPath(config, 'git'), 30, async () => {
      const mergeResult = await session.merge();
      if (!mergeResult.ok) {
        logger.line(`  ✗ ${passType} pass merge failed: ${mergeResult.reason ?? 'unknown'}`);
        return;
      }

      logDrainResult(logger, 'Candidate planner', await store.drainCandidateQueue());
      const finalizeResult = await workspaceStrategy.commitAndPush(commitMessage, bookkeepingPaths(config), { sleep });
      if (!finalizeResult.ok) {
        logger.line(`  ✗ ${passType} pass finalize failed: ${finalizeResult.reason ?? 'unknown'}`);
        return;
      }
      persisted = true;
    });
    if (!persisted) {
      return genericWorkerResult('no_progress', startedAt, { note: `${passType} pass succeeded but persistence failed` });
    }
    return genericWorkerResult('completed', startedAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isAuthFailure(message)) {
      throw new Error('Authentication/permission error — check your API key and tool setup');
    }
    if (isRateLimited(message)) {
      logger.line(`  ⚠ Rate limit hit during ${passType} pass — skipping`);
      return genericWorkerResult('rate_limited', startedAt, { note: message });
    }
    logger.line(`  · ${passType} pass skipped — ${message}`);
    return genericWorkerResult('no_progress', startedAt, { note: message });
  } finally {
    await session.teardown();
  }
}

async function runDiscoveryWorker(
  config: BacklogRunnerConfig,
  store: ReturnType<typeof createFileBackedTaskStore>,
  workspaceStrategy: WorkspaceStrategy,
  commandRunner: CommandRunner,
  logger: RunnerLogger,
  options: ResolvedRunOptions,
  sleep?: (ms: number) => Promise<void>,
  onPassStart?: (passType: BacklogPassType) => void,
): Promise<BacklogWorkerResult> {
  const startedAt = Date.now();
  const before = await store.getQueueCounts();
  for (const passType of ['product', 'code', 'ux'] as const) {
    onPassStart?.(passType);
    const result = await runSingleDiscoveryPass(config, store, workspaceStrategy, commandRunner, logger, options, passType, sleep);
    if (result.kind === 'rate_limited') {
      return genericWorkerResult('rate_limited', startedAt, { note: result.note });
    }
  }
  const after = await store.getQueueCounts();
  const changed = before.ready !== after.ready
    || before.planned !== after.planned
    || before.failed !== after.failed
    || before.blocked !== after.blocked
    || before.inProgress !== after.inProgress
    || before.done !== after.done;
  return genericWorkerResult(changed ? 'completed' : 'no_progress', startedAt);
}

async function runPlannerWorker(
  config: BacklogRunnerConfig,
  store: ReturnType<typeof createFileBackedTaskStore>,
  workspaceStrategy: WorkspaceStrategy,
  commandRunner: CommandRunner,
  logger: RunnerLogger,
  options: ResolvedRunOptions,
): Promise<BacklogWorkerResult> {
  const startedAt = Date.now();
  return withLock(lockPath(config, 'planner'), 30, async () => {
    const plannerCandidates = await store.listPlannerCandidates(plannerBatchSize());
    if (plannerCandidates.length === 0) {
      return genericWorkerResult('no_progress', startedAt, { note: 'no planner candidates' });
    }

    logger.line('');
    logger.line('================================================================');
    logger.line('  ★ Planner Refinement Pass');
    logger.line('================================================================');

    const session = await workspaceStrategy.setup();
    try {
      const context = await buildPlannerContext(config, plannerCandidates);
      const runner = getRunnerConfig(options, 'planner');
      const result = await runProvider(commandRunner, {
        tool: runner.tool,
        model: runner.model,
        context,
        prompt: await readPrompt(config.prompts.planner),
        cwd: session.cwd,
        maxTurns: 12,
        schema: PLANNER_RESULT_SCHEMA,
      });

      if (result.status !== 'done') {
        logger.line(`  · planner refinement skipped — ${result.note || 'planner reported failure'}`);
        return genericWorkerResult('no_progress', startedAt, { note: result.note || 'planner reported failure' });
      }

      const workspaceCheck = await validateWorkspaceScope(
        commandRunner,
        session.cwd,
        [],
        'planner pass touched repo files',
      );
      if (!workspaceCheck.ok) {
        logger.line(`  WARNING: ${workspaceCheck.reason}`);
        return genericWorkerResult('no_progress', startedAt, { note: workspaceCheck.reason });
      }

      const action = parsePlannerSupersedeAction(result.rawOutput, config);
      if (!action) {
        logger.line('  WARNING: planner pass returned invalid structured action payload');
        return genericWorkerResult('no_progress', startedAt, { note: 'planner pass returned invalid structured action payload' });
      }

      const applied = await store.applyPlannerSupersede(action, {
        allowedParentTaskIds: plannerCandidates.map(task => task.id),
      });
      logger.line(`  ✓ planner pass: ${result.item}`);
      if (result.note) logger.line(`    ${result.note}`);
      logger.line(`  ✓ superseded ${applied.parentTaskIds.length} planner candidate${applied.parentTaskIds.length === 1 ? '' : 's'} with ${applied.childTaskIds.length} child task${applied.childTaskIds.length === 1 ? '' : 's'}`);
      return genericWorkerResult('completed', startedAt, { note: result.note });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isAuthFailure(message)) {
        throw new Error('Authentication/permission error — check your API key and tool setup');
      }
      if (isRateLimited(message)) {
        logger.line('  ⚠ Rate limit hit during planner refinement — skipping');
        return genericWorkerResult('rate_limited', startedAt, { note: message });
      }
      logger.line(`  · planner refinement skipped — ${message}`);
      return genericWorkerResult('no_progress', startedAt, { note: message });
    } finally {
      await session.teardown();
    }
  });
}

async function runTaskWorker(
  config: BacklogRunnerConfig,
  store: ReturnType<typeof createFileBackedTaskStore>,
  workspaceStrategy: WorkspaceStrategy,
  commandRunner: CommandRunner,
  logger: RunnerLogger,
  options: ResolvedRunOptions,
  claim: BacklogTaskClaim,
  sleep?: (ms: number) => Promise<void>,
): Promise<BacklogWorkerResult> {
  const startedAt = Date.now();
  logger.line(`  → ${claim.task.title} (${claim.task.id})`);

  let session: WorkspaceSession;
  try {
    session = await workspaceStrategy.setup();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.deferClaim(claim, `workspace setup failed: ${message}`, PREFLIGHT_DEFERRAL_MS, { category: 'preflight' });
    logger.line(`  ⚠ workspace setup failed: ${message} — deferred for retry`);
    return taskWorkerResult('deferred', claim, startedAt, { note: message });
  }

  if (options.worktrees) {
    logger.line(`  Worktree: ${session.cwd}`);
  }

  const heartbeat = setInterval(() => {
    void store.heartbeatClaim(claim).catch(() => undefined);
  }, 30_000);
  heartbeat.unref?.();

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
        return taskWorkerResult(repaired.deferred ? 'deferred' : 'failed', claim, startedAt, {
          note: repaired.failureReason ?? stagedPreflight.reason,
          queuedFollowups: repaired.queuedFollowups,
        });
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
        logger.line(`  WARNING: main checkout has unexpected staged files — deferring task`);
        logger.line(`  (reason: ${mainRepoStagedPreflight.reason})`);
        await store.deferClaim(claim, mainRepoStagedPreflight.reason ?? 'main checkout not clean', 60_000, { category: 'preflight' });
        return taskWorkerResult('deferred', claim, startedAt, {
          note: `main checkout not clean: ${mainRepoStagedPreflight.reason}`,
        });
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
      tool: getRunnerConfig(options, 'task').tool,
      model: getRunnerConfig(options, 'task').model,
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
      return taskWorkerResult('failed', claim, startedAt, { note: result.note || 'agent reported failure' });
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
        return taskWorkerResult(repaired.deferred ? 'deferred' : 'failed', claim, startedAt, {
          note: repaired.failureReason ?? initialScopeCheck.reason,
          queuedFollowups: repaired.queuedFollowups,
        });
      }
      logger.line('  ✓ write scope repaired');
    }

    const validationCommand = config.validationProfiles[claim.task.validationProfile] ?? config.validationCommand;
    logger.line('');
    logger.line(`  Running validation profile "${claim.task.validationProfile}": ${validationCommand}`);
    let validationSummary: string | undefined;
    const validation = await runValidationCommand(commandRunner, validationCommand, session.cwd);
    if (!validation.ok) {
      validationSummary = validation.summary;
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
          return taskWorkerResult(repaired.deferred ? 'deferred' : 'failed', claim, startedAt, {
            note: failureReason,
            queuedFollowups: repaired.queuedFollowups,
            validationSummary,
          });
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
        return taskWorkerResult(repaired.deferred ? 'deferred' : 'failed', claim, startedAt, {
          note: repaired.failureReason ?? postValidationScopeCheck.reason,
          queuedFollowups: repaired.queuedFollowups,
          validationSummary,
        });
      }
      logger.line('  ✓ post-validation scope repaired');
    }

    const message = `chore(backlog): done – ${result.item || claim.task.title}`;
    if (options.worktrees) {
      const finalizationResult = await withLock(lockPath(config, 'git'), 30, async (): Promise<BacklogWorkerResult | undefined> => {
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
            return taskWorkerResult(recovered.deferred ? 'deferred' : 'failed', claim, startedAt, {
              note: recovered.failureReason ?? mergeResult.reason ?? 'merge failed',
              queuedFollowups: recovered.queuedFollowups,
              validationSummary,
            });
          }
          return undefined;
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
            return taskWorkerResult(recovered.deferred ? 'deferred' : 'failed', claim, startedAt, {
              note: recovered.failureReason ?? finalizeResult.reason ?? 'finalize failed after merge',
              queuedFollowups: recovered.queuedFollowups,
              validationSummary,
            });
          }
          return undefined;
        }

        logger.line('  ✓ Marked done after merge');
      });
      if (finalizationResult) {
        return finalizationResult;
      }
    } else {
      const finalizationResult = await withLock(lockPath(config, 'git'), 30, async (): Promise<BacklogWorkerResult | undefined> => {
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
            return taskWorkerResult(recovered.deferred ? 'deferred' : 'failed', claim, startedAt, {
              note: recovered.failureReason ?? finalizeResult.reason ?? 'commit/push failed',
              queuedFollowups: recovered.queuedFollowups,
              validationSummary,
            });
          }
          return undefined;
        }

        logger.line('  ✓ Marked done after finalize');
      });
      if (finalizationResult) {
        return finalizationResult;
      }
    }
    return taskWorkerResult('completed', claim, startedAt, {
      note: result.note || 'completed',
      validationSummary,
    });
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
      return taskWorkerResult('rate_limited', claim, startedAt, { note: message });
    }
    logger.line(`  ⚠ ${message} — unclaiming task`);
    await store.releaseClaim(claim);
    return taskWorkerResult('released', claim, startedAt, { note: message });
  } finally {
    clearInterval(heartbeat);
    await session.teardown();
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
  const effectiveWorkers = options.worktrees ? options.workers : 1;
  const workspaceStrategy: WorkspaceStrategy = options.worktrees
    ? new GitWorktreeWorkspaceStrategy(commandRunner, config)
    : new InPlaceWorkspaceStrategy(commandRunner, config);
  const orchestratorId = `${process.pid}-${Date.now()}`;

  if (options.worktrees) {
    await pruneGitWorktrees(commandRunner, config, logger);
  }

  let stopRequested = false;
  let fatalError: Error | null = null;
  let rateLimitUntil = 0;
  let discoveryCooldownUntil = 0;
  let plannerCooldownBatchKey: string | null = null;
  let plannerCooldownUntil = 0;
  let iteration = 0;
  let previousCompletedTaskDuration = 0;

  const taskWorkers = new Map<string, { title: string; promise: Promise<BacklogWorkerResult> }>();
  let controlWorker: ActiveControlWorker | null = null;

  const updateStatus = async (): Promise<void> => {
    const status: OrchestratorRuntimeStatus = {
      orchestratorId,
      requestedWorkers: options.workers,
      effectiveWorkers,
      activeTaskWorkers: [...taskWorkers.entries()].map(([taskId, worker]) => ({ taskId, title: worker.title })),
      activeControlWorker: controlWorker
        ? controlWorker.kind === 'planner'
          ? { kind: 'planner' }
          : { kind: 'discovery', passType: controlWorker.passType }
        : undefined,
      shutdownRequested: stopRequested || fatalError !== null,
      pollIntervalMs: ORCHESTRATOR_POLL_INTERVAL_MS,
    };
    await writeOrchestratorStatus(config, status);
    await store.getQueueCounts();
    await stampRuntimeReport(config, status);
  };

  const handleTaskWorkerResult = (result: BacklogWorkerResult): void => {
    if (result.durationSeconds > 0) {
      previousCompletedTaskDuration = result.durationSeconds;
    }
    if (result.kind === 'rate_limited') {
      rateLimitUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
    }
  };

  const handleControlWorkerResult = (kind: 'planner' | 'discovery', batchKey: string | undefined, result: BacklogWorkerResult): void => {
    if (result.kind === 'rate_limited') {
      rateLimitUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      return;
    }
    if (kind === 'planner') {
      if (result.kind === 'completed') {
        plannerCooldownBatchKey = null;
        plannerCooldownUntil = 0;
        return;
      }
      plannerCooldownBatchKey = batchKey ?? null;
      plannerCooldownUntil = Date.now() + PLANNER_NO_PROGRESS_COOLDOWN_MS;
      return;
    }
    if (kind === 'discovery') {
      discoveryCooldownUntil = result.kind === 'completed' ? 0 : Date.now() + EMPTY_QUEUE_POLL_INTERVAL_MS;
    }
  };

  const launchTaskWorker = (claim: BacklogTaskClaim): void => {
    const promise = runTaskWorker(
      config,
      store,
      workspaceStrategy,
      commandRunner,
      logger,
      options,
      claim,
      sleep,
    )
      .then(result => {
        handleTaskWorkerResult(result);
        return result;
      })
      .catch(error => {
        fatalError = error instanceof Error ? error : new Error(String(error));
        logger.line(`  ✗ ${fatalError.message}`);
        return genericWorkerResult('failed', Date.now(), { note: fatalError.message });
      })
      .finally(async () => {
        try {
          await updateStatus();
        } finally {
          taskWorkers.delete(claim.task.id);
        }
      });
    taskWorkers.set(claim.task.id, { title: claim.task.title, promise });
  };

  const launchPlannerWorker = (batchKey: string): void => {
    const promise = runPlannerWorker(
      config,
      store,
      workspaceStrategy,
      commandRunner,
      logger,
      options,
    )
      .then(result => {
        handleControlWorkerResult('planner', batchKey, result);
        return result;
      })
      .catch(error => {
        fatalError = error instanceof Error ? error : new Error(String(error));
        logger.line(`  ✗ ${fatalError.message}`);
        return genericWorkerResult('failed', Date.now(), { note: fatalError.message });
      })
      .finally(async () => {
        try {
          await updateStatus();
        } finally {
          controlWorker = null;
        }
      });
    controlWorker = { kind: 'planner', promise, batchKey };
  };

  const launchDiscoveryWorker = (): void => {
    const promise = runDiscoveryWorker(
      config,
      store,
      workspaceStrategy,
      commandRunner,
      logger,
      options,
      sleep,
      (passType) => { if (controlWorker) controlWorker.passType = passType; },
    )
      .then(result => {
        handleControlWorkerResult('discovery', undefined, result);
        return result;
      })
      .catch(error => {
        fatalError = error instanceof Error ? error : new Error(String(error));
        logger.line(`  ✗ ${fatalError.message}`);
        return genericWorkerResult('failed', Date.now(), { note: fatalError.message });
      })
      .finally(async () => {
        try {
          await updateStatus();
        } finally {
          controlWorker = null;
        }
      });
    controlWorker = { kind: 'discovery', promise };
  };

  const onSignal = () => {
    stopRequested = true;
    logger.line('');
    logger.line('  → Stop requested — stopping new dispatch and waiting for in-flight workers.');
    void updateStatus();
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
    logger.line(`  Orchestrator: ${orchestratorId}`);
    logger.line(`  Workers:      ${effectiveWorkers}${effectiveWorkers !== options.workers ? ` (requested ${options.workers})` : ''}`);
    logger.line(`  Mode:         ${options.worktrees ? 'parallel (worktrees)' : 'single (shared workspace)'}`);
    logger.line(`  Passes:       ${options.passes ? 'enabled' : 'disabled'}`);
    logger.line('  Runners:');
    for (const role of BACKLOG_RUNNER_ROLES) {
      const runner = getRunnerConfig(options, role);
      logger.line(`    ${role.padEnd(7, ' ')} ${runner.tool}${runner.model ? ` · ${runner.model}` : ''}`);
    }
    logger.line(`  Stop:         Ctrl+C  (or: touch ${config.files.stop})`);
    await updateStatus();

    while (!stopRequested && !fatalError && !(await fileExists(config.files.stop))) {
      iteration += 1;
      logDrainResult(logger, 'Candidate planner', await store.drainCandidateQueue());
      const counts = await store.getQueueCounts();

      logger.line('');
      logger.line('═══════════════════════════════════════════════════════════════');
      const activeControlKind = describeActiveControlWorker(controlWorker);
      logger.line(
        `  #${iteration} · ${counts.ready} ready · ${counts.blocked} blocked · ${counts.planned} planned · ${counts.inProgress} in-progress` +
        (previousCompletedTaskDuration ? ` · last task ${formatDuration(previousCompletedTaskDuration)}` : ''),
      );
      logger.line(`  Active workers: ${taskWorkers.size}/${effectiveWorkers} task · ${activeControlKind} control`);
      logger.line('═══════════════════════════════════════════════════════════════');
      await updateStatus();

      const now = Date.now();
      if (now < rateLimitUntil) {
        logger.line(`  Rate limit backoff active until ${new Date(rateLimitUntil).toTimeString().slice(0, 8)}.`);
        await sleep(ORCHESTRATOR_POLL_INTERVAL_MS);
        continue;
      }

      if (!controlWorker && (counts.failed > 0 || (counts.planned > 0 && counts.ready < PLANNER_LANE_READY_TARGET))) {
        const plannerReason: 'recover-failed' | 'fill-buffer' = counts.failed > 0 ? 'recover-failed' : 'fill-buffer';
        const batchKey = await currentPlannerBatchKey(store);
        const plannerCooldownActive = plannerCooldownBatchKey === batchKey && now < plannerCooldownUntil;
        if (batchKey && shouldAttemptPlannerBatch(batchKey, plannerCooldownActive ? plannerCooldownBatchKey : null, plannerReason)) {
          launchPlannerWorker(batchKey);
          await updateStatus();
        }
      }

      if (taskWorkers.size < effectiveWorkers) {
        const claims = await store.claimNextRunnableTasks(effectiveWorkers - taskWorkers.size, orchestratorId);
        for (const claim of claims) {
          launchTaskWorker(claim);
        }
        if (claims.length > 0) {
          await updateStatus();
          await sleep(ORCHESTRATOR_POLL_INTERVAL_MS);
          continue;
        }
      }

      if (
        !controlWorker
        && taskWorkers.size === 0
        && counts.ready === 0
        && counts.planned === 0
        && counts.failed === 0
        && counts.inProgress === 0
        && options.passes
        && now >= discoveryCooldownUntil
      ) {
        logger.line('  No tasks found — running discovery passes to replenish backlog…');
        launchDiscoveryWorker();
        await updateStatus();
        await sleep(ORCHESTRATOR_POLL_INTERVAL_MS);
        continue;
      }

      if (!controlWorker && taskWorkers.size === 0 && counts.ready === 0 && counts.planned === 0 && counts.failed === 0) {
        if (counts.blocked > 0) {
          logger.line('  No runnable tasks remain. Remaining tasks are blocked; stopping instead of spending tokens on new discovery.');
          break;
        }
        if (!options.passes) {
          logger.line('  Task queue empty and discovery passes are disabled — stopping.');
          break;
        }
      }

      if (!controlWorker && taskWorkers.size === 0 && counts.ready === 0 && (counts.planned > 0 || counts.failed > 0)) {
        const batchKey = await currentPlannerBatchKey(store);
        const plannerStalled = batchKey && plannerCooldownBatchKey === batchKey && Date.now() < plannerCooldownUntil;
        if (plannerStalled) {
          logger.line('  No runnable tasks remain and planner refinement made no progress — stopping.');
          break;
        }
      }

      await sleep(ORCHESTRATOR_POLL_INTERVAL_MS);
    }

    if (fatalError || stopRequested || await fileExists(config.files.stop)) {
      await updateStatus();
    }

    if (controlWorker || taskWorkers.size > 0) {
      logger.line('');
      logger.line('  Waiting for in-flight workers to settle…');
      await Promise.allSettled([
        ...[...taskWorkers.values()].map(worker => worker.promise),
        ...collectActiveControlPromises(controlWorker),
      ]);
    }

    if (fatalError) {
      throw fatalError;
    }
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    await clearOrchestratorStatus(config);
    try {
      await store.close();
    } finally {
      await logger.close();
    }
  }
}
