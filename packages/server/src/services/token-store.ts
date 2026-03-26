import fs from 'node:fs/promises';
import path from 'node:path';
import { watch } from 'chokidar';
import {
  type Token,
  type TokenGroup,
  type TokenSet,
  type ResolvedToken,
  type TokenType,
  isDTCGToken,
  isFormula,
  TokenResolver,
} from '@tokenmanager/core';

export class TokenStore {
  private dir: string;
  private sets: Map<string, TokenSet> = new Map();
  private flatTokens: Map<string, { token: Token; setName: string }> = new Map();
  private resolver: TokenResolver | null = null;
  private watcher: ReturnType<typeof watch> | null = null;
  private changeListeners: Set<(event: ChangeEvent) => void> = new Set();
  private _rebuildDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingWatcherEvents: ChangeEvent[] = [];

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
    try {
      const entries = await fs.readdir(this.dir);
      return entries.filter(f => f.endsWith('.tokens.json'));
    } catch {
      return [];
    }
  }

  private async loadSet(filename: string): Promise<void> {
    const filePath = path.join(this.dir, filename);
    const content = await fs.readFile(filePath, 'utf-8');
    let tokens: TokenGroup;
    try {
      tokens = JSON.parse(content) as TokenGroup;
    } catch {
      console.warn(`[TokenStore] Skipping malformed JSON in "${filename}"`);
      return;
    }
    const name = filename.replace('.tokens.json', '');
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

  private startWatching(): void {
    this.watcher = watch(path.join(this.dir, '*.tokens.json'), {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200 },
    });

    this.watcher.on('change', async (filePath) => {
      const filename = path.basename(filePath as string);
      await this.loadSet(filename).catch(err =>
        console.warn(`[TokenStore] Error reloading "${filename}":`, err),
      );
      this.scheduleRebuild({ type: 'set-updated', setName: filename.replace('.tokens.json', '') });
    });

    this.watcher.on('add', async (filePath) => {
      const filename = path.basename(filePath as string);
      await this.loadSet(filename).catch(err =>
        console.warn(`[TokenStore] Error loading new file "${filename}":`, err),
      );
      this.scheduleRebuild({ type: 'set-added', setName: filename.replace('.tokens.json', '') });
    });

    this.watcher.on('unlink', (filePath) => {
      const filename = path.basename(filePath as string);
      const name = filename.replace('.tokens.json', '');
      this.sets.delete(name);
      this.scheduleRebuild({ type: 'set-removed', setName: name });
    });

    this.watcher.on('error', (err) => {
      console.error('[TokenStore] File watcher error:', err);
    });
  }

  private rebuildFlatTokens(): void {
    this.flatTokens.clear();
    for (const [setName, set] of this.sets) {
      this.flattenTokens(set.tokens, '', setName, this.flatTokens);
    }
    this.rebuildResolver();
  }

  private rebuildResolver(): void {
    const allTokens: Record<string, Token> = {};
    for (const [tokenPath, { token }] of this.flatTokens) {
      allTokens[tokenPath] = token;
    }
    this.resolver = new TokenResolver(allTokens, '__merged__');
  }

  private flattenTokens(
    group: TokenGroup,
    prefix: string,
    setName: string,
    out: Map<string, { token: Token; setName: string }>,
    parentType?: TokenType,
  ): void {
    const inheritedType = (group.$type ?? parentType) as TokenType | undefined;
    for (const [key, value] of Object.entries(group)) {
      if (key.startsWith('$')) continue;
      const fullPath = prefix ? `${prefix}.${key}` : key;
      if (isDTCGToken(value)) {
        const token = value as Token;
        const effective = !token.$type && inheritedType
          ? { ...token, $type: inheritedType }
          : token;
        out.set(fullPath, { token: effective, setName });
      } else if (typeof value === 'object' && value !== null) {
        this.flattenTokens(value as TokenGroup, fullPath, setName, out, inheritedType);
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

  getSetDescriptions(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [name, set] of this.sets) {
      const desc = (set.tokens as any).$description;
      if (typeof desc === 'string' && desc) {
        result[name] = desc;
      }
    }
    return result;
  }

  async updateSetDescription(name: string, description: string): Promise<void> {
    const set = this.sets.get(name);
    if (!set) throw new Error(`Set "${name}" not found`);
    if (description) {
      (set.tokens as any).$description = description;
    } else {
      delete (set.tokens as any).$description;
    }
    await this.saveSet(name);
  }

  async getSet(name: string): Promise<TokenSet | undefined> {
    return this.sets.get(name);
  }

  /** Replace all tokens in a set with a new nested DTCG token group. */
  async replaceSetTokens(name: string, tokens: TokenGroup): Promise<void> {
    const set = this.sets.get(name);
    if (!set) throw new Error(`Set "${name}" not found`);
    set.tokens = tokens;
    await this.saveSet(name);
    this.rebuildFlatTokens();
    this.emit({ type: 'token-updated', setName: name });
  }

  async createSet(name: string, tokens?: TokenGroup): Promise<TokenSet> {
    const filename = `${name}.tokens.json`;
    const filePath = path.join(this.dir, filename);
    const tokenData = tokens || {};
    await fs.writeFile(filePath, JSON.stringify(tokenData, null, 2));
    const set: TokenSet = { name, tokens: tokenData, filePath };
    this.sets.set(name, set);
    this.rebuildFlatTokens();
    return set;
  }

  async deleteSet(name: string): Promise<boolean> {
    const set = this.sets.get(name);
    if (!set) return false;
    const filePath = path.join(this.dir, `${name}.tokens.json`);
    await fs.unlink(filePath);
    this.sets.delete(name);
    this.rebuildFlatTokens();
    return true;
  }

  async clearAll(): Promise<void> {
    const names = Array.from(this.sets.keys());
    for (const name of names) {
      const filePath = path.join(this.dir, `${name}.tokens.json`);
      await fs.unlink(filePath).catch(() => {});
    }
    this.sets.clear();
    this.flatTokens.clear();
    const themesPath = path.join(this.dir, '$themes.json');
    await fs.unlink(themesPath).catch(() => {});
  }

  async renameSet(oldName: string, newName: string): Promise<void> {
    if (!/^[a-zA-Z0-9_-]+$/.test(newName)) {
      throw new Error('Set name must contain only alphanumeric characters, dashes, and underscores');
    }
    const set = this.sets.get(oldName);
    if (!set) throw new Error(`Set "${oldName}" not found`);
    if (this.sets.has(newName)) throw new Error(`Set "${newName}" already exists`);

    const oldFilePath = path.join(this.dir, `${oldName}.tokens.json`);
    const newFilePath = path.join(this.dir, `${newName}.tokens.json`);

    // Write new file first (safe: new name doesn't exist yet)
    await fs.writeFile(newFilePath, JSON.stringify(set.tokens, null, 2));

    // Update $themes.json: replace all references to oldName with newName
    const themesPath = path.join(this.dir, '$themes.json');
    try {
      const content = await fs.readFile(themesPath, 'utf-8');
      const data = JSON.parse(content) as { $themes: Array<{ sets: Record<string, unknown> }> };
      if (Array.isArray(data.$themes)) {
        for (const theme of data.$themes) {
          if (theme.sets && oldName in theme.sets) {
            theme.sets[newName] = theme.sets[oldName];
            delete theme.sets[oldName];
          }
        }
        await fs.writeFile(themesPath, JSON.stringify(data, null, 2));
      }
    } catch {
      // No themes file or parse error — that's fine, nothing to update
    }

    // Update in-memory state
    const newSet: TokenSet = { name: newName, tokens: set.tokens, filePath: newFilePath };
    this.sets.set(newName, newSet);
    this.sets.delete(oldName);

    // Delete old file
    await fs.unlink(oldFilePath);

    this.rebuildFlatTokens();
    this.emit({ type: 'set-removed', setName: oldName });
    this.emit({ type: 'set-added', setName: newName });
  }

  async getToken(setName: string, tokenPath: string): Promise<Token | undefined> {
    const set = this.sets.get(setName);
    if (!set) return undefined;
    return this.getTokenAtPath(set.tokens, tokenPath);
  }

  async createToken(setName: string, tokenPath: string, token: Token): Promise<void> {
    if (!/^[a-zA-Z0-9_-]+$/.test(setName)) {
      throw new Error(`Invalid set name "${setName}". Only alphanumeric characters, dashes, and underscores are allowed.`);
    }
    // Auto-persist formula metadata so Style Dictionary export can output calc()
    token = this.enrichFormulaExtension(token);
    let set = this.sets.get(setName);
    if (!set) {
      set = await this.createSet(setName);
    }
    this.setTokenAtPath(set.tokens, tokenPath, token);
    await this.saveSet(setName);
    this.rebuildFlatTokens();
    this.emit({ type: 'token-updated', setName, tokenPath });
  }

  async updateToken(setName: string, tokenPath: string, token: Partial<Token>): Promise<void> {
    const set = this.sets.get(setName);
    if (!set) throw new Error(`Set "${setName}" not found`);
    const existing = this.getTokenAtPath(set.tokens, tokenPath);
    if (!existing) throw new Error(`Token "${tokenPath}" not found in set "${setName}"`);
    // Auto-persist formula metadata so Style Dictionary export can output calc()
    if ('$value' in token && token.$value !== undefined) {
      const enriched = this.enrichFormulaExtension({ $value: token.$value, $extensions: token.$extensions ?? existing.$extensions });
      if (enriched.$extensions !== (token.$extensions ?? existing.$extensions)) {
        token = { ...token, $extensions: enriched.$extensions };
      }
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

  async deleteToken(setName: string, tokenPath: string): Promise<boolean> {
    const set = this.sets.get(setName);
    if (!set) return false;
    const deleted = this.deleteTokenAtPath(set.tokens, tokenPath);
    if (deleted) {
      await this.saveSet(setName);
      this.rebuildFlatTokens();
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
      const entry = this.flatTokens.get(tokenPath);
      // Attach the correct setName from our flat token map
      results.push({
        ...resolved,
        setName: entry?.setName ?? resolved.setName,
      });
    }
    return results;
  }

  async resolveToken(tokenPath: string): Promise<ResolvedToken | undefined> {
    const entry = this.flatTokens.get(tokenPath);
    if (!entry || !this.resolver) return undefined;
    try {
      const resolved = this.resolver.resolve(tokenPath);
      return {
        ...resolved,
        setName: entry.setName,
      };
    } catch {
      return undefined;
    }
  }

  /** Get all tokens in a set as a flat map of path -> Token */
  async getFlatTokensForSet(setName: string): Promise<Record<string, Token>> {
    const result: Record<string, Token> = {};
    for (const [tokenPath, entry] of this.flatTokens) {
      if (entry.setName === setName) {
        result[tokenPath] = entry.token;
      }
    }
    return result;
  }

  /** Get all tokens that reference the given token path, with their set names. */
  getDependents(tokenPath: string): Array<{ path: string; setName: string }> {
    if (!this.resolver) return [];
    const depPaths = this.resolver.getDependents(tokenPath);
    return Array.from(depPaths).map(path => ({
      path,
      setName: this.flatTokens.get(path)?.setName ?? 'unknown',
    }));
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

  /** Collect all leaf tokens under a group path, with relative paths from the group root */
  private collectGroupLeafTokens(tokens: TokenGroup, groupPath: string): Array<{ relativePath: string; token: Token }> {
    const parts = groupPath.split('.');
    let current: any = tokens;
    for (const part of parts) {
      if (!current || typeof current !== 'object') return [];
      current = current[part];
    }
    if (!current || typeof current !== 'object' || isDTCGToken(current)) return [];
    const result: Array<{ relativePath: string; token: Token }> = [];
    const walk = (obj: any, prefix: string) => {
      for (const [key, val] of Object.entries(obj as object)) {
        if (key.startsWith('$')) continue;
        const relPath = prefix ? `${prefix}.${key}` : key;
        if (isDTCGToken(val)) {
          result.push({ relativePath: relPath, token: val as Token });
        } else if (typeof val === 'object' && val !== null) {
          walk(val, relPath);
        }
      }
    };
    walk(current, '');
    return result;
  }

  /** Update alias $value references from oldGroupPath to newGroupPath across a token tree */
  private updateAliasRefs(group: any, oldGroupPath: string, newGroupPath: string): number {
    let count = 0;
    const oldPrefix = `{${oldGroupPath}.`;
    const newPrefix = `{${newGroupPath}.`;
    const walk = (obj: any) => {
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (key === '$value' && typeof val === 'string' && val.startsWith(oldPrefix)) {
          obj[key] = newPrefix + val.slice(oldPrefix.length);
          count++;
        } else if (typeof val === 'object' && val !== null) {
          walk(val);
        }
      }
    };
    walk(group);
    return count;
  }

  /** Update alias $value references using a full path map (oldPath -> newPath) */
  private updateBulkAliasRefs(group: any, pathMap: Map<string, string>): number {
    let count = 0;
    const walk = (obj: any) => {
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (key === '$value' && typeof val === 'string' && val.startsWith('{') && val.endsWith('}')) {
          const refPath = val.slice(1, -1);
          if (pathMap.has(refPath)) {
            obj[key] = `{${pathMap.get(refPath)}}`;
            count++;
          }
        } else if (typeof val === 'object' && val !== null) {
          walk(val);
        }
      }
    };
    walk(group);
    return count;
  }

  private pathExistsAt(tokens: TokenGroup, path: string): boolean {
    const parts = path.split('.');
    let current: any = tokens;
    for (const part of parts) {
      if (!current || typeof current !== 'object') return false;
      current = current[part];
    }
    return current !== undefined;
  }

  async renameGroup(setName: string, oldGroupPath: string, newGroupPath: string): Promise<{ renamedCount: number; aliasesUpdated: number }> {
    const set = this.sets.get(setName);
    if (!set) throw new Error(`Set "${setName}" not found`);
    const leafTokens = this.collectGroupLeafTokens(set.tokens, oldGroupPath);
    if (leafTokens.length === 0) {
      const groupObj = this.getObjectAtPath(set.tokens, oldGroupPath);
      if (!groupObj) throw new Error(`Group "${oldGroupPath}" not found`);
      if (this.pathExistsAt(set.tokens, newGroupPath)) throw new Error(`Path "${newGroupPath}" already exists`);
      this.setGroupAtPath(set.tokens, newGroupPath, groupObj);
      this.deleteTokenAtPath(set.tokens, oldGroupPath);
      await this.saveSet(setName);
      this.rebuildFlatTokens();
      return { renamedCount: 0, aliasesUpdated: 0 };
    }
    for (const { relativePath } of leafTokens) {
      const newPath = `${newGroupPath}.${relativePath}`;
      if (this.getTokenAtPath(set.tokens, newPath)) {
        throw new Error(`Token at path "${newPath}" already exists`);
      }
    }
    for (const { relativePath, token } of leafTokens) {
      this.setTokenAtPath(set.tokens, `${newGroupPath}.${relativePath}`, token);
    }
    this.deleteTokenAtPath(set.tokens, oldGroupPath);
    await this.saveSet(setName);
    let aliasesUpdated = 0;
    const setsToSave = new Set<string>();
    for (const [sName, s] of this.sets) {
      const changed = this.updateAliasRefs(s.tokens, oldGroupPath, newGroupPath);
      if (changed > 0) { aliasesUpdated += changed; setsToSave.add(sName); }
    }
    for (const sName of setsToSave) await this.saveSet(sName);
    this.rebuildFlatTokens();
    return { renamedCount: leafTokens.length, aliasesUpdated };
  }

  async renameToken(setName: string, oldPath: string, newPath: string): Promise<{ aliasesUpdated: number }> {
    const set = this.sets.get(setName);
    if (!set) throw new Error(`Set "${setName}" not found`);
    const token = this.getTokenAtPath(set.tokens, oldPath);
    if (!token) throw new Error(`Token "${oldPath}" not found in set "${setName}"`);
    if (this.getTokenAtPath(set.tokens, newPath)) throw new Error(`Token "${newPath}" already exists`);
    this.setTokenAtPath(set.tokens, newPath, token);
    this.deleteTokenAtPath(set.tokens, oldPath);
    await this.saveSet(setName);
    const pathMap = new Map([[oldPath, newPath]]);
    let aliasesUpdated = 0;
    const setsToSave = new Set<string>();
    for (const [sName, s] of this.sets) {
      const changed = this.updateBulkAliasRefs(s.tokens, pathMap);
      if (changed > 0) { aliasesUpdated += changed; setsToSave.add(sName); }
    }
    for (const sName of setsToSave) await this.saveSet(sName);
    this.rebuildFlatTokens();
    return { aliasesUpdated };
  }

  async moveGroup(fromSet: string, groupPath: string, toSet: string): Promise<{ movedCount: number }> {
    if (fromSet === toSet) throw new Error('Source and target sets are the same');
    const source = this.sets.get(fromSet);
    if (!source) throw new Error(`Set "${fromSet}" not found`);
    const target = this.sets.get(toSet);
    if (!target) throw new Error(`Set "${toSet}" not found`);
    const leafTokens = this.collectGroupLeafTokens(source.tokens, groupPath);
    if (leafTokens.length === 0) {
      const groupObj = this.getObjectAtPath(source.tokens, groupPath);
      if (!groupObj) throw new Error(`Group "${groupPath}" not found`);
      this.setGroupAtPath(target.tokens, groupPath, groupObj);
      this.deleteTokenAtPath(source.tokens, groupPath);
      await this.saveSet(fromSet);
      await this.saveSet(toSet);
      this.rebuildFlatTokens();
      return { movedCount: 0 };
    }
    for (const { relativePath, token } of leafTokens) {
      this.setTokenAtPath(target.tokens, `${groupPath}.${relativePath}`, token);
    }
    this.deleteTokenAtPath(source.tokens, groupPath);
    await this.saveSet(fromSet);
    await this.saveSet(toSet);
    this.rebuildFlatTokens();
    return { movedCount: leafTokens.length };
  }

  async duplicateGroup(setName: string, groupPath: string): Promise<{ newGroupPath: string; count: number }> {
    const set = this.sets.get(setName);
    if (!set) throw new Error(`Set "${setName}" not found`);
    const leafTokens = this.collectGroupLeafTokens(set.tokens, groupPath);
    if (leafTokens.length === 0) {
      const groupObj = this.getObjectAtPath(set.tokens, groupPath);
      if (!groupObj) throw new Error(`Group "${groupPath}" not found`);
      const lastDot0 = groupPath.lastIndexOf('.');
      const parentPath0 = lastDot0 >= 0 ? groupPath.slice(0, lastDot0) : '';
      const baseName0 = lastDot0 >= 0 ? groupPath.slice(lastDot0 + 1) : groupPath;
      const makeNewPath0 = (suffix: string) => parentPath0 ? `${parentPath0}.${suffix}` : suffix;
      let newEmptyPath = makeNewPath0(`${baseName0}-copy`);
      let attempt0 = 2;
      while (this.pathExistsAt(set.tokens, newEmptyPath)) {
        newEmptyPath = makeNewPath0(`${baseName0}-copy-${attempt0++}`);
      }
      this.setGroupAtPath(set.tokens, newEmptyPath, JSON.parse(JSON.stringify(groupObj)));
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
    while (this.pathExistsAt(set.tokens, newGroupPath)) {
      newGroupPath = makeNewPath(`${baseName}-copy-${attempt++}`);
    }
    for (const { relativePath, token } of leafTokens) {
      this.setTokenAtPath(set.tokens, `${newGroupPath}.${relativePath}`, JSON.parse(JSON.stringify(token)));
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
    if (!set) throw new Error(`Set "${setName}" not found`);

    const flatTokens = await this.getFlatTokensForSet(setName);

    let pattern: RegExp | null = null;
    if (isRegex) {
      try {
        pattern = new RegExp(find, 'g');
      } catch {
        throw new Error(`Invalid regex pattern: "${find}"`);
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
      const existsInSet = this.getTokenAtPath(set.tokens, rename.newPath) !== undefined;
      const willBeFreed = oldPaths.has(rename.newPath);
      if (existsInSet && !willBeFreed) {
        skipped.push(rename.oldPath);
      } else {
        filteredRenames.push(rename);
      }
    }

    // Apply: set new paths first, then remove old ones
    for (const { newPath, token } of filteredRenames) {
      this.setTokenAtPath(set.tokens, newPath, token);
    }
    for (const { oldPath } of filteredRenames) {
      this.deleteTokenAtPath(set.tokens, oldPath);
    }
    await this.saveSet(setName);

    // Update alias references across all sets
    const pathMap = new Map(filteredRenames.map(r => [r.oldPath, r.newPath]));
    let aliasesUpdated = 0;
    const setsToSave = new Set<string>();
    for (const [sName, s] of this.sets) {
      const changed = this.updateBulkAliasRefs(s.tokens, pathMap);
      if (changed > 0) {
        aliasesUpdated += changed;
        setsToSave.add(sName);
      }
    }
    for (const sName of setsToSave) await this.saveSet(sName);

    this.rebuildFlatTokens();
    return { renamed: filteredRenames.length, skipped, aliasesUpdated };
  }

  // ----- Formula metadata -----

  /**
   * If a token's $value is a formula string, ensure $extensions.tokenmanager.formula
   * is set so Style Dictionary can output calc() expressions at export time.
   */
  private enrichFormulaExtension(token: Pick<Token, '$value' | '$extensions'>): Token {
    if (typeof token.$value === 'string' && isFormula(token.$value)) {
      const existing = token.$extensions;
      const tm = (existing?.tokenmanager as Record<string, unknown> | undefined) ?? {};
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

  // ----- Path helpers -----

  // ----- Group creation -----

  async createGroup(setName: string, groupPath: string): Promise<void> {
    const set = this.sets.get(setName);
    if (!set) throw new Error(`Set "${setName}" not found`);
    if (this.pathExistsAt(set.tokens, groupPath)) {
      throw new Error(`Path "${groupPath}" already exists`);
    }
    this.setGroupAtPath(set.tokens, groupPath, {});
    await this.saveSet(setName);
    this.rebuildFlatTokens();
    this.emit({ type: 'token-updated', setName });
  }

  private getObjectAtPath(tokens: TokenGroup, path: string): Record<string, any> | undefined {
    const parts = path.split('.');
    let current: any = tokens;
    for (const part of parts) {
      if (!current || typeof current !== 'object') return undefined;
      current = current[part];
    }
    return (current && typeof current === 'object' && !isDTCGToken(current)) ? current : undefined;
  }

  private setGroupAtPath(tokens: TokenGroup, path: string, group: Record<string, any>): void {
    const parts = path.split('.');
    let current: any = tokens;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]] || isDTCGToken(current[parts[i]])) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = group;
  }

  private getTokenAtPath(group: TokenGroup, tokenPath: string): Token | undefined {
    const parts = tokenPath.split('.');
    let current: any = group;
    for (const part of parts) {
      if (!current || typeof current !== 'object') return undefined;
      current = current[part];
    }
    return isDTCGToken(current) ? (current as Token) : undefined;
  }

  private setTokenAtPath(group: TokenGroup, tokenPath: string, token: Token): void {
    const parts = tokenPath.split('.');
    let current: any = group;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]] || typeof current[parts[i]] !== 'object' || isDTCGToken(current[parts[i]])) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = token;
  }

  private deleteTokenAtPath(group: TokenGroup, tokenPath: string): boolean {
    const parts = tokenPath.split('.');
    let current: any = group;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) return false;
      current = current[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (last in current) {
      delete current[last];
      return true;
    }
    return false;
  }

  private async saveSet(name: string): Promise<void> {
    const set = this.sets.get(name);
    if (!set) return;
    const filePath = path.join(this.dir, `${name}.tokens.json`);
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

  async shutdown(): Promise<void> {
    if (this._rebuildDebounceTimer !== null) {
      clearTimeout(this._rebuildDebounceTimer);
      this._rebuildDebounceTimer = null;
    }
    await this.watcher?.close();
  }
}

export interface ChangeEvent {
  type: 'set-added' | 'set-updated' | 'set-removed' | 'token-updated';
  setName: string;
  tokenPath?: string;
}
