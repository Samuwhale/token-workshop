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
    <section className={`${AUTHORING.generatorRoot} ${AUTHORING.generatorSection}`}>
      <div className={AUTHORING.generatorTitleBlock}>
        <h3 className={AUTHORING.generatorTitle}>Where should it land?</h3>
        <p className={AUTHORING.generatorDescription}>
          Name the recipe and choose where generated tokens are published.
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
          {isMultiBrand && (
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
          )}
        </div>
      </div>
    </section>
  );
}
