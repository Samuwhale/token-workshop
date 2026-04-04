import { useState } from 'react';
import type { GeneratorType } from '../hooks/useGenerators';
import type { GraphTemplate } from './graph-templates';
import { getTemplateStepCount } from './graph-templates';

// ---------------------------------------------------------------------------
// Pipeline stage row (visual arrows)
// ---------------------------------------------------------------------------

export function PipelineStages({ stages }: { stages: string[] }) {
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
    case 'dark-mode-palette':
      return (
        <div className="flex items-center h-5 gap-0.5">
          <div className="flex gap-0.5 h-full">
            {[97, 70, 40].map((l, i) => (
              <div key={i} className="w-2 h-full rounded-sm" style={{ background: `hsl(220, 50%, ${l}%)` }} />
            ))}
          </div>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-tertiary)] shrink-0 mx-0.5">
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
          <div className="flex gap-0.5 h-full">
            {[8, 20, 50].map((l, i) => (
              <div key={i} className="w-2 h-full rounded-sm" style={{ background: `hsl(220, 50%, ${l}%)` }} />
            ))}
          </div>
        </div>
      );
    case 'accessible-color-pair':
      return (
        <div className="flex items-center gap-1 h-5">
          <div className="w-5 h-full rounded-sm flex items-center justify-center" style={{ background: 'hsl(240, 55%, 40%)' }}>
            <span className="text-[7px] font-bold text-white leading-none">Aa</span>
          </div>
          <div className="flex flex-col gap-0.5 justify-center h-full">
            <div className="text-[7px] font-medium text-[var(--color-figma-text-secondary)] leading-none">4.5:1</div>
            <div className="text-[6.5px] text-[var(--color-figma-text-tertiary)] leading-none">AA</div>
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
// Requires-source label
// ---------------------------------------------------------------------------

function getRequiresSourceLabel(generatorType: GeneratorType): string {
  switch (generatorType) {
    case 'colorRamp': return 'Requires a color token';
    case 'spacingScale': return 'Requires a spacing token';
    case 'typeScale': return 'Requires a font size token';
    case 'darkModeInversion': return 'Requires a light-mode color token';
    case 'accessibleColorPair': return 'Requires a color token';
    default: return 'Requires a source token';
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
  const stepCount = getTemplateStepCount(template);
  const semanticCount = template.semanticLayers.reduce((n, l) => n + l.mappings.length, 0);
  const [semanticExpanded, setSemanticExpanded] = useState(false);

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
          {semanticCount > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setSemanticExpanded(v => !v); }}
                className="flex items-center gap-1 text-[9.5px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] transition-colors"
                aria-expanded={semanticExpanded}
              >
                <svg
                  width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                  className={`shrink-0 transition-transform ${semanticExpanded ? 'rotate-90' : ''}`}
                  aria-hidden="true"
                >
                  <path d="M2 1l4 3-4 3V1z" />
                </svg>
                {semanticExpanded ? 'Hide' : 'Preview'} {semanticCount} semantic alias{semanticCount !== 1 ? 'es' : ''}
              </button>
              {semanticExpanded && (
                <div
                  className="mt-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] overflow-hidden"
                  onClick={e => e.stopPropagation()}
                >
                  {template.semanticLayers.map((layer, li) => (
                    <div key={li}>
                      {template.semanticLayers.length > 1 && (
                        <div className="px-2 py-0.5 bg-[var(--color-figma-bg-tertiary,var(--color-figma-border))] text-[9px] font-medium text-[var(--color-figma-text-secondary)] opacity-70">
                          {layer.prefix}.*
                        </div>
                      )}
                      <div className="divide-y divide-[var(--color-figma-border)]">
                        {layer.mappings.map((mapping, mi) => (
                          <div key={mi} className="flex items-center gap-1 px-2 py-1">
                            <span className="font-mono text-[9px] text-[var(--color-figma-text)] min-w-0 truncate">
                              {layer.prefix}.{mapping.semantic}
                            </span>
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="shrink-0 text-[var(--color-figma-text-tertiary)] opacity-60" aria-hidden="true">
                              <path d="M2 1l4 3-4 3V1z" />
                            </svg>
                            <span className="font-mono text-[9px] text-[var(--color-figma-accent)] shrink-0">
                              {'{' + template.defaultPrefix + '.' + mapping.step + '}'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="px-2 py-1 border-t border-[var(--color-figma-border)] text-[9px] text-[var(--color-figma-text-tertiary)] italic">
                    Token name uses the prefix you set in the next step.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// TemplatePicker — browsing view
// ---------------------------------------------------------------------------

export interface TemplatePickerProps {
  templates: GraphTemplate[];
  connected: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectTemplate: (template: GraphTemplate) => void;
  browsingTemplates: boolean;
  onBack: () => void;
  activeSet: string;
  justApplied: string | null;
}

export function TemplatePicker({
  templates,
  connected,
  searchQuery,
  onSearchChange,
  onSelectTemplate,
  browsingTemplates,
  onBack,
  activeSet,
  justApplied,
}: TemplatePickerProps) {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 pt-4 pb-3 shrink-0 flex items-start gap-2">
        {browsingTemplates && (
          <button
            onClick={onBack}
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
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Search templates…"
            aria-label="Search templates"
            className="w-full pl-6 pr-6 py-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
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
        {templates.length > 0
          ? templates.map(template => (
              <TemplateCard
                key={template.id}
                template={template}
                onSelect={() => onSelectTemplate(template)}
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
