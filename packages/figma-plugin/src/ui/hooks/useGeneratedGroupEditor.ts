import { useState, useRef, useCallback, useMemo } from "react";
import type {
  TokenGenerator,
  GeneratorType,
  GeneratorConfig,
  GeneratedTokenResult,
  GeneratorTemplate,
} from "./useGenerators";
import {
  detectGeneratorType,
  suggestTargetGroup,
  autoName,
  autoNameFromGroup,
  defaultConfigForType,
  defaultInlineValueForType,
  isInlineValueCompatibleWithType,
  ALL_TYPES,
  VALUE_REQUIRED_TYPES,
} from "../components/generators/generatorUtils";
import {
  useGeneratedGroupPreview,
  type GeneratorPreviewAnalysis,
} from "./useGeneratedGroupPreview";
import {
  useGeneratedGroupSave,
  type GeneratorSaveSuccessInfo,
} from "./useGeneratedGroupSave";
import type { UndoSlot } from "./useUndo";
import type { ToastAction } from "../shared/toastBus";
import { stableStringify } from "../shared/utils";
import { cloneValue } from "../../shared/clone";

import type { OverwrittenEntry } from "./useGeneratedGroupPreview";
export type { OverwrittenEntry } from "./useGeneratedGroupPreview";

interface UseGeneratorDialogParams {
  serverUrl: string;
  sourceTokenPath?: string;
  sourceTokenName?: string;
  sourceTokenType?: string;
  sourceTokenValue?: any;
  currentCollectionId: string;
  existingGenerator?: TokenGenerator;
  template?: GeneratorTemplate;
  initialDraft?: GeneratorDialogInitialDraft;
  /** Flat token map for source path lookups (used by recommendedType). */
  allTokensFlat?: Record<string, import("../../shared/types").TokenMapEntry>;
  /** Mode-resolved token map for previewing source values in the currently selected mode. */
  sourceValuesFlat?: Record<string, import("../../shared/types").TokenMapEntry>;
  onSaved: (info?: GeneratorSaveSuccessInfo) => void;
  /** When provided, fires with semantic mapping data instead of showing SemanticMappingDialog internally */
  onInterceptSemanticMapping?: (data: {
    tokens: GeneratedTokenResult[];
    targetGroup: string;
    targetCollection: string;
    generatorType: GeneratorType;
  }) => void;
  getSuccessToastAction?: (
    info: GeneratorSaveSuccessInfo,
  ) => ToastAction | undefined;
  pushUndo?: (slot: UndoSlot) => void;
}

export interface GeneratorDialogInitialDraft {
  selectedType?: GeneratorType;
  name?: string;
  nameIsAuto?: boolean;
  targetCollection?: string;
  targetGroup?: string;
  inlineValue?: unknown;
  configs?: Partial<Record<GeneratorType, GeneratorConfig>>;
  pendingOverrides?: Record<string, { value: unknown; locked: boolean }>;
  keepUpdated?: boolean;
  semanticEnabled?: boolean;
  semanticPrefix?: string;
  semanticMappings?: Array<{ semantic: string; step: string }>;
  selectedSemanticPatternId?: string | null;
}

type GeneratorTemplateDraftSource = GeneratorTemplate & {
  semanticStarter?: {
    prefix: string;
    mappings: Array<{ semantic: string; step: string }>;
    patternId?: string | null;
  };
};

interface GeneratorDraftTemplateOptions {
  sourceTokenPath?: string;
  sourceTokenName?: string;
  targetGroup?: string;
}

function appendCopySuffix(value: string, separator: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "copy";
  }

  const suffixPattern =
    separator === "-"
      ? /-copy(?:-(\d+))?$/i
      : / copy(?: (\d+))?$/i;
  const match = trimmed.match(suffixPattern);
  if (!match) {
    return `${trimmed}${separator}copy`;
  }

  const nextIndex = Number.parseInt(match[1] ?? "1", 10) + 1;
  return trimmed.replace(
    suffixPattern,
    separator === "-" ? `-copy-${nextIndex}` : ` copy ${nextIndex}`,
  );
}

