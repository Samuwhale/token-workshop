import { lockPath, withLock } from '../locks.js';
import type { BacklogRunnerConfig, CommandRunner, WorkspaceSession, WorkspaceStrategy } from '../types.js';

export async function gitCommitAndPush(
  commandRunner: CommandRunner,
  config: BacklogRunnerConfig,
  cwd: string,
  message: string,
): Promise<void> {
  await withLock(lockPath(config, 'git'), 30, async () => {
    const status = await commandRunner.run('git', ['status', '--porcelain'], {
      cwd,
      ignoreFailure: true,
    });
    if (!status.stdout.trim()) {
      return;
    }

    await commandRunner.run('git', ['add', '-A'], { cwd });
    await commandRunner.run('git', ['commit', '-m', message], { cwd, ignoreFailure: true });

    const remotes = await commandRunner.run('git', ['remote'], { cwd, ignoreFailure: true });
    if (!remotes.stdout.trim()) {
      return;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const push = await commandRunner.run('git', ['push'], { cwd, ignoreFailure: true });
      if (push.code === 0) {
        return;
      }
      await commandRunner.run('git', ['pull', '--rebase', '--autostash'], { cwd, ignoreFailure: true });
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 2000));
    }
  });
}

class InPlaceSession implements WorkspaceSession {
  constructor(readonly cwd: string) {}

  async teardown(): Promise<void> {
    // nothing to do
  }

  async merge(): Promise<{ ok: boolean }> {
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

  async commitAndPush(message: string): Promise<void> {
    await gitCommitAndPush(this.commandRunner, this.config, this.config.projectRoot, message);
  }
}
