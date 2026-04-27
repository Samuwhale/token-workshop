import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { flattenTokenGroup, stableStringify } from "@tokenmanager/core";
import type {
  ResolverFile,
  TokenCollection,
  ViewPreset,
  Token,
  TokenGraphDocument,
  TokenGroup,
} from "@tokenmanager/core";
import type { TokenStore } from "./token-store.js";
import type { ResolverStore } from "./resolver-store.js";
import type { CollectionService } from "./collection-service.js";
import type { TokenGraphService } from "./token-graph-service.js";
import type { LintConfig, LintConfigStore } from "./lint.js";
import { NotFoundError } from "../errors.js";
import { PromiseChainLock } from "../utils/promise-chain-lock.js";
import { setTokenAtPath } from "./token-tree-utils.js";
import type { RollbackStep } from "./operation-log.js";
import { expectJsonArray, expectJsonObject, parseJsonFile } from "../utils/json-file.js";

export interface ManualSnapshotToken {
  $value: unknown;
  $type?: string;
  $description?: string;
  $extensions?: Record<string, unknown>;
}

type SnapshotCollectionTokens = Record<string, Record<string, ManualSnapshotToken>>;
type SnapshotResolvers = Record<string, ResolverFile>;
type SnapshotGraphs = TokenGraphDocument[];

type ManualSnapshotComparableState = Pick<
  ManualSnapshotEntry,
  "data" | "collections" | "views" | "resolvers" | "graphs" | "lintConfig"
>;

interface RestoreWorkspaceState {
  collectionIds: string[];
  collections: TokenCollection[];
  views?: ViewPreset[];
  resolvers: SnapshotResolvers;
  graphs: SnapshotGraphs;
  lintConfig: LintConfig;
}

interface RestorePlanStepBase {
  stepId: string;
}

type RestorePlanStep =
  | (RestorePlanStepBase & {
      kind: "restore-collection-workspace";
      collections: TokenCollection[];
      views: ViewPreset[];
      data: SnapshotCollectionTokens;
    })
  | (RestorePlanStepBase & {
      kind: "restore-resolver";
      name: string;
      file: ResolverFile;
    })
  | (RestorePlanStepBase & {
      kind: "delete-resolver";
      name: string;
    })
  | (RestorePlanStepBase & {
      kind: "restore-graphs";
      graphs: SnapshotGraphs;
    })
  | (RestorePlanStepBase & {
      kind: "restore-lint-config";
      config: LintConfig;
    });

interface RestorePlan {
  snapshotId: string;
  snapshotLabel: string;
  data: SnapshotCollectionTokens;
  collections: TokenCollection[];
  views: ViewPreset[];
  resolvers: SnapshotResolvers;
  graphs: SnapshotGraphs;
  lintConfig: LintConfig;
  deleteCollectionIds: string[];
  deleteResolverNames: string[];
  rollbackSteps: RollbackStep[];
  steps: RestorePlanStep[];
}

interface RestoreJournal
  extends Omit<RestorePlan, "steps"> {
  completedStepIds: string[];
  failedStepAttempts: Record<string, number>;
}

export interface ManualSnapshotEntry {
  id: string;
  label: string;
  timestamp: string;
  /** Flat map: collectionId -> (tokenPath -> token) */
  data: SnapshotCollectionTokens;
  collections: TokenCollection[];
  views: ViewPreset[];
  resolvers: SnapshotResolvers;
  graphs: SnapshotGraphs;
  lintConfig: LintConfig;
}

export interface ManualSnapshotSummary {
  id: string;
  label: string;
  timestamp: string;
  tokenCount: number;
  collectionStorageCount: number;
  collectionCount: number;
  viewCount: number;
  resolverCount: number;
  graphCount: number;
}

export interface TokenDiff {
  path: string;
  collectionId: string;
  status: "added" | "modified" | "removed";
  before?: ManualSnapshotToken;
  after?: ManualSnapshotToken;
}

