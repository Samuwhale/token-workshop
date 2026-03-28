import type { FastifyPluginAsync } from 'fastify';
import type { GeneratorType, GeneratorConfig, InputTable, TokenGenerator } from '@tokenmanager/core';
import { getErrorMessage } from '../utils';
import { snapshotGroup } from '../services/operation-log.js';

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

// ---------------------------------------------------------------------------
// Config validation per generator type
// ---------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isArrayOf(arr: unknown, check: (item: unknown) => boolean): arr is unknown[] {
  return Array.isArray(arr) && arr.every(check);
}

/**
 * Validates that the provided config object has the required shape for the
 * given generator type. Returns null on success, or an error string on failure.
 */
function validateGeneratorConfig(
  type: string,
  config: Record<string, unknown> | undefined,
): { validated: GeneratorConfig; error?: undefined } | { validated?: undefined; error: string } {
  const c = config ?? {};

  switch (type) {
    case 'colorRamp': {
      if (!Array.isArray(c.steps) || !c.steps.every((s: unknown) => typeof s === 'number'))
        return { error: 'colorRamp config requires "steps" as number[]' };
      if (typeof c.lightEnd !== 'number') return { error: 'colorRamp config requires "lightEnd" as number' };
      if (typeof c.darkEnd !== 'number') return { error: 'colorRamp config requires "darkEnd" as number' };
      if (typeof c.chromaBoost !== 'number') return { error: 'colorRamp config requires "chromaBoost" as number' };
      if (typeof c.includeSource !== 'boolean') return { error: 'colorRamp config requires "includeSource" as boolean' };
      if (c.lightnessCurve !== undefined) {
        if (!Array.isArray(c.lightnessCurve) || c.lightnessCurve.length !== 4 || !c.lightnessCurve.every((v: unknown) => typeof v === 'number'))
          return { error: 'colorRamp config "lightnessCurve" must be [number, number, number, number]' };
      }
      return { validated: c as unknown as GeneratorConfig };
    }
    case 'typeScale': {
      if (!isArrayOf(c.steps, (s) => isObj(s) && typeof s.name === 'string' && typeof s.exponent === 'number'))
        return { error: 'typeScale config requires "steps" as Array<{name: string, exponent: number}>' };
      if (typeof c.ratio !== 'number') return { error: 'typeScale config requires "ratio" as number' };
      if (c.unit !== 'px' && c.unit !== 'rem') return { error: 'typeScale config requires "unit" as "px" | "rem"' };
      if (typeof c.baseStep !== 'string') return { error: 'typeScale config requires "baseStep" as string' };
      if (typeof c.roundTo !== 'number') return { error: 'typeScale config requires "roundTo" as number' };
      return { validated: c as unknown as GeneratorConfig };
    }
    case 'spacingScale': {
      if (!isArrayOf(c.steps, (s) => isObj(s) && typeof s.name === 'string' && typeof s.multiplier === 'number'))
        return { error: 'spacingScale config requires "steps" as Array<{name: string, multiplier: number}>' };
      if (c.unit !== 'px' && c.unit !== 'rem') return { error: 'spacingScale config requires "unit" as "px" | "rem"' };
      return { validated: c as unknown as GeneratorConfig };
    }
    case 'opacityScale': {
      if (!isArrayOf(c.steps, (s) => isObj(s) && typeof s.name === 'string' && typeof s.value === 'number'))
        return { error: 'opacityScale config requires "steps" as Array<{name: string, value: number}>' };
      return { validated: c as unknown as GeneratorConfig };
    }
    case 'borderRadiusScale': {
      if (!isArrayOf(c.steps, (s) => isObj(s) && typeof s.name === 'string' && typeof s.multiplier === 'number'))
        return { error: 'borderRadiusScale config requires "steps" as Array<{name: string, multiplier: number}>' };
      if (c.unit !== 'px' && c.unit !== 'rem') return { error: 'borderRadiusScale config requires "unit" as "px" | "rem"' };
      return { validated: c as unknown as GeneratorConfig };
    }
    case 'zIndexScale': {
      if (!isArrayOf(c.steps, (s) => isObj(s) && typeof s.name === 'string' && typeof s.value === 'number'))
        return { error: 'zIndexScale config requires "steps" as Array<{name: string, value: number}>' };
      return { validated: c as unknown as GeneratorConfig };
    }
    case 'customScale': {
      if (typeof c.outputType !== 'string') return { error: 'customScale config requires "outputType" as string' };
      if (!isArrayOf(c.steps, (s) => isObj(s) && typeof s.name === 'string' && typeof s.index === 'number'))
        return { error: 'customScale config requires "steps" as Array<{name: string, index: number}>' };
      if (typeof c.formula !== 'string') return { error: 'customScale config requires "formula" as string' };
      if (typeof c.roundTo !== 'number') return { error: 'customScale config requires "roundTo" as number' };
      return { validated: c as unknown as GeneratorConfig };
    }
    case 'accessibleColorPair': {
      if (c.contrastLevel !== 'AA' && c.contrastLevel !== 'AAA')
        return { error: 'accessibleColorPair config requires "contrastLevel" as "AA" | "AAA"' };
      if (typeof c.backgroundStep !== 'string') return { error: 'accessibleColorPair config requires "backgroundStep" as string' };
      if (typeof c.foregroundStep !== 'string') return { error: 'accessibleColorPair config requires "foregroundStep" as string' };
      return { validated: c as unknown as GeneratorConfig };
    }
    case 'darkModeInversion': {
      if (typeof c.stepName !== 'string') return { error: 'darkModeInversion config requires "stepName" as string' };
      if (typeof c.chromaBoost !== 'number') return { error: 'darkModeInversion config requires "chromaBoost" as number' };
      return { validated: c as unknown as GeneratorConfig };
    }
    case 'responsiveScale': {
      if (!isArrayOf(c.steps, (s) => isObj(s) && typeof s.name === 'string' && typeof s.multiplier === 'number'))
        return { error: 'responsiveScale config requires "steps" as Array<{name: string, multiplier: number}>' };
      if (c.unit !== 'px' && c.unit !== 'rem') return { error: 'responsiveScale config requires "unit" as "px" | "rem"' };
      return { validated: c as unknown as GeneratorConfig };
    }
    case 'contrastCheck': {
      if (typeof c.backgroundHex !== 'string') return { error: 'contrastCheck config requires "backgroundHex" as string' };
      if (!isArrayOf(c.steps, (s) => isObj(s) && typeof s.name === 'string' && typeof s.hex === 'string'))
        return { error: 'contrastCheck config requires "steps" as Array<{name: string, hex: string}>' };
      if (!isArrayOf(c.levels, (l) => l === 'AA' || l === 'AAA'))
        return { error: 'contrastCheck config requires "levels" as Array<"AA" | "AAA">' };
      return { validated: c as unknown as GeneratorConfig };
    }
    default:
      return { error: `No config validator for type "${type}"` };
  }
}

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
    const configResult = validateGeneratorConfig(type, config);
    if (configResult.error) {
      return reply.status(400).send({ error: configResult.error });
    }
    try {
      const before = await snapshotGroup(fastify.tokenStore, targetSet, targetGroup);
      const generator = await fastify.generatorService.create({
        type: type as GeneratorType,
        sourceToken: sourceToken ?? undefined,
        targetSet,
        targetGroup,
        name: (name || (sourceToken ? `${sourceToken} ${type}` : type)) as string,
        config: configResult.validated,
        overrides,
        inputTable: inputTable as InputTable | undefined,
        targetSetTemplate: targetSetTemplate ?? undefined,
      });
      // Run immediately so tokens exist right away
      await fastify.generatorService.run(generator.id, fastify.tokenStore);
      const after = await snapshotGroup(fastify.tokenStore, targetSet, targetGroup);
      fastify.operationLog.record({
        type: 'generator-create',
        description: `Create generator "${generator.name}" → ${targetGroup}`,
        setName: targetSet,
        affectedPaths: [...new Set([...Object.keys(before), ...Object.keys(after)])],
        beforeSnapshot: before,
        afterSnapshot: after,
      });
      return reply.status(201).send(generator);
    } catch (err) {
      const msg = getErrorMessage(err);
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
    const configResult = validateGeneratorConfig(body.type, body.config);
    if (configResult.error) {
      return reply.status(400).send({ error: configResult.error });
    }
    try {
      const results = await fastify.generatorService.preview(
        {
          type: body.type as GeneratorType,
          sourceToken: body.sourceToken,
          targetGroup: body.targetGroup ?? '',
          targetSet: body.targetSet ?? '',
          config: configResult.validated,
          overrides: body.overrides,
        },
        fastify.tokenStore,
      );
      return { count: results.length, tokens: results };
    } catch (err) {
      const msg = getErrorMessage(err);
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
      const existing = await fastify.generatorService.getById(request.params.id);
      const targetSet = existing?.targetSet ?? '';
      const targetGroup = existing?.targetGroup ?? '';
      const before = targetSet && targetGroup ? await snapshotGroup(fastify.tokenStore, targetSet, targetGroup) : {};
      const generator = await fastify.generatorService.update(
        request.params.id,
        (request.body ?? {}) as Partial<Omit<TokenGenerator, 'id' | 'createdAt'>>,
      );
      await fastify.generatorService.run(generator.id, fastify.tokenStore);
      const afterSet = generator.targetSet || targetSet;
      const afterGroup = generator.targetGroup || targetGroup;
      const after = afterSet && afterGroup ? await snapshotGroup(fastify.tokenStore, afterSet, afterGroup) : {};
      fastify.operationLog.record({
        type: 'generator-update',
        description: `Update generator "${generator.name}"`,
        setName: afterSet,
        affectedPaths: [...new Set([...Object.keys(before), ...Object.keys(after)])],
        beforeSnapshot: before,
        afterSnapshot: after,
      });
      return generator;
    } catch (err) {
      const msg = getErrorMessage(err);
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
      if (tokensDeleted > 0) {
        const after = gen.targetSet && gen.targetGroup
          ? await snapshotGroup(fastify.tokenStore, gen.targetSet, gen.targetGroup)
          : {};
        fastify.operationLog.record({
          type: 'generator-delete',
          description: `Delete generator "${gen.name}" and ${tokensDeleted} tokens`,
          setName: gen.targetSet,
          affectedPaths: Object.keys(before),
          beforeSnapshot: before,
          afterSnapshot: after,
        });
      }
      return { deleted: true, id: request.params.id, tokensDeleted };
    },
  );

  // POST /api/generators/:id/check-overwrites — preview which tokens would be overwritten
  fastify.post<{ Params: { id: string } }>('/generators/:id/check-overwrites', async (request, reply) => {
    try {
      const modified = await fastify.generatorService.checkOverwrites(
        request.params.id,
        fastify.tokenStore,
      );
      return { modified };
    } catch (err) {
      const msg = getErrorMessage(err);
      if (msg.includes('not found')) return reply.status(404).send({ error: msg });
      return reply.status(500).send({ error: msg });
    }
  });

  // POST /api/generators/:id/run — manually re-run a generator
  fastify.post<{ Params: { id: string } }>('/generators/:id/run', async (request, reply) => {
    try {
      const gen = await fastify.generatorService.getById(request.params.id);
      const targetSet = gen?.targetSet ?? '';
      const targetGroup = gen?.targetGroup ?? '';
      const before = targetSet && targetGroup ? await snapshotGroup(fastify.tokenStore, targetSet, targetGroup) : {};
      const results = await fastify.generatorService.run(
        request.params.id,
        fastify.tokenStore,
      );
      const after = targetSet && targetGroup ? await snapshotGroup(fastify.tokenStore, targetSet, targetGroup) : {};
      fastify.operationLog.record({
        type: 'generator-run',
        description: `Run generator "${gen?.name ?? request.params.id}"`,
        setName: targetSet,
        affectedPaths: [...new Set([...Object.keys(before), ...Object.keys(after)])],
        beforeSnapshot: before,
        afterSnapshot: after,
      });
      return { count: results.length, tokens: results };
    } catch (err) {
      const msg = getErrorMessage(err);
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
      const msg = getErrorMessage(err);
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
      const msg = getErrorMessage(err);
      if (msg.includes('not found')) return reply.status(404).send({ error: msg });
      return reply.status(500).send({ error: msg });
    }
  });
};
