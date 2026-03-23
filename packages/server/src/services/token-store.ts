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
  TokenResolver,
} from '@tokenmanager/core';

export class TokenStore {
  private dir: string;
  private sets: Map<string, TokenSet> = new Map();
  private flatTokens: Map<string, { token: Token; setName: string }> = new Map();
  private resolver: TokenResolver | null = null;
  private watcher: ReturnType<typeof watch> | null = null;
  private changeListeners: Set<(event: ChangeEvent) => void> = new Set();

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
    const tokens = JSON.parse(content) as TokenGroup;
    const name = filename.replace('.tokens.json', '');
    this.sets.set(name, { name, tokens, filePath });
  }

  private startWatching(): void {
    this.watcher = watch(path.join(this.dir, '*.tokens.json'), {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200 },
    });

    this.watcher.on('change', async (filePath) => {
      const filename = path.basename(filePath as string);
      await this.loadSet(filename);
      this.rebuildFlatTokens();
      this.emit({ type: 'set-updated', setName: filename.replace('.tokens.json', '') });
    });

    this.watcher.on('add', async (filePath) => {
      const filename = path.basename(filePath as string);
      await this.loadSet(filename);
      this.rebuildFlatTokens();
      this.emit({ type: 'set-added', setName: filename.replace('.tokens.json', '') });
    });

    this.watcher.on('unlink', (filePath) => {
      const filename = path.basename(filePath as string);
      const name = filename.replace('.tokens.json', '');
      this.sets.delete(name);
      this.rebuildFlatTokens();
      this.emit({ type: 'set-removed', setName: name });
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
  ): void {
    const inheritedType = group.$type;
    for (const [key, value] of Object.entries(group)) {
      if (key.startsWith('$')) continue;
      const fullPath = prefix ? `${prefix}.${key}` : key;
      if (isDTCGToken(value)) {
        const token = value as Token;
        const effective = !token.$type && inheritedType
          ? { ...token, $type: inheritedType as TokenType }
          : token;
        out.set(fullPath, { token: effective, setName });
      } else if (typeof value === 'object' && value !== null) {
        this.flattenTokens(value as TokenGroup, fullPath, setName, out);
      }
    }
  }

  // ----- CRUD operations -----

  async getSets(): Promise<string[]> {
    return Array.from(this.sets.keys());
  }

  async getSet(name: string): Promise<TokenSet | undefined> {
    return this.sets.get(name);
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

  async getToken(setName: string, tokenPath: string): Promise<Token | undefined> {
    const set = this.sets.get(setName);
    if (!set) return undefined;
    return this.getTokenAtPath(set.tokens, tokenPath);
  }

  async createToken(setName: string, tokenPath: string, token: Token): Promise<void> {
    if (!/^[a-zA-Z0-9_-]+$/.test(setName)) {
      throw new Error(`Invalid set name "${setName}". Only alphanumeric characters, dashes, and underscores are allowed.`);
    }
    let set = this.sets.get(setName);
    if (!set) {
      set = await this.createSet(setName);
    }
    this.setTokenAtPath(set.tokens, tokenPath, token);
    await this.saveSet(setName);
    this.rebuildFlatTokens();
  }

  async updateToken(setName: string, tokenPath: string, token: Partial<Token>): Promise<void> {
    const set = this.sets.get(setName);
    if (!set) throw new Error(`Set "${setName}" not found`);
    const existing = this.getTokenAtPath(set.tokens, tokenPath);
    if (!existing) throw new Error(`Token "${tokenPath}" not found in set "${setName}"`);
    Object.assign(existing, token);
    await this.saveSet(setName);
    this.rebuildFlatTokens();
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

  /** Get all token groups (the raw data) keyed by set name */
  getAllTokenData(): Record<string, TokenGroup> {
    const result: Record<string, TokenGroup> = {};
    for (const [name, set] of this.sets) {
      result[name] = set.tokens;
    }
    return result;
  }

  // ----- Path helpers -----

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
    await this.watcher?.close();
  }
}

export interface ChangeEvent {
  type: 'set-added' | 'set-updated' | 'set-removed' | 'token-updated';
  setName: string;
  tokenPath?: string;
}
