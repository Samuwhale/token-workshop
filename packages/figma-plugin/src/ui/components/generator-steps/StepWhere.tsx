/**
 * Step 1 — Where: Target destination for generated tokens.
 * Designers decide WHERE tokens go first (set, group, name).
 */
import type { InputTable, InputTableRow } from '../../hooks/useGenerators';
import { GENERATOR_AUTHORING_CLASSES } from '../generatorAuthoringSurface';

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
    <div className={GENERATOR_AUTHORING_CLASSES.section}>
      <div className={GENERATOR_AUTHORING_CLASSES.fieldStack}>
        <label className={GENERATOR_AUTHORING_CLASSES.summaryLabel}>Input column name</label>
        <input
          value={table.inputKey}
          onChange={e => updateInputKey(e.target.value)}
          placeholder="brandColor"
          className={GENERATOR_AUTHORING_CLASSES.controlMono}
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_20px] gap-2 px-0.5">
          <span className={GENERATOR_AUTHORING_CLASSES.summaryLabel}>Brand</span>
          <span className={GENERATOR_AUTHORING_CLASSES.summaryLabel}>{table.inputKey || 'value'}</span>
          <span className="w-5" />
        </div>
        {table.rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_20px] items-start gap-2">
            <input
              value={row.brand}
              onChange={e => updateRow(i, { brand: e.target.value })}
              placeholder="berry"
              className={GENERATOR_AUTHORING_CLASSES.controlMono}
            />
            <input
              value={String(row.inputs[table.inputKey] ?? '')}
              onChange={e => updateRowInput(i, e.target.value)}
              placeholder="#8B5CF6"
              className={GENERATOR_AUTHORING_CLASSES.controlMono}
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              aria-label="Remove row"
              className="mt-2 w-5 text-center text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] text-[12px] shrink-0 leading-none"
            >×</button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left"
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
    <section className={`${GENERATOR_AUTHORING_CLASSES.root} ${GENERATOR_AUTHORING_CLASSES.section}`}>
      <div className={GENERATOR_AUTHORING_CLASSES.titleBlock}>
        <h3 className={GENERATOR_AUTHORING_CLASSES.title}>Destination</h3>
        <p className={GENERATOR_AUTHORING_CLASSES.description}>
          Choose the generator name, output group, and token set before review.
        </p>
      </div>

      <div className={`${GENERATOR_AUTHORING_CLASSES.sectionCard} ${GENERATOR_AUTHORING_CLASSES.fieldGrid}`}>
        <div className={GENERATOR_AUTHORING_CLASSES.fieldStack}>
          <label className={GENERATOR_AUTHORING_CLASSES.summaryLabel}>Output path</label>
          <input
            type="text"
            value={targetGroup}
            onChange={e => onTargetGroupChange(e.target.value)}
            placeholder="colors.primary"
            autoFocus
            className={`${GENERATOR_AUTHORING_CLASSES.controlMono} ${
              !targetGroup.trim() ? 'border-[var(--color-figma-error)]/50' : 'border-[var(--color-figma-border)]'
            }`}
          />
          {targetGroup.trim() && (
            <p className={GENERATOR_AUTHORING_CLASSES.description}>
              <span className="font-mono text-[var(--color-figma-text)]">{targetGroup}.<span className="text-[var(--color-figma-accent)]">{'{'}</span>step<span className="text-[var(--color-figma-accent)]">{'}'}</span></span>
            </p>
          )}
        </div>
        <div className={GENERATOR_AUTHORING_CLASSES.fieldStack}>
          <label className={GENERATOR_AUTHORING_CLASSES.summaryLabel}>Generator name</label>
          <input
            type="text"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            placeholder="Primary colors"
            className={`${GENERATOR_AUTHORING_CLASSES.control} ${
              !name.trim() ? 'border-[var(--color-figma-error)]/50' : 'border-[var(--color-figma-border)]'
            }`}
          />
        </div>
      </div>

      <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
        <div className={GENERATOR_AUTHORING_CLASSES.fieldGrid}>
          {!isMultiBrand && (
            <div className={GENERATOR_AUTHORING_CLASSES.fieldStack}>
              <label className={GENERATOR_AUTHORING_CLASSES.summaryLabel}>Token set</label>
              <select
                value={targetSet}
                onChange={e => onTargetSetChange(e.target.value)}
                className={GENERATOR_AUTHORING_CLASSES.control}
              >
                {allSets.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          <div className={GENERATOR_AUTHORING_CLASSES.fieldStack}>
            <span className={GENERATOR_AUTHORING_CLASSES.summaryLabel}>Publishing mode</span>
            <button
              type="button"
              onClick={onToggleMultiBrand}
              className={`min-h-[36px] rounded-lg border px-3 text-left text-[11px] transition-colors ${
                isMultiBrand
                  ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                  : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
              }`}
            >
              {isMultiBrand ? 'Multi-brand enabled' : 'Single set'}
            </button>
          </div>
        </div>
        <p className={GENERATOR_AUTHORING_CLASSES.description}>
          {isMultiBrand
            ? 'Generate the same scale into multiple brand-specific token sets.'
            : 'Switch to multi-brand when this generator should publish one scale across several sets.'}
        </p>
      </div>

      {isMultiBrand && inputTable && (
        <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
          <div className={GENERATOR_AUTHORING_CLASSES.titleBlock}>
            <div className={GENERATOR_AUTHORING_CLASSES.title}>Brand rows</div>
            <p className={GENERATOR_AUTHORING_CLASSES.description}>
              Each row publishes the generator into a distinct set template.
            </p>
          </div>
          <InputTableEditor table={inputTable} onChange={onInputTableChange} />
          <div className={GENERATOR_AUTHORING_CLASSES.fieldStack}>
            <label className={GENERATOR_AUTHORING_CLASSES.summaryLabel}>Set template</label>
            <input
              type="text"
              value={targetSetTemplate}
              onChange={e => onTargetSetTemplateChange(e.target.value)}
              placeholder="brands/{brand}"
              className={GENERATOR_AUTHORING_CLASSES.controlMono}
            />
            <p className={GENERATOR_AUTHORING_CLASSES.description}>
              {'{brand}'} replaced per row
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
