/**
 * Step 3 (top half) — Destination: output path, name, set, and multi-brand controls.
 */
import type { InputTable, InputTableRow } from '../../hooks/useRecipes';
import { AUTHORING } from '../../shared/editorClasses';

// ---------------------------------------------------------------------------
// InputTableEditor (inline multi-brand table)
// ---------------------------------------------------------------------------

function InputTableEditor({ table, onChange }: { table: InputTable; onChange: (t: InputTable) => void }) {
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
    <div className="flex flex-col gap-2 mt-2">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_20px] gap-2 px-0.5">
        <span className="text-[9px] font-medium text-[var(--color-figma-text-secondary)]">Brand</span>
        <span className="text-[9px] font-medium text-[var(--color-figma-text-secondary)]">{table.inputKey || 'value'}</span>
        <span className="w-5" />
      </div>
      {table.rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_20px] items-start gap-2">
          <input
            value={row.brand}
            onChange={e => updateRow(i, { brand: e.target.value })}
            placeholder="berry"
            className={AUTHORING.recipeControlMono}
          />
          <input
            value={String(row.inputs[table.inputKey] ?? '')}
            onChange={e => updateRowInput(i, e.target.value)}
            placeholder="#8B5CF6"
            className={AUTHORING.recipeControlMono}
          />
          <button
            type="button"
            onClick={() => removeRow(i)}
            aria-label="Remove row"
            className="mt-2 w-5 text-center text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] text-[12px] shrink-0 leading-none"
          >&times;</button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left"
      >+ Add brand</button>
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
  targetSetTemplate: string;
  onNameChange: (v: string) => void;
  onTargetSetChange: (v: string) => void;
  onTargetGroupChange: (v: string) => void;
  onTargetSetTemplateChange: (v: string) => void;
  onToggleMultiBrand: () => void;
  inputTable: InputTable | undefined;
  onInputTableChange: (t: InputTable) => void;
}

export function StepWhere({
  name,
  targetSet,
  targetGroup,
  allSets,
  isMultiBrand,
  targetSetTemplate,
  onNameChange,
  onTargetSetChange,
  onTargetGroupChange,
  onTargetSetTemplateChange,
  onToggleMultiBrand,
  inputTable,
  onInputTableChange,
}: StepWhereProps) {
  return (
    <section className={`${AUTHORING.recipeRoot} ${AUTHORING.recipeSection}`}>
      <div className={`${AUTHORING.recipeSectionCard} ${AUTHORING.recipeFieldGrid}`}>
        <div className={AUTHORING.recipeFieldStack}>
          <label htmlFor="step-where-target-group" className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Output path</label>
          <input
            id="step-where-target-group"
            type="text"
            value={targetGroup}
            onChange={e => onTargetGroupChange(e.target.value)}
            placeholder="colors.primary"
            autoFocus
            className={`${AUTHORING.recipeControlMono} ${
              !targetGroup.trim() ? 'border-[var(--color-figma-error)]/50' : 'border-[var(--color-figma-border)]'
            }`}
          />
          {targetGroup.trim() && (
            <p className="text-[9px] text-[var(--color-figma-text-secondary)]">
              <span className="font-mono text-[var(--color-figma-text)]">{targetGroup}.<span className="text-[var(--color-figma-accent)]">{'{'}</span>step<span className="text-[var(--color-figma-accent)]">{'}'}</span></span>
            </p>
          )}
        </div>
        <div className={AUTHORING.recipeFieldStack}>
          <label htmlFor="step-where-recipe-name" className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Recipe name</label>
          <input
            id="step-where-recipe-name"
            type="text"
            value={name}
            onChange={e => onNameChange(e.target.value)}
            placeholder="Primary colors"
            className={`${AUTHORING.recipeControl} ${
              !name.trim() ? 'border-[var(--color-figma-error)]/50' : 'border-[var(--color-figma-border)]'
            }`}
          />
        </div>
      </div>

      <div className={AUTHORING.recipeSectionCard}>
        <div className={AUTHORING.recipeFieldGrid}>
          {!isMultiBrand && (
            <div className={AUTHORING.recipeFieldStack}>
              <label htmlFor="step-where-target-set" className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Token set</label>
              <select
                id="step-where-target-set"
                value={targetSet}
                onChange={e => onTargetSetChange(e.target.value)}
                className={AUTHORING.recipeControl}
              >
                {allSets.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {isMultiBrand && (
            <div className={AUTHORING.recipeFieldStack}>
              <label htmlFor="step-where-set-template" className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Set template</label>
              <input
                id="step-where-set-template"
                type="text"
                value={targetSetTemplate}
                onChange={e => onTargetSetTemplateChange(e.target.value)}
                placeholder="brands/{brand}"
                className={AUTHORING.recipeControlMono}
              />
              <p className="text-[9px] text-[var(--color-figma-text-secondary)]">
                {'{brand}'} replaced per row
              </p>
            </div>
          )}
        </div>

        {/* Multi-brand toggle */}
        <button
          type="button"
          onClick={onToggleMultiBrand}
          className={`mt-1 text-[10px] transition-colors ${
            isMultiBrand
              ? 'text-[var(--color-figma-accent)]'
              : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
          }`}
        >
          {isMultiBrand ? 'Switch to single set' : 'Publish to multiple sets'}
        </button>

        {/* Multi-brand input table */}
        {isMultiBrand && inputTable && (
          <InputTableEditor table={inputTable} onChange={onInputTableChange} />
        )}
      </div>
    </section>
  );
}
