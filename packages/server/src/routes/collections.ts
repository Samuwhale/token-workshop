import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { handleRouteError } from "../errors.js";

const CREATE_MODE_BODY_KEYS = new Set(["name", "sourceModeName"]);
const RENAME_MODE_BODY_KEYS = new Set(["name"]);
const REORDER_MODES_BODY_KEYS = new Set(["modes"]);

function hasUnsupportedBodyKeys(
  body: Record<string, unknown> | null | undefined,
  supportedKeys: ReadonlySet<string>,
): boolean {
  return Object.keys(body ?? {}).some((key) => !supportedKeys.has(key));
}

function readRequiredTrimmedString(
  value: unknown,
  error: string,
  reply: FastifyReply,
): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    reply.status(400).send({ error });
    return undefined;
  }
  return value.trim();
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

  fastify.post<{
    Params: { id: string };
    Body: { name: string; sourceModeName?: string };
  }>(
    "/collections/:id/modes",
    async (request, reply) => {
      const { id } = request.params;
      const { name, sourceModeName } = request.body || {};
      if (
        hasUnsupportedBodyKeys(
          request.body,
          CREATE_MODE_BODY_KEYS,
        )
      ) {
        return reply.status(400).send({
          error: "Only the mode name and source mode are supported when creating a collection mode",
        });
      }
      const trimmedName = readRequiredTrimmedString(
        name,
        "Mode name is required",
        reply,
      );
      if (!trimmedName) {
        return;
      }
      if (
        sourceModeName !== undefined &&
        (typeof sourceModeName !== "string" || !sourceModeName.trim())
      ) {
        return reply.status(400).send({ error: "Source mode name is invalid" });
      }

      const trimmedSourceModeName = sourceModeName?.trim();
      try {
        const mutation = await fastify.collectionService.upsertMode(
          id,
          trimmedName,
          trimmedSourceModeName,
        );
        await fastify.operationLog.record({
          type: "collection-mode-upsert",
          description: `${mutation.result.status === 200 ? "Update" : "Add"} mode "${trimmedName}" in collection "${id}"`,
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
    if (hasUnsupportedBodyKeys(request.body, RENAME_MODE_BODY_KEYS)) {
      return reply.status(400).send({
        error: "Only the new mode name is supported when renaming a collection mode",
      });
    }

    const nextName = readRequiredTrimmedString(
      name,
      "New mode name is required",
      reply,
    );
    if (!nextName) {
      return;
    }
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
      if (hasUnsupportedBodyKeys(request.body, REORDER_MODES_BODY_KEYS)) {
        return reply.status(400).send({
          error: "Only the mode order is supported when reordering collection modes",
        });
      }
      if (
        !Array.isArray(modes) ||
        modes.some((mode) => typeof mode !== "string" || !mode.trim())
      ) {
        return reply
          .status(400)
          .send({ error: "modes must be non-empty mode name strings" });
      }
      const trimmedModes = modes.map((mode) => mode.trim());

      try {
        const mutation = await fastify.collectionService.reorderModes(
          id,
          trimmedModes,
        );
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
