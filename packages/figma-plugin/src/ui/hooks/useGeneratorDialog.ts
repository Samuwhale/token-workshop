import { useState, useRef, useCallback, useMemo } from "react";
import type {
  TokenGenerator,
  GeneratorType,
  GeneratorConfig,
  GeneratedTokenResult,
  GeneratorTemplate,
  InputTable,
} from "./useGenerators";
import {
  detectGeneratorType,
  suggestTargetGroup,
  autoName,
  defaultConfigForType,
  ALL_TYPES,
  VALUE_REQUIRED_TYPES,
} from "../components/generators/generatorUtils";
import {
  useGeneratorPreview,
  type GeneratorPreviewAnalysis,
} from "./useGeneratorPreview";
import {
  useGeneratorSave,
  type GeneratorSaveSuccessInfo,
} from "./useGeneratorSave";
import type { UndoSlot } from "./useUndo";
import type { ToastAction } from "../shared/toastBus";
import { stableStringify } from "../shared/utils";

import type { OverwrittenEntry } from "./useGeneratorPreview";
export type { OverwrittenEntry } from "./useGeneratorPreview";

interface UseGeneratorDialogParams {
  serverUrl: string;
  sourceTokenPath?: string;
  sourceTokenName?: string;
  sourceTokenType?: string;
  sourceTokenValue?: any;
  activeSet: string;
  existingGenerator?: TokenGenerator;
  template?: GeneratorTemplate;
  initialDraft?: GeneratorDialogInitialDraft;
  /** Flat token map for source path lookups (used by recommendedType). */
  allTokensFlat?: Record<string, import("../../shared/types").TokenMapEntry>;
  onSaved: (info?: GeneratorSaveSuccessInfo) => void;
  /** When provided, fires with semantic mapping data instead of showing SemanticMappingDialog internally */
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
}

export interface GeneratorDialogInitialDraft {
  selectedType?: GeneratorType;
  name?: string;
  nameIsAuto?: boolean;
  targetSet?: string;
  targetGroup?: string;
  inlineValue?: unknown;
  configs?: Partial<Record<GeneratorType, GeneratorConfig>>;
  pendingOverrides?: Record<string, { value: unknown; locked: boolean }>;
  semanticEnabled?: boolean;
  semanticPrefix?: string;
  semanticMappings?: Array<{ semantic: string; step: string }>;
  selectedSemanticPatternId?: string | null;
}

function cloneGeneratorDraftValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneOptionalDraftValue<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  return cloneGeneratorDraftValue(value);
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

export function createGeneratorDraftFromTemplate(
  template: GeneratorTemplateDraftSource,
  activeSet: string,
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
    targetSet: activeSet,
    targetGroup,
    configs: {
      [template.generatorType]: cloneGeneratorDraftValue(template.config),
    },
    semanticEnabled: Boolean(semanticStarter?.mappings.length),
    semanticPrefix: semanticStarter?.prefix,
    semanticMappings: semanticStarter?.mappings
      ? cloneGeneratorDraftValue(semanticStarter.mappings)
      : undefined,
    selectedSemanticPatternId: semanticStarter?.patternId ?? null,
  };
}

interface GeneratorDirtySnapshot {
  selectedType: GeneratorType;
  name: string;
  targetSet: string;
  targetGroup: string;
  editableSourcePath: string;
  inlineValue: unknown;
  configs: Partial<Record<GeneratorType, GeneratorConfig>>;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  inputTable: InputTable | undefined;
  targetSetTemplate: string;
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
    inlineValue: cloneOptionalDraftValue(snapshot.inlineValue),
    configs: cloneGeneratorDraftValue(snapshot.configs),
    pendingOverrides: cloneGeneratorDraftValue(snapshot.pendingOverrides),
    inputTable: cloneOptionalDraftValue(snapshot.inputTable),
    semanticMappings: cloneGeneratorDraftValue(snapshot.semanticMappings),
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
        ? cloneGeneratorDraftValue(baseDraft.configs)
        : {}),
      ...(overrideDraft?.configs
        ? cloneGeneratorDraftValue(overrideDraft.configs)
        : {}),
    },
    pendingOverrides: overrideDraft?.pendingOverrides
      ? cloneGeneratorDraftValue(overrideDraft.pendingOverrides)
      : baseDraft?.pendingOverrides
        ? cloneGeneratorDraftValue(baseDraft.pendingOverrides)
        : undefined,
    semanticEnabled:
      overrideDraft?.semanticEnabled ?? baseDraft?.semanticEnabled,
    semanticPrefix: overrideDraft?.semanticPrefix ?? baseDraft?.semanticPrefix,
    semanticMappings: overrideDraft?.semanticMappings
      ? cloneGeneratorDraftValue(overrideDraft.semanticMappings)
      : baseDraft?.semanticMappings
        ? cloneGeneratorDraftValue(baseDraft.semanticMappings)
        : undefined,
    selectedSemanticPatternId:
      overrideDraft?.selectedSemanticPatternId ??
      baseDraft?.selectedSemanticPatternId,
  };
}