export function createGeneratorDraftFromTemplate(
  template: GeneratorTemplateDraftSource,
  currentCollectionId: string,
  options: GeneratorDraftTemplateOptions = {},
): GeneratorDialogInitialDraft {
  const targetGroup =
    options.targetGroup ??
    (options.sourceTokenPath
      ? suggestTargetGroup(options.sourceTokenPath, options.sourceTokenName)
      : template.defaultPrefix);
  const semanticStarter = template.semanticStarter;
  return {
    selectedType: template.generatorType,
    name: options.sourceTokenPath
      ? autoName(options.sourceTokenPath, template.generatorType)
      : template.label,
    nameIsAuto: Boolean(options.sourceTokenPath),
    targetCollection: currentCollectionId,
    targetGroup,
    configs: {
      [template.generatorType]: cloneValue(template.config),
    },
    semanticEnabled: Boolean(semanticStarter?.mappings.length),
    semanticPrefix: semanticStarter?.prefix,
    semanticMappings: semanticStarter?.mappings
      ? cloneValue(semanticStarter.mappings)
      : undefined,
    selectedSemanticPatternId: semanticStarter?.patternId ?? null,
  };
}

export function createGeneratedGroupDuplicateDraft(
  generator: TokenGenerator,
): GeneratorDialogInitialDraft {
  return {
    selectedType: generator.type,
    name: appendCopySuffix(generator.name, " "),
    targetCollection: generator.targetCollection,
    targetGroup: appendCopySuffix(generator.targetGroup, "-"),
    inlineValue: cloneValue(generator.inlineValue),
    configs: {
      [generator.type]: cloneValue(generator.config),
    },
    keepUpdated: generator.enabled !== false,
    semanticEnabled: Boolean(generator.semanticLayer?.mappings.length),
    semanticPrefix: generator.semanticLayer?.prefix,
    semanticMappings: generator.semanticLayer?.mappings
      ? cloneValue(generator.semanticLayer.mappings)
      : undefined,
    selectedSemanticPatternId: generator.semanticLayer?.patternId ?? null,
  };
}

interface GeneratorDirtySnapshot {
  selectedType: GeneratorType;
  name: string;
  targetCollection: string;
  targetGroup: string;
  editableSourcePath: string;
  inlineValue: unknown;
  configs: Partial<Record<GeneratorType, GeneratorConfig>>;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  keepUpdated: boolean;
  semanticEnabled: boolean;
  semanticPrefix: string;
  semanticMappings: Array<{ semantic: string; step: string }>;
  selectedSemanticPatternId: string | null;
}

function createGeneratorDirtySnapshot(
  snapshot: GeneratorDirtySnapshot,
): GeneratorDirtySnapshot {
  return {
    ...snapshot,
    inlineValue: cloneValue(snapshot.inlineValue),
    configs: cloneValue(snapshot.configs),
    pendingOverrides: cloneValue(snapshot.pendingOverrides),
    semanticMappings: cloneValue(snapshot.semanticMappings),
  };
}

function mergeGeneratorDrafts(
  baseDraft: GeneratorDialogInitialDraft | undefined,
  overrideDraft: GeneratorDialogInitialDraft | undefined,
): GeneratorDialogInitialDraft | undefined {
  if (!baseDraft && !overrideDraft) return undefined;

  return {
    ...baseDraft,
    ...overrideDraft,
    configs: {
      ...(baseDraft?.configs
        ? cloneValue(baseDraft.configs)
        : {}),
      ...(overrideDraft?.configs
        ? cloneValue(overrideDraft.configs)
        : {}),
    },
    pendingOverrides: overrideDraft?.pendingOverrides
      ? cloneValue(overrideDraft.pendingOverrides)
      : baseDraft?.pendingOverrides
        ? cloneValue(baseDraft.pendingOverrides)
        : undefined,
    keepUpdated: overrideDraft?.keepUpdated ?? baseDraft?.keepUpdated,
    semanticEnabled:
      overrideDraft?.semanticEnabled ?? baseDraft?.semanticEnabled,
    semanticPrefix: overrideDraft?.semanticPrefix ?? baseDraft?.semanticPrefix,
    semanticMappings: overrideDraft?.semanticMappings
      ? cloneValue(overrideDraft.semanticMappings)
      : baseDraft?.semanticMappings
        ? cloneValue(baseDraft.semanticMappings)
        : undefined,
    selectedSemanticPatternId:
      overrideDraft?.selectedSemanticPatternId ??
      baseDraft?.selectedSemanticPatternId,
  };
}

