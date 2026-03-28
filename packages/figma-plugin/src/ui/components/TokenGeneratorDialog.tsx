import { SemanticMappingDialog } from './SemanticMappingDialog';
import { ValueDiff } from './ValueDiff';
import type {
  TokenGenerator,
  GeneratorType,
  ColorRampConfig,
  TypeScaleConfig,
  SpacingScaleConfig,
  OpacityScaleConfig,
  BorderRadiusScaleConfig,
  ZIndexScaleConfig,
  CustomScaleConfig,
  ContrastCheckConfig,
  GeneratorTemplate,
  InputTable,
  InputTableRow,
} from '../hooks/useGenerators';

import { ColorRampConfigEditor, ColorSwatchPreview } from './generators/ColorRampGenerator';
import { TypeScaleConfigEditor, TypeScalePreview } from './generators/TypeScaleGenerator';
import { SpacingScaleConfigEditor, SpacingPreview } from './generators/SpacingScaleGenerator';
import { OpacityScaleConfigEditor, OpacityPreview } from './generators/OpacityScaleGenerator';
import { BorderRadiusConfigEditor } from './generators/BorderRadiusGenerator';
import { ZIndexConfigEditor } from './generators/ZIndexGenerator';
import { CustomScaleConfigEditor } from './generators/CustomScaleGenerator';
import { ContrastCheckConfigEditor, ContrastCheckPreview } from './generators/ContrastCheckGenerator';
import { GenericPreview } from './generators/generatorShared';
import { ALL_TYPES, SOURCE_REQUIRED_TYPES, STANDALONE_TYPES } from './generators/generatorUtils';
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
}

