import { lockPath, withLock } from '../locks.js';
import { isPathWithinTouchPaths } from '../task-specs.js';
import type {
  BacklogRunnerConfig,
  CommandRunner,
  WorkspaceApplyResult,
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

function parseGitPaths(stdout: string): string[] {
  const files = new Set<string>();
  for (const rawLine of stdout.split('\n').map(line => line.trimEnd()).filter(Boolean)) {
    const payload = rawLine.slice(3).trim();
    if (!payload) continue;
    const parts = payload.includes(' -> ') ? payload.split(' -> ') : [payload];
    for (const part of parts) {
      const normalized = part.replace(/^"+|"+$/g, '');
      if (normalized) {
        files.add(normalized);
      }
    }
  }
  return [...files];
}

async function collectChangedFiles(commandRunner: CommandRunner, cwd: string): Promise<string[]> {
  const status = await commandRunner.run('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd,
    ignoreFailure: true,
  });
  return status.code === 0 ? parseGitPaths(status.stdout) : [];
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

function filterScopedFiles(files: string[], allowedPaths: string[]): string[] {
  return files.filter(file => isPathWithinTouchPaths(file, allowedPaths));
}

export async function gitCommitAndPush(
  commandRunner: CommandRunner,
  config: BacklogRunnerConfig,
  cwd: string,
  message: string,
  allowedPaths: string[],
): Promise<WorkspaceApplyResult> {
  return withLock(lockPath(config, 'git'), 30, async () => {
    const changedFiles = await collectChangedFiles(commandRunner, cwd);
    if (changedFiles.length === 0) {
      return { ok: true };
    }

    const stagedBefore = await collectStagedFiles(commandRunner, cwd);
    const unexpectedStaged = stagedBefore.filter(file => !isPathWithinTouchPaths(file, allowedPaths));
    if (unexpectedStaged.length > 0) {
      return { ok: false, reason: `refusing to commit unrelated staged files: ${unexpectedStaged.slice(0, 8).join(', ')}` };
    }

    const scopedChanged = filterScopedFiles(changedFiles, allowedPaths);
    if (scopedChanged.length > 0) {
      await commandRunner.run('git', ['add', '--', ...scopedChanged], { cwd });
    }

    const stagedAfter = await collectStagedFiles(commandRunner, cwd);
    const unexpectedAfter = stagedAfter.filter(file => !isPathWithinTouchPaths(file, allowedPaths));
    if (unexpectedAfter.length > 0) {
      return { ok: false, reason: `refusing to commit unrelated staged files: ${unexpectedAfter.slice(0, 8).join(', ')}` };
    }

    if (filterScopedFiles(stagedAfter, allowedPaths).length === 0) {
      return { ok: true };
    }

    const commit = await commandRunner.run('git', ['commit', '-m', message], { cwd, ignoreFailure: true });
    if (commit.code !== 0) {
      return { ok: false, reason: `git commit failed: ${summarizeGitFailure(commit.stdout, commit.stderr)}` };
    }

    const remotes = await commandRunner.run('git', ['remote'], { cwd, ignoreFailure: true });
    if (!remotes.stdout.trim()) {
      return { ok: true };
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const push = await commandRunner.run('git', ['push'], { cwd, ignoreFailure: true });
      if (push.code === 0) {
        return { ok: true };
      }
      const pull = await commandRunner.run('git', ['pull', '--rebase', '--autostash'], { cwd, ignoreFailure: true });
      if (pull.code !== 0) {
        return { ok: false, reason: `git pull --rebase failed: ${summarizeGitFailure(pull.stdout, pull.stderr)}` };
      }
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 2000));
    }

    return { ok: false, reason: 'git push failed after retries; local commit preserved for inspection' };
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

  async commitAndPush(message: string, allowedPaths: string[]): Promise<WorkspaceApplyResult> {
    return gitCommitAndPush(this.commandRunner, this.config, this.config.projectRoot, message, allowedPaths);
  }
}