interface UseGeneratorDialogReturn {
  // Derived
  isEditing: boolean;
  typeNeedsValue: boolean;
  hasSource: boolean;
  hasValue: boolean;
  availableTypes: GeneratorType[];
  recommendedType: GeneratorType | undefined;
  currentConfig: GeneratorConfig;
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
  selectedType: GeneratorType;
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
  previewAnalysis: GeneratorPreviewAnalysis | null;
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
  keepUpdated: boolean;
  semanticEnabled: boolean;
  semanticPrefix: string;
  semanticMappings: Array<{ semantic: string; step: string }>;
  selectedSemanticPatternId: string | null;
  // Handlers
  handleTypeChange: (type: GeneratorType) => void;
  handleNameChange: (value: string) => void;
  setTargetGroup: (value: string) => void;
  setEditableSourcePath: (value: string) => void;
  setInlineValue: (value: unknown) => void;
  handleConfigChange: (type: GeneratorType, cfg: GeneratorConfig) => void;
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
  setKeepUpdated: (v: boolean) => void;
  setSemanticEnabled: (v: boolean) => void;
  setSemanticPrefix: (v: string) => void;
  setSemanticMappings: (v: Array<{ semantic: string; step: string }>) => void;
  setSelectedSemanticPatternId: (v: string | null) => void;
}

