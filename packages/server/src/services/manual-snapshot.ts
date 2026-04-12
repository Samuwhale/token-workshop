import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { flattenTokenGroup } from "@tokenmanager/core";
import type {
  ResolverFile,
  ThemeDimension,
  Token,
  TokenGenerator,
  TokenGroup,
} from "@tokenmanager/core";
import type { TokenStore } from "./token-store.js";
import type { ResolverStore } from "./resolver-store.js";
import type { GeneratorService } from "./generator-service.js";
import type { DimensionsStore } from "../routes/themes.js";
import { stableStringify } from "./stable-stringify.js";
import { NotFoundError } from "../errors.js";
import { PromiseChainLock } from "../utils/promise-chain-lock.js";
import { setTokenAtPath } from "./token-tree-utils.js";

export interface ManualSnapshotToken {
  $value: unknown;
  $type?: string;
  $description?: string;
  $extensions?: Record<string, unknown>;
}

type SnapshotTokenSets = Record<string, Record<string, ManualSnapshotToken>>;
type SnapshotResolvers = Record<string, ResolverFile>;
type SnapshotGenerators = Record<string, TokenGenerator>;

interface RestoreJournal {
  snapshotId: string;
  snapshotLabel: string;
  data: SnapshotTokenSets;
  dimensions: ThemeDimension[];
  resolvers: SnapshotResolvers;
  generators: SnapshotGenerators;
  completedSets: string[];
  deleteSetNames: string[];
  completedSetDeletes: string[];
  themesRestored: boolean;
  completedResolvers: string[];
  deleteResolverNames: string[];
  completedResolverDeletes: string[];
  completedGenerators: string[];
  deleteGeneratorIds: string[];
  completedGeneratorDeletes: string[];
  failedSets?: Record<string, number>;
  failedSetDeletes?: Record<string, number>;
  failedThemes?: number;
  failedResolvers?: Record<string, number>;
  failedResolverDeletes?: Record<string, number>;
  failedGenerators?: Record<string, number>;
  failedGeneratorDeletes?: Record<string, number>;
}

export interface ManualSnapshotEntry {
  id: string;
  label: string;
  timestamp: string;
  /** Flat map: setName -> (tokenPath -> token) */
  data: SnapshotTokenSets;
  dimensions: ThemeDimension[];
  resolvers: SnapshotResolvers;
  generators: SnapshotGenerators;
}

export interface ManualSnapshotSummary {
  id: string;
  label: string;
  timestamp: string;
  tokenCount: number;
  setCount: number;
  dimensionCount: number;
  resolverCount: number;
  generatorCount: number;
}

export interface TokenDiff {
  path: string;
  set: string;
  status: "added" | "modified" | "removed";
  before?: ManualSnapshotToken;
  after?: ManualSnapshotToken;
}

export interface WorkspaceDiff {
  kind: "themes" | "resolver" | "generator";
  id: string;
  label: string;
  status: "added" | "modified" | "removed";
}

export interface ManualSnapshotDiff {
  diffs: TokenDiff[];
  workspaceDiffs: WorkspaceDiff[];
}

const MAX_SNAPSHOTS = 20;
const MAX_RECOVERY_RETRIES = 3;
const THEMES_WORKSPACE_ID = "$themes";

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inflateSnapshotTokens(
  flatTokens: Record<string, ManualSnapshotToken>,
): TokenGroup {
  const tokens: TokenGroup = {};
  for (const [tokenPath, token] of Object.entries(flatTokens)) {
    setTokenAtPath(tokens, tokenPath, structuredClone(token as Token));
  }
  return tokens;
}

function cloneResolvers(resolvers: SnapshotResolvers): SnapshotResolvers {
  return structuredClone(resolvers);
}

function cloneGenerators(generators: SnapshotGenerators): SnapshotGenerators {
  return structuredClone(generators);
}

function normalizeSnapshotEntry(raw: unknown): ManualSnapshotEntry {
  if (!isRecord(raw)) {
    throw new Error("Snapshot entry must be an object");
  }

  return {
    id: typeof raw.id === "string" ? raw.id : randomUUID(),
    label: typeof raw.label === "string" ? raw.label : "Snapshot",
    timestamp:
      typeof raw.timestamp === "string"
        ? raw.timestamp
        : new Date().toISOString(),
    data: isRecord(raw.data) ? (raw.data as SnapshotTokenSets) : {},
    dimensions: Array.isArray(raw.dimensions)
      ? structuredClone(raw.dimensions as ThemeDimension[])
      : [],
    resolvers: isRecord(raw.resolvers)
      ? cloneResolvers(raw.resolvers as SnapshotResolvers)
      : {},
    generators: isRecord(raw.generators)
      ? cloneGenerators(raw.generators as SnapshotGenerators)
      : {},
  };
}

