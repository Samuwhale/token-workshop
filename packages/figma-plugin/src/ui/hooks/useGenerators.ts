import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '../shared/apiFetch';

// ---------------------------------------------------------------------------
// Types (defined inline — do not import from @tokenmanager/core in the plugin)
// ---------------------------------------------------------------------------

export type GeneratorType =
  | 'colorRamp'
  | 'typeScale'
  | 'spacingScale'
  | 'opacityScale'
  | 'borderRadiusScale'
  | 'zIndexScale'
  | 'shadowScale'
  | 'customScale'
  | 'accessibleColorPair'
  | 'darkModeInversion'
  | 'contrastCheck';

export interface ColorRampConfig {
  steps: number[];
  lightEnd: number;
  darkEnd: number;
  chromaBoost: number;
  lightnessCurve?: [number, number, number, number];
  includeSource: boolean;
  sourceStep?: number;
}

export interface TypeScaleStep {
  name: string;
  exponent: number;
}

export interface TypeScaleConfig {
  steps: TypeScaleStep[];
  ratio: number;
  unit: 'px' | 'rem';
  baseStep: string;
  roundTo: number;
}

export interface SpacingStep {
  name: string;
  multiplier: number;
}

export interface SpacingScaleConfig {
  steps: SpacingStep[];
  unit: 'px' | 'rem';
}

export interface OpacityScaleConfig {
  steps: Array<{ name: string; value: number }>;
}

export interface BorderRadiusStep {
  name: string;
  multiplier: number;
  exactValue?: number;
}

export interface BorderRadiusScaleConfig {
  steps: BorderRadiusStep[];
  unit: 'px' | 'rem';
}

export interface ZIndexScaleConfig {
  steps: Array<{ name: string; value: number }>;
}

export interface ShadowScaleStep {
  name: string;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  opacity: number;
}

export interface ShadowScaleConfig {
  steps: ShadowScaleStep[];
  color: string;
}

export interface CustomScaleStep {
  name: string;
  index: number;
  multiplier?: number;
}

export interface CustomScaleConfig {
  outputType: 'color' | 'dimension' | 'fontFamily' | 'fontWeight' | 'duration' | 'cubicBezier' | 'number' | 'strokeStyle' | 'border' | 'transition' | 'shadow' | 'gradient' | 'typography' | 'fontStyle' | 'letterSpacing' | 'lineHeight' | 'percentage' | 'string' | 'boolean' | 'link' | 'textDecoration' | 'textTransform' | 'custom' | 'composition' | 'asset';
  unit?: 'px' | 'rem' | 'em' | '%';
  steps: CustomScaleStep[];
  formula: string;
  roundTo: number;
}

export interface ContrastCheckStep {
  name: string;
  hex: string;
}

export interface ContrastCheckConfig {
  backgroundHex: string;
  steps: ContrastCheckStep[];
  levels: ('AA' | 'AAA')[];
}

export interface AccessibleColorPairConfig {
  contrastLevel: 'AA' | 'AAA';
  backgroundStep: string;
  foregroundStep: string;
}

export interface DarkModeInversionConfig {
  stepName: string;
  chromaBoost: number;
}

export type GeneratorConfig =
  | ColorRampConfig
  | TypeScaleConfig
  | SpacingScaleConfig
  | OpacityScaleConfig
  | BorderRadiusScaleConfig
  | ZIndexScaleConfig
  | ShadowScaleConfig
  | CustomScaleConfig
  | AccessibleColorPairConfig
  | DarkModeInversionConfig
  | ContrastCheckConfig;

export interface StepOverride {
  value: unknown;
  locked: boolean;
}

export interface InputTableRow {
  brand: string;
  inputs: Record<string, unknown>;
}

export interface InputTable {
  inputKey: string;
  rows: InputTableRow[];
}

