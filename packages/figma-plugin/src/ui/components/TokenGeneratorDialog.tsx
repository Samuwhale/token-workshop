import { useMemo, useRef, useState } from 'react';
import { Spinner } from './Spinner';
import { ConfirmModal } from './ConfirmModal';
import { ValueDiff } from './ValueDiff';
import { SEMANTIC_PATTERNS } from '../shared/semanticPatterns';
import { swatchBgColor } from '../shared/colorUtils';
import { AliasAutocomplete } from './AliasAutocomplete';
import type {
  TokenGenerator,
  GeneratorType,
  ColorRampConfig,
  TypeScaleConfig,
  SpacingScaleConfig,
  OpacityScaleConfig,
  BorderRadiusScaleConfig,
  ZIndexScaleConfig,
  ShadowScaleConfig,
  CustomScaleConfig,
  ContrastCheckConfig,
  AccessibleColorPairConfig,
  DarkModeInversionConfig,
  GeneratorTemplate,
  InputTable,
  InputTableRow,
} from '../hooks/useGenerators';

import { ColorRampConfigEditor, ColorSwatchPreview } from './generators/ColorRampGenerator';
import { TypeScaleConfigEditor, TypeScalePreview } from './generators/TypeScaleGenerator';
import { SpacingScaleConfigEditor, SpacingPreview } from './generators/SpacingScaleGenerator';
import { OpacityScaleConfigEditor, OpacityPreview } from './generators/OpacityScaleGenerator';
import { ShadowScaleConfigEditor, ShadowPreview } from './generators/ShadowScaleGenerator';
import { BorderRadiusConfigEditor, BorderRadiusPreview } from './generators/BorderRadiusGenerator';
import { ZIndexConfigEditor } from './generators/ZIndexGenerator';
import { CustomScaleConfigEditor } from './generators/CustomScaleGenerator';
import { ContrastCheckConfigEditor, ContrastCheckPreview } from './generators/ContrastCheckGenerator';
import { AccessiblePairConfigEditor } from './generators/AccessiblePairGenerator';
import { DarkModeInversionConfigEditor } from './generators/DarkModeInversionGenerator';
import { GenericPreview, CompactColorInput, CompactDimensionInput } from './generators/generatorShared';
import { PRIMARY_TYPES, ADVANCED_TYPES, TYPE_LABELS } from './generators/generatorUtils';
import { useGeneratorDialog } from '../hooks/useGeneratorDialog';
import { Collapsible } from './Collapsible';

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

export interface TokenGeneratorDialogProps {
  serverUrl: string;
  sourceTokenPath?: string;
  sourceTokenName?: string;
  sourceTokenType?: string;
  sourceTokenValue?: any;
  allSets: string[];
  activeSet: string;
  /** All tokens flat map for source token autocomplete and config field tokenRefs */
  allTokensFlat?: Record<string, import('../../shared/types').TokenMapEntry>;
  existingGenerator?: TokenGenerator;
  /** Pre-fill from a quick-start template */
  template?: GeneratorTemplate;
  /** When provided, shows a back arrow to return to the previous step (e.g. template picker) */
  onBack?: () => void;
  onClose: () => void;
  onSaved: (info?: { targetGroup: string }) => void;
  /** When provided, fires with semantic mapping data instead of showing SemanticMappingDialog */
  onInterceptSemanticMapping?: (data: { tokens: import('../hooks/useGenerators').GeneratedTokenResult[]; targetGroup: string; targetSet: string; generatorType: import('../hooks/useGenerators').GeneratorType }) => void;
  /** Token path → set name for autocomplete display */
  pathToSet?: Record<string, string>;
}


// ---------------------------------------------------------------------------
// InputTableEditor sub-component
// ---------------------------------------------------------------------------

function InputTableEditor({ table, onChange }: { table: InputTable; onChange: (t: InputTable) => void }) {
  const updateInputKey = (key: string) => onChange({ ...table, inputKey: key });

  const updateRow = (idx: number, patch: Partial<InputTableRow>) =>
    onChange({ ...table, rows: table.rows.map((r, i) => i === idx ? { ...r, ...patch } : r) });

  const updateRowInput = (rowIdx: number, value: string) => {
    const row = table.rows[rowIdx];
    updateRow(rowIdx, { inputs: { ...row.inputs, [table.inputKey]: value } });
  };

  const addRow = () =>
    onChange({ ...table, rows: [...table.rows, { brand: '', inputs: { [table.inputKey]: '' } }] });

  const removeRow = (idx: number) =>
    onChange({ ...table, rows: table.rows.filter((_, i) => i !== idx) });

  return (
    <div className="flex flex-col gap-2">
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Input column name</label>
        <input
          value={table.inputKey}
          onChange={e => updateInputKey(e.target.value)}
          placeholder="brandColor"
          className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono focus-visible:border-[var(--color-figma-accent)]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex gap-1.5 px-0.5">
          <span className="w-24 text-[10px] text-[var(--color-figma-text-secondary)]">Brand</span>
          <span className="flex-1 text-[10px] text-[var(--color-figma-text-secondary)]">{table.inputKey || 'value'}</span>
          <span className="w-5" />
        </div>
        {table.rows.map((row, i) => (
          <div key={i} className="flex gap-1.5 items-center">
            <input
              value={row.brand}
              onChange={e => updateRow(i, { brand: e.target.value })}
              placeholder="berry"
              className="w-24 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono focus-visible:border-[var(--color-figma-accent)]"
            />
            <input
              value={String(row.inputs[table.inputKey] ?? '')}
              onChange={e => updateRowInput(i, e.target.value)}
              placeholder="#8B5CF6"
              className="flex-1 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono focus-visible:border-[var(--color-figma-accent)]"
            />
            <button
              onClick={() => removeRow(i)}
              aria-label="Remove row"
              className="w-5 text-center text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] text-[12px] shrink-0 leading-none"
            >×</button>
          </div>
        ))}
        <button
          onClick={addRow}
          className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left mt-0.5"
        >+ Add brand</button>
      </div>
    </div>
  );
}

