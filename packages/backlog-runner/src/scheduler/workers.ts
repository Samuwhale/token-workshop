import path from 'node:path';
import { buildDiscoveryContext, buildExecutionContext, buildPlannerContext } from '../context.js';
import { normalizePathForGit } from '../git-scope.js';
import type { RunnerLogger } from '../logger.js';
import { withLock, lockPath } from '../locks.js';
import { PLANNER_RESULT_SCHEMA, parsePlannerSupersedeAction, plannerBatchSize } from '../planner.js';
import { runProvider } from '../providers/index.js';
import { JSON_SCHEMA, isAuthFailure, isRateLimited } from '../providers/common.js';
import { createFileBackedTaskStore } from '../store/task-store.js';
import type {
  BacklogPassType,
  BacklogRunnerConfig,
  BacklogTaskClaim,
  BacklogWorkerResult,
  CommandRunner,
  ResolvedRunOptions,
  WorkspaceSession,
  WorkspaceStrategy,
} from '../types.js';
import { PREFLIGHT_DEFERRAL_MS } from './constants.js';
import {
  bookkeepingPaths,
  diffForPaths,
  formatDuration,
  genericWorkerResult,
  getRunnerConfig,
  logDrainResult,
  readPrompt,
  retryTime,
  runValidationCommand,
  taskCommitPaths,
  taskExecutionPaths,
  taskWorkerResult,
  validateStagedWorkspace,
  validateWorkspaceScope,
} from './helpers.js';
import {
  applyClaimRepairOutcome,
  attemptTaskReconciliation,
  tryWithRemediation,
} from './remediation.js';
import { classifyValidationFailure, queueNonBlockingValidationFollowup } from './validation-classify.js';

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

export async function runDiscoveryWorker(
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

export async function runPlannerWorker(
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

export async function runTaskWorker(
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
      const outcome = await tryWithRemediation(config, store, commandRunner, logger, options, claim, startedAt, {
        mode: 'preflight',
        cwd: session.cwd,
        allowedPaths,
        failureReason: stagedPreflight.reason ?? 'dirty workspace preflight',
        verify: async () => validateStagedWorkspace(commandRunner, session.cwd, allowedPaths, 'dirty workspace preflight'),
      });
      if (!('ok' in outcome)) return outcome;
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
      const outcome = await tryWithRemediation(config, store, commandRunner, logger, options, claim, startedAt, {
        mode: 'scope',
        cwd: session.cwd,
        allowedPaths,
        failureReason: initialScopeCheck.reason ?? 'write scope violation',
        verify: async () => validateWorkspaceScope(commandRunner, session.cwd, allowedPaths, 'write scope violation'),
      });
      if (!('ok' in outcome)) return outcome;
      logger.line('  ✓ write scope repaired');
    }

    const validationCommand = config.validationProfiles[claim.task.validationProfile] ?? config.validationCommand;
    logger.line('');
    logger.line(`  Running validation profile "${claim.task.validationProfile}": ${validationCommand}`);
    let validationSummary: string | undefined;
    const validation = await runValidationCommand(commandRunner, validationCommand, session.cwd);
    if (!validation.ok) {
      validationSummary = validation.summary;
      const outcome = await tryWithRemediation(config, store, commandRunner, logger, options, claim, startedAt, {
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
          const postRepairScope = await validateWorkspaceScope(commandRunner, session.cwd, allowedPaths, 'post-validation scope violation');
          return postRepairScope.ok
            ? { ok: true }
            : { ok: false, reason: postRepairScope.reason ?? 'post-validation scope violation' };
        },
      });
      if ('ok' in outcome) {
        logger.line('  ✓ validation recovered by remediation');
      } else {
        const classification = classifyValidationFailure(claim, outcome.note ?? `validation failed: ${validation.summary}`);
        if (classification.blocking) {
          return outcome;
        }
        await queueNonBlockingValidationFollowup(store, logger, claim, classification);
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
      const outcome = await tryWithRemediation(config, store, commandRunner, logger, options, claim, startedAt, {
        mode: 'scope',
        cwd: session.cwd,
        allowedPaths,
        failureReason: postValidationScopeCheck.reason ?? 'post-validation scope violation',
        verify: async () => {
          const scopeResult = await validateWorkspaceScope(commandRunner, session.cwd, allowedPaths, 'post-validation scope violation');
          if (!scopeResult.ok) return scopeResult;
          const rerun = await runValidationCommand(commandRunner, validationCommand, session.cwd);
          return rerun.ok ? { ok: true } : { ok: false, reason: `validation failed: ${rerun.summary}` };
        },
      });
      if (!('ok' in outcome)) return outcome;
      logger.line('  ✓ post-validation scope repaired');
    }

    const message = `chore(backlog): done – ${result.item || claim.task.title}`;
    const finalizationResult = await withLock(lockPath(config, 'git'), 30, async (): Promise<BacklogWorkerResult | undefined> => {
      logger.line('');

      if (options.worktrees) {
        logger.line(`  Merging to main: ${claim.task.title}`);
        const originalDiff = await diffForPaths(commandRunner, session.cwd, allowedPaths);
        const mergeResult = await session.merge();
        if (!mergeResult.ok) {
          const recovered = await attemptTaskReconciliation(
            config, store, workspaceStrategy, commandRunner, logger, options, claim,
            mergeResult.reason ?? 'merge failed', originalDiff, false, message, mergeResult, sleep,
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
      } else {
        logger.line(`  Finalizing code changes: ${claim.task.title}`);
      }

      logDrainResult(logger, 'Candidate planner', await store.drainCandidateQueue());

      const finalizeResult = await workspaceStrategy.commitAndPush(
        message,
        taskCommitPaths(config, claim.task.touchPaths),
        { sleep },
      );
      if (!finalizeResult.ok) {
        const failReason = options.worktrees ? 'finalize failed after merge' : 'commit/push failed';
        const recovered = await attemptTaskReconciliation(
          config, store, workspaceStrategy, commandRunner, logger, options, claim,
          finalizeResult.reason ?? failReason,
          await diffForPaths(commandRunner, config.projectRoot, allowedPaths),
          false, message, finalizeResult, sleep,
        );
        if (!recovered.recovered) {
          await applyClaimRepairOutcome(store, logger, claim, recovered, finalizeResult.reason ?? failReason);
          return taskWorkerResult(recovered.deferred ? 'deferred' : 'failed', claim, startedAt, {
            note: recovered.failureReason ?? finalizeResult.reason ?? failReason,
            queuedFollowups: recovered.queuedFollowups,
            validationSummary,
          });
        }
        return undefined;
      }

      await store.completeClaim(claim, result.note || 'completed');
      logger.line(`  ✓ Marked done after ${options.worktrees ? 'merge' : 'finalize'}`);
    });
    if (finalizationResult) {
      return finalizationResult;
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
