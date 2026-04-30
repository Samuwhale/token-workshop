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
import { DIMENSION_UNITS, type DimensionUnit } from './constants.js';

export type GeneratorConfiguredTemplateKind =
  | 'colorRamp'
  | 'spacing'
  | 'type'
  | 'radius'
  | 'opacity'
  | 'shadow'
  | 'zIndex'
  | 'formula';

export type GeneratorTemplateKind = GeneratorConfiguredTemplateKind | 'blank';

export type GeneratorSourceMode = 'literal' | 'token';

export interface GeneratorTemplateOption {
  id: GeneratorConfiguredTemplateKind;
  label: string;
  outputPrefix: string;
  sourceMode: GeneratorSourceMode;
}

export interface GeneratorStructuredDraft {
  kind: GeneratorConfiguredTemplateKind;
  sourceMode: GeneratorSourceMode;
  sourceValue: string;
  sourceCollectionId: string;
  sourceTokenPath: string;
  outputPrefix: string;
  config: Record<string, unknown>;
}

export const GENERATOR_TEMPLATE_OPTIONS: GeneratorTemplateOption[] = [
  { id: 'colorRamp', label: 'Color ramp', outputPrefix: 'color.brand', sourceMode: 'literal' },
  { id: 'spacing', label: 'Spacing scale', outputPrefix: 'spacing', sourceMode: 'literal' },
  { id: 'type', label: 'Type scale', outputPrefix: 'fontSize', sourceMode: 'literal' },
  { id: 'radius', label: 'Radius scale', outputPrefix: 'radius', sourceMode: 'literal' },
  { id: 'opacity', label: 'Opacity scale', outputPrefix: 'opacity', sourceMode: 'literal' },
  { id: 'shadow', label: 'Shadow scale', outputPrefix: 'shadow', sourceMode: 'literal' },
  { id: 'zIndex', label: 'Z-index scale', outputPrefix: 'zIndex', sourceMode: 'literal' },
  { id: 'formula', label: 'Formula scale', outputPrefix: 'scale', sourceMode: 'literal' },
];

export const SOURCELESS_GENERATOR_TEMPLATES = new Set<GeneratorConfiguredTemplateKind>([
  'opacity',
  'shadow',
  'zIndex',
]);

const NODE_KIND_BY_TEMPLATE: Record<GeneratorConfiguredTemplateKind, TokenGeneratorNodeKind> = {
  colorRamp: 'colorRamp',
  spacing: 'spacingScale',
  type: 'typeScale',
  radius: 'borderRadiusScale',
  opacity: 'opacityScale',
  shadow: 'shadowScale',
  zIndex: 'zIndexScale',
  formula: 'customScale',
};

const TEMPLATE_BY_NODE_KIND: Partial<Record<TokenGeneratorNodeKind, GeneratorConfiguredTemplateKind>> = {
  colorRamp: 'colorRamp',
  spacingScale: 'spacing',
  typeScale: 'type',
  borderRadiusScale: 'radius',
  opacityScale: 'opacity',
  shadowScale: 'shadow',
  zIndexScale: 'zIndex',
  customScale: 'formula',
};

export function generatorTemplateLabel(kind: GeneratorTemplateKind | undefined): string {
  if (!kind || kind === 'colorRamp') return 'Color ramp';
  if (kind === 'blank') return 'New token generator';
  return GENERATOR_TEMPLATE_OPTIONS.find((option) => option.id === kind)?.label ?? 'New token generator';
}

export function generatorDefaultSourceValue(kind: GeneratorConfiguredTemplateKind): string {
  if (kind === 'colorRamp') return '#6366f1';
  if (kind === 'formula') return '8';
  if (kind === 'type') return '16';
  return '4';
}

export function generatorDefaultConfig(kind: GeneratorConfiguredTemplateKind): Record<string, unknown> {
  if (kind === 'colorRamp') return { ...DEFAULT_COLOR_RAMP_CONFIG };
  if (kind === 'spacing') return { ...DEFAULT_SPACING_SCALE_CONFIG };
  if (kind === 'type') return { ...DEFAULT_TYPE_SCALE_CONFIG };
  if (kind === 'radius') return { ...DEFAULT_BORDER_RADIUS_SCALE_CONFIG };
  if (kind === 'opacity') return { ...DEFAULT_OPACITY_SCALE_CONFIG };
  if (kind === 'shadow') return { ...DEFAULT_SHADOW_SCALE_CONFIG };
  if (kind === 'zIndex') return { ...DEFAULT_Z_INDEX_SCALE_CONFIG };
  return { ...DEFAULT_CUSTOM_SCALE_CONFIG };
}

