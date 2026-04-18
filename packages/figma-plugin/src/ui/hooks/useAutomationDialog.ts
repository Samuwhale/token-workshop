import { useState, useRef, useCallback, useMemo } from "react";
import type {
  TokenRecipe,
  RecipeType,
  RecipeConfig,
  GeneratedTokenResult,
  RecipeTemplate,
} from "./useRecipes";
import {
  detectRecipeType,
  suggestTargetGroup,
  autoName,
  defaultConfigForType,
  defaultInlineValueForType,
  isInlineValueCompatibleWithType,
  ALL_TYPES,
  VALUE_REQUIRED_TYPES,
} from "../components/recipes/recipeUtils";
import {
  useRecipePreview,
  type RecipePreviewAnalysis,
} from "./useAutomationPreview";
import {
  useRecipeSave,
  type RecipeSaveSuccessInfo,
} from "./useAutomationSave";
import type { UndoSlot } from "./useUndo";
import type { ToastAction } from "../shared/toastBus";
import { stableStringify } from "../shared/utils";

import type { OverwrittenEntry } from "./useAutomationPreview";
export type { OverwrittenEntry } from "./useAutomationPreview";

interface UseRecipeDialogParams {
  serverUrl: string;
  sourceTokenPath?: string;
  sourceTokenName?: string;
  sourceTokenType?: string;
  sourceTokenValue?: any;
  currentCollectionId: string;
  existingRecipe?: TokenRecipe;
  template?: RecipeTemplate;
  initialDraft?: RecipeDialogInitialDraft;
  /** Flat token map for source path lookups (used by recommendedType). */
  allTokensFlat?: Record<string, import("../../shared/types").TokenMapEntry>;
  /** Mode-resolved token map for previewing source values in the currently selected mode. */
  sourceValuesFlat?: Record<string, import("../../shared/types").TokenMapEntry>;
  onSaved: (info?: RecipeSaveSuccessInfo) => void;
  /** When provided, fires with semantic mapping data instead of showing SemanticMappingDialog internally */
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
}

export interface RecipeDialogInitialDraft {
  selectedType?: RecipeType;
  name?: string;
  nameIsAuto?: boolean;
  targetCollection?: string;
  targetGroup?: string;
  inlineValue?: unknown;
  configs?: Partial<Record<RecipeType, RecipeConfig>>;
  pendingOverrides?: Record<string, { value: unknown; locked: boolean }>;
  semanticEnabled?: boolean;
  semanticPrefix?: string;
  semanticMappings?: Array<{ semantic: string; step: string }>;
  selectedSemanticPatternId?: string | null;
}

function cloneRecipeDraftValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneOptionalDraftValue<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return cloneRecipeDraftValue(value);
}

type RecipeTemplateDraftSource = RecipeTemplate & {
  semanticStarter?: {
    prefix: string;
    mappings: Array<{ semantic: string; step: string }>;
    patternId?: string | null;
  };
};

interface RecipeDraftTemplateOptions {
  sourceTokenPath?: string;
  sourceTokenName?: string;
  targetGroup?: string;
}

export function createRecipeDraftFromTemplate(
  template: RecipeTemplateDraftSource,
  currentCollectionId: string,
  options: RecipeDraftTemplateOptions = {},
): RecipeDialogInitialDraft {
  const targetGroup =
    options.targetGroup ??
    (options.sourceTokenPath
      ? suggestTargetGroup(options.sourceTokenPath, options.sourceTokenName)
      : template.defaultPrefix);
  const semanticStarter = template.semanticStarter;
  return {
    selectedType: template.recipeType,
    name: options.sourceTokenPath
      ? autoName(options.sourceTokenPath, template.recipeType)
      : template.label,
    nameIsAuto: Boolean(options.sourceTokenPath),
    targetCollection: currentCollectionId,
    targetGroup,
    configs: {
      [template.recipeType]: cloneRecipeDraftValue(template.config),
    },
    semanticEnabled: Boolean(semanticStarter?.mappings.length),
    semanticPrefix: semanticStarter?.prefix,
    semanticMappings: semanticStarter?.mappings
      ? cloneRecipeDraftValue(semanticStarter.mappings)
      : undefined,
    selectedSemanticPatternId: semanticStarter?.patternId ?? null,
  };
}