interface UseGeneratorDialogReturn {
  // Derived
  isEditing: boolean;
  isMultiBrand: boolean;
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
  targetSet: string;
  targetGroup: string;
  editableSourcePath: string;
  inlineValue: unknown;
  inputTable: InputTable | undefined;
  targetSetTemplate: string;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  previewTokens: GeneratedTokenResult[];
  previewLoading: boolean;
  previewError: string;
  previewBrand: string | undefined;
  multiBrandPreviews: Map<string, GeneratedTokenResult[]>;
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
  semanticEnabled: boolean;
  semanticPrefix: string;
  semanticMappings: Array<{ semantic: string; step: string }>;
  selectedSemanticPatternId: string | null;
  // Handlers
  handleTypeChange: (type: GeneratorType) => void;
  handleNameChange: (value: string) => void;
  setTargetSet: (value: string) => void;
  setTargetGroup: (value: string) => void;
  setTargetSetTemplate: (value: string) => void;
  setEditableSourcePath: (value: string) => void;
  setInlineValue: (value: unknown) => void;
  handleConfigChange: (type: GeneratorType, cfg: GeneratorConfig) => void;
  handleToggleMultiBrand: () => void;
  setInputTable: (table: InputTable | undefined) => void;
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

export function useGeneratorDialog({
  serverUrl,
  sourceTokenPath,
  sourceTokenName,
  sourceTokenType = "",
  sourceTokenValue,
  activeSet,
  existingGenerator,
  template,
  initialDraft,
  allTokensFlat,
  onSaved,
  onInterceptSemanticMapping,
  getSuccessToastAction,
  pushUndo,
}: UseGeneratorDialogParams): UseGeneratorDialogReturn {
  const isEditing = Boolean(existingGenerator);
  const initialTemplateDraft = template
    ? createGeneratorDraftFromTemplate(template, activeSet)
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
  const initialTargetSet =
    existingGenerator?.targetSet ??
    resolvedInitialDraft?.targetSet ??
    activeSet;
  const initialTargetGroup =
    existingGenerator?.targetGroup ??
    resolvedInitialDraft?.targetGroup ??
    (sourceTokenPath
      ? suggestTargetGroup(sourceTokenPath, sourceTokenName)
      : "");
  const initialInlineValue =
    existingGenerator?.inlineValue ??
    resolvedInitialDraft?.inlineValue ??
    undefined;
  const initialConfigs: Partial<Record<GeneratorType, GeneratorConfig>> = {};
  for (const type of ALL_TYPES) {
    if (existingGenerator?.type === type) {
      initialConfigs[type] = cloneGeneratorDraftValue(existingGenerator.config);
    } else if (resolvedInitialDraft?.configs?.[type]) {
      initialConfigs[type] = cloneGeneratorDraftValue(
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
  const initialInputTable = existingGenerator?.inputTable ?? undefined;
  const initialTargetSetTemplate =
    existingGenerator?.targetSetTemplate ?? "brands/{brand}";
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
  const [targetSet, setTargetSet] = useState(initialTargetSet);
  const [targetGroup, setTargetGroup] = useState(initialTargetGroup);
  const [inlineValue, setInlineValueRaw] = useState<unknown>(initialInlineValue);

  const [configs, setConfigs] = useState<
    Partial<Record<GeneratorType, GeneratorConfig>>
  >(() => cloneGeneratorDraftValue(initialConfigs));

  const [pendingOverrides, setPendingOverrides] = useState<
    Record<string, { value: unknown; locked: boolean }>
  >(() => cloneGeneratorDraftValue(initialPendingOverrides));

  const [inputTable, setInputTable] = useState<InputTable | undefined>(() =>
    cloneOptionalDraftValue(initialInputTable),
  );
  const [targetSetTemplate, setTargetSetTemplate] = useState<string>(
    initialTargetSetTemplate,
  );

  const nameWasAutoRef = useRef(
    resolvedInitialDraft?.nameIsAuto ??
      (!existingGenerator && !resolvedInitialDraft?.name),
  );
  const initialDirtySnapshotRef = useRef<GeneratorDirtySnapshot>(
    createGeneratorDirtySnapshot({
      selectedType: initialType,
      name: initialName,
      targetSet: initialTargetSet,
      targetGroup: initialTargetGroup,
      editableSourcePath: existingGenerator?.sourceToken ?? sourceTokenPath ?? "",
      inlineValue: initialInlineValue,
      configs: initialConfigs,
      pendingOverrides: initialPendingOverrides,
      inputTable: initialInputTable,
      targetSetTemplate: initialTargetSetTemplate,
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
  const isMultiBrand = Boolean(inputTable);
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

  const {
    previewTokens,
    previewLoading,
    previewError,
    existingTokensError,
    overwrittenEntries,
    existingOverwritePathSet,
    previewFingerprint,
    previewAnalysis,
    previewBrand,
    multiBrandPreviews,
  } = useGeneratorPreview({
    serverUrl,
    selectedType,
    sourceTokenPath: effectiveSourcePath,
    inlineValue,
    targetGroup,
    targetSet,
    config: currentConfig,
    pendingOverrides,
    isMultiBrand,
    inputTable,
    targetSetTemplate,
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
  } = useGeneratorSave({
    serverUrl,
    isEditing,
    existingGenerator,
    selectedType,
    name,
    sourceTokenPath: effectiveSourcePath,
    inlineValue,
    targetSet,
    targetGroup,
    config: currentConfig,
    pendingOverrides,
    isMultiBrand,
    inputTable,
    targetSetTemplate,
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
    const currentSnapshot = createGeneratorDirtySnapshot({
      selectedType,
      name,
      targetSet,
      targetGroup,
      editableSourcePath,
      inlineValue,
      configs,
      pendingOverrides,
      inputTable,
      targetSetTemplate,
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
    inputTable,
    name,
    pendingOverrides,
    selectedSemanticPatternId,
    selectedType,
    semanticEnabled,
    semanticMappings,
    semanticPrefix,
    targetGroup,
    targetSet,
    targetSetTemplate,
  ]);

  // --- Config handlers ---

  const handleTypeChange = (type: GeneratorType) => {
    pushConfigSnapshot();
    setSelectedType(type);
    if (nameWasAutoRef.current) setName(autoName(effectiveSourcePath, type));
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

  const handleConfigChange = (type: GeneratorType, cfg: GeneratorConfig) => {
    pushConfigSnapshotDebounced();
    setConfigs((prev) => ({ ...prev, [type]: cfg }));
  };

  const handleToggleMultiBrand = () => {
    setInputTable(
      inputTable ? undefined : { inputKey: "brandColor", rows: [] },
    );
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

  const setTargetSetDirty = useCallback(
    (v: string) => {
      setTargetSet(v);
    },
    [],
  );
  const setTargetGroupDirty = useCallback(
    (v: string) => {
      setTargetGroup(v);
    },
    [],
  );
  const setTargetSetTemplateDirty = useCallback(
    (v: string) => {
      setTargetSetTemplate(v);
    },
    [],
  );
  const setInputTableDirty = useCallback(
    (t: InputTable | undefined) => {
      setInputTable(t);
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
    isMultiBrand,
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
    targetSet,
    targetGroup,
    editableSourcePath,
    inlineValue,
    inputTable,
    targetSetTemplate,
    pendingOverrides,
    previewTokens,
    previewLoading,
    previewError,
    previewFingerprint,
    previewAnalysis,
    previewBrand,
    multiBrandPreviews,
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
    setTargetSet: setTargetSetDirty,
    setTargetGroup: setTargetGroupDirty,
    setTargetSetTemplate: setTargetSetTemplateDirty,
    setEditableSourcePath,
    setInlineValue,
    handleConfigChange,
    handleToggleMultiBrand,
    setInputTable: setInputTableDirty,
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
