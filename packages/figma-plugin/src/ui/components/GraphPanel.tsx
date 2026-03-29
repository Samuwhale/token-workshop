import { getErrorMessage } from '../shared/utils';
import { Spinner } from './Spinner';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { TokenGenerator, ColorRampConfig, SpacingScaleConfig, TypeScaleConfig, ShadowScaleConfig, GeneratorType, GeneratorConfig, GeneratedTokenResult } from '../hooks/useGenerators';
import { isDimensionLike } from './generators/generatorShared';
import { NodeGraphCanvas } from './nodeGraph/NodeGraphCanvas';
import { usePanelHelp, PanelHelpIcon, PanelHelpBanner } from './PanelHelpHint';
import { apiFetch } from '../shared/apiFetch';

// ---------------------------------------------------------------------------
// Graph template definitions
// ---------------------------------------------------------------------------

interface SemanticMapping {
  semantic: string;
  step: string;
  type: 'color' | 'dimension' | 'number' | 'shadow';
}

interface SemanticLayer {
  prefix: string;
  mappings: SemanticMapping[];
}

interface GraphTemplate {
  id: string;
  label: string;
  description: string;
  whenToUse: string;
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
    whenToUse: 'Use for brand primary or secondary colors — gives you action.default, action.hover, action.active, and action.disabled aliases out of the box.',
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
    whenToUse: 'Use when starting a new project or matching a Tailwind layout — generates semantic component.padding and component.gap aliases for small, medium, and large sizes.',
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
    whenToUse: 'Use to create a harmonious type scale from a single base size — steps grow by a 4:3 ratio, giving you xs through 3xl for body copy, headings, and display text.',
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
    id: 'elevation-shadow',
    label: 'Elevation shadow scale',
    description: '5-step shadow scale (sm → 2xl) with semantic component aliases',
    whenToUse: 'Use to add consistent depth to cards, modals, and dropdowns — generates semantic component.card, component.modal, and component.dropdown shadow aliases.',
    stages: ['Shadow config', '5-step scale', 'Component map'],
    generatorType: 'shadowScale',
    defaultPrefix: 'shadow',
    requiresSource: false,
    config: {
      color: '#000000',
      steps: [
        { name: 'sm',  offsetX: 0, offsetY: 1,  blur: 2,  spread: 0,  opacity: 0.05 },
        { name: 'md',  offsetX: 0, offsetY: 4,  blur: 6,  spread: -1, opacity: 0.1  },
        { name: 'lg',  offsetX: 0, offsetY: 10, blur: 15, spread: -3, opacity: 0.1  },
        { name: 'xl',  offsetX: 0, offsetY: 20, blur: 25, spread: -5, opacity: 0.1  },
        { name: '2xl', offsetX: 0, offsetY: 25, blur: 50, spread: -12, opacity: 0.25 },
      ],
    } as ShadowScaleConfig,
    semanticLayers: [
      {
        prefix: 'component',
        mappings: [
          { semantic: 'card', step: 'md', type: 'shadow' },
          { semantic: 'modal', step: 'xl', type: 'shadow' },
          { semantic: 'dropdown', step: 'lg', type: 'shadow' },
        ],
      },
    ],
  },
  {
    id: 'full-semantic-color',
    label: 'Full semantic color system',
    description: 'Brand color → ramp → semantic surfaces, text, borders & actions',
    whenToUse: 'Use when building a design system from scratch — generates a complete set of color.surface, color.text, color.border, and color.action tokens from one brand color.',
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

function getTemplateStepCount(template: GraphTemplate): number {
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
    case 'shadowScale': return 'Shadow scale';
    case 'customScale': return 'Custom scale';
    case 'contrastCheck': return 'Contrast check';
    case 'accessibleColorPair': return 'Accessible color pair';
    case 'darkModeInversion': return 'Dark mode inversion';
    default: return type;
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
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)] font-medium whitespace-nowrap">
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

function getRequiresSourceLabel(generatorType: GeneratorType): string {
  switch (generatorType) {
    case 'colorRamp': return 'Requires a color token';
    case 'spacingScale': return 'Requires a spacing token';
    case 'typeScale': return 'Requires a font size token';
    default: return 'Requires a source token';
  }
}

