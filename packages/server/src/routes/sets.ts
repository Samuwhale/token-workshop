import type { FastifyPluginAsync } from "fastify";
import {
  flattenTokenGroup,
  isDTCGToken,
  type DTCGToken,
  type Token,
  type TokenGroup,
  type CollectionDefinition,
  type ViewPreset,
} from "@tokenmanager/core";
import type {
  FieldChange,
  FieldChangeOperationMetadata,
  RollbackStep,
} from "../services/operation-log.js";
import type { SetMetadataState } from "../services/token-store.js";
import { handleRouteError } from "../errors.js";
import {
  getSnapshotTokenPath,
  listSnapshotTokenPaths,
  snapshotSet,
  snapshotSets,
  type SnapshotEntry,
} from "../services/operation-log.js";
import { stableStringify } from "../services/stable-stringify.js";
import { setTokenAtPath } from "../services/token-tree-utils.js";

type SetStructuralOperation = "delete" | "merge" | "split";

interface SetResolverMeta {
  name: string;
  referencedSets: string[];
}

interface SetRecipeMeta {
  id: string;
  name: string;
  targetSet: string;
  targetGroup: string;
}

interface SetResolverImpact {
  name: string;
}

interface SetRecipeOwnershipImpact {
  recipeId: string;
  recipeName: string;
  targetGroup: string;
  tokenCount: number;
  samplePaths: string[];
}

interface SetRecipeTargetImpact {
  recipeId: string;
  recipeName: string;
  targetGroup: string;
}

interface SetPreflightImpact {
  name: string;
  tokenCount: number;
  metadata: {
    description?: string;
  };
  resolverRefs: SetResolverImpact[];
  generatedOwnership: SetRecipeOwnershipImpact[];
  recipeTargets: SetRecipeTargetImpact[];
}

type SetPreflightBlockerCode =
  | "generated-token-ownership"
  | "recipe-target-set"
  | "resolver-set-ref";

interface SetPreflightBlocker {
  id: string;
  code: SetPreflightBlockerCode;
  setName: string;
  message: string;
  recipeId?: string;
  recipeName?: string;
}

interface SetMergeConflict {
  path: string;
  sourceValue: unknown;
  targetValue: unknown;
}

interface SetSplitPreviewItem {
  key: string;
  newName: string;
  count: number;
  existing: boolean;
}

interface SetStructuralPreflightResponse {
  operation: SetStructuralOperation;
  affectedSets: SetPreflightImpact[];
  blockers: SetPreflightBlocker[];
  warnings: string[];
  mergeConflicts: SetMergeConflict[];
  splitPreview: SetSplitPreviewItem[];
}

interface LoadedSetDependencyData {
  name: string;
  tokens: TokenGroup;
  metadata: SetMetadataState;
}

interface CollectionDocumentState {
  dimensions: CollectionDefinition[];
  views: ViewPreset[];
}

type TokenModeMap = Record<string, Record<string, unknown>>;

interface SetDependencySnapshot {
  resolvers: SetResolverMeta[];
  recipes: SetRecipeMeta[];
  allOwnedTokens: Array<{ setName: string; path: string; recipeId: string }>;
  setsByName: Map<string, LoadedSetDependencyData>;
  impactsBySet: Map<string, SetPreflightImpact>;
}

const SET_NAME_RE = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/;
const FOLDER_ITEM_SUFFIX = "/";
const RECIPE_EXTENSION_KEY = "com.tokenmanager.recipe";

interface FolderSetRename {
  from: string;
  to: string;
}

function isValidSetName(name: string): boolean {
  return SET_NAME_RE.test(name);
}

function isFolderItemKey(item: string): boolean {
  return item.endsWith(FOLDER_ITEM_SUFFIX);
}

function topLevelFolderName(setName: string): string | null {
  const slashIdx = setName.indexOf("/");
  return slashIdx === -1 ? null : setName.slice(0, slashIdx);
}

function buildTopLevelItems(sets: string[]): string[] {
  const items: string[] = [];
  const seenFolders = new Set<string>();
  for (const setName of sets) {
    const folder = topLevelFolderName(setName);
    if (!folder) {
      items.push(setName);
      continue;
    }
    if (seenFolders.has(folder)) continue;
    seenFolders.add(folder);
    items.push(`${folder}${FOLDER_ITEM_SUFFIX}`);
  }
  return items;
}

function expandTopLevelItems(sets: string[], order: string[]): string[] {
  const standaloneSets = new Map<string, string>();
  const folderSets = new Map<string, string[]>();
  for (const setName of sets) {
    const folder = topLevelFolderName(setName);
    if (!folder) {
      standaloneSets.set(setName, setName);
      continue;
    }
    const members = folderSets.get(folder) ?? [];
    members.push(setName);
    folderSets.set(folder, members);
  }

  const expanded: string[] = [];
  for (const item of order) {
    if (isFolderItemKey(item)) {
      expanded.push(...(folderSets.get(item.slice(0, -1)) ?? []));
      continue;
    }
    if (standaloneSets.has(item)) {
      expanded.push(item);
    }
  }
  return expanded;
}

function getFolderSetNames(allSets: string[], folder: string): string[] {
  const prefix = `${folder}/`;
  return allSets.filter((setName) => setName.startsWith(prefix));
}

function replaceFolderPrefix(
  setName: string,
  fromFolder: string,
  toFolder: string,
): string {
  return `${toFolder}${setName.slice(fromFolder.length)}`;
}

function sortFolderRenamePairsForApply(
  pairs: FolderSetRename[],
): FolderSetRename[] {
  return [...pairs].sort((left, right) => right.from.length - left.from.length);
}

function sortFolderRenamePairsForRollback(
  pairs: FolderSetRename[],
): FolderSetRename[] {
  return [...pairs].reverse().map(({ from, to }) => ({ from: to, to: from }));
}

function findFolderRenameConflicts(
  allSets: string[],
  sourceSetNames: string[],
  renames: FolderSetRename[],
): string[] {
  const sourceSetLookup = new Set(sourceSetNames);
  const conflicts = new Set<string>();
  const targetCounts = new Map<string, number>();

  for (const rename of renames) {
    targetCounts.set(rename.to, (targetCounts.get(rename.to) ?? 0) + 1);
  }

  for (const [target, count] of targetCounts) {
    if (count > 1) {
      conflicts.add(target);
    }
  }

  for (const rename of renames) {
    if (!isValidSetName(rename.to)) {
      conflicts.add(rename.to);
      continue;
    }
    if (!sourceSetLookup.has(rename.to) && allSets.includes(rename.to)) {
      conflicts.add(rename.to);
    }
  }

  return [...conflicts].sort((a, b) => a.localeCompare(b));
}

function readTokenModes(token: Token): TokenModeMap {
  const rawModes = (
    token.$extensions?.tokenmanager as Record<string, unknown> | undefined
  )?.modes;
  if (!rawModes || typeof rawModes !== "object" || Array.isArray(rawModes)) {
    return {};
  }

  const modes: TokenModeMap = {};
  for (const [collectionId, optionMap] of Object.entries(rawModes)) {
    if (!optionMap || typeof optionMap !== "object" || Array.isArray(optionMap)) {
      continue;
    }
    modes[collectionId] = { ...(optionMap as Record<string, unknown>) };
  }
  return modes;
}

function buildExtensionsWithModes(
  token: Token,
  nextModes: TokenModeMap,
): Token["$extensions"] | undefined {
  const nextExtensions = token.$extensions
    ? structuredClone(token.$extensions)
    : {};
  const existingTokenManager =
    nextExtensions.tokenmanager &&
    typeof nextExtensions.tokenmanager === "object" &&
    !Array.isArray(nextExtensions.tokenmanager)
      ? { ...(nextExtensions.tokenmanager as Record<string, unknown>) }
      : {};

  if (Object.keys(nextModes).length > 0) {
    existingTokenManager.modes = nextModes;
    nextExtensions.tokenmanager = existingTokenManager;
  } else if (Object.keys(existingTokenManager).length > 0) {
    delete existingTokenManager.modes;
    if (Object.keys(existingTokenManager).length > 0) {
      nextExtensions.tokenmanager = existingTokenManager;
    } else {
      delete nextExtensions.tokenmanager;
    }
  } else {
    delete nextExtensions.tokenmanager;
  }

  return Object.keys(nextExtensions).length > 0 ? nextExtensions : undefined;
}

function writeTokenModes(token: Token, nextModes: TokenModeMap): void {
  const nextExtensions = buildExtensionsWithModes(token, nextModes);
  if (nextExtensions) {
    token.$extensions = nextExtensions;
    return;
  }
  delete token.$extensions;
}

