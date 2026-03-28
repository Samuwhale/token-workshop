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
} from './token-tree-utils.js';

import { isSafeRegex } from './token-tree-utils.js';
export { isSafeRegex };

export class TokenStore {
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
  private _pendingRebuild = false;
  private _writingFiles: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(dir: string) {
    this.dir = path.resolve(dir);
  }

  async initialize(): Promise<void> {
    // Create dir if not exists
    await fs.mkdir(this.dir, { recursive: true });
    // Load all .tokens.json files
    await this.loadAllSets();
    // Start watching
    this.startWatching();
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

    this.watcher.on('change', async (filePath) => {
      if (this._writingFiles.has(filePath as string)) { this._clearWriteGuard(filePath as string); return; }
      const relativePath = path.relative(this.dir, filePath as string);
      await this.loadSet(relativePath).catch(err =>
        console.warn(`[TokenStore] Error reloading "${relativePath}":`, err),
      );
      this.scheduleRebuild({ type: 'set-updated', setName: relativePath.replace('.tokens.json', '') });
    });

    this.watcher.on('add', async (filePath) => {
      if (this._writingFiles.has(filePath as string)) { this._clearWriteGuard(filePath as string); return; }
      const relativePath = path.relative(this.dir, filePath as string);
      await this.loadSet(relativePath).catch(err =>
        console.warn(`[TokenStore] Error loading new file "${relativePath}":`, err),
      );
      this.scheduleRebuild({ type: 'set-added', setName: relativePath.replace('.tokens.json', '') });
    });

    this.watcher.on('unlink', (filePath) => {
      if (this._writingFiles.has(filePath as string)) { this._clearWriteGuard(filePath as string); return; }
      const relativePath = path.relative(this.dir, filePath as string);
      const name = relativePath.replace('.tokens.json', '');
      this.sets.delete(name);
      this.scheduleRebuild({ type: 'set-removed', setName: name });
    });

    this.watcher.on('error', (err) => {
      console.error('[TokenStore] File watcher error:', err);
    });
  }

  private rebuildFlatTokens(): void {
    if (this._batchDepth > 0) {
      this._pendingRebuild = true;
      return;
    }
    this._pendingRebuild = false;
    this.flatTokens.clear();
    for (const [setName, set] of this.sets) {
      for (const [tokenPath, token] of flattenTokenGroup(set.tokens)) {
        let entries = this.flatTokens.get(tokenPath);
        if (!entries) {
          entries = [];
          this.flatTokens.set(tokenPath, entries);
        }
        entries.push({ token: token as Token, setName });
      }
    }
    this.rebuildResolver();
    this.rebuildCrossSetDependents();
  }

  /** Begin a batch operation — defers flat-token rebuilds until endBatch(). */
  beginBatch(): void {
    this._batchDepth++;
  }

