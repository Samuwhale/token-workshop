import type { FastifyPluginAsync } from "fastify";
import { BadRequestError, handleRouteError } from "../errors.js";
import type {
  GraphCreateInput,
  GraphUpdateInput,
} from "../services/token-graph-service.js";

interface GraphParams {
  id: string;
}

interface GraphDetachBody {
  collectionId?: string;
  path?: string;
}

export const graphRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/graphs", async (_request, reply) => {
    try {
      return { graphs: await fastify.graphService.list() };
    } catch (error) {
      return handleRouteError(reply, error);
    }
  });

  fastify.get("/graphs/status", async (_request, reply) => {
    try {
      const graphs = await fastify.tokenLock.withLock(() =>
        fastify.graphService.status(
          fastify.collectionService,
          fastify.tokenStore,
        ),
      );
      return { graphs };
    } catch (error) {
      return handleRouteError(reply, error);
    }
  });

  fastify.get<{ Params: GraphParams }>("/graphs/:id", async (request, reply) => {
    try {
      const graph = await fastify.graphService.getById(request.params.id);
      if (!graph) {
        return reply.status(404).send({ error: `Graph "${request.params.id}" not found` });
      }
      return { graph };
    } catch (error) {
      return handleRouteError(reply, error);
    }
  });

  fastify.post<{ Body: GraphCreateInput }>("/graphs", async (request, reply) => {
    try {
      const targetCollectionId = String(request.body?.targetCollectionId ?? "").trim();
      if (!targetCollectionId) {
        throw new BadRequestError("targetCollectionId is required");
      }
      await fastify.collectionService.requireCollectionsExist([targetCollectionId]);
      const graph = await fastify.graphService.create({
        ...request.body,
        targetCollectionId,
      });
      return reply.status(201).send({ graph });
    } catch (error) {
      return handleRouteError(reply, error);
    }
  });

  fastify.patch<{ Params: GraphParams; Body: GraphUpdateInput }>(
    "/graphs/:id",
    async (request, reply) => {
      try {
        if (request.body.targetCollectionId) {
          await fastify.collectionService.requireCollectionsExist([
            request.body.targetCollectionId,
          ]);
        }
        const graph = await fastify.graphService.update(
          request.params.id,
          request.body,
          fastify.tokenStore,
        );
        return { graph };
      } catch (error) {
        return handleRouteError(reply, error);
      }
    },
  );

  fastify.delete<{ Params: GraphParams }>("/graphs/:id", async (request, reply) => {
    try {
      const deleted = await fastify.tokenLock.withLock(() =>
        fastify.graphService.delete(request.params.id, fastify.tokenStore),
      );
      if (!deleted) {
        return reply.status(404).send({ error: `Graph "${request.params.id}" not found` });
      }
      return { ok: true };
    } catch (error) {
      return handleRouteError(reply, error);
    }
  });

  fastify.post<{ Params: GraphParams }>(
    "/graphs/:id/preview",
    async (request, reply) => {
      try {
        const preview = await fastify.tokenLock.withLock(() =>
          fastify.graphService.preview(
            request.params.id,
            fastify.collectionService,
            fastify.tokenStore,
          ),
        );
        return { preview };
      } catch (error) {
        return handleRouteError(reply, error);
      }
    },
  );

  fastify.post<{ Params: GraphParams; Body: GraphDetachBody }>(
    "/graphs/:id/outputs/detach",
    async (request, reply) => {
      try {
        const collectionId = String(request.body?.collectionId ?? "").trim();
        const tokenPath = String(request.body?.path ?? "").trim();
        if (!collectionId || !tokenPath) {
          throw new BadRequestError("collectionId and path are required");
        }
        const result = await fastify.tokenLock.withLock(() =>
          fastify.graphService.detachOutput(
            request.params.id,
            collectionId,
            tokenPath,
            fastify.tokenStore,
            fastify.operationLog,
          ),
        );
        return result;
      } catch (error) {
        return handleRouteError(reply, error);
      }
    },
  );

  fastify.post<{ Params: GraphParams }>(
    "/graphs/:id/apply",
    async (request, reply) => {
      try {
        const result = await fastify.tokenLock.withLock(() =>
          fastify.graphService.apply(
            request.params.id,
            fastify.collectionService,
            fastify.tokenStore,
            fastify.operationLog,
          ),
        );
        return result;
      } catch (error) {
        return handleRouteError(reply, error);
      }
    },
  );
};
