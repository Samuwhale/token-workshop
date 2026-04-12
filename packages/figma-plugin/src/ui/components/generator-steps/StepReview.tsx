/**
 * Step 3 — Review: Summary of what will be created, token diffs,
 * and first-class semantic alias configuration.
 */
import { useMemo } from 'react';
import type {
  GeneratorType,
  GeneratedTokenResult,
  InputTable,
} from '../../hooks/useGenerators';
import type { OverwrittenEntry } from '../../hooks/useGeneratorPreview';
import { SEMANTIC_PATTERNS } from '../../shared/semanticPatterns';
import { swatchBgColor } from '../../shared/colorUtils';
import { ValueDiff } from '../ValueDiff';
import { Spinner } from '../Spinner';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface StepReviewProps {
  // Generator info
  selectedType: GeneratorType;
  name: string;
  targetGroup: string;
  targetSet: string;
  isEditing: boolean;
  isMultiBrand: boolean;
  inputTable: InputTable | undefined;
  targetSetTemplate: string;
  // Preview data
  previewTokens: GeneratedTokenResult[];
  overwrittenEntries: OverwrittenEntry[];
  existingOverwritePathSet: Set<string>;
  // Overwrite check (for edits)
  overwritePendingPaths: string[];
  overwriteCheckLoading: boolean;
  overwriteCheckError: string;
  // Semantic aliases
  semanticEnabled: boolean;
  semanticPrefix: string;
  semanticMappings: Array<{ semantic: string; step: string }>;
  selectedSemanticPatternId: string | null;
  // Error
  saveError: string;
  // Intercept mode
  hasInterceptHandler: boolean;
  // Handlers
  onSemanticEnabledChange: (v: boolean) => void;
  onSemanticPrefixChange: (v: string) => void;
  onSemanticMappingsChange: (v: Array<{ semantic: string; step: string }>) => void;
  onSemanticPatternSelect: (id: string | null) => void;
}

// ---------------------------------------------------------------------------
// StepReview
// ---------------------------------------------------------------------------

