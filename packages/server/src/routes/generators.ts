import type { FastifyPluginAsync } from 'fastify';
import type {
  GeneratorType,
  GeneratorConfig,
  InputTable,
  TokenGenerator,
  ColorRampConfig,
  TypeScaleConfig,
  SpacingScaleConfig,
  OpacityScaleConfig,
  BorderRadiusScaleConfig,
  ZIndexScaleConfig,
  CustomScaleConfig,
  AccessibleColorPairConfig,
  DarkModeInversionConfig,
  ResponsiveScaleConfig,
  ContrastCheckConfig,
  TokenType,
} from '@tokenmanager/core';
import { handleRouteError } from '../errors.js';
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
//
// Each case validates required fields AND constructs a clean object containing
// only known properties — no extra fields from the client leak through.
// ---------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

type ConfigResult =
  | { validated: GeneratorConfig; error?: undefined }
  | { validated?: undefined; error: string };

/**
 * Validates that the provided config object has the required shape for the
 * given generator type. Returns a *clean* config containing only known fields
 * on success, or an error string on failure.
 */
function validateGeneratorConfig(
  type: string,
  config: Record<string, unknown> | undefined,
): ConfigResult {
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
      const validated: ColorRampConfig = {
        steps: c.steps as number[],
        lightEnd: c.lightEnd as number,
        darkEnd: c.darkEnd as number,
        chromaBoost: c.chromaBoost as number,
        includeSource: c.includeSource as boolean,
        ...(c.lightnessCurve !== undefined && { lightnessCurve: c.lightnessCurve as [number, number, number, number] }),
        ...(typeof c.sourceStep === 'number' && { sourceStep: c.sourceStep }),
      };
      return { validated };
    }
    case 'typeScale': {
      if (!Array.isArray(c.steps) || !c.steps.every((s: unknown) => isObj(s) && typeof s.name === 'string' && typeof s.exponent === 'number'))
        return { error: 'typeScale config requires "steps" as Array<{name: string, exponent: number}>' };
      if (typeof c.ratio !== 'number') return { error: 'typeScale config requires "ratio" as number' };
      if (c.unit !== 'px' && c.unit !== 'rem') return { error: 'typeScale config requires "unit" as "px" | "rem"' };
      if (typeof c.baseStep !== 'string') return { error: 'typeScale config requires "baseStep" as string' };
      if (typeof c.roundTo !== 'number') return { error: 'typeScale config requires "roundTo" as number' };
      const validated: TypeScaleConfig = {
        steps: (c.steps as Array<Record<string, unknown>>).map((s) => ({ name: s.name as string, exponent: s.exponent as number })),
        ratio: c.ratio as number,
        unit: c.unit as 'px' | 'rem',
        baseStep: c.baseStep as string,
        roundTo: c.roundTo as number,
      };
      return { validated };
    }
    case 'spacingScale': {
      if (!Array.isArray(c.steps) || !c.steps.every((s: unknown) => isObj(s) && typeof s.name === 'string' && typeof s.multiplier === 'number'))
        return { error: 'spacingScale config requires "steps" as Array<{name: string, multiplier: number}>' };
      if (c.unit !== 'px' && c.unit !== 'rem') return { error: 'spacingScale config requires "unit" as "px" | "rem"' };
      const validated: SpacingScaleConfig = {
        steps: (c.steps as Array<Record<string, unknown>>).map((s) => ({ name: s.name as string, multiplier: s.multiplier as number })),
        unit: c.unit as 'px' | 'rem',
      };
      return { validated };
    }
    case 'opacityScale': {
      if (!Array.isArray(c.steps) || !c.steps.every((s: unknown) => isObj(s) && typeof s.name === 'string' && typeof s.value === 'number'))
        return { error: 'opacityScale config requires "steps" as Array<{name: string, value: number}>' };
      const validated: OpacityScaleConfig = {
        steps: (c.steps as Array<Record<string, unknown>>).map((s) => ({ name: s.name as string, value: s.value as number })),
      };
      return { validated };
    }
    case 'borderRadiusScale': {
      if (!Array.isArray(c.steps) || !c.steps.every((s: unknown) => isObj(s) && typeof s.name === 'string' && typeof s.multiplier === 'number'))
        return { error: 'borderRadiusScale config requires "steps" as Array<{name: string, multiplier: number}>' };
      if (c.unit !== 'px' && c.unit !== 'rem') return { error: 'borderRadiusScale config requires "unit" as "px" | "rem"' };
      const validated: BorderRadiusScaleConfig = {
        steps: (c.steps as Array<Record<string, unknown>>).map((s) => ({
          name: s.name as string,
          multiplier: s.multiplier as number,
          ...(typeof s.exactValue === 'number' && { exactValue: s.exactValue }),
        })),
        unit: c.unit as 'px' | 'rem',
      };
      return { validated };
    }
    case 'zIndexScale': {
      if (!Array.isArray(c.steps) || !c.steps.every((s: unknown) => isObj(s) && typeof s.name === 'string' && typeof s.value === 'number'))
        return { error: 'zIndexScale config requires "steps" as Array<{name: string, value: number}>' };
      const validated: ZIndexScaleConfig = {
        steps: (c.steps as Array<Record<string, unknown>>).map((s) => ({ name: s.name as string, value: s.value as number })),
      };
      return { validated };
    }
    case 'customScale': {
      if (typeof c.outputType !== 'string') return { error: 'customScale config requires "outputType" as string' };
      if (!Array.isArray(c.steps) || !c.steps.every((s: unknown) => isObj(s) && typeof s.name === 'string' && typeof s.index === 'number'))
        return { error: 'customScale config requires "steps" as Array<{name: string, index: number}>' };
      if (typeof c.formula !== 'string') return { error: 'customScale config requires "formula" as string' };
      if (typeof c.roundTo !== 'number') return { error: 'customScale config requires "roundTo" as number' };
      const validated: CustomScaleConfig = {
        outputType: c.outputType as TokenType,
        steps: (c.steps as Array<Record<string, unknown>>).map((s) => ({
          name: s.name as string,
          index: s.index as number,
          ...(typeof s.multiplier === 'number' && { multiplier: s.multiplier }),
        })),
        formula: c.formula as string,
        roundTo: c.roundTo as number,
        ...(c.unit === 'px' || c.unit === 'rem' || c.unit === 'em' || c.unit === '%' ? { unit: c.unit } : {}),
      };
      return { validated };
    }
    case 'accessibleColorPair': {
      if (c.contrastLevel !== 'AA' && c.contrastLevel !== 'AAA')
        return { error: 'accessibleColorPair config requires "contrastLevel" as "AA" | "AAA"' };
      if (typeof c.backgroundStep !== 'string') return { error: 'accessibleColorPair config requires "backgroundStep" as string' };
      if (typeof c.foregroundStep !== 'string') return { error: 'accessibleColorPair config requires "foregroundStep" as string' };
      const validated: AccessibleColorPairConfig = {
        contrastLevel: c.contrastLevel as 'AA' | 'AAA',
        backgroundStep: c.backgroundStep as string,
        foregroundStep: c.foregroundStep as string,
      };
      return { validated };
    }
    case 'darkModeInversion': {
      if (typeof c.stepName !== 'string') return { error: 'darkModeInversion config requires "stepName" as string' };
      if (typeof c.chromaBoost !== 'number') return { error: 'darkModeInversion config requires "chromaBoost" as number' };
      const validated: DarkModeInversionConfig = {
        stepName: c.stepName as string,
        chromaBoost: c.chromaBoost as number,
      };
      return { validated };
    }
    case 'responsiveScale': {
      if (!Array.isArray(c.steps) || !c.steps.every((s: unknown) => isObj(s) && typeof s.name === 'string' && typeof s.multiplier === 'number'))
        return { error: 'responsiveScale config requires "steps" as Array<{name: string, multiplier: number}>' };
      if (c.unit !== 'px' && c.unit !== 'rem') return { error: 'responsiveScale config requires "unit" as "px" | "rem"' };
      const validated: ResponsiveScaleConfig = {
        steps: (c.steps as Array<Record<string, unknown>>).map((s) => ({ name: s.name as string, multiplier: s.multiplier as number })),
        unit: c.unit as 'px' | 'rem',
      };
      return { validated };
    }
    case 'contrastCheck': {
      if (typeof c.backgroundHex !== 'string') return { error: 'contrastCheck config requires "backgroundHex" as string' };
      if (!Array.isArray(c.steps) || !c.steps.every((s: unknown) => isObj(s) && typeof s.name === 'string' && typeof s.hex === 'string'))
        return { error: 'contrastCheck config requires "steps" as Array<{name: string, hex: string}>' };
      if (!Array.isArray(c.levels) || !c.levels.every((l: unknown) => l === 'AA' || l === 'AAA'))
        return { error: 'contrastCheck config requires "levels" as Array<"AA" | "AAA">' };
      const validated: ContrastCheckConfig = {
        backgroundHex: c.backgroundHex as string,
        steps: (c.steps as Array<Record<string, unknown>>).map((s) => ({ name: s.name as string, hex: s.hex as string })),
        levels: c.levels as ('AA' | 'AAA')[],
      };
      return { validated };
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
  sourceValue?: unknown;
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
  const { withLock } = fastify.tokenLock;

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
    return withLock(async () => {
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
    return withLock(async () => {
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
        await fastify.operationLog.record({
          type: 'generator-create',
          description: `Create generator "${generator.name}" → ${targetGroup}`,
          setName: targetSet,
          affectedPaths: [...new Set([...Object.keys(before), ...Object.keys(after)])],
          beforeSnapshot: before,
          afterSnapshot: after,
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
        body.sourceValue,
      );
      return { count: results.length, tokens: results };
    } catch (err) {
      return handleRouteError(reply, err);
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
    // Validate type early (before acquiring the lock)
    const body = request.body ?? {};
    if (body.type !== undefined && typeof body.type === 'string' && !VALID_GENERATOR_TYPES.includes(body.type)) {
      return reply.status(400).send({
        error: `Unknown generator type "${body.type}". Valid types: ${VALID_GENERATOR_TYPES.join(', ')}`,
      });
    }

    return withLock(async () => {
      try {
        const existing = await fastify.generatorService.getById(request.params.id);
        if (!existing) {
          return reply.status(404).send({ error: `Generator "${request.params.id}" not found` });
        }

        // Build a sanitized update object with only known fields
        const updates: Partial<Omit<TokenGenerator, 'id' | 'createdAt'>> = {};

        if (typeof body.name === 'string') updates.name = body.name;
        if (typeof body.sourceToken === 'string') updates.sourceToken = body.sourceToken;
        if (typeof body.targetSet === 'string') updates.targetSet = body.targetSet;
        if (typeof body.targetGroup === 'string') updates.targetGroup = body.targetGroup;
        if (typeof body.targetSetTemplate === 'string') updates.targetSetTemplate = body.targetSetTemplate;
        if (body.type !== undefined && typeof body.type === 'string') {
          updates.type = body.type as GeneratorType;
        }
        if (isObj(body.overrides)) {
          const overrides: Record<string, { value: unknown; locked: boolean }> = {};
          for (const [key, val] of Object.entries(body.overrides)) {
            if (isObj(val) && typeof val.locked === 'boolean') {
              overrides[key] = { value: val.value, locked: val.locked };
            }
          }
          updates.overrides = overrides;
        }
        if (isObj(body.inputTable) && typeof body.inputTable.inputKey === 'string' && Array.isArray(body.inputTable.rows)) {
          updates.inputTable = body.inputTable as InputTable;
        }

        // Validate config if provided — use the effective type (updated or existing)
        if (body.config !== undefined) {
          const effectiveType = updates.type ?? existing.type;
          const configResult = validateGeneratorConfig(effectiveType, body.config as Record<string, unknown>);
          if (configResult.error) {
            return reply.status(400).send({ error: configResult.error });
          }
          updates.config = configResult.validated;
        }

        const targetSet = updates.targetSet ?? existing.targetSet ?? '';
        const targetGroup = updates.targetGroup ?? existing.targetGroup ?? '';
        const before = targetSet && targetGroup ? await snapshotGroup(fastify.tokenStore, targetSet, targetGroup) : {};
        const generator = await fastify.generatorService.update(
          request.params.id,
          updates,
        );
        await fastify.generatorService.run(generator.id, fastify.tokenStore);
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
        });
        return generator;
      } catch (err) {
        return handleRouteError(reply, err);
      }
    });
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
      return withLock(async () => {
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
          await fastify.operationLog.record({
            type: 'generator-delete',
            description: `Delete generator "${gen.name}" and ${tokensDeleted} tokens`,
            setName: gen.targetSet,
            affectedPaths: Object.keys(before),
            beforeSnapshot: before,
            afterSnapshot: after,
          });
        }
        return { ok: true, id: request.params.id, tokensDeleted };
      });
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
      return handleRouteError(reply, err);
    }
  });

  // POST /api/generators/:id/run — manually re-run a generator
  fastify.post<{ Params: { id: string } }>('/generators/:id/run', async (request, reply) => {
    return withLock(async () => {
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
        await fastify.operationLog.record({
          type: 'generator-run',
          description: `Run generator "${gen?.name ?? request.params.id}"`,
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
