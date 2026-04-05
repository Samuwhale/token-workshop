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
  ShadowScaleConfig,
  CustomScaleConfig,
  AccessibleColorPairConfig,
  DarkModeInversionConfig,
  ContrastCheckConfig,
  TokenType,
  DimensionUnit,
} from '@tokenmanager/core';
import { DIMENSION_UNITS, evalExpr, substituteVars } from '@tokenmanager/core';
import { handleRouteError } from '../errors.js';
import { snapshotGroup } from '../services/operation-log.js';
import { stableStringify } from '../services/stable-stringify.js';

const VALID_GENERATOR_TYPES: readonly string[] = [
  'colorRamp',
  'typeScale',
  'spacingScale',
  'opacityScale',
  'borderRadiusScale',
  'zIndexScale',
  'shadowScale',
  'customScale',
  'accessibleColorPair',
  'darkModeInversion',
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

/** Returns true only for finite numbers — rejects NaN and ±Infinity. */
function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && isFinite(v);
}

/**
 * Validates and cleans a $tokenRefs object for a config type.
 * Accepts only entries where the value is a non-empty string (a token path).
 * Returns the cleaned object, or undefined if there are no valid entries.
 */
function validateTokenRefs<K extends string>(
  raw: unknown,
  allowedFields: K[],
): Partial<Record<K, string>> | undefined {
  if (!isObj(raw)) return undefined;
  const result: Partial<Record<K, string>> = {};
  for (const field of allowedFields) {
    const val = (raw as Record<string, unknown>)[field];
    if (typeof val === 'string' && val.trim() !== '') {
      result[field] = val;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Returns a duplicate name from the steps array, or undefined if all are unique.
 */
function findDuplicateStepName(steps: Array<{ name: string }>): string | undefined {
  const seen = new Set<string>();
  for (const s of steps) {
    if (seen.has(s.name)) return s.name;
    seen.add(s.name);
  }
  return undefined;
}

/**
 * Validates a customScale formula string by substituting all known variables
 * with dummy values and running the expression evaluator. Returns an error
 * string if the formula is syntactically invalid, or undefined if it parses.
 */
function validateFormulaSyntax(formula: string): string | undefined {
  // Use dummy values that cover the full variable set available at runtime
  const dummyVars: Record<string, number> = { base: 1, index: 1, multiplier: 1, prev: 1 };
  try {
    const substituted = substituteVars(formula, dummyVars);
    evalExpr(substituted);
    return undefined;
  } catch (err) {
    return `customScale formula syntax error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

type ConfigResult =
  | { validated: GeneratorConfig; error?: undefined }
  | { validated?: undefined; error: string };

type InputTableResult =
  | { validated: InputTable; error?: undefined }
  | { validated?: undefined; error: string };

/**
 * Validates and cleans an InputTable from untrusted request body data.
 * Each row must have a non-empty `brand` string and an `inputs` object.
 */
function validateInputTable(raw: unknown): InputTableResult {
  if (!isObj(raw)) {
    return { error: 'inputTable must be an object' };
  }
  if (typeof raw.inputKey !== 'string' || raw.inputKey === '') {
    return { error: 'inputTable.inputKey must be a non-empty string' };
  }
  if (!Array.isArray(raw.rows)) {
    return { error: 'inputTable.rows must be an array' };
  }
  const rows: InputTable['rows'] = [];
  for (let i = 0; i < raw.rows.length; i++) {
    const row = raw.rows[i];
    if (!isObj(row)) {
      return { error: `inputTable.rows[${i}] must be an object` };
    }
    if (typeof row.brand !== 'string' || row.brand === '') {
      return { error: `inputTable.rows[${i}].brand must be a non-empty string` };
    }
    if (!isObj(row.inputs)) {
      return { error: `inputTable.rows[${i}].inputs must be an object` };
    }
    rows.push({ brand: row.brand, inputs: row.inputs });
  }
  return { validated: { inputKey: raw.inputKey, rows } };
}

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
      if (!Array.isArray(c.steps) || c.steps.length === 0 || !c.steps.every((s: unknown) => isFiniteNum(s)))
        return { error: 'colorRamp config requires "steps" as non-empty finite number[]' };
      if (!isFiniteNum(c.lightEnd)) return { error: 'colorRamp config requires "lightEnd" as finite number' };
      if ((c.lightEnd as number) < 0 || (c.lightEnd as number) > 100) return { error: 'colorRamp config "lightEnd" must be between 0 and 100' };
      if (!isFiniteNum(c.darkEnd)) return { error: 'colorRamp config requires "darkEnd" as finite number' };
      if ((c.darkEnd as number) < 0 || (c.darkEnd as number) > 100) return { error: 'colorRamp config "darkEnd" must be between 0 and 100' };
      if ((c.lightEnd as number) <= (c.darkEnd as number)) return { error: 'colorRamp config "lightEnd" must be greater than "darkEnd"' };
      if (!isFiniteNum(c.chromaBoost)) return { error: 'colorRamp config requires "chromaBoost" as finite number' };
      if ((c.chromaBoost as number) < 0) return { error: 'colorRamp config "chromaBoost" must be >= 0' };
      if (typeof c.includeSource !== 'boolean') return { error: 'colorRamp config requires "includeSource" as boolean' };
      if (c.lightnessCurve !== undefined) {
        if (!Array.isArray(c.lightnessCurve) || c.lightnessCurve.length !== 4 || !c.lightnessCurve.every((v: unknown) => isFiniteNum(v)))
          return { error: 'colorRamp config "lightnessCurve" must be [number, number, number, number]' };
        // x control points must be in [0,1]; y values are unconstrained (can overshoot for easing)
        const lc = c.lightnessCurve as number[];
        if (lc[0] < 0 || lc[0] > 1 || lc[2] < 0 || lc[2] > 1) return { error: 'colorRamp config "lightnessCurve" control point x values must be in [0, 1]' };
      }
      const tokenRefs = validateTokenRefs(c.$tokenRefs, ['lightEnd', 'darkEnd', 'chromaBoost']);
      const validated: ColorRampConfig = {
        steps: c.steps as number[],
        lightEnd: c.lightEnd as number,
        darkEnd: c.darkEnd as number,
        chromaBoost: c.chromaBoost as number,
        includeSource: c.includeSource as boolean,
        ...(c.lightnessCurve !== undefined && { lightnessCurve: c.lightnessCurve as [number, number, number, number] }),
        ...(isFiniteNum(c.sourceStep) && { sourceStep: c.sourceStep }),
        ...(tokenRefs && { $tokenRefs: tokenRefs }),
      };
      return { validated };
    }
    case 'typeScale': {
      if (!Array.isArray(c.steps) || c.steps.length === 0 || !c.steps.every((s: unknown) => isObj(s) && typeof s.name === 'string' && isFiniteNum(s.exponent)))
        return { error: 'typeScale config requires "steps" as non-empty Array<{name: string, exponent: number}>' };
      const dupTypeScale = findDuplicateStepName(c.steps as Array<{ name: string }>);
      if (dupTypeScale !== undefined) return { error: `typeScale config has duplicate step name: "${dupTypeScale}"` };
      if (!isFiniteNum(c.ratio)) return { error: 'typeScale config requires "ratio" as finite number' };
      if ((c.ratio as number) <= 0) return { error: 'typeScale config "ratio" must be > 0' };
      if (!DIMENSION_UNITS.includes(c.unit as DimensionUnit)) return { error: `typeScale config requires "unit" as a valid CSS dimension unit (e.g. "px", "rem", "em")` };
      if (typeof c.baseStep !== 'string') return { error: 'typeScale config requires "baseStep" as string' };
      const stepNames = (c.steps as Array<{ name: string }>).map(s => s.name);
      if (!stepNames.includes(c.baseStep as string)) return { error: `typeScale config "baseStep" ("${c.baseStep}") must match one of the defined step names: ${stepNames.join(', ')}` };
      if (!isFiniteNum(c.roundTo)) return { error: 'typeScale config requires "roundTo" as finite number' };
      if ((c.roundTo as number) < 0) return { error: 'typeScale config "roundTo" must be >= 0' };
      const tokenRefs = validateTokenRefs(c.$tokenRefs, ['ratio']);
      const validated: TypeScaleConfig = {
        steps: (c.steps as Array<Record<string, unknown>>).map((s) => ({ name: s.name as string, exponent: s.exponent as number })),
        ratio: c.ratio as number,
        unit: c.unit as DimensionUnit,
        baseStep: c.baseStep as string,
        roundTo: c.roundTo as number,
        ...(tokenRefs && { $tokenRefs: tokenRefs }),
      };
      return { validated };
    }
    case 'spacingScale': {
      if (!Array.isArray(c.steps) || c.steps.length === 0 || !c.steps.every((s: unknown) => isObj(s) && typeof s.name === 'string' && isFiniteNum(s.multiplier)))
        return { error: 'spacingScale config requires "steps" as non-empty Array<{name: string, multiplier: number}>' };
      const dupSpacing = findDuplicateStepName(c.steps as Array<{ name: string }>);
      if (dupSpacing !== undefined) return { error: `spacingScale config has duplicate step name: "${dupSpacing}"` };
      if (!DIMENSION_UNITS.includes(c.unit as DimensionUnit)) return { error: `spacingScale config requires "unit" as a valid CSS dimension unit (e.g. "px", "rem", "em")` };
      const validated: SpacingScaleConfig = {
        steps: (c.steps as Array<Record<string, unknown>>).map((s) => ({ name: s.name as string, multiplier: s.multiplier as number })),
        unit: c.unit as DimensionUnit,
      };
      return { validated };
    }
    case 'opacityScale': {
      if (!Array.isArray(c.steps) || c.steps.length === 0 || !c.steps.every((s: unknown) => isObj(s) && typeof s.name === 'string' && isFiniteNum(s.value)))
        return { error: 'opacityScale config requires "steps" as non-empty Array<{name: string, value: number}>' };
      const dupOpacity = findDuplicateStepName(c.steps as Array<{ name: string }>);
      if (dupOpacity !== undefined) return { error: `opacityScale config has duplicate step name: "${dupOpacity}"` };
      for (let i = 0; i < c.steps.length; i++) {
        const v = (c.steps[i] as Record<string, unknown>).value as number;
        if (v < 0 || v > 1) return { error: `opacityScale config steps[${i}].value must be between 0 and 1` };
      }
      const validated: OpacityScaleConfig = {
        steps: (c.steps as Array<Record<string, unknown>>).map((s) => ({ name: s.name as string, value: s.value as number })),
      };
      return { validated };
    }
    case 'borderRadiusScale': {
      if (!Array.isArray(c.steps) || c.steps.length === 0 || !c.steps.every((s: unknown) => isObj(s) && typeof s.name === 'string' && isFiniteNum(s.multiplier)))
        return { error: 'borderRadiusScale config requires "steps" as non-empty Array<{name: string, multiplier: number}>' };
      const dupBorderRadius = findDuplicateStepName(c.steps as Array<{ name: string }>);
      if (dupBorderRadius !== undefined) return { error: `borderRadiusScale config has duplicate step name: "${dupBorderRadius}"` };
      if (!DIMENSION_UNITS.includes(c.unit as DimensionUnit)) return { error: `borderRadiusScale config requires "unit" as a valid CSS dimension unit (e.g. "px", "rem", "em")` };
      const validated: BorderRadiusScaleConfig = {
        steps: (c.steps as Array<Record<string, unknown>>).map((s) => ({
          name: s.name as string,
          multiplier: s.multiplier as number,
          ...(isFiniteNum(s.exactValue) && { exactValue: s.exactValue }),
        })),
        unit: c.unit as DimensionUnit,
      };
      return { validated };
    }
    case 'zIndexScale': {
      if (!Array.isArray(c.steps) || c.steps.length === 0 || !c.steps.every((s: unknown) => isObj(s) && typeof s.name === 'string' && isFiniteNum(s.value)))
        return { error: 'zIndexScale config requires "steps" as non-empty Array<{name: string, value: number}>' };
      const dupZIndex = findDuplicateStepName(c.steps as Array<{ name: string }>);
      if (dupZIndex !== undefined) return { error: `zIndexScale config has duplicate step name: "${dupZIndex}"` };
      const validated: ZIndexScaleConfig = {
        steps: (c.steps as Array<Record<string, unknown>>).map((s) => ({ name: s.name as string, value: s.value as number })),
      };
      return { validated };
    }
    case 'shadowScale': {
      if (typeof c.color !== 'string') return { error: 'shadowScale config requires "color" as string' };
      if (!Array.isArray(c.steps) || c.steps.length === 0 || !c.steps.every((s: unknown) =>
        isObj(s) &&
        typeof s.name === 'string' &&
        isFiniteNum(s.offsetX) &&
        isFiniteNum(s.offsetY) &&
        isFiniteNum(s.blur) &&
        isFiniteNum(s.spread) &&
        isFiniteNum(s.opacity)
      )) {
        return { error: 'shadowScale config requires "steps" as non-empty Array<{name, offsetX, offsetY, blur, spread, opacity}>' };
      }
      const dupShadow = findDuplicateStepName(c.steps as Array<{ name: string }>);
      if (dupShadow !== undefined) return { error: `shadowScale config has duplicate step name: "${dupShadow}"` };
      for (let i = 0; i < c.steps.length; i++) {
        const s = c.steps[i] as Record<string, unknown>;
        const opacity = s.opacity as number;
        if (opacity < 0 || opacity > 1) return { error: `shadowScale config steps[${i}].opacity must be between 0 and 1` };
        const blur = s.blur as number;
        if (blur < 0) return { error: `shadowScale config steps[${i}].blur must be >= 0` };
      }
      const tokenRefs = validateTokenRefs(c.$tokenRefs, ['color']);
      const validated: ShadowScaleConfig = {
        color: c.color as string,
        steps: (c.steps as Array<Record<string, unknown>>).map((s) => ({
          name: s.name as string,
          offsetX: s.offsetX as number,
          offsetY: s.offsetY as number,
          blur: s.blur as number,
          spread: s.spread as number,
          opacity: s.opacity as number,
        })),
        ...(tokenRefs && { $tokenRefs: tokenRefs }),
      };
      return { validated };
    }
    case 'customScale': {
      if (typeof c.outputType !== 'string') return { error: 'customScale config requires "outputType" as string' };
      if (!Array.isArray(c.steps) || c.steps.length === 0 || !c.steps.every((s: unknown) => isObj(s) && typeof s.name === 'string' && isFiniteNum(s.index)))
        return { error: 'customScale config requires "steps" as non-empty Array<{name: string, index: number}>' };
      const dupCustom = findDuplicateStepName(c.steps as Array<{ name: string }>);
      if (dupCustom !== undefined) return { error: `customScale config has duplicate step name: "${dupCustom}"` };
      if (typeof c.formula !== 'string') return { error: 'customScale config requires "formula" as string' };
      const formulaError = validateFormulaSyntax(c.formula);
      if (formulaError !== undefined) return { error: formulaError };
      if (!isFiniteNum(c.roundTo)) return { error: 'customScale config requires "roundTo" as finite number' };
      if ((c.roundTo as number) < 0) return { error: 'customScale config "roundTo" must be >= 0' };
      const validated: CustomScaleConfig = {
        outputType: c.outputType as TokenType,
        steps: (c.steps as Array<Record<string, unknown>>).map((s) => ({
          name: s.name as string,
          index: s.index as number,
          ...(isFiniteNum(s.multiplier) && { multiplier: s.multiplier }),
        })),
        formula: c.formula as string,
        roundTo: c.roundTo as number,
        ...(DIMENSION_UNITS.includes(c.unit as DimensionUnit) ? { unit: c.unit as DimensionUnit } : {}),
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
      if (!isFiniteNum(c.chromaBoost)) return { error: 'darkModeInversion config requires "chromaBoost" as finite number' };
      if ((c.chromaBoost as number) < 0) return { error: 'darkModeInversion config "chromaBoost" must be >= 0' };
      const tokenRefs = validateTokenRefs(c.$tokenRefs, ['chromaBoost']);
      const validated: DarkModeInversionConfig = {
        stepName: c.stepName as string,
        chromaBoost: c.chromaBoost as number,
        ...(tokenRefs && { $tokenRefs: tokenRefs }),
      };
      return { validated };
    }
    case 'contrastCheck': {
      if (typeof c.backgroundHex !== 'string') return { error: 'contrastCheck config requires "backgroundHex" as string' };
      if (!Array.isArray(c.steps) || !c.steps.every((s: unknown) => isObj(s) && typeof s.name === 'string' && typeof s.hex === 'string'))
        return { error: 'contrastCheck config requires "steps" as Array<{name: string, hex: string}>' };
      if (!Array.isArray(c.levels) || !c.levels.every((l: unknown) => l === 'AA' || l === 'AAA'))
        return { error: 'contrastCheck config requires "levels" as Array<"AA" | "AAA">' };
      const tokenRefs = validateTokenRefs(c.$tokenRefs, ['backgroundHex']);
      const validated: ContrastCheckConfig = {
        backgroundHex: c.backgroundHex as string,
        steps: (c.steps as Array<Record<string, unknown>>).map((s) => ({ name: s.name as string, hex: s.hex as string })),
        levels: c.levels as ('AA' | 'AAA')[],
        ...(tokenRefs && { $tokenRefs: tokenRefs }),
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
  inlineValue?: unknown;
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
  inlineValue?: unknown;
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
  fastify.get('/generators', async (_request, reply) => {
    try {
      const generators = await fastify.generatorService.getAll();
      // Compute isStale: source token's current value differs from the value at last run.
      // Only set for generators that have run at least once and have a sourceToken.
      return await Promise.all(generators.map(async (gen) => {
        if (!gen.sourceToken || gen.lastRunAt === undefined) return gen;
        const resolved = await fastify.tokenStore.resolveToken(gen.sourceToken).catch(() => null);
        if (resolved === null) return gen;
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
    let validatedInputTable: InputTable | undefined;
    if (inputTable !== undefined) {
      const inputTableResult = validateInputTable(inputTable);
      if (inputTableResult.error) {
        return reply.status(400).send({ error: inputTableResult.error });
      }
      validatedInputTable = inputTableResult.validated;
    }
    return withLock(async () => {
      try {
        const before = await snapshotGroup(fastify.tokenStore, targetSet, targetGroup);
        const generator = await fastify.generatorService.create({
          type: type as GeneratorType,
          sourceToken: sourceToken ?? undefined,
          inlineValue: inlineValue ?? undefined,
          targetSet,
          targetGroup,
          name: (name || (sourceToken ? `${sourceToken} ${type}` : type)) as string,
          config: configResult.validated,
          overrides,
          inputTable: validatedInputTable,
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
          inlineValue: body.inlineValue,
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
        if (typeof body.enabled === 'boolean') updates.enabled = body.enabled;
        if (typeof body.sourceToken === 'string') updates.sourceToken = body.sourceToken;
        if (typeof body.targetSet === 'string') updates.targetSet = body.targetSet;
        if (typeof body.targetGroup === 'string') updates.targetGroup = body.targetGroup;
        if (typeof body.targetSetTemplate === 'string') updates.targetSetTemplate = body.targetSetTemplate;
        if (body.inlineValue !== undefined) updates.inlineValue = body.inlineValue;
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
        if (body.inputTable !== undefined) {
          const inputTableResult = validateInputTable(body.inputTable);
          if (inputTableResult.error) {
            return reply.status(400).send({ error: inputTableResult.error });
          }
          updates.inputTable = inputTableResult.validated;
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
        const generatorBefore = { ...existing };
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
