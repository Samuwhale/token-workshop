import type { FastifyPluginAsync } from 'fastify';
import type { GeneratorType, GeneratorConfig, InputTable, TokenGenerator } from '@tokenmanager/core';

const VALID_GENERATOR_TYPES: readonly string[] = [
  'colorRamp',
  'typeScale',
  'spacingScale',
  'opacityScale',
  'borderRadiusScale',
  'zIndexScale',
  'customScale',
  'accessibleColorPair',
  'darkModeInversion',
  'responsiveScale',
  'contrastCheck',
] as const;

interface CreateBody {
  type: string;
  sourceToken?: string;
  targetSet: string;
  targetGroup: string;
  name?: string;
  config?: Record<string, unknown>;
  overrides?: Record<string, { value: unknown; locked: boolean }>;
  inputTable?: {
    inputKey: string;
    rows: Array<{ brand: string; inputs: Record<string, unknown> }>;
  };
  targetSetTemplate?: string;
}

interface PreviewBody {
  type: string;
  sourceToken?: string;
  targetGroup?: string;
  targetSet?: string;
  config?: Record<string, unknown>;
  overrides?: Record<string, { value: unknown; locked: boolean }>;
}

interface UpdateBody {
  [key: string]: unknown;
}

interface StepOverrideBody {
  value: unknown;
  locked: boolean;
}

