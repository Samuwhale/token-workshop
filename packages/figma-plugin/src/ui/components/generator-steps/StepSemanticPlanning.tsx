import { useMemo } from 'react';
import type { GeneratorType, GeneratedTokenResult } from '../../hooks/useGenerators';
import type { SemanticStarter } from '../graph-templates';
import {
  createEmptySemanticMapping,
  findMatchingSemanticSuggestion,
  getSemanticSuggestions,
  type SemanticDraftMapping,
  type SemanticSuggestion,
} from '../semanticPlanning';

type SemanticPlanState = 'skip' | 'suggested' | 'custom';

export interface StepSemanticPlanningProps {
  selectedType: GeneratorType;
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
      className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
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

  return (
    <div className="px-4 py-3 flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[11px] font-semibold text-[var(--color-figma-text)]">
          Semantic aliases
        </h3>
        <p className="text-[9.5px] leading-snug text-[var(--color-figma-text-secondary)]">
          Decide whether this generator should also publish role-based aliases
          before you review the final output.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <StateButton
          label="Skip"
          description="Create only the generated scale."
          active={state === 'skip'}
          onClick={() => onSemanticEnabledChange(false)}
        />
        <StateButton
          label="Suggested"
          description={
            defaultSuggestion
              ? 'Start from the chosen intent or a recommended alias pattern.'
              : 'No suggested alias starter is available for this generator.'
          }
          active={state === 'suggested'}
          disabled={!defaultSuggestion || !canPlanAliases}
          onClick={() => {
            if (defaultSuggestion) applySuggestion(defaultSuggestion);
          }}
        />
        <StateButton
          label="Custom"
          description="Edit the prefix, names, and step mapping yourself."
          active={state === 'custom'}
          disabled={!canPlanAliases}
          onClick={handleCustomState}
        />
      </div>

      {!canPlanAliases && (
        <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2.5 text-[10px] text-[var(--color-figma-text-secondary)]">
          Semantic planning becomes available once the generator preview has step
          names to map against.
        </div>
      )}

      {canPlanAliases && semanticEnabled && (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-3">
          {suggestions.length > 0 && (
            <div>
              <label className="mb-1.5 block text-[10px] text-[var(--color-figma-text-secondary)]">
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

          <div className="flex items-center gap-2">
            <label className="shrink-0 text-[10px] text-[var(--color-figma-text-secondary)]">
              Prefix
            </label>
            <input
              type="text"
              value={semanticPrefix}
              onChange={(event) => {
                onSemanticPatternSelect(null);
                onSemanticPrefixChange(event.target.value);
              }}
              placeholder="semantic"
              className="flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-mono text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">
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
            <div className="flex flex-col gap-1">
              {semanticMappings.length > 0 ? (
                semanticMappings.map((mapping, index) => (
                  <div key={`${mapping.semantic}-${index}`} className="flex items-center gap-1.5">
                    <input
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
                      className="min-w-0 flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-mono text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                    />
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="shrink-0 text-[var(--color-figma-text-secondary)]"
                    >
                      <path d="M2 6h8M7 3l3 3-3 3" />
                    </svg>
                    <select
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
                      className="w-20 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1 py-1 text-[10px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
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
                      className="shrink-0 rounded p-0.5 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-error)]"
                      aria-label="Remove alias mapping"
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M3 3l6 6M9 3l-6 6" />
                      </svg>
                    </button>
                  </div>
                ))
              ) : (
                <div className="rounded border border-dashed border-[var(--color-figma-border)] px-2 py-2 text-center text-[10px] text-[var(--color-figma-text-secondary)]">
                  No aliases yet. Add a row or apply a suggested starter.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
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
              {targetGroup || 'this generator'}
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
    </div>
  );
}
