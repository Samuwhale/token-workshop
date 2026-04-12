/**
 * Step 1 — Where: Target destination for generated tokens.
 * Designers decide WHERE tokens go first (set, group, name).
 * Multi-brand configuration and semantic aliases also live here.
 */
import { useMemo } from 'react';
import type {
  InputTable,
  InputTableRow,
  GeneratorType,
  GeneratedTokenResult,
} from '../../hooks/useGenerators';
import { SEMANTIC_PATTERNS } from '../../shared/semanticPatterns';

// ---------------------------------------------------------------------------
// InputTableEditor (moved from TokenGeneratorDialog)
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

// ---------------------------------------------------------------------------
// StepWhere
// ---------------------------------------------------------------------------

export interface StepWhereProps {
  name: string;
  targetSet: string;
  targetGroup: string;
  allSets: string[];
  isMultiBrand: boolean;
  inputTable: InputTable | undefined;
  targetSetTemplate: string;
  isEditing: boolean;
  onNameChange: (v: string) => void;
  onTargetSetChange: (v: string) => void;
  onTargetGroupChange: (v: string) => void;
  onToggleMultiBrand: () => void;
  onInputTableChange: (t: InputTable) => void;
  onTargetSetTemplateChange: (v: string) => void;
  // Semantic aliases
  selectedType: GeneratorType;
  previewTokens: GeneratedTokenResult[];
  hasInterceptHandler: boolean;
  semanticEnabled: boolean;
  semanticPrefix: string;
  semanticMappings: Array<{ semantic: string; step: string }>;
  selectedSemanticPatternId: string | null;
  onSemanticEnabledChange: (v: boolean) => void;
  onSemanticPrefixChange: (v: string) => void;
  onSemanticMappingsChange: (v: Array<{ semantic: string; step: string }>) => void;
  onSemanticPatternSelect: (id: string | null) => void;
}

export function StepWhere({
  name,
  targetSet,
  targetGroup,
  allSets,
  isMultiBrand,
  inputTable,
  targetSetTemplate,
  isEditing,
  onNameChange,
  onTargetSetChange,
  onTargetGroupChange,
  onToggleMultiBrand,
  onInputTableChange,
  onTargetSetTemplateChange,
  selectedType,
  previewTokens,
  hasInterceptHandler,
  semanticEnabled,
  semanticPrefix,
  semanticMappings,
  selectedSemanticPatternId,
  onSemanticEnabledChange,
  onSemanticPrefixChange,
  onSemanticMappingsChange,
  onSemanticPatternSelect,
}: StepWhereProps) {
  // Semantic alias logic
  const showSemanticSection = !isEditing && (previewTokens.length > 0 || isMultiBrand) && !hasInterceptHandler;
  const availableSteps = useMemo(() => previewTokens.map(t => String(t.stepName)), [previewTokens]);
  const suggestedPatterns = useMemo(() => SEMANTIC_PATTERNS.filter(p => p.applicableTo.includes(selectedType)), [selectedType]);

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
      <h3 className="text-[11px] font-semibold text-[var(--color-figma-text)]">Destination</h3>

      {/* Output path + generator name — compact two-column at wider viewports */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="block text-[10px] font-medium text-[var(--color-figma-text)] mb-1">Output path</label>
          <input
            type="text"
            value={targetGroup}
            onChange={e => onTargetGroupChange(e.target.value)}
            placeholder="colors.primary"
            autoFocus
            className={`w-full px-2.5 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] font-mono focus-visible:border-[var(--color-figma-accent)] ${
              !targetGroup.trim() ? 'border-[var(--color-figma-error)]/50' : 'border-[var(--color-figma-border)]'
            }`}
          />
          {targetGroup.trim() && (
            <p className="mt-0.5 text-[9px] text-[var(--color-figma-text-secondary)]">
              <span className="font-mono text-[var(--color-figma-text)]">{targetGroup}.<span className="text-[var(--color-figma-accent)]">{'{'}</span>step<span className="text-[var(--color-figma-accent)]">{'}'}</span></span>
            </p>
          )}
        </div>
        <div className="sm:w-40">
          <label className="block text-[10px] font-medium text-[var(--color-figma-text)] mb-1">Generator name</label>
          <input
            type="text"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            placeholder="Primary colors"
            className={`w-full px-2.5 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)] ${
              !name.trim() ? 'border-[var(--color-figma-error)]/50' : 'border-[var(--color-figma-border)]'
            }`}
          />
        </div>
      </div>

      {/* Token set + multi-brand — compact row */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-end gap-3">
          {!isMultiBrand && (
            <div className="flex-1 min-w-0">
              <label className="block text-[10px] font-medium text-[var(--color-figma-text)] mb-1">Token set</label>
              <select
                value={targetSet}
                onChange={e => onTargetSetChange(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
              >
                {allSets.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          <button
            onClick={onToggleMultiBrand}
            className={`shrink-0 text-[10px] px-2.5 py-1.5 rounded border transition-colors ${
              isMultiBrand
                ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
            }`}
          >
            {isMultiBrand ? 'Multi-brand on' : 'Multi-brand'}
          </button>
        </div>
        {!isMultiBrand && (
          <p className="text-[9px] text-[var(--color-figma-text-tertiary)]">
            Generate the same scale into multiple brand token sets
          </p>
        )}
      </div>

      {/* Multi-brand config — revealed when toggled */}
      {isMultiBrand && inputTable && (
        <div className="border border-[var(--color-figma-border)] rounded-lg p-3 bg-[var(--color-figma-bg-secondary)]">
          <InputTableEditor table={inputTable} onChange={onInputTableChange} />
          <div className="mt-3">
            <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Set template</label>
            <input
              type="text"
              value={targetSetTemplate}
              onChange={e => onTargetSetTemplateChange(e.target.value)}
              placeholder="brands/{brand}"
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)] font-mono"
            />
            <p className="text-[9px] text-[var(--color-figma-text-secondary)] mt-0.5">
              {'{brand}'} replaced per row
            </p>
          </div>
        </div>
      )}

      {/* Semantic aliases — configure alias tokens that map semantic names to scale steps */}
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
    </div>
  );
}
