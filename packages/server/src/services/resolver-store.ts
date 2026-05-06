/**
 * ResolverStore — manages *.resolver.json files on disk.
 *
 * Analogous to TokenStore for .tokens.json files, this service handles
 * CRUD operations for DTCG v2025.10 resolver configuration files.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { watch } from "chokidar";
import type {
  ResolverFile,
  ResolverInput,
  ResolverModifier,
  ResolverSet,
  ResolverSource,
  ResolverResult,
} from "@token-workshop/core";
import {
  stableStringify,
  validateResolverFile,
  resolveResolverTokens,
} from "@token-workshop/core";
import type { TokenStore } from "./token-store.js";
import { PromiseChainLock } from "../utils/promise-chain-lock.js";
import { BadRequestError, ConflictError, NotFoundError } from "../errors.js";
import { parseJsonFile } from "../utils/json-file.js";

// ---------------------------------------------------------------------------
// Name validation
// ---------------------------------------------------------------------------

const VALID_NAME_RE = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/;
const TOKEN_FILE_SUFFIX = ".tokens.json";

function validateName(name: string): string | null {
  if (!name) return "Name is required.";
  if (!VALID_NAME_RE.test(name))
    return "Name must be alphanumeric (with dashes, underscores, and / for folders).";
  return null;
}

function stripTokenFileSuffix(ref: string): string {
  return ref.endsWith(TOKEN_FILE_SUFFIX)
    ? ref.slice(0, -TOKEN_FILE_SUFFIX.length)
    : ref;
}

function toTokenFileRef(collectionId: string): string {
  return `${collectionId}${TOKEN_FILE_SUFFIX}`;
}

function rewriteResolverSources(
  sources: ResolverSource[],
  rewriteCollectionId: (collectionId: string) => string | null,
): { sources: ResolverSource[]; changed: boolean } {
  let changed = false;
  const nextSources = sources.flatMap((source) => {
    if (
      !("$ref" in source) ||
      typeof source.$ref !== "string" ||
      source.$ref.startsWith("#/")
    ) {
      return [source];
    }

    const currentCollectionId = stripTokenFileSuffix(source.$ref);
    const nextCollectionId = rewriteCollectionId(currentCollectionId);
    if (nextCollectionId === currentCollectionId) {
      return [source];
    }

    changed = true;
    if (nextCollectionId === null) {
      return [];
    }

    return [{ ...source, $ref: toTokenFileRef(nextCollectionId) }];
  });

  return { sources: nextSources, changed };
}

function rewriteResolverFileCollectionReferences(
  file: ResolverFile,
  rewriteCollectionId: (collectionId: string) => string | null,
): { file: ResolverFile; changed: boolean } {
  const nextFile = structuredClone(file);
  let changed = false;

  if (nextFile.sets) {
    for (const entry of Object.values(nextFile.sets) as ResolverSet[]) {
      const rewritten = rewriteResolverSources(entry.sources, rewriteCollectionId);
      if (rewritten.changed) {
        entry.sources = rewritten.sources;
        changed = true;
      }
    }
  }

  if (nextFile.modifiers) {
    for (const modifier of Object.values(
      nextFile.modifiers,
    ) as ResolverModifier[]) {
      for (const [contextName, sources] of Object.entries(
        modifier.contexts,
      ) as Array<[string, ResolverSource[]]>) {
        const rewritten = rewriteResolverSources(sources, rewriteCollectionId);
        if (rewritten.changed) {
          modifier.contexts[contextName] = rewritten.sources;
          changed = true;
        }
      }
    }
  }

  return { file: nextFile, changed };
}

// ---------------------------------------------------------------------------
// ResolverStore
// ---------------------------------------------------------------------------

export interface ResolverMeta {
  name: string;
  description?: string;
  modifiers: Record<string, { contexts: string[]; default?: string }>;
  /** Collection ids referenced by this resolver's sources (external $ref entries). */
  referencedCollections: string[];
}

export interface ResolverCollectionDependencyMeta {
  name: string;
  referencedCollections: string[];
}

export interface ResolverStoreChangeEvent {
  type: "changed" | "removed";
  name: string;
}

export class ResolverStore {
  private dir: string;
  readonly lock = new PromiseChainLock();
  private resolvers: Map<string, ResolverFile> = new Map();
  private loadErrors: Map<string, { message: string; at: string }> = new Map();
  private loadErrorListeners = new Set<
    (name: string, message: string) => void
  >();
  private changeListeners = new Set<
    (event: ResolverStoreChangeEvent) => void
  >();
  private watcher: ReturnType<typeof watch> | null = null;
  private _writingFiles: Map<string, ReturnType<typeof setTimeout>> = new Map();
  /** Incremented each time a file is removed; lets in-flight loadFile calls detect stale results. */
  private _fileDeleteGen: Map<string, number> = new Map();

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

