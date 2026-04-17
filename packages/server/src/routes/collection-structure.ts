import type { FastifyPluginAsync } from "fastify";
import type { TokenGroup } from "@tokenmanager/core";
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

function buildCollectionsRollbackStep(state: CollectionState): RollbackStep {
  return {
    action: "restore-collection-state" as const,
    collections: structuredClone(state.collections),
    views: structuredClone(state.views),
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
  fastify.post<{ Body: { name: string; tokens?: Record<string, unknown> } }>(
    "/collections",
    async (request, reply) => {
      const { name, tokens } = request.body || {};
      if (!name) {
        return reply.status(400).send({ error: "Collection name is required" });
      }
      if (!isValidCollectionName(name)) {
        return reply.status(400).send({
          error:
            "Collection name must contain only alphanumeric characters, dashes, underscores, and / for folders",
        });
      }

      let mutation: Awaited<
        ReturnType<typeof fastify.collectionService.createCollectionOperation>
      > | null = null;
      try {
        mutation = await fastify.collectionService.createCollectionOperation({
          collectionId: name,
          tokens: (tokens as TokenGroup | undefined) ?? undefined,
        });
        await fastify.operationLog.record({
          type: "collection-create",
          description: `Create collection "${name}"`,
          resourceId: name,
          affectedPaths: Object.keys(mutation.afterSnapshot),
          beforeSnapshot: {},
          afterSnapshot: mutation.afterSnapshot,
          rollbackSteps: [
            { action: "delete-collection", collectionId: name },
            buildCollectionsRollbackStep(mutation.previousCollectionState),
          ],
        });
        const overview = await fastify.collectionService.getCollectionsOverview();
        return reply
          .status(201)
          .send({ ok: true, id: name, name, collections: overview.collections });
      } catch (err) {
        if (mutation) {
          await fastify.tokenLock
            .withLock(() => fastify.collectionService.deleteCollection(name))
            .catch((rollbackErr) => {
              fastify.log.error(
                { err: rollbackErr, operation: "collection-create", collectionId: name },
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
    const body = request.body || {};
    const bodyKeys = Object.keys(body);
    if (bodyKeys.some((key) => key !== "description")) {
      return reply.status(400).send({
        error: "Only the description can be updated for a collection",
      });
    }

    try {
      if (!Object.prototype.hasOwnProperty.call(body, "description")) {
        const current = await fastify.collectionService.getCollectionMetadata(id);
        return { ok: true, id, ...current, changed: false };
      }

      const beforeMeta = await fastify.collectionService.getCollectionMetadata(id);
      const nextValue = body.description?.trim() || undefined;
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
      const { newName } = request.body || {};
      if (!newName) {
        return reply.status(400).send({ error: "newName is required" });
      }
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
      const { order } = request.body || {};
      if (!Array.isArray(order)) {
        return reply
          .status(400)
          .send({ error: "order must be an array of collection ids" });
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
      const fromFolder = request.body?.fromFolder?.trim();
      const toFolder = request.body?.toFolder?.trim();
      if (!fromFolder || !toFolder) {
        return reply
          .status(400)
          .send({ error: "fromFolder and toFolder are required" });
      }
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
      const sourceFolder = request.body?.sourceFolder?.trim();
      const targetFolder = request.body?.targetFolder?.trim();
      if (!sourceFolder || !targetFolder) {
        return reply
          .status(400)
          .send({ error: "sourceFolder and targetFolder are required" });
      }
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
      const folder = request.body?.folder?.trim();
      if (!folder) {
        return reply.status(400).send({ error: "folder is required" });
      }
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
              state: { collections: [], views: [] },
              tokensByCollection: {},
            });
            await fastify.recipeService.reset();
            await fastify.resolverStore.reset();
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
    const { targetCollection, resolutions = {} } = request.body || {};
    if (!targetCollection) {
      return reply.status(400).send({ error: "targetCollection is required" });
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
    const { deleteOriginal = false } = request.body || {};

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
    const { operation, targetCollection, deleteOriginal = false } =
      request.body || {};
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
      if (!targetCollection) {
        return reply
          .status(400)
          .send({ error: "targetCollection is required for merge preflight" });
      }
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
