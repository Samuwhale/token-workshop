import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type {
  GeneratorType,
  GeneratorConfig,
  TokenGenerator,
  GeneratorSemanticLayer,
  SemanticTokenMapping,
  GeneratedTokenResult,
  TokenType,
  Token,
  ColorRampConfig,
  TypeScaleConfig,
  SpacingScaleConfig,
  OpacityScaleConfig,
  BorderRadiusScaleConfig,
  ZIndexScaleConfig,
  ShadowScaleConfig,
  CustomScaleConfig,
  DarkModeInversionConfig,
  DimensionUnit,
} from "@tokenmanager/core";
import {
  DIMENSION_UNITS,
  evalExpr,
  runColorRampGenerator,
  runTypeScaleGenerator,
  runSpacingScaleGenerator,
  runOpacityScaleGenerator,
  runBorderRadiusScaleGenerator,
  runZIndexScaleGenerator,
  runShadowScaleGenerator,
  runCustomScaleGenerator,
  runDarkModeInversionGenerator,
  applyOverrides,
  getGeneratorManagedOutputPaths,
  stableStringify,
  substituteVars,
  tokenChangesAcrossModesInCollection,
  validateStepName,
} from "@tokenmanager/core";
import type { TokenStore } from "./token-store.js";
import type { TokenPathRename } from "./operation-log.js";
import { NotFoundError, BadRequestError, ConflictError } from "../errors.js";
import { expectJsonObject, formatJsonFilePath, parseJsonFile } from "../utils/json-file.js";
import { PromiseChainLock } from "../utils/promise-chain-lock.js";
import { validateTokenPath } from "./token-tree-utils.js";

interface GeneratorsFile {
  $generators: TokenGenerator[];
}

const VALID_GENERATOR_TYPES = [
  "colorRamp",
  "typeScale",
  "spacingScale",
  "opacityScale",
  "borderRadiusScale",
  "zIndexScale",
  "shadowScale",
  "customScale",
  "darkModeInversion",
] as const satisfies readonly GeneratorType[];

const VALID_GENERATOR_TYPE_SET = new Set<GeneratorType>(VALID_GENERATOR_TYPES);

export type GeneratorCreateInput = Omit<
  TokenGenerator,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "type"
  | "config"
  | "overrides"
  | "semanticLayer"
> & {
  type: unknown;
  config?: unknown;
  overrides?: unknown;
  semanticLayer?: unknown;
};

export type GeneratorUpdateInput = Partial<
  Omit<
    TokenGenerator,
    | "id"
    | "createdAt"
    | "type"
    | "config"
    | "overrides"
    | "semanticLayer"
  >
> & {
  type?: unknown;
  config?: unknown;
  overrides?: unknown;
  semanticLayer?: unknown;
};

export type GeneratorPreviewInput = Pick<
  TokenGenerator,
  | "sourceToken"
  | "inlineValue"
  | "targetGroup"
  | "targetCollection"
  | "semanticLayer"
> & {
  type: unknown;
  config?: unknown;
  overrides?: unknown;
  baseGeneratorId?: unknown;
  detachedPaths?: unknown;
};

export interface GeneratorPreviewChangeEntry {
  path: string;
  collectionId: string;
  type: string;
  currentValue: unknown;
  newValue: unknown;
  changesValue: boolean;
}

export interface GeneratorPreviewOverwriteEntry
  extends GeneratorPreviewChangeEntry {
  owner: "manual" | "generator";
  generatorId?: string;
}

export interface GeneratorPreviewManualConflictEntry
  extends GeneratorPreviewChangeEntry {
  baselineValue: unknown;
}

export interface GeneratorPreviewDeletedEntry {
  path: string;
  collectionId: string;
  type: string;
  currentValue: unknown;
}

export interface GeneratorPreviewDetachedEntry {
  path: string;
  collectionId: string;
  type: string;
  currentValue: unknown;
  newValue?: unknown;
  state: "preserved" | "recreated";
}

export interface GeneratorPreviewManualExceptionEntry {
  path: string;
  collectionId: string;
  type: string;
  currentValue?: unknown;
  newValue?: unknown;
  state: "created" | "preserved" | "invalidated";
}

export interface GeneratorPreviewAnalysis {
  fingerprint: string;
  safeCreateCount: number;
  unchangedCount: number;
  existingPathSet: string[];
  safeUpdates: GeneratorPreviewChangeEntry[];
  nonGeneratorOverwrites: GeneratorPreviewOverwriteEntry[];
  manualEditConflicts: GeneratorPreviewManualConflictEntry[];
  deletedOutputs: GeneratorPreviewDeletedEntry[];
  detachedOutputs: GeneratorPreviewDetachedEntry[];
  manualExceptions: GeneratorPreviewManualExceptionEntry[];
  diff: {
    created: Array<{ path: string; value: unknown; type: string }>;
    updated: Array<{
      path: string;
      currentValue: unknown;
      newValue: unknown;
      type: string;
    }>;
    unchanged: Array<{ path: string; value: unknown; type: string }>;
    deleted: Array<{ path: string; currentValue: unknown; type: string }>;
  };
}

export interface GeneratorPreviewResult {
  tokens: GeneratedTokenResult[];
  analysis: GeneratorPreviewAnalysis;
}

export interface GeneratorCollectionDependencyMeta {
  id: string;
  name: string;
  targetCollection: string;
  targetGroup: string;
}

export interface OrphanedGeneratorToken {
  collectionId: string;
  path: string;
  generatorId: string;
}

export interface DetachedGeneratorResult {
  generator: TokenGenerator;
  detachedPaths: string[];
  detachedCount: number;
}

export type GeneratorDashboardStatus =
  | "upToDate"
  | "stale"
  | "failed"
  | "blocked"
  | "neverRun"
  | "paused";

export interface GeneratorDashboardDependency {
  id: string;
  name: string;
  targetCollection: string;
  targetGroup: string;
  status: GeneratorDashboardStatus;
}

export interface GeneratorLastRunSummary {
  status: GeneratorDashboardStatus;
  label: string;
  at?: string;
  message?: string;
}

export interface GeneratorDashboardItem extends TokenGenerator {
  isStale?: boolean;
  staleReason?: string;
  upstreamGenerators: GeneratorDashboardDependency[];
  downstreamGenerators: GeneratorDashboardDependency[];
  blockedByGenerators: GeneratorDashboardDependency[];
  lastRunSummary: GeneratorLastRunSummary;
}

export type GeneratorPathRenameUpdate =
  | ({ scope: "token" } & TokenPathRename)
  | ({ scope: "group" } & TokenPathRename);

type GeneratorExecutionInput = {
  type: TokenGenerator["type"];
  sourceToken?: TokenGenerator["sourceToken"];
  inlineValue?: TokenGenerator["inlineValue"];
  targetGroup: TokenGenerator["targetGroup"];
  config: TokenGenerator["config"];
  overrides?: TokenGenerator["overrides"];
  detachedPaths?: TokenGenerator["detachedPaths"];
};

function getGeneratorDashboardStatus(
  generator: TokenGenerator,
  isStale: boolean,
): GeneratorDashboardStatus {
  if (generator.enabled === false) return "paused";
  if (generator.lastRunError?.blockedBy) return "blocked";
  if (generator.lastRunError) return "failed";
  if (isStale) return "stale";
  if (!generator.lastRunAt) return "neverRun";
  return "upToDate";
}

function getGeneratorStatusLabel(status: GeneratorDashboardStatus): string {
  switch (status) {
    case "paused":
      return "Keep updated off";
    case "blocked":
      return "Blocked by upstream";
    case "failed":
      return "Run failed";
    case "stale":
      return "Needs re-run";
    case "neverRun":
      return "Never run";
    case "upToDate":
    default:
      return "Up to date";
  }
}

