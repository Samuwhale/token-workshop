import { useState, useEffect, useCallback, useMemo } from 'react';

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
  | 'customScale'
  | 'contrastCheck';

export interface ColorRampConfig {
  steps: number[];
  lightEnd: number;
  darkEnd: number;
  chromaBoost: number;
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

export interface CustomScaleStep {
  name: string;
  index: number;
  multiplier?: number;
}

export interface CustomScaleConfig {
  outputType: string;
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

export type GeneratorConfig =
  | ColorRampConfig
  | TypeScaleConfig
  | SpacingScaleConfig
  | OpacityScaleConfig
  | BorderRadiusScaleConfig
  | ZIndexScaleConfig
  | CustomScaleConfig
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
  targetSet: string;
  targetGroup: string;
  config: GeneratorConfig;
  overrides?: Record<string, StepOverride>;
  inputTable?: InputTable;
  targetSetTemplate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedTokenResult {
  stepName: string;
  path: string;
  type: string;
  value: unknown;
  isOverridden?: boolean;
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

function computeDerivedPaths(generator: TokenGenerator): string[] {
  const { type, targetGroup, config } = generator;
  const paths: string[] = [];

  if (type === 'colorRamp') {
    const cfg = config as ColorRampConfig;
    for (const step of cfg.steps) {
      paths.push(`${targetGroup}.${step}`);
    }
  } else if (type === 'typeScale') {
    const cfg = config as TypeScaleConfig;
    for (const step of cfg.steps) {
      paths.push(`${targetGroup}.${step.name}`);
    }
  } else if (type === 'spacingScale') {
    const cfg = config as SpacingScaleConfig;
    for (const step of cfg.steps) {
      paths.push(`${targetGroup}.${step.name}`);
    }
  } else if (type === 'opacityScale') {
    const cfg = config as OpacityScaleConfig;
    for (const step of cfg.steps) {
      paths.push(`${targetGroup}.${step.name}`);
    }
  } else if (type === 'borderRadiusScale') {
    const cfg = config as BorderRadiusScaleConfig;
    for (const step of cfg.steps) {
      paths.push(`${targetGroup}.${step.name}`);
    }
  } else if (type === 'zIndexScale') {
    const cfg = config as ZIndexScaleConfig;
    for (const step of cfg.steps) {
      paths.push(`${targetGroup}.${step.name}`);
    }
  } else if (type === 'customScale') {
    const cfg = config as CustomScaleConfig;
    for (const step of cfg.steps) {
      paths.push(`${targetGroup}.${step.name}`);
    }
  } else if (type === 'contrastCheck') {
    const cfg = config as ContrastCheckConfig;
    for (const step of cfg.steps) {
      paths.push(`${targetGroup}.${step.name}`);
    }
  }

  return paths;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseGeneratorsResult {
  generators: TokenGenerator[];
  loading: boolean;
  refreshGenerators: () => void;
  generatorsBySource: Map<string, TokenGenerator[]>;
  derivedTokenPaths: Set<string>;
  setStepOverride: (generatorId: string, stepName: string, override: StepOverride) => Promise<void>;
  clearStepOverride: (generatorId: string, stepName: string) => Promise<void>;
}

export function useGenerators(serverUrl: string, connected: boolean): UseGeneratorsResult {
  const [generators, setGenerators] = useState<TokenGenerator[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchGenerators = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/generators`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return;
      const data: TokenGenerator[] = await res.json();
      setGenerators(data);
    } catch (err) {
      console.error('Failed to fetch generators:', err);
    } finally {
      setLoading(false);
    }
  }, [serverUrl, connected]);

  useEffect(() => {
    fetchGenerators();
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
    const set = new Set<string>();
    for (const gen of generators) {
      for (const path of computeDerivedPaths(gen)) {
        set.add(path);
      }
    }
    return set;
  }, [generators]);

  const setStepOverride = useCallback(async (
    generatorId: string,
    stepName: string,
    override: StepOverride,
  ) => {
    await fetch(
      `${serverUrl}/api/generators/${generatorId}/steps/${encodeURIComponent(stepName)}/override`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(override),
        signal: AbortSignal.timeout(5000),
      },
    );
    await fetchGenerators();
  }, [serverUrl, fetchGenerators]);

  const clearStepOverride = useCallback(async (generatorId: string, stepName: string) => {
    await fetch(
      `${serverUrl}/api/generators/${generatorId}/steps/${encodeURIComponent(stepName)}/override`,
      { method: 'DELETE', signal: AbortSignal.timeout(5000) },
    );
    await fetchGenerators();
  }, [serverUrl, fetchGenerators]);

  return {
    generators,
    loading,
    refreshGenerators: fetchGenerators,
    generatorsBySource,
    derivedTokenPaths,
    setStepOverride,
    clearStepOverride,
  };
}
