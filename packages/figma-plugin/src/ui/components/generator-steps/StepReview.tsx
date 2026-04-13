/**
 * Step 3 — Review: Summary of what will be created and token diffs.
 */
import { useMemo } from 'react';
import type {
  GeneratorType,
  GeneratedTokenResult,
  InputTable,
} from '../../hooks/useGenerators';
import type { OverwrittenEntry } from '../../hooks/useGeneratorPreview';
import { swatchBgColor } from '../../shared/colorUtils';
import { ValueDiff } from '../ValueDiff';
import { Spinner } from '../Spinner';
import { TYPE_LABELS } from '../generators/generatorUtils';

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
  semanticEnabled: boolean;
  semanticPrefix: string;
  semanticMappings: Array<{ semantic: string; step: string }>;
  // Preview data
  previewTokens: GeneratedTokenResult[];
  overwrittenEntries: OverwrittenEntry[];
  existingOverwritePathSet: Set<string>;
  // Overwrite check (for edits)
  overwritePendingPaths: string[];
  overwriteCheckLoading: boolean;
  overwriteCheckError: string;
  // Error
  saveError: string;
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
  semanticEnabled,
  semanticPrefix,
  semanticMappings,
  previewTokens,
  overwrittenEntries,
  existingOverwritePathSet,
  overwritePendingPaths,
  overwriteCheckLoading,
  overwriteCheckError,
  saveError,
}: StepReviewProps) {
  const overwritePaths = useMemo(
    () => new Set(overwrittenEntries.map(e => e.path)),
    [overwrittenEntries],
  );

  const newTokens = previewTokens.filter(pt => !existingOverwritePathSet.has(pt.path));
  const unchangedOverwriteTokens = previewTokens.filter(pt => existingOverwritePathSet.has(pt.path) && !overwritePaths.has(pt.path));
  const validSemanticMappings = useMemo(
    () => semanticMappings.filter((mapping) => mapping.semantic.trim() && mapping.step),
    [semanticMappings],
  );

  return (
    <div className="px-4 py-3 flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[11px] font-semibold text-[var(--color-figma-text)]">
          Review and confirm
        </h3>
        <p className="text-[9.5px] leading-snug text-[var(--color-figma-text-secondary)]">
          Confirm the destination, semantic plan, and token changes before saving.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">
            Generator
          </div>
          <div className="mt-1 text-[10px] font-medium text-[var(--color-figma-text)]">
            {name}
          </div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
            {TYPE_LABELS[selectedType]}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">
            Output
          </div>
          <div className="mt-1 text-[10px] font-mono text-[var(--color-figma-text)]">
            {targetGroup}
          </div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
            {isMultiBrand ? 'Multiple sets' : targetSet}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2.5">
          <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">
            Semantic aliases
          </div>
          <div className="mt-1 text-[10px] font-medium text-[var(--color-figma-text)]">
            {semanticEnabled && validSemanticMappings.length > 0
              ? `${validSemanticMappings.length} alias${validSemanticMappings.length === 1 ? '' : 'es'}`
              : 'Skipped'}
          </div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
            {semanticEnabled && validSemanticMappings.length > 0
              ? `${semanticPrefix}.*`
              : 'No semantic layer will be created.'}
          </div>
        </div>
      </div>

      {semanticEnabled && validSemanticMappings.length > 0 && (
        <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2.5">
          <div className="mb-1 text-[10px] font-medium text-[var(--color-figma-text)]">
            Alias preview
          </div>
          <div className="flex flex-col gap-0.5">
            {validSemanticMappings.map((mapping) => (
              <div
                key={`${mapping.semantic}-${mapping.step}`}
                className="text-[10px] font-mono text-[var(--color-figma-text-secondary)]"
              >
                <span className="text-[var(--color-figma-text)]">
                  {semanticPrefix}.{mapping.semantic}
                </span>{' '}
                →{' '}
                <span className="text-[var(--color-figma-accent)]">
                  {`{${targetGroup}.${mapping.step}}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {saveError && <div className="text-[10px] text-[var(--color-figma-error)]">{saveError}</div>}
    </div>
  );
}
