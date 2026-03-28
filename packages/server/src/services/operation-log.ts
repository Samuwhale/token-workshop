import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Token, TokenGroup } from '@tokenmanager/core';
import { flattenTokenGroup } from '@tokenmanager/core';
import type { TokenStore } from './token-store.js';

/** A snapshot of a single token path — null means the token did not exist. */
export interface SnapshotEntry {
  token: Token | null;
  setName: string;
}

export interface OperationEntry {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  setName: string;
  affectedPaths: string[];
  beforeSnapshot: Record<string, SnapshotEntry>;
  afterSnapshot: Record<string, SnapshotEntry>;
  rolledBack: boolean;
}

/** Lightweight version returned by the list endpoint (no snapshot data). */
export interface OperationSummary {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  setName: string;
  affectedPaths: string[];
  rolledBack: boolean;
}

const MAX_ENTRIES = 50;

export class OperationLog {
  private entries: OperationEntry[] = [];
  private filePath: string;
  private loaded = false;

  constructor(tokenDir: string) {
    const tmDir = path.join(path.resolve(tokenDir), '.tokenmanager');
    this.filePath = path.join(tmDir, 'operations.json');
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      this.entries = JSON.parse(raw) as OperationEntry[];
    } catch {
      this.entries = [];
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.entries, null, 2), 'utf-8');
  }

  /** Record a new operation entry. */
  async record(entry: Omit<OperationEntry, 'id' | 'timestamp' | 'rolledBack'>): Promise<OperationEntry> {
    await this.ensureLoaded();
    const full: OperationEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      rolledBack: false,
    };
    this.entries.push(full);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(this.entries.length - MAX_ENTRIES);
    }
    await this.persist();
    return full;
  }

  /** Get the N most recent entries (newest first), as lightweight summaries. */
  async getRecent(limit = 5): Promise<OperationSummary[]> {
    await this.ensureLoaded();
    const start = Math.max(0, this.entries.length - limit);
    return this.entries
      .slice(start)
      .reverse()
      .map(({ id, timestamp, type, description, setName, affectedPaths, rolledBack }) => ({
        id, timestamp, type, description, setName, affectedPaths, rolledBack,
      }));
  }

  /** Get a full entry by ID. */
  async getById(id: string): Promise<OperationEntry | undefined> {
    await this.ensureLoaded();
    return this.entries.find(e => e.id === id);
  }

  /** Roll back an operation by restoring its beforeSnapshot via the TokenStore. */
  async rollback(id: string, tokenStore: TokenStore): Promise<{ restoredPaths: string[] }> {
    await this.ensureLoaded();
    const entry = this.entries.find(e => e.id === id);
    if (!entry) throw new Error(`Operation "${id}" not found`);
    if (entry.rolledBack) throw new Error(`Operation "${id}" was already rolled back`);

    // Capture current state as "before" for the rollback operation itself
    const currentSnapshot: Record<string, SnapshotEntry> = {};
    for (const [path, snap] of Object.entries(entry.beforeSnapshot)) {
      const flatTokens = await tokenStore.getFlatTokensForSet(snap.setName);
      currentSnapshot[path] = {
        token: flatTokens[path] ? structuredClone(flatTokens[path]) : null,
        setName: snap.setName,
      };
    }

    // Group by set for batch processing
    const bySet = new Map<string, Array<{ path: string; token: Token | null }>>();
    for (const [path, snap] of Object.entries(entry.beforeSnapshot)) {
      let list = bySet.get(snap.setName);
      if (!list) {
        list = [];
        bySet.set(snap.setName, list);
      }
      list.push({ path, token: snap.token });
    }

    // Restore tokens
    for (const [setName, items] of bySet) {
      await tokenStore.restoreSnapshot(setName, items);
    }

    entry.rolledBack = true;

    // Record the rollback as its own operation
    await this.record({
      type: 'rollback',
      description: `Undo: ${entry.description}`,
      setName: entry.setName,
      affectedPaths: entry.affectedPaths,
      beforeSnapshot: currentSnapshot,
      afterSnapshot: entry.beforeSnapshot,
    });

    await this.persist();
    return { restoredPaths: Object.keys(entry.beforeSnapshot) };
  }
}

// ---------------------------------------------------------------------------
// Snapshot helpers — call these before/after mutations to capture state
// ---------------------------------------------------------------------------

/** Snapshot specific token paths in a set. Returns path -> SnapshotEntry. */
export async function snapshotPaths(
  tokenStore: TokenStore,
  setName: string,
  paths: string[],
): Promise<Record<string, SnapshotEntry>> {
  const flatTokens = await tokenStore.getFlatTokensForSet(setName);
  const result: Record<string, SnapshotEntry> = {};
  for (const p of paths) {
    result[p] = {
      token: flatTokens[p] ? structuredClone(flatTokens[p]) : null,
      setName,
    };
  }
  return result;
}

/** Snapshot all tokens in a set. */
export async function snapshotSet(
  tokenStore: TokenStore,
  setName: string,
): Promise<Record<string, SnapshotEntry>> {
  const flatTokens = await tokenStore.getFlatTokensForSet(setName);
  const result: Record<string, SnapshotEntry> = {};
  for (const [p, token] of Object.entries(flatTokens)) {
    result[p] = { token: structuredClone(token), setName };
  }
  return result;
}

/** Snapshot all tokens under a group prefix in a set. */
export async function snapshotGroup(
  tokenStore: TokenStore,
  setName: string,
  groupPrefix: string,
): Promise<Record<string, SnapshotEntry>> {
  const flatTokens = await tokenStore.getFlatTokensForSet(setName);
  const result: Record<string, SnapshotEntry> = {};
  const prefix = groupPrefix + '.';
  for (const [p, token] of Object.entries(flatTokens)) {
    if (p === groupPrefix || p.startsWith(prefix)) {
      result[p] = { token: structuredClone(token), setName };
    }
  }
  return result;
}