  startWriteGuard(absoluteFilePath: string): void {
    this._startWriteGuard(absoluteFilePath);
  }

  endWriteGuard(absoluteFilePath: string): void {
    this._clearWriteGuard(absoluteFilePath);
  }

  async reloadFile(
    filePath: string,
  ): Promise<"changed" | "removed" | "unchanged"> {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.dir, filePath);
    if (!absolutePath.endsWith(".resolver.json")) {
      return "unchanged";
    }

    return this.lock.withLock(async () => {
      try {
        const changed = await this.loadFile(absolutePath);
        return changed ? "changed" : "unchanged";
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          const name = this.pathToName(absolutePath);
          if (!name || !this.resolvers.has(name)) {
            return "unchanged";
          }
          this.resolvers.delete(name);
          this.loadErrors.delete(name);
          this.emitChange({ type: "removed", name });
          return "removed";
        }
        const name = this.pathToName(absolutePath);
        if (!name) {
          throw err;
        }
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[ResolverStore] Failed to load ${absolutePath}:`, err);
        this.emitLoadError(name, message);
        return "unchanged";
      }
    });
  }

  /**
   * Register a listener that fires whenever a resolver file fails to load
   * (parse error, validation error, or I/O error). Returns an unsubscribe fn.
   */
  onLoadError(fn: (name: string, message: string) => void): () => void {
    this.loadErrorListeners.add(fn);
    return () => {
      this.loadErrorListeners.delete(fn);
    };
  }

  onChange(fn: (event: ResolverStoreChangeEvent) => void): () => void {
    this.changeListeners.add(fn);
    return () => {
      this.changeListeners.delete(fn);
    };
  }

  /** Returns all resolver files that failed to load, keyed by resolver name. */
  getLoadErrors(): Map<string, { message: string; at: string }> {
    return new Map(this.loadErrors);
  }

  private emitLoadError(name: string, message: string): void {
    this.loadErrors.set(name, { message, at: new Date().toISOString() });
    for (const fn of this.loadErrorListeners) fn(name, message);
  }

  private emitChange(event: ResolverStoreChangeEvent): void {
    for (const fn of this.changeListeners) fn(event);
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
        referencedCollections: this.extractReferencedCollections(file),
      });
    }
    return result;
  }

  listCollectionDependencyMeta(): ResolverCollectionDependencyMeta[] {
    return Array.from(this.resolvers.entries()).map(([name, file]) => ({
      name,
      referencedCollections: this.extractReferencedCollections(file),
    }));
  }

  get(name: string): ResolverFile | undefined {
    return this.resolvers.get(name);
  }

  getAllFiles(): Record<string, ResolverFile> {
    return Object.fromEntries(
      Array.from(this.resolvers.entries()).map(([name, file]) => [
        name,
        structuredClone(file),
      ]),
    );
  }

  // -----------------------------------------------------------------------
  // Write
  // -----------------------------------------------------------------------

  async create(name: string, file: ResolverFile): Promise<void> {
    const nameErr = validateName(name);
    if (nameErr) throw new BadRequestError(nameErr);

    if (this.resolvers.has(name)) {
      throw new ConflictError(`Resolver "${name}" already exists.`);
    }

    const validationErrors = validateResolverFile(file);
    if (validationErrors.length > 0) {
      throw new BadRequestError(validationErrors.join("; "));
    }

    await this.writeToDisk(name, file);
    this.resolvers.set(name, file);
  }

  async update(name: string, file: ResolverFile): Promise<void> {
    if (!this.resolvers.has(name)) {
      throw new NotFoundError(`Resolver "${name}" not found.`);
    }

    const validationErrors = validateResolverFile(file);
    if (validationErrors.length > 0) {
      throw new BadRequestError(validationErrors.join("; "));
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
    } catch (err) {
      this._clearWriteGuard(filePath);
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      // File already gone — safe to continue
      this.resolvers.delete(name);
      return true;
    }
    this._clearWriteGuard(filePath);
    this.resolvers.delete(name);
    return true;
  }

  async renameCollectionReferences(
    oldCollectionId: string,
    newCollectionId: string,
  ): Promise<string[]> {
    return this.rewriteCollectionReferences((collectionId) =>
      collectionId === oldCollectionId ? newCollectionId : collectionId,
    );
  }

  async removeCollectionReferences(collectionId: string): Promise<string[]> {
    return this.rewriteCollectionReferences((candidate) =>
      candidate === collectionId ? null : candidate,
    );
  }

  async reset(): Promise<void> {
    const files = await this.listResolverFiles();
    for (const filePath of files) {
      this._startWriteGuard(filePath);
      try {
        await fs.rm(filePath, { force: true });
        await this.removeEmptyParentDirs(filePath);
      } finally {
        this._clearWriteGuard(filePath);
      }
    }

    this.resolvers.clear();
    this.loadErrors.clear();
    for (const timer of this._writingFiles.values()) clearTimeout(timer);
    this._writingFiles.clear();
    this._fileDeleteGen.clear();
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
  ): Promise<ResolverResult> {
    const file = this.resolvers.get(name);
    if (!file) {
      throw new NotFoundError(`Resolver "${name}" not found.`);
    }

    const loadExternal = async (filePath: string) => {
      // Strip .tokens.json suffix to get collection id
      let collectionId = filePath;
      if (collectionId.endsWith(".tokens.json")) {
        collectionId = collectionId.slice(0, -".tokens.json".length);
      }
      const collection = await tokenStore.getCollection(collectionId);
      if (!collection) {
        throw new Error(
          `Collection "${collectionId}" (from resolver $ref "${filePath}") not found.`,
        );
      }
      return collection.tokens;
    };

    return resolveResolverTokens(file, input, loadExternal);
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private extractReferencedCollections(file: ResolverFile): string[] {
    const collections = new Set<string>();

    const addFromSources = (sources: ResolverSource[]) => {
      for (const src of sources) {
        // Only external file refs (not internal pointer refs like "#/sets/base")
        if (
          "$ref" in src &&
          typeof src.$ref === "string" &&
          !src.$ref.startsWith("#/")
        ) {
          collections.add(stripTokenFileSuffix(src.$ref));
        }
      }
    };

    if (file.sets) {
      for (const rset of Object.values(file.sets) as ResolverSet[]) {
        addFromSources(rset.sources);
      }
    }
    if (file.modifiers) {
      for (const mod of Object.values(file.modifiers) as ResolverModifier[]) {
        for (const ctxSources of Object.values(
          mod.contexts,
        ) as ResolverSource[][]) {
          addFromSources(ctxSources);
        }
      }
    }

    return [...collections];
  }

  private async rewriteCollectionReferences(
    rewriteCollectionId: (collectionId: string) => string | null,
  ): Promise<string[]> {
    const changedResolvers: string[] = [];

    for (const [name, existing] of this.resolvers) {
      const rewritten = rewriteResolverFileCollectionReferences(
        existing,
        rewriteCollectionId,
      );
      if (!rewritten.changed) {
        continue;
      }

      await this.writeToDisk(name, rewritten.file);
      this.resolvers.set(name, rewritten.file);
      changedResolvers.push(name);
    }

    return changedResolvers.sort((left, right) => left.localeCompare(right));
  }

  private extractModifierMeta(
    file: ResolverFile,
  ): Record<string, { contexts: string[]; default?: string }> {
    const meta: Record<string, { contexts: string[]; default?: string }> = {};
    if (!file.modifiers) return meta;
    for (const [name, mod] of Object.entries(file.modifiers) as Array<
      [string, ResolverModifier]
    >) {
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
    if (!rel.endsWith(".resolver.json")) return null;
    return rel.slice(0, -".resolver.json".length);
  }

  private async removeEmptyParentDirs(filePath: string): Promise<void> {
    let dir = path.dirname(filePath);
    while (dir !== this.dir && dir.startsWith(this.dir)) {
      try {
        await fs.rmdir(dir);
      } catch {
        break;
      }
      dir = path.dirname(dir);
    }
  }

  /**
   * Write JSON to disk atomically: write to a .tmp file first, then rename.
   * fs.rename is atomic on the same filesystem, so the watcher never sees
   * a partially-written file. The write guard starts just before the
   * (instantaneous) rename, not before the (slow) writeFile.
   */
  private async writeToDisk(name: string, file: ResolverFile): Promise<void> {
    const filePath = this.nameToPath(name);
    const tmpPath = filePath + ".tmp";
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(tmpPath, JSON.stringify(file, null, 2));
    this._startWriteGuard(filePath);
    try {
      await fs.rename(tmpPath, filePath);
    } catch (err) {
      this._clearWriteGuard(filePath);
      await fs.unlink(tmpPath).catch(() => {});
      throw err;
    }
  }

  private _startWriteGuard(filePath: string): void {
    const existing = this._writingFiles.get(filePath);
    if (existing) clearTimeout(existing);
    // Fallback timeout only for memory-leak prevention — the watcher callback clears the guard first
    this._writingFiles.set(
      filePath,
      setTimeout(() => this._writingFiles.delete(filePath), 30_000),
    );
  }

  private _clearWriteGuard(filePath: string): void {
    const timer = this._writingFiles.get(filePath);
    if (timer) clearTimeout(timer);
    this._writingFiles.delete(filePath);
  }

  private async loadAll(): Promise<void> {
    const files = await this.listResolverFiles();
    for (const filePath of files) {
      try {
        await this.loadFile(filePath);
      } catch (err) {
        const name = this.pathToName(filePath);
        if (!name) continue;
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[ResolverStore] Failed to load ${filePath}:`, err);
        this.emitLoadError(name, message);
      }
    }
  }

  private async listResolverFiles(): Promise<string[]> {
    const results: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries: import("node:fs").Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (err) {
        console.error(
          `[ResolverStore] Failed to read directory "${dir}":`,
          err,
        );
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await walk(path.join(dir, entry.name));
        } else if (entry.name.endsWith(".resolver.json")) {
          results.push(path.join(dir, entry.name));
        }
      }
    };
    await walk(this.dir);
    return results;
  }

  private async loadFile(
    filePath: string,
    expectedDeleteGen?: number,
  ): Promise<boolean> {
    const name = this.pathToName(filePath);
    if (!name) return false;

    const previous = this.resolvers.get(name);
    const content = await fs.readFile(filePath, "utf-8");
    // If the file was removed while we were reading, discard the result so the
    // resolver is not re-added to memory after onFileRemove already deleted it.
    if (
      expectedDeleteGen !== undefined &&
      (this._fileDeleteGen.get(filePath) ?? 0) !== expectedDeleteGen
    ) {
      return false;
    }
    const data = parseJsonFile(content, {
      filePath,
      relativeTo: this.dir,
    });
    const errors = validateResolverFile(data as ResolverFile);
    if (errors.length > 0) {
      const message = errors.join("; ");
      console.warn(
        `[ResolverStore] Invalid resolver file ${filePath}: ${message}`,
      );
      this.emitLoadError(name, message);
      return false;
    }

    const next = data as ResolverFile;
    const previousSerialized = previous ? stableStringify(previous) : null;
    const nextSerialized = stableStringify(next);
    this.resolvers.set(name, next);
    // Clear any prior load error for this resolver on successful load
    this.loadErrors.delete(name);
    if (previousSerialized !== nextSerialized) {
      this.emitChange({ type: "changed", name });
      return true;
    }
    return false;
  }

  private startWatching(): void {
    this.watcher = watch(this.dir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200 },
    });

    this.watcher.on("add", (fp) => this.onFileChange(fp));
    this.watcher.on("change", (fp) => this.onFileChange(fp));
    this.watcher.on("unlink", (fp) => this.onFileRemove(fp));
  }

  private async onFileChange(filePath: string): Promise<void> {
    if (!filePath.endsWith(".resolver.json")) return;
    if (this._writingFiles.has(filePath)) {
      this._clearWriteGuard(filePath);
      return;
    }
    await this.lock.withLock(async () => {
      // Capture delete generation before the async load so we can discard stale results
      // if the file is removed while loadFile is in-flight (create-then-quickly-delete race).
      const genAtStart = this._fileDeleteGen.get(filePath) ?? 0;
      try {
        await this.loadFile(filePath, genAtStart);
      } catch (err) {
        const name = this.pathToName(filePath);
        if (!name) return;
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[ResolverStore] Failed to load ${filePath}:`, err);
        this.emitLoadError(name, message);
      }
    });
  }

  private onFileRemove(filePath: string): void {
    if (!filePath.endsWith(".resolver.json")) return;
    if (this._writingFiles.has(filePath)) {
      this._clearWriteGuard(filePath);
      return;
    }
    void this.lock.withLock(async () => {
      const name = this.pathToName(filePath);
      const existed = name ? this.resolvers.delete(name) : false;
      if (name) {
        this.loadErrors.delete(name);
      }
      // Bump the generation so any concurrent onFileChange loadFile will discard its result.
      this._fileDeleteGen.set(
        filePath,
        (this._fileDeleteGen.get(filePath) ?? 0) + 1,
      );
      if (name && existed) {
        this.emitChange({ type: "removed", name });
      }
    });
  }
}
