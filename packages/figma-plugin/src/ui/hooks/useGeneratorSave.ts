import { useState, useCallback, useRef } from "react";
import { getErrorMessage } from "../shared/utils";
import { apiFetch } from "../shared/apiFetch";
import { dispatchToast } from "../shared/toastBus";
import type { ToastAction } from "../shared/toastBus";
import type { UndoSlot } from "./useUndo";
import type {
  TokenGenerator,
  GeneratorType,
  GeneratorConfig,
  GeneratorSemanticLayer,
  GeneratedTokenResult,
  InputTable,
} from "./useGenerators";
import {
  requestGeneratorPreview,
  type GeneratorPreviewAnalysis,
} from "./useGeneratorPreview";

export interface GeneratorSaveSuccessInfo {
  targetGroup: string;
  targetSet: string;
}

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
  previewFingerprint: string;
  previewAnalysis: GeneratorPreviewAnalysis | null;
  onSaved: (info?: GeneratorSaveSuccessInfo) => void;
  onInterceptSemanticMapping?: (data: {
    tokens: GeneratedTokenResult[];
    targetGroup: string;
    targetSet: string;
    generatorType: GeneratorType;
  }) => void;
  getSuccessToastAction?: (
    info: GeneratorSaveSuccessInfo,
  ) => ToastAction | undefined;
  pushUndo?: (slot: UndoSlot) => void;
  requestPreviewRefresh: () => void;
  initialSemanticEnabled: boolean;
  initialSemanticPrefix: string;
  initialSemanticMappings: Array<{ semantic: string; step: string }>;
  initialSelectedSemanticPatternId: string | null;
}