export function useGeneratedGroupDialog({
  serverUrl,
  sourceTokenPath,
  sourceTokenName,
  sourceTokenType = "",
  sourceTokenValue,
  currentCollectionId,
  existingGenerator,
  template,
  initialDraft,
  allTokensFlat,
  sourceValuesFlat,
  onSaved,
  onInterceptSemanticMapping,
  getSuccessToastAction,
  pushUndo,
}: UseGeneratorDialogParams): UseGeneratorDialogReturn {
  const isEditing = Boolean(existingGenerator);
  const initialTemplateDraft = template
    ? createGeneratorDraftFromTemplate(template, currentCollectionId)
    : undefined;
  const resolvedInitialDraft = mergeGeneratorDrafts(
    initialTemplateDraft,
    initialDraft,
  );

  // Editable source token path — initialized from existingGenerator.sourceToken when editing,
  // or from the sourceTokenPath prop (clicked token) when creating.
  const [editableSourcePath, setEditableSourcePathRaw] = useState(
    existingGenerator?.sourceToken ?? sourceTokenPath ?? "",
  );

  const recommendedType = useMemo(() => {
    // Use the current editable source path so the recommendation reacts to
    // user changes, falling back to the initial props.
    const effectivePath = editableSourcePath || existingGenerator?.sourceToken || sourceTokenPath;
    if (!effectivePath) return undefined;
    // Look up the live token entry so we react to path edits in the dialog.
    const liveEntry = allTokensFlat?.[effectivePath];
    const effectiveType = liveEntry?.$type ?? sourceTokenType;
    const effectiveValue = liveEntry?.$value ?? sourceTokenValue;
    if (effectiveType) {
      return detectGeneratorType(effectiveType, effectiveValue);
    }
    return undefined;
  }, [
    editableSourcePath,
    existingGenerator?.sourceToken,
    sourceTokenPath,
    sourceTokenType,
    sourceTokenValue,
    allTokensFlat,
  ]);

  const initialType: GeneratorType =
    existingGenerator?.type ??
    resolvedInitialDraft?.selectedType ??
    recommendedType ??
    "colorRamp";
  const initialName =
    existingGenerator?.name ??
    resolvedInitialDraft?.name ??
    autoName(sourceTokenPath, initialType);
  const initialTargetCollection =
    existingGenerator?.targetCollection ??
    resolvedInitialDraft?.targetCollection ??
    currentCollectionId;
  const initialTargetGroup =
    existingGenerator?.targetGroup ??
    resolvedInitialDraft?.targetGroup ??
    (sourceTokenPath
      ? suggestTargetGroup(sourceTokenPath, sourceTokenName)
      : "");
  const initialSourcePath = existingGenerator?.sourceToken ?? sourceTokenPath ?? "";
  const initialInlineValue =
    existingGenerator?.inlineValue ??
    resolvedInitialDraft?.inlineValue ??
    (initialSourcePath ? undefined : defaultInlineValueForType(initialType));
  const initialConfigs: Partial<Record<GeneratorType, GeneratorConfig>> = {};
  for (const type of ALL_TYPES) {
    if (existingGenerator?.type === type) {
      initialConfigs[type] = cloneValue(existingGenerator.config);
    } else if (resolvedInitialDraft?.configs?.[type]) {
      initialConfigs[type] = cloneValue(
        resolvedInitialDraft.configs[type]!,
      );
    } else {
      initialConfigs[type] = defaultConfigForType(type);
    }
  }
  const initialPendingOverrides =
    existingGenerator?.overrides ??
    resolvedInitialDraft?.pendingOverrides ??
    {};
  const initialKeepUpdated =
    resolvedInitialDraft?.keepUpdated ?? existingGenerator?.enabled !== false;
  const initialSemanticEnabled =
    resolvedInitialDraft?.semanticEnabled ??
    Boolean(existingGenerator?.semanticLayer?.mappings.length);
  const initialSemanticPrefix =
    resolvedInitialDraft?.semanticPrefix ??
    existingGenerator?.semanticLayer?.prefix ??
    "semantic";
  const initialSemanticMappings =
    resolvedInitialDraft?.semanticMappings ??
    existingGenerator?.semanticLayer?.mappings ??
    [];
  const initialSelectedSemanticPatternId =
    resolvedInitialDraft?.selectedSemanticPatternId ??
    existingGenerator?.semanticLayer?.patternId ??
    null;

  const [selectedType, setSelectedType] = useState<GeneratorType>(initialType);
  const [name, setName] = useState(initialName);
  const targetCollection = initialTargetCollection;
  const [targetGroup, setTargetGroup] = useState(initialTargetGroup);
  const [inlineValue, setInlineValueRaw] = useState<unknown>(initialInlineValue);

  const [configs, setConfigs] = useState<
    Partial<Record<GeneratorType, GeneratorConfig>>
  >(() => cloneValue(initialConfigs));

  const [pendingOverrides, setPendingOverrides] = useState<
    Record<string, { value: unknown; locked: boolean }>
  >(() => cloneValue(initialPendingOverrides));

  const nameWasAutoRef = useRef(
    resolvedInitialDraft?.nameIsAuto ??
      (!existingGenerator && !resolvedInitialDraft?.name),
  );
  const initialDirtySnapshotRef = useRef<GeneratorDirtySnapshot>(
    createGeneratorDirtySnapshot({
      selectedType: initialType,
      name: initialName,
      targetCollection: initialTargetCollection,
      targetGroup: initialTargetGroup,
      editableSourcePath: existingGenerator?.sourceToken ?? sourceTokenPath ?? "",
      inlineValue: initialInlineValue,
      configs: initialConfigs,
      pendingOverrides: initialPendingOverrides,
      keepUpdated: initialKeepUpdated,
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
    Array<{ type: GeneratorType; config: GeneratorConfig }>
  >([]);
  const [configRedoStack, setConfigRedoStack] = useState<
    Array<{ type: GeneratorType; config: GeneratorConfig }>
  >([]);
  const undoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSnapshotRef = useRef<{
    type: GeneratorType;
    config: GeneratorConfig;
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
      { type: selectedType, config: cloneValue(currentCfg) },
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
        config: cloneValue(currentCfg),
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
        { type: selectedType, config: cloneValue(currentCfg) },
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
        { type: selectedType, config: cloneValue(currentCfg) },
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
  } = useGeneratedGroupPreview({
    serverUrl,
    selectedType,
    sourceTokenPath: effectiveSourcePath,
    inlineValue,
    sourceValue: previewSourceValue,
    targetGroup,
    targetCollection,
    config: currentConfig,
    pendingOverrides,
    existingGeneratorId: existingGenerator?.id,
    detachedPaths: existingGenerator?.detachedPaths,
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
    keepUpdated,
    semanticEnabled,
    semanticPrefix,
    semanticMappings,
    selectedSemanticPatternId,
    handleQuickSave,
    handleSave,
    handleConfirmSave,
    handleCancelConfirmation,
    setKeepUpdated,
    setSemanticEnabled,
    setSemanticPrefix,
    setSemanticMappings,
    setSelectedSemanticPatternId,
  } = useGeneratedGroupSave({
    serverUrl,
    isEditing,
    existingGenerator,
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
    initialKeepUpdated,
    initialSemanticEnabled,
    initialSemanticPrefix,
    initialSemanticMappings,
    initialSelectedSemanticPatternId,
  });
  const isDirty = useMemo(() => {
    const initialSnapshot = initialDirtySnapshotRef.current;
    const currentSnapshot = createGeneratorDirtySnapshot({
      selectedType,
      name,
      targetCollection,
      targetGroup,
      editableSourcePath,
      inlineValue,
      configs,
      pendingOverrides,
      keepUpdated,
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
    keepUpdated,
    selectedSemanticPatternId,
    selectedType,
    semanticEnabled,
    semanticMappings,
    semanticPrefix,
    targetGroup,
    targetCollection,
  ]);

  // --- Config handlers ---

  const handleTypeChange = (type: GeneratorType) => {
    pushConfigSnapshot();
    setSelectedType(type);
    if (nameWasAutoRef.current) {
      setName(effectiveSourcePath
        ? autoName(effectiveSourcePath, type)
        : autoNameFromGroup(targetGroup, type));
    }
    if (editableSourcePath.trim()) return;
    setInlineValueRaw((currentValue: unknown) => {
      if (isInlineValueCompatibleWithType(type, currentValue)) {
        return currentValue;
      }
      return cloneValue(defaultInlineValueForType(type));
    });
  };

  const setEditableSourcePath = useCallback(
    (v: string) => {
      setEditableSourcePathRaw(v);
      if (nameWasAutoRef.current) {
        setName(v.trim()
          ? autoName(v.trim(), selectedType)
          : autoNameFromGroup(targetGroup, selectedType));
      }
    },
    [selectedType, targetGroup],
  );

  const handleNameChange = (value: string) => {
    nameWasAutoRef.current = false;
    setName(value);
  };

  const handleConfigChange = (type: GeneratorType, cfg: GeneratorConfig) => {
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

  const setTargetGroupDirty = useCallback(
    (v: string) => {
      setTargetGroup(v);
      if (nameWasAutoRef.current && !effectiveSourcePath) {
        setName(autoNameFromGroup(v, selectedType));
      }
    },
    [effectiveSourcePath, selectedType],
  );
  const setInlineValue = useCallback(
    (v: unknown) => {
      setInlineValueRaw(v);
    },
    [],
  );
  const setKeepUpdatedDirty = useCallback(
    (value: boolean) => {
      setKeepUpdated(value);
    },
    [setKeepUpdated],
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
    keepUpdated,
    semanticEnabled,
    semanticPrefix,
    semanticMappings,
    selectedSemanticPatternId,
    // Handlers
    handleTypeChange,
    handleNameChange,
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
    setKeepUpdated: setKeepUpdatedDirty,
    setSemanticEnabled: setSemanticEnabledDirty,
    setSemanticPrefix: setSemanticPrefixDirty,
    setSemanticMappings: setSemanticMappingsDirty,
    setSelectedSemanticPatternId: setSelectedSemanticPatternIdDirty,
  };
}
