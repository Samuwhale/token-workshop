import { lockPath, withLock } from '../locks.js';
import { sleep as defaultSleep } from '../process.js';
import { scopedFiles, unexpectedFiles } from '../git-scope.js';
import { parseGitStatusPaths } from '../utils.js';
import type {
  BacklogRunnerConfig,
  CommandRunner,
  WorkspaceApplyResult,
  WorkspaceCommitOptions,
  WorkspaceSession,
  WorkspaceStrategy,
} from '../types.js';

function summarizeGitFailure(stdout: string, stderr: string): string {
  const lines = [stdout, stderr]
    .join('\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  return lines.slice(-6).join(' | ') || 'git command failed';
}

async function collectChangedFiles(commandRunner: CommandRunner, cwd: string): Promise<string[]> {
  const status = await commandRunner.run('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd,
    ignoreFailure: true,
  });
  return status.code === 0 ? parseGitStatusPaths(status.stdout) : [];
}

async function collectStagedFiles(commandRunner: CommandRunner, cwd: string): Promise<string[]> {
  const result = await commandRunner.run('git', ['diff', '--cached', '--name-only'], {
    cwd,
    ignoreFailure: true,
  });
  return result.code === 0
    ? result.stdout.split('\n').map(line => line.trim()).filter(Boolean)
    : [];
}

async function remoteExists(commandRunner: CommandRunner, cwd: string): Promise<boolean> {
  const remotes = await commandRunner.run('git', ['remote'], { cwd, ignoreFailure: true });
  return Boolean(remotes.stdout.trim());
}

async function pushWithRetries(
  commandRunner: CommandRunner,
  cwd: string,
  sleep: (ms: number) => Promise<void>,
): Promise<WorkspaceApplyResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const push = await commandRunner.run('git', ['push'], { cwd, ignoreFailure: true });
    if (push.code === 0) {
      return { ok: true, pushed: true };
    }
    const pull = await commandRunner.run('git', ['pull', '--rebase', '--autostash'], { cwd, ignoreFailure: true });
    if (pull.code !== 0) {
      return { ok: false, reason: `git pull --rebase failed: ${summarizeGitFailure(pull.stdout, pull.stderr)}` };
    }
    await sleep((attempt + 1) * 2000);
  }

  return {
    ok: false,
    reason: 'git push failed after retries; local commit preserved for inspection',
    pendingPush: true,
  };
}

export async function gitCommitAndPush(
  commandRunner: CommandRunner,
  config: BacklogRunnerConfig,
  cwd: string,
  message: string,
  allowedPaths: string[],
  options: WorkspaceCommitOptions = {},
): Promise<WorkspaceApplyResult> {
  return withLock(lockPath(config, 'git'), 30, async () => {
    const sleep = options.sleep ?? defaultSleep;
    const changedFiles = await collectChangedFiles(commandRunner, cwd);
    if (changedFiles.length === 0) {
      if (!options.retryPendingPush || !await remoteExists(commandRunner, cwd)) {
        return { ok: true };
      }
      return pushWithRetries(commandRunner, cwd, sleep);
    }

    const stagedBefore = await collectStagedFiles(commandRunner, cwd);
    const unexpectedStaged = unexpectedFiles(stagedBefore, allowedPaths);
    if (unexpectedStaged.length > 0) {
      return { ok: false, reason: `refusing to commit unrelated staged files: ${unexpectedStaged.slice(0, 8).join(', ')}` };
    }

    const scopedChanged = scopedFiles(changedFiles, allowedPaths);
    if (scopedChanged.length > 0) {
      await commandRunner.run('git', ['add', '--', ...scopedChanged], { cwd });
    }

    const stagedAfter = await collectStagedFiles(commandRunner, cwd);
    const unexpectedAfter = unexpectedFiles(stagedAfter, allowedPaths);
    if (unexpectedAfter.length > 0) {
      return { ok: false, reason: `refusing to commit unrelated staged files: ${unexpectedAfter.slice(0, 8).join(', ')}` };
    }

    if (scopedFiles(stagedAfter, allowedPaths).length === 0) {
      return { ok: true };
    }

    const commit = await commandRunner.run('git', ['commit', '-m', message], { cwd, ignoreFailure: true });
    if (commit.code !== 0) {
      return { ok: false, reason: `git commit failed: ${summarizeGitFailure(commit.stdout, commit.stderr)}` };
    }

    if (!await remoteExists(commandRunner, cwd)) {
      return { ok: true, createdCommit: true };
    }

    const pushResult = await pushWithRetries(commandRunner, cwd, sleep);
    if (pushResult.ok) {
      return { ok: true, createdCommit: true, pushed: true };
    }

    return {
      ...pushResult,
      createdCommit: true,
      pendingPush: true,
    };
  });
}

class InPlaceSession implements WorkspaceSession {
  constructor(readonly cwd: string) {}

  async teardown(): Promise<void> {
    // nothing to do
  }

  async merge(): Promise<WorkspaceApplyResult> {
    return { ok: true };
  }
}

export class InPlaceWorkspaceStrategy implements WorkspaceStrategy {
  constructor(
    private readonly commandRunner: CommandRunner,
    private readonly config: BacklogRunnerConfig,
  ) {}

  async setup(): Promise<WorkspaceSession> {
    return new InPlaceSession(this.config.projectRoot);
  }

  async commitAndPush(
    message: string,
    allowedPaths: string[],
    options: WorkspaceCommitOptions = {},
  ): Promise<WorkspaceApplyResult> {
    return gitCommitAndPush(this.commandRunner, this.config, this.config.projectRoot, message, allowedPaths, options);
  }
}
