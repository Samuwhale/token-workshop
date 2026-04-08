import { randomUUID } from 'node:crypto';
import { access, appendFile, readFile, rename, writeFile } from 'node:fs/promises';
import { lockPath, withLock } from '../locks.js';
import { RuntimeStateStore } from '../runtime-state.js';
import {
  createTaskFromBacklogLine,
  normalizeRepoPath,
  readTaskSpecs,
  renderGeneratedBacklog,
  taskSort,
  touchPathsOverlap,
  updateTask,
  writeTaskSpec,
} from '../task-specs.js';
import type {
  BacklogDrainResult,
  BacklogQueueCounts,
  BacklogRunnerConfig,
  BacklogStore,
  BacklogTaskClaim,
  BacklogTaskSpec,
  TaskBlockage,
  TaskDependencySnapshot,
  TaskReservationSnapshot,
} from '../types.js';

type FollowupRecord = {
  title: string;
  context?: string;
  priority?: string;
};

type RuntimeSnapshot = {
  tasks: BacklogTaskSpec[];
  activeTaskIds: Set<string>;
  blockages: TaskBlockage[];
  counts: BacklogQueueCounts;
};

function splitLines(value: string): string[] {
  return value.replace(/\r\n/g, '\n').split('\n');
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tempFile = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempFile, content, 'utf8');
  await rename(tempFile, filePath);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function reservationConflict(task: BacklogTaskSpec, reservation: TaskReservationSnapshot): boolean {
  const capabilityConflict = task.capabilities.some(capability => reservation.capabilities.includes(capability));
  return capabilityConflict || touchPathsOverlap(task.touchPaths, reservation.touchPaths);
}

function parseFollowupRecord(line: string): FollowupRecord | null {
  try {
    const value = JSON.parse(line) as Partial<FollowupRecord>;
    return typeof value.title === 'string' ? (value as FollowupRecord) : null;
  } catch {
    return null;
  }
}

function followupToLegacyLine(record: FollowupRecord): string | null {
  const title = normalizeWhitespace(record.title);
  if (!title) return null;
  const context = typeof record.context === 'string' ? normalizeWhitespace(record.context) : '';
  const priority = typeof record.priority === 'string' ? record.priority.toLowerCase() : 'normal';
  const prefix = priority === 'high' ? '- [ ] [HIGH] ' : '- [ ] ';
  return `${prefix}${context ? `${title} (Context: ${context})` : title}`;
}

export class FileBackedTaskStore implements BacklogStore {
  private runtime: RuntimeStateStore | null = null;

  constructor(private readonly config: BacklogRunnerConfig) {}

  private get backlogLock(): string {
    return lockPath(this.config, 'backlog');
  }

  private async getRuntime(): Promise<RuntimeStateStore> {
    if (!this.runtime) {
      this.runtime = await RuntimeStateStore.create(this.config.files.stateDb);
    }
    return this.runtime;
  }

  async close(): Promise<void> {
    if (!this.runtime) return;
    this.runtime.close();
    this.runtime = null;
  }

  async ensureProgressFile(): Promise<void> {
    try {
      await access(this.config.files.progress);
    } catch {
      await writeFile(
        this.config.files.progress,
        `# Backlog Progress Log\nStarted: ${new Date().toString()}\n---\n`,
        'utf8',
      );
    }
  }

  async ensureTaskSpecsReady(): Promise<void> {
    await this.getRuntime();
    await withLock(this.backlogLock, 30, async () => {
      await this.migrateLegacyBacklogIfNeeded();
      await this.refreshRuntimeAndWriteReport();
    });
  }

  private async migrateLegacyBacklogIfNeeded(): Promise<void> {
    const existing = await readTaskSpecs(this.config.files.taskSpecsDir);
    if (existing.length > 0) return;

    let backlogContent = '';
    try {
      backlogContent = await readFile(this.config.files.backlog, 'utf8');
    } catch {
      return;
    }

    const tasks = splitLines(backlogContent)
      .map(line => createTaskFromBacklogLine(line, 'legacy-backlog', this.config.validationProfiles))
      .filter((task): task is BacklogTaskSpec => Boolean(task))
      .sort(taskSort);

    for (const task of tasks) {
      await writeTaskSpec(this.config.files.taskSpecsDir, task);
    }
  }