function normalizeRestoreJournal(raw: unknown): RestoreJournal {
  if (!isRecord(raw)) {
    throw new Error("Restore journal must be an object");
  }

  const completedSetDeletes = Array.isArray(raw.completedSetDeletes)
    ? structuredClone(raw.completedSetDeletes as string[])
    : Array.isArray(raw.completedDeletes)
      ? structuredClone(raw.completedDeletes as string[])
      : [];

  return {
    snapshotId: typeof raw.snapshotId === "string" ? raw.snapshotId : "",
    snapshotLabel:
      typeof raw.snapshotLabel === "string" ? raw.snapshotLabel : "Snapshot",
    data: isRecord(raw.data) ? (raw.data as SnapshotTokenSets) : {},
    dimensions: Array.isArray(raw.dimensions)
      ? structuredClone(raw.dimensions as ThemeDimension[])
      : [],
    resolvers: isRecord(raw.resolvers)
      ? cloneResolvers(raw.resolvers as SnapshotResolvers)
      : {},
    generators: isRecord(raw.generators)
      ? cloneGenerators(raw.generators as SnapshotGenerators)
      : {},
    completedSets: Array.isArray(raw.completedSets)
      ? structuredClone(raw.completedSets as string[])
      : [],
    deleteSetNames: Array.isArray(raw.deleteSetNames)
      ? structuredClone(raw.deleteSetNames as string[])
      : [],
    completedSetDeletes,
    themesRestored: raw.themesRestored === true,
    completedResolvers: Array.isArray(raw.completedResolvers)
      ? structuredClone(raw.completedResolvers as string[])
      : [],
    deleteResolverNames: Array.isArray(raw.deleteResolverNames)
      ? structuredClone(raw.deleteResolverNames as string[])
      : [],
    completedResolverDeletes: Array.isArray(raw.completedResolverDeletes)
      ? structuredClone(raw.completedResolverDeletes as string[])
      : [],
    completedGenerators: Array.isArray(raw.completedGenerators)
      ? structuredClone(raw.completedGenerators as string[])
      : [],
    deleteGeneratorIds: Array.isArray(raw.deleteGeneratorIds)
      ? structuredClone(raw.deleteGeneratorIds as string[])
      : [],
    completedGeneratorDeletes: Array.isArray(raw.completedGeneratorDeletes)
      ? structuredClone(raw.completedGeneratorDeletes as string[])
      : [],
    failedSets: isRecord(raw.failedSets)
      ? structuredClone(raw.failedSets as Record<string, number>)
      : {},
    failedSetDeletes: isRecord(raw.failedSetDeletes)
      ? structuredClone(raw.failedSetDeletes as Record<string, number>)
      : {},
    failedThemes:
      typeof raw.failedThemes === "number" ? raw.failedThemes : 0,
    failedResolvers: isRecord(raw.failedResolvers)
      ? structuredClone(raw.failedResolvers as Record<string, number>)
      : {},
    failedResolverDeletes: isRecord(raw.failedResolverDeletes)
      ? structuredClone(raw.failedResolverDeletes as Record<string, number>)
      : {},
    failedGenerators: isRecord(raw.failedGenerators)
      ? structuredClone(raw.failedGenerators as Record<string, number>)
      : {},
    failedGeneratorDeletes: isRecord(raw.failedGeneratorDeletes)
      ? structuredClone(raw.failedGeneratorDeletes as Record<string, number>)
      : {},
  };
}

