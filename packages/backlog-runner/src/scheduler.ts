import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureConfigReady, resolveRunOptions } from './config.js';
import { buildDiscoveryContext, buildExecutionContext } from './context.js';
import { createDefaultLogSink, RunnerLogger } from './logger.js';
import { withLock, lockPath } from './locks.js';
import { createCommandRunner, sleep as defaultSleep } from './process.js';
import { runProvider } from './providers/index.js';
import { JSON_SCHEMA, isAuthFailure, isRateLimited } from './providers/common.js';
import { createFileBackedTaskStore } from './store/task-store.js';
import { isPathWithinTouchPaths } from './task-specs.js';
import type {
  BacklogDrainResult,
  BacklogPassType,
  BacklogRunnerConfig,
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

function scopeViolations(changed: string[], allowed: string[]): string[] {
  return changed.filter(file => !isPathWithinTouchPaths(file, allowed));
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

async function registerRunner(config: BacklogRunnerConfig): Promise<{ runnerId: string; registryFile: string }> {
  const runnerId = `${process.pid}-${Date.now()}`;
  const runnersDir = path.join(config.files.runtimeDir, 'runners');
  await mkdir(runnersDir, { recursive: true });
  const filePath = path.join(runnersDir, `${runnerId}.json`);
  await writeFile(filePath, JSON.stringify({ runnerId, pid: process.pid, startedAt: Date.now() }), 'utf8');
  return { runnerId, registryFile: filePath };
}

async function countOtherRunners(config: BacklogRunnerConfig, ownRunnerId: string): Promise<number> {
  const runnersDir = path.join(config.files.runtimeDir, 'runners');
  try {
    const entries = await readdir(runnersDir);
    let count = 0;
    for (const entry of entries) {
      const runnerId = entry.replace(/\.json$/, '');
      if (runnerId === ownRunnerId) continue;
      const pid = Number.parseInt(runnerId.split('-')[0] ?? '', 10);
      if (!Number.isFinite(pid)) continue;
      try {
        process.kill(pid, 0);
        count += 1;
      } catch {
        await rm(path.join(runnersDir, entry), { force: true });
      }
    }
    return count;
  } catch {
    return 0;
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
  const { runnerId, registryFile } = await registerRunner(config);

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
    logger.line(`  Model:  ${options.model}`);
    if (options.passModel !== options.model) {
      logger.line(`  Pass model: ${options.passModel}`);
    }
    logger.line(`  Mode:   ${options.worktrees ? 'parallel (worktrees)' : 'single (no worktrees)'}`);
    logger.line(`  Passes: ${options.passes ? 'enabled (queue-empty only)' : 'disabled'}`);
    const queue = await store.getQueueCounts();
    logger.line(
      `  Queue:  ${queue.ready} ready · ${queue.blocked} blocked · ${queue.planned} planned · ${queue.inProgress} in-progress · ${queue.failed} failed · ${queue.done} done`,
    );
    logger.line(`  Other runners: ${await countOtherRunners(config, runnerId)}`);
    logger.line(`  Stop:  Ctrl+C  (or: touch ${config.files.stop})`);

    let iteration = 0;
    let previousDurationSeconds = 0;

    while (true) {
      iteration += 1;
      logDrainResult(logger, 'Candidate planner', await store.drainCandidateQueue());

      const counts = await store.getQueueCounts();
      logger.line('');
      logger.line('═══════════════════════════════════════════════════════════════');
      logger.line(
        `  #${iteration} · ${counts.ready} ready · ${counts.blocked} blocked · ${counts.planned} planned · ${counts.inProgress} in-progress` +
          (previousDurationSeconds ? ` · last took ${formatDuration(previousDurationSeconds)}` : ''),
      );
      logger.line('═══════════════════════════════════════════════════════════════');

      if (counts.ready === 0) {
        if (counts.inProgress > 0) {
          logger.line('  No runnable task available locally — waiting 15s for other runner activity…');
          await sleep(15_000);
          continue;
        }

        if (counts.planned > 0) {
          logger.line('  No runnable tasks remain. Remaining tasks still need planner refinement.');
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
          await sleep(30_000);
        }
        continue;
      }

      const claim = await store.claimNextRunnableTask(runnerId);
      if (!claim) {
        logger.line(`  Ready tasks were claimed elsewhere — waiting 15s…`);
        await sleep(15_000);
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

      if (stopRequested || (await fileExists(config.files.stop))) {
        break;
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