  private async loadTasks(): Promise<BacklogTaskSpec[]> {
    return readTaskSpecs(this.config.files.taskSpecsDir);
  }

  private taskIndex(tasks: BacklogTaskSpec[]): Map<string, BacklogTaskSpec> {
    return new Map(tasks.map(task => [task.id, task]));
  }

  private computeBlockages(
    tasks: BacklogTaskSpec[],
    activeReservations: TaskReservationSnapshot[],
    activeTaskIds: Set<string>,
  ): TaskBlockage[] {
    const taskIndex = this.taskIndex(tasks);
    const blockages: TaskBlockage[] = [];

    for (const task of tasks) {
      if (task.state === 'done' || task.state === 'failed' || activeTaskIds.has(task.id)) {
        continue;
      }

      let reason = '';
      if (task.state === 'planned') {
        reason = 'planner pending';
      } else if (task.touchPaths.length === 0) {
        reason = 'missing touch_paths';
      } else if (!task.validationProfile) {
        reason = 'missing validation_profile';
      } else if (!this.config.validationProfiles[task.validationProfile]) {
        reason = `unknown validation profile "${task.validationProfile}"`;
      } else {
        const unresolvedDeps = task.dependsOn
          .flatMap(depId => {
            const dep = taskIndex.get(depId);
            return !dep || dep.state !== 'done'
              ? [dep?.title ?? `missing dependency: ${depId}`]
              : [];
          });
        if (unresolvedDeps.length > 0) {
          reason = `waiting on dependency: ${unresolvedDeps.join(', ')}`;
        }
      }

      if (!reason) {
        const conflict = activeReservations.find(reservation => reservationConflict(task, reservation));
        if (conflict) {
          reason = `waiting on active reservation: ${conflict.title}`;
        }
      }

      if (reason) {
        blockages.push({ taskId: task.id, reason });
      }
    }

    return blockages;
  }

  private async refreshRuntime(tasks?: BacklogTaskSpec[]): Promise<RuntimeSnapshot> {
    const runtime = await this.getRuntime();
    const loadedTasks = tasks ?? await this.loadTasks();
    const taskIndex = this.taskIndex(loadedTasks);
    const activeTaskIds = runtime.listActiveTaskIds();
    const activeReservations = runtime.listActiveReservations(taskIndex);
    const blockages = this.computeBlockages(loadedTasks, activeReservations, activeTaskIds);
    runtime.syncBlockers(blockages);

    const blockedIds = new Set(blockages.map(blockage => blockage.taskId));
    const counts: BacklogQueueCounts = {
      planned: loadedTasks.filter(task => task.state === 'planned').length,
      ready: loadedTasks.filter(task => task.state === 'ready' && !activeTaskIds.has(task.id) && !blockedIds.has(task.id)).length,
      blocked: loadedTasks.filter(task => task.state !== 'done' && task.state !== 'failed' && !activeTaskIds.has(task.id) && blockedIds.has(task.id)).length,
      inProgress: activeTaskIds.size,
      failed: loadedTasks.filter(task => task.state === 'failed').length,
      done: loadedTasks.filter(task => task.state === 'done').length,
    };

    return {
      tasks: loadedTasks,
      activeTaskIds,
      blockages,
      counts,
    };
  }

  private async writeBacklogReport(snapshot: RuntimeSnapshot): Promise<void> {
    const blockageMap = new Map(snapshot.blockages.map(blockage => [blockage.taskId, blockage.reason]));
    const report = renderGeneratedBacklog(
      snapshot.tasks.map(task => ({
        task,
        marker: snapshot.activeTaskIds.has(task.id)
          ? '~'
          : task.state === 'done'
            ? 'x'
            : task.state === 'failed'
              ? '!'
              : ' ',
        blockage: blockageMap.get(task.id),
      })),
    );
    await atomicWrite(this.config.files.backlog, report);
  }

  private async refreshRuntimeAndWriteReport(tasks?: BacklogTaskSpec[]): Promise<BacklogQueueCounts> {
    const snapshot = await this.refreshRuntime(tasks);
    await this.writeBacklogReport(snapshot);
    return snapshot.counts;
  }

  async countReady(): Promise<number> {
    return (await this.getQueueCounts()).ready;
  }

  async countInProgress(): Promise<number> {
    return (await this.getQueueCounts()).inProgress;
  }

