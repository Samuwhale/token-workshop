export type GraphTemplateType =
  | 'colorRamp'
  | 'typeScale'
  | 'spacingScale'
  | 'opacityScale'
  | 'borderRadiusScale'
  | 'zIndexScale'
  | 'shadowScale'
  | 'customScale';

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

export type GraphTemplateConfig =
  | ColorRampConfig
  | TypeScaleConfig
  | SpacingScaleConfig
  | OpacityScaleConfig
  | BorderRadiusScaleConfig
  | ZIndexScaleConfig
  | ShadowScaleConfig
  | CustomScaleConfig;

export interface SemanticTokenMapping {
  semantic: string;
  step: string;
}

export interface GraphSemanticLayer {
  prefix: string;
  mappings: SemanticTokenMapping[];
  patternId?: string | null;
}

export interface GeneratedTokenResult {
  stepName: string;
  path: string;
  type: CustomScaleConfig['outputType'];
  value: unknown;
  isOverridden?: boolean;
  warning?: string;
}

export interface GraphTemplateDefinition {
  id: string;
  label: string;
  description: string;
  defaultPrefix: string;
  generatorType: GraphTemplateType;
  config: GraphTemplateConfig;
  requiresSource: boolean;
}

export type GeneratorType = GraphTemplateType;
export type GeneratorConfig = GraphTemplateConfig;
export type GeneratorTemplate = GraphTemplateDefinition;
export type GeneratorSemanticLayer = GraphSemanticLayer;