export interface WorkspaceDiff {
  kind: "collections" | "resolver" | "graph" | "lint";
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
const COLLECTIONS_WORKSPACE_ID = "$collections";
const RESTORE_COLLECTION_WORKSPACE_STEP_ID = "restore-collection-workspace";

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

function cloneGraphs(graphs: SnapshotGraphs): SnapshotGraphs {
  return structuredClone(graphs);
}

function cloneLintConfig(config: LintConfig): LintConfig {
  return structuredClone(config);
}

function cloneRollbackSteps(steps: RollbackStep[]): RollbackStep[] {
  return structuredClone(steps);
}

function buildRestoreResolverStepId(name: string): string {
  return `restore-resolver:${name}`;
}

function buildDeleteResolverStepId(name: string): string {
  return `delete-resolver:${name}`;
}

function buildRestoreGraphsStepId(): string {
  return "restore-graphs";
}

function buildRestoreLintConfigStepId(): string {
  return "restore-lint-config";
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
    data: isRecord(raw.data) ? (raw.data as SnapshotCollectionTokens) : {},
    collections: Array.isArray(raw.collections)
      ? structuredClone(raw.collections as TokenCollection[])
      : [],
    views: Array.isArray(raw.views)
      ? structuredClone(raw.views as ViewPreset[])
      : [],
    resolvers: isRecord(raw.resolvers)
      ? cloneResolvers(raw.resolvers as SnapshotResolvers)
      : {},
    graphs: Array.isArray(raw.graphs)
      ? cloneGraphs(raw.graphs as SnapshotGraphs)
      : [],
    lintConfig: isRecord(raw.lintConfig)
      ? cloneLintConfig(raw.lintConfig as unknown as LintConfig)
      : { lintRules: {} },
  };
}

function normalizeRestoreJournal(raw: unknown): RestoreJournal {
  if (!isRecord(raw)) {
    throw new Error("Restore journal must be an object");
  }

  const snapshotId = typeof raw.snapshotId === "string" ? raw.snapshotId : "";
  const snapshotLabel =
    typeof raw.snapshotLabel === "string" ? raw.snapshotLabel : "Snapshot";
  const data = isRecord(raw.data) ? (raw.data as SnapshotCollectionTokens) : {};
  const collections = Array.isArray(raw.collections)
    ? structuredClone(raw.collections as TokenCollection[])
    : [];
  const views = Array.isArray(raw.views)
    ? structuredClone(raw.views as ViewPreset[])
    : [];
  const resolvers = isRecord(raw.resolvers)
    ? cloneResolvers(raw.resolvers as SnapshotResolvers)
    : {};
  const graphs = Array.isArray(raw.graphs)
    ? cloneGraphs(raw.graphs as SnapshotGraphs)
    : [];
  const lintConfig = isRecord(raw.lintConfig)
    ? cloneLintConfig(raw.lintConfig as unknown as LintConfig)
    : { lintRules: {} };
  const deleteCollectionIds = Array.isArray(raw.deleteCollectionIds)
    ? structuredClone(raw.deleteCollectionIds as string[])
    : [];
  const deleteResolverNames = Array.isArray(raw.deleteResolverNames)
    ? structuredClone(raw.deleteResolverNames as string[])
    : [];

  return {
    snapshotId,
    snapshotLabel,
    data,
    collections,
    views,
    resolvers,
    graphs,
    lintConfig,
    deleteCollectionIds,
    deleteResolverNames,
    rollbackSteps: Array.isArray(raw.rollbackSteps)
      ? cloneRollbackSteps(raw.rollbackSteps as RollbackStep[])
      : [],
    completedStepIds: Array.isArray(raw.completedStepIds)
      ? structuredClone(raw.completedStepIds as string[])
      : [],
    failedStepAttempts: isRecord(raw.failedStepAttempts)
      ? structuredClone(raw.failedStepAttempts as Record<string, number>)
      : {},
  };
}

function listTokenDiffs(
  before: SnapshotCollectionTokens,
  after: SnapshotCollectionTokens,
): TokenDiff[] {
  const collectionIds = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diffs: TokenDiff[] = [];

  for (const collectionId of collectionIds) {
    const beforeCollection = before[collectionId] ?? {};
    const afterCollection = after[collectionId] ?? {};
    const allPaths = new Set([
      ...Object.keys(beforeCollection),
      ...Object.keys(afterCollection),
    ]);
    for (const tokenPath of allPaths) {
      const beforeToken = beforeCollection[tokenPath];
      const afterToken = afterCollection[tokenPath];
      if (!beforeToken && afterToken) {
        diffs.push({
          path: tokenPath,
          collectionId,
          status: "added",
          after: afterToken,
        });
        continue;
      }
      if (beforeToken && !afterToken) {
        diffs.push({
          path: tokenPath,
          collectionId,
          status: "removed",
          before: beforeToken,
        });
        continue;
      }
      if (
        beforeToken &&
        afterToken &&
        stableStringify(beforeToken) !== stableStringify(afterToken)
      ) {
        diffs.push({
          path: tokenPath,
          collectionId,
          status: "modified",
          before: beforeToken,
          after: afterToken,
        });
      }
    }
  }

  return diffs;
}

