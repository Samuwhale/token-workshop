import { useMemo } from 'react';
import type { RecipeType, GeneratedTokenResult } from '../../hooks/useRecipes';
import type { SemanticStarter } from '../graph-templates';
import {
  createEmptySemanticMapping,
  findMatchingSemanticSuggestion,
  getSemanticSuggestions,
  type SemanticDraftMapping,
  type SemanticSuggestion,
} from '../semanticPlanning';
import { AUTHORING } from '../../shared/editorClasses';

type SemanticPlanState = 'skip' | 'suggested' | 'custom';

export interface StepSemanticPlanningProps {
  selectedType: RecipeType;
  targetGroup: string;
  previewTokens: GeneratedTokenResult[];
  templateStarter?: SemanticStarter;
  semanticEnabled: boolean;
  semanticPrefix: string;
  semanticMappings: SemanticDraftMapping[];
  onSemanticEnabledChange: (value: boolean) => void;
  onSemanticPrefixChange: (value: string) => void;
  onSemanticMappingsChange: (value: SemanticDraftMapping[]) => void;
  onSemanticPatternSelect: (value: string | null) => void;
  /** When true, suppresses the outer section wrapper (used when embedded in StepSave). */
  inline?: boolean;
}

function StateButton({
  label,
  description,
  active,
  disabled = false,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-[36px] rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/8'
          : 'border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)]'
      }`}
    >
      <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
        {label}
      </div>
      <div className="mt-0.5 text-[9.5px] leading-snug text-[var(--color-figma-text-secondary)]">
        {description}
      </div>
    </button>
  );
}

function getPlanState(
  semanticEnabled: boolean,
  semanticPrefix: string,
  semanticMappings: SemanticDraftMapping[],
  suggestions: SemanticSuggestion[],
): { state: SemanticPlanState; matchedSuggestion: SemanticSuggestion | null } {
  if (!semanticEnabled) {
    return { state: 'skip', matchedSuggestion: null };
  }

  const matchedSuggestion = findMatchingSemanticSuggestion(
    suggestions,
    semanticPrefix,
    semanticMappings,
  );

  return {
    state: matchedSuggestion ? 'suggested' : 'custom',
    matchedSuggestion,
  };
}

export function StepSemanticPlanning({
  selectedType,
  targetGroup,
  previewTokens,
  templateStarter,
  semanticEnabled,
  semanticPrefix,
  semanticMappings,
  onSemanticEnabledChange,
  onSemanticPrefixChange,
  onSemanticMappingsChange,
  onSemanticPatternSelect,
  inline = false,
}: StepSemanticPlanningProps) {
  const availableSteps = useMemo(
    () => previewTokens.map((token) => String(token.stepName)),
    [previewTokens],
  );
  const suggestions = useMemo(
    () => getSemanticSuggestions(selectedType, availableSteps, templateStarter),
    [availableSteps, selectedType, templateStarter],
  );
  const validMappings = useMemo(
    () => semanticMappings.filter((mapping) => mapping.semantic.trim() && mapping.step),
    [semanticMappings],
  );
  const { state, matchedSuggestion } = useMemo(
    () => getPlanState(semanticEnabled, semanticPrefix, semanticMappings, suggestions),
    [semanticEnabled, semanticMappings, semanticPrefix, suggestions],
  );
  const defaultSuggestion = matchedSuggestion ?? suggestions[0] ?? null;
  const canPlanAliases = availableSteps.length > 0;

  const applySuggestion = (suggestion: SemanticSuggestion) => {
    onSemanticEnabledChange(true);
    onSemanticPrefixChange(suggestion.prefix);
    onSemanticMappingsChange(suggestion.mappings);
    onSemanticPatternSelect(suggestion.patternId);
  };

  const handleCustomState = () => {
    onSemanticEnabledChange(true);
    if (semanticMappings.length > 0) {
      onSemanticPatternSelect(null);
      return;
    }

    if (defaultSuggestion) {
      onSemanticPrefixChange(defaultSuggestion.prefix);
      onSemanticMappingsChange(defaultSuggestion.mappings);
      onSemanticPatternSelect(defaultSuggestion.patternId);
      return;
    }

    onSemanticPatternSelect(null);
    onSemanticMappingsChange([createEmptySemanticMapping(availableSteps)]);
  };

  const content = (
    <>
      <div className={AUTHORING.recipeButtonGrid}>
        <StateButton
          label="Skip"
          description="Scale only, no aliases."
          active={state === 'skip'}
          onClick={() => onSemanticEnabledChange(false)}
        />
        <StateButton
          label="Suggested"
          description={
            defaultSuggestion
              ? 'Use a recommended alias pattern.'
              : 'No suggestions available.'
          }
          active={state === 'suggested'}
          disabled={!defaultSuggestion || !canPlanAliases}
          onClick={() => {
            if (defaultSuggestion) applySuggestion(defaultSuggestion);
          }}
        />
        <StateButton
          label="Custom"
          description="Edit prefix, names, and mappings."
          active={state === 'custom'}
          disabled={!canPlanAliases}
          onClick={handleCustomState}
        />
      </div>

      {!canPlanAliases && (
        <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2.5 text-[10px] text-[var(--color-figma-text-secondary)]">
          Available once the preview has step names.
        </div>
      )}

      {canPlanAliases && semanticEnabled && (
        <div className={AUTHORING.recipeSectionCard}>
          {suggestions.length > 0 && (
            <div className={AUTHORING.recipeFieldStack}>
              <label className={AUTHORING.recipeSummaryLabel}>
                Suggested starters
              </label>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((suggestion) => {
                  const isSelected = matchedSuggestion?.id === suggestion.id;
                  return (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => applySuggestion(suggestion)}
                      className={`rounded border px-2.5 py-1 text-[10px] transition-colors ${
                        isSelected
                          ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                          : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                      }`}
                    >
                      {suggestion.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className={AUTHORING.recipeFieldStack}>
            <label htmlFor="semantic-prefix" className={AUTHORING.recipeSummaryLabel}>
              Prefix
            </label>
            <input
              id="semantic-prefix"
              type="text"
              value={semanticPrefix}
              onChange={(event) => {
                onSemanticPatternSelect(null);
                onSemanticPrefixChange(event.target.value);
              }}
              placeholder="semantic"
              className={AUTHORING.recipeControlMono}
            />
          </div>

          <div className={AUTHORING.recipeFieldStack}>
            <div className="flex items-center justify-between gap-2">
              <label className={AUTHORING.recipeSummaryLabel}>
                Alias mappings
              </label>
              <button
                type="button"
                onClick={() => {
                  onSemanticPatternSelect(null);
                  onSemanticMappingsChange([
                    ...semanticMappings,
                    createEmptySemanticMapping(availableSteps),
                  ]);
                }}
                className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
              >
                + Add alias
              </button>
            </div>
            <div className={AUTHORING.recipeCardList}>
              {semanticMappings.length > 0 ? (
                semanticMappings.map((mapping, index) => (
                  <div key={`${mapping.semantic}-${index}`} className={`${AUTHORING.recipeFieldGrid} rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-2`}>
                    <input
                      id={`semantic-mapping-${index}`}
                      type="text"
                      value={mapping.semantic}
                      onChange={(event) => {
                        onSemanticPatternSelect(null);
                        onSemanticMappingsChange(
                          semanticMappings.map((candidate, candidateIndex) =>
                            candidateIndex === index
                              ? { ...candidate, semantic: event.target.value }
                              : candidate,
                          ),
                        );
                      }}
                      placeholder="action.default"
                      className={AUTHORING.recipeControlMono}
                    />
                    <div className={`${AUTHORING.recipeFieldGrid} items-start`}>
                      <select
                        id={`semantic-mapping-step-${index}`}
                        value={mapping.step}
                        onChange={(event) => {
                          onSemanticPatternSelect(null);
                          onSemanticMappingsChange(
                            semanticMappings.map((candidate, candidateIndex) =>
                              candidateIndex === index
                                ? { ...candidate, step: event.target.value }
                                : candidate,
                            ),
                          );
                        }}
                        className={AUTHORING.recipeControl}
                      >
                        {availableSteps.map((step) => (
                          <option key={step} value={step}>
                            {step}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          onSemanticPatternSelect(null);
                          onSemanticMappingsChange(
                            semanticMappings.filter((_, candidateIndex) => candidateIndex !== index),
                          );
                        }}
                        className="min-h-[36px] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 text-[11px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-error)]"
                        aria-label="Remove alias mapping"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded border border-dashed border-[var(--color-figma-border)] px-2 py-2 text-center text-[10px] text-[var(--color-figma-text-secondary)]">
                  No aliases yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={AUTHORING.recipeSectionCard}>
        <div className="flex items-center justify-between gap-2">
          <div className={AUTHORING.recipeTitle}>
            Alias output preview
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${
              state === 'skip'
                ? 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)]'
                : state === 'suggested'
                  ? 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                  : 'bg-[var(--color-figma-warning)]/10 text-[var(--color-figma-warning)]'
            }`}
          >
            {state === 'skip' ? 'Skipped' : state === 'suggested' ? 'Suggested' : 'Custom'}
          </span>
        </div>

        {state === 'skip' || validMappings.length === 0 ? (
          <p className="mt-2 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
            Semantic aliases will not be created for{' '}
            <span className="font-mono text-[var(--color-figma-text)]">
              {targetGroup || 'this recipe'}
            </span>
            .
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-1">
            {validMappings.map((mapping) => (
              <div
                key={`${mapping.semantic}-${mapping.step}`}
                className="text-[10px] font-mono text-[var(--color-figma-text-secondary)]"
              >
                <span className="text-[var(--color-figma-text)]">
                  {semanticPrefix}.{mapping.semantic}
                </span>{' '}
                →{' '}
                <span className="text-[var(--color-figma-accent)]">
                  {`{${targetGroup}.${mapping.step}}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  if (inline) return content;

  return (
    <section className={`${AUTHORING.recipeRoot} ${AUTHORING.recipeSection}`}>
      <div className={AUTHORING.recipeTitleBlock}>
        <h3 className={AUTHORING.recipeTitle}>Semantic aliases</h3>
        <p className={AUTHORING.recipeDescription}>
          Optionally create role-based aliases.
        </p>
      </div>
      {content}
    </section>
  );
}
