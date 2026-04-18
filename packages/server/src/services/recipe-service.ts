import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type {
  RecipeType,
  RecipeConfig,
  TokenRecipe,
  RecipeSemanticLayer,
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
  AccessibleColorPairConfig,
  DarkModeInversionConfig,
  DimensionUnit,
} from "@tokenmanager/core";
import {
  DIMENSION_UNITS,
  evalExpr,
  runColorRampRecipe,
  runTypeScaleRecipe,
  runSpacingScaleRecipe,
  runOpacityScaleRecipe,
  runBorderRadiusScaleRecipe,
  runZIndexScaleRecipe,
  runShadowScaleRecipe,
  runCustomScaleRecipe,
  runAccessibleColorPairRecipe,
  runDarkModeInversionRecipe,
  applyOverrides,
  getRecipeOutputCollectionIds,
  getRecipeManagedOutputPaths,
  substituteVars,
  validateStepName,
} from "@tokenmanager/core";
import type { TokenStore } from "./token-store.js";
import type { TokenPathRename } from "./operation-log.js";
import { stableStringify } from "./stable-stringify.js";
import { NotFoundError, BadRequestError } from "../errors.js";
import { PromiseChainLock } from "../utils/promise-chain-lock.js";
import { validateTokenPath } from "./token-tree-utils.js";

interface RecipesFile {
  $recipes: TokenRecipe[];
}

const VALID_RECIPE_TYPES = [
  "colorRamp",
  "typeScale",
  "spacingScale",
  "opacityScale",
  "borderRadiusScale",
  "zIndexScale",
  "shadowScale",
  "customScale",
  "accessibleColorPair",
  "darkModeInversion",
] as const satisfies readonly RecipeType[];

const VALID_RECIPE_TYPE_SET = new Set<RecipeType>(VALID_RECIPE_TYPES);

export type RecipeCreateInput = Omit<
  TokenRecipe,
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

export type RecipeUpdateInput = Partial<
  Omit<
    TokenRecipe,
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

export type RecipePreviewInput = Pick<
  TokenRecipe,
  | "sourceToken"
  | "inlineValue"
  | "targetGroup"
  | "targetCollection"
  | "semanticLayer"
> & {
  type: unknown;
  config?: unknown;
  overrides?: unknown;
  baseRecipeId?: unknown;
  detachedPaths?: unknown;
};

export interface RecipePreviewChangeEntry {
  path: string;
  collectionId: string;
  type: string;
  currentValue: unknown;
  newValue: unknown;
  changesValue: boolean;
}

export interface RecipePreviewOverwriteEntry
  extends RecipePreviewChangeEntry {
  owner: "manual" | "recipe";
  recipeId?: string;
}

export interface RecipePreviewManualConflictEntry
  extends RecipePreviewChangeEntry {
  baselineValue: unknown;
}

export interface RecipePreviewDeletedEntry {
  path: string;
  collectionId: string;
  type: string;
  currentValue: unknown;
}

export interface RecipePreviewDetachedEntry {
  path: string;
  collectionId: string;
  type: string;
  currentValue: unknown;
  newValue?: unknown;
  state: "preserved" | "recreated";
}