  /** End a batch operation — flushes any deferred rebuild. */
  endBatch(): void {
    if (this._batchDepth > 0) this._batchDepth--;
    if (this._batchDepth === 0 && this._pendingRebuild) {
      this.rebuildFlatTokens();
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
   */
  private buildDependencyMap(overrides?: Map<string, unknown>): Map<string, Set<string>> {
    const deps = new Map<string, Set<string>>();
    for (const [tokenPath, entries] of this.flatTokens) {
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
  checkCircularReferences(changes: Array<{ path: string; value: unknown }>): void {
    const overrides = new Map<string, unknown>();
    for (const { path, value } of changes) {
      overrides.set(path, value);
    }
    const deps = this.buildDependencyMap(overrides);

    // DFS with 3-color marking to detect cycles
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

    // Only need to check nodes reachable from the changed paths
    for (const { path } of changes) {
      if ((color.get(path) ?? WHITE) === WHITE) {
        dfs(path);
      }
    }
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
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    this._startWriteGuard(filePath);
    await fs.writeFile(filePath, JSON.stringify(tokens, null, 2));
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
    await fs.unlink(filePath);
    await this.removeEmptyParentDirs(filePath);
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
      await fs.unlink(filePath).catch(() => {});
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

    // Step 1: Rename the file atomically (same filesystem, so fs.rename is atomic)
    await fs.mkdir(path.dirname(newFilePath), { recursive: true });
    this._startWriteGuard(oldFilePath);
    this._startWriteGuard(newFilePath);
    try {
      await fs.rename(oldFilePath, newFilePath);

      // Step 2: Update $themes.json — roll back file rename on failure
      const themesPath = path.join(this.dir, '$themes.json');
      let themesOriginalContent: string | null = null;
      try {
        const content = await fs.readFile(themesPath, 'utf-8');
        const data = JSON.parse(content) as { $themes: Array<{ options: Array<{ sets: Record<string, unknown> }> }> };
        if (Array.isArray(data.$themes)) {
          themesOriginalContent = content;
          for (const dimension of data.$themes) {
            if (!Array.isArray(dimension.options)) continue;
            for (const option of dimension.options) {
              if (option.sets && oldName in option.sets) {
                option.sets[newName] = option.sets[oldName];
                delete option.sets[oldName];
              }
            }
          }
          try {
            await fs.writeFile(themesPath, JSON.stringify(data, null, 2));
          } catch (writeErr) {
            // Themes write failed — roll back the file rename
            await fs.rename(newFilePath, oldFilePath).catch(() => {});
            throw writeErr;
          }
        }
      } catch (err) {
        if (themesOriginalContent !== null) {
          // We read themes successfully but something failed — re-throw
          throw err;
        }
        // No themes file or parse error — that's fine, nothing to update
      }

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
    setTokenAtPath(set.tokens, tokenPath, token);
    await this.saveSet(setName);
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
    if ('$value' in token) existing.$value = token.$value!;
    if ('$type' in token) existing.$type = token.$type;
    if ('$description' in token) existing.$description = token.$description;
    if ('$extensions' in token) existing.$extensions = token.$extensions;
    await this.saveSet(setName);
    this.rebuildFlatTokens();
    this.emit({ type: 'token-updated', setName, tokenPath });
  }

  async batchUpsertTokens(
    setName: string,
    tokens: Array<{ path: string; token: Token }>,
    strategy: 'skip' | 'overwrite',
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
    this.beginBatch();
    let imported = 0;
    let skipped = 0;
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
          } else {
            skipped++;
          }
        } else {
          setTokenAtPath(set.tokens, tokenPath, enriched);
          imported++;
        }
      }
      await this.saveSet(setName);
    } finally {
      this.endBatch();
    }
    this.emit({ type: 'token-updated', setName, tokenPath: '' });
    return { imported, skipped };
  }

  async deleteToken(setName: string, tokenPath: string): Promise<boolean> {
    const set = this.sets.get(setName);
    if (!set) return false;
    const deleted = deleteTokenAtPath(set.tokens, tokenPath);
    if (deleted) {
      await this.saveSet(setName);
      this.rebuildFlatTokens();
      this.emit({ type: 'token-updated', setName, tokenPath });
    }
    return deleted;
  }

  /** Delete multiple token paths in a single save. Returns the list of paths actually deleted. */
  async deleteTokens(setName: string, tokenPaths: string[]): Promise<string[]> {
    const set = this.sets.get(setName);
    if (!set) return [];
    const deleted: string[] = [];
    this.beginBatch();
    try {
      for (const tokenPath of tokenPaths) {
        if (deleteTokenAtPath(set.tokens, tokenPath)) {
          deleted.push(tokenPath);
        }
      }
      if (deleted.length > 0) {
        await this.saveSet(setName);
      }
    } finally {
      this.endBatch();
    }
    if (deleted.length > 0) {
      this.rebuildFlatTokens();
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
    this.beginBatch();
    try {
      for (const { path: tokenPath, token } of items) {
        if (token === null) {
          deleteTokenAtPath(set.tokens, tokenPath);
        } else {
          setTokenAtPath(set.tokens, tokenPath, structuredClone(token));
        }
      }
      await this.saveSet(setName);
    } finally {
      this.endBatch();
    }
    this.rebuildFlatTokens();
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

    this.beginBatch();
    const setsToSave = new Set<string>();
    let deleted = 0;
    try {
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
    } finally {
      this.endBatch();
    }
    if (deleted > 0) {
      this.rebuildFlatTokens();
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
    paths?: string[];
    names?: string[];
    limit?: number;
  }): Array<{ setName: string; path: string; name: string; $type: string; $value: unknown; $description?: string }> {
    const { q, types, has, values, paths, names, limit = 200 } = opts;
    const qLower = q?.toLowerCase();
    const results: Array<{ setName: string; path: string; name: string; $type: string; $value: unknown; $description?: string }> = [];

    for (const [tokenPath, entries] of this.flatTokens) {
      if (results.length >= limit) break;
      const lp = tokenPath.toLowerCase();
      const leafName = tokenPath.includes('.') ? tokenPath.slice(tokenPath.lastIndexOf('.') + 1) : tokenPath;
      const ln = leafName.toLowerCase();

      // Free text: match against path or leaf name
      if (qLower && !lp.includes(qLower) && !ln.includes(qLower)) continue;

      // path: qualifier
      if (paths && paths.length > 0 && !paths.some(p => lp.startsWith(p) || lp.includes(p))) continue;

      // name: qualifier
      if (names && names.length > 0 && !names.some(n => ln.includes(n))) continue;

      for (const entry of entries) {
        if (results.length >= limit) break;

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

        results.push({
          setName: entry.setName,
          path: tokenPath,
          name: leafName,
          $type: entry.token.$type || 'unknown',
          $value: entry.token.$value,
          $description: entry.token.$description,
        });
      }
    }

    return results;
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
    this.beginBatch();
    try {
      if (leafTokens.length === 0) {
        const groupObj = getObjectAtPath(set.tokens, oldGroupPath);
        if (!groupObj) throw new NotFoundError(`Group "${oldGroupPath}" not found`);
        if (pathExistsAt(set.tokens, newGroupPath)) throw new ConflictError(`Path "${newGroupPath}" already exists`);
        setGroupAtPath(set.tokens, newGroupPath, groupObj);
        deleteTokenAtPath(set.tokens, oldGroupPath);
        await this.saveSet(setName);
        this.rebuildFlatTokens();
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
      this.rebuildFlatTokens();
      return { renamedCount: leafTokens.length, aliasesUpdated };
    } finally {
      this.endBatch();
    }
  }

  async renameToken(setName: string, oldPath: string, newPath: string, updateAliases = true): Promise<{ aliasesUpdated: number }> {
    validateTokenPath(newPath);
    const set = this.sets.get(setName);
    if (!set) throw new NotFoundError(`Set "${setName}" not found`);
    const token = getTokenAtPath(set.tokens, oldPath);
    if (!token) throw new NotFoundError(`Token "${oldPath}" not found in set "${setName}"`);
    if (getTokenAtPath(set.tokens, newPath)) throw new ConflictError(`Token "${newPath}" already exists`);
    setTokenAtPath(set.tokens, newPath, token);
    deleteTokenAtPath(set.tokens, oldPath);
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
  }

  async moveGroup(fromSet: string, groupPath: string, toSet: string): Promise<{ movedCount: number }> {
    if (fromSet === toSet) throw new BadRequestError('Source and target sets are the same');
    const source = this.sets.get(fromSet);
    if (!source) throw new NotFoundError(`Set "${fromSet}" not found`);
    const target = this.sets.get(toSet);
    if (!target) throw new NotFoundError(`Set "${toSet}" not found`);
    const leafTokens = collectGroupLeafTokens(source.tokens, groupPath);
    this.beginBatch();
    try {
      if (leafTokens.length === 0) {
        const groupObj = getObjectAtPath(source.tokens, groupPath);
        if (!groupObj) throw new NotFoundError(`Group "${groupPath}" not found`);
        if (pathExistsAt(target.tokens, groupPath)) throw new ConflictError(`Path "${groupPath}" already exists in target set "${toSet}"`);
        setGroupAtPath(target.tokens, groupPath, groupObj);
        deleteTokenAtPath(source.tokens, groupPath);
        await this.saveSet(fromSet);
        await this.saveSet(toSet);
        this.rebuildFlatTokens();
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
      this.rebuildFlatTokens();
      return { movedCount: leafTokens.length };
    } finally {
      this.endBatch();
    }
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
    this.beginBatch();
    try {
      setTokenAtPath(target.tokens, tokenPath, token);
      deleteTokenAtPath(source.tokens, tokenPath);
      await this.saveSet(fromSet);
      await this.saveSet(toSet);
      this.rebuildFlatTokens();
    } finally {
      this.endBatch();
    }
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
    this.beginBatch();
    try {
      setTokenAtPath(target.tokens, tokenPath, structuredClone(token));
      await this.saveSet(toSet);
      this.rebuildFlatTokens();
    } finally {
      this.endBatch();
    }
  }

  async duplicateGroup(setName: string, groupPath: string): Promise<{ newGroupPath: string; count: number }> {
    const set = this.sets.get(setName);
    if (!set) throw new NotFoundError(`Set "${setName}" not found`);
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
      await this.saveSet(setName);
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
    await this.saveSet(setName);
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
    const aliasModifiedSets = new Set<string>();

    this.beginBatch();
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
      for (const [sName, s] of this.sets) {
        const changed = updateBulkAliasRefs(s.tokens, pathMap);
        if (changed > 0) {
          aliasesUpdated += changed;
          aliasModifiedSets.add(sName);
        }
      }

      // Rebuild flat tokens so circular reference check sees the post-rename state
      this.rebuildFlatTokens();

      // Detect circular alias references created by the rename
      const circularCheckChanges = filteredRenames.map(({ newPath }) => {
        const entries = this.flatTokens.get(newPath);
        return { path: newPath, value: entries?.[0]?.token.$value };
      });
      this.checkCircularReferences(circularCheckChanges);

      // All checks passed — persist to disk
      await this.saveSet(setName);
      for (const sName of aliasModifiedSets) await this.saveSet(sName);

      return { renamed: filteredRenames.length, skipped, aliasesUpdated };
    } catch (err) {
      // Revert in-memory mutations: restore renamed set
      for (const { oldPath, newPath, token } of filteredRenames) {
        setTokenAtPath(set.tokens, oldPath, token);
        deleteTokenAtPath(set.tokens, newPath);
      }
      // Revert alias reference updates across other sets
      const reversePathMap = new Map(filteredRenames.map(r => [r.newPath, r.oldPath]));
      for (const sName of aliasModifiedSets) {
        const s = this.sets.get(sName);
        if (s) updateBulkAliasRefs(s.tokens, reversePathMap);
      }
      this.rebuildFlatTokens();
      throw err;
    } finally {
      this.endBatch();
    }
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
    setGroupAtPath(set.tokens, groupPath, {});
    await this.saveSet(setName);
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
    if ('$type' in meta) {
      if (meta.$type == null) delete group.$type;
      else group.$type = meta.$type;
    }
    if ('$description' in meta) {
      if (meta.$description == null || meta.$description === '') delete group.$description;
      else group.$description = meta.$description;
    }
    await this.saveSet(setName);
    this.rebuildFlatTokens();
    this.emit({ type: 'token-updated', setName, tokenPath: groupPath });
  }

  private async saveSet(name: string): Promise<void> {
    const set = this.sets.get(name);
    if (!set) return;
    const filePath = path.join(this.dir, `${name}.tokens.json`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    this._startWriteGuard(filePath);
    await fs.writeFile(filePath, JSON.stringify(set.tokens, null, 2));
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
  type: 'set-added' | 'set-updated' | 'set-removed' | 'token-updated' | 'generator-error';
  setName: string;
  tokenPath?: string;
  generatorId?: string;
  message?: string;
}
