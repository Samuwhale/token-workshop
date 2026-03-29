import { useMemo, useState } from 'react';
import { Spinner } from './Spinner';
import { ConfirmModal } from './ConfirmModal';
import { SemanticMappingDialog } from './SemanticMappingDialog';
import { ValueDiff } from './ValueDiff';
import { swatchBgColor } from '../shared/colorUtils';
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
import { GenericPreview } from './generators/generatorShared';
import { PRIMARY_TYPES, ADVANCED_TYPES, VALUE_REQUIRED_TYPES, STANDALONE_TYPES } from './generators/generatorUtils';
import { useGeneratorDialog } from '../hooks/useGeneratorDialog';

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
  existingGenerator?: TokenGenerator;
  /** Pre-fill from a quick-start template */
  template?: GeneratorTemplate;
  /** When provided, shows a back arrow to return to the previous step (e.g. template picker) */
  onBack?: () => void;
  onClose: () => void;
  onSaved: (info?: { targetGroup: string }) => void;
  /** When provided, fires with semantic mapping data instead of showing SemanticMappingDialog */
  onInterceptSemanticMapping?: (data: { tokens: import('../hooks/useGenerators').GeneratedTokenResult[]; targetGroup: string; targetSet: string; generatorType: import('../hooks/useGenerators').GeneratorType }) => void;
}

