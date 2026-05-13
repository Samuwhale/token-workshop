import type { FastifyPluginAsync } from "fastify";
import type { TokenGroup } from "@token-workshop/core";
import type {
  FieldChange,
  FieldChangeOperationMetadata,
  RollbackStep,
  SnapshotEntry,
} from "../services/operation-log.js";
import type {
  CollectionMetadataState,
  CollectionState,
} from "../services/collection-store.js";
import { handleRouteError } from "../errors.js";
import {
  buildTokenGroupFromSnapshot,
  buildTopLevelItems,
  expandTopLevelItems,
  isValidCollectionName,
} from "../services/collection-helpers.js";
import type { CollectionStructuralOperation } from "../services/collection-service.js";
import {
  hasBodyField,
  isRequestBodyObject,
  readOptionalBooleanField,
  readOptionalTrimmedStringField,
  readRequiredTrimmedStringField,
} from "./body-utils.js";

function isMergeResolutionMap(
  value: unknown,
): value is Record<string, "source" | "target"> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (resolution) => resolution === "source" || resolution === "target",
    )
  );
}

function buildCollectionsRollbackStep(state: CollectionState): RollbackStep {
  return {
    action: "restore-collection-state" as const,
    collections: structuredClone(state.collections),
  };
}

function buildWorkspaceTokensFromSnapshot(
  state: CollectionState,
  snapshot: Record<string, SnapshotEntry>,
): Record<string, TokenGroup> {
  return Object.fromEntries(
    state.collections.map((collection) => [
      collection.id,
      buildTokenGroupFromSnapshot(snapshot, collection.id),
    ]),
  );
}

