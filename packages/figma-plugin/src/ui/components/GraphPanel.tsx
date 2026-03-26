import { useState } from 'react';
import type { TokenGenerator, ColorRampConfig, SpacingScaleConfig, TypeScaleConfig, GeneratorType, GeneratorConfig } from '../hooks/useGenerators';

// ---------------------------------------------------------------------------
// Graph template definitions
// ---------------------------------------------------------------------------

interface SemanticMapping {
  semantic: string;
  step: string;
  type: 'color' | 'dimension' | 'number';
}

interface SemanticLayer {
  prefix: string;
  mappings: SemanticMapping[];
}

interface GraphTemplate {
  id: string;
  label: string;
  description: string;
  stages: string[];
  generatorType: GeneratorType;
  defaultPrefix: string;
  requiresSource: boolean;
  config: GeneratorConfig;
  semanticLayers: SemanticLayer[];
}

export const GRAPH_TEMPLATES: GraphTemplate[] = [
  {
    id: 'material-color',
    label: 'Material color palette',
    description: '11-step perceptual color ramp with semantic action map',
    stages: ['Source color', '11-step ramp', 'Semantic map'],
    generatorType: 'colorRamp',
    defaultPrefix: 'brand',
    requiresSource: true,
    config: {
      steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950],
      lightEnd: 97,
      darkEnd: 8,
      chromaBoost: 1.0,
      includeSource: false,
    } as ColorRampConfig,
    semanticLayers: [
      {
        prefix: 'semantic',
        mappings: [
          { semantic: 'action.default', step: '500', type: 'color' },
          { semantic: 'action.hover', step: '600', type: 'color' },
          { semantic: 'action.active', step: '700', type: 'color' },
          { semantic: 'action.disabled', step: '300', type: 'color' },
        ],
      },
    ],
  },
  {
    id: 'tailwind-spacing',
    label: 'Tailwind spacing',
    description: 'Tailwind-style spacing scale with component spacing map',
    stages: ['Base unit', 'Spacing scale', 'Component map'],
    generatorType: 'spacingScale',
    defaultPrefix: 'spacing',
    requiresSource: true,
    config: {
      steps: [
        { name: '1', multiplier: 1 },
        { name: '2', multiplier: 2 },
        { name: '3', multiplier: 3 },
        { name: '4', multiplier: 4 },
        { name: '5', multiplier: 5 },
        { name: '6', multiplier: 6 },
        { name: '8', multiplier: 8 },
        { name: '10', multiplier: 10 },
        { name: '12', multiplier: 12 },
        { name: '16', multiplier: 16 },
        { name: '20', multiplier: 20 },
        { name: '24', multiplier: 24 },
      ],
      unit: 'px',
    } as SpacingScaleConfig,
    semanticLayers: [
      {
        prefix: 'component',
        mappings: [
          { semantic: 'padding.sm', step: '2', type: 'dimension' },
          { semantic: 'padding.md', step: '4', type: 'dimension' },
          { semantic: 'padding.lg', step: '6', type: 'dimension' },
          { semantic: 'gap.sm', step: '2', type: 'dimension' },
          { semantic: 'gap.md', step: '4', type: 'dimension' },
        ],
      },
    ],
  },
  {
    id: 'modular-type',
    label: 'Modular type scale',
    description: 'Base size × ratio (1.333) → 7-step type scale',
    stages: ['Base size', 'Type scale ×1.333'],
    generatorType: 'typeScale',
    defaultPrefix: 'fontSize',
    requiresSource: true,
    config: {
      steps: [
        { name: 'xs', exponent: -2 },
        { name: 'sm', exponent: -1 },
        { name: 'base', exponent: 0 },
        { name: 'lg', exponent: 1 },
        { name: 'xl', exponent: 2 },
        { name: '2xl', exponent: 3 },
        { name: '3xl', exponent: 4 },
      ],
      ratio: 1.333,
      unit: 'rem',
      baseStep: 'base',
      roundTo: 3,
    } as TypeScaleConfig,
    semanticLayers: [],
  },
  {
    id: 'full-semantic-color',
    label: 'Full semantic color system',
    description: 'Brand color → ramp → semantic surfaces, text, borders & actions',
    stages: ['Brand color', 'Color ramp', 'Semantic layers'],
    generatorType: 'colorRamp',
    defaultPrefix: 'brand',
    requiresSource: true,
    config: {
      steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950],
      lightEnd: 97,
      darkEnd: 8,
      chromaBoost: 1.0,
      includeSource: false,
    } as ColorRampConfig,
    semanticLayers: [
      {
        prefix: 'color',
        mappings: [
          { semantic: 'surface.page', step: '50', type: 'color' },
          { semantic: 'surface.raised', step: '100', type: 'color' },
          { semantic: 'surface.overlay', step: '200', type: 'color' },
          { semantic: 'text.primary', step: '900', type: 'color' },
          { semantic: 'text.secondary', step: '700', type: 'color' },
          { semantic: 'text.disabled', step: '400', type: 'color' },
          { semantic: 'text.inverse', step: '50', type: 'color' },
          { semantic: 'border.default', step: '200', type: 'color' },
          { semantic: 'border.strong', step: '400', type: 'color' },
          { semantic: 'action.default', step: '500', type: 'color' },
          { semantic: 'action.hover', step: '600', type: 'color' },
          { semantic: 'action.active', step: '700', type: 'color' },
          { semantic: 'action.disabled', step: '300', type: 'color' },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStepCount(template: GraphTemplate): number {
  const cfg = template.config as Record<string, unknown>;
  const steps = cfg.steps;
  if (Array.isArray(steps)) return steps.length;
  return 0;
}

function getGeneratorTypeLabel(type: GeneratorType): string {
  switch (type) {
    case 'colorRamp': return 'Color ramp';
    case 'spacingScale': return 'Spacing scale';
    case 'typeScale': return 'Type scale';
    case 'opacityScale': return 'Opacity scale';
    case 'borderRadiusScale': return 'Border radius';
    case 'zIndexScale': return 'Z-index scale';
    case 'customScale': return 'Custom scale';
  }
}

function getGeneratorStepCount(generator: TokenGenerator): number {
  const cfg = generator.config as Record<string, unknown>;
  const steps = cfg.steps;
  if (Array.isArray(steps)) return steps.length;
  return 0;
}

// ---------------------------------------------------------------------------
// Pipeline stage row (visual arrows)
// ---------------------------------------------------------------------------

function PipelineStages({ stages }: { stages: string[] }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {stages.map((stage, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)] font-medium whitespace-nowrap">
            {stage}
          </span>
          {i < stages.length - 1 && (
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-tertiary)] shrink-0">
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template card icons
// ---------------------------------------------------------------------------

function TemplateIcon({ id }: { id: string }) {
  switch (id) {
    case 'material-color':
      return (
        <div className="flex gap-0.5 h-5 items-center">
          {[97, 80, 60, 40, 20, 8].map((l, i) => (
            <div key={i} className="w-2.5 h-full rounded-sm" style={{ background: `hsl(220, 60%, ${l}%)` }} />
          ))}
        </div>
      );
    case 'tailwind-spacing':
      return (
        <div className="flex items-end gap-0.5 h-5">
          {[20, 35, 50, 65, 80, 100].map((h, i) => (
            <div key={i} className="w-1.5 rounded-sm bg-[var(--color-figma-accent)]" style={{ height: `${h}%`, opacity: 0.5 + i * 0.1 }} />
          ))}
        </div>
      );
    case 'modular-type':
      return (
        <div className="flex items-baseline gap-1 h-5 overflow-hidden">
          {[7, 9, 11, 13, 16].map((size, i) => (
            <span key={i} className="text-[var(--color-figma-text)] font-medium leading-none" style={{ fontSize: `${size}px` }}>A</span>
          ))}
        </div>
      );
    case 'full-semantic-color':
      return (
        <div className="flex gap-0.5 items-center h-5">
          {[
            [97, 80, 60],
            [40, 20, 8],
          ].map((group, gi) => (
            <div key={gi} className="flex flex-col gap-0.5">
              {group.map((l, i) => (
                <div key={i} className="w-2 h-1.5 rounded-sm" style={{ background: `hsl(260, 55%, ${l}%)` }} />
              ))}
            </div>
          ))}
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-tertiary)] mx-0.5">
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
          <div className="flex flex-col gap-0.5">
            {['surface', 'text', 'border', 'action'].map((l, i) => (
              <div key={i} className="w-8 h-1 rounded-sm bg-[var(--color-figma-accent)]" style={{ opacity: 0.4 + i * 0.2 }} />
            ))}
          </div>
        </div>
      );
    default:
      return (
        <div className="flex items-center justify-center w-10 h-5 text-[var(--color-figma-text-tertiary)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="5" cy="12" r="3" /><path d="M8 12h8" /><circle cx="19" cy="12" r="3" />
          </svg>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Template card
// ---------------------------------------------------------------------------

function TemplateCard({
  template,
  onSelect,
  disabled,
}: {
  template: GraphTemplate;
  onSelect: () => void;
  disabled: boolean;
}) {
  const stepCount = getStepCount(template);
  const semanticCount = template.semanticLayers.reduce((n, l) => n + l.mappings.length, 0);

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className="w-full text-left p-3 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] hover:bg-[var(--color-figma-bg-hover)] hover:border-[var(--color-figma-accent)] transition-all group disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <div className="flex items-start gap-2.5">
        <div className="shrink-0 mt-0.5">
          <TemplateIcon id={template.id} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[11px] font-medium text-[var(--color-figma-text)] group-hover:text-[var(--color-figma-accent)] transition-colors">
              {template.label}
            </span>
            <span className="text-[9px] px-1 py-px rounded-full bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] tabular-nums border border-[var(--color-figma-border)]">
              {stepCount}+{semanticCount}
            </span>
          </div>
          <p className="text-[10px] text-[var(--color-figma-text-secondary)] mb-2 leading-snug">
            {template.description}
          </p>
          <PipelineStages stages={template.stages} />
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Configuration form (after selecting a template)
// ---------------------------------------------------------------------------

function ApplyForm({
  template,
  activeSet,
  serverUrl,
  onBack,
  onApplied,
}: {
  template: GraphTemplate;
  activeSet: string;
  serverUrl: string;
  onBack: () => void;
  onApplied: () => void;
}) {
  const [sourceToken, setSourceToken] = useState('');
  const [prefix, setPrefix] = useState(template.defaultPrefix);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');

  const handleApply = async () => {
    if (template.requiresSource && !sourceToken.trim()) {
      setError('Source token path is required');
      return;
    }
    if (!prefix.trim()) {
      setError('Token prefix is required');
      return;
    }
    setApplying(true);
    setError('');
    try {
      const genBody = {
        type: template.generatorType,
        name: template.label,
        sourceToken: template.requiresSource ? sourceToken.trim() : undefined,
        targetSet: activeSet,
        targetGroup: prefix.trim(),
        config: template.config,
      };
      const res = await fetch(`${serverUrl}/api/generators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genBody),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || `Failed to create generator (${res.status})`);
      }

      // Create semantic alias tokens
      for (const layer of template.semanticLayers) {
        for (const mapping of layer.mappings) {
          const fullPath = `${layer.prefix}.${mapping.semantic}`;
          const tokenBody = {
            $type: mapping.type,
            $value: `{${prefix.trim()}.${mapping.step}}`,
            $description: `Semantic alias for ${prefix.trim()}.${mapping.step}`,
          };
          const tokenRes = await fetch(
            `${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${fullPath}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(tokenBody),
              signal: AbortSignal.timeout(5000),
            },
          );
          if (!tokenRes.ok && tokenRes.status !== 409) {
            // Try PATCH as fallback
            await fetch(
              `${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${fullPath}`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tokenBody),
                signal: AbortSignal.timeout(5000),
              },
            );
          }
        }
      }

      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply template');
      setApplying(false);
    }
  };

  const stepCount = getStepCount(template);
  const semanticCount = template.semanticLayers.reduce((n, l) => n + l.mappings.length, 0);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shrink-0">
        <button
          onClick={onBack}
          className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] transition-colors"
          aria-label="Back to templates"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M7.5 9.5L4 6l3.5-3.5" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-[var(--color-figma-text)] truncate">{template.label}</div>
          <div className="text-[9px] text-[var(--color-figma-text-secondary)]">Configure & apply to <span className="font-mono">{activeSet}</span></div>
        </div>
      </div>

      <div className="flex-1 p-3 flex flex-col gap-3">
        {/* Pipeline preview */}
        <div className="p-2.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <div className="text-[9px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide mb-1.5">Pipeline</div>
          <PipelineStages stages={template.stages} />
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[9px] text-[var(--color-figma-text-tertiary)] tabular-nums">{stepCount} generated tokens</span>
            {semanticCount > 0 && (
              <>
                <span className="text-[var(--color-figma-text-tertiary)]">·</span>
                <span className="text-[9px] text-[var(--color-figma-text-tertiary)] tabular-nums">{semanticCount} semantic aliases</span>
              </>
            )}
          </div>
        </div>

        {/* Source token */}
        {template.requiresSource && (
          <div>
            <label className="block text-[10px] font-medium text-[var(--color-figma-text)] mb-1">
              Source token
              <span className="ml-1 text-[var(--color-figma-error)]">*</span>
            </label>
            <input
              type="text"
              value={sourceToken}
              onChange={e => setSourceToken(e.target.value)}
              placeholder={template.generatorType === 'colorRamp' ? 'e.g. brand.500' : template.generatorType === 'typeScale' ? 'e.g. fontSize.base' : 'e.g. spacing.base'}
              className="w-full px-2 py-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)] font-mono"
              autoFocus
            />
            <p className="text-[9px] text-[var(--color-figma-text-tertiary)] mt-1">
              Path of the token to derive from. Must exist in <span className="font-mono">{activeSet}</span>.
            </p>
          </div>
        )}

        {/* Target prefix */}
        <div>
          <label className="block text-[10px] font-medium text-[var(--color-figma-text)] mb-1">Token prefix</label>
          <input
            type="text"
            value={prefix}
            onChange={e => setPrefix(e.target.value)}
            placeholder="e.g. brand"
            className="w-full px-2 py-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)] font-mono"
          />
          <p className="text-[9px] text-[var(--color-figma-text-tertiary)] mt-1">
            Generated tokens will be at <span className="font-mono text-[var(--color-figma-text)]">{prefix || '…'}.*</span>
          </p>
        </div>

        {/* Semantic layers preview */}
        {template.semanticLayers.length > 0 && (
          <div>
            <div className="text-[9px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide mb-1.5">Also creates</div>
            <div className="flex flex-col gap-1">
              {template.semanticLayers.map((layer, li) => (
                <div key={li} className="flex flex-wrap gap-1">
                  {layer.mappings.slice(0, 4).map((m, mi) => (
                    <span key={mi} className="text-[9px] px-1 py-px rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] font-mono border border-[var(--color-figma-border)]">
                      {layer.prefix}.{m.semantic}
                    </span>
                  ))}
                  {layer.mappings.length > 4 && (
                    <span className="text-[9px] px-1 py-px rounded text-[var(--color-figma-text-tertiary)]">
                      +{layer.mappings.length - 4} more
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="text-[10px] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 px-2 py-1.5 rounded">
            {error}
          </p>
        )}

        <button
          onClick={handleApply}
          disabled={applying || (template.requiresSource && !sourceToken.trim()) || !prefix.trim()}
          className="w-full py-2 px-3 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors mt-auto"
        >
          {applying ? 'Applying…' : 'Apply template'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generator pipeline card (shown after templates are applied)
// ---------------------------------------------------------------------------

function GeneratorPipelineCard({ generator }: { generator: TokenGenerator }) {
  const stepCount = getGeneratorStepCount(generator);
  const typeLabel = getGeneratorTypeLabel(generator.type);

  return (
    <div className="p-3 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] font-medium border border-[var(--color-figma-accent)]/20">
          {typeLabel}
        </span>
        <span className="text-[11px] font-medium text-[var(--color-figma-text)] truncate flex-1">{generator.name}</span>
      </div>
      <div className="flex items-center gap-1.5 text-[10px]">
        {generator.sourceToken ? (
          <>
            <span className="font-mono text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] px-1 py-px rounded border border-[var(--color-figma-border)] truncate max-w-[100px]">
              {generator.sourceToken}
            </span>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-tertiary)] shrink-0">
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
          </>
        ) : (
          <>
            <span className="text-[9px] px-1 py-px rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)] border border-[var(--color-figma-border)]">standalone</span>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-tertiary)] shrink-0">
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
          </>
        )}
        <span className="font-mono text-[var(--color-figma-text)] bg-[var(--color-figma-bg-secondary)] px-1 py-px rounded border border-[var(--color-figma-border)] truncate max-w-[100px]">
          {generator.targetGroup}.*
        </span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-tertiary)] shrink-0">
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
        <span className="text-[var(--color-figma-text-secondary)] tabular-nums">{stepCount} tokens</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface GraphPanelProps {
  serverUrl: string;
  activeSet: string;
  generators: TokenGenerator[];
  connected: boolean;
  onRefresh: () => void;
  onApplyTemplate?: (templateId: string) => void;
  pendingTemplateId?: string | null;
}

export function GraphPanel({
  serverUrl,
  activeSet,
  generators,
  connected,
  onRefresh,
  onApplyTemplate,
  pendingTemplateId,
}: GraphPanelProps) {
  const setGenerators = generators.filter(g => g.targetSet === activeSet);

  const initialTemplate = pendingTemplateId
    ? (GRAPH_TEMPLATES.find(t => t.id === pendingTemplateId) ?? null)
    : null;

  const [selectedTemplate, setSelectedTemplate] = useState<GraphTemplate | null>(initialTemplate);
  const [browsingTemplates, setBrowsingTemplates] = useState(false);
  const [justApplied, setJustApplied] = useState<string | null>(null);

  const handleSelectTemplate = (template: GraphTemplate) => {
    setSelectedTemplate(template);
    setJustApplied(null);
  };

  const handleApplied = () => {
    setJustApplied(selectedTemplate?.label ?? null);
    setSelectedTemplate(null);
    setBrowsingTemplates(false);
    if (onApplyTemplate) onApplyTemplate('');
    onRefresh();
  };

  const handleBack = () => {
    setSelectedTemplate(null);
    setBrowsingTemplates(false);
    if (onApplyTemplate) onApplyTemplate('');
  };

  // Configuration form
  if (selectedTemplate) {
    return (
      <ApplyForm
        template={selectedTemplate}
        activeSet={activeSet}
        serverUrl={serverUrl}
        onBack={handleBack}
        onApplied={handleApplied}
      />
    );
  }

  // Pipeline view — generators exist (and not browsing templates)
  if (setGenerators.length > 0 && !browsingTemplates) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="px-3 py-2.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shrink-0 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-[var(--color-figma-text)]">Graph</div>
            <div className="text-[9px] text-[var(--color-figma-text-secondary)]">
              {setGenerators.length} generator{setGenerators.length !== 1 ? 's' : ''} in <span className="font-mono">{activeSet}</span>
            </div>
          </div>
          <button
            onClick={() => setBrowsingTemplates(true)}
            disabled={!connected}
            className="text-[9px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Add another template"
          >
            + Template
          </button>
        </div>

        {justApplied && (
          <div className="mx-3 mt-3 px-2.5 py-2 rounded bg-[var(--color-figma-success,#22c55e)]/10 border border-[var(--color-figma-success,#22c55e)]/20 text-[10px] text-[var(--color-figma-success,#16a34a)] flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span><strong>{justApplied}</strong> applied — tokens are generating</span>
          </div>
        )}

        <div className="flex-1 p-3 flex flex-col gap-2">
          {setGenerators.map(gen => (
            <GeneratorPipelineCard key={gen.id} generator={gen} />
          ))}
        </div>
      </div>
    );
  }

  // Empty state — template selection (also used when browsing from pipeline view)
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 pt-4 pb-3 shrink-0 flex items-start gap-2">
        {browsingTemplates && (
          <button
            onClick={() => setBrowsingTemplates(false)}
            className="mt-0.5 p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] transition-colors shrink-0"
            aria-label="Back to pipeline"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M7.5 9.5L4 6l3.5-3.5" />
            </svg>
          </button>
        )}
        <div className="flex-1">
          {!browsingTemplates ? (
            <>
              <div className="flex items-center justify-between mb-0.5">
                <div className="text-[12px] font-semibold text-[var(--color-figma-text)]">New graph</div>
              </div>
              <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug">
                Pick a template to generate tokens in <span className="font-mono">{activeSet}</span> — color ramps, spacing scales, type scales, and more.
              </p>
            </>
          ) : (
            <>
              <div className="text-[12px] font-medium text-[var(--color-figma-text)] mb-0.5">Graph templates</div>
              <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug">
                Pre-built token pipelines. Pick a template to drop a generator graph into <span className="font-mono">{activeSet}</span>, ready to customize.
              </p>
            </>
          )}
        </div>
      </div>

      {justApplied && (
        <div className="mx-3 mb-2 px-2.5 py-2 rounded bg-[var(--color-figma-success,#22c55e)]/10 border border-[var(--color-figma-success,#22c55e)]/20 text-[10px] text-[var(--color-figma-success,#16a34a)] flex items-center gap-1.5">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <span><strong>{justApplied}</strong> applied</span>
        </div>
      )}

      <div className="px-3 pb-3 flex flex-col gap-2">
        {GRAPH_TEMPLATES.map(template => (
          <TemplateCard
            key={template.id}
            template={template}
            onSelect={() => handleSelectTemplate(template)}
            disabled={!connected}
          />
        ))}
      </div>

      {!connected && (
        <div className="px-3 pb-3">
          <p className="text-[10px] text-[var(--color-figma-text-tertiary)] text-center">
            Connect to the server to apply templates
          </p>
        </div>
      )}
    </div>
  );
}
