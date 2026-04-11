import { buildReconciliationContext, buildWorkspaceRepairContext } from '../context.js';
import type { RunnerLogger } from '../logger.js';
import { runProvider } from '../providers/index.js';
import { JSON_SCHEMA } from '../providers/common.js';
import { createFileBackedTaskStore } from '../store/task-store.js';
import type {
  BacklogDrainResult,
  BacklogRunnerConfig,
  BacklogTaskClaim,
  CommandRunner,
  ResolvedRunOptions,
  WorkspaceApplyResult,
  WorkspaceRepairResult,
  WorkspaceStrategy,
} from '../types.js';
import { PREFLIGHT_DEFERRAL_MS, RECONCILIATION_MAX_TURNS } from './constants.js';
import {
  changedFiles,
  diffForPaths,
  getRunnerConfig,
  logDrainResult,
  readPrompt,
  runValidationCommand,
  scopeViolations,
  stagedFiles,
  taskCommitPaths,
  taskExecutionPaths,
  validateWorkspaceScope,
} from './helpers.js';
import { classifyValidationFailure, queueNonBlockingValidationFollowup } from './validation-classify.js';

export function reconciliationPrompt(basePrompt: string): string {
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

export function workspaceRepairPrompt(basePrompt: string, worktreeMode = true): string {
  const ownershipGuidance = worktreeMode
    ? '- This repository is agent-operated by default. You may decide what to keep, discard, split into follow-up work, or restage when needed.'
    : '- In shared-workspace mode, user-originated changes may be present. Do not discard uncommitted changes unless you can confirm they were agent-originated.';
  return `${basePrompt}

## Workspace Repair Mode
You are repairing repo/workspace state for an already-assigned task.
${ownershipGuidance}
- Inspect local code and git state before deciding; do not guess when the repo can answer the question.
- Leave an audit trail in progress notes when you discard or split work.
- If the task is stale or impossible, return failed with a note starting exactly "stale —" or "impossible —".
- Otherwise, repair the workspace so scheduler preflight, scope, validation, and finalization can proceed.
- End with the same strict JSON success/failure object as normal execution.`;
}

export function shouldFailFromRepairReason(reason?: string): boolean {
  return /^stale\s+—/i.test(reason ?? '') || /^impossible\s+—/i.test(reason ?? '');
}

export async function collectWorkspaceSnapshot(
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

export async function appendRepairNotes(
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

export async function attemptWorkspaceRemediation(
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
    prompt: workspaceRepairPrompt(await readPrompt(config.prompts.agent), options.worktrees),
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

export async function applyClaimRepairOutcome(
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

export async function applyTaskRepairOutcome(
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

export async function tryWithRemediation(
  config: BacklogRunnerConfig,
  store: ReturnType<typeof createFileBackedTaskStore>,
  commandRunner: CommandRunner,
  logger: RunnerLogger,
  options: ResolvedRunOptions,
  claim: BacklogTaskClaim,
  startedAt: number,
  remediation: {
    mode: 'preflight' | 'scope' | 'validation';
    cwd: string;
    allowedPaths: string[];
    failureReason: string;
    validationSummary?: string;
    verify: () => Promise<{ ok: boolean; reason?: string }>;
  },
): Promise<{ ok: true } | BacklogWorkerResult> {
  const repaired = await attemptWorkspaceRemediation(
    config, store, commandRunner, logger, options, claim, remediation,
  );
  if (repaired.recovered) {
    return { ok: true };
  }
  await applyClaimRepairOutcome(store, logger, claim, repaired, remediation.failureReason);
  return {
    kind: repaired.deferred ? 'deferred' : 'failed',
    taskId: claim.task.id,
    durationSeconds: Math.max(1, Math.floor((Date.now() - startedAt) / 1000)),
    queuedFollowups: repaired.queuedFollowups,
    note: repaired.failureReason ?? remediation.failureReason,
    validationSummary: remediation.validationSummary,
  };
}

export async function attemptTaskReconciliation(
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

    if (!taskAlreadyCompleted) {
      await store.completeClaim(claim, `completed after reconciliation: ${result.note || 'reconciled successfully'}`);
      if (drainResult.createdTasks > 0) {
        await store.appendTaskNote(claim.task.id, `Follow-up queued by remediation: ${drainResult.createdTasks} task(s)`);
      }
    } else {
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