export function StepReview({
  selectedType,
  name,
  targetGroup,
  targetSet,
  isEditing,
  isMultiBrand,
  inputTable,
  targetSetTemplate,
  previewTokens,
  overwrittenEntries,
  existingOverwritePathSet,
  overwritePendingPaths,
  overwriteCheckLoading,
  overwriteCheckError,
  semanticEnabled,
  semanticPrefix,
  semanticMappings,
  selectedSemanticPatternId,
  saveError,
  hasInterceptHandler,
  onSemanticEnabledChange,
  onSemanticPrefixChange,
  onSemanticMappingsChange,
  onSemanticPatternSelect,
}: StepReviewProps) {
  const overwritePaths = useMemo(
    () => new Set(overwrittenEntries.map(e => e.path)),
    [overwrittenEntries],
  );

  const newTokens = previewTokens.filter(pt => !existingOverwritePathSet.has(pt.path));
  const unchangedOverwriteTokens = previewTokens.filter(pt => existingOverwritePathSet.has(pt.path) && !overwritePaths.has(pt.path));
  // Semantic patterns
  const suggestedPatterns = SEMANTIC_PATTERNS.filter(p => p.applicableTo.includes(selectedType));
  const showSemanticSection = !isEditing && (previewTokens.length > 0 || isMultiBrand) && !hasInterceptHandler;
  const availableSteps = previewTokens.map(t => String(t.stepName));

  const handleSemanticPatternSelect = (patternId: string) => {
    const pattern = SEMANTIC_PATTERNS.find(p => p.id === patternId);
    if (!pattern) return;
    onSemanticPatternSelect(patternId);
    onSemanticMappingsChange(pattern.mappings.map(m => ({
      semantic: m.semantic,
      step: availableSteps.includes(m.step) ? m.step : (availableSteps[Math.floor(availableSteps.length / 2)] ?? ''),
    })));
  };

  return (
    <div className="px-4 py-3 flex flex-col gap-3">

      {/* Overwrite warning — new generator overwriting existing tokens */}
      {!isEditing && !isMultiBrand && existingOverwritePathSet.size > 0 && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/10 text-[var(--color-figma-warning)]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <span className="text-[10px] leading-snug">
            <strong>{existingOverwritePathSet.size} existing token{existingOverwritePathSet.size !== 1 ? 's' : ''}</strong> in <span className="font-mono">{targetGroup}.*</span> will be overwritten
            {unchangedOverwriteTokens.length > 0 && overwrittenEntries.length === 0 && ' (no value changes)'}
            {unchangedOverwriteTokens.length > 0 && overwrittenEntries.length > 0 && ` (${overwrittenEntries.length} with value changes, ${unchangedOverwriteTokens.length} unchanged)`}
          </span>
        </div>
      )}

      {/* Manually-edited overwrite warning — for edits */}
      {isEditing && overwriteCheckLoading && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]">
          <Spinner size="sm" />
          <span className="text-[10px]">Checking for manually edited tokens...</span>
        </div>
      )}
      {isEditing && !overwriteCheckLoading && overwriteCheckError && (
        <div className="text-[10px] text-[var(--color-figma-text-secondary)] px-3 py-2.5 rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          {overwriteCheckError}
        </div>
      )}
      {isEditing && !overwriteCheckLoading && overwritePendingPaths.length > 0 && (
        <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/10">
          <span className="text-[10px] font-medium text-[var(--color-figma-warning)]">
            {overwritePendingPaths.length} manually edited token{overwritePendingPaths.length !== 1 ? 's' : ''} will be overwritten
          </span>
          <div className="max-h-[100px] overflow-y-auto flex flex-col gap-0.5">
            {overwritePendingPaths.map((p: string) => (
              <div key={p} className="text-[10px] font-mono text-[var(--color-figma-warning)]/80 truncate" title={p}>{p}</div>
            ))}
          </div>
        </div>
      )}

      {/* Modified tokens (diffs) */}
      {overwrittenEntries.length > 0 && (
        <div>
          <label className="block text-[10px] font-medium text-[var(--color-figma-warning)] mb-1.5">
            Modified tokens
          </label>
          <div className="flex flex-col gap-1.5">
            {overwrittenEntries.map(entry => (
              <div key={entry.path} className="flex flex-col gap-0.5">
                <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate" title={entry.path}>
                  {entry.path}
                </span>
                <ValueDiff type={entry.type} before={entry.oldValue} after={entry.newValue} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New tokens */}
      {newTokens.length > 0 && (
        <div>
          <label className="block text-[10px] font-medium text-[var(--color-figma-success)] mb-1.5">
            New tokens
          </label>
          <div className="flex flex-col gap-1">
            {newTokens.map(token => (
              <div key={token.path} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
                {token.type === 'color' && typeof token.value === 'string' && (
                  <div
                    className="w-3.5 h-3.5 rounded-sm border border-white/30 ring-1 ring-[var(--color-figma-border)] shrink-0"
                    style={{ backgroundColor: swatchBgColor(String(token.value)) }}
                    aria-hidden="true"
                  />
                )}
                <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate flex-1" title={token.path}>
                  {token.path}
                </span>
                <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] shrink-0 max-w-[100px] truncate" title={typeof token.value === 'object' ? JSON.stringify(token.value) : String(token.value)}>
                  {token.type === 'dimension' && typeof token.value === 'object' && token.value !== null && 'value' in (token.value as Record<string, unknown>)
                    ? `${(token.value as { value: number; unit?: string }).value}${(token.value as { value: number; unit?: string }).unit ?? 'px'}`
                    : typeof token.value === 'object' ? JSON.stringify(token.value) : String(token.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Multi-brand note */}
      {isMultiBrand && inputTable && (
        <div className="text-[10px] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)] rounded-lg px-3 py-2.5 bg-[var(--color-figma-bg-secondary)]">
          <p className="mb-1">Tokens will be generated for each brand:</p>
          <ul className="list-disc list-inside">
            {inputTable.rows.filter(r => r.brand.trim()).map((row, i) => (
              <li key={i} className="font-mono">
                {(targetSetTemplate || 'brands/{brand}').replace('{brand}', row.brand)} → {targetGroup}.*
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- Semantic aliases — first-class section ---- */}
      {showSemanticSection && (
        <div className="border border-[var(--color-figma-border)] rounded-lg p-4 bg-[var(--color-figma-bg-secondary)]">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">Semantic aliases</span>
              <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
                Create alias tokens that map semantic names to your generated scale
              </span>
            </div>
            <button
              onClick={() => onSemanticEnabledChange(!semanticEnabled)}
              className={`text-[10px] px-2.5 py-1 rounded border transition-colors ${
                semanticEnabled
                  ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                  : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
              }`}
            >
              {semanticEnabled ? 'Enabled' : 'Enable'}
            </button>
          </div>

          {semanticEnabled && (
            <div className="mt-3 flex flex-col gap-3">
              {/* Pattern picker */}
              {suggestedPatterns.length > 0 && (
                <div>
                  <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1.5">Quick patterns</label>
                  <div className="flex flex-wrap gap-1">
                    {suggestedPatterns.map(p => (
                      <button
                        key={p.id}
                        onClick={() => handleSemanticPatternSelect(p.id)}
                        className={`px-2.5 py-1 rounded text-[10px] border transition-colors ${
                          selectedSemanticPatternId === p.id
                            ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                            : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Prefix */}
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">Prefix</label>
                <input
                  type="text"
                  value={semanticPrefix}
                  onChange={e => onSemanticPrefixChange(e.target.value)}
                  placeholder="semantic"
                  className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono focus-visible:border-[var(--color-figma-accent)]"
                />
              </div>

              {/* Mapping rows */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Mappings</label>
                  <button
                    onClick={() => onSemanticMappingsChange([...semanticMappings, { semantic: '', step: availableSteps[0] ?? '' }])}
                    className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
                  >
                    + Add
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  {semanticMappings.map((mapping, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={mapping.semantic}
                        onChange={e => onSemanticMappingsChange(semanticMappings.map((m, idx) => idx === i ? { ...m, semantic: e.target.value } : m))}
                        placeholder="action.default"
                        className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono focus-visible:border-[var(--color-figma-accent)] min-w-0"
                      />
                      <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-[var(--color-figma-text-secondary)]"><path d="M2 6h8M7 3l3 3-3 3" /></svg>
                      <select
                        value={mapping.step}
                        onChange={e => onSemanticMappingsChange(semanticMappings.map((m, idx) => idx === i ? { ...m, step: e.target.value } : m))}
                        className="w-16 px-1 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)]"
                      >
                        {availableSteps.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button
                        onClick={() => onSemanticMappingsChange(semanticMappings.filter((_, idx) => idx !== i))}
                        aria-label="Remove mapping"
                        className="shrink-0 p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)]"
                      >
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3l6 6M9 3l-6 6" /></svg>
                      </button>
                    </div>
                  ))}
                  {semanticMappings.length === 0 && (
                    <div className="text-[10px] text-[var(--color-figma-text-secondary)] py-1.5 text-center">No mappings — click "+ Add" to start</div>
                  )}
                </div>
              </div>

              {/* Preview of what will be created */}
              {semanticMappings.filter(m => m.semantic.trim()).length > 0 && (
                <div className="border border-[var(--color-figma-border)] rounded p-2.5 bg-[var(--color-figma-bg)] flex flex-col gap-0.5">
                  {semanticMappings.filter(m => m.semantic.trim()).map((m, i) => (
                    <div key={i} className="text-[10px] font-mono text-[var(--color-figma-text-secondary)]">
                      <span className="text-[var(--color-figma-text)]">{semanticPrefix}.{m.semantic}</span>
                      {' → '}
                      <span className="text-[var(--color-figma-accent)]">{'{' + targetGroup + '.' + m.step + '}'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {saveError && <div className="text-[10px] text-[var(--color-figma-error)]">{saveError}</div>}
    </div>
  );
}
