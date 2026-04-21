import type { FastifyPluginAsync } from "fastify";
import type {
  SelectedModes,
} from "@tokenmanager/core";
import { handleRouteError } from "../errors.js";

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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
              views: mutation.previousState.views,
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
            views: mutation.previousState.views,
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
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          rollbackSteps: [
            {
              action: "restore-collection-state",
              collections: mutation.previousState.collections,
              views: mutation.previousState.views,
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
              views: mutation.previousState.views,
            },
          ],
        });
        return { ok: true, id, optionName };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to delete mode");
      }
    },
  );

  fastify.post<{
    Body: { id: string; name: string; selections: SelectedModes };
  }>("/views", async (request, reply) => {
    const { id, name, selections } = request.body || {};
    if (!id || typeof id !== "string") {
      return reply.status(400).send({ error: "View id is required" });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return reply.status(400).send({ error: "View name is required" });
    }
    if (!selections || typeof selections !== "object" || Array.isArray(selections)) {
      return reply.status(400).send({ error: "View selections are required" });
    }

    try {
      const normalizedId = slugifyName(id);
      const mutation = await fastify.collectionService.createView({
        id: normalizedId,
        name: name.trim(),
        selections: selections as SelectedModes,
      });
      await fastify.operationLog.record({
        type: "view-create",
        description: `Create view "${mutation.result.name}"`,
        resourceId: "$collections",
        affectedPaths: [],
        beforeSnapshot: {},
        afterSnapshot: {},
        rollbackSteps: [
          {
            action: "restore-collection-state",
            collections: mutation.previousState.collections,
            views: mutation.previousState.views,
          },
        ],
      });
      return reply.status(201).send({ ok: true, view: mutation.result });
    } catch (err) {
      return handleRouteError(reply, err, "Failed to create view");
    }
  });

  fastify.put<{
    Params: { id: string };
    Body: { name: string; selections: SelectedModes };
  }>("/views/:id", async (request, reply) => {
    const { id } = request.params;
    const { name, selections } = request.body || {};
    if (!name || typeof name !== "string" || !name.trim()) {
      return reply.status(400).send({ error: "View name is required" });
    }
    if (!selections || typeof selections !== "object" || Array.isArray(selections)) {
      return reply.status(400).send({ error: "View selections are required" });
    }

    try {
      const mutation = await fastify.collectionService.updateView({
        id,
        name: name.trim(),
        selections: selections as SelectedModes,
      });
      await fastify.operationLog.record({
        type: "view-update",
        description: `Update view "${mutation.result.name}"`,
        resourceId: "$collections",
        affectedPaths: [],
        beforeSnapshot: {},
        afterSnapshot: {},
        rollbackSteps: [
          {
            action: "restore-collection-state",
            collections: mutation.previousState.collections,
            views: mutation.previousState.views,
          },
        ],
      });
      return { ok: true, view: mutation.result };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to update view");
    }
  });

  fastify.delete<{ Params: { id: string } }>(
    "/views/:id",
    async (request, reply) => {
      const { id } = request.params;
      try {
        const mutation = await fastify.collectionService.deleteView(id);
        await fastify.operationLog.record({
          type: "view-delete",
          description: `Delete view "${mutation.result.name}"`,
          resourceId: "$collections",
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          rollbackSteps: [
            {
              action: "restore-collection-state",
              collections: mutation.previousState.collections,
              views: mutation.previousState.views,
            },
          ],
        });
        return { ok: true, id };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to delete view");
      }
    },
  );
};
