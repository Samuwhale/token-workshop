import { lockPath, withLock } from '../locks.js';
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

export async function gitCommitAndPush(
  commandRunner: CommandRunner,
  config: BacklogRunnerConfig,
  cwd: string,
  message: string,
): Promise<WorkspaceApplyResult> {
  return withLock(lockPath(config, 'git'), 30, async () => {
    const status = await commandRunner.run('git', ['status', '--porcelain'], {
      cwd,
      ignoreFailure: true,
    });
    if (!status.stdout.trim()) {
      return { ok: true };
    }

    await commandRunner.run('git', ['add', '-A'], { cwd });
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

  async commitAndPush(message: string): Promise<WorkspaceApplyResult> {
    return gitCommitAndPush(this.commandRunner, this.config, this.config.projectRoot, message);
  }
}
