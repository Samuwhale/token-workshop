import { adaptShortcut } from "../shared/utils";
import { SHORTCUT_KEYS } from "../shared/shortcutRegistry";
import { Spinner } from "./Spinner";
import { AUTHORING_SURFACE_CLASSES, EditorShell } from "./EditorShell";
import { AUTHORING } from "../shared/editorClasses";
import { apiFetch } from "../shared/apiFetch";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { MutableRefObject } from "react";
import { createGeneratorOwnershipKey, resolveRefValue } from "@tokenmanager/core";
import type { ThemeDimension } from "@tokenmanager/core";
import { useThemeSwitcherContext } from "../contexts/ThemeContext";
import { ConfirmModal } from "./ConfirmModal";
import type { TokenMapEntry } from "../../shared/types";
import { TOKEN_TYPE_BADGE_CLASS } from "../../shared/types";
import type { TokenGenerator } from "../hooks/useGenerators";
import { COMPOSITE_TOKEN_TYPES } from "@tokenmanager/core";
import { AliasPicker } from "./AliasPicker";
import { isAlias, extractAliasPath } from "../../shared/resolveAlias";
import { ContrastChecker } from "./ContrastChecker";
import { ColorModifiersEditor } from "./ColorModifiersEditor";
import { MetadataEditor } from "./MetadataEditor";
import { ModeValuesEditor } from "./token-editor/ModeValuesEditor";
import { PathAutocomplete } from "./PathAutocomplete";
import { useNearbyTokenMatch } from "../hooks/useNearbyTokenMatch";
import { Collapsible } from "./Collapsible";

// Hooks
import { useTokenEditorFields } from "../hooks/useTokenEditorFields";
import { useTokenEditorLoad } from "../hooks/useTokenEditorLoad";
import { useTokenDependents } from "../hooks/useTokenDependents";
import { useTokenAliasEditor } from "../hooks/useTokenAliasEditor";
import { useTokenTypeParsing } from "../hooks/useTokenTypeParsing";
import { useTokenEditorUIState } from "../hooks/useTokenEditorUIState";
import { useTokenEditorSave } from "../hooks/useTokenEditorSave";
import { useTokenEditorGenerators } from "../hooks/useTokenEditorGenerators";
import {
  clearEditorDraft,
  saveEditorDraft,
  formatDraftAge,
} from "../hooks/useTokenEditorUtils";
import { buildTokenDependencySnapshot } from "./TokenFlowPanel";
import type { TokensLibraryGeneratorEditorTarget } from "../shared/navigationTypes";
import { lsGet, lsSet } from "../shared/storage";
import { dispatchToast } from "../shared/toastBus";
import { LONG_TEXT_CLASSES } from "../shared/longTextStyles";

// Extracted sub-components
import { detectAliasCycle, parsePastedValue, getInitialCreateValue, NAMESPACE_SUGGESTIONS } from "./token-editor/tokenEditorHelpers";
import { ExtendsTokenPicker } from "./token-editor/ExtendsTokenPicker";
import { SaveChangesDialog } from "./token-editor/SaveChangesDialog";
import { TokenEditorValueSection } from "./token-editor/TokenEditorValueSection";
import { TokenEditorDerivedGroups } from "./token-editor/TokenEditorDerivedGroups";
import { TokenEditorInfoSection } from "./token-editor/TokenEditorInfoSection";

interface TokenEditorProps {
  tokenPath: string;
  tokenName?: string;
  setName: string;
  serverUrl: string;
  onBack: () => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
  generators?: TokenGenerator[];
  /** When true, the editor creates a new token instead of editing an existing one. */
  isCreateMode?: boolean;
  /** Initial token type for create mode. */
  initialType?: string;
  /** Initial value for create mode — when it looks like an alias (e.g. "{color.primary}"), alias mode is activated automatically. */
  initialValue?: string;
  /** Called whenever the dirty state changes so the parent can guard backdrop clicks. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Called with the final saved path on a successful save so the parent can highlight it. */
  onSaved?: (savedPath: string) => void;
  /** Theme dimensions used to show per-mode value overrides. */
  dimensions?: ThemeDimension[];
  /** Called after a save to trigger a data refresh. */
  onRefresh?: () => void;
  /** Called after a successful create when the user wants to immediately create another token. Receives the saved path so the parent can derive a sibling prefix. */
  onSaveAndCreateAnother?: (savedPath: string, tokenType: string) => void;
  /** Available font families from Figma for the font picker. */
  availableFonts?: string[];
  /** Available numeric weights per font family (keyed by family name). */
  fontWeightsByFamily?: Record<string, number[]>;
  /** Map of derived token paths to the generator that produces them. */
  derivedTokenPaths?: Map<string, TokenGenerator>;
  /** Ref that will be assigned the handleBack function so parents can trigger guarded close (e.g. from a backdrop click). */
  closeRef?: MutableRefObject<() => void>;
  /** Navigate to Token Flow panel with this token pre-selected */
  onShowReferences?: (path: string) => void;
  /** Navigate to a token by path in the token list (highlight it, switch sets if needed) */
  onNavigateToToken?: (path: string, fromPath?: string) => void;
  /** Navigate to a generator in GraphPanel */
  onNavigateToGenerator?: (generatorId: string) => void;
  /** Open the shared Tokens > Library generator editor contextual surface. */
  onOpenGeneratorEditor?: (target: TokensLibraryGeneratorEditorTarget) => void;
  /** Navigate to Modes workspace to configure modes */
  onNavigateToThemes?: () => void;
  /** Push an undo slot after a successful token save or create */
  pushUndo?: (slot: import("../hooks/useUndo").UndoSlot) => void;
}

