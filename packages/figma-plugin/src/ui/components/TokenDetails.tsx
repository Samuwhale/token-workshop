import {
  adaptShortcut,
  getErrorMessage,
  stableStringify,
} from "../shared/utils";
import {
  Copy,
  Check,
  Clock,
  Files,
  Trash2,
  Link2,
  X,
  Plus,
} from "lucide-react";
import { SHORTCUT_KEYS } from "../shared/shortcutRegistry";
import { Spinner } from "./Spinner";
import { AUTHORING_SURFACE_CLASSES, EditorShell } from "./EditorShell";
import { AUTHORING } from "../shared/editorClasses";
import { apiFetch } from "../shared/apiFetch";
import { buildTokenEditorValueBody } from "../shared/tokenEditorPayload";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  getCollectionIdsForPath,
  pathExistsInCollection,
  readGeneratorProvenance,
  resolveCollectionIdForPath,
  resolveRefValue,
} from "@tokenmanager/core";
import type { TokenCollection, TokenType } from "@tokenmanager/core";
import type { EditorSessionRegistration } from "../contexts/WorkspaceControllerContext";
import { ConfirmModal } from "./ConfirmModal";
import type { TokenMapEntry } from "../../shared/types";
import { TypePicker } from "./TypePicker";
import { COMPOSITE_TOKEN_TYPES } from "@tokenmanager/core";
import { isAlias, extractAliasPath } from "../../shared/resolveAlias";
import { ContrastChecker } from "./ContrastChecker";
import { DerivationEditor } from "./DerivationEditor";
import { ScopeEditor } from "./ScopeEditor";
import { FIGMA_SCOPE_OPTIONS } from "../shared/tokenMetadata";
import { useTokenEditorModeValue } from "../hooks/useTokenEditorModeValue";
import { PathAutocomplete } from "./PathAutocomplete";

import { useTokenEditorFields } from "../hooks/useTokenEditorFields";
import { useTokenEditorLoad } from "../hooks/useTokenEditorLoad";
import { useTokenDependents } from "../hooks/useTokenDependents";
import { useTokenAncestors } from "../hooks/useTokenAncestors";
import { formatTokenValueForDisplay } from "../shared/tokenFormatting";
import { useTokenTypeParsing } from "../hooks/useTokenTypeParsing";
import { useTokenEditorUIState } from "../hooks/useTokenEditorUIState";
import { useTokenEditorSave } from "../hooks/useTokenEditorSave";
import {
  clearEditorDraft,
  saveEditorDraft,
  formatDraftAge,
} from "../hooks/useTokenEditorUtils";
import { STORAGE_KEYS, lsGet, lsSet } from "../shared/storage";
import { dispatchToast } from "../shared/toastBus";
import { LONG_TEXT_CLASSES } from "../shared/longTextStyles";
import { normalizeTokenType } from "../shared/tokenTypeCategories";
import {
  hasSyncSnapshotChange,
  resolveSyncComparableValue,
} from "../shared/tokenSync";

import {
  detectAliasCycle,
  parsePastedValue,
  getInitialCreateValue,
  NAMESPACE_SUGGESTIONS,
} from "./token-editor/tokenEditorHelpers";
import { valueFormatHint } from "../shared/valueFormatHints";
import { ExtendsTokenPicker } from "./token-editor/ExtendsTokenPicker";
import type { LintViolation } from "../hooks/useLint";
import { TokenDetailsAdvancedSection } from "./token-details/TokenDetailsAdvancedSection";
import { TokenDetailsModeRow } from "./token-details/TokenDetailsModeRow";
import { TokenDetailsStatusBanners } from "./token-details/TokenDetailsStatusBanners";
import { Field, IconButton, ListItem, Section, Stack } from "../primitives";
import { Collapsible } from "./Collapsible";
interface TokenDetailsProps {
  tokenPath: string;
  currentCollectionId: string;
  collectionId?: string;
  serverUrl: string;
  onBack: () => void;
  backLabel?: string;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>;
  isCreateMode?: boolean;
  initialType?: string;
  /** When alias-shaped (e.g. "{color.primary}"), alias mode activates automatically. */
  initialValue?: string;
  editorSessionHost: {
    registerSession: (session: EditorSessionRegistration | null) => void;
    requestClose: () => void;
  };
  onSaved?: (savedPath: string) => void;
  onRenamed?: (newPath: string) => void;
  collections?: TokenCollection[];
  onRefresh?: () => void;
  onSaveAndCreateAnother?: (savedPath: string, tokenType: string) => void;
  availableFonts?: string[];
  fontWeightsByFamily?: Record<string, number[]>;
  onNavigateToToken?: (path: string, collectionId?: string) => void;
  onOpenGenerator?: (generatorId: string) => void;
  pushUndo?: (slot: import("../hooks/useUndo").UndoSlot) => void;
  lintViolations?: LintViolation[];
  syncSnapshot?: Record<string, string>;
  onDuplicate?: () => void;
  onOpenInHealth?: () => void;
  onManageCollectionModes?: (collectionId: string) => void;
}

function cloneModeValue<T>(value: T): T {
  return typeof value === "object" && value !== null
    ? structuredClone(value)
    : value;
}

function getStoredModeValue(
  entry: TokenMapEntry | undefined,
  collectionId: string,
  modeName: string,
  modeIndex: number,
): unknown {
  if (!entry) {
    return undefined;
  }
  if (modeIndex === 0) {
    return entry.$value;
  }

  const collectionModes =
    entry.$extensions?.tokenmanager?.modes?.[collectionId];
  if (
    !collectionModes ||
    typeof collectionModes !== "object" ||
    Array.isArray(collectionModes)
  ) {
    return undefined;
  }

  return (collectionModes as Record<string, unknown>)[modeName];
}

function getAncestorRowStatusLabel(
  status: "missing" | "ambiguous" | "cycle" | undefined,
): string | null {
  if (!status) return null;
  if (status === "ambiguous") return "ambiguous";
  return status;
}

function getAncestorTerminalNote(
  terminalKind: "literal" | "missing" | "ambiguous" | "cycle" | "depth",
): string | null {
  if (terminalKind === "depth") {
    return "Chain truncated after too many hops.";
  }
  return null;
}

function formatCollectionIdList(collectionIds: string[]): string {
  if (collectionIds.length === 0) {
    return "";
  }
  if (collectionIds.length === 1) {
    return collectionIds[0];
  }
  if (collectionIds.length === 2) {
    return `${collectionIds[0]} and ${collectionIds[1]}`;
  }
  return `${collectionIds.slice(0, -1).join(", ")}, and ${collectionIds.at(-1)}`;
}

