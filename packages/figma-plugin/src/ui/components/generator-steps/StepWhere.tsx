/**
 * Step 1 — Where: Target destination for generated tokens.
 * Designers decide WHERE tokens go first (set, group, name).
 */
import type { InputTable, InputTableRow } from '../../hooks/useGenerators';

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
  onNameChange: (v: string) => void;
  onTargetSetChange: (v: string) => void;
  onTargetGroupChange: (v: string) => void;
  onToggleMultiBrand: () => void;
  onInputTableChange: (t: InputTable) => void;
  onTargetSetTemplateChange: (v: string) => void;
}

export function StepWhere({
  name,
  targetSet,
  targetGroup,
  allSets,
  isMultiBrand,
  inputTable,
  targetSetTemplate,
  onNameChange,
  onTargetSetChange,
  onTargetGroupChange,
  onToggleMultiBrand,
  onInputTableChange,
  onTargetSetTemplateChange,
}: StepWhereProps) {
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
    </div>
  );
}
