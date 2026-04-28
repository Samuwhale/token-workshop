import {
  DEFAULT_BORDER_RADIUS_SCALE_CONFIG,
  DEFAULT_COLOR_RAMP_CONFIG,
  DEFAULT_CUSTOM_SCALE_CONFIG,
  DEFAULT_OPACITY_SCALE_CONFIG,
  DEFAULT_SHADOW_SCALE_CONFIG,
  DEFAULT_SPACING_SCALE_CONFIG,
  DEFAULT_TYPE_SCALE_CONFIG,
  DEFAULT_Z_INDEX_SCALE_CONFIG,
} from './generator-types.js';
import type {
  TokenGeneratorDocument,
  TokenGeneratorEdge,
  TokenGeneratorNode,
  TokenGeneratorNodeKind,
} from './token-generator-documents.js';

export type GeneratorPresetKind =
  | 'colorRamp'
  | 'spacing'
  | 'type'
  | 'radius'
  | 'opacity'
  | 'shadow'
  | 'zIndex'
  | 'formula';

export type GeneratorTemplateKind = GeneratorPresetKind | 'blank';

export type GeneratorSourceMode = 'literal' | 'token';

export interface GeneratorPresetOption {
  id: GeneratorPresetKind;
  label: string;
  outputPrefix: string;
  sourceMode: GeneratorSourceMode;
}

export interface GeneratorStructuredDraft {
  kind: GeneratorPresetKind;
  sourceMode: GeneratorSourceMode;
  sourceValue: string;
  sourceCollectionId: string;
  sourceTokenPath: string;
  outputPrefix: string;
  config: Record<string, unknown>;
}

export const GENERATOR_PRESET_OPTIONS: GeneratorPresetOption[] = [
  { id: 'colorRamp', label: 'Color ramp', outputPrefix: 'color.brand', sourceMode: 'literal' },
  { id: 'spacing', label: 'Spacing scale', outputPrefix: 'spacing', sourceMode: 'literal' },
  { id: 'type', label: 'Type scale', outputPrefix: 'fontSize', sourceMode: 'literal' },
  { id: 'radius', label: 'Radius scale', outputPrefix: 'radius', sourceMode: 'literal' },
  { id: 'opacity', label: 'Opacity scale', outputPrefix: 'opacity', sourceMode: 'literal' },
  { id: 'shadow', label: 'Shadow scale', outputPrefix: 'shadow', sourceMode: 'literal' },
  { id: 'zIndex', label: 'Z-index scale', outputPrefix: 'zIndex', sourceMode: 'literal' },
  { id: 'formula', label: 'Formula scale', outputPrefix: 'scale', sourceMode: 'literal' },
];

export const SOURCELESS_GENERATOR_PRESETS = new Set<GeneratorPresetKind>([
  'opacity',
  'shadow',
  'zIndex',
]);

const NODE_KIND_BY_PRESET: Record<GeneratorPresetKind, TokenGeneratorNodeKind> = {
  colorRamp: 'colorRamp',
  spacing: 'spacingScale',
  type: 'typeScale',
  radius: 'borderRadiusScale',
  opacity: 'opacityScale',
  shadow: 'shadowScale',
  zIndex: 'zIndexScale',
  formula: 'customScale',
};

const PRESET_BY_NODE_KIND: Partial<Record<TokenGeneratorNodeKind, GeneratorPresetKind>> = {
  colorRamp: 'colorRamp',
  spacingScale: 'spacing',
  typeScale: 'type',
  borderRadiusScale: 'radius',
  opacityScale: 'opacity',
  shadowScale: 'shadow',
  zIndexScale: 'zIndex',
  customScale: 'formula',
};

export function generatorPresetLabel(kind: GeneratorTemplateKind | undefined): string {
  if (!kind || kind === 'colorRamp') return 'Color ramp';
  if (kind === 'blank') return 'New token generator';
  return GENERATOR_PRESET_OPTIONS.find((option) => option.id === kind)?.label ?? 'New token generator';
}

export function generatorDefaultSourceValue(kind: GeneratorPresetKind): string {
  if (kind === 'colorRamp') return '#6366f1';
  if (kind === 'formula') return '8';
  if (kind === 'type') return '16';
  return '4';
}

export function generatorDefaultConfig(kind: GeneratorPresetKind): Record<string, unknown> {
  if (kind === 'colorRamp') return { ...DEFAULT_COLOR_RAMP_CONFIG };
  if (kind === 'spacing') return { ...DEFAULT_SPACING_SCALE_CONFIG };
  if (kind === 'type') return { ...DEFAULT_TYPE_SCALE_CONFIG };
  if (kind === 'radius') return { ...DEFAULT_BORDER_RADIUS_SCALE_CONFIG };
  if (kind === 'opacity') return { ...DEFAULT_OPACITY_SCALE_CONFIG };
  if (kind === 'shadow') return { ...DEFAULT_SHADOW_SCALE_CONFIG };
  if (kind === 'zIndex') return { ...DEFAULT_Z_INDEX_SCALE_CONFIG };
  return { ...DEFAULT_CUSTOM_SCALE_CONFIG };
}