export const TYPE_LABELS: Record<GeneratorType, string> = {
  colorRamp: 'Color Ramp',
  typeScale: 'Type Scale',
  spacingScale: 'Spacing Scale',
  opacityScale: 'Opacity Scale',
  borderRadiusScale: 'Border Radius',
  zIndexScale: 'Z-Index',
  customScale: 'Custom',
  accessibleColorPair: 'Accessible Pair',
  darkModeInversion: 'Dark Mode',
  responsiveScale: 'Responsive',
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
          <span className="w-24 text-[9px] text-[var(--color-figma-text-secondary)]">Brand</span>
          <span className="flex-1 text-[9px] text-[var(--color-figma-text-secondary)]">{table.inputKey || 'value'}</span>
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
}: TokenGeneratorDialogProps) {
  const {
    isEditing,
    isMultiBrand,
    typeNeedsSource,
    hasSource,
    availableTypes,
    recommendedType,
    currentConfig,
    lockedCount,
    selectedType,
    name,
    targetSet,
    targetGroup,
    inputTable,
    targetSetTemplate,
    pendingOverrides,
    previewTokens,
    previewLoading,
    previewError,
    overwrittenEntries,
    saving,
    saveError,
    showSemanticMapping,
    savedTokens,
    savedTargetGroup,
    handleTypeChange,
    handleNameChange,
    setTargetSet,
    setTargetGroup,
    setTargetSetTemplate,
    handleConfigChange,
    handleToggleMultiBrand,
    setInputTable,
    handleOverrideChange,
    handleOverrideClear,
    clearAllOverrides,
    handleSave,
    handleSemanticMappingClose,
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
  });

  const handleClose = () => {
    if (isDirtyRef.current && !window.confirm('You have unsaved changes. Discard and close?')) return;
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

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
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
                {isEditing ? 'Edit Generator' : template ? template.label : 'New Token Generator'}
              </span>
              {sourceTokenPath ? (
                <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-mono truncate max-w-[220px]">
                  {sourceTokenPath}
                </span>
              ) : (
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Standalone generator</span>
              )}
            </div>
          </div>
          <button onClick={handleClose} aria-label="Close" className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

          {/* Type selector */}
          <div>
            <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1.5">
              Generator type
              {recommendedType && (
                <span className="ml-1 text-[var(--color-figma-accent)]">(recommended: {TYPE_LABELS[recommendedType]})</span>
              )}
            </label>
            <div className="grid grid-cols-2 gap-1">
              {ALL_TYPES.map(type => {
                const disabled = !availableTypes.includes(type);
                return (
                  <button
                    key={type}
                    onClick={() => !disabled && handleTypeChange(type)}
                    disabled={disabled}
                    className={`px-2 py-1.5 rounded text-[10px] font-medium border transition-colors text-left flex items-center gap-1.5 ${
                      disabled
                        ? 'opacity-30 cursor-not-allowed border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]'
                        : selectedType === type
                          ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                          : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                    }`}
                  >
                    {type === recommendedType && <span className="text-[8px] leading-none">★</span>}
                    {TYPE_LABELS[type]}
                    {STANDALONE_TYPES.includes(type) && <span className="text-[8px] ml-auto opacity-60">standalone</span>}
                  </button>
                );
              })}
            </div>
            {typeNeedsSource && !hasSource && (
              <p className="text-[9px] text-[var(--color-figma-error)] mt-1">
                This type requires a source token. Open from a token's editor, or switch to a standalone type.
              </p>
            )}
          </div>

          {/* Config */}
          <div className="border border-[var(--color-figma-border)] rounded p-3 bg-[var(--color-figma-bg-secondary)]">
            <span className="block text-[10px] font-medium text-[var(--color-figma-text)] mb-3">{TYPE_LABELS[selectedType]} settings</span>
            {selectedType === 'colorRamp' && <ColorRampConfigEditor config={currentConfig as ColorRampConfig} onChange={cfg => handleConfigChange('colorRamp', cfg)} />}
            {selectedType === 'typeScale' && <TypeScaleConfigEditor config={currentConfig as TypeScaleConfig} onChange={cfg => handleConfigChange('typeScale', cfg)} />}
            {selectedType === 'spacingScale' && <SpacingScaleConfigEditor config={currentConfig as SpacingScaleConfig} onChange={cfg => handleConfigChange('spacingScale', cfg)} />}
            {selectedType === 'opacityScale' && <OpacityScaleConfigEditor config={currentConfig as OpacityScaleConfig} onChange={cfg => handleConfigChange('opacityScale', cfg)} />}
            {selectedType === 'borderRadiusScale' && <BorderRadiusConfigEditor config={currentConfig as BorderRadiusScaleConfig} onChange={cfg => handleConfigChange('borderRadiusScale', cfg)} />}
            {selectedType === 'zIndexScale' && <ZIndexConfigEditor config={currentConfig as ZIndexScaleConfig} onChange={cfg => handleConfigChange('zIndexScale', cfg)} />}
            {selectedType === 'customScale' && <CustomScaleConfigEditor config={currentConfig as CustomScaleConfig} onChange={cfg => handleConfigChange('customScale', cfg)} />}
            {selectedType === 'contrastCheck' && <ContrastCheckConfigEditor config={currentConfig as ContrastCheckConfig} onChange={cfg => handleConfigChange('contrastCheck', cfg)} />}
          </div>

          {/* Preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">
                Preview
                {previewTokens.length > 0 && <span className="ml-1 text-[var(--color-figma-text)]">({previewTokens.length} tokens)</span>}
              </label>
              <div className="flex items-center gap-2">
                {lockedCount > 0 && (
                  <button onClick={clearAllOverrides} className="text-[9px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] flex items-center gap-1">
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L6 7M6 3l4 4"/><path d="M2 7h4v3H2z"/></svg>
                    Clear {lockedCount} override{lockedCount !== 1 ? 's' : ''}
                  </button>
                )}
                {previewLoading && (
                  <svg className="w-3 h-3 animate-spin text-[var(--color-figma-text-secondary)]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
              </div>
            </div>

            {previewError && (
              <div className="text-[10px] text-[var(--color-figma-error)] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-2 py-1.5">{previewError}</div>
            )}

            {/* Contrast check preview is always shown (even when 0 tokens, to guide the user) */}
            {selectedType === 'contrastCheck' && (
              <div className="border border-[var(--color-figma-border)] rounded p-2.5 bg-[var(--color-figma-bg-secondary)]">
                <ContrastCheckPreview tokens={previewTokens} config={currentConfig as ContrastCheckConfig} />
              </div>
            )}

            {selectedType !== 'contrastCheck' && !previewError && previewTokens.length > 0 && (
              <div className="border border-[var(--color-figma-border)] rounded p-2.5 bg-[var(--color-figma-bg-secondary)]">
                {selectedType === 'colorRamp' && (
                  <ColorSwatchPreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={handleOverrideChange} onOverrideClear={handleOverrideClear} />
                )}
                {selectedType === 'typeScale' && (
                  <TypeScalePreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={handleOverrideChange} onOverrideClear={handleOverrideClear} />
                )}
                {(selectedType === 'spacingScale' || selectedType === 'borderRadiusScale') && (
                  <SpacingPreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={handleOverrideChange} onOverrideClear={handleOverrideClear} />
                )}
                {selectedType === 'opacityScale' && (
                  <OpacityPreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={handleOverrideChange} onOverrideClear={handleOverrideClear} />
                )}
                {(selectedType === 'zIndexScale' || selectedType === 'customScale') && (
                  <GenericPreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={handleOverrideChange} onOverrideClear={handleOverrideClear} />
                )}
              </div>
            )}

            {selectedType !== 'contrastCheck' && !previewError && !previewLoading && previewTokens.length === 0 && (
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)] rounded px-2 py-2 bg-[var(--color-figma-bg-secondary)]">
                {isMultiBrand ? 'Preview unavailable in multi-brand mode.' : 'No preview available.'}
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
                    <span className="text-[9px] font-mono text-[var(--color-figma-text-secondary)] truncate" title={entry.path}>
                      {entry.path}
                    </span>
                    <ValueDiff type={entry.type} before={entry.oldValue} after={entry.newValue} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Multi-brand input table */}
          <div className="border border-[var(--color-figma-border)] rounded p-3 bg-[var(--color-figma-bg-secondary)]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Multi-brand inputs</span>
              <button
                onClick={handleToggleMultiBrand}
                className="text-[9px] text-[var(--color-figma-accent)] hover:underline"
              >
                {inputTable ? 'Disable' : 'Enable'}
              </button>
            </div>
            {!inputTable && (
              <p className="text-[9px] text-[var(--color-figma-text-secondary)]">
                Run this generator for multiple brands, each writing to its own token set.
              </p>
            )}
            {inputTable && <InputTableEditor table={inputTable} onChange={setInputTable} />}
          </div>

          {/* Target */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Target</span>
            {isMultiBrand ? (
              <div>
                <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Target set template</label>
                <input
                  type="text"
                  value={targetSetTemplate}
                  onChange={e => setTargetSetTemplate(e.target.value)}
                  placeholder="brands/{brand}"
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] font-mono"
                />
                <p className="text-[9px] text-[var(--color-figma-text-secondary)] mt-0.5">
                  {'{brand}'} is replaced with each row's brand slug — e.g. <span className="font-mono">brands/berry</span>
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Target set</label>
                <select value={targetSet} onChange={e => setTargetSet(e.target.value)}
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]">
                  {allSets.map(s => <option key={s} value={s}>{s}</option>)}
                  {allSets.length === 0 && <option value={activeSet}>{activeSet}</option>}
                </select>
              </div>
            )}
            <div>
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Target group path</label>
              <input type="text" value={targetGroup} onChange={e => setTargetGroup(e.target.value)} placeholder="e.g. spacing"
                className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] font-mono ${!targetGroup.trim() ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`} />
              <p className="text-[9px] text-[var(--color-figma-text-secondary)] mt-0.5">
                Tokens: <span className="font-mono">{targetGroup || '…'}.{'{'+'step}'}</span>
              </p>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Generator name</label>
            <input type="text" value={name} onChange={e => handleNameChange(e.target.value)}
              placeholder="My generator"
              className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] ${!name.trim() ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`} />
          </div>

          {saveError && <div className="text-[10px] text-[var(--color-figma-error)]">{saveError}</div>}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
          {!saving && (() => {
            const missing: string[] = [];
            if (!targetGroup.trim()) missing.push('target group path');
            if (!name.trim()) missing.push('generator name');
            if (!isMultiBrand && typeNeedsSource && !hasSource) missing.push('source token');
            return missing.length > 0 ? (
              <p className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                {missing.length === 1
                  ? `${missing[0].charAt(0).toUpperCase() + missing[0].slice(1)} is required.`
                  : `Required: ${missing.join(', ')}.`}
              </p>
            ) : null;
          })()}
          <div className="flex gap-2">
          <button onClick={handleClose} className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]">Cancel</button>
          <button onClick={handleSave} disabled={saving || !targetGroup.trim() || !name.trim() || (!isMultiBrand && typeNeedsSource && !hasSource)}
            className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50">
            {saving
              ? (isEditing ? 'Saving…' : 'Creating…')
              : isEditing
                ? 'Update generator'
                : isMultiBrand && inputTable
                  ? `Create (${inputTable.rows.length} brand${inputTable.rows.length !== 1 ? 's' : ''})`
                  : previewTokens.length > 0
                    ? `Create (${previewTokens.length} tokens)`
                    : 'Create generator'
            }
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