export function TokenEditor({
  tokenPath,
  tokenName,
  setName,
  serverUrl,
  onBack,
  allTokensFlat = {},
  pathToSet = {},
  generators = [],
  isCreateMode = false,
  initialType,
  initialValue,
  onDirtyChange,
  onSaved,
  onSaveAndCreateAnother,
  dimensions = [],
  onRefresh,
  availableFonts = [],
  fontWeightsByFamily = {},
  derivedTokenPaths,
  closeRef,
  onShowReferences,
  onNavigateToToken,
  onNavigateToGenerator,
  onOpenGeneratorEditor,
  onNavigateToThemes,
  pushUndo,
}: TokenEditorProps) {
  // Theme switcher for quick-flip bar
  const themeSwitcher = useThemeSwitcherContext();

  // 1. Fields hook — all editable state
  const fields = useTokenEditorFields({
    isCreateMode,
    initialType,
    initialValue,
    tokenPath,
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
    reference,
    setReference,
    aliasMode,
    setAliasMode,
    scopes,
    setScopes,
    colorModifiers,
    setColorModifiers,
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
    preAliasValueRef,
    isDirty,
    colorFlatMap,
  } = fields;

  const valueEditorContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionsRef = useRef(new Map<string, number>());

  // Alias editor hook — needed by load hook (refInputRef) and save hook (handleToggleAlias)
  // We initialize it early since load hook needs refInputRef
  const aliasEditor = useTokenAliasEditor({
    aliasMode,
    setAliasMode,
    value,
    setValue,
    reference,
    setReference,
    tokenType,
    allTokensFlat,
    preAliasValueRef,
  });
  const {
    showAutocomplete,
    setShowAutocomplete,
    refInputRef,
    handleToggleAlias,
  } = aliasEditor;

  // Transient error state — also needed by load hook
  const [error, setError] = useState<string | null>(null);

  // 2. Load hook — fetches token, populates fields
  const loadResult = useTokenEditorLoad({
    serverUrl,
    setName,
    tokenPath,
    isCreateMode,
    initialRef,
    setTokenType,
    setValue,
    setDescription,
    setReference,
    setAliasMode,
    setScopes,
    setColorModifiers,
    setModeValues,
    dimensions,
    setExtensionsJsonText,
    setLifecycle,
    setExtendsPath,
    setError,
    refInputRef,
    valueEditorContainerRef,
  });
  const { loading, pendingDraft, setPendingDraft, initialServerSnapshotRef } =
    loadResult;

  // 3. Dependents hook
  const { dependents, dependentsLoading } = useTokenDependents({
    serverUrl,
    setName,
    tokenPath,
    isCreateMode,
  });

  // 5. Type parsing hook
  const typeParsing = useTokenTypeParsing({
    tokenType,
    setTokenType,
    value,
    setValue,
    aliasMode,
    reference,
    setReference,
    setAliasMode,
    setShowAutocomplete,
    setScopes,
    setExtendsPath,
    extensionsJsonError,
    isCreateMode,
    editPath: tokenPath, // placeholder; updated below after UIState
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
    aliasHasCycle,
    canSave,
    saveBlockReason,
    applyTypeChange,
    handleTypeChange,
    focusBlockedField,
  } = typeParsing;

  // 6. UI state hook
  const uiState = useTokenEditorUIState({
    isDirty,
    onBack,
    setShowDiscardConfirm: () => {}, // placeholder; we manage showDiscardConfirm here
    tokenType,
    aliasMode,
    value,
    tokenPath,
    setName,
  });
  const {
    showDeleteConfirm,
    setShowDeleteConfirm,
    copied,
    setCopied,
    pasteFlash,
    showPathAutocomplete,
    setShowPathAutocomplete,
    editPath,
    setEditPath,
    refsExpanded,
    setRefsExpanded,
    pathInputWrapperRef,
    handlePasteInValueEditor,
  } = uiState;

  // showDiscardConfirm managed here since it's referenced by both UIState and Save
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const handleBack = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onBack();
    }
  }, [isDirty, onBack]);

  // Keep the ref up-to-date so App.tsx's backdrop click can call handleBack()
  if (closeRef) closeRef.current = handleBack;

  // 7. Save hook
  const saveHook = useTokenEditorSave({
    serverUrl,
    setName,
    tokenPath,
    isCreateMode,
    editPath,
    tokenType,
    value,
    reference,
    description,
    scopes,
    colorModifiers,
    modeValues,
    extensionsJsonText,
    lifecycle,
    extendsPath,
    initialServerSnapshotRef,
    onBack,
    onSaved,
    onSaveAndCreateAnother,
    pushUndo,
    handleToggleAlias,
    handleBack,
    showDiscardConfirm,
    setShowDiscardConfirm,
    showAutocomplete,
    setShowAutocomplete,
    isDirty,
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

  // Merge errors from load and save hooks
  const displayError = error || saveError;
  const setDisplayError = useCallback((v: string | null) => {
    setError(v);
    setSaveError(v);
  }, [setError, setSaveError]);

  useEffect(() => {
    if (!isCreateMode) return;
    const resolvedType = initialType || 'color';
    const aliasInitialValue = initialValue && isAlias(initialValue) ? initialValue : '';
    const initialCreateValue = getInitialCreateValue(resolvedType, initialValue);
    initialRef.current = {
      value: initialCreateValue,
      description: '',
      reference: aliasInitialValue,
      scopes: [],
      type: resolvedType,
      colorModifiers: [],
      modeValues: {},
      extensionsJsonText: '',
      lifecycle: 'published',
      extendsPath: '',
    };
    setTokenType(resolvedType);
    setValue(initialCreateValue);
    setDescription('');
    setReference(aliasInitialValue);
    setAliasMode(Boolean(aliasInitialValue));
    setScopes([]);
    setColorModifiers([]);
    setModeValues({});
    setExtensionsJsonText('');
    setExtensionsJsonError(null);
    setLifecycle('published');
    setExtendsPath('');
    setEditPath(tokenPath);
    setShowPathAutocomplete(tokenPath.trim().endsWith('.'));
    setDisplayError(null);
  }, [
    initialRef,
    initialType,
    initialValue,
    isCreateMode,
    setAliasMode,
    setColorModifiers,
    setDescription,
    setEditPath,
    setExtensionsJsonError,
    setExtensionsJsonText,
    setExtendsPath,
    setLifecycle,
    setModeValues,
    setReference,
    setScopes,
    setDisplayError,
    setShowPathAutocomplete,
    setTokenType,
    setValue,
    tokenPath,
  ]);

  useEffect(() => {
    if (!isCreateMode) return;
    lsSet('tm_last_token_type', tokenType);
  }, [isCreateMode, tokenType]);

  // 8. Generators hook
  const generators$ = useTokenEditorGenerators({
    tokenPath,
    tokenType,
    generators,
  });
  const {
    existingGeneratorsForToken,
    canBeGeneratorSource,
  } = generators$;
  const producingGenerator =
    derivedTokenPaths?.get(createGeneratorOwnershipKey(setName, tokenPath)) ??
    null;
  const [detachedFromGenerator, setDetachedFromGenerator] = useState(false);
  const [detachingGeneratorOwnership, setDetachingGeneratorOwnership] =
    useState(false);
  const activeProducingGenerator =
    detachedFromGenerator ? null : producingGenerator;

  const openGeneratorEditor = useCallback((target: TokensLibraryGeneratorEditorTarget) => {
    onOpenGeneratorEditor?.(target);
  }, [onOpenGeneratorEditor]);

  useEffect(() => {
    setDetachedFromGenerator(false);
  }, [tokenPath, producingGenerator?.id]);

  const handleDetachGeneratorOwnership = useCallback(async () => {
    if (!producingGenerator) return;
    setDetachingGeneratorOwnership(true);
    try {
      setError(null);
      await apiFetch(`${serverUrl}/api/generators/${producingGenerator.id}/detach`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scope: "token",
          path: tokenPath,
        }),
      });
      if (initialServerSnapshotRef.current) {
        try {
          const snapshot = JSON.parse(initialServerSnapshotRef.current) as {
            $extensions?: Record<string, unknown>;
          } | null;
          if (snapshot?.$extensions) {
            const nextExtensions = { ...snapshot.$extensions };
            delete nextExtensions["com.tokenmanager.generator"];
            initialServerSnapshotRef.current = JSON.stringify({
              ...snapshot,
              $extensions:
                Object.keys(nextExtensions).length > 0 ? nextExtensions : undefined,
            });
          }
        } catch (err) {
          console.debug("[TokenEditor] failed to update detached generator snapshot:", err);
        }
      }
      setDetachedFromGenerator(true);
      onRefresh?.();
      dispatchToast(
        `Detached "${tokenPath}" from "${producingGenerator.name}"`,
        "success",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to detach token from recipe");
    } finally {
      setDetachingGeneratorOwnership(false);
    }
  }, [initialServerSnapshotRef, onRefresh, producingGenerator, serverUrl, tokenPath]);

  // Cross-cutting: re-compute type parsing with actual editPath
  const duplicatePath = useMemo(() => {
    if (!isCreateMode) return false;
    const trimmed = editPath.trim();
    if (!trimmed) return false;
    return trimmed in allTokensFlat;
  }, [isCreateMode, editPath, allTokensFlat]);

  // onDirtyChange cross-cut effect
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Restore scroll position when navigating between tokens.
  // Uses a per-session Map keyed by token path so returning to a previously-
  // scrolled token restores the saved position; first visits start at 0.
  useEffect(() => {
    const saved = scrollPositionsRef.current.get(tokenPath) ?? 0;
    const raf = requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = saved;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [tokenPath]);

  // Auto-save draft to sessionStorage whenever the editor has unsaved changes.
  useEffect(() => {
    if (!isDirty || isCreateMode) return;
    saveEditorDraft(setName, tokenPath, {
      tokenType,
      value,
      description,
      reference,
      scopes,
      colorModifiers,
      modeValues,
      extensionsJsonText,
      lifecycle,
      extendsPath,
    });
  }, [
    isDirty,
    setName,
    tokenPath,
    isCreateMode,
    tokenType,
    value,
    description,
    reference,
    scopes,
    colorModifiers,
    modeValues,
    extensionsJsonText,
    lifecycle,
    extendsPath,
  ]);

  // Smart alias suggestion: find tokens whose value is near the current value
  const currentPathForMatch = isCreateMode ? editPath.trim() : tokenPath;
  const nearbyMatches = useNearbyTokenMatch(
    value,
    tokenType,
    allTokensFlat,
    currentPathForMatch,
    !aliasMode,
  );
  const dependencySnapshot = useMemo(
    () =>
      isCreateMode
        ? null
        : buildTokenDependencySnapshot(tokenPath, allTokensFlat, pathToSet),
    [isCreateMode, tokenPath, allTokensFlat, pathToSet],
  );
  const referenceTrace = dependencySnapshot?.referenceNodes ?? [];
  const dependentTrace = dependencySnapshot?.dependentNodes ?? [];

  const handleRevert = () => {
    if (!initialRef.current) return;
    const init = initialRef.current;
    setTokenType(init.type);
    setValue(init.value);
    setDescription(init.description);
    setReference(init.reference);
    setScopes(init.scopes);
    setColorModifiers(init.colorModifiers);
    setModeValues(init.modeValues);
    setExtensionsJsonText(init.extensionsJsonText);
    setExtensionsJsonError(null);
    setExtendsPath(init.extendsPath);
    setAliasMode(!!init.reference);
    clearEditorDraft(setName, tokenPath);
    setPendingDraft(null);
  };

  const applyDraft = (draft: typeof pendingDraft) => {
    if (!draft) return;
    setTokenType(draft.tokenType);
    setValue(draft.value);
    setDescription(draft.description);
    setReference(draft.reference);
    setAliasMode(!!draft.reference);
    setScopes(draft.scopes);
    setColorModifiers(draft.colorModifiers);
    setModeValues(draft.modeValues);
    setExtensionsJsonText(draft.extensionsJsonText);
    setLifecycle(draft.lifecycle);
    setExtendsPath(draft.extendsPath);
    setPendingDraft(null);
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      handlePasteInValueEditor(e, parsePastedValue, setValue);
    },
    [handlePasteInValueEditor, setValue],
  );

  // Progressive disclosure: collapsible section state
  const [detailsOpen, setDetailsOpen] = useState(() => {
    return lsGet('tm_editor_details') === '1';
  });
  const toggleDetails = useCallback(() => {
    setDetailsOpen((v) => {
      const next = !v;
      lsSet('tm_editor_details', next ? '1' : '0');
      return next;
    });
  }, []);
  const [infoTab, setInfoTab] = useState<'dependencies' | 'usage' | 'history' | null>(() => {
    const saved = lsGet('tm_editor_info_tab');
    if (saved === 'dependencies' || saved === 'usage' || saved === 'history') return saved;
    return null;
  });
  const handleInfoTab = useCallback((tab: 'dependencies' | 'usage' | 'history') => {
    setInfoTab((prev) => {
      const next = prev === tab ? null : tab;
      lsSet('tm_editor_info_tab', next ?? '');
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div role="status" className="flex flex-col items-center justify-center gap-2 py-3 text-[var(--color-figma-text-secondary)] text-[11px]">
        <Spinner size="md" className="text-[var(--color-figma-accent)]" />
        Loading token...
      </div>
    );
  }

  const trimmedEditPath = editPath.trim();
  const trimmedEditLeaf = trimmedEditPath.split(".").filter(Boolean).pop() ?? "";
  const createSuggestions = NAMESPACE_SUGGESTIONS[tokenType]?.prefixes ?? [];
  const footerNote =
    isCreateMode && duplicatePath
      ? "Choose another token path to continue."
      : isCreateMode && !trimmedEditPath
        ? "Enter a token path to create this token."
        : saveBlockReason;

  const headerTitle = (
    <>
      {isCreateMode ? (
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">
            New token
          </div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
            Create a new token in {setName}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={`${LONG_TEXT_CLASSES.monoPrimary} flex-1`}>
            {tokenPath}
          </div>
          {isDirty && (
            <span
              className="shrink-0 px-1 py-px rounded text-[9px] font-medium bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] border border-[var(--color-figma-accent)]/30 leading-none"
              title="Unsaved changes"
              aria-label="Unsaved changes"
            >
              Unsaved
            </span>
          )}
        </div>
      )}
      {!isCreateMode && (
        <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
          in {setName}
        </div>
      )}
    </>
  );

  const headerActions = (
    <>
      {!isCreateMode && onShowReferences && (
        <button
          type="button"
          onClick={() => onShowReferences(tokenPath)}
          title="Open advanced dependency graph (Apply → Dependencies)"
          aria-label="Open advanced dependency graph"
          className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
          </svg>
        </button>
      )}
      {!isCreateMode && (
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(tokenPath);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          title="Copy token path"
          aria-label="Copy token path"
          className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
        >
          {copied ? (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      )}
      {aliasMode &&
        reference &&
        tokenType === "color" &&
        (() => {
          const refPath = extractAliasPath(reference);
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
      {!isCreateMode && (
        <select
          value={tokenType}
          onChange={(e) => handleTypeChange(e.target.value)}
          title="Change token type"
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase cursor-pointer border-0 outline-none appearance-none ${TOKEN_TYPE_BADGE_CLASS[tokenType ?? ""] ?? "token-type-string"}`}
          style={{ backgroundImage: "none" }}
        >
          {Object.keys(TOKEN_TYPE_BADGE_CLASS).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}
    </>
  );

  const afterHeader = (
    <>
      {dimensions.length > 0 && !isCreateMode && (
        <div className="flex items-center gap-1.5 px-3 py-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/30">
          <span className="text-[9px] text-[var(--color-figma-text-tertiary)] shrink-0">Theme</span>
          {dimensions.map((dim) => {
            const activeOption = themeSwitcher.activeThemes[dim.id] || dim.options[0]?.name || "";
            return (
              <button
                key={dim.id}
                type="button"
                onClick={() => {
                  const idx = dim.options.findIndex((o) => o.name === activeOption);
                  const nextIdx = (idx + 1) % dim.options.length;
                  const nextOption = dim.options[nextIdx]?.name;
                  if (nextOption) {
                    themeSwitcher.setActiveThemes({
                      ...themeSwitcher.activeThemes,
                      [dim.id]: nextOption,
                    });
                  }
                }}
                className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-figma-text)] hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-accent)] transition-colors"
                title={`${dim.name}: ${activeOption} (click to cycle)`}
              >
                {dimensions.length > 1 ? `${dim.name}: ` : ""}{activeOption}
              </button>
            );
          })}
        </div>
      )}
      {pendingDraft && !isCreateMode && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-400/40 bg-amber-50/80 dark:bg-amber-900/20 text-[11px]">
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className="flex-1 text-amber-800 dark:text-amber-200 truncate">
            Unsaved draft from {formatDraftAge(pendingDraft.savedAt)}
          </span>
          <button
            type="button"
            onClick={() => applyDraft(pendingDraft)}
            className="shrink-0 text-[10px] font-medium text-amber-700 dark:text-amber-300 hover:underline"
          >
            Restore
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingDraft(null);
              clearEditorDraft(setName, tokenPath);
            }}
            className="shrink-0 text-[10px] text-amber-500 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );

  const footer = (
    <div className={AUTHORING_SURFACE_CLASSES.footer}>
      {(footerNote || (isCreateMode && onSaveAndCreateAnother)) && (
        <div className={`${AUTHORING_SURFACE_CLASSES.footerMeta} flex items-center justify-between gap-2`}>
          <span
            className={
              footerNote && (duplicatePath || saveBlockReason)
                ? "text-[var(--color-figma-error)]"
                : undefined
            }
          >
            {footerNote || " "}
          </span>
          {isCreateMode && onSaveAndCreateAnother && (
            <button
              type="button"
              onClick={() => handleSave(false, true)}
              disabled={saving || !canSave || !trimmedEditPath || duplicatePath}
              title={`Create this token and immediately start creating another (${adaptShortcut(SHORTCUT_KEYS.EDITOR_SAVE_AND_NEW)})`}
              className="shrink-0 text-[10px] font-medium text-[var(--color-figma-accent)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create another{" "}
              <span className="opacity-60">
                {adaptShortcut(SHORTCUT_KEYS.EDITOR_SAVE_AND_NEW)}
              </span>
            </button>
          )}
        </div>
      )}
      <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
        <div className="flex flex-wrap items-center gap-2">
          {!isCreateMode && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              title="Delete token"
              aria-label="Delete token"
              className="p-1.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-error)]/10 hover:text-[var(--color-figma-error)]"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
              </svg>
            </button>
          )}
          <button type="button" onClick={handleBack} className={AUTHORING.footerBtnSecondary}>
            {isDirty || isCreateMode ? "Cancel" : "Close"}
          </button>
          {isDirty && !isCreateMode && (
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
          className="ml-auto min-w-[140px] flex-1"
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
              !canSave ||
              duplicatePath ||
              (!isCreateMode && !isDirty) ||
              (isCreateMode && !trimmedEditPath)
            }
            title={saveBlockReason || `Save (${adaptShortcut(SHORTCUT_KEYS.EDITOR_SAVE)})`}
            className={AUTHORING.footerBtnPrimary}
          >
            {saving ? (
              isCreateMode ? (
                "Creating…"
              ) : (
                "Saving…"
              )
            ) : (
              <>
                {isCreateMode ? "Create token" : "Save changes"}{" "}
                <span className="ml-1 opacity-60 text-[10px]">
                  {adaptShortcut(SHORTCUT_KEYS.EDITOR_SAVE)}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <EditorShell
        surface="authoring"
        onBack={handleBack}
        title={headerTitle}
        headerActions={headerActions}
        afterHeader={afterHeader}
        bodyRef={scrollContainerRef}
        bodyProps={{
          onScroll: (e) => {
            scrollPositionsRef.current.set(tokenPath, e.currentTarget.scrollTop);
          },
        }}
        bodyClassName={AUTHORING_SURFACE_CLASSES.bodyStack}
        footer={footer}
      >
        {displayError && (
          <div
            role="alert"
            className="px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px] break-words max-h-16 overflow-auto flex items-start gap-2"
          >
            <span className="flex-1">{displayError}</span>
            {saveRetryArgs && (
              <button
                type="button"
                onClick={() => {
                  setSaveRetryArgs(null);
                  handleSaveRef.current(saveRetryArgs[0], saveRetryArgs[1]);
                }}
                className="shrink-0 font-medium underline hover:opacity-80"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {activeProducingGenerator && !isCreateMode && (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] text-[var(--color-figma-text-secondary)]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[var(--color-figma-text)]">
                  This token is managed by{" "}
                  <span className="font-medium">{activeProducingGenerator.name}</span>.
                  Manual value changes here will be overwritten on the next recipe run.
                </p>
                <p className="mt-1">
                  Edit the recipe to change the managed output, or detach this token first to make it independently editable.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {(onOpenGeneratorEditor || onNavigateToGenerator) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenGeneratorEditor) {
                        openGeneratorEditor({
                          mode: "edit",
                          id: activeProducingGenerator.id,
                        });
                        return;
                      }
                      onNavigateToGenerator?.(activeProducingGenerator.id);
                    }}
                    className="px-2 py-1 rounded border border-[var(--color-figma-border)] text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    Edit generator
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void handleDetachGeneratorOwnership();
                  }}
                  disabled={detachingGeneratorOwnership}
                  className="px-2 py-1 rounded border border-[var(--color-figma-border)] text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50"
                >
                  {detachingGeneratorOwnership ? "Detaching…" : "Detach token"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Type-change confirmation — shown when a type switch would reset a non-default value */}
        {pendingTypeChange && (
          <div className="px-2 py-2 rounded border border-amber-500/30 bg-amber-500/10 text-[10px]">
            <p className="text-[var(--color-figma-text)] mb-2">
              Switch to <strong>{pendingTypeChange}</strong>? This will reset
              the current value.
              {dependents.length > 0 && (
                <span className="block mt-1">
                  <button
                    type="button"
                    onClick={() => setShowPendingDependents((v) => !v)}
                    className="flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="currentColor"
                      className={`transition-transform shrink-0 ${showPendingDependents ? "rotate-90" : ""}`}
                      aria-hidden="true"
                    >
                      <path d="M2 1l4 3-4 3V1z" />
                    </svg>
                    {dependents.length} dependent token
                    {dependents.length !== 1 ? "s" : ""} reference this token
                    and may break.
                  </button>
                  {showPendingDependents && (
                    <span className="mt-1 flex flex-col gap-0.5 max-h-28 overflow-y-auto">
                      {dependents.slice(0, 20).map((dep) =>
                        onShowReferences ? (
                          <button
                            key={dep.path}
                            type="button"
                            onClick={() => {
                              setPendingTypeChange(null);
                              onShowReferences(dep.path);
                            }}
                            className="flex items-center gap-1 px-1 py-0.5 rounded font-mono text-[9px] text-[var(--color-figma-text)] hover:bg-amber-500/20 hover:text-amber-300 transition-colors text-left w-full"
                            title={`Open ${dep.path} in dependency graph`}
                          >
                            <svg
                              width="8"
                              height="8"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                              className="shrink-0 opacity-60"
                            >
                              <circle cx="12" cy="12" r="3" />
                              <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
                            </svg>
                            <span className={LONG_TEXT_CLASSES.monoPrimary}>{dep.path}</span>
                            {dep.setName !== setName && (
                              <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-amber-500/20 text-amber-400 ml-auto">
                                {dep.setName}
                              </span>
                            )}
                          </button>
                        ) : (
                          <span
                            key={dep.path}
                            className="flex items-center gap-1 px-1 py-0.5 font-mono text-[9px] text-[var(--color-figma-text)]"
                          >
                            <span className={LONG_TEXT_CLASSES.monoPrimary}>{dep.path}</span>
                            {dep.setName !== setName && (
                              <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-amber-500/20 text-amber-400 ml-auto">
                                {dep.setName}
                              </span>
                            )}
                          </span>
                        ),
                      )}
                      {dependents.length > 20 && (
                        <span className="px-1 py-0.5 text-[9px] text-amber-400/70 italic">
                          and {dependents.length - 20} more…
                        </span>
                      )}
                    </span>
                  )}
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingTypeChange(null);
                  setShowPendingDependents(false);
                }}
                className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Keep {tokenType}
              </button>
              <button
                type="button"
                onClick={() => applyTypeChange(pendingTypeChange)}
                className="flex-1 px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600"
              >
                Switch type
              </button>
            </div>
          </div>
        )}

        {isCreateMode && (
          <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-figma-border)]/70 bg-[var(--color-figma-bg-secondary)]/25 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-[var(--color-figma-text)]">
                  Token details
                </p>
                <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  Pick the token type and where it lives in {setName}.
                </p>
              </div>
              <div className="w-[112px] shrink-0">
                <label className="mb-1 block text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                  Type
                </label>
                <select
                  value={tokenType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  title="Change token type"
                  className="w-full rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[10px] font-medium uppercase text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
                >
                  {Object.keys(TOKEN_TYPE_BADGE_CLASS).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="relative" ref={pathInputWrapperRef}>
              <label className="mb-1 block text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                Token path
              </label>
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
                    !pathInputWrapperRef.current?.contains(e.relatedTarget as Node)
                  ) {
                    setShowPathAutocomplete(false);
                  }
                }}
                placeholder="color.brand.500"
                autoFocus
                autoComplete="off"
                className={`${AUTHORING.inputMono} ${
                  duplicatePath
                    ? "border-[var(--color-figma-error)] focus-visible:border-[var(--color-figma-error)]"
                    : ""
                }`}
              />
              {showPathAutocomplete && trimmedEditPath && (
                <PathAutocomplete
                  query={editPath}
                  allTokensFlat={allTokensFlat}
                  onSelect={(path) => {
                    setEditPath(path);
                    setDisplayError(null);
                    setShowPathAutocomplete(path.endsWith("."));
                  }}
                  onClose={() => setShowPathAutocomplete(false)}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--color-figma-text-secondary)]">
              <span>Set: {setName}</span>
              {trimmedEditLeaf && <span>Leaf: {trimmedEditLeaf}</span>}
            </div>
            {duplicatePath && (
              <p className="text-[10px] text-[var(--color-figma-error)]">
                A token with this path already exists in{" "}
                {pathToSet[trimmedEditPath] || setName}.
              </p>
            )}
            {!editPath.includes(".") && createSuggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  Try:
                </span>
                {createSuggestions.map((prefix) => (
                  <button
                    key={prefix}
                    type="button"
                    onClick={() => {
                      setEditPath(prefix);
                      setDisplayError(null);
                    }}
                    className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] ring-1 ring-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                  >
                    {prefix}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Alias mode toggle + reference input */}
        <AliasPicker
          aliasMode={aliasMode}
          reference={reference}
          tokenType={tokenType}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          onToggleAlias={handleToggleAlias}
          onReferenceChange={setReference}
          showAutocomplete={showAutocomplete}
          onShowAutocompleteChange={setShowAutocomplete}
          aliasHasCycle={aliasHasCycle}
          refInputRef={refInputRef}
        />

        {/* Type-specific editor */}
        {!reference && (
          <TokenEditorValueSection
            tokenPath={tokenPath}
            tokenType={tokenType}
            value={value}
            setValue={setValue}
            isCreateMode={isCreateMode}
            extendsPath={extendsPath}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            initialValue={initialRef.current?.value ?? null}
            fontFamilyRef={fontFamilyRef}
            fontSizeRef={fontSizeRef}
            availableFonts={availableFonts}
            fontWeightsByFamily={fontWeightsByFamily}
            canSave={canSave}
            saveBlockReason={saveBlockReason}
            focusBlockedField={focusBlockedField}
            pasteFlash={pasteFlash}
            onPaste={handlePaste}
            nearbyMatches={nearbyMatches}
            onAcceptNudge={(path) => {
              preAliasValueRef.current = value;
              setAliasMode(true);
              setReference(`{${path}}`);
              setTimeout(() => refInputRef.current?.focus(), 0);
            }}
            valueEditorContainerRef={valueEditorContainerRef}
          />
        )}

        <ModeValuesEditor
          dimensions={dimensions}
          modeValues={modeValues}
          onModeValuesChange={setModeValues}
          tokenType={tokenType}
          aliasMode={aliasMode}
          reference={reference}
          value={value}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          onNavigateToThemes={onNavigateToThemes}
          activeThemes={themeSwitcher.activeThemes}
        />

        {/* Details — metadata, variants, and support tools */}
        <Collapsible
          open={detailsOpen}
          onToggle={toggleDetails}
          label={<span>Details</span>}
        >
          <div className="mt-2 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                Description
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
                className="w-full rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] resize-none min-h-[48px] placeholder:text-[var(--color-figma-text-secondary)]/50"
              />
            </div>

            {tokenType === "color" && (
              <ContrastChecker
                tokenPath={tokenPath}
                value={value}
                allTokensFlat={allTokensFlat}
                pathToSet={pathToSet}
                colorFlatMap={colorFlatMap}
              />
            )}

            {tokenType === "color" &&
              (aliasMode
                ? isAlias(reference)
                : typeof value === "string" && value.length > 0) && (
                <ColorModifiersEditor
                  reference={aliasMode ? reference : undefined}
                  colorFlatMap={aliasMode ? colorFlatMap : undefined}
                  directColor={
                    !aliasMode && typeof value === "string" ? value : undefined
                  }
                  colorModifiers={colorModifiers}
                  onColorModifiersChange={setColorModifiers}
                />
              )}

            {!aliasMode && COMPOSITE_TOKEN_TYPES.has(tokenType) && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">
                  Extends
                </label>
                {extendsPath ? (
                  <div className="flex items-center gap-1.5">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="shrink-0 text-[var(--color-figma-accent)]"
                    >
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    <span
                      className={`${LONG_TEXT_CLASSES.monoPrimary} flex-1`}
                      title={extendsPath}
                    >
                      {extendsPath}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExtendsPath("")}
                      title="Remove base token"
                      className="p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 shrink-0"
                    >
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <ExtendsTokenPicker
                    tokenType={tokenType}
                    allTokensFlat={allTokensFlat}
                    pathToSet={pathToSet}
                    currentPath={isCreateMode ? trimmedEditPath : tokenPath}
                    onSelect={setExtendsPath}
                  />
                )}
                {extendsPath &&
                  (() => {
                    const base = allTokensFlat[extendsPath];
                    if (!base)
                      return (
                        <p className="text-[10px] text-[var(--color-figma-error)]">
                          Base token not found
                        </p>
                      );
                    return (
                      <p className="text-[10px] text-[var(--color-figma-text-tertiary)] mt-0.5">
                        Inherited properties will be merged with overrides below.
                      </p>
                    );
                  })()}
              </div>
            )}

            {/* Lifecycle */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">
                Lifecycle
              </label>
              <div className="flex gap-1">
                {(["draft", "published", "deprecated"] as const).map((lc) => (
                  <button
                    key={lc}
                    type="button"
                    onClick={() => setLifecycle(lc)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                      lifecycle === lc
                        ? lc === "draft"
                          ? "bg-amber-500/20 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/40"
                          : lc === "deprecated"
                            ? "bg-gray-500/20 text-gray-600 dark:text-gray-400 ring-1 ring-gray-500/40"
                            : "bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] ring-1 ring-[var(--color-figma-accent)]/40"
                        : "bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                    }`}
                  >
                    {lc}
                  </button>
                ))}
              </div>
            </div>

            {/* Scopes, Extensions */}
            <MetadataEditor
              tokenType={tokenType}
              scopes={scopes}
              onScopesChange={setScopes}
              extensionsJsonText={extensionsJsonText}
              onExtensionsJsonTextChange={setExtensionsJsonText}
              extensionsJsonError={extensionsJsonError}
              onExtensionsJsonErrorChange={setExtensionsJsonError}
              isCreateMode={isCreateMode}
            />
          </div>
        </Collapsible>

        {/* Generator groups */}
        {canBeGeneratorSource && !aliasMode && (
          <TokenEditorDerivedGroups
            tokenPath={tokenPath}
            tokenName={tokenName}
            tokenType={tokenType}
            value={value}
            existingGeneratorsForToken={existingGeneratorsForToken}
            openGeneratorEditor={openGeneratorEditor}
          />
        )}

        {/* Info section — Dependencies, Usage, History (read-only reference data) */}
        {!isCreateMode && (
          <TokenEditorInfoSection
            tokenPath={tokenPath}
            setName={setName}
            serverUrl={serverUrl}
            tokenType={tokenType}
            value={value}
            isDirty={isDirty}
            aliasMode={aliasMode}
            referenceTrace={referenceTrace}
            dependentTrace={dependentTrace}
            dependencySnapshot={dependencySnapshot}
            dependents={dependents}
            dependentsLoading={dependentsLoading}
            colorFlatMap={colorFlatMap}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            initialValue={initialRef.current?.value}
            activeProducingGenerator={activeProducingGenerator}
            existingGeneratorsForToken={existingGeneratorsForToken}
            infoTab={infoTab}
            onInfoTabChange={handleInfoTab}
            refsExpanded={refsExpanded}
            onRefsExpandedChange={setRefsExpanded}
            onShowReferences={onShowReferences}
            onNavigateToToken={onNavigateToToken}
            onNavigateToGenerator={onNavigateToGenerator}
          />
        )}
      </EditorShell>

      {/* Save changes confirmation */}
      {showDiscardConfirm && (
        <SaveChangesDialog
          canSave={canSave}
          isCreateMode={isCreateMode}
          editPath={editPath}
          saving={saving}
          onSave={() => {
            setShowDiscardConfirm(false);
            handleSaveRef.current();
          }}
          onDiscard={() => {
            setShowDiscardConfirm(false);
            clearEditorDraft(setName, tokenPath);
            onBack();
          }}
          onCancel={() => setShowDiscardConfirm(false)}
        />
      )}

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
          description="This token was changed on the server since you opened the editor. Overwrite the server version with your changes?"
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
    </div>
  );
}