export function generatorDefaultOutputPrefix(kind: GeneratorConfiguredTemplateKind): string {
  return GENERATOR_TEMPLATE_OPTIONS.find((option) => option.id === kind)?.outputPrefix ?? 'generated';
}

export function makeGeneratorLiteralData(kind: GeneratorConfiguredTemplateKind, raw: string): Record<string, unknown> {
  if (kind === 'colorRamp') {
    return { type: 'color', value: raw.trim() || generatorDefaultSourceValue(kind) };
  }
  if (kind === 'formula') {
    return { type: 'number', value: Number(raw) || 0 };
  }
  const dimension = parseGeneratorDimensionSource(raw);
  return { type: 'dimension', value: dimension.value, unit: dimension.unit };
}

export function buildGeneratorNodesFromStructuredDraft(
  draft: GeneratorStructuredDraft,
): Pick<TokenGeneratorDocument, 'nodes' | 'edges'> {
  const generationId = 'generation';
  const outputId = 'output';
  const nodes: TokenGeneratorNode[] = [];
  const edges: TokenGeneratorEdge[] = [];
  const hasSource = !SOURCELESS_GENERATOR_TEMPLATES.has(draft.kind);

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
    kind: NODE_KIND_BY_TEMPLATE[draft.kind],
    label: generatorTemplateLabel(draft.kind),
    position: { x: hasSource ? 360 : 130, y: 140 },
    data: { ...draft.config },
  });
  nodes.push({
    id: outputId,
    kind: 'groupOutput',
    label: 'Series output',
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
  kind: GeneratorConfiguredTemplateKind,
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
  const generationNodes = generator.nodes.filter((node) => TEMPLATE_BY_NODE_KIND[node.kind]);
  const outputNodes = generator.nodes.filter((node) => node.kind === 'groupOutput');
  if (generationNodes.length !== 1 || outputNodes.length !== 1) return null;

  const generationNode = generationNodes[0]!;
  const outputNode = outputNodes[0]!;
  const kind = TEMPLATE_BY_NODE_KIND[generationNode.kind];
  if (!kind) return null;

  const hasSource = !SOURCELESS_GENERATOR_TEMPLATES.has(kind);
  const sourceNodes = generator.nodes.filter((node) => node.kind === 'literal' || node.kind === 'tokenInput');
  const sourceNode = sourceNodes[0];
  if (hasSource ? sourceNodes.length !== 1 : sourceNodes.length !== 0) return null;

  const expectedNodeCount = hasSource ? 3 : 2;
  if (generator.nodes.length !== expectedNodeCount) return null;

  const expectedEdges: TokenGeneratorEdge[] = [
    {
      id: 'generation-output',
      from: { nodeId: generationNode.id, port: 'value' },
      to: { nodeId: outputNode.id, port: 'value' },
    },
  ];
  if (hasSource && sourceNode) {
    expectedEdges.unshift({
      id: 'source-generation',
      from: { nodeId: sourceNode.id, port: 'value' },
      to: { nodeId: generationNode.id, port: 'value' },
    });
  }
  if (generator.edges.length !== expectedEdges.length) return null;
  if (!expectedEdges.every((expected) => generator.edges.some((edge) => sameGeneratorEdge(edge, expected)))) {
    return null;
  }

  let sourceMode: GeneratorSourceMode = 'literal';
  let sourceValue = generatorDefaultSourceValue(kind);
  let sourceCollectionId = '';
  let sourceTokenPath = '';

  if (hasSource) {
    if (!sourceNode) return null;
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

function sameGeneratorEdge(a: TokenGeneratorEdge, b: TokenGeneratorEdge): boolean {
  return (
    a.from.nodeId === b.from.nodeId &&
    a.from.port === b.from.port &&
    a.to.nodeId === b.to.nodeId &&
    a.to.port === b.to.port
  );
}

function readSourceValue(data: Record<string, unknown>): string {
  const value = data.value;
  if (data.type === 'dimension' && typeof value === 'number' && typeof data.unit === 'string') {
    return `${value}${data.unit}`;
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function parseGeneratorDimensionSource(raw: string): { value: number; unit: DimensionUnit } {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)([a-zA-Z%]+)?$/);
  const value = match ? Number(match[1]) : Number(trimmed);
  const unit = match?.[2];
  return {
    value: Number.isFinite(value) ? value : 0,
    unit: DIMENSION_UNITS.includes(unit as DimensionUnit) ? unit as DimensionUnit : 'px',
  };
}
