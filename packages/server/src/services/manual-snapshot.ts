import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { flattenTokenGroup } from '@tokenmanager/core';
import type { Token } from '@tokenmanager/core';
import type { TokenStore } from './token-store.js';
import { stableStringify } from './stable-stringify.js';
import { NotFoundError } from '../errors.js';

export interface ManualSnapshotToken {
  $value: unknown;
  $type?: string;
  $description?: string;
  $extensions?: Record<string, unknown>;
}

interface RestoreJournal {
  snapshotId: string;
  snapshotLabel: string;
  /** Full snapshot data copied at the time restore began */
  data: Record<string, Record<string, ManualSnapshotToken>>;
  /** Set names that have already been fully written to disk */
  completedSets: string[];
  /** Number of consecutive recovery failures per set — sets reaching MAX_RECOVERY_RETRIES are quarantined */
  failedSets?: Record<string, number>;
}

export interface ManualSnapshotEntry {
  id: string;
  label: string;
  timestamp: string;
  /** Flat map: setName -> (tokenPath -> token) */
  data: Record<string, Record<string, ManualSnapshotToken>>;
}

export interface ManualSnapshotSummary {
  id: string;
  label: string;
  timestamp: string;
  tokenCount: number;
  setCount: number;
}

export interface TokenDiff {
  path: string;
  set: string;
  status: 'added' | 'modified' | 'removed';
  before?: ManualSnapshotToken;
  after?: ManualSnapshotToken;
}

const MAX_SNAPSHOTS = 20;
const MAX_RECOVERY_RETRIES = 3;

export class ManualSnapshotStore {
  private filePath: string;
  private journalPath: string;
  private snapshots: ManualSnapshotEntry[] = [];
  private loadPromise: Promise<void> | null = null;

  constructor(tokenDir: string) {
    const tmDir = path.join(path.resolve(tokenDir), '.tokenmanager');
    this.filePath = path.join(tmDir, 'snapshots.json');
    this.journalPath = path.join(tmDir, 'restore-journal.json');
  }

