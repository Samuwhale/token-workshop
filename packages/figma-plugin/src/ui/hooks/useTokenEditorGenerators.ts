import { useState } from 'react';
import type { TokenGenerator, GeneratorTemplate } from './useGenerators';

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
  const [showGeneratorDialog, setShowGeneratorDialog] = useState(false);
  const [editingGeneratorInDialog, setEditingGeneratorInDialog] = useState<TokenGenerator | undefined>(undefined);
  const [duplicateTemplate, setDuplicateTemplate] = useState<GeneratorTemplate | undefined>(undefined);

  const existingGeneratorsForToken = generators.filter(g => g.sourceToken === tokenPath);
  const canBeGeneratorSource = ['color', 'dimension', 'number', 'fontSize'].includes(tokenType);

  return {
    showGeneratorDialog,
    setShowGeneratorDialog,
    editingGeneratorInDialog,
    setEditingGeneratorInDialog,
    duplicateTemplate,
    setDuplicateTemplate,
    existingGeneratorsForToken,
    canBeGeneratorSource,
  };
}
