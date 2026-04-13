import { adaptShortcut, stableStringify } from "../shared/utils";
import { SHORTCUT_KEYS } from "../shared/shortcutRegistry";
import { Spinner } from "./Spinner";
import { AUTHORING_SURFACE_CLASSES, EditorShell } from "./EditorShell";
import { AUTHORING } from "../shared/editorClasses";
import { apiFetch } from "../shared/apiFetch";
import { TokenHistorySection } from "./TokenHistorySection";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { MutableRefObject } from "react";
import { createGeneratorOwnershipKey, resolveRefValue } from "@tokenmanager/core";
import type { ThemeDimension } from "@tokenmanager/core";
import { ConfirmModal } from "./ConfirmModal";
import type { TokenMapEntry } from "../../shared/types";
import { TOKEN_TYPE_BADGE_CLASS } from "../../shared/types";
import { ValueDiff, OriginalValuePreview } from "./ValueDiff";
import type { TokenGenerator } from "../hooks/useGenerators";
import { COMPOSITE_TOKEN_TYPES } from "@tokenmanager/core";
import {
  ColorEditor,
  DimensionEditor,
  TypographyEditor,
  ShadowEditor,
  BorderEditor,
  GradientEditor,
  NumberEditor,
  DurationEditor,
  FontFamilyEditor,
  FontWeightEditor,
  StrokeStyleEditor,
  StringEditor,
  BooleanEditor,
  CompositionEditor,
  AssetEditor,
  FontStyleEditor,
  TextDecorationEditor,
  TextTransformEditor,
  PercentageEditor,
  LinkEditor,
  LetterSpacingEditor,
  LineHeightEditor,
  CubicBezierEditor,
  TransitionEditor,
  CustomEditor,
  VALUE_FORMAT_HINTS,
} from "./ValueEditors";
import { AliasPicker } from "./AliasPicker";
import { isAlias, extractAliasPath } from "../../shared/resolveAlias";
import { ContrastChecker } from "./ContrastChecker";
import { ColorModifiersEditor } from "./ColorModifiersEditor";
import { TokenUsages } from "./TokenUsages";
import { MetadataEditor, ModeValuesEditor } from "./MetadataEditor";
import { PathAutocomplete } from "./PathAutocomplete";
import { useNearbyTokenMatch } from "../hooks/useNearbyTokenMatch";
import { TokenNudge } from "./TokenNudge";
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
import { useFocusTrap } from "../hooks/useFocusTrap";
import { buildTokenDependencySnapshot } from "./TokenFlowPanel";
import type { TokensLibraryGeneratorEditorTarget } from "../shared/navigationTypes";
import { lsGet, lsSet } from "../shared/storage";
import { dispatchToast } from "../shared/toastBus";
import { LONG_TEXT_CLASSES } from "../shared/longTextStyles";

/**
 * Returns the cycle path (e.g. ["a", "b", "c", "a"]) if following `ref`
 * from `currentTokenPath` would create a cycle, or null if no cycle.
 */
function detectAliasCycle(
  ref: string,
  currentTokenPath: string,
  allTokensFlat: Record<string, TokenMapEntry>,
): string[] | null {
  const visited = new Set<string>([currentTokenPath]);
  const chain: string[] = [currentTokenPath];
  let current = isAlias(ref) ? extractAliasPath(ref)! : ref;
  while (true) {
    if (visited.has(current)) {
      const cycleStart = chain.indexOf(current);
      return [...chain.slice(cycleStart), current];
    }
    visited.add(current);
    chain.push(current);
    const entry = allTokensFlat[current];
    if (!entry) return null;
    const v = entry.$value;
    if (isAlias(v)) {
      current = extractAliasPath(v)!;
    } else {
      return null;
    }
  }
}