interface RecipeDirtySnapshot {
  selectedType: RecipeType;
  name: string;
  targetCollection: string;
  targetGroup: string;
  editableSourcePath: string;
  inlineValue: unknown;
  configs: Partial<Record<RecipeType, RecipeConfig>>;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  semanticEnabled: boolean;
  semanticPrefix: string;
  semanticMappings: Array<{ semantic: string; step: string }>;
  selectedSemanticPatternId: string | null;
}

function createRecipeDirtySnapshot(
  snapshot: RecipeDirtySnapshot,
): RecipeDirtySnapshot {
  return {
    ...snapshot,
    inlineValue: cloneOptionalDraftValue(snapshot.inlineValue),
    configs: cloneRecipeDraftValue(snapshot.configs),
    pendingOverrides: cloneRecipeDraftValue(snapshot.pendingOverrides),
    semanticMappings: cloneRecipeDraftValue(snapshot.semanticMappings),
  };
}

function mergeRecipeDrafts(
  baseDraft: RecipeDialogInitialDraft | undefined,
  overrideDraft: RecipeDialogInitialDraft | undefined,
): RecipeDialogInitialDraft | undefined {
  if (!baseDraft && !overrideDraft) return undefined;

  return {
    ...baseDraft,
    ...overrideDraft,
    configs: {
      ...(baseDraft?.configs
        ? cloneRecipeDraftValue(baseDraft.configs)
        : {}),
      ...(overrideDraft?.configs
        ? cloneRecipeDraftValue(overrideDraft.configs)
        : {}),
    },
    pendingOverrides: overrideDraft?.pendingOverrides
      ? cloneRecipeDraftValue(overrideDraft.pendingOverrides)
      : baseDraft?.pendingOverrides
        ? cloneRecipeDraftValue(baseDraft.pendingOverrides)
        : undefined,
    semanticEnabled:
      overrideDraft?.semanticEnabled ?? baseDraft?.semanticEnabled,
    semanticPrefix: overrideDraft?.semanticPrefix ?? baseDraft?.semanticPrefix,
    semanticMappings: overrideDraft?.semanticMappings
      ? cloneRecipeDraftValue(overrideDraft.semanticMappings)
      : baseDraft?.semanticMappings
        ? cloneRecipeDraftValue(baseDraft.semanticMappings)
        : undefined,
    selectedSemanticPatternId:
      overrideDraft?.selectedSemanticPatternId ??
      baseDraft?.selectedSemanticPatternId,
  };
}

interface UseRecipeDialogReturn {
  // Derived
  isEditing: boolean;
  typeNeedsValue: boolean;
  hasSource: boolean;
  hasValue: boolean;
  availableTypes: RecipeType[];
  recommendedType: RecipeType | undefined;
  currentConfig: RecipeConfig;
  lockedCount: number;
  isDirty: boolean;
  // Config undo
  canUndo: boolean;
  canRedo: boolean;
  handleUndo: () => void;
  handleRedo: () => void;
  /** Call at the start of each discrete user interaction (drag begin, field focus).
   *  Flushes the pending snapshot from the previous interaction so each action
   *  gets its own undo entry. */
  handleConfigInteractionStart: () => void;
  // State
  selectedType: RecipeType;
  name: string;
  targetCollection: string;
  targetGroup: string;
  editableSourcePath: string;
  inlineValue: unknown;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  previewTokens: GeneratedTokenResult[];
  previewLoading: boolean;
  previewError: string;
  previewFingerprint: string;
  previewAnalysis: RecipePreviewAnalysis | null;
  overwrittenEntries: OverwrittenEntry[];
  existingOverwritePathSet: Set<string>;
  existingTokensError: string;
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
  // Handlers
  handleTypeChange: (type: RecipeType) => void;
  handleNameChange: (value: string) => void;
  setTargetCollection: (value: string) => void;
  setTargetGroup: (value: string) => void;
  setEditableSourcePath: (value: string) => void;
  setInlineValue: (value: unknown) => void;
  handleConfigChange: (type: RecipeType, cfg: RecipeConfig) => void;
  handleOverrideChange: (
    stepName: string,
    value: string,
    locked: boolean,
  ) => void;
  handleOverrideClear: (stepName: string) => void;
  clearAllOverrides: () => void;
  handleQuickSave: () => Promise<boolean>;
  handleSave: () => Promise<boolean>;
  handleConfirmSave: () => Promise<boolean>;
  handleCancelConfirmation: () => void;
  setSemanticEnabled: (v: boolean) => void;
  setSemanticPrefix: (v: string) => void;
  setSemanticMappings: (v: Array<{ semantic: string; step: string }>) => void;
  setSelectedSemanticPatternId: (v: string | null) => void;
}

