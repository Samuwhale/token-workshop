import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  createGeneratorOwnershipKey,
  getGeneratorManagedOutputs,
} from '@tokenmanager/core';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';
import { isAbortError } from '../shared/utils';
import { createGeneratedGroupSourceKeys } from '../shared/generatorSource';

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
  | 'darkModeInversion';

export type GeneratorDashboardStatus =
  | 'upToDate'
  | 'stale'
  | 'failed'
  | 'blocked'
  | 'neverRun'
  | 'paused';

export interface GeneratorDependency {
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

export interface ColorRampConfig {
  steps: number[];
  lightEnd: number;
  darkEnd: number;
  chromaBoost: number;
  lightnessCurve?: [number, number, number, number];
  includeSource: boolean;
  sourceStep?: number;
  $tokenRefs?: {
    lightEnd?: string;
    darkEnd?: string;
    chromaBoost?: string;
  };
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
  $tokenRefs?: {
    ratio?: string;
  };
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
  $tokenRefs?: {
    color?: string;
  };
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

export interface DarkModeInversionConfig {
  stepName: string;
  chromaBoost: number;
  $tokenRefs?: {
    chromaBoost?: string;
  };
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
  | DarkModeInversionConfig;

export interface StepOverride {
  value: unknown;
  locked: boolean;
}

export interface SemanticTokenMapping {
  semantic: string;
  step: string;
}

export interface GeneratorSemanticLayer {
  prefix: string;
  mappings: SemanticTokenMapping[];
  patternId?: string | null;
}

export interface TokenGenerator {
  id: string;
  type: GeneratorType;
  name: string;
  sourceToken?: string;
  sourceCollectionId?: string;
  inlineValue?: unknown;
  targetCollection: string;
  targetGroup: string;
  config: GeneratorConfig;
  semanticLayer?: GeneratorSemanticLayer;
  detachedPaths?: string[];
  overrides?: Record<string, StepOverride>;
  /** When false, the generator is disabled and skipped during auto-run. Defaults to true. */
  enabled?: boolean;
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
  lastRunError?: {
    message: string;
    at: string;
    /** Present when the generator was blocked by an upstream failure, not a direct failure itself.
     *  Contains the name of the upstream generator whose failure caused this skip. */
    blockedBy?: string;
  };
  upstreamGenerators?: GeneratorDependency[];
  downstreamGenerators?: GeneratorDependency[];
  blockedByGenerators?: GeneratorDependency[];
  staleReason?: string;
  lastRunSummary?: GeneratorLastRunSummary;
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

interface UseGeneratorsResult {
  generators: TokenGenerator[];
  loading: boolean;
  refreshGenerators: () => void;
  generatorsBySource: Map<string, TokenGenerator[]>;
  generatorsByTargetGroup: Map<string, TokenGenerator>;
  derivedTokenPaths: Map<string, TokenGenerator>;
}

export function getGeneratorDashboardStatus(
  generator: TokenGenerator,
): GeneratorDashboardStatus {
  if (generator.lastRunSummary?.status) return generator.lastRunSummary.status;
  if (generator.enabled === false) return 'paused';
  if (generator.lastRunError?.blockedBy) return 'blocked';
  if (generator.lastRunError) return 'failed';
  if (generator.isStale) return 'stale';
  if (!generator.lastRunAt) return 'neverRun';
  return 'upToDate';
}

export function useGenerators(
  serverUrl: string,
  connected: boolean,
  pathToCollectionId?: Record<string, string>,
  collectionIdsByPath?: Record<string, string[]>,
): UseGeneratorsResult {
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
        signal: createFetchSignal(controller.signal, 5000),
      });
      if (controller.signal.aborted) return;
      setGenerators(data);
    } catch (err) {
      if (isAbortError(err)) return;
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
      const keys = createGeneratedGroupSourceKeys({
        sourceTokenPath: gen.sourceToken,
        sourceCollectionId: gen.sourceCollectionId,
        pathToCollectionId,
        collectionIdsByPath,
      });
      for (const key of keys) {
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(gen);
      }
    }
    return map;
  }, [collectionIdsByPath, generators, pathToCollectionId]);

  const generatorsByTargetGroup = useMemo(() => {
    const map = new Map<string, TokenGenerator>();
    for (const gen of generators) {
      const hasManagedOutputs = getGeneratorManagedOutputs(gen).length > 0;
      if (!gen.targetGroup || !hasManagedOutputs) continue;
      map.set(
        createGeneratorOwnershipKey(gen.targetCollection, gen.targetGroup),
        gen,
      );
    }
    return map;
  }, [generators]);

  const derivedTokenPaths = useMemo(() => {
    const map = new Map<string, TokenGenerator>();
    for (const gen of generators) {
      for (const output of getGeneratorManagedOutputs(gen)) {
        map.set(output.key, gen);
      }
    }
    return map;
  }, [generators]);

  return {
    generators,
    loading,
    refreshGenerators: fetchGenerators,
    generatorsBySource,
    generatorsByTargetGroup,
    derivedTokenPaths,
  };
}
