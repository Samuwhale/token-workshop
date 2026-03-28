import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Token, TokenGroup, ThemeDimension, ResolverFile } from '@tokenmanager/core';
import type { TokenStore } from './token-store.js';
import type { ResolverStore } from './resolver-store.js';
import { NotFoundError, ConflictError } from '../errors.js';

/** A snapshot of a single token path — null means the token did not exist. */
export interface SnapshotEntry {
  token: Token | null;
  setName: string;
}

/** Metadata for structural operations (sets, themes, resolvers) that cannot be
 *  represented as token-path snapshots. */
export type OperationMetadata =
  | { kind: 'set-create'; name: string; tokens: TokenGroup }
  | { kind: 'set-delete'; name: string; tokens: TokenGroup; description?: string; collectionName?: string; modeName?: string }
  | { kind: 'set-rename'; oldName: string; newName: string }
  | { kind: 'set-reorder'; previousOrder: string[]; newOrder: string[] }
  | { kind: 'set-metadata'; name: string; before: { description?: string; collectionName?: string; modeName?: string }; after: { description?: string; collectionName?: string; modeName?: string } }
  | { kind: 'theme-dimensions'; before: ThemeDimension[]; after: ThemeDimension[] }
  | { kind: 'resolver-create'; name: string; file: ResolverFile }
  | { kind: 'resolver-update'; name: string; before: ResolverFile; after: ResolverFile }
  | { kind: 'resolver-delete'; name: string; file: ResolverFile };

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
  /** Extra data for structural operations (sets, themes, resolvers). */
  metadata?: OperationMetadata;
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
  async rollback(
    id: string,
    tokenStore: TokenStore,
    options?: {
      dimensionsStore?: { load(): Promise<ThemeDimension[]>; save(dims: ThemeDimension[]): Promise<void> };
      resolverStore?: ResolverStore;
    },
  ): Promise<{ restoredPaths: string[] }> {
    await this.ensureLoaded();
    const entry = this.entries.find(e => e.id === id);
    if (!entry) throw new NotFoundError(`Operation "${id}" not found`);
    if (entry.rolledBack) throw new ConflictError(`Operation "${id}" was already rolled back`);

    // Handle structural operations via metadata
    if (entry.metadata) {
      await this.rollbackStructural(entry, tokenStore, options);
      entry.rolledBack = true;
      // Record the rollback as its own inverse metadata entry
      const inverseMetadata = this.invertMetadata(entry.metadata);
      await this.record({
        type: 'rollback',
        description: `Undo: ${entry.description}`,
        setName: entry.setName,
        affectedPaths: entry.affectedPaths,
        beforeSnapshot: {},
        afterSnapshot: {},
        metadata: inverseMetadata,
      });
      await this.persist();
      return { restoredPaths: entry.affectedPaths };
    }

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

  /** Roll back a structural (metadata-based) operation. */
  private async rollbackStructural(
    entry: OperationEntry,
    tokenStore: TokenStore,
    options?: {
      dimensionsStore?: { load(): Promise<ThemeDimension[]>; save(dims: ThemeDimension[]): Promise<void> };
      resolverStore?: ResolverStore;
    },
  ): Promise<void> {
    const meta = entry.metadata!;
    switch (meta.kind) {
      case 'set-create':
        await tokenStore.deleteSet(meta.name);
        break;
      case 'set-delete':
        await tokenStore.createSet(meta.name, meta.tokens);
        if (meta.description) await tokenStore.updateSetDescription(meta.name, meta.description);
        if (meta.collectionName) await tokenStore.updateSetCollectionName(meta.name, meta.collectionName);
        if (meta.modeName) await tokenStore.updateSetModeName(meta.name, meta.modeName);
        break;
      case 'set-rename':
        await tokenStore.renameSet(meta.newName, meta.oldName);
        break;
      case 'set-reorder':
        tokenStore.reorderSets(meta.previousOrder);
        break;
      case 'set-metadata': {
        if (meta.before.description !== undefined) await tokenStore.updateSetDescription(meta.name, meta.before.description);
        if (meta.before.collectionName !== undefined) await tokenStore.updateSetCollectionName(meta.name, meta.before.collectionName);
        if (meta.before.modeName !== undefined) await tokenStore.updateSetModeName(meta.name, meta.before.modeName);
        break;
      }
      case 'theme-dimensions':
        if (!options?.dimensionsStore) throw new Error('Cannot rollback theme operation: dimensionsStore not provided');
        await options.dimensionsStore.save(meta.before);
        break;
      case 'resolver-create':
        if (!options?.resolverStore) throw new Error('Cannot rollback resolver operation: resolverStore not provided');
        await options.resolverStore.delete(meta.name);
        break;
      case 'resolver-update':
        if (!options?.resolverStore) throw new Error('Cannot rollback resolver operation: resolverStore not provided');
        await options.resolverStore.update(meta.name, meta.before);
        break;
      case 'resolver-delete':
        if (!options?.resolverStore) throw new Error('Cannot rollback resolver operation: resolverStore not provided');
        await options.resolverStore.create(meta.name, meta.file);
        break;
    }
  }

  /** Build the inverse metadata entry for a rollback record. */
  private invertMetadata(meta: OperationMetadata): OperationMetadata {
    switch (meta.kind) {
      case 'set-create':
        return { kind: 'set-delete', name: meta.name, tokens: meta.tokens };
      case 'set-delete':
        return { kind: 'set-create', name: meta.name, tokens: meta.tokens };
      case 'set-rename':
        return { kind: 'set-rename', oldName: meta.newName, newName: meta.oldName };
      case 'set-reorder':
        return { kind: 'set-reorder', previousOrder: meta.newOrder, newOrder: meta.previousOrder };
      case 'set-metadata':
        return { kind: 'set-metadata', name: meta.name, before: meta.after, after: meta.before };
      case 'theme-dimensions':
        return { kind: 'theme-dimensions', before: meta.after, after: meta.before };
      case 'resolver-create':
        return { kind: 'resolver-delete', name: meta.name, file: meta.file };
      case 'resolver-update':
        return { kind: 'resolver-update', name: meta.name, before: meta.after, after: meta.before };
      case 'resolver-delete':
        return { kind: 'resolver-create', name: meta.name, file: meta.file };
    }
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