export interface TokenGenerator {
  id: string;
  type: GeneratorType;
  name: string;
  sourceToken?: string;
  inlineValue?: unknown;
  targetSet: string;
  targetGroup: string;
  config: GeneratorConfig;
  overrides?: Record<string, StepOverride>;
  inputTable?: InputTable;
  targetSetTemplate?: string;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp of the last successful run. Absent if the generator has never been run. */
  lastRunAt?: string;
  /** Value of the source token at the time of the last successful run. */
  lastRunSourceValue?: unknown;
  /**
   * Computed by the server on each list request.
   * True when the source token's current value differs from `lastRunSourceValue`.
   * Only present for generators that have been run at least once and have a sourceToken.
   */
  isStale?: boolean;
  /** Set when the last auto-run (triggered by a source token update) failed. Cleared on success. */
  lastRunError?: { message: string; at: string };
}

export interface GeneratedTokenResult {
  stepName: string;
  path: string;
  type: 'color' | 'dimension' | 'fontFamily' | 'fontWeight' | 'duration' | 'cubicBezier' | 'number' | 'strokeStyle' | 'border' | 'transition' | 'shadow' | 'gradient' | 'typography' | 'fontStyle' | 'letterSpacing' | 'lineHeight' | 'percentage' | 'string' | 'boolean' | 'link' | 'textDecoration' | 'textTransform' | 'custom' | 'composition' | 'asset';
  value: unknown;
  isOverridden?: boolean;
  warning?: string;
}

export interface GeneratorTemplate {
  id: string;
  label: string;
  description: string;
  defaultPrefix: string;
  generatorType: GeneratorType;
  config: GeneratorConfig;
  requiresSource: boolean;
}

// ---------------------------------------------------------------------------
// Derived path helpers
// ---------------------------------------------------------------------------

function getStepNames(config: Record<string, unknown>): string[] {
  // Most generators have a `steps` array — items are either primitives
  // (colorRamp: number[]) or objects with a `name` field.
  if (Array.isArray(config.steps)) {
    return config.steps.map((s: unknown) =>
      typeof s === 'object' && s !== null && 'name' in s
        ? String((s as { name: unknown }).name)
        : String(s),
    );
  }
  // accessibleColorPair: two named step fields
  if (typeof config.backgroundStep === 'string' && typeof config.foregroundStep === 'string') {
    return [config.backgroundStep, config.foregroundStep];
  }
  // darkModeInversion: single step field
  if (typeof config.stepName === 'string') {
    return [config.stepName];
  }
  return [];
}

function computeDerivedPaths(generator: TokenGenerator): string[] {
  return getStepNames(generator.config as Record<string, unknown>).map(
    (name) => `${generator.targetGroup}.${name}`,
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseGeneratorsResult {
  generators: TokenGenerator[];
  loading: boolean;
  refreshGenerators: () => void;
  generatorsBySource: Map<string, TokenGenerator[]>;
  derivedTokenPaths: Map<string, TokenGenerator>;
}

export function useGenerators(serverUrl: string, connected: boolean): UseGeneratorsResult {
  const [generators, setGenerators] = useState<TokenGenerator[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchGenerators = useCallback(async () => {
    if (!connected) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const data = await apiFetch<TokenGenerator[]>(`${serverUrl}/api/generators`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
      });
      if (controller.signal.aborted) return;
      setGenerators(data);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Failed to fetch generators:', err);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [serverUrl, connected]);

  useEffect(() => {
    fetchGenerators();
    return () => { abortRef.current?.abort(); };
  }, [fetchGenerators]);

  const generatorsBySource = useMemo(() => {
    const map = new Map<string, TokenGenerator[]>();
    for (const gen of generators) {
      if (!gen.sourceToken) continue;
      const key = gen.sourceToken;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(gen);
    }
    return map;
  }, [generators]);

  const derivedTokenPaths = useMemo(() => {
    const map = new Map<string, TokenGenerator>();
    for (const gen of generators) {
      for (const path of computeDerivedPaths(gen)) {
        map.set(path, gen);
      }
    }
    return map;
  }, [generators]);

  return {
    generators,
    loading,
    refreshGenerators: fetchGenerators,
    generatorsBySource,
    derivedTokenPaths,
  };
}
