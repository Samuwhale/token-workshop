import type { FastifyPluginAsync } from "fastify";
import { handleRouteError } from "../errors.js";

export const collectionRoutes: FastifyPluginAsync<{ tokenDir: string }> = async (
  fastify,
) => {
  fastify.get("/collections", async (_request, reply) => {
    try {
      return await fastify.collectionService.getCollectionsOverview();
    } catch (err) {
      return handleRouteError(reply, err, "Failed to load collections");
    }
  });

  fastify.post<{ Params: { id: string }; Body: { name: string } }>(
    "/collections/:id/modes",
    async (request, reply) => {
      const { id } = request.params;
      const { name } = request.body || {};
      const bodyKeys = Object.keys(request.body ?? {});
      if (bodyKeys.some((key) => key !== "name")) {
        return reply.status(400).send({
          error: "Only the mode name is supported when creating a collection mode",
        });
      }
      if (!name || typeof name !== "string" || !name.trim()) {
        return reply.status(400).send({ error: "Mode name is required" });
      }

      const trimmedName = name.trim();
      try {
        const mutation = await fastify.collectionService.upsertMode(
          id,
          trimmedName,
        );
        await fastify.operationLog.record({
          type: "collection-mode-upsert",
          description: `${mutation.result.status === 200 ? "Update" : "Add"} mode "${trimmedName}" in collection "${id}"`,
          resourceId: "$collections",
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          rollbackSteps: [
            {
              action: "restore-collection-state",
              collections: mutation.previousState.collections,
            },
          ],
        });
        return reply
          .status(mutation.result.status)
          .send({ ok: true, option: mutation.result.option });
      } catch (err) {
        return handleRouteError(reply, err, "Failed to save mode");
      }
    },
  );

  fastify.put<{
    Params: { id: string; optionName: string };
    Body: { name: string };
  }>("/collections/:id/modes/:optionName", async (request, reply) => {
    const { id, optionName } = request.params;
    const { name } = request.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      return reply.status(400).send({ error: "New mode name is required" });
    }

    const nextName = name.trim();
    try {
      const mutation = await fastify.collectionService.renameMode(
        id,
        optionName,
        nextName,
      );
      await fastify.operationLog.record({
        type: "collection-mode-rename",
        description: `Rename mode "${optionName}" → "${nextName}" in collection "${id}"`,
        resourceId: "$collections",
        affectedPaths: mutation.affectedPaths,
        beforeSnapshot: mutation.beforeSnapshot,
        afterSnapshot: mutation.afterSnapshot,
        rollbackSteps: [
          {
            action: "restore-collection-state",
            collections: mutation.previousState.collections,
          },
        ],
      });
      return { ok: true, option: mutation.result };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to rename mode");
    }
  });

  fastify.put<{ Params: { id: string }; Body: { modes: string[] } }>(
    "/collections/:id/modes-order",
    async (request, reply) => {
      const { id } = request.params;
      const { modes } = request.body || {};
      if (
        !Array.isArray(modes) ||
        modes.some((mode) => typeof mode !== "string")
      ) {
        return reply
          .status(400)
          .send({ error: "modes must be an array of mode name strings" });
      }

      try {
        const mutation = await fastify.collectionService.reorderModes(id, modes);
        await fastify.operationLog.record({
          type: "collection-mode-reorder",
          description: `Reorder modes in collection "${id}"`,
          resourceId: "$collections",
          affectedPaths: mutation.affectedPaths,
          beforeSnapshot: mutation.beforeSnapshot,
          afterSnapshot: mutation.afterSnapshot,
          rollbackSteps: [
            {
              action: "restore-collection-state",
              collections: mutation.previousState.collections,
            },
          ],
        });
        return { ok: true, collection: mutation.result };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to reorder modes");
      }
    },
  );

  fastify.delete<{ Params: { id: string; optionName: string } }>(
    "/collections/:id/modes/:optionName",
    async (request, reply) => {
      const { id, optionName } = request.params;
      try {
        const mutation = await fastify.collectionService.deleteMode(
          id,
          optionName,
        );
        await fastify.operationLog.record({
          type: "collection-mode-delete",
          description: `Delete mode "${optionName}" from collection "${id}"`,
          resourceId: "$collections",
          affectedPaths: mutation.affectedPaths,
          beforeSnapshot: mutation.beforeSnapshot,
          afterSnapshot: mutation.afterSnapshot,
          rollbackSteps: [
            {
              action: "restore-collection-state",
              collections: mutation.previousState.collections,
            },
          ],
        });
        return { ok: true, id, optionName };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to delete mode");
      }
    },
  );

};
