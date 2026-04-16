import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { flattenTokenGroup } from "@tokenmanager/core";
import type {
  ResolverFile,
  TokenCollection,
  ViewPreset,
  Token,
  TokenRecipe,
  TokenGroup,
} from "@tokenmanager/core";
import type { TokenStore } from "./token-store.js";
import type { ResolverStore } from "./resolver-store.js";
import type { RecipeService } from "./recipe-service.js";
import type { CollectionsStore } from "../routes/themes.js";
import { stableStringify } from "./stable-stringify.js";
import { NotFoundError } from "../errors.js";
import { PromiseChainLock } from "../utils/promise-chain-lock.js";
import { setTokenAtPath } from "./token-tree-utils.js";
import type { RollbackStep } from "./operation-log.js";

export interface ManualSnapshotToken {
  $value: unknown;
  $type?: string;
  $description?: string;
  $extensions?: Record<string, unknown>;
}

type SnapshotTokenSets = Record<string, Record<string, ManualSnapshotToken>>;
type SnapshotResolvers = Record<string, ResolverFile>;
type SnapshotRecipes = Record<string, TokenRecipe>;

type ManualSnapshotComparableState = Pick<
  ManualSnapshotEntry,
  "data" | "dimensions" | "views" | "resolvers" | "recipes"
>;

interface RestoreWorkspaceState {
  setNames: string[];
  dimensions: TokenCollection[];
  views?: ViewPreset[];
  resolvers: SnapshotResolvers;
  recipes: SnapshotRecipes;
}

interface RestorePlanStepBase {
  stepId: string;
}

type RestorePlanStep =
  | (RestorePlanStepBase & {
      kind: "restore-set";
      setName: string;
      flatTokens: Record<string, ManualSnapshotToken>;
    })
  | (RestorePlanStepBase & {
      kind: "restore-themes";
      dimensions: TokenCollection[];
      views: ViewPreset[];
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
      kind: "restore-recipe";
      recipe: TokenRecipe;
    })
  | (RestorePlanStepBase & {
      kind: "delete-recipe";
      id: string;
    })
  | (RestorePlanStepBase & {
      kind: "delete-set";
      setName: string;
    });

interface RestorePlan {
  snapshotId: string;
  snapshotLabel: string;
  data: SnapshotTokenSets;
  dimensions: TokenCollection[];
  views: ViewPreset[];
  resolvers: SnapshotResolvers;
  recipes: SnapshotRecipes;
  deleteSetNames: string[];
  deleteResolverNames: string[];
  deleteRecipeIds: string[];
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
  /** Flat map: setName -> (tokenPath -> token) */
  data: SnapshotTokenSets;
  dimensions: TokenCollection[];
  views: ViewPreset[];
  resolvers: SnapshotResolvers;
  recipes: SnapshotRecipes;
}

export interface ManualSnapshotSummary {
  id: string;
  label: string;
  timestamp: string;
  tokenCount: number;
  setCount: number;
  collectionCount: number;
  viewCount: number;
  resolverCount: number;
  recipeCount: number;
}

export interface TokenDiff {
  path: string;
  set: string;
  status: "added" | "modified" | "removed";
  before?: ManualSnapshotToken;
  after?: ManualSnapshotToken;
}

export interface WorkspaceDiff {
  kind: "themes" | "resolver" | "recipe";
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
const RESTORE_COLLECTIONS_STEP_ID = "restore-themes";

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

function cloneRecipes(recipes: SnapshotRecipes): SnapshotRecipes {
  return structuredClone(recipes);
}

function cloneRollbackSteps(steps: RollbackStep[]): RollbackStep[] {
  return structuredClone(steps);
}

function buildRestoreSetStepId(setName: string): string {
  return `restore-set:${setName}`;
}

function buildRestoreResolverStepId(name: string): string {
  return `restore-resolver:${name}`;
}

function buildDeleteResolverStepId(name: string): string {
  return `delete-resolver:${name}`;
}

function buildRestoreRecipeStepId(id: string): string {
  return `restore-recipe:${id}`;
}

function buildDeleteRecipeStepId(id: string): string {
  return `delete-recipe:${id}`;
}

function buildDeleteSetStepId(setName: string): string {
  return `delete-set:${setName}`;
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
      ? structuredClone(raw.dimensions as TokenCollection[])
      : [],
    views: Array.isArray(raw.views)
      ? structuredClone(raw.views as ViewPreset[])
      : [],
    resolvers: isRecord(raw.resolvers)
      ? cloneResolvers(raw.resolvers as SnapshotResolvers)
      : {},
    recipes: isRecord(raw.recipes)
      ? cloneRecipes(raw.recipes as SnapshotRecipes)
      : {},
  };
}

