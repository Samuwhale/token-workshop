import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureConfigReady, resolveRunOptions } from './config.js';
import { createDefaultLogSink, RunnerLogger } from './logger.js';
import { createCommandRunner, sleep as defaultSleep } from './process.js';
import { runProvider } from './providers/index.js';
import { JSON_SCHEMA, isAuthFailure, isRateLimited } from './providers/common.js';
import { createMarkdownBacklogStore } from './store/markdown-store.js';
import type {
  BacklogPassType,
  BacklogRunnerConfig,
  BacklogStore,
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

async function readRecentSections(progressFile: string, maxSections: number): Promise<string> {
  try {
    const content = await readFile(progressFile, 'utf8');
    const sections = content.split(/^## /gm).filter((section: string) => Boolean(section));
    const recent = sections.slice(-maxSections).map((section: string) => `## ${section.trimEnd()}`);
    return recent.join('\n');
  } catch {
    return '';
  }
}

async function buildContext(
  config: BacklogRunnerConfig,
  item: string | null,
  recentSectionCount: number,
): Promise<string> {
  const patterns = await readFile(config.files.patterns, 'utf8');
  const recent = await readRecentSections(config.files.progress, recentSectionCount);
  const validation = `\n\n## Validation Command\n\nRun this command before reporting success:\n\n${config.validationCommand}\n`;
  const assigned = item
    ? `\n\n## Assigned Item\n\nWork on this specific item (already marked [~] in backlog.md):\n\n${item}\n\nDo NOT pick a different item. Do NOT modify backlog.md.\n`
    : '';
  return `${patterns}\n\n## Recent session log:\n${recent}${validation}${assigned}`;
}

async function runValidationCommand(
  commandRunner: ReturnType<typeof createCommandRunner>,
  config: BacklogRunnerConfig,
  cwd: string,
): Promise<ValidationCommandResult> {
  const startedAt = Date.now();
  const result = await commandRunner.runShell(config.validationCommand, {
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

async function registerRunner(config: BacklogRunnerConfig): Promise<string> {
  const runnersDir = path.join(config.files.runtimeDir, 'runners');
  await mkdir(runnersDir, { recursive: true });
  const filePath = path.join(runnersDir, `${process.pid}.json`);
  await writeFile(filePath, JSON.stringify({ pid: process.pid, startedAt: Date.now() }), 'utf8');
  return filePath;
}

async function countOtherRunners(config: BacklogRunnerConfig): Promise<number> {
  const runnersDir = path.join(config.files.runtimeDir, 'runners');
  try {
    const entries = await readdir(runnersDir);
    let count = 0;
    for (const entry of entries) {
      const pid = Number.parseInt(entry.replace(/\.json$/, ''), 10);
      if (!Number.isFinite(pid) || pid === process.pid) continue;
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
  store: BacklogStore,
  workspaceStrategy: WorkspaceStrategy,
  logger: RunnerLogger,
  options: ResolvedRunOptions,
  passType: BacklogPassType,
): Promise<void> {
  const promptFile = config.passes[passType].promptFile;
  logger.line('');
  logger.line('================================================================');
  logger.line(`  ★ Maintenance Pass: ${passType}`);
  logger.line('================================================================');

  const session = await workspaceStrategy.setup();
  try {
    const context = await buildContext(config, null, 5);
    const result = await runProvider(createCommandRunner(), {
      tool: options.tool,
      model: options.passModel,
      context,
      prompt: await readPrompt(promptFile),
      cwd: session.cwd,
      maxTurns: 100,
      schema: JSON_SCHEMA,
    });

    logger.line(`  ✓ ${passType} pass: ${result.item}`);
    if (result.note) logger.line(`    ${result.note}`);

    const commitMessage = `chore(backlog): ${passType} pass – ${result.item || 'maintenance'}`;
    const mergeResult = await session.merge(commitMessage);
    if (!mergeResult.ok) {
      logger.line(`  WARNING: ${mergeResult.reason ?? 'pass merge failed'}`);
    }
    if (!options.worktrees) {
      await workspaceStrategy.commitAndPush(commitMessage);
    }
    await store.drainInbox();
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

function passNamesToRun(doneCount: number, frequency: number, config: BacklogRunnerConfig): BacklogPassType[] {
  const names: BacklogPassType[] = [];
  if (doneCount % frequency === config.passes.product.offset) names.push('product');
  if (doneCount % frequency === config.passes.ux.offset) names.push('ux');
  if (doneCount % frequency === config.passes.code.offset) names.push('code');
  if (doneCount % frequency === 0) {
    if (!names.includes('code')) names.push('code');
  }
  return names;
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
  const store = createMarkdownBacklogStore(config);
  const options = await resolveRunOptions(config, overrides);
  const workspaceStrategy: WorkspaceStrategy = options.worktrees
    ? new GitWorktreeWorkspaceStrategy(commandRunner, config)
    : new InPlaceWorkspaceStrategy(commandRunner, config);
  const registryFile = await registerRunner(config);

  let stopRequested = false;
  const onSignal = () => {
    stopRequested = true;
    logger.line('');
    logger.line('  → Stop requested — will exit after current item completes.');
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    await store.ensureProgressFile();
    const otherRunners = await countOtherRunners(config);
    if (otherRunners === 0) {
      const staleCount = await store.resetStaleInProgressItems();
      if (staleCount > 0) {
        logger.line(`WARNING: ${staleCount} stale [~] item(s) from a crashed session — resetting to [ ]`);
      }
    }

    await store.drainInbox();

    logger.line('');
    logger.line('╔═══════════════════════════════════════════════════════════════╗');
    logger.line('║  TypeScript Backlog Runner                                  ║');
    logger.line('╚═══════════════════════════════════════════════════════════════╝');
    logger.line(`  PID:    ${process.pid}`);
    logger.line(`  Tool:   ${options.tool}`);
    logger.line(`  Model:  ${options.model}`);
    if (options.passModel !== options.model) {
      logger.line(`  Pass model: ${options.passModel}`);
    }
    logger.line(`  Mode:   ${options.worktrees ? 'parallel (worktrees)' : 'single (no worktrees)'}`);
    logger.line(`  Passes: ${options.passes ? `enabled (every ${options.passFrequency} items)` : 'disabled'}`);
    const queue = await store.getQueueCounts();
    logger.line(`  Queue:    ${queue.ready} ready · ${queue.inProgress} in-progress · ${queue.failed} failed`);
    logger.line(`  Done:     ${await store.getCompletedCount()} total`);
    logger.line(`  Stop:     Ctrl+C  (or: touch ${config.files.stop})`);

    let iteration = 0;
    let previousDurationSeconds = 0;

    while (true) {
      iteration += 1;
      const counts = await store.getQueueCounts();
      logger.line('');
      logger.line('═══════════════════════════════════════════════════════════════');
      logger.line(
        `  #${iteration}  ·  ${counts.ready} queued · ${counts.inProgress} in-progress` +
          (previousDurationSeconds ? ` · last took ${formatDuration(previousDurationSeconds)}` : ''),
      );
      logger.line('═══════════════════════════════════════════════════════════════');

      if (counts.ready === 0) {
        logger.line('');
        logger.line('  Backlog empty — checking inbox for new items…');
        await store.drainInbox();
        if ((await store.countReady()) === 0) {
          if (!options.passes) {
            logger.line('  Backlog empty and passes are disabled — stopping.');
            break;
          }
          logger.line('  No items found — running discovery passes to replenish backlog…');
          await runPass(config, store, workspaceStrategy, logger, options, 'product');
          await runPass(config, store, workspaceStrategy, logger, options, 'code');
          await runPass(config, store, workspaceStrategy, logger, options, 'ux');
        }

        if ((await store.countReady()) === 0) {
          logger.line('  Still no items. Polling inbox every 30s… (Ctrl+C to stop)');
          await sleep(30_000);
          continue;
        }
      }

      const claim = await store.claimNextItem();
      if (!claim) {
        logger.line(`  All ${(await store.countInProgress())} item(s) claimed by other runners — waiting 15s…`);
        await sleep(15_000);
        continue;
      }

      logger.line(`  → ${claim.item}`);
      const session = await workspaceStrategy.setup();
      if (options.worktrees) {
        logger.line(`  Worktree: ${session.cwd}`);
      }

      const startedAt = Date.now();
      try {
        logger.line(`  Running agent… (started ${new Date().toTimeString().slice(0, 8)})`);
        const context = await buildContext(config, claim.item, 3);
        const result = await runProvider(commandRunner, {
          tool: options.tool,
          model: options.model,
          context,
          prompt: await readPrompt(config.prompts.agent),
          cwd: session.cwd,
          maxTurns: 100,
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

        if (result.status === 'done') {
          logger.line('');
          logger.line(`  Running runner-owned validation: ${config.validationCommand}`);
          const validation = await runValidationCommand(commandRunner, config, session.cwd);
          if (!validation.ok) {
            await store.updateItemStatus(claim.item, '!');
            logger.line(
              `  ✗ validation failed (${formatDuration(validation.durationSeconds) || `${validation.durationSeconds}s`})`,
            );
            logger.line(`    ${validation.summary}`);
            if (!options.worktrees) {
              logger.line('    Workspace left dirty for inspection because worktrees are disabled');
            }
            if (stopRequested || (await fileExists(config.files.stop))) {
              break;
            }
            continue;
          }
          logger.line(
            `  ✓ validation passed (${formatDuration(validation.durationSeconds) || `${validation.durationSeconds}s`})`,
          );

          const message = `chore(backlog): done – ${result.item || claim.item}`;
          if (options.worktrees) {
            logger.line('');
            logger.line(`  Merging to main: ${result.item || claim.item}`);
            const mergeResult = await session.merge(message);
            if (mergeResult.ok) {
              await store.updateItemStatus(claim.item, 'x');
              logger.line('  ✓ Merged and marked done');
              if (mergeResult.reason) logger.line(`  WARNING: ${mergeResult.reason}`);
            } else {
              await store.updateItemStatus(claim.item, '!');
              logger.line(`  ✗ ${mergeResult.reason ?? 'merge failed'} — marked failed`);
            }
          } else {
            logger.line('');
            logger.line(`  Committing: ${result.item || claim.item}`);
            await workspaceStrategy.commitAndPush(message);
            await store.updateItemStatus(claim.item, 'x');
            logger.line('  ✓ Committed and marked done');
          }

          const totalDone = await store.incrementCompletedCount();
          const cleanupResult = await store.cleanupIfNeeded();
          if (cleanupResult.archivedCount > 0) {
            await workspaceStrategy.commitAndPush(
              `chore(backlog): archive ${cleanupResult.archivedCount} completed items + trim progress`,
            );
          }

          if (options.passes && !stopRequested && !(await fileExists(config.files.stop))) {
            const scheduledPasses = passNamesToRun(totalDone, options.passFrequency, config);
            if (scheduledPasses.length > 0) {
              logger.line('');
              logger.line(
                `  Milestone: ${totalDone} items done — running ${scheduledPasses.join(' + ')} discovery pass`,
              );
              for (const passType of scheduledPasses) {
                await runPass(config, store, workspaceStrategy, logger, options, passType);
              }
            }
          }
        } else {
          await store.updateItemStatus(claim.item, '!');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isAuthFailure(message)) {
          await store.updateItemStatus(claim.item, ' ');
          throw new Error('Authentication/permission error — check your API key and tool setup');
        }
        if (isRateLimited(message)) {
          logger.line('');
          logger.line(`  ⚠ Rate limit hit — unclaiming item, retry at ${retryTime()}`);
          await store.updateItemStatus(claim.item, ' ');
          await sleep(60_000);
        } else {
          logger.line(`  ⚠ ${message} — unclaiming item`);
          await store.updateItemStatus(claim.item, ' ');
        }
      } finally {
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
    await logger.close();
  }
}
