import type { GeneratorType } from '../hooks/useGenerators';
import type { SemanticStarter } from './graph-templates';
import { SEMANTIC_PATTERNS } from '../shared/semanticPatterns';

export interface SemanticDraftMapping {
  semantic: string;
  step: string;
}

export interface SemanticSuggestion {
  id: string;
  label: string;
  description: string;
  source: 'intent' | 'pattern';
  prefix: string;
  mappings: SemanticDraftMapping[];
  patternId: string | null;
}

export const INTENT_SEMANTIC_SUGGESTION_ID = '__intent__';

function getFallbackStep(availableSteps: string[]): string {
  return (
    availableSteps[Math.floor(availableSteps.length / 2)] ??
    availableSteps[0] ??
    ''
  );
}

export function buildSemanticMappings(
  mappings: SemanticDraftMapping[],
  availableSteps: string[],
): SemanticDraftMapping[] {
  const fallbackStep = getFallbackStep(availableSteps);
  return mappings.map((mapping) => ({
    semantic: mapping.semantic,
    step: availableSteps.includes(mapping.step) ? mapping.step : fallbackStep,
  }));
}

export function createEmptySemanticMapping(
  availableSteps: string[],
): SemanticDraftMapping {
  return {
    semantic: '',
    step: availableSteps[0] ?? '',
  };
}

export function getSemanticSuggestions(
  selectedType: GeneratorType,
  availableSteps: string[],
  templateStarter?: SemanticStarter,
): SemanticSuggestion[] {
  const suggestions: SemanticSuggestion[] = [];

  if (templateStarter?.mappings.length) {
    suggestions.push({
      id: INTENT_SEMANTIC_SUGGESTION_ID,
      label: 'Chosen intent',
      description: 'Starter aliases from the selected recipe intent.',
      source: 'intent',
      prefix: templateStarter.prefix,
      mappings: buildSemanticMappings(templateStarter.mappings, availableSteps),
      patternId: templateStarter.patternId ?? null,
    });
  }

  for (const pattern of SEMANTIC_PATTERNS) {
    if (!pattern.applicableTo.includes(selectedType)) continue;
    suggestions.push({
      id: pattern.id,
      label: pattern.label,
      description: 'Suggested alias pattern for this recipe type.',
      source: 'pattern',
      prefix: templateStarter?.prefix ?? 'semantic',
      mappings: buildSemanticMappings(pattern.mappings, availableSteps),
      patternId: pattern.id,
    });
  }

  return suggestions;
}

function normalizeMappings(
  mappings: SemanticDraftMapping[],
): SemanticDraftMapping[] {
  return mappings
    .map((mapping) => ({
      semantic: mapping.semantic.trim(),
      step: mapping.step.trim(),
    }))
    .filter((mapping) => mapping.semantic.length > 0 && mapping.step.length > 0);
}

export function semanticMappingsMatch(
  left: SemanticDraftMapping[],
  right: SemanticDraftMapping[],
): boolean {
  const normalizedLeft = normalizeMappings(left);
  const normalizedRight = normalizeMappings(right);
  if (normalizedLeft.length !== normalizedRight.length) return false;

  return normalizedLeft.every((mapping, index) => {
    const candidate = normalizedRight[index];
    return (
      candidate !== undefined &&
      candidate.semantic === mapping.semantic &&
      candidate.step === mapping.step
    );
  });
}

export function findMatchingSemanticSuggestion(
  suggestions: SemanticSuggestion[],
  prefix: string,
  mappings: SemanticDraftMapping[],
): SemanticSuggestion | null {
  const normalizedPrefix = prefix.trim();
  return (
    suggestions.find(
      (suggestion) =>
        normalizedPrefix === suggestion.prefix.trim() &&
        semanticMappingsMatch(mappings, suggestion.mappings),
    ) ?? null
  );
}