export function TokenDetails({
  tokenPath,
  currentCollectionId,
  collectionId: explicitCollectionId,
  serverUrl,
  onBack,
  backLabel,
  allTokensFlat = {},
  pathToCollectionId = {},
  collectionIdsByPath = {},
  perCollectionFlat = {},
  isCreateMode = false,
  initialType,
  initialValue,
  editorSessionHost,
  onSaved,
  onRenamed,
  onSaveAndCreateAnother,
  collections = [],
  onRefresh,
  availableFonts = [],
  fontWeightsByFamily = {},
  onNavigateToToken,
  onOpenGenerator,
  pushUndo,
  lintViolations = [],
  syncSnapshot,
  onDuplicate,
  onOpenInHealth,
  onManageCollectionModes,
}: TokenDetailsProps) {
  const ownerCollectionId = useMemo(
    () =>
      explicitCollectionId ??
      (isCreateMode
        ? currentCollectionId
        : (resolveCollectionIdForPath({
            path: tokenPath,
            pathToCollectionId,
            collectionIdsByPath,
            preferredCollectionId: currentCollectionId,
          }).collectionId ?? currentCollectionId)),
    [
      collectionIdsByPath,
      explicitCollectionId,
      isCreateMode,
      currentCollectionId,
      pathToCollectionId,
      tokenPath,
    ],
  );
  const showingExternalCollection = ownerCollectionId !== currentCollectionId;
  const canEditInPlace = true;
  const uiState = useTokenEditorUIState({
    tokenPath,
  });
  const {
    showDeleteConfirm,
    setShowDeleteConfirm,
    copied,
    setCopied,
    showPathAutocomplete,
    setShowPathAutocomplete,
    editPath,
    setEditPath,
    pathInputWrapperRef,
    handlePasteInValueEditor,
  } = uiState;

  const fields = useTokenEditorFields({
    isCreateMode,
    initialType,
    initialValue,
    tokenPath,
    editPath,
    allTokensFlat,
  });
  const {
    initialRef,
    tokenType,
    setTokenType,
    value,
    setValue,
    description,
    setDescription,
    scopes,
    setScopes,
    derivationOps,
    setDerivationOps,
    modeValues,
    setModeValues,
    extensionsJsonText,
    setExtensionsJsonText,
    extensionsJsonError,
    setExtensionsJsonError,
    lifecycle,
    setLifecycle,
    extendsPath,
    setExtendsPath,
    isDirty,
    colorFlatMap,
  } = fields;

  const valueIsAlias = typeof value === "string" && isAlias(value);

  const modeValue = useTokenEditorModeValue({
    collectionId: ownerCollectionId,
    collections,
    value,
    setValue,
    modeValues,
    setModeValues,
  });

  const valueEditorContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionsRef = useRef(new Map<string, number>());
  const passthroughTokenManagerRef = useRef<Record<string, unknown> | null>(
    null,
  );

  const [error, setError] = useState<string | null>(null);

  const [renameInput, setRenameInput] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameConfirm, setRenameConfirm] = useState<{
    newPath: string;
    aliasCount: number;
  } | null>(null);

  // Keep rename input in sync with the incoming token path so the field reflects
  // the current name whenever the editor loads or switches tokens.
  useEffect(() => {
    const lastDot = tokenPath.lastIndexOf(".");
    setRenameInput(lastDot >= 0 ? tokenPath.slice(lastDot + 1) : tokenPath);
    setRenameError(null);
  }, [tokenPath]);

  const loadResult = useTokenEditorLoad({
    serverUrl,
    collectionId: ownerCollectionId,
    collections,
    tokenPath,
    isCreateMode,
    initialRef,
    setTokenType,
    setValue,
    setDescription,
    setScopes,
    setDerivationOps,
    setModeValues,
    setExtensionsJsonText,
    setExtensionsJsonError,
    setLifecycle,
    setExtendsPath,
    setError,
    passthroughTokenManagerRef,
    valueEditorContainerRef,
  });
  const { loading, pendingDraft, setPendingDraft, initialServerSnapshotRef } =
    loadResult;

  const { dependents } = useTokenDependents({
    serverUrl,
    collectionId: ownerCollectionId,
    tokenPath,
    isCreateMode,
  });
  const ancestors = useTokenAncestors({
    tokenPath,
    collectionId: ownerCollectionId,
    collections,
    perCollectionFlat,
    pathToCollectionId,
    collectionIdsByPath,
  });
  const typeParsing = useTokenTypeParsing({
    tokenType,
    setTokenType,
    value,
    setValue,
    scopes,
    modeValues,
    setModeValues,
    setScopes,
    extensionsJsonError,
    isCreateMode,
    editPath: tokenPath,
    allTokensFlat,
    currentTokenPath: tokenPath,
    detectAliasCycle,
  });
  const {
    pendingTypeChange,
    setPendingTypeChange,
    showPendingDependents,
    setShowPendingDependents,
    fontFamilyRef,
    fontSizeRef,
    aliasCycleError: _aliasCycleError,
    canSave: editorCanSave,
    saveBlockReason: editorSaveBlockReason,
    applyTypeChange,
    handleTypeChange,
    focusBlockedField,
  } = typeParsing;
  const currentTokenEntry = useMemo(
    () =>
      perCollectionFlat[ownerCollectionId]?.[tokenPath] ??
      allTokensFlat[tokenPath],
    [allTokensFlat, ownerCollectionId, perCollectionFlat, tokenPath],
  );
  const ownerCollectionTokens = useMemo(
    () => perCollectionFlat[ownerCollectionId] ?? {},
    [ownerCollectionId, perCollectionFlat],
  );
  const generatorProvenance = useMemo(
    () => readGeneratorProvenance(currentTokenEntry),
    [currentTokenEntry],
  );
  const [detachedFromGenerator, setDetachedFromGenerator] = useState(false);
  const activeGeneratorProvenance = detachedFromGenerator ? null : generatorProvenance;
  const isGeneratorLocked = !isCreateMode && Boolean(activeGeneratorProvenance);
  const fieldEditable = !isGeneratorLocked;
  const [generatorName, setGeneratorName] = useState<string | null>(null);
  const [detachingGeneratorOutput, setDetachingGeneratorOutput] = useState(false);
  const [showDetachGeneratorConfirm, setShowDetachGeneratorConfirm] = useState(false);

  const initialFieldsSnapshot = initialRef.current;
  const ambiguousExtendsCollectionIds = useMemo(() => {
    const path = extendsPath.trim();
    if (!path) {
      return [];
    }

    const collectionIds = getCollectionIdsForPath({
      path,
      pathToCollectionId,
      collectionIdsByPath,
    });
    return collectionIds.length > 1 ? collectionIds : [];
  }, [collectionIdsByPath, extendsPath, pathToCollectionId]);
  const ambiguousAliasReferences = useMemo(
    () =>
      modeValue.modes.flatMap((mode) => {
        if (typeof mode.value !== "string" || !isAlias(mode.value)) {
          return [];
        }

        const path = extractAliasPath(mode.value)?.trim();
        if (!path) {
          return [];
        }

        const collectionIds = getCollectionIdsForPath({
          path,
          pathToCollectionId,
          collectionIdsByPath,
        });
        if (collectionIds.length <= 1) {
          return [];
        }

        return [{ modeName: mode.name, path, collectionIds }];
      }),
    [collectionIdsByPath, modeValue.modes, pathToCollectionId],
  );
  const firstAmbiguousAliasReference = ambiguousAliasReferences[0] ?? null;
  const ambiguousReferenceMessage = firstAmbiguousAliasReference
    ? `Mode "${firstAmbiguousAliasReference.modeName}" references "${firstAmbiguousAliasReference.path}", which exists in ${formatCollectionIdList(firstAmbiguousAliasReference.collectionIds)}. References must point to a token path that belongs to one collection.`
    : ambiguousExtendsCollectionIds.length > 0
      ? `Inherited token "${extendsPath}" exists in ${formatCollectionIdList(ambiguousExtendsCollectionIds)}. Inheritance requires a token path that belongs to one collection.`
      : null;
  const canSave = editorCanSave && ambiguousReferenceMessage === null;
  const saveBlockReason = ambiguousReferenceMessage ?? editorSaveBlockReason;

  const requestClose = editorSessionHost.requestClose;
  const beforeSaveGeneratedToken = useCallback(async () => {
    if (!isCreateMode && activeGeneratorProvenance) {
      setError(
        "This token is managed by a generator. Open the generator to change generated values, or detach the token before editing it directly.",
      );
      return false;
    }
    if (ambiguousReferenceMessage) {
      setError(ambiguousReferenceMessage);
      return false;
    }
    return true;
  }, [activeGeneratorProvenance, ambiguousReferenceMessage, isCreateMode]);

  const saveHook = useTokenEditorSave({
    serverUrl,
    collectionId: ownerCollectionId,
    tokenPath,
    isCreateMode,
    editPath,
    tokenType,
    value,
    description,
    scopes,
    derivationOps,
    modeValues,
    extensionsJsonText,
    lifecycle,
    extendsPath,
    collections,
    initialServerSnapshotRef,
    passthroughTokenManagerRef,
    onBack,
    requestClose,
    onSaved,
    onSaveAndCreateAnother,
    pushUndo,
    beforeSave: beforeSaveGeneratedToken,
  });
  const {
    saving,
    error: saveError,
    setError: setSaveError,
    showConflictConfirm,
    setShowConflictConfirm,
    saveRetryArgs,
    setSaveRetryArgs,
    handleSaveRef,
    handleSave,
    handleDelete,
  } = saveHook;

  const displayError = error || saveError;
  const setDisplayError = useCallback(
    (v: string | null) => {
      setError(v);
      setSaveError(v);
    },
    [setError, setSaveError],
  );

  useEffect(() => {
    if (!isCreateMode) return;
    const resolvedType = normalizeTokenType(initialType);
    const initialCreateValue = getInitialCreateValue(
      resolvedType,
      initialValue,
    );
    initialRef.current = {
      value: initialCreateValue,
      description: "",
      scopes: [],
      type: resolvedType,
      derivationOps: [],
      modeValues: {},
      extensionsJsonText: "",
      lifecycle: "published",
      extendsPath: "",
    };
    setTokenType(resolvedType);
    setValue(initialCreateValue);
    setDescription("");
    setScopes([]);
    setDerivationOps([]);
    setModeValues({});
    setExtensionsJsonText("");
    setExtensionsJsonError(null);
    setLifecycle("published");
    setExtendsPath("");
    setEditPath(tokenPath);
    setShowPathAutocomplete(tokenPath.trim().endsWith("."));
    setDisplayError(null);
  }, [
    collections,
    initialRef,
    initialType,
    initialValue,
    isCreateMode,
    ownerCollectionId,
    setDerivationOps,
    setDescription,
    setEditPath,
    setExtensionsJsonError,
    setExtensionsJsonText,
    setExtendsPath,
    setLifecycle,
    setModeValues,
    setScopes,
    setDisplayError,
    setShowPathAutocomplete,
    setTokenType,
    setValue,
    tokenPath,
  ]);

  useEffect(() => {
    if (!isCreateMode) return;
    lsSet(STORAGE_KEYS.LAST_CREATE_TYPE, normalizeTokenType(tokenType));
  }, [isCreateMode, tokenType]);

  useEffect(() => {
    setDetachedFromGenerator(false);
    setGeneratorName(null);
  }, [tokenPath, generatorProvenance?.generatorId]);

  useEffect(() => {
    if (!activeGeneratorProvenance?.generatorId) return;
    let cancelled = false;
    apiFetch<{ generator?: { name?: string } }>(
      `${serverUrl}/api/generators/${encodeURIComponent(activeGeneratorProvenance.generatorId)}`,
    )
      .then((response) => {
        if (!cancelled) {
          setGeneratorName(response.generator?.name ?? activeGeneratorProvenance.generatorId);
        }
      })
      .catch(() => {
        if (!cancelled) setGeneratorName(activeGeneratorProvenance.generatorId);
      });
    return () => {
      cancelled = true;
    };
  }, [activeGeneratorProvenance?.generatorId, serverUrl]);

  const handleDetachGeneratorOutput = useCallback(async (): Promise<void> => {
    if (!activeGeneratorProvenance) return;
    setDetachingGeneratorOutput(true);
    try {
      setError(null);
      await apiFetch(
        `${serverUrl}/api/generators/${encodeURIComponent(activeGeneratorProvenance.generatorId)}/outputs/detach`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            collectionId: ownerCollectionId,
            path: tokenPath,
          }),
        },
	      );
	      setDetachedFromGenerator(true);
	      if (passthroughTokenManagerRef.current) {
	        delete passthroughTokenManagerRef.current.generator;
	      }
	      onRefresh?.();
      setShowDetachGeneratorConfirm(false);
      dispatchToast(`Detached "${tokenPath}" from generator`, "success", {
        destination: {
          kind: "token",
          tokenPath,
          collectionId: ownerCollectionId,
        },
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to detach token from generator",
      );
    } finally {
      setDetachingGeneratorOutput(false);
    }
  }, [
    activeGeneratorProvenance,
    onRefresh,
    ownerCollectionId,
    serverUrl,
    tokenPath,
  ]);

  const duplicatePath = useMemo(() => {
    if (!isCreateMode) return false;
    const trimmed = editPath.trim();
    if (!trimmed) return false;
    return pathExistsInCollection({
      path: trimmed,
      collectionId: ownerCollectionId,
      pathToCollectionId,
      collectionIdsByPath,
    });
  }, [
    collectionIdsByPath,
    editPath,
    isCreateMode,
    ownerCollectionId,
    pathToCollectionId,
  ]);
  const trimmedEditPath = editPath.trim();
  const conflictingOtherCollectionIds = useMemo(
    () =>
      isCreateMode && trimmedEditPath
        ? getCollectionIdsForPath({
            path: trimmedEditPath,
            pathToCollectionId,
            collectionIdsByPath,
          }).filter((collectionId) => collectionId !== ownerCollectionId)
        : [],
    [
      collectionIdsByPath,
      isCreateMode,
      ownerCollectionId,
      pathToCollectionId,
      trimmedEditPath,
    ],
  );
  const crossCollectionDuplicatePath =
    conflictingOtherCollectionIds.length > 0;

  useEffect(() => {
    editorSessionHost.registerSession({
      isDirty: fieldEditable ? isDirty : false,
      canSave:
        fieldEditable &&
        canSave &&
        !saving &&
        !duplicatePath &&
        !crossCollectionDuplicatePath &&
        (!isCreateMode || editPath.trim().length > 0),
      save: async () => {
        if (fieldEditable) {
          return handleSaveRef.current();
        }
        return false;
      },
      discard: async () => {
        if (fieldEditable) {
          clearEditorDraft(ownerCollectionId, tokenPath);
          setPendingDraft(null);
        }
        onBack();
      },
      closeWhenClean: onBack,
    });
    return () => {
      editorSessionHost.registerSession(null);
    };
  }, [
    canSave,
    crossCollectionDuplicatePath,
    duplicatePath,
    editPath,
    editorSessionHost,
    fieldEditable,
    handleSaveRef,
    isCreateMode,
    isDirty,
    onBack,
    saving,
    ownerCollectionId,
    tokenPath,
    setPendingDraft,
  ]);

  // Restore scroll position when navigating between tokens
  useEffect(() => {
    const saved = scrollPositionsRef.current.get(tokenPath) ?? 0;
    const raf = requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = saved;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [tokenPath]);

  useEffect(() => {
    if (!isDirty || isCreateMode) return;
    saveEditorDraft(ownerCollectionId, tokenPath, {
      tokenType,
      value,
      description,
      scopes,
      derivationOps,
      modeValues,
      extensionsJsonText,
      lifecycle,
      extendsPath,
    });
  }, [
    isDirty,
    ownerCollectionId,
    tokenPath,
    isCreateMode,
    tokenType,
    value,
    description,
    scopes,
    derivationOps,
    modeValues,
    extensionsJsonText,
    lifecycle,
    extendsPath,
  ]);

  const handleRevert = () => {
    if (!initialRef.current) return;
    const init = initialRef.current;
    setTokenType(init.type);
    setValue(init.value);
    setDescription(init.description);
    setScopes(init.scopes);
    setDerivationOps(init.derivationOps);
    setModeValues(init.modeValues);
    setExtensionsJsonText(init.extensionsJsonText);
    setExtensionsJsonError(null);
    setLifecycle(init.lifecycle);
    setExtendsPath(init.extendsPath);
    setSaveRetryArgs(null);
    setDisplayError(null);
    clearEditorDraft(ownerCollectionId, tokenPath);
    setPendingDraft(null);
  };

  const applyDraft = (draft: typeof pendingDraft) => {
    if (!draft) return;
    setTokenType(draft.tokenType);
    setValue(draft.value);
    setDescription(draft.description);
    setScopes(draft.scopes);
    setDerivationOps(draft.derivationOps);
    setModeValues(draft.modeValues);
    setExtensionsJsonText(draft.extensionsJsonText);
    setLifecycle(draft.lifecycle);
    setExtendsPath(draft.extendsPath);
    setPendingDraft(null);
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      const modeRow = target?.closest<HTMLElement>("[data-token-editor-mode]");
      const modeName = modeRow?.dataset.tokenEditorMode;
      const activeMode = modeName
        ? modeValue.modes.find((mode) => mode.name === modeName)
        : modeValue.modes[0];

      handlePasteInValueEditor(e, {
        tokenType,
        value: activeMode?.value ?? value,
        isAliasMode: modeRow?.dataset.tokenEditorAlias === "1",
        parsePastedValue,
        setValue: activeMode?.setValue ?? setValue,
      });
    },
    [handlePasteInValueEditor, modeValue.modes, setValue, tokenType, value],
  );

  const [detailsOpen, setDetailsOpen] = useState(() => {
    return lsGet(STORAGE_KEYS.EDITOR_DETAILS) === "1";
  });
  const [relationshipsOpen, setRelationshipsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const toggleDetails = useCallback(() => {
    setDetailsOpen((v) => {
      const next = !v;
      lsSet(STORAGE_KEYS.EDITOR_DETAILS, next ? "1" : "0");
      return next;
    });
  }, []);

  const rawJsonPreview = useMemo(() => {
    const editorCollection =
      collections.find((collection) => collection.id === ownerCollectionId) ??
      null;
    return JSON.stringify(
      buildTokenEditorValueBody({
        tokenType,
        value,
        description,
        scopes,
        derivationOps,
        modeValues,
        collection: editorCollection,
        passthroughTokenManager: passthroughTokenManagerRef.current,
        lifecycle,
        extendsPath,
        extensionsJsonText,
        clearEmptyDescription: !isCreateMode,
        clearEmptyExtensions: !isCreateMode,
        ignoreInvalidExtensionsJson: true,
      }),
      null,
      2,
    );
  }, [
    derivationOps,
    description,
    extensionsJsonText,
    extendsPath,
    lifecycle,
    modeValues,
    scopes,
    tokenType,
    value,
    collections,
    isCreateMode,
    ownerCollectionId,
    passthroughTokenManagerRef,
  ]);

  const syncComparableValue = useMemo(
    () =>
      resolveSyncComparableValue({
        tokenPath,
        allTokensFlat,
        currentValue: value,
        currentType: tokenType,
      }),
    [allTokensFlat, tokenPath, tokenType, value],
  );

  const lastDotIdx = tokenPath.lastIndexOf(".");
  const parentPrefix = lastDotIdx >= 0 ? tokenPath.slice(0, lastDotIdx) : "";
  const leafName =
    lastDotIdx >= 0 ? tokenPath.slice(lastDotIdx + 1) : tokenPath;
  const canRenameInPlace = !isCreateMode && fieldEditable && canEditInPlace;
  const renameInputDiffers = renameInput !== leafName;
  const renameDisabled = !canRenameInPlace || isDirty || saving || renameSaving;
  const renamePreviewLeaf = renameInput.trim();
  const renamePreviewPath = parentPrefix
    ? `${parentPrefix}.${renamePreviewLeaf}`
    : renamePreviewLeaf;

  const revertRename = useCallback(() => {
    setRenameInput(leafName);
    setRenameError(null);
  }, [leafName]);

  const performRename = useCallback(
    async (newPath: string, updateAliases: boolean) => {
      setRenameSaving(true);
      setRenameError(null);
      try {
        await apiFetch(
          `${serverUrl}/api/tokens/${encodeURIComponent(ownerCollectionId)}/tokens/rename`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              oldPath: tokenPath,
              newPath,
              updateAliases,
            }),
          },
        );
        if (pushUndo) {
          const capturedCollection = ownerCollectionId;
          const capturedUrl = serverUrl;
          const capturedOld = tokenPath;
          const capturedNew = newPath;
          pushUndo({
            description: `Rename "${leafName}"`,
            groupKey: `rename-${capturedCollection}`,
            groupSummary: (n) => `Rename ${n} tokens`,
            restore: async () => {
              try {
                await apiFetch(
                  `${capturedUrl}/api/tokens/${encodeURIComponent(capturedCollection)}/tokens/rename`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      oldPath: capturedNew,
                      newPath: capturedOld,
                    }),
                  },
                );
                onRefresh?.();
              } catch (err) {
                console.warn("[TokenDetails] undo rename failed:", err);
              }
            },
            redo: async () => {
              try {
                await apiFetch(
                  `${capturedUrl}/api/tokens/${encodeURIComponent(capturedCollection)}/tokens/rename`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      oldPath: capturedOld,
                      newPath: capturedNew,
                    }),
                  },
                );
                onRefresh?.();
              } catch (err) {
                console.warn("[TokenDetails] redo rename failed:", err);
              }
            },
          });
        }
        setRenameConfirm(null);
        dispatchToast(`Renamed to "${newPath}"`, "success");
        onRefresh?.();
        onRenamed?.(newPath);
      } catch (err) {
        setRenameError(getErrorMessage(err, "Rename failed"));
      } finally {
        setRenameSaving(false);
      }
    },
    [
      serverUrl,
      ownerCollectionId,
      tokenPath,
      leafName,
      pushUndo,
      onRefresh,
      onRenamed,
    ],
  );

  const submitRename = useCallback(async () => {
    const trimmed = renameInput.trim();
    if (!trimmed) {
      setRenameError("Name cannot be empty");
      return;
    }
    if (trimmed.includes(".")) {
      setRenameError("Name cannot contain dots");
      return;
    }
    if (trimmed === leafName) {
      setRenameError(null);
      return;
    }
    const newPath = parentPrefix ? `${parentPrefix}.${trimmed}` : trimmed;
    if (allTokensFlat[newPath]) {
      setRenameError(`A token named "${trimmed}" already exists here`);
      return;
    }
    setRenameSaving(true);
    setRenameError(null);
    try {
      const preview = await apiFetch<{ count: number }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(ownerCollectionId)}/tokens/rename-preview?oldPath=${encodeURIComponent(tokenPath)}&newPath=${encodeURIComponent(newPath)}`,
      );
      if (preview.count > 0) {
        setRenameConfirm({ newPath, aliasCount: preview.count });
        setRenameSaving(false);
        return;
      }
      await performRename(newPath, true);
    } catch (err) {
      setRenameError(getErrorMessage(err, "Rename failed"));
      setRenameSaving(false);
    }
  }, [
    renameInput,
    leafName,
    parentPrefix,
    allTokensFlat,
    serverUrl,
    ownerCollectionId,
    tokenPath,
    performRename,
  ]);

  if (loading) {
    return (
      <EditorShell
        title={isCreateMode ? "New token" : tokenPath}
        onBack={onBack}
        backAriaLabel={backLabel ?? "Back"}
        backTitle={backLabel}
        surface="authoring"
      >
        <div
          role="status"
          className="flex min-h-full flex-col items-center justify-center gap-2 px-4 py-6 text-body text-[color:var(--color-figma-text-secondary)]"
        >
          <Spinner size="md" className="text-[color:var(--color-figma-text-accent)]" />
          Loading token...
        </div>
      </EditorShell>
    );
  }

  const syncChanged =
    !isCreateMode &&
    hasSyncSnapshotChange(syncSnapshot, tokenPath, syncComparableValue);

  const tokenLintViolations = lintViolations.filter(
    (v) => v.path === tokenPath,
  );

  const createSuggestions = NAMESPACE_SUGGESTIONS[tokenType]?.prefixes ?? [];
  const footerNote =
    isGeneratorLocked
      ? "Managed by generator. Detach before editing directly."
      : isCreateMode && duplicatePath
      ? "Path already exists."
      : isCreateMode && crossCollectionDuplicatePath
      ? "Path already exists in another collection."
      : isCreateMode && !trimmedEditPath
        ? "Enter a token path."
        : saveBlockReason;
  const showFooterMeta = Boolean(
    footerNote || (isCreateMode && onSaveAndCreateAnother),
  );

  const handleCopyPath = () => {
    navigator.clipboard.writeText(tokenPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const headerStatus = isGeneratorLocked
    ? "Managed by generator"
    : isDirty
      ? "Modified"
      : syncChanged
        ? "Not synced"
        : isCreateMode
          ? "New"
          : "Saved";
  const contextLabel = isCreateMode
    ? `Create in ${ownerCollectionId}`
    : showingExternalCollection
      ? `${ownerCollectionId} · opened from another collection`
      : null;

  const headerTitle = (
    <div className="tm-token-details__header-title">
      <div className="tm-token-details__header-mainline">
        <span
          className="tm-token-details__header-name"
          title={isCreateMode ? "New token" : tokenPath}
        >
          {isCreateMode ? "New token" : leafName}
        </span>
        <span
          className={`tm-token-details__status-dot ${
            isGeneratorLocked
              ? "tm-token-details__status-dot--locked"
              : isDirty
                ? "tm-token-details__status-dot--dirty"
                : syncChanged
                  ? "tm-token-details__status-dot--sync"
                  : "tm-token-details__status-dot--saved"
          }`}
          aria-hidden
        />
      </div>
      {!isCreateMode && (
        <span
          className={`tm-token-details__header-full-path ${LONG_TEXT_CLASSES.pathSecondary}`}
          title={tokenPath}
        >
          {tokenPath}
        </span>
      )}
      <div className="tm-token-details__header-context">
        {contextLabel ? (
          <>
            <span className={LONG_TEXT_CLASSES.textSecondary}>{contextLabel}</span>
            <span aria-hidden>·</span>
          </>
        ) : null}
        <span>{headerStatus}</span>
      </div>
    </div>
  );

  const headerActions = (
    <>
      {!isCreateMode && (
        <IconButton
          onClick={handleCopyPath}
          title="Copy token path"
          aria-label="Copy token path"
          size="sm"
          className="tm-token-details__header-icon"
        >
          {copied ? (
            <Check size={12} strokeWidth={1.5} aria-hidden />
          ) : (
            <Copy size={12} strokeWidth={1.5} aria-hidden />
          )}
        </IconButton>
      )}
      {!isCreateMode && onDuplicate && (
        <IconButton
          onClick={onDuplicate}
          title="Duplicate token"
          aria-label="Duplicate token"
          size="sm"
          className="tm-token-details__header-icon"
        >
          <Files size={12} strokeWidth={1.5} aria-hidden />
        </IconButton>
      )}
      {!isCreateMode && !activeGeneratorProvenance && (
        <IconButton
          onClick={() => setShowDeleteConfirm(true)}
          title="Delete token"
          aria-label="Delete token"
          size="sm"
          tone="danger"
          className="tm-token-details__header-icon tm-token-details__header-icon--danger"
        >
          <Trash2 size={12} strokeWidth={1.5} aria-hidden />
        </IconButton>
      )}
      {valueIsAlias &&
        tokenType === "color" &&
        (() => {
          const refPath = extractAliasPath(value as string);
          const resolved = refPath
            ? resolveRefValue(refPath, colorFlatMap)
            : null;
          if (!resolved) return null;
          return (
            <div
              className="w-3.5 h-3.5 rounded-sm border border-white/50 ring-1 ring-[var(--color-figma-border)]"
              style={{ backgroundColor: resolved }}
              title={resolved}
              aria-hidden="true"
            />
          );
        })()}
    </>
  );

  const afterHeader = (
    <>
      {pendingDraft && !isCreateMode && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/10 text-body">
          <Clock
            size={12}
            strokeWidth={1.5}
            className="shrink-0 text-[color:var(--color-figma-text-warning)]"
            aria-hidden
          />
          <span className="min-w-0 flex-1 break-words text-[color:var(--color-figma-text-warning)]">
            Unsaved changes from {formatDraftAge(pendingDraft.savedAt)}
          </span>
          <button
            type="button"
            onClick={() => applyDraft(pendingDraft)}
            className="shrink-0 text-secondary font-medium text-[color:var(--color-figma-text-warning)] hover:underline"
          >
            Restore
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingDraft(null);
              clearEditorDraft(ownerCollectionId, tokenPath);
            }}
            className="shrink-0 text-secondary text-[color:var(--color-figma-text-warning)] hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );

  const footer = (
    <div className={AUTHORING_SURFACE_CLASSES.footer}>
      {showFooterMeta ? (
        <div
          className={`${AUTHORING_SURFACE_CLASSES.footerMeta} flex flex-col gap-1.5`}
        >
          {footerNote ? (
            <span
              className={
                duplicatePath || crossCollectionDuplicatePath || saveBlockReason
                  ? "text-[color:var(--color-figma-text-error)]"
                  : undefined
              }
            >
              {footerNote}
            </span>
          ) : null}
          {isCreateMode && onSaveAndCreateAnother && (
            <button
              type="button"
              onClick={() => handleSave(false, true)}
              disabled={
                saving ||
                !canSave ||
                !trimmedEditPath ||
                duplicatePath ||
                crossCollectionDuplicatePath
              }
              title={`Create this token and immediately start creating another (${adaptShortcut(SHORTCUT_KEYS.EDITOR_SAVE_AND_NEW)})`}
              className="self-start text-secondary font-medium text-[color:var(--color-figma-text-accent)] hover:underline disabled:opacity-50"
            >
              Create another{" "}
              <span className="opacity-60">
                {adaptShortcut(SHORTCUT_KEYS.EDITOR_SAVE_AND_NEW)}
              </span>
            </button>
          )}
        </div>
      ) : null}
      <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
        <div
          className={`flex flex-wrap items-center gap-2 ${AUTHORING_SURFACE_CLASSES.footerSecondary}`}
        >
          <button
            type="button"
            onClick={requestClose}
            className={AUTHORING.footerBtnSecondary}
          >
            {isDirty || isCreateMode ? "Cancel" : "Close"}
          </button>
          {fieldEditable && isDirty && !isCreateMode && (
            <button
              type="button"
              onClick={handleRevert}
              title="Revert to last saved state"
              className={AUTHORING.footerBtnSecondary}
            >
              Revert
            </button>
          )}
        </div>
        <div
          className={AUTHORING_SURFACE_CLASSES.footerPrimary}
          onClick={() => {
            if (!canSave && saveBlockReason && tokenType === "typography")
              focusBlockedField();
          }}
        >
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={
              saving ||
              !fieldEditable ||
              !canSave ||
              duplicatePath ||
              crossCollectionDuplicatePath ||
              (!isCreateMode && !isDirty) ||
              (isCreateMode && !trimmedEditPath)
            }
            title={
              saveBlockReason ||
              `Save (${adaptShortcut(SHORTCUT_KEYS.EDITOR_SAVE)})`
            }
            className={AUTHORING.footerBtnPrimary}
          >
            {saving ? (
              isCreateMode ? (
                "Creating…"
              ) : (
                "Saving…"
              )
            ) : (
              <>{isCreateMode ? "Create" : "Save"}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  const extendsSection =
    !valueIsAlias && COMPOSITE_TOKEN_TYPES.has(tokenType) ? (
      <div className="flex flex-col gap-1">
        <label className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)]">
          Reuse properties from
        </label>
        {extendsPath ? (
          <div className="flex items-center gap-1.5">
            <Link2
              size={12}
              strokeWidth={1.5}
              className="shrink-0 text-[color:var(--color-figma-text-accent)]"
              aria-hidden
            />
            <span
              className={`${LONG_TEXT_CLASSES.monoPrimary} flex-1`}
              title={extendsPath}
            >
              {extendsPath}
            </span>
            {fieldEditable && (
              <button
                type="button"
                onClick={() => setExtendsPath("")}
                title="Remove source token"
                aria-label="Remove source token"
                className="shrink-0 rounded p-0.5 text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-error)]/10 hover:text-[color:var(--color-figma-text-error)]"
              >
                <X size={10} strokeWidth={1.5} aria-hidden />
              </button>
            )}
          </div>
        ) : fieldEditable ? (
          <ExtendsTokenPicker
            tokenType={tokenType}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            currentPath={isCreateMode ? trimmedEditPath : tokenPath}
            onSelect={setExtendsPath}
          />
        ) : (
          <p className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
            No source token
          </p>
        )}
        {extendsPath &&
          (() => {
            if (ambiguousExtendsCollectionIds.length > 0) {
              return (
                <p className="text-secondary text-[color:var(--color-figma-text-error)]">
                  This path is also used in{" "}
                  {formatCollectionIdList(ambiguousExtendsCollectionIds)}. Pick
                  a token path that belongs to one collection before inheriting
                  from it.
                </p>
              );
            }
            const source = allTokensFlat[extendsPath];
            if (!source) {
              return (
                <p className="text-secondary text-[color:var(--color-figma-text-error)]">
                  Source token not found
                </p>
              );
            }
            return (
              <p className="mt-0.5 text-secondary text-[color:var(--color-figma-text-tertiary)]">
                Properties are combined from this referenced token.
              </p>
            );
          })()}
      </div>
    ) : null;

  const readOnlyExtensionsText = extensionsJsonText.trim() || "{}";
  const lifecycleDotClass =
    lifecycle === "draft"
      ? "bg-[var(--color-figma-warning)]"
      : lifecycle === "deprecated"
        ? "bg-[var(--color-figma-text-tertiary)]"
        : "bg-[var(--color-figma-accent)]";

  const retryAction = saveRetryArgs ? (
    <button
      type="button"
      onClick={() => {
        setSaveRetryArgs(null);
        handleSaveRef.current(saveRetryArgs[0], saveRetryArgs[1]);
      }}
      className="tm-token-details__text-button"
    >
      Retry
    </button>
  ) : null;

  const valueSectionTitle =
    modeValue.modes.length >= 2 ? "Mode values" : "Value";
  const valueSectionActions =
    fieldEditable && onManageCollectionModes ? (
      <button
        type="button"
        onClick={() => onManageCollectionModes(ownerCollectionId)}
        className="tm-token-details__text-button inline-flex items-center gap-1"
      >
        <Plus size={12} strokeWidth={1.5} aria-hidden />
        Manage modes
      </button>
    ) : null;
  const referenceCount =
    (ancestors.isEmpty ? 0 : ancestors.chains.length) + dependents.length;
  const referencesLabel =
    referenceCount > 0 ? `References (${referenceCount})` : "References";
  const reviewIssuesLabel =
    tokenLintViolations.length > 0
      ? `Review issues (${tokenLintViolations.length})`
      : "Review issues";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <EditorShell
        surface="authoring"
        onBack={requestClose}
        backAriaLabel={backLabel ?? "Back"}
        backTitle={backLabel}
        title={headerTitle}
        headerActions={headerActions}
        afterHeader={afterHeader}
        bodyRef={scrollContainerRef}
        bodyProps={{
          onScroll: (e) => {
            scrollPositionsRef.current.set(
              tokenPath,
              e.currentTarget.scrollTop,
            );
          },
        }}
        bodyClassName={AUTHORING_SURFACE_CLASSES.bodyStack}
        footer={footer}
      >
        <TokenDetailsStatusBanners
          displayError={displayError}
          retryAction={retryAction}
          lintViolations={tokenLintViolations}
          lifecycle={lifecycle}
          isCreateMode={isCreateMode}
          isEditMode
          pendingTypeChange={pendingTypeChange}
          tokenType={tokenType}
          dependents={dependents}
          showPendingDependents={showPendingDependents}
          ownerCollectionId={ownerCollectionId}
          onDismissTypeChange={() => {
            setPendingTypeChange(null);
            setShowPendingDependents(false);
          }}
          onApplyTypeChange={() => {
            if (pendingTypeChange) applyTypeChange(pendingTypeChange);
          }}
          onTogglePendingDependents={() =>
            setShowPendingDependents((value) => !value)
          }
          onNavigateToToken={onNavigateToToken}
        />

        {activeGeneratorProvenance ? (
          <div
            className="tm-token-details__generator-banner"
            role="status"
            aria-label="Generator ownership"
          >
            <div className="tm-token-details__generator-banner-summary">
              <span>Managed by generator</span>
              <span
                className="tm-token-details__generator-banner-name"
                title={generatorName ?? activeGeneratorProvenance.generatorId}
              >
                {generatorName ?? activeGeneratorProvenance.generatorId}
              </span>
            </div>
            <div className="tm-token-details__generator-banner-actions">
              {onOpenGenerator ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenGenerator(activeGeneratorProvenance.generatorId)
                  }
                  className="tm-token-details__text-button"
                >
                  Open generator
                </button>
              ) : null}
              {fieldEditable || isGeneratorLocked ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowDetachGeneratorConfirm(true);
                  }}
                  disabled={detachingGeneratorOutput}
                  className="tm-token-details__text-button tm-token-details__text-button--muted"
                >
                  {detachingGeneratorOutput ? "Detaching…" : "Detach"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <Section title="Identity" emphasis="secondary" className="pt-0">
          <div className="tm-token-details__identity-grid">
            {isCreateMode ? (
              <div className="relative tm-token-details__identity-path" ref={pathInputWrapperRef}>
                <Field label="Token path">
                  <input
                    type="text"
                    value={editPath}
                    onChange={(e) => {
                      setEditPath(e.target.value);
                      setDisplayError(null);
                      setShowPathAutocomplete(true);
                    }}
                    onFocus={() => {
                      if (trimmedEditPath) setShowPathAutocomplete(true);
                    }}
                    onBlur={(e) => {
                      if (
                        !pathInputWrapperRef.current?.contains(
                          e.relatedTarget as Node,
                        )
                      ) {
                        setShowPathAutocomplete(false);
                      }
                    }}
                    placeholder={
                      NAMESPACE_SUGGESTIONS[tokenType]?.example ?? "token.name"
                    }
                    autoFocus
                    autoComplete="off"
                    className={`${AUTHORING.inputMono} ${
                      duplicatePath
                        ? "border-[var(--color-figma-error)] focus-visible:border-[var(--color-figma-error)]"
                        : ""
                    }`}
                  />
                </Field>
                {showPathAutocomplete && trimmedEditPath ? (
                  <PathAutocomplete
                    query={editPath}
                    allTokensFlat={ownerCollectionTokens}
                    onSelect={(path) => {
                      setEditPath(path);
                      setDisplayError(null);
                      setShowPathAutocomplete(path.endsWith("."));
                    }}
                    onClose={() => setShowPathAutocomplete(false)}
                  />
                ) : null}
              </div>
            ) : (
              <div className="tm-token-details__identity-path">
                <Field label="Token name" error={renameError}>
                  <div className="tm-token-details__rename-row">
                    <input
                      type="text"
                      value={renameInput}
                      disabled={renameDisabled}
                      onChange={(e) => {
                        setRenameInput(e.target.value);
                        setRenameError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void submitRename();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          revertRename();
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      title={
                        isDirty
                          ? "Save or discard value changes before renaming"
                          : undefined
                      }
                      className={`${AUTHORING.inputMono} ${
                        renameError
                          ? "border-[var(--color-figma-error)] focus-visible:border-[var(--color-figma-error)]"
                          : renameInputDiffers
                            ? "border-[var(--color-figma-accent)] focus-visible:border-[var(--color-figma-accent)]"
                            : ""
                      }`}
                      aria-label="Token name"
                    />
                    {renameInputDiffers ? (
                      <button
                        type="button"
                        onClick={() => void submitRename()}
                        disabled={renameDisabled}
                        title="Save name"
                        aria-label="Save name"
                        className="tm-token-details__inline-icon"
                      >
                        <Check size={12} strokeWidth={1.5} aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </Field>
                <p className={`m-0 mt-1 text-secondary text-[color:var(--color-figma-text-secondary)] ${LONG_TEXT_CLASSES.pathSecondary}`}>
                  Full path:{" "}
                  <span className="font-mono">{renamePreviewPath}</span>
                </p>
              </div>
            )}

            <Field label="Type">
              <TypePicker
                value={tokenType}
                onChange={handleTypeChange}
                disabled={!fieldEditable}
                title={fieldEditable ? "Change token type" : "Detach generator before changing type"}
                className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-secondary font-medium text-[color:var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)] disabled:opacity-60"
              />
            </Field>
          </div>

          {duplicatePath ? (
            <p className="tm-token-details__error-copy">
              A token with this path already exists in {ownerCollectionId}.
            </p>
          ) : null}
          {!duplicatePath && conflictingOtherCollectionIds.length > 0 ? (
            <p className="m-0 text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-text-error)]">
              This path is already used in{" "}
              {formatCollectionIdList(conflictingOtherCollectionIds)}. Use a
              unique path so references to{" "}
              <span className="font-mono">{trimmedEditPath}</span> stay clear.
            </p>
          ) : null}

          {isCreateMode && !editPath.includes(".") && createSuggestions.length > 0 ? (
            <div className="tm-token-details__suggestions">
              <span className="text-secondary text-[color:var(--color-figma-text-secondary)]">
                Try
              </span>
              {createSuggestions.map((prefix) => (
                <button
                  key={prefix}
                  type="button"
                  onClick={() => {
                    setEditPath(prefix);
                    setDisplayError(null);
                  }}
                  className="tm-token-details__suggestion-button"
                >
                  {prefix}
                </button>
              ))}
            </div>
          ) : null}
        </Section>

        <Section
          title={valueSectionTitle}
          actions={valueSectionActions}
          emphasis="primary"
        >
          <Stack
            gap={3}
            ref={valueEditorContainerRef}
            onPaste={fieldEditable ? handlePaste : undefined}
          >
            <div className="tm-token-details__mode-list">
              <Stack
                gap={1}
                title={
                  modeValue.modes.length >= 2
                    ? valueFormatHint(tokenType) || undefined
                    : undefined
                }
              >
                {modeValue.modes.map((mode, modeIdx) => {
                  const modeVal = mode.value;
                  const inheritedValue = extendsPath
                    ? getStoredModeValue(
                        allTokensFlat[extendsPath],
                        ownerCollectionId,
                        mode.name,
                        modeIdx,
                      )
                    : undefined;
                  const initialModeVal =
                    modeIdx === 0
                      ? initialFieldsSnapshot?.value
                      : initialFieldsSnapshot?.modeValues[ownerCollectionId]?.[
                          mode.name
                        ];
                  const isModeModified =
                    initialModeVal !== undefined &&
                    stableStringify(modeVal) !==
                      stableStringify(initialModeVal);
                  const showModeLabel = modeValue.modes.length >= 2;

                  return (
                    <TokenDetailsModeRow
                      key={`${ownerCollectionId}:${tokenPath}:${mode.name}`}
                      modeName={mode.name}
                      tokenType={tokenType}
                      value={modeVal}
                      editable={fieldEditable}
                      onChange={fieldEditable ? mode.setValue : undefined}
                      allTokensFlat={allTokensFlat}
                      pathToCollectionId={pathToCollectionId}
                      collectionIdsByPath={collectionIdsByPath}
                      showModeLabel={showModeLabel}
                      autoFocus={modeIdx === 0 && !isCreateMode && fieldEditable}
                      inheritedValue={inheritedValue}
                      availableFonts={availableFonts}
                      fontWeightsByFamily={fontWeightsByFamily}
                      fontFamilyRef={modeIdx === 0 ? fontFamilyRef : undefined}
                      fontSizeRef={modeIdx === 0 ? fontSizeRef : undefined}
                      modified={isModeModified && !isCreateMode}
                      onNavigateToToken={(path) => onNavigateToToken?.(path)}
                      allowCopyFromPrevious={
                        fieldEditable && modeValue.modes.length > 1 && modeIdx > 0
                      }
                      previousModeName={modeValue.modes[modeIdx - 1]?.name}
                      onCopyFromPrevious={
                        fieldEditable && modeValue.modes.length > 1 && modeIdx > 0
                          ? () => {
                              const sourceIdx = modeIdx - 1;
                              const sourceValue =
                                modeValue.modes[sourceIdx].value;
                              if (sourceValue != null) {
                                mode.setValue(cloneModeValue(sourceValue));
                              }
                            }
                          : undefined
                      }
                      allowCopyToAll={
                        fieldEditable &&
                        modeValue.modes.length > 1 &&
                        modeVal != null
                      }
                      onCopyToAll={
                        fieldEditable &&
                        modeValue.modes.length > 1 &&
                        modeVal != null
                          ? () => {
                              const sourceValue = mode.value;
                              if (sourceValue == null) return;
                              modeValue.modes.forEach((destMode, destIdx) => {
                                if (destIdx === modeIdx) return;
                                destMode.setValue(cloneModeValue(sourceValue));
                              });
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </Stack>
            </div>

            {fieldEditable && valueIsAlias ? (
              <DerivationEditor
                sourceType={tokenType as TokenType | undefined}
                reference={value as string}
                allTokensFlat={allTokensFlat}
                derivationOps={derivationOps}
                onDerivationOpsChange={setDerivationOps}
              />
            ) : null}

          </Stack>
        </Section>

        <Section title="Details" emphasis="secondary">
          <Stack gap={4}>
            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!fieldEditable}
                placeholder="Optional description"
                rows={2}
                className="min-h-[56px] w-full resize-none rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-body text-[color:var(--color-figma-text)] placeholder:text-[color:var(--color-figma-text-secondary)]/50 focus-visible:border-[var(--color-figma-accent)] disabled:opacity-60"
              />
            </Field>

            <div className="tm-token-details__details-list">
              {FIGMA_SCOPE_OPTIONS[tokenType] ? (
                <Field label="Can apply to">
                  <ScopeEditor
                    tokenTypes={[tokenType]}
                    selectedScopes={scopes}
                    onChange={setScopes}
                    disabled={!fieldEditable}
                    compact
                    showDescriptions={false}
                  />
                </Field>
              ) : null}

              <Field label="Lifecycle">
                <div className="tm-token-details__lifecycle-row">
                  <span
                    className={`tm-token-details__lifecycle-dot ${lifecycleDotClass}`}
                    aria-hidden
                  />
                  <select
                    value={lifecycle}
                    onChange={(e) =>
                      setLifecycle(e.target.value as typeof lifecycle)
                    }
                    disabled={!fieldEditable}
                    className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-body text-[color:var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)] disabled:opacity-60"
                    aria-label="Lifecycle"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="deprecated">Deprecated</option>
                  </select>
                </div>
              </Field>
            </div>
          </Stack>
        </Section>

        {!isCreateMode ? (
          <Section emphasis="support" className="tm-token-details__disclosures">
            <Collapsible
              open={relationshipsOpen}
              onToggle={() => setRelationshipsOpen((open) => !open)}
              label={referencesLabel}
              className="tm-token-details__collapsible"
            >
              <div className="tm-token-details__collapsible-body tm-token-details__reference-body">
                {ancestors.isEmpty && dependents.length === 0 ? (
                  <p className="tm-token-details__empty-copy">
                    No aliases or dependent tokens.
                  </p>
                ) : null}

                {!ancestors.isEmpty ? (
                  <div className="tm-token-details__reference-group">
                    <div className="tm-token-details__reference-heading">
                      Resolves through
                    </div>
                    <div className="tm-token-details__reference-list">
                      {ancestors.chains.map((chain) => (
                        <div
                          key={chain.modeName}
                          className="tm-token-details__reference-chain"
                        >
                          {ancestors.chains.length > 1 ? (
                            <div className="tm-token-details__list-note">
                              {chain.modeName}
                            </div>
                          ) : null}
                          {chain.rows.map((row, rowIdx) => {
                            const key = `${chain.modeName}::${rowIdx}::${row.path}`;
                            const crossCollection =
                              row.collectionId &&
                              row.collectionId !== ownerCollectionId;
                            const statusLabel = getAncestorRowStatusLabel(
                              row.status,
                            );
                            const tags = (
                              <>
                                {crossCollection ? (
                                  <span className="tm-token-details__mini-tag">
                                    {row.collectionId}
                                  </span>
                                ) : null}
                                {row.formulaSource ? (
                                  <span
                                    className="tm-token-details__mini-tag"
                                    title={row.formulaSource}
                                  >
                                    formula
                                  </span>
                                ) : null}
                                {statusLabel ? (
                                  <span className="tm-token-details__mini-tag">
                                    {statusLabel}
                                  </span>
                                ) : null}
                              </>
                            );
                            const handleNavigate =
                              onNavigateToToken &&
                              row.collectionId &&
                              row.status !== "missing" &&
                              row.status !== "ambiguous"
                                ? () =>
                                    onNavigateToToken(
                                      row.path,
                                      row.collectionId,
                                    )
                                : undefined;
                            return (
                              <ListItem
                                key={key}
                                onClick={handleNavigate}
                                title={
                                  handleNavigate
                                    ? `Open ${row.path}`
                                    : undefined
                                }
                                trailing={tags}
                                allowWrap
                              >
                                <span className={LONG_TEXT_CLASSES.monoPrimary}>
                                  {row.path}
                                </span>
                              </ListItem>
                            );
                          })}
                          {chain.terminalKind === "literal" &&
                          chain.terminalValue !== undefined ? (
                            <ListItem
                              allowWrap
                              className="tm-token-details__reference-terminal"
                            >
                              <span className={LONG_TEXT_CLASSES.monoPrimary}>
                                {formatTokenValueForDisplay(
                                  chain.terminalType,
                                  chain.terminalValue,
                                )}
                              </span>
                            </ListItem>
                          ) : null}
                          {(() => {
                            const terminalNote = getAncestorTerminalNote(
                              chain.terminalKind,
                            );
                            return terminalNote ? (
                              <div className="tm-token-details__list-note">
                                {terminalNote}
                              </div>
                            ) : null;
                          })()}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {dependents.length > 0 ? (
                  <div className="tm-token-details__reference-group">
                    <div className="tm-token-details__reference-heading">
                      Used by
                    </div>
                    <div className="tm-token-details__reference-list">
                      {dependents.slice(0, 20).map((dep) => {
                        const tag =
                          dep.collectionId !== ownerCollectionId ? (
                            <span className="tm-token-details__mini-tag">
                              {dep.collectionId}
                            </span>
                          ) : null;
                        return (
                          <ListItem
                            key={dep.path}
                            onClick={
                              onNavigateToToken
                                ? () =>
                                    onNavigateToToken(
                                      dep.path,
                                      dep.collectionId,
                                    )
                                : undefined
                            }
                            title={
                              onNavigateToToken ? `Open ${dep.path}` : undefined
                            }
                            trailing={tag}
                            allowWrap
                          >
                            <span className={LONG_TEXT_CLASSES.monoPrimary}>
                              {dep.path}
                            </span>
                          </ListItem>
                        );
                      })}
                      {dependents.length > 20 ? (
                        <div className="tm-token-details__list-note">
                          and {dependents.length - 20} more…
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </Collapsible>

            {tokenType === "color" ? (
              <ContrastChecker
                tokenPath={tokenPath}
                value={value}
                allTokensFlat={allTokensFlat}
                pathToCollectionId={pathToCollectionId}
                colorFlatMap={colorFlatMap}
              />
            ) : null}

            <Collapsible
              open={reviewOpen}
              onToggle={() => setReviewOpen((open) => !open)}
              label={reviewIssuesLabel}
              className="tm-token-details__collapsible"
            >
              <div className="tm-token-details__collapsible-body">
                {tokenLintViolations.length > 0 ? (
                  <Stack gap={1}>
                    {tokenLintViolations.map((violation, index) => (
                      <ListItem key={`${violation.rule}:${index}`} allowWrap>
                        <span className={LONG_TEXT_CLASSES.textPrimary}>
                          {violation.message}
                        </span>
                      </ListItem>
                    ))}
                  </Stack>
                ) : (
                  <p className="m-0 text-secondary text-[color:var(--color-figma-text-secondary)]">
                    No review issues for this token.
                  </p>
                )}
                {onOpenInHealth ? (
                  <div className="tm-token-details__related-actions">
                    <button
                      type="button"
                      onClick={onOpenInHealth}
                      className="tm-token-details__text-button"
                    >
                      Open in review
                    </button>
                  </div>
                ) : null}
              </div>
            </Collapsible>
          </Section>
        ) : null}

        <TokenDetailsAdvancedSection
          open={detailsOpen}
          onToggle={toggleDetails}
          extendsSection={extendsSection}
          readOnlyExtensionsText={readOnlyExtensionsText}
          extensionsJsonText={extensionsJsonText}
          onExtensionsJsonTextChange={setExtensionsJsonText}
          extensionsJsonError={extensionsJsonError}
          onExtensionsJsonErrorChange={setExtensionsJsonError}
          rawJsonPreview={rawJsonPreview}
          editable={fieldEditable}
        />
      </EditorShell>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <ConfirmModal
          title={`Delete "${tokenPath.split(".").pop()}"?`}
          description={`Token path: ${tokenPath}`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* Conflict confirmation */}
      {showConflictConfirm && (
        <ConfirmModal
          title="Token modified on server"
          description="This token was changed on the server since you started editing. Overwrite with your changes?"
          confirmLabel="Overwrite"
          cancelLabel="Cancel"
          danger
          onConfirm={() => {
            setShowConflictConfirm(false);
            handleSave(true);
          }}
          onCancel={() => setShowConflictConfirm(false)}
        />
      )}

      {/* Rename reference-update confirmation */}
      {renameConfirm && (
        <ConfirmModal
          title={`Rename "${leafName}"?`}
          description={`${renameConfirm.aliasCount} ${
            renameConfirm.aliasCount === 1
              ? "alias reference"
              : "alias references"
          } will be updated to point to ${renameConfirm.newPath}.`}
          confirmLabel="Rename and update references"
          cancelLabel="Cancel"
          onConfirm={() => performRename(renameConfirm.newPath, true)}
          onCancel={() => setRenameConfirm(null)}
        />
      )}

      {showDetachGeneratorConfirm && activeGeneratorProvenance ? (
        <ConfirmModal
          title="Detach from generator?"
          description="This token becomes manual and stops updating when the generator is previewed or applied."
          confirmLabel="Detach"
          cancelLabel="Cancel"
          onConfirm={handleDetachGeneratorOutput}
          onCancel={() => setShowDetachGeneratorConfirm(false)}
        />
      ) : null}
    </div>
  );
}
