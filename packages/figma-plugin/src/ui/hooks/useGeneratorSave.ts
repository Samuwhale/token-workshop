import { useState, useCallback, useEffect, useRef } from 'react';
import { getErrorMessage } from '../shared/utils';
import { apiFetch, createFetchSignal } from '../shared/apiFetch';
import { dispatchToast } from '../shared/toastBus';
import { SEMANTIC_PATTERNS } from '../shared/semanticPatterns';
import type { UndoSlot } from './useUndo';
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
  pushUndo?: (slot: UndoSlot) => void;
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
  handleQuickSave: () => Promise<void>;
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
  pushUndo,
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
  const overwriteCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overwriteCheckAbortRef = useRef<AbortController | null>(null);
  const overwriteCheckRequestIdRef = useRef(0);

  const validateBeforeSave = useCallback((): boolean => {
    if (!targetGroup.trim()) { setSaveError('Target group is required.'); return false; }
    if (!name.trim()) { setSaveError('Generator name is required.'); return false; }
    if (!isMultiBrand && typeNeedsValue && !hasValue) { setSaveError('This generator type requires a source token or base value.'); return false; }
    if (isMultiBrand && inputTable) {
      if (!targetSetTemplate.trim()) { setSaveError('Target set template is required for multi-brand mode.'); return false; }
      if (inputTable.rows.some(r => !r.brand.trim())) { setSaveError('All brand rows must have a non-empty brand name.'); return false; }
      const brandNames = inputTable.rows.map(r => r.brand.trim().toLowerCase());
      const duplicate = brandNames.find((b, i) => brandNames.indexOf(b) !== i);
      if (duplicate) {
        const duplicateName = inputTable.rows.find(r => r.brand.trim().toLowerCase() === duplicate)?.brand.trim() ?? duplicate;
        setSaveError(`Duplicate brand name "${duplicateName}" — each brand name must be unique.`);
        return false;
      }
    }
    setSaveError('');
    return true;
  }, [targetGroup, name, isMultiBrand, typeNeedsValue, hasValue, inputTable, targetSetTemplate]);

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

      if (pushUndo) {
        if (isEditing && existingGenerator) {
          const prevGen = existingGenerator;
          const prevBody = {
            type: prevGen.type,
            name: prevGen.name,
            sourceToken: prevGen.sourceToken,
            inlineValue: prevGen.inlineValue,
            targetSet: prevGen.targetSet,
            targetGroup: prevGen.targetGroup,
            config: prevGen.config,
            overrides: prevGen.overrides,
            inputTable: prevGen.inputTable,
            targetSetTemplate: prevGen.targetSetTemplate,
          };
          pushUndo({
            description: `Edited generator "${prevGen.name}"`,
            restore: async () => {
              await apiFetch(`${serverUrl}/api/generators/${prevGen.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(prevBody),
              });
            },
            redo: async () => {
              await apiFetch(`${serverUrl}/api/generators/${prevGen.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              });
            },
          });
        } else {
          const newId = savedGen.id;
          const genName = name.trim();
          pushUndo({
            description: `Created generator "${genName}"`,
            restore: async () => {
              await apiFetch(`${serverUrl}/api/generators/${newId}?deleteTokens=false`, { method: 'DELETE' });
            },
          });
        }
      }

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
          dispatchToast(`Generator "${name.trim()}" created`, 'success');
          onSaved({ targetGroup: targetGroupAtSave });
          return;
        }

        // Create semantic alias tokens inline if the user opted in
        if (tokensForMapping.length > 0 && semanticEnabledAtSave) {
          const validMappings = semanticMappingsAtSave.filter(m => m.semantic.trim() && m.step);
          if (validMappings.length > 0) {
            const batchTokens = validMappings.map(mapping => ({
              path: `${semanticPrefixAtSave.trim()}.${mapping.semantic}`,
              $type: tokensForMapping.find(t => String(t.stepName) === mapping.step)?.type ?? 'string',
              $value: `{${targetGroupAtSave}.${mapping.step}}`,
              $description: `Semantic reference for ${targetGroupAtSave}.${mapping.step}`,
            }));
            try {
              await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSetAtSave)}/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tokens: batchTokens, strategy: 'overwrite' }),
              });
            } catch (err) {
              console.warn('[useGeneratorSave] failed to create semantic tokens:', err);
            }
          }
        }
      }

      setSaving(false);
      dispatchToast(isEditing ? `Generator "${name.trim()}" updated` : `Generator "${name.trim()}" created`, 'success');
      onSaved({ targetGroup: targetGroupAtSave });
    } catch (err) {
      setSaveError(getErrorMessage(err));
      setSaving(false);
    }
  }, [serverUrl, isEditing, existingGenerator, selectedType, name, sourceTokenPath, inlineValue, config, pendingOverrides, isMultiBrand, inputTable, targetSetTemplate, previewTokens, onSaved, onInterceptSemanticMapping, pushUndo]);

  const runOverwriteCheck = useCallback(async () => {
    if (!isEditing || !existingGenerator) return;

    const requestId = overwriteCheckRequestIdRef.current + 1;
    overwriteCheckRequestIdRef.current = requestId;
    overwriteCheckAbortRef.current?.abort();

    const controller = new AbortController();
    overwriteCheckAbortRef.current = controller;
    setOverwriteCheckLoading(true);
    setOverwriteCheckError('');

    try {
      const { modified } = await apiFetch<{ modified: { path: string }[] }>(
        `${serverUrl}/api/generators/${existingGenerator.id}/check-overwrites`,
        {
          method: 'POST',
          signal: createFetchSignal(controller.signal),
        },
      );
      if (controller.signal.aborted || overwriteCheckRequestIdRef.current !== requestId) return;
      setOverwritePendingPaths(modified.map(m => m.path));
    } catch (err) {
      if (controller.signal.aborted || overwriteCheckRequestIdRef.current !== requestId) return;
      setOverwritePendingPaths([]);
      setOverwriteCheckError(`Could not check for manually-edited tokens: ${getErrorMessage(err)}`);
    } finally {
      if (!controller.signal.aborted && overwriteCheckRequestIdRef.current === requestId) {
        setOverwriteCheckLoading(false);
      }
    }
  }, [isEditing, existingGenerator, serverUrl]);

  useEffect(() => {
    if (!isEditing || !existingGenerator) {
      overwriteCheckAbortRef.current?.abort();
      if (overwriteCheckTimerRef.current) clearTimeout(overwriteCheckTimerRef.current);
      setOverwritePendingPaths([]);
      setOverwriteCheckLoading(false);
      setOverwriteCheckError('');
      return;
    }

    const hasReviewData = previewTokens.length > 0 || isMultiBrand;
    if (!hasReviewData) {
      overwriteCheckAbortRef.current?.abort();
      if (overwriteCheckTimerRef.current) clearTimeout(overwriteCheckTimerRef.current);
      setOverwritePendingPaths([]);
      setOverwriteCheckLoading(false);
      setOverwriteCheckError('');
      return;
    }

    if (overwriteCheckTimerRef.current) clearTimeout(overwriteCheckTimerRef.current);
    overwriteCheckTimerRef.current = setTimeout(() => {
      void runOverwriteCheck();
    }, 350);

    return () => {
      if (overwriteCheckTimerRef.current) clearTimeout(overwriteCheckTimerRef.current);
    };
  }, [
    config,
    existingGenerator,
    inlineValue,
    inputTable,
    isEditing,
    isMultiBrand,
    name,
    pendingOverrides,
    previewTokens.length,
    runOverwriteCheck,
    selectedType,
    sourceTokenPath,
    targetGroup,
    targetSet,
    targetSetTemplate,
  ]);

  useEffect(() => {
    return () => {
      overwriteCheckAbortRef.current?.abort();
      if (overwriteCheckTimerRef.current) clearTimeout(overwriteCheckTimerRef.current);
    };
  }, []);

  /** Step 1: Validate inputs and show the confirmation preview.
   *  Background overwrite checks stay live while the draft changes.
   *  For new generators: pre-populates semantic mapping state based on generator type.
   */
  const handleSave = useCallback(async () => {
    if (!validateBeforeSave()) return;

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
  }, [validateBeforeSave, isEditing, previewTokens, isMultiBrand, selectedType]);

  const handleQuickSave = useCallback(async () => {
    if (!validateBeforeSave()) return;
    await commitSave(false, 'semantic', [], targetGroup.trim(), targetSet);
  }, [validateBeforeSave, commitSave, targetGroup, targetSet]);

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
    handleQuickSave,
    handleSave,
    handleConfirmSave,
    handleCancelConfirmation,
    setSemanticEnabled,
    setSemanticPrefix,
    setSemanticMappings,
    setSelectedSemanticPatternId,
  };
}
