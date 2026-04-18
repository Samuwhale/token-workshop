import type {
  CollectionMode,
  CollectionPublishRouting,
  DTCGToken,
  ResolverFile,
  SelectedModes,
  TokenCollection,
  TokenGroup,
  TokenRecipe,
  ViewPreset,
} from "@tokenmanager/core";
import {
  flattenTokenGroup,
  isDTCGToken,
  normalizeSelectedModes,
  readTokenCollectionModeValues,
  writeTokenCollectionModeValues,
  type Token,
  type TokenModeValues,
} from "@tokenmanager/core";
import type {
  CollectionMetadataState,
  CollectionPublishRoutingState,
  CollectionState,
  CollectionStore,
} from "./collection-store.js";
import { requireCollection } from "./collection-store.js";
import type { LintConfig, LintConfigStore } from "./lint.js";
import type { RecipeService } from "./recipe-service.js";
import type { ResolverStore } from "./resolver-store.js";
import type { TokenStore } from "./token-store.js";
import type { SnapshotEntry } from "./operation-log.js";
import {
  listChangedSnapshotTokenPaths,
  listSnapshotTokenPaths,
  qualifySnapshotEntries,
  snapshotCollection,
  snapshotCollections,
  snapshotPaths,
} from "./operation-log.js";
import { stableStringify } from "./stable-stringify.js";
import {
  copyCollectionModeKey,
  findFolderRenameConflicts,
  getFolderCollectionIds,
  isValidCollectionName,
  renameCollectionModeKey,
  rewriteTokenGroupCollectionModes,
  sortFolderRenamePairsForApply,
  sortFolderRenamePairsForRollback,
  stripGeneratedOwnershipFromToken,
  stripGeneratedOwnershipFromTokenGroup,
  type FolderCollectionRename,
} from "./collection-helpers.js";
import { BadRequestError, ConflictError, NotFoundError } from "../errors.js";
import { PromiseChainLock } from "../utils/promise-chain-lock.js";

export interface CollectionRenamePair {
  from: string;
  to: string;
}

type TokenPatch = { path: string; patch: Partial<Token> };
type TokenPatchesByCollection = Map<string, TokenPatch[]>;

export interface CollectionStateMutationResult<T> {
  previousState: CollectionState;
  result: T;
}

export interface CollectionStateAndTokenMutationResult<T>
  extends CollectionStateMutationResult<T> {
  affectedPaths: string[];
  afterSnapshot: Record<string, SnapshotEntry>;
  beforeSnapshot: Record<string, SnapshotEntry>;
}

export interface CollectionResolverImpact {
  name: string;
}

export interface CollectionRecipeOwnershipImpact {
  recipeId: string;
  recipeName: string;
  targetGroup: string;
  tokenCount: number;
  samplePaths: string[];
}

export interface CollectionRecipeTargetImpact {
  recipeId: string;
  recipeName: string;
  targetGroup: string;
}

export interface CollectionPreflightImpact {
  collectionId: string;
  tokenCount: number;
  metadata: {
    description?: string;
  };
  resolverRefs: CollectionResolverImpact[];
  generatedOwnership: CollectionRecipeOwnershipImpact[];
  recipeTargets: CollectionRecipeTargetImpact[];
}

export interface CollectionSummary extends TokenCollection {
  tokenCount: number;
}

export interface CollectionsOverview {
  collections: CollectionSummary[];
  views: ViewPreset[];
}

export type CollectionPreflightBlockerCode =
  | "generated-token-ownership"
  | "recipe-target-collection"
  | "resolver-collection-ref";

export interface CollectionPreflightBlocker {
  id: string;
  code: CollectionPreflightBlockerCode;
  collectionId: string;
  message: string;
  recipeId?: string;
  recipeName?: string;
}

export interface CollectionMergeConflict {
  path: string;
  sourceValue: unknown;
  targetValue: unknown;
}

export interface CollectionSplitPreviewItem {
  key: string;
  newCollectionId: string;
  count: number;
  existing: boolean;
}

export type CollectionStructuralOperation = "delete" | "merge" | "split";

export interface CollectionStructuralPreflight {
  operation: CollectionStructuralOperation;
  affectedCollections: CollectionPreflightImpact[];
  blockers: CollectionPreflightBlocker[];
  warnings: string[];
  mergeConflicts: CollectionMergeConflict[];
  splitPreview: CollectionSplitPreviewItem[];
}

interface CollectionResolverMeta {
  name: string;
  referencedCollections: string[];
}

interface CollectionRecipeMeta {
  id: string;
  name: string;
  targetCollections: string[];
  targetGroup: string;
}

interface LoadedCollectionDependencyData {
  collectionId: string;
  tokens: TokenGroup;
  metadata: CollectionMetadataState;
}

export interface CollectionDependencySnapshot {
  resolvers: CollectionResolverMeta[];
  recipes: CollectionRecipeMeta[];
  allOwnedTokens: Array<{
    collectionId: string;
    path: string;
    recipeId: string;
  }>;
  collectionsById: Map<string, LoadedCollectionDependencyData>;
  impactsByCollection: Map<string, CollectionPreflightImpact>;
}

export interface CollectionMergeMutationResult {
  result: {
    sourceCollectionId: string;
    targetCollectionId: string;
    conflictPaths: string[];
  };
  affectedPaths: string[];
  beforeSnapshot: Record<string, SnapshotEntry>;
  afterSnapshot: Record<string, SnapshotEntry>;
  previousTargetTokens: TokenGroup;
  previousSourceTokens: TokenGroup;
  previousCollectionState: CollectionState;
  previousLintConfig: LintConfig;
  previousSourceDefinition?: TokenCollection;
}

export interface CollectionSplitMutationResult {
  result: {
    sourceCollectionId: string;
    createdCollectionIds: string[];
    deleteOriginal: boolean;
  };
  affectedPaths: string[];
  beforeSnapshot: Record<string, SnapshotEntry>;
  afterSnapshot: Record<string, SnapshotEntry>;
  previousCollectionState: CollectionState;
  previousLintConfig: LintConfig;
  previousSourceTokens: TokenGroup;
  previousSourceDefinition?: TokenCollection;
}

export interface CollectionFolderRenameMutationResult {
  renamedCollections: FolderCollectionRename[];
  affectedPaths: string[];
  beforeSnapshot: Record<string, SnapshotEntry>;
  afterSnapshot: Record<string, SnapshotEntry>;
  previousCollectionState: CollectionState;
  finalCollectionIds: string[];
}

export interface CollectionFolderDeleteMutationResult {
  deletedCollectionIds: string[];
  affectedPaths: string[];
  beforeSnapshot: Record<string, SnapshotEntry>;
  afterSnapshot: Record<string, SnapshotEntry>;
  previousCollectionState: CollectionState;
  previousLintConfig: LintConfig;
  finalCollectionIds: string[];
}

export interface CollectionDuplicateMutationResult {
  result: { id: string; originalId: string };
  afterSnapshot: Record<string, SnapshotEntry>;
  previousCollectionState: CollectionState;
}

export interface CollectionCreateMutationResult {
  result: { id: string };
  afterSnapshot: Record<string, SnapshotEntry>;
  previousCollectionState: CollectionState;
}

export interface CollectionDeleteMutationResult {
  result: { id: string };
  affectedPaths: string[];
  beforeSnapshot: Record<string, SnapshotEntry>;
  afterSnapshot: Record<string, SnapshotEntry>;
  previousCollectionState: CollectionState;
  previousLintConfig: LintConfig;
  previousCollectionDefinition?: TokenCollection;
}

export interface CollectionRenameMutationResult {
  result: { oldId: string; newId: string };
  affectedPaths: string[];
  beforeSnapshot: Record<string, SnapshotEntry>;
  afterSnapshot: Record<string, SnapshotEntry>;
  previousCollectionState: CollectionState;
}

interface CollectionDependencyStateSnapshot {
  resolvers: Record<string, ResolverFile>;
  recipes: Record<string, TokenRecipe>;
  lintConfig: LintConfig;
}

function renameCollectionIdsInState(
  state: CollectionState,
  renames: CollectionRenamePair[],
): CollectionState {
  if (renames.length === 0) {
    return structuredClone(state);
  }

  const renameMap = new Map(renames.map(({ from, to }) => [from, to]));
  return {
    collections: state.collections.map((collection) => {
      const nextId = renameMap.get(collection.id);
      return nextId
        ? { ...collection, id: nextId }
        : collection;
    }),
    views: state.views.map((view) => {
      let changed = false;
      const nextSelections = { ...view.selections };
      for (const { from, to } of renames) {
        if (!(from in nextSelections)) {
          continue;
        }
        nextSelections[to] = nextSelections[from];
        delete nextSelections[from];
        changed = true;
      }
      return changed ? { ...view, selections: nextSelections } : view;
    }),
  };
}

function copyCollectionIdsInState(
  state: CollectionState,
  sourceCollectionId: string,
  targetCollectionIds: string[],
): CollectionState {
  if (targetCollectionIds.length === 0) {
    return structuredClone(state);
  }

  const source = state.collections.find(
    (collection) => collection.id === sourceCollectionId,
  );
  if (
    !source ||
    targetCollectionIds.some((targetCollectionId) =>
      state.collections.some((collection) => collection.id === targetCollectionId),
    )
  ) {
    return structuredClone(state);
  }

  return {
    collections: [
      ...state.collections,
      ...targetCollectionIds.map((targetCollectionId) => ({
        ...structuredClone(source),
        id: targetCollectionId,
      })),
    ],
    views: state.views.map((view) => {
      if (!(sourceCollectionId in view.selections)) {
        return view;
      }
      const nextSelections = { ...view.selections };
      for (const targetCollectionId of targetCollectionIds) {
        nextSelections[targetCollectionId] = nextSelections[sourceCollectionId];
      }
      return {
        ...view,
        selections: nextSelections,
      };
    }),
  };
}

function deleteCollectionIdsFromState(
  state: CollectionState,
  collectionIds: string[],
): CollectionState {
  if (collectionIds.length === 0) {
    return structuredClone(state);
  }

  const deletedCollectionIds = new Set(collectionIds);
  return {
    collections: state.collections.filter(
      (collection) => !deletedCollectionIds.has(collection.id),
    ),
    views: state.views.map((view) => {
      let changed = false;
      const nextSelections = { ...view.selections };
      for (const collectionId of deletedCollectionIds) {
        if (!(collectionId in nextSelections)) {
          continue;
        }
        delete nextSelections[collectionId];
        changed = true;
      }
      return changed ? { ...view, selections: nextSelections } : view;
    }),
  };
}

