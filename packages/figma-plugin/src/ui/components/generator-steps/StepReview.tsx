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
import { GENERATOR_AUTHORING_CLASSES } from '../generatorAuthoringSurface';

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
    <section className={`${GENERATOR_AUTHORING_CLASSES.root} ${GENERATOR_AUTHORING_CLASSES.section}`}>
      <div className={GENERATOR_AUTHORING_CLASSES.titleBlock}>
        <h3 className={GENERATOR_AUTHORING_CLASSES.title}>Review and confirm</h3>
        <p className={GENERATOR_AUTHORING_CLASSES.description}>
          Confirm the destination, semantic plan, and token changes before saving.
        </p>
      </div>

      <div className={GENERATOR_AUTHORING_CLASSES.metricGrid}>
        <div className={GENERATOR_AUTHORING_CLASSES.summaryCard}>
          <div className={GENERATOR_AUTHORING_CLASSES.summaryRow}>
            <span className={GENERATOR_AUTHORING_CLASSES.summaryLabel}>Generator</span>
            <span className={GENERATOR_AUTHORING_CLASSES.summaryValue}>{name}</span>
          </div>
          <div className={GENERATOR_AUTHORING_CLASSES.summaryRow}>
            <span className={GENERATOR_AUTHORING_CLASSES.summaryLabel}>Type</span>
            <span className={GENERATOR_AUTHORING_CLASSES.summaryValue}>{TYPE_LABELS[selectedType]}</span>
          </div>
        </div>
        <div className={GENERATOR_AUTHORING_CLASSES.summaryCard}>
          <div className={GENERATOR_AUTHORING_CLASSES.summaryRow}>
            <span className={GENERATOR_AUTHORING_CLASSES.summaryLabel}>Output</span>
            <span className={GENERATOR_AUTHORING_CLASSES.summaryMono}>{targetGroup}</span>
          </div>
          <div className={GENERATOR_AUTHORING_CLASSES.summaryRow}>
            <span className={GENERATOR_AUTHORING_CLASSES.summaryLabel}>Set</span>
            <span className={GENERATOR_AUTHORING_CLASSES.summaryValue}>{isMultiBrand ? 'Multiple sets' : targetSet}</span>
          </div>
        </div>
        <div className={GENERATOR_AUTHORING_CLASSES.summaryCard}>
          <div className={GENERATOR_AUTHORING_CLASSES.summaryRow}>
            <span className={GENERATOR_AUTHORING_CLASSES.summaryLabel}>Semantic aliases</span>
            <span className={GENERATOR_AUTHORING_CLASSES.summaryValue}>
              {semanticEnabled && validSemanticMappings.length > 0
                ? `${validSemanticMappings.length} alias${validSemanticMappings.length === 1 ? '' : 'es'}`
                : 'Skipped'}
            </span>
          </div>
          <div className={GENERATOR_AUTHORING_CLASSES.summaryRow}>
            <span className={GENERATOR_AUTHORING_CLASSES.summaryLabel}>Prefix</span>
            <span className={semanticEnabled && validSemanticMappings.length > 0 ? GENERATOR_AUTHORING_CLASSES.summaryMono : GENERATOR_AUTHORING_CLASSES.summaryValue}>
              {semanticEnabled && validSemanticMappings.length > 0
                ? `${semanticPrefix}.*`
                : 'No semantic layer will be created.'}
            </span>
          </div>
        </div>
      </div>

      {semanticEnabled && validSemanticMappings.length > 0 && (
        <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
          <div className={GENERATOR_AUTHORING_CLASSES.title}>Alias preview</div>
          <div className="flex flex-col gap-1">
            {validSemanticMappings.map((mapping) => (
              <div
                key={`${mapping.semantic}-${mapping.step}`}
                className={GENERATOR_AUTHORING_CLASSES.summaryRow}
              >
                <span className={GENERATOR_AUTHORING_CLASSES.summaryMono}>{semanticPrefix}.{mapping.semantic}</span>
                <span className="text-[var(--color-figma-text-secondary)]">→</span>
                <span className="font-mono text-[var(--color-figma-accent)]">{`{${targetGroup}.${mapping.step}}`}</span>
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
        <div className={GENERATOR_AUTHORING_CLASSES.metricGrid}>
          <div className={`${GENERATOR_AUTHORING_CLASSES.metricCard} border-[var(--color-figma-success)]/30 bg-[var(--color-figma-success)]/10`}>
            <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-success)]/80">Safe creates</div>
            <div className={`${GENERATOR_AUTHORING_CLASSES.metricValue} text-[var(--color-figma-success)]`}>{previewAnalysis.safeCreateCount}</div>
          </div>
          <div className={GENERATOR_AUTHORING_CLASSES.metricCard}>
            <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-text-tertiary)]">Safe updates</div>
            <div className={`${GENERATOR_AUTHORING_CLASSES.metricValue} text-[var(--color-figma-text)]`}>{safeUpdateEntries.length}</div>
          </div>
          <div className={`${GENERATOR_AUTHORING_CLASSES.metricCard} border-[var(--color-figma-warning)]/35 bg-[var(--color-figma-warning)]/10`}>
            <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-warning)]/80">Overwrite risks</div>
            <div className={`${GENERATOR_AUTHORING_CLASSES.metricValue} text-[var(--color-figma-warning)]`}>{nonGeneratorOverwriteEntries.length}</div>
          </div>
          <div className={`${GENERATOR_AUTHORING_CLASSES.metricCard} border-[var(--color-figma-error)]/35 bg-[var(--color-figma-error)]/10`}>
            <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-error)]/80">Manual conflicts</div>
            <div className={`${GENERATOR_AUTHORING_CLASSES.metricValue} text-[var(--color-figma-error)]`}>{manualConflictEntries.length}</div>
          </div>
          <div className={`${GENERATOR_AUTHORING_CLASSES.metricCard} border-[var(--color-figma-warning)]/35 bg-[var(--color-figma-warning)]/10`}>
            <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-warning)]/80">Deleted outputs</div>
            <div className={`${GENERATOR_AUTHORING_CLASSES.metricValue} text-[var(--color-figma-warning)]`}>{deletedOutputEntries.length}</div>
          </div>
          <div className={`${GENERATOR_AUTHORING_CLASSES.metricCard} border-[var(--color-figma-warning)]/35 bg-[var(--color-figma-warning)]/10`}>
            <div className="text-[9px] uppercase tracking-wide text-[var(--color-figma-warning)]/80">Detached outputs</div>
            <div className={`${GENERATOR_AUTHORING_CLASSES.metricValue} text-[var(--color-figma-warning)]`}>{detachedOutputEntries.length}</div>
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
        <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
          <label className="block text-[10px] font-medium text-[var(--color-figma-warning)]">
            Overwrite risks
          </label>
          <div className={GENERATOR_AUTHORING_CLASSES.cardList}>
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
        <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
          <label className="block text-[10px] font-medium text-[var(--color-figma-error)]">
            Manual-edit conflicts
          </label>
          <div className={GENERATOR_AUTHORING_CLASSES.cardList}>
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
        <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
          <label className="block text-[10px] font-medium text-[var(--color-figma-warning)]">
            Deleted outputs
          </label>
          <div className={GENERATOR_AUTHORING_CLASSES.cardList}>
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
        <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
          <label className="block text-[10px] font-medium text-[var(--color-figma-warning)]">
            Detached outputs
          </label>
          <div className={GENERATOR_AUTHORING_CLASSES.cardList}>
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
        <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
          <label className="block text-[10px] font-medium text-[var(--color-figma-success)]">
            New tokens
          </label>
          <div className={GENERATOR_AUTHORING_CLASSES.cardList}>
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
                <span className="min-w-0 break-all text-[10px] font-mono text-[var(--color-figma-text-secondary)]" title={typeof token.value === 'object' ? JSON.stringify(token.value) : String(token.value)}>
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
        <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
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
    </section>
  );
}
