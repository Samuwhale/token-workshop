import fs from 'node:fs/promises';
import path from 'node:path';
import { watch } from 'chokidar';
import {
  type Token,
  type TokenGroup,
  type TokenSet,
  type ResolvedToken,
  isFormula,
  isReference,
  parseReference,
  makeReferenceGlobalRegex,
  flattenTokenGroup,
  TokenResolver,
  COMPOSITE_TOKEN_TYPES,
} from '@tokenmanager/core';
import { NotFoundError, ConflictError, BadRequestError } from '../errors.js';
import { TokenLock } from './token-lock.js';
import {
  validateTokenPath,
  pathExistsAt,
  getObjectAtPath,
  setGroupAtPath,
  getTokenAtPath,
  setTokenAtPath,
  deleteTokenAtPath,
  collectGroupLeafTokens,
  updateAliasRefs,
  updateBulkAliasRefs,
  previewBulkAliasChanges,
  previewGroupAliasChanges,
  type AliasChange,
} from './token-tree-utils.js';

import { isSafeRegex } from './token-tree-utils.js';
export { isSafeRegex };

export class TokenStore {
  /** Shared async mutex — route handlers and watcher callbacks serialize through this single lock. */
  readonly lock = new TokenLock();
  private dir: string;
  private sets: Map<string, TokenSet> = new Map();
  private flatTokens: Map<string, Array<{ token: Token; setName: string }>> = new Map();
  private resolver: TokenResolver | null = null;
  /** Cross-set dependents: refTarget -> set of {path, setName} that reference it. */
  private crossSetDependents: Map<string, Array<{ path: string; setName: string }>> = new Map();
  private watcher: ReturnType<typeof watch> | null = null;
  private changeListeners: Set<(event: ChangeEvent) => void> = new Set();
  private _rebuildDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingWatcherEvents: ChangeEvent[] = [];
  private _batchDepth = 0;
  private _writingFiles: Map<string, ReturnType<typeof setTimeout>> = new Map();
  /** Per-set promise chains that serialize concurrent saveSet calls for the same file. */
  private _saveChains = new Map<string, Promise<void>>();

  constructor(dir: string) {
    this.dir = path.resolve(dir);
  }

  async initialize(): Promise<void> {
    // Create dir if not exists
    await fs.mkdir(this.dir, { recursive: true });
    // Recover any incomplete rename from a previous crash before loading
    await this.recoverPendingRename();
    // Load all .tokens.json files
    await this.loadAllSets();
    // Start watching
    this.startWatching();
  }

