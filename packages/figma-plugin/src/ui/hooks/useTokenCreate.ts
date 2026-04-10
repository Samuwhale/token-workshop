import { useCallback } from 'react';
import type { SelectionNodeInfo } from '../../shared/types';
import { generateNameSuggestions } from '../components/tokenListHelpers';

export interface UseTokenCreateParams {
  selectedNodes: SelectionNodeInfo[];
  siblingOrderMap: Map<string, string[]>;
  onCreateNew?: (initialPath?: string, initialType?: string, initialValue?: string) => void;
}

function buildSuggestedCreatePath(
  groupPath: string,
  tokenType: string,
  siblingOrderMap: Map<string, string[]>,
  selectedNodes: SelectionNodeInfo[],
): string {
  const normalizedGroupPath = groupPath.trim();
  const siblings = siblingOrderMap.get(normalizedGroupPath) ?? [];
  const layerName = selectedNodes.length === 1 ? selectedNodes[0].name : null;
  const suggestions = generateNameSuggestions(tokenType || 'color', '', normalizedGroupPath, siblings, layerName);
  const firstSuggestion = suggestions[0]?.value ?? '';
  if (firstSuggestion && !firstSuggestion.endsWith('.')) {
    return firstSuggestion;
  }
  return normalizedGroupPath ? `${normalizedGroupPath}.` : '';
}

export function useTokenCreate({
  selectedNodes,
  siblingOrderMap,
  onCreateNew,
}: UseTokenCreateParams) {
  const handleOpenCreateSibling = useCallback((groupPath: string, tokenType: string) => {
    if (!onCreateNew) return;
    const resolvedType = tokenType || 'color';
    const initialPath = buildSuggestedCreatePath(groupPath, resolvedType, siblingOrderMap, selectedNodes);
    onCreateNew(initialPath, resolvedType);
  }, [onCreateNew, selectedNodes, siblingOrderMap]);

  return {
    handleOpenCreateSibling,
  };
}