function listWorkspaceDiffs(
  before: Pick<ManualSnapshotEntry, "dimensions" | "resolvers" | "generators">,
  after: Pick<ManualSnapshotEntry, "dimensions" | "resolvers" | "generators">,
): WorkspaceDiff[] {
  const diffs: WorkspaceDiff[] = [];

  if (stableStringify(before.dimensions) !== stableStringify(after.dimensions)) {
    diffs.push({
      kind: "themes",
      id: THEMES_WORKSPACE_ID,
      label: "Theme dimensions",
      status:
        before.dimensions.length === 0
          ? "added"
          : after.dimensions.length === 0
            ? "removed"
            : "modified",
    });
  }

  const resolverNames = new Set([
    ...Object.keys(before.resolvers),
    ...Object.keys(after.resolvers),
  ]);
  for (const name of resolverNames) {
    const beforeResolver = before.resolvers[name];
    const afterResolver = after.resolvers[name];
    if (!beforeResolver && afterResolver) {
      diffs.push({
        kind: "resolver",
        id: name,
        label: name,
        status: "added",
      });
      continue;
    }
    if (beforeResolver && !afterResolver) {
      diffs.push({
        kind: "resolver",
        id: name,
        label: name,
        status: "removed",
      });
      continue;
    }
    if (
      beforeResolver &&
      afterResolver &&
      stableStringify(beforeResolver) !== stableStringify(afterResolver)
    ) {
      diffs.push({
        kind: "resolver",
        id: name,
        label: name,
        status: "modified",
      });
    }
  }

  const generatorIds = new Set([
    ...Object.keys(before.generators),
    ...Object.keys(after.generators),
  ]);
  for (const id of generatorIds) {
    const beforeGenerator = before.generators[id];
    const afterGenerator = after.generators[id];
    const label =
      beforeGenerator?.name ?? afterGenerator?.name ?? `Generator ${id}`;
    if (!beforeGenerator && afterGenerator) {
      diffs.push({
        kind: "generator",
        id,
        label,
        status: "added",
      });
      continue;
    }
    if (beforeGenerator && !afterGenerator) {
      diffs.push({
        kind: "generator",
        id,
        label,
        status: "removed",
      });
      continue;
    }
    if (
      beforeGenerator &&
      afterGenerator &&
      stableStringify(beforeGenerator) !== stableStringify(afterGenerator)
    ) {
      diffs.push({
        kind: "generator",
        id,
        label,
        status: "modified",
      });
    }
  }

  return diffs.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind.localeCompare(right.kind);
    }
    return left.label.localeCompare(right.label);
  });
}

export class ManualSnapshotStore {
  private filePath: string;
  private journalPath: string;
  private snapshots: ManualSnapshotEntry[] = [];
  private loadPromise: Promise<void> | null = null;
  private lock = new PromiseChainLock();

  constructor(tokenDir: string) {
    const tmDir = path.join(path.resolve(tokenDir), ".tokenmanager");
    this.filePath = path.join(tmDir, "snapshots.json");
    this.journalPath = path.join(tmDir, "restore-journal.json");
  }

