import type { FastifyPluginAsync } from "fastify";
import { handleRouteError } from "../errors.js";
import { getSnapshotTokenPath } from "../services/operation-log.js";
import { stableStringify } from "../services/stable-stringify.js";

export const operationRoutes: FastifyPluginAsync = async (fastify) => {
  const { withLock } = fastify.tokenLock;

  const MODIFIED_TOKEN_FIELDS = [
    '$value',
    '$type',
    '$description',
    '$extensions',
  ] as const;

  // GET /api/operations — list recent operations
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>(
    "/operations",
    async (request, reply) => {
      try {
        const parsedLimit = parseInt(request.query.limit ?? "10", 10);
        const limit = Math.min(
          Math.max(1, isNaN(parsedLimit) ? 10 : parsedLimit),
          50,
        );
        const parsedOffset = parseInt(request.query.offset ?? "0", 10);
        const offset = Math.max(0, isNaN(parsedOffset) ? 0 : parsedOffset);
        const { entries, total } = await fastify.operationLog.getRecent(
          limit,
          offset,
        );
        return {
          data: entries,
          total,
          hasMore: offset + entries.length < total,
          limit,
          offset,
        };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to list operations");
      }
    },
  );

  // GET /api/operations/path-renames — all recorded token path rename pairs (for Figma variable rename propagation)
  // Must be registered before /operations/:id/rollback to avoid :id capturing "path-renames"
  fastify.get("/operations/path-renames", async (_request, reply) => {
    try {
      const renames = await fastify.operationLog.getPathRenames();
      return { renames };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to get path renames");
    }
  });

  // GET /api/operations/token-history — value timeline for a specific token path
  // Must be registered before /operations/:id/rollback to avoid :id capturing "token-history"
  fastify.get<{
    Querystring: { path?: string; limit?: string; offset?: string };
  }>("/operations/token-history", async (request, reply) => {
    try {
      const tokenPath = request.query.path;
      if (!tokenPath) {
        reply.code(400);
        return { error: "Missing required query param: path" };
      }
      const parsedLimit = parseInt(request.query.limit ?? "20", 10);
      const limit = Math.min(
        Math.max(1, isNaN(parsedLimit) ? 20 : parsedLimit),
        100,
      );
      const parsedOffset = parseInt(request.query.offset ?? "0", 10);
      const offset = Math.max(0, isNaN(parsedOffset) ? 0 : parsedOffset);
      const { entries, total } = await fastify.operationLog.getTokenHistory(
        tokenPath,
        limit,
        offset,
      );
      return {
        data: entries,
        total,
        hasMore: offset + entries.length < total,
        limit,
        offset,
      };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to get token history");
    }
  });

  // GET /api/operations/:id/diff — preview what a rollback would change
  // Must be registered before /operations/:id/rollback to avoid :id capturing "diff"
  fastify.get<{ Params: { id: string } }>(
    "/operations/:id/diff",
    async (request, reply) => {
      try {
        const entry = await fastify.operationLog.getById(request.params.id);
        if (!entry) {
          return reply.status(404).send({ error: "Operation not found" });
        }
        // Rollback goes from afterSnapshot → beforeSnapshot.
        // Diff shows what the tokens will look like after rollback:
        //   before = current state (afterSnapshot), after = state after rollback (beforeSnapshot)
        const allPaths = new Set([
          ...Object.keys(entry.afterSnapshot),
          ...Object.keys(entry.beforeSnapshot),
        ]);
        const diffs: Array<{
          path: string;
          set: string;
          status: "added" | "modified" | "removed";
          changedFields?: string[];
          before?: {
            $value: unknown;
            $type?: string;
            $description?: string;
          };
          after?: {
            $value: unknown;
            $type?: string;
            $description?: string;
          };
        }> = [];
        const metadataChanges = Array.isArray(entry.metadata?.changes)
          ? entry.metadata.changes.map((change) => ({
              ...change,
              before: change.after,
              after: change.before,
            }))
          : [];
        for (const p of allPaths) {
          const currentEntry = entry.afterSnapshot[p];
          const restoredEntry = entry.beforeSnapshot[p];
          const currentToken = currentEntry?.token;
          const restoredToken = restoredEntry?.token;
          const setName = currentEntry?.setName ?? restoredEntry?.setName ?? "";
          const userFacingPath = getSnapshotTokenPath(p, setName);
          if (currentToken && !restoredToken) {
            // Rollback will remove this token
            diffs.push({
              path: userFacingPath,
              set: setName,
              status: "removed",
              before: {
                $value: currentToken.$value,
                $type: currentToken.$type,
              },
            });
          } else if (!currentToken && restoredToken) {
            // Rollback will add this token back
            diffs.push({
              path: userFacingPath,
              set: setName,
              status: "added",
              after: {
                $value: restoredToken.$value,
                $type: restoredToken.$type,
              },
            });
          } else if (currentToken && restoredToken) {
            const changedFields = MODIFIED_TOKEN_FIELDS.filter((field) => {
              return stableStringify(currentToken[field]) !== stableStringify(restoredToken[field]);
            });
            if (changedFields.length > 0) {
              diffs.push({
                path: userFacingPath,
                set: setName,
                status: "modified",
                changedFields,
                before: {
                  $value: currentToken.$value,
                  $type: currentToken.$type,
                  $description: currentToken.$description,
                },
                after: {
                  $value: restoredToken.$value,
                  $type: restoredToken.$type,
                  $description: restoredToken.$description,
                },
              });
            }
          }
        }
        return { diffs, metadataChanges };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to compute rollback diff");
      }
    },
  );

  // POST /api/operations/:id/rollback — rollback an operation
  fastify.post<{ Params: { id: string } }>(
    "/operations/:id/rollback",
    async (request, reply) => {
      return withLock(async () => {
        try {
          const result = await fastify.operationLog.rollback(
            request.params.id,
            {
              tokenStore: fastify.tokenStore,
              collectionsStore: fastify.collectionsStore,
              resolverLock: fastify.resolverLock,
              resolverStore: fastify.resolverStore,
              recipeService: fastify.recipeService,
            },
          );
          return { ok: true, ...result };
        } catch (err) {
          return handleRouteError(reply, err);
        }
      });
    },
  );
};
