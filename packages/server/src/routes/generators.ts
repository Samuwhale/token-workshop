import type { FastifyPluginAsync } from "fastify";
import {
  GENERATOR_TEMPLATE_OPTIONS,
  type GeneratorTemplateKind,
} from "@tokenmanager/core";
import { BadRequestError, handleRouteError } from "../errors.js";
import type {
  GeneratorCreateInput,
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
}

interface GeneratorHistoryBody {
  recordHistory?: boolean;
}

interface GeneratorDeleteQuery {
  recordHistory?: string;
}

const VALID_GENERATOR_TEMPLATES = new Set<string>([
  "blank",
  ...GENERATOR_TEMPLATE_OPTIONS.map((option) => option.id),
]);

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
      const body = readGeneratorCreateBody(request.body);
      const targetCollectionId = String(body.targetCollectionId ?? "").trim();
      if (!targetCollectionId) {
        throw new BadRequestError("targetCollectionId is required");
      }
      await fastify.collectionService.requireCollectionsExist([targetCollectionId]);
      const recordHistory = body.recordHistory !== false;
      const beforeGenerators = recordHistory ? await fastify.generatorService.list() : [];
      const generator = await fastify.generatorService.create({
        ...body,
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

  fastify.patch<{ Params: GeneratorParams; Body: GeneratorUpdateInput & GeneratorHistoryBody }>(
    "/generators/:id",
    async (request, reply) => {
      try {
        const body = readGeneratorUpdateBody(request.body, "Generator update body");
        if (body.targetCollectionId) {
          await fastify.collectionService.requireCollectionsExist([
            body.targetCollectionId,
          ]);
        }
        const recordHistory = body.recordHistory !== false;
        const beforeGenerators = recordHistory
          ? await fastify.generatorService.list()
          : [];
        const beforeGenerator = recordHistory
          ? await fastify.generatorService.getById(request.params.id)
          : undefined;
        const generator = await fastify.generatorService.update(
          request.params.id,
          body,
          fastify.tokenStore,
        );
        if (recordHistory) {
          try {
            await fastify.operationLog.record({
              type: "generator-update",
              description: `Update generator "${generator.name}"`,
              resourceId: generator.id,
              affectedPaths: [],
              beforeSnapshot: {},
              afterSnapshot: {},
              metadata: {
                kind: "generator-update",
                generatorId: generator.id,
                generatorName: generator.name,
                targetCollectionId: generator.targetCollectionId,
                previousGeneratorName: beforeGenerator?.name,
                previousTargetCollectionId:
                  beforeGenerator?.targetCollectionId,
              },
              rollbackSteps: [
                { action: "restore-generators", generators: beforeGenerators },
              ],
            });
          } catch (error) {
            await restoreGeneratorsAfterHistoryFailure(
              fastify.generatorService,
              beforeGenerators,
              error,
            );
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

  fastify.post<{ Params: GeneratorParams; Body: GeneratorUpdateInput }>(
    "/generators/:id/preview-draft",
    async (request, reply) => {
      try {
        const body = readGeneratorUpdateBody(request.body, "Generator draft preview body");
        if (body.targetCollectionId) {
          await fastify.collectionService.requireCollectionsExist([
            body.targetCollectionId,
          ]);
        }
        const preview = await fastify.tokenLock.withLock(() =>
          fastify.generatorService.previewDocument(
            request.params.id,
            body,
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

function readGeneratorCreateBody(body: unknown): GeneratorCreateInput & GeneratorHistoryBody {
  const record = readGeneratorRouteRecord(body, "Generator create body");
  rejectRemovedGeneratorFields(record);
  const input: GeneratorCreateInput & GeneratorHistoryBody = {
    targetCollectionId: readRequiredGeneratorString(
      record.targetCollectionId,
      "targetCollectionId",
    ),
  };
  copyOptionalGeneratorFields(record, input, { allowTemplate: true });
  copyRecordHistory(record, input);
  return input;
}

function readGeneratorUpdateBody(
  body: unknown,
  bodyName: string,
): GeneratorUpdateInput & GeneratorHistoryBody {
  const record = readGeneratorRouteRecord(body, bodyName);
  rejectRemovedGeneratorFields(record);
  const input: GeneratorUpdateInput & GeneratorHistoryBody = {};
  if (Object.prototype.hasOwnProperty.call(record, "template")) {
    throw new BadRequestError("template is only allowed when creating a generator.");
  }
  if (Object.prototype.hasOwnProperty.call(record, "targetCollectionId")) {
    input.targetCollectionId = readRequiredGeneratorString(
      record.targetCollectionId,
      "targetCollectionId",
    );
  }
  copyOptionalGeneratorFields(record, input);
  copyRecordHistory(record, input);
  return input;
}

function readGeneratorRouteRecord(
  body: unknown,
  bodyName: string,
): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestError(`${bodyName} must be an object.`);
  }
  return body as Record<string, unknown>;
}

function rejectRemovedGeneratorFields(record: Record<string, unknown>): void {
  if (Object.prototype.hasOwnProperty.call(record, "authoringMode")) {
    throw new BadRequestError("authoringMode has been removed from generators.");
  }
}

function readRequiredGeneratorString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new BadRequestError(`${fieldName} must be a non-empty string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestError(`${fieldName} must be a non-empty string.`);
  }
  return trimmed;
}

function copyOptionalGeneratorFields(
  record: Record<string, unknown>,
  input: GeneratorUpdateInput,
  options: { allowTemplate?: boolean } = {},
): void {
  if (Object.prototype.hasOwnProperty.call(record, "name")) {
    input.name = readRequiredGeneratorString(record.name, "name");
  }
  if (Object.prototype.hasOwnProperty.call(record, "template")) {
    if (!options.allowTemplate) {
      throw new BadRequestError("template is only allowed when creating a generator.");
    }
    if (typeof record.template !== "string") {
      throw new BadRequestError("template must be a string.");
    }
    (input as GeneratorCreateInput).template = readGeneratorTemplateKind(record.template);
  }
  if (Object.prototype.hasOwnProperty.call(record, "nodes")) {
    input.nodes = record.nodes as GeneratorUpdateInput["nodes"];
  }
  if (Object.prototype.hasOwnProperty.call(record, "edges")) {
    input.edges = record.edges as GeneratorUpdateInput["edges"];
  }
  if (Object.prototype.hasOwnProperty.call(record, "viewport")) {
    input.viewport = record.viewport as GeneratorUpdateInput["viewport"];
  }
}

function readGeneratorTemplateKind(value: string): GeneratorTemplateKind {
  if (VALID_GENERATOR_TEMPLATES.has(value)) {
    return value as GeneratorTemplateKind;
  }
  throw new BadRequestError(
    `template must be one of ${Array.from(VALID_GENERATOR_TEMPLATES).join(", ")}.`,
  );
}

function copyRecordHistory(
  record: Record<string, unknown>,
  input: GeneratorHistoryBody,
): void {
  if (!Object.prototype.hasOwnProperty.call(record, "recordHistory")) return;
  if (typeof record.recordHistory !== "boolean") {
    throw new BadRequestError("recordHistory must be a boolean.");
  }
  input.recordHistory = record.recordHistory;
}
