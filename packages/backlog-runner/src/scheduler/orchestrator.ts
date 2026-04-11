import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureConfigReady, resolveRunOptions } from '../config.js';
import { createDefaultLogSink, RunnerLogger } from '../logger.js';
import { plannerBatchSize } from '../planner.js';
import { isAuthFailure, isRateLimited } from '../providers/common.js';
import { createCommandRunner, sleep as defaultSleep } from '../process.js';
import { createFileBackedTaskStore } from '../store/task-store.js';
import { fileExists } from '../utils.js';
import type {
  BacklogPassType,
  BacklogRunnerConfig,
  BacklogStore,
  BacklogSyncResult,
  BacklogTaskClaim,
  BacklogWorkerResult,
  OrchestratorRuntimeStatus,
  RunnerDependencies,
  RunOverrides,
  WorkspaceStrategy,
} from '../types.js';
import { BACKLOG_RUNNER_ROLES } from '../types.js';
import { GitWorktreeWorkspaceStrategy } from '../workspace/git-worktree.js';
import { InPlaceWorkspaceStrategy } from '../workspace/in-place.js';
import {
  EMPTY_QUEUE_POLL_INTERVAL_MS,
  ORCHESTRATOR_POLL_INTERVAL_MS,
  PLANNER_LANE_READY_TARGET,
  PLANNER_NO_PROGRESS_COOLDOWN_MS,
  RATE_LIMIT_BACKOFF_MS,
} from './constants.js';
import { formatDuration, genericWorkerResult, getRunnerConfig, logDrainResult } from './helpers.js';
import { runDiscoveryWorker, runPlannerWorker, runTaskWorker } from './workers.js';

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

function renderLoopSummary(options: {
  iteration: number;
  ready: number;
  blocked: number;
  planned: number;
  inProgress: number;
  taskWorkers: number;
  effectiveWorkers: number;
  activeControlKind: string;
  previousCompletedTaskDuration: number;
}): string[] {
  return [
    '═══════════════════════════════════════════════════════════════',
    `  #${options.iteration} · ${options.ready} ready · ${options.blocked} blocked · ${options.planned} planned · ${options.inProgress} in-progress` +
      (options.previousCompletedTaskDuration ? ` · last task ${formatDuration(options.previousCompletedTaskDuration)}` : ''),
    `  Active workers: ${options.taskWorkers}/${options.effectiveWorkers} task · ${options.activeControlKind} control`,
    '═══════════════════════════════════════════════════════════════',
  ];
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

function shouldAttemptPlannerBatch(
  batchKey: string,
  waitingPlannerBatchKey: string | null,
): boolean {
  return batchKey !== waitingPlannerBatchKey;
}

async function pruneGitWorktrees(
  commandRunner: ReturnType<typeof createCommandRunner>,
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
  store: BacklogStore,
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
  let lastLoopSummaryKey = '';

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
      const activeControlKind = describeActiveControlWorker(controlWorker);
      const loopSummary = renderLoopSummary({
        iteration,
        ready: counts.ready,
        blocked: counts.blocked,
        planned: counts.planned,
        inProgress: counts.inProgress,
        taskWorkers: taskWorkers.size,
        effectiveWorkers,
        activeControlKind,
        previousCompletedTaskDuration,
      });
      const loopSummaryKey = JSON.stringify({
        ready: counts.ready,
        blocked: counts.blocked,
        planned: counts.planned,
        inProgress: counts.inProgress,
        taskWorkers: taskWorkers.size,
        effectiveWorkers,
        activeControlKind,
        previousCompletedTaskDuration,
      });
      const now = Date.now();
      if (loopSummaryKey !== lastLoopSummaryKey) {
        logger.line('');
        for (const line of loopSummary) {
          logger.line(line);
        }
        lastLoopSummaryKey = loopSummaryKey;
      }

      await updateStatus();

      if (now < rateLimitUntil) {
        logger.line(`  Rate limit backoff active until ${new Date(rateLimitUntil).toTimeString().slice(0, 8)}.`);
        await sleep(ORCHESTRATOR_POLL_INTERVAL_MS);
        continue;
      }

      if (!controlWorker && (counts.failed > 0 || (counts.planned > 0 && counts.ready < PLANNER_LANE_READY_TARGET))) {
        const batchKey = await currentPlannerBatchKey(store);
        const plannerCooldownActive = plannerCooldownBatchKey === batchKey && now < plannerCooldownUntil;
        if (batchKey && shouldAttemptPlannerBatch(batchKey, plannerCooldownActive ? plannerCooldownBatchKey : null)) {
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