/** Compact picker for selecting a base token to extend. */
function ExtendsTokenPicker({
  tokenType,
  allTokensFlat,
  pathToSet,
  currentPath,
  onSelect,
}: {
  tokenType: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  currentPath: string;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const candidates = useMemo(() => {
    return Object.entries(allTokensFlat)
      .filter(([p, e]) => e.$type === tokenType && p !== currentPath)
      .map(([p]) => p);
  }, [allTokensFlat, tokenType, currentPath]);
  const filteredAll = useMemo(() => {
    if (!search) return candidates;
    const q = search.toLowerCase();
    return candidates.filter((p) => p.toLowerCase().includes(q));
  }, [candidates, search]);
  const filtered = useMemo(() => filteredAll.slice(0, 50), [filteredAll]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="w-full px-2 py-1.5 rounded border border-dashed border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors text-left"
      >
        + Set base token to inherit from…
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${tokenType} tokens…`}
          className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setSearch("");
            }
          }}
        />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setSearch("");
          }}
          className="px-1.5 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
        >
          Cancel
        </button>
      </div>
      {filteredAll.length > 50 && (
        <p className="text-[10px] text-[var(--color-figma-text-tertiary)] px-0.5">
          Showing 50 of {filteredAll.length} — refine search to narrow results
        </p>
      )}
      <div className="max-h-32 overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
        {filtered.length === 0 && (
          <p className="px-2 py-1.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
            No matching {tokenType} tokens
          </p>
        )}
        {filtered.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              onSelect(p);
              setOpen(false);
              setSearch("");
            }}
            className={`${LONG_TEXT_CLASSES.monoPrimary} w-full px-2 py-1 text-left text-[11px] hover:bg-[var(--color-figma-bg-hover)]`}
            title={`${p} (${pathToSet[p] || ""})`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Parse a raw clipboard/initial string value into the shape the editor expects for the given type. */
function parseInitialValueForType(type: string, raw: string): any {
  const v = raw.trim();
  if (type === "color") return v;
  if (type === "dimension") {
    const m = v.match(
      /^(-?\d*\.?\d+)\s*(px|rem|em|%|vw|vh|pt|dp|sp|cm|mm|fr|ch|ex)?$/,
    );
    if (m) return { value: parseFloat(m[1]), unit: m[2] || "px" };
    return v;
  }
  if (type === "duration") {
    const m = v.match(/^(-?\d*\.?\d+)\s*(ms|s)?$/);
    if (m) return { value: parseFloat(m[1]), unit: m[2] || "ms" };
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
  if (type === "number" || type === "fontWeight") {
    const n = parseFloat(v);
    return isNaN(n) ? v : n;
  }
  if (type === "boolean") {
    return v.toLowerCase() === "true";
  }
  return v;
}

function getInitialCreateValue(type: string, raw?: string): any {
  if (raw && !isAlias(raw)) {
    return parseInitialValueForType(type, raw);
  }
  if (type === "color") return "#000000";
  if (type === "dimension") return { value: 0, unit: "px" };
  if (type === "number" || type === "duration") return 0;
  if (type === "boolean") return false;
  if (type === "shadow") {
    return {
      x: 0,
      y: 0,
      blur: 4,
      spread: 0,
      color: "#000000",
      type: "dropShadow",
    };
  }
  return "";
}

/**
 * Try to parse clipboard text as a structured value for the given token type.
 * Returns the parsed value on success, or null if no valid parse was found.
 * Used by the container-level onPaste handler in TokenEditor.
 */
function parsePastedValue(type: string, text: string): any | null {
  const v = text.trim();
  if (!v) return null;

  // Try JSON parse first (DTCG export format or raw object)
  if (v.startsWith("{") || v.startsWith("[")) {
    try {
      const parsed = JSON.parse(v);
      // DTCG token format: { $value: ..., $type: ... }
      const rawValue =
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        parsed.$value !== undefined
          ? parsed.$value
          : parsed;
      // Complex types accept the parsed object/array directly
      if (
        [
          "typography",
          "shadow",
          "border",
          "gradient",
          "transition",
          "composition",
        ].includes(type)
      ) {
        return typeof rawValue === "object" ? rawValue : null;
      }
      if (
        type === "cubicBezier" &&
        Array.isArray(rawValue) &&
        rawValue.length === 4
      ) {
        return rawValue;
      }
      // Primitive types: convert rawValue via string parsing
      if (rawValue !== undefined && rawValue !== null) {
        return parseInitialValueForType(
          type,
          typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue),
        );
      }
      return null;
    } catch {
      // Not valid JSON — fall through to string parsing
    }
  }

  // String parsing per type
  switch (type) {
    case "color":
      if (
        /^#[0-9a-fA-F]{3,8}$/.test(v) ||
        /^rgba?\s*\(/.test(v) ||
        /^hsla?\s*\(/.test(v) ||
        /^oklch\s*\(/.test(v) ||
        /^oklab\s*\(/.test(v) ||
        /^color\s*\(/.test(v)
      )
        return v;
      return null;

    case "dimension": {
      const m = v.match(
        /^(-?\d*\.?\d+)\s*(px|rem|em|%|vw|vh|pt|dp|sp|cm|mm|fr|ch|ex)?$/,
      );
      if (m) return { value: parseFloat(m[1]), unit: m[2] || "px" };
      return null;
    }

    case "duration": {
      const m = v.match(/^(-?\d*\.?\d+)\s*(ms|s)$/);
      if (m) return { value: parseFloat(m[1]), unit: m[2] };
      return null;
    }

    case "letterSpacing": {
      const m = v.match(/^(-?\d*\.?\d+)\s*(px|em|rem|%)?$/);
      if (m) return { value: parseFloat(m[1]), unit: m[2] || "px" };
      return null;
    }

    case "cubicBezier": {
      // Accept "x1,y1,x2,y2" comma-separated format
      const parts = v.split(",").map((s) => parseFloat(s.trim()));
      if (parts.length === 4 && parts.every((n) => !isNaN(n))) return parts;
      return null;
    }

    case "number":
    case "fontWeight":
    case "lineHeight":
    case "percentage": {
      const cleaned =
        type === "percentage" && v.endsWith("%") ? v.slice(0, -1) : v;
      const n = parseFloat(cleaned);
      return isNaN(n) ? null : n;
    }

    case "boolean":
      if (v.toLowerCase() === "true") return true;
      if (v.toLowerCase() === "false") return false;
      return null;

    case "string":
    case "fontFamily":
    case "link":
    case "asset":
    case "fontStyle":
    case "textDecoration":
    case "textTransform":
    case "strokeStyle":
    case "custom":
      return v || null;

    default:
      return null;
  }
}

/** Suggested namespace prefixes per token type to help new users build consistent hierarchies. */
const NAMESPACE_SUGGESTIONS: Record<
  string,
  { prefixes: string[]; example: string }
> = {
  color: { prefixes: ["color."], example: "color.brand.primary" },
  dimension: {
    prefixes: ["spacing.", "sizing.", "radius."],
    example: "spacing.md",
  },
  typography: { prefixes: ["typography."], example: "typography.heading.lg" },
  shadow: { prefixes: ["shadow."], example: "shadow.md" },
  border: { prefixes: ["border."], example: "border.default" },
  gradient: { prefixes: ["gradient."], example: "gradient.brand" },
  duration: { prefixes: ["duration."], example: "duration.fast" },
  fontFamily: { prefixes: ["fontFamily."], example: "fontFamily.body" },
  fontWeight: { prefixes: ["fontWeight."], example: "fontWeight.bold" },
  number: { prefixes: ["scale.", "opacity."], example: "scale.ratio" },
  string: { prefixes: [], example: "label.heading" },
  boolean: { prefixes: [], example: "feature.darkMode" },
  strokeStyle: { prefixes: ["strokeStyle."], example: "strokeStyle.dashed" },
};

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
  /** Initial create surface presentation. */
  createPresentation?: 'launcher' | 'editor';
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
  /** Navigate to Themes workspace to configure modes */
  onNavigateToThemes?: () => void;
  /** Push an undo slot after a successful token save or create */
  pushUndo?: (slot: import("../hooks/useUndo").UndoSlot) => void;
}

function SaveChangesDialog({
  canSave,
  isCreateMode,
  editPath,
  saving,
  onSave,
  onDiscard,
  onCancel,
}: {
  canSave: boolean;
  isCreateMode: boolean;
  editPath: string;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="w-[240px] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-changes-title"
      >
        <div className="px-4 pt-4 pb-3">
          <h3
            id="save-changes-title"
            className="text-[12px] font-semibold text-[var(--color-figma-text)]"
          >
            Save changes?
          </h3>
          <p className="mt-1.5 text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed">
            Your edits have not been saved and will be lost if you close.
          </p>
        </div>
        <div className="px-4 pb-4 flex flex-col gap-2">
          {canSave && (!isCreateMode || editPath.trim() !== "") && (
            <button
              onClick={onSave}
              disabled={saving}
              className="w-full px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
          <button
            onClick={onDiscard}
            className="w-full px-3 py-1.5 rounded text-[11px] font-medium text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-border)]"
          >
            Discard
          </button>
          <button
            onClick={onCancel}
            className="w-full px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
          >
            Keep editing
          </button>
        </div>
      </div>
    </div>
  );
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
  createPresentation: initialCreatePresentation = 'editor',
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
  const [createPresentation, setCreatePresentation] = useState<'launcher' | 'editor'>(initialCreatePresentation);
  const showAdvancedCreateFields = !isCreateMode || createPresentation === 'editor';

  useEffect(() => {
    if (!isCreateMode) return;
    setCreatePresentation(initialCreatePresentation);
  }, [initialCreatePresentation, isCreateMode, setName, tokenPath]);

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
      setError(err instanceof Error ? err.message : "Failed to detach token from generator");
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
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        <Spinner size="md" className="text-[var(--color-figma-accent)]" />
        Loading token...
      </div>
    );
  }

  const quickCreateStoredValue = aliasMode && reference ? reference : stableStringify(value);
  const quickCreateValueLabel = aliasMode && reference ? "Reference" : "Stored";

  const headerTitle = (
    <>
      {isCreateMode ? (
        <div className="relative" ref={pathInputWrapperRef}>
          <input
            type="text"
            value={editPath}
            onChange={(e) => {
              setEditPath(e.target.value);
              setDisplayError(null);
              setShowPathAutocomplete(true);
            }}
            onFocus={() => {
              if (editPath.trim()) setShowPathAutocomplete(true);
            }}
            onBlur={(e) => {
              if (
                !pathInputWrapperRef.current?.contains(e.relatedTarget as Node)
              ) {
                setShowPathAutocomplete(false);
              }
            }}
            placeholder="Token path (e.g. color.brand.500)"
            autoFocus
            autoComplete="off"
            className={`w-full text-[11px] font-medium text-[var(--color-figma-text)] bg-transparent border-b outline-none pb-0.5 ${duplicatePath ? "border-[var(--color-figma-danger,#f24822)]" : "border-[var(--color-figma-border)] focus-visible:border-[var(--color-figma-accent)]"}`}
          />
          {showPathAutocomplete && editPath.trim() && (
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
      {isCreateMode && duplicatePath ? (
        <div className="text-[10px] text-[var(--color-figma-danger,#f24822)]">
          A token with this path already exists in{" "}
          {pathToSet[editPath.trim()] || setName}
        </div>
      ) : (
        <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
          {isCreateMode
            ? createPresentation === "launcher"
              ? "Quick create"
              : "New token"
            : `in ${setName}`}
        </div>
      )}
      {isCreateMode &&
        !editPath.includes(".") &&
        (NAMESPACE_SUGGESTIONS[tokenType]?.prefixes.length ?? 0) > 0 && (
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
              Try:
            </span>
            {NAMESPACE_SUGGESTIONS[tokenType].prefixes.map((prefix) => (
              <button
                key={prefix}
                type="button"
                onClick={() => {
                  setEditPath(prefix);
                  setDisplayError(null);
                }}
                className="px-1 py-px rounded text-[10px] bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-pressed)] transition-colors cursor-pointer"
              >
                {prefix}
              </button>
            ))}
          </div>
        )}
    </>
  );

  const headerActions = (
    <>
      {!isCreateMode && onShowReferences && (
        <button
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
    </>
  );

  const afterHeader = (
    <>
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
            onClick={() => applyDraft(pendingDraft)}
            className="shrink-0 text-[10px] font-medium text-amber-700 dark:text-amber-300 hover:underline"
          >
            Restore
          </button>
          <button
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
      <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
        {!isCreateMode && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete token"
            aria-label="Delete token"
            className={`${AUTHORING_SURFACE_CLASSES.footerIcon} p-1.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-error)]/10 hover:text-[var(--color-figma-error)]`}
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
        <button
          onClick={handleBack}
          className={`${AUTHORING_SURFACE_CLASSES.footerSecondary} ${AUTHORING.footerBtnSecondary}`}
        >
          {isDirty || isCreateMode ? "Cancel" : "Close"}
        </button>
        {isDirty && !isCreateMode && (
          <button
            onClick={handleRevert}
            title="Revert to last saved state"
            className={`${AUTHORING_SURFACE_CLASSES.footerSecondary} ${AUTHORING.footerBtnSecondary}`}
          >
            Revert
          </button>
        )}
        {isCreateMode && createPresentation === "launcher" && (
          <button
            type="button"
            onClick={() => setCreatePresentation("editor")}
            className={`${AUTHORING_SURFACE_CLASSES.footerSecondary} ${AUTHORING.footerBtnSecondary} border border-[var(--color-figma-border)] font-medium hover:border-[var(--color-figma-accent)]`}
          >
            Open full editor
          </button>
        )}
        {isCreateMode && onSaveAndCreateAnother && (
          <button
            onClick={() => handleSave(false, true)}
            disabled={saving || !canSave || !editPath.trim()}
            title={`Create this token and immediately start creating another (${adaptShortcut(SHORTCUT_KEYS.EDITOR_SAVE_AND_NEW)})`}
            className={`${AUTHORING_SURFACE_CLASSES.footerSecondary} ${AUTHORING.footerBtnSecondary} border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] font-medium hover:bg-[var(--color-figma-accent)]/10 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {saving ? (
              "Creating…"
            ) : (
              <>
                Create & New{" "}
                <span className="ml-1 opacity-50 text-[10px]">
                  {adaptShortcut(SHORTCUT_KEYS.EDITOR_SAVE_AND_NEW)}
                </span>
              </>
            )}
          </button>
        )}
        <div
          className={AUTHORING_SURFACE_CLASSES.footerPrimary}
          onClick={() => {
            if (!canSave && saveBlockReason && tokenType === "typography")
              focusBlockedField();
          }}
        >
          <button
            onClick={() => handleSave()}
            disabled={
              saving ||
              !canSave ||
              (!isCreateMode && !isDirty) ||
              (isCreateMode && !editPath.trim())
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
            ) : saveBlockReason ? (
              saveBlockReason
            ) : !isCreateMode && !isDirty ? (
              "No changes"
            ) : (
              <>
                {isCreateMode ? "Create" : "Save changes"}{" "}
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

        {isCreateMode && createPresentation === "launcher" && (
          <section className={AUTHORING.section}>
            <div className={AUTHORING.titleBlock}>
              <h3 className={AUTHORING.title}>Start with the essentials</h3>
              <p className={AUTHORING.description}>
                Set the path, type, and value here. Open the full editor when
                you need metadata, lifecycle, or inheritance controls.
              </p>
            </div>
            <div className={AUTHORING.summaryCard}>
              <div className={AUTHORING.summaryRow}>
                <span className={AUTHORING.summaryLabel}>Set</span>
                <span className={AUTHORING.summaryValue}>{setName}</span>
              </div>
              <div className={AUTHORING.summaryRow}>
                <span className={AUTHORING.summaryLabel}>Type</span>
                <span
                  className={`${TOKEN_TYPE_BADGE_CLASS[tokenType ?? ""] ?? "token-type-string"} inline-flex shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide`}
                >
                  {tokenType}
                </span>
                <span className={AUTHORING.summaryValue}>
                  {aliasMode ? "Alias token" : "Direct value"}
                </span>
              </div>
              <div className={AUTHORING.summaryRow}>
                <span className={AUTHORING.summaryLabel}>
                  {quickCreateValueLabel}
                </span>
                <span className={AUTHORING.summaryMono}>
                  {quickCreateStoredValue}
                </span>
              </div>
            </div>
          </section>
        )}

        {activeProducingGenerator && !isCreateMode && (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] text-[var(--color-figma-text-secondary)]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[var(--color-figma-text)]">
                  This token is managed by{" "}
                  <span className="font-medium">{activeProducingGenerator.name}</span>.
                  Manual value changes here will be overwritten on the next generator run.
                </p>
                <p className="mt-1">
                  Edit the generator to change the managed output, or detach this token first to make it independently editable.
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
                onClick={() => {
                  setPendingTypeChange(null);
                  setShowPendingDependents(false);
                }}
                className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Keep {tokenType}
              </button>
              <button
                onClick={() => applyTypeChange(pendingTypeChange)}
                className="flex-1 px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600"
              >
                Switch type
              </button>
            </div>
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
          <div
            className="flex flex-col gap-2"
            ref={valueEditorContainerRef}
            onPaste={handlePaste}
          >
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] text-[var(--color-figma-text-secondary)]">
                  {extendsPath ? "Overrides" : "Value"}
                </label>
                <div className="flex items-center gap-1.5">
                  {pasteFlash && (
                    <span className="text-[10px] text-[var(--color-figma-accent)] font-medium animate-pulse">
                      Pasted
                    </span>
                  )}
                  {!canSave &&
                    tokenType === "typography" &&
                    saveBlockReason && (
                      <button
                        type="button"
                        onClick={focusBlockedField}
                        className="text-[10px] text-[var(--color-figma-error)] hover:underline cursor-pointer bg-transparent border-none p-0"
                      >
                        {saveBlockReason}
                      </button>
                    )}
                </div>
              </div>
              {VALUE_FORMAT_HINTS[tokenType] && (
                <span className="text-[9px] text-[var(--color-figma-text-tertiary)] italic">
                  {VALUE_FORMAT_HINTS[tokenType]}
                </span>
              )}
            </div>
            {initialRef.current &&
              !isCreateMode &&
              (JSON.stringify(value) !==
              JSON.stringify(initialRef.current.value) ? (
                <ValueDiff
                  type={tokenType}
                  before={initialRef.current.value}
                  after={value}
                />
              ) : (
                <OriginalValuePreview
                  type={tokenType}
                  value={initialRef.current.value}
                />
              ))}
            {(() => {
              const baseValue: TokenMapEntry["$value"] | undefined = extendsPath
                ? allTokensFlat[extendsPath]?.$value
                : undefined;
              return (
                <>
                  {tokenType === "color" && (
                    <ColorEditor
                      value={value}
                      onChange={setValue}
                      autoFocus={!isCreateMode}
                      allTokensFlat={allTokensFlat}
                    />
                  )}
                  {tokenType === "dimension" && (
                    <DimensionEditor
                      key={tokenPath}
                      value={value}
                      onChange={setValue}
                      allTokensFlat={allTokensFlat}
                      pathToSet={pathToSet}
                      autoFocus={!isCreateMode}
                    />
                  )}
                  {tokenType === "typography" && (
                    <TypographyEditor
                      value={value}
                      onChange={setValue}
                      allTokensFlat={allTokensFlat}
                      pathToSet={pathToSet}
                      fontFamilyRef={fontFamilyRef}
                      fontSizeRef={fontSizeRef}
                      baseValue={baseValue}
                      availableFonts={availableFonts}
                      fontWeightsByFamily={fontWeightsByFamily}
                    />
                  )}
                  {tokenType === "shadow" && (
                    <ShadowEditor
                      value={value}
                      onChange={setValue}
                      allTokensFlat={allTokensFlat}
                      pathToSet={pathToSet}
                      baseValue={baseValue}
                    />
                  )}
                  {tokenType === "border" && (
                    <BorderEditor
                      value={value}
                      onChange={setValue}
                      allTokensFlat={allTokensFlat}
                      pathToSet={pathToSet}
                      baseValue={baseValue}
                    />
                  )}
                  {tokenType === "gradient" && (
                    <GradientEditor
                      value={value}
                      onChange={setValue}
                      allTokensFlat={allTokensFlat}
                      pathToSet={pathToSet}
                    />
                  )}
                  {tokenType === "number" && (
                    <NumberEditor
                      key={tokenPath}
                      value={value}
                      onChange={setValue}
                      allTokensFlat={allTokensFlat}
                      pathToSet={pathToSet}
                      autoFocus={!isCreateMode}
                    />
                  )}
                  {tokenType === "duration" && (
                    <DurationEditor
                      value={value}
                      onChange={setValue}
                      autoFocus={!isCreateMode}
                    />
                  )}
                  {tokenType === "fontFamily" && (
                    <FontFamilyEditor
                      value={value}
                      onChange={setValue}
                      autoFocus={!isCreateMode}
                      availableFonts={availableFonts}
                    />
                  )}
                  {tokenType === "fontWeight" && (
                    <FontWeightEditor value={value} onChange={setValue} />
                  )}
                  {tokenType === "strokeStyle" && (
                    <StrokeStyleEditor value={value} onChange={setValue} />
                  )}
                  {tokenType === "string" && (
                    <StringEditor
                      value={value}
                      onChange={setValue}
                      autoFocus={!isCreateMode}
                    />
                  )}
                  {tokenType === "boolean" && (
                    <BooleanEditor value={value} onChange={setValue} />
                  )}
                  {tokenType === "composition" && (
                    <CompositionEditor
                      value={value}
                      onChange={setValue}
                      baseValue={baseValue}
                    />
                  )}
                  {tokenType === "cubicBezier" && (
                    <CubicBezierEditor value={value} onChange={setValue} />
                  )}
                  {tokenType === "transition" && (
                    <TransitionEditor
                      value={value}
                      onChange={setValue}
                      allTokensFlat={allTokensFlat}
                      pathToSet={pathToSet}
                    />
                  )}
                  {tokenType === "fontStyle" && (
                    <FontStyleEditor value={value} onChange={setValue} />
                  )}
                  {tokenType === "lineHeight" && (
                    <LineHeightEditor value={value} onChange={setValue} />
                  )}
                  {tokenType === "letterSpacing" && (
                    <LetterSpacingEditor value={value} onChange={setValue} />
                  )}
                  {tokenType === "percentage" && (
                    <PercentageEditor value={value} onChange={setValue} />
                  )}
                  {tokenType === "link" && (
                    <LinkEditor value={value} onChange={setValue} />
                  )}
                  {tokenType === "textDecoration" && (
                    <TextDecorationEditor value={value} onChange={setValue} />
                  )}
                  {tokenType === "textTransform" && (
                    <TextTransformEditor value={value} onChange={setValue} />
                  )}
                  {tokenType === "custom" && (
                    <CustomEditor value={value} onChange={setValue} />
                  )}
                </>
              );
            })()}
            {tokenType === "asset" && (
              <AssetEditor value={value} onChange={setValue} />
            )}
            {/* Smart alias suggestion — exact & near matches */}
            <TokenNudge
              matches={nearbyMatches}
              tokenType={tokenType}
              onAccept={(path) => {
                preAliasValueRef.current = value;
                setAliasMode(true);
                setReference(`{${path}}`);
                setTimeout(() => refInputRef.current?.focus(), 0);
              }}
            />
          </div>
        )}

        {/* Contrast checker (color tokens only) */}
        {tokenType === "color" && (
          <ContrastChecker
            tokenPath={tokenPath}
            value={value}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            colorFlatMap={colorFlatMap}
          />
        )}

        {/* Per-mode values — shown prominently when theme dimensions exist */}
        {dimensions.length > 0 && (
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
          />
        )}

        {/* Details — Modifiers, Extends, Metadata, Scopes, Lifecycle, Theme values */}
        {showAdvancedCreateFields && (
          <Collapsible
            open={detailsOpen}
            onToggle={toggleDetails}
            label="Details"
          >
            <div className="mt-2 flex flex-col gap-3">
              {/* Color modifiers */}
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

              {/* Extends — base token inheritance for composite types */}
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
                      currentPath={isCreateMode ? editPath.trim() : tokenPath}
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

              {/* Description, Scopes, Mode Values, Extensions */}
              <MetadataEditor
                description={description}
                onDescriptionChange={setDescription}
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
        )}

        {/* Generator groups */}
        {canBeGeneratorSource && !aliasMode && (
          <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
            <button
              onClick={() => {
                openGeneratorEditor({
                  mode: 'create',
                  sourceTokenPath: tokenPath,
                  sourceTokenName: tokenName,
                  sourceTokenType: tokenType,
                  sourceTokenValue: value,
                });
              }}
              className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="5" cy="2" r="1.5" />
                  <circle cx="2" cy="8" r="1.5" />
                  <circle cx="8" cy="8" r="1.5" />
                  <path d="M5 3.5V6M5 6L2 6.5M5 6L8 6.5" />
                </svg>
                {existingGeneratorsForToken.length > 0
                  ? `Derived groups (${existingGeneratorsForToken.length})`
                  : "Derived groups"}
              </span>
              {existingGeneratorsForToken.length === 0 ? (
                <span className="text-[10px] text-[var(--color-figma-accent)]">
                  + Create
                </span>
              ) : (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M7 2L3 5l4 3" />
                </svg>
              )}
            </button>
            {existingGeneratorsForToken.length > 0 && (
              <div className="px-3 py-2 flex flex-col gap-1.5 border-t border-[var(--color-figma-border)]">
                {existingGeneratorsForToken.map((gen) => (
                  <div
                    key={gen.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[8px] font-medium uppercase ${
                          gen.type === "colorRamp"
                            ? "bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]"
                            : gen.type === "typeScale"
                              ? "bg-purple-500/15 text-purple-600"
                              : gen.type === "spacingScale"
                                ? "bg-green-500/15 text-green-600"
                                : "bg-orange-500/15 text-orange-600"
                        }`}
                      >
                        {gen.type === "colorRamp"
                          ? "Ramp"
                          : gen.type === "typeScale"
                            ? "Scale"
                            : gen.type === "spacingScale"
                              ? "Spacing"
                              : "Opacity"}
                      </span>
                      <span className={LONG_TEXT_CLASSES.monoPrimary}>
                        {gen.targetGroup}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openGeneratorEditor({
                            mode: 'edit',
                            id: gen.id,
                          });
                        }}
                        className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openGeneratorEditor({
                            mode: 'create',
                            sourceTokenPath: tokenPath,
                            sourceTokenName: tokenName,
                            sourceTokenType: tokenType,
                            sourceTokenValue: value,
                            template: {
                              id: `dup-${gen.id}`,
                              label: `${gen.name} (copy)`,
                              description: "",
                              defaultPrefix: gen.targetGroup,
                              generatorType: gen.type,
                              config: gen.config,
                              requiresSource: false,
                            },
                          });
                        }}
                        title="Duplicate generator"
                        className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] transition-colors"
                      >
                        Duplicate
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => {
                    openGeneratorEditor({
                      mode: 'create',
                      sourceTokenPath: tokenPath,
                      sourceTokenName: tokenName,
                      sourceTokenType: tokenType,
                      sourceTokenValue: value,
                    });
                  }}
                  className="mt-0.5 text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors text-left"
                >
                  + Add another group
                </button>
              </div>
            )}
          </div>
        )}

        {/* Info section — Dependencies, Usage, History (read-only reference data) */}
        {!isCreateMode && (
          <div className="mt-1 border-t border-[var(--color-figma-border)] pt-2">
            <div className="flex gap-0.5">
              {[
                { key: 'dependencies' as const, label: 'Dependencies', count: referenceTrace.length + dependentTrace.length },
                { key: 'usage' as const, label: 'Usage' },
                { key: 'history' as const, label: 'History' },
              ].map(({ key, label, count }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleInfoTab(key)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    infoTab === key
                      ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]'
                      : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
                  }`}
                >
                  {label}{count ? ` (${count})` : ''}
                </button>
              ))}
            </div>

            {infoTab === 'dependencies' && (
              <div className="flex flex-col gap-1.5 mt-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 flex-wrap">
                    {referenceTrace.length > 0 && (
                      <span className="rounded-full bg-[var(--color-figma-bg-hover)] px-1.5 py-0.5 text-[8px] font-medium text-[var(--color-figma-text-secondary)]">
                        References {referenceTrace.length}
                      </span>
                    )}
                    {(dependentTrace.length > 0 || dependentsLoading) && (
                      <span className="rounded-full bg-[var(--color-figma-bg-hover)] px-1.5 py-0.5 text-[8px] font-medium text-[var(--color-figma-text-secondary)]">
                        {dependentsLoading
                          ? "Dependents…"
                          : `Dependents ${dependentTrace.length}`}
                      </span>
                    )}
                    {dependencySnapshot?.hasCycles && (
                      <span className="rounded-full bg-[var(--color-figma-error)]/10 px-1.5 py-0.5 text-[8px] font-medium text-[var(--color-figma-error)]">
                        Cycle detected
                      </span>
                    )}
                  </div>
                  {onShowReferences && (
                    <button
                      type="button"
                      onClick={() => onShowReferences(tokenPath)}
                      className="flex items-center gap-1 text-[10px] text-[var(--color-figma-accent)] hover:underline transition-colors"
                      title="Open advanced dependency graph"
                    >
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
                      >
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
                      </svg>
                      Open graph
                    </button>
                  )}
                </div>

                {dependencySnapshot?.hasCycles && (
                  <div className="rounded border border-[var(--color-figma-error)]/30 bg-[var(--color-figma-error)]/10 px-2 py-1.5 text-[10px] text-[var(--color-figma-error)]">
                    Circular aliases are part of this token's trace. Use the
                    advanced graph if you need to inspect the full loop.
                  </div>
                )}

                {/* Outgoing: walk the full reference chain inline */}
                {referenceTrace.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] uppercase tracking-wider text-[var(--color-figma-text-secondary)] opacity-60">
                      Reference trace
                    </span>
                    {referenceTrace.slice(0, 8).map((node) => {
                      const resolvedColor =
                        node.$type === "color"
                          ? resolveRefValue(node.path, colorFlatMap)
                          : null;
                      return (
                        <button
                          key={node.path}
                          type="button"
                          onClick={() =>
                            onNavigateToToken?.(node.path, tokenPath)
                          }
                          disabled={!onNavigateToToken}
                          className="flex items-center gap-1.5 px-1.5 py-1 rounded text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:cursor-default group"
                          title={
                            onNavigateToToken
                              ? `Navigate to ${node.path}`
                              : node.path
                          }
                          style={{
                            paddingLeft: `${6 + Math.max(0, node.depth - 1) * 12}px`,
                          }}
                        >
                          <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                            {node.depth === 1 ? "Direct" : `+${node.depth - 1}`}
                          </span>
                          {resolvedColor ? (
                            <span
                              className="shrink-0 w-3 h-3 rounded-sm border border-[var(--color-figma-border)]"
                              style={{ backgroundColor: resolvedColor }}
                            />
                          ) : (
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
                              className="shrink-0 opacity-40"
                            >
                              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                            </svg>
                          )}
                          <span className={`${LONG_TEXT_CLASSES.mono} flex-1 text-[var(--color-figma-accent)] group-hover:underline`}>
                            {node.path}
                          </span>
                          {node.setName && node.setName !== setName && (
                            <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                              {node.setName}
                            </span>
                          )}
                          {onNavigateToToken && (
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
                              className="shrink-0 opacity-0 group-hover:opacity-50 transition-opacity"
                            >
                              <path d="M5 12h14M12 5l7 7-7 7" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                    {referenceTrace.length > 8 && (
                      <div className="px-1.5 pt-0.5 text-[9px] text-[var(--color-figma-text-tertiary)]">
                        + {referenceTrace.length - 8} more reference step
                        {referenceTrace.length - 8 === 1 ? "" : "s"}
                      </div>
                    )}
                  </div>
                )}

                {/* Incoming: direct and downstream impact */}
                {(dependentsLoading || dependentTrace.length > 0) && (
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => setRefsExpanded((v) => !v)}
                      disabled={
                        dependentsLoading ? false : dependentTrace.length === 0
                      }
                      className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-[var(--color-figma-text-secondary)] opacity-60 hover:opacity-100 transition-opacity disabled:cursor-default"
                    >
                      {dependentsLoading ? (
                        <span>Dependent impact…</span>
                      ) : (
                        <>
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 8 8"
                            fill="currentColor"
                            className={`transition-transform shrink-0 ${refsExpanded ? "rotate-90" : ""}`}
                            aria-hidden="true"
                          >
                            <path d="M2 1l4 3-4 3V1z" />
                          </svg>
                          Direct{" "}
                          {dependencySnapshot?.directDependents.length ?? 0} ·
                          Downstream {dependentTrace.length}
                        </>
                      )}
                    </button>
                    {refsExpanded && dependentTrace.length > 0 && (
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        {dependentTrace.slice(0, 20).map((dep) => {
                          const depColor =
                            dep.$type === "color"
                              ? resolveRefValue(dep.path, colorFlatMap)
                              : null;
                          return (
                            <button
                              key={dep.path}
                              type="button"
                              onClick={() =>
                                onNavigateToToken?.(dep.path, tokenPath)
                              }
                              disabled={!onNavigateToToken}
                              className="flex items-center gap-1.5 px-1.5 py-1 rounded text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:cursor-default group"
                              title={
                                onNavigateToToken
                                  ? `Navigate to ${dep.path}`
                                  : dep.path
                              }
                              style={{
                                paddingLeft: `${6 + Math.max(0, dep.depth - 1) * 12}px`,
                              }}
                            >
                              <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                                {dep.depth === 1
                                  ? "Direct"
                                  : `+${dep.depth - 1}`}
                              </span>
                              {depColor ? (
                                <span
                                  className="shrink-0 w-3 h-3 rounded-sm border border-[var(--color-figma-border)]"
                                  style={{ backgroundColor: depColor }}
                                />
                              ) : (
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
                                  className="shrink-0 opacity-40"
                                >
                                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                </svg>
                              )}
                              <span className={`${LONG_TEXT_CLASSES.monoPrimary} flex-1 group-hover:underline`}>
                                {dep.path}
                              </span>
                              {dep.setName && dep.setName !== setName && (
                                <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                                  {dep.setName}
                                </span>
                              )}
                              {onNavigateToToken && (
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
                                  className="shrink-0 opacity-0 group-hover:opacity-50 transition-opacity"
                                >
                                  <path d="M5 12h14M12 5l7 7-7 7" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                        {dependentTrace.length > 20 && (
                          <div className="px-1.5 pt-0.5 text-[9px] text-[var(--color-figma-text-tertiary)]">
                            + {dependentTrace.length - 20} more downstream
                            dependent
                            {dependentTrace.length - 20 === 1 ? "" : "s"}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {infoTab === 'usage' && (
              <div className="mt-2">
                <TokenUsages
                  dependents={dependents}
                  dependentsLoading={dependentsLoading}
                  setName={setName}
                  tokenPath={tokenPath}
                  tokenType={tokenType}
                  value={value}
                  isDirty={isDirty}
                  aliasMode={aliasMode}
                  allTokensFlat={allTokensFlat}
                  colorFlatMap={colorFlatMap}
                  pathToSet={pathToSet}
                  initialValue={initialRef.current?.value}
                  producingGenerator={activeProducingGenerator}
                  sourceGenerators={existingGeneratorsForToken}
                  onNavigateToToken={onNavigateToToken}
                  onShowReferences={onShowReferences}
                  onNavigateToGenerator={onNavigateToGenerator}
                />
              </div>
            )}

            {infoTab === 'history' && (
              <div className="mt-2">
                <TokenHistorySection
                  tokenPath={tokenPath}
                  serverUrl={serverUrl}
                  tokenType={tokenType}
                />
              </div>
            )}
          </div>
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