export const TYPE_LABELS: Record<GeneratorType, string> = {
  colorRamp: 'Color Ramp',
  typeScale: 'Type Scale',
  spacingScale: 'Spacing Scale',
  opacityScale: 'Opacity Scale',
  borderRadiusScale: 'Border Radius',
  zIndexScale: 'Z-Index',
  shadowScale: 'Shadow Scale',
  customScale: 'Custom',
  accessibleColorPair: 'Accessible Pair',
  darkModeInversion: 'Dark Mode',
  contrastCheck: 'Contrast Check',
};

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
          className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono outline-none focus:border-[var(--color-figma-accent)]"
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
              className="w-24 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono outline-none focus:border-[var(--color-figma-accent)]"
            />
            <input
              value={String(row.inputs[table.inputKey] ?? '')}
              onChange={e => updateRowInput(i, e.target.value)}
              placeholder="#8B5CF6"
              className="flex-1 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono outline-none focus:border-[var(--color-figma-accent)]"
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
  existingGenerator,
  template,
  onBack,
  onClose,
  onSaved,
  onInterceptSemanticMapping,
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
    inlineValue,
    inputTable,
    targetSetTemplate,
    pendingOverrides,
    previewTokens,
    previewLoading,
    previewError,
    previewBrand,
    overwrittenEntries,
    existingTokensError,
    saving,
    saveError,
    showSemanticMapping,
    savedTokens,
    savedTargetGroup,
    showConfirmation,
    overwritePendingPaths,
    handleTypeChange,
    handleNameChange,
    setTargetSet,
    setTargetGroup,
    setTargetSetTemplate,
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
    handleSemanticMappingClose,
    handleOverwriteConfirm,
    handleOverwriteCancel,
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
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(() => isMultiBrand);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const handleClose = () => {
    if (isDirtyRef.current) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  };

  if (showSemanticMapping) {
    return (
      <SemanticMappingDialog
        serverUrl={serverUrl}
        generatedTokens={savedTokens}
        generatorType={selectedType}
        targetGroup={savedTargetGroup}
        targetSet={targetSet}
        onClose={handleSemanticMappingClose}
        onCreated={handleSemanticMappingClose}
      />
    );
  }

  if (showConfirmation) {
    const newTokens = previewTokens.filter(pt => !overwritePaths.has(pt.path));
    // For multi-brand, we don't have previewTokens — show a summary instead
    const hasPreview = previewTokens.length > 0;

    return (
      <>
      {overwritePendingPaths.length > 0 && (
        <ConfirmModal
          title={`${overwritePendingPaths.length} manually edited token${overwritePendingPaths.length !== 1 ? 's' : ''} will be overwritten`}
          description="The following tokens have been manually edited since the last generator run and will be replaced:"
          confirmLabel="Overwrite"
          cancelLabel="Cancel"
          danger
          wide
          onConfirm={handleOverwriteConfirm}
          onCancel={handleOverwriteCancel}
        >
          <div className="mt-2 max-h-[160px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2">
            {overwritePendingPaths.map((p: string) => (
              <div key={p} className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] py-0.5 truncate" title={p}>
                {p}
              </div>
            ))}
          </div>
        </ConfirmModal>
      )}
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
                  Review Changes
                </span>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {name} → {targetGroup}.* in {isMultiBrand ? 'multi-brand' : targetSet}
                </span>
              </div>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
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
              {hasPreview && newTokens.length === 0 && overwrittenEntries.length === 0 && (
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

            {saveError && <div className="text-[10px] text-[var(--color-figma-error)]">{saveError}</div>}
          </div>

          {/* Footer */}
          <div className="flex gap-2 p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
            <button onClick={handleCancelConfirmation} className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]">
              Back
            </button>
            <button onClick={handleConfirmSave} disabled={saving}
              className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50">
              {saving
                ? (isEditing ? 'Saving…' : 'Creating…')
                : isEditing
                  ? 'Confirm & Update'
                  : 'Confirm & Create'
              }
            </button>
          </div>
        </div>
      </div>
      </>
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
              {sourceTokenPath ? (
                <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-mono truncate max-w-[220px]">
                  Source: {sourceTokenPath}
                </span>
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
            <button
              onClick={() => setShowAdvancedTypes(v => !v)}
              className="mt-1.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] flex items-center gap-1"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className={`transition-transform ${showAdvancedTypes ? 'rotate-90' : ''}`}>
                <path d="M2 1l4 3-4 3" />
              </svg>
              Advanced
              {ADVANCED_TYPES.includes(selectedType) && !showAdvancedTypes && (
                <span className="text-[var(--color-figma-accent)] ml-1">({TYPE_LABELS[selectedType]})</span>
              )}
            </button>
            {showAdvancedTypes && (
              <div className="grid grid-cols-2 gap-1 mt-1">
                {ADVANCED_TYPES.map(typeButton)}
              </div>
            )}
          </div>

          {/* Inline base value — shown when no source token is bound AND type needs a value */}
          {!hasSource && typeNeedsValue && (
            <div className="border border-[var(--color-figma-border)] rounded p-3 bg-[var(--color-figma-bg-secondary)]">
              <span className="block text-[10px] font-medium text-[var(--color-figma-text)] mb-2">Base value</span>
              {typeExpectsColor && (
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded border border-[var(--color-figma-border)] shrink-0 cursor-pointer relative overflow-hidden"
                    style={{ backgroundColor: typeof inlineValue === 'string' && /^#[0-9a-f]{3,8}$/i.test(inlineValue) ? inlineValue : '#808080' }}
                  >
                    <input
                      type="color"
                      value={typeof inlineValue === 'string' && /^#[0-9a-f]{6}$/i.test(inlineValue) ? inlineValue : '#808080'}
                      onChange={e => setInlineValue(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      aria-label="Pick base color"
                    />
                  </div>
                  <input
                    type="text"
                    value={typeof inlineValue === 'string' ? inlineValue : ''}
                    onChange={e => setInlineValue(e.target.value)}
                    placeholder="#6366F1"
                    className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono outline-none focus:border-[var(--color-figma-accent)]"
                  />
                </div>
              )}
              {typeExpectsDimension && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={typeof inlineValue === 'object' && inlineValue !== null && 'value' in (inlineValue as Record<string, unknown>) ? (inlineValue as { value: number }).value : ''}
                    onChange={e => {
                      const num = parseFloat(e.target.value);
                      if (!isNaN(num)) {
                        const existing = typeof inlineValue === 'object' && inlineValue !== null ? inlineValue as { unit?: string } : {};
                        setInlineValue({ value: num, unit: existing.unit || 'px' });
                      } else if (e.target.value === '') {
                        setInlineValue(undefined);
                      }
                    }}
                    placeholder={selectedType === 'typeScale' ? '16' : selectedType === 'spacingScale' ? '4' : '8'}
                    className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono outline-none focus:border-[var(--color-figma-accent)]"
                  />
                  <div className="flex gap-0.5">
                    {(['px', 'rem'] as const).map(u => (
                      <button
                        key={u}
                        onClick={() => {
                          const existing = typeof inlineValue === 'object' && inlineValue !== null && 'value' in (inlineValue as Record<string, unknown>) ? (inlineValue as { value: number }) : { value: 0 };
                          setInlineValue({ ...existing, unit: u });
                        }}
                        className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                          (typeof inlineValue === 'object' && inlineValue !== null && (inlineValue as { unit?: string }).unit === u) || (!inlineValue && u === 'px')
                            ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                            : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                        }`}
                      >{u}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Config */}
          <div className="border border-[var(--color-figma-border)] rounded p-3 bg-[var(--color-figma-bg-secondary)]">
            <span className="block text-[10px] font-medium text-[var(--color-figma-text)] mb-3">{TYPE_LABELS[selectedType]} settings</span>
            {selectedType === 'colorRamp' && <ColorRampConfigEditor config={currentConfig as ColorRampConfig} onChange={cfg => handleConfigChange('colorRamp', cfg)} sourceHex={effectiveSourceHex} />}
            {selectedType === 'typeScale' && <TypeScaleConfigEditor config={currentConfig as TypeScaleConfig} onChange={cfg => handleConfigChange('typeScale', cfg)} sourceValue={effectiveSourceDim} />}
            {selectedType === 'spacingScale' && <SpacingScaleConfigEditor config={currentConfig as SpacingScaleConfig} onChange={cfg => handleConfigChange('spacingScale', cfg)} />}
            {selectedType === 'opacityScale' && <OpacityScaleConfigEditor config={currentConfig as OpacityScaleConfig} onChange={cfg => handleConfigChange('opacityScale', cfg)} />}
            {selectedType === 'shadowScale' && <ShadowScaleConfigEditor config={currentConfig as ShadowScaleConfig} onChange={cfg => handleConfigChange('shadowScale', cfg)} />}
            {selectedType === 'borderRadiusScale' && <BorderRadiusConfigEditor config={currentConfig as BorderRadiusScaleConfig} onChange={cfg => handleConfigChange('borderRadiusScale', cfg)} />}
            {selectedType === 'zIndexScale' && <ZIndexConfigEditor config={currentConfig as ZIndexScaleConfig} onChange={cfg => handleConfigChange('zIndexScale', cfg)} />}
            {selectedType === 'customScale' && <CustomScaleConfigEditor config={currentConfig as CustomScaleConfig} onChange={cfg => handleConfigChange('customScale', cfg)} />}
            {selectedType === 'contrastCheck' && <ContrastCheckConfigEditor config={currentConfig as ContrastCheckConfig} onChange={cfg => handleConfigChange('contrastCheck', cfg)} />}
            {selectedType === 'accessibleColorPair' && <AccessiblePairConfigEditor config={currentConfig as AccessibleColorPairConfig} onChange={cfg => handleConfigChange('accessibleColorPair', cfg)} />}
            {selectedType === 'darkModeInversion' && <DarkModeInversionConfigEditor config={currentConfig as DarkModeInversionConfig} onChange={cfg => handleConfigChange('darkModeInversion', cfg)} />}
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
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Target group</label>
                <input type="text" value={targetGroup} onChange={e => setTargetGroup(e.target.value)} placeholder="e.g. colors.primary"
                  className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] font-mono ${!targetGroup.trim() ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`} />
              </div>
              {!isMultiBrand && (
                <div className="w-28">
                  <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Set</label>
                  <select value={targetSet} onChange={e => setTargetSet(e.target.value)}
                    className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]">
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
                className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] ${!name.trim() ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`} />
            </div>
          </div>

          {/* Advanced options (multi-brand) — collapsible */}
          <div>
            <button
              onClick={() => setShowAdvancedOptions(v => !v)}
              className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] flex items-center gap-1"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className={`transition-transform ${showAdvancedOptions ? 'rotate-90' : ''}`}>
                <path d="M2 1l4 3-4 3" />
              </svg>
              Advanced options
              {isMultiBrand && !showAdvancedOptions && (
                <span className="text-[var(--color-figma-accent)] ml-1">(multi-brand active)</span>
              )}
            </button>
            {showAdvancedOptions && (
              <div className="mt-2 border border-[var(--color-figma-border)] rounded p-3 bg-[var(--color-figma-bg-secondary)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Multi-theme mode</span>
                  <button
                    onClick={handleToggleMultiBrand}
                    className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
                  >
                    {inputTable ? 'Disable' : 'Enable'}
                  </button>
                </div>
                {!inputTable && (
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    Run this generator across multiple themes, each writing to its own token set.
                  </p>
                )}
                {inputTable && (
                  <>
                    <InputTableEditor table={inputTable} onChange={setInputTable} />
                    <div className="mt-2">
                      <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Target set template</label>
                      <input
                        type="text"
                        value={targetSetTemplate}
                        onChange={e => setTargetSetTemplate(e.target.value)}
                        placeholder="brands/{brand}"
                        className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] font-mono"
                      />
                      <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">
                        {'{brand}'} is replaced per row — e.g. <span className="font-mono">brands/berry</span>
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
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