function TemplateCard({
  template,
  onSelect,
  disabled,
}: {
  template: GraphTemplate;
  onSelect: () => void;
  disabled: boolean;
}) {
  const stepCount = getTemplateStepCount(template);
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
            <span className="text-[10px] px-1 py-px rounded-full bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] tabular-nums border border-[var(--color-figma-border)]">
              {stepCount}+{semanticCount}
            </span>
          </div>
          <p className="text-[10px] text-[var(--color-figma-text-secondary)] mb-1.5 leading-snug">
            {template.description}
          </p>
          <p className="text-[9.5px] text-[var(--color-figma-text-tertiary,var(--color-figma-text-secondary))] mb-2 leading-snug italic opacity-80">
            {template.whenToUse}
          </p>
          <PipelineStages stages={template.stages} />
          {template.requiresSource && (
            <div className="mt-2 flex items-center gap-1">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-70" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="text-[9.5px] text-[var(--color-figma-text-secondary)] opacity-80">
                {getRequiresSourceLabel(template.generatorType)}
              </span>
            </div>
          )}
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
  initialPrefix,
}: {
  template: GraphTemplate;
  activeSet: string;
  serverUrl: string;
  onBack: () => void;
  onApplied: () => void;
  initialPrefix?: string;
}) {
  const [sourceToken, setSourceToken] = useState('');
  const [prefix, setPrefix] = useState(initialPrefix ?? template.defaultPrefix);
  const [applying, setApplying] = useState(false);
  const applyingRef = useRef(false);
  const [error, setError] = useState('');
  const [semanticConflicts, setSemanticConflicts] = useState<string[]>([]);

  // Live preview state
  const [previewTokens, setPreviewTokens] = useState<GeneratedTokenResult[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPreview = useCallback(() => {
    // Need a source token (if required) and prefix to preview
    if (template.requiresSource && !sourceToken.trim()) {
      setPreviewTokens([]);
      setPreviewError('');
      return;
    }
    if (!prefix.trim()) {
      setPreviewTokens([]);
      setPreviewError('');
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPreviewLoading(true);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPreviewError('');
      try {
        const body = {
          type: template.generatorType,
          sourceToken: template.requiresSource ? sourceToken.trim() : undefined,
          targetGroup: prefix.trim(),
          targetSet: activeSet,
          config: template.config,
        };
        const data = await apiFetch<{ count: number; tokens: GeneratedTokenResult[] }>(`${serverUrl}/api/generators/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        setPreviewTokens(data.tokens ?? []);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setPreviewError(getErrorMessage(err, 'Preview failed'));
        setPreviewTokens([]);
      } finally {
        setPreviewLoading(false);
      }
    }, 300);
  }, [serverUrl, template, sourceToken, prefix, activeSet]);

  useEffect(() => {
    fetchPreview();
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchPreview]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleApply = async () => {
    if (applyingRef.current) return;
    if (template.requiresSource && !sourceToken.trim()) {
      setError('Source token path is required');
      return;
    }
    if (!prefix.trim()) {
      setError('Token prefix is required');
      return;
    }
    applyingRef.current = true;
    setApplying(true);
    setError('');
    setSemanticConflicts([]);
    try {
      const genBody = {
        type: template.generatorType,
        name: template.label,
        sourceToken: template.requiresSource ? sourceToken.trim() : undefined,
        targetSet: activeSet,
        targetGroup: prefix.trim(),
        config: template.config,
      };
      await apiFetch(`${serverUrl}/api/generators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genBody),
        signal: AbortSignal.timeout(8000),
      });

      // Create semantic alias tokens
      const skipped: string[] = [];
      for (const layer of template.semanticLayers) {
        for (const mapping of layer.mappings) {
          const fullPath = `${layer.prefix}.${mapping.semantic}`;
          const tokenBody = {
            $type: mapping.type,
            $value: `{${prefix.trim()}.${mapping.step}}`,
            $description: `Semantic alias for ${prefix.trim()}.${mapping.step}`,
          };
          try {
            await apiFetch(
              `${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${fullPath}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tokenBody),
                signal: AbortSignal.timeout(5000),
              },
            );
          } catch (tokenErr: any) {
            if (tokenErr?.status === 409) {
              skipped.push(fullPath);
            } else {
              // Try PATCH as fallback
              await apiFetch(
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
      }

      if (skipped.length > 0) {
        setSemanticConflicts(skipped);
      } else {
        onApplied();
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to apply template'));
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  };

  const stepCount = getTemplateStepCount(template);
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
          <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Configure & apply to <span className="font-mono">{activeSet}</span></div>
        </div>
      </div>

      <div className="flex-1 p-3 flex flex-col gap-3">
        {/* Pipeline preview */}
        <div className="p-2.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide mb-1.5">Pipeline</div>
          <PipelineStages stages={template.stages} />
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[10px] text-[var(--color-figma-text-tertiary)] tabular-nums">{stepCount} generated tokens</span>
            {semanticCount > 0 && (
              <>
                <span className="text-[var(--color-figma-text-tertiary)]">·</span>
                <span className="text-[10px] text-[var(--color-figma-text-tertiary)] tabular-nums">{semanticCount} semantic aliases</span>
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
              aria-label="Source token path"
              className="w-full px-2 py-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)] font-mono"
              autoFocus
            />
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)] mt-1">
              Path of the token to derive from. Must exist in <span className="font-mono">{activeSet}</span>.
            </p>
          </div>
        )}

        {/* Target prefix */}
        <div>
          <label className="block text-[10px] font-medium text-[var(--color-figma-text)] mb-1">
            Token prefix
            <span className="ml-1 text-[var(--color-figma-error)]">*</span>
          </label>
          <input
            type="text"
            value={prefix}
            onChange={e => setPrefix(e.target.value)}
            placeholder="e.g. brand"
            aria-label="Token prefix"
            className="w-full px-2 py-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)] font-mono"
          />
          <p className="text-[10px] text-[var(--color-figma-text-tertiary)] mt-1">
            Generated tokens will be at <span className="font-mono text-[var(--color-figma-text)]">{prefix || '…'}.*</span>
          </p>
        </div>

        {/* Semantic layers preview */}
        {template.semanticLayers.length > 0 && (
          <div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide mb-1.5">Also creates</div>
            <div className="flex flex-col gap-1">
              {template.semanticLayers.map((layer, li) => (
                <div key={li} className="flex flex-wrap gap-1">
                  {layer.mappings.slice(0, 4).map((m, mi) => (
                    <span key={mi} className="text-[10px] px-1 py-px rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] font-mono border border-[var(--color-figma-border)]">
                      {layer.prefix}.{m.semantic}
                    </span>
                  ))}
                  {layer.mappings.length > 4 && (
                    <span className="text-[10px] px-1 py-px rounded text-[var(--color-figma-text-tertiary)]">
                      +{layer.mappings.length - 4} more
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live preview */}
        {(previewTokens.length > 0 || previewLoading || previewError) && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                Preview
                {previewTokens.length > 0 && <span className="ml-1 normal-case text-[var(--color-figma-text)]">({previewTokens.length} tokens)</span>}
              </span>
              {previewLoading && (
                <Spinner size="sm" className="text-[var(--color-figma-text-secondary)]" />
              )}
            </div>
            {previewError && (
              <div className="text-[10px] text-[var(--color-figma-error)] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-2 py-1.5">{previewError}</div>
            )}
            {!previewError && previewTokens.length > 0 && (
              <div className={`border border-[var(--color-figma-border)] rounded p-2 bg-[var(--color-figma-bg-secondary)] transition-opacity duration-150 ${previewLoading ? 'opacity-40' : 'opacity-100'}`}>
                {template.generatorType === 'colorRamp' && (
                  <div>
                    <div className="flex gap-0.5 rounded overflow-hidden h-6">
                      {previewTokens.map(t => (
                        <div key={t.stepName} className="flex-1 min-w-0" style={{ background: String(t.value) }} title={`${t.stepName}: ${String(t.value)}`} />
                      ))}
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[8px] text-[var(--color-figma-text-secondary)]">{previewTokens[0]?.stepName}</span>
                      <span className="text-[8px] text-[var(--color-figma-text-secondary)]">{previewTokens[previewTokens.length - 1]?.stepName}</span>
                    </div>
                  </div>
                )}
                {template.generatorType === 'typeScale' && (
                  <div className="flex flex-col gap-1">
                    {previewTokens.map(t => {
                      const val = isDimensionLike(t.value)
                        ? `${t.value.value}${t.value.unit || ''}`
                        : String(t.value);
                      return (
                        <div key={t.stepName} className="flex items-baseline gap-2">
                          <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-8 text-right font-mono shrink-0">{t.stepName}</span>
                          <span className="text-[var(--color-figma-text)] font-medium truncate" style={{ fontSize: val }}>{val}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {template.generatorType === 'spacingScale' && (
                  <div className="flex flex-col gap-1">
                    {previewTokens.map(t => {
                      const val = isDimensionLike(t.value)
                        ? t.value.value
                        : (typeof t.value === 'number' ? t.value : parseFloat(String(t.value)));
                      const label = isDimensionLike(t.value)
                        ? `${t.value.value}${t.value.unit || ''}`
                        : String(t.value);
                      const maxVal = Math.max(...previewTokens.map(tk => {
                        const v = isDimensionLike(tk.value)
                          ? tk.value.value : (typeof tk.value === 'number' ? tk.value : parseFloat(String(tk.value)));
                        return typeof v === 'number' && !isNaN(v) ? v : 0;
                      }));
                      const pct = maxVal > 0 && typeof val === 'number' && !isNaN(val) ? (val / maxVal) * 100 : 0;
                      return (
                        <div key={t.stepName} className="flex items-center gap-2">
                          <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-8 text-right font-mono shrink-0">{t.stepName}</span>
                          <div className="flex-1 h-2 rounded-sm bg-[var(--color-figma-border)] overflow-hidden">
                            <div className="h-full rounded-sm bg-[var(--color-figma-accent)]" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[8px] text-[var(--color-figma-text-tertiary)] font-mono w-10 text-right shrink-0">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {template.generatorType !== 'colorRamp' && template.generatorType !== 'typeScale' && template.generatorType !== 'spacingScale' && (
                  <div className="flex flex-col gap-0.5">
                    {previewTokens.map(t => (
                      <div key={t.stepName} className="flex items-center justify-between text-[10px]">
                        <span className="font-mono text-[var(--color-figma-text-secondary)]">{t.stepName}</span>
                        <span className="font-mono text-[var(--color-figma-text)]">{String(t.value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-[10px] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 px-2 py-1.5 rounded">
            {error}
          </p>
        )}

        {semanticConflicts.length > 0 && (
          <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2.5">
            <div className="flex items-start gap-1.5 mb-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-warning,#f59e0b)] shrink-0 mt-px" aria-hidden="true">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
                {semanticConflicts.length} semantic alias{semanticConflicts.length !== 1 ? 'es' : ''} already existed and {semanticConflicts.length !== 1 ? 'were' : 'was'} skipped
              </span>
            </div>
            <div className="flex flex-col gap-0.5 mb-2 max-h-24 overflow-y-auto">
              {semanticConflicts.map(path => (
                <span key={path} className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] px-1 py-px rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">
                  {path}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] mb-2">
              The generator was created. To update existing aliases, edit them individually.
            </p>
            <button
              onClick={onApplied}
              className="w-full py-1.5 px-2 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors"
            >
              Got it, continue
            </button>
          </div>
        )}

        {semanticConflicts.length === 0 && !applying && (template.requiresSource && !sourceToken.trim() || !prefix.trim()) && (
          <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">
            {template.requiresSource && !sourceToken.trim() && !prefix.trim()
              ? 'Source token and token prefix are required.'
              : template.requiresSource && !sourceToken.trim()
                ? 'Source token is required.'
                : 'Token prefix is required.'}
          </p>
        )}

        {semanticConflicts.length === 0 && (
          <button
            onClick={handleApply}
            disabled={applying || (template.requiresSource && !sourceToken.trim()) || !prefix.trim()}
            className="w-full py-2 px-3 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors mt-auto"
          >
            {applying ? 'Applying…' : previewTokens.length > 0 ? `Apply template (${previewTokens.length} tokens)` : 'Apply template'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generator pipeline card (shown after templates are applied)
// ---------------------------------------------------------------------------

function GeneratorPipelineCard({ generator, isFocused, focusRef, serverUrl, onRefresh }: { generator: TokenGenerator; isFocused?: boolean; focusRef?: React.RefObject<HTMLDivElement | null>; serverUrl: string; onRefresh: () => void }) {
  const [running, setRunning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const stepCount = getGeneratorStepCount(generator);
  const typeLabel = getGeneratorTypeLabel(generator.type);
  const hasError = !!generator.lastRunError;
  const isStale = !!generator.isStale && !hasError;

  const handleRerun = async () => {
    setRunning(true);
    setActionError(null);
    try {
      await apiFetch(`${serverUrl}/api/generators/${generator.id}/run`, { method: 'POST' });
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Re-run failed');
    } finally {
      setRunning(false);
    }
  };

  const handleDuplicate = async () => {
    setDuplicating(true);
    setActionError(null);
    try {
      const body = {
        type: generator.type,
        name: `${generator.name} (copy)`,
        sourceToken: generator.sourceToken,
        inlineValue: generator.inlineValue,
        targetSet: generator.targetSet,
        targetGroup: `${generator.targetGroup}_copy`,
        config: generator.config,
        overrides: generator.overrides,
      };
      await apiFetch(`${serverUrl}/api/generators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Duplicate failed');
    } finally {
      setDuplicating(false);
    }
  };

  const handleDelete = async (deleteTokens: boolean) => {
    setDeleting(true);
    setActionError(null);
    try {
      await apiFetch(`${serverUrl}/api/generators/${generator.id}?deleteTokens=${deleteTokens}`, { method: 'DELETE' });
      setShowDeleteConfirm(false);
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div ref={isFocused ? focusRef : undefined} className={`p-3 rounded border bg-[var(--color-figma-bg)] transition-all duration-500 ${hasError ? 'border-[var(--color-figma-error)]' : isStale ? 'border-yellow-400/70' : isFocused ? 'border-[var(--color-figma-accent)] ring-1 ring-[var(--color-figma-accent)]/40' : 'border-[var(--color-figma-border)]'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] font-medium border border-[var(--color-figma-accent)]/20">
          {typeLabel}
        </span>
        <span className="text-[11px] font-medium text-[var(--color-figma-text)] truncate flex-1">{generator.name}</span>
        {isStale && (
          <span
            title={`Source token "${generator.sourceToken}" has changed since this generator last ran. Re-run to update generated tokens.`}
            className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-yellow-600 bg-yellow-50 border border-yellow-300 rounded px-1.5 py-px leading-none"
            aria-label="Generator output may be stale"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Needs re-run
          </span>
        )}
        {hasError && (
          <span title={`Auto-run failed: ${generator.lastRunError!.message}`} className="shrink-0 text-[var(--color-figma-error)]" aria-label="Generator auto-run error">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </span>
        )}
      </div>
      {hasError && (
        <div className="mb-2 text-[10px] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 rounded px-2 py-1 border border-[var(--color-figma-error)]/20 break-words">
          Auto-run failed: {generator.lastRunError!.message}
        </div>
      )}
      {actionError && (
        <div className="mb-2 text-[10px] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 rounded px-2 py-1 border border-[var(--color-figma-error)]/20 break-words flex items-start gap-1.5">
          <span className="shrink-0 mt-px">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </span>
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="shrink-0 hover:opacity-70 transition-opacity" aria-label="Dismiss error">×</button>
        </div>
      )}
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
        ) : generator.inlineValue !== undefined ? (
          <>
            <span className="font-mono text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] px-1 py-px rounded border border-[var(--color-figma-border)] truncate max-w-[100px]">
              {typeof generator.inlineValue === 'string' ? generator.inlineValue : typeof generator.inlineValue === 'object' && generator.inlineValue !== null && 'value' in (generator.inlineValue as Record<string, unknown>) ? `${(generator.inlineValue as {value: number; unit?: string}).value}${(generator.inlineValue as {unit?: string}).unit || ''}` : String(generator.inlineValue)}
            </span>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-tertiary)] shrink-0">
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
          </>
        ) : (
          <>
            <span className="text-[10px] px-1 py-px rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)] border border-[var(--color-figma-border)]">standalone</span>
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
      {/* Actions */}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[var(--color-figma-border)]">
        <button
          onClick={handleRerun}
          disabled={running}
          className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] transition-colors disabled:opacity-50"
        >
          {running ? 'Running…' : 'Re-run'}
        </button>
        <button
          onClick={handleDuplicate}
          disabled={duplicating}
          className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors disabled:opacity-50"
          title="Duplicate this generator as a starting point"
        >
          {duplicating ? 'Duplicating…' : 'Duplicate'}
        </button>
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] transition-colors ml-auto"
          >
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Delete tokens too?</span>
            <button onClick={() => handleDelete(true)} disabled={deleting} className="text-[10px] text-[var(--color-figma-error)] hover:underline disabled:opacity-50">Yes</button>
            <button onClick={() => handleDelete(false)} disabled={deleting} className="text-[10px] text-[var(--color-figma-text-secondary)] hover:underline disabled:opacity-50">No</button>
            <button onClick={() => setShowDeleteConfirm(false)} className="text-[10px] text-[var(--color-figma-text-secondary)] hover:underline">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG export
// ---------------------------------------------------------------------------

function exportGraphAsSVG(generators: TokenGenerator[], activeSet: string): void {
  const boxW = 130;
  const boxH = 28;
  const boxR = 5;
  const arrowW = 28;
  const padX = 20;
  const padY = 20;
  const titleH = 32;
  const rowGap = 10;
  const svgW = padX * 2 + boxW * 3 + arrowW * 2;
  const svgH = padY + titleH + generators.length * (boxH + rowGap) - (generators.length > 0 ? rowGap : 0) + padY;

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '\u2026' : s);

  const box = (bx: number, by: number, label: string, accent = false) =>
    `<rect x="${bx}" y="${by}" width="${boxW}" height="${boxH}" rx="${boxR}" fill="${accent ? '#eff6ff' : '#f9fafb'}" stroke="${accent ? '#93c5fd' : '#e5e7eb'}" stroke-width="1"/>` +
    `<text x="${bx + boxW / 2}" y="${by + boxH / 2 + 4}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="9" fill="${accent ? '#1d4ed8' : '#374151'}">${esc(trunc(label, 18))}</text>`;

  const arrow = (ax: number, ay: number) =>
    `<line x1="${ax}" y1="${ay}" x2="${ax + arrowW - 5}" y2="${ay}" stroke="#9ca3af" stroke-width="1.5"/>` +
    `<polygon points="${ax + arrowW - 5},${ay - 3} ${ax + arrowW},${ay} ${ax + arrowW - 5},${ay + 3}" fill="#9ca3af"/>`;

  let rows = '';
  generators.forEach((gen, i) => {
    const y = padY + titleH + i * (boxH + rowGap);
    const mid = y + boxH / 2;
    const bx1 = padX;
    const bx2 = padX + boxW + arrowW;
    const bx3 = padX + boxW * 2 + arrowW * 2;
    const sourceLabel = gen.sourceToken || 'standalone';
    const genLabel = trunc(gen.name || getGeneratorTypeLabel(gen.type), 18);
    const targetLabel = `${gen.targetGroup}.*`;
    rows += box(bx1, y, sourceLabel) + arrow(bx1 + boxW, mid) + box(bx2, y, genLabel, true) + arrow(bx2 + boxW, mid) + box(bx3, y, targetLabel);
  });

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`,
    `<rect width="${svgW}" height="${svgH}" fill="white"/>`,
    `<text x="${padX}" y="${padY + 18}" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#111827">${esc(activeSet)} \u2014 Generator graph</text>`,
    rows,
    '</svg>',
  ].join('\n');

  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${activeSet}-graph.svg`;
  a.click();
  URL.revokeObjectURL(url);
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
  pendingGroupPath?: string | null;
  pendingGroupTokenType?: string | null;
  onClearPendingGroup?: () => void;
  focusGeneratorId?: string | null;
  onClearFocusGenerator?: () => void;
}

/** Map a DTCG token $type to the best-fit template id. */
function templateIdForTokenType(tokenType: string | null | undefined): string {
  if (tokenType === 'color') return 'material-color';
  if (tokenType === 'dimension') return 'tailwind-spacing';
  return 'modular-type';
}

export function GraphPanel({
  serverUrl,
  activeSet,
  generators,
  connected,
  onRefresh,
  onApplyTemplate,
  pendingTemplateId,
  pendingGroupPath,
  pendingGroupTokenType,
  onClearPendingGroup,
  focusGeneratorId,
  onClearFocusGenerator,
}: GraphPanelProps) {
  const help = usePanelHelp('generators');
  const setGenerators = generators.filter(g => g.targetSet === activeSet);
  const focusRef = useRef<HTMLDivElement>(null);

  const initialTemplate = pendingGroupPath
    ? (GRAPH_TEMPLATES.find(t => t.id === templateIdForTokenType(pendingGroupTokenType)) ?? GRAPH_TEMPLATES[0] ?? null)
    : pendingTemplateId
      ? (GRAPH_TEMPLATES.find(t => t.id === pendingTemplateId) ?? null)
      : null;

  const [selectedTemplate, setSelectedTemplate] = useState<GraphTemplate | null>(initialTemplate);
  const [browsingTemplates, setBrowsingTemplates] = useState(false);
  const [justApplied, setJustApplied] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');
  const [highlightedGeneratorId, setHighlightedGeneratorId] = useState<string | null>(null);

  // Scroll to and highlight a focused generator (from token badge click)
  useEffect(() => {
    if (!focusGeneratorId) return;
    setHighlightedGeneratorId(focusGeneratorId);
    setViewMode('list'); // list view supports scroll-to-card
    onClearFocusGenerator?.();
    // Scroll after render
    requestAnimationFrame(() => {
      focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    // Clear highlight after 2s
    const timer = setTimeout(() => setHighlightedGeneratorId(null), 2000);
    return () => clearTimeout(timer);
  }, [focusGeneratorId, onClearFocusGenerator]);

  const handleSelectTemplate = (template: GraphTemplate) => {
    setSelectedTemplate(template);
    setJustApplied(null);
  };

  const handleApplied = () => {
    setJustApplied(selectedTemplate?.label ?? null);
    setSelectedTemplate(null);
    setBrowsingTemplates(false);
    if (onApplyTemplate) onApplyTemplate('');
    if (onClearPendingGroup) onClearPendingGroup();
    onRefresh();
  };

  const handleBack = () => {
    setSelectedTemplate(null);
    setBrowsingTemplates(false);
    setSearchQuery('');
    if (onApplyTemplate) onApplyTemplate('');
    if (onClearPendingGroup) onClearPendingGroup();
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredGenerators = q
    ? setGenerators.filter(g =>
        g.name.toLowerCase().includes(q) ||
        (g.sourceToken ?? '').toLowerCase().includes(q) ||
        g.targetGroup.toLowerCase().includes(q),
      )
    : setGenerators;
  const filteredTemplates = q
    ? GRAPH_TEMPLATES.filter(t =>
        t.label.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.whenToUse.toLowerCase().includes(q) ||
        t.generatorType.toLowerCase().includes(q),
      )
    : GRAPH_TEMPLATES;

  // Configuration form
  if (selectedTemplate) {
    return (
      <ApplyForm
        template={selectedTemplate}
        activeSet={activeSet}
        serverUrl={serverUrl}
        onBack={handleBack}
        onApplied={handleApplied}
        initialPrefix={pendingGroupPath ?? undefined}
      />
    );
  }

  // Pipeline view — generators exist (and not browsing templates)
  if (setGenerators.length > 0 && !browsingTemplates) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-3 py-2.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div>
              <div className="text-[11px] font-medium text-[var(--color-figma-text)]">Graph</div>
              <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
              {q
                ? <>{filteredGenerators.length} of {setGenerators.length} generator{setGenerators.length !== 1 ? 's' : ''}</>
                : <>{setGenerators.length} generator{setGenerators.length !== 1 ? 's' : ''} in <span className="font-mono">{activeSet}</span></>
              }
              </div>
            </div>
            <PanelHelpIcon panelKey="generators" title="Generators" expanded={help.expanded} onToggle={help.toggle} />
          </div>
          <div className="flex items-center gap-1.5">
            {/* View mode toggle */}
            <div className="flex items-center rounded border border-[var(--color-figma-border)] overflow-hidden">
              <button
                onClick={() => setViewMode('graph')}
                className={`p-1 transition-colors ${viewMode === 'graph' ? 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]'}`}
                title="Node graph view"
                aria-label="Node graph view"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="14" width="6" height="6" rx="1" />
                  <rect x="16" y="4" width="6" height="6" rx="1" />
                  <rect x="16" y="14" width="6" height="6" rx="1" />
                  <path d="M8 17h2a2 2 0 002-2V9a2 2 0 012-2h2" />
                  <path d="M12 17h4" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1 transition-colors ${viewMode === 'list' ? 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]'}`}
                title="List view"
                aria-label="List view"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </button>
            </div>
            <button
              onClick={() => exportGraphAsSVG(setGenerators, activeSet)}
              className="p-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              title="Export graph as SVG"
              aria-label="Export graph as SVG"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            <button
              onClick={() => setBrowsingTemplates(true)}
              disabled={!connected}
              className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Add another template"
            >
              + Template
            </button>
          </div>
        </div>
        {help.expanded && (
          <PanelHelpBanner
            title="Generators"
            description="Turn a single source token into a whole token group automatically — color ramps, spacing scales, type scales, and more. Pick a template to get started, then customize the parameters."
            onDismiss={help.dismiss}
          />
        )}

        {justApplied && (
          <div className="mx-3 mt-2 px-2.5 py-2 rounded bg-[var(--color-figma-success,#22c55e)]/10 border border-[var(--color-figma-success,#22c55e)]/20 text-[10px] text-[var(--color-figma-success,#16a34a)] flex items-center gap-1.5 shrink-0">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span><strong>{justApplied}</strong> applied — tokens are generating</span>
          </div>
        )}

        {/* Node graph view */}
        {viewMode === 'graph' && (
          <NodeGraphCanvas
            generators={setGenerators}
            activeSet={activeSet}
            serverUrl={serverUrl}
            onRefresh={onRefresh}
          />
        )}

        {/* List view (fallback) */}
        {viewMode === 'list' && (
          <>
            {/* Search bar */}
            <div className="px-3 pt-2.5 pb-1 shrink-0">
              <div className="relative">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)] pointer-events-none" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search generators…"
                  aria-label="Search generators"
                  className="w-full pl-6 pr-6 py-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors"
                    aria-label="Clear search"
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {filteredGenerators.length > 0
                ? filteredGenerators.map(gen => (
                    <GeneratorPipelineCard key={gen.id} generator={gen} isFocused={gen.id === highlightedGeneratorId} focusRef={focusRef} serverUrl={serverUrl} onRefresh={onRefresh} />
                  ))
                : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <p className="text-[11px] text-[var(--color-figma-text-secondary)] mb-1">No generators match</p>
                    <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                      Try a different search term
                    </p>
                  </div>
                )
              }
            </div>
          </>
        )}
      </div>
    );
  }

  // True empty state — no generators exist and not browsing templates
  if (setGenerators.length === 0 && !browsingTemplates) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center">
          {/* Icon */}
          <div className="mb-4 w-10 h-10 rounded-xl bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
              <circle cx="5" cy="12" r="3" />
              <path d="M8 12h3" />
              <rect x="11" y="9" width="6" height="6" rx="1" />
              <path d="M17 12h3" />
              <circle cx="22" cy="12" r="1" />
            </svg>
          </div>

          <div className="flex flex-col gap-1 mb-4">
            <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">No generators yet</p>
            <p className="text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed max-w-[240px]">
              Generators turn a source token into a whole token group — color scales, spacing scales, type scales, contrast pairs, and semantic aliases.
            </p>
          </div>

          {/* What generators produce */}
          <div className="w-full mb-5 grid grid-cols-2 gap-1.5">
            {[
              { label: 'Color scales', icon: <><div className="w-1.5 h-3 rounded-sm" style={{ background: 'hsl(220,70%,80%)' }} /><div className="w-1.5 h-3 rounded-sm" style={{ background: 'hsl(220,70%,55%)' }} /><div className="w-1.5 h-3 rounded-sm" style={{ background: 'hsl(220,70%,30%)' }} /></> },
              { label: 'Spacing scales', icon: <><div className="h-1.5 rounded-sm bg-[var(--color-figma-accent)]" style={{ width: '4px', opacity: 0.5 }} /><div className="h-1.5 rounded-sm bg-[var(--color-figma-accent)]" style={{ width: '8px', opacity: 0.7 }} /><div className="h-1.5 rounded-sm bg-[var(--color-figma-accent)]" style={{ width: '14px' }} /></> },
              { label: 'Type scales', icon: <div className="flex items-baseline gap-0.5"><span className="text-[7px] font-medium text-[var(--color-figma-text-secondary)]">A</span><span className="text-[10px] font-medium text-[var(--color-figma-text)]">A</span><span className="text-[11px] font-medium text-[var(--color-figma-accent)]">A</span></div> },
              { label: 'Semantic aliases', icon: <><span className="text-[8px] font-mono text-[var(--color-figma-accent)]">500</span><svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-tertiary)]"><path d="M2 1l4 3-4 3V1z" /></svg><span className="text-[8px] font-mono text-[var(--color-figma-text-secondary)]">btn</span></> },
            ].map(({ label, icon }) => (
              <div key={label} className="flex items-center gap-1.5 px-2 py-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
                <div className="flex items-center gap-0.5 w-8 justify-center shrink-0">{icon}</div>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">{label}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => setBrowsingTemplates(true)}
            disabled={!connected}
            className="px-4 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Add your first generator
          </button>

          {!connected && (
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)] mt-2">
              Connect to the server first
            </p>
          )}
        </div>
      </div>
    );
  }

  // Template browsing — no generators yet or user clicked "+ Template"
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 pt-4 pb-3 shrink-0 flex items-start gap-2">
        {browsingTemplates && (
          <button
            onClick={() => { setBrowsingTemplates(false); setSearchQuery(''); }}
            className="mt-0.5 p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] transition-colors shrink-0"
            aria-label="Back to pipeline"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M7.5 9.5L4 6l3.5-3.5" />
            </svg>
          </button>
        )}
        <div className="flex-1">
          <div className="text-[12px] font-medium text-[var(--color-figma-text)] mb-0.5">Graph templates</div>
          <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug">
            Pre-built token pipelines. Pick a template to drop a generator graph into <span className="font-mono">{activeSet}</span>, ready to customize.
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-3 pb-2 shrink-0">
        <div className="relative">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)] pointer-events-none" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search templates…"
            aria-label="Search templates"
            className="w-full pl-6 pr-6 py-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors"
              aria-label="Clear search"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
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
        {filteredTemplates.length > 0
          ? filteredTemplates.map(template => (
              <TemplateCard
                key={template.id}
                template={template}
                onSelect={() => handleSelectTemplate(template)}
                disabled={!connected}
              />
            ))
          : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-[11px] text-[var(--color-figma-text-secondary)] mb-1">No templates match</p>
              <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                Try a different search term
              </p>
            </div>
          )
        }
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