function normalizeRestoreJournal(raw: unknown): RestoreJournal {
  if (!isRecord(raw)) {
    throw new Error("Restore journal must be an object");
  }

  const snapshotId = typeof raw.snapshotId === "string" ? raw.snapshotId : "";
  const snapshotLabel =
    typeof raw.snapshotLabel === "string" ? raw.snapshotLabel : "Snapshot";
  const data = isRecord(raw.data) ? (raw.data as SnapshotTokenSets) : {};
  const dimensions = Array.isArray(raw.dimensions)
    ? structuredClone(raw.dimensions as TokenCollection[])
    : [];
  const views = Array.isArray(raw.views)
    ? structuredClone(raw.views as ViewPreset[])
    : [];
  const resolvers = isRecord(raw.resolvers)
    ? cloneResolvers(raw.resolvers as SnapshotResolvers)
    : {};
  const recipes = isRecord(raw.recipes)
    ? cloneRecipes(raw.recipes as SnapshotRecipes)
    : {};
  const deleteSetNames = Array.isArray(raw.deleteSetNames)
    ? structuredClone(raw.deleteSetNames as string[])
    : [];
  const deleteResolverNames = Array.isArray(raw.deleteResolverNames)
    ? structuredClone(raw.deleteResolverNames as string[])
    : [];
  const deleteRecipeIds = Array.isArray(raw.deleteRecipeIds)
    ? structuredClone(raw.deleteRecipeIds as string[])
    : [];

  return {
    snapshotId,
    snapshotLabel,
    data,
    dimensions,
    views,
    resolvers,
    recipes,
    deleteSetNames,
    deleteResolverNames,
    deleteRecipeIds,
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
  before: SnapshotTokenSets,
  after: SnapshotTokenSets,
): TokenDiff[] {
  const sets = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diffs: TokenDiff[] = [];

  for (const setName of sets) {
    const beforeSet = before[setName] ?? {};
    const afterSet = after[setName] ?? {};
    const allPaths = new Set([
      ...Object.keys(beforeSet),
      ...Object.keys(afterSet),
    ]);
    for (const tokenPath of allPaths) {
      const beforeToken = beforeSet[tokenPath];
      const afterToken = afterSet[tokenPath];
      if (!beforeToken && afterToken) {
        diffs.push({
          path: tokenPath,
          set: setName,
          status: "added",
          after: afterToken,
        });
        continue;
      }
      if (beforeToken && !afterToken) {
        diffs.push({
          path: tokenPath,
          set: setName,
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
          set: setName,
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
    "dimensions" | "views" | "resolvers" | "recipes"
  >,
  after: Pick<
    ManualSnapshotComparableState,
    "dimensions" | "views" | "resolvers" | "recipes"
  >,
): WorkspaceDiff[] {
  const diffs: WorkspaceDiff[] = [];

  if (
    stableStringify({
      dimensions: before.dimensions,
      views: before.views,
    }) !==
    stableStringify({
      dimensions: after.dimensions,
      views: after.views,
    })
  ) {
    const beforeEmpty =
      before.dimensions.length === 0 && before.views.length === 0;
    const afterEmpty = after.dimensions.length === 0 && after.views.length === 0;
    diffs.push({
      kind: "themes",
      id: COLLECTIONS_WORKSPACE_ID,
      label: "Collection modes and preview presets",
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

  const recipeIds = new Set([
    ...Object.keys(before.recipes),
    ...Object.keys(after.recipes),
  ]);
  for (const id of recipeIds) {
    const beforeRecipe = before.recipes[id];
    const afterRecipe = after.recipes[id];
    const label =
      beforeRecipe?.name ?? afterRecipe?.name ?? `Recipe ${id}`;
    if (!beforeRecipe && afterRecipe) {
      diffs.push({
        kind: "recipe",
        id,
        label,
        status: "added",
      });
      continue;
    }
    if (beforeRecipe && !afterRecipe) {
      diffs.push({
        kind: "recipe",
        id,
        label,
        status: "removed",
      });
      continue;
    }
    if (
      beforeRecipe &&
      afterRecipe &&
      stableStringify(beforeRecipe) !== stableStringify(afterRecipe)
    ) {
      diffs.push({
        kind: "recipe",
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
  currentDimensions,
  currentViews,
  currentResolvers,
  currentRecipes,
  snapshotResolvers,
  snapshotRecipes,
}: {
  currentDimensions: TokenCollection[];
  currentViews: ViewPreset[];
  currentResolvers: SnapshotResolvers;
  currentRecipes: SnapshotRecipes;
  snapshotResolvers: SnapshotResolvers;
  snapshotRecipes: SnapshotRecipes;
}): RollbackStep[] {
  const steps: RollbackStep[] = [
    {
      action: "write-themes",
      dimensions: structuredClone(currentDimensions),
      views: structuredClone(currentViews),
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

  for (const recipe of Object.values(currentRecipes)) {
    steps.push({
      action: "create-recipe",
      recipe: structuredClone(recipe),
    });
  }

  for (const recipeId of Object.keys(snapshotRecipes)) {
    if (!(recipeId in currentRecipes)) {
      steps.push({ action: "delete-recipe", id: recipeId });
    }
  }

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
    await fs.unlink(this.journalPath).catch((err) => {
      console.error("[rollback-error] Cleanup failed: could not remove restore journal file", err);
    });
  }

  private async cleanupStoreDir(): Promise<void> {
    await fs.rmdir(path.dirname(this.filePath)).catch((err) => {
      console.error("[rollback-error] Cleanup failed: could not remove snapshot store directory", err);
    });
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
    collectionsStore: CollectionsStore,
    resolverStore: ResolverStore,
    recipeService: RecipeService,
  ): Promise<ManualSnapshotEntry> {
    const [data, collectionState, resolvers, recipes] = await Promise.all([
      this.captureTokenSets(tokenStore),
      collectionsStore.withReadStateLock((state) => Promise.resolve(structuredClone(state))),
      this.captureCurrentResolvers(resolverStore),
      recipeService.getAllById(),
    ]);

    return {
      id: "",
      label: "",
      timestamp: "",
      data,
      dimensions: collectionState.collections,
      views: collectionState.views,
      resolvers,
      recipes,
    };
  }

  save(
    label: string,
    tokenStore: TokenStore,
    collectionsStore: CollectionsStore,
    resolverStore: ResolverStore,
    recipeService: RecipeService,
  ): Promise<ManualSnapshotEntry> {
    return this.lock.withLock(async () => {
      await this.ensureLoaded();

      const current = await this.captureCurrentState(
        tokenStore,
        collectionsStore,
        resolverStore,
        recipeService,
      );

      const entry: ManualSnapshotEntry = {
        id: randomUUID(),
        label,
        timestamp: new Date().toISOString(),
        data: current.data,
        dimensions: current.dimensions,
        views: current.views,
        resolvers: current.resolvers,
        recipes: current.recipes,
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
        collectionCount: snapshot.dimensions.length,
        viewCount: snapshot.views.length,
        resolverCount: Object.keys(snapshot.resolvers).length,
        recipeCount: Object.keys(snapshot.recipes).length,
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

    for (const [setName, flatTokens] of Object.entries(source.data)) {
      steps.push({
        stepId: buildRestoreSetStepId(setName),
        kind: "restore-set",
        setName,
        flatTokens,
      });
    }

    steps.push({
      stepId: RESTORE_COLLECTIONS_STEP_ID,
      kind: "restore-themes",
      dimensions: structuredClone(source.dimensions),
      views: structuredClone(source.views),
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

    for (const recipe of Object.values(source.recipes)) {
      steps.push({
        stepId: buildRestoreRecipeStepId(recipe.id),
        kind: "restore-recipe",
        recipe,
      });
    }

    for (const id of source.deleteRecipeIds) {
      steps.push({
        stepId: buildDeleteRecipeStepId(id),
        kind: "delete-recipe",
        id,
      });
    }

    for (const setName of source.deleteSetNames) {
      steps.push({
        stepId: buildDeleteSetStepId(setName),
        kind: "delete-set",
        setName,
      });
    }

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
      dimensions: structuredClone(snapshot.dimensions),
      views: structuredClone(snapshot.views),
      resolvers: cloneResolvers(snapshot.resolvers),
      recipes: cloneRecipes(snapshot.recipes),
      deleteSetNames: currentWorkspaceState.setNames.filter(
        (setName) => !(setName in snapshot.data),
      ),
      deleteResolverNames: Object.keys(currentWorkspaceState.resolvers).filter(
        (name) => !(name in snapshot.resolvers),
      ),
      deleteRecipeIds: Object.keys(currentWorkspaceState.recipes).filter(
        (id) => !(id in snapshot.recipes),
      ),
      rollbackSteps: buildSnapshotRestoreRollbackSteps({
        currentDimensions: currentWorkspaceState.dimensions,
        currentViews: currentWorkspaceState.views ?? [],
        currentResolvers: currentWorkspaceState.resolvers,
        currentRecipes: currentWorkspaceState.recipes,
        snapshotResolvers: snapshot.resolvers,
        snapshotRecipes: snapshot.recipes,
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
      dimensions: structuredClone(journal.dimensions),
      views: structuredClone(journal.views),
      resolvers: cloneResolvers(journal.resolvers),
      recipes: cloneRecipes(journal.recipes),
      deleteSetNames: structuredClone(journal.deleteSetNames),
      deleteResolverNames: structuredClone(journal.deleteResolverNames),
      deleteRecipeIds: structuredClone(journal.deleteRecipeIds),
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
      dimensions: structuredClone(plan.dimensions),
      views: structuredClone(plan.views),
      resolvers: cloneResolvers(plan.resolvers),
      recipes: cloneRecipes(plan.recipes),
      deleteSetNames: structuredClone(plan.deleteSetNames),
      deleteResolverNames: structuredClone(plan.deleteResolverNames),
      deleteRecipeIds: structuredClone(plan.deleteRecipeIds),
      rollbackSteps: cloneRollbackSteps(plan.rollbackSteps),
      completedStepIds: [],
      failedStepAttempts: {},
    };
  }

  private buildRestoreResult(plan: RestorePlan): {
    restoredSets: string[];
    deletedSets: string[];
    restoredThemes: boolean;
    restoredResolvers: string[];
    deletedResolvers: string[];
    restoredRecipes: string[];
    deletedRecipes: string[];
    rollbackSteps: RollbackStep[];
  } {
    return {
      restoredSets: Object.keys(plan.data),
      deletedSets: structuredClone(plan.deleteSetNames),
      restoredThemes: true,
      restoredResolvers: Object.keys(plan.resolvers),
      deletedResolvers: structuredClone(plan.deleteResolverNames),
      restoredRecipes: Object.values(plan.recipes).map(
        (recipe) => recipe.id,
      ),
      deletedRecipes: structuredClone(plan.deleteRecipeIds),
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
    collectionsStore: CollectionsStore,
    resolverStore: ResolverStore,
    recipeService: RecipeService,
  ): Promise<ManualSnapshotDiff> {
    await this.ensureLoaded();
    const snapshot = this.snapshots.find((entry) => entry.id === id);
    if (!snapshot) {
      throw new NotFoundError(`Snapshot "${id}" not found`);
    }

    const current = await this.captureCurrentState(
      tokenStore,
      collectionsStore,
      resolverStore,
      recipeService,
    );

    return compareSnapshotStates(snapshot, current);
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
    collectionsStore: CollectionsStore,
    state: {
      dimensions: TokenCollection[];
      views: ViewPreset[];
    },
  ): Promise<void> {
    await collectionsStore.withStateLock(async () => ({
      state: {
        collections: structuredClone(state.dimensions),
        views: structuredClone(state.views),
      },
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

  private async restoreRecipe(
    recipeService: RecipeService,
    recipe: TokenRecipe,
  ): Promise<void> {
    await recipeService.restore(recipe);
  }

  private async captureRestoreWorkspaceState(
    tokenStore: TokenStore,
    collectionsStore: CollectionsStore,
    resolverStore: ResolverStore,
    recipeService: RecipeService,
  ): Promise<RestoreWorkspaceState> {
    const [setNames, collectionState, resolvers, recipes] = await Promise.all([
      tokenStore.getSets(),
      collectionsStore.withReadStateLock((state) => Promise.resolve(structuredClone(state))),
      this.captureCurrentResolvers(resolverStore),
      recipeService.getAllById(),
    ]);

    return {
      setNames,
      dimensions: collectionState.collections,
      views: collectionState.views,
      resolvers,
      recipes,
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
      case "restore-set":
        return `restore set "${step.setName}"`;
      case "restore-themes":
        return "restore collection modes and preview presets";
      case "restore-resolver":
        return `restore resolver "${step.name}"`;
      case "delete-resolver":
        return `delete resolver "${step.name}"`;
      case "restore-recipe":
        return `restore recipe "${step.recipe.id}"`;
      case "delete-recipe":
        return `delete recipe "${step.id}"`;
      case "delete-set":
        return `delete set "${step.setName}"`;
    }
  }

  private async executeRestoreStep(
    step: RestorePlanStep,
    tokenStore: TokenStore,
    collectionsStore: CollectionsStore,
    resolverStore: ResolverStore,
    recipeService: RecipeService,
  ): Promise<void> {
    switch (step.kind) {
      case "restore-set":
        await this.restoreSet(tokenStore, step.setName, step.flatTokens);
        return;
      case "restore-themes":
        await resolverStore.lock.withLock(async () => {
          await this.restoreThemes(collectionsStore, {
            dimensions: step.dimensions,
            views: step.views,
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
      case "restore-recipe":
        await this.restoreRecipe(recipeService, step.recipe);
        return;
      case "delete-recipe":
        await recipeService.delete(step.id);
        return;
      case "delete-set":
        await tokenStore.deleteSet(step.setName);
        return;
    }
  }

  private async executeRestorePlan(
    plan: RestorePlan,
    journal: RestoreJournal,
    tokenStore: TokenStore,
    collectionsStore: CollectionsStore,
    resolverStore: ResolverStore,
    recipeService: RecipeService,
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
          tokenStore,
          collectionsStore,
          resolverStore,
          recipeService,
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
    tokenStore: TokenStore,
    collectionsStore: CollectionsStore,
    resolverStore: ResolverStore,
    recipeService: RecipeService,
    currentWorkspaceState?: RestoreWorkspaceState,
  ): Promise<{
    restoredSets: string[];
    deletedSets: string[];
    restoredThemes: boolean;
    restoredResolvers: string[];
    deletedResolvers: string[];
    restoredRecipes: string[];
    deletedRecipes: string[];
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
          tokenStore,
          collectionsStore,
          resolverStore,
          recipeService,
        ));
      const currentCollectionState =
        baseline.views !== undefined
          ? { collections: baseline.dimensions, views: baseline.views }
          : await collectionsStore.withReadStateLock((state) =>
              Promise.resolve(structuredClone(state)),
            );
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
        tokenStore,
        collectionsStore,
        resolverStore,
        recipeService,
        { recoveryMode: false },
      );

      await this.deleteRestoreJournal();

      return this.buildRestoreResult(plan);
    });
  }

  async recoverPendingRestore(
    tokenStore: TokenStore,
    collectionsStore: CollectionsStore,
    resolverStore: ResolverStore,
    recipeService: RecipeService,
  ): Promise<void> {
    let journal: RestoreJournal;
    try {
      const raw = await fs.readFile(this.journalPath, "utf-8");
      journal = normalizeRestoreJournal(JSON.parse(raw));
    } catch {
      return;
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
      tokenStore,
      collectionsStore,
      resolverStore,
      recipeService,
      { recoveryMode: true },
    );

    if (allResolved) {
      await this.deleteRestoreJournal();
    }
  }
}
