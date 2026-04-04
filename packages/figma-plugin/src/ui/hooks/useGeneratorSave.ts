import { useState, useCallback } from 'react';
import { getErrorMessage, tokenPathToUrlSegment } from '../shared/utils';
import { apiFetch } from '../shared/apiFetch';
import { SEMANTIC_PATTERNS } from '../shared/semanticPatterns';
import type {
  TokenGenerator,
  GeneratorType,
  GeneratorConfig,
  GeneratedTokenResult,
  InputTable,
} from './useGenerators';

interface UseGeneratorSaveParams {
  serverUrl: string;
  isEditing: boolean;
  existingGenerator?: TokenGenerator;
  selectedType: GeneratorType;
  name: string;
  sourceTokenPath?: string;
  inlineValue?: unknown;
  targetSet: string;
  targetGroup: string;
  config: GeneratorConfig;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  isMultiBrand: boolean;
  inputTable: InputTable | undefined;
  targetSetTemplate: string;
  typeNeedsValue: boolean;
  hasValue: boolean;
  previewTokens: GeneratedTokenResult[];
  onSaved: (info?: { targetGroup: string }) => void;
  onInterceptSemanticMapping?: (data: { tokens: GeneratedTokenResult[]; targetGroup: string; targetSet: string; generatorType: GeneratorType }) => void;
}

export interface UseGeneratorSaveReturn {
  saving: boolean;
  saveError: string;
  showConfirmation: boolean;
  overwritePendingPaths: string[];
  overwriteCheckLoading: boolean;
  overwriteCheckError: string;
  semanticEnabled: boolean;
  semanticPrefix: string;
  semanticMappings: Array<{ semantic: string; step: string }>;
  selectedSemanticPatternId: string | null;
  handleSave: () => Promise<void>;
  handleConfirmSave: () => Promise<void>;
  handleCancelConfirmation: () => void;
  setSemanticEnabled: (v: boolean) => void;
  setSemanticPrefix: (v: string) => void;
  setSemanticMappings: (v: Array<{ semantic: string; step: string }>) => void;
  setSelectedSemanticPatternId: (v: string | null) => void;
}

