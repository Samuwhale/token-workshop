import type { TokenGenerator } from './useGenerators';

interface UseTokenEditorGeneratorsParams {
  tokenPath: string;
  tokenType: string;
  generators: TokenGenerator[];
}

export function useTokenEditorGenerators({
  tokenPath,
  tokenType,
  generators,
}: UseTokenEditorGeneratorsParams) {
  const existingGeneratorsForToken = generators.filter(g => g.sourceToken === tokenPath);
  const canBeGeneratorSource = ['color', 'dimension', 'number', 'fontSize'].includes(tokenType);

  return {
    existingGeneratorsForToken,
    canBeGeneratorSource,
  };
}
