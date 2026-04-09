import type { FastifyPluginAsync } from 'fastify';
import { handleRouteError } from '../errors.js';
import { snapshotGroup } from '../services/operation-log.js';
import { stableStringify } from '../services/stable-stringify.js';
import type {
  GeneratorCreateInput,
  GeneratorPreviewInput,
  GeneratorUpdateInput,
} from '../services/generator-service.js';

type CreateBody = GeneratorCreateInput;

type PreviewBody = GeneratorPreviewInput & {
  sourceValue?: unknown;
};

interface UpdateBody {
  [key: string]: unknown;
}

interface StepOverrideBody {
  value: unknown;
  locked: boolean;
}

export const generatorRoutes: FastifyPluginAsync = async (fastify) => {
  const { withLock } = fastify.tokenLock;

  // GET /api/generators — list all generators
  fastify.get('/generators', async (_request, reply) => {
    try {
      const generators = await fastify.generatorService.getAll();
      // Compute isStale: source token's current value differs from the value at last run.
      // Only set for generators that have run at least once and have a sourceToken.
      return await Promise.all(generators.map(async (gen) => {
        if (!gen.sourceToken || gen.lastRunAt === undefined) return gen;
        const resolved = await fastify.tokenStore.resolveToken(gen.sourceToken).catch(() => undefined);
        if (!resolved) return gen;
        const isStale = stableStringify(resolved.$value) !== stableStringify(gen.lastRunSourceValue);
        return { ...gen, isStale };
      }));
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // GET /api/generators/orphaned-tokens — find tokens whose generator no longer exists
  fastify.get('/generators/orphaned-tokens', async (_request, reply) => {
    try {
      const allGenerators = await fastify.generatorService.getAll();
      const activeIds = new Set(allGenerators.map((g) => g.id));
      const allTagged = fastify.tokenStore.findTokensByGeneratorId('*');
      const orphaned = allTagged.filter((t) => !activeIds.has(t.generatorId));
      return { count: orphaned.length, tokens: orphaned };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to list orphaned tokens');
    }
  });

  // DELETE /api/generators/orphaned-tokens — delete all orphaned generator tokens
  fastify.delete('/generators/orphaned-tokens', async (_request, reply) => {
    try {
      return await withLock(async () => {
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
        return { ok: true, deleted: totalDeleted };
      });
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to delete orphaned tokens');
    }
  });

  // POST /api/generators — create a new generator and run it immediately
  fastify.post<{ Body: CreateBody }>('/generators', async (request, reply) => {
    const { type, sourceToken, inlineValue, targetSet, targetGroup, name, config, overrides, inputTable, targetSetTemplate } = request.body ?? {} as CreateBody;
    if (typeof type !== 'string' || typeof targetSet !== 'string' || typeof targetGroup !== 'string' || !type || !targetSet || !targetGroup) {
      return reply.status(400).send({
        error: 'type, targetSet, and targetGroup are required',
      });
    }
    return withLock(async () => {
      try {
        const before = await snapshotGroup(fastify.tokenStore, targetSet, targetGroup);
        const generator = await fastify.generatorService.create({
          type,
          sourceToken: sourceToken ?? undefined,
          inlineValue: inlineValue ?? undefined,
          targetSet,
          targetGroup,
          name: typeof name === 'string' ? name : sourceToken ? `${sourceToken} ${type}` : type,
          config,
          overrides,
          inputTable,
          targetSetTemplate: targetSetTemplate ?? undefined,
        });
        // Run immediately so tokens exist right away
        await fastify.generatorService.run(generator.id, fastify.tokenStore);
        const after = await snapshotGroup(fastify.tokenStore, targetSet, targetGroup);
        await fastify.operationLog.record({
          type: 'generator-create',
          description: `Create generator "${generator.name}" → ${targetGroup}`,
          setName: targetSet,
          affectedPaths: [...new Set([...Object.keys(before), ...Object.keys(after)])],
          beforeSnapshot: before,
          afterSnapshot: after,
          rollbackSteps: [{ action: 'delete-generator', id: generator.id }],
        });
        return reply.status(201).send(generator);
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
  });

  // POST /api/generators/preview — preview tokens without saving anything
  // IMPORTANT: must be registered before /:id routes so the static segment wins
  fastify.post<{ Body: PreviewBody }>('/generators/preview', async (request, reply) => {
    const body = request.body ?? {} as PreviewBody;
    if (typeof body.type !== 'string' || body.type === '') {
      return reply.status(400).send({ error: 'type is required' });
    }
    try {
      const results = await fastify.generatorService.preview(
        {
          type: body.type,
          sourceToken: body.sourceToken,
          inlineValue: body.inlineValue,
          targetGroup: body.targetGroup ?? '',
          targetSet: body.targetSet ?? '',
          config: body.config,
          overrides: body.overrides,
        },
        fastify.tokenStore,
        body.sourceValue,
      );
      return { count: results.length, tokens: results };
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // GET /api/generators/:id — get single generator
  fastify.get<{ Params: { id: string } }>('/generators/:id', async (request, reply) => {
    try {
      const gen = await fastify.generatorService.getById(request.params.id);
      if (!gen) return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
      return gen;
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // PUT /api/generators/:id — update generator config and re-run
  fastify.put<{ Params: { id: string }; Body: UpdateBody }>('/generators/:id', async (request, reply) => {
    const body = request.body ?? {};
    return withLock(async () => {
      try {
        const existing = await fastify.generatorService.getById(request.params.id);
        if (!existing) {
          return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
        }

        // Build a sanitized update object with only known fields
        const updates: GeneratorUpdateInput = {};

        if (typeof body.name === 'string') updates.name = body.name;
        if (typeof body.enabled === 'boolean') updates.enabled = body.enabled;
        if (typeof body.sourceToken === 'string') updates.sourceToken = body.sourceToken;
        if (typeof body.targetSet === 'string') updates.targetSet = body.targetSet;
        if (typeof body.targetGroup === 'string') updates.targetGroup = body.targetGroup;
        if (typeof body.targetSetTemplate === 'string') updates.targetSetTemplate = body.targetSetTemplate;
        if (body.inlineValue !== undefined) updates.inlineValue = body.inlineValue;
        if (body.type !== undefined) updates.type = body.type;
        if (body.overrides !== undefined) updates.overrides = body.overrides;
        if (body.inputTable !== undefined) updates.inputTable = body.inputTable;
        if (body.config !== undefined) updates.config = body.config;

        const targetSet = updates.targetSet ?? existing.targetSet ?? '';
        const targetGroup = updates.targetGroup ?? existing.targetGroup ?? '';
        const before = targetSet && targetGroup ? await snapshotGroup(fastify.tokenStore, targetSet, targetGroup) : {};
        const generator = await fastify.generatorService.update(
          request.params.id,
          updates,
        );
        // Skip re-run when only the enabled flag changed — it's a state toggle, not a config change.
        const onlyEnabledChanged = Object.keys(updates).every(k => k === 'enabled');
        if (!onlyEnabledChanged) {
          await fastify.generatorService.run(generator.id, fastify.tokenStore);
        }
        const afterSet = generator.targetSet || targetSet;
        const afterGroup = generator.targetGroup || targetGroup;
        const after = afterSet && afterGroup ? await snapshotGroup(fastify.tokenStore, afterSet, afterGroup) : {};
        await fastify.operationLog.record({
          type: 'generator-update',
          description: `Update generator "${generator.name}"`,
          setName: afterSet,
          affectedPaths: [...new Set([...Object.keys(before), ...Object.keys(after)])],
          beforeSnapshot: before,
          afterSnapshot: after,
          rollbackSteps: [{ action: 'create-generator', generator: existing }],
        });
        return generator;
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
  });

  // GET /api/generators/:id/tokens — list tokens created by a generator
  fastify.get<{ Params: { id: string } }>('/generators/:id/tokens', async (request, reply) => {
    try {
      const tokens = fastify.tokenStore.findTokensByGeneratorId(request.params.id);
      return { generatorId: request.params.id, count: tokens.length, tokens };
    } catch (err) {
      return handleRouteError(reply, err, 'Failed to list generator tokens');
    }
  });

  // DELETE /api/generators/:id — delete generator, optionally delete derived tokens
  fastify.delete<{ Params: { id: string }; Querystring: { deleteTokens?: string } }>(
    '/generators/:id',
    async (request, reply) => {
      return withLock(async () => {
        try {
          const gen = await fastify.generatorService.getById(request.params.id);
          if (!gen) {
            return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
          }
          // Snapshot before delete if tokens will also be removed
          const willDeleteTokens = request.query.deleteTokens === 'true';
          const before = willDeleteTokens && gen.targetSet && gen.targetGroup
            ? await snapshotGroup(fastify.tokenStore, gen.targetSet, gen.targetGroup)
            : {};
          const deleted = await fastify.generatorService.delete(request.params.id);
          if (!deleted) {
            return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
          }
          let tokensDeleted = 0;
          if (willDeleteTokens) {
            tokensDeleted = await fastify.tokenStore.deleteTokensByGeneratorId(request.params.id);
          }
          const after = tokensDeleted > 0 && gen.targetSet && gen.targetGroup
            ? await snapshotGroup(fastify.tokenStore, gen.targetSet, gen.targetGroup)
            : {};
          await fastify.operationLog.record({
            type: 'generator-delete',
            description: tokensDeleted > 0
              ? `Delete generator "${gen.name}" and ${tokensDeleted} tokens`
              : `Delete generator "${gen.name}"`,
            setName: gen.targetSet,
            affectedPaths: Object.keys(before),
            beforeSnapshot: before,
            afterSnapshot: after,
            rollbackSteps: [{ action: 'create-generator', generator: gen }],
          });
          return { ok: true, id: request.params.id, tokensDeleted };
        } catch (err) {
          return handleRouteError(reply, err);
        }
      });
    },
  );

  // POST /api/generators/:id/dry-run — diff of what a re-run would produce, without committing
  fastify.post<{ Params: { id: string } }>('/generators/:id/dry-run', async (request, reply) => {
    try {
      const diff = await fastify.generatorService.dryRun(request.params.id, fastify.tokenStore);
      return diff;
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // POST /api/generators/:id/check-overwrites — preview which tokens would be overwritten
  fastify.post<{ Params: { id: string } }>('/generators/:id/check-overwrites', async (request, reply) => {
    try {
      const modified = await fastify.generatorService.checkOverwrites(
        request.params.id,
        fastify.tokenStore,
      );
      return { modified };
    } catch (err) {
      return handleRouteError(reply, err);
    }
  });

  // POST /api/generators/:id/run — manually re-run a generator
  fastify.post<{ Params: { id: string } }>('/generators/:id/run', async (request, reply) => {
    return withLock(async () => {
      try {
        const gen = await fastify.generatorService.getById(request.params.id);
        if (!gen) return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
        const targetSet = gen.targetSet;
        const targetGroup = gen.targetGroup;
        const before = targetSet && targetGroup ? await snapshotGroup(fastify.tokenStore, targetSet, targetGroup) : {};
        const results = await fastify.generatorService.run(
          request.params.id,
          fastify.tokenStore,
        );
        const after = targetSet && targetGroup ? await snapshotGroup(fastify.tokenStore, targetSet, targetGroup) : {};
        await fastify.operationLog.record({
          type: 'generator-run',
          description: `Run generator "${gen.name}"`,
          setName: targetSet,
          affectedPaths: [...new Set([...Object.keys(before), ...Object.keys(after)])],
          beforeSnapshot: before,
          afterSnapshot: after,
        });
        return { count: results.length, tokens: results };
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
  });

  // GET /api/generators/:id/steps — compute current step values without persisting
  fastify.get<{ Params: { id: string } }>('/generators/:id/steps', async (request, reply) => {
    try {
      const gen = await fastify.generatorService.getById(request.params.id);
      if (!gen) return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
      const results = await fastify.generatorService.preview(gen, fastify.tokenStore);
      return { count: results.length, results };
    } catch (err) {
      return handleRouteError(reply, err);
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
    return withLock(async () => {
      try {
        const gen = await fastify.generatorService.getById(request.params.id);
        if (!gen) return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
        const generator = await fastify.generatorService.setStepOverride(
          request.params.id,
          request.params.stepName,
          { value, locked },
        );
        await fastify.generatorService.run(generator.id, fastify.tokenStore);
        return generator;
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
  });

  // DELETE /api/generators/:id/steps/:stepName/override — remove a step override
  fastify.delete<{
    Params: { id: string; stepName: string };
  }>('/generators/:id/steps/:stepName/override', async (request, reply) => {
    return withLock(async () => {
      try {
        const gen = await fastify.generatorService.getById(request.params.id);
        if (!gen) return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
        const generator = await fastify.generatorService.setStepOverride(
          request.params.id,
          request.params.stepName,
          null,
        );
        await fastify.generatorService.run(generator.id, fastify.tokenStore);
        return generator;
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
  });
};
