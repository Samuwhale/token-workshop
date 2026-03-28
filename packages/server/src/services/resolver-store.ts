/**
 * ResolverStore — manages *.resolver.json files on disk.
 *
 * Analogous to TokenStore for .tokens.json files, this service handles
 * CRUD operations for DTCG v2025.10 resolver configuration files.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { watch } from 'chokidar';
import type {
  ResolverFile,
  ResolverInput,
  ResolverModifier,
  Token,
} from '@tokenmanager/core';
import {
  validateResolverFile,
  resolveResolverTokens,
  getDefaultResolverInput,
} from '@tokenmanager/core';
import type { TokenStore } from './token-store.js';

// ---------------------------------------------------------------------------
// Name validation
// ---------------------------------------------------------------------------

const VALID_NAME_RE = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/;

function validateName(name: string): string | null {
  if (!name) return 'Name is required.';
  if (!VALID_NAME_RE.test(name)) return 'Name must be alphanumeric (with dashes, underscores, and / for folders).';
  return null;
}

// ---------------------------------------------------------------------------
// ResolverStore
// ---------------------------------------------------------------------------

export interface ResolverMeta {
  name: string;
  description?: string;
  modifiers: Record<string, { contexts: string[]; default?: string }>;
}

export class ResolverStore {
  private dir: string;
  private resolvers: Map<string, ResolverFile> = new Map();
  private watcher: ReturnType<typeof watch> | null = null;
  private _writingFiles: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(dir: string) {
    this.dir = path.resolve(dir);
  }

  /** The root directory where resolver files are stored. */
  getDir(): string {
    return this.dir;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await this.loadAll();
    this.startWatching();
  }

  async shutdown(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  // -----------------------------------------------------------------------
  // Read
  // -----------------------------------------------------------------------

  list(): ResolverMeta[] {
    const result: ResolverMeta[] = [];
    for (const [name, file] of this.resolvers) {
      result.push({
        name,
        description: file.description,
        modifiers: this.extractModifierMeta(file),
      });
    }
    return result;
  }

  get(name: string): ResolverFile | undefined {
    return this.resolvers.get(name);
  }

  // -----------------------------------------------------------------------
  // Write
  // -----------------------------------------------------------------------

  async create(name: string, file: ResolverFile): Promise<void> {
    const nameErr = validateName(name);
    if (nameErr) throw Object.assign(new Error(nameErr), { statusCode: 400 });

    if (this.resolvers.has(name)) {
      throw Object.assign(new Error(`Resolver "${name}" already exists.`), { statusCode: 409 });
    }

    const validationErrors = validateResolverFile(file);
    if (validationErrors.length > 0) {
      throw Object.assign(new Error(validationErrors.join('; ')), { statusCode: 400 });
    }

    await this.writeToDisk(name, file);
    this.resolvers.set(name, file);
  }

  async update(name: string, file: ResolverFile): Promise<void> {
    if (!this.resolvers.has(name)) {
      throw Object.assign(new Error(`Resolver "${name}" not found.`), { statusCode: 404 });
    }

    const validationErrors = validateResolverFile(file);
    if (validationErrors.length > 0) {
      throw Object.assign(new Error(validationErrors.join('; ')), { statusCode: 400 });
    }

    await this.writeToDisk(name, file);
    this.resolvers.set(name, file);
  }

  async delete(name: string): Promise<boolean> {
    if (!this.resolvers.has(name)) return false;
    const filePath = this.nameToPath(name);
    this._startWriteGuard(filePath);
    try {
      await fs.unlink(filePath);
    } catch {
      // File may already be gone
    }
    this.resolvers.delete(name);
    return true;
  }

  // -----------------------------------------------------------------------
  // Resolution
  // -----------------------------------------------------------------------

  /**
   * Resolve tokens using a named resolver and the given modifier inputs.
   * Uses the TokenStore to load external token file references.
   */
  async resolve(
    name: string,
    input: ResolverInput,
    tokenStore: TokenStore,
  ): Promise<Record<string, Token>> {
    const file = this.resolvers.get(name);
    if (!file) {
      throw Object.assign(new Error(`Resolver "${name}" not found.`), { statusCode: 404 });
    }

    const loadExternal = async (filePath: string) => {
      // Strip .tokens.json suffix to get set name
      let setName = filePath;
      if (setName.endsWith('.tokens.json')) {
        setName = setName.slice(0, -'.tokens.json'.length);
      }
      const set = await tokenStore.getSet(setName);
      if (!set) {
        throw new Error(`Token set "${setName}" (from resolver $ref "${filePath}") not found.`);
      }
      return set.tokens;
    };

    return resolveResolverTokens(file, input, loadExternal);
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private extractModifierMeta(file: ResolverFile): Record<string, { contexts: string[]; default?: string }> {
    const meta: Record<string, { contexts: string[]; default?: string }> = {};
    if (!file.modifiers) return meta;
    for (const [name, mod] of Object.entries(file.modifiers)) {
      meta[name] = {
        contexts: Object.keys(mod.contexts),
        ...(mod.default ? { default: mod.default } : {}),
      };
    }
    return meta;
  }

  private nameToPath(name: string): string {
    return path.join(this.dir, `${name}.resolver.json`);
  }

  private pathToName(filePath: string): string | null {
    const rel = path.relative(this.dir, filePath);
    if (!rel.endsWith('.resolver.json')) return null;
    return rel.slice(0, -'.resolver.json'.length);
  }

  private async writeToDisk(name: string, file: ResolverFile): Promise<void> {
    const filePath = this.nameToPath(name);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    this._startWriteGuard(filePath);
    await fs.writeFile(filePath, JSON.stringify(file, null, 2));
  }

  private _startWriteGuard(filePath: string): void {
    const existing = this._writingFiles.get(filePath);
    if (existing) clearTimeout(existing);
    this._writingFiles.set(filePath, setTimeout(() => this._writingFiles.delete(filePath), 500));
  }

  private async loadAll(): Promise<void> {
    const files = await this.listResolverFiles();
    for (const filePath of files) {
      await this.loadFile(filePath);
    }
  }

  private async listResolverFiles(): Promise<string[]> {
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
        } else if (entry.name.endsWith('.resolver.json')) {
          results.push(path.join(dir, entry.name));
        }
      }
    };
    await walk(this.dir);
    return results;
  }

  private async loadFile(filePath: string): Promise<void> {
    const name = this.pathToName(filePath);
    if (!name) return;
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      const errors = validateResolverFile(data);
      if (errors.length > 0) {
        console.warn(`[ResolverStore] Invalid resolver file ${filePath}: ${errors.join('; ')}`);
        return;
      }
      this.resolvers.set(name, data as ResolverFile);
    } catch (err) {
      console.warn(`[ResolverStore] Failed to load ${filePath}:`, err);
    }
  }

  private startWatching(): void {
    this.watcher = watch(this.dir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200 },
    });

    this.watcher.on('add', (fp) => this.onFileChange(fp));
    this.watcher.on('change', (fp) => this.onFileChange(fp));
    this.watcher.on('unlink', (fp) => this.onFileRemove(fp));
  }

  private async onFileChange(filePath: string): Promise<void> {
    if (!filePath.endsWith('.resolver.json')) return;
    if (this._writingFiles.has(filePath)) return;
    await this.loadFile(filePath);
  }

  private onFileRemove(filePath: string): void {
    if (!filePath.endsWith('.resolver.json')) return;
    if (this._writingFiles.has(filePath)) return;
    const name = this.pathToName(filePath);
    if (name) this.resolvers.delete(name);
  }
}
