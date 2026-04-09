import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureConfigReady, resolveRunOptions } from './config.js';
import { buildDiscoveryContext, buildExecutionContext, buildPlannerContext } from './context.js';
import { createDefaultLogSink, RunnerLogger } from './logger.js';
import { withLock, lockPath } from './locks.js';
import { PLANNER_RESULT_SCHEMA, parsePlannerSupersedeAction, plannerBatchSize } from './planner.js';
import { createCommandRunner, sleep as defaultSleep } from './process.js';
import { runProvider } from './providers/index.js';
import { JSON_SCHEMA, isAuthFailure, isRateLimited } from './providers/common.js';
import { createFileBackedTaskStore } from './store/task-store.js';
import { isPathWithinTouchPaths } from './task-specs.js';
import type {
  BacklogDrainResult,
  BacklogPassType,
  BacklogRunnerConfig,
  BacklogRunnerLane,
  BacklogSyncResult,
  CommandRunner,
  ResolvedRunOptions,
  RunnerDependencies,
  RunOverrides,
  ValidationCommandResult,
  WorkspaceStrategy,
} from './types.js';
import { GitWorktreeWorkspaceStrategy } from './workspace/git-worktree.js';
import { InPlaceWorkspaceStrategy } from './workspace/in-place.js';

const PLANNER_LANE_READY_TARGET = 2;
const EXECUTOR_FALLBACK_READY_TARGET = 1;
const RUNNER_POLL_INTERVAL_MS = 15_000;
const EMPTY_QUEUE_POLL_INTERVAL_MS = 30_000;

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