function cloneTokensByCollection(
  tokensByCollection: Record<string, TokenGroup>,
): Record<string, TokenGroup> {
  return Object.fromEntries(
    Object.entries(tokensByCollection).map(([collectionId, tokens]) => [
      collectionId,
      structuredClone(tokens),
    ]),
  );
}

function addCollectionTokensToWorkspace(
  tokensByCollection: Record<string, TokenGroup>,
  collectionId: string,
  tokens: TokenGroup,
): Record<string, TokenGroup> {
  return {
    ...cloneTokensByCollection(tokensByCollection),
    [collectionId]: structuredClone(tokens),
  };
}

function renameCollectionTokensInWorkspace(
  tokensByCollection: Record<string, TokenGroup>,
  oldCollectionId: string,
  newCollectionId: string,
): Record<string, TokenGroup> {
  const nextTokensByCollection = cloneTokensByCollection(tokensByCollection);
  const sourceTokens = nextTokensByCollection[oldCollectionId] ?? {};
  const rewritten = rewriteTokenGroupCollectionModes(
    sourceTokens,
    (modes) => renameCollectionModeKey(modes, oldCollectionId, newCollectionId),
  );
  delete nextTokensByCollection[oldCollectionId];
  nextTokensByCollection[newCollectionId] = rewritten.tokens;
  return nextTokensByCollection;
}

function pruneDeletedCollectionModesFromWorkspace(
  tokensByCollection: Record<string, TokenGroup>,
  retainedCollectionIds: string[],
  deletedCollectionIds: string[],
): Record<string, TokenGroup> {
  const nextTokensByCollection: Record<string, TokenGroup> = {};
  const deletedCollectionIdSet = new Set(deletedCollectionIds);

  for (const collectionId of retainedCollectionIds) {
    const tokens = structuredClone(tokensByCollection[collectionId] ?? {});
    const rewritten = rewriteTokenGroupCollectionModes(tokens, (modes) => {
      const keysToRemove = Object.keys(modes).filter((key) =>
        deletedCollectionIdSet.has(key),
      );
      if (keysToRemove.length === 0) {
        return null;
      }

      const nextModes = { ...modes };
      for (const key of keysToRemove) {
        delete nextModes[key];
      }
      return nextModes;
    });
    nextTokensByCollection[collectionId] = rewritten.tokens;
  }

  return nextTokensByCollection;
}

function mergeCollectionSnapshots(
  target: Record<string, SnapshotEntry>,
  collectionId: string,
  snapshot: Record<string, SnapshotEntry>,
): void {
  Object.assign(target, qualifySnapshotEntries(collectionId, snapshot));
}

function groupSnapshotEntriesByCollection(
  snapshot: Record<string, SnapshotEntry>,
): Map<string, Array<{ path: string; token: Token | null }>> {
  const grouped = new Map<string, Array<{ path: string; token: Token | null }>>();
  for (const [snapshotKey, entry] of Object.entries(snapshot)) {
    const prefix = `${entry.collectionId}::`;
    const tokenPath = snapshotKey.startsWith(prefix)
      ? snapshotKey.slice(prefix.length)
      : snapshotKey;
    const items = grouped.get(entry.collectionId) ?? [];
    items.push({ path: tokenPath, token: entry.token });
    grouped.set(entry.collectionId, items);
  }
  return grouped;
}

function prepareTokenForCollectionMerge(
  token: Token,
  sourceCollectionId: string,
  targetCollectionId: string,
): Token {
  const sanitized = stripGeneratedOwnershipFromToken(
    structuredClone(token as DTCGToken),
  );
  const nextModes = copyCollectionModeKey(
    readTokenCollectionModeValues(sanitized),
    sourceCollectionId,
    targetCollectionId,
  );
  if (nextModes) {
    writeTokenCollectionModeValues(sanitized, nextModes);
  }
  return sanitized;
}

function mergeIncomingModesIntoTargetToken(params: {
  targetToken: Token;
  incomingToken: Token;
  targetCollectionId: string;
}): {
  token: Token;
  changed: boolean;
  conflict: boolean;
  incomingModeValues: Record<string, unknown>;
  targetModeValues: Record<string, unknown>;
} {
  const { targetToken, incomingToken, targetCollectionId } = params;
  const incomingModes = readTokenCollectionModeValues(incomingToken);
  const incomingCollectionModes = incomingModes[targetCollectionId];
  if (!incomingCollectionModes) {
    return {
      token: structuredClone(targetToken),
      changed: false,
      conflict: false,
      incomingModeValues: {},
      targetModeValues: {},
    };
  }

  const nextToken = structuredClone(targetToken);
  const nextModes = readTokenCollectionModeValues(nextToken);
  const existingCollectionModes = {
    ...(nextModes[targetCollectionId] ?? {}),
  };

  for (const [modeName, incomingValue] of Object.entries(incomingCollectionModes)) {
    if (
      modeName in existingCollectionModes &&
      stableStringify(existingCollectionModes[modeName]) !==
        stableStringify(incomingValue)
    ) {
      return {
        token: nextToken,
        changed: false,
        conflict: true,
        incomingModeValues: structuredClone(incomingCollectionModes),
        targetModeValues: structuredClone(existingCollectionModes),
      };
    }
    existingCollectionModes[modeName] = structuredClone(incomingValue);
  }

  nextModes[targetCollectionId] = existingCollectionModes;
  writeTokenCollectionModeValues(nextToken, nextModes);

  return {
    token: nextToken,
    changed: true,
    conflict: false,
    incomingModeValues: structuredClone(incomingCollectionModes),
    targetModeValues: structuredClone(existingCollectionModes),
  };
}

function applyTokenAtPath(group: TokenGroup, tokenPath: string, token: Token): void {
  const parts = tokenPath.split(".");
  let current: TokenGroup = group;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const existing = current[parts[i]];
    if (!existing || typeof existing !== "object" || isDTCGToken(existing)) {
      current[parts[i]] = {} as TokenGroup;
    }
    current = current[parts[i]] as TokenGroup;
  }
  current[parts[parts.length - 1]] = token;
}

function buildMergeConflicts(
  sourceTokens: TokenGroup,
  targetTokens: TokenGroup,
  sourceCollectionId: string,
  targetCollectionId: string,
): CollectionMergeConflict[] {
  const sourceFlat = Object.fromEntries(flattenTokenGroup(sourceTokens));
  const targetFlat = Object.fromEntries(flattenTokenGroup(targetTokens));
  const conflicts: CollectionMergeConflict[] = [];
  for (const [tokenPath, sourceToken] of Object.entries(sourceFlat)) {
    const targetToken = targetFlat[tokenPath];
    if (!targetToken) continue;
    const incomingToken = prepareTokenForCollectionMerge(
      sourceToken as unknown as Token,
      sourceCollectionId,
      targetCollectionId,
    );
    if (
      stableStringify(incomingToken.$value) !==
      stableStringify(targetToken.$value)
    ) {
      conflicts.push({
        path: tokenPath,
        sourceValue: incomingToken.$value,
        targetValue: targetToken.$value,
      });
      continue;
    }

    const merged = mergeIncomingModesIntoTargetToken({
      targetToken: targetToken as unknown as Token,
      incomingToken,
      targetCollectionId,
    });
    if (merged.conflict) {
      conflicts.push({
        path: tokenPath,
        sourceValue: merged.incomingModeValues,
        targetValue: merged.targetModeValues,
      });
    }
  }
  return conflicts.sort((a, b) => a.path.localeCompare(b.path));
}

function buildCollectionSplitPreview(
  collectionId: string,
  tokens: TokenGroup,
  existingCollectionIds: string[],
): CollectionSplitPreviewItem[] {
  return Object.entries(tokens)
    .filter(
      ([key, value]) =>
        !key.startsWith("$") &&
        value &&
        typeof value === "object" &&
        !("$value" in value),
    )
    .map(([key, value]) => {
      const count = flattenTokenGroup(value as TokenGroup).size;
      const sanitized = key.replace(/[^a-zA-Z0-9_-]/g, "-");
      const newName = `${collectionId}-${sanitized}`;
      return {
        key,
        newCollectionId: newName,
        count,
        existing: existingCollectionIds.includes(newName),
      };
    })
    .filter((entry) => entry.count > 0)
    .sort((a, b) => a.newCollectionId.localeCompare(b.newCollectionId));
}

function buildGeneratedOwnershipImpacts(
  collectionId: string,
  allOwnedTokens: Array<{ collectionId: string; path: string; recipeId: string }>,
  recipeById: Map<string, CollectionRecipeMeta>,
): CollectionRecipeOwnershipImpact[] {
  const grouped = new Map<string, { tokenCount: number; samplePaths: string[] }>();
  for (const token of allOwnedTokens) {
    if (token.collectionId !== collectionId) continue;
    const entry = grouped.get(token.recipeId) ?? {
      tokenCount: 0,
      samplePaths: [],
    };
    entry.tokenCount += 1;
    if (entry.samplePaths.length < 5) {
      entry.samplePaths.push(token.path);
    }
    grouped.set(token.recipeId, entry);
  }
  return [...grouped.entries()]
    .map(([recipeId, ownership]) => {
      const recipe = recipeById.get(recipeId);
      return {
        recipeId,
        recipeName: recipe?.name ?? "Unknown recipe",
        targetGroup: recipe?.targetGroup ?? "",
        tokenCount: ownership.tokenCount,
        samplePaths: ownership.samplePaths.sort((a, b) => a.localeCompare(b)),
      };
    })
    .sort((a, b) => a.recipeName.localeCompare(b.recipeName));
}

function buildRecipeTargets(
  collectionId: string,
  recipes: CollectionRecipeMeta[],
): CollectionRecipeTargetImpact[] {
  return recipes
    .filter((recipe) => recipe.targetCollections.includes(collectionId))
    .map((recipe) => ({
      recipeId: recipe.id,
      recipeName: recipe.name,
      targetGroup: recipe.targetGroup,
    }))
    .sort((a, b) => a.recipeName.localeCompare(b.recipeName));
}