export interface RecipePreviewAnalysis {
  fingerprint: string;
  safeCreateCount: number;
  unchangedCount: number;
  existingPathSet: string[];
  safeUpdates: RecipePreviewChangeEntry[];
  nonRecipeOverwrites: RecipePreviewOverwriteEntry[];
  manualEditConflicts: RecipePreviewManualConflictEntry[];
  deletedOutputs: RecipePreviewDeletedEntry[];
  detachedOutputs: RecipePreviewDetachedEntry[];
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

export interface RecipePreviewResult {
  tokens: GeneratedTokenResult[];
  analysis: RecipePreviewAnalysis;
}

export interface RecipeCollectionDependencyMeta {
  id: string;
  name: string;
  targetCollections: string[];
  targetGroup: string;
}

export interface OrphanedRecipeToken {
  collectionId: string;
  path: string;
  recipeId: string;
}

export interface DetachedRecipeResult {
  recipe: TokenRecipe;
  detachedPaths: string[];
  detachedCount: number;
}

export type RecipeDashboardStatus =
  | "upToDate"
  | "stale"
  | "failed"
  | "blocked"
  | "neverRun"
  | "paused";

export interface RecipeDashboardDependency {
  id: string;
  name: string;
  targetCollection: string;
  targetGroup: string;
  status: RecipeDashboardStatus;
}

export interface RecipeLastRunSummary {
  status: RecipeDashboardStatus;
  label: string;
  at?: string;
  message?: string;
}

export interface RecipeDashboardItem extends TokenRecipe {
  isStale?: boolean;
  staleReason?: string;
  upstreamRecipes: RecipeDashboardDependency[];
  downstreamRecipes: RecipeDashboardDependency[];
  blockedByRecipes: RecipeDashboardDependency[];
  lastRunSummary: RecipeLastRunSummary;
}

export type RecipePathRenameUpdate =
  | ({ scope: "token" } & TokenPathRename)
  | ({ scope: "group" } & TokenPathRename);

type RecipeExecutionInput = {
  type: TokenRecipe["type"];
  sourceToken?: TokenRecipe["sourceToken"];
  inlineValue?: TokenRecipe["inlineValue"];
  targetGroup: TokenRecipe["targetGroup"];
  config: TokenRecipe["config"];
  overrides?: TokenRecipe["overrides"];
  detachedPaths?: TokenRecipe["detachedPaths"];
};

function getRecipeDashboardStatus(
  recipe: TokenRecipe,
  isStale: boolean,
): RecipeDashboardStatus {
  if (recipe.enabled === false) return "paused";
  if (recipe.lastRunError?.blockedBy) return "blocked";
  if (recipe.lastRunError) return "failed";
  if (isStale) return "stale";
  if (!recipe.lastRunAt) return "neverRun";
  return "upToDate";
}

function getRecipeStatusLabel(status: RecipeDashboardStatus): string {
  switch (status) {
    case "paused":
      return "Paused";
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

function buildRecipeDependency(
  recipe: TokenRecipe,
  status: RecipeDashboardStatus,
): RecipeDashboardDependency {
  return {
    id: recipe.id,
    name: recipe.name,
    targetCollection: recipe.targetCollection,
    targetGroup: recipe.targetGroup,
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

function normalizeRecipeType(rawType: unknown): RecipeType {
  if (
    typeof rawType !== "string" ||
    !VALID_RECIPE_TYPE_SET.has(rawType as RecipeType)
  ) {
    throw new BadRequestError(
      `Unknown recipe type "${String(rawType)}". Valid types: ${VALID_RECIPE_TYPES.join(", ")}`,
    );
  }
  return rawType as RecipeType;
}

function normalizeOverrides(
  raw: unknown,
): TokenRecipe["overrides"] | undefined {
  if (!isObj(raw)) return undefined;
  const overrides: NonNullable<TokenRecipe["overrides"]> = {};
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

function normalizeSemanticLayer(raw: unknown): RecipeSemanticLayer | undefined {
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
): TokenRecipe["lastRunError"] | undefined {
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

function normalizeRecipeConfig(
  type: RecipeType,
  config: unknown,
): RecipeConfig {
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
        if (value < 0 || value > 1) {
          throw new BadRequestError(
            `opacityScale config steps[${i}].value must be between 0 and 1`,
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
    case "accessibleColorPair": {
      if (c.contrastLevel !== "AA" && c.contrastLevel !== "AAA") {
        throw new BadRequestError(
          'accessibleColorPair config requires "contrastLevel" as "AA" | "AAA"',
        );
      }
      if (typeof c.backgroundStep !== "string")
        throw new BadRequestError(
          'accessibleColorPair config requires "backgroundStep" as string',
        );
      if (typeof c.foregroundStep !== "string")
        throw new BadRequestError(
          'accessibleColorPair config requires "foregroundStep" as string',
        );
      return {
        contrastLevel: c.contrastLevel as "AA" | "AAA",
        backgroundStep: c.backgroundStep as string,
        foregroundStep: c.foregroundStep as string,
      } satisfies AccessibleColorPairConfig;
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

function normalizeStoredRecipe(raw: unknown): TokenRecipe {
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

  const type = normalizeRecipeType(raw.type);
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
    config: normalizeRecipeConfig(type, raw.config),
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

export class RecipeService {
  private dir: string;
  private recipes: Map<string, TokenRecipe> = new Map();
  /** Per-recipe promise chain — serializes concurrent executions instead of skipping them. */
  private recipeLocks = new Map<string, Promise<void>>();
  /** Promise-chain mutex — serializes all saveRecipes() calls to prevent file-rename races. */
  private saveLock = new PromiseChainLock();
  private writingFiles = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(dir: string) {
    this.dir = path.resolve(dir);
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await this.loadRecipes();
  }

  private get filePath(): string {
    return path.join(this.dir, "$recipes.json");
  }

  private async loadRecipes(): Promise<void> {
    try {
      this.recipes = await this.readRecipesFromDisk();
      this.pruneRecipeLocks();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(
          `[RecipeService] Failed to load recipes from disk: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      // File doesn't exist yet — perfectly normal on first run
      this.recipes.clear();
    }
  }

  async reloadFromDisk(): Promise<"changed" | "removed" | "unchanged"> {
    try {
      const nextRecipes = await this.readRecipesFromDisk();
      const prevSerialized = JSON.stringify(
        Array.from(this.recipes.values()),
      );
      const nextSerialized = JSON.stringify(
        Array.from(nextRecipes.values()),
      );
      this.recipes = nextRecipes;
      this.pruneRecipeLocks();
      return prevSerialized === nextSerialized ? "unchanged" : "changed";
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        const hadRecipes = this.recipes.size > 0;
        this.recipes.clear();
        this.recipeLocks.clear();
        return hadRecipes ? "removed" : "unchanged";
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

  private saveRecipes(): Promise<void> {
    return this.saveLock.withLock(() => this._doSave());
  }

  private async _doSave(): Promise<void> {
    const data: RecipesFile = {
      $recipes: Array.from(this.recipes.values()),
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

  async getAll(): Promise<TokenRecipe[]> {
    return Array.from(this.recipes.values());
  }

  async getDashboardItems(
    tokenStore: Pick<TokenStore, "resolveToken">,
  ): Promise<RecipeDashboardItem[]> {
    const recipes = Array.from(this.recipes.values());
    const upstreamIdsByRecipe = new Map<string, string[]>();
    const downstreamIdsByRecipe = new Map<string, string[]>();

    for (const recipe of recipes) {
      upstreamIdsByRecipe.set(recipe.id, []);
      downstreamIdsByRecipe.set(recipe.id, []);
    }

    for (const downstream of recipes) {
      if (!downstream.sourceToken) continue;
      for (const upstream of recipes) {
        if (upstream.id === downstream.id) continue;
        if (!downstream.sourceToken.startsWith(`${upstream.targetGroup}.`)) {
          continue;
        }
        upstreamIdsByRecipe.get(downstream.id)?.push(upstream.id);
        downstreamIdsByRecipe.get(upstream.id)?.push(downstream.id);
      }
    }

    const staleEntries = await Promise.all(
      recipes.map(async (recipe) => {
        if (!recipe.sourceToken) {
          return { id: recipe.id, isStale: false, staleReason: undefined };
        }
        if (!recipe.lastRunAt) {
          return { id: recipe.id, isStale: false, staleReason: undefined };
        }

        const resolved = await tokenStore.resolveToken(recipe.sourceToken).catch(
          () => undefined,
        );
        if (!resolved) {
          return {
            id: recipe.id,
            isStale: true,
            staleReason: `Source token "${recipe.sourceToken}" no longer resolves.`,
          };
        }

        const isStale =
          stableStringify(resolved.$value) !==
          stableStringify(recipe.lastRunSourceValue);
        return {
          id: recipe.id,
          isStale,
          staleReason: isStale
            ? `Source token "${recipe.sourceToken}" changed since the last successful run.`
            : undefined,
        };
      }),
    );

    const staleById = new Map(
      staleEntries.map((entry) => [entry.id, entry] as const),
    );
    const statusById = new Map<string, RecipeDashboardStatus>();

    for (const recipe of recipes) {
      const staleEntry = staleById.get(recipe.id);
      statusById.set(
        recipe.id,
        getRecipeDashboardStatus(recipe, staleEntry?.isStale ?? false),
      );
    }

    const dependencyById = new Map<string, RecipeDashboardDependency>();
    for (const recipe of recipes) {
      dependencyById.set(
        recipe.id,
        buildRecipeDependency(
          recipe,
          statusById.get(recipe.id) ?? "upToDate",
        ),
      );
    }

    return recipes.map((recipe) => {
      const staleEntry = staleById.get(recipe.id);
      const status = statusById.get(recipe.id) ?? "upToDate";
      const upstreamRecipes = (upstreamIdsByRecipe.get(recipe.id) ?? [])
        .map((id) => dependencyById.get(id))
        .filter(
          (
            dependency,
          ): dependency is RecipeDashboardDependency => dependency !== undefined,
        );
      const downstreamRecipes = (
        downstreamIdsByRecipe.get(recipe.id) ?? []
      )
        .map((id) => dependencyById.get(id))
        .filter(
          (
            dependency,
          ): dependency is RecipeDashboardDependency => dependency !== undefined,
        );

      const blockedByName = recipe.lastRunError?.blockedBy?.trim();
      const blockedByRecipes =
        status === "blocked"
          ? upstreamRecipes.filter((dependency) =>
              blockedByName
                ? dependency.name === blockedByName
                : dependency.status === "failed" || dependency.status === "blocked",
            )
          : [];

      const summaryMessage =
        recipe.lastRunError?.message ??
        staleEntry?.staleReason ??
        (!recipe.lastRunAt ? "Run this recipe to create outputs." : undefined);

      return {
        ...recipe,
        isStale: staleEntry?.isStale,
        staleReason: staleEntry?.staleReason,
        upstreamRecipes,
        downstreamRecipes,
        blockedByRecipes,
        lastRunSummary: {
          status,
          label: getRecipeStatusLabel(status),
          at: recipe.lastRunError?.at ?? recipe.lastRunAt,
          message: summaryMessage,
        },
      };
    });
  }

  listCollectionDependencyMeta(): RecipeCollectionDependencyMeta[] {
    return Array.from(this.recipes.values()).map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      targetCollections: getRecipeOutputCollectionIds(recipe),
      targetGroup: recipe.targetGroup,
    }));
  }

  async getAllById(): Promise<Record<string, TokenRecipe>> {
    return Object.fromEntries(
      Array.from(this.recipes.values()).map((recipe) => [
        recipe.id,
        structuredClone(recipe),
      ]),
    );
  }

  async reset(): Promise<void> {
    await this.saveLock.withLock(async () => {
      this.startWriteGuard(this.filePath);
      await fs.rm(this.filePath, { force: true });
      this.recipes.clear();
      this.recipeLocks.clear();
    });
  }

  private async readRecipesFromDisk(): Promise<Map<string, TokenRecipe>> {
    const content = await fs.readFile(this.filePath, "utf-8");
    const data = JSON.parse(content) as Partial<RecipesFile>;
    if (!Array.isArray(data.$recipes)) {
      throw new Error(
        'Invalid recipes file: expected { "$recipes": [] }',
      );
    }

    const nextRecipes = new Map<string, TokenRecipe>();
    for (const rawRecipe of data.$recipes) {
      const normalized = normalizeStoredRecipe(rawRecipe);
      nextRecipes.set(normalized.id, normalized);
    }
    return nextRecipes;
  }

  private pruneRecipeLocks(): void {
    for (const recipeId of this.recipeLocks.keys()) {
      if (!this.recipes.has(recipeId)) {
        this.recipeLocks.delete(recipeId);
      }
    }
  }

  async getById(id: string): Promise<TokenRecipe | undefined> {
    return this.recipes.get(id);
  }

  findOrphanedTokens(
    tokenStore: Pick<TokenStore, "findTokensByRecipeId">,
  ): OrphanedRecipeToken[] {
    const activeIds = new Set(this.recipes.keys());
    return tokenStore
      .findTokensByRecipeId("*")
      .filter((token) => !activeIds.has(token.recipeId));
  }

  async deleteOrphanedTokens(
    tokenStore: Pick<TokenStore, "findTokensByRecipeId" | "deleteTokensByRecipeId">,
  ): Promise<{ deleted: number; tokens: OrphanedRecipeToken[] }> {
    const tokens = this.findOrphanedTokens(tokenStore);
    const orphanIds = new Set(tokens.map((token) => token.recipeId));
    let deleted = 0;
    for (const recipeId of orphanIds) {
      deleted += await tokenStore.deleteTokensByRecipeId(recipeId);
    }
    return { deleted, tokens };
  }

  getScaleOutputPaths(recipe: TokenRecipe): string[] {
    return getRecipeManagedOutputPaths(recipe);
  }

  private filterDetachedResults(
    recipe: TokenRecipe,
    results: GeneratedTokenResult[],
  ): GeneratedTokenResult[] {
    const managedPathSet = new Set(getRecipeManagedOutputPaths(recipe));
    return results.filter((result) => managedPathSet.has(result.path));
  }

  async detachOutputPaths(
    id: string,
    tokenStore: Pick<
      TokenStore,
      "findTokensByRecipeId" | "getToken" | "updateToken"
    >,
    paths: string[],
  ): Promise<DetachedRecipeResult> {
    const existing = this.recipes.get(id);
    if (!existing) throw new NotFoundError(`Recipe "${id}" not found`);
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
            `"${path}" is not an output managed by recipe "${existing.name}"`,
          );
        }
        return path;
      }),
    )].sort();

    const currentDetachedPaths = existing.detachedPaths ?? [];
    const nextDetachedPaths = [
      ...new Set([...currentDetachedPaths, ...detachedPaths]),
    ].sort();

    const recipeBeforeDetach = structuredClone(existing);
    try {
      if (nextDetachedPaths.length !== currentDetachedPaths.length) {
        await this.update(id, { detachedPaths: nextDetachedPaths });
      }
      const recipe = this.recipes.get(id)!;

      const ownedTokens = tokenStore.findTokensByRecipeId(id);
      for (const tokenRef of ownedTokens) {
        if (!detachedPaths.includes(tokenRef.path)) continue;
        const token = await tokenStore.getToken(tokenRef.collectionId, tokenRef.path);
        if (!token) continue;
        const extensions = {
          ...(token.$extensions ?? {}),
        } as Record<string, unknown>;
        delete extensions["com.tokenmanager.recipe"];
        await tokenStore.updateToken(tokenRef.collectionId, tokenRef.path, {
          $extensions: Object.keys(extensions).length > 0 ? extensions : {},
        });
      }

      return {
        recipe,
        detachedPaths,
        detachedCount: detachedPaths.length,
      };
    } catch (err) {
      if (nextDetachedPaths.length !== currentDetachedPaths.length) {
        await this.restore(recipeBeforeDetach);
      }
      throw err;
    }
  }

  async create(data: RecipeCreateInput): Promise<TokenRecipe> {
    const now = new Date().toISOString();
    const recipe = normalizeStoredRecipe({
      ...data,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    this.recipes.set(recipe.id, recipe);
    try {
      this.buildDependencyOrder();
    } catch {
      this.recipes.delete(recipe.id);
      throw new BadRequestError(
        `Creating recipe "${recipe.name}" would introduce a circular dependency. ` +
          "Ensure no recipe sources from its own output group.",
      );
    }
    try {
      await this.saveRecipes();
    } catch (err) {
      this.recipes.delete(recipe.id);
      throw err;
    }
    return recipe;
  }

  async update(
    id: string,
    updates: RecipeUpdateInput,
  ): Promise<TokenRecipe> {
    const existing = this.recipes.get(id);
    if (!existing) throw new NotFoundError(`Recipe "${id}" not found`);
    const updated = normalizeStoredRecipe({
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    });
    this.recipes.set(id, updated);
    try {
      this.buildDependencyOrder();
    } catch {
      this.recipes.set(id, existing);
      throw new BadRequestError(
        `Updating recipe "${updated.name}" would introduce a circular dependency. ` +
          "Ensure no recipe sources from its own output group.",
      );
    }
    try {
      await this.saveRecipes();
    } catch (err) {
      this.recipes.set(id, existing);
      throw err;
    }
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const existing = this.recipes.get(id);
    if (!existing) return false;
    this.recipes.delete(id);
    try {
      await this.saveRecipes();
    } catch (err) {
      this.recipes.set(id, existing);
      throw err;
    }
    return true;
  }

  /**
   * Restore (upsert) a recipe from a full snapshot object.
   * Used by rollback to re-create or revert a recipe to a prior state.
   */
  async restore(recipe: TokenRecipe): Promise<void> {
    const existing = this.recipes.get(recipe.id);
    const normalized = normalizeStoredRecipe(recipe);
    this.recipes.set(normalized.id, normalized);
    try {
      this.buildDependencyOrder();
      await this.saveRecipes();
    } catch (err) {
      if (existing) {
        this.recipes.set(existing.id, existing);
      } else {
        this.recipes.delete(normalized.id);
      }
      throw err;
    }
  }

  /**
   * Update recipe references when a collection id is renamed.
   * Updates targetCollection for any recipe pointing at the old collection id.
   * Returns the count of recipes updated.
   */
  async renameCollectionId(
    oldCollectionId: string,
    newCollectionId: string,
  ): Promise<number> {
    let count = 0;
    for (const [id, gen] of this.recipes) {
      if (gen.targetCollection === oldCollectionId) {
        this.recipes.set(id, {
          ...gen,
          targetCollection: newCollectionId,
        });
        count++;
      }
    }
    if (count > 0) await this.saveRecipes();
    return count;
  }

  /**
   * Apply structural token/group path renames to recipe references.
   * Token renames update exact sourceToken matches.
   * Group renames update exact/prefix matches for sourceToken and targetGroup.
   * Returns the count of recipes updated.
   */
  async applyPathRenames(
    renames: RecipePathRenameUpdate[],
  ): Promise<number> {
    if (renames.length === 0) {
      return 0;
    }

    let count = 0;
    for (const [id, gen] of this.recipes) {
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
        this.recipes.set(id, {
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
    if (count > 0) await this.saveRecipes();
    return count;
  }

  /**
   * Update recipe references when a single token path changes.
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
   * Update recipe references when a token group is renamed.
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
   * Update recipe references after a bulk find/replace rename operation.
   * Applies the same string transformation to sourceToken and targetGroup.
   * Returns the count of recipes updated.
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
    for (const [id, gen] of this.recipes) {
      const updates: Partial<TokenRecipe> = {};
      if (gen.sourceToken) {
        const next = apply(gen.sourceToken);
        if (next !== gen.sourceToken) updates.sourceToken = next;
      }
      const nextGroup = apply(gen.targetGroup);
      if (nextGroup !== gen.targetGroup) updates.targetGroup = nextGroup;
      if (Object.keys(updates).length > 0) {
        this.recipes.set(id, { ...gen, ...updates });
        count++;
      }
    }
    if (count > 0) await this.saveRecipes();
    return count;
  }

  /**
   * Set or clear a per-step override on a recipe.
   * Pass null to remove the override for that step.
   */
  async setStepOverride(
    id: string,
    stepName: string,
    override: { value: unknown; locked: boolean } | null,
  ): Promise<TokenRecipe> {
    validateStepName(stepName);

    const existing = this.recipes.get(id);
    if (!existing) throw new NotFoundError(`Recipe "${id}" not found`);

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
    data: RecipePreviewInput,
    tokenStore: TokenStore,
    sourceValue?: unknown,
  ): Promise<GeneratedTokenResult[]> {
    const result = await this.previewWithAnalysis(data, tokenStore, sourceValue);
    return result.tokens;
  }

  async previewWithAnalysis(
    data: RecipePreviewInput,
    tokenStore: TokenStore,
    sourceValue?: unknown,
  ): Promise<RecipePreviewResult> {
    const type = normalizeRecipeType(data.type);
    const baseRecipeId =
      typeof data.baseRecipeId === "string" && data.baseRecipeId.trim()
        ? data.baseRecipeId.trim()
        : undefined;
    const baseRecipe = baseRecipeId
      ? this.recipes.get(baseRecipeId)
      : undefined;
    const detachedPaths =
      normalizeDetachedPaths(data.detachedPaths) ?? baseRecipe?.detachedPaths;
    const semanticLayer = normalizeSemanticLayer(data.semanticLayer);
    const normalizedData: RecipePreviewInput & {
      type: RecipeType;
      config: RecipeConfig;
      overrides?: Record<string, { value: unknown; locked: boolean }>;
      detachedPaths?: string[];
      semanticLayer?: RecipeSemanticLayer;
    } = {
      sourceToken: data.sourceToken,
      inlineValue: data.inlineValue,
      targetGroup: data.targetGroup,
      targetCollection: data.targetCollection,
      baseRecipeId: data.baseRecipeId,
      type,
      config: normalizeRecipeConfig(type, data.config),
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
      baseRecipe,
    );
    return { tokens, analysis };
  }

  private buildPreviewFingerprint(payload: unknown): string {
    return createHash("sha1").update(stableStringify(payload)).digest("hex");
  }

  private async analyzePreviewResults(
    data: RecipePreviewInput & {
      type: RecipeType;
      config: RecipeConfig;
      overrides?: Record<string, { value: unknown; locked: boolean }>;
      detachedPaths?: string[];
      semanticLayer?: RecipeSemanticLayer;
    },
    preview: GeneratedTokenResult[],
    tokenStore: TokenStore,
    baseRecipe?: TokenRecipe,
  ): Promise<RecipePreviewAnalysis> {
    const targetCollection = data.targetCollection;
    const existingPathSet = new Set<string>();
    const safeUpdates: RecipePreviewChangeEntry[] = [];
    const nonRecipeOverwrites: RecipePreviewOverwriteEntry[] = [];
    const manualEditConflicts: RecipePreviewManualConflictEntry[] = [];
    const detachedOutputs: RecipePreviewDetachedEntry[] = [];
    const diffCreated: RecipePreviewAnalysis["diff"]["created"] = [];
    const diffUpdated: RecipePreviewAnalysis["diff"]["updated"] = [];
    const diffUnchanged: RecipePreviewAnalysis["diff"]["unchanged"] = [];
    const previewPathSet = new Set(preview.map((result) => result.path));
    const detachedPathSet = new Set(data.detachedPaths ?? []);

    const baselinePreviewMap = baseRecipe
      ? new Map(
          (await this.computeResults(baseRecipe, tokenStore)).map((result) => [
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
      const ext = existing.$extensions?.["com.tokenmanager.recipe"];

      if (detachedPathSet.has(result.path)) {
        detachedOutputs.push({
          path: result.path,
          collectionId: targetCollection,
          type: result.type,
          currentValue: existing.$value,
          newValue: result.value,
          state: "recreated",
        });
      } else if (baseRecipe && ext?.recipeId === baseRecipe.id) {
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
        nonRecipeOverwrites.push({
          path: result.path,
          collectionId: targetCollection,
          type: result.type,
          currentValue: existing.$value,
          newValue: result.value,
          changesValue,
          owner: ext?.recipeId ? "recipe" : "manual",
          recipeId: ext?.recipeId,
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

    const deletedOutputs: RecipePreviewDeletedEntry[] = [];
    if (baseRecipe) {
      const desiredOutputKeys = new Set(
        (
          await this.collectDesiredPreviewOutputs(
            data,
            preview,
            baseRecipe,
          )
        ).map((output) => `${output.collectionId}::${output.path}`),
      );
      const ownedTokens = tokenStore.findTokensByRecipeId(baseRecipe.id);
      for (const owned of ownedTokens) {
        const token = await tokenStore.getToken(owned.collectionId, owned.path);
        const ext = token?.$extensions?.["com.tokenmanager.recipe"];
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

    const analysisWithoutFingerprint = {
      safeCreateCount: diffCreated.length,
      unchangedCount: diffUnchanged.length,
      existingPathSet: [...existingPathSet],
      safeUpdates,
      nonRecipeOverwrites,
      manualEditConflicts,
      deletedOutputs,
      detachedOutputs,
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
    } satisfies Omit<RecipePreviewAnalysis, "fingerprint">;

    return {
      ...analysisWithoutFingerprint,
      fingerprint: this.buildPreviewFingerprint({
        targetCollection,
        preview,
        analysis: analysisWithoutFingerprint,
      }),
    };
  }

  /** Run a saved recipe and persist the derived tokens. */
  async run(
    id: string,
    tokenStore: TokenStore,
  ): Promise<GeneratedTokenResult[]> {
    const recipe = this.recipes.get(id);
    if (!recipe) throw new NotFoundError(`Recipe "${id}" not found`);
    return this.withRecipeLock(id, () =>
      this.executeRecipe(recipe, tokenStore),
    );
  }

  /**
   * Check which existing tokens would be overwritten by a recipe re-run
   * and whether they have been manually edited (value differs from what the
   * recipe would produce).
   */
  async checkOverwrites(
    id: string,
    tokenStore: TokenStore,
  ): Promise<
    {
      path: string;
      collectionId: string;
      currentValue: unknown;
      newValue: unknown;
    }[]
  > {
    const recipe = this.recipes.get(id);
    if (!recipe) throw new NotFoundError(`Recipe "${id}" not found`);
    const preview = await this.computeResults(recipe, tokenStore);
    const effectiveTargetCollection = recipe.targetCollection;
    const modified: {
      path: string;
      collectionId: string;
      currentValue: unknown;
      newValue: unknown;
    }[] = [];
    for (const result of preview) {
      const existing = await tokenStore.getToken(
        effectiveTargetCollection,
        result.path,
      );
      if (
        existing &&
        stableStringify(existing.$value) !== stableStringify(result.value)
      ) {
        // Only flag tokens that are actually tagged as generated by this recipe
        const ext = existing.$extensions?.["com.tokenmanager.recipe"];
        if (ext?.recipeId === id) {
          modified.push({
            path: result.path,
            collectionId: effectiveTargetCollection,
            currentValue: existing.$value,
            newValue: result.value,
          });
        }
      }
    }
    return modified;
  }

  /**
   * Compute a full diff of what a recipe re-run would produce, without
   * persisting anything.  Returns tokens classified as created / updated /
   * deleted / unchanged so the UI can show an accurate preview.
   *
   * - created:   in preview results but not yet in the token store
   * - updated:   in preview results AND in store but the value would change
   * - unchanged: in preview results AND in store with identical value
   * - deleted:   in the store (tagged with this recipe's id) but NOT in the
   *              preview results (e.g. a step was removed from the config)
   */
  async dryRun(
    id: string,
    tokenStore: TokenStore,
  ): Promise<{
    created: Array<{ path: string; value: unknown; type: string }>;
    updated: Array<{
      path: string;
      currentValue: unknown;
      newValue: unknown;
      type: string;
    }>;
    unchanged: Array<{ path: string; value: unknown; type: string }>;
    deleted: Array<{ path: string; currentValue: unknown }>;
  }> {
    const recipe = this.recipes.get(id);
    if (!recipe) throw new NotFoundError(`Recipe "${id}" not found`);

    const preview = await this.computeResults(recipe, tokenStore);
    const targetCollection = recipe.targetCollection;

    const created: Array<{ path: string; value: unknown; type: string }> = [];
    const updated: Array<{
      path: string;
      currentValue: unknown;
      newValue: unknown;
      type: string;
    }> = [];
    const unchanged: Array<{ path: string; value: unknown; type: string }> = [];
    const previewPaths = new Set<string>();

    for (const result of preview) {
      previewPaths.add(result.path);
      const existing = await tokenStore.getToken(targetCollection, result.path);
      if (!existing) {
        created.push({
          path: result.path,
          value: result.value,
          type: result.type,
        });
      } else if (
        stableStringify(existing.$value) !== stableStringify(result.value)
      ) {
        updated.push({
          path: result.path,
          currentValue: existing.$value,
          newValue: result.value,
          type: result.type,
        });
      } else {
        unchanged.push({
          path: result.path,
          value: result.value,
          type: result.type,
        });
      }
    }

    // Detect tokens that belong to this recipe but would be removed because
    // they are no longer in the preview results (e.g. a step was deleted).
    const flatTokens = await tokenStore.getFlatTokensForCollection(
      targetCollection,
    );
    const prefix = recipe.targetGroup ? recipe.targetGroup + "." : "";
    const deleted: Array<{ path: string; currentValue: unknown }> = [];
    for (const [path, token] of Object.entries(flatTokens)) {
      if (prefix && !path.startsWith(prefix) && path !== recipe.targetGroup)
        continue;
      const ext = token.$extensions?.["com.tokenmanager.recipe"];
      if (ext?.recipeId === id && !previewPaths.has(path)) {
        deleted.push({ path, currentValue: token.$value });
      }
    }

    return { created, updated, unchanged, deleted };
  }

  /** Returns true if any recipe is currently executing (has a pending lock chain). */
  isAnyRunning(): boolean {
    return this.recipeLocks.size > 0;
  }

  /**
   * Run all recipes affected by the given token path, in topological order.
   * Handles chained recipes (Recipe B sourcing from Recipe A's output).
   * Safe to call from a token-update event listener.
   */
  async runForSourceToken(
    tokenPath: string,
    tokenStore: TokenStore,
  ): Promise<void> {
    // Find all recipes that directly source this token (skip disabled ones)
    const directlyAffected = new Set(
      [...this.recipes.values()]
        .filter((g) => g.sourceToken === tokenPath && g.enabled !== false)
        .map((g) => g.id),
    );
    if (directlyAffected.size === 0) return;

    // Get topological execution order for all recipes
    let order: string[];
    try {
      order = this.buildDependencyOrder();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[RecipeService] Dependency graph error:", err);
      tokenStore.emitEvent({
        type: "recipe-error",
        collectionId: "",
        message: `Dependency graph error: ${message}`,
      });
      return;
    }

    // Expand the affected recipe group to include transitive dependents (skip disabled ones)
    const affected = new Set(directlyAffected);
    for (const genId of order) {
      if (affected.has(genId)) continue;
      const gen = this.recipes.get(genId);
      if (!gen?.sourceToken) continue;
      if (gen.enabled === false) continue;
      for (const affectedId of affected) {
        const affectedGen = this.recipes.get(affectedId);
        if (
          affectedGen &&
          gen.sourceToken.startsWith(affectedGen.targetGroup + ".")
        ) {
          affected.add(genId);
          break;
        }
      }
    }

    // Execute in topological order, serialized per-recipe via promise-chain locks.
    // Track failed recipe IDs so downstream dependents can be skipped — running
    // a downstream recipe after its upstream failed would process stale output.
    const failedIds = new Set<string>();
    for (const genId of order) {
      if (!affected.has(genId)) continue;
      const gen = this.recipes.get(genId);
      if (!gen) continue;

      // Skip if any upstream recipe (whose output this one sources from) failed.
      const blockingGen = gen.sourceToken
        ? [...failedIds]
            .map((failedId) => this.recipes.get(failedId))
            .find(
              (failedGen) =>
                failedGen &&
                gen.sourceToken!.startsWith(failedGen.targetGroup + "."),
            )
        : undefined;
      if (blockingGen) {
        const message = `Blocked: upstream recipe "${blockingGen.name}" failed`;
        const current = this.recipes.get(genId);
        if (current) {
          this.recipes.set(genId, {
            ...current,
            lastRunError: {
              message,
              at: new Date().toISOString(),
              blockedBy: blockingGen.name,
            },
          });
          await this.saveRecipes();
        }
        console.warn(
          `[RecipeService] Recipe "${gen.name}" blocked because upstream "${blockingGen.name}" failed`,
        );
        tokenStore.emitEvent({
          type: "recipe-error",
          collectionId: "",
          recipeId: genId,
          message,
        });
        failedIds.add(genId);
        continue;
      }

      await this.withRecipeLock(genId, () =>
        this.executeRecipe(gen, tokenStore),
      ).catch(async (err) => {
        const message = err instanceof Error ? err.message : String(err);
        const current = this.recipes.get(genId);
        if (current) {
          this.recipes.set(genId, {
            ...current,
            lastRunError: { message, at: new Date().toISOString() },
          });
          await this.saveRecipes();
        }
        console.warn(
          `[RecipeService] Recipe "${genId}" failed after token update:`,
          err,
        );
        tokenStore.emitEvent({
          type: "recipe-error",
          collectionId: "",
          recipeId: genId,
          message,
        });
        failedIds.add(genId);
      });
    }
  }

  /**
   * Build a topologically-sorted list of all recipe IDs.
   * Recipes that depend on another recipe's output come after it.
   * Throws if a dependency cycle is detected.
   */
  private buildDependencyOrder(): string[] {
    // Map targetGroup -> set of recipeIds for producer lookup
    const producerByGroup = new Map<string, Set<string>>();
    for (const [id, gen] of this.recipes) {
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

    for (const [id] of this.recipes) {
      inDegree.set(id, 0);
      edges.set(id, new Set());
    }

    for (const [id, gen] of this.recipes) {
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

    if (result.length !== this.recipes.size) {
      throw new Error(
        "[RecipeService] Cycle detected in recipe dependencies. " +
          "Check that no recipe sources from its own output.",
      );
    }

    return result;
  }

  /**
   * Promise-chain mutex per recipe. Concurrent calls for the same recipe
   * are serialized — the second waits for the first to finish instead of being
   * silently skipped or running in parallel.
   */
  private withRecipeLock<T>(
    recipeId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const prev = this.recipeLocks.get(recipeId) ?? Promise.resolve();
    const next = prev.then(
      () => fn(),
      () => fn(),
    );
    // Store the void chain (swallow errors so subsequent callers still run)
    const voidChain = next.then(
      () => {},
      () => {},
    );
    this.recipeLocks.set(recipeId, voidChain);
    // Clean up when the chain settles and no new work was appended
    voidChain.then(() => {
      if (this.recipeLocks.get(recipeId) === voidChain) {
        this.recipeLocks.delete(recipeId);
      }
    });
    return next;
  }

  private async executeRecipe(
    recipe: TokenRecipe,
    tokenStore: TokenStore,
  ): Promise<GeneratedTokenResult[]> {
    const results = await this.executeSingleBrand(
      recipe,
      tokenStore,
      recipe.targetCollection,
    );

    // Track when the recipe was last run and what the source token's value was,
    // so the UI can detect whether re-running is needed after a source token edit.
    // We update the in-memory record directly (preserving updatedAt) and persist.
    // Important: resolve the source token value BEFORE the final re-read, then
    // re-read current AFTER all awaits so concurrent update() calls are not lost.
    const runAt = new Date().toISOString();
    let lastRunSourceValue: unknown;
    if (recipe.sourceToken) {
      const resolved = await tokenStore.resolveToken(recipe.sourceToken);
      if (resolved) lastRunSourceValue = resolved.$value;
    }
    // Re-read after all awaits — prevents overwriting concurrent update() mutations.
    // Also clears any prior lastRunError since all async operations succeeded.
    const current = this.recipes.get(recipe.id);
    if (current) {
      this.recipes.set(recipe.id, {
        ...current,
        lastRunAt: runAt,
        lastRunSourceValue:
          lastRunSourceValue !== undefined
            ? lastRunSourceValue
            : current.lastRunSourceValue,
        lastRunError: undefined,
      });
      await this.saveRecipes();
    }

    return results;
  }

  /** Removes non-locked overrides from a recipe after execution. */
  private async clearNonLockedOverrides(
    recipe: TokenRecipe,
  ): Promise<void> {
    const overrides = recipe.overrides;
    if (!overrides) return;
    const cleaned: Record<string, { value: unknown; locked: boolean }> = {};
    for (const [key, val] of Object.entries(
      overrides as Record<string, { value: unknown; locked: boolean }>,
    )) {
      if (val.locked) cleaned[key] = val;
    }
    if (Object.keys(cleaned).length !== Object.keys(overrides).length) {
      const hasRemaining = Object.keys(cleaned).length > 0;
      await this.update(recipe.id, {
        overrides: hasRemaining ? cleaned : undefined,
      });
    }
  }

  private buildRecipeExtensions(
    recipe: TokenRecipe,
    outputKind: "scale" | "semantic",
  ): Token["$extensions"] {
    return {
      "com.tokenmanager.recipe": {
        recipeId: recipe.id,
        sourceToken: recipe.sourceToken ?? "",
        outputKind,
      },
    };
  }

  private buildSemanticAliasResults(
    recipe: Pick<TokenRecipe, "targetGroup" | "semanticLayer">,
    results: GeneratedTokenResult[],
  ): Array<
    GeneratedTokenResult & {
      sourceStep: string;
    }
  > {
    const semanticLayer = recipe.semanticLayer;
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
          value: `{${recipe.targetGroup}.${mapping.step}}`,
          sourceStep: mapping.step,
        },
      ];
      },
    );
  }

  private buildDesiredGeneratedOutputs(
    recipe: Pick<TokenRecipe, "targetGroup" | "semanticLayer">,
    effectiveTargetCollection: string,
    results: GeneratedTokenResult[],
  ): Array<{ collectionId: string; path: string }> {
    return [
      ...results.map((result) => ({
        collectionId: effectiveTargetCollection,
        path: result.path,
      })),
      ...this.buildSemanticAliasResults(recipe, results).map((result) => ({
        collectionId: effectiveTargetCollection,
        path: result.path,
      })),
    ];
  }

  private async collectDesiredPreviewOutputs(
    data: RecipePreviewInput & {
      type: RecipeType;
      config: RecipeConfig;
      overrides?: Record<string, { value: unknown; locked: boolean }>;
      detachedPaths?: string[];
      semanticLayer?: RecipeSemanticLayer;
    },
    preview: GeneratedTokenResult[],
    baseRecipe?: TokenRecipe,
  ): Promise<Array<{ collectionId: string; path: string }>> {
    const recipeShape = {
      targetGroup: data.targetGroup,
      semanticLayer: data.semanticLayer ?? baseRecipe?.semanticLayer,
    };

    return this.buildDesiredGeneratedOutputs(
      recipeShape,
      data.targetCollection,
      preview,
    );
  }

  private async syncSemanticLayer(
    recipe: TokenRecipe,
    tokenStore: TokenStore,
    effectiveTargetCollection: string,
    results: GeneratedTokenResult[],
  ): Promise<void> {
    const semanticResults = this.buildSemanticAliasResults(recipe, results);
    const extensions = this.buildRecipeExtensions(recipe, "semantic");

    for (const result of semanticResults) {
      const token: Token = {
        $type: result.type as TokenType,
        $value: result.value as Token["$value"],
        $description: `Semantic reference for ${recipe.targetGroup}.${result.sourceStep}`,
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
    recipe: TokenRecipe,
    tokenStore: Pick<
      TokenStore,
      "deleteTokens" | "findTokensByRecipeId" | "getToken"
    >,
    desiredOutputs: Array<{ collectionId: string; path: string }>,
  ): Promise<void> {
    const desiredKeys = new Set(
      desiredOutputs.map((output) => `${output.collectionId}::${output.path}`),
    );
    const tokensToDeleteByCollection = new Map<string, string[]>();
    const ownedTokens = tokenStore.findTokensByRecipeId(recipe.id);

    for (const owned of ownedTokens) {
      if (desiredKeys.has(`${owned.collectionId}::${owned.path}`)) continue;
      const token = await tokenStore.getToken(owned.collectionId, owned.path);
      const ext = token?.$extensions?.["com.tokenmanager.recipe"];
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
    recipe: TokenRecipe,
    tokenStore: TokenStore,
    effectiveTargetCollection: string,
    sourceValueOverride?: unknown,
  ): Promise<GeneratedTokenResult[]> {
    const results =
      sourceValueOverride !== undefined
        ? await this.computeResultsWithValue(recipe, sourceValueOverride)
        : await this.computeResults(recipe, tokenStore);

    await this.clearNonLockedOverrides(recipe);

    const snapshotCollectionIds = new Set([effectiveTargetCollection]);
    for (const owned of tokenStore.findTokensByRecipeId(recipe.id)) {
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

    const extensions = this.buildRecipeExtensions(recipe, "scale");
    let runError: unknown = undefined;
    try {
      const desiredOutputs = this.buildDesiredGeneratedOutputs(
        recipe,
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
        recipe,
        tokenStore,
        effectiveTargetCollection,
        results,
      );
      await this.cleanupStaleGeneratedOutputs(
        recipe,
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
          `Recipe run failed and rollback also failed (${rollbackSummary}). Token state may be inconsistent.`,
        );
      }
      throw runError;
    }

    return results;
  }

  /**
   * Core dispatch: given a pre-resolved source value (or undefined for source-free recipes),
   * run the appropriate recipe and apply overrides.
   */
  private async computeResultsWithValue(
    recipe: RecipeExecutionInput,
    resolvedValue: unknown,
  ): Promise<GeneratedTokenResult[]> {
    const { type, targetGroup, config } = recipe;
    let results: GeneratedTokenResult[];

    switch (type) {
      case "colorRamp": {
        const hex = typeof resolvedValue === "string" ? resolvedValue : null;
        if (!hex)
          throw new BadRequestError(
            `Source value for colorRamp must be a color string`,
          );
        results = runColorRampRecipe(
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
        results = runTypeScaleRecipe(
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
        results = runSpacingScaleRecipe(
          dim,
          config as SpacingScaleConfig,
          targetGroup,
        );
        break;
      }
      case "opacityScale": {
        results = runOpacityScaleRecipe(
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
        results = runBorderRadiusScaleRecipe(
          dim,
          config as BorderRadiusScaleConfig,
          targetGroup,
        );
        break;
      }
      case "zIndexScale": {
        results = runZIndexScaleRecipe(
          config as ZIndexScaleConfig,
          targetGroup,
        );
        break;
      }
      case "shadowScale": {
        results = runShadowScaleRecipe(
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
        results = runCustomScaleRecipe(
          base,
          config as CustomScaleConfig,
          targetGroup,
        );
        break;
      }
      case "accessibleColorPair": {
        const hex = typeof resolvedValue === "string" ? resolvedValue : null;
        if (!hex)
          throw new BadRequestError(
            `Source value for accessibleColorPair must be a color string`,
          );
        results = runAccessibleColorPairRecipe(
          hex,
          config as AccessibleColorPairConfig,
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
        results = runDarkModeInversionRecipe(
          hex,
          config as DarkModeInversionConfig,
          targetGroup,
        );
        break;
      }
      default:
        throw new BadRequestError(`Unknown recipe type: ${type}`);
    }

    return this.filterDetachedResults(
      recipe as TokenRecipe,
      applyOverrides(results, recipe.overrides),
    );
  }

  /**
   * Resolves any $tokenRefs in a recipe config by looking up each referenced
   * token in the token store and replacing the config field with the resolved value.
   * Returns a copy of the config with tokenRef fields overridden, or the original
   * config if there are no tokenRefs or all resolutions fail gracefully.
   */
  private async resolveConfigTokenRefs(
    config: TokenRecipe["config"],
    tokenStore: TokenStore,
  ): Promise<TokenRecipe["config"]> {
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
    return { ...config, ...overrides } as TokenRecipe["config"];
  }

  private async computeResults(
    recipe: RecipeExecutionInput,
    tokenStore: TokenStore,
  ): Promise<GeneratedTokenResult[]> {
    const { type, sourceToken, inlineValue } = recipe;

    const needsSource =
      type === "colorRamp" ||
      type === "typeScale" ||
      type === "spacingScale" ||
      type === "borderRadiusScale" ||
      type === "accessibleColorPair" ||
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
          `Recipe type "${type}" requires a source token or inline value`,
        );
      }
    }

    // Resolve any $tokenRefs in the config before executing
    const resolvedConfig = await this.resolveConfigTokenRefs(
      recipe.config,
      tokenStore,
    );
    return this.computeResultsWithValue(
      { ...recipe, config: resolvedConfig },
      resolvedValue,
    );
  }
}
