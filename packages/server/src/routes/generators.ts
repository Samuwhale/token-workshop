import type { FastifyPluginAsync } from "fastify";
import { BadRequestError, handleRouteError } from "../errors.js";
import type {
  GeneratorCreateInput,
  GeneratorDraftInput,
  GeneratorUpdateInput,
  TokenGeneratorService,
} from "../services/token-generator-service.js";

interface GeneratorParams {
  id: string;
}

interface GeneratorDetachBody {
  collectionId?: string;
  path?: string;
}

interface GeneratorApplyBody {
  previewHash?: string;
  newGenerator?: boolean;
}

interface GeneratorHistoryBody {
  recordHistory?: boolean;
  newGenerator?: boolean;
}

interface GeneratorDeleteQuery {
  recordHistory?: string;
}

async function restoreGeneratorsAfterHistoryFailure(
  generatorService: TokenGeneratorService,
  generators: Awaited<ReturnType<TokenGeneratorService["list"]>>,
  error: unknown,
): Promise<never> {
  await generatorService.restore(generators);
  throw error;
}

export const generatorRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/generators", async (_request, reply) => {
    try {
      return { generators: await fastify.generatorService.list() };
    } catch (error) {
      return handleRouteError(reply, error);
    }
  });

  fastify.get("/generators/status", async (_request, reply) => {
    try {
      const generators = await fastify.tokenLock.withLock(() =>
        fastify.generatorService.status(
          fastify.collectionService,
          fastify.tokenStore,
        ),
      );
      return { generators };
    } catch (error) {
      return handleRouteError(reply, error);
    }
  });

  fastify.get<{ Params: GeneratorParams }>("/generators/:id", async (request, reply) => {
    try {
      const generator = await fastify.generatorService.getById(request.params.id);
      if (!generator) {
        return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
      }
      return { generator };
    } catch (error) {
      return handleRouteError(reply, error);
    }
  });

  fastify.post<{ Body: GeneratorCreateInput & GeneratorHistoryBody }>("/generators", async (request, reply) => {
    try {
      const targetCollectionId = String(request.body?.targetCollectionId ?? "").trim();
      if (!targetCollectionId) {
        throw new BadRequestError("targetCollectionId is required");
      }
      await fastify.collectionService.requireCollectionsExist([targetCollectionId]);
      const recordHistory = request.body?.recordHistory !== false;
      const beforeGenerators = recordHistory ? await fastify.generatorService.list() : [];
      const generator = await fastify.generatorService.create({
        ...request.body,
        targetCollectionId,
      });
      if (recordHistory) {
        try {
          await fastify.operationLog.record({
            type: "generator-create",
            description: `Create generator "${generator.name}"`,
            resourceId: generator.id,
            affectedPaths: [],
            beforeSnapshot: {},
            afterSnapshot: {},
            metadata: {
              kind: "generator-create",
              generatorId: generator.id,
              generatorName: generator.name,
              targetCollectionId: generator.targetCollectionId,
            },
            rollbackSteps: [{ action: "restore-generators", generators: beforeGenerators }],
          });
        } catch (error) {
          await restoreGeneratorsAfterHistoryFailure(fastify.generatorService, beforeGenerators, error);
        }
      }
      return reply.status(201).send({ generator });
    } catch (error) {
      return handleRouteError(reply, error);
    }
  });

  fastify.post<{ Body: GeneratorDraftInput }>("/generators/preview-draft", async (request, reply) => {
    try {
      const targetCollectionId = String(request.body?.targetCollectionId ?? "").trim();
      if (!targetCollectionId) {
        throw new BadRequestError("targetCollectionId is required");
      }
      await fastify.collectionService.requireCollectionsExist([targetCollectionId]);
      const preview = await fastify.tokenLock.withLock(() =>
        fastify.generatorService.previewDraft(
          {
            name: String(request.body?.name ?? "New token generator"),
            targetCollectionId,
            nodes: request.body?.nodes ?? [],
            edges: request.body?.edges ?? [],
            viewport: request.body?.viewport ?? { x: 0, y: 0, zoom: 1 },
          },
          fastify.collectionService,
          fastify.tokenStore,
        ),
      );
      return { preview };
    } catch (error) {
      return handleRouteError(reply, error);
    }
  });

  fastify.post<{ Body: GeneratorDraftInput & GeneratorApplyBody }>("/generators/apply-draft", async (request, reply) => {
    try {
      const previewHash = String(request.body?.previewHash ?? "").trim();
      if (!previewHash) {
        throw new BadRequestError("previewHash is required. Review the generator before applying.");
      }
      const targetCollectionId = String(request.body?.targetCollectionId ?? "").trim();
      if (!targetCollectionId) {
        throw new BadRequestError("targetCollectionId is required");
      }
      await fastify.collectionService.requireCollectionsExist([targetCollectionId]);
      const result = await fastify.tokenLock.withLock(() =>
        fastify.generatorService.applyDraft(
          {
            name: String(request.body?.name ?? "New token generator"),
            targetCollectionId,
            nodes: request.body?.nodes ?? [],
            edges: request.body?.edges ?? [],
            viewport: request.body?.viewport ?? { x: 0, y: 0, zoom: 1 },
          },
          fastify.collectionService,
          fastify.tokenStore,
          fastify.operationLog,
          { expectedPreviewHash: previewHash },
        ),
      );
      return result;
    } catch (error) {
      return handleRouteError(reply, error);
    }
  });

  fastify.patch<{ Params: GeneratorParams; Body: GeneratorUpdateInput & GeneratorHistoryBody }>(
    "/generators/:id",
    async (request, reply) => {
	      try {
	        if (request.body.targetCollectionId) {
	          await fastify.collectionService.requireCollectionsExist([
	            request.body.targetCollectionId,
	          ]);
	        }
	        const recordHistory = request.body?.recordHistory !== false;
	        const beforeGenerators = recordHistory ? await fastify.generatorService.list() : [];
	        const beforeGenerator = recordHistory
	          ? await fastify.generatorService.getById(request.params.id)
	          : undefined;
	        const generator = await fastify.generatorService.update(
	          request.params.id,
	          request.body,
	          fastify.tokenStore,
	        );
	        if (recordHistory) {
	          const recordsNewGenerator = request.body?.newGenerator === true;
	          const rollbackGenerators = recordsNewGenerator
	            ? beforeGenerators.filter((candidate) => candidate.id !== request.params.id)
	            : beforeGenerators;
	          try {
	            await fastify.operationLog.record({
	              type: recordsNewGenerator ? "generator-create" : "generator-update",
	              description: `${recordsNewGenerator ? "Create" : "Update"} generator "${generator.name}"`,
	              resourceId: generator.id,
	              affectedPaths: [],
	              beforeSnapshot: {},
	              afterSnapshot: {},
	              metadata: {
	                kind: recordsNewGenerator ? "generator-create" : "generator-update",
	                generatorId: generator.id,
	                generatorName: generator.name,
	                targetCollectionId: generator.targetCollectionId,
	                previousGeneratorName: recordsNewGenerator ? undefined : beforeGenerator?.name,
	                previousTargetCollectionId: recordsNewGenerator ? undefined : beforeGenerator?.targetCollectionId,
	              },
	              rollbackSteps: [{ action: "restore-generators", generators: rollbackGenerators }],
	            });
	          } catch (error) {
	            await restoreGeneratorsAfterHistoryFailure(fastify.generatorService, beforeGenerators, error);
	          }
	        }
        return { generator };
      } catch (error) {
        return handleRouteError(reply, error);
      }
    },
  );

  fastify.delete<{ Params: GeneratorParams; Querystring: GeneratorDeleteQuery }>("/generators/:id", async (request, reply) => {
    try {
      const recordHistory = request.query.recordHistory !== "false";
      const beforeGenerators = recordHistory ? await fastify.generatorService.list() : [];
      const beforeGenerator = beforeGenerators.find((generator) => generator.id === request.params.id);
      const deleted = await fastify.tokenLock.withLock(() =>
        fastify.generatorService.delete(request.params.id, fastify.tokenStore),
      );
      if (!deleted) {
        return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
      }
      if (recordHistory) {
        try {
          await fastify.operationLog.record({
            type: "generator-delete",
            description: `Delete generator "${beforeGenerator?.name ?? request.params.id}"`,
            resourceId: request.params.id,
            affectedPaths: [],
            beforeSnapshot: {},
            afterSnapshot: {},
            metadata: {
              kind: "generator-delete",
              generatorId: request.params.id,
              generatorName: beforeGenerator?.name,
              targetCollectionId: beforeGenerator?.targetCollectionId,
            },
            rollbackSteps: [{ action: "restore-generators", generators: beforeGenerators }],
          });
        } catch (error) {
          await restoreGeneratorsAfterHistoryFailure(fastify.generatorService, beforeGenerators, error);
        }
      }
      return { ok: true };
    } catch (error) {
      return handleRouteError(reply, error);
    }
  });

  fastify.post<{ Params: GeneratorParams }>(
    "/generators/:id/preview",
    async (request, reply) => {
      try {
        const preview = await fastify.tokenLock.withLock(() =>
          fastify.generatorService.preview(
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

  fastify.post<{ Params: GeneratorParams; Body: GeneratorDetachBody }>(
    "/generators/:id/outputs/detach",
    async (request, reply) => {
      try {
        const collectionId = String(request.body?.collectionId ?? "").trim();
        const tokenPath = String(request.body?.path ?? "").trim();
        if (!collectionId || !tokenPath) {
          throw new BadRequestError("collectionId and path are required");
        }
        const result = await fastify.tokenLock.withLock(() =>
          fastify.generatorService.detachOutput(
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

  fastify.post<{ Params: GeneratorParams; Body: GeneratorApplyBody }>(
    "/generators/:id/apply",
    async (request, reply) => {
      try {
        const previewHash = String(request.body?.previewHash ?? "").trim();
        if (!previewHash) {
          throw new BadRequestError("previewHash is required. Review the generator before applying.");
        }
        const result = await fastify.tokenLock.withLock(() =>
          fastify.generatorService.apply(
            request.params.id,
            fastify.collectionService,
            fastify.tokenStore,
            fastify.operationLog,
            {
              expectedPreviewHash: previewHash,
              newGenerator: request.body?.newGenerator === true,
            },
          ),
        );
        return result;
      } catch (error) {
        return handleRouteError(reply, error);
      }
    },
  );
};