function summarizeCommandOutput(stdout: string, stderr: string): string {
  const lines = [stdout, stderr]
    .join('\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  return lines.slice(-8).join(' | ') || 'no output';
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
  if (status.code !== 0) {
    return [];
  }

  const files = new Set<string>();
  for (const rawLine of status.stdout.split('\n').map(line => line.trimEnd()).filter(Boolean)) {
    const payload = rawLine.slice(3).trim();
    if (!payload) continue;
    const parts = payload.includes(' -> ') ? payload.split(' -> ') : [payload];
    for (const part of parts) {
      const normalized = part.replace(/^"+|"+$/g, '');
      if (normalized) files.add(normalized);
    }
  }

  return [...files];
}

function isWorktreeBootstrapArtifact(file: string): boolean {
  const normalized = normalizePathForGit(file).replace(/\/+$/, '');
  return normalized === 'node_modules' || /^packages\/[^/]+\/node_modules$/.test(normalized);
}

function scopeViolations(changed: string[], allowed: string[]): string[] {
  return changed.filter(file => !isWorktreeBootstrapArtifact(file) && !isPathWithinTouchPaths(file, allowed));
}

function normalizePathForGit(value: string): string {
  return value.split(path.sep).join('/');
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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeRunnerLane(value: unknown): BacklogRunnerLane {
  return value === 'planner' ? 'planner' : 'executor';
}

function formatRunnerCounts(counts: ActiveRunnerCounts): string {
  return `${counts.executor} executor · ${counts.planner} planner`;
}

function totalRunnerCount(counts: ActiveRunnerCounts): number {
  return counts.executor + counts.planner;
}

function plannerLaneActive(counts: ActiveRunnerCounts): boolean {
  return counts.planner > 0;
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
      const finalizeResult = await workspaceStrategy.commitAndPush(commitMessage, bookkeepingPaths(config));
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
    const plannedTasks = await store.listPlannedTasks(plannerBatchSize());
    if (plannedTasks.length === 0) {
      return false;
    }

    logger.line('');
    logger.line('================================================================');
    logger.line('  ★ Planner Refinement Pass');
    logger.line('================================================================');

    const session = await workspaceStrategy.setup();
    try {
      const context = await buildPlannerContext(config, plannedTasks);
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
        allowedParentTaskIds: plannedTasks.map(task => task.id),
      });
      logger.line(`  ✓ planner pass: ${result.item}`);
      if (result.note) logger.line(`    ${result.note}`);
      logger.line(`  ✓ superseded ${applied.parentTaskIds.length} planned task${applied.parentTaskIds.length === 1 ? '' : 's'} with ${applied.childTaskIds.length} child task${applied.childTaskIds.length === 1 ? '' : 's'}`);
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
  const plannedTasks = await store.listPlannedTasks(plannerBatchSize());
  return plannedTasks.map(task => task.id).join(',');
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
        if (counts.planned > 0 && counts.ready < PLANNER_LANE_READY_TARGET) {
          const batchKey = await currentPlannerBatchKey(store);
          if (batchKey && batchKey !== waitingPlannerBatchKey) {
            waitingPlannerBatchKey = batchKey;
            const refined = await runPlannerRefinementPass(
              config,
              store,
              workspaceStrategy,
              commandRunner,
              logger,
              options,
            );
            if (refined) {
              waitingPlannerBatchKey = null;
              continue;
            }
          }

          logger.line('  Planner lane made no progress on the current batch — polling in 15s…');
          await sleep(RUNNER_POLL_INTERVAL_MS);
          continue;
        }

        waitingPlannerBatchKey = null;
        if (counts.ready >= PLANNER_LANE_READY_TARGET) {
          logger.line(`  Planner buffer satisfied (${counts.ready}/${PLANNER_LANE_READY_TARGET} ready) — polling in 15s…`);
        } else if (counts.planned === 0) {
          logger.line('  No planned tasks to refine — polling in 15s…');
        } else {
          logger.line('  Planner lane is idle — polling in 15s…');
        }
        await sleep(RUNNER_POLL_INTERVAL_MS);
        continue;
      }

      if (counts.ready === 0) {
        if (counts.inProgress > 0) {
          if (counts.planned > 0 && counts.ready < EXECUTOR_FALLBACK_READY_TARGET && !hasPlannerPeer) {
            const batchKey = await currentPlannerBatchKey(store);
            if (batchKey && batchKey !== waitingPlannerBatchKey) {
              waitingPlannerBatchKey = batchKey;
              const refined = await runPlannerRefinementPass(
                config,
                store,
                workspaceStrategy,
                commandRunner,
                logger,
                options,
              );
              if (refined) {
                waitingPlannerBatchKey = null;
                continue;
              }
            }
          }
          if (counts.planned > 0 && hasPlannerPeer) {
            logger.line('  No runnable task available locally — planner lane active, waiting for refined work…');
          } else {
            logger.line('  No runnable task available locally — waiting 15s for other runner activity…');
          }
          await sleep(RUNNER_POLL_INTERVAL_MS);
          continue;
        }

        if (counts.planned > 0) {
          if (hasPlannerPeer) {
            logger.line('  No runnable task available locally — planner lane active, waiting for refined work…');
            await sleep(RUNNER_POLL_INTERVAL_MS);
            continue;
          }
          waitingPlannerBatchKey = null;
          const refined = await runPlannerRefinementPass(
            config,
            store,
            workspaceStrategy,
            commandRunner,
            logger,
            options,
          );
          if (refined) {
            continue;
          }
          logger.line('  No runnable tasks remain and planner refinement made no progress — stopping.');
          break;
        }

        if (counts.blocked > 0 || counts.failed > 0) {
          logger.line('  No runnable tasks remain. Remaining tasks are blocked or failed; stopping instead of spending tokens on new discovery.');
          break;
        }

        if (!options.passes) {
          logger.line('  Task queue empty and discovery passes are disabled — stopping.');
          break;
        }

        logger.line('  No tasks found — running discovery passes to replenish backlog…');
        for (const passType of ['product', 'code', 'ux'] as const) {
          await runPass(config, store, workspaceStrategy, commandRunner, logger, options, passType);
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
        if (refreshed.planned > 0 && refreshed.ready < EXECUTOR_FALLBACK_READY_TARGET && !refreshedHasPlannerPeer) {
          const batchKey = await currentPlannerBatchKey(store);
          if (batchKey && batchKey !== waitingPlannerBatchKey) {
            waitingPlannerBatchKey = batchKey;
            const refined = await runPlannerRefinementPass(
              config,
              store,
              workspaceStrategy,
              commandRunner,
              logger,
              options,
            );
            if (refined) {
              waitingPlannerBatchKey = null;
              continue;
            }
          }
        }
        if (refreshed.planned > 0 && refreshedHasPlannerPeer) {
          logger.line('  Ready tasks were claimed elsewhere and planner lane is active — waiting for refined work…');
        } else {
          logger.line('  Ready tasks were claimed elsewhere — waiting 15s…');
        }
        await sleep(RUNNER_POLL_INTERVAL_MS);
        continue;
      }

      logger.line(`  → ${claim.task.title} (${claim.task.id})`);
      const session = await workspaceStrategy.setup();
      if (options.worktrees) {
        logger.line(`  Worktree: ${session.cwd}`);
      }

      const heartbeat = setInterval(() => {
        void store.heartbeatClaim(claim).catch(() => undefined);
      }, 30_000);
      heartbeat.unref?.();

      const startedAt = Date.now();
      try {
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
          claim.task.touchPaths,
          'write scope violation',
        );
        if (!initialScopeCheck.ok) {
          await store.failClaim(
            claim,
            initialScopeCheck.reason ?? 'write scope violation',
          );
          logger.line(`  ✗ write scope violation — marked failed`);
          continue;
        }

        const validationCommand = config.validationProfiles[claim.task.validationProfile] ?? config.validationCommand;
        logger.line('');
        logger.line(`  Running validation profile "${claim.task.validationProfile}": ${validationCommand}`);
        const validation = await runValidationCommand(commandRunner, validationCommand, session.cwd);
        if (!validation.ok) {
          await store.failClaim(claim, `validation failed: ${validation.summary}`);
          logger.line(
            `  ✗ validation failed (${formatDuration(validation.durationSeconds) || `${validation.durationSeconds}s`})`,
          );
          logger.line(`    ${validation.summary}`);
          if (!options.worktrees) {
            logger.line('    Workspace left dirty for inspection because worktrees are disabled');
          }
          continue;
        }
        logger.line(
          `  ✓ validation passed (${formatDuration(validation.durationSeconds) || `${validation.durationSeconds}s`})`,
        );

        const postValidationScopeCheck = await validateWorkspaceScope(
          commandRunner,
          session.cwd,
          claim.task.touchPaths,
          'post-validation scope violation',
        );
        if (!postValidationScopeCheck.ok) {
          await store.failClaim(
            claim,
            postValidationScopeCheck.reason ?? 'post-validation scope violation',
          );
          logger.line('  ✗ validation introduced out-of-scope changes — marked failed');
          continue;
        }

        const message = `chore(backlog): done – ${result.item || claim.task.title}`;
        if (options.worktrees) {
          await withLock(lockPath(config, 'git'), 30, async () => {
            logger.line('');
            logger.line(`  Merging to main: ${claim.task.title}`);
            const mergeResult = await session.merge();
            if (!mergeResult.ok) {
              await store.failClaim(claim, mergeResult.reason ?? 'merge failed');
              logger.line(`  ✗ ${mergeResult.reason ?? 'merge failed'} — marked failed`);
              return;
            }

            logger.line('  ✓ Merged code changes to main');
            logDrainResult(logger, 'Candidate planner', await store.drainCandidateQueue());
            await store.completeClaim(claim, result.note || 'completed');

            const finalizeResult = await workspaceStrategy.commitAndPush(message, taskCommitPaths(config, claim.task.touchPaths));
            if (!finalizeResult.ok) {
              await store.failTaskById(claim.task.id, finalizeResult.reason ?? 'finalize failed after merge');
              logger.line(`  ✗ ${finalizeResult.reason ?? 'finalize failed after merge'} — marked failed`);
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

            const finalizeResult = await workspaceStrategy.commitAndPush(message, taskCommitPaths(config, claim.task.touchPaths));
            if (!finalizeResult.ok) {
              await store.failTaskById(claim.task.id, finalizeResult.reason ?? 'commit/push failed');
              logger.line(`  ✗ ${finalizeResult.reason ?? 'commit/push failed'} — marked failed`);
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
