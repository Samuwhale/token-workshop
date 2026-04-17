/**
 * Destination fields: output path, name, collection, and multi-brand controls.
 * Rendered inline within StepSource or standalone.
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
  targetCollection: string;
  targetGroup: string;
  collectionIds: string[];
  isMultiBrand: boolean;
  targetCollectionTemplate: string;
  onNameChange: (v: string) => void;
  onTargetCollectionChange: (v: string) => void;
  onTargetGroupChange: (v: string) => void;
  onTargetCollectionTemplateChange: (v: string) => void;
  onToggleMultiBrand: () => void;
  inputTable: InputTable | undefined;
  onInputTableChange: (t: InputTable) => void;
  /** When true, renders fields only without the outer section/card wrapper */
  inline?: boolean;
}

export function StepWhere({
  name,
  targetCollection,
  targetGroup,
  collectionIds,
  isMultiBrand,
  targetCollectionTemplate,
  onNameChange,
  onTargetCollectionChange,
  onTargetGroupChange,
  onTargetCollectionTemplateChange,
  onToggleMultiBrand,
  inputTable,
  onInputTableChange,
  inline = false,
}: StepWhereProps) {
  const fields = (
    <>
      <div className={`${inline ? '' : AUTHORING.recipeSectionCard} ${AUTHORING.recipeFieldGrid}`}>
        <div className={AUTHORING.recipeFieldStack}>
          <label htmlFor="step-where-target-group" className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Output path</label>
          <input
            id="step-where-target-group"
            type="text"
            value={targetGroup}
            onChange={e => onTargetGroupChange(e.target.value)}
            placeholder="colors.primary"
            autoFocus={!inline}
            className={`${AUTHORING.recipeControlMono} ${
              !targetGroup.trim() ? 'border-[var(--color-figma-error)]/50' : 'border-[var(--color-figma-border)]'
            }`}
          />
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

      <div className={inline ? '' : AUTHORING.recipeSectionCard}>
        <div className={AUTHORING.recipeFieldGrid}>
          {!isMultiBrand && (
            <div className={AUTHORING.recipeFieldStack}>
              <label htmlFor="step-where-target-set" className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Token collection</label>
              <select
                id="step-where-target-set"
                value={targetCollection}
                onChange={e => onTargetCollectionChange(e.target.value)}
                className={AUTHORING.recipeControl}
              >
                {collectionIds.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {isMultiBrand && (
            <div className={AUTHORING.recipeFieldStack}>
              <label htmlFor="step-where-set-template" className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Collection template</label>
              <input
                id="step-where-set-template"
                type="text"
                value={targetCollectionTemplate}
                onChange={e => onTargetCollectionTemplateChange(e.target.value)}
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
          {isMultiBrand ? 'Switch to single collection' : 'Publish to multiple collections'}
        </button>

        {/* Multi-brand input table */}
        {isMultiBrand && inputTable && (
          <InputTableEditor table={inputTable} onChange={onInputTableChange} />
        )}
      </div>
    </>
  );

  if (inline) return <div className="flex flex-col gap-3">{fields}</div>;

  return (
    <section className={`${AUTHORING.recipeRoot} ${AUTHORING.recipeSection}`}>
      {fields}
    </section>
  );
}
