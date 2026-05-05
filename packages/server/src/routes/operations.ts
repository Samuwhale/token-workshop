import type { FastifyPluginAsync } from "fastify";
import { handleRouteError } from "../errors.js";
import { buildRollbackPreview } from "../services/rollback-preview.js";
import { hasNextPage, readPagination } from "./pagination.js";

export const operationRoutes: FastifyPluginAsync = async (fastify) => {
  const { withLock } = fastify.tokenLock;

  // GET /api/operations — list recent operations
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>(
    "/operations",
    async (request, reply) => {
      try {
        const { limit, offset } = readPagination(request.query, {
          defaultLimit: 10,
          maxLimit: 50,
        });
        const { entries, total } = await fastify.operationLog.getRecent(
          limit,
          offset,
        );
        return {
          data: entries,
          total,
          hasMore: hasNextPage(offset, entries.length, total),
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
      const { limit, offset } = readPagination(request.query, {
        defaultLimit: 20,
        maxLimit: 100,
      });
      const { entries, total } = await fastify.operationLog.getTokenHistory(
        tokenPath,
        limit,
        offset,
      );
      return {
        data: entries,
        total,
        hasMore: hasNextPage(offset, entries.length, total),
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
        return buildRollbackPreview(entry);
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
              collectionService: fastify.collectionService,
              resolverLock: fastify.resolverLock,
              resolverStore: fastify.resolverStore,
              generatorService: fastify.generatorService,
              lintConfigStore: fastify.lintConfigStore,
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
