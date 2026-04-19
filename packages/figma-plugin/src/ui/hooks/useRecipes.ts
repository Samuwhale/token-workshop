import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  createRecipeOwnershipKey,
  getRecipeManagedOutputs,
} from '@tokenmanager/core';
import { apiFetch } from '../shared/apiFetch';
import { isAbortError } from '../shared/utils';

// ---------------------------------------------------------------------------
// Types (defined inline — do not import from @tokenmanager/core in the plugin)
// ---------------------------------------------------------------------------

export type RecipeType =
  | 'colorRamp'
  | 'typeScale'
  | 'spacingScale'
  | 'opacityScale'
  | 'borderRadiusScale'
  | 'zIndexScale'
  | 'shadowScale'
  | 'customScale'
  | 'darkModeInversion';

export type RecipeDashboardStatus =
  | 'upToDate'
  | 'stale'
  | 'failed'
  | 'blocked'
  | 'neverRun'
  | 'paused';

export interface RecipeDependency {
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

export type RecipeConfig =
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

export interface RecipeSemanticLayer {
  prefix: string;
  mappings: SemanticTokenMapping[];
  patternId?: string | null;
}

export interface TokenRecipe {
  id: string;
  type: RecipeType;
  name: string;
  sourceToken?: string;
  inlineValue?: unknown;
  targetCollection: string;
  targetGroup: string;
  config: RecipeConfig;
  semanticLayer?: RecipeSemanticLayer;
  detachedPaths?: string[];
  overrides?: Record<string, StepOverride>;
  /** When false, the recipe is disabled and skipped during auto-run. Defaults to true. */
  enabled?: boolean;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp of the last successful run. Absent if the recipe has never been run. */
  lastRunAt?: string;
  /** Value of the source token at the time of the last successful run. */
  lastRunSourceValue?: unknown;
  /**
   * Computed by the server on each list request.
   * True when the source token's current value differs from `lastRunSourceValue`.
   * Only present for recipes that have been run at least once and have a sourceToken.
   */
  isStale?: boolean;
  /** Set when the last auto-run (triggered by a source token update) failed. Cleared on success. */
  lastRunError?: {
    message: string;
    at: string;
    /** Present when the recipe was blocked by an upstream failure, not a direct failure itself.
     *  Contains the name of the upstream recipe whose failure caused this skip. */
    blockedBy?: string;
  };
  upstreamRecipes?: RecipeDependency[];
  downstreamRecipes?: RecipeDependency[];
  blockedByRecipes?: RecipeDependency[];
  staleReason?: string;
  lastRunSummary?: RecipeLastRunSummary;
}

export interface GeneratedTokenResult {
  stepName: string;
  path: string;
  type: 'color' | 'dimension' | 'fontFamily' | 'fontWeight' | 'duration' | 'cubicBezier' | 'number' | 'strokeStyle' | 'border' | 'transition' | 'shadow' | 'gradient' | 'typography' | 'fontStyle' | 'letterSpacing' | 'lineHeight' | 'percentage' | 'string' | 'boolean' | 'link' | 'textDecoration' | 'textTransform' | 'custom' | 'composition' | 'asset';
  value: unknown;
  isOverridden?: boolean;
  warning?: string;
}

export interface RecipeTemplate {
  id: string;
  label: string;
  description: string;
  defaultPrefix: string;
  recipeType: RecipeType;
  config: RecipeConfig;
  requiresSource: boolean;
}

interface UseRecipesResult {
  recipes: TokenRecipe[];
  loading: boolean;
  refreshRecipes: () => void;
  recipesBySource: Map<string, TokenRecipe[]>;
  recipesByTargetGroup: Map<string, TokenRecipe>;
  derivedTokenPaths: Map<string, TokenRecipe>;
}

export function getRecipeDashboardStatus(
  recipe: TokenRecipe,
): RecipeDashboardStatus {
  if (recipe.lastRunSummary?.status) return recipe.lastRunSummary.status;
  if (recipe.enabled === false) return 'paused';
  if (recipe.lastRunError?.blockedBy) return 'blocked';
  if (recipe.lastRunError) return 'failed';
  if (recipe.isStale) return 'stale';
  if (!recipe.lastRunAt) return 'neverRun';
  return 'upToDate';
}

export function useRecipes(serverUrl: string, connected: boolean): UseRecipesResult {
  const [recipes, setRecipes] = useState<TokenRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchRecipes = useCallback(async () => {
    if (!connected) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const data = await apiFetch<TokenRecipe[]>(`${serverUrl}/api/recipes`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
      });
      if (controller.signal.aborted) return;
      setRecipes(data);
    } catch (err) {
      if (isAbortError(err)) return;
      console.error('Failed to fetch recipes:', err);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [serverUrl, connected]);

  useEffect(() => {
    fetchRecipes();
    return () => { abortRef.current?.abort(); };
  }, [fetchRecipes]);

  const recipesBySource = useMemo(() => {
    const map = new Map<string, TokenRecipe[]>();
    for (const gen of recipes) {
      if (!gen.sourceToken) continue;
      const key = gen.sourceToken;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(gen);
    }
    return map;
  }, [recipes]);

  const recipesByTargetGroup = useMemo(() => {
    const map = new Map<string, TokenRecipe>();
    for (const gen of recipes) {
      const hasManagedOutputs = getRecipeManagedOutputs(gen).length > 0;
      if (!gen.targetGroup || !hasManagedOutputs) continue;
      map.set(
        createRecipeOwnershipKey(gen.targetCollection, gen.targetGroup),
        gen,
      );
    }
    return map;
  }, [recipes]);

  const derivedTokenPaths = useMemo(() => {
    const map = new Map<string, TokenRecipe>();
    for (const gen of recipes) {
      for (const output of getRecipeManagedOutputs(gen)) {
        map.set(output.key, gen);
      }
    }
    return map;
  }, [recipes]);

  return {
    recipes,
    loading,
    refreshRecipes: fetchRecipes,
    recipesBySource,
    recipesByTargetGroup,
    derivedTokenPaths,
  };
}
