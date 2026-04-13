/**
 * Step 1 — Where: Target destination for generated tokens.
 * Designers decide WHERE tokens go first (set, group, name).
 */
import type { InputTable, InputTableRow } from '../../hooks/useGenerators';
import { AUTHORING } from '../../shared/editorClasses';

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
    <div className={AUTHORING.generatorSection}>
      <div className={AUTHORING.generatorFieldStack}>
        <label htmlFor="step-where-input-column" className={AUTHORING.generatorSummaryLabel}>Input column name</label>
        <input
          id="step-where-input-column"
          value={table.inputKey}
          onChange={e => updateInputKey(e.target.value)}
          placeholder="brandColor"
          className={AUTHORING.generatorControlMono}
        />
      </div>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_20px] gap-2 px-0.5">
          <span className={AUTHORING.generatorSummaryLabel}>Brand</span>
          <span className={AUTHORING.generatorSummaryLabel}>{table.inputKey || 'value'}</span>
          <span className="w-5" />
        </div>
        {table.rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_20px] items-start gap-2">
            <input
              value={row.brand}
              onChange={e => updateRow(i, { brand: e.target.value })}
              placeholder="berry"
              className={AUTHORING.generatorControlMono}
            />
            <input
              value={String(row.inputs[table.inputKey] ?? '')}
              onChange={e => updateRowInput(i, e.target.value)}
              placeholder="#8B5CF6"
              className={AUTHORING.generatorControlMono}
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
    <section className={`${AUTHORING.generatorRoot} ${AUTHORING.generatorSection}`}>
      <div className={AUTHORING.generatorTitleBlock}>
        <h3 className={AUTHORING.generatorTitle}>Destination</h3>
        <p className={AUTHORING.generatorDescription}>
          Choose the recipe name, output group, and token set before review.
        </p>
      </div>

      <div className={`${AUTHORING.generatorSectionCard} ${AUTHORING.generatorFieldGrid}`}>
        <div className={AUTHORING.generatorFieldStack}>
          <label htmlFor="step-where-target-group" className={AUTHORING.generatorSummaryLabel}>Output path</label>
          <input
            id="step-where-target-group"
            type="text"
            value={targetGroup}
            onChange={e => onTargetGroupChange(e.target.value)}
            placeholder="colors.primary"
            autoFocus
            className={`${AUTHORING.generatorControlMono} ${
              !targetGroup.trim() ? 'border-[var(--color-figma-error)]/50' : 'border-[var(--color-figma-border)]'
            }`}
          />
          {targetGroup.trim() && (
            <p className={AUTHORING.generatorDescription}>
              <span className="font-mono text-[var(--color-figma-text)]">{targetGroup}.<span className="text-[var(--color-figma-accent)]">{'{'}</span>step<span className="text-[var(--color-figma-accent)]">{'}'}</span></span>
            </p>
          )}
        </div>
        <div className={AUTHORING.generatorFieldStack}>
          <label htmlFor="step-where-recipe-name" className={AUTHORING.generatorSummaryLabel}>Recipe name</label>
          <input
            id="step-where-recipe-name"
            type="text"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            placeholder="Primary colors"
            className={`${AUTHORING.generatorControl} ${
              !name.trim() ? 'border-[var(--color-figma-error)]/50' : 'border-[var(--color-figma-border)]'
            }`}
          />
        </div>
      </div>

      <div className={AUTHORING.generatorSectionCard}>
        <div className={AUTHORING.generatorFieldGrid}>
          {!isMultiBrand && (
            <div className={AUTHORING.generatorFieldStack}>
              <label htmlFor="step-where-target-set" className={AUTHORING.generatorSummaryLabel}>Token set</label>
              <select
                id="step-where-target-set"
                value={targetSet}
                onChange={e => onTargetSetChange(e.target.value)}
                className={AUTHORING.generatorControl}
              >
                {allSets.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          <div className={AUTHORING.generatorFieldStack}>
            <span className={AUTHORING.generatorSummaryLabel}>Publishing mode</span>
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
        <p className={AUTHORING.generatorDescription}>
          {isMultiBrand
            ? 'Create the same scale into multiple brand-specific token sets.'
            : 'Switch to multi-brand when this recipe should publish one scale across several sets.'}
        </p>
      </div>

      {isMultiBrand && inputTable && (
        <div className={AUTHORING.generatorSectionCard}>
          <div className={AUTHORING.generatorTitleBlock}>
            <div className={AUTHORING.generatorTitle}>Brand rows</div>
            <p className={AUTHORING.generatorDescription}>
              Each row publishes the recipe into a distinct set template.
            </p>
          </div>
          <InputTableEditor table={inputTable} onChange={onInputTableChange} />
          <div className={AUTHORING.generatorFieldStack}>
            <label htmlFor="step-where-set-template" className={AUTHORING.generatorSummaryLabel}>Set template</label>
            <input
              id="step-where-set-template"
              type="text"
              value={targetSetTemplate}
              onChange={e => onTargetSetTemplateChange(e.target.value)}
              placeholder="brands/{brand}"
              className={AUTHORING.generatorControlMono}
            />
            <p className={AUTHORING.generatorDescription}>
              {'{brand}'} replaced per row
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