  /** Applies the set-name substitution to $themes.json atomically. No-ops if no themes file or no matches. */
  private async applyThemesRename(oldName: string, newName: string): Promise<void> {
    const themesPath = path.join(this.dir, '$themes.json');
    let content: string;
    try {
      content = await fs.readFile(themesPath, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
    const data = JSON.parse(content) as { $themes: Array<{ options: Array<{ sets: Record<string, unknown> }> }> };
    if (!Array.isArray(data.$themes)) return;
    let changed = false;
    for (const dimension of data.$themes) {
      if (!Array.isArray(dimension.options)) continue;
      for (const option of dimension.options) {
        if (option.sets && oldName in option.sets) {
          option.sets[newName] = option.sets[oldName];
          delete option.sets[oldName];
          changed = true;
        }
      }
    }
    if (!changed) return;
    const themesTmp = `${themesPath}.tmp`;
    await fs.writeFile(themesTmp, JSON.stringify(data, null, 2));
    await fs.rename(themesTmp, themesPath);
  }

  /**
   * On startup, check for a $rename-pending.json marker left by a crash mid-rename.
   * If the file rename completed (newFile exists, oldFile gone) but themes wasn't updated yet,
   * re-apply the themes update. Otherwise discard the marker.
   */
  private async recoverPendingRename(): Promise<void> {
    const markerPath = path.join(this.dir, '$rename-pending.json');
    let marker: { oldName: string; newName: string } | null = null;
    try {
      const raw = await fs.readFile(markerPath, 'utf-8');
      marker = JSON.parse(raw) as { oldName: string; newName: string };
    } catch {
      return; // No marker or invalid JSON — nothing to recover
    }

    const { oldName, newName } = marker;
    const oldFilePath = path.join(this.dir, `${oldName}.tokens.json`);
    const newFilePath = path.join(this.dir, `${newName}.tokens.json`);

    const [oldExists, newExists] = await Promise.all([
      fs.access(oldFilePath).then(() => true).catch(() => false),
      fs.access(newFilePath).then(() => true).catch(() => false),
    ]);

    if (!oldExists && newExists) {
      // File rename completed but themes update may not have run — reapply it
      console.warn(`[TokenStore] Recovering incomplete rename "${oldName}" → "${newName}": applying themes update`);
      await this.applyThemesRename(oldName, newName).catch((err) => {
        console.error('[TokenStore] Recovery: themes update failed, manual fix may be required:', err);
      });
      await fs.unlink(markerPath).catch(() => {});
    } else if (oldExists && !newExists) {
      // File rename didn't complete — state is consistent, just remove the marker
      console.warn(`[TokenStore] Discarding incomplete rename marker "${oldName}" → "${newName}" (file rename did not complete)`);
      await fs.unlink(markerPath).catch(() => {});
    } else if (oldExists && newExists) {
      // Both files exist — ambiguous state, leave marker and warn so admin can investigate
      console.error(`[TokenStore] Ambiguous rename state: both "${oldName}.tokens.json" and "${newName}.tokens.json" exist. Remove $rename-pending.json after manual resolution.`);
    } else {
      // Neither file exists — stale marker, clean up
      await fs.unlink(markerPath).catch(() => {});
    }
  }

  private async loadAllSets(): Promise<void> {
    const files = await this.listTokenFiles();
    for (const file of files) {
      await this.loadSet(file);
    }
    this.rebuildFlatTokens();
  }

  private async listTokenFiles(): Promise<string[]> {
    const results: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries: import('node:fs').Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await walk(path.join(dir, entry.name));
        } else if (entry.name.endsWith('.tokens.json')) {
          // Return path relative to this.dir so loadSet works correctly
          results.push(path.relative(this.dir, path.join(dir, entry.name)));
        }
      }
    };
    await walk(this.dir);
    return results;
  }

  private async loadSet(relativePath: string): Promise<void> {
    const filePath = path.join(this.dir, relativePath);
    const content = await fs.readFile(filePath, 'utf-8');
    let tokens: TokenGroup;
    try {
      tokens = JSON.parse(content) as TokenGroup;
    } catch {
      console.warn(`[TokenStore] Skipping malformed JSON in "${relativePath}"`);
      return;
    }
    const name = relativePath.replace('.tokens.json', '');
    this.sets.set(name, { name, tokens, filePath });
  }

  private scheduleRebuild(event: ChangeEvent): void {
    this._pendingWatcherEvents.push(event);
    if (this._rebuildDebounceTimer !== null) {
      clearTimeout(this._rebuildDebounceTimer);
    }
    this._rebuildDebounceTimer = setTimeout(() => {
      this._rebuildDebounceTimer = null;
      this.rebuildFlatTokens();
      const events = this._pendingWatcherEvents.splice(0);
      for (const ev of events) this.emit(ev);
    }, 50);
  }

  /** Mark a file as being written so the watcher ignores the next event for it. */
  private _startWriteGuard(filePath: string): void {
    const existing = this._writingFiles.get(filePath);
    if (existing) clearTimeout(existing);
    // Fallback timeout only for memory-leak prevention — the watcher callback clears the guard first
    const timer = setTimeout(() => this._writingFiles.delete(filePath), 30_000);
    this._writingFiles.set(filePath, timer);
  }

  /** Clear the write guard (called from watcher callbacks after suppressing one event). */
  private _clearWriteGuard(filePath: string): void {
    const timer = this._writingFiles.get(filePath);
    if (timer) clearTimeout(timer);
    this._writingFiles.delete(filePath);
  }

  private startWatching(): void {
    this.watcher = watch(path.join(this.dir, '**/*.tokens.json'), {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200 },
    });

    this.watcher.on('change', (filePath) => {
      if (this._writingFiles.has(filePath as string)) { this._clearWriteGuard(filePath as string); return; }
      const relativePath = path.relative(this.dir, filePath as string);
      const setName = relativePath.replace('.tokens.json', '');
      void this.lock.withLock(async () => {
        await this.loadSet(relativePath).catch(err => {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[TokenStore] Error reloading "${relativePath}":`, err);
          this.emitEvent({ type: 'file-load-error', setName, message });
        });
        this.scheduleRebuild({ type: 'set-updated', setName });
      });
    });

    this.watcher.on('add', (filePath) => {
      if (this._writingFiles.has(filePath as string)) { this._clearWriteGuard(filePath as string); return; }
      const relativePath = path.relative(this.dir, filePath as string);
      const setName = relativePath.replace('.tokens.json', '');
      void this.lock.withLock(async () => {
        await this.loadSet(relativePath).catch(err => {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[TokenStore] Error loading new file "${relativePath}":`, err);
          this.emitEvent({ type: 'file-load-error', setName, message });
        });
        this.scheduleRebuild({ type: 'set-added', setName });
      });
    });

    this.watcher.on('unlink', (filePath) => {
      if (this._writingFiles.has(filePath as string)) { this._clearWriteGuard(filePath as string); return; }
      const relativePath = path.relative(this.dir, filePath as string);
      const name = relativePath.replace('.tokens.json', '');
      void this.lock.withLock(async () => {
        this.sets.delete(name);
        this.scheduleRebuild({ type: 'set-removed', setName: name });
      });
    });

    this.watcher.on('error', (err) => {
      console.error('[TokenStore] File watcher error:', err);
    });
  }

  private rebuildFlatTokens(): void {
    if (this._batchDepth > 0) return; // deferred — endBatch() always rebuilds
    this.flatTokens = this.buildLiveFlatTokens(); // atomic swap — no reader sees a partial/empty map
    this.rebuildResolver();
    this.rebuildCrossSetDependents();
  }

  /**
   * Build a fresh flat token map by iterating this.sets directly.
   * Unlike rebuildFlatTokens(), this is not guarded by _batchDepth, so it
   * reflects the current (post-mutation) state of this.sets even inside a batch.
   */
  private buildLiveFlatTokens(): Map<string, Array<{ token: Token; setName: string }>> {
    const newMap = new Map<string, Array<{ token: Token; setName: string }>>();
    for (const [setName, set] of this.sets) {
      for (const [tokenPath, token] of flattenTokenGroup(set.tokens)) {
        let entries = newMap.get(tokenPath);
        if (!entries) {
          entries = [];
          newMap.set(tokenPath, entries);
        }
        entries.push({ token: token as Token, setName });
      }
    }
    return newMap;
  }

  /** Begin a batch operation — defers flat-token rebuilds until endBatch(). */
  beginBatch(): void {
    this._batchDepth++;
  }

  /** End a batch operation — always rebuilds flat tokens when the outermost batch ends. */
  endBatch(): void {
    if (this._batchDepth > 0) this._batchDepth--;
    if (this._batchDepth === 0) {
      this.rebuildFlatTokens();
    }
  }

  /** Execute fn() inside a batch, always rebuilding flat tokens when the outermost batch ends. */
  private async withBatch<T>(fn: () => Promise<T>): Promise<T> {
    this.beginBatch();
    try {
      return await fn();
    } finally {
      this.endBatch();
    }
  }

  private rebuildResolver(): void {
    const allTokens: Record<string, Token> = {};
    for (const [tokenPath, entries] of this.flatTokens) {
      if (entries.length > 0) {
        allTokens[tokenPath] = entries[0].token;
      }
    }
    this.resolver = new TokenResolver(allTokens, '__merged__');
  }

  /** Build cross-set dependents map by scanning ALL token entries across all sets. */
  private rebuildCrossSetDependents(): void {
    // Forward: for every (path, setName) pair, collect what it references
    // Reverse: refTarget -> all (path, setName) that reference it
    const dependents = new Map<string, Array<{ path: string; setName: string }>>();

    for (const [tokenPath, entries] of this.flatTokens) {
      for (const { token, setName } of entries) {
        const refs = this.collectAllRefsFromToken(token);
        for (const ref of refs) {
          let list = dependents.get(ref);
          if (!list) {
            list = [];
            dependents.set(ref, list);
          }
          list.push({ path: tokenPath, setName });
        }
      }
    }

    this.crossSetDependents = dependents;
  }

  // -----------------------------------------------------------------------
  // Circular reference detection
  // -----------------------------------------------------------------------

  /**
   * Collect all reference paths from a token value (mirrors TokenResolver.collectReferences).
   */
  private collectRefsFromValue(value: unknown): Set<string> {
    const refs = new Set<string>();
    if (isReference(value)) {
      refs.add(parseReference(value));
      return refs;
    }
    if (typeof value === 'string' && isFormula(value)) {
      for (const m of value.matchAll(makeReferenceGlobalRegex())) {
        refs.add(m[1]);
      }
      return refs;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null) for (const r of this.collectRefsFromValue(item)) refs.add(r);
      }
      return refs;
    }
    if (typeof value === 'object' && value !== null) {
      for (const v of Object.values(value)) {
        if (v != null) for (const r of this.collectRefsFromValue(v)) refs.add(r);
      }
    }
    return refs;
  }

  /**
   * Collect all references from a token: value references + $extends target.
   */
  private collectAllRefsFromToken(token: Token): Set<string> {
    const refs = this.collectRefsFromValue(token.$value);
    const extendsPath = TokenResolver.getExtendsPath(token);
    if (extendsPath) refs.add(extendsPath);
    return refs;
  }

  /**
   * Build a dependency adjacency map from the current flatTokens,
   * optionally overriding specific token values (for proposed changes).
   * Pass liveFlatTokens to use a freshly-computed flat view instead of
   * this.flatTokens (needed when called inside a batch where flatTokens is stale).
   */
  private buildDependencyMap(
    overrides?: Map<string, unknown>,
    liveFlatTokens?: Map<string, Array<{ token: Token; setName: string }>>,
  ): Map<string, Set<string>> {
    const deps = new Map<string, Set<string>>();
    for (const [tokenPath, entries] of (liveFlatTokens ?? this.flatTokens)) {
      // Merge references from ALL sets' versions of this token
      const merged = new Set<string>();
      for (const { token } of entries) {
        const value = overrides?.has(tokenPath) ? overrides.get(tokenPath) : token.$value;
        for (const ref of this.collectRefsFromValue(value)) merged.add(ref);
        // Include $extends target in dependency graph
        const extendsPath = TokenResolver.getExtendsPath(token);
        if (extendsPath) merged.add(extendsPath);
      }
      deps.set(tokenPath, merged);
    }
    // Add entries for override paths not yet in flatTokens (new tokens)
    if (overrides) {
      for (const [tokenPath, value] of overrides) {
        if (!deps.has(tokenPath)) {
          deps.set(tokenPath, this.collectRefsFromValue(value));
        }
      }
    }
    return deps;
  }

  /**
   * Detect if a circular reference would be created by setting the given
   * token path(s) to the given value(s). Throws with a descriptive cycle
   * path if a cycle is detected.
   */
  /**
   * Run a DFS cycle-detection pass on the given dependency map, starting from
   * the specified paths. Throws ConflictError with a descriptive cycle path if
   * a cycle is reachable from any start path.
   */
  private runCycleDFS(deps: Map<string, Set<string>>, startPaths: Iterable<string>): void {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    const parent = new Map<string, string>();

    const dfs = (node: string): void => {
      color.set(node, GRAY);
      const nodeDeps = deps.get(node);
      if (nodeDeps) {
        for (const dep of nodeDeps) {
          const depColor = color.get(dep) ?? WHITE;
          if (depColor === GRAY) {
            // Reconstruct cycle path
            const cycle = [dep];
            let cur = node;
            while (cur !== dep) {
              cycle.push(cur);
              cur = parent.get(cur)!;
            }
            cycle.push(dep);
            cycle.reverse();
            throw new ConflictError(`Circular reference detected: ${cycle.join(' → ')}`);
          }
          if (depColor === WHITE) {
            parent.set(dep, node);
            dfs(dep);
          }
        }
      }
      color.set(node, BLACK);
    };

    for (const path of startPaths) {
      if ((color.get(path) ?? WHITE) === WHITE) {
        dfs(path);
      }
    }
  }

  checkCircularReferences(changes: Array<{ path: string; value: unknown }>): void {
    const overrides = new Map<string, unknown>();
    for (const { path, value } of changes) {
      overrides.set(path, value);
    }
    const deps = this.buildDependencyMap(overrides);
    this.runCycleDFS(deps, changes.map(c => c.path));
  }

  // ----- CRUD operations -----

  async getSets(): Promise<string[]> {
    return Array.from(this.sets.keys());
  }

  reorderSets(names: string[]): void {
    const newMap = new Map<string, TokenSet>();
    for (const name of names) {
      const set = this.sets.get(name);
      if (set) newMap.set(name, set);
    }
    // Append any sets not included in the names list
    for (const [name, set] of this.sets) {
      if (!newMap.has(name)) newMap.set(name, set);
    }
    this.sets = newMap;
  }

  async reorderGroupChildren(setName: string, groupPath: string, orderedKeys: string[]): Promise<void> {
    const set = this.sets.get(setName);
    if (!set) throw new NotFoundError(`Set "${setName}" not found`);
    let group: TokenGroup;
    if (groupPath) {
      const found = getObjectAtPath(set.tokens, groupPath);
      if (!found) throw new NotFoundError(`Group "${groupPath}" not found in set "${setName}"`);
      group = found;
    } else {
      group = set.tokens as TokenGroup;
    }
    const nonMetaKeys = Object.keys(group).filter(k => !k.startsWith('$'));
    const orderedSet = new Set(orderedKeys);
    for (const key of orderedKeys) {
      if (!(key in group)) throw new NotFoundError(`Key "${key}" not found in group`);
    }
    for (const key of nonMetaKeys) {
      if (!orderedSet.has(key)) throw new BadRequestError(`Key "${key}" is missing from orderedKeys`);
    }
    const reordered: TokenGroup = {};
    for (const [k, v] of Object.entries(group)) {
      if (k.startsWith('$')) reordered[k] = v;
    }
    for (const key of orderedKeys) {
      reordered[key] = group[key];
    }
    if (groupPath) {
      setGroupAtPath(set.tokens, groupPath, reordered);
    } else {
      set.tokens = reordered as TokenGroup;
    }
    await this.saveSet(setName);
    this.rebuildFlatTokens();
    this.emit({ type: 'token-updated', setName });
  }

  getSetCounts(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [name, set] of this.sets) {
      result[name] = flattenTokenGroup(set.tokens).size;
    }
    return result;
  }

  getSetDescriptions(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [name, set] of this.sets) {
      const desc = set.tokens.$description;
      if (typeof desc === 'string' && desc) {
        result[name] = desc;
      }
    }
    return result;
  }

  async updateSetDescription(name: string, description: string): Promise<void> {
    const set = this.sets.get(name);
    if (!set) throw new NotFoundError(`Set "${name}" not found`);
    if (description) {
      set.tokens.$description = description;
    } else {
      delete set.tokens.$description;
    }
    await this.saveSet(name);
  }

  getSetCollectionNames(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [name, set] of this.sets) {
      const col = set.tokens.$figmaCollection;
      if (typeof col === 'string' && col) result[name] = col;
    }
    return result;
  }

  async updateSetCollectionName(name: string, collectionName: string): Promise<void> {
    const set = this.sets.get(name);
    if (!set) throw new NotFoundError(`Set "${name}" not found`);
    if (collectionName) {
      set.tokens.$figmaCollection = collectionName;
    } else {
      delete set.tokens.$figmaCollection;
    }
    await this.saveSet(name);
  }

  getSetModeNames(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [name, set] of this.sets) {
      const mode = set.tokens.$figmaMode;
      if (typeof mode === 'string' && mode) result[name] = mode;
    }
    return result;
  }

  async updateSetModeName(name: string, modeName: string): Promise<void> {
    const set = this.sets.get(name);
    if (!set) throw new NotFoundError(`Set "${name}" not found`);
    if (modeName) {
      set.tokens.$figmaMode = modeName;
    } else {
      delete set.tokens.$figmaMode;
    }
    await this.saveSet(name);
  }

  async getSet(name: string): Promise<TokenSet | undefined> {
    return this.sets.get(name);
  }

  /** Replace all tokens in a set with a new nested DTCG token group. */
  async replaceSetTokens(name: string, tokens: TokenGroup): Promise<void> {
    const set = this.sets.get(name);
    if (!set) throw new NotFoundError(`Set "${name}" not found`);
    // Check for circular references in the new token set
    const changes: Array<{ path: string; value: unknown }> = [];
    for (const [tokenPath, token] of flattenTokenGroup(tokens)) {
      changes.push({ path: tokenPath, value: token.$value });
    }
    if (changes.length > 0) {
      this.checkCircularReferences(changes);
    }
    set.tokens = tokens;
    await this.saveSet(name);
    this.rebuildFlatTokens();
    this.emit({ type: 'token-updated', setName: name });
  }

  /** Write set to disk and register in memory, but skip rebuildFlatTokens(). */
  private async _createSetNoRebuild(name: string, tokens: TokenGroup = {}): Promise<TokenSet> {
    const filename = `${name}.tokens.json`;
    const filePath = path.join(this.dir, filename);
    const tmpPath = filePath + '.tmp';
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(tmpPath, JSON.stringify(tokens, null, 2));
    this._startWriteGuard(filePath);
    await fs.rename(tmpPath, filePath);
    const set: TokenSet = { name, tokens, filePath };
    this.sets.set(name, set);
    return set;
  }

  async createSet(name: string, tokens?: TokenGroup): Promise<TokenSet> {
    const set = await this._createSetNoRebuild(name, tokens);
    this.rebuildFlatTokens();
    return set;
  }

  async deleteSet(name: string): Promise<boolean> {
    const set = this.sets.get(name);
    if (!set) return false;
    const filePath = path.join(this.dir, `${name}.tokens.json`);
    this._startWriteGuard(filePath);
    try {
      await fs.unlink(filePath);
      await this.removeEmptyParentDirs(filePath);
    } finally {
      this._clearWriteGuard(filePath);
    }
    this.sets.delete(name);
    this.rebuildFlatTokens();
    return true;
  }

  /** Remove empty parent directories between filePath and this.dir */
  private async removeEmptyParentDirs(filePath: string): Promise<void> {
    let dir = path.dirname(filePath);
    while (dir !== this.dir && dir.startsWith(this.dir)) {
      try {
        await fs.rmdir(dir); // only succeeds if empty
      } catch {
        break; // directory not empty or other error — stop
      }
      dir = path.dirname(dir);
    }
  }

  async clearAll(): Promise<void> {
    const names = Array.from(this.sets.keys());
    for (const name of names) {
      const filePath = path.join(this.dir, `${name}.tokens.json`);
      this._startWriteGuard(filePath);
      try {
        await fs.unlink(filePath).catch(() => {});
      } finally {
        this._clearWriteGuard(filePath);
      }
    }
    this.sets.clear();
    this.rebuildFlatTokens();
    const themesPath = path.join(this.dir, '$themes.json');
    await fs.unlink(themesPath).catch(() => {});
  }

  async renameSet(oldName: string, newName: string): Promise<void> {
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(newName)) {
      throw new BadRequestError('Set name must contain only alphanumeric characters, dashes, underscores, and / for folders');
    }
    const set = this.sets.get(oldName);
    if (!set) throw new NotFoundError(`Set "${oldName}" not found`);
    if (this.sets.has(newName)) throw new ConflictError(`Set "${newName}" already exists`);

    const oldFilePath = path.join(this.dir, `${oldName}.tokens.json`);
    const newFilePath = path.join(this.dir, `${newName}.tokens.json`);
    const markerPath = path.join(this.dir, '$rename-pending.json');

    // Write crash-recovery marker before touching any files.
    // If the server crashes after the file rename but before themes update, startup
    // will detect this marker and complete the themes update automatically.
    await fs.writeFile(markerPath, JSON.stringify({ oldName, newName }));

    // Step 1: Rename the file atomically (same filesystem, so fs.rename is atomic)
    await fs.mkdir(path.dirname(newFilePath), { recursive: true });
    this._startWriteGuard(oldFilePath);
    this._startWriteGuard(newFilePath);
    try {
      await fs.rename(oldFilePath, newFilePath);

      // Step 2: Update $themes.json — roll back file rename on failure
      try {
        await this.applyThemesRename(oldName, newName);
      } catch (writeErr) {
        // Themes write failed — attempt to roll back the file rename
        let rollbackSucceeded = false;
        try {
          await fs.rename(newFilePath, oldFilePath);
          rollbackSucceeded = true;
        } catch (rollbackErr) {
          console.error(
            `[TokenStore] renameSet: file rename rollback also failed after themes write error. ` +
            `"${newName}.tokens.json" may be in an inconsistent state. ` +
            `Original error: ${String(writeErr)}. Rollback error: ${String(rollbackErr)}`
          );
        }
        // Only remove the marker if rollback succeeded — if rollback failed the marker
        // must remain so that recoverPendingRename() can complete the themes update on startup.
        if (rollbackSucceeded) {
          await fs.unlink(markerPath).catch(() => {});
        }
        throw writeErr;
      }

      // Marker can be removed now that both steps have completed
      await fs.unlink(markerPath).catch(() => {});

      // Step 3: Update in-memory state (cannot fail)
      const newSet: TokenSet = { name: newName, tokens: set.tokens, filePath: newFilePath };
      this.sets.set(newName, newSet);
      this.sets.delete(oldName);

      // Clean up empty parent dirs left behind by the rename
      await this.removeEmptyParentDirs(oldFilePath);

      this.rebuildFlatTokens();
      this.emit({ type: 'set-removed', setName: oldName });
      this.emit({ type: 'set-added', setName: newName });
    } finally {
      this._clearWriteGuard(oldFilePath);
      this._clearWriteGuard(newFilePath);
    }
  }

  async getToken(setName: string, tokenPath: string): Promise<Token | undefined> {
    const set = this.sets.get(setName);
    if (!set) return undefined;
    return getTokenAtPath(set.tokens, tokenPath);
  }

  async createToken(setName: string, tokenPath: string, token: Token): Promise<void> {
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(setName)) {
      throw new BadRequestError(`Invalid set name "${setName}". Only alphanumeric characters, dashes, underscores, and / for folders are allowed.`);
    }
    validateTokenPath(tokenPath);
    // Auto-persist formula metadata so Style Dictionary export can output calc()
    token = this.enrichFormulaExtension(token);
    // Check for circular references before persisting
    this.checkCircularReferences([{ path: tokenPath, value: token.$value }]);
    let set = this.sets.get(setName);
    if (!set) {
      set = await this._createSetNoRebuild(setName);
    }
    const snapshot = this.snapshotSets(setName);
    setTokenAtPath(set.tokens, tokenPath, token);
    try {
      await this.saveSet(setName);
    } catch (err) {
      this.restoreSnapshots(snapshot);
      throw err;
    }
    this.rebuildFlatTokens();
    this.emit({ type: 'token-updated', setName, tokenPath });
  }

  async updateToken(setName: string, tokenPath: string, token: Partial<Token>): Promise<void> {
    const set = this.sets.get(setName);
    if (!set) throw new NotFoundError(`Set "${setName}" not found`);
    const existing = getTokenAtPath(set.tokens, tokenPath);
    if (!existing) throw new NotFoundError(`Token "${tokenPath}" not found in set "${setName}"`);
    // Auto-persist formula metadata so Style Dictionary export can output calc()
    if ('$value' in token && token.$value !== undefined) {
      const enriched = this.enrichFormulaExtension({ $value: token.$value, $extensions: token.$extensions ?? existing.$extensions });
      const originalExtensions = token.$extensions ?? existing.$extensions;
      if (JSON.stringify(enriched.$extensions) !== JSON.stringify(originalExtensions)) {
        token = { ...token, $extensions: enriched.$extensions };
      }
    }
    // Check for circular references before persisting
    if ('$value' in token && token.$value !== undefined) {
      this.checkCircularReferences([{ path: tokenPath, value: token.$value }]);
    }
    // Replace known token fields explicitly so stale properties don't persist.
    // A partial update only touches keys that are present in the incoming object.
    const snapshot = this.snapshotSets(setName);
    if ('$value' in token) existing.$value = token.$value!;
    if ('$type' in token) existing.$type = token.$type;
    if ('$description' in token) existing.$description = token.$description;
    if ('$extensions' in token) existing.$extensions = token.$extensions;
    try {
      await this.saveSet(setName);
    } catch (err) {
      this.restoreSnapshots(snapshot);
      this.rebuildFlatTokens(); // in-place mutations above corrupted flatTokens entries; rebuild from restored snapshot
      throw err;
    }
    this.rebuildFlatTokens();
    this.emit({ type: 'token-updated', setName, tokenPath });
  }

  async batchUpsertTokens(
    setName: string,
    tokens: Array<{ path: string; token: Token }>,
    strategy: 'skip' | 'overwrite' | 'merge',
  ): Promise<{ imported: number; skipped: number }> {
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(setName)) {
      throw new BadRequestError(`Invalid set name "${setName}". Only alphanumeric characters, dashes, underscores, and / for folders are allowed.`);
    }
    let set = this.sets.get(setName);
    if (!set) {
      set = await this._createSetNoRebuild(setName);
    }
    for (const { path: tokenPath } of tokens) {
      validateTokenPath(tokenPath);
    }
    // Check for circular references among all proposed changes
    const changes: Array<{ path: string; value: unknown }> = [];
    for (const { path: tokenPath, token } of tokens) {
      const existing = getTokenAtPath(set.tokens, tokenPath);
      if (existing && strategy === 'skip') continue; // won't be changed
      changes.push({ path: tokenPath, value: token.$value });
    }
    if (changes.length > 0) {
      this.checkCircularReferences(changes);
    }
    const snapshot = this.snapshotSets(setName);
    let imported = 0;
    let skipped = 0;
    await this.withBatch(async () => {
      try {
        for (const { path: tokenPath, token } of tokens) {
          const enriched = this.enrichFormulaExtension(token);
          const existing = getTokenAtPath(set.tokens, tokenPath);
          if (existing) {
            if (strategy === 'overwrite') {
              if ('$value' in enriched) existing.$value = enriched.$value;
              if ('$type' in enriched) existing.$type = enriched.$type;
              if ('$description' in enriched) existing.$description = enriched.$description;
              if ('$extensions' in enriched) existing.$extensions = enriched.$extensions;
              imported++;
            } else if (strategy === 'merge') {
              // Update value/type from incoming, preserve local description and extensions
              if ('$value' in enriched) existing.$value = enriched.$value;
              if ('$type' in enriched) existing.$type = enriched.$type;
              imported++;
            } else {
              skipped++;
            }
          } else {
            setTokenAtPath(set.tokens, tokenPath, enriched);
            imported++;
          }
        }
        await this.saveSet(setName);
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
    });
    this.emit({ type: 'token-updated', setName, tokenPath: '' });
    return { imported, skipped };
  }

  async deleteToken(setName: string, tokenPath: string): Promise<boolean> {
    const set = this.sets.get(setName);
    if (!set) return false;
    const snapshot = this.snapshotSets(setName);
    const deleted = deleteTokenAtPath(set.tokens, tokenPath);
    if (deleted) {
      try {
        await this.saveSet(setName);
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
      this.rebuildFlatTokens();
      this.emit({ type: 'token-updated', setName, tokenPath });
    }
    return deleted;
  }

  /** Delete multiple token paths in a single save. Returns the list of paths actually deleted. */
  async deleteTokens(setName: string, tokenPaths: string[]): Promise<string[]> {
    const set = this.sets.get(setName);
    if (!set) return [];
    const snapshot = this.snapshotSets(setName);
    const deleted: string[] = [];
    await this.withBatch(async () => {
      try {
        for (const tokenPath of tokenPaths) {
          if (deleteTokenAtPath(set.tokens, tokenPath)) {
            deleted.push(tokenPath);
          }
        }
        if (deleted.length > 0) {
          await this.saveSet(setName);
        }
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
    });
    if (deleted.length > 0) {
      this.emit({ type: 'token-updated', setName, tokenPath: '' });
    }
    return deleted;
  }

  /**
   * Restore a set of token paths to a previous state.
   * Used by the operation log rollback feature.
   * Items with `token: null` are deleted; items with a token value are created/updated.
   */
  async restoreSnapshot(setName: string, items: Array<{ path: string; token: Token | null }>): Promise<void> {
    const set = this.sets.get(setName);
    if (!set) throw new NotFoundError(`Set "${setName}" not found`);
    const snapshot = this.snapshotSets(setName);
    await this.withBatch(async () => {
      try {
        for (const { path: tokenPath, token } of items) {
          if (token === null) {
            deleteTokenAtPath(set.tokens, tokenPath);
          } else {
            setTokenAtPath(set.tokens, tokenPath, structuredClone(token));
          }
        }
        await this.saveSet(setName);
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
    });
    this.emit({ type: 'token-updated', setName });
  }

  /**
   * Find tokens tagged with a generatorId.
   * Pass '*' to find ALL tokens that have any generatorId.
   */
  findTokensByGeneratorId(generatorId: string): Array<{ setName: string; path: string; generatorId: string }> {
    const matchAll = generatorId === '*';
    const results: Array<{ setName: string; path: string; generatorId: string }> = [];
    for (const [tokenPath, entries] of this.flatTokens) {
      for (const { token, setName } of entries) {
        const ext = token.$extensions?.['com.tokenmanager.generator'];
        const gid = ext?.generatorId;
        if (typeof gid === 'string' && (matchAll || gid === generatorId)) {
          results.push({ setName, path: tokenPath, generatorId: gid });
        }
      }
    }
    return results;
  }

  /** Delete all tokens tagged with a given generatorId. Returns count of deleted tokens. */
  async deleteTokensByGeneratorId(generatorId: string): Promise<number> {
    const tokens = this.findTokensByGeneratorId(generatorId);
    if (tokens.length === 0) return 0;

    const setsToSave = new Set<string>();
    let deleted = 0;
    await this.withBatch(async () => {
      for (const { setName, path: tokenPath } of tokens) {
        const set = this.sets.get(setName);
        if (!set) continue;
        if (deleteTokenAtPath(set.tokens, tokenPath)) {
          setsToSave.add(setName);
          deleted++;
        }
      }
      for (const setName of setsToSave) {
        await this.saveSet(setName);
      }
    });
    if (deleted > 0) {
      for (const setName of setsToSave) {
        this.emit({ type: 'token-updated', setName });
      }
    }
    return deleted;
  }

  async resolveTokens(): Promise<ResolvedToken[]> {
    if (!this.resolver) {
      return [];
    }
    const resolvedMap = this.resolver.resolveAll();
    const results: ResolvedToken[] = [];
    for (const [tokenPath, resolved] of resolvedMap) {
      const entries = this.flatTokens.get(tokenPath);
      // Emit one result per set that defines this token
      if (entries && entries.length > 1) {
        for (const entry of entries) {
          results.push({ ...resolved, setName: entry.setName });
        }
      } else {
        results.push({
          ...resolved,
          setName: entries?.[0]?.setName ?? resolved.setName,
        });
      }
    }
    return results;
  }

  async resolveToken(tokenPath: string): Promise<ResolvedToken | undefined> {
    const entries = this.flatTokens.get(tokenPath);
    if (!entries || entries.length === 0 || !this.resolver) return undefined;
    try {
      const resolved = this.resolver.resolve(tokenPath);
      return {
        ...resolved,
        setName: entries[0].setName,
      };
    } catch {
      return undefined;
    }
  }

  /** Get all tokens in a set as a flat map of path -> Token */
  async getFlatTokensForSet(setName: string): Promise<Record<string, Token>> {
    const result: Record<string, Token> = {};
    for (const [tokenPath, entries] of this.flatTokens) {
      for (const entry of entries) {
        if (entry.setName === setName) {
          result[tokenPath] = entry.token;
          break;
        }
      }
    }
    return result;
  }

  /** Get all flat tokens across all sets (includes all set versions per path). */
  getAllFlatTokens(): Array<{ path: string; token: Token; setName: string }> {
    const result: Array<{ path: string; token: Token; setName: string }> = [];
    for (const [tokenPath, entries] of this.flatTokens) {
      for (const entry of entries) {
        result.push({ path: tokenPath, token: entry.token, setName: entry.setName });
      }
    }
    return result;
  }

  /** Search tokens across all sets using structured query parameters. */
  searchTokens(opts: {
    q?: string;
    types?: string[];
    has?: string[];
    values?: string[];
    descs?: string[];
    paths?: string[];
    names?: string[];
    limit?: number;
    offset?: number;
  }): { results: Array<{ setName: string; path: string; name: string; $type: string; $value: unknown; $description?: string }>; total: number } {
    const { q, types, has, values, descs, paths, names, limit = 200, offset = 0 } = opts;
    const qLower = q?.toLowerCase();
    const all: Array<{ setName: string; path: string; name: string; $type: string; $value: unknown; $description?: string }> = [];

    for (const [tokenPath, entries] of this.flatTokens) {
      const lp = tokenPath.toLowerCase();
      const leafName = tokenPath.includes('.') ? tokenPath.slice(tokenPath.lastIndexOf('.') + 1) : tokenPath;
      const ln = leafName.toLowerCase();

      // path: qualifier
      if (paths && paths.length > 0 && !paths.some(p => lp.startsWith(p) || lp.includes(p))) continue;

      // name: qualifier
      if (names && names.length > 0 && !names.some(n => ln.includes(n))) continue;

      for (const entry of entries) {
        // Free text: match against path, leaf name, or description
        if (qLower) {
          const ld = (entry.token.$description || '').toLowerCase();
          if (!lp.includes(qLower) && !ln.includes(qLower) && !ld.includes(qLower)) continue;
        }

        // type: qualifier
        if (types && types.length > 0) {
          const et = (entry.token.$type || '').toLowerCase();
          if (!types.some(t => et === t || et.includes(t))) continue;
        }

        // has: qualifiers
        let skip = false;
        if (has && has.length > 0) {
          for (const h of has) {
            if ((h === 'alias' || h === 'ref') && !isReference(entry.token.$value)) { skip = true; break; }
            if (h === 'direct' && isReference(entry.token.$value)) { skip = true; break; }
            if ((h === 'description' || h === 'desc') && !entry.token.$description) { skip = true; break; }
            if ((h === 'extension' || h === 'ext') && (!entry.token.$extensions || Object.keys(entry.token.$extensions).length === 0)) { skip = true; break; }
          }
        }
        if (skip) continue;

        // value: qualifier
        if (values && values.length > 0) {
          const sv = JSON.stringify(entry.token.$value).toLowerCase();
          if (!values.some(v => sv.includes(v))) continue;
        }

        // desc: qualifier — match $description
        if (descs && descs.length > 0) {
          const ld = (entry.token.$description || '').toLowerCase();
          if (!descs.some(d => ld.includes(d))) continue;
        }

        all.push({
          setName: entry.setName,
          path: tokenPath,
          name: leafName,
          $type: entry.token.$type || 'unknown',
          $value: entry.token.$value,
          $description: entry.token.$description,
        });
      }
    }

    return { results: all.slice(offset, offset + limit), total: all.length };
  }

  /** Get all tokens that reference the given token path, with their set names. */
  getDependents(tokenPath: string): Array<{ path: string; setName: string }> {
    return this.crossSetDependents.get(tokenPath) ?? [];
  }

  /** Get all tokens that reference any token under the given group prefix (cross-set). */
  getGroupDependents(groupPrefix: string): Array<{ path: string; setName: string; referencedToken: string }> {
    const prefix = groupPrefix + '.';
    const seen = new Set<string>();
    const result: Array<{ path: string; setName: string; referencedToken: string }> = [];
    for (const [refPath, deps] of this.crossSetDependents) {
      if (refPath === groupPrefix || refPath.startsWith(prefix)) {
        for (const dep of deps) {
          // Exclude tokens that are themselves under the group (internal refs)
          if (dep.path === groupPrefix || dep.path.startsWith(prefix)) continue;
          const key = `${dep.setName}:${dep.path}`;
          if (!seen.has(key)) {
            seen.add(key);
            result.push({ path: dep.path, setName: dep.setName, referencedToken: refPath });
          }
        }
      }
    }
    return result;
  }

  /** Get all token groups (the raw data) keyed by set name */
  getAllTokenData(): Record<string, TokenGroup> {
    const result: Record<string, TokenGroup> = {};
    for (const [name, set] of this.sets) {
      result[name] = set.tokens;
    }
    return result;
  }

  // ----- Group operations -----

  async renameGroup(setName: string, oldGroupPath: string, newGroupPath: string, updateAliases = true): Promise<{ renamedCount: number; aliasesUpdated: number }> {
    const set = this.sets.get(setName);
    if (!set) throw new NotFoundError(`Set "${setName}" not found`);
    const leafTokens = collectGroupLeafTokens(set.tokens, oldGroupPath);
    // Snapshot all sets that may be modified (primary + any alias-bearing sets)
    const allSetNames = [setName, ...[...this.sets.keys()].filter(n => n !== setName)];
    const snapshot = updateAliases ? this.snapshotSets(...allSetNames) : this.snapshotSets(setName);
    return await this.withBatch(async () => {
      try {
        if (leafTokens.length === 0) {
          const groupObj = getObjectAtPath(set.tokens, oldGroupPath);
          if (!groupObj) throw new NotFoundError(`Group "${oldGroupPath}" not found`);
          if (pathExistsAt(set.tokens, newGroupPath)) throw new ConflictError(`Path "${newGroupPath}" already exists`);
          setGroupAtPath(set.tokens, newGroupPath, groupObj);
          deleteTokenAtPath(set.tokens, oldGroupPath);
          await this.saveSet(setName);
          return { renamedCount: 0, aliasesUpdated: 0 };
        }
        for (const { relativePath } of leafTokens) {
          const newPath = `${newGroupPath}.${relativePath}`;
          if (getTokenAtPath(set.tokens, newPath)) {
            throw new ConflictError(`Token at path "${newPath}" already exists`);
          }
        }
        for (const { relativePath, token } of leafTokens) {
          setTokenAtPath(set.tokens, `${newGroupPath}.${relativePath}`, token);
        }
        deleteTokenAtPath(set.tokens, oldGroupPath);
        await this.saveSet(setName);
        let aliasesUpdated = 0;
        if (updateAliases) {
          const setsToSave = new Set<string>();
          for (const [sName, s] of this.sets) {
            const changed = updateAliasRefs(s.tokens, oldGroupPath, newGroupPath);
            if (changed > 0) { aliasesUpdated += changed; setsToSave.add(sName); }
          }
          for (const sName of setsToSave) await this.saveSet(sName);
        }
        return { renamedCount: leafTokens.length, aliasesUpdated };
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
    });
  }

  /** Preview which alias $values would be rewritten by a token rename (read-only). */
  previewRenameToken(oldPath: string, newPath: string): Array<AliasChange & { setName: string }> {
    const pathMap = new Map([[oldPath, newPath]]);
    const result: Array<AliasChange & { setName: string }> = [];
    for (const [sName, s] of this.sets) {
      for (const change of previewBulkAliasChanges(s.tokens, pathMap)) {
        result.push({ ...change, setName: sName });
      }
    }
    return result;
  }

  /** Preview which alias $values would be rewritten by a group rename (read-only). */
  previewRenameGroup(oldGroupPath: string, newGroupPath: string): Array<AliasChange & { setName: string }> {
    const result: Array<AliasChange & { setName: string }> = [];
    for (const [sName, s] of this.sets) {
      for (const change of previewGroupAliasChanges(s.tokens, oldGroupPath, newGroupPath)) {
        result.push({ ...change, setName: sName });
      }
    }
    return result;
  }

  async renameToken(setName: string, oldPath: string, newPath: string, updateAliases = true): Promise<{ aliasesUpdated: number }> {
    validateTokenPath(newPath);
    const set = this.sets.get(setName);
    if (!set) throw new NotFoundError(`Set "${setName}" not found`);
    const token = getTokenAtPath(set.tokens, oldPath);
    if (!token) throw new NotFoundError(`Token "${oldPath}" not found in set "${setName}"`);
    if (getTokenAtPath(set.tokens, newPath)) throw new ConflictError(`Token "${newPath}" already exists`);
    // Snapshot all sets that may be modified (primary + any alias-bearing sets)
    const allSetNames = [setName, ...[...this.sets.keys()].filter(n => n !== setName)];
    const snapshot = updateAliases ? this.snapshotSets(...allSetNames) : this.snapshotSets(setName);
    setTokenAtPath(set.tokens, newPath, token);
    deleteTokenAtPath(set.tokens, oldPath);
    try {
      await this.saveSet(setName);
      let aliasesUpdated = 0;
      if (updateAliases) {
        const pathMap = new Map([[oldPath, newPath]]);
        const setsToSave = new Set<string>();
        for (const [sName, s] of this.sets) {
          const changed = updateBulkAliasRefs(s.tokens, pathMap);
          if (changed > 0) { aliasesUpdated += changed; setsToSave.add(sName); }
        }
        for (const sName of setsToSave) await this.saveSet(sName);
      }
      this.rebuildFlatTokens();
      return { aliasesUpdated };
    } catch (err) {
      this.restoreSnapshots(snapshot);
      this.rebuildFlatTokens();
      throw err;
    }
  }

  async moveGroup(fromSet: string, groupPath: string, toSet: string): Promise<{ movedCount: number }> {
    if (fromSet === toSet) throw new BadRequestError('Source and target sets are the same');
    const source = this.sets.get(fromSet);
    if (!source) throw new NotFoundError(`Set "${fromSet}" not found`);
    const target = this.sets.get(toSet);
    if (!target) throw new NotFoundError(`Set "${toSet}" not found`);
    const leafTokens = collectGroupLeafTokens(source.tokens, groupPath);
    const snapshot = this.snapshotSets(fromSet, toSet);
    return await this.withBatch(async () => {
      try {
        if (leafTokens.length === 0) {
          const groupObj = getObjectAtPath(source.tokens, groupPath);
          if (!groupObj) throw new NotFoundError(`Group "${groupPath}" not found`);
          if (pathExistsAt(target.tokens, groupPath)) throw new ConflictError(`Path "${groupPath}" already exists in target set "${toSet}"`);
          setGroupAtPath(target.tokens, groupPath, groupObj);
          deleteTokenAtPath(source.tokens, groupPath);
          await this.saveSet(fromSet);
          await this.saveSet(toSet);
          return { movedCount: 0 };
        }
        const collisions: string[] = [];
        for (const { relativePath } of leafTokens) {
          const targetPath = `${groupPath}.${relativePath}`;
          if (pathExistsAt(target.tokens, targetPath)) collisions.push(targetPath);
        }
        if (collisions.length > 0) {
          throw new ConflictError(`Cannot move group: ${collisions.length} token path(s) already exist in target set "${toSet}": ${collisions.slice(0, 5).join(', ')}${collisions.length > 5 ? `, and ${collisions.length - 5} more` : ''}`);
        }
        for (const { relativePath, token } of leafTokens) {
          setTokenAtPath(target.tokens, `${groupPath}.${relativePath}`, token);
        }
        deleteTokenAtPath(source.tokens, groupPath);
        await this.saveSet(fromSet);
        await this.saveSet(toSet);
        return { movedCount: leafTokens.length };
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
    });
  }

  async copyGroup(fromSet: string, groupPath: string, toSet: string): Promise<{ copiedCount: number }> {
    if (fromSet === toSet) throw new BadRequestError('Source and target sets are the same');
    const source = this.sets.get(fromSet);
    if (!source) throw new NotFoundError(`Set "${fromSet}" not found`);
    const target = this.sets.get(toSet);
    if (!target) throw new NotFoundError(`Set "${toSet}" not found`);
    const leafTokens = collectGroupLeafTokens(source.tokens, groupPath);
    const snapshot = this.snapshotSets(toSet);
    return await this.withBatch(async () => {
      try {
        if (leafTokens.length === 0) {
          const groupObj = getObjectAtPath(source.tokens, groupPath);
          if (!groupObj) throw new NotFoundError(`Group "${groupPath}" not found`);
          if (pathExistsAt(target.tokens, groupPath)) throw new ConflictError(`Path "${groupPath}" already exists in target set "${toSet}"`);
          setGroupAtPath(target.tokens, groupPath, structuredClone(groupObj));
          await this.saveSet(toSet);
          return { copiedCount: 0 };
        }
        const collisions: string[] = [];
        for (const { relativePath } of leafTokens) {
          const targetPath = `${groupPath}.${relativePath}`;
          if (pathExistsAt(target.tokens, targetPath)) collisions.push(targetPath);
        }
        if (collisions.length > 0) {
          throw new ConflictError(`Cannot copy group: ${collisions.length} token path(s) already exist in target set "${toSet}": ${collisions.slice(0, 5).join(', ')}${collisions.length > 5 ? `, and ${collisions.length - 5} more` : ''}`);
        }
        for (const { relativePath, token } of leafTokens) {
          setTokenAtPath(target.tokens, `${groupPath}.${relativePath}`, structuredClone(token));
        }
        await this.saveSet(toSet);
        return { copiedCount: leafTokens.length };
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
    });
  }

  async moveToken(fromSet: string, tokenPath: string, toSet: string): Promise<void> {
    if (fromSet === toSet) throw new BadRequestError('Source and target sets are the same');
    const source = this.sets.get(fromSet);
    if (!source) throw new NotFoundError(`Set "${fromSet}" not found`);
    const target = this.sets.get(toSet);
    if (!target) throw new NotFoundError(`Set "${toSet}" not found`);
    const token = getTokenAtPath(source.tokens, tokenPath);
    if (!token) throw new NotFoundError(`Token "${tokenPath}" not found in set "${fromSet}"`);
    if (pathExistsAt(target.tokens, tokenPath)) throw new ConflictError(`Path "${tokenPath}" already exists in target set "${toSet}"`);
    const snapshot = this.snapshotSets(fromSet, toSet);
    await this.withBatch(async () => {
      try {
        setTokenAtPath(target.tokens, tokenPath, token);
        deleteTokenAtPath(source.tokens, tokenPath);
        await this.saveSet(fromSet);
        await this.saveSet(toSet);
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
    });
  }

  async copyToken(fromSet: string, tokenPath: string, toSet: string): Promise<void> {
    if (fromSet === toSet) throw new BadRequestError('Source and target sets are the same');
    const source = this.sets.get(fromSet);
    if (!source) throw new NotFoundError(`Set "${fromSet}" not found`);
    const target = this.sets.get(toSet);
    if (!target) throw new NotFoundError(`Set "${toSet}" not found`);
    const token = getTokenAtPath(source.tokens, tokenPath);
    if (!token) throw new NotFoundError(`Token "${tokenPath}" not found in set "${fromSet}"`);
    if (pathExistsAt(target.tokens, tokenPath)) throw new ConflictError(`Path "${tokenPath}" already exists in target set "${toSet}"`);
    const snapshot = this.snapshotSets(toSet);
    await this.withBatch(async () => {
      try {
        setTokenAtPath(target.tokens, tokenPath, structuredClone(token));
        await this.saveSet(toSet);
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
    });
  }

  /**
   * Atomically update multiple tokens in the same set. All changes are applied
   * in memory first, then saved once. If any patch fails validation, all
   * changes are rolled back (no partial writes to disk).
   */
  async batchUpdateTokens(
    setName: string,
    patches: Array<{ path: string; patch: Partial<Token> }>,
  ): Promise<void> {
    const set = this.sets.get(setName);
    if (!set) throw new NotFoundError(`Set "${setName}" not found`);
    // Validate all patches upfront before mutating anything
    const enrichedPatches: Array<{ path: string; patch: Partial<Token> }> = [];
    const circularChecks: Array<{ path: string; value: unknown }> = [];
    for (const { path: tokenPath, patch } of patches) {
      const existing = getTokenAtPath(set.tokens, tokenPath);
      if (!existing) throw new NotFoundError(`Token "${tokenPath}" not found in set "${setName}"`);
      let enrichedPatch = patch;
      if ('$value' in patch && patch.$value !== undefined) {
        const enriched = this.enrichFormulaExtension({ $value: patch.$value, $extensions: patch.$extensions ?? existing.$extensions });
        const originalExtensions = patch.$extensions ?? existing.$extensions;
        if (JSON.stringify(enriched.$extensions) !== JSON.stringify(originalExtensions)) {
          enrichedPatch = { ...patch, $extensions: enriched.$extensions };
        }
        circularChecks.push({ path: tokenPath, value: patch.$value });
      }
      enrichedPatches.push({ path: tokenPath, patch: enrichedPatch });
    }
    if (circularChecks.length > 0) {
      this.checkCircularReferences(circularChecks);
    }
    // All validation passed — apply changes atomically
    const snapshot = this.snapshotSets(setName);
    await this.withBatch(async () => {
      try {
        for (const { path: tokenPath, patch } of enrichedPatches) {
          const existing = getTokenAtPath(set.tokens, tokenPath)!;
          if ('$value' in patch) existing.$value = patch.$value!;
          if ('$type' in patch) existing.$type = patch.$type;
          if ('$description' in patch) existing.$description = patch.$description;
          if ('$extensions' in patch) existing.$extensions = patch.$extensions;
        }
        await this.saveSet(setName);
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
    });
    this.emit({ type: 'token-updated', setName, tokenPath: '' });
  }

  /**
   * Atomically rename multiple tokens in the same set. All renames are applied
   * in memory first, then saved once. Alias updates across all sets are also
   * batched into a single save per affected set. If any rename fails, all
   * changes (including alias updates) are rolled back.
   */
  async batchRenameTokens(
    setName: string,
    renames: Array<{ oldPath: string; newPath: string }>,
    updateAliases = true,
  ): Promise<{ renamed: number; aliasesUpdated: number }> {
    const set = this.sets.get(setName);
    if (!set) throw new NotFoundError(`Set "${setName}" not found`);
    // Validate all renames upfront
    for (const { oldPath, newPath } of renames) {
      validateTokenPath(newPath);
    }
    // Check that all source tokens exist and no target paths conflict
    const tokens: Array<{ oldPath: string; newPath: string; token: Token }> = [];
    const newPathSet = new Set<string>();
    for (const { oldPath, newPath } of renames) {
      const token = getTokenAtPath(set.tokens, oldPath);
      if (!token) throw new NotFoundError(`Token "${oldPath}" not found in set "${setName}"`);
      if (getTokenAtPath(set.tokens, newPath)) throw new ConflictError(`Token "${newPath}" already exists`);
      if (newPathSet.has(newPath)) throw new ConflictError(`Duplicate target path "${newPath}" in batch`);
      newPathSet.add(newPath);
      tokens.push({ oldPath, newPath, token });
    }
    // Snapshot all sets that may be modified
    const allSetNames = updateAliases
      ? [setName, ...[...this.sets.keys()].filter(n => n !== setName)]
      : [setName];
    const snapshot = this.snapshotSets(...allSetNames);
    return await this.withBatch(async () => {
      try {
        // Apply all renames in memory
        for (const { oldPath, newPath, token } of tokens) {
          setTokenAtPath(set.tokens, newPath, token);
          deleteTokenAtPath(set.tokens, oldPath);
        }
        await this.saveSet(setName);
        // Batch alias updates
        let aliasesUpdated = 0;
        if (updateAliases) {
          const pathMap = new Map(tokens.map(t => [t.oldPath, t.newPath]));
          const setsToSave = new Set<string>();
          for (const [sName, s] of this.sets) {
            const changed = updateBulkAliasRefs(s.tokens, pathMap);
            if (changed > 0) { aliasesUpdated += changed; setsToSave.add(sName); }
          }
          for (const sName of setsToSave) await this.saveSet(sName);
        }
        return { renamed: tokens.length, aliasesUpdated };
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
    });
  }

  /**
   * Atomically move multiple tokens from one set to another. All moves are
   * applied in memory first, then both sets are saved once. If any move fails
   * validation, all changes are rolled back.
   */
  async batchMoveTokens(
    fromSet: string,
    paths: string[],
    toSet: string,
  ): Promise<{ moved: number }> {
    if (fromSet === toSet) throw new BadRequestError('Source and target sets are the same');
    const source = this.sets.get(fromSet);
    if (!source) throw new NotFoundError(`Set "${fromSet}" not found`);
    const target = this.sets.get(toSet);
    if (!target) throw new NotFoundError(`Set "${toSet}" not found`);
    // Validate all moves upfront
    const tokensToMove: Array<{ path: string; token: Token }> = [];
    for (const tokenPath of paths) {
      const token = getTokenAtPath(source.tokens, tokenPath);
      if (!token) throw new NotFoundError(`Token "${tokenPath}" not found in set "${fromSet}"`);
      if (pathExistsAt(target.tokens, tokenPath)) throw new ConflictError(`Path "${tokenPath}" already exists in target set "${toSet}"`);
      tokensToMove.push({ path: tokenPath, token });
    }
    const snapshot = this.snapshotSets(fromSet, toSet);
    return await this.withBatch(async () => {
      try {
        for (const { path: tokenPath, token } of tokensToMove) {
          setTokenAtPath(target.tokens, tokenPath, token);
          deleteTokenAtPath(source.tokens, tokenPath);
        }
        await this.saveSet(fromSet);
        await this.saveSet(toSet);
        return { moved: tokensToMove.length };
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
    });
  }

  /**
   * Copy multiple tokens from one set to another, overwriting any existing tokens at the
   * same paths in the target set. The source tokens are preserved (not deleted).
   */
  async batchCopyTokens(
    fromSet: string,
    paths: string[],
    toSet: string,
  ): Promise<{ copied: number }> {
    if (fromSet === toSet) throw new BadRequestError('Source and target sets are the same');
    const source = this.sets.get(fromSet);
    if (!source) throw new NotFoundError(`Set "${fromSet}" not found`);
    const target = this.sets.get(toSet);
    if (!target) throw new NotFoundError(`Set "${toSet}" not found`);
    const tokensToCopy: Array<{ path: string; token: Token }> = [];
    for (const tokenPath of paths) {
      const token = getTokenAtPath(source.tokens, tokenPath);
      if (!token) throw new NotFoundError(`Token "${tokenPath}" not found in set "${fromSet}"`);
      tokensToCopy.push({ path: tokenPath, token: JSON.parse(JSON.stringify(token)) as Token });
    }
    const snapshot = this.snapshotSets(toSet);
    return await this.withBatch(async () => {
      try {
        for (const { path: tokenPath, token } of tokensToCopy) {
          setTokenAtPath(target.tokens, tokenPath, token);
        }
        await this.saveSet(toSet);
        return { copied: tokensToCopy.length };
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
    });
  }

  async duplicateGroup(setName: string, groupPath: string): Promise<{ newGroupPath: string; count: number }> {
    const set = this.sets.get(setName);
    if (!set) throw new NotFoundError(`Set "${setName}" not found`);
    const snapshot = this.snapshotSets(setName);
    const leafTokens = collectGroupLeafTokens(set.tokens, groupPath);
    if (leafTokens.length === 0) {
      const groupObj = getObjectAtPath(set.tokens, groupPath);
      if (!groupObj) throw new NotFoundError(`Group "${groupPath}" not found`);
      const lastDot0 = groupPath.lastIndexOf('.');
      const parentPath0 = lastDot0 >= 0 ? groupPath.slice(0, lastDot0) : '';
      const baseName0 = lastDot0 >= 0 ? groupPath.slice(lastDot0 + 1) : groupPath;
      const makeNewPath0 = (suffix: string) => parentPath0 ? `${parentPath0}.${suffix}` : suffix;
      let newEmptyPath = makeNewPath0(`${baseName0}-copy`);
      let attempt0 = 2;
      while (pathExistsAt(set.tokens, newEmptyPath)) {
        newEmptyPath = makeNewPath0(`${baseName0}-copy-${attempt0++}`);
      }
      setGroupAtPath(set.tokens, newEmptyPath, JSON.parse(JSON.stringify(groupObj)));
      try {
        await this.saveSet(setName);
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
      this.rebuildFlatTokens();
      return { newGroupPath: newEmptyPath, count: 0 };
    }
    const lastDot = groupPath.lastIndexOf('.');
    const parentPath = lastDot >= 0 ? groupPath.slice(0, lastDot) : '';
    const baseName = lastDot >= 0 ? groupPath.slice(lastDot + 1) : groupPath;
    const makeNewPath = (suffix: string) => parentPath ? `${parentPath}.${suffix}` : suffix;
    let newGroupPath = makeNewPath(`${baseName}-copy`);
    let attempt = 2;
    while (pathExistsAt(set.tokens, newGroupPath)) {
      newGroupPath = makeNewPath(`${baseName}-copy-${attempt++}`);
    }
    for (const { relativePath, token } of leafTokens) {
      setTokenAtPath(set.tokens, `${newGroupPath}.${relativePath}`, JSON.parse(JSON.stringify(token)));
    }
    try {
      await this.saveSet(setName);
    } catch (err) {
      this.restoreSnapshots(snapshot);
      throw err;
    }
    this.rebuildFlatTokens();
    return { newGroupPath, count: leafTokens.length };
  }

  async bulkRename(
    setName: string,
    find: string,
    replace: string,
    isRegex = false,
  ): Promise<{ renamed: number; skipped: string[]; aliasesUpdated: number }> {
    const set = this.sets.get(setName);
    if (!set) throw new NotFoundError(`Set "${setName}" not found`);

    const flatTokens = await this.getFlatTokensForSet(setName);

    let pattern: RegExp | null = null;
    if (isRegex) {
      if (!isSafeRegex(find)) {
        throw new BadRequestError(
          `Regex pattern rejected: pattern is too long or contains nested quantifiers that could cause excessive backtracking`,
        );
      }
      try {
        pattern = new RegExp(find, 'g');
      } catch {
        throw new BadRequestError(`Invalid regex pattern: "${find}"`);
      }
    }

    // Compute all intended renames
    const renames: Array<{ oldPath: string; newPath: string; token: Token }> = [];
    for (const [tokenPath, token] of Object.entries(flatTokens)) {
      const newPath = pattern
        ? tokenPath.replace(pattern, replace)
        : tokenPath.split(find).join(replace);
      if (newPath !== tokenPath) {
        renames.push({ oldPath: tokenPath, newPath, token });
      }
    }

    // Check for collisions: new path already exists and won't be freed by this rename batch
    const oldPaths = new Set(renames.map(r => r.oldPath));
    const skipped: string[] = [];
    const filteredRenames: Array<{ oldPath: string; newPath: string; token: Token }> = [];
    for (const rename of renames) {
      const existsInSet = getTokenAtPath(set.tokens, rename.newPath) !== undefined;
      const willBeFreed = oldPaths.has(rename.newPath);
      if (existsInSet && !willBeFreed) {
        skipped.push(rename.oldPath);
      } else {
        filteredRenames.push(rename);
      }
    }

    const pathMap = new Map(filteredRenames.map(r => [r.oldPath, r.newPath]));

    // Snapshot all sets before mutation so we can restore atomically on failure
    const snapshot = this.snapshotSets(...this.sets.keys());

    return await this.withBatch(async () => {
      try {
        // Apply: set new paths first, then remove old ones
        for (const { newPath, token } of filteredRenames) {
          setTokenAtPath(set.tokens, newPath, token);
        }
        for (const { oldPath } of filteredRenames) {
          deleteTokenAtPath(set.tokens, oldPath);
        }

        // Update alias references across all sets
        let aliasesUpdated = 0;
        const aliasModifiedSets = new Set<string>();
        for (const [sName, s] of this.sets) {
          const changed = updateBulkAliasRefs(s.tokens, pathMap);
          if (changed > 0) {
            aliasesUpdated += changed;
            aliasModifiedSets.add(sName);
          }
        }

        // Detect circular alias references created by the rename.
        // flatTokens is stale inside a batch (rebuildFlatTokens is deferred), so
        // build a fresh dependency map from this.sets directly — all mutations
        // (path renames + alias ref updates) have already been applied to the
        // token objects, so no overrides are needed.
        const liveDeps = this.buildDependencyMap(undefined, this.buildLiveFlatTokens());
        this.runCycleDFS(liveDeps, filteredRenames.map(r => r.newPath));

        // All checks passed — persist to disk
        await this.saveSet(setName);
        for (const sName of aliasModifiedSets) await this.saveSet(sName);

        return { renamed: filteredRenames.length, skipped, aliasesUpdated };
      } catch (err) {
        this.restoreSnapshots(snapshot);
        throw err;
      }
    });
  }

  // ----- Formula metadata -----

  /**
   * If a token's $value is a formula string, ensure $extensions.tokenmanager.formula
   * is set so Style Dictionary can output calc() expressions at export time.
   */
  private enrichFormulaExtension(token: Pick<Token, '$value' | '$extensions'>): Token {
    if (typeof token.$value === 'string' && isFormula(token.$value)) {
      const existing = token.$extensions;
      const tm = existing?.tokenmanager ?? {};
      return {
        ...token,
        $extensions: {
          ...existing,
          tokenmanager: { ...tm, formula: token.$value },
        },
      } as Token;
    }
    return token as Token;
  }

  // ----- Group creation -----

  async createGroup(setName: string, groupPath: string): Promise<void> {
    validateTokenPath(groupPath);
    const set = this.sets.get(setName);
    if (!set) throw new NotFoundError(`Set "${setName}" not found`);
    if (pathExistsAt(set.tokens, groupPath)) {
      throw new ConflictError(`Path "${groupPath}" already exists`);
    }
    const snapshot = this.snapshotSets(setName);
    setGroupAtPath(set.tokens, groupPath, {});
    try {
      await this.saveSet(setName);
    } catch (err) {
      this.restoreSnapshots(snapshot);
      throw err;
    }
    this.rebuildFlatTokens();
    this.emit({ type: 'token-updated', setName });
  }

  async updateGroup(
    setName: string,
    groupPath: string,
    meta: { $type?: string | null; $description?: string | null },
  ): Promise<void> {
    const set = this.sets.get(setName);
    if (!set) throw new NotFoundError(`Set "${setName}" not found`);
    let group: TokenGroup;
    if (!groupPath) {
      group = set.tokens as TokenGroup;
    } else {
      const found = getObjectAtPath(set.tokens, groupPath);
      if (!found) throw new NotFoundError(`Group "${groupPath}" not found in set "${setName}"`);
      group = found;
    }
    const snapshot = this.snapshotSets(setName);
    if ('$type' in meta) {
      if (meta.$type == null) delete group.$type;
      else group.$type = meta.$type;
    }
    if ('$description' in meta) {
      if (meta.$description == null || meta.$description === '') delete group.$description;
      else group.$description = meta.$description;
    }
    try {
      await this.saveSet(setName);
    } catch (err) {
      this.restoreSnapshots(snapshot);
      throw err;
    }
    this.rebuildFlatTokens();
    this.emit({ type: 'token-updated', setName, tokenPath: groupPath });
  }

  /**
   * Snapshot the tokens for one or more sets so they can be restored on failure.
   * Returns a Map of setName → cloned TokenGroup.
   */
  private snapshotSets(...names: string[]): Map<string, TokenGroup> {
    const snapshots = new Map<string, TokenGroup>();
    for (const name of names) {
      const set = this.sets.get(name);
      if (set) snapshots.set(name, structuredClone(set.tokens));
    }
    return snapshots;
  }

  /** Restore in-memory tokens from snapshots (used on saveSet failure). */
  private restoreSnapshots(snapshots: Map<string, TokenGroup>): void {
    for (const [name, tokens] of snapshots) {
      const set = this.sets.get(name);
      if (set) set.tokens = tokens;
    }
  }

  private saveSet(name: string): Promise<void> {
    // Serialize writes for each set name: chain the actual I/O behind any in-flight
    // write for the same set so concurrent callers never race on the same .tmp file.
    const prev = this._saveChains.get(name) ?? Promise.resolve();
    const next = prev.then(async () => {
      const set = this.sets.get(name);
      if (!set) return;
      const filePath = path.join(this.dir, `${name}.tokens.json`);
      const tmpPath = filePath + '.tmp';
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(tmpPath, JSON.stringify(set.tokens, null, 2));
      this._startWriteGuard(filePath);
      await fs.rename(tmpPath, filePath);
    });
    // Advance the chain regardless of success/failure (mirrors TokenLock behaviour).
    this._saveChains.set(name, next.catch(() => {}));
    return next;
  }

  // ----- SSE support -----

  onChange(listener: (event: ChangeEvent) => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private emit(event: ChangeEvent): void {
    for (const listener of this.changeListeners) {
      listener(event);
    }
  }

  /** Emit an arbitrary event to all SSE listeners (e.g. generator-error). */
  emitEvent(event: ChangeEvent): void {
    this.emit(event);
  }

  async shutdown(): Promise<void> {
    if (this._rebuildDebounceTimer !== null) {
      clearTimeout(this._rebuildDebounceTimer);
      this._rebuildDebounceTimer = null;
    }
    await this.watcher?.close();
  }
}

export interface ChangeEvent {
  type: 'set-added' | 'set-updated' | 'set-removed' | 'token-updated' | 'generator-error' | 'file-load-error';
  setName: string;
  tokenPath?: string;
  generatorId?: string;
  message?: string;
}