function listWorkspaceDiffs(
  before: Pick<
    ManualSnapshotComparableState,
    "collections" | "views" | "resolvers" | "graphs" | "lintConfig"
  >,
  after: Pick<
    ManualSnapshotComparableState,
    "collections" | "views" | "resolvers" | "graphs" | "lintConfig"
  >,
): WorkspaceDiff[] {
  const diffs: WorkspaceDiff[] = [];

  if (
    stableStringify({
      collections: before.collections,
      views: before.views,
    }) !==
    stableStringify({
      collections: after.collections,
      views: after.views,
    })
  ) {
    const beforeEmpty =
      before.collections.length === 0 && before.views.length === 0;
    const afterEmpty = after.collections.length === 0 && after.views.length === 0;
    diffs.push({
      kind: "collections",
      id: COLLECTIONS_WORKSPACE_ID,
      label: "Collections, modes, and view presets",
      status: beforeEmpty ? "added" : afterEmpty ? "removed" : "modified",
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

  const graphIds = new Set([
    ...before.graphs.map((graph) => graph.id),
    ...after.graphs.map((graph) => graph.id),
  ]);
  const beforeGraphsById = new Map(before.graphs.map((graph) => [graph.id, graph]));
  const afterGraphsById = new Map(after.graphs.map((graph) => [graph.id, graph]));
  for (const id of graphIds) {
    const beforeGraph = beforeGraphsById.get(id);
    const afterGraph = afterGraphsById.get(id);
    const label = beforeGraph?.name ?? afterGraph?.name ?? `Graph ${id}`;
    if (!beforeGraph && afterGraph) {
      diffs.push({ kind: "graph", id, label, status: "added" });
      continue;
    }
    if (beforeGraph && !afterGraph) {
      diffs.push({ kind: "graph", id, label, status: "removed" });
      continue;
    }
    if (
      beforeGraph &&
      afterGraph &&
      stableStringify(beforeGraph) !== stableStringify(afterGraph)
    ) {
      diffs.push({ kind: "graph", id, label, status: "modified" });
    }
  }

  if (stableStringify(before.lintConfig) !== stableStringify(after.lintConfig)) {
    const beforeEmpty =
      Object.keys(before.lintConfig.lintRules ?? {}).length === 0 &&
      (before.lintConfig.suppressions?.length ?? 0) === 0;
    const afterEmpty =
      Object.keys(after.lintConfig.lintRules ?? {}).length === 0 &&
      (after.lintConfig.suppressions?.length ?? 0) === 0;
    diffs.push({
      kind: "lint",
      id: "$lint",
      label: "Lint configuration",
      status: beforeEmpty ? "added" : afterEmpty ? "removed" : "modified",
    });
  }

  return diffs.sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind.localeCompare(right.kind);
    }
    return left.label.localeCompare(right.label);
  });
}

function compareSnapshotStates(
  before: ManualSnapshotComparableState,
  after: ManualSnapshotComparableState,
): ManualSnapshotDiff {
  return {
    diffs: listTokenDiffs(before.data, after.data),
    workspaceDiffs: listWorkspaceDiffs(before, after),
  };
}