export function useGeneratorSave({
  serverUrl,
  isEditing,
  existingGenerator,
  selectedType,
  name,
  sourceTokenPath,
  inlineValue,
  targetSet,
  targetGroup,
  config,
  pendingOverrides,
  isMultiBrand,
  inputTable,
  targetSetTemplate,
  typeNeedsValue,
  hasValue,
  previewTokens,
  onSaved,
  onInterceptSemanticMapping,
}: UseGeneratorSaveParams): UseGeneratorSaveReturn {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [overwritePendingPaths, setOverwritePendingPaths] = useState<string[]>([]);
  const [overwriteCheckLoading, setOverwriteCheckLoading] = useState(false);
  const [overwriteCheckError, setOverwriteCheckError] = useState('');
  const [semanticEnabled, setSemanticEnabled] = useState(false);
  const [semanticPrefix, setSemanticPrefix] = useState('semantic');
  const [semanticMappings, setSemanticMappings] = useState<Array<{ semantic: string; step: string }>>([]);
  const [selectedSemanticPatternId, setSelectedSemanticPatternId] = useState<string | null>(null);

  /** Inner save logic — commits the generator to the server. */
  const commitSave = useCallback(async (semanticEnabledAtSave: boolean, semanticPrefixAtSave: string, semanticMappingsAtSave: Array<{ semantic: string; step: string }>, targetGroupAtSave: string, targetSetAtSave: string) => {
    setSaving(true);
    setSaveError('');
    try {
      const body = {
        type: selectedType,
        name: name.trim(),
        sourceToken: isMultiBrand ? undefined : (sourceTokenPath || undefined),
        inlineValue: (!sourceTokenPath && inlineValue !== undefined && inlineValue !== '') ? inlineValue : undefined,
        targetSet: targetSetAtSave,
        targetGroup: targetGroupAtSave,
        config,
        overrides: Object.keys(pendingOverrides).length > 0 ? pendingOverrides : undefined,
        ...(isMultiBrand && inputTable ? { inputTable, targetSetTemplate: targetSetTemplate.trim() } : {}),
      };
      const saveUrl = isEditing && existingGenerator
        ? `${serverUrl}/api/generators/${existingGenerator.id}`
        : `${serverUrl}/api/generators`;
      const savedGen = await apiFetch<{ id: string }>(saveUrl, {
        method: isEditing && existingGenerator ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setShowConfirmation(false);

      if (!isEditing) {
        let tokensForMapping = previewTokens;
        if (tokensForMapping.length === 0 && isMultiBrand) {
          try {
            const tokensData = await apiFetch<{ tokens: GeneratedTokenResult[] }>(`${serverUrl}/api/generators/${savedGen.id}/tokens`);
            tokensForMapping = tokensData.tokens ?? [];
          } catch (err) {
            console.warn('[useGeneratorSave] failed to fetch generator tokens for semantic mapping:', err);
          }
        }

        if (tokensForMapping.length > 0 && onInterceptSemanticMapping) {
          onInterceptSemanticMapping({ tokens: tokensForMapping, targetGroup: targetGroupAtSave, targetSet: targetSetAtSave, generatorType: selectedType });
          setSaving(false);
          onSaved({ targetGroup: targetGroupAtSave });
          return;
        }

        // Create semantic alias tokens inline if the user opted in
        if (tokensForMapping.length > 0 && semanticEnabledAtSave) {
          const validMappings = semanticMappingsAtSave.filter(m => m.semantic.trim() && m.step);
          for (const mapping of validMappings) {
            const fullPath = `${semanticPrefixAtSave.trim()}.${mapping.semantic}`;
            const encodedFullPath = tokenPathToUrlSegment(fullPath);
            const tokenType = tokensForMapping.find(t => String(t.stepName) === mapping.step)?.type ?? 'string';
            const body = {
              $type: tokenType,
              $value: `{${targetGroupAtSave}.${mapping.step}}`,
              $description: `Semantic reference for ${targetGroupAtSave}.${mapping.step}`,
            };
            try {
              await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSetAtSave)}/${encodedFullPath}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              });
            } catch (postErr: any) {
              if (postErr?.status === 409) {
                await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSetAtSave)}/${encodedFullPath}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                });
              } else {
                console.warn('[useGeneratorSave] failed to create semantic token:', postErr);
              }
            }
          }
        }
      }

      setSaving(false);
      onSaved({ targetGroup: targetGroupAtSave });
    } catch (err) {
      setSaveError(getErrorMessage(err));
      setSaving(false);
    }
  }, [serverUrl, isEditing, existingGenerator, selectedType, name, sourceTokenPath, inlineValue, config, pendingOverrides, isMultiBrand, inputTable, targetSetTemplate, previewTokens, onSaved, onInterceptSemanticMapping]);

  /** Step 1: Validate inputs, show the confirmation preview.
   *  For editing: kicks off the overwrite check in the background so the preview
   *  shows the result without a blocking modal.
   *  For new generators: pre-populates semantic mapping state based on generator type.
   */
  const handleSave = useCallback(async () => {
    if (!targetGroup.trim()) { setSaveError('Target group is required.'); return; }
    if (!name.trim()) { setSaveError('Generator name is required.'); return; }
    if (!isMultiBrand && typeNeedsValue && !hasValue) { setSaveError('This generator type requires a source token or base value.'); return; }
    if (isMultiBrand && inputTable) {
      if (!targetSetTemplate.trim()) { setSaveError('Target set template is required for multi-brand mode.'); return; }
      if (inputTable.rows.some(r => !r.brand.trim())) { setSaveError('All brand rows must have a non-empty brand name.'); return; }
      const brandNames = inputTable.rows.map(r => r.brand.trim().toLowerCase());
      const duplicate = brandNames.find((b, i) => brandNames.indexOf(b) !== i);
      if (duplicate) { setSaveError(`Duplicate brand name "${inputTable.rows.find(r => r.brand.trim().toLowerCase() === duplicate)!.brand.trim()}" — each brand name must be unique.`); return; }
    }
    setSaveError('');

    // Initialize semantic mapping state for new generators with eligible types
    if (!isEditing && (previewTokens.length > 0 || isMultiBrand)) {
      const suggestedPatterns = SEMANTIC_PATTERNS.filter(p => p.applicableTo.includes(selectedType));
      if (suggestedPatterns.length > 0 && suggestedPatterns[0]) {
        const firstPattern = suggestedPatterns[0];
        const availableSteps = previewTokens.map(t => String(t.stepName));
        setSelectedSemanticPatternId(firstPattern.id);
        setSemanticMappings(firstPattern.mappings.map(m => ({
          semantic: m.semantic,
          step: availableSteps.includes(m.step) ? m.step : (availableSteps[Math.floor(availableSteps.length / 2)] ?? ''),
        })));
      } else {
        setSelectedSemanticPatternId(null);
        setSemanticMappings([]);
      }
      setSemanticEnabled(false); // user must opt in
    }

    setShowConfirmation(true);

    // For editing: check for manually-edited tokens in the background so the review
    // screen shows the info immediately rather than gating on it.
    if (isEditing && existingGenerator) {
      setOverwriteCheckLoading(true);
      setOverwritePendingPaths([]);
      setOverwriteCheckError('');
      try {
        const { modified } = await apiFetch<{ modified: { path: string }[] }>(
          `${serverUrl}/api/generators/${existingGenerator.id}/check-overwrites`,
          { method: 'POST' },
        );
        setOverwritePendingPaths(modified.map(m => m.path));
      } catch (err) {
        setOverwriteCheckError(`Could not check for manually-edited tokens: ${getErrorMessage(err)}`);
      } finally {
        setOverwriteCheckLoading(false);
      }
    }
  }, [targetGroup, name, isMultiBrand, typeNeedsValue, hasValue, inputTable, targetSetTemplate, isEditing, existingGenerator, serverUrl, selectedType, previewTokens]);

  /** Step 2: Commit the save. Overwrites are already known (shown in review view).
   *  Semantic tokens are created inline if the user opted in.
   */
  const handleConfirmSave = useCallback(async () => {
    await commitSave(semanticEnabled, semanticPrefix, semanticMappings, targetGroup.trim(), targetSet);
  }, [commitSave, semanticEnabled, semanticPrefix, semanticMappings, targetGroup, targetSet]);

  const handleCancelConfirmation = useCallback(() => {
    setShowConfirmation(false);
    setOverwritePendingPaths([]);
    setOverwriteCheckLoading(false);
    setOverwriteCheckError('');
  }, []);

  return {
    saving,
    saveError,
    showConfirmation,
    overwritePendingPaths,
    overwriteCheckLoading,
    overwriteCheckError,
    semanticEnabled,
    semanticPrefix,
    semanticMappings,
    selectedSemanticPatternId,
    handleSave,
    handleConfirmSave,
    handleCancelConfirmation,
    setSemanticEnabled,
    setSemanticPrefix,
    setSemanticMappings,
    setSelectedSemanticPatternId,
  };
}
