import type {
  RecipePathRenameUpdate,
  RecipeService,
} from "./recipe-service.js";
import type {
  OperationLog,
  SnapshotEntry,
} from "./operation-log.js";
import {
  listSnapshotTokenPaths,
  mergeSnapshots,
  qualifySnapshotEntries,
  snapshotGroup,
  snapshotPaths,
} from "./operation-log.js";
import type { TokenStore } from "./token-store.js";

type SnapshotMap = Record<string, SnapshotEntry>;

interface MutationCommandServices {
  tokenStore: TokenStore;
  operationLog: OperationLog;
  recipeService: RecipeService;
}

interface LoggedMutationConfig<TResult> {
  type: string;
  description: string | ((result: TResult) => string);
  setName: string;
  captureBefore: () => Promise<SnapshotMap>;
  mutate: () => Promise<TResult>;
  captureAfter: (result: TResult) => Promise<SnapshotMap>;
  affectedPaths?: (
    before: SnapshotMap,
    after: SnapshotMap,
    result: TResult,
  ) => string[];
  pathRenames?: (result: TResult) => Array<{ oldPath: string; newPath: string }>;
  recipeUpdates?: (result: TResult) => RecipePathRenameUpdate[];
}

function listAffectedPaths(before: SnapshotMap, after: SnapshotMap): string[] {
  return [
    ...new Set([
      ...listSnapshotTokenPaths(before),
      ...listSnapshotTokenPaths(after),
    ]),
  ];
}

async function captureQualifiedPathsSnapshot(
  tokenStore: TokenStore,
  setName: string,
  paths: string[],
): Promise<SnapshotMap> {
  return qualifySnapshotEntries(
    setName,
    await snapshotPaths(tokenStore, setName, paths),
  );
}

async function captureQualifiedGroupSnapshot(
  tokenStore: TokenStore,
  setName: string,
  groupPath: string,
): Promise<SnapshotMap> {
  return qualifySnapshotEntries(
    setName,
    await snapshotGroup(tokenStore, setName, groupPath),
  );
}

async function executeLoggedMutation<TResult>(
  services: MutationCommandServices,
  config: LoggedMutationConfig<TResult>,
): Promise<{ result: TResult; operationId: string }> {
  const beforeSnapshot = await config.captureBefore();
  const result = await config.mutate();
  const afterSnapshot = await config.captureAfter(result);

  const entry = await services.operationLog.record({
    type: config.type,
    description:
      typeof config.description === "function"
        ? config.description(result)
        : config.description,
    setName: config.setName,
    affectedPaths:
      config.affectedPaths?.(beforeSnapshot, afterSnapshot, result) ??
      listAffectedPaths(beforeSnapshot, afterSnapshot),
    beforeSnapshot,
    afterSnapshot,
    pathRenames: config.pathRenames?.(result),
  });

  const recipeUpdates = config.recipeUpdates?.(result) ?? [];
  if (recipeUpdates.length > 0) {
    await services.recipeService.applyPathRenames(recipeUpdates);
  }

  return { result, operationId: entry.id };
}

export async function renameGroupCommand(
  services: MutationCommandServices,
  input: {
    setName: string;
    oldGroupPath: string;
    newGroupPath: string;
    updateAliases: boolean;
  },
) {
  const { setName, oldGroupPath, newGroupPath, updateAliases } = input;
  return executeLoggedMutation(services, {
    type: "group-rename",
    description: `Rename group "${oldGroupPath}" → "${newGroupPath}" in ${setName}`,
    setName,
    captureBefore: () => snapshotGroup(services.tokenStore, setName, oldGroupPath),
    mutate: () =>
      services.tokenStore.renameGroup(
        setName,
        oldGroupPath,
        newGroupPath,
        updateAliases,
      ),
    captureAfter: () => snapshotGroup(services.tokenStore, setName, newGroupPath),
    pathRenames: (result) => result.pathRenames,
    recipeUpdates: () => [
      { scope: "group", oldPath: oldGroupPath, newPath: newGroupPath },
    ],
  });
}

export async function moveGroupCommand(
  services: MutationCommandServices,
  input: { fromSet: string; groupPath: string; toSet: string },
) {
  const { fromSet, groupPath, toSet } = input;
  return executeLoggedMutation(services, {
    type: "group-move",
    description: `Move group "${groupPath}" from ${fromSet} to ${toSet}`,
    setName: fromSet,
    captureBefore: async () =>
      mergeSnapshots(
        await snapshotGroup(services.tokenStore, fromSet, groupPath),
        await captureQualifiedGroupSnapshot(services.tokenStore, toSet, groupPath),
      ),
    mutate: () => services.tokenStore.moveGroup(fromSet, groupPath, toSet),
    captureAfter: async () =>
      mergeSnapshots(
        await snapshotGroup(services.tokenStore, fromSet, groupPath),
        await captureQualifiedGroupSnapshot(services.tokenStore, toSet, groupPath),
      ),
  });
}

export async function copyGroupCommand(
  services: MutationCommandServices,
  input: { fromSet: string; groupPath: string; toSet: string },
) {
  const { fromSet, groupPath, toSet } = input;
  return executeLoggedMutation(services, {
    type: "group-copy",
    description: `Copy group "${groupPath}" from ${fromSet} to ${toSet}`,
    setName: fromSet,
    captureBefore: () =>
      captureQualifiedGroupSnapshot(services.tokenStore, toSet, groupPath),
    mutate: () => services.tokenStore.copyGroup(fromSet, groupPath, toSet),
    captureAfter: () =>
      captureQualifiedGroupSnapshot(services.tokenStore, toSet, groupPath),
  });
}

