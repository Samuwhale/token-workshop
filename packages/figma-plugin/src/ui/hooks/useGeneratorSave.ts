import { useState, useCallback } from 'react';
import { getErrorMessage } from '../shared/utils';
import { apiFetch } from '../shared/apiFetch';
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
  targetSet: string;
  targetGroup: string;
  config: GeneratorConfig;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  isMultiBrand: boolean;
  inputTable: InputTable | undefined;
  targetSetTemplate: string;
  typeNeedsSource: boolean;
  hasSource: boolean;
  previewTokens: GeneratedTokenResult[];
  onSaved: (info?: { targetGroup: string }) => void;
  onInterceptSemanticMapping?: (data: { tokens: GeneratedTokenResult[]; targetGroup: string; targetSet: string; generatorType: GeneratorType }) => void;
}

export interface UseGeneratorSaveReturn {
  saving: boolean;
  saveError: string;
  showSemanticMapping: boolean;
  savedTokens: GeneratedTokenResult[];
  savedTargetGroup: string;
  showConfirmation: boolean;
  overwritePendingPaths: string[];
  handleSave: () => Promise<void>;
  handleConfirmSave: () => Promise<void>;
  handleCancelConfirmation: () => void;
  handleSemanticMappingClose: () => void;
  handleOverwriteConfirm: () => void;
  handleOverwriteCancel: () => void;
}

export function useGeneratorSave({
  serverUrl,
  isEditing,
  existingGenerator,
  selectedType,
  name,
  sourceTokenPath,
  targetSet,
  targetGroup,
  config,
  pendingOverrides,
  isMultiBrand,
  inputTable,
  targetSetTemplate,
  typeNeedsSource,
  hasSource,
  previewTokens,
  onSaved,
  onInterceptSemanticMapping,
}: UseGeneratorSaveParams): UseGeneratorSaveReturn {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showSemanticMapping, setShowSemanticMapping] = useState(false);
  const [savedTokens, setSavedTokens] = useState<GeneratedTokenResult[]>([]);
  const [savedTargetGroup, setSavedTargetGroup] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [overwritePendingPaths, setOverwritePendingPaths] = useState<string[]>([]);

  /** Step 1: Validate inputs, then show the confirmation preview. */
  const handleSave = useCallback(async () => {
    if (!targetGroup.trim()) { setSaveError('Target group is required.'); return; }
    if (!name.trim()) { setSaveError('Generator name is required.'); return; }
    if (!isMultiBrand && typeNeedsSource && !hasSource) { setSaveError('This generator type requires a source token.'); return; }
    if (isMultiBrand && inputTable) {
      if (!targetSetTemplate.trim()) { setSaveError('Target set template is required for multi-brand mode.'); return; }
      if (inputTable.rows.some(r => !r.brand.trim())) { setSaveError('All brand rows must have a non-empty brand name.'); return; }
      const brandNames = inputTable.rows.map(r => r.brand.trim().toLowerCase());
      const duplicate = brandNames.find((b, i) => brandNames.indexOf(b) !== i);
      if (duplicate) { setSaveError(`Duplicate brand name "${inputTable.rows.find(r => r.brand.trim().toLowerCase() === duplicate)!.brand.trim()}" — each brand name must be unique.`); return; }
    }
    setSaveError('');
    setShowConfirmation(true);
  }, [targetGroup, name, isMultiBrand, typeNeedsSource, hasSource, inputTable, targetSetTemplate]);

  /** Inner save logic — commits the generator to the server. */
  const commitSave = useCallback(async () => {
    setSaving(true);
    setSaveError('');
    try {
      const body = {
        type: selectedType,
        name: name.trim(),
        sourceToken: isMultiBrand ? undefined : (sourceTokenPath || undefined),
        targetSet,
        targetGroup: targetGroup.trim(),
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
          } catch {
            // Best-effort — if fetching fails, skip semantic mapping
          }
        }
        if (tokensForMapping.length > 0) {
          if (onInterceptSemanticMapping) {
            onInterceptSemanticMapping({ tokens: tokensForMapping, targetGroup: targetGroup.trim(), targetSet, generatorType: selectedType });
            setSaving(false);
            onSaved({ targetGroup: targetGroup.trim() });
            return;
          }
          setSavedTokens(tokensForMapping);
          setSavedTargetGroup(targetGroup.trim());
          setShowSemanticMapping(true);
          setSaving(false);
          return;
        }
      }
      setSaving(false);
      onSaved({ targetGroup: targetGroup.trim() });
    } catch (err) {
      setSaveError(getErrorMessage(err));
      setSaving(false);
    }
  }, [serverUrl, isEditing, existingGenerator, selectedType, name, sourceTokenPath, targetSet, targetGroup, config, pendingOverrides, isMultiBrand, inputTable, targetSetTemplate, previewTokens, onSaved, onInterceptSemanticMapping]);

  /** Step 2: Check for overwrites, then commit (called from confirmation view). */
  const handleConfirmSave = useCallback(async () => {
    // When updating an existing generator, check for manually-edited tokens
    if (isEditing && existingGenerator) {
      setSaving(true);
      try {
        const { modified } = await apiFetch<{ modified: { path: string }[] }>(
          `${serverUrl}/api/generators/${existingGenerator.id}/check-overwrites`,
          { method: 'POST' },
        );
        if (modified.length > 0) {
          setOverwritePendingPaths(modified.map(m => m.path));
          setSaving(false);
          return;
        }
      } catch {
        // Best-effort — if the check fails, proceed without warning
      }
      setSaving(false);
    }
    await commitSave();
  }, [isEditing, existingGenerator, serverUrl, commitSave]);

  /** User confirmed overwriting manually-edited tokens. */
  const handleOverwriteConfirm = useCallback(() => {
    setOverwritePendingPaths([]);
    commitSave();
  }, [commitSave]);

  /** User cancelled the overwrite warning. */
  const handleOverwriteCancel = useCallback(() => {
    setOverwritePendingPaths([]);
  }, []);

  const handleCancelConfirmation = useCallback(() => {
    setShowConfirmation(false);
  }, []);

  const handleSemanticMappingClose = useCallback(() => {
    setShowSemanticMapping(false);
    onSaved({ targetGroup: savedTargetGroup });
  }, [onSaved, savedTargetGroup]);

  return {
    saving,
    saveError,
    showSemanticMapping,
    savedTokens,
    savedTargetGroup,
    showConfirmation,
    overwritePendingPaths,
    handleSave,
    handleConfirmSave,
    handleCancelConfirmation,
    handleSemanticMappingClose,
    handleOverwriteConfirm,
    handleOverwriteCancel,
  };
}
