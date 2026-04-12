import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  GeneratorType,
  GeneratorConfig,
  TokenGenerator,
  GeneratedTokenResult,
  TokenType,
  Token,
  InputTable,
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
  runAccessibleColorPairGenerator,
  runDarkModeInversionGenerator,
  runContrastCheckGenerator,
  applyOverrides,
  substituteVars,
  validateStepName,
} from "@tokenmanager/core";
import type { TokenStore } from "./token-store.js";
import { stableStringify } from "./stable-stringify.js";
import { NotFoundError, BadRequestError } from "../errors.js";
import { PromiseChainLock } from "../utils/promise-chain-lock.js";

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
  "accessibleColorPair",
  "darkModeInversion",
  "contrastCheck",
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
  | "inputTable"
> & {
  type: unknown;
  config?: unknown;
  overrides?: unknown;
  inputTable?: unknown;
};

export type GeneratorUpdateInput = Partial<
  Omit<
    TokenGenerator,
    "id" | "createdAt" | "type" | "config" | "overrides" | "inputTable"
  >
> & {
  type?: unknown;
  config?: unknown;
  overrides?: unknown;
  inputTable?: unknown;
};

export type GeneratorPreviewInput = Pick<
  TokenGenerator,
  "sourceToken" | "inlineValue" | "targetGroup" | "targetSet"
> & {
  type: unknown;
  config?: unknown;
  overrides?: unknown;
};

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

function normalizeInputTable(raw: unknown): InputTable | undefined {
  if (raw === undefined) return undefined;
  if (!isObj(raw)) {
    throw new BadRequestError("inputTable must be an object");
  }
  if (typeof raw.inputKey !== "string" || raw.inputKey === "") {
    throw new BadRequestError("inputTable.inputKey must be a non-empty string");
  }
  if (!Array.isArray(raw.rows)) {
    throw new BadRequestError("inputTable.rows must be an array");
  }
  const rows: InputTable["rows"] = [];
  for (let i = 0; i < raw.rows.length; i++) {
    const row = raw.rows[i];
    if (!isObj(row)) {
      throw new BadRequestError(`inputTable.rows[${i}] must be an object`);
    }
    if (typeof row.brand !== "string" || row.brand === "") {
      throw new BadRequestError(
        `inputTable.rows[${i}].brand must be a non-empty string`,
      );
    }
    if (!isObj(row.inputs)) {
      throw new BadRequestError(
        `inputTable.rows[${i}].inputs must be an object`,
      );
    }
    rows.push({ brand: row.brand, inputs: row.inputs });
  }
  return { inputKey: raw.inputKey, rows };
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
    case "contrastCheck": {
      if (typeof c.backgroundHex !== "string")
        throw new BadRequestError(
          'contrastCheck config requires "backgroundHex" as string',
        );
      if (
        !Array.isArray(c.steps) ||
        !c.steps.every(
          (step: unknown) =>
            isObj(step) &&
            typeof step.name === "string" &&
            typeof step.hex === "string",
        )
      ) {
        throw new BadRequestError(
          'contrastCheck config requires "steps" as Array<{name: string, hex: string}>',
        );
      }
      if (
        !Array.isArray(c.levels) ||
        !c.levels.every((level: unknown) => level === "AA" || level === "AAA")
      ) {
        throw new BadRequestError(
          'contrastCheck config requires "levels" as Array<"AA" | "AAA">',
        );
      }
      const tokenRefs = validateTokenRefs(c.$tokenRefs, ["backgroundHex"]);
      return {
        backgroundHex: c.backgroundHex as string,
        steps: (c.steps as Array<Record<string, unknown>>).map((step) => ({
          name: step.name as string,
          hex: step.hex as string,
        })),
        levels: c.levels as ("AA" | "AAA")[],
        ...(tokenRefs && { $tokenRefs: tokenRefs }),
      } satisfies ContrastCheckConfig;
    }
  }
}