  private ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = fs
        .readFile(this.filePath, "utf-8")
        .then((raw) =>
          JSON.parse(raw).map((entry: unknown) => normalizeSnapshotEntry(entry)),
        )
        .then((entries) => {
          this.snapshots = entries;
        })
        .catch(() => {
          this.snapshots = [];
        });
    }
    return this.loadPromise;
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.snapshots, null, 2), "utf-8");
    await fs.rename(tmp, this.filePath);
  }

  private async writeRestoreJournal(journal: RestoreJournal): Promise<void> {
    await fs.mkdir(path.dirname(this.journalPath), { recursive: true });
    const tmp = `${this.journalPath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(journal, null, 2), "utf-8");
    await fs.rename(tmp, this.journalPath);
  }

  private async deleteRestoreJournal(): Promise<void> {
    await fs.unlink(this.journalPath).catch(() => {});
  }

  private async cleanupStoreDir(): Promise<void> {
    await fs.rmdir(path.dirname(this.filePath)).catch(() => {});
  }

  private async captureTokenSets(
    tokenStore: TokenStore,
  ): Promise<SnapshotTokenSets> {
    const sets = await tokenStore.getSets();
    const data: SnapshotTokenSets = {};

    for (const setName of sets) {
      const setObj = await tokenStore.getSet(setName);
      if (!setObj) {
        continue;
      }
      const flat: Record<string, ManualSnapshotToken> = {};
      for (const [tokenPath, token] of flattenTokenGroup(setObj.tokens)) {
        flat[tokenPath] = {
          $value: token.$value,
          $type: token.$type,
          $description: token.$description,
          $extensions: token.$extensions,
        };
      }
      data[setName] = flat;
    }

    return data;
  }

  private async captureResolvers(
    resolverStore: ResolverStore,
  ): Promise<SnapshotResolvers> {
    return resolverStore.lock.withLock(async () => resolverStore.getAllFiles());
  }

  private captureCurrentResolvers(
    resolverStore: ResolverStore,
  ): Promise<SnapshotResolvers> {
    return this.captureResolvers(resolverStore);
  }

  private async captureCurrentState(
    tokenStore: TokenStore,
    dimensionsStore: DimensionsStore,
    resolverStore: ResolverStore,
    generatorService: GeneratorService,
  ): Promise<ManualSnapshotEntry> {
    const [data, dimensions, resolvers, generators] = await Promise.all([
      this.captureTokenSets(tokenStore),
      dimensionsStore.withLock(async (dims) => ({
        dims,
        result: structuredClone(dims),
      })),
      this.captureCurrentResolvers(resolverStore),
      generatorService.getAllById(),
    ]);

    return {
      id: "",
      label: "",
      timestamp: "",
      data,
      dimensions,
      resolvers,
      generators,
    };
  }

  save(
    label: string,
    tokenStore: TokenStore,
    dimensionsStore: DimensionsStore,
    resolverStore: ResolverStore,
    generatorService: GeneratorService,
  ): Promise<ManualSnapshotEntry> {
    return this.lock.withLock(async () => {
      await this.ensureLoaded();

      const current = await this.captureCurrentState(
        tokenStore,
        dimensionsStore,
        resolverStore,
        generatorService,
      );

      const entry: ManualSnapshotEntry = {
        id: randomUUID(),
        label,
        timestamp: new Date().toISOString(),
        data: current.data,
        dimensions: current.dimensions,
        resolvers: current.resolvers,
        generators: current.generators,
      };

      this.snapshots.push(entry);
      if (this.snapshots.length > MAX_SNAPSHOTS) {
        this.snapshots = this.snapshots.slice(
          this.snapshots.length - MAX_SNAPSHOTS,
        );
      }

      await this.persist();
      return entry;
    });
  }

  async list(): Promise<ManualSnapshotSummary[]> {
    await this.ensureLoaded();
    return this.snapshots
      .slice()
      .reverse()
      .map((snapshot) => ({
        id: snapshot.id,
        label: snapshot.label,
        timestamp: snapshot.timestamp,
        tokenCount: Object.values(snapshot.data).reduce(
          (total, setTokens) => total + Object.keys(setTokens).length,
          0,
        ),
        setCount: Object.keys(snapshot.data).length,
        dimensionCount: snapshot.dimensions.length,
        resolverCount: Object.keys(snapshot.resolvers).length,
        generatorCount: Object.keys(snapshot.generators).length,
      }));
  }

  async get(id: string): Promise<ManualSnapshotEntry | undefined> {
    await this.ensureLoaded();
    return this.snapshots.find((snapshot) => snapshot.id === id);
  }

  reset(): Promise<void> {
    return this.lock.withLock(async () => {
      await this.ensureLoaded();
      await fs.rm(this.filePath, { force: true });
      await fs.rm(this.journalPath, { force: true });
      this.snapshots = [];
      await this.cleanupStoreDir();
    });
  }

  delete(id: string): Promise<boolean> {
    return this.lock.withLock(async () => {
      await this.ensureLoaded();
      const before = this.snapshots.length;
      this.snapshots = this.snapshots.filter((snapshot) => snapshot.id !== id);
      if (this.snapshots.length < before) {
        await this.persist();
        return true;
      }
      return false;
    });
  }

  async diffSnapshots(idA: string, idB: string): Promise<ManualSnapshotDiff> {
    await this.ensureLoaded();
    const snapshotA = this.snapshots.find((snapshot) => snapshot.id === idA);
    if (!snapshotA) {
      throw new NotFoundError(`Snapshot "${idA}" not found`);
    }
    const snapshotB = this.snapshots.find((snapshot) => snapshot.id === idB);
    if (!snapshotB) {
      throw new NotFoundError(`Snapshot "${idB}" not found`);
    }

    const sets = new Set([
      ...Object.keys(snapshotA.data),
      ...Object.keys(snapshotB.data),
    ]);
    const diffs: TokenDiff[] = [];

    for (const setName of sets) {
      const beforeSet = snapshotA.data[setName] ?? {};
      const afterSet = snapshotB.data[setName] ?? {};
      const allPaths = new Set([
        ...Object.keys(beforeSet),
        ...Object.keys(afterSet),
      ]);
      for (const tokenPath of allPaths) {
        const before = beforeSet[tokenPath];
        const after = afterSet[tokenPath];
        if (!before && after) {
          diffs.push({ path: tokenPath, set: setName, status: "added", after });
        } else if (before && !after) {
          diffs.push({
            path: tokenPath,
            set: setName,
            status: "removed",
            before,
          });
        } else if (
          before &&
          after &&
          stableStringify(before) !== stableStringify(after)
        ) {
          diffs.push({
            path: tokenPath,
            set: setName,
            status: "modified",
            before,
            after,
          });
        }
      }
    }

    return {
      diffs,
      workspaceDiffs: listWorkspaceDiffs(snapshotA, snapshotB),
    };
  }

  async diff(
    id: string,
    tokenStore: TokenStore,
    dimensionsStore: DimensionsStore,
    resolverStore: ResolverStore,
    generatorService: GeneratorService,
  ): Promise<ManualSnapshotDiff> {
    await this.ensureLoaded();
    const snapshot = this.snapshots.find((entry) => entry.id === id);
    if (!snapshot) {
      throw new NotFoundError(`Snapshot "${id}" not found`);
    }

    const current = await this.captureCurrentState(
      tokenStore,
      dimensionsStore,
      resolverStore,
      generatorService,
    );

    const sets = new Set([
      ...Object.keys(snapshot.data),
      ...Object.keys(current.data),
    ]);
    const diffs: TokenDiff[] = [];

    for (const setName of sets) {
      const savedSet = snapshot.data[setName] ?? {};
      const currentSet = current.data[setName] ?? {};
      const allPaths = new Set([
        ...Object.keys(savedSet),
        ...Object.keys(currentSet),
      ]);
      for (const tokenPath of allPaths) {
        const before = savedSet[tokenPath];
        const after = currentSet[tokenPath];
        if (!before && after) {
          diffs.push({ path: tokenPath, set: setName, status: "added", after });
        } else if (before && !after) {
          diffs.push({
            path: tokenPath,
            set: setName,
            status: "removed",
            before,
          });
        } else if (
          before &&
          after &&
          stableStringify(before) !== stableStringify(after)
        ) {
          diffs.push({
            path: tokenPath,
            set: setName,
            status: "modified",
            before,
            after,
          });
        }
      }
    }

    return {
      diffs,
      workspaceDiffs: listWorkspaceDiffs(snapshot, current),
    };
  }

  private async restoreSet(
    tokenStore: TokenStore,
    setName: string,
    flatTokens: Record<string, ManualSnapshotToken>,
  ): Promise<void> {
    const set = await tokenStore.getSet(setName);
    if (!set) {
      await tokenStore.createSet(setName, {});
    }
    await tokenStore.replaceSetTokens(setName, inflateSnapshotTokens(flatTokens));
  }

  private async restoreThemes(
    dimensionsStore: DimensionsStore,
    dimensions: ThemeDimension[],
  ): Promise<void> {
    await dimensionsStore.withLock(async () => ({
      dims: structuredClone(dimensions),
      result: undefined,
    }));
  }

  private async restoreResolver(
    resolverStore: ResolverStore,
    name: string,
    file: ResolverFile,
  ): Promise<void> {
    const existing = resolverStore.get(name);
    if (existing) {
      await resolverStore.update(name, file);
      return;
    }
    await resolverStore.create(name, file);
  }

  private async restoreGenerator(
    generatorService: GeneratorService,
    generator: TokenGenerator,
  ): Promise<void> {
    await generatorService.restore(generator);
  }

  private async listSetsOutsideSnapshot(
    tokenStore: TokenStore,
    snapshotData: SnapshotTokenSets,
  ): Promise<string[]> {
    const snapshotSets = new Set(Object.keys(snapshotData));
    const currentSets = await tokenStore.getSets();
    return currentSets.filter((setName) => !snapshotSets.has(setName));
  }

  private async listResolversOutsideSnapshot(
    resolverStore: ResolverStore,
    snapshotResolvers: SnapshotResolvers,
  ): Promise<string[]> {
    const currentResolvers = await this.captureCurrentResolvers(resolverStore);
    return Object.keys(currentResolvers).filter(
      (name) => !(name in snapshotResolvers),
    );
  }

  private async listGeneratorsOutsideSnapshot(
    generatorService: GeneratorService,
    snapshotGenerators: SnapshotGenerators,
  ): Promise<string[]> {
    const currentGenerators = await generatorService.getAllById();
    return Object.keys(currentGenerators).filter(
      (id) => !(id in snapshotGenerators),
    );
  }

  restore(
    id: string,
    tokenStore: TokenStore,
    dimensionsStore: DimensionsStore,
    resolverStore: ResolverStore,
    generatorService: GeneratorService,
  ): Promise<{
    restoredSets: string[];
    deletedSets: string[];
    restoredThemes: boolean;
    restoredResolvers: string[];
    deletedResolvers: string[];
    restoredGenerators: string[];
    deletedGenerators: string[];
  }> {
    return this.lock.withLock(async () => {
      await this.ensureLoaded();
      const snapshot = this.snapshots.find((entry) => entry.id === id);
      if (!snapshot) {
        throw new NotFoundError(`Snapshot "${id}" not found`);
      }

      const [deleteSetNames, deleteResolverNames, deleteGeneratorIds] =
        await Promise.all([
          this.listSetsOutsideSnapshot(tokenStore, snapshot.data),
          this.listResolversOutsideSnapshot(resolverStore, snapshot.resolvers),
          this.listGeneratorsOutsideSnapshot(
            generatorService,
            snapshot.generators,
          ),
        ]);

      const journal: RestoreJournal = {
        snapshotId: snapshot.id,
        snapshotLabel: snapshot.label,
        data: snapshot.data,
        dimensions: structuredClone(snapshot.dimensions),
        resolvers: cloneResolvers(snapshot.resolvers),
        generators: cloneGenerators(snapshot.generators),
        completedSets: [],
        deleteSetNames,
        completedSetDeletes: [],
        themesRestored: false,
        completedResolvers: [],
        deleteResolverNames,
        completedResolverDeletes: [],
        completedGenerators: [],
        deleteGeneratorIds,
        completedGeneratorDeletes: [],
      };
      await this.writeRestoreJournal(journal);

      const restoredSets: string[] = [];
      for (const [setName, flatTokens] of Object.entries(snapshot.data)) {
        await this.restoreSet(tokenStore, setName, flatTokens);
        restoredSets.push(setName);
        journal.completedSets.push(setName);
        await this.writeRestoreJournal(journal);
      }

      await resolverStore.lock.withLock(async () => {
        await this.restoreThemes(dimensionsStore, snapshot.dimensions);
        journal.themesRestored = true;
        await this.writeRestoreJournal(journal);

        for (const [name, file] of Object.entries(snapshot.resolvers)) {
          await this.restoreResolver(resolverStore, name, file);
          journal.completedResolvers.push(name);
          await this.writeRestoreJournal(journal);
        }

        for (const name of deleteResolverNames) {
          await resolverStore.delete(name);
          journal.completedResolverDeletes.push(name);
          await this.writeRestoreJournal(journal);
        }
      });

      const restoredGenerators: string[] = [];
      for (const generator of Object.values(snapshot.generators)) {
        await this.restoreGenerator(generatorService, generator);
        restoredGenerators.push(generator.id);
        journal.completedGenerators.push(generator.id);
        await this.writeRestoreJournal(journal);
      }

      const deletedGenerators: string[] = [];
      for (const generatorId of deleteGeneratorIds) {
        await generatorService.delete(generatorId);
        deletedGenerators.push(generatorId);
        journal.completedGeneratorDeletes.push(generatorId);
        await this.writeRestoreJournal(journal);
      }

      const deletedSets: string[] = [];
      for (const setName of deleteSetNames) {
        await tokenStore.deleteSet(setName);
        deletedSets.push(setName);
        journal.completedSetDeletes.push(setName);
        await this.writeRestoreJournal(journal);
      }

      await this.deleteRestoreJournal();

      return {
        restoredSets,
        deletedSets,
        restoredThemes: true,
        restoredResolvers: Object.keys(snapshot.resolvers),
        deletedResolvers: deleteResolverNames,
        restoredGenerators,
        deletedGenerators,
      };
    });
  }

  async recoverPendingRestore(
    tokenStore: TokenStore,
    dimensionsStore: DimensionsStore,
    resolverStore: ResolverStore,
    generatorService: GeneratorService,
  ): Promise<void> {
    let journal: RestoreJournal;
    try {
      const raw = await fs.readFile(this.journalPath, "utf-8");
      journal = normalizeRestoreJournal(JSON.parse(raw));
    } catch {
      return;
    }

    const pendingSets = Object.keys(journal.data).filter(
      (setName) => !journal.completedSets.includes(setName),
    );
    const pendingSetDeletes = journal.deleteSetNames.filter(
      (setName) => !journal.completedSetDeletes.includes(setName),
    );
    const pendingResolvers = Object.keys(journal.resolvers).filter(
      (name) => !journal.completedResolvers.includes(name),
    );
    const pendingResolverDeletes = journal.deleteResolverNames.filter(
      (name) => !journal.completedResolverDeletes.includes(name),
    );
    const pendingGenerators = Object.keys(journal.generators).filter(
      (id) => !journal.completedGenerators.includes(id),
    );
    const pendingGeneratorDeletes = journal.deleteGeneratorIds.filter(
      (id) => !journal.completedGeneratorDeletes.includes(id),
    );

    if (
      pendingSets.length === 0 &&
      pendingSetDeletes.length === 0 &&
      journal.themesRestored &&
      pendingResolvers.length === 0 &&
      pendingResolverDeletes.length === 0 &&
      pendingGenerators.length === 0 &&
      pendingGeneratorDeletes.length === 0
    ) {
      console.warn(
        `[ManualSnapshotStore] Stale restore journal for "${journal.snapshotLabel}" found; all restore steps are already complete — cleaning up`,
      );
      await this.deleteRestoreJournal();
      return;
    }

    console.warn(
      `[ManualSnapshotStore] Recovering incomplete restore of snapshot "${journal.snapshotLabel}" (${journal.snapshotId})`,
    );

    let allResolved = true;

    for (const setName of pendingSets) {
      const retries = journal.failedSets?.[setName] ?? 0;
      if (retries >= MAX_RECOVERY_RETRIES) {
        console.error(
          `[ManualSnapshotStore] Set "${setName}" has failed recovery ${retries} time(s) — quarantining. Manual intervention required.`,
        );
        journal.completedSets.push(setName);
        await this.writeRestoreJournal(journal);
        continue;
      }

      try {
        await this.restoreSet(tokenStore, setName, journal.data[setName]);
        journal.completedSets.push(setName);
        await this.writeRestoreJournal(journal);
      } catch (err) {
        console.error(
          `[ManualSnapshotStore] Recovery failed for set "${setName}" (attempt ${retries + 1}/${MAX_RECOVERY_RETRIES}):`,
          err,
        );
        journal.failedSets = {
          ...(journal.failedSets ?? {}),
          [setName]: retries + 1,
        };
        await this.writeRestoreJournal(journal);
        allResolved = false;
      }
    }

    await resolverStore.lock.withLock(async () => {
      if (!journal.themesRestored) {
        const retries = journal.failedThemes ?? 0;
        if (retries >= MAX_RECOVERY_RETRIES) {
          console.error(
            `[ManualSnapshotStore] Theme restore has failed ${retries} time(s) — quarantining. Manual intervention required.`,
          );
          journal.themesRestored = true;
          await this.writeRestoreJournal(journal);
        } else {
          try {
            await this.restoreThemes(dimensionsStore, journal.dimensions);
            journal.themesRestored = true;
            await this.writeRestoreJournal(journal);
          } catch (err) {
            console.error(
              `[ManualSnapshotStore] Theme recovery failed (attempt ${retries + 1}/${MAX_RECOVERY_RETRIES}):`,
              err,
            );
            journal.failedThemes = retries + 1;
            await this.writeRestoreJournal(journal);
            allResolved = false;
          }
        }
      }

      for (const name of pendingResolvers) {
        const retries = journal.failedResolvers?.[name] ?? 0;
        if (retries >= MAX_RECOVERY_RETRIES) {
          console.error(
            `[ManualSnapshotStore] Resolver "${name}" has failed recovery ${retries} time(s) — quarantining. Manual intervention required.`,
          );
          journal.completedResolvers.push(name);
          await this.writeRestoreJournal(journal);
          continue;
        }

        try {
          await this.restoreResolver(resolverStore, name, journal.resolvers[name]);
          journal.completedResolvers.push(name);
          await this.writeRestoreJournal(journal);
        } catch (err) {
          console.error(
            `[ManualSnapshotStore] Recovery failed for resolver "${name}" (attempt ${retries + 1}/${MAX_RECOVERY_RETRIES}):`,
            err,
          );
          journal.failedResolvers = {
            ...(journal.failedResolvers ?? {}),
            [name]: retries + 1,
          };
          await this.writeRestoreJournal(journal);
          allResolved = false;
        }
      }

      for (const name of pendingResolverDeletes) {
        const retries = journal.failedResolverDeletes?.[name] ?? 0;
        if (retries >= MAX_RECOVERY_RETRIES) {
          console.error(
            `[ManualSnapshotStore] Resolver "${name}" has failed deletion ${retries} time(s) — quarantining. Manual intervention required.`,
          );
          journal.completedResolverDeletes.push(name);
          await this.writeRestoreJournal(journal);
          continue;
        }

        try {
          await resolverStore.delete(name);
          journal.completedResolverDeletes.push(name);
          await this.writeRestoreJournal(journal);
        } catch (err) {
          console.error(
            `[ManualSnapshotStore] Deleting resolver "${name}" during snapshot recovery failed (attempt ${retries + 1}/${MAX_RECOVERY_RETRIES}):`,
            err,
          );
          journal.failedResolverDeletes = {
            ...(journal.failedResolverDeletes ?? {}),
            [name]: retries + 1,
          };
          await this.writeRestoreJournal(journal);
          allResolved = false;
        }
      }
    });

    for (const id of pendingGenerators) {
      const retries = journal.failedGenerators?.[id] ?? 0;
      if (retries >= MAX_RECOVERY_RETRIES) {
        console.error(
          `[ManualSnapshotStore] Generator "${id}" has failed recovery ${retries} time(s) — quarantining. Manual intervention required.`,
        );
        journal.completedGenerators.push(id);
        await this.writeRestoreJournal(journal);
        continue;
      }

      try {
        await this.restoreGenerator(generatorService, journal.generators[id]);
        journal.completedGenerators.push(id);
        await this.writeRestoreJournal(journal);
      } catch (err) {
        console.error(
          `[ManualSnapshotStore] Recovery failed for generator "${id}" (attempt ${retries + 1}/${MAX_RECOVERY_RETRIES}):`,
          err,
        );
        journal.failedGenerators = {
          ...(journal.failedGenerators ?? {}),
          [id]: retries + 1,
        };
        await this.writeRestoreJournal(journal);
        allResolved = false;
      }
    }

    for (const id of pendingGeneratorDeletes) {
      const retries = journal.failedGeneratorDeletes?.[id] ?? 0;
      if (retries >= MAX_RECOVERY_RETRIES) {
        console.error(
          `[ManualSnapshotStore] Generator "${id}" has failed deletion ${retries} time(s) — quarantining. Manual intervention required.`,
        );
        journal.completedGeneratorDeletes.push(id);
        await this.writeRestoreJournal(journal);
        continue;
      }

      try {
        await generatorService.delete(id);
        journal.completedGeneratorDeletes.push(id);
        await this.writeRestoreJournal(journal);
      } catch (err) {
        console.error(
          `[ManualSnapshotStore] Deleting generator "${id}" during snapshot recovery failed (attempt ${retries + 1}/${MAX_RECOVERY_RETRIES}):`,
          err,
        );
        journal.failedGeneratorDeletes = {
          ...(journal.failedGeneratorDeletes ?? {}),
          [id]: retries + 1,
        };
        await this.writeRestoreJournal(journal);
        allResolved = false;
      }
    }

    for (const setName of pendingSetDeletes) {
      const retries = journal.failedSetDeletes?.[setName] ?? 0;
      if (retries >= MAX_RECOVERY_RETRIES) {
        console.error(
          `[ManualSnapshotStore] Extra set "${setName}" has failed deletion ${retries} time(s) — quarantining. Manual intervention required.`,
        );
        journal.completedSetDeletes.push(setName);
        await this.writeRestoreJournal(journal);
        continue;
      }

      try {
        await tokenStore.deleteSet(setName);
        journal.completedSetDeletes.push(setName);
        await this.writeRestoreJournal(journal);
      } catch (err) {
        console.error(
          `[ManualSnapshotStore] Deleting extra set "${setName}" during snapshot recovery failed (attempt ${retries + 1}/${MAX_RECOVERY_RETRIES}):`,
          err,
        );
        journal.failedSetDeletes = {
          ...(journal.failedSetDeletes ?? {}),
          [setName]: retries + 1,
        };
        await this.writeRestoreJournal(journal);
        allResolved = false;
      }
    }

    if (allResolved) {
      await this.deleteRestoreJournal();
    }
  }
}