export const collectionStructureRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/collections — create a collection
  fastify.post<{
    Body: {
      id: string;
      description?: string;
      modes: Array<{ name: string }>;
      tokens?: Record<string, unknown>;
    };
  }>(
    "/collections",
    async (request, reply) => {
      const body = isRequestBodyObject(request.body) ? request.body : undefined;
      const idResult = readRequiredTrimmedStringField(
        body,
        "id",
        "Collection id",
      );
      if (!idResult.ok) {
        return reply.status(400).send({ error: idResult.error });
      }
      const id = idResult.value;
      const modes = body?.modes;
      const tokens = body?.tokens;
      if (!isValidCollectionName(id)) {
        return reply.status(400).send({
          error:
            "Collection id must contain only alphanumeric characters, dashes, underscores, and / for folders",
        });
      }
      if (modes === undefined) {
        return reply.status(400).send({
          error: "At least one collection mode is required",
        });
      }
      if (
        !Array.isArray(modes) ||
        modes.some(
          (mode) =>
            !mode ||
            typeof mode !== "object" ||
            typeof mode.name !== "string" ||
            !mode.name.trim(),
        )
      ) {
        return reply.status(400).send({
          error: "Modes must be an array of objects with non-empty names",
        });
      }
      if (modes.length === 0) {
        return reply.status(400).send({
          error: "At least one collection mode is required",
        });
      }
      const descriptionResult = readOptionalTrimmedStringField(
        body ?? {},
        "description",
        "Description",
      );
      if (!descriptionResult.ok) {
        return reply.status(400).send({ error: descriptionResult.error });
      }

      let mutation: Awaited<
        ReturnType<typeof fastify.collectionService.createCollectionOperation>
      > | null = null;
      try {
        mutation = await fastify.collectionService.createCollectionOperation({
          collectionId: id,
          definition: {
            description: descriptionResult.value,
            modes: modes.map((mode) => ({ name: mode.name.trim() })),
          },
          tokens: (tokens as TokenGroup | undefined) ?? undefined,
        });
        await fastify.operationLog.record({
          type: "collection-create",
          description: `Create collection "${id}"`,
          resourceId: id,
          affectedPaths: Object.keys(mutation.afterSnapshot),
          beforeSnapshot: {},
          afterSnapshot: mutation.afterSnapshot,
          rollbackSteps: [
            { action: "delete-collection", collectionId: id },
            buildCollectionsRollbackStep(mutation.previousCollectionState),
          ],
        });
        const overview = await fastify.collectionService.getCollectionsOverview();
        return reply
          .status(201)
          .send({ ok: true, id, collections: overview.collections });
      } catch (err) {
        if (mutation) {
          await fastify.tokenLock
            .withLock(() => fastify.collectionService.deleteCollection(id))
            .catch((rollbackErr) => {
              fastify.log.error(
                { err: rollbackErr, operation: "collection-create", collectionId: id },
                "Rollback failed: could not delete created collection after operation-log failure",
              );
            });
        }
        return handleRouteError(reply, err, "Failed to create collection");
      }
    },
  );

  // PATCH /api/collections/:id — update collection metadata
  fastify.patch<{
    Params: { id: string };
    Body: { description?: string };
  }>("/collections/:id", async (request, reply) => {
    const { id } = request.params;
    if (!isRequestBodyObject(request.body)) {
      return reply.status(400).send({ error: "Request body must be an object" });
    }
    const body = request.body;
    const bodyKeys = Object.keys(body);
    if (bodyKeys.some((key) => key !== "description")) {
      return reply.status(400).send({
        error: "Only the description can be updated for a collection",
      });
    }

    try {
      if (!hasBodyField(body, "description")) {
        const current = await fastify.collectionService.getCollectionMetadata(id);
        return { ok: true, id, ...current, changed: false };
      }

      const beforeMeta = await fastify.collectionService.getCollectionMetadata(id);
      const descriptionResult = readOptionalTrimmedStringField(
        body,
        "description",
        "Description",
      );
      if (!descriptionResult.ok) {
        return reply.status(400).send({ error: descriptionResult.error });
      }
      const nextValue = descriptionResult.value;
      const changes: FieldChange[] = [];
      if (beforeMeta.description !== nextValue) {
        changes.push({
          field: "description",
          label: "Description",
          before: beforeMeta.description,
          after: nextValue,
        });
      }
      if (changes.length === 0) {
        return { ok: true, id, ...beforeMeta, changed: false };
      }

      await fastify.collectionService.updateCollectionMetadata(id, {
        description: nextValue,
      });
      const afterMeta = await fastify.collectionService.getCollectionMetadata(id);
      const rollbackMetadata: Partial<CollectionMetadataState> = {
        description: beforeMeta.description,
      };
      const metadata: FieldChangeOperationMetadata = {
        kind: "collection-metadata",
        collectionId: id,
        before: beforeMeta,
        after: afterMeta,
        changes,
      };
      await fastify.operationLog.record({
        type: "collection-metadata",
        description: `Update metadata for collection "${id}"`,
        resourceId: id,
        affectedPaths: [],
        beforeSnapshot: {},
        afterSnapshot: {},
        rollbackSteps: [
          {
            action: "write-collection-metadata",
            collectionId: id,
            metadata: rollbackMetadata,
          },
        ],
        metadata,
      });
      return { ok: true, id, ...afterMeta, changed: true };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to update metadata");
    }
  });

  // POST /api/collections/:id/rename — rename a collection atomically
  fastify.post<{ Params: { id: string }; Body: { newName: string } }>(
    "/collections/:id/rename",
    async (request, reply) => {
      const { id } = request.params;
      const body = isRequestBodyObject(request.body) ? request.body : undefined;
      const newNameResult = readRequiredTrimmedStringField(
        body,
        "newName",
        "newName",
      );
      if (!newNameResult.ok) {
        return reply.status(400).send({ error: newNameResult.error });
      }
      const newName = newNameResult.value;
      if (!isValidCollectionName(newName)) {
        return reply.status(400).send({
          error:
            "Collection name must contain only alphanumeric characters, dashes, underscores, and / for folders",
        });
      }

      let mutation: Awaited<
        ReturnType<typeof fastify.collectionService.renameCollectionOperation>
      > | null = null;
      try {
        mutation = await fastify.collectionService.renameCollectionOperation({
          collectionId: id,
          newName,
        });
        await fastify.operationLog.record({
          type: "collection-rename",
          description: `Rename collection "${id}" → "${newName}"`,
          resourceId: newName,
          affectedPaths: mutation.affectedPaths,
          beforeSnapshot: mutation.beforeSnapshot,
          afterSnapshot: mutation.afterSnapshot,
          rollbackSteps: [
            { action: "rename-collection", from: newName, to: id },
            buildCollectionsRollbackStep(mutation.previousCollectionState),
          ],
        });
        return { ok: true, oldId: id, newId: newName };
      } catch (err) {
        if (mutation) {
          await fastify.tokenLock
            .withLock(() =>
              fastify.collectionService.renameCollection(newName, id),
            )
            .catch((rollbackErr) => {
              fastify.log.error(
                { err: rollbackErr, operation: "collection-rename", from: newName, to: id },
                "Rollback failed: could not revert collection rename after operation-log failure",
              );
            });
        }
        return handleRouteError(reply, err, "Failed to rename collection");
      }
    },
  );

  // POST /api/collections/reorder — reorder collections
  fastify.post<{ Body: { order: string[] } }>(
    "/collections/reorder",
    async (request, reply) => {
      const body = isRequestBodyObject(request.body) ? request.body : undefined;
      const order = body?.order;
      if (!Array.isArray(order)) {
        return reply
          .status(400)
          .send({ error: "order must be an array of collection ids" });
      }
      if (order.some((collectionId) => typeof collectionId !== "string")) {
        return reply
          .status(400)
          .send({ error: "order must contain only collection ids" });
      }
      try {
        const { previousOrder } =
          await fastify.collectionService.reorderCollectionsOperation(order);
        await fastify.operationLog.record({
          type: "collection-reorder",
          description: "Reorder collections",
          resourceId: "",
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          rollbackSteps: [
            { action: "reorder-collections", order: previousOrder },
          ],
        });
        return { ok: true };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to reorder collections");
      }
    },
  );

  // POST /api/collections/folders/rename — rename a folder prefix across all contained collections
  fastify.post<{ Body: { fromFolder?: string; toFolder?: string } }>(
    "/collections/folders/rename",
    async (request, reply) => {
      const body = isRequestBodyObject(request.body) ? request.body : undefined;
      const fromFolderResult = readRequiredTrimmedStringField(
        body,
        "fromFolder",
        "fromFolder",
      );
      const toFolderResult = readRequiredTrimmedStringField(
        body,
        "toFolder",
        "toFolder",
      );
      if (!fromFolderResult.ok) {
        return reply.status(400).send({ error: fromFolderResult.error });
      }
      if (!toFolderResult.ok) {
        return reply.status(400).send({
          error: toFolderResult.error,
        });
      }
      const fromFolder = fromFolderResult.value;
      const toFolder = toFolderResult.value;
      if (!isValidCollectionName(fromFolder) || !isValidCollectionName(toFolder)) {
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

      let mutation: Awaited<
        ReturnType<typeof fastify.collectionService.renameFolder>
      > | null = null;
      try {
        mutation = await fastify.collectionService.renameFolder({
          fromFolder,
          toFolder,
        });
        const rollbackSteps: RollbackStep[] = [
          ...mutation.renamedCollections
            .slice()
            .reverse()
            .map(({ from, to }) => ({
              action: "rename-collection" as const,
              from: to,
              to: from,
            })),
          buildCollectionsRollbackStep(mutation.previousCollectionState),
        ];
        await fastify.operationLog.record({
          type: "collection-folder-rename",
          description: `Rename folder "${fromFolder}" → "${toFolder}"`,
          resourceId: toFolder,
          affectedPaths: mutation.affectedPaths,
          beforeSnapshot: mutation.beforeSnapshot,
          afterSnapshot: mutation.afterSnapshot,
          rollbackSteps,
          metadata: {
            folder: fromFolder,
            newFolder: toFolder,
            renamedCollections: mutation.renamedCollections,
          },
        });
        return {
          ok: true,
          folder: fromFolder,
          newFolder: toFolder,
          renamedCollections: mutation.renamedCollections,
          collections: mutation.finalCollectionIds,
        };
      } catch (err) {
        if (mutation) {
          await fastify.tokenLock.withLock(async () => {
            for (const { from, to } of mutation!.renamedCollections
              .slice()
              .reverse()) {
              await fastify.collectionService
                .renameCollection(to, from)
                .catch((rollbackErr) => {
                  fastify.log.error(
                    { err: rollbackErr, operation: "folder-rename", from: to, to: from },
                    "Rollback failed: could not revert collection rename during folder rename rollback",
                  );
                });
            }
          });
        }
        return handleRouteError(reply, err, "Failed to rename folder");
      }
    },
  );

  // POST /api/collections/folders/reorder — reorder top-level folders and standalone collections
  fastify.post<{ Body: { order?: string[] } }>(
    "/collections/folders/reorder",
    async (request, reply) => {
      const order = request.body?.order;
      if (!Array.isArray(order)) {
        return reply.status(400).send({
          error: "order must be an array of top-level folder/collection items",
        });
      }

      try {
        const previousCollectionIds =
          await fastify.collectionService.listCollectionIds();
        const currentItems = buildTopLevelItems(previousCollectionIds);
        if (
          order.length !== currentItems.length ||
          currentItems.some((item) => !order.includes(item))
        ) {
          return reply.status(400).send({
            error:
              "order must contain every current top-level collection item exactly once",
          });
        }

        const nextOrder = expandTopLevelItems(previousCollectionIds, order);
        const { previousOrder } =
          await fastify.collectionService.reorderFoldersOperation({
            currentOrder: previousCollectionIds,
            nextOrder,
          });
        await fastify.operationLog.record({
          type: "collection-folder-reorder",
          description: "Reorder top-level collection folders",
          resourceId: "",
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          rollbackSteps: [
            { action: "reorder-collections", order: previousOrder },
          ],
          metadata: { order },
        });
        return {
          ok: true,
          collections: await fastify.collectionService.listCollectionIds(),
        };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to reorder folders");
      }
    },
  );

  // POST /api/collections/folders/merge — move every collection from one folder into another existing folder
  fastify.post<{ Body: { sourceFolder?: string; targetFolder?: string } }>(
    "/collections/folders/merge",
    async (request, reply) => {
      const body = isRequestBodyObject(request.body) ? request.body : undefined;
      const sourceFolderResult = readRequiredTrimmedStringField(
        body,
        "sourceFolder",
        "sourceFolder",
      );
      const targetFolderResult = readRequiredTrimmedStringField(
        body,
        "targetFolder",
        "targetFolder",
      );
      if (!sourceFolderResult.ok) {
        return reply.status(400).send({ error: sourceFolderResult.error });
      }
      if (!targetFolderResult.ok) {
        return reply.status(400).send({
          error: targetFolderResult.error,
        });
      }
      const sourceFolder = sourceFolderResult.value;
      const targetFolder = targetFolderResult.value;
      if (
        !isValidCollectionName(sourceFolder) ||
        !isValidCollectionName(targetFolder)
      ) {
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

      let mutation: Awaited<
        ReturnType<typeof fastify.collectionService.mergeFolder>
      > | null = null;
      try {
        mutation = await fastify.collectionService.mergeFolder({
          sourceFolder,
          targetFolder,
        });
        const rollbackSteps: RollbackStep[] = [
          ...mutation.renamedCollections
            .slice()
            .reverse()
            .map(({ from, to }) => ({
              action: "rename-collection" as const,
              from: to,
              to: from,
            })),
          buildCollectionsRollbackStep(mutation.previousCollectionState),
        ];
        await fastify.operationLog.record({
          type: "collection-folder-merge",
          description: `Merge folder "${sourceFolder}" into "${targetFolder}"`,
          resourceId: targetFolder,
          affectedPaths: mutation.affectedPaths,
          beforeSnapshot: mutation.beforeSnapshot,
          afterSnapshot: mutation.afterSnapshot,
          rollbackSteps,
          metadata: {
            sourceFolder,
            targetFolder,
            movedCollections: mutation.renamedCollections,
          },
        });
        return {
          ok: true,
          sourceFolder,
          targetFolder,
          movedCollections: mutation.renamedCollections,
          collections: mutation.finalCollectionIds,
        };
      } catch (err) {
        if (mutation) {
          await fastify.tokenLock.withLock(async () => {
            for (const { from, to } of mutation!.renamedCollections
              .slice()
              .reverse()) {
              await fastify.collectionService
                .renameCollection(to, from)
                .catch((rollbackErr) => {
                  fastify.log.error(
                    { err: rollbackErr, operation: "folder-merge", from: to, to: from },
                    "Rollback failed: could not revert collection rename during folder merge rollback",
                  );
                });
            }
          });
        }
        return handleRouteError(reply, err, "Failed to merge folders");
      }
    },
  );

  // POST /api/collections/folders/delete — delete every collection inside a folder
  fastify.post<{ Body: { folder?: string } }>(
    "/collections/folders/delete",
    async (request, reply) => {
      const body = isRequestBodyObject(request.body) ? request.body : undefined;
      const folderResult = readRequiredTrimmedStringField(
        body,
        "folder",
        "folder",
      );
      if (!folderResult.ok) {
        return reply.status(400).send({ error: folderResult.error });
      }
      const folder = folderResult.value;
      if (!isValidCollectionName(folder)) {
        return reply.status(400).send({
          error:
            "Folder names must contain only alphanumeric characters, dashes, underscores, and / for folders",
        });
      }

      let mutation: Awaited<
        ReturnType<typeof fastify.collectionService.deleteFolder>
      > | null = null;
      try {
        mutation = await fastify.collectionService.deleteFolder(folder);
        await fastify.operationLog.record({
          type: "collection-folder-delete",
          description: `Delete folder "${folder}"`,
          resourceId: folder,
          affectedPaths: mutation.affectedPaths,
          beforeSnapshot: mutation.beforeSnapshot,
          afterSnapshot: mutation.afterSnapshot,
          rollbackSteps: [
            ...mutation.deletedCollectionIds.map((collectionId) => ({
              action: "create-collection" as const,
              collectionId,
            })),
            buildCollectionsRollbackStep(mutation.previousCollectionState),
            {
              action: "restore-lint-config" as const,
              config: mutation.previousLintConfig,
            },
          ],
          metadata: {
            folder,
            deletedCollections: mutation.deletedCollectionIds,
          },
        });
        return {
          ok: true,
          folder,
          deletedCollections: mutation.deletedCollectionIds,
          collections: mutation.finalCollectionIds,
        };
      } catch (err) {
        if (mutation) {
          await fastify.collectionService
            .restoreCollectionWorkspace({
              state: mutation.previousCollectionState,
              tokensByCollection: buildWorkspaceTokensFromSnapshot(
                mutation.previousCollectionState,
                mutation.beforeSnapshot,
              ),
            })
            .then(() =>
              fastify.collectionService.restoreLintConfig(
                mutation!.previousLintConfig,
              ),
            )
            .catch((rollbackErr) => {
              fastify.log.error(
                { err: rollbackErr, operation: "folder-delete", folder },
                "Rollback failed: could not restore collection workspace dependencies after operation-log failure",
              );
            });
        }
        return handleRouteError(reply, err, "Failed to delete folder");
      }
    },
  );

  // DELETE /api/data — wipe all persisted state (danger zone)
  fastify.delete<{ Body: { confirm?: string } }>(
    "/data",
    async (request, reply) => {
      if (request.body?.confirm !== "DELETE") {
        return reply.status(400).send({
          error:
            'Missing confirmation — send { confirm: "DELETE" } in the request body',
        });
      }
      return fastify.tokenLock.withLock(async () => {
        try {
          await fastify.resolverLock.withLock(async () => {
            await fastify.collectionService.restoreCollectionWorkspaceWithinLock({
              state: { collections: [] },
              tokensByCollection: {},
            });
            await fastify.resolverStore.reset();
            await fastify.generatorService.restore([]);
            await fastify.lintConfigStore.reset();
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

  // POST /api/collections/:id/duplicate — duplicate a collection
  fastify.post<{ Params: { id: string }; Body?: { newName?: string } }>(
    "/collections/:id/duplicate",
    async (request, reply) => {
      const { id } = request.params;
      let mutation: Awaited<
        ReturnType<typeof fastify.collectionService.duplicateCollectionOperation>
      > | null = null;
      try {
        mutation = await fastify.collectionService.duplicateCollectionOperation({
          sourceCollectionId: id,
          requestedName: request.body?.newName,
        });
        await fastify.operationLog.record({
          type: "collection-create",
          description: `Duplicate collection "${id}" → "${mutation.result.id}"`,
          resourceId: mutation.result.id,
          affectedPaths: Object.keys(mutation.afterSnapshot),
          beforeSnapshot: {},
          afterSnapshot: mutation.afterSnapshot,
          rollbackSteps: [
            { action: "delete-collection", collectionId: mutation.result.id },
            buildCollectionsRollbackStep(mutation.previousCollectionState),
          ],
        });
        const overview = await fastify.collectionService.getCollectionsOverview();
        return reply
          .status(201)
          .send({
            ok: true,
            id: mutation.result.id,
            originalId: id,
            collections: overview.collections,
          });
      } catch (err) {
        if (mutation) {
          const createdId = mutation.result.id;
          await fastify.tokenLock
            .withLock(() =>
              fastify.collectionService.deleteCollection(createdId),
            )
            .catch((rollbackErr) => {
              fastify.log.error(
                {
                  err: rollbackErr,
                  operation: "collection-duplicate",
                  collectionId: createdId,
                },
                "Rollback failed: could not delete duplicated collection after operation-log failure",
              );
            });
        }
        return handleRouteError(reply, err, "Failed to duplicate collection");
      }
    },
  );

  // POST /api/collections/:id/merge — merge one collection into another atomically
  fastify.post<{
    Params: { id: string };
    Body: {
      targetCollection?: string;
      resolutions?: Record<string, "source" | "target">;
    };
  }>("/collections/:id/merge", async (request, reply) => {
    const { id } = request.params;
    const body = isRequestBodyObject(request.body) ? request.body : undefined;
    const targetCollectionResult = readRequiredTrimmedStringField(
      body,
      "targetCollection",
      "targetCollection",
    );
    if (!targetCollectionResult.ok) {
      return reply.status(400).send({ error: targetCollectionResult.error });
    }
    const targetCollection = targetCollectionResult.value;
    const resolutions =
      body?.resolutions === undefined ? {} : body.resolutions;
    if (!isMergeResolutionMap(resolutions)) {
      return reply.status(400).send({
        error: 'resolutions must map token paths to "source" or "target"',
      });
    }
    if (targetCollection === id) {
      return reply.status(400).send({
        error: "targetCollection must differ from the source collection",
      });
    }

    let mutation: Awaited<
      ReturnType<typeof fastify.collectionService.mergeCollection>
    > | null = null;
    try {
      mutation = await fastify.collectionService.mergeCollection({
        sourceCollectionId: id,
        targetCollectionId: targetCollection,
        resolutions,
      });
      const entry = await fastify.operationLog.record({
        type: "collection-merge",
        description: `Merge collection "${id}" into "${targetCollection}"`,
        resourceId: targetCollection,
        affectedPaths: mutation.affectedPaths,
        beforeSnapshot: mutation.beforeSnapshot,
        afterSnapshot: mutation.afterSnapshot,
        rollbackSteps: [
          { action: "create-collection", collectionId: id },
          buildCollectionsRollbackStep(mutation.previousCollectionState),
          {
            action: "restore-lint-config" as const,
            config: mutation.previousLintConfig,
          },
        ],
        metadata: {
          sourceCollection: id,
          targetCollection,
          conflictPaths: mutation.result.conflictPaths,
          resolutions,
        },
      });
      return {
        ok: true,
        sourceCollection: id,
        targetCollection,
        operationId: entry.id,
      };
    } catch (err) {
      if (mutation) {
        await fastify.collectionService
          .restoreCollectionWorkspace({
            state: mutation.previousCollectionState,
            tokensByCollection: buildWorkspaceTokensFromSnapshot(
              mutation.previousCollectionState,
              mutation.beforeSnapshot,
            ),
          })
          .then(() =>
            fastify.collectionService.restoreLintConfig(
              mutation!.previousLintConfig,
            ),
          )
          .catch((rollbackErr) => {
            fastify.log.error(
              {
                err: rollbackErr,
                operation: "collection-merge",
                sourceCollection: id,
                targetCollection,
              },
              "Rollback failed: could not restore collection workspace dependencies after operation-log failure",
            );
          });
      }
      return handleRouteError(reply, err, "Failed to merge collection");
    }
  });

  // POST /api/collections/:id/split — create new collections from each top-level group in a collection
  fastify.post<{
    Params: { id: string };
    Body: { deleteOriginal?: boolean };
  }>("/collections/:id/split", async (request, reply) => {
    const { id } = request.params;
    const body = isRequestBodyObject(request.body) ? request.body : undefined;
    const deleteOriginalResult = readOptionalBooleanField(
      body,
      "deleteOriginal",
      "deleteOriginal",
    );
    if (!deleteOriginalResult.ok) {
      return reply.status(400).send({ error: deleteOriginalResult.error });
    }
    const deleteOriginal = deleteOriginalResult.value === true;

    let mutation: Awaited<
      ReturnType<typeof fastify.collectionService.splitCollection>
    > | null = null;
    try {
      mutation = await fastify.collectionService.splitCollection({
        sourceCollectionId: id,
        deleteOriginal,
      });
      const entry = await fastify.operationLog.record({
        type: "collection-split",
        description: deleteOriginal
          ? `Split collection "${id}" into ${mutation.result.createdCollectionIds.length} collections and delete the original`
          : `Split collection "${id}" into ${mutation.result.createdCollectionIds.length} collections`,
        resourceId: id,
        affectedPaths: mutation.affectedPaths,
        beforeSnapshot: mutation.beforeSnapshot,
        afterSnapshot: mutation.afterSnapshot,
        rollbackSteps: [
          ...mutation.result.createdCollectionIds.map((createdName) => ({
            action: "delete-collection" as const,
            collectionId: createdName,
          })),
          ...(deleteOriginal
            ? [
                {
                  action: "create-collection" as const,
                  collectionId: id,
                },
                {
                  action: "restore-lint-config" as const,
                  config: mutation.previousLintConfig,
                },
              ]
            : []),
          buildCollectionsRollbackStep(mutation.previousCollectionState),
        ],
        metadata: {
          sourceCollection: id,
          createdCollections: mutation.result.createdCollectionIds,
          deleteOriginal,
        },
      });
      return {
        ok: true,
        sourceCollection: id,
        createdCollections: mutation.result.createdCollectionIds,
        deleteOriginal,
        operationId: entry.id,
      };
    } catch (err) {
      if (mutation) {
        await fastify.collectionService
          .restoreCollectionWorkspace({
            state: mutation.previousCollectionState,
            tokensByCollection: buildWorkspaceTokensFromSnapshot(
              mutation.previousCollectionState,
              mutation.beforeSnapshot,
            ),
          })
          .then(() =>
            fastify.collectionService.restoreLintConfig(
              mutation!.previousLintConfig,
            ),
          )
          .catch((rollbackErr) => {
            fastify.log.error(
              { err: rollbackErr, operation: "collection-split", collectionId: id },
              "Rollback failed: could not restore collection workspace dependencies after operation-log failure",
            );
          });
      }
      return handleRouteError(reply, err, "Failed to split collection");
    }
  });

  // POST /api/collections/:id/preflight — inspect dependency impacts before a structural collection change
  fastify.post<{
    Params: { id: string };
    Body: {
      operation?: CollectionStructuralOperation;
      targetCollection?: string;
      deleteOriginal?: boolean;
    };
  }>("/collections/:id/preflight", async (request, reply) => {
    const { id } = request.params;
    const body = isRequestBodyObject(request.body) ? request.body : undefined;
    const operation = body?.operation;
    if (
      operation !== "delete" &&
      operation !== "merge" &&
      operation !== "split"
    ) {
      return reply
        .status(400)
        .send({ error: 'operation must be "delete", "merge", or "split"' });
    }
    const deleteOriginalResult = readOptionalBooleanField(
      body,
      "deleteOriginal",
      "deleteOriginal",
    );
    if (!deleteOriginalResult.ok) {
      return reply.status(400).send({ error: deleteOriginalResult.error });
    }
    const deleteOriginal = deleteOriginalResult.value === true;
    let targetCollection: string | undefined;
    if (operation === "merge") {
      const targetCollectionResult = readRequiredTrimmedStringField(
        body,
        "targetCollection",
        "targetCollection",
      );
      if (!targetCollectionResult.ok) {
        return reply
          .status(400)
          .send({ error: "targetCollection is required for merge preflight" });
      }
      targetCollection = targetCollectionResult.value;
      if (targetCollection === id) {
        return reply.status(400).send({
          error: "targetCollection must differ from the source collection",
        });
      }
    }

    try {
      return await fastify.collectionService.previewStructuralChange({
        operation,
        collectionId: id,
        targetCollectionId: targetCollection,
        deleteOriginal,
      });
    } catch (err) {
      return handleRouteError(
        reply,
        err,
        "Failed to inspect collection dependencies",
      );
    }
  });

  // DELETE /api/collections/:id — delete a collection
  fastify.delete<{ Params: { id: string } }>(
    "/collections/:id",
    async (request, reply) => {
      const { id } = request.params;
      let mutation: Awaited<
        ReturnType<typeof fastify.collectionService.deleteCollectionOperation>
      > | null = null;
      try {
        mutation =
          await fastify.collectionService.deleteCollectionOperation(id);
        const entry = await fastify.operationLog.record({
          type: "collection-delete",
          description: `Delete collection "${id}"`,
          resourceId: id,
          affectedPaths: mutation.affectedPaths,
          beforeSnapshot: mutation.beforeSnapshot,
          afterSnapshot: mutation.afterSnapshot,
          rollbackSteps: [
            { action: "create-collection", collectionId: id },
            buildCollectionsRollbackStep(mutation.previousCollectionState),
            {
              action: "restore-lint-config" as const,
              config: mutation.previousLintConfig,
            },
          ],
        });
        return { ok: true, id, operationId: entry.id };
      } catch (err) {
        if (mutation) {
          await fastify.collectionService
            .restoreCollectionWorkspace({
              state: mutation.previousCollectionState,
              tokensByCollection: buildWorkspaceTokensFromSnapshot(
                mutation.previousCollectionState,
                mutation.beforeSnapshot,
              ),
            })
            .then(() =>
              fastify.collectionService.restoreLintConfig(
                mutation!.previousLintConfig,
              ),
            )
            .catch((rollbackErr) => {
              fastify.log.error(
                { err: rollbackErr, operation: "collection-delete", collectionId: id },
                "Rollback failed: could not restore collection workspace dependencies after operation-log failure",
              );
            });
        }
        return handleRouteError(reply, err, "Failed to delete collection");
      }
    },
  );
};