  private ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = fs.readFile(this.filePath, 'utf-8')
        .then(raw => { this.snapshots = JSON.parse(raw) as ManualSnapshotEntry[]; })
        .catch(() => { this.snapshots = []; });
    }
    return this.loadPromise;
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.snapshots, null, 2), 'utf-8');
    await fs.rename(tmp, this.filePath);
  }

  private async writeRestoreJournal(journal: RestoreJournal): Promise<void> {
    await fs.mkdir(path.dirname(this.journalPath), { recursive: true });
    const tmp = `${this.journalPath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(journal, null, 2), 'utf-8');
    await fs.rename(tmp, this.journalPath);
  }

  private async deleteRestoreJournal(): Promise<void> {
    await fs.unlink(this.journalPath).catch(() => {});
  }

  /** Capture the current state of all token sets. */
  async save(label: string, tokenStore: TokenStore): Promise<ManualSnapshotEntry> {
    await this.ensureLoaded();

    const sets = await tokenStore.getSets();
    const data: Record<string, Record<string, ManualSnapshotToken>> = {};

    for (const setName of sets) {
      const setObj = await tokenStore.getSet(setName);
      if (!setObj) continue;
      const flat: Record<string, ManualSnapshotToken> = {};
      for (const [p, token] of flattenTokenGroup(setObj.tokens)) {
        flat[p] = {
          $value: token.$value,
          $type: token.$type,
          $description: token.$description,
          $extensions: token.$extensions,
        };
      }
      data[setName] = flat;
    }

    const entry: ManualSnapshotEntry = {
      id: randomUUID(),
      label,
      timestamp: new Date().toISOString(),
      data,
    };

    this.snapshots.push(entry);
    if (this.snapshots.length > MAX_SNAPSHOTS) {
      this.snapshots = this.snapshots.slice(this.snapshots.length - MAX_SNAPSHOTS);
    }

    await this.persist();
    return entry;
  }

  async list(): Promise<ManualSnapshotSummary[]> {
    await this.ensureLoaded();
    return this.snapshots
      .slice()
      .reverse()
      .map(s => ({
        id: s.id,
        label: s.label,
        timestamp: s.timestamp,
        tokenCount: Object.values(s.data).reduce((acc, setTokens) => acc + Object.keys(setTokens).length, 0),
        setCount: Object.keys(s.data).length,
      }));
  }

  async get(id: string): Promise<ManualSnapshotEntry | undefined> {
    await this.ensureLoaded();
    return this.snapshots.find(s => s.id === id);
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureLoaded();
    const before = this.snapshots.length;
    this.snapshots = this.snapshots.filter(s => s.id !== id);
    if (this.snapshots.length < before) {
      await this.persist();
      return true;
    }
    return false;
  }

  /** Compare two snapshots against each other (idA = "before", idB = "after"). */
  async diffSnapshots(idA: string, idB: string): Promise<TokenDiff[]> {
    await this.ensureLoaded();
    const snapshotA = this.snapshots.find(s => s.id === idA);
    if (!snapshotA) throw new NotFoundError(`Snapshot "${idA}" not found`);
    const snapshotB = this.snapshots.find(s => s.id === idB);
    if (!snapshotB) throw new NotFoundError(`Snapshot "${idB}" not found`);

    const sets = new Set([...Object.keys(snapshotA.data), ...Object.keys(snapshotB.data)]);
    const diffs: TokenDiff[] = [];

    for (const setName of sets) {
      const aSet = snapshotA.data[setName] ?? {};
      const bSet = snapshotB.data[setName] ?? {};
      const allPaths = new Set([...Object.keys(aSet), ...Object.keys(bSet)]);
      for (const p of allPaths) {
        const before = aSet[p];
        const after = bSet[p];
        if (!before && after) {
          diffs.push({ path: p, set: setName, status: 'added', after });
        } else if (before && !after) {
          diffs.push({ path: p, set: setName, status: 'removed', before });
        } else if (before && after) {
          if (stableStringify(before) !== stableStringify(after)) {
            diffs.push({ path: p, set: setName, status: 'modified', before, after });
          }
        }
      }
    }

    return diffs;
  }

  /** Compare snapshot with current token state. */
  async diff(id: string, tokenStore: TokenStore): Promise<TokenDiff[]> {
    await this.ensureLoaded();
    const snapshot = this.snapshots.find(s => s.id === id);
    if (!snapshot) throw new NotFoundError(`Snapshot "${id}" not found`);

    const currentSets = await tokenStore.getSets();
    const sets = new Set([...Object.keys(snapshot.data), ...currentSets]);
    const diffs: TokenDiff[] = [];

    for (const setName of sets) {
      const savedSet = snapshot.data[setName] ?? {};
      const currentSetObj = await tokenStore.getSet(setName);
      const currentSet: Record<string, ManualSnapshotToken> = {};
      if (currentSetObj) {
        for (const [p, token] of flattenTokenGroup(currentSetObj.tokens)) {
          currentSet[p] = {
            $value: token.$value,
            $type: token.$type,
            $description: token.$description,
            $extensions: token.$extensions,
          };
        }
      }

      const allPaths = new Set([...Object.keys(savedSet), ...Object.keys(currentSet)]);
      for (const p of allPaths) {
        const before = savedSet[p];
        const after = currentSet[p];
        if (!before && after) {
          diffs.push({ path: p, set: setName, status: 'added', after });
        } else if (before && !after) {
          diffs.push({ path: p, set: setName, status: 'removed', before });
        } else if (before && after) {
          if (stableStringify(before) !== stableStringify(after)) {
            diffs.push({ path: p, set: setName, status: 'modified', before, after });
          }
        }
      }
    }

    return diffs;
  }

  /** Restore a snapshot by overwriting current token files. */
  async restore(id: string, tokenStore: TokenStore): Promise<{ restoredSets: string[] }> {
    await this.ensureLoaded();
    const snapshot = this.snapshots.find(s => s.id === id);
    if (!snapshot) throw new NotFoundError(`Snapshot "${id}" not found`);

    // Write journal BEFORE touching any token files. On crash, startup reads this
    // and replays the sets not yet in completedSets.
    const journal: RestoreJournal = {
      snapshotId: snapshot.id,
      snapshotLabel: snapshot.label,
      data: snapshot.data,
      completedSets: [],
    };
    await this.writeRestoreJournal(journal);

    const restoredSets: string[] = [];
    // If this loop throws, the journal is left intact so startup recovery can
    // replay the remaining sets. deleteRestoreJournal() only runs on success.
    for (const [setName, flatTokens] of Object.entries(snapshot.data)) {
      const items = Object.entries(flatTokens).map(([p, token]) => ({
        path: p,
        token: token as Token,
      }));
      await tokenStore.restoreSnapshot(setName, items);
      restoredSets.push(setName);
      // Advance the journal checkpoint after each successful set write.
      journal.completedSets.push(setName);
      await this.writeRestoreJournal(journal);
    }

    // All sets written — journal is no longer needed.
    await this.deleteRestoreJournal();
    return { restoredSets };
  }

  /**
   * Called during server startup. If a restore-journal.json exists, a previous
   * restore was interrupted mid-flight. This replays the remaining sets and
   * removes the journal.
   */
  async recoverPendingRestore(tokenStore: TokenStore): Promise<void> {
    let journal: RestoreJournal;
    try {
      const raw = await fs.readFile(this.journalPath, 'utf-8');
      journal = JSON.parse(raw) as RestoreJournal;
    } catch {
      return; // No journal or corrupt — nothing to recover
    }

    const pending = Object.keys(journal.data).filter(
      setName => !journal.completedSets.includes(setName)
    );

    if (pending.length === 0) {
      // All sets were written — crash happened just before journal deletion.
      console.warn(
        `[ManualSnapshotStore] Stale restore journal for "${journal.snapshotLabel}" found; ` +
        `all sets already complete — cleaning up`
      );
      await this.deleteRestoreJournal();
      return;
    }

    console.warn(
      `[ManualSnapshotStore] Recovering incomplete restore of snapshot "${journal.snapshotLabel}" ` +
      `(${journal.snapshotId}): replaying ${pending.length} set(s): ${pending.join(', ')}`
    );

    if (!journal.failedSets) journal.failedSets = {};

    let allResolved = true;
    for (const setName of pending) {
      const retries = journal.failedSets[setName] ?? 0;
      if (retries >= MAX_RECOVERY_RETRIES) {
        console.error(
          `[ManualSnapshotStore] Set "${setName}" has failed recovery ${retries} time(s) — ` +
          `skipping (quarantined). Manual intervention required.`
        );
        // Count as resolved so we don't block journal cleanup forever
        continue;
      }

      const flatTokens = journal.data[setName];
      const items = Object.entries(flatTokens).map(([p, token]) => ({
        path: p,
        token: token as Token,
      }));
      try {
        await tokenStore.restoreSnapshot(setName, items);
        journal.completedSets.push(setName);
        await this.writeRestoreJournal(journal);
      } catch (err) {
        console.error(
          `[ManualSnapshotStore] Recovery failed for set "${setName}" ` +
          `(attempt ${retries + 1}/${MAX_RECOVERY_RETRIES}):`,
          err
        );
        journal.failedSets[setName] = retries + 1;
        await this.writeRestoreJournal(journal);
        allResolved = false;
      }
    }

    if (allResolved) {
      await this.deleteRestoreJournal();
    }
  }
}