export function useRecipeDialog({
  serverUrl,
  sourceTokenPath,
  sourceTokenName,
  sourceTokenType = "",
  sourceTokenValue,
  currentCollectionId,
  existingRecipe,
  template,
  initialDraft,
  allTokensFlat,
  sourceValuesFlat,
  onSaved,
  onInterceptSemanticMapping,
  getSuccessToastAction,
  pushUndo,
}: UseRecipeDialogParams): UseRecipeDialogReturn {
  const isEditing = Boolean(existingRecipe);
  const initialTemplateDraft = template
    ? createRecipeDraftFromTemplate(template, currentCollectionId)
    : undefined;
  const resolvedInitialDraft = mergeRecipeDrafts(
    initialTemplateDraft,
    initialDraft,
  );

  // Editable source token path — initialized from existingRecipe.sourceToken when editing,
  // or from the sourceTokenPath prop (clicked token) when creating.
  const [editableSourcePath, setEditableSourcePathRaw] = useState(
    existingRecipe?.sourceToken ?? sourceTokenPath ?? "",
  );

  const recommendedType = useMemo(() => {
    // Use the current editable source path so the recommendation reacts to
    // user changes, falling back to the initial props.
    const effectivePath = editableSourcePath || existingRecipe?.sourceToken || sourceTokenPath;
    if (!effectivePath) return undefined;
    // Look up the live token entry so we react to path edits in the dialog.
    const liveEntry = allTokensFlat?.[effectivePath];
    const effectiveType = liveEntry?.$type ?? sourceTokenType;
    const effectiveValue = liveEntry?.$value ?? sourceTokenValue;
    if (effectiveType) {
      return detectRecipeType(effectiveType, effectiveValue);
    }
    return undefined;
  }, [
    editableSourcePath,
    existingRecipe?.sourceToken,
    sourceTokenPath,
    sourceTokenType,
    sourceTokenValue,
    allTokensFlat,
  ]);

  const initialType: RecipeType =
    existingRecipe?.type ??
    resolvedInitialDraft?.selectedType ??
    recommendedType ??
    "colorRamp";
  const initialName =
    existingRecipe?.name ??
    resolvedInitialDraft?.name ??
    autoName(sourceTokenPath, initialType);
  const initialTargetCollection =
    existingRecipe?.targetCollection ??
    resolvedInitialDraft?.targetCollection ??
    currentCollectionId;
  const initialTargetGroup =
    existingRecipe?.targetGroup ??
    resolvedInitialDraft?.targetGroup ??
    (sourceTokenPath
      ? suggestTargetGroup(sourceTokenPath, sourceTokenName)
      : "");
  const initialSourcePath = existingRecipe?.sourceToken ?? sourceTokenPath ?? "";
  const initialInlineValue =
    existingRecipe?.inlineValue ??
    resolvedInitialDraft?.inlineValue ??
    (initialSourcePath ? undefined : defaultInlineValueForType(initialType));
  const initialConfigs: Partial<Record<RecipeType, RecipeConfig>> = {};
  for (const type of ALL_TYPES) {
    if (existingRecipe?.type === type) {
      initialConfigs[type] = cloneRecipeDraftValue(existingRecipe.config);
    } else if (resolvedInitialDraft?.configs?.[type]) {
      initialConfigs[type] = cloneRecipeDraftValue(
        resolvedInitialDraft.configs[type]!,
      );
    } else {
      initialConfigs[type] = defaultConfigForType(type);
    }
  }
  const initialPendingOverrides =
    existingRecipe?.overrides ??
    resolvedInitialDraft?.pendingOverrides ??
    {};
  const initialSemanticEnabled =
    resolvedInitialDraft?.semanticEnabled ??
    Boolean(existingRecipe?.semanticLayer?.mappings.length);
  const initialSemanticPrefix =
    resolvedInitialDraft?.semanticPrefix ??
    existingRecipe?.semanticLayer?.prefix ??
    "semantic";
  const initialSemanticMappings =
    resolvedInitialDraft?.semanticMappings ??
    existingRecipe?.semanticLayer?.mappings ??
    [];
  const initialSelectedSemanticPatternId =
    resolvedInitialDraft?.selectedSemanticPatternId ??
    existingRecipe?.semanticLayer?.patternId ??
    null;

  const [selectedType, setSelectedType] = useState<RecipeType>(initialType);
  const [name, setName] = useState(initialName);
  const [targetCollection, setTargetCollection] = useState(initialTargetCollection);
  const [targetGroup, setTargetGroup] = useState(initialTargetGroup);
  const [inlineValue, setInlineValueRaw] = useState<unknown>(initialInlineValue);

  const [configs, setConfigs] = useState<
    Partial<Record<RecipeType, RecipeConfig>>
  >(() => cloneRecipeDraftValue(initialConfigs));

  const [pendingOverrides, setPendingOverrides] = useState<
    Record<string, { value: unknown; locked: boolean }>
  >(() => cloneRecipeDraftValue(initialPendingOverrides));

  const nameWasAutoRef = useRef(
    resolvedInitialDraft?.nameIsAuto ??
      (!existingRecipe && !resolvedInitialDraft?.name),
  );
  const initialDirtySnapshotRef = useRef<RecipeDirtySnapshot>(
    createRecipeDirtySnapshot({
      selectedType: initialType,
      name: initialName,
      targetCollection: initialTargetCollection,
      targetGroup: initialTargetGroup,
      editableSourcePath: existingRecipe?.sourceToken ?? sourceTokenPath ?? "",
      inlineValue: initialInlineValue,
      configs: initialConfigs,
      pendingOverrides: initialPendingOverrides,
      semanticEnabled: initialSemanticEnabled,
      semanticPrefix: initialSemanticPrefix,
      semanticMappings: initialSemanticMappings,
      selectedSemanticPatternId: initialSelectedSemanticPatternId,
    }),
  );

  // --- Config undo/redo stack ---
  // Snapshots are debounced: rapid edits (keystrokes) are coalesced into one snapshot.
  // Type changes and preset selections push immediately.
  const MAX_UNDO = 20;
  const [configUndoStack, setConfigUndoStack] = useState<
    Array<{ type: RecipeType; config: RecipeConfig }>
  >([]);
  const [configRedoStack, setConfigRedoStack] = useState<
    Array<{ type: RecipeType; config: RecipeConfig }>
  >([]);
  const undoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSnapshotRef = useRef<{
    type: RecipeType;
    config: RecipeConfig;
  } | null>(null);

  const flushSnapshot = useCallback(() => {
    if (pendingSnapshotRef.current) {
      const snap = pendingSnapshotRef.current;
      pendingSnapshotRef.current = null;
      setConfigUndoStack((prev) => [...prev.slice(-MAX_UNDO + 1), snap]);
      setConfigRedoStack([]);
    }
  }, []);

  /** Push snapshot immediately (for discrete changes like type switch or preset). */
  const pushConfigSnapshot = useCallback(() => {
    // Flush any pending debounced snapshot first
    if (undoDebounceRef.current) {
      clearTimeout(undoDebounceRef.current);
      undoDebounceRef.current = null;
    }
    flushSnapshot();
    const currentCfg = configs[selectedType];
    if (!currentCfg) return;
    setConfigUndoStack((prev) => [
      ...prev.slice(-MAX_UNDO + 1),
      { type: selectedType, config: JSON.parse(JSON.stringify(currentCfg)) },
    ]);
    setConfigRedoStack([]);
  }, [configs, selectedType, flushSnapshot]);

  /** Queue a debounced snapshot (for continuous edits like slider/input). */
  const pushConfigSnapshotDebounced = useCallback(() => {
    const currentCfg = configs[selectedType];
    if (!currentCfg) return;
    // Only capture the snapshot if we don't already have a pending one
    if (!pendingSnapshotRef.current) {
      pendingSnapshotRef.current = {
        type: selectedType,
        config: JSON.parse(JSON.stringify(currentCfg)),
      };
    }
    if (undoDebounceRef.current) clearTimeout(undoDebounceRef.current);
    undoDebounceRef.current = setTimeout(flushSnapshot, 500);
  }, [configs, selectedType, flushSnapshot]);

  const canUndo = configUndoStack.length > 0;
  const canRedo = configRedoStack.length > 0;

  /** Flush any pending snapshot when a new discrete interaction starts (drag, focus).
   *  This ensures each distinct user action lands in its own undo slot rather than
   *  being coalesced with the previous one by the debounce. */
  const handleConfigInteractionStart = useCallback(() => {
    if (undoDebounceRef.current) {
      clearTimeout(undoDebounceRef.current);
      undoDebounceRef.current = null;
    }
    flushSnapshot();
    // pendingSnapshotRef is now null — the first onChange from the new interaction
    // will capture the pre-interaction state via pushConfigSnapshotDebounced.
  }, [flushSnapshot]);

  const handleUndo = useCallback(() => {
    if (configUndoStack.length === 0) return;
    const currentCfg = configs[selectedType];
    if (currentCfg) {
      setConfigRedoStack((prev) => [
        ...prev,
        { type: selectedType, config: JSON.parse(JSON.stringify(currentCfg)) },
      ]);
    }
    const snapshot = configUndoStack[configUndoStack.length - 1];
    setConfigUndoStack((prev) => prev.slice(0, -1));
    setSelectedType(snapshot.type);
    setConfigs((prev) => ({ ...prev, [snapshot.type]: snapshot.config }));
  }, [configUndoStack, configs, selectedType]);

  const handleRedo = useCallback(() => {
    if (configRedoStack.length === 0) return;
    const currentCfg = configs[selectedType];
    if (currentCfg) {
      setConfigUndoStack((prev) => [
        ...prev,
        { type: selectedType, config: JSON.parse(JSON.stringify(currentCfg)) },
      ]);
    }
    const snapshot = configRedoStack[configRedoStack.length - 1];
    setConfigRedoStack((prev) => prev.slice(0, -1));
    setSelectedType(snapshot.type);
    setConfigs((prev) => ({ ...prev, [snapshot.type]: snapshot.config }));
  }, [configRedoStack, configs, selectedType]);

  // Derived values
  const typeNeedsValue = VALUE_REQUIRED_TYPES.includes(selectedType);
  const hasSource = Boolean(editableSourcePath.trim());
  const hasInlineValue = inlineValue !== undefined && inlineValue !== "";
  const hasValue = hasSource || hasInlineValue;
  // All types available — inline values unlock source-requiring types
  const availableTypes = ALL_TYPES;
  const currentConfig = configs[selectedType]!;
  const lockedCount = Object.values(pendingOverrides).filter(
    (o) => o.locked,
  ).length;
  const [previewRefreshNonce, setPreviewRefreshNonce] = useState(0);

  // --- Sub-hooks ---

  const effectiveSourcePath = editableSourcePath.trim() || undefined;
  const previewSourceValue =
    (effectiveSourcePath && sourceValuesFlat?.[effectiveSourcePath]?.$value) ??
    (effectiveSourcePath === sourceTokenPath ? sourceTokenValue : undefined);

  const {
    previewTokens,
    previewLoading,
    previewError,
    existingTokensError,
    overwrittenEntries,
    existingOverwritePathSet,
    previewFingerprint,
    previewAnalysis,
  } = useRecipePreview({
    serverUrl,
    selectedType,
    sourceTokenPath: effectiveSourcePath,
    inlineValue,
    sourceValue: previewSourceValue,
    targetGroup,
    targetCollection,
    config: currentConfig,
    pendingOverrides,
    existingRecipeId: existingRecipe?.id,
    detachedPaths: existingRecipe?.detachedPaths,
    refreshNonce: previewRefreshNonce,
  });

  const {
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
  } = useRecipeSave({
    serverUrl,
    isEditing,
    existingRecipe,
    selectedType,
    name,
    sourceTokenPath: effectiveSourcePath,
    inlineValue,
    sourceValue: previewSourceValue,
    targetCollection,
    targetGroup,
    config: currentConfig,
    pendingOverrides,
    typeNeedsValue,
    hasValue,
    previewTokens,
    previewFingerprint,
    previewAnalysis,
    onSaved,
    onInterceptSemanticMapping,
    getSuccessToastAction,
    pushUndo,
    requestPreviewRefresh: () =>
      setPreviewRefreshNonce((current) => current + 1),
    initialSemanticEnabled,
    initialSemanticPrefix,
    initialSemanticMappings,
    initialSelectedSemanticPatternId,
  });
  const isDirty = useMemo(() => {
    const initialSnapshot = initialDirtySnapshotRef.current;
    const currentSnapshot = createRecipeDirtySnapshot({
      selectedType,
      name,
      targetCollection,
      targetGroup,
      editableSourcePath,
      inlineValue,
      configs,
      pendingOverrides,
      semanticEnabled,
      semanticPrefix,
      semanticMappings,
      selectedSemanticPatternId,
    });
    return (
      stableStringify(currentSnapshot) !== stableStringify(initialSnapshot)
    );
  }, [
    configs,
    editableSourcePath,
    inlineValue,
    name,
    pendingOverrides,
    selectedSemanticPatternId,
    selectedType,
    semanticEnabled,
    semanticMappings,
    semanticPrefix,
    targetGroup,
    targetCollection,
  ]);

  // --- Config handlers ---

  const handleTypeChange = (type: RecipeType) => {
    pushConfigSnapshot();
    setSelectedType(type);
    if (nameWasAutoRef.current) setName(autoName(effectiveSourcePath, type));
    if (editableSourcePath.trim()) return;
    setInlineValueRaw((currentValue: unknown) => {
      if (isInlineValueCompatibleWithType(type, currentValue)) {
        return currentValue;
      }
      return cloneOptionalDraftValue(defaultInlineValueForType(type));
    });
  };

  const setEditableSourcePath = useCallback(
    (v: string) => {
      setEditableSourcePathRaw(v);
      if (nameWasAutoRef.current)
        setName(autoName(v.trim() || undefined, selectedType));
    },
    [selectedType],
  );

  const handleNameChange = (value: string) => {
    nameWasAutoRef.current = false;
    setName(value);
  };

  const handleConfigChange = (type: RecipeType, cfg: RecipeConfig) => {
    pushConfigSnapshotDebounced();
    setConfigs((prev) => ({ ...prev, [type]: cfg }));
  };

  const handleOverrideChange = (
    stepName: string,
    value: string,
    locked: boolean,
  ) => {
    setPendingOverrides((prev) => ({ ...prev, [stepName]: { value, locked } }));
  };

  const handleOverrideClear = (stepName: string) => {
    setPendingOverrides((prev) => {
      const next = { ...prev };
      delete next[stepName];
      return next;
    });
  };

  const clearAllOverrides = () => {
    setPendingOverrides({});
  };

  const setTargetCollectionDirty = useCallback(
    (v: string) => {
      setTargetCollection(v);
    },
    [],
  );
  const setTargetGroupDirty = useCallback(
    (v: string) => {
      setTargetGroup(v);
    },
    [],
  );
  const setInlineValue = useCallback(
    (v: unknown) => {
      setInlineValueRaw(v);
    },
    [],
  );
  const setSemanticEnabledDirty = useCallback(
    (value: boolean) => {
      setSemanticEnabled(value);
    },
    [setSemanticEnabled],
  );
  const setSemanticPrefixDirty = useCallback(
    (value: string) => {
      setSemanticPrefix(value);
    },
    [setSemanticPrefix],
  );
  const setSemanticMappingsDirty = useCallback(
    (value: Array<{ semantic: string; step: string }>) => {
      setSemanticMappings(value);
    },
    [setSemanticMappings],
  );
  const setSelectedSemanticPatternIdDirty = useCallback(
    (value: string | null) => {
      setSelectedSemanticPatternId(value);
    },
    [setSelectedSemanticPatternId],
  );

  return {
    // Derived
    isEditing,
    typeNeedsValue,
    hasSource,
    hasValue,
    availableTypes,
    recommendedType,
    currentConfig,
    lockedCount,
    isDirty,
    // Config undo
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
    handleConfigInteractionStart,
    // State
    selectedType,
    name,
    targetCollection,
    targetGroup,
    editableSourcePath,
    inlineValue,
    pendingOverrides,
    previewTokens,
    previewLoading,
    previewError,
    previewFingerprint,
    previewAnalysis,
    overwrittenEntries,
    existingOverwritePathSet,
    existingTokensError,
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
    // Handlers
    handleTypeChange,
    handleNameChange,
    setTargetCollection: setTargetCollectionDirty,
    setTargetGroup: setTargetGroupDirty,
    setEditableSourcePath,
    setInlineValue,
    handleConfigChange,
    handleOverrideChange,
    handleOverrideClear,
    clearAllOverrides,
    handleQuickSave,
    handleSave,
    handleConfirmSave,
    handleCancelConfirmation,
    setSemanticEnabled: setSemanticEnabledDirty,
    setSemanticPrefix: setSemanticPrefixDirty,
    setSemanticMappings: setSemanticMappingsDirty,
    setSelectedSemanticPatternId: setSelectedSemanticPatternIdDirty,
  };
}
