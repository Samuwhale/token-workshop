import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { flattenTokenGroup } from '@tokenmanager/core';
import type { Token } from '@tokenmanager/core';
import type { TokenStore } from './token-store.js';

/** Deterministic JSON string — sorts object keys so comparison is key-order independent. */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(v => stableStringify(v)).join(',') + ']';
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify((value as Record<string, unknown>)[k])).join(',') + '}';
}

export interface ManualSnapshotToken {
  $value: unknown;
  $type?: string;
  $description?: string;
  $extensions?: Record<string, unknown>;
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

export class ManualSnapshotStore {
  private filePath: string;
  private snapshots: ManualSnapshotEntry[] = [];
  private loaded = false;

  constructor(tokenDir: string) {
    const tmDir = path.join(path.resolve(tokenDir), '.tokenmanager');
    this.filePath = path.join(tmDir, 'snapshots.json');
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      this.snapshots = JSON.parse(raw) as ManualSnapshotEntry[];
    } catch {
      this.snapshots = [];
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.snapshots, null, 2), 'utf-8');
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

  /** Compare snapshot with current token state. */
  async diff(id: string, tokenStore: TokenStore): Promise<TokenDiff[]> {
    await this.ensureLoaded();
    const snapshot = this.snapshots.find(s => s.id === id);
    if (!snapshot) throw new Error(`Snapshot "${id}" not found`);

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
    if (!snapshot) throw new Error(`Snapshot "${id}" not found`);

    const restoredSets: string[] = [];

    for (const [setName, flatTokens] of Object.entries(snapshot.data)) {
      const items = Object.entries(flatTokens).map(([p, token]) => ({
        path: p,
        token: token as Token,
      }));
      await tokenStore.restoreSnapshot(setName, items);
      restoredSets.push(setName);
    }

    return { restoredSets };
  }
}