function buildCollectionImpact(params: {
  collectionId: string;
  tokens: TokenGroup;
  metadata: CollectionMetadataState;
  resolvers: CollectionResolverMeta[];
  recipes: CollectionRecipeMeta[];
  allOwnedTokens: Array<{ collectionId: string; path: string; recipeId: string }>;
}): CollectionPreflightImpact {
  const { collectionId, tokens, metadata, resolvers, recipes, allOwnedTokens } =
    params;
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  return {
    collectionId,
    tokenCount: flattenTokenGroup(tokens).size,
    metadata: {
      description: metadata.description,
    },
    resolverRefs: resolvers
      .filter((resolver) => resolver.referencedCollections.includes(collectionId))
      .map((resolver) => ({ name: resolver.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    generatedOwnership: buildGeneratedOwnershipImpacts(
      collectionId,
      allOwnedTokens,
      recipeById,
    ),
    recipeTargets: buildRecipeTargets(collectionId, recipes),
  };
}

function buildRecipeTargetBlockers(
  collectionImpact: CollectionPreflightImpact,
): CollectionPreflightBlocker[] {
  return collectionImpact.recipeTargets.map((recipe) => ({
    id: `recipe-target:${recipe.recipeId}:${collectionImpact.collectionId}`,
    code: "recipe-target-collection",
    collectionId: collectionImpact.collectionId,
    recipeId: recipe.recipeId,
    recipeName: recipe.recipeName,
    message: `Recipe "${recipe.recipeName}" still targets "${collectionImpact.collectionId}"${recipe.targetGroup ? ` at ${recipe.targetGroup}` : ""}.`,
  }));
}

function buildResolverReferenceBlockers(
  collectionImpact: CollectionPreflightImpact,
): CollectionPreflightBlocker[] {
  return collectionImpact.resolverRefs.map((resolver) => ({
    id: `resolver-ref:${resolver.name}:${collectionImpact.collectionId}`,
    code: "resolver-collection-ref",
    collectionId: collectionImpact.collectionId,
    message: `Resolver "${resolver.name}" still references "${collectionImpact.collectionId}".`,
  }));
}

function buildGeneratedOwnershipBlockers(
  collectionImpact: CollectionPreflightImpact,
): CollectionPreflightBlocker[] {
  return collectionImpact.generatedOwnership.map((ownership) => ({
    id: `generated-ownership:${ownership.recipeId}:${collectionImpact.collectionId}`,
    code: "generated-token-ownership",
    collectionId: collectionImpact.collectionId,
    recipeId: ownership.recipeId,
    recipeName: ownership.recipeName,
    message: `Generated tokens in "${collectionImpact.collectionId}" are still tagged as output from "${ownership.recipeName}"${ownership.targetGroup ? ` at ${ownership.targetGroup}` : ""}.`,
  }));
}

function buildRenameBlockers(
  collectionImpact: CollectionPreflightImpact,
): CollectionPreflightBlocker[] {
  return collectionImpact.recipeTargets.map((recipe) => ({
    id: `recipe-target:${recipe.recipeId}:${collectionImpact.collectionId}`,
    code: "recipe-target-collection",
    collectionId: collectionImpact.collectionId,
    recipeId: recipe.recipeId,
    recipeName: recipe.recipeName,
    message: `Recipe "${recipe.recipeName}" still targets "${collectionImpact.collectionId}" and must be updated before this collection is renamed.`,
  }));
}

function buildRemovalBlockers(
  collectionImpact: CollectionPreflightImpact,
): CollectionPreflightBlocker[] {
  return [
    ...buildResolverReferenceBlockers(collectionImpact),
    ...buildGeneratedOwnershipBlockers(collectionImpact),
    ...buildRecipeTargetBlockers(collectionImpact),
  ];
}

function buildPreflightWarnings(params: {
  operation: CollectionStructuralOperation;
  source: CollectionPreflightImpact;
  deleteOriginal?: boolean;
  splitPreview: CollectionSplitPreviewItem[];
}): string[] {
  const { operation, source, deleteOriginal = false, splitPreview } = params;
  const warnings: string[] = [];

  if (operation === "split") {
    const existingDestinations = splitPreview.filter((entry) => entry.existing);
    if (existingDestinations.length > 0) {
      warnings.push(
        `${existingDestinations.length} split destination${existingDestinations.length === 1 ? "" : "s"} already exist and will be skipped. Their current dependencies are listed below so you can decide whether to rename or merge instead.`,
      );
    }
    if (!deleteOriginal) {
      if (source.generatedOwnership.length > 0) {
        warnings.push(
          `Generated tokens copied into the new split collections become regular tokens there so the original recipe keeps owning only "${source.collectionId}".`,
        );
      }
    }
  }

  return warnings;
}

export class CollectionService {
  readonly lifecycleLock = new PromiseChainLock();

  constructor(
    private readonly tokenStore: TokenStore,
    private readonly collectionStore: CollectionStore,
    private readonly resolverStore: ResolverStore,
    private readonly resolverLock: PromiseChainLock,
    private readonly recipeService: RecipeService,
    private readonly lintConfigStore: LintConfigStore,
  ) {}

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  private async captureTokenWorkspace(
    collectionIds: Iterable<string>,
  ): Promise<Record<string, TokenGroup>> {
    const tokensByCollection: Record<string, TokenGroup> = {};
    for (const collectionId of [...new Set(collectionIds)]) {
      const collection = await this.tokenStore.getCollection(collectionId);
      tokensByCollection[collectionId] = structuredClone(collection?.tokens ?? {});
    }
    return tokensByCollection;
  }

  private async captureWorkspaceTokensForState(
    state: CollectionState,
  ): Promise<Record<string, TokenGroup>> {
    return this.captureTokenWorkspace(
      state.collections.map((collection) => collection.id),
    );
  }

  private async captureWorkspaceTokenSnapshot(
    collectionIds?: Iterable<string>,
  ): Promise<Record<string, SnapshotEntry>> {
    const ids =
      collectionIds !== undefined
        ? [...new Set(collectionIds)]
        : await this.listCollectionIds();
    return snapshotCollections(this.tokenStore, ids);
  }

  async loadLintConfig(): Promise<LintConfig> {
    return structuredClone(await this.lintConfigStore.get());
  }

  async restoreLintConfig(config: LintConfig): Promise<void> {
    await this.lintConfigStore.save(structuredClone(config));
  }

  private async captureDependencyState(): Promise<CollectionDependencyStateSnapshot> {
    const [lintConfig, recipes, resolvers] = await Promise.all([
      this.loadLintConfig(),
      this.recipeService.getAllById(),
      this.resolverLock.withLock(async () => this.resolverStore.getAllFiles()),
    ]);

    return {
      lintConfig,
      recipes,
      resolvers,
    };
  }

  private async restoreDependencyState(
    snapshot: CollectionDependencyStateSnapshot,
  ): Promise<void> {
    await this.resolverLock.withLock(async () => {
      const currentResolvers = new Set(
        this.resolverStore.list().map((resolver) => resolver.name),
      );
      const desiredResolvers = new Set(Object.keys(snapshot.resolvers));

      for (const resolverName of currentResolvers) {
        if (!desiredResolvers.has(resolverName)) {
          await this.resolverStore.delete(resolverName);
        }
      }

      for (const [resolverName, file] of Object.entries(snapshot.resolvers)) {
        if (currentResolvers.has(resolverName)) {
          await this.resolverStore.update(resolverName, file);
        } else {
          await this.resolverStore.create(resolverName, file);
        }
      }
    });

    const currentRecipes = await this.recipeService.getAllById();
    const desiredRecipeIds = new Set(Object.keys(snapshot.recipes));
    for (const recipeId of Object.keys(currentRecipes)) {
      if (!desiredRecipeIds.has(recipeId)) {
        await this.recipeService.delete(recipeId);
      }
    }
    for (const recipe of Object.values(snapshot.recipes)) {
      await this.recipeService.restore(recipe);
    }

    await this.restoreLintConfig(snapshot.lintConfig);
  }

  async reloadTokenStorageFromState(): Promise<void> {
    const state = await this.collectionStore.loadState();
    await this.tokenStore.lock.withLock(async () => {
      await this.tokenStore.syncRegisteredCollections(
        state.collections.map((collection) => collection.id),
      );
    });
  }

  async loadState(): Promise<CollectionState> {
    return structuredClone(await this.collectionStore.loadState());
  }

  async listCollectionIds(): Promise<string[]> {
    const state = await this.loadState();
    return state.collections.map((collection) => collection.id);
  }

  async getCollectionTokenCounts(): Promise<Record<string, number>> {
    const state = await this.loadState();
    const counts = this.tokenStore.getStoredCollectionTokenCounts();
    const result: Record<string, number> = {};
    for (const collection of state.collections) {
      result[collection.id] = counts[collection.id] ?? 0;
    }
    return result;
  }

  async getCollectionsOverview(): Promise<CollectionsOverview> {
    const state = await this.loadState();
    const counts = this.tokenStore.getStoredCollectionTokenCounts();
    return {
      collections: state.collections.map((collection) => ({
        ...structuredClone(collection),
        tokenCount: counts[collection.id] ?? 0,
      })),
      views: structuredClone(state.views),
    };
  }

  async requireCollectionsExist(collectionIds: Iterable<string>): Promise<void> {
    const uniqueIds = [...new Set(collectionIds)].filter(Boolean);
    if (uniqueIds.length === 0) {
      return;
    }

    const state = await this.loadState();
    for (const collectionId of uniqueIds) {
      requireCollection(state, collectionId);
    }
  }

  private async writeCollectionState(
    state: CollectionState,
  ): Promise<void> {
    await this.collectionStore.withStateLock(async () => ({
      state: structuredClone(state),
      result: undefined,
    }));
  }

  async restoreWorkspaceState(
    state: CollectionState,
  ): Promise<void> {
    await this.tokenStore.lock.withLock(() =>
      this.restoreWorkspaceStateWithinLock(state),
    );
  }

  async restoreWorkspaceStateWithinLock(
    state: CollectionState,
  ): Promise<void> {
    const nextState = structuredClone(state);
    const tokensByCollection = await this.captureTokenWorkspace(
      nextState.collections.map((collection) => collection.id),
    );
    await this.restoreCollectionWorkspaceWithinLock({
      state: nextState,
      tokensByCollection,
    });
  }

  async restoreCollectionWorkspace(params: {
    state: CollectionState;
    tokensByCollection: Record<string, TokenGroup>;
  }): Promise<void> {
    await this.tokenStore.lock.withLock(() =>
      this.restoreCollectionWorkspaceWithinLock(params),
    );
  }

  async restoreCollectionWorkspaceWithinLock(params: {
    state: CollectionState;
    tokensByCollection: Record<string, TokenGroup>;
  }): Promise<void> {
    const nextState = structuredClone(params.state);
    const desiredCollectionIds = nextState.collections.map(
      (collection) => collection.id,
    );
    const desiredCollectionIdSet = new Set(desiredCollectionIds);
    const tokenCollectionIds = Object.keys(params.tokensByCollection);
    const missingTokenData = desiredCollectionIds.filter(
      (collectionId) => !(collectionId in params.tokensByCollection),
    );
    if (missingTokenData.length > 0) {
      throw new ConflictError(
        `Collection restore is missing token data for: ${missingTokenData.join(", ")}`,
      );
    }
    const orphanedTokenData = tokenCollectionIds.filter(
      (collectionId) => !desiredCollectionIdSet.has(collectionId),
    );
    if (orphanedTokenData.length > 0) {
      throw new ConflictError(
        `Collection restore contains token data for unknown collections: ${orphanedTokenData.join(", ")}`,
      );
    }

    const previousState = await this.collectionStore.loadState();
    const previousTokensByCollection = await this.captureTokenWorkspace(
      previousState.collections.map((collection) => collection.id),
    );

    let stateUpdated = false;
    let tokensUpdated = false;
    try {
      await this.collectionStore.withStateLock(async () => ({
        state: structuredClone(nextState),
        result: undefined,
      }));
      stateUpdated = true;

      await this.tokenStore.replaceWorkspaceTokens(
        Object.fromEntries(
          desiredCollectionIds.map((collectionId) => [
            collectionId,
            structuredClone(params.tokensByCollection[collectionId] ?? {}),
          ]),
        ),
      );
      tokensUpdated = true;
    } catch (err) {
      if (tokensUpdated) {
        await this.tokenStore
          .replaceWorkspaceTokens(previousTokensByCollection)
          .catch(() => {});
      }
      if (stateUpdated) {
        await this.writeCollectionState(previousState).catch(() => {});
      }
      throw err;
    }
  }

  async getCollectionMetadata(
    collectionId: string,
  ): Promise<CollectionMetadataState> {
    const state = await this.loadState();
    const collection = requireCollection(state, collectionId);
    return {
      ...(collection.description
        ? { description: collection.description }
        : {}),
    };
  }

  async updateCollectionMetadata(
    collectionId: string,
    metadata: Partial<CollectionMetadataState>,
  ): Promise<void> {
    await this.collectionStore.withStateLock(async (state) => {
      const collection = requireCollection(state, collectionId);
      if (Object.prototype.hasOwnProperty.call(metadata, "description")) {
        collection.description = metadata.description?.trim() || undefined;
        if (!collection.description) {
          delete collection.description;
        }
      }
      return { state, result: undefined };
    });
  }

  async getCollectionPublishRouting(
    collectionId: string,
  ): Promise<CollectionPublishRoutingState> {
    const state = await this.loadState();
    const collection = requireCollection(state, collectionId);
    return structuredClone(collection.publishRouting ?? {});
  }

  async updateCollectionPublishRouting(
    collectionId: string,
    routing: Partial<CollectionPublishRouting>,
  ): Promise<void> {
    await this.collectionStore.withStateLock(async (state) => {
      const collection = requireCollection(state, collectionId);
      const nextRouting = {
        ...(collection.publishRouting ?? {}),
        ...structuredClone(routing),
      };
      if (!nextRouting.collectionName && !nextRouting.modeName) {
        delete collection.publishRouting;
      } else {
        collection.publishRouting = nextRouting;
      }
      return { state, result: undefined };
    });
  }

  // ---------------------------------------------------------------------------
  // Dependency snapshot (shared by preflight and structural ops)
  // ---------------------------------------------------------------------------

  async loadDependencySnapshot(
    collectionIds: Iterable<string>,
  ): Promise<CollectionDependencySnapshot> {
    const uniqueCollectionIds = [...new Set(collectionIds)];
    const loadedCollections = await Promise.all(
      uniqueCollectionIds.map(async (collectionId) => {
        const collection = await this.tokenStore.getCollection(collectionId);
        if (!collection) {
          return null;
        }
        return {
          collectionId,
          tokens: collection.tokens,
          metadata: await this.getCollectionMetadata(collectionId),
        } satisfies LoadedCollectionDependencyData;
      }),
    );

    const snapshot: CollectionDependencySnapshot = {
      resolvers: this.resolverStore
        .listCollectionDependencyMeta()
        .map((resolver) => ({
          name: resolver.name,
          referencedCollections: resolver.referencedCollections,
        })),
      recipes: this.recipeService
        .listCollectionDependencyMeta()
        .map((recipe) => ({
          id: recipe.id,
          name: recipe.name,
          targetCollections: recipe.targetCollections,
          targetGroup: recipe.targetGroup,
        })),
      allOwnedTokens: this.tokenStore.findTokensByRecipeId("*"),
      collectionsById: new Map(),
      impactsByCollection: new Map(),
    };

    for (const loadedCollection of loadedCollections) {
      if (!loadedCollection) {
        continue;
      }
      snapshot.collectionsById.set(loadedCollection.collectionId, loadedCollection);
      snapshot.impactsByCollection.set(
        loadedCollection.collectionId,
        buildCollectionImpact({
          collectionId: loadedCollection.collectionId,
          tokens: loadedCollection.tokens,
          metadata: loadedCollection.metadata,
          resolvers: snapshot.resolvers,
          recipes: snapshot.recipes,
          allOwnedTokens: snapshot.allOwnedTokens,
        }),
      );
    }

    return snapshot;
  }

  computeRemovalBlockersFor(
    snapshot: CollectionDependencySnapshot,
    collectionIds: Iterable<string>,
    ignoredCodes: ReadonlySet<CollectionPreflightBlockerCode> = new Set<CollectionPreflightBlockerCode>(),
  ): CollectionPreflightBlocker[] {
    return [...new Set(collectionIds)].flatMap((collectionId) => {
      const impact = snapshot.impactsByCollection.get(collectionId);
      if (!impact) {
        return [];
      }
      return buildRemovalBlockers(impact).filter(
        (blocker) => !ignoredCodes.has(blocker.code),
      );
    });
  }

  computeRenameBlockersFor(
    snapshot: CollectionDependencySnapshot,
    collectionIds: Iterable<string>,
  ): CollectionPreflightBlocker[] {
    return [...new Set(collectionIds)].flatMap((collectionId) => {
      const impact = snapshot.impactsByCollection.get(collectionId);
      return impact ? buildRenameBlockers(impact) : [];
    });
  }

  async previewStructuralChange(params: {
    operation: CollectionStructuralOperation;
    collectionId: string;
    targetCollectionId?: string;
    deleteOriginal?: boolean;
  }): Promise<CollectionStructuralPreflight> {
    const { operation, collectionId, targetCollectionId, deleteOriginal = false } =
      params;

    const sourceCollection = await this.tokenStore.getCollection(collectionId);
    if (!sourceCollection) {
      throw new NotFoundError(`Collection "${collectionId}" not found`);
    }

    const splitCollectionIds =
      operation === "split" ? await this.listCollectionIds() : [];
    const splitPreview =
      operation === "split"
        ? buildCollectionSplitPreview(
            collectionId,
            sourceCollection.tokens,
            splitCollectionIds,
          )
        : [];
    const dependencyCollectionIds = [
      collectionId,
      ...(operation === "merge" && targetCollectionId ? [targetCollectionId] : []),
      ...(operation === "split"
        ? splitPreview
            .filter((entry) => entry.existing)
            .map((entry) => entry.newCollectionId)
        : []),
    ];
    const dependencySnapshot = await this.loadDependencySnapshot(
      dependencyCollectionIds,
    );
    const sourceImpact = dependencySnapshot.impactsByCollection.get(collectionId);
    if (!sourceImpact) {
      throw new NotFoundError(`Collection "${collectionId}" not found`);
    }
    if (
      operation === "merge" &&
      targetCollectionId &&
      !dependencySnapshot.impactsByCollection.has(targetCollectionId)
    ) {
      throw new NotFoundError(`Collection "${targetCollectionId}" not found`);
    }

    const affectedCollectionImpacts: CollectionPreflightImpact[] = [sourceImpact];
    if (operation === "merge" && targetCollectionId) {
      const targetImpact =
        dependencySnapshot.impactsByCollection.get(targetCollectionId);
      if (targetImpact) {
        affectedCollectionImpacts.push(targetImpact);
      }
    }
    if (operation === "split") {
      affectedCollectionImpacts.push(
        ...splitPreview.flatMap((entry) => {
          if (!entry.existing) {
            return [];
          }
          const impact = dependencySnapshot.impactsByCollection.get(
            entry.newCollectionId,
          );
          return impact ? [impact] : [];
        }),
      );
    }

    const blockers =
      operation === "delete" ||
      operation === "merge" ||
      (operation === "split" && deleteOriginal)
        ? this.computeRemovalBlockersFor(dependencySnapshot, [collectionId])
        : [];
    const mergeConflicts =
      operation === "merge" && targetCollectionId
        ? buildMergeConflicts(
            sourceCollection.tokens,
            dependencySnapshot.collectionsById.get(targetCollectionId)?.tokens ??
              {},
            collectionId,
            targetCollectionId,
          )
        : [];
    const warnings = buildPreflightWarnings({
      operation,
      source: sourceImpact,
      deleteOriginal,
      splitPreview,
    });

    return {
      operation,
      affectedCollections: affectedCollectionImpacts,
      blockers: blockers.map((blocker) => ({ ...blocker })),
      warnings,
      mergeConflicts,
      splitPreview: splitPreview.map((entry) => ({
        key: entry.key,
        newCollectionId: entry.newCollectionId,
        count: entry.count,
        existing: entry.existing,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Basic collection / mode / view definitions
  // ---------------------------------------------------------------------------

  async reorderCollections(collectionIds: string[]): Promise<void> {
    await this.collectionStore.withStateLock(async (state) => {
      const currentIds = state.collections.map((collection) => collection.id);
      if (
        collectionIds.length !== currentIds.length ||
        new Set(collectionIds).size !== currentIds.length
      ) {
        throw new BadRequestError(
          "Collections reorder must include every collection exactly once",
        );
      }

      const byId = new Map(
        state.collections.map((collection) => [collection.id, collection]),
      );
      for (const collectionId of collectionIds) {
        if (!byId.has(collectionId)) {
          throw new NotFoundError(`Collection "${collectionId}" not found`);
        }
      }

      return {
        state: {
          collections: collectionIds.map((collectionId) => byId.get(collectionId)!),
          views: state.views,
        },
        result: undefined,
      };
    });
  }

  async renameCollectionReferences(
    oldCollectionId: string,
    newCollectionId: string,
  ): Promise<void> {
    const dependencyStateBefore = await this.captureDependencyState();
    try {
      await this.resolverLock.withLock(() =>
        this.resolverStore.renameCollectionReferences(
          oldCollectionId,
          newCollectionId,
        ),
      );
      await this.recipeService.renameCollectionId(
        oldCollectionId,
        newCollectionId,
      );
      await this.lintConfigStore.renameCollectionId(
        oldCollectionId,
        newCollectionId,
      );
    } catch (err) {
      await this.restoreDependencyState(dependencyStateBefore).catch(() => {});
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // High-level collection lifecycle
  // ---------------------------------------------------------------------------

  async createCollection(
    collectionId: string,
    tokens: TokenGroup = {},
    definition?: Partial<TokenCollection>,
  ): Promise<void> {
    const stateBefore = await this.collectionStore.loadState();
    if (stateBefore.collections.some((collection) => collection.id === collectionId)) {
      throw new ConflictError(`Collection "${collectionId}" already exists`);
    }

    const tokensBefore = await this.captureWorkspaceTokensForState(stateBefore);
    await this.restoreCollectionWorkspaceWithinLock({
      state: {
        collections: [
          ...stateBefore.collections,
          {
            modes: [],
            ...(definition ? structuredClone(definition) : {}),
            id: collectionId,
          },
        ],
        views: stateBefore.views,
      },
      tokensByCollection: addCollectionTokensToWorkspace(
        tokensBefore,
        collectionId,
        tokens,
      ),
    });
  }

  async createCollectionFromSourceDefinition(
    sourceCollectionId: string,
    targetCollectionId: string,
    tokens: TokenGroup = {},
  ): Promise<void> {
    const stateBefore = await this.collectionStore.loadState();
    const sourceDefinition = stateBefore.collections.find(
      (collection) => collection.id === sourceCollectionId,
    );
    if (!sourceDefinition) {
      throw new NotFoundError(`Collection "${sourceCollectionId}" not found`);
    }
    if (
      stateBefore.collections.some(
        (collection) => collection.id === targetCollectionId,
      )
    ) {
      throw new ConflictError(`Collection "${targetCollectionId}" already exists`);
    }

    const tokensBefore = await this.captureWorkspaceTokensForState(stateBefore);
    await this.restoreCollectionWorkspaceWithinLock({
      state: copyCollectionIdsInState(
        stateBefore,
        sourceCollectionId,
        [targetCollectionId],
      ),
      tokensByCollection: addCollectionTokensToWorkspace(
        tokensBefore,
        targetCollectionId,
        tokens,
      ),
    });
  }

  async renameCollection(
    oldCollectionId: string,
    newCollectionId: string,
  ): Promise<void> {
    const stateBefore = await this.collectionStore.loadState();
    requireCollection(stateBefore, oldCollectionId);
    if (
      stateBefore.collections.some((collection) => collection.id === newCollectionId)
    ) {
      throw new ConflictError(`Collection "${newCollectionId}" already exists`);
    }

    const tokensBefore = await this.captureWorkspaceTokensForState(stateBefore);
    try {
      await this.restoreCollectionWorkspaceWithinLock({
        state: renameCollectionIdsInState(stateBefore, [
          { from: oldCollectionId, to: newCollectionId },
        ]),
        tokensByCollection: renameCollectionTokensInWorkspace(
          tokensBefore,
          oldCollectionId,
          newCollectionId,
        ),
      });
      await this.renameCollectionReferences(oldCollectionId, newCollectionId);
    } catch (err) {
      await this.restoreCollectionWorkspaceWithinLock({
        state: stateBefore,
        tokensByCollection: tokensBefore,
      }).catch(() => {});
      throw err;
    }
  }

  async deleteCollection(collectionId: string): Promise<void> {
    const stateBefore = await this.collectionStore.loadState();
    requireCollection(stateBefore, collectionId);
    const lintConfigBefore = await this.loadLintConfig();
    const tokensBefore = await this.captureWorkspaceTokensForState(stateBefore);
    const nextState = deleteCollectionIdsFromState(stateBefore, [collectionId]);
    try {
      await this.restoreCollectionWorkspaceWithinLock({
        state: nextState,
        tokensByCollection: pruneDeletedCollectionModesFromWorkspace(
          tokensBefore,
          nextState.collections.map((collection) => collection.id),
          [collectionId],
        ),
      });
      await this.lintConfigStore.deleteCollectionId(collectionId);
    } catch (err) {
      await this.restoreCollectionWorkspaceWithinLock({
        state: stateBefore,
        tokensByCollection: tokensBefore,
      }).catch(() => {});
      await this.restoreLintConfig(lintConfigBefore).catch(() => {});
      throw err;
    }
  }

  async deleteCollections(collectionIds: string[]): Promise<void> {
    if (collectionIds.length === 0) {
      return;
    }
    const stateBefore = await this.collectionStore.loadState();
    for (const collectionId of collectionIds) {
      requireCollection(stateBefore, collectionId);
    }
    const lintConfigBefore = await this.loadLintConfig();
    const tokensBefore = await this.captureWorkspaceTokensForState(stateBefore);
    const nextState = deleteCollectionIdsFromState(stateBefore, collectionIds);
    try {
      await this.restoreCollectionWorkspaceWithinLock({
        state: nextState,
        tokensByCollection: pruneDeletedCollectionModesFromWorkspace(
          tokensBefore,
          nextState.collections.map((collection) => collection.id),
          collectionIds,
        ),
      });
      for (const collectionId of collectionIds) {
        await this.lintConfigStore.deleteCollectionId(collectionId);
      }
    } catch (err) {
      await this.restoreCollectionWorkspaceWithinLock({
        state: stateBefore,
        tokensByCollection: tokensBefore,
      }).catch(() => {});
      await this.restoreLintConfig(lintConfigBefore).catch(() => {});
      throw err;
    }
  }

  /**
   * Replace an entire collection's tokens. Acquires the token lock so callers
   * do not need to know the storage lock ordering. Used by rollback paths after
   * a successful structural mutation.
   */
  async replaceCollectionTokens(
    collectionId: string,
    tokens: TokenGroup,
  ): Promise<void> {
    await this.tokenStore.lock.withLock(async () => {
      await this.tokenStore.replaceCollectionTokens(collectionId, tokens);
    });
  }

  // ---------------------------------------------------------------------------
  // Route-driven high-level operations
  // ---------------------------------------------------------------------------

  async createCollectionOperation(params: {
    collectionId: string;
    tokens?: TokenGroup;
  }): Promise<CollectionCreateMutationResult> {
    const { collectionId, tokens } = params;
    return this.tokenStore.lock.withLock(async () => {
      const previousCollectionState = await this.collectionStore.loadState();
      if (
        previousCollectionState.collections.some(
          (collection) => collection.id === collectionId,
        )
      ) {
        throw new ConflictError(`Collection "${collectionId}" already exists`);
      }
      await this.createCollection(collectionId, tokens ?? {});
      const afterSnapshot = await snapshotCollection(this.tokenStore, collectionId);
      return {
        result: { id: collectionId },
        afterSnapshot,
        previousCollectionState,
      };
    });
  }

  async duplicateCollectionOperation(params: {
    sourceCollectionId: string;
    requestedName?: string;
  }): Promise<CollectionDuplicateMutationResult> {
    const { sourceCollectionId } = params;
    const requestedName = params.requestedName;
    return this.tokenStore.lock.withLock(async () => {
      const previousCollectionState = await this.collectionStore.loadState();
      requireCollection(previousCollectionState, sourceCollectionId);
      const source = await this.tokenStore.getCollection(sourceCollectionId);
      if (!source) {
        throw new NotFoundError(`Collection "${sourceCollectionId}" not found`);
      }

      let nextName = requestedName?.trim();
      if (!nextName) {
        const allCollectionIds = await this.listCollectionIds();
        nextName = `${sourceCollectionId}-copy`;
        let i = 2;
        while (allCollectionIds.includes(nextName)) {
          nextName = `${sourceCollectionId}-copy-${i++}`;
        }
      } else {
        if (!isValidCollectionName(nextName)) {
          throw new BadRequestError(
            "Collection name must contain only alphanumeric characters, dashes, underscores, and / for folders",
          );
        }
        if (
          previousCollectionState.collections.some(
            (collection) => collection.id === nextName,
          )
        ) {
          throw new ConflictError(`Collection "${nextName}" already exists`);
        }
      }

      const tokensCopy = rewriteTokenGroupCollectionModes(source.tokens, (modes) =>
        copyCollectionModeKey(modes, sourceCollectionId, nextName!),
      ).tokens;
      await this.createCollectionFromSourceDefinition(
        sourceCollectionId,
        nextName,
        tokensCopy,
      );
      const afterSnapshot = await snapshotCollection(this.tokenStore, nextName);
      return {
        result: { id: nextName, originalId: sourceCollectionId },
        afterSnapshot,
        previousCollectionState,
      };
    });
  }

  async deleteCollectionOperation(
    collectionId: string,
  ): Promise<CollectionDeleteMutationResult> {
    return this.tokenStore.lock.withLock(async () => {
      const previousCollectionState = await this.collectionStore.loadState();
      const previousLintConfig = await this.loadLintConfig();
      const previousCollectionDefinition = previousCollectionState.collections.find(
        (collection) => collection.id === collectionId,
      );
      const collection = await this.tokenStore.getCollection(collectionId);
      if (!collection) {
        throw new NotFoundError(`Collection "${collectionId}" not found`);
      }

      const dependencySnapshot = await this.loadDependencySnapshot([collectionId]);
      const blockers = this.computeRemovalBlockersFor(dependencySnapshot, [
        collectionId,
      ]);
      if (blockers.length > 0) {
        throw Object.assign(
          new ConflictError(
            blockers[0]?.message ??
              `Cannot delete collection "${collectionId}" because dependent state still references it.`,
          ),
          { blockers },
        );
      }

      const beforeSnapshot = await this.captureWorkspaceTokenSnapshot(
        previousCollectionState.collections.map((collection) => collection.id),
      );
      await this.deleteCollection(collectionId);
      const afterSnapshot = await this.captureWorkspaceTokenSnapshot();
      return {
        result: { id: collectionId },
        affectedPaths: listChangedSnapshotTokenPaths(beforeSnapshot, afterSnapshot),
        beforeSnapshot,
        afterSnapshot,
        previousCollectionState,
        previousLintConfig,
        previousCollectionDefinition,
      };
    });
  }

  async renameCollectionOperation(params: {
    collectionId: string;
    newName: string;
  }): Promise<CollectionRenameMutationResult> {
    const { collectionId, newName } = params;
    return this.tokenStore.lock.withLock(async () => {
      const previousCollectionState = await this.collectionStore.loadState();
      const dependencySnapshot = await this.loadDependencySnapshot([collectionId]);
      const blockers = this.computeRenameBlockersFor(dependencySnapshot, [
        collectionId,
      ]);
      if (blockers.length > 0) {
        throw Object.assign(
          new ConflictError(
            blockers[0]?.message ??
              `Cannot rename collection "${collectionId}" because recipe targets still derive this collection identity.`,
          ),
          { blockers },
        );
      }

      const beforeSnapshot = await snapshotCollection(this.tokenStore, collectionId);
      await this.renameCollection(collectionId, newName);
      const afterSnapshot = await snapshotCollection(this.tokenStore, newName);
      const affectedPaths = [
        ...new Set([
          ...listSnapshotTokenPaths(beforeSnapshot),
          ...listSnapshotTokenPaths(afterSnapshot),
        ]),
      ];
      return {
        result: { oldId: collectionId, newId: newName },
        affectedPaths,
        beforeSnapshot,
        afterSnapshot,
        previousCollectionState,
      };
    });
  }

  async mergeCollection(params: {
    sourceCollectionId: string;
    targetCollectionId: string;
    resolutions: Record<string, "source" | "target">;
  }): Promise<CollectionMergeMutationResult> {
    const { sourceCollectionId, targetCollectionId, resolutions } = params;
    if (sourceCollectionId === targetCollectionId) {
      throw new BadRequestError(
        "targetCollection must differ from the source collection",
      );
    }
    return this.tokenStore.lock.withLock(async () => {
      const previousCollectionState = await this.collectionStore.loadState();
      const previousLintConfig = await this.loadLintConfig();
      const previousSourceDefinition =
        previousCollectionState.collections.find(
          (collection) => collection.id === sourceCollectionId,
        );
      const source = await this.tokenStore.getCollection(sourceCollectionId);
      if (!source) {
        throw new NotFoundError(`Collection "${sourceCollectionId}" not found`);
      }
      const target = await this.tokenStore.getCollection(targetCollectionId);
      if (!target) {
        throw new NotFoundError(`Collection "${targetCollectionId}" not found`);
      }

      const dependencySnapshot = await this.loadDependencySnapshot([sourceCollectionId]);
      const blockers = this.computeRemovalBlockersFor(dependencySnapshot, [
        sourceCollectionId,
      ]);
      if (blockers.length > 0) {
        throw Object.assign(
          new ConflictError(
            blockers[0]?.message ??
              `Cannot merge collection "${sourceCollectionId}" because dependent state still references it.`,
          ),
          { blockers },
        );
      }

      const conflicts = buildMergeConflicts(
        source.tokens,
        target.tokens,
        sourceCollectionId,
        targetCollectionId,
      );
      const conflictMap = new Map(
        conflicts.map((conflict) => [conflict.path, conflict]),
      );
      for (const [tokenPath, resolution] of Object.entries(resolutions)) {
        if (!conflictMap.has(tokenPath)) {
          throw new BadRequestError(
            `Merge resolution "${tokenPath}" no longer matches a current conflict.`,
          );
        }
        if (resolution !== "source" && resolution !== "target") {
          throw new BadRequestError(
            `Merge resolution for "${tokenPath}" must be "source" or "target".`,
          );
        }
      }

      const previousSourceTokens = structuredClone(source.tokens);
      const previousTargetTokens = structuredClone(target.tokens);
      const nextTargetTokens = structuredClone(target.tokens);
      const targetFlat = new Map(flattenTokenGroup(target.tokens));

      for (const [tokenPath, token] of flattenTokenGroup(source.tokens)) {
        const incomingToken = prepareTokenForCollectionMerge(
          token as unknown as Token,
          sourceCollectionId,
          targetCollectionId,
        );
        const conflict = conflictMap.get(tokenPath);
        if (conflict && resolutions[tokenPath] !== "source") {
          continue;
        }
        if (conflict) {
          applyTokenAtPath(nextTargetTokens, tokenPath, incomingToken);
          continue;
        }

        const existingTargetToken = targetFlat.get(tokenPath);
        if (!existingTargetToken) {
          applyTokenAtPath(nextTargetTokens, tokenPath, incomingToken);
          continue;
        }

        const merged = mergeIncomingModesIntoTargetToken({
          targetToken: existingTargetToken as unknown as Token,
          incomingToken,
          targetCollectionId,
        });
        if (merged.conflict) {
          throw new ConflictError(
            `Merge conflict at "${tokenPath}" changed while merging. Re-check conflicts and try again.`,
          );
        }
        if (merged.changed) {
          applyTokenAtPath(nextTargetTokens, tokenPath, merged.token);
        }
      }

      const beforeSnapshot = await this.captureWorkspaceTokenSnapshot(
        previousCollectionState.collections.map((collection) => collection.id),
      );
      let applied = false;
      let sourceDeleted = false;
      try {
        await this.tokenStore.replaceCollectionTokens(
          targetCollectionId,
          nextTargetTokens,
        );
        applied = true;
        await this.deleteCollection(sourceCollectionId);
        sourceDeleted = true;
        const afterSnapshot = await this.captureWorkspaceTokenSnapshot();
        const affectedPaths = listChangedSnapshotTokenPaths(
          beforeSnapshot,
          afterSnapshot,
        );
        return {
          result: {
            sourceCollectionId,
            targetCollectionId,
            conflictPaths: conflicts.map((conflict) => conflict.path),
          },
          affectedPaths,
          beforeSnapshot,
          afterSnapshot,
          previousTargetTokens,
          previousCollectionState,
          previousLintConfig,
          previousSourceTokens,
          previousSourceDefinition,
        };
      } catch (err) {
        if (sourceDeleted) {
          await this.createCollection(
            sourceCollectionId,
            previousSourceTokens,
            previousSourceDefinition,
          ).catch(() => {});
        }
        if (applied) {
          await this.tokenStore
            .replaceCollectionTokens(targetCollectionId, previousTargetTokens)
            .catch(() => {});
        }
        if (sourceDeleted) {
          await this.restoreLintConfig(previousLintConfig).catch(() => {});
        }
        throw err;
      }
    });
  }

  async splitCollection(params: {
    sourceCollectionId: string;
    deleteOriginal: boolean;
  }): Promise<CollectionSplitMutationResult> {
    const { sourceCollectionId, deleteOriginal } = params;
    return this.tokenStore.lock.withLock(async () => {
      const previousCollectionState = await this.collectionStore.loadState();
      const previousLintConfig = await this.loadLintConfig();
      const previousCollectionDefinition =
        previousCollectionState.collections.find(
          (collection) => collection.id === sourceCollectionId,
        );
      const source = await this.tokenStore.getCollection(sourceCollectionId);
      if (!source) {
        throw new NotFoundError(`Collection "${sourceCollectionId}" not found`);
      }
      const previousSourceTokens = structuredClone(source.tokens);
      const existingCollectionIds = await this.listCollectionIds();
      const splitPreview = buildCollectionSplitPreview(
        sourceCollectionId,
        source.tokens,
        existingCollectionIds,
      );
      if (splitPreview.length === 0) {
        throw new ConflictError(
          "No top-level groups are available to split into new collections.",
        );
      }

      if (deleteOriginal) {
        const dependencySnapshot = await this.loadDependencySnapshot([
          sourceCollectionId,
        ]);
        const blockers = this.computeRemovalBlockersFor(dependencySnapshot, [
          sourceCollectionId,
        ]);
        if (blockers.length > 0) {
          throw Object.assign(
            new ConflictError(
              blockers[0]?.message ??
                `Cannot delete collection "${sourceCollectionId}" after splitting because dependent state still references it.`,
            ),
            { blockers },
          );
        }
      }

      const operationBeforeSnapshot = await this.captureWorkspaceTokenSnapshot(
        previousCollectionState.collections.map((collection) => collection.id),
      );

      const createdCollectionIds: string[] = [];
      let deletedOriginal = false;
      try {
        for (const { key, newCollectionId } of splitPreview) {
          if (existingCollectionIds.includes(newCollectionId)) {
            continue;
          }
          const groupTokens = source.tokens[key];
          if (
            !groupTokens ||
            typeof groupTokens !== "object" ||
            isDTCGToken(groupTokens)
          ) {
            continue;
          }
          const cleanedTokens = stripGeneratedOwnershipFromTokenGroup(
            groupTokens as TokenGroup,
          );
          const renamedTokens = rewriteTokenGroupCollectionModes(
            cleanedTokens,
            (modes) =>
              copyCollectionModeKey(modes, sourceCollectionId, newCollectionId),
          ).tokens;
          await this.createCollectionFromSourceDefinition(
            sourceCollectionId,
            newCollectionId,
            renamedTokens,
          );
          createdCollectionIds.push(newCollectionId);
        }

        if (createdCollectionIds.length === 0) {
          throw new ConflictError(
            "No new collections can be created from this split preview. Rename the destinations before splitting.",
          );
        }

        if (deleteOriginal) {
          await this.deleteCollection(sourceCollectionId);
          deletedOriginal = true;
        }

        const afterSnapshot = await this.captureWorkspaceTokenSnapshot();
        const affectedPaths = listChangedSnapshotTokenPaths(
          operationBeforeSnapshot,
          afterSnapshot,
        );
        return {
          result: {
            sourceCollectionId,
            createdCollectionIds,
            deleteOriginal,
          },
          affectedPaths,
          beforeSnapshot: operationBeforeSnapshot,
          afterSnapshot,
          previousCollectionState,
          previousLintConfig,
          previousSourceTokens,
          previousSourceDefinition: previousCollectionDefinition,
        };
      } catch (err) {
        for (let index = createdCollectionIds.length - 1; index >= 0; index -= 1) {
          await this.deleteCollection(createdCollectionIds[index]).catch(() => {});
        }
        if (deletedOriginal) {
          await this.createCollection(
            sourceCollectionId,
            previousSourceTokens,
            previousCollectionDefinition,
          ).catch(() => {});
          await this.restoreLintConfig(previousLintConfig).catch(() => {});
        }
        throw err;
      }
    });
  }

  async renameFolder(params: {
    fromFolder: string;
    toFolder: string;
  }): Promise<CollectionFolderRenameMutationResult> {
    const { fromFolder, toFolder } = params;
    if (fromFolder === toFolder) {
      throw new BadRequestError("Target folder must differ from the source folder");
    }
    return this.tokenStore.lock.withLock(async () => {
      const previousCollectionState = await this.collectionStore.loadState();
      const allCollectionIds = await this.listCollectionIds();
      const folderCollectionIds = getFolderCollectionIds(
        allCollectionIds,
        fromFolder,
      );
      if (folderCollectionIds.length === 0) {
        throw new NotFoundError(`Folder "${fromFolder}" not found`);
      }

      const dependencySnapshot = await this.loadDependencySnapshot(
        folderCollectionIds,
      );
      const blockers = this.computeRenameBlockersFor(
        dependencySnapshot,
        folderCollectionIds,
      );
      if (blockers.length > 0) {
        throw Object.assign(
          new ConflictError(
            blockers[0]?.message ??
              `Cannot rename folder "${fromFolder}" because recipe targets still derive one or more collection ids in it.`,
          ),
          { blockers },
        );
      }

      const renames = folderCollectionIds.map((collectionId) => ({
        from: collectionId,
        to: `${toFolder}${collectionId.slice(fromFolder.length)}`,
      }));
      const conflicts = findFolderRenameConflicts(
        allCollectionIds,
        folderCollectionIds,
        renames,
      );
      if (conflicts.length > 0) {
        throw Object.assign(
          new ConflictError(
            `Folder rename would collide with existing collections: ${conflicts.join(", ")}`,
          ),
          { conflicts },
        );
      }

      const beforeSnapshot = await snapshotCollections(
        this.tokenStore,
        folderCollectionIds,
      );
      const completed: FolderCollectionRename[] = [];
      try {
        for (const rename of sortFolderRenamePairsForApply(renames)) {
          await this.renameCollection(rename.from, rename.to);
          completed.push(rename);
        }
        const renamedCollectionIds = renames.map(({ to }) => to);
        const afterSnapshot = await snapshotCollections(
          this.tokenStore,
          renamedCollectionIds,
        );
        const affectedPaths = [
          ...new Set([
            ...listSnapshotTokenPaths(beforeSnapshot),
            ...listSnapshotTokenPaths(afterSnapshot),
          ]),
        ];
        return {
          renamedCollections: renames,
          affectedPaths,
          beforeSnapshot,
          afterSnapshot,
          previousCollectionState,
          finalCollectionIds: await this.listCollectionIds(),
        };
      } catch (err) {
        for (const rename of sortFolderRenamePairsForRollback(completed)) {
          await this.renameCollection(rename.from, rename.to).catch(() => {});
        }
        throw err;
      }
    });
  }

  async mergeFolder(params: {
    sourceFolder: string;
    targetFolder: string;
  }): Promise<CollectionFolderRenameMutationResult> {
    const { sourceFolder, targetFolder } = params;
    if (sourceFolder === targetFolder) {
      throw new BadRequestError("Target folder must differ from the source folder");
    }
    return this.tokenStore.lock.withLock(async () => {
      const previousCollectionState = await this.collectionStore.loadState();
      const allCollectionIds = await this.listCollectionIds();
      const sourceCollectionIds = getFolderCollectionIds(
        allCollectionIds,
        sourceFolder,
      );
      if (sourceCollectionIds.length === 0) {
        throw new NotFoundError(`Folder "${sourceFolder}" not found`);
      }

      const dependencySnapshot = await this.loadDependencySnapshot(
        sourceCollectionIds,
      );
      const blockers = this.computeRenameBlockersFor(
        dependencySnapshot,
        sourceCollectionIds,
      );
      if (blockers.length > 0) {
        throw Object.assign(
          new ConflictError(
            blockers[0]?.message ??
              `Cannot merge folder "${sourceFolder}" because recipe targets still derive one or more collection ids in it.`,
          ),
          { blockers },
        );
      }

      const targetCollectionIds = getFolderCollectionIds(
        allCollectionIds,
        targetFolder,
      );
      if (targetCollectionIds.length === 0) {
        throw new NotFoundError(`Target folder "${targetFolder}" not found`);
      }

      const renames = sourceCollectionIds.map((collectionId) => ({
        from: collectionId,
        to: `${targetFolder}${collectionId.slice(sourceFolder.length)}`,
      }));
      const conflicts = findFolderRenameConflicts(
        allCollectionIds,
        sourceCollectionIds,
        renames,
      );
      if (conflicts.length > 0) {
        throw Object.assign(
          new ConflictError(
            `Folder merge would collide with existing collections: ${conflicts.join(", ")}`,
          ),
          { conflicts },
        );
      }

      const beforeSnapshot = await snapshotCollections(
        this.tokenStore,
        sourceCollectionIds,
      );
      const completed: FolderCollectionRename[] = [];
      try {
        for (const rename of sortFolderRenamePairsForApply(renames)) {
          await this.renameCollection(rename.from, rename.to);
          completed.push(rename);
        }
        const movedCollectionIds = renames.map(({ to }) => to);
        const afterSnapshot = await snapshotCollections(
          this.tokenStore,
          movedCollectionIds,
        );
        const affectedPaths = [
          ...new Set([
            ...listSnapshotTokenPaths(beforeSnapshot),
            ...listSnapshotTokenPaths(afterSnapshot),
          ]),
        ];
        return {
          renamedCollections: renames,
          affectedPaths,
          beforeSnapshot,
          afterSnapshot,
          previousCollectionState,
          finalCollectionIds: await this.listCollectionIds(),
        };
      } catch (err) {
        for (const rename of sortFolderRenamePairsForRollback(completed)) {
          await this.renameCollection(rename.from, rename.to).catch(() => {});
        }
        throw err;
      }
    });
  }

  async deleteFolder(folder: string): Promise<CollectionFolderDeleteMutationResult> {
    return this.tokenStore.lock.withLock(async () => {
      const previousCollectionState = await this.collectionStore.loadState();
      const previousLintConfig = await this.loadLintConfig();
      const allCollectionIds = await this.listCollectionIds();
      const folderCollectionIds = getFolderCollectionIds(
        allCollectionIds,
        folder,
      );
      if (folderCollectionIds.length === 0) {
        throw new NotFoundError(`Folder "${folder}" not found`);
      }

      const dependencySnapshot = await this.loadDependencySnapshot(
        folderCollectionIds,
      );
      const blockers = this.computeRemovalBlockersFor(
        dependencySnapshot,
        folderCollectionIds,
      );
      if (blockers.length > 0) {
        throw Object.assign(
          new ConflictError(
            blockers[0]?.message ??
              `Cannot delete folder "${folder}" because dependent state still references its collections.`,
          ),
          { blockers },
        );
      }

      const beforeSnapshot = await this.captureWorkspaceTokenSnapshot(
        previousCollectionState.collections.map((collection) => collection.id),
      );
      await this.deleteCollections(folderCollectionIds);
      const afterSnapshot = await this.captureWorkspaceTokenSnapshot();
      return {
        deletedCollectionIds: folderCollectionIds,
        affectedPaths: listChangedSnapshotTokenPaths(beforeSnapshot, afterSnapshot),
        beforeSnapshot,
        afterSnapshot,
        previousCollectionState,
        previousLintConfig,
        finalCollectionIds: await this.listCollectionIds(),
      };
    });
  }

  async reorderCollectionsOperation(
    order: string[],
  ): Promise<{ previousOrder: string[] }> {
    return this.tokenStore.lock.withLock(async () => {
      const previousOrder = await this.listCollectionIds();
      await this.reorderCollections(order);
      return { previousOrder };
    });
  }

  async reorderFoldersOperation(params: {
    currentOrder: string[];
    nextOrder: string[];
  }): Promise<{ previousOrder: string[] }> {
    const { currentOrder, nextOrder } = params;
    return this.tokenStore.lock.withLock(async () => {
      const previousOrder = await this.listCollectionIds();
      if (
        previousOrder.length !== currentOrder.length ||
        currentOrder.some((id) => !previousOrder.includes(id))
      ) {
        throw new BadRequestError(
          "Collection order changed between request and execution",
        );
      }
      await this.reorderCollections(nextOrder);
      return { previousOrder };
    });
  }

  // ---------------------------------------------------------------------------
  // Mode / view mutation primitives
  // ---------------------------------------------------------------------------

  private async collectModeMutationPatches(
    mutateModes: (token: Token) => TokenModeValues | null,
  ): Promise<TokenPatchesByCollection> {
    const patchesByCollection: TokenPatchesByCollection = new Map();

    for (const collectionId of await this.listCollectionIds()) {
      const flatTokens =
        await this.tokenStore.getFlatTokensForCollection(collectionId);
      const patches: TokenPatch[] = [];

      for (const [tokenPath, token] of Object.entries(flatTokens)) {
        const nextModes = mutateModes(token);
        if (nextModes === null) {
          continue;
        }

        const nextToken = structuredClone(token);
        writeTokenCollectionModeValues(nextToken, nextModes);

        if (
          JSON.stringify(nextToken.$extensions ?? null) ===
          JSON.stringify(token.$extensions ?? null)
        ) {
          continue;
        }

        patches.push({
          path: tokenPath,
          patch: { $extensions: nextToken.$extensions },
        });
      }

      if (patches.length > 0) {
        patchesByCollection.set(collectionId, patches);
      }
    }

    return patchesByCollection;
  }

  private async mutateCollectionState<T>(
    mutate: (
      state: CollectionState,
    ) => Promise<{ result: T; state: CollectionState }>,
  ): Promise<CollectionStateMutationResult<T>> {
    let previousState: CollectionState | null = null;
    const result = await this.collectionStore.withStateLock(async (state) => {
      previousState = structuredClone(state);
      const next = await mutate(structuredClone(state));
      return {
        state: structuredClone(next.state),
        result: next.result,
      };
    });

    return {
      previousState: previousState ?? { collections: [], views: [] },
      result,
    };
  }

  private async mutateCollectionStateAndTokens<T>(
    mutate: (state: CollectionState) => Promise<{
      result: T;
      state: CollectionState;
      tokenPatchesByCollection?: TokenPatchesByCollection;
    }>,
  ): Promise<CollectionStateAndTokenMutationResult<T>> {
    const beforeSnapshot: Record<string, SnapshotEntry> = {};
    const afterSnapshot: Record<string, SnapshotEntry> = {};
    const touchedPathsByCollection = new Map<string, string[]>();
    let previousState: CollectionState | null = null;

    try {
      const result = await this.tokenStore.lock.withLock(async () =>
        this.collectionStore.withStateLock(async (state) => {
          previousState = structuredClone(state);
          const next = await mutate(structuredClone(state));

          for (const [collectionId, patches] of next.tokenPatchesByCollection ?? []) {
            const paths = patches.map((patch) => patch.path);
            touchedPathsByCollection.set(collectionId, paths);
            mergeCollectionSnapshots(
              beforeSnapshot,
              collectionId,
              await snapshotPaths(this.tokenStore, collectionId, paths),
            );
          }

          for (const [collectionId, patches] of next.tokenPatchesByCollection ?? []) {
            await this.tokenStore.batchUpdateTokens(collectionId, patches);
          }

          for (const [collectionId, paths] of touchedPathsByCollection.entries()) {
            mergeCollectionSnapshots(
              afterSnapshot,
              collectionId,
              await snapshotPaths(this.tokenStore, collectionId, paths),
            );
          }

          return {
            state: structuredClone(next.state),
            result: next.result,
          };
        }),
      );

      return {
        affectedPaths: [
          ...new Set(
            Array.from(touchedPathsByCollection.values()).flatMap((paths) => paths),
          ),
        ],
        afterSnapshot,
        beforeSnapshot,
        previousState: previousState ?? { collections: [], views: [] },
        result,
      };
    } catch (err) {
      if (previousState !== null || Object.keys(beforeSnapshot).length > 0) {
        await this.tokenStore.lock.withLock(async () => {
          await this.collectionStore.withStateLock(async (state) => {
            if (Object.keys(beforeSnapshot).length > 0) {
              const snapshotByCollection =
                groupSnapshotEntriesByCollection(beforeSnapshot);
              for (const [collectionId, items] of snapshotByCollection.entries()) {
                await this.tokenStore.restoreSnapshot(collectionId, items);
              }
            }

            return {
              state: structuredClone(previousState ?? state),
              result: undefined,
            };
          });
        });
      }
      throw err;
    }
  }

  async upsertMode(
    collectionId: string,
    modeName: string,
  ): Promise<
    CollectionStateMutationResult<{ option: CollectionMode; status: 200 | 201 }>
  > {
    return this.mutateCollectionState(async (state) => {
      const nextCollections = structuredClone(state.collections);
      const collectionIndex = nextCollections.findIndex(
        (collection) => collection.id === collectionId,
      );
      if (collectionIndex === -1) {
        throw new NotFoundError(`Collection "${collectionId}" not found`);
      }

      const collection = nextCollections[collectionIndex];
      const optionIndex = collection.modes.findIndex(
        (option) => option.name === modeName,
      );
      const option = { name: modeName };
      const status: 200 | 201 = optionIndex >= 0 ? 200 : 201;
      if (optionIndex >= 0) {
        collection.modes[optionIndex] = option;
      } else {
        collection.modes.push(option);
      }

      return {
        result: { option, status },
        state: {
          collections: nextCollections,
          views: state.views,
        },
      };
    });
  }

  async renameMode(
    collectionId: string,
    previousModeName: string,
    nextModeName: string,
  ): Promise<CollectionStateAndTokenMutationResult<CollectionMode>> {
    return this.mutateCollectionStateAndTokens(async (state) => {
      const nextCollections = structuredClone(state.collections);
      const collectionIndex = nextCollections.findIndex(
        (collection) => collection.id === collectionId,
      );
      if (collectionIndex === -1) {
        throw new NotFoundError(`Collection "${collectionId}" not found`);
      }

      const collection = nextCollections[collectionIndex];
      const modeIndex = collection.modes.findIndex(
        (mode) => mode.name === previousModeName,
      );
      if (modeIndex === -1) {
        throw new NotFoundError(
          `Mode "${previousModeName}" not found in collection "${collectionId}"`,
        );
      }
      if (
        nextModeName !== previousModeName &&
        collection.modes.some((mode) => mode.name === nextModeName)
      ) {
        throw new ConflictError(
          `Mode "${nextModeName}" already exists in collection "${collectionId}"`,
        );
      }

      const tokenPatchesByCollection =
        nextModeName === previousModeName
          ? undefined
          : await this.collectModeMutationPatches((token) => {
              const nextModes = readTokenCollectionModeValues(token);
              const collectionModes = nextModes[collectionId];
              if (!collectionModes || !(previousModeName in collectionModes)) {
                return null;
              }

              if (
                nextModeName in collectionModes &&
                JSON.stringify(collectionModes[nextModeName]) !==
                  JSON.stringify(collectionModes[previousModeName])
              ) {
                throw new ConflictError(
                  `Token-authored mode data already exists under "${nextModeName}" in collection "${collectionId}"`,
                );
              }

              collectionModes[nextModeName] = collectionModes[previousModeName];
              delete collectionModes[previousModeName];
              return nextModes;
            });

      collection.modes[modeIndex] = { name: nextModeName };
      return {
        result: collection.modes[modeIndex],
        state: {
          collections: nextCollections,
          views: state.views.map((view) => ({
            ...view,
            selections:
              view.selections[collectionId] === previousModeName
                ? {
                    ...view.selections,
                    [collectionId]: nextModeName,
                  }
                : view.selections,
          })),
        },
        tokenPatchesByCollection,
      };
    });
  }

  async reorderModes(
    collectionId: string,
    modeNames: string[],
  ): Promise<CollectionStateMutationResult<TokenCollection>> {
    return this.mutateCollectionState(async (state) => {
      const nextCollections = structuredClone(state.collections);
      const collectionIndex = nextCollections.findIndex(
        (collection) => collection.id === collectionId,
      );
      if (collectionIndex === -1) {
        throw new NotFoundError(`Collection "${collectionId}" not found`);
      }

      const collection = nextCollections[collectionIndex];
      const byName = new Map(
        collection.modes.map((mode) => [mode.name, mode]),
      );
      for (const modeName of modeNames) {
        if (!byName.has(modeName)) {
          throw new BadRequestError(
            `Mode "${modeName}" not found in collection "${collectionId}"`,
          );
        }
      }
      if (
        modeNames.length !== collection.modes.length ||
        new Set(modeNames).size !== collection.modes.length
      ) {
        throw new BadRequestError(
          "modes must list every mode name exactly once",
        );
      }

      collection.modes = modeNames.map((modeName) => byName.get(modeName)!);
      return {
        result: collection,
        state: {
          collections: nextCollections,
          views: state.views,
        },
      };
    });
  }

  async deleteMode(
    collectionId: string,
    modeName: string,
  ): Promise<CollectionStateAndTokenMutationResult<void>> {
    return this.mutateCollectionStateAndTokens(async (state) => {
      const nextCollections = structuredClone(state.collections);
      const collectionIndex = nextCollections.findIndex(
        (collection) => collection.id === collectionId,
      );
      if (collectionIndex === -1) {
        throw new NotFoundError(`Collection "${collectionId}" not found`);
      }

      const collection = nextCollections[collectionIndex];
      const filteredModes = collection.modes.filter(
        (mode) => mode.name !== modeName,
      );
      if (filteredModes.length === collection.modes.length) {
        throw new NotFoundError(
          `Mode "${modeName}" not found in collection "${collectionId}"`,
        );
      }

      const tokenPatchesByCollection = await this.collectModeMutationPatches(
        (token) => {
          const nextModes = readTokenCollectionModeValues(token);
          const collectionModes = nextModes[collectionId];
          if (!collectionModes || !(modeName in collectionModes)) {
            return null;
          }

          delete collectionModes[modeName];
          if (Object.keys(collectionModes).length === 0) {
            delete nextModes[collectionId];
          }
          return nextModes;
        },
      );

      collection.modes = filteredModes;
      return {
        result: undefined,
        state: {
          collections: nextCollections,
          views: state.views.map((view) => {
            if (view.selections[collectionId] !== modeName) {
              return view;
            }
            const nextSelections = { ...view.selections };
            delete nextSelections[collectionId];
            return {
              ...view,
              selections: nextSelections,
            };
          }),
        },
        tokenPatchesByCollection,
      };
    });
  }

  async createView(
    view: { id: string; name: string; selections: SelectedModes },
  ): Promise<CollectionStateMutationResult<ViewPreset>> {
    return this.mutateCollectionState(async (state) => {
      if (state.views.some((candidate) => candidate.id === view.id)) {
        throw new ConflictError(`View "${view.id}" already exists`);
      }

      const nextView: ViewPreset = {
        id: view.id,
        name: view.name,
        selections: normalizeSelectedModes(state.collections, view.selections),
      };

      return {
        result: nextView,
        state: {
          ...state,
          views: [...state.views, nextView],
        },
      };
    });
  }

  async updateView(
    view: { id: string; name: string; selections: SelectedModes },
  ): Promise<CollectionStateMutationResult<ViewPreset>> {
    return this.mutateCollectionState(async (state) => {
      const viewIndex = state.views.findIndex(
        (candidate) => candidate.id === view.id,
      );
      if (viewIndex === -1) {
        throw new NotFoundError(`View "${view.id}" not found`);
      }

      const nextView: ViewPreset = {
        id: view.id,
        name: view.name,
        selections: normalizeSelectedModes(state.collections, view.selections),
      };
      const nextViews = state.views.slice();
      nextViews[viewIndex] = nextView;

      return {
        result: nextView,
        state: {
          ...state,
          views: nextViews,
        },
      };
    });
  }

  async deleteView(viewId: string): Promise<CollectionStateMutationResult<ViewPreset>> {
    return this.mutateCollectionState(async (state) => {
      const existingView = state.views.find((view) => view.id === viewId);
      if (!existingView) {
        throw new NotFoundError(`View "${viewId}" not found`);
      }

      return {
        result: existingView,
        state: {
          ...state,
          views: state.views.filter((view) => view.id !== viewId),
        },
      };
    });
  }
}
