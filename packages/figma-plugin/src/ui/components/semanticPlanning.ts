export interface SemanticDraftMapping {
  semantic: string;
  step: string;
}

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
