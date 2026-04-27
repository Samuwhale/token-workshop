import type {
  GeneratorCollectionMoveUpdate,
  GeneratorPathRenameUpdate,
  GeneratorService,
} from "./generator-service.js";
import { readGraphProvenance } from "@tokenmanager/core";
import { ConflictError } from "../errors.js";
import type {
  OperationLog,
  SnapshotEntry,
} from "./operation-log.js";
import {
  listSnapshotTokenPaths,
  mergeSnapshots,
  qualifySnapshotEntries,
  restoreSnapshotEntries,
  snapshotGroup,
  snapshotPaths,
} from "./operation-log.js";
import type { TokenStore } from "./token-store.js";

type SnapshotMap = Record<string, SnapshotEntry>;

interface MutationCommandServices {
  tokenStore: TokenStore;
  operationLog: OperationLog;
  generatorService: GeneratorService;
}

interface LoggedMutationConfig<TResult> {
  type: string;
  description: string | ((result: TResult) => string);
  collectionId: string;
  captureBefore: () => Promise<SnapshotMap>;
  guardBefore?: () => Promise<SnapshotMap>;
  mutate: () => Promise<TResult>;
  captureAfter: (result: TResult) => Promise<SnapshotMap>;
  affectedPaths?: (
    before: SnapshotMap,
    after: SnapshotMap,
    result: TResult,
  ) => string[];
  pathRenames?: (result: TResult) => Array<{ oldPath: string; newPath: string }>;
  generatorUpdates?: (result: TResult) => GeneratorPathRenameUpdate[];
  generatorCollectionMoves?: (result: TResult) => GeneratorCollectionMoveUpdate[];
}

