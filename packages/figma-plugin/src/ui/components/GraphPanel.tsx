import { useState, useEffect, useRef, useCallback } from 'react';
import type { TokenGenerator, ColorRampConfig, SpacingScaleConfig, TypeScaleConfig, GeneratorType, GeneratorConfig, GeneratedTokenResult } from '../hooks/useGenerators';

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
    case 'contrastCheck': return 'Contrast check';
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
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPreviewLoading(true);
      setPreviewError('');
      try {
        const body = {
          type: template.generatorType,
          sourceToken: template.requiresSource ? sourceToken.trim() : undefined,
          targetGroup: prefix.trim(),
          targetSet: activeSet,
          config: template.config,
        };
        const res = await fetch(`${serverUrl}/api/generators/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string };
          setPreviewError(data.error || `Preview failed (${res.status})`);
          setPreviewTokens([]);
        } else {
          const data = await res.json() as { count: number; tokens: GeneratedTokenResult[] };
          setPreviewTokens(data.tokens ?? []);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setPreviewError(err instanceof Error ? err.message : 'Preview failed');
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
    } finally {
      applyingRef.current = false;
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
          <label className="block text-[10px] font-medium text-[var(--color-figma-text)] mb-1">
            Token prefix
            <span className="ml-1 text-[var(--color-figma-error)]">*</span>
          </label>
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

        {/* Live preview */}
        {(previewTokens.length > 0 || previewLoading || previewError) && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                Preview
                {previewTokens.length > 0 && <span className="ml-1 normal-case text-[var(--color-figma-text)]">({previewTokens.length} tokens)</span>}
              </span>
              {previewLoading && (
                <svg className="w-3 h-3 animate-spin text-[var(--color-figma-text-secondary)]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
            </div>
            {previewError && (
              <div className="text-[10px] text-[var(--color-figma-error)] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-2 py-1.5">{previewError}</div>
            )}
            {!previewError && previewTokens.length > 0 && (
              <div className="border border-[var(--color-figma-border)] rounded p-2 bg-[var(--color-figma-bg-secondary)]">
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
                      const val = typeof t.value === 'object' && t.value !== null && 'value' in (t.value as any)
                        ? `${(t.value as any).value}${(t.value as any).unit || ''}`
                        : String(t.value);
                      return (
                        <div key={t.stepName} className="flex items-baseline gap-2">
                          <span className="text-[9px] text-[var(--color-figma-text-secondary)] w-8 text-right font-mono shrink-0">{t.stepName}</span>
                          <span className="text-[var(--color-figma-text)] font-medium truncate" style={{ fontSize: val }}>{val}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {template.generatorType === 'spacingScale' && (
                  <div className="flex flex-col gap-1">
                    {previewTokens.map(t => {
                      const val = typeof t.value === 'object' && t.value !== null && 'value' in (t.value as any)
                        ? (t.value as any).value
                        : (typeof t.value === 'number' ? t.value : parseFloat(String(t.value)));
                      const label = typeof t.value === 'object' && t.value !== null && 'value' in (t.value as any)
                        ? `${(t.value as any).value}${(t.value as any).unit || ''}`
                        : String(t.value);
                      const maxVal = Math.max(...previewTokens.map(tk => {
                        const v = typeof tk.value === 'object' && tk.value !== null && 'value' in (tk.value as any)
                          ? (tk.value as any).value : (typeof tk.value === 'number' ? tk.value : parseFloat(String(tk.value)));
                        return typeof v === 'number' && !isNaN(v) ? v : 0;
                      }));
                      const pct = maxVal > 0 && typeof val === 'number' && !isNaN(val) ? (val / maxVal) * 100 : 0;
                      return (
                        <div key={t.stepName} className="flex items-center gap-2">
                          <span className="text-[9px] text-[var(--color-figma-text-secondary)] w-8 text-right font-mono shrink-0">{t.stepName}</span>
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
                      <div key={t.stepName} className="flex items-center justify-between text-[9px]">
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

        {!applying && (template.requiresSource && !sourceToken.trim() || !prefix.trim()) && (
          <p className="text-[9px] text-[var(--color-figma-text-tertiary)]">
            {template.requiresSource && !sourceToken.trim() && !prefix.trim()
              ? 'Source token and token prefix are required.'
              : template.requiresSource && !sourceToken.trim()
                ? 'Source token is required.'
                : 'Token prefix is required.'}
          </p>
        )}

        <button
          onClick={handleApply}
          disabled={applying || (template.requiresSource && !sourceToken.trim()) || !prefix.trim()}
          className="w-full py-2 px-3 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors mt-auto"
        >
          {applying ? 'Applying…' : previewTokens.length > 0 ? `Apply template (${previewTokens.length} tokens)` : 'Apply template'}
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
  pendingGroupPath?: string | null;
  pendingGroupTokenType?: string | null;
  onClearPendingGroup?: () => void;
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
}: GraphPanelProps) {
  const setGenerators = generators.filter(g => g.targetSet === activeSet);

  const initialTemplate = pendingGroupPath
    ? (GRAPH_TEMPLATES.find(t => t.id === templateIdForTokenType(pendingGroupTokenType)) ?? GRAPH_TEMPLATES[0] ?? null)
    : pendingTemplateId
      ? (GRAPH_TEMPLATES.find(t => t.id === pendingTemplateId) ?? null)
      : null;

  const [selectedTemplate, setSelectedTemplate] = useState<GraphTemplate | null>(initialTemplate);
  const [browsingTemplates, setBrowsingTemplates] = useState(false);
  const [justApplied, setJustApplied] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const graphScrollRef = useRef<HTMLDivElement>(null);

  const clampZoom = (z: number) => Math.max(0.5, Math.min(2, Math.round(z * 10) / 10));

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom(prev => clampZoom(prev - e.deltaY * 0.001));
  }, []);

  useEffect(() => {
    const el = graphScrollRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

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
    if (onApplyTemplate) onApplyTemplate('');
    if (onClearPendingGroup) onClearPendingGroup();
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
        initialPrefix={pendingGroupPath ?? undefined}
      />
    );
  }

  // Pipeline view — generators exist (and not browsing templates)
  if (setGenerators.length > 0 && !browsingTemplates) {
    return (
      <div className="flex flex-col h-full overflow-hidden" ref={graphScrollRef}>
        <div className="px-3 py-2.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shrink-0 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-[var(--color-figma-text)]">Graph</div>
            <div className="text-[9px] text-[var(--color-figma-text-secondary)]">
              {setGenerators.length} generator{setGenerators.length !== 1 ? 's' : ''} in <span className="font-mono">{activeSet}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Zoom controls */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setZoom(prev => clampZoom(prev - 0.1))}
                disabled={zoom <= 0.5}
                className="w-5 h-5 flex items-center justify-center rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Zoom out"
                aria-label="Zoom out"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><rect x="1" y="3.5" width="6" height="1" rx="0.5"/></svg>
              </button>
              <button
                onClick={() => setZoom(1)}
                className="text-[9px] tabular-nums text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] px-1 py-0.5 rounded transition-colors min-w-[30px] text-center"
                title="Fit to view (reset zoom)"
                aria-label="Reset zoom to 100%"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={() => setZoom(prev => clampZoom(prev + 0.1))}
                disabled={zoom >= 2}
                className="w-5 h-5 flex items-center justify-center rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Zoom in"
                aria-label="Zoom in"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><rect x="1" y="3.5" width="6" height="1" rx="0.5"/><rect x="3.5" y="1" width="1" height="6" rx="0.5"/></svg>
              </button>
            </div>
            <div className="w-px h-3 bg-[var(--color-figma-border)]" />
            <button
              onClick={() => setBrowsingTemplates(true)}
              disabled={!connected}
              className="text-[9px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Add another template"
            >
              + Template
            </button>
          </div>
        </div>

        {justApplied && (
          <div className="mx-3 mt-3 px-2.5 py-2 rounded bg-[var(--color-figma-success,#22c55e)]/10 border border-[var(--color-figma-success,#22c55e)]/20 text-[10px] text-[var(--color-figma-success,#16a34a)] flex items-center gap-1.5 shrink-0">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span><strong>{justApplied}</strong> applied — tokens are generating</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          <div className="p-3 flex flex-col gap-2 origin-top" style={{ zoom }}>
            {setGenerators.map(gen => (
              <GeneratorPipelineCard key={gen.id} generator={gen} />
            ))}
          </div>
        </div>
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

          <div className="text-[12px] font-semibold text-[var(--color-figma-text)] mb-2">No generators yet</div>
          <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed mb-4 max-w-[200px]">
            Generators turn a source token into a whole token group — color scales, spacing scales, type scales, contrast pairs, and semantic aliases.
          </p>

          {/* What generators produce */}
          <div className="w-full mb-5 grid grid-cols-2 gap-1.5">
            {[
              { label: 'Color scales', icon: <><div className="w-1.5 h-3 rounded-sm" style={{ background: 'hsl(220,70%,80%)' }} /><div className="w-1.5 h-3 rounded-sm" style={{ background: 'hsl(220,70%,55%)' }} /><div className="w-1.5 h-3 rounded-sm" style={{ background: 'hsl(220,70%,30%)' }} /></> },
              { label: 'Spacing scales', icon: <><div className="h-1.5 rounded-sm bg-[var(--color-figma-accent)]" style={{ width: '4px', opacity: 0.5 }} /><div className="h-1.5 rounded-sm bg-[var(--color-figma-accent)]" style={{ width: '8px', opacity: 0.7 }} /><div className="h-1.5 rounded-sm bg-[var(--color-figma-accent)]" style={{ width: '14px' }} /></> },
              { label: 'Type scales', icon: <div className="flex items-baseline gap-0.5"><span className="text-[7px] font-medium text-[var(--color-figma-text-secondary)]">A</span><span className="text-[9px] font-medium text-[var(--color-figma-text)]">A</span><span className="text-[11px] font-medium text-[var(--color-figma-accent)]">A</span></div> },
              { label: 'Semantic aliases', icon: <><span className="text-[8px] font-mono text-[var(--color-figma-accent)]">500</span><svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-tertiary)]"><path d="M2 1l4 3-4 3V1z" /></svg><span className="text-[8px] font-mono text-[var(--color-figma-text-secondary)]">btn</span></> },
            ].map(({ label, icon }) => (
              <div key={label} className="flex items-center gap-1.5 px-2 py-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
                <div className="flex items-center gap-0.5 w-8 justify-center shrink-0">{icon}</div>
                <span className="text-[9px] text-[var(--color-figma-text-secondary)]">{label}</span>
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
            <p className="text-[9px] text-[var(--color-figma-text-tertiary)] mt-2">
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
          <div className="text-[12px] font-medium text-[var(--color-figma-text)] mb-0.5">Graph templates</div>
          <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug">
            Pre-built token pipelines. Pick a template to drop a generator graph into <span className="font-mono">{activeSet}</span>, ready to customize.
          </p>
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