function buildSnapshotRestoreRollbackSteps({
  currentCollections,
  currentViews,
  currentResolvers,
  currentGraphs,
  currentLintConfig,
  snapshotResolvers,
}: {
  currentCollections: TokenCollection[];
  currentViews: ViewPreset[];
  currentResolvers: SnapshotResolvers;
  currentGraphs: SnapshotGraphs;
  currentLintConfig: LintConfig;
  snapshotResolvers: SnapshotResolvers;
}): RollbackStep[] {
  const steps: RollbackStep[] = [
    {
      action: "restore-collection-state",
      collections: structuredClone(currentCollections),
      views: structuredClone(currentViews),
    },
    {
      action: "restore-lint-config",
      config: cloneLintConfig(currentLintConfig),
    },
  ];

  for (const [name, file] of Object.entries(currentResolvers)) {
    steps.push({
      action: "write-resolver",
      name,
      file: structuredClone(file),
    });
  }

  for (const name of Object.keys(snapshotResolvers)) {
    if (!(name in currentResolvers)) {
      steps.push({ action: "delete-resolver", name });
    }
  }

  steps.push({
    action: "restore-graphs",
    graphs: cloneGraphs(currentGraphs),
  });

  return steps;
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
      this.loadPromise = (async () => {
        try {
          const raw = await fs.readFile(this.filePath, "utf-8");
          const entries = expectJsonArray(
            parseJsonFile(raw, {
              filePath: this.filePath,
              relativeTo: path.dirname(this.filePath),
            }),
            {
              filePath: this.filePath,
              relativeTo: path.dirname(this.filePath),
              expectation: "contain a top-level snapshot array",
            },
          );
          this.snapshots = entries.map((entry) => normalizeSnapshotEntry(entry));
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            this.snapshots = [];
            return;
          }
          throw err;
        }
      })();
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
    await fs.unlink(this.journalPath).catch((err) => {
      console.error("[rollback-error] Cleanup failed: could not remove restore journal file", err);
    });
  }

  private async cleanupStoreDir(): Promise<void> {
    await fs.rmdir(path.dirname(this.filePath)).catch((err) => {
      console.error("[rollback-error] Cleanup failed: could not remove snapshot store directory", err);
    });
  }

  private async captureCollectionTokens(
    tokenStore: TokenStore,
    collectionIds: string[],
  ): Promise<SnapshotCollectionTokens> {
    const data: SnapshotCollectionTokens = {};

    for (const collectionId of collectionIds) {
      const collection = await tokenStore.getCollection(collectionId);
      if (!collection) {
        continue;
      }
      const flat: Record<string, ManualSnapshotToken> = {};
      for (const [tokenPath, token] of flattenTokenGroup(collection.tokens)) {
        flat[tokenPath] = {
          $value: token.$value,
          $type: token.$type,
          $description: token.$description,
          $extensions: token.$extensions ? structuredClone(token.$extensions) : undefined,
        };
      }
      data[collectionId] = flat;
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
    collectionService: CollectionService,
    resolverStore: ResolverStore,
    graphService: TokenGraphService,
    lintConfigStore: LintConfigStore,
  ): Promise<ManualSnapshotEntry> {
    const [collectionState, resolvers, graphs, lintConfig] = await Promise.all([
      collectionService.loadState(),
      this.captureCurrentResolvers(resolverStore),
      graphService.list(),
      lintConfigStore.get(),
    ]);
    const collectionIds = collectionState.collections.map(
      (collection) => collection.id,
    );
    const data = await this.captureCollectionTokens(tokenStore, collectionIds);

    return {
      id: "",
      label: "",
      timestamp: "",
      data,
      collections: collectionState.collections,
      views: collectionState.views,
      resolvers,
      graphs,
      lintConfig,
    };
  }

  save(
    label: string,
    tokenStore: TokenStore,
    collectionService: CollectionService,
    resolverStore: ResolverStore,
    graphService: TokenGraphService,
    lintConfigStore: LintConfigStore,
  ): Promise<ManualSnapshotEntry> {
    return this.lock.withLock(async () => {
      await this.ensureLoaded();

      const current = await this.captureCurrentState(
        tokenStore,
        collectionService,
        resolverStore,
        graphService,
        lintConfigStore,
      );

      const entry: ManualSnapshotEntry = {
        id: randomUUID(),
        label,
        timestamp: new Date().toISOString(),
        data: current.data,
        collections: current.collections,
        views: current.views,
        resolvers: current.resolvers,
        graphs: current.graphs,
        lintConfig: current.lintConfig,
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
          (total, collectionTokens) =>
            total + Object.keys(collectionTokens).length,
          0,
        ),
        collectionStorageCount: Object.keys(snapshot.data).length,
        collectionCount: snapshot.collections.length,
        viewCount: snapshot.views.length,
        resolverCount: Object.keys(snapshot.resolvers).length,
        graphCount: snapshot.graphs.length,
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

  private buildRestorePlan(
    source: Omit<RestorePlan, "steps">,
  ): RestorePlan {
    const steps: RestorePlanStep[] = [];

    steps.push({
      stepId: RESTORE_COLLECTION_WORKSPACE_STEP_ID,
      kind: "restore-collection-workspace",
      collections: structuredClone(source.collections),
      views: structuredClone(source.views),
      data: structuredClone(source.data),
    });

    for (const [name, file] of Object.entries(source.resolvers)) {
      steps.push({
        stepId: buildRestoreResolverStepId(name),
        kind: "restore-resolver",
        name,
        file,
      });
    }

    for (const name of source.deleteResolverNames) {
      steps.push({
        stepId: buildDeleteResolverStepId(name),
        kind: "delete-resolver",
        name,
      });
    }

    steps.push({
      stepId: buildRestoreGraphsStepId(),
      kind: "restore-graphs",
      graphs: cloneGraphs(source.graphs),
    });

    steps.push({
      stepId: buildRestoreLintConfigStepId(),
      kind: "restore-lint-config",
      config: cloneLintConfig(source.lintConfig),
    });

    return {
      ...source,
      rollbackSteps: cloneRollbackSteps(source.rollbackSteps),
      steps,
    };
  }

  private buildRestorePlanFromSnapshot(
    snapshot: ManualSnapshotEntry,
    currentWorkspaceState: RestoreWorkspaceState,
  ): RestorePlan {
    return this.buildRestorePlan({
      snapshotId: snapshot.id,
      snapshotLabel: snapshot.label,
      data: snapshot.data,
      collections: structuredClone(snapshot.collections),
      views: structuredClone(snapshot.views),
      resolvers: cloneResolvers(snapshot.resolvers),
      graphs: cloneGraphs(snapshot.graphs),
      lintConfig: cloneLintConfig(snapshot.lintConfig),
      deleteCollectionIds: currentWorkspaceState.collectionIds.filter(
        (collectionId) => !(collectionId in snapshot.data),
      ),
      deleteResolverNames: Object.keys(currentWorkspaceState.resolvers).filter(
        (name) => !(name in snapshot.resolvers),
      ),
      rollbackSteps: buildSnapshotRestoreRollbackSteps({
        currentCollections: currentWorkspaceState.collections,
        currentViews: currentWorkspaceState.views ?? [],
        currentResolvers: currentWorkspaceState.resolvers,
        currentGraphs: currentWorkspaceState.graphs,
        currentLintConfig: currentWorkspaceState.lintConfig,
        snapshotResolvers: snapshot.resolvers,
      }),
    });
  }

  private buildRestorePlanFromJournal(
    journal: RestoreJournal,
  ): RestorePlan {
    return this.buildRestorePlan({
      snapshotId: journal.snapshotId,
      snapshotLabel: journal.snapshotLabel,
      data: journal.data,
      collections: structuredClone(journal.collections),
      views: structuredClone(journal.views),
      resolvers: cloneResolvers(journal.resolvers),
      graphs: cloneGraphs(journal.graphs),
      lintConfig: cloneLintConfig(journal.lintConfig),
      deleteCollectionIds: structuredClone(journal.deleteCollectionIds),
      deleteResolverNames: structuredClone(journal.deleteResolverNames),
      rollbackSteps: cloneRollbackSteps(journal.rollbackSteps),
    });
  }

  private createRestoreJournal(
    plan: RestorePlan,
  ): RestoreJournal {
    return {
      snapshotId: plan.snapshotId,
      snapshotLabel: plan.snapshotLabel,
      data: plan.data,
      collections: structuredClone(plan.collections),
      views: structuredClone(plan.views),
      resolvers: cloneResolvers(plan.resolvers),
      graphs: cloneGraphs(plan.graphs),
      lintConfig: cloneLintConfig(plan.lintConfig),
      deleteCollectionIds: structuredClone(plan.deleteCollectionIds),
      deleteResolverNames: structuredClone(plan.deleteResolverNames),
      rollbackSteps: cloneRollbackSteps(plan.rollbackSteps),
      completedStepIds: [],
      failedStepAttempts: {},
    };
  }

  private buildRestoreResult(plan: RestorePlan): {
    restoredCollections: string[];
    deletedCollections: string[];
    restoredCollectionState: boolean;
    restoredResolvers: string[];
    deletedResolvers: string[];
    rollbackSteps: RollbackStep[];
  } {
    return {
      restoredCollections: Object.keys(plan.data),
      deletedCollections: structuredClone(plan.deleteCollectionIds),
      restoredCollectionState: true,
      restoredResolvers: Object.keys(plan.resolvers),
      deletedResolvers: structuredClone(plan.deleteResolverNames),
      rollbackSteps: cloneRollbackSteps(plan.rollbackSteps),
    };
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

    return compareSnapshotStates(snapshotA, snapshotB);
  }

  async diff(
    id: string,
    tokenStore: TokenStore,
    collectionService: CollectionService,
    resolverStore: ResolverStore,
    graphService: TokenGraphService,
    lintConfigStore: LintConfigStore,
  ): Promise<ManualSnapshotDiff> {
    await this.ensureLoaded();
    const snapshot = this.snapshots.find((entry) => entry.id === id);
    if (!snapshot) {
      throw new NotFoundError(`Snapshot "${id}" not found`);
    }

    const current = await this.captureCurrentState(
      tokenStore,
      collectionService,
      resolverStore,
      graphService,
      lintConfigStore,
    );

    return compareSnapshotStates(snapshot, current);
  }

  private async restoreCollectionWorkspace(
    collectionService: CollectionService,
    state: {
      collections: TokenCollection[];
      views: ViewPreset[];
      data: SnapshotCollectionTokens;
    },
  ): Promise<void> {
    const tokensByCollection = Object.fromEntries(
      Object.entries(state.data).map(([collectionId, flatTokens]) => [
        collectionId,
        inflateSnapshotTokens(flatTokens),
      ]),
    );

    await collectionService.restoreCollectionWorkspaceWithinLock({
      state: {
        collections: structuredClone(state.collections),
        views: structuredClone(state.views),
      },
      tokensByCollection,
    });
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

  private async captureRestoreWorkspaceState(
    collectionService: CollectionService,
    resolverStore: ResolverStore,
    graphService: TokenGraphService,
    lintConfigStore: LintConfigStore,
  ): Promise<RestoreWorkspaceState> {
    const [collectionState, resolvers, graphs, lintConfig] = await Promise.all([
      collectionService.loadState(),
      this.captureCurrentResolvers(resolverStore),
      graphService.list(),
      lintConfigStore.get(),
    ]);

    return {
      collectionIds: collectionState.collections.map((collection) => collection.id),
      collections: collectionState.collections,
      views: collectionState.views,
      resolvers,
      graphs,
      lintConfig,
    };
  }

  private listPendingRestoreSteps(
    plan: RestorePlan,
    journal: RestoreJournal,
  ): RestorePlanStep[] {
    const completed = new Set(journal.completedStepIds);
    return plan.steps.filter((step) => !completed.has(step.stepId));
  }

  private describeRestoreStep(step: RestorePlanStep): string {
    switch (step.kind) {
      case "restore-collection-workspace":
        return "restore collections, modes, view presets, and token storage";
      case "restore-resolver":
        return `restore resolver "${step.name}"`;
      case "delete-resolver":
        return `delete resolver "${step.name}"`;
      case "restore-graphs":
        return "restore graph documents";
      case "restore-lint-config":
        return "restore lint configuration";
    }
  }

  private async executeRestoreStep(
    step: RestorePlanStep,
    collectionService: CollectionService,
    resolverStore: ResolverStore,
    graphService: TokenGraphService,
    lintConfigStore: LintConfigStore,
  ): Promise<void> {
    switch (step.kind) {
      case "restore-collection-workspace":
        await resolverStore.lock.withLock(async () => {
          await this.restoreCollectionWorkspace(collectionService, {
            collections: step.collections,
            views: step.views,
            data: step.data,
          });
        });
        return;
      case "restore-resolver":
        await resolverStore.lock.withLock(async () => {
          await this.restoreResolver(resolverStore, step.name, step.file);
        });
        return;
      case "delete-resolver":
        await resolverStore.lock.withLock(async () => {
          await resolverStore.delete(step.name);
        });
        return;
      case "restore-graphs":
        await graphService.restore(step.graphs);
        return;
      case "restore-lint-config":
        await lintConfigStore.save(step.config);
        return;
    }
  }

  private async executeRestorePlan(
    plan: RestorePlan,
    journal: RestoreJournal,
    collectionService: CollectionService,
    resolverStore: ResolverStore,
    graphService: TokenGraphService,
    lintConfigStore: LintConfigStore,
    options: { recoveryMode: boolean },
  ): Promise<boolean> {
    let allResolved = true;

    for (const step of this.listPendingRestoreSteps(plan, journal)) {
      const retries = journal.failedStepAttempts[step.stepId] ?? 0;
      const description = this.describeRestoreStep(step);

      if (options.recoveryMode && retries >= MAX_RECOVERY_RETRIES) {
        console.error(
          `[ManualSnapshotStore] Restore step "${description}" has failed recovery ${retries} time(s) — quarantining. Manual intervention required.`,
        );
        journal.completedStepIds.push(step.stepId);
        await this.writeRestoreJournal(journal);
        continue;
      }

      try {
        await this.executeRestoreStep(
          step,
          collectionService,
          resolverStore,
          graphService,
          lintConfigStore,
        );
        journal.completedStepIds.push(step.stepId);
        delete journal.failedStepAttempts[step.stepId];
        await this.writeRestoreJournal(journal);
      } catch (err) {
        journal.failedStepAttempts[step.stepId] = retries + 1;
        await this.writeRestoreJournal(journal);

        if (!options.recoveryMode) {
          throw err;
        }

        console.error(
          `[ManualSnapshotStore] Recovery failed while trying to ${description} (attempt ${retries + 1}/${MAX_RECOVERY_RETRIES}):`,
          err,
        );
        allResolved = false;
      }
    }

    return allResolved;
  }

  restore(
    id: string,
    collectionService: CollectionService,
    resolverStore: ResolverStore,
    graphService: TokenGraphService,
    lintConfigStore: LintConfigStore,
    currentWorkspaceState?: RestoreWorkspaceState,
  ): Promise<{
    restoredCollections: string[];
    deletedCollections: string[];
    restoredCollectionState: boolean;
    restoredResolvers: string[];
    deletedResolvers: string[];
    rollbackSteps: RollbackStep[];
  }> {
    return this.lock.withLock(async () => {
      await this.ensureLoaded();
      const snapshot = this.snapshots.find((entry) => entry.id === id);
      if (!snapshot) {
        throw new NotFoundError(`Snapshot "${id}" not found`);
      }

      const baseline =
        currentWorkspaceState ??
        (await this.captureRestoreWorkspaceState(
          collectionService,
          resolverStore,
          graphService,
          lintConfigStore,
        ));
      const currentCollectionState =
        baseline.views !== undefined
          ? { collections: baseline.collections, views: baseline.views }
          : await collectionService.loadState();
      const resolvedBaseline =
        baseline.views !== undefined
          ? baseline
          : {
              ...baseline,
              views: currentCollectionState.views,
            };
      const plan = this.buildRestorePlanFromSnapshot(
        snapshot,
        resolvedBaseline,
      );
      const journal = this.createRestoreJournal(plan);
      await this.writeRestoreJournal(journal);

      await this.executeRestorePlan(
        plan,
        journal,
        collectionService,
        resolverStore,
        graphService,
        lintConfigStore,
        { recoveryMode: false },
      );

      await this.deleteRestoreJournal();

      return this.buildRestoreResult(plan);
    });
  }

  async recoverPendingRestore(
    collectionService: CollectionService,
    resolverStore: ResolverStore,
    graphService: TokenGraphService,
    lintConfigStore: LintConfigStore,
  ): Promise<void> {
    let journal: RestoreJournal;
    try {
      const raw = await fs.readFile(this.journalPath, "utf-8");
      journal = normalizeRestoreJournal(
        expectJsonObject(
          parseJsonFile(raw, {
            filePath: this.journalPath,
            relativeTo: path.dirname(this.journalPath),
          }),
          {
            filePath: this.journalPath,
            relativeTo: path.dirname(this.journalPath),
            expectation: "contain a restore journal object",
          },
        ),
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw err;
    }

    const plan = this.buildRestorePlanFromJournal(journal);

    if (this.listPendingRestoreSteps(plan, journal).length === 0) {
      console.warn(
        `[ManualSnapshotStore] Stale restore journal for "${journal.snapshotLabel}" found; all restore steps are already complete — cleaning up`,
      );
      await this.deleteRestoreJournal();
      return;
    }

    console.warn(
      `[ManualSnapshotStore] Recovering incomplete restore of snapshot "${journal.snapshotLabel}" (${journal.snapshotId})`,
    );

    const allResolved = await this.executeRestorePlan(
      plan,
      journal,
      collectionService,
      resolverStore,
      graphService,
      lintConfigStore,
      { recoveryMode: true },
    );

    if (allResolved) {
      await this.deleteRestoreJournal();
    }
  }
}