export function TokenGeneratorDialog({
  serverUrl,
  sourceTokenPath,
  sourceTokenName,
  sourceTokenType,
  sourceTokenValue,
  allSets,
  activeSet,
  allTokensFlat,
  existingGenerator,
  template,
  onBack,
  onClose,
  onSaved,
  onInterceptSemanticMapping,
  pathToSet,
}: TokenGeneratorDialogProps) {
  const {
    isEditing,
    isMultiBrand,
    typeNeedsValue,
    hasSource,
    hasValue,
    availableTypes,
    recommendedType,
    currentConfig,
    lockedCount,
    selectedType,
    name,
    targetSet,
    targetGroup,
    editableSourcePath,
    inlineValue,
    inputTable,
    targetSetTemplate,
    pendingOverrides,
    previewTokens,
    previewLoading,
    previewError,
    previewBrand,
    overwrittenEntries,
    existingOverwritePathSet,
    existingTokensError,
    saving,
    saveError,
    showConfirmation,
    overwritePendingPaths,
    overwriteCheckLoading,
    overwriteCheckError,
    semanticEnabled,
    semanticPrefix,
    semanticMappings,
    selectedSemanticPatternId,
    handleTypeChange,
    handleNameChange,
    setTargetSet,
    setTargetGroup,
    setTargetSetTemplate,
    setEditableSourcePath,
    setInlineValue,
    handleConfigChange,
    handleToggleMultiBrand,
    setInputTable,
    handleOverrideChange,
    handleOverrideClear,
    clearAllOverrides,
    handleSave,
    handleConfirmSave,
    handleCancelConfirmation,
    setSemanticEnabled,
    setSemanticPrefix,
    setSemanticMappings,
    setSelectedSemanticPatternId,
    isDirtyRef,
  } = useGeneratorDialog({
    serverUrl,
    sourceTokenPath,
    sourceTokenName,
    sourceTokenType,
    sourceTokenValue,
    activeSet,
    existingGenerator,
    template,
    onSaved,
    onInterceptSemanticMapping,
  });

  const overwritePaths = useMemo(
    () => new Set(overwrittenEntries.map(e => e.path)),
    [overwrittenEntries],
  );

  const [showAdvancedTypes, setShowAdvancedTypes] = useState(() => ADVANCED_TYPES.includes(selectedType));
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showSourceAutocomplete, setShowSourceAutocomplete] = useState(false);
  const sourcePathInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    if (isDirtyRef.current) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  };

  if (showConfirmation) {
    // Tokens truly new (don't exist in target set at all)
    const newTokens = previewTokens.filter(pt => !existingOverwritePathSet.has(pt.path));
    // Tokens that exist with the same value (will be silently overwritten, no value change)
    const unchangedOverwriteTokens = previewTokens.filter(pt => existingOverwritePathSet.has(pt.path) && !overwritePaths.has(pt.path));
    const hasPreview = previewTokens.length > 0;

    // Semantic mapping — only for new generators with eligible types and token output
    const suggestedPatterns = SEMANTIC_PATTERNS.filter(p => p.applicableTo.includes(selectedType));
    const showSemanticSection = !isEditing && (previewTokens.length > 0 || isMultiBrand) && !onInterceptSemanticMapping;
    const availableSteps = previewTokens.map(t => String(t.stepName));

    const handleSemanticPatternSelect = (patternId: string) => {
      const pattern = SEMANTIC_PATTERNS.find(p => p.id === patternId);
      if (!pattern) return;
      setSelectedSemanticPatternId(patternId);
      setSemanticMappings(pattern.mappings.map(m => ({
        semantic: m.semantic,
        step: availableSteps.includes(m.step) ? m.step : (availableSteps[Math.floor(availableSteps.length / 2)] ?? ''),
      })));
    };

    return (
      <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
        <div className="bg-[var(--color-figma-bg)] rounded-t border border-[var(--color-figma-border)] shadow-xl w-full max-w-sm flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-figma-border)] shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={handleCancelConfirmation} aria-label="Back to editor" className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              </button>
              <div className="flex flex-col gap-0.5">
                <span className="text-[12px] font-semibold text-[var(--color-figma-text)]">
                  {isEditing ? 'Review & Update' : 'Review & Create'}
                </span>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {name} → {targetGroup}.* in {isMultiBrand ? 'multi-brand' : targetSet}
                </span>
              </div>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">

            {/* Overwrite warning — new generator overwriting existing tokens */}
            {!isEditing && !isMultiBrand && existingOverwritePathSet.size > 0 && (
              <div className="flex items-start gap-2 px-2.5 py-2 rounded border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/10 text-[var(--color-figma-warning)]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                <span className="text-[10px] leading-snug">
                  <strong>{existingOverwritePathSet.size} existing token{existingOverwritePathSet.size !== 1 ? 's' : ''}</strong> in <span className="font-mono">{targetGroup}.*</span> will be overwritten
                  {unchangedOverwriteTokens.length > 0 && overwrittenEntries.length === 0 && ' (no value changes)'}
                  {unchangedOverwriteTokens.length > 0 && overwrittenEntries.length > 0 && ` (${overwrittenEntries.length} with value changes, ${unchangedOverwriteTokens.length} unchanged)`}
                </span>
              </div>
            )}

            {/* Manually-edited overwrite warning — for updates, loaded async */}
            {isEditing && overwriteCheckLoading && (
              <div className="flex items-center gap-2 px-2.5 py-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]">
                <Spinner size="sm" />
                <span className="text-[10px]">Checking for manually edited tokens…</span>
              </div>
            )}
            {isEditing && !overwriteCheckLoading && overwriteCheckError && (
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] px-2.5 py-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
                {overwriteCheckError}
              </div>
            )}
            {isEditing && !overwriteCheckLoading && overwritePendingPaths.length > 0 && (
              <div className="flex flex-col gap-1.5 px-2.5 py-2 rounded border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/10">
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

            {/* Summary badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {hasPreview && newTokens.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)]">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                  {newTokens.length} new
                </span>
              )}
              {overwrittenEntries.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)]">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14" /></svg>
                  {overwrittenEntries.length} modified
                </span>
              )}
              {unchangedOverwriteTokens.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)]">
                  {unchangedOverwriteTokens.length} unchanged
                </span>
              )}
              {hasPreview && newTokens.length === 0 && overwrittenEntries.length === 0 && unchangedOverwriteTokens.length === 0 && (
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {previewTokens.length} token{previewTokens.length !== 1 ? 's' : ''} will be created (all new)
                </span>
              )}
              {isMultiBrand && inputTable && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]">
                  {inputTable.rows.filter(r => r.brand.trim()).length} brand{inputTable.rows.filter(r => r.brand.trim()).length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

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
                    <div key={token.path} className="flex items-center gap-2 px-2 py-1 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
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
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)] rounded px-2 py-2 bg-[var(--color-figma-bg-secondary)]">
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

            {/* Semantic aliases — inline opt-in section for new generators */}
            {showSemanticSection && (
              <div className="border border-[var(--color-figma-border)] rounded p-3 bg-[var(--color-figma-bg-secondary)]">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Semantic aliases</span>
                    {!semanticEnabled && (
                      <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
                        Optionally create alias tokens pointing to {targetGroup}.*
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setSemanticEnabled(!semanticEnabled)}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
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
                        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1.5">Suggested patterns</label>
                        <div className="flex flex-wrap gap-1">
                          {suggestedPatterns.map(p => (
                            <button
                              key={p.id}
                              onClick={() => handleSemanticPatternSelect(p.id)}
                              className={`px-2 py-1 rounded text-[10px] border transition-colors ${
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

                    {/* Semantic prefix */}
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">Prefix</label>
                      <input
                        type="text"
                        value={semanticPrefix}
                        onChange={e => setSemanticPrefix(e.target.value)}
                        placeholder="semantic"
                        className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono focus-visible:border-[var(--color-figma-accent)]"
                      />
                    </div>

                    {/* Mapping rows */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Mappings</label>
                        <button
                          onClick={() => setSemanticMappings([...semanticMappings, { semantic: '', step: availableSteps[0] ?? '' }])}
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
                              onChange={e => setSemanticMappings(semanticMappings.map((m, idx) => idx === i ? { ...m, semantic: e.target.value } : m))}
                              placeholder="action.default"
                              className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono focus-visible:border-[var(--color-figma-accent)] min-w-0"
                            />
                            <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-[var(--color-figma-text-secondary)]"><path d="M2 6h8M7 3l3 3-3 3" /></svg>
                            <select
                              value={mapping.step}
                              onChange={e => setSemanticMappings(semanticMappings.map((m, idx) => idx === i ? { ...m, step: e.target.value } : m))}
                              className="w-16 px-1 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)]"
                            >
                              {availableSteps.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <button
                              onClick={() => setSemanticMappings(semanticMappings.filter((_, idx) => idx !== i))}
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
                      <div className="border border-[var(--color-figma-border)] rounded p-2 bg-[var(--color-figma-bg)] flex flex-col gap-0.5">
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

          {/* Footer */}
          <div className="flex gap-2 p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
            <button onClick={handleCancelConfirmation} className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]">
              Back
            </button>
            <button onClick={handleConfirmSave} disabled={saving || overwriteCheckLoading}
              className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50">
              {saving
                ? (isEditing ? 'Saving…' : 'Creating…')
                : overwriteCheckLoading
                  ? 'Checking…'
                  : isEditing
                    ? 'Confirm & Update'
                    : semanticEnabled && semanticMappings.filter(m => m.semantic.trim()).length > 0
                      ? `Confirm & Create (+${semanticMappings.filter(m => m.semantic.trim()).length} aliases)`
                      : 'Confirm & Create'
              }
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Effective source value for config editors (from bound token or inline input)
  const effectiveSourceHex = typeof sourceTokenValue === 'string' ? sourceTokenValue : typeof inlineValue === 'string' ? inlineValue : undefined;
  const effectiveSourceDim = (() => {
    if (typeof sourceTokenValue === 'object' && sourceTokenValue !== null && 'value' in sourceTokenValue) return Number(sourceTokenValue.value);
    if (typeof sourceTokenValue === 'number') return sourceTokenValue;
    if (typeof inlineValue === 'object' && inlineValue !== null && 'value' in (inlineValue as Record<string, unknown>)) return Number((inlineValue as { value: number }).value);
    return undefined;
  })();

  /** Whether the selected type expects a color input (for inline value rendering) */
  const typeExpectsColor = selectedType === 'colorRamp' || selectedType === 'accessibleColorPair' || selectedType === 'darkModeInversion';
  /** Whether the selected type expects a dimension input */
  const typeExpectsDimension = selectedType === 'typeScale' || selectedType === 'spacingScale' || selectedType === 'borderRadiusScale';

  // Tokens with values matching the current inline value — used to suggest binding instead of using an orphaned literal
  const matchingTokens = useMemo(() => {
    if (!allTokensFlat || !inlineValue) return [] as Array<{ path: string; value: string }>;
    if (typeExpectsColor && typeof inlineValue === 'string') {
      const normHex = inlineValue.toLowerCase().slice(0, 7);
      if (!/^#[0-9a-f]{6}$/.test(normHex)) return [] as Array<{ path: string; value: string }>;
      return Object.entries(allTokensFlat)
        .filter(([, e]) => e.$type === 'color' && typeof e.$value === 'string' && (e.$value as string).toLowerCase().slice(0, 7) === normHex)
        .slice(0, 5)
        .map(([path, e]) => ({ path, value: e.$value as string }));
    }
    if (typeExpectsDimension && typeof inlineValue === 'object' && inlineValue !== null && 'value' in (inlineValue as Record<string, unknown>)) {
      const { value: numVal, unit } = inlineValue as { value: number; unit: string };
      return Object.entries(allTokensFlat)
        .filter(([, e]) => {
          if (e.$type !== 'dimension') return false;
          const v = e.$value;
          if (typeof v === 'string') {
            const m = (v as string).match(/^([0-9.]+)(px|rem|em|%)?$/);
            if (m) return parseFloat(m[1]) === numVal && (m[2] ?? 'px') === unit;
          }
          if (typeof v === 'object' && v !== null && 'value' in (v as Record<string, unknown>)) {
            const dv = v as { value: number; unit?: string };
            return dv.value === numVal && (dv.unit ?? 'px') === unit;
          }
          return false;
        })
        .slice(0, 5)
        .map(([path, e]) => ({ path, value: String(e.$value) }));
    }
    return [] as Array<{ path: string; value: string }>;
  }, [allTokensFlat, inlineValue, typeExpectsColor, typeExpectsDimension]);

  // Resolved value preview — only valid when the editable path matches the initially-bound source token
  const sourcePreviewAvailable = Boolean(sourceTokenPath && editableSourcePath === sourceTokenPath && sourceTokenValue != null);
  const sourcePreviewIsColor = sourcePreviewAvailable && (sourceTokenType === 'color') && typeof effectiveSourceHex === 'string';
  const sourcePreviewIsDimension = sourcePreviewAvailable && (sourceTokenType === 'dimension' || sourceTokenType === 'fontSize') && effectiveSourceDim !== undefined;
  const sourceDimUnit = typeof sourceTokenValue === 'object' && sourceTokenValue !== null && 'unit' in sourceTokenValue
    ? String((sourceTokenValue as { unit: string }).unit)
    : 'px';

  const typeButton = (type: GeneratorType) => (
    <button
      key={type}
      onClick={() => handleTypeChange(type)}
      className={`px-2 py-1.5 rounded text-[10px] font-medium border transition-colors text-left flex items-center gap-1.5 ${
        selectedType === type
          ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
          : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
      }`}
    >
      {type === recommendedType && <span className="text-[8px] leading-none">★</span>}
      {TYPE_LABELS[type]}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
      {showDiscardConfirm && (
        <ConfirmModal
          title="Discard unsaved changes?"
          description="You have unsaved changes. They will be lost if you close."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          danger
          onConfirm={() => { setShowDiscardConfirm(false); onClose(); }}
          onCancel={() => setShowDiscardConfirm(false)}
        />
      )}
      <div className="bg-[var(--color-figma-bg)] rounded-t border border-[var(--color-figma-border)] shadow-xl w-full max-w-sm flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-figma-border)] shrink-0">
          <div className="flex items-center gap-2">
            {onBack && (
              <button onClick={onBack} aria-label="Back to templates" className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              </button>
            )}
            <div className="flex flex-col gap-0.5">
              <span className="text-[12px] font-semibold text-[var(--color-figma-text)]">
                {isEditing ? 'Edit Generator' : template ? template.label : 'New Generator'}
              </span>
              {editableSourcePath ? (
                <div className="flex items-center gap-1 max-w-[220px]">
                  {sourcePreviewIsColor && effectiveSourceHex && (
                    <div
                      className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                      style={{ backgroundColor: swatchBgColor(effectiveSourceHex) }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-mono truncate">
                    {editableSourcePath}
                  </span>
                  {sourcePreviewIsColor && effectiveSourceHex && (
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-mono shrink-0">
                      = {effectiveSourceHex.slice(0, 7)}
                    </span>
                  )}
                  {sourcePreviewIsDimension && effectiveSourceDim !== undefined && (
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-mono shrink-0">
                      = {effectiveSourceDim}{sourceDimUnit}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {typeNeedsValue ? 'Enter a base value or bind a source token' : 'Standalone generator'}
                </span>
              )}
            </div>
          </div>
          <button onClick={handleClose} aria-label="Close" className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

          {/* Type selector — primary types */}
          <div>
            <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1.5">
              Type
              {recommendedType && (
                <span className="ml-1 text-[var(--color-figma-accent)]">(recommended: {TYPE_LABELS[recommendedType]})</span>
              )}
            </label>
            <div className="grid grid-cols-2 gap-1">
              {PRIMARY_TYPES.map(typeButton)}
            </div>
            {/* Advanced types — collapsible */}
            <Collapsible
              open={showAdvancedTypes}
              onToggle={() => setShowAdvancedTypes(v => !v)}
              className="mt-1.5"
              label={
                <>
                  Advanced
                  {ADVANCED_TYPES.includes(selectedType) && !showAdvancedTypes && (
                    <span className="text-[var(--color-figma-accent)] ml-1">({TYPE_LABELS[selectedType]})</span>
                  )}
                </>
              }
            >
              <div className="grid grid-cols-2 gap-1 mt-1">
                {ADVANCED_TYPES.map(typeButton)}
              </div>
            </Collapsible>
          </div>

          {/* Source token binding — shown when type needs a value */}
          {typeNeedsValue && (
            <div className="border border-[var(--color-figma-accent)]/40 rounded p-3 bg-[var(--color-figma-bg-secondary)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Source token</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] font-medium">Recommended</span>
              </div>
              <div className="relative">
                <div className="flex items-center gap-1.5">
                  <input
                    ref={sourcePathInputRef}
                    type="text"
                    value={editableSourcePath}
                    onChange={e => {
                      setEditableSourcePath(e.target.value);
                      setShowSourceAutocomplete(true);
                    }}
                    onFocus={() => setShowSourceAutocomplete(true)}
                    onBlur={() => setTimeout(() => setShowSourceAutocomplete(false), 150)}
                    placeholder={allTokensFlat ? 'Search or type a token path…' : 'e.g. colors.brand.primary'}
                    className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono focus-visible:border-[var(--color-figma-accent)]"
                  />
                  {editableSourcePath && (
                    <button
                      onClick={() => { setEditableSourcePath(''); setShowSourceAutocomplete(false); }}
                      aria-label="Clear source token"
                      className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
                {/* Token autocomplete dropdown */}
                {showSourceAutocomplete && allTokensFlat && (
                  <AliasAutocomplete
                    query={editableSourcePath}
                    allTokensFlat={allTokensFlat}
                    pathToSet={pathToSet}
                    filterType={typeExpectsColor ? 'color' : typeExpectsDimension ? 'dimension' : undefined}
                    onSelect={path => {
                      setEditableSourcePath(path);
                      setShowSourceAutocomplete(false);
                    }}
                    onClose={() => setShowSourceAutocomplete(false)}
                  />
                )}
              </div>
              {/* Resolved value preview */}
              {editableSourcePath && sourcePreviewAvailable && (sourcePreviewIsColor || sourcePreviewIsDimension) && (
                <div className="mt-1.5 flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">
                  {sourcePreviewIsColor && effectiveSourceHex && (
                    <div
                      className="w-4 h-4 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                      style={{ backgroundColor: swatchBgColor(effectiveSourceHex) }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)]">
                    {sourcePreviewIsColor && effectiveSourceHex
                      ? effectiveSourceHex
                      : sourcePreviewIsDimension && effectiveSourceDim !== undefined
                        ? `${effectiveSourceDim}${sourceDimUnit}`
                        : null}
                  </span>
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)] ml-auto">resolved</span>
                </div>
              )}
              <span className="text-[9px] text-[var(--color-figma-text-secondary)] mt-1 block">
                {editableSourcePath
                  ? isMultiBrand
                    ? 'Bound — used as a preview reference. Each brand\'s value comes from the table below.'
                    : 'Bound to a token — changes to the source token automatically update the generator.'
                  : isMultiBrand
                    ? 'Optional in multi-brand mode — bind to a token for preview sampling.'
                    : 'Bind to a token so the generator stays connected to your token graph.'}
              </span>
            </div>
          )}

          {/* Inline base value — shown when no source token is bound AND type needs a value */}
          {!hasSource && typeNeedsValue && (
            <div className="border border-dashed border-[var(--color-figma-border)] rounded p-3 bg-[var(--color-figma-bg-secondary)] opacity-90">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Manual base value</span>
                <span className="text-[9px] text-[var(--color-figma-text-secondary)]">fallback</span>
              </div>
              {typeExpectsColor && (
                <CompactColorInput
                  value={typeof inlineValue === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(inlineValue) ? inlineValue : '#808080'}
                  onChange={hex => setInlineValue(hex)}
                  aria-label="Base color"
                />
              )}
              {typeExpectsDimension && (() => {
                const dimValue = typeof inlineValue === 'object' && inlineValue !== null && 'value' in (inlineValue as Record<string, unknown>)
                  ? (inlineValue as { value: number; unit?: string })
                  : null;
                const currentUnit = dimValue?.unit ?? 'px';
                return (
                  <CompactDimensionInput
                    value={dimValue?.value}
                    unit={currentUnit}
                    placeholder={selectedType === 'typeScale' ? '16' : selectedType === 'spacingScale' ? '4' : '8'}
                    onValueChange={num => {
                      if (num === undefined) { setInlineValue(undefined); return; }
                      setInlineValue({ value: num, unit: currentUnit });
                    }}
                    onUnitChange={u => setInlineValue({ value: dimValue?.value ?? 0, unit: u })}
                  />
                );
              })()}
              {/* Matching token suggestions */}
              {matchingTokens.length > 0 && (
                <div className="mt-2 border-t border-[var(--color-figma-border)] pt-2">
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)] block mb-1">
                    Tokens with this value — bind one to connect to the token graph:
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {matchingTokens.map(({ path, value: tv }) => (
                      <button
                        key={path}
                        onClick={() => setEditableSourcePath(path)}
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-[var(--color-figma-accent)]/10 text-left group"
                      >
                        {typeExpectsColor && typeof tv === 'string' && (
                          <div
                            className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                            style={{ backgroundColor: swatchBgColor(tv) }}
                            aria-hidden="true"
                          />
                        )}
                        <span className="flex-1 text-[10px] font-mono text-[var(--color-figma-text)] truncate">{path}</span>
                        <span className="text-[9px] text-[var(--color-figma-accent)] opacity-0 group-hover:opacity-100 shrink-0">Use token</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Warning that inline values are not referenceable */}
              <p className="mt-2 text-[9px] text-[var(--color-figma-text-secondary)]">
                This value is stored inline and is not referenceable as a token. Binding a source token above is preferred.
              </p>
            </div>
          )}

          {/* Config */}
          <div className="border border-[var(--color-figma-border)] rounded p-3 bg-[var(--color-figma-bg-secondary)]">
            <span className="block text-[10px] font-medium text-[var(--color-figma-text)] mb-3">{TYPE_LABELS[selectedType]} settings</span>
            {selectedType === 'colorRamp' && <ColorRampConfigEditor config={currentConfig as ColorRampConfig} onChange={cfg => handleConfigChange('colorRamp', cfg)} sourceHex={effectiveSourceHex} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />}
            {selectedType === 'typeScale' && <TypeScaleConfigEditor config={currentConfig as TypeScaleConfig} onChange={cfg => handleConfigChange('typeScale', cfg)} sourceValue={effectiveSourceDim} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />}
            {selectedType === 'spacingScale' && <SpacingScaleConfigEditor config={currentConfig as SpacingScaleConfig} onChange={cfg => handleConfigChange('spacingScale', cfg)} />}
            {selectedType === 'opacityScale' && <OpacityScaleConfigEditor config={currentConfig as OpacityScaleConfig} onChange={cfg => handleConfigChange('opacityScale', cfg)} />}
            {selectedType === 'shadowScale' && <ShadowScaleConfigEditor config={currentConfig as ShadowScaleConfig} onChange={cfg => handleConfigChange('shadowScale', cfg)} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />}
            {selectedType === 'borderRadiusScale' && <BorderRadiusConfigEditor config={currentConfig as BorderRadiusScaleConfig} onChange={cfg => handleConfigChange('borderRadiusScale', cfg)} />}
            {selectedType === 'zIndexScale' && <ZIndexConfigEditor config={currentConfig as ZIndexScaleConfig} onChange={cfg => handleConfigChange('zIndexScale', cfg)} />}
            {selectedType === 'customScale' && <CustomScaleConfigEditor config={currentConfig as CustomScaleConfig} onChange={cfg => handleConfigChange('customScale', cfg)} />}
            {selectedType === 'contrastCheck' && <ContrastCheckConfigEditor config={currentConfig as ContrastCheckConfig} onChange={cfg => handleConfigChange('contrastCheck', cfg)} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />}
            {selectedType === 'accessibleColorPair' && <AccessiblePairConfigEditor config={currentConfig as AccessibleColorPairConfig} onChange={cfg => handleConfigChange('accessibleColorPair', cfg)} />}
            {selectedType === 'darkModeInversion' && <DarkModeInversionConfigEditor config={currentConfig as DarkModeInversionConfig} onChange={cfg => handleConfigChange('darkModeInversion', cfg)} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />}
          </div>

          {/* Preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">
                Preview
                {previewTokens.length > 0 && <span className="ml-1 text-[var(--color-figma-text)]">({previewTokens.length} tokens)</span>}
                {previewBrand && previewTokens.length > 0 && (
                  <span className="ml-1 italic">— sample from &ldquo;{previewBrand}&rdquo;</span>
                )}
              </label>
              <div className="flex items-center gap-2">
                {lockedCount > 0 && (
                  <button onClick={clearAllOverrides} className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] flex items-center gap-1">
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L6 7M6 3l4 4"/><path d="M2 7h4v3H2z"/></svg>
                    Clear {lockedCount} override{lockedCount !== 1 ? 's' : ''}
                  </button>
                )}
                {previewLoading && (
                  <Spinner size="sm" className="text-[var(--color-figma-text-secondary)]" />
                )}
              </div>
            </div>

            {previewError && (
              <div className="text-[10px] text-[var(--color-figma-error)] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-2 py-1.5">{previewError}</div>
            )}

            {!previewError && previewTokens.length > 0 && (
              <div className={`border border-[var(--color-figma-border)] rounded p-2.5 bg-[var(--color-figma-bg-secondary)] transition-opacity duration-150 ${previewLoading ? 'opacity-40' : 'opacity-100'}`}>
                {selectedType === 'contrastCheck' && (
                  <ContrastCheckPreview tokens={previewTokens} config={currentConfig as ContrastCheckConfig} overrides={pendingOverrides} onOverrideChange={handleOverrideChange} onOverrideClear={handleOverrideClear} overwritePaths={overwritePaths} />
                )}
                {selectedType === 'colorRamp' && (
                  <ColorSwatchPreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={handleOverrideChange} onOverrideClear={handleOverrideClear} overwritePaths={overwritePaths} />
                )}
                {selectedType === 'typeScale' && (
                  <TypeScalePreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={handleOverrideChange} onOverrideClear={handleOverrideClear} overwritePaths={overwritePaths} />
                )}
                {selectedType === 'spacingScale' && (
                  <SpacingPreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={handleOverrideChange} onOverrideClear={handleOverrideClear} overwritePaths={overwritePaths} />
                )}
                {selectedType === 'borderRadiusScale' && (
                  <BorderRadiusPreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={handleOverrideChange} onOverrideClear={handleOverrideClear} overwritePaths={overwritePaths} />
                )}
                {selectedType === 'opacityScale' && (
                  <OpacityPreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={handleOverrideChange} onOverrideClear={handleOverrideClear} overwritePaths={overwritePaths} />
                )}
                {selectedType === 'shadowScale' && (
                  <ShadowPreview tokens={previewTokens} config={currentConfig as ShadowScaleConfig} overrides={pendingOverrides} onOverrideChange={handleOverrideChange} onOverrideClear={handleOverrideClear} overwritePaths={overwritePaths} />
                )}
                {(selectedType === 'zIndexScale' || selectedType === 'customScale') && (
                  <GenericPreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={handleOverrideChange} onOverrideClear={handleOverrideClear} overwritePaths={overwritePaths} />
                )}
              </div>
            )}

            {selectedType === 'contrastCheck' && !previewError && !previewLoading && previewTokens.length === 0 && (
              <div className="border border-[var(--color-figma-border)] rounded p-2.5 bg-[var(--color-figma-bg-secondary)]">
                <ContrastCheckPreview tokens={[]} config={currentConfig as ContrastCheckConfig} />
              </div>
            )}

            {selectedType !== 'contrastCheck' && !previewError && !previewLoading && previewTokens.length === 0 && (
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)] rounded px-2 py-2 bg-[var(--color-figma-bg-secondary)]">
                {isMultiBrand
                  ? 'Add a brand row with an input value to see a preview.'
                  : typeNeedsValue && !hasValue
                    ? `Enter a base ${typeExpectsColor ? 'color' : 'value'} above to see a preview.`
                    : 'No preview available.'}
              </div>
            )}
          </div>

          {/* Overwrites diff */}
          {overwrittenEntries.length > 0 && (
            <div>
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1.5">
                Overwrites{' '}
                <span className="text-[var(--color-figma-warning)]">
                  {overwrittenEntries.length} existing token{overwrittenEntries.length !== 1 ? 's' : ''}
                </span>
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

          {/* Target + Name (compact) */}
          <div className="flex flex-col gap-2.5">
            {/* Multi-brand toggle — always visible */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Multi-brand</span>
                {!isMultiBrand && (
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
                    Generate across multiple brands, each writing to its own token set
                  </span>
                )}
              </div>
              <button
                onClick={handleToggleMultiBrand}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                  isMultiBrand
                    ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                    : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                }`}
              >
                {isMultiBrand ? 'Enabled' : 'Off'}
              </button>
            </div>

            {/* Multi-brand input table — shown when enabled */}
            {isMultiBrand && inputTable && (
              <div className="border border-[var(--color-figma-accent)]/30 rounded p-3 bg-[var(--color-figma-bg-secondary)]">
                <InputTableEditor table={inputTable} onChange={setInputTable} />
                <div className="mt-3">
                  <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Target set template</label>
                  <input
                    type="text"
                    value={targetSetTemplate}
                    onChange={e => setTargetSetTemplate(e.target.value)}
                    placeholder="brands/{brand}"
                    className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)] font-mono"
                  />
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">
                    {'{brand}'} is replaced per row — e.g. <span className="font-mono">brands/berry</span>
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Target group</label>
                <input type="text" value={targetGroup} onChange={e => setTargetGroup(e.target.value)} placeholder="e.g. colors.primary"
                  className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)] font-mono ${!targetGroup.trim() ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`} />
              </div>
              {!isMultiBrand && (
                <div className="w-28">
                  <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Set</label>
                  <select value={targetSet} onChange={e => setTargetSet(e.target.value)}
                    className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]">
                    {allSets.map(s => <option key={s} value={s}>{s}</option>)}
                    {allSets.length === 0 && <option value={activeSet}>{activeSet}</option>}
                  </select>
                </div>
              )}
            </div>
            {targetGroup.trim() && (
              <p className="text-[10px] text-[var(--color-figma-text-secondary)] -mt-1">
                Tokens: <span className="font-mono">{targetGroup}.{'{'+'step}'}</span>
              </p>
            )}
            <div>
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Name</label>
              <input type="text" value={name} onChange={e => handleNameChange(e.target.value)}
                placeholder="My generator"
                className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)] ${!name.trim() ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`} />
            </div>
          </div>

          {saveError && <div className="text-[10px] text-[var(--color-figma-error)]">{saveError}</div>}
          {existingTokensError && <div className="text-[10px] text-[var(--color-figma-error)]">{existingTokensError}</div>}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
          {!saving && (() => {
            const missing: string[] = [];
            if (!targetGroup.trim()) missing.push('target group');
            if (!name.trim()) missing.push('name');
            if (!isMultiBrand && typeNeedsValue && !hasValue) missing.push(typeExpectsColor ? 'base color' : 'base value');
            return missing.length > 0 ? (
              <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                {missing.length === 1
                  ? `${missing[0].charAt(0).toUpperCase() + missing[0].slice(1)} is required.`
                  : `Required: ${missing.join(', ')}.`}
              </p>
            ) : null;
          })()}
          <div className="flex gap-2">
          <button onClick={handleClose} className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]">Cancel</button>
          <button onClick={handleSave} disabled={saving || !!existingTokensError || !targetGroup.trim() || !name.trim() || (!isMultiBrand && typeNeedsValue && !hasValue)}
            className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50">
            {isEditing
              ? 'Review & Update'
              : isMultiBrand && inputTable
                ? `Review (${inputTable.rows.filter(r => r.brand.trim()).length} brand${inputTable.rows.filter(r => r.brand.trim()).length !== 1 ? 's' : ''}${previewTokens.length > 0 ? ` × ${previewTokens.length} tokens` : ''})`
                : previewTokens.length > 0
                  ? `Review (${previewTokens.length} tokens)`
                  : 'Review & Create'
            }
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