  async countFailed(): Promise<number> {
    return (await this.getQueueCounts()).failed;
  }

  async countDone(): Promise<number> {
    return (await this.getQueueCounts()).done;
  }

  async getQueueCounts(): Promise<BacklogQueueCounts> {
    return withLock(this.backlogLock, 30, async () => (await this.refreshRuntime()).counts);
  }

  async claimNextRunnableTask(runnerId: string): Promise<BacklogTaskClaim | null> {
    return withLock(this.backlogLock, 30, async () => {
      const runtime = await this.getRuntime();
      const tasks = await this.loadTasks();
      const snapshot = await this.refreshRuntime(tasks);
      const blockages = new Set(
        tasks
          .map(task => task.id)
          .filter(taskId => runtime.getBlockage(taskId) !== null),
      );
      const candidate = tasks
        .filter(task => task.state === 'ready' && !snapshot.activeTaskIds.has(task.id) && !blockages.has(task.id))
        .sort(taskSort)[0] ?? null;
      if (!candidate) {
        return null;
      }

      const lease = runtime.claimTask(candidate, runnerId, randomUUID());
      if (!lease) {
        await this.refreshRuntimeAndWriteReport(tasks);
        return null;
      }
      await this.refreshRuntimeAndWriteReport(tasks);
      return { task: candidate, lease };
    });
  }

  async heartbeatClaim(claim: BacklogTaskClaim): Promise<void> {
    const runtime = await this.getRuntime();
    runtime.heartbeatClaim(claim);
  }

  async releaseClaim(claim: BacklogTaskClaim): Promise<void> {
    await withLock(this.backlogLock, 30, async () => {
      const runtime = await this.getRuntime();
      runtime.releaseClaim(claim);
      await this.refreshRuntimeAndWriteReport();
    });
  }

  private async persistTask(task: BacklogTaskSpec): Promise<void> {
    await writeTaskSpec(this.config.files.taskSpecsDir, task);
  }

  private async updateTask(taskId: string, updater: (task: BacklogTaskSpec) => BacklogTaskSpec): Promise<BacklogTaskSpec | null> {
    const tasks = await this.loadTasks();
    const task = tasks.find(candidate => candidate.id === taskId);
    if (!task) return null;
    const next = updater(task);
    await this.persistTask(next);
    return next;
  }

  async completeClaim(claim: BacklogTaskClaim, note: string): Promise<void> {
    await withLock(this.backlogLock, 30, async () => {
      const runtime = await this.getRuntime();
      await this.updateTask(claim.task.id, task => updateTask(task, {
        state: 'done',
        statusNotes: [...task.statusNotes, `Completed: ${normalizeWhitespace(note)}`],
      }));
      runtime.releaseClaim(claim);
      await this.refreshRuntimeAndWriteReport();
    });
  }

  async failClaim(claim: BacklogTaskClaim, note: string): Promise<void> {
    await withLock(this.backlogLock, 30, async () => {
      const runtime = await this.getRuntime();
      await this.updateTask(claim.task.id, task => updateTask(task, {
        state: 'failed',
        statusNotes: [...task.statusNotes, `Failed: ${normalizeWhitespace(note)}`],
      }));
      runtime.releaseClaim(claim);
      await this.refreshRuntimeAndWriteReport();
    });
  }

  async failTaskById(taskId: string, note: string): Promise<void> {
    await withLock(this.backlogLock, 30, async () => {
      await this.updateTask(taskId, task => updateTask(task, {
        state: 'failed',
        statusNotes: [...task.statusNotes, `Failed: ${normalizeWhitespace(note)}`],
      }));
      await this.refreshRuntimeAndWriteReport();
    });
  }

  async rewriteBacklogReport(): Promise<void> {
    await withLock(this.backlogLock, 30, async () => {
      await this.refreshRuntimeAndWriteReport();
    });
  }

  private taskExists(tasks: BacklogTaskSpec[], candidate: BacklogTaskSpec): boolean {
    return tasks.some(task => task.id === candidate.id);
  }

