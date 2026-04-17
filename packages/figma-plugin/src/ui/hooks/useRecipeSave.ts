import { useState, useCallback, useRef } from "react";
import { getErrorMessage } from "../shared/utils";
import { apiFetch } from "../shared/apiFetch";
import { dispatchToast } from "../shared/toastBus";
import type { ToastAction } from "../shared/toastBus";
import type { UndoSlot } from "./useUndo";
import type {
  TokenRecipe,
  RecipeType,
  RecipeConfig,
  RecipeSemanticLayer,
  GeneratedTokenResult,
  InputTable,
} from "./useRecipes";
import {
  requestRecipePreview,
  hasPreviewRisks,
  type RecipePreviewAnalysis,
} from "./useRecipePreview";

export interface RecipeSaveSuccessInfo {
  targetGroup: string;
  targetCollection: string;
}

interface UseRecipeSaveParams {
  serverUrl: string;
  isEditing: boolean;
  existingRecipe?: TokenRecipe;
  selectedType: RecipeType;
  name: string;
  sourceTokenPath?: string;
  inlineValue?: unknown;
  targetCollection: string;
  targetGroup: string;
  config: RecipeConfig;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  isMultiBrand: boolean;
  inputTable: InputTable | undefined;
  targetCollectionTemplate: string;
  typeNeedsValue: boolean;
  hasValue: boolean;
  previewTokens: GeneratedTokenResult[];
  previewFingerprint: string;
  previewAnalysis: RecipePreviewAnalysis | null;
  onSaved: (info?: RecipeSaveSuccessInfo) => void;
  onInterceptSemanticMapping?: (data: {
    tokens: GeneratedTokenResult[];
    targetGroup: string;
    targetCollection: string;
    recipeType: RecipeType;
  }) => void;
  getSuccessToastAction?: (
    info: RecipeSaveSuccessInfo,
  ) => ToastAction | undefined;
  pushUndo?: (slot: UndoSlot) => void;
  requestPreviewRefresh: () => void;
  initialSemanticEnabled: boolean;
  initialSemanticPrefix: string;
  initialSemanticMappings: Array<{ semantic: string; step: string }>;
  initialSelectedSemanticPatternId: string | null;
}

export interface UseRecipeSaveReturn {
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
  handleQuickSave: () => Promise<boolean>;
  handleSave: () => Promise<boolean>;
  handleConfirmSave: () => Promise<boolean>;
  handleCancelConfirmation: () => void;
  setSemanticEnabled: (v: boolean) => void;
  setSemanticPrefix: (v: string) => void;
  setSemanticMappings: (v: Array<{ semantic: string; step: string }>) => void;
  setSelectedSemanticPatternId: (v: string | null) => void;
}