export const generatorRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/generators — list all generators
  fastify.get('/generators', async (_request, _reply) => {
    return fastify.generatorService.getAll();
  });

  // GET /api/generators/orphaned-tokens — find tokens whose generator no longer exists
  fastify.get('/generators/orphaned-tokens', async () => {
    const allGenerators = await fastify.generatorService.getAll();
    const activeIds = new Set(allGenerators.map((g) => g.id));
    const allTagged = fastify.tokenStore.findTokensByGeneratorId('*');
    const orphaned = allTagged.filter((t) => !activeIds.has(t.generatorId));
    return { count: orphaned.length, tokens: orphaned };
  });

  // DELETE /api/generators/orphaned-tokens — delete all orphaned generator tokens
  fastify.delete('/generators/orphaned-tokens', async () => {
    const allGenerators = await fastify.generatorService.getAll();
    const activeIds = new Set(allGenerators.map((g) => g.id));
    const allTagged = fastify.tokenStore.findTokensByGeneratorId('*');
    const orphanIds = new Set(
      allTagged.filter((t) => !activeIds.has(t.generatorId)).map((t) => t.generatorId),
    );
    let totalDeleted = 0;
    for (const gid of orphanIds) {
      totalDeleted += await fastify.tokenStore.deleteTokensByGeneratorId(gid);
    }
    return { deleted: totalDeleted };
  });

  // POST /api/generators — create a new generator and run it immediately
  fastify.post<{ Body: CreateBody }>('/generators', async (request, reply) => {
    const { type, sourceToken, targetSet, targetGroup, name, config, overrides, inputTable, targetSetTemplate } = request.body ?? {} as CreateBody;
    if (!type || !targetSet || !targetGroup) {
      return reply.status(400).send({
        error: 'type, targetSet, and targetGroup are required',
      });
    }
    if (!VALID_GENERATOR_TYPES.includes(type)) {
      return reply.status(400).send({
        error: `Unknown generator type "${type}". Valid types: ${VALID_GENERATOR_TYPES.join(', ')}`,
      });
    }
    try {
      const generator = await fastify.generatorService.create({
        type: type as GeneratorType,
        sourceToken: sourceToken ?? undefined,
        targetSet,
        targetGroup,
        name: (name || (sourceToken ? `${sourceToken} ${type}` : type)) as string,
        config: (config ?? {}) as unknown as GeneratorConfig,
        overrides,
        inputTable: inputTable as InputTable | undefined,
        targetSetTemplate: targetSetTemplate ?? undefined,
      });
      // Run immediately so tokens exist right away
      await fastify.generatorService.run(generator.id, fastify.tokenStore);
      return reply.status(201).send(generator);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: msg });
    }
  });

  // POST /api/generators/preview — preview tokens without saving anything
  // IMPORTANT: must be registered before /:id routes so the static segment wins
  fastify.post<{ Body: PreviewBody }>('/generators/preview', async (request, reply) => {
    const body = request.body ?? {} as PreviewBody;
    if (!body.type) {
      return reply.status(400).send({ error: 'type is required' });
    }
    if (!VALID_GENERATOR_TYPES.includes(body.type)) {
      return reply.status(400).send({
        error: `Unknown generator type "${body.type}". Valid types: ${VALID_GENERATOR_TYPES.join(', ')}`,
      });
    }
    try {
      const results = await fastify.generatorService.preview(
        {
          type: body.type as GeneratorType,
          sourceToken: body.sourceToken,
          targetGroup: body.targetGroup ?? '',
          targetSet: body.targetSet ?? '',
          config: (body.config ?? {}) as unknown as GeneratorConfig,
          overrides: body.overrides,
        },
        fastify.tokenStore,
      );
      return { count: results.length, tokens: results };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: msg });
    }
  });

  // GET /api/generators/:id — get single generator
  fastify.get<{ Params: { id: string } }>('/generators/:id', async (request, reply) => {
    const gen = await fastify.generatorService.getById(request.params.id);
    if (!gen) return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
    return gen;
  });

  // PUT /api/generators/:id — update generator config and re-run
  fastify.put<{ Params: { id: string }; Body: UpdateBody }>('/generators/:id', async (request, reply) => {
    try {
      const generator = await fastify.generatorService.update(
        request.params.id,
        (request.body ?? {}) as Partial<Omit<TokenGenerator, 'id' | 'createdAt'>>,
      );
      await fastify.generatorService.run(generator.id, fastify.tokenStore);
      return generator;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return reply.status(404).send({ error: msg });
      return reply.status(500).send({ error: msg });
    }
  });

  // GET /api/generators/:id/tokens — list tokens created by a generator
  fastify.get<{ Params: { id: string } }>('/generators/:id/tokens', async (request) => {
    const tokens = fastify.tokenStore.findTokensByGeneratorId(request.params.id);
    return { generatorId: request.params.id, count: tokens.length, tokens };
  });

  // DELETE /api/generators/:id — delete generator, optionally delete derived tokens
  fastify.delete<{ Params: { id: string }; Querystring: { deleteTokens?: string } }>(
    '/generators/:id',
    async (request, reply) => {
      const deleted = await fastify.generatorService.delete(request.params.id);
      if (!deleted) {
        return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
      }
      let tokensDeleted = 0;
      if (request.query.deleteTokens === 'true') {
        tokensDeleted = await fastify.tokenStore.deleteTokensByGeneratorId(request.params.id);
      }
      return { deleted: true, id: request.params.id, tokensDeleted };
    },
  );

  // POST /api/generators/:id/run — manually re-run a generator
  fastify.post<{ Params: { id: string } }>('/generators/:id/run', async (request, reply) => {
    try {
      const results = await fastify.generatorService.run(
        request.params.id,
        fastify.tokenStore,
      );
      return { count: results.length, tokens: results };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return reply.status(404).send({ error: msg });
      return reply.status(500).send({ error: msg });
    }
  });

  // PUT /api/generators/:id/steps/:stepName/override — set/update a step override
  fastify.put<{
    Params: { id: string; stepName: string };
    Body: StepOverrideBody;
  }>('/generators/:id/steps/:stepName/override', async (request, reply) => {
    const { value, locked } = request.body ?? {} as StepOverrideBody;
    if (value === undefined || locked === undefined) {
      return reply.status(400).send({ error: 'value and locked are required' });
    }
    try {
      const generator = await fastify.generatorService.setStepOverride(
        request.params.id,
        request.params.stepName,
        { value, locked },
      );
      await fastify.generatorService.run(generator.id, fastify.tokenStore);
      return generator;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return reply.status(404).send({ error: msg });
      return reply.status(500).send({ error: msg });
    }
  });

  // DELETE /api/generators/:id/steps/:stepName/override — remove a step override
  fastify.delete<{
    Params: { id: string; stepName: string };
  }>('/generators/:id/steps/:stepName/override', async (request, reply) => {
    try {
      const generator = await fastify.generatorService.setStepOverride(
        request.params.id,
        request.params.stepName,
        null,
      );
      await fastify.generatorService.run(generator.id, fastify.tokenStore);
      return generator;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found')) return reply.status(404).send({ error: msg });
      return reply.status(500).send({ error: msg });
    }
  });
};