function buildGeneratorDependency(
  generator: TokenGenerator,
  status: GeneratorDashboardStatus,
): GeneratorDashboardDependency {
  return {
    id: generator.id,
    name: generator.name,
    targetCollection: generator.targetCollection,
    targetGroup: generator.targetGroup,
    status,
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function validateTokenRefs<K extends string>(
  raw: unknown,
  allowedFields: readonly K[],
): Partial<Record<K, string>> | undefined {
  if (!isObj(raw)) return undefined;
  const result: Partial<Record<K, string>> = {};
  for (const field of allowedFields) {
    const val = raw[field];
    if (typeof val === "string" && val.trim() !== "") {
      result[field] = val;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function findDuplicateStepName(
  steps: Array<{ name: string }>,
): string | undefined {
  const seen = new Set<string>();
  for (const step of steps) {
    if (seen.has(step.name)) return step.name;
    seen.add(step.name);
  }
  return undefined;
}

function validateFormulaSyntax(formula: string): string | undefined {
  const dummyVars: Record<string, number> = {
    base: 1,
    index: 1,
    multiplier: 1,
    prev: 1,
  };
  try {
    const substituted = substituteVars(formula, dummyVars);
    evalExpr(substituted);
    return undefined;
  } catch (err) {
    return `customScale formula syntax error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function normalizeGeneratorType(rawType: unknown): GeneratorType {
  if (
    typeof rawType !== "string" ||
    !VALID_GENERATOR_TYPE_SET.has(rawType as GeneratorType)
  ) {
    throw new BadRequestError(
      `Unknown generator type "${String(rawType)}". Valid types: ${VALID_GENERATOR_TYPES.join(", ")}`,
    );
  }
  return rawType as GeneratorType;
}

function normalizeOverrides(
  raw: unknown,
): TokenGenerator["overrides"] | undefined {
  if (!isObj(raw)) return undefined;
  const overrides: NonNullable<TokenGenerator["overrides"]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isObj(value) && typeof value.locked === "boolean") {
      overrides[key] = { value: value.value, locked: value.locked };
    }
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function normalizeSemanticTokenMapping(raw: unknown): SemanticTokenMapping {
  if (!isObj(raw)) {
    throw new BadRequestError("semanticLayer.mappings items must be objects");
  }
  if (typeof raw.semantic !== "string" || raw.semantic.trim() === "") {
    throw new BadRequestError(
      "semanticLayer.mappings[].semantic must be a non-empty string",
    );
  }
  if (typeof raw.step !== "string" || raw.step.trim() === "") {
    throw new BadRequestError(
      "semanticLayer.mappings[].step must be a non-empty string",
    );
  }
  return {
    semantic: raw.semantic.trim(),
    step: raw.step.trim(),
  };
}

function normalizeSemanticLayer(raw: unknown): GeneratorSemanticLayer | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isObj(raw)) {
    throw new BadRequestError("semanticLayer must be an object");
  }
  if (typeof raw.prefix !== "string" || raw.prefix.trim() === "") {
    throw new BadRequestError("semanticLayer.prefix must be a non-empty string");
  }
  if (!Array.isArray(raw.mappings)) {
    throw new BadRequestError("semanticLayer.mappings must be an array");
  }
  const mappings = raw.mappings.map(normalizeSemanticTokenMapping);
  if (mappings.length === 0) return undefined;
  return {
    prefix: raw.prefix.trim(),
    mappings,
    ...(typeof raw.patternId === "string" || raw.patternId === null
      ? { patternId: raw.patternId ?? null }
      : {}),
  };
}

function normalizeLastRunError(
  raw: unknown,
): TokenGenerator["lastRunError"] | undefined {
  if (raw === undefined) return undefined;
  if (
    !isObj(raw) ||
    typeof raw.message !== "string" ||
    typeof raw.at !== "string"
  ) {
    throw new BadRequestError(
      'lastRunError must contain string "message" and "at" fields',
    );
  }
  return {
    message: raw.message,
    at: raw.at,
    ...(typeof raw.blockedBy === "string" ? { blockedBy: raw.blockedBy } : {}),
  };
}

function normalizeDetachedPaths(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) {
    throw new BadRequestError("detachedPaths must be an array");
  }
  const detachedPaths = [...new Set(
    raw.map((value, index) => {
      if (typeof value !== "string" || value.trim() === "") {
        throw new BadRequestError(
          `detachedPaths[${index}] must be a non-empty string`,
        );
      }
      const path = value.trim();
      validateTokenPath(path);
      return path;
    }),
  )].sort();
  return detachedPaths.length > 0 ? detachedPaths : undefined;
}

function normalizeGeneratorConfig(
  type: GeneratorType,
  config: unknown,
): GeneratorConfig {
  if (config !== undefined && !isObj(config)) {
    throw new BadRequestError('"config" must be an object');
  }
  const c = (config ?? {}) as Record<string, unknown>;

  switch (type) {
    case "colorRamp": {
      if (
        !Array.isArray(c.steps) ||
        c.steps.length === 0 ||
        !c.steps.every((step: unknown) => isFiniteNum(step))
      ) {
        throw new BadRequestError(
          'colorRamp config requires "steps" as non-empty finite number[]',
        );
      }
      if (!isFiniteNum(c.lightEnd))
        throw new BadRequestError(
          'colorRamp config requires "lightEnd" as finite number',
        );
      if (c.lightEnd < 0 || c.lightEnd > 100)
        throw new BadRequestError(
          'colorRamp config "lightEnd" must be between 0 and 100',
        );
      if (!isFiniteNum(c.darkEnd))
        throw new BadRequestError(
          'colorRamp config requires "darkEnd" as finite number',
        );
      if (c.darkEnd < 0 || c.darkEnd > 100)
        throw new BadRequestError(
          'colorRamp config "darkEnd" must be between 0 and 100',
        );
      if (c.lightEnd <= c.darkEnd)
        throw new BadRequestError(
          'colorRamp config "lightEnd" must be greater than "darkEnd"',
        );
      if (!isFiniteNum(c.chromaBoost))
        throw new BadRequestError(
          'colorRamp config requires "chromaBoost" as finite number',
        );
      if (c.chromaBoost < 0)
        throw new BadRequestError(
          'colorRamp config "chromaBoost" must be >= 0',
        );
      if (typeof c.includeSource !== "boolean")
        throw new BadRequestError(
          'colorRamp config requires "includeSource" as boolean',
        );
      if (c.lightnessCurve !== undefined) {
        if (
          !Array.isArray(c.lightnessCurve) ||
          c.lightnessCurve.length !== 4 ||
          !c.lightnessCurve.every((value: unknown) => isFiniteNum(value))
        ) {
          throw new BadRequestError(
            'colorRamp config "lightnessCurve" must be [number, number, number, number]',
          );
        }
        const lightnessCurve = c.lightnessCurve as number[];
        if (
          lightnessCurve[0] < 0 ||
          lightnessCurve[0] > 1 ||
          lightnessCurve[2] < 0 ||
          lightnessCurve[2] > 1
        ) {
          throw new BadRequestError(
            'colorRamp config "lightnessCurve" control point x values must be in [0, 1]',
          );
        }
      }
      const tokenRefs = validateTokenRefs(c.$tokenRefs, [
        "lightEnd",
        "darkEnd",
        "chromaBoost",
      ]);
      return {
        steps: c.steps as number[],
        lightEnd: c.lightEnd as number,
        darkEnd: c.darkEnd as number,
        chromaBoost: c.chromaBoost as number,
        includeSource: c.includeSource as boolean,
        ...(c.lightnessCurve !== undefined && {
          lightnessCurve: c.lightnessCurve as [number, number, number, number],
        }),
        ...(isFiniteNum(c.sourceStep) && { sourceStep: c.sourceStep }),
        ...(tokenRefs && { $tokenRefs: tokenRefs }),
      } satisfies ColorRampConfig;
    }
    case "typeScale": {
      if (
        !Array.isArray(c.steps) ||
        c.steps.length === 0 ||
        !c.steps.every(
          (step: unknown) =>
            isObj(step) &&
            typeof step.name === "string" &&
            isFiniteNum(step.exponent),
        )
      ) {
        throw new BadRequestError(
          'typeScale config requires "steps" as non-empty Array<{name: string, exponent: number}>',
        );
      }
      const duplicate = findDuplicateStepName(
        c.steps as Array<{ name: string }>,
      );
      if (duplicate !== undefined)
        throw new BadRequestError(
          `typeScale config has duplicate step name: "${duplicate}"`,
        );
      if (!isFiniteNum(c.ratio))
        throw new BadRequestError(
          'typeScale config requires "ratio" as finite number',
        );
      if (c.ratio <= 0)
        throw new BadRequestError('typeScale config "ratio" must be > 0');
      if (!DIMENSION_UNITS.includes(c.unit as DimensionUnit)) {
        throw new BadRequestError(
          'typeScale config requires "unit" as a valid CSS dimension unit (e.g. "px", "rem", "em")',
        );
      }
      if (typeof c.baseStep !== "string")
        throw new BadRequestError(
          'typeScale config requires "baseStep" as string',
        );
      const stepNames = (c.steps as Array<{ name: string }>).map(
        (step) => step.name,
      );
      if (!stepNames.includes(c.baseStep)) {
        throw new BadRequestError(
          `typeScale config "baseStep" ("${c.baseStep}") must match one of the defined step names: ${stepNames.join(", ")}`,
        );
      }
      if (!isFiniteNum(c.roundTo))
        throw new BadRequestError(
          'typeScale config requires "roundTo" as finite number',
        );
      if (c.roundTo < 0)
        throw new BadRequestError('typeScale config "roundTo" must be >= 0');
      const tokenRefs = validateTokenRefs(c.$tokenRefs, ["ratio"]);
      return {
        steps: (c.steps as Array<Record<string, unknown>>).map((step) => ({
          name: step.name as string,
          exponent: step.exponent as number,
        })),
        ratio: c.ratio as number,
        unit: c.unit as DimensionUnit,
        baseStep: c.baseStep as string,
        roundTo: c.roundTo as number,
        ...(tokenRefs && { $tokenRefs: tokenRefs }),
      } satisfies TypeScaleConfig;
    }
    case "spacingScale": {
      if (
        !Array.isArray(c.steps) ||
        c.steps.length === 0 ||
        !c.steps.every(
          (step: unknown) =>
            isObj(step) &&
            typeof step.name === "string" &&
            isFiniteNum(step.multiplier),
        )
      ) {
        throw new BadRequestError(
          'spacingScale config requires "steps" as non-empty Array<{name: string, multiplier: number}>',
        );
      }
      const duplicate = findDuplicateStepName(
        c.steps as Array<{ name: string }>,
      );
      if (duplicate !== undefined)
        throw new BadRequestError(
          `spacingScale config has duplicate step name: "${duplicate}"`,
        );
      if (!DIMENSION_UNITS.includes(c.unit as DimensionUnit)) {
        throw new BadRequestError(
          'spacingScale config requires "unit" as a valid CSS dimension unit (e.g. "px", "rem", "em")',
        );
      }
      return {
        steps: (c.steps as Array<Record<string, unknown>>).map((step) => ({
          name: step.name as string,
          multiplier: step.multiplier as number,
        })),
        unit: c.unit as DimensionUnit,
      } satisfies SpacingScaleConfig;
    }
    case "opacityScale": {
      if (
        !Array.isArray(c.steps) ||
        c.steps.length === 0 ||
        !c.steps.every(
          (step: unknown) =>
            isObj(step) &&
            typeof step.name === "string" &&
            isFiniteNum(step.value),
        )
      ) {
        throw new BadRequestError(
          'opacityScale config requires "steps" as non-empty Array<{name: string, value: number}>',
        );
      }
      const duplicate = findDuplicateStepName(
        c.steps as Array<{ name: string }>,
      );
      if (duplicate !== undefined)
        throw new BadRequestError(
          `opacityScale config has duplicate step name: "${duplicate}"`,
        );
      for (let i = 0; i < c.steps.length; i++) {
        const value = (c.steps[i] as Record<string, unknown>).value as number;
        if (value < 0 || value > 100) {
          throw new BadRequestError(
            `opacityScale config steps[${i}].value must be between 0 and 100`,
          );
        }
      }
      return {
        steps: (c.steps as Array<Record<string, unknown>>).map((step) => ({
          name: step.name as string,
          value: step.value as number,
        })),
      } satisfies OpacityScaleConfig;
    }
    case "borderRadiusScale": {
      if (
        !Array.isArray(c.steps) ||
        c.steps.length === 0 ||
        !c.steps.every(
          (step: unknown) =>
            isObj(step) &&
            typeof step.name === "string" &&
            isFiniteNum(step.multiplier),
        )
      ) {
        throw new BadRequestError(
          'borderRadiusScale config requires "steps" as non-empty Array<{name: string, multiplier: number}>',
        );
      }
      const duplicate = findDuplicateStepName(
        c.steps as Array<{ name: string }>,
      );
      if (duplicate !== undefined)
        throw new BadRequestError(
          `borderRadiusScale config has duplicate step name: "${duplicate}"`,
        );
      if (!DIMENSION_UNITS.includes(c.unit as DimensionUnit)) {
        throw new BadRequestError(
          'borderRadiusScale config requires "unit" as a valid CSS dimension unit (e.g. "px", "rem", "em")',
        );
      }
      return {
        steps: (c.steps as Array<Record<string, unknown>>).map((step) => ({
          name: step.name as string,
          multiplier: step.multiplier as number,
          ...(isFiniteNum(step.exactValue) && { exactValue: step.exactValue }),
        })),
        unit: c.unit as DimensionUnit,
      } satisfies BorderRadiusScaleConfig;
    }
    case "zIndexScale": {
      if (
        !Array.isArray(c.steps) ||
        c.steps.length === 0 ||
        !c.steps.every(
          (step: unknown) =>
            isObj(step) &&
            typeof step.name === "string" &&
            isFiniteNum(step.value),
        )
      ) {
        throw new BadRequestError(
          'zIndexScale config requires "steps" as non-empty Array<{name: string, value: number}>',
        );
      }
      const duplicate = findDuplicateStepName(
        c.steps as Array<{ name: string }>,
      );
      if (duplicate !== undefined)
        throw new BadRequestError(
          `zIndexScale config has duplicate step name: "${duplicate}"`,
        );
      return {
        steps: (c.steps as Array<Record<string, unknown>>).map((step) => ({
          name: step.name as string,
          value: step.value as number,
        })),
      } satisfies ZIndexScaleConfig;
    }
    case "shadowScale": {
      if (typeof c.color !== "string")
        throw new BadRequestError(
          'shadowScale config requires "color" as string',
        );
      if (
        !Array.isArray(c.steps) ||
        c.steps.length === 0 ||
        !c.steps.every(
          (step: unknown) =>
            isObj(step) &&
            typeof step.name === "string" &&
            isFiniteNum(step.offsetX) &&
            isFiniteNum(step.offsetY) &&
            isFiniteNum(step.blur) &&
            isFiniteNum(step.spread) &&
            isFiniteNum(step.opacity),
        )
      ) {
        throw new BadRequestError(
          'shadowScale config requires "steps" as non-empty Array<{name, offsetX, offsetY, blur, spread, opacity}>',
        );
      }
      const duplicate = findDuplicateStepName(
        c.steps as Array<{ name: string }>,
      );
      if (duplicate !== undefined)
        throw new BadRequestError(
          `shadowScale config has duplicate step name: "${duplicate}"`,
        );
      for (let i = 0; i < c.steps.length; i++) {
        const step = c.steps[i] as Record<string, unknown>;
        const opacity = step.opacity as number;
        if (opacity < 0 || opacity > 1)
          throw new BadRequestError(
            `shadowScale config steps[${i}].opacity must be between 0 and 1`,
          );
        const blur = step.blur as number;
        if (blur < 0)
          throw new BadRequestError(
            `shadowScale config steps[${i}].blur must be >= 0`,
          );
      }
      const tokenRefs = validateTokenRefs(c.$tokenRefs, ["color"]);
      return {
        color: c.color as string,
        steps: (c.steps as Array<Record<string, unknown>>).map((step) => ({
          name: step.name as string,
          offsetX: step.offsetX as number,
          offsetY: step.offsetY as number,
          blur: step.blur as number,
          spread: step.spread as number,
          opacity: step.opacity as number,
        })),
        ...(tokenRefs && { $tokenRefs: tokenRefs }),
      } satisfies ShadowScaleConfig;
    }
    case "customScale": {
      if (typeof c.outputType !== "string")
        throw new BadRequestError(
          'customScale config requires "outputType" as string',
        );
      if (
        !Array.isArray(c.steps) ||
        c.steps.length === 0 ||
        !c.steps.every(
          (step: unknown) =>
            isObj(step) &&
            typeof step.name === "string" &&
            isFiniteNum(step.index),
        )
      ) {
        throw new BadRequestError(
          'customScale config requires "steps" as non-empty Array<{name: string, index: number}>',
        );
      }
      const duplicate = findDuplicateStepName(
        c.steps as Array<{ name: string }>,
      );
      if (duplicate !== undefined)
        throw new BadRequestError(
          `customScale config has duplicate step name: "${duplicate}"`,
        );
      if (typeof c.formula !== "string")
        throw new BadRequestError(
          'customScale config requires "formula" as string',
        );
      const formulaError = validateFormulaSyntax(c.formula);
      if (formulaError !== undefined) throw new BadRequestError(formulaError);
      if (!isFiniteNum(c.roundTo))
        throw new BadRequestError(
          'customScale config requires "roundTo" as finite number',
        );
      if (c.roundTo < 0)
        throw new BadRequestError('customScale config "roundTo" must be >= 0');
      return {
        outputType: c.outputType as TokenType,
        steps: (c.steps as Array<Record<string, unknown>>).map((step) => ({
          name: step.name as string,
          index: step.index as number,
          ...(isFiniteNum(step.multiplier) && { multiplier: step.multiplier }),
        })),
        formula: c.formula as string,
        roundTo: c.roundTo as number,
        ...(DIMENSION_UNITS.includes(c.unit as DimensionUnit)
          ? { unit: c.unit as DimensionUnit }
          : {}),
      } satisfies CustomScaleConfig;
    }
    case "darkModeInversion": {
      if (typeof c.stepName !== "string")
        throw new BadRequestError(
          'darkModeInversion config requires "stepName" as string',
        );
      if (!isFiniteNum(c.chromaBoost))
        throw new BadRequestError(
          'darkModeInversion config requires "chromaBoost" as finite number',
        );
      if (c.chromaBoost < 0)
        throw new BadRequestError(
          'darkModeInversion config "chromaBoost" must be >= 0',
        );
      const tokenRefs = validateTokenRefs(c.$tokenRefs, ["chromaBoost"]);
      return {
        stepName: c.stepName as string,
        chromaBoost: c.chromaBoost as number,
        ...(tokenRefs && { $tokenRefs: tokenRefs }),
      } satisfies DarkModeInversionConfig;
    }
  }
}

function normalizeStoredGenerator(raw: unknown): TokenGenerator {
  if (!isObj(raw)) throw new BadRequestError("entry is not an object");
  if (typeof raw.id !== "string" || raw.id === "")
    throw new BadRequestError('missing or invalid "id"');
  if (typeof raw.name !== "string")
    throw new BadRequestError('missing or invalid "name"');
  if (typeof raw.targetCollection !== "string")
    throw new BadRequestError('missing or invalid "targetCollection"');
  if (typeof raw.targetGroup !== "string")
    throw new BadRequestError('missing or invalid "targetGroup"');
  if (typeof raw.createdAt !== "string")
    throw new BadRequestError('missing or invalid "createdAt"');
  if (typeof raw.updatedAt !== "string")
    throw new BadRequestError('missing or invalid "updatedAt"');
  if (raw.sourceToken !== undefined && typeof raw.sourceToken !== "string") {
    throw new BadRequestError("sourceToken must be a string when provided");
  }
  if (raw.enabled !== undefined && typeof raw.enabled !== "boolean") {
    throw new BadRequestError("enabled must be a boolean when provided");
  }
  if (raw.lastRunAt !== undefined && typeof raw.lastRunAt !== "string") {
    throw new BadRequestError("lastRunAt must be a string when provided");
  }

  const type = normalizeGeneratorType(raw.type);
  const overrides = normalizeOverrides(raw.overrides);
  const semanticLayer = normalizeSemanticLayer(raw.semanticLayer);
  const detachedPaths = normalizeDetachedPaths(raw.detachedPaths);
  const lastRunError = normalizeLastRunError(raw.lastRunError);
  return {
    id: raw.id,
    type,
    name: raw.name,
    ...(raw.sourceToken !== undefined && { sourceToken: raw.sourceToken }),
    ...(raw.inlineValue !== undefined && { inlineValue: raw.inlineValue }),
    targetCollection: raw.targetCollection,
    targetGroup: raw.targetGroup,
    config: normalizeGeneratorConfig(type, raw.config),
    ...(semanticLayer && { semanticLayer }),
    ...(detachedPaths && { detachedPaths }),
    ...(overrides && { overrides }),
    ...(raw.enabled !== undefined && { enabled: raw.enabled }),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    ...(raw.lastRunAt !== undefined && { lastRunAt: raw.lastRunAt }),
    ...(raw.lastRunSourceValue !== undefined && {
      lastRunSourceValue: raw.lastRunSourceValue,
    }),
    ...(lastRunError && { lastRunError }),
  };
}

export class GeneratorService {
  private dir: string;
  private generators: Map<string, TokenGenerator> = new Map();
  /** Per-generator promise chain — serializes concurrent executions instead of skipping them. */
  private generatorLocks = new Map<string, Promise<void>>();
  /** Promise-chain mutex — serializes all saveGenerators() calls to prevent file-rename races. */
  private saveLock = new PromiseChainLock();
  private writingFiles = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(dir: string) {
    this.dir = path.resolve(dir);
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await this.loadGenerators();
  }

  private get filePath(): string {
    return path.join(this.dir, "$generators.json");
  }

  private async loadGenerators(): Promise<void> {
    try {
      this.generators = await this.readGeneratorsFromDisk();
      this.pruneGeneratorLocks();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        // File doesn't exist yet — perfectly normal on first run
        this.generators.clear();
        return;
      }
      throw err;
    }
  }

  async reloadFromDisk(): Promise<"changed" | "removed" | "unchanged"> {
    try {
      const nextGenerators = await this.readGeneratorsFromDisk();
      const prevSerialized = stableStringify(
        Array.from(this.generators.values()),
      );
      const nextSerialized = stableStringify(
        Array.from(nextGenerators.values()),
      );
      this.generators = nextGenerators;
      this.pruneGeneratorLocks();
      return prevSerialized === nextSerialized ? "unchanged" : "changed";
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        const hadGenerators = this.generators.size > 0;
        this.generators.clear();
        this.generatorLocks.clear();
        return hadGenerators ? "removed" : "unchanged";
      }
      throw err;
    }
  }

  startWriteGuard(absoluteFilePath: string): void {
    const existing = this.writingFiles.get(absoluteFilePath);
    if (existing) clearTimeout(existing);
    this.writingFiles.set(
      absoluteFilePath,
      setTimeout(() => this.writingFiles.delete(absoluteFilePath), 30_000),
    );
  }

  endWriteGuard(absoluteFilePath: string): void {
    const timer = this.writingFiles.get(absoluteFilePath);
    if (timer) clearTimeout(timer);
    this.writingFiles.delete(absoluteFilePath);
  }

  consumeWriteGuard(absoluteFilePath: string): boolean {
    if (!this.writingFiles.has(absoluteFilePath)) return false;
    this.endWriteGuard(absoluteFilePath);
    return true;
  }

  private saveGenerators(): Promise<void> {
    return this.saveLock.withLock(() => this._doSave());
  }

  private async _doSave(): Promise<void> {
    const data: GeneratorsFile = {
      $generators: Array.from(this.generators.values()),
    };
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    this.startWriteGuard(this.filePath);
    try {
      await fs.rename(tmp, this.filePath);
    } catch (err) {
      this.endWriteGuard(this.filePath);
      await fs.unlink(tmp).catch(() => {});
      throw err;
    }
  }

  async getAll(): Promise<TokenGenerator[]> {
    return Array.from(this.generators.values());
  }

  private async getCollectionModeCounts(
    collectionLookup: {
      getCollectionsOverview(): Promise<{
        collections: Array<{ id: string; modes: Array<{ name: string }> }>;
      }>;
    },
  ): Promise<Map<string, number>> {
    const overview = await collectionLookup.getCollectionsOverview();
    return new Map(
      overview.collections.map((collection) => [
        collection.id,
        collection.modes.length,
      ]),
    );
  }

  private async getKeepUpdatedDisabledReason(
    sourceToken: string | undefined,
    tokenStore: Pick<TokenStore, "getTokenDefinitions">,
    collectionModeCounts: Map<string, number>,
  ): Promise<string | null> {
    if (!sourceToken) {
      return "Keep updated is unavailable because this generated group has no source token.";
    }
    const sourceDefinitions = tokenStore.getTokenDefinitions(sourceToken);
    if (sourceDefinitions.length === 0) {
      return null;
    }
    for (const { collectionId, token } of sourceDefinitions) {
      const collectionModeCount = collectionModeCounts.get(collectionId) ?? 0;
      if (collectionModeCount <= 1) {
        continue;
      }
      if (tokenChangesAcrossModesInCollection(token, collectionId)) {
        return `Keep updated is unavailable because source token "${sourceToken}" changes across modes. Rerun from the current view so the active mode stays explicit.`;
      }
    }
    return null;
  }

  async assertKeepUpdatedSupported(
    generator: Pick<TokenGenerator, "enabled" | "sourceToken">,
    tokenStore: Pick<TokenStore, "getTokenDefinitions">,
    collectionLookup: {
      getCollectionsOverview(): Promise<{
        collections: Array<{ id: string; modes: Array<{ name: string }> }>;
      }>;
    },
  ): Promise<void> {
    if (generator.enabled === false) {
      return;
    }
    const collectionModeCounts =
      await this.getCollectionModeCounts(collectionLookup);
    const disabledReason = await this.getKeepUpdatedDisabledReason(
      generator.sourceToken,
      tokenStore,
      collectionModeCounts,
    );
    if (disabledReason) {
      throw new BadRequestError(disabledReason);
    }
  }

  async disableUnsupportedKeepUpdated(
    tokenStore: Pick<TokenStore, "getTokenDefinitions">,
    collectionLookup: {
      getCollectionsOverview(): Promise<{
        collections: Array<{ id: string; modes: Array<{ name: string }> }>;
      }>;
    },
  ): Promise<number> {
    const collectionModeCounts =
      await this.getCollectionModeCounts(collectionLookup);
    let changed = 0;
    for (const generator of this.generators.values()) {
      if (generator.enabled === false) {
        continue;
      }
      const disabledReason = await this.getKeepUpdatedDisabledReason(
        generator.sourceToken,
        tokenStore,
        collectionModeCounts,
      );
      if (!disabledReason) {
        continue;
      }
      this.generators.set(generator.id, {
        ...generator,
        enabled: false,
        updatedAt: new Date().toISOString(),
        lastRunError: {
          message: disabledReason,
          at: new Date().toISOString(),
        },
      });
      changed += 1;
    }
    if (changed > 0) {
      await this.saveGenerators();
    }
    return changed;
  }

  async getDashboardItems(
    tokenStore: Pick<TokenStore, "resolveToken" | "getTokenDefinitions">,
    collectionLookup: {
      getCollectionsOverview(): Promise<{
        collections: Array<{ id: string; modes: Array<{ name: string }> }>;
      }>;
    },
  ): Promise<GeneratorDashboardItem[]> {
    const generators = Array.from(this.generators.values());
    const collectionModeCounts =
      await this.getCollectionModeCounts(collectionLookup);
    const upstreamIdsByGenerator = new Map<string, string[]>();
    const downstreamIdsByGenerator = new Map<string, string[]>();

    for (const generator of generators) {
      upstreamIdsByGenerator.set(generator.id, []);
      downstreamIdsByGenerator.set(generator.id, []);
    }

    for (const downstream of generators) {
      if (!downstream.sourceToken) continue;
      for (const upstream of generators) {
        if (upstream.id === downstream.id) continue;
        if (!downstream.sourceToken.startsWith(`${upstream.targetGroup}.`)) {
          continue;
        }
        upstreamIdsByGenerator.get(downstream.id)?.push(upstream.id);
        downstreamIdsByGenerator.get(upstream.id)?.push(downstream.id);
      }
    }

    const staleEntries = await Promise.all(
      generators.map(async (generator) => {
        if (!generator.sourceToken) {
          return { id: generator.id, isStale: false, staleReason: undefined };
        }
        if (!generator.lastRunAt) {
          return { id: generator.id, isStale: false, staleReason: undefined };
        }
        const keepUpdatedDisabledReason =
          generator.enabled === false
            ? await this.getKeepUpdatedDisabledReason(
                generator.sourceToken,
                tokenStore,
                collectionModeCounts,
              )
            : null;
        if (keepUpdatedDisabledReason) {
          return { id: generator.id, isStale: false, staleReason: undefined };
        }

        const resolved = await tokenStore.resolveToken(generator.sourceToken).catch(
          () => undefined,
        );
        if (!resolved) {
          return {
            id: generator.id,
            isStale: true,
            staleReason: `Source token "${generator.sourceToken}" no longer resolves.`,
          };
        }

        const isStale =
          stableStringify(resolved.$value) !==
          stableStringify(generator.lastRunSourceValue);
        return {
          id: generator.id,
          isStale,
          staleReason: isStale
            ? `Source token "${generator.sourceToken}" changed since the last successful run.`
            : undefined,
        };
      }),
    );

    const staleById = new Map(
      staleEntries.map((entry) => [entry.id, entry] as const),
    );
    const statusById = new Map<string, GeneratorDashboardStatus>();

    for (const generator of generators) {
      const staleEntry = staleById.get(generator.id);
      statusById.set(
        generator.id,
        getGeneratorDashboardStatus(generator, staleEntry?.isStale ?? false),
      );
    }

    const dependencyById = new Map<string, GeneratorDashboardDependency>();
    for (const generator of generators) {
      dependencyById.set(
        generator.id,
        buildGeneratorDependency(
          generator,
          statusById.get(generator.id) ?? "upToDate",
        ),
      );
    }

    return generators.map((generator) => {
      const staleEntry = staleById.get(generator.id);
      const status = statusById.get(generator.id) ?? "upToDate";
      const upstreamGenerators = (upstreamIdsByGenerator.get(generator.id) ?? [])
        .map((id) => dependencyById.get(id))
        .filter(
          (
            dependency,
          ): dependency is GeneratorDashboardDependency => dependency !== undefined,
        );
      const downstreamGenerators = (
        downstreamIdsByGenerator.get(generator.id) ?? []
      )
        .map((id) => dependencyById.get(id))
        .filter(
          (
            dependency,
          ): dependency is GeneratorDashboardDependency => dependency !== undefined,
        );

      const blockedByName = generator.lastRunError?.blockedBy?.trim();
      const blockedByGenerators =
        status === "blocked"
          ? upstreamGenerators.filter((dependency) =>
              blockedByName
                ? dependency.name === blockedByName
                : dependency.status === "failed" || dependency.status === "blocked",
            )
          : [];

      const summaryMessage =
        generator.lastRunError?.message ??
        staleEntry?.staleReason ??
        (!generator.lastRunAt ? "Run this generated group to create outputs." : undefined);

      return {
        ...generator,
        isStale: staleEntry?.isStale,
        staleReason: staleEntry?.staleReason,
        upstreamGenerators,
        downstreamGenerators,
        blockedByGenerators,
        lastRunSummary: {
          status,
          label: getGeneratorStatusLabel(status),
          at: generator.lastRunError?.at ?? generator.lastRunAt,
          message: summaryMessage,
        },
      };
    });
  }

  listCollectionDependencyMeta(): GeneratorCollectionDependencyMeta[] {
    return Array.from(this.generators.values()).map((generator) => ({
      id: generator.id,
      name: generator.name,
      targetCollection: generator.targetCollection,
      targetGroup: generator.targetGroup,
    }));
  }

  async getAllById(): Promise<Record<string, TokenGenerator>> {
    return Object.fromEntries(
      Array.from(this.generators.values()).map((generator) => [
        generator.id,
        structuredClone(generator),
      ]),
    );
  }

  async reset(): Promise<void> {
    await this.saveLock.withLock(async () => {
      this.startWriteGuard(this.filePath);
      await fs.rm(this.filePath, { force: true });
      this.generators.clear();
      this.generatorLocks.clear();
    });
  }

  private async readGeneratorsFromDisk(): Promise<Map<string, TokenGenerator>> {
    const content = await fs.readFile(this.filePath, "utf-8");
    const data = expectJsonObject(
      parseJsonFile(content, { filePath: this.filePath, relativeTo: this.dir }),
      { filePath: this.filePath, relativeTo: this.dir },
    );
    if (!Array.isArray(data.$generators)) {
      const label = formatJsonFilePath(this.filePath, this.dir);
      throw new ConflictError(
        `File "${label}" must contain a "$generators" array.`,
      );
    }
    const rawGenerators = data.$generators;
    if (
      rawGenerators.some(
        (entry) => !entry || typeof entry !== "object" || Array.isArray(entry),
      )
    ) {
      const label = formatJsonFilePath(this.filePath, this.dir);
      throw new ConflictError(
        `File "${label}" must store generator entries as objects.`,
      );
    }

    const nextGenerators = new Map<string, TokenGenerator>();
    for (const rawGenerator of rawGenerators) {
      const normalized = normalizeStoredGenerator(rawGenerator);
      nextGenerators.set(normalized.id, normalized);
    }
    return nextGenerators;
  }

  private pruneGeneratorLocks(): void {
    for (const generatorId of this.generatorLocks.keys()) {
      if (!this.generators.has(generatorId)) {
        this.generatorLocks.delete(generatorId);
      }
    }
  }

  async getById(id: string): Promise<TokenGenerator | undefined> {
    return this.generators.get(id);
  }

  findOrphanedTokens(
    tokenStore: Pick<TokenStore, "findTokensByGeneratorId">,
  ): OrphanedGeneratorToken[] {
    const activeIds = new Set(this.generators.keys());
    return tokenStore
      .findTokensByGeneratorId("*")
      .filter((token) => !activeIds.has(token.generatorId));
  }

  async deleteOrphanedTokens(
    tokenStore: Pick<TokenStore, "findTokensByGeneratorId" | "deleteTokensByGeneratorId">,
  ): Promise<{ deleted: number; tokens: OrphanedGeneratorToken[] }> {
    const tokens = this.findOrphanedTokens(tokenStore);
    const orphanIds = new Set(tokens.map((token) => token.generatorId));
    let deleted = 0;
    for (const generatorId of orphanIds) {
      deleted += await tokenStore.deleteTokensByGeneratorId(generatorId);
    }
    return { deleted, tokens };
  }

  getScaleOutputPaths(generator: TokenGenerator): string[] {
    return getGeneratorManagedOutputPaths(generator);
  }

  private filterDetachedResults(
    generator: TokenGenerator,
    results: GeneratedTokenResult[],
  ): GeneratedTokenResult[] {
    const managedPathSet = new Set(getGeneratorManagedOutputPaths(generator));
    return results.filter((result) => managedPathSet.has(result.path));
  }

  async detachOutputPaths(
    id: string,
    tokenStore: Pick<
      TokenStore,
      "findTokensByGeneratorId" | "getToken" | "updateToken"
    >,
    paths: string[],
  ): Promise<DetachedGeneratorResult> {
    const existing = this.generators.get(id);
    if (!existing) throw new NotFoundError(`Generator "${id}" not found`);
    if (paths.length === 0) {
      throw new BadRequestError("At least one token path is required");
    }

    const allowedPathSet = new Set(this.getScaleOutputPaths(existing));
    const detachedPaths = [...new Set(
      paths.map((value, index) => {
        if (typeof value !== "string" || value.trim() === "") {
          throw new BadRequestError(
            `paths[${index}] must be a non-empty string`,
          );
        }
        const path = value.trim();
        validateTokenPath(path);
        if (!allowedPathSet.has(path)) {
          throw new BadRequestError(
            `"${path}" is not an output managed by generator "${existing.name}"`,
          );
        }
        return path;
      }),
    )].sort();

    const currentDetachedPaths = existing.detachedPaths ?? [];
    const nextDetachedPaths = [
      ...new Set([...currentDetachedPaths, ...detachedPaths]),
    ].sort();

    const generatorBeforeDetach = structuredClone(existing);
    try {
      if (nextDetachedPaths.length !== currentDetachedPaths.length) {
        await this.update(id, { detachedPaths: nextDetachedPaths });
      }
      const generator = this.generators.get(id)!;

      const ownedTokens = tokenStore.findTokensByGeneratorId(id);
      for (const tokenRef of ownedTokens) {
        if (!detachedPaths.includes(tokenRef.path)) continue;
        const token = await tokenStore.getToken(tokenRef.collectionId, tokenRef.path);
        if (!token) continue;
        const extensions = {
          ...(token.$extensions ?? {}),
        } as Record<string, unknown>;
        delete extensions["com.tokenmanager.generator"];
        await tokenStore.updateToken(tokenRef.collectionId, tokenRef.path, {
          $extensions: Object.keys(extensions).length > 0 ? extensions : {},
        });
      }

      return {
        generator,
        detachedPaths,
        detachedCount: detachedPaths.length,
      };
    } catch (err) {
      if (nextDetachedPaths.length !== currentDetachedPaths.length) {
        await this.restore(generatorBeforeDetach);
      }
      throw err;
    }
  }

  async create(data: GeneratorCreateInput): Promise<TokenGenerator> {
    const now = new Date().toISOString();
    const generator = normalizeStoredGenerator({
      ...data,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    this.generators.set(generator.id, generator);
    try {
      this.buildDependencyOrder();
    } catch {
      this.generators.delete(generator.id);
      throw new BadRequestError(
        `Creating generator "${generator.name}" would introduce a circular dependency. ` +
          "Ensure no generator sources from its own output group.",
      );
    }
    try {
      await this.saveGenerators();
    } catch (err) {
      this.generators.delete(generator.id);
      throw err;
    }
    return generator;
  }

  async update(
    id: string,
    updates: GeneratorUpdateInput,
  ): Promise<TokenGenerator> {
    const existing = this.generators.get(id);
    if (!existing) throw new NotFoundError(`Generator "${id}" not found`);
    const updated = normalizeStoredGenerator({
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    });
    this.generators.set(id, updated);
    try {
      this.buildDependencyOrder();
    } catch {
      this.generators.set(id, existing);
      throw new BadRequestError(
        `Updating generator "${updated.name}" would introduce a circular dependency. ` +
          "Ensure no generator sources from its own output group.",
      );
    }
    try {
      await this.saveGenerators();
    } catch (err) {
      this.generators.set(id, existing);
      throw err;
    }
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const existing = this.generators.get(id);
    if (!existing) return false;
    this.generators.delete(id);
    try {
      await this.saveGenerators();
    } catch (err) {
      this.generators.set(id, existing);
      throw err;
    }
    return true;
  }

  /**
   * Restore (upsert) a generator from a full snapshot object.
   * Used by rollback to re-create or revert a generator to a prior state.
   */
  async restore(generator: TokenGenerator): Promise<void> {
    const existing = this.generators.get(generator.id);
    const normalized = normalizeStoredGenerator(generator);
    this.generators.set(normalized.id, normalized);
    try {
      this.buildDependencyOrder();
      await this.saveGenerators();
    } catch (err) {
      if (existing) {
        this.generators.set(existing.id, existing);
      } else {
        this.generators.delete(normalized.id);
      }
      throw err;
    }
  }

  /**
   * Update generator references when a collection id is renamed.
   * Updates targetCollection for any generator pointing at the old collection id.
   * Returns the count of generators updated.
   */
  async renameCollectionId(
    oldCollectionId: string,
    newCollectionId: string,
  ): Promise<number> {
    let count = 0;
    for (const [id, gen] of this.generators) {
      if (gen.targetCollection === oldCollectionId) {
        this.generators.set(id, {
          ...gen,
          targetCollection: newCollectionId,
        });
        count++;
      }
    }
    if (count > 0) await this.saveGenerators();
    return count;
  }

  /**
   * Apply structural token/group path renames to generator references.
   * Token renames update exact sourceToken matches.
   * Group renames update exact/prefix matches for sourceToken and targetGroup.
   * Returns the count of generators updated.
   */
  async applyPathRenames(
    renames: GeneratorPathRenameUpdate[],
  ): Promise<number> {
    if (renames.length === 0) {
      return 0;
    }

    let count = 0;
    for (const [id, gen] of this.generators) {
      let nextSourceToken = gen.sourceToken;
      let nextTargetGroup = gen.targetGroup;
      let nextDetachedPaths = gen.detachedPaths
        ? [...gen.detachedPaths]
        : undefined;

      for (const rename of renames) {
        if (rename.scope === "token") {
          if (nextSourceToken === rename.oldPath) {
            nextSourceToken = rename.newPath;
          }
          if (nextDetachedPaths) {
            nextDetachedPaths = nextDetachedPaths.map((path) =>
              path === rename.oldPath ? rename.newPath : path,
            );
          }
          continue;
        }

        const prefix = `${rename.oldPath}.`;
        if (nextSourceToken) {
          if (nextSourceToken === rename.oldPath) {
            nextSourceToken = rename.newPath;
          } else if (nextSourceToken.startsWith(prefix)) {
            nextSourceToken =
              rename.newPath + nextSourceToken.slice(rename.oldPath.length);
          }
        }
        if (nextTargetGroup === rename.oldPath) {
          nextTargetGroup = rename.newPath;
        } else if (nextTargetGroup.startsWith(prefix)) {
          nextTargetGroup =
            rename.newPath + nextTargetGroup.slice(rename.oldPath.length);
        }
        if (nextDetachedPaths) {
          nextDetachedPaths = nextDetachedPaths.map((path) => {
            if (path === rename.oldPath) return rename.newPath;
            if (path.startsWith(prefix)) {
              return rename.newPath + path.slice(rename.oldPath.length);
            }
            return path;
          });
        }
      }

      if (
        nextSourceToken !== gen.sourceToken ||
        nextTargetGroup !== gen.targetGroup ||
        stableStringify(nextDetachedPaths ?? []) !==
          stableStringify(gen.detachedPaths ?? [])
      ) {
        this.generators.set(id, {
          ...gen,
          ...(nextSourceToken !== undefined ? { sourceToken: nextSourceToken } : {}),
          targetGroup: nextTargetGroup,
          ...(nextDetachedPaths && nextDetachedPaths.length > 0
            ? { detachedPaths: [...new Set(nextDetachedPaths)].sort() }
            : { detachedPaths: undefined }),
        });
        count++;
      }
    }
    if (count > 0) await this.saveGenerators();
    return count;
  }

  /**
   * Update generator references when a single token path changes.
   */
  async updateTokenPaths(pathMap: Map<string, string>): Promise<number> {
    return this.applyPathRenames(
      Array.from(pathMap, ([oldPath, newPath]) => ({
        scope: "token" as const,
        oldPath,
        newPath,
      })),
    );
  }

  /**
   * Update generator references when a token group is renamed.
   */
  async updateGroupPath(
    oldGroupPath: string,
    newGroupPath: string,
  ): Promise<number> {
    return this.applyPathRenames([
      { scope: "group", oldPath: oldGroupPath, newPath: newGroupPath },
    ]);
  }

  /**
   * Update generator references after a bulk find/replace rename operation.
   * Applies the same string transformation to sourceToken and targetGroup.
   * Returns the count of generators updated.
   */
  async updateBulkTokenPaths(
    find: string,
    replace: string,
    isRegex = false,
  ): Promise<number> {
    let pattern: RegExp | null = null;
    if (isRegex) {
      try {
        pattern = new RegExp(find, "g");
      } catch (err) {
        throw new BadRequestError(
          `Invalid regular expression: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    const apply = (s: string): string =>
      pattern ? s.replace(pattern!, replace) : s.split(find).join(replace);

    let count = 0;
    for (const [id, gen] of this.generators) {
      const updates: Partial<TokenGenerator> = {};
      if (gen.sourceToken) {
        const next = apply(gen.sourceToken);
        if (next !== gen.sourceToken) updates.sourceToken = next;
      }
      const nextGroup = apply(gen.targetGroup);
      if (nextGroup !== gen.targetGroup) updates.targetGroup = nextGroup;
      if (Object.keys(updates).length > 0) {
        this.generators.set(id, { ...gen, ...updates });
        count++;
      }
    }
    if (count > 0) await this.saveGenerators();
    return count;
  }

  /**
   * Set or clear a per-step override on a generator.
   * Pass null to remove the override for that step.
   */
  async setStepOverride(
    id: string,
    stepName: string,
    override: { value: unknown; locked: boolean } | null,
  ): Promise<TokenGenerator> {
    validateStepName(stepName);

    const existing = this.generators.get(id);
    if (!existing) throw new NotFoundError(`Generator "${id}" not found`);

    const overrides = { ...(existing.overrides ?? {}) };
    if (override === null) {
      delete overrides[stepName];
    } else {
      overrides[stepName] = override;
    }

    return this.update(id, {
      overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
    });
  }

  /** Compute what would be generated without persisting anything. */
  async preview(
    data: GeneratorPreviewInput,
    tokenStore: TokenStore,
    sourceValue?: unknown,
  ): Promise<GeneratedTokenResult[]> {
    const result = await this.previewWithAnalysis(data, tokenStore, sourceValue);
    return result.tokens;
  }

  async previewWithAnalysis(
    data: GeneratorPreviewInput,
    tokenStore: TokenStore,
    sourceValue?: unknown,
  ): Promise<GeneratorPreviewResult> {
    const type = normalizeGeneratorType(data.type);
    const baseGeneratorId =
      typeof data.baseGeneratorId === "string" && data.baseGeneratorId.trim()
        ? data.baseGeneratorId.trim()
        : undefined;
    const baseGenerator = baseGeneratorId
      ? this.generators.get(baseGeneratorId)
      : undefined;
    const detachedPaths =
      normalizeDetachedPaths(data.detachedPaths) ?? baseGenerator?.detachedPaths;
    const semanticLayer = normalizeSemanticLayer(data.semanticLayer);
    const normalizedData: GeneratorPreviewInput & {
      type: GeneratorType;
      config: GeneratorConfig;
      overrides?: Record<string, { value: unknown; locked: boolean }>;
      detachedPaths?: string[];
      semanticLayer?: GeneratorSemanticLayer;
    } = {
      sourceToken: data.sourceToken,
      inlineValue: data.inlineValue,
      targetGroup: data.targetGroup,
      targetCollection: data.targetCollection,
      baseGeneratorId: data.baseGeneratorId,
      type,
      config: normalizeGeneratorConfig(type, data.config),
      overrides: normalizeOverrides(data.overrides),
      ...(semanticLayer && { semanticLayer }),
      ...(detachedPaths && { detachedPaths }),
    };
    let analysisData = normalizedData;
    let tokens: GeneratedTokenResult[];
    if (sourceValue !== undefined) {
      // source value already resolved on the client; still resolve config tokenRefs on the server
      const resolvedConfig = await this.resolveConfigTokenRefs(
        normalizedData.config,
        tokenStore,
      );
      const resolvedData =
        resolvedConfig !== normalizedData.config
          ? { ...normalizedData, config: resolvedConfig }
          : normalizedData;
      analysisData = resolvedData;
      tokens = await this.computeResultsWithValue(resolvedData, sourceValue);
    } else {
      const resolvedConfig = await this.resolveConfigTokenRefs(
        normalizedData.config,
        tokenStore,
      );
      analysisData =
        resolvedConfig !== normalizedData.config
          ? { ...normalizedData, config: resolvedConfig }
          : normalizedData;
      tokens = await this.computeResults(normalizedData, tokenStore);
    }
    const analysis = await this.analyzePreviewResults(
      analysisData,
      tokens,
      tokenStore,
      baseGenerator,
    );
    return { tokens, analysis };
  }

  private buildPreviewFingerprint(payload: unknown): string {
    return createHash("sha1").update(stableStringify(payload)).digest("hex");
  }

  private async analyzePreviewResults(
    data: GeneratorPreviewInput & {
      type: GeneratorType;
      config: GeneratorConfig;
      overrides?: Record<string, { value: unknown; locked: boolean }>;
      detachedPaths?: string[];
      semanticLayer?: GeneratorSemanticLayer;
    },
    preview: GeneratedTokenResult[],
    tokenStore: TokenStore,
    baseGenerator?: TokenGenerator,
  ): Promise<GeneratorPreviewAnalysis> {
    const targetCollection = data.targetCollection;
    const existingPathSet = new Set<string>();
    const safeUpdates: GeneratorPreviewChangeEntry[] = [];
    const nonGeneratorOverwrites: GeneratorPreviewOverwriteEntry[] = [];
    const manualEditConflicts: GeneratorPreviewManualConflictEntry[] = [];
    const detachedOutputs: GeneratorPreviewDetachedEntry[] = [];
    const manualExceptions: GeneratorPreviewManualExceptionEntry[] = [];
    const diffCreated: GeneratorPreviewAnalysis["diff"]["created"] = [];
    const diffUpdated: GeneratorPreviewAnalysis["diff"]["updated"] = [];
    const diffUnchanged: GeneratorPreviewAnalysis["diff"]["unchanged"] = [];
    const previewPathSet = new Set(preview.map((result) => result.path));
    const previewResultMap = new Map(
      preview.map((result) => [result.path, result] as const),
    );
    const detachedPathSet = new Set(data.detachedPaths ?? []);
    const nextOverrides = data.overrides ?? {};
    const previousOverrides = baseGenerator?.overrides ?? {};

    const baselinePreviewMap = baseGenerator
      ? new Map(
          (await this.computeResults(baseGenerator, tokenStore)).map((result) => [
            result.path,
            result,
          ]),
        )
      : new Map<string, GeneratedTokenResult>();

    for (const result of preview) {
      const existing = targetCollection
        ? await tokenStore.getToken(targetCollection, result.path)
        : undefined;
      if (!existing) {
        diffCreated.push({
          path: result.path,
          value: result.value,
          type: result.type,
        });
        continue;
      }

      existingPathSet.add(result.path);
      const changesValue =
        stableStringify(existing.$value) !== stableStringify(result.value);
      const ext = existing.$extensions?.["com.tokenmanager.generator"];

      if (detachedPathSet.has(result.path)) {
        detachedOutputs.push({
          path: result.path,
          collectionId: targetCollection,
          type: result.type,
          currentValue: existing.$value,
          newValue: result.value,
          state: "recreated",
        });
      } else if (baseGenerator && ext?.generatorId === baseGenerator.id) {
        const baseline = baselinePreviewMap.get(result.path);
        const manualEditDetected =
          baseline !== undefined &&
          stableStringify(existing.$value) !== stableStringify(baseline.value);

        if (manualEditDetected && changesValue) {
          manualEditConflicts.push({
            path: result.path,
            collectionId: targetCollection,
            type: result.type,
            currentValue: existing.$value,
            newValue: result.value,
            changesValue,
            baselineValue: baseline!.value,
          });
        } else if (changesValue) {
          safeUpdates.push({
            path: result.path,
            collectionId: targetCollection,
            type: result.type,
            currentValue: existing.$value,
            newValue: result.value,
            changesValue,
          });
        }
      } else {
        nonGeneratorOverwrites.push({
          path: result.path,
          collectionId: targetCollection,
          type: result.type,
          currentValue: existing.$value,
          newValue: result.value,
          changesValue,
          owner: ext?.generatorId ? "generator" : "manual",
          generatorId: ext?.generatorId,
        });
      }

      if (changesValue) {
        diffUpdated.push({
          path: result.path,
          currentValue: existing.$value,
          newValue: result.value,
          type: result.type,
        });
      } else {
        diffUnchanged.push({
          path: result.path,
          value: result.value,
          type: result.type,
        });
      }
    }

    const deletedOutputs: GeneratorPreviewDeletedEntry[] = [];
    if (baseGenerator) {
      const desiredOutputKeys = new Set(
        (
          await this.collectDesiredPreviewOutputs(
            data,
            preview,
            baseGenerator,
          )
        ).map((output) => `${output.collectionId}::${output.path}`),
      );
      const ownedTokens = tokenStore.findTokensByGeneratorId(baseGenerator.id);
      for (const owned of ownedTokens) {
        const token = await tokenStore.getToken(owned.collectionId, owned.path);
        const ext = token?.$extensions?.["com.tokenmanager.generator"];
        if (
          !token ||
          (ext?.outputKind !== "scale" && ext?.outputKind !== "semantic")
        ) {
          continue;
        }
        if (!desiredOutputKeys.has(`${owned.collectionId}::${owned.path}`)) {
          deletedOutputs.push({
            path: owned.path,
            collectionId: owned.collectionId,
            type: token.$type || "unknown",
            currentValue: token.$value,
          });
        }
      }

      for (const detachedPath of detachedPathSet) {
        if (previewPathSet.has(detachedPath)) continue;
        const token = targetCollection
          ? await tokenStore.getToken(targetCollection, detachedPath)
          : undefined;
        if (!token) continue;
        detachedOutputs.push({
          path: detachedPath,
          collectionId: targetCollection,
          type: token.$type || "unknown",
          currentValue: token.$value,
          state: "preserved",
        });
      }
    }

    const exceptionStepNames = new Set([
      ...Object.keys(previousOverrides),
      ...Object.keys(nextOverrides),
    ]);
    for (const stepName of exceptionStepNames) {
      const path = `${data.targetGroup}.${stepName}`;
      const nextOverride = nextOverrides[stepName];
      const previousOverride = previousOverrides[stepName];
      const existing = targetCollection
        ? await tokenStore.getToken(targetCollection, path)
        : undefined;
      const previewResult = previewResultMap.get(path);
      const baselineResult = baselinePreviewMap.get(path);
      const entryType =
        previewResult?.type ??
        baselineResult?.type ??
        existing?.$type ??
        "unknown";

      if (nextOverride && previousOverride) {
        manualExceptions.push({
          path,
          collectionId: targetCollection,
          type: entryType,
          currentValue: existing?.$value ?? previousOverride.value,
          newValue: previewResult?.value ?? nextOverride.value,
          state: "preserved",
        });
        continue;
      }

      if (nextOverride) {
        manualExceptions.push({
          path,
          collectionId: targetCollection,
          type: entryType,
          currentValue: existing?.$value,
          newValue: previewResult?.value ?? nextOverride.value,
          state: "created",
        });
        continue;
      }

      manualExceptions.push({
        path,
        collectionId: targetCollection,
        type: entryType,
        currentValue: existing?.$value ?? previousOverride?.value,
        newValue: previewResult?.value,
        state: "invalidated",
      });
    }

    const analysisWithoutFingerprint = {
      safeCreateCount: diffCreated.length,
      unchangedCount: diffUnchanged.length,
      existingPathSet: [...existingPathSet],
      safeUpdates,
      nonGeneratorOverwrites,
      manualEditConflicts,
      deletedOutputs,
      detachedOutputs,
      manualExceptions,
      diff: {
        created: diffCreated,
        updated: diffUpdated,
        unchanged: diffUnchanged,
        deleted: deletedOutputs.map((entry) => ({
          path: entry.path,
          currentValue: entry.currentValue,
          type: entry.type,
        })),
      },
    } satisfies Omit<GeneratorPreviewAnalysis, "fingerprint">;

    return {
      ...analysisWithoutFingerprint,
      fingerprint: this.buildPreviewFingerprint({
        targetCollection,
        preview,
        analysis: analysisWithoutFingerprint,
      }),
    };
  }

  /** Run a saved generator and persist the derived tokens. */
  async run(
    id: string,
    tokenStore: TokenStore,
    options: {
      sourceValueOverride?: unknown;
    } = {},
  ): Promise<GeneratedTokenResult[]> {
    const generator = this.generators.get(id);
    if (!generator) throw new NotFoundError(`Generator "${id}" not found`);
    return this.withGeneratorLock(id, () =>
      this.executeGenerator(generator, tokenStore, options.sourceValueOverride),
    );
  }

  /** Returns true if any generator is currently executing (has a pending lock chain). */
  isAnyRunning(): boolean {
    return this.generatorLocks.size > 0;
  }

  /**
   * Run all generators affected by the given token path, in topological order.
   * Handles chained generators (Generator B sourcing from Generator A's output).
   * Safe to call from a token-update event listener.
   */
  async runForSourceToken(
    tokenPath: string,
    tokenStore: TokenStore,
    collectionLookup: {
      getCollectionsOverview(): Promise<{
        collections: Array<{ id: string; modes: Array<{ name: string }> }>;
      }>;
    },
  ): Promise<void> {
    const collectionModeCounts =
      await this.getCollectionModeCounts(collectionLookup);
    // Find all generators that directly source this token (skip disabled ones).
    // Auto-disable unsupported keep-updated states so background execution never
    // pretends to honor an implicit mode selection.
    const directlyAffected = new Set<string>();
    let disabledUnsupported = false;
    for (const generator of this.generators.values()) {
      if (generator.sourceToken !== tokenPath || generator.enabled === false) {
        continue;
      }
      const disabledReason = await this.getKeepUpdatedDisabledReason(
        generator.sourceToken,
        tokenStore,
        collectionModeCounts,
      );
      if (disabledReason) {
        this.generators.set(generator.id, {
          ...generator,
          enabled: false,
          updatedAt: new Date().toISOString(),
          lastRunError: {
            message: disabledReason,
            at: new Date().toISOString(),
          },
        });
        tokenStore.emitEvent({
          type: "generator-error",
          collectionId: "",
          generatorId: generator.id,
          message: disabledReason,
        });
        disabledUnsupported = true;
        continue;
      }
      directlyAffected.add(generator.id);
    }
    if (disabledUnsupported) {
      await this.saveGenerators();
    }
    if (directlyAffected.size === 0) return;

    // Get topological execution order for all generators
    let order: string[];
    try {
      order = this.buildDependencyOrder();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[GeneratorService] Dependency graph error:", err);
      tokenStore.emitEvent({
        type: "generator-error",
        collectionId: "",
        message: `Dependency graph error: ${message}`,
      });
      return;
    }

    // Expand the affected generator group to include transitive dependents (skip disabled ones)
    const affected = new Set(directlyAffected);
    for (const genId of order) {
      if (affected.has(genId)) continue;
      const gen = this.generators.get(genId);
      if (!gen?.sourceToken) continue;
      if (gen.enabled === false) continue;
      for (const affectedId of affected) {
        const affectedGen = this.generators.get(affectedId);
        if (
          affectedGen &&
          gen.sourceToken.startsWith(affectedGen.targetGroup + ".")
        ) {
          affected.add(genId);
          break;
        }
      }
    }

    // Execute in topological order, serialized per-generator via promise-chain locks.
    // Track failed generator IDs so downstream dependents can be skipped — running
    // a downstream generator after its upstream failed would process stale output.
    const failedIds = new Set<string>();
    for (const genId of order) {
      if (!affected.has(genId)) continue;
      const gen = this.generators.get(genId);
      if (!gen) continue;

      // Skip if any upstream generator (whose output this one sources from) failed.
      const blockingGen = gen.sourceToken
        ? [...failedIds]
            .map((failedId) => this.generators.get(failedId))
            .find(
              (failedGen) =>
                failedGen &&
                gen.sourceToken!.startsWith(failedGen.targetGroup + "."),
            )
        : undefined;
      if (blockingGen) {
        const message = `Blocked: upstream generator "${blockingGen.name}" failed`;
        const current = this.generators.get(genId);
        if (current) {
          this.generators.set(genId, {
            ...current,
            lastRunError: {
              message,
              at: new Date().toISOString(),
              blockedBy: blockingGen.name,
            },
          });
          await this.saveGenerators();
        }
        console.warn(
          `[GeneratorService] Generator "${gen.name}" blocked because upstream "${blockingGen.name}" failed`,
        );
        tokenStore.emitEvent({
          type: "generator-error",
          collectionId: "",
          generatorId: genId,
          message,
        });
        failedIds.add(genId);
        continue;
      }

      await this.withGeneratorLock(genId, () =>
        this.executeGenerator(gen, tokenStore),
      ).catch(async (err) => {
        const message = err instanceof Error ? err.message : String(err);
        const current = this.generators.get(genId);
        if (current) {
          this.generators.set(genId, {
            ...current,
            lastRunError: { message, at: new Date().toISOString() },
          });
          await this.saveGenerators();
        }
        console.warn(
          `[GeneratorService] Generator "${genId}" failed after token update:`,
          err,
        );
        tokenStore.emitEvent({
          type: "generator-error",
          collectionId: "",
          generatorId: genId,
          message,
        });
        failedIds.add(genId);
      });
    }
  }

  /**
   * Build a topologically-sorted list of all generator IDs.
   * Generators that depend on another generator's output come after it.
   * Throws if a dependency cycle is detected.
   */
  private buildDependencyOrder(): string[] {
    // Map targetGroup -> set of generatorIds for producer lookup
    const producerByGroup = new Map<string, Set<string>>();
    for (const [id, gen] of this.generators) {
      let producers = producerByGroup.get(gen.targetGroup);
      if (!producers) {
        producers = new Set();
        producerByGroup.set(gen.targetGroup, producers);
      }
      producers.add(id);
    }

    // Build in-degree map and adjacency list
    const inDegree = new Map<string, number>();
    const edges = new Map<string, Set<string>>(); // id -> set of ids that depend on it

    for (const [id] of this.generators) {
      inDegree.set(id, 0);
      edges.set(id, new Set());
    }

    for (const [id, gen] of this.generators) {
      if (!gen.sourceToken) continue;
      for (const [prefix, producerIds] of producerByGroup) {
        if (gen.sourceToken.startsWith(prefix + ".")) {
          for (const producerId of producerIds) {
            if (producerId !== id) {
              // id depends on producerId
              edges.get(producerId)!.add(id);
              inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
            }
          }
        }
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      result.push(id);
      for (const dependent of edges.get(id) ?? []) {
        const newDeg = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) queue.push(dependent);
      }
    }

    if (result.length !== this.generators.size) {
      throw new Error(
        "[GeneratorService] Cycle detected in generator dependencies. " +
          "Check that no generator sources from its own output.",
      );
    }

    return result;
  }

  /**
   * Promise-chain mutex per generator. Concurrent calls for the same generator
   * are serialized — the second waits for the first to finish instead of being
   * silently skipped or running in parallel.
   */
  private withGeneratorLock<T>(
    generatorId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const prev = this.generatorLocks.get(generatorId) ?? Promise.resolve();
    const next = prev.then(
      () => fn(),
      () => fn(),
    );
    // Store the void chain (swallow errors so subsequent callers still run)
    const voidChain = next.then(
      () => {},
      () => {},
    );
    this.generatorLocks.set(generatorId, voidChain);
    // Clean up when the chain settles and no new work was appended
    voidChain.then(() => {
      if (this.generatorLocks.get(generatorId) === voidChain) {
        this.generatorLocks.delete(generatorId);
      }
    });
    return next;
  }

  private async executeGenerator(
    generator: TokenGenerator,
    tokenStore: TokenStore,
    sourceValueOverride?: unknown,
  ): Promise<GeneratedTokenResult[]> {
    const results = await this.executeSingleBrand(
      generator,
      tokenStore,
      generator.targetCollection,
      sourceValueOverride,
    );

    // Track when the generator was last run and what the source token's value was,
    // so the UI can detect whether re-running is needed after a source token edit.
    // We update the in-memory record directly (preserving updatedAt) and persist.
    // Important: resolve the source token value BEFORE the final re-read, then
    // re-read current AFTER all awaits so concurrent update() calls are not lost.
    const runAt = new Date().toISOString();
    let lastRunSourceValue: unknown;
    if (sourceValueOverride !== undefined) {
      lastRunSourceValue = sourceValueOverride;
    } else if (generator.sourceToken) {
      const resolved = await tokenStore.resolveToken(generator.sourceToken);
      if (resolved) lastRunSourceValue = resolved.$value;
    }
    // Re-read after all awaits — prevents overwriting concurrent update() mutations.
    // Also clears any prior lastRunError since all async operations succeeded.
    const current = this.generators.get(generator.id);
    if (current) {
      this.generators.set(generator.id, {
        ...current,
        lastRunAt: runAt,
        lastRunSourceValue:
          lastRunSourceValue !== undefined
            ? lastRunSourceValue
            : current.lastRunSourceValue,
        lastRunError: undefined,
      });
      await this.saveGenerators();
    }

    return results;
  }

  /** Removes non-locked overrides from a generator after execution. */
  private async clearNonLockedOverrides(
    generator: TokenGenerator,
  ): Promise<void> {
    const overrides = generator.overrides;
    if (!overrides) return;
    const cleaned: Record<string, { value: unknown; locked: boolean }> = {};
    for (const [key, val] of Object.entries(
      overrides as Record<string, { value: unknown; locked: boolean }>,
    )) {
      if (val.locked) cleaned[key] = val;
    }
    if (Object.keys(cleaned).length !== Object.keys(overrides).length) {
      const hasRemaining = Object.keys(cleaned).length > 0;
      await this.update(generator.id, {
        overrides: hasRemaining ? cleaned : undefined,
      });
    }
  }

  private buildGeneratorExtensions(
    generator: TokenGenerator,
    outputKind: "scale" | "semantic",
  ): Token["$extensions"] {
    return {
      "com.tokenmanager.generator": {
        generatorId: generator.id,
        sourceToken: generator.sourceToken ?? "",
        outputKind,
      },
    };
  }

  private buildSemanticAliasResults(
    generator: Pick<TokenGenerator, "targetGroup" | "semanticLayer">,
    results: GeneratedTokenResult[],
  ): Array<
    GeneratedTokenResult & {
      sourceStep: string;
    }
  > {
    const semanticLayer = generator.semanticLayer;
    if (!semanticLayer || semanticLayer.mappings.length === 0) {
      return [];
    }

    return semanticLayer.mappings.flatMap(
      (mapping: SemanticTokenMapping) => {
      const source = results.find(
        (result) => String(result.stepName) === mapping.step,
      );
      if (!source) return [];
      return [
        {
          stepName: mapping.semantic,
          path: `${semanticLayer.prefix}.${mapping.semantic}`,
          type: source.type,
          value: `{${generator.targetGroup}.${mapping.step}}`,
          sourceStep: mapping.step,
        },
      ];
      },
    );
  }

  private buildDesiredGeneratedOutputs(
    generator: Pick<TokenGenerator, "targetGroup" | "semanticLayer">,
    effectiveTargetCollection: string,
    results: GeneratedTokenResult[],
  ): Array<{ collectionId: string; path: string }> {
    return [
      ...results.map((result) => ({
        collectionId: effectiveTargetCollection,
        path: result.path,
      })),
      ...this.buildSemanticAliasResults(generator, results).map((result) => ({
        collectionId: effectiveTargetCollection,
        path: result.path,
      })),
    ];
  }

  private async collectDesiredPreviewOutputs(
    data: GeneratorPreviewInput & {
      type: GeneratorType;
      config: GeneratorConfig;
      overrides?: Record<string, { value: unknown; locked: boolean }>;
      detachedPaths?: string[];
      semanticLayer?: GeneratorSemanticLayer;
    },
    preview: GeneratedTokenResult[],
    baseGenerator?: TokenGenerator,
  ): Promise<Array<{ collectionId: string; path: string }>> {
    const generatorShape = {
      targetGroup: data.targetGroup,
      semanticLayer: data.semanticLayer ?? baseGenerator?.semanticLayer,
    };

    return this.buildDesiredGeneratedOutputs(
      generatorShape,
      data.targetCollection,
      preview,
    );
  }

  private async syncSemanticLayer(
    generator: TokenGenerator,
    tokenStore: TokenStore,
    effectiveTargetCollection: string,
    results: GeneratedTokenResult[],
  ): Promise<void> {
    const semanticResults = this.buildSemanticAliasResults(generator, results);
    const extensions = this.buildGeneratorExtensions(generator, "semantic");

    for (const result of semanticResults) {
      const token: Token = {
        $type: result.type as TokenType,
        $value: result.value as Token["$value"],
        $description: `Semantic reference for ${generator.targetGroup}.${result.sourceStep}`,
        $extensions: extensions,
      };
      const existing = await tokenStore.getToken(effectiveTargetCollection, result.path);
      if (existing) {
        await tokenStore.updateToken(effectiveTargetCollection, result.path, token);
      } else {
        await tokenStore.createToken(effectiveTargetCollection, result.path, token);
      }
    }
  }

  private async cleanupStaleGeneratedOutputs(
    generator: TokenGenerator,
    tokenStore: Pick<
      TokenStore,
      "deleteTokens" | "findTokensByGeneratorId" | "getToken"
    >,
    desiredOutputs: Array<{ collectionId: string; path: string }>,
  ): Promise<void> {
    const desiredKeys = new Set(
      desiredOutputs.map((output) => `${output.collectionId}::${output.path}`),
    );
    const tokensToDeleteByCollection = new Map<string, string[]>();
    const ownedTokens = tokenStore.findTokensByGeneratorId(generator.id);

    for (const owned of ownedTokens) {
      if (desiredKeys.has(`${owned.collectionId}::${owned.path}`)) continue;
      const token = await tokenStore.getToken(owned.collectionId, owned.path);
      const ext = token?.$extensions?.["com.tokenmanager.generator"];
      if (
        !token ||
        (ext?.outputKind !== "scale" && ext?.outputKind !== "semantic")
      ) {
        continue;
      }
      const existing = tokensToDeleteByCollection.get(owned.collectionId);
      if (existing) {
        existing.push(owned.path);
        continue;
      }
      tokensToDeleteByCollection.set(owned.collectionId, [owned.path]);
    }

    for (const [collectionId, paths] of tokensToDeleteByCollection) {
      if (paths.length === 0) continue;
      await tokenStore.deleteTokens(collectionId, [...new Set(paths)]);
    }
  }

  /** Original single-brand execution path. Writes to `effectiveTargetCollection`. */
  private async executeSingleBrand(
    generator: TokenGenerator,
    tokenStore: TokenStore,
    effectiveTargetCollection: string,
    sourceValueOverride?: unknown,
  ): Promise<GeneratedTokenResult[]> {
    const results =
      sourceValueOverride !== undefined
        ? await this.computeResultsWithValue(generator, sourceValueOverride)
        : await this.computeResults(generator, tokenStore);

    await this.clearNonLockedOverrides(generator);

    const snapshotCollectionIds = new Set([effectiveTargetCollection]);
    for (const owned of tokenStore.findTokensByGeneratorId(generator.id)) {
      snapshotCollectionIds.add(owned.collectionId);
    }

    const preRunSnapshots = new Map<string, Record<string, Token>>();
    for (const collectionId of snapshotCollectionIds) {
      preRunSnapshots.set(
        collectionId,
        structuredClone(
          await tokenStore.getFlatTokensForCollection(collectionId),
        ) as Record<string, Token>,
      );
    }

    const extensions = this.buildGeneratorExtensions(generator, "scale");
    let runError: unknown = undefined;
    try {
      const desiredOutputs = this.buildDesiredGeneratedOutputs(
        generator,
        effectiveTargetCollection,
        results,
      );
      tokenStore.beginBatch();
      try {
        for (const result of results) {
          const token = {
            $type: result.type as TokenType,
            $value: result.value as Token["$value"],
            $extensions: extensions,
          };
          const existing = await tokenStore.getToken(
            effectiveTargetCollection,
            result.path,
          );
          if (existing) {
            await tokenStore.updateToken(effectiveTargetCollection, result.path, token);
          } else {
            await tokenStore.createToken(effectiveTargetCollection, result.path, token);
          }
        }
      } finally {
        tokenStore.endBatch();
      }
      await this.syncSemanticLayer(
        generator,
        tokenStore,
        effectiveTargetCollection,
        results,
      );
      await this.cleanupStaleGeneratedOutputs(
        generator,
        tokenStore,
        desiredOutputs,
      );
    } catch (err) {
      runError = err;
    }

    if (runError !== undefined) {
      // Roll back: restore tokens that existed before + delete tokens created during the run.
      const collectionIds = [...preRunSnapshots.keys()];
      const rollbackResults = await Promise.allSettled(
        collectionIds.map(async (collectionId) => {
          const preSnapshot = preRunSnapshots.get(collectionId)!;
          const currentTokens =
            await tokenStore.getFlatTokensForCollection(collectionId);
          const restoreItems: Array<{ path: string; token: Token | null }> = [];
          for (const [p, t] of Object.entries(preSnapshot)) {
            restoreItems.push({ path: p, token: t });
          }
          for (const p of Object.keys(currentTokens)) {
            if (!(p in preSnapshot)) {
              restoreItems.push({ path: p, token: null });
            }
          }
          if (restoreItems.length > 0) {
            await tokenStore.restoreSnapshot(collectionId, restoreItems);
          }
        }),
      );
      const rollbackFailures = rollbackResults
        .map((result, index) => ({ result, collectionId: collectionIds[index] }))
        .filter(({ result }) => result.status === "rejected");
      if (rollbackFailures.length > 0) {
        const rollbackSummary = rollbackFailures
          .map(({ result, collectionId }) => {
            const reason =
              result.status === "rejected"
                ? result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason)
                : "";
            return `${collectionId}: ${reason}`;
          })
          .join("; ");
        throw new Error(
          `Generator run failed and rollback also failed (${rollbackSummary}). Token state may be inconsistent.`,
        );
      }
      throw runError;
    }

    return results;
  }

  /**
   * Core dispatch: given a pre-resolved source value (or undefined for source-free generators),
   * run the appropriate generator and apply overrides.
   */
  private async computeResultsWithValue(
    generator: GeneratorExecutionInput,
    resolvedValue: unknown,
  ): Promise<GeneratedTokenResult[]> {
    const { type, targetGroup, config } = generator;
    let results: GeneratedTokenResult[];

    switch (type) {
      case "colorRamp": {
        const hex = typeof resolvedValue === "string" ? resolvedValue : null;
        if (!hex)
          throw new BadRequestError(
            `Source value for colorRamp must be a color string`,
          );
        results = runColorRampGenerator(
          hex,
          config as ColorRampConfig,
          targetGroup,
        );
        break;
      }
      case "typeScale": {
        const dim = resolvedValue as { value: number; unit: string } | null;
        if (!dim || typeof dim !== "object" || typeof dim.value !== "number") {
          throw new BadRequestError(
            `Source value for typeScale must be a dimension value`,
          );
        }
        results = runTypeScaleGenerator(
          dim,
          config as TypeScaleConfig,
          targetGroup,
        );
        break;
      }
      case "spacingScale": {
        const dim = resolvedValue as { value: number; unit: string } | null;
        if (!dim || typeof dim !== "object" || typeof dim.value !== "number") {
          throw new BadRequestError(
            `Source value for spacingScale must be a dimension value`,
          );
        }
        results = runSpacingScaleGenerator(
          dim,
          config as SpacingScaleConfig,
          targetGroup,
        );
        break;
      }
      case "opacityScale": {
        results = runOpacityScaleGenerator(
          config as OpacityScaleConfig,
          targetGroup,
        );
        break;
      }
      case "borderRadiusScale": {
        const dim = resolvedValue as { value: number; unit: string } | null;
        if (!dim || typeof dim !== "object" || typeof dim.value !== "number") {
          throw new BadRequestError(
            `Source value for borderRadiusScale must be a dimension value`,
          );
        }
        results = runBorderRadiusScaleGenerator(
          dim,
          config as BorderRadiusScaleConfig,
          targetGroup,
        );
        break;
      }
      case "zIndexScale": {
        results = runZIndexScaleGenerator(
          config as ZIndexScaleConfig,
          targetGroup,
        );
        break;
      }
      case "shadowScale": {
        results = runShadowScaleGenerator(
          config as ShadowScaleConfig,
          targetGroup,
        );
        break;
      }
      case "customScale": {
        let base: number | undefined;
        if (resolvedValue !== undefined) {
          if (typeof resolvedValue === "number") {
            base = resolvedValue;
          } else if (
            typeof resolvedValue === "object" &&
            resolvedValue !== null &&
            "value" in resolvedValue
          ) {
            base = (resolvedValue as { value: number }).value;
          }
        }
        results = runCustomScaleGenerator(
          base,
          config as CustomScaleConfig,
          targetGroup,
        );
        break;
      }
      case "darkModeInversion": {
        const hex = typeof resolvedValue === "string" ? resolvedValue : null;
        if (!hex)
          throw new BadRequestError(
            `Source value for darkModeInversion must be a color string`,
          );
        results = runDarkModeInversionGenerator(
          hex,
          config as DarkModeInversionConfig,
          targetGroup,
        );
        break;
      }
      default:
        throw new BadRequestError(`Unknown generator type: ${type}`);
    }

    return this.filterDetachedResults(
      generator as TokenGenerator,
      applyOverrides(results, generator.overrides),
    );
  }

  /**
   * Resolves any $tokenRefs in a generator config by looking up each referenced
   * token in the token store and replacing the config field with the resolved value.
   * Returns a copy of the config with tokenRef fields overridden, or the original
   * config if there are no tokenRefs or all resolutions fail gracefully.
   */
  private async resolveConfigTokenRefs(
    config: TokenGenerator["config"],
    tokenStore: TokenStore,
  ): Promise<TokenGenerator["config"]> {
    const c = config as unknown as Record<string, unknown>;
    const refs = c.$tokenRefs;
    if (!refs || typeof refs !== "object" || Array.isArray(refs)) return config;

    const overrides: Record<string, unknown> = {};
    for (const [field, tokenPath] of Object.entries(
      refs as Record<string, string>,
    )) {
      if (!tokenPath) continue;
      // resolveToken returns undefined for both "not found" and resolution errors (handled
      // internally by TokenStore). When undefined, keep the stored literal config value.
      const resolved = await tokenStore.resolveToken(tokenPath);
      if (resolved) overrides[field] = resolved.$value;
    }

    if (Object.keys(overrides).length === 0) return config;
    // Merge overrides into a new config, preserving $tokenRefs so it's stored intact
    return { ...config, ...overrides } as TokenGenerator["config"];
  }

  private async computeResults(
    generator: GeneratorExecutionInput,
    tokenStore: TokenStore,
  ): Promise<GeneratedTokenResult[]> {
    const { type, sourceToken, inlineValue } = generator;

    const needsSource =
      type === "colorRamp" ||
      type === "typeScale" ||
      type === "spacingScale" ||
      type === "borderRadiusScale" ||
      type === "darkModeInversion" ||
      (type === "customScale" && (!!sourceToken || inlineValue !== undefined));

    let resolvedValue: unknown;
    if (needsSource) {
      if (sourceToken) {
        const resolved = await tokenStore.resolveToken(sourceToken);
        if (!resolved) {
          throw new NotFoundError(
            `Source token "${sourceToken}" not found or could not be resolved`,
          );
        }
        resolvedValue = resolved.$value;
      } else if (inlineValue !== undefined) {
        resolvedValue = inlineValue;
      } else {
        throw new BadRequestError(
          `Generator type "${type}" requires a source token or inline value`,
        );
      }
    }

    // Resolve any $tokenRefs in the config before executing
    const resolvedConfig = await this.resolveConfigTokenRefs(
      generator.config,
      tokenStore,
    );
    return this.computeResultsWithValue(
      { ...generator, config: resolvedConfig },
      resolvedValue,
    );
  }
}