function normalizeStoredGenerator(raw: unknown): TokenGenerator {
  if (!isObj(raw)) throw new BadRequestError("entry is not an object");
  if (typeof raw.id !== "string" || raw.id === "")
    throw new BadRequestError('missing or invalid "id"');
  if (typeof raw.name !== "string")
    throw new BadRequestError('missing or invalid "name"');
  if (typeof raw.targetSet !== "string")
    throw new BadRequestError('missing or invalid "targetSet"');
  if (typeof raw.targetGroup !== "string")
    throw new BadRequestError('missing or invalid "targetGroup"');
  if (typeof raw.createdAt !== "string")
    throw new BadRequestError('missing or invalid "createdAt"');
  if (typeof raw.updatedAt !== "string")
    throw new BadRequestError('missing or invalid "updatedAt"');
  if (raw.sourceToken !== undefined && typeof raw.sourceToken !== "string") {
    throw new BadRequestError("sourceToken must be a string when provided");
  }
  if (
    raw.targetSetTemplate !== undefined &&
    typeof raw.targetSetTemplate !== "string"
  ) {
    throw new BadRequestError(
      "targetSetTemplate must be a string when provided",
    );
  }
  if (raw.enabled !== undefined && typeof raw.enabled !== "boolean") {
    throw new BadRequestError("enabled must be a boolean when provided");
  }
  if (raw.lastRunAt !== undefined && typeof raw.lastRunAt !== "string") {
    throw new BadRequestError("lastRunAt must be a string when provided");
  }

  const type = normalizeGeneratorType(raw.type);
  const overrides = normalizeOverrides(raw.overrides);
  const inputTable = normalizeInputTable(raw.inputTable);
  const lastRunError = normalizeLastRunError(raw.lastRunError);
  return {
    id: raw.id,
    type,
    name: raw.name,
    ...(raw.sourceToken !== undefined && { sourceToken: raw.sourceToken }),
    ...(raw.inlineValue !== undefined && { inlineValue: raw.inlineValue }),
    targetSet: raw.targetSet,
    targetGroup: raw.targetGroup,
    config: normalizeGeneratorConfig(type, raw.config),
    ...(overrides && { overrides }),
    ...(inputTable && { inputTable }),
    ...(raw.targetSetTemplate !== undefined && {
      targetSetTemplate: raw.targetSetTemplate,
    }),
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

  constructor(dir: string) {
    this.dir = path.resolve(dir);
  }

  async initialize(): Promise<void> {
    await this.loadGenerators();
  }

  private get filePath(): string {
    return path.join(this.dir, "$generators.json");
  }

  private async loadGenerators(): Promise<void> {
    try {
      const content = await fs.readFile(this.filePath, "utf-8");
      const data = JSON.parse(content);
      if (
        typeof data !== "object" ||
        data === null ||
        !Array.isArray(data.$generators)
      ) {
        console.warn(
          "[GeneratorService] Invalid generators file: expected { $generators: [...] }",
        );
        this.generators.clear();
        return;
      }
      this.generators.clear();
      for (const gen of data.$generators) {
        try {
          const normalized = normalizeStoredGenerator(gen);
          this.generators.set(normalized.id, normalized);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const id =
            isObj(gen) && typeof gen.id === "string" ? gen.id : "(no id)";
          console.warn(
            `[GeneratorService] Skipping invalid generator entry: ${message}`,
            id,
          );
          continue;
        }
      }
    } catch {
      // File doesn't exist yet — perfectly normal on first run
      this.generators.clear();
    }
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
    try {
      await fs.rename(tmp, this.filePath);
    } catch (err) {
      await fs.unlink(tmp).catch(() => {});
      throw err;
    }
  }

  async getAll(): Promise<TokenGenerator[]> {
    return Array.from(this.generators.values());
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
      await fs.rm(this.filePath, { force: true });
      this.generators.clear();
      this.generatorLocks.clear();
    });
  }

  async getById(id: string): Promise<TokenGenerator | undefined> {
    return this.generators.get(id);
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
   * Update generator references when a token set is renamed.
   * Updates targetSet for any generator pointing at the old set name.
   * Returns the count of generators updated.
   */
  async updateSetName(oldSetName: string, newSetName: string): Promise<number> {
    let count = 0;
    for (const [id, gen] of this.generators) {
      if (gen.targetSet === oldSetName) {
        this.generators.set(id, { ...gen, targetSet: newSetName });
        count++;
      }
    }
    if (count > 0) await this.saveGenerators();
    return count;
  }

  /**
   * Update generator references when a single token path changes.
   * Updates sourceToken for exact path matches.
   * Returns the count of generators updated.
   */
  async updateTokenPaths(pathMap: Map<string, string>): Promise<number> {
    let count = 0;
    for (const [id, gen] of this.generators) {
      if (gen.sourceToken && pathMap.has(gen.sourceToken)) {
        this.generators.set(id, {
          ...gen,
          sourceToken: pathMap.get(gen.sourceToken)!,
        });
        count++;
      }
    }
    if (count > 0) await this.saveGenerators();
    return count;
  }

  /**
   * Update generator references when a token group is renamed.
   * Updates sourceToken (prefix match) and targetGroup (exact or prefix match).
   * Returns the count of generators updated.
   */
  async updateGroupPath(
    oldGroupPath: string,
    newGroupPath: string,
  ): Promise<number> {
    let count = 0;
    const prefix = oldGroupPath + ".";
    for (const [id, gen] of this.generators) {
      const updates: Partial<TokenGenerator> = {};
      if (gen.sourceToken) {
        if (gen.sourceToken === oldGroupPath) {
          updates.sourceToken = newGroupPath;
        } else if (gen.sourceToken.startsWith(prefix)) {
          updates.sourceToken =
            newGroupPath + gen.sourceToken.slice(oldGroupPath.length);
        }
      }
      if (gen.targetGroup === oldGroupPath) {
        updates.targetGroup = newGroupPath;
      } else if (gen.targetGroup.startsWith(prefix)) {
        updates.targetGroup =
          newGroupPath + gen.targetGroup.slice(oldGroupPath.length);
      }
      if (Object.keys(updates).length > 0) {
        this.generators.set(id, { ...gen, ...updates });
        count++;
      }
    }
    if (count > 0) await this.saveGenerators();
    return count;
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
    const type = normalizeGeneratorType(data.type);
    const normalizedData = {
      ...data,
      type,
      config: normalizeGeneratorConfig(type, data.config),
      overrides: normalizeOverrides(data.overrides),
    };
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
      return this.computeResultsWithValue(resolvedData, sourceValue);
    }
    return this.computeResults(normalizedData, tokenStore);
  }

  /** Run a saved generator and persist the derived tokens. */
  async run(
    id: string,
    tokenStore: TokenStore,
  ): Promise<GeneratedTokenResult[]> {
    const generator = this.generators.get(id);
    if (!generator) throw new NotFoundError(`Generator "${id}" not found`);
    return this.withGeneratorLock(id, () =>
      this.executeGenerator(generator, tokenStore),
    );
  }

  /**
   * Check which existing tokens would be overwritten by a generator re-run
   * and whether they have been manually edited (value differs from what the
   * generator would produce).
   */
  async checkOverwrites(
    id: string,
    tokenStore: TokenStore,
  ): Promise<
    {
      path: string;
      setName: string;
      currentValue: unknown;
      newValue: unknown;
    }[]
  > {
    const generator = this.generators.get(id);
    if (!generator) throw new NotFoundError(`Generator "${id}" not found`);
    const preview = await this.computeResults(generator, tokenStore);
    const effectiveTargetSet = generator.targetSet;
    const modified: {
      path: string;
      setName: string;
      currentValue: unknown;
      newValue: unknown;
    }[] = [];
    for (const result of preview) {
      const existing = await tokenStore.getToken(
        effectiveTargetSet,
        result.path,
      );
      if (
        existing &&
        stableStringify(existing.$value) !== stableStringify(result.value)
      ) {
        // Only flag tokens that are actually tagged as generated by this generator
        const ext = existing.$extensions?.["com.tokenmanager.generator"];
        if (ext?.generatorId === id) {
          modified.push({
            path: result.path,
            setName: effectiveTargetSet,
            currentValue: existing.$value,
            newValue: result.value,
          });
        }
      }
    }
    return modified;
  }

  /**
   * Compute a full diff of what a generator re-run would produce, without
   * persisting anything.  Returns tokens classified as created / updated /
   * deleted / unchanged so the UI can show an accurate preview.
   *
   * - created:   in preview results but not yet in the token store
   * - updated:   in preview results AND in store but the value would change
   * - unchanged: in preview results AND in store with identical value
   * - deleted:   in the store (tagged with this generator's id) but NOT in the
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
    const generator = this.generators.get(id);
    if (!generator) throw new NotFoundError(`Generator "${id}" not found`);

    const preview = await this.computeResults(generator, tokenStore);
    const targetSet = generator.targetSet;

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
      const existing = await tokenStore.getToken(targetSet, result.path);
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

    // Detect tokens that belong to this generator but would be removed because
    // they are no longer in the preview results (e.g. a step was deleted).
    const flatTokens = await tokenStore.getFlatTokensForSet(targetSet);
    const prefix = generator.targetGroup ? generator.targetGroup + "." : "";
    const deleted: Array<{ path: string; currentValue: unknown }> = [];
    for (const [path, token] of Object.entries(flatTokens)) {
      if (prefix && !path.startsWith(prefix) && path !== generator.targetGroup)
        continue;
      const ext = token.$extensions?.["com.tokenmanager.generator"];
      if (ext?.generatorId === id && !previewPaths.has(path)) {
        deleted.push({ path, currentValue: token.$value });
      }
    }

    return { created, updated, unchanged, deleted };
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
  ): Promise<void> {
    // Find all generators that directly source this token (skip disabled ones)
    const directlyAffected = new Set(
      [...this.generators.values()]
        .filter((g) => g.sourceToken === tokenPath && g.enabled !== false)
        .map((g) => g.id),
    );
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
        setName: "",
        message: `Dependency graph error: ${message}`,
      });
      return;
    }

    // Expand the affected set to include transitive dependents (skip disabled ones)
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
          setName: "",
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
          setName: "",
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
  ): Promise<GeneratedTokenResult[]> {
    let results: GeneratedTokenResult[];
    if (generator.inputTable && generator.inputTable.rows.length > 0) {
      results = await this.executeGeneratorMultiBrand(generator, tokenStore);
    } else {
      results = await this.executeSingleBrand(
        generator,
        tokenStore,
        generator.targetSet,
      );
    }

    // Track when the generator was last run and what the source token's value was,
    // so the UI can detect whether re-running is needed after a source token edit.
    // We update the in-memory record directly (preserving updatedAt) and persist.
    // Important: resolve the source token value BEFORE the final re-read, then
    // re-read current AFTER all awaits so concurrent update() calls are not lost.
    const runAt = new Date().toISOString();
    let lastRunSourceValue: unknown;
    if (generator.sourceToken) {
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

  /** Original single-brand execution path. Writes to `effectiveTargetSet`. */
  private async executeSingleBrand(
    generator: TokenGenerator,
    tokenStore: TokenStore,
    effectiveTargetSet: string,
    sourceValueOverride?: unknown,
  ): Promise<GeneratedTokenResult[]> {
    const results =
      sourceValueOverride !== undefined
        ? await this.computeResultsWithValue(generator, sourceValueOverride)
        : await this.computeResults(generator, tokenStore);

    await this.clearNonLockedOverrides(generator);

    // Capture pre-run state so a mid-loop failure can be fully rolled back.
    // getFlatTokensForSet is a pure in-memory operation and will not throw.
    const preSnapshot = structuredClone(
      await tokenStore.getFlatTokensForSet(effectiveTargetSet),
    ) as Record<string, Token>;

    const extensions = {
      "com.tokenmanager.generator": {
        generatorId: generator.id,
        sourceToken: generator.sourceToken ?? "",
      },
    };
    let runError: unknown = undefined;
    tokenStore.beginBatch();
    try {
      for (const result of results) {
        const token = {
          $type: result.type as TokenType,
          $value: result.value as Token["$value"],
          $extensions: extensions,
        };
        const existing = await tokenStore.getToken(
          effectiveTargetSet,
          result.path,
        );
        if (existing) {
          await tokenStore.updateToken(effectiveTargetSet, result.path, token);
        } else {
          await tokenStore.createToken(effectiveTargetSet, result.path, token);
        }
      }
    } catch (err) {
      runError = err;
    } finally {
      tokenStore.endBatch();
    }

    if (runError !== undefined) {
      // Roll back: restore tokens that existed before + delete tokens created during the run.
      const currentTokens =
        await tokenStore.getFlatTokensForSet(effectiveTargetSet);
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
        const [outcome] = await Promise.allSettled([
          tokenStore.restoreSnapshot(effectiveTargetSet, restoreItems),
        ]);
        if (outcome.status === "rejected") {
          const rollbackMsg =
            outcome.reason instanceof Error
              ? outcome.reason.message
              : String(outcome.reason);
          console.error(
            `[GeneratorService] Rollback failed for set "${effectiveTargetSet}":`,
            outcome.reason,
          );
          throw new Error(
            `Generator run failed and rollback of set "${effectiveTargetSet}" also failed (${rollbackMsg}). Token state may be inconsistent.`,
            { cause: outcome.reason },
          );
        }
      }
      throw runError;
    }

    return results;
  }

  /** Multi-brand path: runs once per row, writing to a brand-specific set. */
  private async executeGeneratorMultiBrand(
    generator: TokenGenerator,
    tokenStore: TokenStore,
  ): Promise<GeneratedTokenResult[]> {
    const { inputTable, targetSetTemplate, targetSet } = generator;
    const allResults: GeneratedTokenResult[] = [];

    // Determine all sets that will be written to so we can snapshot them before any writes.
    const affectedSets = new Set<string>();
    for (const row of inputTable!.rows) {
      if (!row.brand.trim()) continue;
      const setName = targetSetTemplate
        ? targetSetTemplate.replace("{brand}", row.brand)
        : targetSet!;
      affectedSets.add(setName);
    }

    // Capture pre-run state for each affected set so partial failures can be rolled back.
    const preRunSnapshots = new Map<string, Record<string, Token>>();
    for (const setName of affectedSets) {
      // getFlatTokensForSet is a pure in-memory operation and will not throw.
      const flatTokens = await tokenStore.getFlatTokensForSet(setName);
      preRunSnapshots.set(
        setName,
        structuredClone(flatTokens) as Record<string, Token>,
      );
    }

    let succeeded = false;
    try {
      for (const row of inputTable!.rows) {
        if (!row.brand.trim()) continue;
        const sourceValue = row.inputs[inputTable!.inputKey];
        if (sourceValue === undefined) continue;

        const effectiveTargetSet = targetSetTemplate
          ? targetSetTemplate.replace("{brand}", row.brand)
          : targetSet;

        const results = await this.computeResultsWithValue(
          generator,
          sourceValue,
        );

        const extensions = {
          "com.tokenmanager.generator": {
            generatorId: generator.id,
            sourceToken: generator.sourceToken ?? "",
            brand: row.brand,
          },
        };
        tokenStore.beginBatch();
        try {
          for (const result of results) {
            const token = {
              $type: result.type as TokenType,
              $value: result.value as Token["$value"],
              $extensions: extensions,
            };
            const existing = await tokenStore.getToken(
              effectiveTargetSet,
              result.path,
            );
            if (existing) {
              await tokenStore.updateToken(
                effectiveTargetSet,
                result.path,
                token,
              );
            } else {
              await tokenStore.createToken(
                effectiveTargetSet,
                result.path,
                token,
              );
            }
          }
        } finally {
          tokenStore.endBatch();
        }
        allResults.push(...results);
      }
      succeeded = true;
    } catch (err) {
      // Roll back all affected sets using allSettled so no set is skipped on failure.
      const setNames = [...preRunSnapshots.keys()];
      const rollbackResults = await Promise.allSettled(
        setNames.map(async (setName) => {
          const preSnapshot = preRunSnapshots.get(setName)!;
          const currentTokens = await tokenStore.getFlatTokensForSet(setName);
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
            await tokenStore.restoreSnapshot(setName, restoreItems);
          }
        }),
      );

      const rollbackFailures = rollbackResults
        .map((r, i) => ({ r, setName: setNames[i] }))
        .filter(({ r }) => r.status === "rejected");

      if (rollbackFailures.length > 0) {
        const details = rollbackFailures
          .map(({ setName, r }) => {
            const reason = (r as PromiseRejectedResult).reason;
            const msg =
              reason instanceof Error ? reason.message : String(reason);
            console.error(
              `[GeneratorService] Rollback failed for set "${setName}":`,
              reason,
            );
            return `"${setName}": ${msg}`;
          })
          .join("; ");
        const originalMsg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Generator run failed (${originalMsg}) and rollback of ${rollbackFailures.length} set(s) also failed (${details}). Token state may be inconsistent.`,
          { cause: err },
        );
      }
      throw err;
    } finally {
      // Only clear non-locked overrides when the run completed successfully.
      // On partial failure the overrides must remain intact so a re-run produces the same result.
      if (succeeded) {
        await this.clearNonLockedOverrides(generator);
      }
    }

    return allResults;
  }

  /**
   * Core dispatch: given a pre-resolved source value (or undefined for source-free generators),
   * run the appropriate generator and apply overrides.
   */
  private async computeResultsWithValue(
    generator: Pick<
      TokenGenerator,
      "type" | "sourceToken" | "targetGroup" | "config" | "overrides"
    >,
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
      case "accessibleColorPair": {
        const hex = typeof resolvedValue === "string" ? resolvedValue : null;
        if (!hex)
          throw new BadRequestError(
            `Source value for accessibleColorPair must be a color string`,
          );
        results = runAccessibleColorPairGenerator(
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
        results = runDarkModeInversionGenerator(
          hex,
          config as DarkModeInversionConfig,
          targetGroup,
        );
        break;
      }
      case "contrastCheck": {
        results = runContrastCheckGenerator(
          config as ContrastCheckConfig,
          targetGroup,
        );
        break;
      }
      default:
        throw new BadRequestError(`Unknown generator type: ${type}`);
    }

    return applyOverrides(results, generator.overrides);
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
    generator: Pick<
      TokenGenerator,
      | "type"
      | "sourceToken"
      | "inlineValue"
      | "targetGroup"
      | "config"
      | "overrides"
    >,
    tokenStore: TokenStore,
  ): Promise<GeneratedTokenResult[]> {
    const { type, sourceToken, inlineValue } = generator;

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