export function useRecipeSave({
  serverUrl,
  isEditing,
  existingRecipe,
  selectedType,
  name,
  sourceTokenPath,
  inlineValue,
  targetCollection,
  targetGroup,
  config,
  pendingOverrides,
  isMultiBrand,
  inputTable,
  targetCollectionTemplate,
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
}: UseRecipeSaveParams): UseRecipeSaveReturn {
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
    (targetGroupAtSave: string, targetCollectionAtSave: string) =>
      getSuccessToastAction?.({
        targetGroup: targetGroupAtSave,
        targetCollection: targetCollectionAtSave,
      }),
    [getSuccessToastAction],
  );

  const validateBeforeSave = useCallback((): boolean => {
    if (!targetGroup.trim()) {
      setSaveError("Target group is required.");
      return false;
    }
    if (!name.trim()) {
      setSaveError("Recipe name is required.");
      return false;
    }
    if (!isMultiBrand && typeNeedsValue && !hasValue) {
      setSaveError(
        "This recipe type requires a source token or base value.",
      );
      return false;
    }
    if (isMultiBrand && inputTable) {
      if (!targetCollectionTemplate.trim()) {
        setSaveError("Target collection template is required for multi-brand mode.");
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
    targetCollectionTemplate,
  ]);

  /** Inner save logic — commits the recipe to the server. */
  const commitSave = useCallback(
    async (
      semanticEnabledAtSave: boolean,
      semanticPrefixAtSave: string,
      semanticMappingsAtSave: Array<{ semantic: string; step: string }>,
      targetGroupAtSave: string,
      targetCollectionAtSave: string,
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
          targetCollection: targetCollectionAtSave,
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
                } satisfies RecipeSemanticLayer)
              : null,
          overrides:
            Object.keys(pendingOverrides).length > 0
              ? pendingOverrides
              : undefined,
          ...(isMultiBrand && inputTable
            ? { inputTable, targetCollectionTemplate: targetCollectionTemplate.trim() }
            : {}),
        };
        const saveUrl =
          isEditing && existingRecipe
            ? `${serverUrl}/api/recipes/${existingRecipe.id}`
            : `${serverUrl}/api/recipes`;
        const savedGen = await apiFetch<{ id: string }>(saveUrl, {
          method: isEditing && existingRecipe ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        setShowConfirmation(false);

        if (pushUndo) {
          if (isEditing && existingRecipe) {
            const prevGen = existingRecipe;
            const prevBody = {
              type: prevGen.type,
              name: prevGen.name,
              sourceToken: prevGen.sourceToken,
              inlineValue: prevGen.inlineValue,
              targetCollection: prevGen.targetCollection,
              targetGroup: prevGen.targetGroup,
              config: prevGen.config,
              semanticLayer: prevGen.semanticLayer ?? null,
              overrides: prevGen.overrides,
              inputTable: prevGen.inputTable,
              targetCollectionTemplate: prevGen.targetCollectionTemplate,
            };
            pushUndo({
              description: `Edited recipe "${prevGen.name}"`,
              restore: async () => {
                await apiFetch(`${serverUrl}/api/recipes/${prevGen.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(prevBody),
                });
              },
              redo: async () => {
                await apiFetch(`${serverUrl}/api/recipes/${prevGen.id}`, {
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
              description: `Created recipe "${genName}"`,
              restore: async () => {
                await apiFetch(
                  `${serverUrl}/api/recipes/${newId}?deleteTokens=true`,
                  { method: "DELETE" },
                );
              },
            });
          }
        }

        setSaving(false);
        dispatchToast(
          isEditing
            ? `Recipe "${name.trim()}" updated`
            : `Recipe "${name.trim()}" created`,
          "success",
          getToastAction(targetGroupAtSave, targetCollectionAtSave),
        );
        onSaved({
          targetGroup: targetGroupAtSave,
          targetCollection: targetCollectionAtSave,
        });
        return true;
      } catch (err) {
        setSaveError(getErrorMessage(err));
        setSaving(false);
        return false;
      }
    },
    [
      serverUrl,
      isEditing,
      existingRecipe,
      selectedType,
      name,
      sourceTokenPath,
      inlineValue,
      config,
      pendingOverrides,
      isMultiBrand,
      inputTable,
      targetCollectionTemplate,
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
      const latestPreview = await requestRecipePreview({
        serverUrl,
        selectedType,
        sourceTokenPath: isMultiBrand ? undefined : sourceTokenPath,
        inlineValue,
        targetGroup,
        targetCollection,
        config,
        pendingOverrides,
        baseRecipeId: existingRecipe?.id,
        detachedPaths: existingRecipe?.detachedPaths,
        inputTable: isMultiBrand ? inputTable : undefined,
        targetCollectionTemplate: isMultiBrand ? targetCollectionTemplate : undefined,
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
    existingRecipe,
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
    targetCollection,
    targetCollectionTemplate,
  ]);

  /** Step 1: Validate inputs and either commit directly (no risks) or show
   *  the confirmation preview. Captures the reviewed preview fingerprint so
   *  confirm can detect staleness.
   */
  const handleSave = useCallback(async () => {
    if (!validateBeforeSave()) return false;

    setReviewedPreviewFingerprint(previewFingerprint);

    // No risks — skip confirmation and commit directly
    if (!hasPreviewRisks(previewAnalysis)) {
      const revalidated = await revalidatePreview();
      if (revalidated) {
        return commitSave(
          semanticEnabled,
          semanticPrefix,
          semanticMappings,
          targetGroup.trim(),
          targetCollection,
        );
      }
      // Revalidation revealed issues — show confirmation so user can review
      setShowConfirmation(true);
      return false;
    }

    // Has risks — show confirmation screen
    setPreviewReviewStale(false);
    setOverwritePendingPaths(
      previewAnalysis?.manualEditConflicts.map((entry) => entry.path) ?? [],
    );
    setOverwriteCheckError("");
    setShowConfirmation(true);
    return false;
  }, [
    commitSave,
    previewAnalysis,
    previewFingerprint,
    revalidatePreview,
    semanticEnabled,
    semanticMappings,
    semanticPrefix,
    targetGroup,
    targetCollection,
    validateBeforeSave,
  ]);

  const handleQuickSave = useCallback(async () => {
    if (!validateBeforeSave()) return false;
    setReviewedPreviewFingerprint(previewFingerprint);
    const revalidated = await revalidatePreview();
    if (!revalidated) return false;
    return commitSave(
      semanticEnabled,
      semanticPrefix,
      semanticMappings,
      targetGroup.trim(),
      targetCollection,
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
    targetCollection,
  ]);

  /** Step 2: Commit the save. Overwrites are already known (shown in review view).
   *  The server applies semantic aliases together with the recipe run.
   */
  const handleConfirmSave = useCallback(async () => {
    if (previewReviewStale) {
      if (!previewFingerprint) {
        setSaveError("Refreshing preview…");
        return false;
      }
      setReviewedPreviewFingerprint(previewFingerprint);
      setPreviewReviewStale(false);
      setSaveError("");
      return false;
    }
    const revalidated = await revalidatePreview();
    if (!revalidated) return false;
    return commitSave(
      semanticEnabled,
      semanticPrefix,
      semanticMappings,
      targetGroup.trim(),
      targetCollection,
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
    targetCollection,
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