function listAffectedPaths(before: SnapshotMap, after: SnapshotMap): string[] {
  return [
    ...new Set([
      ...listSnapshotTokenPaths(before),
      ...listSnapshotTokenPaths(after),
    ]),
  ];
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertNoGraphManagedTokens(snapshot: SnapshotMap, action: string): void {
  const graphManaged = Object.entries(snapshot)
    .filter(([, entry]) => entry.token && readGraphProvenance(entry.token))
    .map(([snapshotKey]) => snapshotKey);
  if (graphManaged.length === 0) return;
  const preview = graphManaged.slice(0, 5).join(", ");
  const more = graphManaged.length > 5 ? ` and ${graphManaged.length - 5} more` : "";
  throw new ConflictError(
    `Cannot ${action} graph-managed token${graphManaged.length === 1 ? "" : "s"}: ${preview}${more}. Detach from the graph first.`,
  );
}

async function rollbackFailedMutation(
  services: MutationCommandServices,
  mutationType: string,
  beforeSnapshot: SnapshotMap,
  operationId: string | undefined,
  error: unknown,
): Promise<never> {
  try {
    if (operationId) {
      await services.operationLog.rollback(operationId, {
        tokenStore: services.tokenStore,
      });
    } else {
      await restoreSnapshotEntries(services.tokenStore, beforeSnapshot);
    }
  } catch (rollbackError) {
    throw new Error(
      `${mutationType} failed and rollback could not be completed. ` +
        `Original error: ${formatErrorMessage(error)}. ` +
        `Rollback error: ${formatErrorMessage(rollbackError)}.`,
    );
  }

  throw error;
}

async function captureQualifiedPathsSnapshot(
  tokenStore: TokenStore,
  collectionId: string,
  paths: string[],
): Promise<SnapshotMap> {
  return qualifySnapshotEntries(
    collectionId,
    await snapshotPaths(tokenStore, collectionId, paths),
  );
}

async function captureQualifiedGroupSnapshot(
  tokenStore: TokenStore,
  collectionId: string,
  groupPath: string,
): Promise<SnapshotMap> {
  return qualifySnapshotEntries(
    collectionId,
    await snapshotGroup(tokenStore, collectionId, groupPath),
  );
}

async function executeLoggedMutation<TResult>(
  services: MutationCommandServices,
  config: LoggedMutationConfig<TResult>,
): Promise<{ result: TResult; operationId: string }> {
  const beforeSnapshot = await config.captureBefore();
  const guardSnapshot = config.guardBefore ? await config.guardBefore() : {};
  assertNoGraphManagedTokens(
    mergeSnapshots(beforeSnapshot, guardSnapshot),
    config.type.replace(/-/g, " "),
  );
  const result = await config.mutate();

  let operationId: string | undefined;
  try {
    const afterSnapshot = await config.captureAfter(result);
    const entry = await services.operationLog.record({
      type: config.type,
      description:
        typeof config.description === "function"
          ? config.description(result)
          : config.description,
      resourceId: config.collectionId,
      affectedPaths:
        config.affectedPaths?.(beforeSnapshot, afterSnapshot, result) ??
        listAffectedPaths(beforeSnapshot, afterSnapshot),
      beforeSnapshot,
      afterSnapshot,
      pathRenames: config.pathRenames?.(result),
    });
    operationId = entry.id;

    const generatorUpdates = config.generatorUpdates?.(result) ?? [];
    if (generatorUpdates.length > 0) {
      await services.generatorService.applyPathRenames(generatorUpdates);
    }
    const generatorCollectionMoves =
      config.generatorCollectionMoves?.(result) ?? [];
    if (generatorCollectionMoves.length > 0) {
      await services.generatorService.applyCollectionMoves(
        generatorCollectionMoves,
      );
    }
  } catch (error) {
    return rollbackFailedMutation(
      services,
      config.type,
      beforeSnapshot,
      operationId,
      error,
    );
  }

  return { result, operationId: operationId! };
}

export async function renameGroupCommand(
  services: MutationCommandServices,
  input: {
    collectionId: string;
    oldGroupPath: string;
    newGroupPath: string;
    updateAliases: boolean;
  },
) {
  const { collectionId, oldGroupPath, newGroupPath, updateAliases } = input;
  return executeLoggedMutation(services, {
    type: "group-rename",
    description: `Rename group "${oldGroupPath}" → "${newGroupPath}" in ${collectionId}`,
    collectionId,
    captureBefore: () =>
      snapshotGroup(services.tokenStore, collectionId, oldGroupPath),
    mutate: () =>
      services.tokenStore.renameGroup(
        collectionId,
        oldGroupPath,
        newGroupPath,
        updateAliases,
      ),
    captureAfter: () =>
      snapshotGroup(services.tokenStore, collectionId, newGroupPath),
    pathRenames: (result) => result.pathRenames,
    generatorUpdates: () => [
      { scope: "group", oldPath: oldGroupPath, newPath: newGroupPath },
    ],
  });
}

export async function moveGroupCommand(
  services: MutationCommandServices,
  input: {
    sourceCollectionId: string;
    groupPath: string;
    targetCollectionId: string;
  },
) {
  const { sourceCollectionId, groupPath, targetCollectionId } = input;
  return executeLoggedMutation(services, {
    type: "group-move",
    description: `Move group "${groupPath}" from ${sourceCollectionId} to ${targetCollectionId}`,
    collectionId: sourceCollectionId,
    captureBefore: async () =>
      mergeSnapshots(
        await snapshotGroup(services.tokenStore, sourceCollectionId, groupPath),
        await captureQualifiedGroupSnapshot(
          services.tokenStore,
          targetCollectionId,
          groupPath,
        ),
      ),
    mutate: () =>
      services.tokenStore.moveGroup(
        sourceCollectionId,
        groupPath,
        targetCollectionId,
      ),
    captureAfter: async () =>
      mergeSnapshots(
        await snapshotGroup(services.tokenStore, sourceCollectionId, groupPath),
        await captureQualifiedGroupSnapshot(
          services.tokenStore,
          targetCollectionId,
          groupPath,
        ),
      ),
    generatorCollectionMoves: () => [
      {
        scope: "group",
        oldCollectionId: sourceCollectionId,
        newCollectionId: targetCollectionId,
        oldPath: groupPath,
        newPath: groupPath,
      },
    ],
  });
}

export async function copyGroupCommand(
  services: MutationCommandServices,
  input: {
    sourceCollectionId: string;
    groupPath: string;
    targetCollectionId: string;
  },
) {
  const { sourceCollectionId, groupPath, targetCollectionId } = input;
  return executeLoggedMutation(services, {
    type: "group-copy",
    description: `Copy group "${groupPath}" from ${sourceCollectionId} to ${targetCollectionId}`,
    collectionId: sourceCollectionId,
    captureBefore: () =>
      captureQualifiedGroupSnapshot(
        services.tokenStore,
        targetCollectionId,
        groupPath,
      ),
    guardBefore: () =>
      captureQualifiedGroupSnapshot(
        services.tokenStore,
        sourceCollectionId,
        groupPath,
      ),
    mutate: () =>
      services.tokenStore.copyGroup(
        sourceCollectionId,
        groupPath,
        targetCollectionId,
      ),
    captureAfter: () =>
      captureQualifiedGroupSnapshot(
        services.tokenStore,
        targetCollectionId,
        groupPath,
      ),
  });
}

export async function renameTokenCommand(
  services: MutationCommandServices,
  input: {
    collectionId: string;
    oldPath: string;
    newPath: string;
    updateAliases: boolean;
  },
) {
  const { collectionId, oldPath, newPath, updateAliases } = input;
  return executeLoggedMutation(services, {
    type: "token-rename",
    description: `Rename token "${oldPath}" → "${newPath}" in ${collectionId}`,
    collectionId,
    captureBefore: () =>
      snapshotPaths(services.tokenStore, collectionId, [oldPath]),
    mutate: () =>
      services.tokenStore.renameToken(
        collectionId,
        oldPath,
        newPath,
        updateAliases,
      ),
    captureAfter: () =>
      snapshotPaths(services.tokenStore, collectionId, [newPath]),
    pathRenames: (result) => result.pathRenames,
    generatorUpdates: (result) =>
      result.pathRenames.map(({ oldPath: sourcePath, newPath: targetPath }) => ({
        scope: "token" as const,
        oldPath: sourcePath,
        newPath: targetPath,
      })),
  });
}

export async function moveTokenCommand(
  services: MutationCommandServices,
  input: {
    sourceCollectionId: string;
    tokenPath: string;
    targetCollectionId: string;
    targetPath?: string;
    overwriteExisting?: boolean;
  },
) {
  const {
    sourceCollectionId,
    tokenPath,
    targetCollectionId,
    targetPath = tokenPath,
    overwriteExisting = false,
  } = input;
  return executeLoggedMutation(services, {
    type: "token-move",
    description: `Move token "${tokenPath}" from ${sourceCollectionId} to ${targetCollectionId}${targetPath === tokenPath ? "" : ` as "${targetPath}"`}`,
    collectionId: sourceCollectionId,
    captureBefore: async () =>
      mergeSnapshots(
        await snapshotPaths(services.tokenStore, sourceCollectionId, [tokenPath]),
        await captureQualifiedPathsSnapshot(
          services.tokenStore,
          targetCollectionId,
          [targetPath],
        ),
      ),
    mutate: () =>
      services.tokenStore.moveToken(
        sourceCollectionId,
        tokenPath,
        targetCollectionId,
        {
          targetPath,
          overwriteExisting,
        },
      ),
    captureAfter: async () =>
      mergeSnapshots(
        await snapshotPaths(services.tokenStore, sourceCollectionId, [tokenPath]),
        await captureQualifiedPathsSnapshot(
          services.tokenStore,
          targetCollectionId,
          [targetPath],
        ),
      ),
    generatorCollectionMoves: () => [
      {
        scope: "token",
        oldCollectionId: sourceCollectionId,
        newCollectionId: targetCollectionId,
        oldPath: tokenPath,
        newPath: targetPath,
      },
    ],
  });
}

export async function copyTokenCommand(
  services: MutationCommandServices,
  input: {
    sourceCollectionId: string;
    tokenPath: string;
    targetCollectionId: string;
    targetPath?: string;
    overwriteExisting?: boolean;
  },
) {
  const {
    sourceCollectionId,
    tokenPath,
    targetCollectionId,
    targetPath = tokenPath,
    overwriteExisting = false,
  } = input;
  return executeLoggedMutation(services, {
    type: "token-copy",
    description: `Copy token "${tokenPath}" from ${sourceCollectionId} to ${targetCollectionId}${targetPath === tokenPath ? "" : ` as "${targetPath}"`}`,
    collectionId: targetCollectionId,
    captureBefore: () =>
      captureQualifiedPathsSnapshot(
        services.tokenStore,
        targetCollectionId,
        [targetPath],
      ),
    guardBefore: () =>
      captureQualifiedPathsSnapshot(
        services.tokenStore,
        sourceCollectionId,
        [tokenPath],
      ),
    mutate: () =>
      services.tokenStore.copyToken(
        sourceCollectionId,
        tokenPath,
        targetCollectionId,
        {
          targetPath,
          overwriteExisting,
        },
      ),
    captureAfter: () =>
      captureQualifiedPathsSnapshot(
        services.tokenStore,
        targetCollectionId,
        [targetPath],
      ),
  });
}

export async function batchRenameTokensCommand(
  services: MutationCommandServices,
  input: {
    collectionId: string;
    renames: Array<{ oldPath: string; newPath: string }>;
    updateAliases: boolean;
  },
) {
  const { collectionId, renames, updateAliases } = input;
  const oldPaths = renames.map(({ oldPath }) => oldPath);
  const newPaths = renames.map(({ newPath }) => newPath);

  return executeLoggedMutation(services, {
    type: "batch-rename",
    description: `Batch rename ${renames.length} token${renames.length === 1 ? "" : "s"} in ${collectionId}`,
    collectionId,
    captureBefore: () =>
      snapshotPaths(services.tokenStore, collectionId, oldPaths),
    mutate: () =>
      services.tokenStore.batchRenameTokens(
        collectionId,
        renames,
        updateAliases,
      ),
    captureAfter: () =>
      snapshotPaths(services.tokenStore, collectionId, newPaths),
    pathRenames: (result) => result.pathRenames,
    generatorUpdates: (result) =>
      result.pathRenames.map(({ oldPath, newPath }) => ({
        scope: "token" as const,
        oldPath,
        newPath,
      })),
  });
}

export async function batchMoveTokensCommand(
  services: MutationCommandServices,
  input: {
    sourceCollectionId: string;
    paths: string[];
    targetCollectionId: string;
  },
) {
  const { sourceCollectionId, paths, targetCollectionId } = input;
  return executeLoggedMutation(services, {
    type: "batch-move",
    description: (result) =>
      `Move ${result.moved} token${result.moved === 1 ? "" : "s"} from ${sourceCollectionId} to ${targetCollectionId}`,
    collectionId: sourceCollectionId,
    captureBefore: async () =>
      mergeSnapshots(
        await snapshotPaths(services.tokenStore, sourceCollectionId, paths),
        await captureQualifiedPathsSnapshot(
          services.tokenStore,
          targetCollectionId,
          paths,
        ),
      ),
    mutate: () =>
      services.tokenStore.batchMoveTokens(
        sourceCollectionId,
        paths,
        targetCollectionId,
      ),
    captureAfter: async () =>
      mergeSnapshots(
        await snapshotPaths(services.tokenStore, sourceCollectionId, paths),
        await captureQualifiedPathsSnapshot(
          services.tokenStore,
          targetCollectionId,
          paths,
        ),
      ),
    generatorCollectionMoves: () =>
      paths.map((path) => ({
        scope: "token" as const,
        oldCollectionId: sourceCollectionId,
        newCollectionId: targetCollectionId,
        oldPath: path,
        newPath: path,
      })),
  });
}

export async function batchCopyTokensCommand(
  services: MutationCommandServices,
  input: {
    sourceCollectionId: string;
    paths: string[];
    targetCollectionId: string;
  },
) {
  const { sourceCollectionId, paths, targetCollectionId } = input;
  return executeLoggedMutation(services, {
    type: "batch-copy",
    description: (result) =>
      `Copy ${result.copied} token${result.copied === 1 ? "" : "s"} from ${sourceCollectionId} to ${targetCollectionId}`,
    collectionId: targetCollectionId,
    captureBefore: () =>
      captureQualifiedPathsSnapshot(
        services.tokenStore,
        targetCollectionId,
        paths,
      ),
    guardBefore: () =>
      captureQualifiedPathsSnapshot(
        services.tokenStore,
        sourceCollectionId,
        paths,
      ),
    mutate: () =>
      services.tokenStore.batchCopyTokens(
        sourceCollectionId,
        paths,
        targetCollectionId,
      ),
    captureAfter: () =>
      captureQualifiedPathsSnapshot(
        services.tokenStore,
        targetCollectionId,
        paths,
      ),
  });
}
