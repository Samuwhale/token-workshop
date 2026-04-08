import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BacklogRunnerConfig } from './types.js';

async function pidFromLock(lockDir: string): Promise<number | null> {
  try {
    const value = await readFile(`${lockDir}/pid`, 'utf8');
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isPidAlive(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class LockHandle {
  constructor(readonly lockDir: string, readonly pid: number) {}
}

export async function acquireLock(lockDir: string, timeoutSeconds = 30): Promise<LockHandle> {
  const startedAt = Date.now();
  const ownPid = process.pid;
  await mkdir(path.dirname(lockDir), { recursive: true });

  while (true) {
    try {
      await mkdir(lockDir);
      await writeFile(`${lockDir}/pid`, `${ownPid}\n`, 'utf8');
      return new LockHandle(lockDir, ownPid);
    } catch {
      const existingPid = await pidFromLock(lockDir);
      if (existingPid === ownPid) {
        return new LockHandle(lockDir, ownPid);
      }

      if (!isPidAlive(existingPid)) {
        await rm(lockDir, { recursive: true, force: true });
        continue;
      }

      if (Date.now() - startedAt >= timeoutSeconds * 1000) {
        throw new Error(`Could not acquire lock ${lockDir} after ${timeoutSeconds}s`);
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}

export async function releaseLock(lock: LockHandle): Promise<void> {
  await rm(lock.lockDir, { recursive: true, force: true });
}

export async function withLock<T>(lockDir: string, timeoutSeconds: number, fn: () => Promise<T>): Promise<T> {
  const lock = await acquireLock(lockDir, timeoutSeconds);
  try {
    return await fn();
  } finally {
    await releaseLock(lock);
  }
}

export function lockPath(config: BacklogRunnerConfig, name: 'backlog' | 'git' | 'pass'): string {
  return `${config.files.locksDir}/${name}.lock`;
}