function renameCollectionModes(
  modes: TokenModeMap,
  oldName: string,
  newName: string,
): TokenModeMap | null {
  if (!(oldName in modes)) {
    return null;
  }

  const nextModes = { ...modes, [newName]: structuredClone(modes[oldName]) };
  delete nextModes[oldName];
  return nextModes;
}

function copyCollectionModesToNewCollection(
  modes: TokenModeMap,
  sourceName: string,
  targetName: string,
): TokenModeMap | null {
  if (!(sourceName in modes)) {
    return null;
  }

  const nextModes = {
    ...modes,
    [targetName]: structuredClone(modes[sourceName]),
  };
  delete nextModes[sourceName];
  return nextModes;
}

function prepareTokenForCollectionMerge(
  token: Token,
  sourceCollection: string,
  targetCollection: string,
): Token {
  const sanitized = stripGeneratedOwnershipFromToken(
    structuredClone(token as DTCGToken),
  );
  const nextModes = copyCollectionModesToNewCollection(
    readTokenModes(sanitized),
    sourceCollection,
    targetCollection,
  );
  if (nextModes) {
    writeTokenModes(sanitized, nextModes);
  }
  return sanitized;
}

function mergeIncomingModesIntoTargetToken(params: {
  targetToken: Token;
  incomingToken: Token;
  targetCollection: string;
}): {
  token: Token;
  changed: boolean;
  conflict: boolean;
  incomingModeValues: Record<string, unknown>;
  targetModeValues: Record<string, unknown>;
} {
  const { targetToken, incomingToken, targetCollection } = params;
  const incomingModes = readTokenModes(incomingToken);
  const incomingCollectionModes = incomingModes[targetCollection];
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
  const nextModes = readTokenModes(nextToken);
  const existingCollectionModes = {
    ...(nextModes[targetCollection] ?? {}),
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

  nextModes[targetCollection] = existingCollectionModes;
  writeTokenModes(nextToken, nextModes);

  return {
    token: nextToken,
    changed: true,
    conflict: false,
    incomingModeValues: structuredClone(incomingCollectionModes),
    targetModeValues: structuredClone(existingCollectionModes),
  };
}

function rewriteTokenGroupCollectionModes(
  tokens: TokenGroup,
  rewrite: (modes: TokenModeMap) => TokenModeMap | null,
): { tokens: TokenGroup; changed: boolean } {
  const nextTokens = structuredClone(tokens);
  let changed = false;

  for (const [, token] of flattenTokenGroup(nextTokens)) {
    const nextModes = rewrite(readTokenModes(token as Token));
    if (!nextModes) {
      continue;
    }
    writeTokenModes(token as Token, nextModes);
    changed = true;
  }

  return { tokens: nextTokens, changed };
}

function renameCollectionIdsInState(
  state: CollectionDocumentState,
  renames: FolderSetRename[],
): CollectionDocumentState {
  if (renames.length === 0) {
    return state;
  }

  const renameMap = new Map(renames.map(({ from, to }) => [from, to]));
  return {
    dimensions: state.dimensions.map((dimension) => {
      const nextId = renameMap.get(dimension.id);
      return nextId
        ? { ...dimension, id: nextId, name: nextId }
        : dimension;
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
  state: CollectionDocumentState,
  sourceName: string,
  targetNames: string[],
): CollectionDocumentState {
  if (targetNames.length === 0) {
    return state;
  }

  const source = state.dimensions.find((dimension) => dimension.id === sourceName);
  return {
    dimensions:
      source &&
      targetNames.every(
        (targetName) =>
          !state.dimensions.some((dimension) => dimension.id === targetName),
      )
        ? [
            ...state.dimensions,
            ...targetNames.map((targetName) => ({
              id: targetName,
              name: targetName,
              options: structuredClone(source.options),
            })),
          ]
        : state.dimensions,
    views: state.views.map((view) => {
      if (!(sourceName in view.selections)) {
        return view;
      }
      const nextSelections = { ...view.selections };
      for (const targetName of targetNames) {
        nextSelections[targetName] = nextSelections[sourceName];
      }
      return {
        ...view,
        selections: nextSelections,
      };
    }),
  };
}

function deleteCollectionIdsFromState(
  state: CollectionDocumentState,
  setNames: string[],
): CollectionDocumentState {
  if (setNames.length === 0) {
    return state;
  }

  const deletedSetNames = new Set(setNames);
  return {
    dimensions: state.dimensions.filter(
      (dimension) => !deletedSetNames.has(dimension.id),
    ),
    views: state.views.map((view) => {
      let changed = false;
      const nextSelections = { ...view.selections };
      for (const setName of deletedSetNames) {
        if (!(setName in nextSelections)) {
          continue;
        }
        delete nextSelections[setName];
        changed = true;
      }
      return changed ? { ...view, selections: nextSelections } : view;
    }),
  };
}

function buildGeneratedOwnershipImpacts(
  setName: string,
  allOwnedTokens: Array<{ setName: string; path: string; recipeId: string }>,
  recipeById: Map<string, SetRecipeMeta>,
): SetRecipeOwnershipImpact[] {
  const grouped = new Map<
    string,
    { tokenCount: number; samplePaths: string[] }
  >();
  for (const token of allOwnedTokens) {
    if (token.setName !== setName) continue;
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
  setName: string,
  recipes: SetRecipeMeta[],
): SetRecipeTargetImpact[] {
  return recipes
    .filter((recipe) => recipe.targetSet === setName)
    .map((recipe) => ({
      recipeId: recipe.id,
      recipeName: recipe.name,
      targetGroup: recipe.targetGroup,
    }))
    .sort((a, b) => a.recipeName.localeCompare(b.recipeName));
}

function buildTokenGroupFromSnapshot(
  snapshot: Record<string, SnapshotEntry>,
  setName: string,
): TokenGroup {
  const tokens: TokenGroup = {};
  for (const [snapshotKey, entry] of Object.entries(snapshot)) {
    if (entry.setName !== setName || entry.token === null) {
      continue;
    }
    setTokenAtPath(
      tokens,
      getSnapshotTokenPath(snapshotKey, setName),
      structuredClone(entry.token),
    );
  }
  return tokens;
}

function buildSetImpact(params: {
  setName: string;
  tokens: TokenGroup;
  metadata: SetMetadataState;
  resolvers: SetResolverMeta[];
  recipes: SetRecipeMeta[];
  allOwnedTokens: Array<{ setName: string; path: string; recipeId: string }>;
}): SetPreflightImpact {
  const {
    setName,
    tokens,
    metadata,
    resolvers,
    recipes,
    allOwnedTokens,
  } = params;
  const recipeById = new Map(
    recipes.map((recipe) => [recipe.id, recipe]),
  );
  return {
    name: setName,
    tokenCount: flattenTokenGroup(tokens).size,
    metadata: {
      description: metadata.description,
    },
    resolverRefs: resolvers
      .filter((resolver) => resolver.referencedSets.includes(setName))
      .map((resolver) => ({ name: resolver.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    generatedOwnership: buildGeneratedOwnershipImpacts(
      setName,
      allOwnedTokens,
      recipeById,
    ),
    recipeTargets: buildRecipeTargets(setName, recipes),
  };
}

function buildRecipeTargetBlockers(
  setImpact: SetPreflightImpact,
): SetPreflightBlocker[] {
  return setImpact.recipeTargets.map((recipe) => ({
    id: `recipe-target:${recipe.recipeId}:${setImpact.name}`,
    code: "recipe-target-set",
    setName: setImpact.name,
    recipeId: recipe.recipeId,
    recipeName: recipe.recipeName,
    message: `Recipe "${recipe.recipeName}" still targets "${setImpact.name}"${recipe.targetGroup ? ` at ${recipe.targetGroup}` : ""}.`,
  }));
}

function buildResolverReferenceBlockers(
  setImpact: SetPreflightImpact,
): SetPreflightBlocker[] {
  return setImpact.resolverRefs.map((resolver) => ({
    id: `resolver-ref:${resolver.name}:${setImpact.name}`,
    code: "resolver-set-ref",
    setName: setImpact.name,
    message: `Resolver "${resolver.name}" still references "${setImpact.name}".`,
  }));
}

function buildGeneratedOwnershipBlockers(
  setImpact: SetPreflightImpact,
): SetPreflightBlocker[] {
  return setImpact.generatedOwnership.map((ownership) => ({
    id: `generated-ownership:${ownership.recipeId}:${setImpact.name}`,
    code: "generated-token-ownership",
    setName: setImpact.name,
    recipeId: ownership.recipeId,
    recipeName: ownership.recipeName,
    message: `Generated tokens in "${setImpact.name}" are still tagged as output from "${ownership.recipeName}"${ownership.targetGroup ? ` at ${ownership.targetGroup}` : ""}.`,
  }));
}

function buildMergeConflicts(
  sourceTokens: TokenGroup,
  targetTokens: TokenGroup,
  sourceCollection: string,
  targetCollection: string,
): SetMergeConflict[] {
  const sourceFlat = Object.fromEntries(flattenTokenGroup(sourceTokens));
  const targetFlat = Object.fromEntries(flattenTokenGroup(targetTokens));
  const conflicts: SetMergeConflict[] = [];
  for (const [path, sourceToken] of Object.entries(sourceFlat)) {
    const targetToken = targetFlat[path];
    if (!targetToken) continue;
    const incomingToken = prepareTokenForCollectionMerge(
      sourceToken as unknown as Token,
      sourceCollection,
      targetCollection,
    );
    if (
      stableStringify(incomingToken.$value) !==
      stableStringify(targetToken.$value)
    ) {
      conflicts.push({
        path,
        sourceValue: incomingToken.$value,
        targetValue: targetToken.$value,
      });
      continue;
    }

    const merged = mergeIncomingModesIntoTargetToken({
      targetToken: targetToken as unknown as Token,
      incomingToken,
      targetCollection,
    });
    if (merged.conflict) {
      conflicts.push({
        path,
        sourceValue: merged.incomingModeValues,
        targetValue: merged.targetModeValues,
      });
    }
  }
  return conflicts.sort((a, b) => a.path.localeCompare(b.path));
}

function buildSplitPreview(
  setName: string,
  tokens: TokenGroup,
  existingSetNames: string[],
): SetSplitPreviewItem[] {
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
      const newName = `${setName}-${sanitized}`;
      return {
        key,
        newName,
        count,
        existing: existingSetNames.includes(newName),
      };
    })
    .filter((entry) => entry.count > 0)
    .sort((a, b) => a.newName.localeCompare(b.newName));
}

function stripGeneratedOwnershipFromTokenGroup(tokens: TokenGroup): TokenGroup {
  const cloned = structuredClone(tokens);

  const visit = (node: Record<string, unknown>): void => {
    if (isDTCGToken(node)) {
      const extensions = node.$extensions;
      if (
        extensions &&
        typeof extensions === "object" &&
        RECIPE_EXTENSION_KEY in extensions
      ) {
        const nextExtensions = { ...extensions };
        delete nextExtensions[RECIPE_EXTENSION_KEY];
        if (Object.keys(nextExtensions).length > 0) {
          node.$extensions = nextExtensions;
        } else {
          delete node.$extensions;
        }
      }
      return;
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === "object") {
        visit(value as Record<string, unknown>);
      }
    }
  };

  visit(cloned as Record<string, unknown>);
  return cloned;
}

function stripGeneratedOwnershipFromToken(token: DTCGToken): Token {
  return stripGeneratedOwnershipFromTokenGroup({
    value: token as unknown as TokenGroup,
  }).value as Token;
}

function buildRemovalBlockers(
  setImpact: SetPreflightImpact,
): SetPreflightBlocker[] {
  return [
    ...buildResolverReferenceBlockers(setImpact),
    ...buildGeneratedOwnershipBlockers(setImpact),
    ...buildRecipeTargetBlockers(setImpact),
  ];
}

function buildPreflightWarnings(params: {
  operation: SetStructuralOperation;
  source: SetPreflightImpact;
  target?: SetPreflightImpact;
  deleteOriginal?: boolean;
  splitPreview: SetSplitPreviewItem[];
}): string[] {
  const {
    operation,
    source,
    target,
    deleteOriginal = false,
    splitPreview,
  } = params;
  const warnings: string[] = [];

  if (operation === "merge") {
    if (source.generatedOwnership.length > 0) {
      warnings.push(
        `Generated tokens copied from "${source.name}" into "${target?.name ?? "the target set"}" become regular tokens there so the source recipe keeps owning only "${source.name}".`,
      );
    }
  }

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
          `Generated tokens copied into the new split sets become regular tokens there so the original recipe keeps owning only "${source.name}".`,
        );
      }
    }
  }

  return warnings;
}

export const setRoutes: FastifyPluginAsync = async (fastify) => {
  const { withLock } = fastify.tokenLock;

  const rewriteResolverSetReferences = (oldName: string, newName: string) =>
    fastify.resolverLock.withLock(() =>
      fastify.resolverStore.updateSetReferences(oldName, newName),
    );

  const renameDependentSetReferences = async (
    oldName: string,
    newName: string,
  ) => {
    await rewriteResolverSetReferences(oldName, newName);
    await fastify.recipeService.updateSetName(oldName, newName);
  };

  const loadCollectionModeState = async (): Promise<CollectionDocumentState> =>
    structuredClone(await fastify.collectionsStore.loadState());

  const restoreCollectionModeState = async (
    state: CollectionDocumentState,
  ): Promise<void> => {
    await fastify.collectionsStore.withStateLock(async () => ({
      state: structuredClone(state),
      result: undefined,
    }));
  };

  const buildCollectionsRollbackStep = (state: CollectionDocumentState) => ({
    action: "write-themes" as const,
    dimensions: structuredClone(state.dimensions),
    views: structuredClone(state.views),
  });

  const renameCollectionModeState = async (renames: FolderSetRename[]) => {
    await fastify.collectionsStore.withStateLock(async (state) => ({
      state: renameCollectionIdsInState(state, renames),
      result: undefined,
    }));
  };

  const deleteCollectionModeState = async (setNames: string[]) => {
    await fastify.collectionsStore.withStateLock(async (state) => ({
      state: deleteCollectionIdsFromState(state, setNames),
      result: undefined,
    }));
  };

  const duplicateCollectionModeState = async (
    sourceName: string,
    targetNames: string[],
  ) => {
    await fastify.collectionsStore.withStateLock(async (state) => ({
      state: copyCollectionIdsInState(state, sourceName, targetNames),
      result: undefined,
    }));
  };

  const replaceSetTokensIfNeeded = async (
    setName: string,
    nextTokens: TokenGroup,
    changed: boolean,
  ): Promise<void> => {
    if (!changed) {
      return;
    }
    await fastify.tokenStore.replaceSetTokens(setName, nextTokens);
  };

  const renameCollectionModesInSet = async (
    setName: string,
    oldName: string,
    newName: string,
  ): Promise<void> => {
    const set = await fastify.tokenStore.getSet(setName);
    if (!set) {
      throw new Error(`Set "${setName}" not found`);
    }
    const rewritten = rewriteTokenGroupCollectionModes(set.tokens, (modes) =>
      renameCollectionModes(modes, oldName, newName),
    );
    await replaceSetTokensIfNeeded(setName, rewritten.tokens, rewritten.changed);
  };

  /**
   * Remove mode entries for the given collection IDs from all tokens in every
   * remaining set. Call after deleting collections to prevent orphaned mode data.
   */
  const pruneOrphanedModeKeys = async (
    deletedCollectionIds: string[],
  ): Promise<void> => {
    if (deletedCollectionIds.length === 0) return;
    const idsToRemove = new Set(deletedCollectionIds);
    const allSets = await fastify.tokenStore.getSets();
    for (const setName of allSets) {
      const set = await fastify.tokenStore.getSet(setName);
      if (!set) continue;
      const rewritten = rewriteTokenGroupCollectionModes(set.tokens, (modes) => {
        const keysToRemove = Object.keys(modes).filter((k) => idsToRemove.has(k));
        if (keysToRemove.length === 0) return null;
        const nextModes = { ...modes };
        for (const key of keysToRemove) {
          delete nextModes[key];
        }
        return nextModes;
      });
      await replaceSetTokensIfNeeded(setName, rewritten.tokens, rewritten.changed);
    }
  };

  const cloneTokenGroupForCollection = (
    tokens: TokenGroup,
    sourceName: string,
    targetName: string,
  ): TokenGroup =>
    rewriteTokenGroupCollectionModes(tokens, (modes) =>
      copyCollectionModesToNewCollection(modes, sourceName, targetName),
    ).tokens;

  const loadSetDependencySnapshot = async (
    setNames: Iterable<string>,
  ): Promise<SetDependencySnapshot> => {
    const uniqueSetNames = [...new Set(setNames)];
    const loadedSets = await Promise.all(
      uniqueSetNames.map(async (setName) => {
        const set = await fastify.tokenStore.getSet(setName);
        if (!set) {
          return null;
        }
        return {
          name: setName,
          tokens: set.tokens,
          metadata: fastify.tokenStore.getSetMetadata(setName),
        } satisfies LoadedSetDependencyData;
      }),
    );

    const snapshot: SetDependencySnapshot = {
      resolvers: fastify.resolverStore
        .listSetDependencyMeta()
        .map((resolver) => ({
          name: resolver.name,
          referencedSets: resolver.referencedSets,
        })),
      recipes: fastify.recipeService
        .listSetDependencyMeta()
        .map((recipe) => ({
          id: recipe.id,
          name: recipe.name,
          targetSet: recipe.targetSet,
          targetGroup: recipe.targetGroup,
        })),
      allOwnedTokens: fastify.tokenStore.findTokensByRecipeId("*"),
      setsByName: new Map(),
      impactsBySet: new Map(),
    };

    for (const loadedSet of loadedSets) {
      if (!loadedSet) {
        continue;
      }
      snapshot.setsByName.set(loadedSet.name, loadedSet);
      snapshot.impactsBySet.set(
        loadedSet.name,
        buildSetImpact({
          setName: loadedSet.name,
          tokens: loadedSet.tokens,
          metadata: loadedSet.metadata,
          resolvers: snapshot.resolvers,
          recipes: snapshot.recipes,
          allOwnedTokens: snapshot.allOwnedTokens,
        }),
      );
    }

    return snapshot;
  };

  const buildRemovalBlockersForSetNames = (
    snapshot: SetDependencySnapshot,
    setNames: Iterable<string>,
    ignoredCodes: ReadonlySet<SetPreflightBlockerCode> =
      new Set<SetPreflightBlockerCode>(),
  ): SetPreflightBlocker[] =>
    [...new Set(setNames)].flatMap((setName) => {
      const impact = snapshot.impactsBySet.get(setName);
      if (!impact) {
        return [];
      }
      return buildRemovalBlockers(impact).filter(
        (blocker) => !ignoredCodes.has(blocker.code),
      );
    });

  // GET /api/sets — list all sets (with optional descriptions)
  fastify.get("/sets", async (_request, reply) => {
    try {
      const sets = await fastify.tokenStore.getSets();
      const descriptions = fastify.tokenStore.getSetDescriptions();
      const counts = fastify.tokenStore.getSetCounts();
      return { sets, descriptions, counts };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to list sets");
    }
  });

  // GET /api/sets/:name — get a set
  fastify.get<{ Params: { name: string } }>(
    "/sets/:name",
    async (request, reply) => {
      const { name } = request.params;
      try {
        const set = await fastify.tokenStore.getSet(name);
        if (!set) {
          return reply
            .status(404)
            .send({ error: `Token set "${name}" not found` });
        }
        return { name: set.name, tokens: set.tokens };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to get set");
      }
    },
  );

  // POST /api/sets — create a set
  fastify.post<{ Body: { name: string; tokens?: Record<string, unknown> } }>(
    "/sets",
    async (request, reply) => {
      const { name, tokens } = request.body || {};
      if (!name) {
        return reply.status(400).send({ error: "Set name is required" });
      }

      // Validate name (alphanumeric, dashes, underscores; / for folder hierarchy)
      if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(name)) {
        return reply.status(400).send({
          error:
            "Set name must contain only alphanumeric characters, dashes, underscores, and / for folders",
        });
      }

      return withLock(async () => {
        try {
          const existing = await fastify.tokenStore.getSet(name);
          if (existing) {
            return reply
              .status(409)
              .send({ error: `Token set "${name}" already exists` });
          }

          const set = await fastify.tokenStore.createSet(
            name,
            tokens as TokenGroup | undefined,
          );
          const afterSnap = await snapshotSet(fastify.tokenStore, name);
          await fastify.operationLog.record({
            type: "set-create",
            description: `Create set "${name}"`,
            setName: name,
            affectedPaths: Object.keys(afterSnap),
            beforeSnapshot: {},
            afterSnapshot: afterSnap,
            rollbackSteps: [{ action: "delete-set", name }],
          });
          return reply.status(201).send({ ok: true, name: set.name });
        } catch (err) {
          return handleRouteError(reply, err, "Failed to create set");
        }
      });
    },
  );

  // PATCH /api/sets/:name/metadata — update set description
  fastify.patch<{
    Params: { name: string };
    Body: {
      description?: string;
    };
  }>("/sets/:name/metadata", async (request, reply) => {
    const { name } = request.params;
    const body = request.body || {};
    const bodyKeys = Object.keys(body);
    if (bodyKeys.some((key) => key !== "description")) {
      return reply.status(400).send({
        error: "Only the description can be updated from collection metadata",
      });
    }
    return withLock(async () => {
      try {
        if (!Object.prototype.hasOwnProperty.call(body, "description")) {
          const current = fastify.tokenStore.getSetMetadata(name);
          return { ok: true, name, ...current, changed: false };
        }

        const beforeMeta = fastify.tokenStore.getSetMetadata(name);
        const patch: Partial<SetMetadataState> = {};
        const changes: FieldChange[] = [];
        if (Object.prototype.hasOwnProperty.call(body, "description")) {
          const nextValue = body.description?.trim() || undefined;
          patch.description = nextValue;
          if (beforeMeta.description !== nextValue) {
            changes.push({
              field: "description",
              label: "Description",
              before: beforeMeta.description,
              after: nextValue,
            });
          }
        }

        if (changes.length === 0) {
          return { ok: true, name, ...beforeMeta, changed: false };
        }

        await fastify.tokenStore.updateSetMetadata(name, patch);
        const afterMeta = fastify.tokenStore.getSetMetadata(name);
        const rollbackMetadata = changes.reduce<Partial<SetMetadataState>>(
          (acc, change) => {
            if (change.field === "description") {
              acc.description = change.before;
            }
            return acc;
          },
          {},
        );
        const metadata: FieldChangeOperationMetadata = {
          kind: "set-metadata",
          name,
          before: beforeMeta,
          after: afterMeta,
          changes,
        };
        await fastify.operationLog.record({
          type: "set-metadata",
          description: `Update metadata for set "${name}"`,
          setName: name,
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          rollbackSteps: [
            { action: "write-set-metadata", name, metadata: rollbackMetadata },
          ],
          metadata,
        });
        return { ok: true, name, ...afterMeta, changed: true };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to update metadata");
      }
    });
  });

  // POST /api/sets/:name/rename — rename a set (atomic: file + themes + in-memory)
  fastify.post<{ Params: { name: string }; Body: { newName: string } }>(
    "/sets/:name/rename",
    async (request, reply) => {
      const { name } = request.params;
      const { newName } = request.body || {};

      if (!newName) {
        return reply.status(400).send({ error: "newName is required" });
      }
      if (!isValidSetName(newName)) {
        return reply.status(400).send({
          error:
            "Set name must contain only alphanumeric characters, dashes, underscores, and / for folders",
        });
      }

      return withLock(async () => {
        let renamed = false;
        let collectionStateChanged = false;
        let beforeSnapshot: Record<string, SnapshotEntry> = {};
        const previousCollectionState = await loadCollectionModeState();
        try {
          beforeSnapshot = await snapshotSet(fastify.tokenStore, name);
          await fastify.tokenStore.renameSet(name, newName);
          renamed = true;
          await renameCollectionModesInSet(newName, name, newName);
          await renameDependentSetReferences(name, newName);
          await renameCollectionModeState([{ from: name, to: newName }]);
          collectionStateChanged = true;
          const afterSnapshot = await snapshotSet(fastify.tokenStore, newName);
          await fastify.operationLog.record({
            type: "set-rename",
            description: `Rename set "${name}" → "${newName}"`,
            setName: newName,
            affectedPaths: [
              ...new Set([
                ...listSnapshotTokenPaths(beforeSnapshot),
                ...listSnapshotTokenPaths(afterSnapshot),
              ]),
            ],
            beforeSnapshot,
            afterSnapshot,
            rollbackSteps: [
              { action: "rename-set", from: newName, to: name },
              buildCollectionsRollbackStep(previousCollectionState),
            ],
          });
          return { ok: true, oldName: name, newName };
        } catch (err) {
          if (collectionStateChanged) {
            await restoreCollectionModeState(previousCollectionState).catch((rollbackErr) => {
              fastify.log.error({ err: rollbackErr, operation: "set-rename", set: name }, "Rollback failed: could not restore collection mode state after failed set rename");
            });
          }
          if (renamed) {
            await fastify.tokenStore
              .renameSet(newName, name)
              .then(async () => {
                await renameCollectionModesInSet(name, newName, name);
                await renameDependentSetReferences(newName, name);
              })
              .catch((rollbackErr) => {
                fastify.log.error({ err: rollbackErr, operation: "set-rename", from: newName, to: name }, "Rollback failed: could not revert set rename back to original name");
              });
          }
          return handleRouteError(reply, err, "Failed to rename set");
        }
      });
    },
  );

  // PUT /api/sets/reorder — reorder sets
  fastify.put<{ Body: { order: string[] } }>(
    "/sets/reorder",
    async (request, reply) => {
      const { order } = request.body || {};
      if (!Array.isArray(order)) {
        return reply
          .status(400)
          .send({ error: "order must be an array of set names" });
      }
      try {
        return await withLock(async () => {
          const previousOrder = await fastify.tokenStore.getSets();
          fastify.tokenStore.reorderSets(order);
          await fastify.operationLog.record({
            type: "set-reorder",
            description: "Reorder token sets",
            setName: "",
            affectedPaths: [],
            beforeSnapshot: {},
            afterSnapshot: {},
            rollbackSteps: [{ action: "reorder-sets", order: previousOrder }],
          });
          return { ok: true };
        });
      } catch (err) {
        return handleRouteError(reply, err, "Failed to reorder sets");
      }
    },
  );

  // POST /api/set-folders/rename — rename a folder prefix across all contained sets
  fastify.post<{ Body: { fromFolder?: string; toFolder?: string } }>(
    "/set-folders/rename",
    async (request, reply) => {
      const fromFolder = request.body?.fromFolder?.trim();
      const toFolder = request.body?.toFolder?.trim();
      if (!fromFolder || !toFolder) {
        return reply
          .status(400)
          .send({ error: "fromFolder and toFolder are required" });
      }
      if (!isValidSetName(fromFolder) || !isValidSetName(toFolder)) {
        return reply.status(400).send({
          error:
            "Folder names must contain only alphanumeric characters, dashes, underscores, and / for folders",
        });
      }
      if (fromFolder === toFolder) {
        return reply
          .status(400)
          .send({ error: "Target folder must differ from the source folder" });
      }

      return withLock(async () => {
        const completedRenames: FolderSetRename[] = [];
        let collectionStateChanged = false;
        const previousCollectionState = await loadCollectionModeState();
        try {
          const allSets = await fastify.tokenStore.getSets();
          const folderSetNames = getFolderSetNames(allSets, fromFolder);
          if (folderSetNames.length === 0) {
            return reply
              .status(404)
              .send({ error: `Folder "${fromFolder}" not found` });
          }

          const renames = folderSetNames.map((setName) => ({
            from: setName,
            to: replaceFolderPrefix(setName, fromFolder, toFolder),
          }));
          const conflicts = findFolderRenameConflicts(
            allSets,
            folderSetNames,
            renames,
          );
          if (conflicts.length > 0) {
            return reply.status(409).send({
              error: `Folder rename would collide with existing sets: ${conflicts.join(", ")}`,
              conflicts,
            });
          }

          const beforeSnapshot = await snapshotSets(
            fastify.tokenStore,
            folderSetNames,
          );
          for (const rename of sortFolderRenamePairsForApply(renames)) {
            await fastify.tokenStore.renameSet(rename.from, rename.to);
            await renameCollectionModesInSet(rename.to, rename.from, rename.to);
            await renameDependentSetReferences(rename.from, rename.to);
            completedRenames.push(rename);
          }
          await renameCollectionModeState(renames);
          collectionStateChanged = true;
          const renamedSetNames = renames.map(({ to }) => to);
          const afterSnapshot = await snapshotSets(
            fastify.tokenStore,
            renamedSetNames,
          );
          const affectedPaths = [
            ...new Set([
              ...listSnapshotTokenPaths(beforeSnapshot),
              ...listSnapshotTokenPaths(afterSnapshot),
            ]),
          ];

          const rollbackSteps: RollbackStep[] = [
            ...sortFolderRenamePairsForRollback(renames).map(({ from, to }) => ({
              action: "rename-set" as const,
              from,
              to,
            })),
            buildCollectionsRollbackStep(previousCollectionState),
          ];
          await fastify.operationLog.record({
            type: "set-folder-rename",
            description: `Rename folder "${fromFolder}" → "${toFolder}"`,
            setName: toFolder,
            affectedPaths,
            beforeSnapshot,
            afterSnapshot,
            rollbackSteps,
            metadata: {
              folder: fromFolder,
              newFolder: toFolder,
              renamedSets: renames,
            },
          });

          return {
            ok: true,
            folder: fromFolder,
            newFolder: toFolder,
            renamedSets: renames,
            sets: await fastify.tokenStore.getSets(),
          };
        } catch (err) {
          if (collectionStateChanged) {
            await restoreCollectionModeState(previousCollectionState).catch((rollbackErr) => {
              fastify.log.error({ err: rollbackErr, operation: "folder-rename", folder: fromFolder }, "Rollback failed: could not restore collection mode state after failed folder rename");
            });
          }
          for (const rename of sortFolderRenamePairsForRollback(completedRenames)) {
            await fastify.tokenStore
              .renameSet(rename.from, rename.to)
              .then(async () => {
                await renameCollectionModesInSet(rename.to, rename.from, rename.to);
                await renameDependentSetReferences(rename.from, rename.to);
              })
              .catch((rollbackErr) => {
                fastify.log.error({ err: rollbackErr, operation: "folder-rename", from: rename.from, to: rename.to }, "Rollback failed: could not revert set rename during folder rename rollback");
              });
          }
          return handleRouteError(reply, err, "Failed to rename folder");
        }
      });
    },
  );

  // POST /api/set-folders/reorder — reorder top-level folders and standalone sets
  fastify.post<{ Body: { order?: string[] } }>(
    "/set-folders/reorder",
    async (request, reply) => {
      const order = request.body?.order;
      if (!Array.isArray(order)) {
        return reply.status(400).send({
          error: "order must be an array of top-level folder/set items",
        });
      }

      return withLock(async () => {
        try {
          const previousOrder = await fastify.tokenStore.getSets();
          const currentItems = buildTopLevelItems(previousOrder);
          if (
            order.length !== currentItems.length ||
            currentItems.some((item) => !order.includes(item))
          ) {
            return reply.status(400).send({
              error:
                "order must contain every current top-level set item exactly once",
            });
          }

          const nextOrder = expandTopLevelItems(previousOrder, order);
          fastify.tokenStore.reorderSets(nextOrder);
          await fastify.operationLog.record({
            type: "set-folder-reorder",
            description: "Reorder top-level set folders",
            setName: "",
            affectedPaths: [],
            beforeSnapshot: {},
            afterSnapshot: {},
            rollbackSteps: [{ action: "reorder-sets", order: previousOrder }],
            metadata: { order },
          });

          return { ok: true, sets: await fastify.tokenStore.getSets() };
        } catch (err) {
          return handleRouteError(reply, err, "Failed to reorder folders");
        }
      });
    },
  );

  // POST /api/set-folders/merge — move every set from one folder into another existing folder
  fastify.post<{ Body: { sourceFolder?: string; targetFolder?: string } }>(
    "/set-folders/merge",
    async (request, reply) => {
      const sourceFolder = request.body?.sourceFolder?.trim();
      const targetFolder = request.body?.targetFolder?.trim();
      if (!sourceFolder || !targetFolder) {
        return reply
          .status(400)
          .send({ error: "sourceFolder and targetFolder are required" });
      }
      if (!isValidSetName(sourceFolder) || !isValidSetName(targetFolder)) {
        return reply.status(400).send({
          error:
            "Folder names must contain only alphanumeric characters, dashes, underscores, and / for folders",
        });
      }
      if (sourceFolder === targetFolder) {
        return reply
          .status(400)
          .send({ error: "Target folder must differ from the source folder" });
      }

      return withLock(async () => {
        const completedRenames: FolderSetRename[] = [];
        let collectionStateChanged = false;
        const previousCollectionState = await loadCollectionModeState();
        try {
          const allSets = await fastify.tokenStore.getSets();
          const sourceSetNames = getFolderSetNames(allSets, sourceFolder);
          if (sourceSetNames.length === 0) {
            return reply
              .status(404)
              .send({ error: `Folder "${sourceFolder}" not found` });
          }

          const targetSetNames = getFolderSetNames(allSets, targetFolder);
          if (targetSetNames.length === 0) {
            return reply
              .status(404)
              .send({ error: `Target folder "${targetFolder}" not found` });
          }

          const renames = sourceSetNames.map((setName) => ({
            from: setName,
            to: replaceFolderPrefix(setName, sourceFolder, targetFolder),
          }));
          const conflicts = findFolderRenameConflicts(
            allSets,
            sourceSetNames,
            renames,
          );
          if (conflicts.length > 0) {
            return reply.status(409).send({
              error: `Folder merge would collide with existing sets: ${conflicts.join(", ")}`,
              conflicts,
            });
          }

          const beforeSnapshot = await snapshotSets(
            fastify.tokenStore,
            sourceSetNames,
          );
          for (const rename of sortFolderRenamePairsForApply(renames)) {
            await fastify.tokenStore.renameSet(rename.from, rename.to);
            await renameCollectionModesInSet(rename.to, rename.from, rename.to);
            await renameDependentSetReferences(rename.from, rename.to);
            completedRenames.push(rename);
          }
          await renameCollectionModeState(renames);
          collectionStateChanged = true;
          const movedSetNames = renames.map(({ to }) => to);
          const afterSnapshot = await snapshotSets(
            fastify.tokenStore,
            movedSetNames,
          );
          const affectedPaths = [
            ...new Set([
              ...listSnapshotTokenPaths(beforeSnapshot),
              ...listSnapshotTokenPaths(afterSnapshot),
            ]),
          ];

          const rollbackSteps: RollbackStep[] = [
            ...sortFolderRenamePairsForRollback(renames).map(({ from, to }) => ({
              action: "rename-set" as const,
              from,
              to,
            })),
            buildCollectionsRollbackStep(previousCollectionState),
          ];
          await fastify.operationLog.record({
            type: "set-folder-merge",
            description: `Merge folder "${sourceFolder}" into "${targetFolder}"`,
            setName: targetFolder,
            affectedPaths,
            beforeSnapshot,
            afterSnapshot,
            rollbackSteps,
            metadata: {
              sourceFolder,
              targetFolder,
              movedSets: renames,
            },
          });

          return {
            ok: true,
            sourceFolder,
            targetFolder,
            movedSets: renames,
            sets: await fastify.tokenStore.getSets(),
          };
        } catch (err) {
          if (collectionStateChanged) {
            await restoreCollectionModeState(previousCollectionState).catch((rollbackErr) => {
              fastify.log.error({ err: rollbackErr, operation: "folder-merge", sourceFolder, targetFolder }, "Rollback failed: could not restore collection mode state after failed folder merge");
            });
          }
          for (const rename of sortFolderRenamePairsForRollback(completedRenames)) {
            await fastify.tokenStore
              .renameSet(rename.from, rename.to)
              .then(async () => {
                await renameCollectionModesInSet(rename.to, rename.from, rename.to);
                await renameDependentSetReferences(rename.from, rename.to);
              })
              .catch((rollbackErr) => {
                fastify.log.error({ err: rollbackErr, operation: "folder-merge", from: rename.from, to: rename.to }, "Rollback failed: could not revert set rename during folder merge rollback");
              });
          }
          return handleRouteError(reply, err, "Failed to merge folders");
        }
      });
    },
  );

  // POST /api/set-folders/delete — delete every set inside a folder
  fastify.post<{ Body: { folder?: string } }>(
    "/set-folders/delete",
    async (request, reply) => {
      const folder = request.body?.folder?.trim();
      if (!folder) {
        return reply.status(400).send({ error: "folder is required" });
      }
      if (!isValidSetName(folder)) {
        return reply.status(400).send({
          error:
            "Folder names must contain only alphanumeric characters, dashes, underscores, and / for folders",
        });
      }

      return withLock(async () => {
        let beforeSnapshot: Record<string, SnapshotEntry> | null = null;
        const deletedSetNames: string[] = [];
        let collectionStateChanged = false;
        const previousCollectionState = await loadCollectionModeState();

        try {
          const allSets = await fastify.tokenStore.getSets();
          const folderSetNames = getFolderSetNames(allSets, folder);
          if (folderSetNames.length === 0) {
            return reply
              .status(404)
              .send({ error: `Folder "${folder}" not found` });
          }

          const dependencySnapshot =
            await loadSetDependencySnapshot(folderSetNames);
          const blockers = buildRemovalBlockersForSetNames(
            dependencySnapshot,
            folderSetNames,
          );
          if (blockers.length > 0) {
            return reply.status(409).send({
              error:
                blockers[0]?.message ??
                `Cannot delete folder "${folder}" because dependent state still references its collections.`,
              blockers,
            });
          }

          beforeSnapshot = await snapshotSets(fastify.tokenStore, folderSetNames);

          for (const setName of folderSetNames) {
            await fastify.tokenStore.deleteSet(setName);
            deletedSetNames.push(setName);
          }
          await deleteCollectionModeState(folderSetNames);
          collectionStateChanged = true;
          await pruneOrphanedModeKeys(folderSetNames).catch((err) => {
            fastify.log.error({ err, operation: "prune-orphaned-modes" }, "Failed to prune orphaned mode keys from remaining sets");
          });

          await fastify.operationLog.record({
            type: "set-folder-delete",
            description: `Delete folder "${folder}"`,
            setName: folder,
            affectedPaths: listSnapshotTokenPaths(beforeSnapshot),
            beforeSnapshot,
            afterSnapshot: {},
            rollbackSteps: [
              ...folderSetNames.map((setName) => ({
                action: "create-set" as const,
                name: setName,
              })),
              buildCollectionsRollbackStep(previousCollectionState),
            ],
            metadata: {
              folder,
              deletedSets: folderSetNames,
            },
          });

          return {
            ok: true,
            folder,
            deletedSets: folderSetNames,
            sets: await fastify.tokenStore.getSets(),
          };
        } catch (err) {
          if (beforeSnapshot && deletedSetNames.length > 0) {
            for (const setName of deletedSetNames) {
              await fastify.tokenStore
                .createSet(
                  setName,
                  buildTokenGroupFromSnapshot(beforeSnapshot, setName),
                )
                .catch((rollbackErr) => {
                  fastify.log.error({ err: rollbackErr, operation: "folder-delete", set: setName, folder }, "Rollback failed: could not recreate deleted set during folder delete rollback");
                });
            }
          }
          if (collectionStateChanged) {
            await restoreCollectionModeState(previousCollectionState).catch((rollbackErr) => {
              fastify.log.error({ err: rollbackErr, operation: "folder-delete", folder }, "Rollback failed: could not restore collection mode state after failed folder delete");
            });
          }
          return handleRouteError(reply, err, "Failed to delete folder");
        }
      });
    },
  );

  // DELETE /api/data — wipe all persisted state (danger zone)
  // Requires body: { confirm: "DELETE" } to prevent accidental calls
  fastify.delete<{ Body: { confirm?: string } }>(
    "/data",
    async (request, reply) => {
      if (request.body?.confirm !== "DELETE") {
        return reply.status(400).send({
          error:
            'Missing confirmation — send { confirm: "DELETE" } in the request body',
        });
      }
      return withLock(async () => {
        try {
          await fastify.resolverLock.withLock(async () => {
            await fastify.tokenStore.clearAll();
            await fastify.collectionsStore.reset();
            await fastify.recipeService.reset();
            await fastify.resolverStore.reset();
            await fastify.operationLog.reset();
            await fastify.manualSnapshots.reset();
          });
          return { ok: true };
        } catch (err) {
          return handleRouteError(reply, err, "Failed to clear data");
        }
      });
    },
  );

  // POST /api/sets/:name/duplicate — duplicate a set (copies tokens + metadata)
  fastify.post<{ Params: { name: string }; Body?: { newName?: string } }>(
    "/sets/:name/duplicate",
    async (request, reply) => {
      const { name } = request.params;
      const requestedName = request.body?.newName;
      let nextName = requestedName;

      return withLock(async () => {
        let created = false;
        let collectionStateChanged = false;
        const previousCollectionState = await loadCollectionModeState();
        try {
          const source = await fastify.tokenStore.getSet(name);
          if (!source) {
            return reply
              .status(404)
              .send({ error: `Token set "${name}" not found` });
          }

          // Auto-generate a unique name if not provided
          if (!nextName) {
            const allSets = await fastify.tokenStore.getSets();
            nextName = `${name}-copy`;
            let i = 2;
            while (allSets.includes(nextName)) {
              nextName = `${name}-copy-${i++}`;
            }
          } else {
            if (!isValidSetName(nextName)) {
              return reply.status(400).send({
                error:
                  "Set name must contain only alphanumeric characters, dashes, underscores, and / for folders",
              });
            }
            const existing = await fastify.tokenStore.getSet(nextName);
            if (existing) {
              return reply
                .status(409)
                .send({ error: `Token set "${nextName}" already exists` });
            }
          }

          const tokensCopy = cloneTokenGroupForCollection(
            source.tokens,
            name,
            nextName,
          );
          const set = await fastify.tokenStore.createSet(nextName, tokensCopy);
          created = true;
          await duplicateCollectionModeState(name, [nextName]);
          collectionStateChanged = true;
          const afterSnap = await snapshotSet(fastify.tokenStore, nextName);
          await fastify.operationLog.record({
            type: "set-create",
            description: `Duplicate set "${name}" → "${nextName}"`,
            setName: nextName,
            affectedPaths: Object.keys(afterSnap),
            beforeSnapshot: {},
            afterSnapshot: afterSnap,
            rollbackSteps: [
              { action: "delete-set", name: nextName },
              buildCollectionsRollbackStep(previousCollectionState),
            ],
          });
          return reply
            .status(201)
            .send({ ok: true, name: set.name, originalName: name });
        } catch (err) {
          if (collectionStateChanged) {
            await restoreCollectionModeState(previousCollectionState).catch((rollbackErr) => {
              fastify.log.error({ err: rollbackErr, operation: "set-duplicate", set: name }, "Rollback failed: could not restore collection mode state after failed set duplicate");
            });
          }
          if (created && nextName) {
            await fastify.tokenStore.deleteSet(nextName).catch((rollbackErr) => {
              fastify.log.error({ err: rollbackErr, operation: "set-duplicate", set: nextName }, "Rollback failed: could not delete duplicated set during set duplicate rollback");
            });
          }
          return handleRouteError(reply, err, "Failed to duplicate set");
        }
      });
    },
  );

  // POST /api/sets/:name/merge — merge tokens from one set into another atomically
  fastify.post<{
    Params: { name: string };
    Body: {
      targetSet?: string;
      resolutions?: Record<string, "source" | "target">;
    };
  }>("/sets/:name/merge", async (request, reply) => {
    const { name } = request.params;
    const { targetSet, resolutions = {} } = request.body || {};

    if (!targetSet) {
      return reply.status(400).send({ error: "targetSet is required" });
    }
    if (targetSet === name) {
      return reply
        .status(400)
        .send({ error: "targetSet must differ from the source set" });
    }

    return withLock(async () => {
      let beforeTargetTokens: TokenGroup | null = null;
      let targetMutated = false;
      try {
        const sourceSet = await fastify.tokenStore.getSet(name);
        if (!sourceSet) {
          return reply
            .status(404)
            .send({ error: `Token set "${name}" not found` });
        }

        const target = await fastify.tokenStore.getSet(targetSet);
        if (!target) {
          return reply
            .status(404)
            .send({ error: `Token set "${targetSet}" not found` });
        }

        const conflicts = buildMergeConflicts(
          sourceSet.tokens,
          target.tokens,
          name,
          targetSet,
        );
        const conflictMap = new Map(
          conflicts.map((conflict) => [conflict.path, conflict]),
        );
        for (const [path, resolution] of Object.entries(resolutions)) {
          if (!conflictMap.has(path)) {
            return reply.status(400).send({
              error: `Merge resolution "${path}" no longer matches a current conflict.`,
            });
          }
          if (resolution !== "source" && resolution !== "target") {
            return reply.status(400).send({
              error: `Merge resolution for "${path}" must be "source" or "target".`,
            });
          }
        }

        const nextTargetTokens = structuredClone(target.tokens);
        beforeTargetTokens = structuredClone(target.tokens);
        const targetFlat = new Map(flattenTokenGroup(target.tokens));
        for (const [tokenPath, token] of flattenTokenGroup(sourceSet.tokens)) {
          const incomingToken = prepareTokenForCollectionMerge(
            token as unknown as Token,
            name,
            targetSet,
          );
          const conflict = conflictMap.get(tokenPath);
          if (conflict && resolutions[tokenPath] !== "source") {
            continue;
          }
          if (conflict) {
            setTokenAtPath(nextTargetTokens, tokenPath, incomingToken);
            continue;
          }

          const existingTargetToken = targetFlat.get(tokenPath);
          if (!existingTargetToken) {
            setTokenAtPath(nextTargetTokens, tokenPath, incomingToken);
            continue;
          }

          const merged = mergeIncomingModesIntoTargetToken({
            targetToken: existingTargetToken as unknown as Token,
            incomingToken,
            targetCollection: targetSet,
          });
          if (merged.conflict) {
            return reply.status(409).send({
              error: `Merge conflict at "${tokenPath}" changed while merging. Re-check conflicts and try again.`,
            });
          }
          if (merged.changed) {
            setTokenAtPath(nextTargetTokens, tokenPath, merged.token);
          }
        }

        const beforeSnapshot = await snapshotSet(fastify.tokenStore, targetSet);
        await fastify.tokenStore.replaceSetTokens(targetSet, nextTargetTokens);
        targetMutated = true;
        const afterSnapshot = await snapshotSet(fastify.tokenStore, targetSet);
        const entry = await fastify.operationLog.record({
          type: "set-merge",
          description: `Merge set "${name}" into "${targetSet}"`,
          setName: targetSet,
          affectedPaths: [
            ...new Set([
              ...listSnapshotTokenPaths(beforeSnapshot),
              ...listSnapshotTokenPaths(afterSnapshot),
            ]),
          ],
          beforeSnapshot,
          afterSnapshot,
          metadata: {
            sourceSet: name,
            targetSet,
            conflictPaths: conflicts.map((conflict) => conflict.path),
            resolutions,
          },
        });

        return {
          ok: true,
          sourceSet: name,
          targetSet,
          operationId: entry.id,
        };
      } catch (err) {
        if (targetMutated && beforeTargetTokens) {
          await fastify.tokenStore
            .replaceSetTokens(targetSet, beforeTargetTokens)
            .catch((rollbackErr) => {
              fastify.log.error({ err: rollbackErr, operation: "set-merge", sourceSet: name, targetSet }, "Rollback failed: could not restore target set tokens after failed set merge");
            });
        }
        return handleRouteError(reply, err, "Failed to merge set");
      }
    });
  });

  // POST /api/sets/:name/split — create new sets from each top-level group in a set
  fastify.post<{
    Params: { name: string };
    Body: { deleteOriginal?: boolean };
  }>("/sets/:name/split", async (request, reply) => {
    const { name } = request.params;
    const { deleteOriginal = false } = request.body || {};

    return withLock(async () => {
      const createdNames: string[] = [];
      let sourceTokensForRollback: TokenGroup | null = null;
      let deletedOriginal = false;
      let collectionStateChanged = false;
      const previousCollectionState = await loadCollectionModeState();
      try {
        const sourceSet = await fastify.tokenStore.getSet(name);
        if (!sourceSet) {
          return reply
            .status(404)
            .send({ error: `Token set "${name}" not found` });
        }
        sourceTokensForRollback = structuredClone(sourceSet.tokens);

        const existingSetNames = await fastify.tokenStore.getSets();
        const splitPreview = buildSplitPreview(
          name,
          sourceSet.tokens,
          existingSetNames,
        );
        if (splitPreview.length === 0) {
          return reply.status(409).send({
            error: "No top-level groups are available to split into new sets.",
          });
        }

        if (deleteOriginal) {
          const dependencySnapshot = await loadSetDependencySnapshot([name]);
          const blockers = buildRemovalBlockersForSetNames(
            dependencySnapshot,
            [name],
          );
          if (blockers.length > 0) {
            return reply.status(409).send({
              error:
                blockers[0]?.message ??
                `Cannot delete set "${name}" after splitting because dependent state still references it.`,
              blockers,
            });
          }
        }

        const operationBeforeSnapshot = deleteOriginal
          ? await snapshotSet(fastify.tokenStore, name)
          : {};

        for (const { key, newName } of splitPreview) {
          if (existingSetNames.includes(newName)) {
            continue;
          }
          const groupTokens = sourceSet.tokens[key];
          if (
            !groupTokens ||
            typeof groupTokens !== "object" ||
            isDTCGToken(groupTokens)
          ) {
            continue;
          }
          await fastify.tokenStore.createSet(
            newName,
            cloneTokenGroupForCollection(
              stripGeneratedOwnershipFromTokenGroup(groupTokens as TokenGroup),
              name,
              newName,
            ),
          );
          createdNames.push(newName);
        }

        if (createdNames.length === 0) {
          return reply.status(409).send({
            error:
              "No new sets can be created from this split preview. Rename the destinations before splitting.",
          });
        }

        if (deleteOriginal) {
          await fastify.tokenStore.deleteSet(name);
          deletedOriginal = true;
        }
        await duplicateCollectionModeState(name, createdNames);
        if (deleteOriginal) {
          await deleteCollectionModeState([name]);
          await pruneOrphanedModeKeys([name]).catch((err) => {
            fastify.log.error({ err, operation: "prune-orphaned-modes" }, "Failed to prune orphaned mode keys from remaining sets");
          });
        }
        collectionStateChanged = true;

        const afterSnapshot = deleteOriginal
          ? await snapshotSets(fastify.tokenStore, createdNames)
          : await snapshotSets(fastify.tokenStore, createdNames);
        const entry = await fastify.operationLog.record({
          type: "set-split",
          description: deleteOriginal
            ? `Split set "${name}" into ${createdNames.length} sets and delete the original`
            : `Split set "${name}" into ${createdNames.length} sets`,
          setName: name,
          affectedPaths: [
            ...new Set([
              ...listSnapshotTokenPaths(operationBeforeSnapshot),
              ...listSnapshotTokenPaths(afterSnapshot),
            ]),
          ],
          beforeSnapshot: operationBeforeSnapshot,
          afterSnapshot,
          rollbackSteps: [
            ...createdNames.map((createdName) => ({
              action: "delete-set" as const,
              name: createdName,
            })),
            ...(deleteOriginal
              ? [{ action: "create-set" as const, name }]
              : []),
            buildCollectionsRollbackStep(previousCollectionState),
          ],
          metadata: {
            sourceSet: name,
            createdSets: createdNames,
            deleteOriginal,
          },
        });

        return {
          ok: true,
          sourceSet: name,
          createdSets: createdNames,
          deleteOriginal,
          operationId: entry.id,
        };
      } catch (err) {
        for (let index = createdNames.length - 1; index >= 0; index -= 1) {
          await fastify.tokenStore
            .deleteSet(createdNames[index])
            .catch((rollbackErr) => {
              fastify.log.error({ err: rollbackErr, operation: "set-split", set: createdNames[index], sourceSet: name }, "Rollback failed: could not delete created set during set split rollback");
            });
        }
        if (collectionStateChanged) {
          await restoreCollectionModeState(previousCollectionState).catch((rollbackErr) => {
            fastify.log.error({ err: rollbackErr, operation: "set-split", sourceSet: name }, "Rollback failed: could not restore collection mode state after failed set split");
          });
        }
        if (deletedOriginal && sourceTokensForRollback) {
          await fastify.tokenStore
            .createSet(name, sourceTokensForRollback)
            .catch((rollbackErr) => {
              fastify.log.error({ err: rollbackErr, operation: "set-split", set: name }, "Rollback failed: could not recreate original set after failed set split");
            });
        }
        return handleRouteError(reply, err, "Failed to split set");
      }
    });
  });

  // POST /api/sets/:name/preflight — inspect dependency impacts before a structural set change
  fastify.post<{
    Params: { name: string };
    Body: {
      operation?: SetStructuralOperation;
      targetSet?: string;
      deleteOriginal?: boolean;
    };
  }>("/sets/:name/preflight", async (request, reply) => {
    const { name } = request.params;
    const { operation, targetSet, deleteOriginal = false } = request.body || {};
    if (
      operation !== "delete" &&
      operation !== "merge" &&
      operation !== "split"
    ) {
      return reply
        .status(400)
        .send({ error: 'operation must be "delete", "merge", or "split"' });
    }
    if (operation === "merge") {
      if (!targetSet) {
        return reply
          .status(400)
          .send({ error: "targetSet is required for merge preflight" });
      }
      if (targetSet === name) {
        return reply
          .status(400)
          .send({ error: "targetSet must differ from the source set" });
      }
    }

    try {
      const sourceSet = await fastify.tokenStore.getSet(name);
      if (!sourceSet) {
        return reply
          .status(404)
          .send({ error: `Token set "${name}" not found` });
      }

      const splitSetNames =
        operation === "split" ? await fastify.tokenStore.getSets() : [];
      const splitPreview =
        operation === "split"
          ? buildSplitPreview(name, sourceSet.tokens, splitSetNames)
          : [];
      const dependencySetNames = [
        name,
        ...(operation === "merge" && targetSet ? [targetSet] : []),
        ...(operation === "split"
          ? splitPreview
              .filter((entry) => entry.existing)
              .map((entry) => entry.newName)
          : []),
      ];
      const dependencySnapshot =
        await loadSetDependencySnapshot(dependencySetNames);
      const sourceImpact = dependencySnapshot.impactsBySet.get(name);
      if (!sourceImpact) {
        return reply
          .status(404)
          .send({ error: `Token set "${name}" not found` });
      }
      if (
        operation === "merge" &&
        targetSet &&
        !dependencySnapshot.impactsBySet.has(targetSet)
      ) {
        return reply
          .status(404)
          .send({ error: `Token set "${targetSet}" not found` });
      }
      const affectedSets: SetPreflightImpact[] = [sourceImpact];
      if (operation === "merge" && targetSet) {
        const targetImpact = dependencySnapshot.impactsBySet.get(targetSet);
        if (targetImpact) {
          affectedSets.push(targetImpact);
        }
      }
      if (operation === "split") {
        affectedSets.push(
          ...splitPreview.flatMap((entry) => {
            if (!entry.existing) {
              return [];
            }
            const impact = dependencySnapshot.impactsBySet.get(entry.newName);
            return impact ? [impact] : [];
          }),
        );
      }

      const blockers =
        operation === "delete" || (operation === "split" && deleteOriginal)
          ? buildRemovalBlockersForSetNames(dependencySnapshot, [name])
          : [];
      const mergeConflicts =
        operation === "merge" && targetSet
          ? buildMergeConflicts(
              sourceSet.tokens,
              dependencySnapshot.setsByName.get(targetSet)?.tokens ?? {},
              name,
              targetSet,
            )
          : [];
      const warnings = buildPreflightWarnings({
        operation,
        source: sourceImpact,
        target: affectedSets[1],
        deleteOriginal,
        splitPreview,
      });

      const response: SetStructuralPreflightResponse = {
        operation,
        affectedSets,
        blockers,
        warnings,
        mergeConflicts,
        splitPreview,
      };
      return response;
    } catch (err) {
      return handleRouteError(reply, err, "Failed to inspect set dependencies");
    }
  });

  // DELETE /api/sets/:name — delete a set
  fastify.delete<{ Params: { name: string } }>(
    "/sets/:name",
    async (request, reply) => {
      const { name } = request.params;
      return withLock(async () => {
        let deleted = false;
        let collectionStateChanged = false;
        const previousCollectionState = await loadCollectionModeState();
        let beforeSnap: Record<string, SnapshotEntry> = {};
        try {
          const set = await fastify.tokenStore.getSet(name);
          if (!set) {
            return reply
              .status(404)
              .send({ error: `Token set "${name}" not found` });
          }

          const dependencySnapshot = await loadSetDependencySnapshot([name]);
          const blockers = buildRemovalBlockersForSetNames(
            dependencySnapshot,
            [name],
          );
          if (blockers.length > 0) {
            const messages = blockers.map((blocker) => blocker.message);
            return reply.status(409).send({
              error:
                messages[0] ??
                `Cannot delete set "${name}" because dependent state still references it.`,
              blockers,
            });
          }

          beforeSnap = await snapshotSet(fastify.tokenStore, name);
          deleted = await fastify.tokenStore.deleteSet(name);
          if (!deleted) {
            return reply
              .status(404)
              .send({ error: `Token set "${name}" not found` });
          }
          await deleteCollectionModeState([name]);
          collectionStateChanged = true;
          await pruneOrphanedModeKeys([name]).catch((err) => {
            fastify.log.error({ err, operation: "prune-orphaned-modes" }, "Failed to prune orphaned mode keys from remaining sets");
          });
          const entry = await fastify.operationLog.record({
            type: "set-delete",
            description: `Delete set "${name}"`,
            setName: name,
            affectedPaths: Object.keys(beforeSnap),
            beforeSnapshot: beforeSnap,
            afterSnapshot: {},
            rollbackSteps: [
              { action: "create-set", name },
              buildCollectionsRollbackStep(previousCollectionState),
            ],
          });
          return { ok: true, name, operationId: entry.id };
        } catch (err) {
          if (collectionStateChanged) {
            await restoreCollectionModeState(previousCollectionState).catch((rollbackErr) => {
              fastify.log.error({ err: rollbackErr, operation: "set-delete", set: name }, "Rollback failed: could not restore collection mode state after failed set delete");
            });
          }
          if (deleted) {
            await fastify.tokenStore
              .createSet(name, buildTokenGroupFromSnapshot(beforeSnap, name))
              .catch((rollbackErr) => {
                fastify.log.error({ err: rollbackErr, operation: "set-delete", set: name }, "Rollback failed: could not recreate deleted set during set delete rollback");
              });
          }
          return handleRouteError(reply, err, "Failed to delete set");
        }
      });
    },
  );
};
