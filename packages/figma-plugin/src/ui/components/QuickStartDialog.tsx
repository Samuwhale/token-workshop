import { useState } from 'react';
import type { GeneratorTemplate } from '../hooks/useGenerators';
import { TokenGeneratorDialog } from './TokenGeneratorDialog';

// ---------------------------------------------------------------------------
// Quick-start templates (mirrors GENERATOR_TEMPLATES from core)
// ---------------------------------------------------------------------------

export const QUICK_START_TEMPLATES: GeneratorTemplate[] = [
  {
    id: 'color-ramp',
    label: 'Color ramp',
    description: '11-step perceptual ramp derived from a source color token',
    defaultPrefix: 'colors',
    generatorType: 'colorRamp',
    requiresSource: false,
    config: {
      steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950],
      lightEnd: 97,
      darkEnd: 8,
      chromaBoost: 1.0,
      includeSource: false,
    },
  },
  {
    id: 'spacing',
    label: 'Spacing scale',
    description: 'Multiplier-based spacing scale from a base unit (e.g. 4px or 8px)',
    defaultPrefix: 'spacing',
    generatorType: 'spacingScale',
    requiresSource: false,
    config: {
      steps: [
        { name: '0.5', multiplier: 0.5 }, { name: '1', multiplier: 1 },
        { name: '1.5', multiplier: 1.5 }, { name: '2', multiplier: 2 },
        { name: '3', multiplier: 3 }, { name: '4', multiplier: 4 },
        { name: '5', multiplier: 5 }, { name: '6', multiplier: 6 },
        { name: '8', multiplier: 8 }, { name: '10', multiplier: 10 },
        { name: '12', multiplier: 12 }, { name: '16', multiplier: 16 },
      ],
      unit: 'px',
    },
  },
  {
    id: 'border-radius',
    label: 'Border radius',
    description: 'Corner radius scale from none to full (e.g. base 8px)',
    defaultPrefix: 'borderRadius',
    generatorType: 'borderRadiusScale',
    requiresSource: false,
    config: {
      steps: [
        { name: 'none', multiplier: 0, exactValue: 0 },
        { name: 'sm', multiplier: 0.5 },
        { name: 'md', multiplier: 1 },
        { name: 'lg', multiplier: 2 },
        { name: 'xl', multiplier: 3 },
        { name: '2xl', multiplier: 4 },
        { name: 'full', multiplier: 0, exactValue: 9999 },
      ],
      unit: 'px',
    },
  },
  {
    id: 'typography',
    label: 'Typography scale',
    description: 'Font size ramp using a ratio (e.g. base 1rem or 16px)',
    defaultPrefix: 'fontSize',
    generatorType: 'typeScale',
    requiresSource: false,
    config: {
      steps: [
        { name: 'xs', exponent: -2 }, { name: 'sm', exponent: -1 },
        { name: 'base', exponent: 0 }, { name: 'lg', exponent: 1 },
        { name: 'xl', exponent: 2 }, { name: '2xl', exponent: 3 },
        { name: '3xl', exponent: 4 },
      ],
      ratio: 1.25,
      unit: 'rem',
      baseStep: 'base',
      roundTo: 3,
    },
  },
  {
    id: 'z-index',
    label: 'Z-index layers',
    description: 'Semantic z-index layers — no source token required',
    defaultPrefix: 'zIndex',
    generatorType: 'zIndexScale',
    requiresSource: false,
    config: {
      steps: [
        { name: 'below', value: -1 }, { name: 'base', value: 0 },
        { name: 'raised', value: 10 }, { name: 'dropdown', value: 100 },
        { name: 'sticky', value: 200 }, { name: 'overlay', value: 300 },
        { name: 'modal', value: 400 }, { name: 'toast', value: 500 },
      ],
    },
  },
  {
    id: 'opacity',
    label: 'Opacity scale',
    description: 'Full 0–100% opacity ramp — no source token required',
    defaultPrefix: 'opacity',
    generatorType: 'opacityScale',
    requiresSource: false,
    config: {
      steps: [
        { name: '0', value: 0 }, { name: '10', value: 10 },
        { name: '20', value: 20 }, { name: '30', value: 30 },
        { name: '40', value: 40 }, { name: '50', value: 50 },
        { name: '60', value: 60 }, { name: '70', value: 70 },
        { name: '80', value: 80 }, { name: '90', value: 90 },
        { name: '95', value: 95 }, { name: '100', value: 100 },
      ],
    },
  },
  {
    id: 'custom',
    label: 'Custom scale',
    description: 'Formula-based scale — fully customizable with your own formula',
    defaultPrefix: 'scale',
    generatorType: 'customScale',
    requiresSource: false,
    config: {
      outputType: 'number',
      steps: [
        { name: 'sm', index: -2, multiplier: 0.5 },
        { name: 'md', index: 0, multiplier: 1 },
        { name: 'lg', index: 2, multiplier: 2 },
      ],
      formula: 'base * multiplier',
      roundTo: 2,
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers: token count + step preview for each template
// ---------------------------------------------------------------------------

export function getTemplateStepNames(t: GeneratorTemplate): string[] {
  const cfg = t.config as unknown as Record<string, unknown>;
  const steps = cfg.steps as Array<Record<string, unknown>> | undefined;
  if (!steps) return [];
  return steps.map(s => String(s.name ?? s.value ?? ''));
}

export function getTokenCount(t: GeneratorTemplate): number {
  const names = getTemplateStepNames(t);
  return names.length || 0;
}

/** Abbreviate step names: show first 3, ellipsis, last 1 if > 5 */
export function formatStepPreview(names: string[]): string {
  if (names.length <= 5) return names.join(' · ');
  return `${names.slice(0, 3).join(' · ')} … ${names[names.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Template icons
// ---------------------------------------------------------------------------

export function TemplateIcon({ id }: { id: string }) {
  switch (id) {
    case 'color-ramp':
      return (
        <div className="flex gap-0.5 h-4 items-center">
          {[97, 80, 60, 40, 20, 8].map((l, i) => (
            <div key={i} className="w-2.5 h-full rounded-sm" style={{ background: `hsl(220, 60%, ${l}%)` }} />
          ))}
        </div>
      );
    case 'spacing':
      return (
        <div className="flex items-end gap-0.5 h-4">
          {[20, 35, 55, 70, 85, 100].map((h, i) => (
            <div key={i} className="w-1.5 rounded-sm bg-[var(--color-figma-accent)]" style={{ height: `${h}%`, opacity: 0.6 + i * 0.07 }} />
          ))}
        </div>
      );
    case 'border-radius':
      return (
        <div className="flex items-center gap-1 h-4">
          {[0, 2, 4, 8, 999].map((r, i) => (
            <div key={i} className="w-3 h-3 border border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/20" style={{ borderRadius: Math.min(r, 6) }} />
          ))}
        </div>
      );
    case 'typography':
      return (
        <div className="flex items-baseline gap-1 h-4 overflow-hidden">
          {[8, 10, 12, 14, 16].map((size, i) => (
            <span key={i} className="text-[var(--color-figma-text)] font-medium leading-none" style={{ fontSize: `${size}px` }}>A</span>
          ))}
        </div>
      );
    case 'z-index':
      return (
        <div className="relative h-4 w-12">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="absolute w-6 h-3 rounded-sm border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)]" style={{ bottom: i * 3, left: i * 3, zIndex: i }} />
          ))}
        </div>
      );
    case 'opacity':
      return (
        <div className="flex items-center gap-0.5 h-4">
          {[0.1, 0.25, 0.5, 0.75, 1].map((o, i) => (
            <div key={i} className="w-3 h-3 rounded-sm bg-[var(--color-figma-accent)]" style={{ opacity: o }} />
          ))}
        </div>
      );
    default:
      return (
        <div className="flex items-center gap-1 h-4 text-[var(--color-figma-accent)]">
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 6h2M6 2v2M10 6H8M6 10V8" />
            <circle cx="6" cy="6" r="1.5" />
          </svg>
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface QuickStartDialogProps {
  serverUrl: string;
  activeSet: string;
  allSets: string[];
  onClose: () => void;
  onConfirm: (firstPath?: string) => void;
  /** When provided, fires with semantic mapping data instead of showing SemanticMappingDialog */
  onInterceptSemanticMapping?: (data: { tokens: import('../hooks/useGenerators').GeneratedTokenResult[]; targetGroup: string; targetSet: string; generatorType: import('../hooks/useGenerators').GeneratorType }) => void;
}

export function QuickStartDialog({
  serverUrl,
  activeSet,
  allSets,
  onClose,
  onConfirm,
  onInterceptSemanticMapping,
}: QuickStartDialogProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<GeneratorTemplate | null>(null);

  if (selectedTemplate) {
    const stepNames = getTemplateStepNames(selectedTemplate);
    return (
      <TokenGeneratorDialog
        serverUrl={serverUrl}
        activeSet={activeSet}
        allSets={allSets}
        template={selectedTemplate}
        onBack={() => setSelectedTemplate(null)}
        onClose={onClose}
        onInterceptSemanticMapping={onInterceptSemanticMapping}
        onSaved={(info) => {
          const firstStep = stepNames[0];
          const firstPath = info?.targetGroup && firstStep
            ? `${info.targetGroup}.${firstStep}`
            : undefined;
          onConfirm(firstPath);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-80 flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="p-4 border-b border-[var(--color-figma-border)] flex items-center justify-between">
          <div>
            <div className="text-[12px] font-medium text-[var(--color-figma-text)]">Quick start</div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">
              Pick a template — creates a live generator in <span className="font-mono text-[var(--color-figma-text)]">{activeSet}</span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {QUICK_START_TEMPLATES.map(template => {
            const count = getTokenCount(template);
            const stepNames = getTemplateStepNames(template);
            return (
              <button
                key={template.id}
                onClick={() => setSelectedTemplate(template)}
                className="w-full text-left px-4 py-3 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="shrink-0 w-14">
                    <TemplateIcon id={template.id} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-[var(--color-figma-text)]">{template.label}</span>
                      {count > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] font-medium tabular-nums">
                          {count} tokens
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">{template.description}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] font-mono px-1 py-px rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]">
                        {template.defaultPrefix}.*
                      </span>
                      {stepNames.length > 0 && (
                        <span className="text-[10px] text-[var(--color-figma-text-tertiary)] truncate">
                          {formatStepPreview(stepNames)}
                        </span>
                      )}
                    </div>
                  </div>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-[var(--color-figma-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity">
                    <path d="M4.5 2.5L8 6l-3.5 3.5" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
