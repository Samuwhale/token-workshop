/**
 * Step 3 — Review: Summary of what will be created and token diffs.
 */
import { useMemo } from 'react';
import type {
  GeneratorType,
  GeneratedTokenResult,
  InputTable,
} from '../../hooks/useGenerators';
import type { GeneratorPreviewAnalysis } from '../../hooks/useGeneratorPreview';
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
  previewAnalysis: GeneratorPreviewAnalysis | null;
  existingOverwritePathSet: Set<string>;
  // Overwrite check (for edits)
  overwritePendingPaths: string[];
  overwriteCheckLoading: boolean;
  overwriteCheckError: string;
  // Error
  saveError: string;
  previewReviewStale: boolean;
}

// ---------------------------------------------------------------------------
// StepReview
// ---------------------------------------------------------------------------

export function StepReview({
  selectedType,
  name,
  targetGroup,
  targetSet,
  isEditing: _isEditing,
  isMultiBrand,
  inputTable,
  targetSetTemplate,
  semanticEnabled,
  semanticPrefix,
  semanticMappings,
  previewTokens,
  previewAnalysis,
  existingOverwritePathSet,
  overwritePendingPaths,
  overwriteCheckLoading,
  overwriteCheckError,
  saveError,
  previewReviewStale,
}: StepReviewProps) {
  const newTokens = previewTokens.filter(pt => !existingOverwritePathSet.has(pt.path));
  const safeUpdateEntries = previewAnalysis?.safeUpdates ?? [];
  const nonGeneratorOverwriteEntries = previewAnalysis?.nonGeneratorOverwrites ?? [];
  const manualConflictEntries = previewAnalysis?.manualEditConflicts ?? [];
  const deletedOutputEntries = previewAnalysis?.deletedOutputs ?? [];
  const detachedOutputEntries = previewAnalysis?.detachedOutputs ?? [];
  const recreatedDetachedEntries = detachedOutputEntries.filter(entry => entry.state === 'recreated');
  const preservedDetachedEntries = detachedOutputEntries.filter(entry => entry.state === 'preserved');
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

      {previewReviewStale && (
        <div className="rounded-lg border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/10 px-3 py-2.5 text-[10px] text-[var(--color-figma-warning)]">
          The live token store changed after you opened review. Refresh the summary, then confirm again.
        </div>
      )}

      {!isMultiBrand && previewAnalysis && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border border-[var(--color-figma-success)]/30 bg-[var(--color-figma-success)]/10 px-3 py-2.5">
            <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-success)]/80">Safe creates</div>
            <div className="mt-1 text-[13px] font-semibold text-[var(--color-figma-success)]">{previewAnalysis.safeCreateCount}</div>
          </div>
          <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2.5">
            <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">Safe updates</div>
            <div className="mt-1 text-[13px] font-semibold text-[var(--color-figma-text)]">{safeUpdateEntries.length}</div>
          </div>
          <div className="rounded-lg border border-[var(--color-figma-warning)]/35 bg-[var(--color-figma-warning)]/10 px-3 py-2.5">
            <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-warning)]/80">Overwrite risks</div>
            <div className="mt-1 text-[13px] font-semibold text-[var(--color-figma-warning)]">{nonGeneratorOverwriteEntries.length}</div>
          </div>
          <div className="rounded-lg border border-[var(--color-figma-error)]/35 bg-[var(--color-figma-error)]/10 px-3 py-2.5">
            <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-error)]/80">Manual conflicts</div>
            <div className="mt-1 text-[13px] font-semibold text-[var(--color-figma-error)]">{manualConflictEntries.length}</div>
          </div>
          <div className="rounded-lg border border-[var(--color-figma-warning)]/35 bg-[var(--color-figma-warning)]/10 px-3 py-2.5">
            <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-warning)]/80">Deleted outputs</div>
            <div className="mt-1 text-[13px] font-semibold text-[var(--color-figma-warning)]">{deletedOutputEntries.length}</div>
          </div>
          <div className="rounded-lg border border-[var(--color-figma-warning)]/35 bg-[var(--color-figma-warning)]/10 px-3 py-2.5">
            <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-warning)]/80">Detached outputs</div>
            <div className="mt-1 text-[13px] font-semibold text-[var(--color-figma-warning)]">{detachedOutputEntries.length}</div>
          </div>
        </div>
      )}

      {overwriteCheckLoading && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]">
          <Spinner size="sm" />
          <span className="text-[10px]">Revalidating the latest preview…</span>
        </div>
      )}
      {!overwriteCheckLoading && overwriteCheckError && (
        <div className="text-[10px] text-[var(--color-figma-text-secondary)] px-3 py-2.5 rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          {overwriteCheckError}
        </div>
      )}

      {!overwriteCheckLoading && overwritePendingPaths.length > 0 && (
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

      {nonGeneratorOverwriteEntries.length > 0 && (
        <div>
          <label className="block text-[10px] font-medium text-[var(--color-figma-warning)] mb-1.5">
            Overwrite risks
          </label>
          <div className="flex flex-col gap-1.5">
            {nonGeneratorOverwriteEntries.map(entry => (
              <div key={`${entry.setName}:${entry.path}`} className="flex flex-col gap-0.5">
                <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate" title={`${entry.setName}:${entry.path}`}>
                  {entry.path}
                  {entry.setName !== targetSet && <span className="ml-1 text-[var(--color-figma-text-tertiary)]">@ {entry.setName}</span>}
                </span>
                {entry.changesValue ? (
                  <ValueDiff type={entry.type} before={entry.currentValue} after={entry.newValue} />
                ) : (
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    Existing value matches the preview, but this path would change ownership.
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {manualConflictEntries.length > 0 && (
        <div>
          <label className="block text-[10px] font-medium text-[var(--color-figma-error)] mb-1.5">
            Manual-edit conflicts
          </label>
          <div className="flex flex-col gap-1.5">
            {manualConflictEntries.map(entry => (
              <div key={`${entry.setName}:${entry.path}`} className="flex flex-col gap-0.5">
                <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate" title={`${entry.setName}:${entry.path}`}>
                  {entry.path}
                </span>
                <ValueDiff type={entry.type} before={entry.currentValue} after={entry.newValue} />
              </div>
            ))}
          </div>
        </div>
      )}

      {deletedOutputEntries.length > 0 && (
        <div>
          <label className="block text-[10px] font-medium text-[var(--color-figma-warning)] mb-1.5">
            Deleted outputs
          </label>
          <div className="flex flex-col gap-1">
            {deletedOutputEntries.map(entry => (
              <div key={`${entry.setName}:${entry.path}`} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
                <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate" title={`${entry.setName}:${entry.path}`}>
                  {entry.path}
                  {entry.setName !== targetSet && <span className="ml-1 text-[var(--color-figma-text-tertiary)]">@ {entry.setName}</span>}
                </span>
                <span className="text-[10px] text-[var(--color-figma-warning)] shrink-0">Removed on save</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {detachedOutputEntries.length > 0 && (
        <div>
          <label className="block text-[10px] font-medium text-[var(--color-figma-warning)] mb-1.5">
            Detached outputs
          </label>
          <div className="flex flex-col gap-1.5">
            {recreatedDetachedEntries.map(entry => (
              <div key={`${entry.setName}:${entry.path}`} className="flex flex-col gap-0.5">
                <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate" title={`${entry.setName}:${entry.path}`}>
                  {entry.path}
                </span>
                <ValueDiff type={entry.type} before={entry.currentValue} after={entry.newValue} />
              </div>
            ))}
            {preservedDetachedEntries.map(entry => (
              <div key={`${entry.setName}:${entry.path}`} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
                <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate" title={`${entry.setName}:${entry.path}`}>
                  {entry.path}
                </span>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">Stays manual</span>
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