  async drainInbox(): Promise<BacklogDrainResult> {
    return withLock(this.backlogLock, 30, async () => {
      let inboxContent = '';
      try {
        inboxContent = await readFile(this.config.files.inbox, 'utf8');
      } catch {
        return { drained: false, createdTasks: 0, skippedDuplicates: 0, ignoredInvalidLines: 0 };
      }

      if (!/\S/.test(inboxContent)) {
        return { drained: false, createdTasks: 0, skippedDuplicates: 0, ignoredInvalidLines: 0 };
      }

      const tasks = await this.loadTasks();
      let createdTasks = 0;
      let skippedDuplicates = 0;
      let ignoredInvalidLines = 0;

      for (const line of splitLines(inboxContent).map(value => value.trim()).filter(Boolean)) {
        const task = createTaskFromBacklogLine(line, 'inbox', this.config.validationProfiles);
        if (!task) {
          ignoredInvalidLines += 1;
          continue;
        }
        if (this.taskExists(tasks, task)) {
          skippedDuplicates += 1;
          continue;
        }
        tasks.push(task);
        await this.persistTask(task);
        createdTasks += 1;
      }

      await atomicWrite(this.config.files.inbox, '');
      await this.refreshRuntimeAndWriteReport(tasks.sort(taskSort));
      return { drained: true, createdTasks, skippedDuplicates, ignoredInvalidLines };
    });
  }

  async drainFollowups(filePath = this.config.files.followups): Promise<BacklogDrainResult> {
    return withLock(this.backlogLock, 30, async () => {
      let content = '';
      try {
        content = await readFile(filePath, 'utf8');
      } catch {
        return { drained: false, createdTasks: 0, skippedDuplicates: 0, ignoredInvalidLines: 0 };
      }

      if (!/\S/.test(content)) {
        return { drained: false, createdTasks: 0, skippedDuplicates: 0, ignoredInvalidLines: 0 };
      }

      const tasks = await this.loadTasks();
      let createdTasks = 0;
      let skippedDuplicates = 0;
      let ignoredInvalidLines = 0;

      for (const line of splitLines(content).map(value => value.trim()).filter(Boolean)) {
        const record = parseFollowupRecord(line);
        if (!record) {
          ignoredInvalidLines += 1;
          continue;
        }
        const legacyLine = followupToLegacyLine(record);
        if (!legacyLine) {
          ignoredInvalidLines += 1;
          continue;
        }
        const task = createTaskFromBacklogLine(legacyLine, 'followup', this.config.validationProfiles);
        if (!task) {
          ignoredInvalidLines += 1;
          continue;
        }
        if (this.taskExists(tasks, task)) {
          skippedDuplicates += 1;
          continue;
        }
        tasks.push(task);
        await this.persistTask(task);
        createdTasks += 1;
      }

      await atomicWrite(filePath, '');
      await this.refreshRuntimeAndWriteReport(tasks.sort(taskSort));
      return { drained: true, createdTasks, skippedDuplicates, ignoredInvalidLines };
    });
  }

  async getTaskDependencies(taskId: string): Promise<TaskDependencySnapshot[]> {
    const tasks = await this.loadTasks();
    const taskIndex = this.taskIndex(tasks);
    const task = taskIndex.get(taskId);
    if (!task) return [];
    return task.dependsOn
      .map(depId => taskIndex.get(depId))
      .filter((dep): dep is BacklogTaskSpec => Boolean(dep))
      .map(dep => ({ taskId: dep.id, title: dep.title, state: dep.state }));
  }

  async getActiveReservations(excludeTaskId?: string): Promise<TaskReservationSnapshot[]> {
    const runtime = await this.getRuntime();
    const tasks = await this.loadTasks();
    return runtime.listActiveReservations(this.taskIndex(tasks), excludeTaskId);
  }

  async getTaskBlockage(taskId: string): Promise<TaskBlockage | null> {
    const runtime = await this.getRuntime();
    return runtime.getBlockage(taskId);
  }

  async getTaskSpec(taskId: string): Promise<BacklogTaskSpec | null> {
    const tasks = await this.loadTasks();
    return tasks.find(task => task.id === taskId) ?? null;
  }

  async appendProgress(section: string): Promise<void> {
    await appendFile(this.config.files.progress, section, 'utf8');
  }

  async appendPatterns(section: string): Promise<void> {
    await appendFile(this.config.files.patterns, section, 'utf8');
  }
}

export function createFileBackedTaskStore(config: BacklogRunnerConfig): BacklogStore {
  return new FileBackedTaskStore(config);
}