export function generatorDefaultOutputPrefix(kind: GeneratorPresetKind): string {
  return GENERATOR_PRESET_OPTIONS.find((option) => option.id === kind)?.outputPrefix ?? 'generated';
}

export function makeGeneratorLiteralData(kind: GeneratorPresetKind, raw: string): Record<string, unknown> {
  if (kind === 'colorRamp') {
    return { type: 'color', value: raw.trim() || generatorDefaultSourceValue(kind) };
  }
  if (kind === 'formula') {
    return { type: 'number', value: Number(raw) || 0 };
  }
  return { type: 'dimension', value: Number(raw) || 0, unit: 'px' };
}

export function buildGeneratorNodesFromStructuredDraft(
  draft: GeneratorStructuredDraft,
): Pick<TokenGeneratorDocument, 'nodes' | 'edges'> {
  const generationId = 'generation';
  const outputId = 'output';
  const nodes: TokenGeneratorNode[] = [];
  const edges: TokenGeneratorEdge[] = [];
  const hasSource = !SOURCELESS_GENERATOR_PRESETS.has(draft.kind);

  if (hasSource) {
    nodes.push({
      id: 'source',
      kind: draft.sourceMode === 'token' ? 'tokenInput' : 'literal',
      label: draft.sourceMode === 'token' ? 'Source token' : 'Source value',
      position: { x: 90, y: 150 },
      data:
        draft.sourceMode === 'token'
          ? { collectionId: draft.sourceCollectionId, path: draft.sourceTokenPath }
          : makeGeneratorLiteralData(draft.kind, draft.sourceValue),
    });
    edges.push({
      id: 'source-generation',
      from: { nodeId: 'source', port: 'value' },
      to: { nodeId: generationId, port: 'value' },
    });
  }

  nodes.push({
    id: generationId,
    kind: NODE_KIND_BY_PRESET[draft.kind],
    label: generatorPresetLabel(draft.kind),
    position: { x: hasSource ? 360 : 130, y: 140 },
    data: { ...draft.config },
  });
  nodes.push({
    id: outputId,
    kind: 'groupOutput',
    label: 'Output tokens',
    position: { x: hasSource ? 650 : 430, y: 150 },
    data: { pathPrefix: draft.outputPrefix },
  });
  edges.push({
    id: 'generation-output',
    from: { nodeId: generationId, port: 'value' },
    to: { nodeId: outputId, port: 'value' },
  });

  return { nodes, edges };
}

export function makeDefaultStructuredGeneratorDraft(
  kind: GeneratorPresetKind,
  collectionId: string,
): GeneratorStructuredDraft {
  return {
    kind,
    sourceMode: 'literal',
    sourceValue: generatorDefaultSourceValue(kind),
    sourceCollectionId: collectionId,
    sourceTokenPath: '',
    outputPrefix: generatorDefaultOutputPrefix(kind),
    config: generatorDefaultConfig(kind),
  };
}

export function readStructuredGeneratorDraft(
  generator: Pick<TokenGeneratorDocument, 'nodes' | 'edges'>,
): GeneratorStructuredDraft | null {
  const generationNode = generator.nodes.find((node) => PRESET_BY_NODE_KIND[node.kind]);
  const outputNode = generator.nodes.find((node) => node.kind === 'groupOutput');
  if (!generationNode || !outputNode) return null;

  const kind = PRESET_BY_NODE_KIND[generationNode.kind];
  if (!kind) return null;

  const sourceNode = generator.nodes.find((node) => node.id !== generationNode.id && (node.kind === 'literal' || node.kind === 'tokenInput'));
  const expectedNodeCount = SOURCELESS_GENERATOR_PRESETS.has(kind) ? 2 : 3;
  if (generator.nodes.length !== expectedNodeCount) return null;

  const generationToOutput = generator.edges.some(
    (edge) => edge.from.nodeId === generationNode.id && edge.to.nodeId === outputNode.id,
  );
  if (!generationToOutput) return null;

  let sourceMode: GeneratorSourceMode = 'literal';
  let sourceValue = generatorDefaultSourceValue(kind);
  let sourceCollectionId = '';
  let sourceTokenPath = '';

  if (!SOURCELESS_GENERATOR_PRESETS.has(kind)) {
    if (!sourceNode) return null;
    const sourceToGeneration = generator.edges.some(
      (edge) => edge.from.nodeId === sourceNode.id && edge.to.nodeId === generationNode.id,
    );
    if (!sourceToGeneration) return null;
    if (sourceNode.kind === 'tokenInput') {
      sourceMode = 'token';
      sourceCollectionId = String(sourceNode.data.collectionId ?? '');
      sourceTokenPath = String(sourceNode.data.path ?? '');
    } else {
      sourceValue = readSourceValue(sourceNode.data);
    }
  }

  return {
    kind,
    sourceMode,
    sourceValue,
    sourceCollectionId,
    sourceTokenPath,
    outputPrefix: String(outputNode.data.pathPrefix ?? ''),
    config: { ...generationNode.data },
  };
}

function readSourceValue(data: Record<string, unknown>): string {
  const value = data.value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}