export async function renameTokenCommand(
  services: MutationCommandServices,
  input: {
    setName: string;
    oldPath: string;
    newPath: string;
    updateAliases: boolean;
  },
) {
  const { setName, oldPath, newPath, updateAliases } = input;
  return executeLoggedMutation(services, {
    type: "token-rename",
    description: `Rename token "${oldPath}" → "${newPath}" in ${setName}`,
    setName,
    captureBefore: () => snapshotPaths(services.tokenStore, setName, [oldPath]),
    mutate: () =>
      services.tokenStore.renameToken(setName, oldPath, newPath, updateAliases),
    captureAfter: () => snapshotPaths(services.tokenStore, setName, [newPath]),
    pathRenames: (result) => result.pathRenames,
    recipeUpdates: (result) =>
      result.pathRenames.map(({ oldPath: sourcePath, newPath: targetPath }) => ({
        scope: "token" as const,
        oldPath: sourcePath,
        newPath: targetPath,
      })),
  });
}

export async function moveTokenCommand(
  services: MutationCommandServices,
  input: { fromSet: string; tokenPath: string; toSet: string },
) {
  const { fromSet, tokenPath, toSet } = input;
  return executeLoggedMutation(services, {
    type: "token-move",
    description: `Move token "${tokenPath}" from ${fromSet} to ${toSet}`,
    setName: fromSet,
    captureBefore: async () =>
      mergeSnapshots(
        await snapshotPaths(services.tokenStore, fromSet, [tokenPath]),
        await captureQualifiedPathsSnapshot(services.tokenStore, toSet, [tokenPath]),
      ),
    mutate: () => services.tokenStore.moveToken(fromSet, tokenPath, toSet),
    captureAfter: async () =>
      mergeSnapshots(
        await snapshotPaths(services.tokenStore, fromSet, [tokenPath]),
        await captureQualifiedPathsSnapshot(services.tokenStore, toSet, [tokenPath]),
      ),
  });
}

export async function copyTokenCommand(
  services: MutationCommandServices,
  input: { fromSet: string; tokenPath: string; toSet: string },
) {
  const { fromSet, tokenPath, toSet } = input;
  return executeLoggedMutation(services, {
    type: "token-copy",
    description: `Copy token "${tokenPath}" from ${fromSet} to ${toSet}`,
    setName: toSet,
    captureBefore: () =>
      captureQualifiedPathsSnapshot(services.tokenStore, toSet, [tokenPath]),
    mutate: () => services.tokenStore.copyToken(fromSet, tokenPath, toSet),
    captureAfter: () =>
      captureQualifiedPathsSnapshot(services.tokenStore, toSet, [tokenPath]),
  });
}

export async function batchRenameTokensCommand(
  services: MutationCommandServices,
  input: {
    setName: string;
    renames: Array<{ oldPath: string; newPath: string }>;
    updateAliases: boolean;
  },
) {
  const { setName, renames, updateAliases } = input;
  const oldPaths = renames.map(({ oldPath }) => oldPath);
  const newPaths = renames.map(({ newPath }) => newPath);

  return executeLoggedMutation(services, {
    type: "batch-rename",
    description: `Batch rename ${renames.length} token${renames.length === 1 ? "" : "s"} in ${setName}`,
    setName,
    captureBefore: () => snapshotPaths(services.tokenStore, setName, oldPaths),
    mutate: () =>
      services.tokenStore.batchRenameTokens(setName, renames, updateAliases),
    captureAfter: () => snapshotPaths(services.tokenStore, setName, newPaths),
    pathRenames: (result) => result.pathRenames,
    recipeUpdates: (result) =>
      result.pathRenames.map(({ oldPath, newPath }) => ({
        scope: "token" as const,
        oldPath,
        newPath,
      })),
  });
}

export async function batchMoveTokensCommand(
  services: MutationCommandServices,
  input: { fromSet: string; paths: string[]; toSet: string },
) {
  const { fromSet, paths, toSet } = input;
  return executeLoggedMutation(services, {
    type: "batch-move",
    description: (result) =>
      `Move ${result.moved} token${result.moved === 1 ? "" : "s"} from ${fromSet} to ${toSet}`,
    setName: fromSet,
    captureBefore: async () =>
      mergeSnapshots(
        await snapshotPaths(services.tokenStore, fromSet, paths),
        await captureQualifiedPathsSnapshot(services.tokenStore, toSet, paths),
      ),
    mutate: () => services.tokenStore.batchMoveTokens(fromSet, paths, toSet),
    captureAfter: async () =>
      mergeSnapshots(
        await snapshotPaths(services.tokenStore, fromSet, paths),
        await captureQualifiedPathsSnapshot(services.tokenStore, toSet, paths),
      ),
  });
}

export async function batchCopyTokensCommand(
  services: MutationCommandServices,
  input: { fromSet: string; paths: string[]; toSet: string },
) {
  const { fromSet, paths, toSet } = input;
  return executeLoggedMutation(services, {
    type: "batch-copy",
    description: (result) =>
      `Copy ${result.copied} token${result.copied === 1 ? "" : "s"} from ${fromSet} to ${toSet}`,
    setName: toSet,
    captureBefore: () =>
      captureQualifiedPathsSnapshot(services.tokenStore, toSet, paths),
    mutate: () => services.tokenStore.batchCopyTokens(fromSet, paths, toSet),
    captureAfter: () =>
      captureQualifiedPathsSnapshot(services.tokenStore, toSet, paths),
  });
}