export interface UseGeneratorSaveReturn {
  saving: boolean;
  saveError: string;
  showConfirmation: boolean;
  previewReviewStale: boolean;
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
  previewTokens: _previewTokens,
  previewFingerprint,
  previewAnalysis,
  onSaved,
  onInterceptSemanticMapping: _onInterceptSemanticMapping,
  getSuccessToastAction,
  pushUndo,
  requestPreviewRefresh,
  initialSemanticEnabled,
  initialSemanticPrefix,
  initialSemanticMappings,
  initialSelectedSemanticPatternId,
}: UseGeneratorSaveParams): UseGeneratorSaveReturn {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [previewReviewStale, setPreviewReviewStale] = useState(false);
  const [reviewedPreviewFingerprint, setReviewedPreviewFingerprint] = useState("");
  const [overwritePendingPaths, setOverwritePendingPaths] = useState<string[]>(
    () => previewAnalysis?.manualEditConflicts.map((entry) => entry.path) ?? [],
  );
  const [overwriteCheckLoading, setOverwriteCheckLoading] = useState(false);
  const [overwriteCheckError, setOverwriteCheckError] = useState("");
  const [semanticEnabled, setSemanticEnabled] = useState(initialSemanticEnabled);
  const [semanticPrefix, setSemanticPrefix] = useState(initialSemanticPrefix);
  const [semanticMappings, setSemanticMappings] = useState<
    Array<{ semantic: string; step: string }>
  >(initialSemanticMappings);
  const [selectedSemanticPatternId, setSelectedSemanticPatternId] = useState<
    string | null
  >(initialSelectedSemanticPatternId);
  const overwriteCheckRequestIdRef = useRef(0);
  const getToastAction = useCallback(
    (targetGroupAtSave: string, targetSetAtSave: string) =>
      getSuccessToastAction?.({
        targetGroup: targetGroupAtSave,
        targetSet: targetSetAtSave,
      }),
    [getSuccessToastAction],
  );

  const validateBeforeSave = useCallback((): boolean => {
    if (!targetGroup.trim()) {
      setSaveError("Target group is required.");
      return false;
    }
    if (!name.trim()) {
      setSaveError("Generator name is required.");
      return false;
    }
    if (!isMultiBrand && typeNeedsValue && !hasValue) {
      setSaveError(
        "This generator type requires a source token or base value.",
      );
      return false;
    }
    if (isMultiBrand && inputTable) {
      if (!targetSetTemplate.trim()) {
        setSaveError("Target set template is required for multi-brand mode.");
        return false;
      }
      if (inputTable.rows.some((r) => !r.brand.trim())) {
        setSaveError("All brand rows must have a non-empty brand name.");
        return false;
      }
      const brandNames = inputTable.rows.map((r) =>
        r.brand.trim().toLowerCase(),
      );
      const duplicate = brandNames.find((b, i) => brandNames.indexOf(b) !== i);
      if (duplicate) {
        const duplicateName =
          inputTable.rows
            .find((r) => r.brand.trim().toLowerCase() === duplicate)
            ?.brand.trim() ?? duplicate;
        setSaveError(
          `Duplicate brand name "${duplicateName}" — each brand name must be unique.`,
        );
        return false;
      }
    }
    setSaveError("");
    return true;
  }, [
    targetGroup,
    name,
    isMultiBrand,
    typeNeedsValue,
    hasValue,
    inputTable,
    targetSetTemplate,
  ]);

  /** Inner save logic — commits the generator to the server. */
  const commitSave = useCallback(
    async (
      semanticEnabledAtSave: boolean,
      semanticPrefixAtSave: string,
      semanticMappingsAtSave: Array<{ semantic: string; step: string }>,
      targetGroupAtSave: string,
      targetSetAtSave: string,
    ) => {
      setSaving(true);
      setSaveError("");
      try {
        const body = {
          type: selectedType,
          name: name.trim(),
          sourceToken: isMultiBrand ? undefined : sourceTokenPath || undefined,
          inlineValue:
            !sourceTokenPath && inlineValue !== undefined && inlineValue !== ""
              ? inlineValue
              : undefined,
          targetSet: targetSetAtSave,
          targetGroup: targetGroupAtSave,
          config,
          semanticLayer:
            semanticEnabledAtSave &&
            semanticPrefixAtSave.trim() &&
            semanticMappingsAtSave.some((mapping) => mapping.semantic.trim())
              ? ({
                  prefix: semanticPrefixAtSave.trim(),
                  mappings: semanticMappingsAtSave.filter(
                    (mapping) => mapping.semantic.trim() && mapping.step,
                  ),
                  patternId: selectedSemanticPatternId,
                } satisfies GeneratorSemanticLayer)
              : null,
          overrides:
            Object.keys(pendingOverrides).length > 0
              ? pendingOverrides
              : undefined,
          ...(isMultiBrand && inputTable
            ? { inputTable, targetSetTemplate: targetSetTemplate.trim() }
            : {}),
        };
        const saveUrl =
          isEditing && existingGenerator
            ? `${serverUrl}/api/generators/${existingGenerator.id}`
            : `${serverUrl}/api/generators`;
        const savedGen = await apiFetch<{ id: string }>(saveUrl, {
          method: isEditing && existingGenerator ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
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
              semanticLayer: prevGen.semanticLayer ?? null,
              overrides: prevGen.overrides,
              inputTable: prevGen.inputTable,
              targetSetTemplate: prevGen.targetSetTemplate,
            };
            pushUndo({
              description: `Edited generator "${prevGen.name}"`,
              restore: async () => {
                await apiFetch(`${serverUrl}/api/generators/${prevGen.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(prevBody),
                });
              },
              redo: async () => {
                await apiFetch(`${serverUrl}/api/generators/${prevGen.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
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
                await apiFetch(
                  `${serverUrl}/api/generators/${newId}?deleteTokens=true`,
                  { method: "DELETE" },
                );
              },
            });
          }
        }

        setSaving(false);
        dispatchToast(
          isEditing
            ? `Generator "${name.trim()}" updated`
            : `Generator "${name.trim()}" created`,
          "success",
          getToastAction(targetGroupAtSave, targetSetAtSave),
        );
        onSaved({
          targetGroup: targetGroupAtSave,
          targetSet: targetSetAtSave,
        });
      } catch (err) {
        setSaveError(getErrorMessage(err));
        setSaving(false);
      }
    },
    [
      serverUrl,
      isEditing,
      existingGenerator,
      selectedType,
      name,
      sourceTokenPath,
      inlineValue,
      config,
      pendingOverrides,
      isMultiBrand,
      inputTable,
      targetSetTemplate,
      onSaved,
      getToastAction,
      pushUndo,
      selectedSemanticPatternId,
    ],
  );

  const revalidatePreview = useCallback(async () => {
    const requestId = overwriteCheckRequestIdRef.current + 1;
    overwriteCheckRequestIdRef.current = requestId;
    setOverwriteCheckLoading(true);
    setOverwriteCheckError("");

    try {
      const latestPreview = await requestGeneratorPreview({
        serverUrl,
        selectedType,
        sourceTokenPath: isMultiBrand ? undefined : sourceTokenPath,
        inlineValue,
        targetGroup,
        targetSet,
        config,
        pendingOverrides,
        baseGeneratorId: existingGenerator?.id,
        detachedPaths: existingGenerator?.detachedPaths,
        inputTable: isMultiBrand ? inputTable : undefined,
        targetSetTemplate: isMultiBrand ? targetSetTemplate : undefined,
      });
      if (overwriteCheckRequestIdRef.current !== requestId) return false;
      setOverwritePendingPaths(
        latestPreview.analysis.manualEditConflicts.map((entry) => entry.path),
      );
      if (
        reviewedPreviewFingerprint &&
        latestPreview.analysis.fingerprint !== reviewedPreviewFingerprint
      ) {
        requestPreviewRefresh();
        setPreviewReviewStale(true);
        setSaveError(
          "Preview changed since you reviewed it. Review the updated conflicts before saving.",
        );
        return false;
      }
      return true;
    } catch (err) {
      if (overwriteCheckRequestIdRef.current !== requestId) return false;
      setOverwriteCheckError(
        `Could not revalidate the latest preview: ${getErrorMessage(err)}`,
      );
      return false;
    } finally {
      if (overwriteCheckRequestIdRef.current === requestId) {
        setOverwriteCheckLoading(false);
      }
    }
  }, [
    config,
    existingGenerator,
    inlineValue,
    inputTable,
    isMultiBrand,
    pendingOverrides,
    requestPreviewRefresh,
    reviewedPreviewFingerprint,
    selectedType,
    serverUrl,
    sourceTokenPath,
    targetGroup,
    targetSet,
    targetSetTemplate,
  ]);

  /** Step 1: Validate inputs and show the confirmation preview.
   *  Save captures the reviewed preview fingerprint so confirm can detect staleness.
   */
  const handleSave = useCallback(async () => {
    if (!validateBeforeSave()) return;
    setReviewedPreviewFingerprint(previewFingerprint);
    setPreviewReviewStale(false);
    setOverwritePendingPaths(
      previewAnalysis?.manualEditConflicts.map((entry) => entry.path) ?? [],
    );
    setOverwriteCheckError("");
    setShowConfirmation(true);
  }, [previewAnalysis, previewFingerprint, validateBeforeSave]);

  const handleQuickSave = useCallback(async () => {
    if (!validateBeforeSave()) return;
    setReviewedPreviewFingerprint(previewFingerprint);
    const revalidated = await revalidatePreview();
    if (!revalidated) return;
    await commitSave(
      semanticEnabled,
      semanticPrefix,
      semanticMappings,
      targetGroup.trim(),
      targetSet,
    );
  }, [
    validateBeforeSave,
    commitSave,
    previewFingerprint,
    revalidatePreview,
    semanticEnabled,
    semanticPrefix,
    semanticMappings,
    targetGroup,
    targetSet,
  ]);

  /** Step 2: Commit the save. Overwrites are already known (shown in review view).
   *  The server applies semantic aliases together with the generator run.
   */
  const handleConfirmSave = useCallback(async () => {
    if (previewReviewStale) {
      if (!previewFingerprint) {
        setSaveError("Refreshing preview…");
        return;
      }
      setReviewedPreviewFingerprint(previewFingerprint);
      setPreviewReviewStale(false);
      setSaveError("");
      return;
    }
    const revalidated = await revalidatePreview();
    if (!revalidated) return;
    await commitSave(
      semanticEnabled,
      semanticPrefix,
      semanticMappings,
      targetGroup.trim(),
      targetSet,
    );
  }, [
    commitSave,
    previewFingerprint,
    previewReviewStale,
    revalidatePreview,
    semanticEnabled,
    semanticPrefix,
    semanticMappings,
    targetGroup,
    targetSet,
  ]);

  const handleCancelConfirmation = useCallback(() => {
    setShowConfirmation(false);
    setPreviewReviewStale(false);
    setReviewedPreviewFingerprint("");
    setOverwritePendingPaths(
      previewAnalysis?.manualEditConflicts.map((entry) => entry.path) ?? [],
    );
    setOverwriteCheckLoading(false);
    setOverwriteCheckError("");
  }, [previewAnalysis]);

  return {
    saving,
    saveError,
    showConfirmation,
    previewReviewStale,
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
