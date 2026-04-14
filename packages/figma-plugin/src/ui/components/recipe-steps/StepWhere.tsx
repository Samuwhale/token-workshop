/**
 * Step 3 — Where: "Where should it land?"
 * Simplified to recipe name, target set, target group, and set template.
 * Multi-brand toggle and InputTableEditor moved to StepSource.
 */
import { AUTHORING } from '../../shared/editorClasses';

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
}: StepWhereProps) {
  return (
    <section className={`${AUTHORING.recipeRoot} ${AUTHORING.recipeSection}`}>
      <div className={AUTHORING.recipeTitleBlock}>
        <h3 className={AUTHORING.recipeTitle}>Where should it land?</h3>
      </div>

      <div className={`${AUTHORING.recipeSectionCard} ${AUTHORING.recipeFieldGrid}`}>
        <div className={AUTHORING.recipeFieldStack}>
          <label htmlFor="step-where-target-group" className={AUTHORING.recipeSummaryLabel}>Output path</label>
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
            <p className={AUTHORING.recipeDescription}>
              <span className="font-mono text-[var(--color-figma-text)]">{targetGroup}.<span className="text-[var(--color-figma-accent)]">{'{'}</span>step<span className="text-[var(--color-figma-accent)]">{'}'}</span></span>
            </p>
          )}
        </div>
        <div className={AUTHORING.recipeFieldStack}>
          <label htmlFor="step-where-recipe-name" className={AUTHORING.recipeSummaryLabel}>Recipe name</label>
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
              <label htmlFor="step-where-target-set" className={AUTHORING.recipeSummaryLabel}>Token set</label>
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
              <label htmlFor="step-where-set-template" className={AUTHORING.recipeSummaryLabel}>Set template</label>
              <input
                id="step-where-set-template"
                type="text"
                value={targetSetTemplate}
                onChange={e => onTargetSetTemplateChange(e.target.value)}
                placeholder="brands/{brand}"
                className={AUTHORING.recipeControlMono}
              />
              <p className={AUTHORING.recipeDescription}>
                {'{brand}'} replaced per row
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
