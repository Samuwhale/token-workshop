import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useLayoutEffect,
  useMemo,
  memo,
} from "react";
import { dispatchToast } from "../shared/toastBus";
import {
  TokenTreeNodeProps,
  DENSITY_PY_CLASS,
  DENSITY_SWATCH_SIZE,
} from "./tokenListTypes";
import type { TokenMapEntry } from "../../shared/types";
import {
  TOKEN_PROPERTY_MAP,
  PROPERTY_LABELS,
} from "../../shared/types";
import type { BindableProperty } from "../../shared/types";
import { createRecipeOwnershipKey } from "@tokenmanager/core";
import {
  isAlias,
  extractAliasPath,
  resolveTokenValue,
  buildResolutionChain,
} from "../../shared/resolveAlias";
import type { ResolutionStep } from "../../shared/resolveAlias";
import { stableStringify } from "../shared/utils";
import {
  countTokensInGroup,
  formatDisplayPath,
  nodeParentPath,
  formatValue,
  countLeaves,
} from "./tokenListUtils";
import {
  getEditableString,
  parseInlineValue,
  getInlineValueError,
  inferGroupTokenType,
  highlightMatch,
  resolveCompositeForApply,
} from "./tokenListHelpers";
import { INLINE_SIMPLE_TYPES, INLINE_POPOVER_TYPES } from "./tokenListTypes";
import { InlineValuePopover } from "./InlineValuePopover";
import { PropertyPicker } from "./PropertyPicker";
import { ValuePreview } from "./ValuePreview";
import { ColorPicker } from "./ColorPicker";
import { getQuickBindTargets } from "./selectionInspectorUtils";
import {
  useTokenTreeGroupActions,
  useTokenTreeGroupState,
  useTokenTreeLeafActions,
  useTokenTreeLeafState,
  useTokenTreeSharedData,
} from "./TokenTreeContext";
import {
  ComplexTypePreviewCard,
  COMPLEX_PREVIEW_TYPES,
} from "./ComplexTypePreviewCard";
import { useNearbyTokenMatch } from "../hooks/useNearbyTokenMatch";
import { TokenNudge } from "./TokenNudge";
import { AliasAutocomplete } from "./AliasAutocomplete";
import { getMenuItems, handleMenuArrowKeys } from "../hooks/useMenuKeyboard";
import { matchesShortcut } from "../shared/shortcutRegistry";
import { ConfirmModal } from "./ConfirmModal";
import {
  compactTokenPath,
  getLifecycleLabel,
  getTokenProvenanceLabel,
  readTokenPresentationMetadata,
  summarizeTokenScopes,
} from "../shared/tokenMetadata";
import {
  BADGE_TEXT_CLASS,
  clampMenuPosition,
  computePaddingLeft,
  CondensedAncestorBreadcrumb,
  DepthBar,
  EMPTY_LINT_VIOLATIONS,
  RecipeGlyph,
  RecipeSummaryRow,
  getIncomingRefs,
  getManagedRecipeLeafCount,
  getQuickRecipeTypeForToken,
  getTokenRowStatus,
  MENU_DANGER_ITEM_CLASS,
  MENU_ITEM_CLASS,
  MENU_SEPARATOR_CLASS,
  MENU_SHORTCUT_CLASS,
  MENU_SURFACE_CLASS,
  formatRecipeSummaryTitle,
} from "./token-tree/tokenTreeNodeShared";
import type { MenuPosition } from "./token-tree/tokenTreeNodeShared";
// ---------------------------------------------------------------------------
// MultiModeCell — compact inline-editable value cell for a single theme option
// ---------------------------------------------------------------------------
function MultiModeCell({
  tokenPath,
  tokenType,
  value,
  targetSet,
  dimId,
  optionName,
  onSave,
  isTabPending,
  onTabActivated,
  onTab,
  onEdit,
}: {
  tokenPath: string;
  tokenType: string | undefined;
  value: TokenMapEntry | undefined;
  targetSet: string | null;
  dimId: string;
  optionName: string;
  onSave?: (
    path: string,
    type: string,
    newValue: any,
    targetSet: string,
    dimId: string,
    optionName: string,
    previousState?: { type?: string; value: unknown },
  ) => void;
  isTabPending?: boolean;
  onTabActivated?: () => void;
  onTab?: (direction: 1 | -1) => void;
  onEdit?: () => void;
}) {
  const { allTokensFlat, pathToSet } = useTokenTreeSharedData();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const escapedRef = useRef(false);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const cellRef = useRef<HTMLDivElement>(null);

  // Alias editing state
  const [aliasEditing, setAliasEditing] = useState(false);
  const [aliasQuery, setAliasQuery] = useState("");
  const [aliasPopoverPos, setAliasPopoverPos] = useState({ x: 0, y: 0 });

  const isAliasValue = isAlias(value?.$value);
  const canEdit =
    !!tokenType &&
    INLINE_SIMPLE_TYPES.has(tokenType) &&
    !!targetSet &&
    !!onSave &&
    !isAliasValue;
  const canEditAlias = isAliasValue && !!targetSet && !!onSave;
  const canCreate =
    !value &&
    !!tokenType &&
    !!targetSet &&
    !!onSave;

  // Stable refs so the tab-activation effect always reads fresh values without
  // adding them as trigger dependencies (which would cause spurious re-activations
  // whenever value/tokenType/canEdit change while isTabPending is already true).
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  const canCreateRef = useRef(canCreate);
  canCreateRef.current = canCreate;
  const valueRef = useRef(value);
  valueRef.current = value;
  const tokenTypeRef = useRef(tokenType);
  tokenTypeRef.current = tokenType;
  const onTabActivatedRef = useRef(onTabActivated);
  onTabActivatedRef.current = onTabActivated;

  // Activate edit mode when Tab navigation lands on this cell
  useEffect(() => {
    if (!isTabPending || tokenTypeRef.current === "color") return;
    if (canCreateRef.current) {
      // Empty cell — open editor with blank value
      setEditValue("");
      setEditing(true);
      onTabActivatedRef.current?.();
      return;
    }
    if (!canEditRef.current || !valueRef.current) return;
    setEditValue(
      getEditableString(tokenTypeRef.current!, valueRef.current.$value),
    );
    setEditing(true);
    onTabActivatedRef.current?.();
  }, [isTabPending]);

  const handleSubmit = useCallback(() => {
    if (!editing || !tokenType || !targetSet || !onSave) return;
    const raw = editValue.trim();
    if (!raw) {
      setEditing(false);
      return;
    }
    const parsed = parseInlineValue(tokenType, raw);
    if (parsed === null) return;
    setEditing(false);
    onSave(tokenPath, tokenType, parsed, targetSet, dimId, optionName, {
      type: value?.$type ?? tokenType,
      value: value?.$value,
    });
  }, [editing, editValue, tokenType, targetSet, dimId, optionName, tokenPath, onSave, value]);

  const openAliasEditor = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = cellRef.current?.getBoundingClientRect();
      if (!rect) return;
      const currentPath = extractAliasPath(value?.$value) ?? "";
      setAliasQuery(currentPath);
      setAliasPopoverPos({ x: rect.left, y: rect.bottom + 4 });
      setAliasEditing(true);
    },
    [value],
  );

  const closeAliasEditor = useCallback(() => {
    setAliasEditing(false);
    setAliasQuery("");
  }, []);

  const displayVal = value ? formatValue(value.$type, value.$value) : "—";
  const isColor =
    tokenType === "color" &&
    value &&
    typeof value.$value === "string" &&
    !isAliasValue;

  // For <input type="color">, extract 6-char hex and preserve any alpha suffix
  const colorHex = isColor ? (value!.$value as string) : "";
  const colorHexBase = colorHex.startsWith("#")
    ? colorHex.slice(0, 7)
    : "#000000";
  const colorAlphaSuffix =
    colorHex.startsWith("#") && colorHex.length === 9 ? colorHex.slice(7) : "";

  return (
    <div
      ref={cellRef}
      className="w-[48px] shrink-0 px-0.5 flex items-center justify-center border-l border-[var(--color-figma-border)] h-full"
      title={`${optionName}: ${displayVal}${targetSet ? `\nSet: ${targetSet}` : ""}`}
    >
      {/* Hidden color input — rendered for existing color values or creatable empty color cells */}
      {(canEdit || canCreate) && tokenType === "color" && (
        <input
          type="color"
          ref={colorInputRef}
          key={colorHexBase}
          defaultValue={colorHexBase}
          className="sr-only"
          onBlur={(e) => {
            const newHex = e.target.value + colorAlphaSuffix;
            if (newHex !== colorHex) {
              onSave!(tokenPath, "color", newHex, targetSet!, dimId, optionName, {
                type: value?.$type ?? "color",
                value: value?.$value,
              });
            }
          }}
        />
      )}
      {!value ? (
        canCreate ? (
          <span
            className={`text-[10px] text-[var(--color-figma-text-tertiary)] ${tokenType === "color" ? "cursor-pointer" : "cursor-text"} hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 rounded px-1 py-px transition-colors`}
            onClick={(e) => {
              e.stopPropagation();
              if (tokenType === "color") {
                colorInputRef.current?.click();
              } else {
                setEditValue("");
                setEditing(true);
              }
            }}
          >
            +
          </span>
        ) : onEdit ? (
          <span
            className="text-[10px] text-[var(--color-figma-text-tertiary)] cursor-pointer hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 rounded px-1 py-px transition-colors"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
          >
            +
          </span>
        ) : (
          <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
            —
          </span>
        )
      ) : isColor ? (
        <span
          className={`w-4 h-4 rounded-sm border border-[var(--color-figma-border)] shrink-0 ${canEdit ? "cursor-pointer hover:ring-1 hover:ring-[var(--color-figma-accent)]" : ""}`}
          style={{ backgroundColor: value.$value as string }}
          onClick={
            canEdit
              ? (e) => {
                  e.stopPropagation();
                  colorInputRef.current?.click();
                }
              : undefined
          }
        />
      ) : editing ? (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => {
            if (escapedRef.current) {
              escapedRef.current = false;
              return;
            }
            handleSubmit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              escapedRef.current = true;
              setEditing(false);
            }
            if (e.key === "Tab") {
              e.preventDefault();
              e.stopPropagation();
              // Use escapedRef to block the onBlur from double-saving
              escapedRef.current = true;
              if (tokenType && targetSet && onSave) {
                const raw = editValue.trim();
                if (raw) {
                  const parsed = parseInlineValue(tokenType, raw);
                  if (parsed !== null) {
                    onSave(tokenPath, tokenType, parsed, targetSet, dimId, optionName, {
                      type: value?.$type ?? tokenType,
                      value: value?.$value,
                    });
                  }
                }
              }
              setEditing(false);
              onTab?.(e.shiftKey ? -1 : 1);
              return;
            }
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label="Edit token value"
          autoFocus
          className="text-[10px] w-full text-[var(--color-figma-text)] bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] rounded px-0.5 outline-none"
        />
      ) : isAliasValue ? (
        <>
          <span
            className={`text-[10px] truncate max-w-full font-mono ${canEditAlias ? "cursor-pointer hover:underline hover:decoration-dotted text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]" : "text-[var(--color-figma-text-secondary)]"}`}
            onClick={canEditAlias ? openAliasEditor : undefined}
            title={`${optionName}: ${displayVal}${targetSet ? `\nSet: ${targetSet}` : ""}\nClick to redirect alias`}
          >
            {displayVal}
          </span>
          {aliasEditing && (
            <div
              className="fixed z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg p-2 w-64"
              style={{ top: aliasPopoverPos.y, left: aliasPopoverPos.x }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-1.5 text-[9px] text-[var(--color-figma-text-tertiary)]">
                Redirect alias ·{" "}
                <span className="font-mono normal-case text-[var(--color-figma-text)]">
                  {optionName}
                </span>
              </div>
              <div className="relative">
                <input
                  autoFocus
                  type="text"
                  value={aliasQuery}
                  onChange={(e) => setAliasQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      closeAliasEditor();
                    }
                  }}
                  className="w-full border border-[var(--color-figma-border)] rounded px-2 py-1 text-[11px] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-tertiary)]"
                  placeholder="Search tokens…"
                />
                <AliasAutocomplete
                  query={aliasQuery}
                  allTokensFlat={allTokensFlat}
                  pathToSet={pathToSet}
                  filterType={tokenType}
                  onSelect={(path) => {
                    onSave!(
                      tokenPath,
                      tokenType || value.$type || "color",
                      `{${path}}`,
                      targetSet!,
                      dimId,
                      optionName,
                      { type: value.$type, value: value.$value },
                    );
                    closeAliasEditor();
                  }}
                  onClose={closeAliasEditor}
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <span
          className={`text-[10px] truncate max-w-full ${canEdit ? "cursor-text hover:underline hover:decoration-dotted text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]" : "text-[var(--color-figma-text-secondary)]"}`}
          onClick={
            canEdit
              ? (e) => {
                  e.stopPropagation();
                  setEditValue(getEditableString(value.$type, value.$value));
                  setEditing(true);
                }
              : undefined
          }
        >
          {displayVal}
        </span>
      )}
    </div>
  );
}

type RowMetadataSegment = {
  label: string;
  title?: string;
  tone?: "default" | "accent" | "warning" | "danger";
  onClick?: () => void;
};

function getRowMetadataToneClass(
  tone: RowMetadataSegment["tone"] = "default",
): string {
  switch (tone) {
    case "accent":
      return "text-[var(--color-figma-accent)]";
    case "warning":
      return "text-[var(--color-figma-warning)]";
    case "danger":
      return "text-[var(--color-figma-error)]";
    default:
      return "text-[var(--color-figma-text-secondary)]";
  }
}

function renderRowMetadataSegments(segments: RowMetadataSegment[]) {
  return segments.map((segment, index) => (
    <span
      key={`${segment.label}-${index}`}
      className="inline-flex min-w-0 items-center gap-1"
    >
      {index > 0 && (
        <span
          aria-hidden="true"
          className="text-[var(--color-figma-text-tertiary)]/60"
        >
          ·
        </span>
      )}
      <span
        className={`truncate ${getRowMetadataToneClass(segment.tone)} ${
          segment.onClick ? "cursor-pointer hover:underline" : ""
        }`}
        title={segment.title ?? segment.label}
        onClick={
          segment.onClick
            ? (event) => {
                event.stopPropagation();
                segment.onClick?.();
              }
            : undefined
        }
      >
        {segment.label}
      </span>
    </span>
  ));
}

// ---------------------------------------------------------------------------
// TokenGroupNode — renders a group row (expand/collapse header)
// ---------------------------------------------------------------------------
const TokenGroupNode = memo(
  function TokenGroupNode(props: TokenTreeNodeProps) {
    const {
      node,
      depth,
      lintViolations = [],
      isPinned: _isPinned,
      onMoveUp,
      onMoveDown,
    } = props;

    const {
      density,
      setName,
      selectMode,
      expandedPaths,
      highlightedToken,
      previewedPath,
      searchHighlight,
      dragOverGroup,
      dragOverGroupIsInvalid,
      dragSource,
      recipesByTargetGroup,
      themeCoverage,
      condensedView = false,
      rovingFocusPath: groupRovingFocusPath,
    } = useTokenTreeGroupState();
    const { allTokensFlat } = useTokenTreeSharedData();
    const {
      onToggleExpand,
      onDeleteGroup,
      onCreateSibling,
      onCreateGroup,
      onRenameGroup,
      onUpdateGroupMeta,
      onRequestMoveGroup,
      onRequestCopyGroup,
      onDuplicateGroup,
      onSyncGroup,
      onSyncGroupStyles,
      onSetGroupScopes,
      onGenerateScaleFromGroup,
      onZoomIntoGroup,
      onDragOverGroup,
      onDropOnGroup,
      onEditRecipe,
      onNavigateToRecipe,
      onRegenerateRecipe,
      onDetachRecipeGroup,
      onNavigateToToken,
      onRovingFocus: onGroupRovingFocus,
    } = useTokenTreeGroupActions();

    const pyClass = DENSITY_PY_CLASS[density];
    const isExpanded = expandedPaths.has(node.path);
    const isHighlighted = highlightedToken === node.path;
    const isGroupActive =
      groupRovingFocusPath === node.path || previewedPath === node.path;
    const groupRowStateClass = isHighlighted
      ? "bg-[var(--color-figma-accent)]/15 ring-1 ring-inset ring-[var(--color-figma-accent)]/40"
      : "";

    // Group-specific state
    const [groupMenuPos, setGroupMenuPos] = useState<MenuPosition | null>(null);
    const [groupMenuAdvanced, setGroupMenuAdvanced] = useState(false);
    const [renamingGroup, setRenamingGroup] = useState(false);
    const [renameGroupVal, setRenameGroupVal] = useState("");
    const [renameGroupError, setRenameGroupError] = useState("");
    const renameGroupInputRef = useRef<HTMLInputElement>(null);
    const groupMenuRef = useRef<HTMLDivElement>(null);
    const [editingGroupMeta, setEditingGroupMeta] = useState(false);
    const [groupMetaType, setGroupMetaType] = useState("");
    const [groupMetaDescription, setGroupMetaDescription] = useState("");
    const [groupMetaSaving, setGroupMetaSaving] = useState(false);
    const [regenerating, setRegenerating] = useState(false);
    const [detachingGroup, setDetachingGroup] = useState(false);
    const [showDetachGroupConfirm, setShowDetachGroupConfirm] = useState(false);

    useLayoutEffect(() => {
      if (renamingGroup && renameGroupInputRef.current) {
        renameGroupInputRef.current.focus();
        renameGroupInputRef.current.select();
      }
    }, [renamingGroup]);

    const closeGroupMenus = useCallback(() => {
      setGroupMenuPos(null);
      setGroupMenuAdvanced(false);
    }, []);

    useEffect(() => {
      if (!groupMenuPos) return;
      requestAnimationFrame(() => {
        if (groupMenuRef.current)
          getMenuItems(groupMenuRef.current)[0]?.focus();
      });
      const onDocumentClick = (e: MouseEvent) => {
        const target = e.target as Node | null;
        if (groupMenuRef.current?.contains(target)) return;
        closeGroupMenus();
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeGroupMenus();
          return;
        }
        if (!groupMenuRef.current) return;
        if (handleMenuArrowKeys(e, groupMenuRef.current, {})) return;
        const key = e.key.toLowerCase();
        const btn = groupMenuRef.current.querySelector(
          `[data-accel="${key}"]`,
        ) as HTMLButtonElement | null;
        if (btn) {
          e.preventDefault();
          btn.click();
        }
      };
      document.addEventListener("click", onDocumentClick);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("click", onDocumentClick);
        document.removeEventListener("keydown", onKey);
      };
    }, [closeGroupMenus, groupMenuPos]);

    const isCategoryHeader = depth === 0;
    const leafCount = countLeaves(node);
    const targetRecipe =
      recipesByTargetGroup?.get(
        createRecipeOwnershipKey(setName, node.path),
      ) ?? null;
    const managedRecipeLeafCount = useMemo(() => {
      if (!targetRecipe) return 0;
      return getManagedRecipeLeafCount(node, targetRecipe);
    }, [node, targetRecipe]);
    const themeCoverageSummary = themeCoverage?.get(node.path) ?? null;
    const groupPresentation = readTokenPresentationMetadata(node);
    const groupScopeSummary =
      node.$type && groupPresentation.scopes.length > 0
        ? summarizeTokenScopes(node.$type, groupPresentation.scopes)
        : null;
    const groupMetadataSegments: RowMetadataSegment[] = [];
    if (targetRecipe) {
      const countLabel = managedRecipeLeafCount === leafCount
        ? `${leafCount} token${leafCount === 1 ? "" : "s"}`
        : `${managedRecipeLeafCount}/${leafCount} tokens`;
      groupMetadataSegments.push({
        label: `${countLabel} via ${targetRecipe.name}`,
        title: `${formatRecipeSummaryTitle(targetRecipe)}\n${managedRecipeLeafCount} of ${leafCount} token${leafCount === 1 ? "" : "s"} managed by this recipe`,
        tone: targetRecipe.isStale ? "warning" : "accent",
      });
    } else {
      groupMetadataSegments.push({
        label:
          leafCount === 0
            ? "Empty"
            : `${leafCount} token${leafCount === 1 ? "" : "s"}`,
        title:
          leafCount === 0
            ? "This group has no tokens yet"
            : `${leafCount} token${leafCount === 1 ? "" : "s"} in this group`,
      });
    }
    if (node.$type) {
      groupMetadataSegments.push({
        label: `Type: ${node.$type}`,
        title: `Inherited type: ${node.$type}`,
      });
    }
    if (groupScopeSummary) {
      groupMetadataSegments.push({
        label: groupScopeSummary,
        title: `Figma scopes: ${groupPresentation.scopes.join(", ")}`,
      });
    }
    const groupLifecycle = getLifecycleLabel(groupPresentation.lifecycle);
    if (groupLifecycle) {
      groupMetadataSegments.push({
        label: groupLifecycle,
        tone: groupPresentation.lifecycle === "draft" ? "warning" : "default",
      });
    }

    // Build a stable map of child path → filtered lint violations so we don't create
    // a new array on every render when passing violations down to child nodes.
    const childLintMap = useMemo(() => {
      if (!lintViolations.length) return null;
      const map = new Map<
        string,
        NonNullable<TokenTreeNodeProps["lintViolations"]>
      >();
      for (const v of lintViolations) {
        let arr = map.get(v.path);
        if (!arr) {
          arr = [];
          map.set(v.path, arr);
        }
        arr.push(v);
      }
      return map;
    }, [lintViolations]);

    const confirmGroupRename = useCallback(() => {
      const newName = renameGroupVal.trim();
      if (!newName) {
        setRenameGroupError("Name cannot be empty");
        return;
      }
      if (newName === node.name) {
        setRenamingGroup(false);
        setRenameGroupError("");
        return;
      }
      const parentPath = nodeParentPath(node.path, node.name);
      const newGroupPath = parentPath ? `${parentPath}.${newName}` : newName;
      // Check for conflict: a token or group already exists at the target path
      const prefix = newGroupPath + ".";
      const hasConflict = Object.keys(allTokensFlat).some(
        (p) => p === newGroupPath || p.startsWith(prefix),
      );
      if (hasConflict) {
        setRenameGroupError(`A group named '${newName}' already exists here`);
        return;
      }
      setRenamingGroup(false);
      setRenameGroupError("");
      onRenameGroup?.(node.path, newGroupPath);
    }, [renameGroupVal, node.name, node.path, allTokensFlat, onRenameGroup]);

    const cancelGroupRename = useCallback(() => {
      setRenamingGroup(false);
      setRenameGroupError("");
    }, []);

    const handleSaveGroupMeta = useCallback(async () => {
      setGroupMetaSaving(true);
      try {
        await onUpdateGroupMeta?.(node.path, {
          $type: groupMetaType || null,
          $description: groupMetaDescription || null,
        });
        setEditingGroupMeta(false);
      } catch (err) {
        console.error("Failed to save group metadata:", err);
      } finally {
        setGroupMetaSaving(false);
      }
    }, [onUpdateGroupMeta, node.path, groupMetaType, groupMetaDescription]);

    return (
      <div
        className={
          isCategoryHeader ? "border-t border-[var(--color-figma-border)]" : ""
        }
      >
        <div
          role="treeitem"
          aria-level={depth + 1}
          tabIndex={groupRovingFocusPath === node.path ? 0 : -1}
          aria-expanded={isExpanded}
          aria-label={`Toggle group ${node.name}`}
          data-group-path={node.path}
          data-node-name={node.name}
          onFocus={() => onGroupRovingFocus(node.path)}
          className={`relative flex items-center gap-1 px-1.5 ${pyClass} cursor-pointer transition-colors group/group token-row-hover ${targetRecipe ? "bg-[var(--color-figma-warning)]/[0.03] hover:bg-[var(--color-figma-warning)]/[0.08]" : "bg-[var(--color-figma-bg)] hover:bg-[var(--color-figma-bg-hover)]"} ${groupRowStateClass} ${dragOverGroup === node.path ? (dragOverGroupIsInvalid ? "ring-1 ring-inset ring-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10" : "ring-1 ring-inset ring-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10") : ""}`}
          data-roving-focus={groupRovingFocusPath === node.path || undefined}
          style={{
            paddingLeft: `${computePaddingLeft(depth, condensedView, 8)}px`,
          }}
          onClick={() => !renamingGroup && onToggleExpand(node.path)}
          onDoubleClick={() => !renamingGroup && onZoomIntoGroup?.(node.path)}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("application/x-token-drag"))
              return;
            e.preventDefault();
            const isInvalid = dragSource
              ? dragSource.paths.every((oldPath, i) => {
                  const newPath = node.path
                    ? `${node.path}.${dragSource.names[i]}`
                    : dragSource.names[i];
                  return (
                    newPath === oldPath || node.path.startsWith(oldPath + ".")
                  );
                })
              : false;
            e.dataTransfer.dropEffect = isInvalid ? "none" : "move";
            onDragOverGroup?.(node.path, isInvalid);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              onDragOverGroup?.(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            onDropOnGroup?.(node.path);
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !renamingGroup) {
              e.preventDefault();
              onToggleExpand(node.path);
            }
            if (e.key === "z" && !renamingGroup && !selectMode) {
              e.preventDefault();
              e.stopPropagation();
              onZoomIntoGroup?.(node.path);
            }
            if (e.key === "n" && !renamingGroup && !selectMode) {
              e.preventDefault();
              e.stopPropagation();
              onCreateSibling?.(node.path, inferGroupTokenType(node.children));
            }
            if (e.key === "s" && !renamingGroup && !selectMode && onSetGroupScopes) {
              e.preventDefault();
              e.stopPropagation();
              onSetGroupScopes(node.path);
            }
            if (e.key === "m" && !renamingGroup && !selectMode) {
              e.preventDefault();
              e.stopPropagation();
              const rect = (
                e.currentTarget as HTMLElement
              ).getBoundingClientRect();
              setGroupMenuPos(
                clampMenuPosition(rect.left, rect.bottom + 2, 184, 240),
              );
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setGroupMenuPos(clampMenuPosition(e.clientX, e.clientY, 192, 420));
          }}
        >
          <DepthBar depth={depth} />
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            className={`transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`}
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
          {renamingGroup ? (
            <div
              className="flex flex-col flex-1 min-w-0 gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-1">
                <input
                  ref={renameGroupInputRef}
                  value={renameGroupVal}
                  onChange={(e) => {
                    setRenameGroupVal(e.target.value);
                    setRenameGroupError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      confirmGroupRename();
                    }
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      cancelGroupRename();
                    }
                  }}
                  aria-label="Rename group"
                  className={`flex-1 text-[11px] font-medium bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] rounded px-1 outline-none min-w-0 focus-visible:border-[var(--color-figma-accent)] ${renameGroupError ? "border-[var(--color-figma-error)]" : "border-[var(--color-figma-border)]"}`}
                />
                <button
                  onClick={confirmGroupRename}
                  disabled={!renameGroupVal.trim()}
                  className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 shrink-0"
                >
                  Save
                </button>
                <button
                  onClick={cancelGroupRename}
                  className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] shrink-0"
                >
                  Cancel
                </button>
              </div>
              {renameGroupError && (
                <p
                  role="alert"
                  className="text-[10px] text-[var(--color-figma-error)]"
                >
                  {renameGroupError}
                </p>
              )}
            </div>
          ) : (
            isCategoryHeader ? (
              <span className="flex-1 text-[11px] font-medium text-[var(--color-figma-text-secondary)]">
                {highlightMatch(node.name, searchHighlight?.nameTerms ?? [])}
              </span>
            ) : (
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[11px] font-medium text-[var(--color-figma-text)]">
                  {highlightMatch(node.name, searchHighlight?.nameTerms ?? [])}
                </span>
                {groupMetadataSegments.length > 0 && (
                  <div className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden text-[9px]">
                    {renderRowMetadataSegments(groupMetadataSegments)}
                  </div>
                )}
              </div>
            )
          )}
          {!renamingGroup &&
            isGroupActive &&
            themeCoverageSummary &&
            themeCoverageSummary.total > 0 && (
              <span
                className={`shrink-0 text-[9px] ${themeCoverageSummary.totalMissing > 0 ? "text-[var(--color-figma-warning)]" : themeCoverageSummary.themed === themeCoverageSummary.total ? "text-[var(--color-figma-success)]" : "text-[var(--color-figma-text-tertiary)]"}`}
                title={
                  themeCoverageSummary.totalMissing > 0
                    ? `${themeCoverageSummary.totalMissing} mode value${themeCoverageSummary.totalMissing === 1 ? "" : "s"} missing across ${themeCoverageSummary.total} tokens`
                    : `${themeCoverageSummary.themed} of ${themeCoverageSummary.total} tokens have themed overrides`
                }
              >
                {themeCoverageSummary.totalMissing > 0
                  ? `${themeCoverageSummary.totalMissing} missing`
                  : `${themeCoverageSummary.themed}/${themeCoverageSummary.total}`}
              </span>
            )}
        {!renamingGroup && isGroupActive && targetRecipe && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (targetRecipe.id) onNavigateToRecipe?.(targetRecipe.id);
              }}
              disabled={!targetRecipe.id || !onNavigateToRecipe}
              className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
                targetRecipe.isStale
                  ? "bg-[var(--color-figma-warning)]/10 text-[var(--color-figma-warning)]"
                  : "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
              } disabled:cursor-default disabled:opacity-100`}
              title={`${managedRecipeLeafCount} managed token${managedRecipeLeafCount === 1 ? "" : "s"}`}
            >
              <RecipeGlyph size={6} className="shrink-0" />
              <span>Recipe</span>
              <span className="text-[var(--color-figma-text-tertiary)]">
                {managedRecipeLeafCount}
              </span>
            </button>
          )}
          {!selectMode && !renamingGroup && (
            <div
              className={`flex items-center gap-0.5 shrink-0 ml-auto ${isGroupActive ? "opacity-100" : "opacity-0 pointer-events-none group-hover/group:opacity-100 group-hover/group:pointer-events-auto group-focus-within/group:opacity-100 group-focus-within/group:pointer-events-auto"} transition-opacity`}
            >
              {onZoomIntoGroup && (
                <button
                  onClick={(e) => { e.stopPropagation(); onZoomIntoGroup(node.path); }}
                  title="Focus on this group"
                  aria-label="Focus on this group"
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>
                  <span>Focus</span>
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onCreateSibling?.(node.path, inferGroupTokenType(node.children)); }}
                title="Add token to group"
                aria-label="Add token to group"
                className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setGroupMenuPos(clampMenuPosition(rect.left, rect.bottom + 2, 192, 420));
                }}
                title="Group actions"
                aria-label="Group actions"
                aria-haspopup="menu"
                aria-expanded={!!groupMenuPos}
                className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                </button>
            </div>
          )}
        </div>

        {/* Group context menu — tiered with "More..." expander */}
        {groupMenuPos && (
          <div
            ref={groupMenuRef}
            role="menu"
            data-context-menu="group"
            className={`${MENU_SURFACE_CLASS} min-w-[192px] max-h-[80vh] overflow-y-auto`}
            style={{ top: groupMenuPos.y, left: groupMenuPos.x }}
            onClick={(e) => e.stopPropagation()}
          >
            {!groupMenuAdvanced ? (
              <>
                {/* Section: Primary */}
                {onZoomIntoGroup && (
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    data-accel="z"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { closeGroupMenus(); onZoomIntoGroup(node.path); }}
                    className={MENU_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>
                    <span className="flex-1">Focus on group</span>
                    <span className={MENU_SHORTCUT_CLASS}>Z</span>
                  </button>
                )}
                {onCreateSibling && (
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    data-accel="c"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { closeGroupMenus(); onCreateSibling(node.path, inferGroupTokenType(node.children)); }}
                    className={MENU_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    <span className="flex-1">Add token</span>
                    <span className={MENU_SHORTCUT_CLASS}>C</span>
                  </button>
                )}
                {onCreateGroup && (
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    data-accel="n"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { closeGroupMenus(); onCreateGroup(node.path); }}
                    className={MENU_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" /></svg>
                    <span className="flex-1">New subgroup</span>
                    <span className={MENU_SHORTCUT_CLASS}>N</span>
                  </button>
                )}
                {onSetGroupScopes && (
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    data-accel="s"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { closeGroupMenus(); onSetGroupScopes(node.path); }}
                    className={MENU_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M12 3l7 4v10l-7 4-7-4V7l7-4z" /><path d="M9 12h6" /></svg>
                    <span className="flex-1">Edit Figma scopes</span>
                    <span className={MENU_SHORTCUT_CLASS}>S</span>
                  </button>
                )}
                {targetRecipe?.id && onNavigateToRecipe && (
                  <>
                    <button
                      role="menuitem"
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        closeGroupMenus();
                        onNavigateToRecipe(targetRecipe.id!);
                      }}
                      className={MENU_ITEM_CLASS}
                    >
                      <RecipeGlyph size={8} className="shrink-0 opacity-60" />
                      <span className="flex-1">Open recipe</span>
                    </button>
                    <div role="separator" className={MENU_SEPARATOR_CLASS} />
                  </>
                )}
                <button
                  role="menuitem"
                  tabIndex={-1}
                  data-accel="r"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { closeGroupMenus(); setRenameGroupVal(node.name); setRenamingGroup(true); }}
                  className={MENU_ITEM_CLASS}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                  <span className="flex-1">Rename</span>
                  <span className={MENU_SHORTCUT_CLASS}>R</span>
                </button>
                <div role="separator" className={MENU_SEPARATOR_CLASS} />
                {/* Section: Danger */}
                <button
                  role="menuitem"
                  tabIndex={-1}
                  data-accel="x"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { closeGroupMenus(); onDeleteGroup(node.path, node.name, leafCount); }}
                  className={MENU_DANGER_ITEM_CLASS}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  <span className="flex-1">Delete</span>
                  <span className={MENU_SHORTCUT_CLASS}>X</span>
                </button>
                <div role="separator" className={MENU_SEPARATOR_CLASS} />
                {/* More... expander */}
                <button
                  role="menuitem"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setGroupMenuAdvanced(true)}
                  className={MENU_ITEM_CLASS}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
                  <span className="flex-1">More...</span>
                </button>
              </>
            ) : (
              <>
                {/* Advanced section — Back button */}
                <button
                  role="menuitem"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setGroupMenuAdvanced(false)}
                  className={MENU_ITEM_CLASS}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                  <span className="flex-1">Back</span>
                </button>
                <div role="separator" className={MENU_SEPARATOR_CLASS} />
                {/* Section: Advanced */}
                <button
                  role="menuitem"
                  tabIndex={-1}
                  data-accel="d"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { closeGroupMenus(); onDuplicateGroup?.(node.path); }}
                  className={MENU_ITEM_CLASS}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  <span className="flex-1">Duplicate group</span>
                  <span className={MENU_SHORTCUT_CLASS}>D</span>
                </button>
                {onMoveUp && (
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { closeGroupMenus(); onMoveUp(); }}
                    className={MENU_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M18 15l-6-6-6 6" /></svg>
                    <span className="flex-1">Move group up</span>
                  </button>
                )}
                {onMoveDown && (
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { closeGroupMenus(); onMoveDown(); }}
                    className={MENU_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M6 9l6 6 6-6" /></svg>
                    <span className="flex-1">Move group down</span>
                  </button>
                )}
                <button
                  role="menuitem"
                  tabIndex={-1}
                  data-accel="e"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { closeGroupMenus(); setGroupMetaType(node.$type ?? ""); setGroupMetaDescription(node.$description ?? ""); setEditingGroupMeta(true); }}
                  className={MENU_ITEM_CLASS}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  <span className="flex-1">Edit type &amp; description</span>
                  <span className={MENU_SHORTCUT_CLASS}>E</span>
                </button>
                <button
                  role="menuitem"
                  tabIndex={-1}
                  data-accel="m"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { closeGroupMenus(); onRequestMoveGroup?.(node.path); }}
                  className={MENU_ITEM_CLASS}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><path d="M12 11v6M9 14l3-3 3 3" /></svg>
                  <span className="flex-1">Move to set</span>
                  <span className={MENU_SHORTCUT_CLASS}>M</span>
                </button>
                <button
                  role="menuitem"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { closeGroupMenus(); onRequestCopyGroup?.(node.path); }}
                  className={MENU_ITEM_CLASS}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><path d="M12 11v6M9 17h6" /></svg>
                  <span className="flex-1">Copy to set</span>
                </button>
                {onGenerateScaleFromGroup && (
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    data-accel="g"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      closeGroupMenus();
                      const prefix = `${node.path}.`;
                      const types: Record<string, number> = {};
                      for (const [path, entry] of Object.entries(allTokensFlat)) {
                        if (path === node.path || path.startsWith(prefix)) {
                          const t = entry.$type;
                          if (t) types[t] = (types[t] ?? 0) + 1;
                        }
                      }
                      const dominant = Object.entries(types).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
                      onGenerateScaleFromGroup(node.path, dominant);
                    }}
                    className={MENU_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" /></svg>
                    <span className="flex-1">Create recipe from this token</span>
                    <span className={MENU_SHORTCUT_CLASS}>G</span>
                  </button>
                )}
                {onSyncGroup && (
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    data-accel="v"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { closeGroupMenus(); const count = node.children ? countTokensInGroup(node) : 0; onSyncGroup(node.path, count); }}
                    className={MENU_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                    <span className="flex-1">Sync to Figma variables</span>
                    <span className={MENU_SHORTCUT_CLASS}>V</span>
                  </button>
                )}
                {onSyncGroupStyles && (
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    data-accel="y"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { closeGroupMenus(); const count = node.children ? countTokensInGroup(node) : 0; onSyncGroupStyles(node.path, count); }}
                    className={MENU_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                    <span className="flex-1">Sync to Figma styles</span>
                    <span className={MENU_SHORTCUT_CLASS}>Y</span>
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {editingGroupMeta && (
          <div
            className="mx-2 mb-1 p-2 rounded border border-[var(--color-figma-accent)]/40 bg-[var(--color-figma-bg-secondary)] flex flex-col gap-1.5"
            style={{
              marginLeft: `${computePaddingLeft(depth, condensedView, 8)}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
              Group metadata
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)] w-16 shrink-0">
                $type
              </label>
              <select
                value={groupMetaType}
                onChange={(e) => setGroupMetaType(e.target.value)}
                className="flex-1 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)]"
              >
                <option value="">(none)</option>
                <option value="color">color</option>
                <option value="dimension">dimension</option>
                <option value="fontFamily">fontFamily</option>
                <option value="fontWeight">fontWeight</option>
                <option value="duration">duration</option>
                <option value="cubicBezier">cubicBezier</option>
                <option value="number">number</option>
                <option value="string">string</option>
                <option value="boolean">boolean</option>
                <option value="shadow">shadow</option>
                <option value="gradient">gradient</option>
                <option value="typography">typography</option>
                <option value="border">border</option>
                <option value="strokeStyle">strokeStyle</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)] w-16 shrink-0">
                $description
              </label>
              <input
                type="text"
                value={groupMetaDescription}
                onChange={(e) => setGroupMetaDescription(e.target.value)}
                placeholder="Optional description…"
                className="flex-1 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveGroupMeta();
                  }
                  if (e.key === "Escape") setEditingGroupMeta(false);
                }}
              />
            </div>
            <div className="flex gap-1 justify-end">
              <button
                onClick={() => setEditingGroupMeta(false)}
                className="px-2 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveGroupMeta}
                disabled={groupMetaSaving}
                className="px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:opacity-90 disabled:opacity-40"
              >
                {groupMetaSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}

        {!props.skipChildren && isExpanded && targetRecipe && (
          <RecipeSummaryRow
            depth={depth}
            condensedView={condensedView}
            recipe={targetRecipe}
            managedTokenCount={managedRecipeLeafCount}
            running={regenerating}
            detaching={detachingGroup}
            onRun={
              targetRecipe.id && onRegenerateRecipe
                ? async () => {
                    if (regenerating) return;
                    setRegenerating(true);
                    try {
                      await onRegenerateRecipe(targetRecipe.id);
                    } finally {
                      setRegenerating(false);
                    }
                  }
                : undefined
            }
            onEdit={
              targetRecipe.id && onEditRecipe
                ? () => onEditRecipe(targetRecipe.id)
                : undefined
            }
            onDetach={
              targetRecipe.id && onDetachRecipeGroup
                ? () => {
                    setShowDetachGroupConfirm(true);
                  }
                : undefined
            }
            onNavigateToSourceToken={onNavigateToToken}
          />
        )}

        {showDetachGroupConfirm && targetRecipe && (
          <ConfirmModal
            title="Detach Group From Recipe?"
            description={`Convert ${managedRecipeLeafCount} recipe-managed token${managedRecipeLeafCount === 1 ? "" : "s"} in "${node.path}" to manual. "${targetRecipe.name}" will stop updating them.`}
            confirmLabel="Detach group"
            onCancel={() => setShowDetachGroupConfirm(false)}
            onConfirm={async () => {
              if (!targetRecipe.id || !onDetachRecipeGroup) {
                setShowDetachGroupConfirm(false);
                return;
              }
              setDetachingGroup(true);
              try {
                await onDetachRecipeGroup(targetRecipe.id, node.path);
                setShowDetachGroupConfirm(false);
              } finally {
                setDetachingGroup(false);
              }
            }}
          />
        )}

        {!props.skipChildren &&
          isExpanded &&
          node.children?.map((child) => (
            <TokenTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              isSelected={false}
              lintViolations={
                childLintMap?.get(child.path) ?? EMPTY_LINT_VIOLATIONS
              }
            />
          ))}
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.node === next.node &&
      prev.depth === next.depth &&
      prev.isSelected === next.isSelected &&
      prev.lintViolations === next.lintViolations &&
      prev.skipChildren === next.skipChildren &&
      prev.showFullPath === next.showFullPath &&
      prev.ancestorPathLabel === next.ancestorPathLabel &&
      prev.isPinned === next.isPinned &&
      prev.chainExpanded === next.chainExpanded &&
      prev.onMoveUp === next.onMoveUp &&
      prev.onMoveDown === next.onMoveDown &&
      prev.multiModeValues === next.multiModeValues
    );
  },
);

// ---------------------------------------------------------------------------
// TokenLeafNode — renders a leaf token row
// ---------------------------------------------------------------------------
const TokenLeafNode = memo(
  function TokenLeafNode(props: TokenTreeNodeProps) {
    const {
      node,
      depth,
      isSelected,
      lintViolations = [],
      skipChildren,
      showFullPath,
      ancestorPathLabel,
      isPinned: _isPinned,
      chainExpanded: chainExpandedProp = false,
      onMoveUp: _onMoveUp,
      onMoveDown: _onMoveDown,
      multiModeValues,
    } = props;

    const {
      density,
      setName,
      selectionCapabilities,
      selectMode,
      duplicateCounts,
      highlightedToken,
      previewedPath,
      inspectMode,
      syncSnapshot,
      derivedTokenPaths,
      searchHighlight,
      selectedNodes,
      dragOverReorder,
      selectedLeafNodes,
      showResolvedValues,
      condensedView = false,
      starredPaths,
      pendingRenameToken,
      pendingTabEdit,
      rovingFocusPath,
      showDuplicatesFilter,
      modeVariantPaths,
      themeLensEnabled,
      tokenModeMissing,
    } = useTokenTreeLeafState();
    const { allTokensFlat, pathToSet } = useTokenTreeSharedData();
    const {
      onEdit,
      onPreview,
      onDelete,
      onToggleSelect,
      onNavigateToAlias,
      onRequestMoveToken,
      onRequestCopyToken,
      onDuplicateToken,
      onDetachFromRecipe,
      onExtractToAlias,
      onHoverToken,
      onFilterByType,
      onInlineSave,
      onRenameToken,
      onViewTokenHistory,
      onCompareAcrossThemes,
      onDragStart,
      onDragEnd,
      onDragOverToken,
      onDragLeaveToken,
      onDropOnToken,
      onMultiModeInlineSave,
      onToggleStar,
      clearPendingRename,
      clearPendingTabEdit,
      onTabToNext,
      onOpenRecipeEditor,
      onRovingFocus,
    } = useTokenTreeLeafActions();

    const pyClass = DENSITY_PY_CLASS[density];
    const swatchSize = DENSITY_SWATCH_SIZE[density];

    const isHighlighted = highlightedToken === node.path;
    const isPreviewed = previewedPath === node.path;
    const [hovered, setHovered] = useState(false);
    const [hoverPreviewVisible, setHoverPreviewVisible] = useState(false);
    const [showPicker, setShowPicker] = useState(false);
    const [pickerAnchor, setPickerAnchor] = useState<
      { top: number; left: number } | undefined
    >();
    const [colorPickerOpen, setColorPickerOpen] = useState(false);
    const [pendingColor, setPendingColor] = useState("");
    const [_copiedWhat, setCopiedWhat] = useState<"path" | "value" | null>(null);
    const [contextMenuPos, setContextMenuPos] = useState<MenuPosition | null>(
      null,
    );
    const [tokenMenuAdvanced, setTokenMenuAdvanced] = useState(false);
    const [refsPopover, setRefsPopover] = useState<{
      pos: { x: number; y: number };
      refs: string[];
    } | null>(null);
    const refsPopoverRef = useRef<HTMLDivElement>(null);
    const chainExpanded = chainExpandedProp;
    const [inlineEditActive, setInlineEditActive] = useState(false);
    const [inlineEditValue, setInlineEditValue] = useState("");
    const [inlineEditError, setInlineEditError] = useState<string | null>(null);
    const inlineEditEscapedRef = useRef(false);
    const [inlineNudgeVisible, setInlineNudgeVisible] = useState(false);
    const [quickBound, setQuickBound] = useState<string | null>(null);
    const [pickerProps, setPickerProps] = useState<BindableProperty[] | null>(
      null,
    );
    const [aliasPickerOpen, setAliasPickerOpen] = useState(false);
    const [aliasQuery, setAliasQuery] = useState("");
    const [aliasPickerPos, _setAliasPickerPos] = useState<{
      x: number;
      y: number;
    }>({ x: 0, y: 0 });
    const [inlinePopoverOpen, setInlinePopoverOpen] = useState(false);
    const [inlinePopoverAnchor, setInlinePopoverAnchor] =
      useState<DOMRect | null>(null);
    const [showGeneratedEditWarning, setShowGeneratedEditWarning] =
      useState(false);
    const [pendingGeneratedSave, setPendingGeneratedSave] = useState<{
      nextValue: unknown;
      previousState?: { type?: string; value: unknown };
      afterSave?: () => void;
    } | null>(null);
    const [showDetachTokenConfirm, setShowDetachTokenConfirm] = useState(false);
    const nodeRef = useRef<HTMLDivElement>(null);
    // Stable refs for the tab-edit effect (see useEffect near pendingTabEdit)
    const nodeDataRef = useRef(node);
    const canInlineEditRef = useRef(false);
    const clearPendingTabEditRef = useRef(clearPendingTabEdit);

    // Token rename state
    const [renamingToken, setRenamingToken] = useState(false);
    const [renameTokenVal, setRenameTokenVal] = useState("");
    const [renameTokenError, setRenameTokenError] = useState("");
    const renameTokenInputRef = useRef<HTMLInputElement>(null);
    const tokenMenuRef = useRef<HTMLDivElement>(null);
    const booleanInlineEditRef = useRef<HTMLDivElement>(null);
    const quickRecipeType = useMemo(
      () =>
        getQuickRecipeTypeForToken(
          node.path,
          node.name,
          node.$type,
          node.$value,
        ),
      [node.path, node.name, node.$type, node.$value],
    );

    useLayoutEffect(() => {
      if (renamingToken && renameTokenInputRef.current) {
        renameTokenInputRef.current.focus();
        renameTokenInputRef.current.select();
      }
    }, [renamingToken]);

    useLayoutEffect(() => {
      if (inlineEditActive && node.$type === "boolean") {
        booleanInlineEditRef.current?.focus();
      }
    }, [inlineEditActive, node.$type]);

    // When this token is the pending rename target (e.g. after Cmd+D duplicate), activate inline rename
    useEffect(() => {
      if (pendingRenameToken === node.path) {
        setRenameTokenVal(node.name);
        setRenamingToken(true);
        clearPendingRename();
      }
    }, [pendingRenameToken, node.path, node.name, clearPendingRename]);

    // When Tab navigation lands on this token (non-multi-mode), activate inline edit.
    // Reads node/canInlineEdit/clearPendingTabEdit via stable refs so the effect only
    // fires when pendingTabEdit changes, not on every unrelated prop update.
    useEffect(() => {
      const n = nodeDataRef.current;
      if (
        !pendingTabEdit ||
        pendingTabEdit.path !== n.path ||
        pendingTabEdit.columnId !== null
      )
        return;
      if (canInlineEditRef.current && n.$type && n.$type !== "color") {
        setInlineEditValue(getEditableString(n.$type, n.$value));
        setInlineEditError(null);
        setInlineEditActive(true);
        setInlineNudgeVisible(false);
      }
      clearPendingTabEditRef.current();
    }, [pendingTabEdit]);

    const closeTokenMenus = useCallback(() => {
      setContextMenuPos(null);
      setTokenMenuAdvanced(false);
    }, []);

    const openQuickRecipe = useCallback(() => {
      if (!quickRecipeType || !onOpenRecipeEditor) return;
      closeTokenMenus();
      onOpenRecipeEditor({
        mode: "create",
        sourceTokenPath: node.path,
        sourceTokenName: node.name,
        sourceTokenType: node.$type,
        sourceTokenValue: node.$value,
        initialDraft: {
          selectedType: quickRecipeType,
        },
      });
    }, [closeTokenMenus, node.$type, node.$value, node.name, node.path, onOpenRecipeEditor, quickRecipeType]);

    // Close context menu on outside click + scoped arrow-key navigation + letter-key accelerators
    useEffect(() => {
      if (!contextMenuPos) return;
      requestAnimationFrame(() => {
        if (tokenMenuRef.current)
          getMenuItems(tokenMenuRef.current)[0]?.focus();
      });
      const onDocumentClick = (e: MouseEvent) => {
        const target = e.target as Node | null;
        if (tokenMenuRef.current?.contains(target)) return;
        closeTokenMenus();
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeTokenMenus();
          return;
        }
        if (!tokenMenuRef.current) return;
        if (handleMenuArrowKeys(e, tokenMenuRef.current, {})) return;
        const key = e.key === "Backspace" ? "delete" : e.key.toLowerCase();
        const btn = tokenMenuRef.current.querySelector(
          `[data-accel="${key}"]`,
        ) as HTMLButtonElement | null;
        if (btn) {
          e.preventDefault();
          btn.click();
        }
      };
      document.addEventListener("click", onDocumentClick);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("click", onDocumentClick);
        document.removeEventListener("keydown", onKey);
      };
    }, [closeTokenMenus, contextMenuPos]);

    // Close refs popover on outside click or Escape
    useEffect(() => {
      if (!refsPopover) return;
      const close = () => setRefsPopover(null);
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setRefsPopover(null);
        }
      };
      document.addEventListener("click", close);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("click", close);
        document.removeEventListener("keydown", onKey);
      };
    }, [refsPopover]);

    // Close alias picker on outside click
    useEffect(() => {
      if (!aliasPickerOpen) return;
      const close = () => setAliasPickerOpen(false);
      const timer = setTimeout(
        () => document.addEventListener("click", close),
        0,
      );
      return () => {
        clearTimeout(timer);
        document.removeEventListener("click", close);
      };
    }, [aliasPickerOpen]);

    // Scroll highlighted token into view (only when NOT in virtual scroll mode)
    useEffect(() => {
      if (isHighlighted && nodeRef.current && !skipChildren) {
        nodeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, [isHighlighted, skipChildren]);

    // Delayed hover preview for complex token types (typography, shadow, gradient, border)
    useEffect(() => {
      if (!hovered || !node.$type || !COMPLEX_PREVIEW_TYPES.has(node.$type)) {
        setHoverPreviewVisible(false);
        return;
      }
      const timer = setTimeout(() => setHoverPreviewVisible(true), 300);
      return () => clearTimeout(timer);
    }, [hovered, node.$type]);

    // Memoized alias resolution — expensive traversal, only recompute when value/type/map changes
    const resolveResult = useMemo(
      () =>
        isAlias(node.$value)
          ? resolveTokenValue(
              node.$value,
              node.$type || "unknown",
              allTokensFlat,
            )
          : null,
      [node.$value, node.$type, allTokensFlat],
    );

    const displayValue = resolveResult
      ? (resolveResult.value ?? node.$value)
      : node.$value;
    const isBrokenAlias = isAlias(node.$value) && !!resolveResult?.error;
    const aliasTargetPath = isAlias(node.$value)
      ? String(node.$value).slice(1, -1)
      : null;
    const isFavorite = starredPaths?.has(node.path) ?? false;
    const producingRecipe =
      derivedTokenPaths?.get(createRecipeOwnershipKey(setName, node.path)) ??
      null;
    const isRowActive =
      isSelected || rovingFocusPath === node.path || isPreviewed;
    const isThemeLensVariant = themeLensEnabled && modeVariantPaths?.has(node.path);
    const rowStateClass = isHighlighted
      ? "bg-[var(--color-figma-accent)]/15 ring-1 ring-inset ring-[var(--color-figma-accent)]/40"
      : isSelected && selectMode
        ? "bg-[var(--color-figma-accent)]/10"
        : isPreviewed
          ? "bg-[var(--color-figma-accent)]/8"
          : "";
    const themeLensClass = isThemeLensVariant
      ? "border-l-2 border-l-[var(--color-figma-accent)]"
      : "";
    const duplicateCount = showDuplicatesFilter
      ? (duplicateCounts.get(stableStringify(node.$value)) ?? 0)
      : 0;

    // Enriched resolution chain with per-hop set/theme metadata (for debugger view)
    const resolutionSteps: ResolutionStep[] | null = useMemo(() => {
      if (!isAlias(node.$value)) return null;
      return buildResolutionChain(
        node.path,
        node.$value,
        node.$type || "unknown",
        allTokensFlat,
        pathToSet,
      );
    }, [
      node.path,
      node.$value,
      node.$type,
      allTokensFlat,
      pathToSet,
    ]);

    const commitInlineValueChange = useCallback(
      (
        nextValue: unknown,
        previousState?: { type?: string; value: unknown },
        afterSave?: () => void,
      ) => {
        onInlineSave?.(node.path, node.$type!, nextValue, previousState);
        afterSave?.();
      },
      [node.$type, node.path, onInlineSave],
    );

    const requestInlineValueSave = useCallback(
      (
        nextValue: unknown,
        previousState?: { type?: string; value: unknown },
        afterSave?: () => void,
      ) => {
        if (!producingRecipe) {
          commitInlineValueChange(nextValue, previousState, afterSave);
          return;
        }
        setPendingGeneratedSave({ nextValue, previousState, afterSave });
        setShowGeneratedEditWarning(true);
      },
      [commitInlineValueChange, producingRecipe],
    );

    // Inline quick-edit eligibility
    const canInlineEdit =
      !isAlias(node.$value) &&
      !!node.$type &&
      INLINE_SIMPLE_TYPES.has(node.$type) &&
      !!onInlineSave;

    // Complex type or alias — eligible for the inline value popover
    const canInlinePopover =
      !!onInlineSave &&
      !!node.$type &&
      (INLINE_POPOVER_TYPES.has(node.$type) || isAlias(node.$value)) &&
      !canInlineEdit;

    // Keep stable refs up-to-date for the tab-edit effect
    nodeDataRef.current = node;
    canInlineEditRef.current = canInlineEdit;
    clearPendingTabEditRef.current = clearPendingTabEdit;

    // Nearby token match for inline editing nudge
    const nearbyMatches = useNearbyTokenMatch(
      node.$value,
      node.$type || "",
      allTokensFlat,
      node.path,
      !isAlias(node.$value) && inlineNudgeVisible,
    );

    const handleInlineSubmit = useCallback(() => {
      if (!inlineEditActive) return;
      const raw = inlineEditValue.trim();
      if (!raw || raw === getEditableString(node.$type, node.$value)) {
        setInlineEditActive(false);
        return;
      }
      const parsed = parseInlineValue(node.$type!, raw);
      if (parsed === null) {
        setInlineEditError(getInlineValueError(node.$type!));
        return;
      }
      setInlineEditError(null);
      setInlineEditActive(false);
      requestInlineValueSave(
        parsed,
        {
          type: node.$type,
          value: node.$value,
        },
        () => {
          setInlineNudgeVisible(true);
        },
      );
    }, [inlineEditActive, inlineEditValue, node, requestInlineValueSave]);

    const cancelInlineEdit = useCallback(() => {
      inlineEditEscapedRef.current = true;
      setInlineEditError(null);
      setInlineEditActive(false);
    }, []);

    // Tab from an inline-edit cell: save current value (if valid) then navigate to next/prev token
    const handleInlineTabToNext = useCallback(
      (shiftKey: boolean) => {
        if (inlineEditActive && node.$type) {
          const raw = inlineEditValue.trim();
          if (raw && raw !== getEditableString(node.$type, node.$value)) {
            const parsed = parseInlineValue(node.$type, raw);
            if (parsed === null) {
              // Invalid value — show error and stay in this editor instead of silently dropping the edit
              setInlineEditError(getInlineValueError(node.$type));
              return;
            }
            requestInlineValueSave(parsed, {
              type: node.$type,
              value: node.$value,
            });
          }
        }
        setInlineEditError(null);
        inlineEditEscapedRef.current = true; // block onBlur from double-saving
        setInlineEditActive(false);
        onTabToNext(node.path, null, shiftKey ? -1 : 1);
      },
      [inlineEditActive, inlineEditValue, node, onTabToNext, requestInlineValueSave],
    );

    // Stepper helpers for number/dimension/fontWeight/duration inline editing
    const isNumericInlineType =
      node.$type === "number" ||
      node.$type === "dimension" ||
      node.$type === "fontWeight" ||
      node.$type === "duration";
    const dimParts =
      node.$type === "dimension" && inlineEditActive
        ? (inlineEditValue.trim().match(/^(-?\d*\.?\d+)\s*([a-zA-Z%]*)$/) ??
          null)
        : null;
    const stepInlineValue = useCallback(
      (delta: number) => {
        if (node.$type === "dimension") {
          const m = inlineEditValue
            .trim()
            .match(/^(-?\d*\.?\d+)\s*([a-zA-Z%]*)$/);
          if (m)
            setInlineEditValue(
              `${Math.round((parseFloat(m[1]) + delta) * 100) / 100}${m[2] || "px"}`,
            );
        } else {
          const n = parseFloat(inlineEditValue);
          if (!isNaN(n))
            setInlineEditValue(String(Math.round((n + delta) * 100) / 100));
        }
      },
      [node.$type, inlineEditValue],
    );

    // Sync state indicator
    const syncChanged =
      syncSnapshot &&
      node.path in syncSnapshot &&
      syncSnapshot[node.path] !== stableStringify(node.$value);
    const tokenStatus = getTokenRowStatus({
      lintViolations,
      quickBound,
      syncChanged: !!syncChanged,
      duplicateCount,
    });

    const handleCopyPath = useCallback(() => {
      navigator.clipboard
        .writeText(node.path)
        .catch((e) => console.warn("[clipboard] write failed:", e));
      setCopiedWhat("path");
      setTimeout(() => setCopiedWhat(null), 1500);
    }, [node.path]);

    const handleCopyValue = useCallback(() => {
      const val =
        typeof displayValue === "string"
          ? displayValue
          : JSON.stringify(displayValue);
      navigator.clipboard
        .writeText(val)
        .catch((e) => console.warn("[clipboard] write failed:", e));
      setCopiedWhat("value");
      setTimeout(() => setCopiedWhat(null), 1500);
    }, [displayValue]);

    const presentationEntry = allTokensFlat[node.path] ?? node;
    const presentationMetadata = readTokenPresentationMetadata(
      presentationEntry,
    );
    const scopeSummary = node.$type
      ? summarizeTokenScopes(node.$type, presentationMetadata.scopes)
      : null;
    const provenanceLabel = getTokenProvenanceLabel(
      presentationMetadata.provenance,
    );
    const lifecycleLabel = getLifecycleLabel(presentationMetadata.lifecycle);
    const incomingRefs = useMemo(
      () => getIncomingRefs(node.path, allTokensFlat),
      [node.path, allTokensFlat],
    );
    const openRefsPopover = useCallback(() => {
      const rect = nodeRef.current?.getBoundingClientRect();
      setRefsPopover({
        refs: incomingRefs,
        pos: rect
          ? {
              x: Math.min(rect.right + 4, window.innerWidth - 244),
              y: Math.min(rect.top, window.innerHeight - 240),
            }
          : { x: 100, y: 100 },
      });
    }, [incomingRefs]);
    const leafMetadataSegments: RowMetadataSegment[] = [];
    if (producingRecipe) {
      leafMetadataSegments.push({
        label: `Generated by ${producingRecipe.name}`,
        title: formatRecipeSummaryTitle(producingRecipe),
        tone: producingRecipe.isStale ? "warning" : "default",
        onClick: onOpenRecipeEditor
          ? () =>
              onOpenRecipeEditor({
                mode: "edit",
                id: producingRecipe.id,
              })
          : undefined,
      });
    } else if (aliasTargetPath) {
      leafMetadataSegments.push({
        label: `Alias of ${compactTokenPath(aliasTargetPath)}`,
        title: isBrokenAlias
          ? `Broken alias reference: ${resolveResult?.error ?? "Unknown error"}`
          : `Alias reference to ${aliasTargetPath}\nClick to navigate`,
        tone: isBrokenAlias ? "danger" : "accent",
        onClick:
          !isBrokenAlias && onNavigateToAlias
            ? () => onNavigateToAlias(aliasTargetPath, node.path)
            : undefined,
      });
    } else if (presentationMetadata.extendsPath) {
      leafMetadataSegments.push({
        label: `Extends ${compactTokenPath(presentationMetadata.extendsPath)}`,
        title: `Base token for this value: ${presentationMetadata.extendsPath}`,
        onClick: onNavigateToAlias
          ? () => onNavigateToAlias(presentationMetadata.extendsPath!, node.path)
          : undefined,
      });
    }
    if (scopeSummary) {
      leafMetadataSegments.push({
        label: `Scopes: ${scopeSummary}`,
        title: `Figma variable scopes: ${presentationMetadata.scopes.join(", ")}`,
      });
    }
    if (incomingRefs.length > 0) {
      leafMetadataSegments.push({
        label:
          incomingRefs.length === 1
            ? "Referenced by 1 token"
            : `Referenced by ${incomingRefs.length} tokens`,
        title: incomingRefs.join("\n"),
        onClick: openRefsPopover,
      });
    }
    if (provenanceLabel) {
      leafMetadataSegments.push({
        label: `Origin: ${provenanceLabel}`,
        title: provenanceLabel,
      });
    }
    const missingModeCount = tokenModeMissing?.get(node.path);
    if (missingModeCount && missingModeCount > 0) {
      leafMetadataSegments.push({
        label: `${missingModeCount} mode value${missingModeCount === 1 ? "" : "s"} missing`,
        title: `${missingModeCount} mode value${missingModeCount === 1 ? "" : "s"} still need authoring`,
        tone: "warning",
      });
    } else if (modeVariantPaths?.has(node.path) && !multiModeValues) {
      leafMetadataSegments.push({
        label: "Theme overrides",
        title: "Has per-theme-option overrides",
        tone: "accent",
      });
    }
    if (lifecycleLabel) {
      leafMetadataSegments.push({
        label: lifecycleLabel,
        tone:
          presentationMetadata.lifecycle === "draft" ? "warning" : "default",
      });
    }

    const applyWithProperty = useCallback(
      (property: BindableProperty) => {
        if (node.$value === undefined) return;
        const resolved = resolveTokenValue(
          node.$value,
          node.$type || "unknown",
          allTokensFlat,
        );
        if (resolved.error) {
          dispatchToast(`Cannot apply: ${resolved.error}`, "error");
          return;
        }
        parent.postMessage(
          {
            pluginMessage: {
              type: "apply-to-selection",
              tokenPath: node.path,
              tokenType: resolved.$type,
              targetProperty: property,
              resolvedValue: resolved.value,
            },
          },
          "*",
        );
        setShowPicker(false);
      },
      [node.$value, node.$type, node.path, allTokensFlat],
    );

    const confirmTokenRename = useCallback(() => {
      const newName = renameTokenVal.trim();
      if (!newName) {
        setRenameTokenError("Name cannot be empty");
        return;
      }
      if (newName === node.name) {
        setRenamingToken(false);
        setRenameTokenError("");
        return;
      }
      const parentPath = nodeParentPath(node.path, node.name);
      const newPath = parentPath ? `${parentPath}.${newName}` : newName;
      // Check for conflict: a token already exists at the target path
      if (allTokensFlat[newPath]) {
        setRenameTokenError(`A token named '${newName}' already exists here`);
        return;
      }
      setRenamingToken(false);
      setRenameTokenError("");
      onRenameToken?.(node.path, newPath);
    }, [renameTokenVal, node.name, node.path, allTokensFlat, onRenameToken]);

    const cancelTokenRename = useCallback(() => {
      setRenamingToken(false);
      setRenameTokenError("");
    }, []);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      setContextMenuPos(clampMenuPosition(e.clientX, e.clientY, 192, 420));
    }, []);

    const handleOpenTokenActions = useCallback((anchor: HTMLElement) => {
      const rect = anchor.getBoundingClientRect();
      setContextMenuPos(
        clampMenuPosition(rect.left, rect.bottom + 2, 192, 420),
      );
    }, []);

    /**
     * Apply this token to the current Figma selection from the context menu.
     * Uses the same logic as the hover apply button, but anchors the property
     * picker to the node row instead of the button.
     */
    const handleContextMenuApply = useCallback(() => {
      setContextMenuPos(null);
      if (!node.$type) return;

      const rect = nodeRef.current?.getBoundingClientRect();
      const anchorTop = rect ? rect.bottom + 2 : 100;
      const anchorLeft = rect ? rect.left : 0;

      // Composition tokens apply all their sub-properties at once
      if (node.$type === "composition") {
        parent.postMessage(
          {
            pluginMessage: {
              type: "apply-to-selection",
              tokenPath: node.path,
              tokenType: "composition",
              targetProperty: "composition",
              resolvedValue: resolveCompositeForApply(node, allTokensFlat),
            },
          },
          "*",
        );
        return;
      }

      const validProps = TOKEN_PROPERTY_MAP[node.$type];
      if (!validProps || validProps.length === 0) return;

      const entry = allTokensFlat[node.path];
      const targets = getQuickBindTargets(
        node.$type,
        entry?.$scopes,
        selectedNodes,
      );

      if (targets.length === 1) {
        applyWithProperty(targets[0]);
        setQuickBound(PROPERTY_LABELS[targets[0]]);
        setTimeout(() => setQuickBound(null), 1500);
        return;
      }
      if (targets.length > 1 && targets.length < validProps.length) {
        setPickerAnchor({ top: anchorTop, left: anchorLeft });
        setPickerProps(targets);
        setShowPicker(true);
        return;
      }
      if (validProps.length === 1) {
        applyWithProperty(validProps[0]);
      } else {
        setPickerAnchor({ top: anchorTop, left: anchorLeft });
        setPickerProps(null);
        setShowPicker(true);
      }
    }, [node, allTokensFlat, selectedNodes, applyWithProperty]);

    // Activate inline editing for simple types (keyboard or double-click)
    const activateInlineEdit = useCallback(() => {
      if (!canInlineEdit || !node.$type) return;
      if (node.$type === "color") {
        setPendingColor(
          typeof node.$value === "string" ? node.$value : "#000000",
        );
        setColorPickerOpen(true);
      } else {
        setInlineEditValue(getEditableString(node.$type, node.$value));
        setInlineEditError(null);
        setInlineEditActive(true);
        setInlineNudgeVisible(false);
      }
    }, [canInlineEdit, node]);

    const handleRowKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        // Enter or e: inline edit for simple types, inline popover for complex, full editor otherwise
        if (
          e.key === "Enter" ||
          (e.key === "e" && !e.metaKey && !e.ctrlKey && !e.altKey)
        ) {
          e.preventDefault();
          if (canInlineEdit) {
            activateInlineEdit();
          } else if (canInlinePopover) {
            const rect = nodeRef.current?.getBoundingClientRect();
            if (rect) {
              setInlinePopoverAnchor(rect);
              setInlinePopoverOpen(true);
            }
          } else {
            onEdit(node.path, node.name);
          }
          return;
        }

        // Space: toggle selection in select mode; open full editor otherwise
        if (e.key === " ") {
          e.preventDefault();
          if (selectMode) {
            onToggleSelect(node.path);
          } else {
            onEdit(node.path, node.name);
          }
          return;
        }

        // Delete or Backspace: delete token (skip in select mode — container handles bulk delete)
        if (
          !selectMode &&
          (e.key === "Delete" || matchesShortcut(e, "TOKEN_DELETE"))
        ) {
          e.preventDefault();
          onDelete(node.path);
          return;
        }

        // Cmd+D / Ctrl+D: duplicate token
        if (matchesShortcut(e, "TOKEN_DUPLICATE")) {
          e.preventDefault();
          onDuplicateToken?.(node.path);
          return;
        }

        // F2: rename token inline
        if (matchesShortcut(e, "TOKEN_RENAME")) {
          e.preventDefault();
          setRenameTokenVal(node.name);
          setRenamingToken(true);
          return;
        }

        // V: apply focused token to current Figma selection (same as context menu accelerator)
        if (matchesShortcut(e, "TOKEN_APPLY_SELECTION")) {
          e.preventDefault();
          handleContextMenuApply();
          return;
        }
      },
      [
        canInlineEdit,
        canInlinePopover,
        activateInlineEdit,
        onEdit,
        node.path,
        node.name,
        selectMode,
        onToggleSelect,
        onDelete,
        onDuplicateToken,
        handleContextMenuApply,
      ],
    );

    // Memoize quick bind targets for the apply button tooltip
    const quickBindTargets = useMemo(() => {
      if (!node.$type || !selectedNodes || selectedNodes.length === 0)
        return null;
      const entry = allTokensFlat[node.path];
      return getQuickBindTargets(node.$type, entry?.$scopes, selectedNodes);
    }, [node.$type, node.path, allTokensFlat, selectedNodes]);
    const reorderPos =
      dragOverReorder?.path === node.path ? dragOverReorder.position : null;

    return (
      <div ref={nodeRef}>
        <div
          role="treeitem"
          aria-level={depth + 1}
          className={`relative flex items-center ${pyClass} hover:bg-[var(--color-figma-bg-hover)] transition-colors group token-row-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-figma-accent)] ${rowStateClass} ${themeLensClass}`}
          data-roving-focus={rovingFocusPath === node.path || undefined}
          tabIndex={rovingFocusPath === node.path ? 0 : -1}
          data-token-path={node.path}
          data-node-name={node.name}
          onFocus={() => onRovingFocus(node.path)}
          draggable={!selectMode || isSelected}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("application/x-token-drag", "true");
            let dragPaths: string[];
            let dragNames: string[];
            if (
              selectMode &&
              isSelected &&
              selectedLeafNodes &&
              selectedLeafNodes.length > 0
            ) {
              dragPaths = selectedLeafNodes.map((n) => n.path);
              dragNames = selectedLeafNodes.map((n) => n.name);
            } else {
              dragPaths = [node.path];
              dragNames = [node.name];
            }
            if (dragPaths.length > 1) {
              const ghost = document.createElement("div");
              ghost.style.cssText =
                "position:fixed;top:-9999px;left:-9999px;display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;background:var(--color-figma-accent,#18a0fb);color:#fff;font-size:11px;font-weight:600;white-space:nowrap;pointer-events:none;";
              ghost.textContent = `${dragPaths.length} tokens`;
              document.body.appendChild(ghost);
              e.dataTransfer.setDragImage(ghost, -8, -8);
              requestAnimationFrame(() => document.body.removeChild(ghost));
            }
            onDragStart?.(dragPaths, dragNames);
          }}
          onDragEnd={() => onDragEnd?.()}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("application/x-token-drag"))
              return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            const rect = e.currentTarget.getBoundingClientRect();
            const pos =
              e.clientY < rect.top + rect.height / 2 ? "before" : "after";
            onDragOverToken?.(node.path, node.name, pos);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              onDragLeaveToken?.();
            }
          }}
          onDrop={(e) => {
            if (!e.dataTransfer.types.includes("application/x-token-drag"))
              return;
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            const pos =
              e.clientY < rect.top + rect.height / 2 ? "before" : "after";
            onDropOnToken?.(node.path, node.name, pos);
          }}
          onMouseEnter={() => {
            setHovered(true);
            if (inspectMode) onHoverToken?.(node.path);
          }}
          onMouseLeave={() => {
            setHovered(false);
            setShowPicker(false);
          }}
          onContextMenu={handleContextMenu}
          onKeyDown={handleRowKeyDown}
        >
          <div
            className="flex items-center gap-1.5 flex-1 min-w-0 pr-1"
            style={{ paddingLeft: `${computePaddingLeft(depth, condensedView, 14)}px` }}
          >
          <DepthBar depth={depth} />
          {/* Drag reorder indicator line */}
          {reorderPos && (
            <div
              className="absolute left-0 right-0 h-0.5 bg-[var(--color-figma-accent)] pointer-events-none z-10"
              style={reorderPos === "before" ? { top: 0 } : { bottom: 0 }}
            />
          )}
          {/* Checkbox for select mode */}
          {selectMode && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => {}} // controlled; onClick handles logic with modifier support
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(node.path, {
                  shift: e.shiftKey,
                  ctrl: e.ctrlKey || e.metaKey,
                });
              }}
              aria-label={`Select token ${node.path}`}
              className="shrink-0 cursor-pointer"
            />
          )}

          {/* Value preview (resolve aliases for display) */}
          {canInlineEdit &&
          node.$type === "color" &&
          typeof displayValue === "string" ? (
            <>
              <div className="relative shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingColor(
                      typeof node.$value === "string" ? node.$value : "#000000",
                    );
                    setColorPickerOpen(true);
                  }}
                  title={`${displayValue} — click to edit`}
                  aria-label={`Edit color: ${displayValue}`}
                  className="inline-flex items-center justify-center rounded border border-[var(--color-figma-border)] shrink-0 min-h-[24px] min-w-[24px] hover:ring-1 hover:ring-[var(--color-figma-accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)]"
                  style={{
                    backgroundColor: displayValue,
                    width: swatchSize,
                    height: swatchSize,
                  }}
                />
                {colorPickerOpen && (
                  <ColorPicker
                    value={pendingColor}
                    onChange={setPendingColor}
                    onClose={() => {
                      setColorPickerOpen(false);
                      if (pendingColor !== node.$value) {
                        requestInlineValueSave(pendingColor, {
                          type: node.$type,
                          value: node.$value,
                        });
                      }
                    }}
                  />
                )}
              </div>
            </>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (canInlineEdit && node.$type && node.$type !== "color") {
                  activateInlineEdit();
                } else if (canInlinePopover) {
                  const rect = nodeRef.current?.getBoundingClientRect();
                  if (rect) {
                    setInlinePopoverAnchor(rect);
                    setInlinePopoverOpen(true);
                  }
                } else {
                  onEdit(node.path, node.name);
                }
              }}
              title={`${formatValue(node.$type, displayValue)} — click to edit`}
              aria-label={`Edit ${node.name}`}
              className={`inline-flex min-h-[24px] min-w-[24px] items-center justify-center shrink-0 rounded cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)] transition-shadow hover:ring-1 hover:ring-[var(--color-figma-accent)]/50`}
            >
              <ValuePreview
                type={node.$type}
                value={displayValue}
                size={swatchSize}
              />
            </button>
          )}

          {/* Name and info — single-click opens editor (non-select mode) */}
          {/* ctrl/cmd-click enters select mode; shift-click range-selects */}
          <div
            title={[
              formatDisplayPath(node.path, node.name),
              node.$type ? `Type: ${node.$type}` : null,
              `Value: ${formatValue(node.$type, displayValue)}`,
              node.$description ? `Description: ${node.$description}` : null,
            ]
              .filter(Boolean)
              .join("\n")}
            className={`shrink min-w-0${!selectMode ? " cursor-pointer" : ""}`}
            onClick={(e) => {
              if (selectMode || e.ctrlKey || e.metaKey) {
                e.stopPropagation();
                onToggleSelect(node.path, {
                  shift: e.shiftKey,
                  ctrl: e.ctrlKey || e.metaKey,
                });
                return;
              }
              e.stopPropagation();
              onEdit(node.path, node.name);
            }}
            style={selectMode ? { cursor: "pointer" } : undefined}
          >
            <div className="flex items-center gap-1 min-w-0 overflow-hidden">
              <CondensedAncestorBreadcrumb
                nodePath={node.path}
                nodeName={node.name}
                depth={depth}
                condensedView={condensedView}
              />
              {renamingToken ? (
                <div
                  className="flex flex-col gap-0.5 flex-1 min-w-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1">
                    <input
                      ref={renameTokenInputRef}
                      value={renameTokenVal}
                      onChange={(e) => {
                        setRenameTokenVal(e.target.value);
                        setRenameTokenError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          confirmTokenRename();
                        }
                        if (e.key === "Escape") {
                          e.stopPropagation();
                          cancelTokenRename();
                        }
                      }}
                      aria-label="Rename token"
                      className={`flex-1 text-[11px] text-[var(--color-figma-text)] bg-[var(--color-figma-bg)] border rounded px-1 outline-none min-w-0 focus-visible:border-[var(--color-figma-accent)] ${renameTokenError ? "border-[var(--color-figma-error)]" : "border-[var(--color-figma-border)]"}`}
                    />
                    <button
                      onClick={confirmTokenRename}
                      disabled={!renameTokenVal.trim()}
                      className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 shrink-0"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelTokenRename}
                      className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                  {renameTokenError && (
                    <p
                      role="alert"
                      className="text-[10px] text-[var(--color-figma-error)]"
                    >
                      {renameTokenError}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 flex-col">
                  <span
                    className="min-w-0 truncate text-[11px] text-[var(--color-figma-text)]"
                    title={formatDisplayPath(node.path, node.name)}
                  >
                    {highlightMatch(
                      showFullPath
                        ? formatDisplayPath(node.path, node.name)
                        : node.name,
                      searchHighlight?.nameTerms ?? [],
                    )}
                  </span>
                  {(ancestorPathLabel || leafMetadataSegments.length > 0) && (
                    <div className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden text-[9px]">
                      {ancestorPathLabel && (
                        <span
                          className="truncate text-[var(--color-figma-text-tertiary)]"
                          title={`In ${ancestorPathLabel}`}
                        >
                          In {ancestorPathLabel}
                        </span>
                      )}
                      {leafMetadataSegments.length > 0 &&
                        renderRowMetadataSegments(leafMetadataSegments)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Value text (hidden when multi-mode columns are shown) */}
          {!(multiModeValues && multiModeValues.length > 0) &&
            (canInlineEdit && node.$type === "boolean" && inlineEditActive ? (
              <div
                ref={booleanInlineEditRef}
                tabIndex={-1}
                className="flex items-center gap-1 shrink-0 rounded border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)] p-0.5"
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  if (inlineEditEscapedRef.current) {
                    inlineEditEscapedRef.current = false;
                    return;
                  }
                  if (
                    e.relatedTarget instanceof Node &&
                    e.currentTarget.contains(e.relatedTarget)
                  )
                    return;
                  handleInlineSubmit();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleInlineSubmit();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    cancelInlineEdit();
                  }
                  if (e.key === "Tab") {
                    e.preventDefault();
                    handleInlineTabToNext(e.shiftKey);
                  }
                  e.stopPropagation();
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setInlineEditValue("true");
                    setInlineEditError(null);
                  }}
                  className={`rounded px-1.5 py-0.5 text-[10px] leading-none transition-colors ${inlineEditValue === "true" ? "bg-[var(--color-figma-accent)] text-white" : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"}`}
                  aria-pressed={inlineEditValue === "true"}
                >
                  true
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInlineEditValue("false");
                    setInlineEditError(null);
                  }}
                  className={`rounded px-1.5 py-0.5 text-[10px] leading-none transition-colors ${inlineEditValue === "false" ? "bg-[var(--color-figma-accent)] text-white" : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"}`}
                  aria-pressed={inlineEditValue === "false"}
                >
                  false
                </button>
              </div>
            ) : canInlineEdit && node.$type === "boolean" ? (
              <span
                className="text-[11px] text-[var(--color-figma-text-secondary)] shrink-0 max-w-[96px] truncate"
                title="Double-click to edit"
              >
                {highlightMatch(
                  formatValue(node.$type, displayValue),
                  searchHighlight?.valueTerms ?? [],
                )}
              </span>
            ) : canInlineEdit && node.$type !== "color" && inlineEditActive ? (
              isNumericInlineType ? (
                <div
                  className="flex items-center shrink-0 gap-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      stepInlineValue(-1);
                    }}
                    tabIndex={-1}
                    title="Decrement"
                    aria-label="Decrement value"
                    className="w-4 h-5 flex items-center justify-center rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] text-[11px] font-medium leading-none select-none shrink-0"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={
                      node.$type === "dimension"
                        ? dimParts
                          ? dimParts[1]
                          : inlineEditValue
                        : inlineEditValue
                    }
                    onChange={(e) => {
                      setInlineEditError(null);
                      if (node.$type === "dimension") {
                        const unit = dimParts ? dimParts[2] || "px" : "px";
                        setInlineEditValue(`${e.target.value}${unit}`);
                      } else {
                        setInlineEditValue(e.target.value);
                      }
                    }}
                    onBlur={() => {
                      if (inlineEditEscapedRef.current) {
                        inlineEditEscapedRef.current = false;
                        return;
                      }
                      handleInlineSubmit();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleInlineSubmit();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        cancelInlineEdit();
                      }
                      if (e.key === "Tab") {
                        e.preventDefault();
                        handleInlineTabToNext(e.shiftKey);
                        return;
                      }
                      e.stopPropagation();
                    }}
                    aria-label="Token value"
                    autoFocus
                    className="text-[11px] text-[var(--color-figma-text)] w-[52px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] rounded px-1 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  {node.$type === "dimension" && dimParts && dimParts[2] && (
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">
                      {dimParts[2]}
                    </span>
                  )}
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      stepInlineValue(1);
                    }}
                    tabIndex={-1}
                    title="Increment"
                    aria-label="Increment value"
                    className="w-4 h-5 flex items-center justify-center rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] text-[11px] font-medium leading-none select-none shrink-0"
                  >
                    +
                  </button>
                </div>
              ) : (
                <div
                  className="relative shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    value={inlineEditValue}
                    onChange={(e) => {
                      setInlineEditValue(e.target.value);
                      setInlineEditError(null);
                    }}
                    onBlur={() => {
                      if (inlineEditEscapedRef.current) {
                        inlineEditEscapedRef.current = false;
                        return;
                      }
                      handleInlineSubmit();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleInlineSubmit();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        cancelInlineEdit();
                      }
                      if (e.key === "Tab") {
                        e.preventDefault();
                        handleInlineTabToNext(e.shiftKey);
                        return;
                      }
                      e.stopPropagation();
                    }}
                    aria-label="Token value"
                    aria-invalid={inlineEditError ? "true" : undefined}
                    autoFocus
                    className={`text-[11px] text-[var(--color-figma-text)] w-[96px] bg-[var(--color-figma-bg)] border rounded px-1 outline-none ${inlineEditError ? "border-[var(--color-figma-error)] focus:border-[var(--color-figma-error)]" : "border-[var(--color-figma-accent)]"}`}
                  />
                  {inlineEditError && (
                    <div
                      role="alert"
                      className="absolute top-full left-0 mt-0.5 z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-error)] rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-error)] whitespace-nowrap shadow-sm pointer-events-none"
                    >
                      {inlineEditError}
                    </div>
                  )}
                </div>
              )
            ) : isAlias(node.$value) &&
              !isBrokenAlias &&
              !showResolvedValues ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (aliasTargetPath) {
                    onNavigateToAlias?.(aliasTargetPath, node.path);
                  }
                }}
                className="inline-flex min-w-0 shrink-0 items-center gap-1 text-[11px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
                title={`${(node.$value as string).slice(1, -1)} → ${formatValue(node.$type, displayValue)}`}
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
                  className="shrink-0"
                >
                  <path d="M7 17 17 7" />
                  <path d="M8 7h9v9" />
                </svg>
                <span className="truncate max-w-[84px]">
                {highlightMatch(
                  formatValue(node.$type, displayValue),
                  searchHighlight?.valueTerms ?? [],
                )}
                </span>
              </button>
            ) : canInlineEdit && node.$type !== "color" ? (
              <span
                className="text-[11px] text-[var(--color-figma-text-secondary)] shrink-0 max-w-[96px] truncate cursor-text hover:underline hover:decoration-dotted hover:text-[var(--color-figma-text)]"
                title="Click to edit"
                onClick={(e) => {
                  e.stopPropagation();
                  setInlineEditValue(
                    getEditableString(node.$type, node.$value),
                  );
                  setInlineEditError(null);
                  setInlineEditActive(true);
                  setInlineNudgeVisible(false);
                }}
              >
                {highlightMatch(
                  formatValue(node.$type, displayValue),
                  searchHighlight?.valueTerms ?? [],
                )}
              </span>
            ) : canInlineEdit && node.$type === "color" ? (
              <span
                className="text-[11px] text-[var(--color-figma-text-secondary)] shrink-0 max-w-[96px] truncate cursor-pointer hover:underline hover:decoration-dotted hover:text-[var(--color-figma-text)]"
                title="Click to edit color"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingColor(
                    typeof node.$value === "string" ? node.$value : "#000000",
                  );
                  setColorPickerOpen(true);
                }}
              >
                {highlightMatch(
                  formatValue(node.$type, displayValue),
                  searchHighlight?.valueTerms ?? [],
                )}
              </span>
            ) : (
              <span
                className="text-[11px] text-[var(--color-figma-text-secondary)] shrink-0 max-w-[96px] truncate"
                title={formatValue(node.$type, displayValue)}
              >
                {highlightMatch(
                  formatValue(node.$type, displayValue),
                  searchHighlight?.valueTerms ?? [],
                )}
              </span>
            ))}
          {tokenStatus &&
            (tokenStatus.kind === "lint" ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onPreview) onPreview(node.path, node.name);
                  else onEdit(node.path, node.name);
                }}
                title={tokenStatus.title}
                className={`shrink-0 inline-flex items-center justify-center w-4 h-4 rounded ${tokenStatus.toneClass} ${isRowActive ? "opacity-100" : "opacity-60 group-hover:opacity-100"}`}
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
                </svg>
              </button>
            ) : (
              <span
                className={`shrink-0 inline-flex items-center justify-center w-4 h-4 rounded ${tokenStatus.toneClass}`}
                title={tokenStatus.title}
              >
                {tokenStatus.kind === "applied" ? (
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    aria-hidden="true"
                  >
                    <path
                      d="M20 6L9 17l-5-5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : tokenStatus.kind === "sync" ? (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-current"
                    aria-hidden="true"
                  />
                ) : (
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
                  >
                    <rect x="9" y="9" width="10" height="10" rx="2" />
                    <path d="M5 15V7a2 2 0 0 1 2-2h8" />
                  </svg>
                )}
              </span>
            ))}
          {/* Passive favorite indicator — always visible when starred */}
          {isFavorite && (
            <span
              className="shrink-0 text-[var(--color-figma-warning)] ml-0.5"
              title="Favorited"
              aria-label="Favorited"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </span>
          )}
          {!selectMode && (
            <div
              className={`flex items-center gap-0.5 shrink-0 ml-1 ${isRowActive ? "opacity-100" : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto"} transition-opacity`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenTokenActions(e.currentTarget);
                }}
                title="More token actions"
                aria-label="More token actions"
                aria-haspopup="menu"
                aria-expanded={!!contextMenuPos}
                className="p-1.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
              </button>
            </div>
          )}

          {/* Property picker dropdown */}
          {showPicker && node.$type && TOKEN_PROPERTY_MAP[node.$type] && (
            <PropertyPicker
              properties={pickerProps || TOKEN_PROPERTY_MAP[node.$type]}
              capabilities={pickerProps ? null : selectionCapabilities}
              onSelect={applyWithProperty}
              onClose={() => {
                setShowPicker(false);
                setPickerProps(null);
              }}
              anchorRect={pickerAnchor}
            />
          )}

          {/* Right-click context menu — tiered with "More..." expander */}
          {contextMenuPos && (
            <div
              ref={tokenMenuRef}
              data-context-menu="token"
              role="menu"
              className={`${MENU_SURFACE_CLASS} min-w-[192px] max-h-[80vh] overflow-y-auto`}
              style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
              onClick={(e) => e.stopPropagation()}
            >
              {!tokenMenuAdvanced ? (
                <>
                  {/* Section 1: Primary */}
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { closeTokenMenus(); onEdit(node.path, node.name); }}
                    className={MENU_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    <span className="flex-1">Edit</span>
                  </button>
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    data-accel="r"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { closeTokenMenus(); setRenameTokenVal(node.name); setRenamingToken(true); }}
                    className={MENU_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                    <span className="flex-1">Rename</span>
                    <span className={MENU_SHORTCUT_CLASS}>F2</span>
                  </button>
                  {onDuplicateToken && (
                    <button
                      role="menuitem"
                      tabIndex={-1}
                      data-accel="d"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { closeTokenMenus(); onDuplicateToken(node.path); }}
                      className={MENU_ITEM_CLASS}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                      <span className="flex-1">Duplicate</span>
                      <span className={MENU_SHORTCUT_CLASS}>D</span>
                    </button>
                  )}
                  <div role="separator" className={MENU_SEPARATOR_CLASS} />
                  {/* Section 2: Clipboard & Apply */}
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    data-accel="c"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { handleCopyPath(); closeTokenMenus(); }}
                    className={MENU_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                    <span className="flex-1">Copy path</span>
                    <span className={MENU_SHORTCUT_CLASS}>C</span>
                  </button>
                  {!selectMode &&
                    node.$type &&
                    (TOKEN_PROPERTY_MAP[node.$type]?.length > 0 ||
                      node.$type === "composition") &&
                    selectedNodes.length > 0 && (
                      <button
                        role="menuitem"
                        tabIndex={-1}
                        data-accel="v"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={handleContextMenuApply}
                        className={MENU_ITEM_CLASS}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                        <span className="flex-1">Apply to selection</span>
                        {quickBindTargets?.length === 1 && (
                          <span className={MENU_SHORTCUT_CLASS}>{PROPERTY_LABELS[quickBindTargets[0]]}</span>
                        )}
                      </button>
                    )}
                  <div role="separator" className={MENU_SEPARATOR_CLASS} />
                  {/* Section: Danger */}
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    data-accel="delete"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { closeTokenMenus(); onDelete(node.path); }}
                    className={MENU_DANGER_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    <span className="flex-1">Delete</span>
                    <span className={MENU_SHORTCUT_CLASS}>⌫</span>
                  </button>
                  <div role="separator" className={MENU_SEPARATOR_CLASS} />
                  {/* More... expander */}
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setTokenMenuAdvanced(true)}
                    className={MENU_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
                    <span className="flex-1">More...</span>
                  </button>
                </>
              ) : (
                <>
                  {/* Advanced section — Back button */}
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setTokenMenuAdvanced(false)}
                    className={MENU_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                    <span className="flex-1">Back</span>
                  </button>
                  <div role="separator" className={MENU_SEPARATOR_CLASS} />
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { handleCopyValue(); closeTokenMenus(); }}
                    className={MENU_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M20 6L9 17l-5-5" /></svg>
                    <span className="flex-1">Copy value</span>
                  </button>
                  {onRequestMoveToken && (
                    <button
                      role="menuitem"
                      tabIndex={-1}
                      data-accel="m"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { closeTokenMenus(); onRequestMoveToken(node.path); }}
                      className={MENU_ITEM_CLASS}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><path d="M12 11v6M9 14l3-3 3 3" /></svg>
                      <span className="flex-1">Move to set</span>
                      <span className={MENU_SHORTCUT_CLASS}>M</span>
                    </button>
                  )}
                  {onRequestCopyToken && (
                    <button
                      role="menuitem"
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { closeTokenMenus(); onRequestCopyToken(node.path); }}
                      className={MENU_ITEM_CLASS}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><path d="M12 11v6M9 17h6" /></svg>
                      <span className="flex-1">Copy to set</span>
                    </button>
                  )}
                  {!isAlias(node.$value) && onExtractToAlias && (
                    <button
                      role="menuitem"
                      tabIndex={-1}
                      data-accel="e"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { closeTokenMenus(); onExtractToAlias(node.path, node.$type, node.$value); }}
                      className={MENU_ITEM_CLASS}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                      <span className="flex-1">Extract to alias</span>
                      <span className={MENU_SHORTCUT_CLASS}>E</span>
                    </button>
                  )}
                  {!isAlias(node.$value) && quickRecipeType && onOpenRecipeEditor && (
                    <button
                      role="menuitem"
                      tabIndex={-1}
                      data-accel="g"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={openQuickRecipe}
                      className={MENU_ITEM_CLASS}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" /></svg>
                      <span className="flex-1">Create recipe from this token</span>
                      <span className={MENU_SHORTCUT_CLASS}>G</span>
                    </button>
                  )}
                  {producingRecipe && onDetachFromRecipe && (
                    <button
                      role="menuitem"
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { closeTokenMenus(); setShowDetachTokenConfirm(true); }}
                      className={MENU_ITEM_CLASS}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                      <span className="flex-1">Detach from recipe</span>
                    </button>
                  )}
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      closeTokenMenus();
                      openRefsPopover();
                    }}
                    className={MENU_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                    <span className="flex-1">Find references</span>
                  </button>
                  {onCompareAcrossThemes && (
                    <button
                      role="menuitem"
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { closeTokenMenus(); onCompareAcrossThemes(node.path); }}
                      className={MENU_ITEM_CLASS}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><rect x="3" y="3" width="7" height="18" rx="1" /><rect x="14" y="3" width="7" height="18" rx="1" /></svg>
                      <span className="flex-1">Compare across modes</span>
                    </button>
                  )}
                  {onViewTokenHistory && (
                    <button
                      role="menuitem"
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { closeTokenMenus(); onViewTokenHistory(node.path); }}
                      className={MENU_ITEM_CLASS}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                      <span className="flex-1">View history</span>
                    </button>
                  )}
                  {node.$type && onFilterByType && (
                    <button
                      role="menuitem"
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { closeTokenMenus(); onFilterByType(node.$type!); }}
                      className={MENU_ITEM_CLASS}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                      <span className="flex-1">Filter by type: {node.$type}</span>
                    </button>
                  )}
                  {onToggleStar && (
                    <button
                      role="menuitem"
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { closeTokenMenus(); onToggleStar(node.path); }}
                      className={MENU_ITEM_CLASS}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${isFavorite ? "text-[var(--color-figma-warning)]" : "opacity-60"}`}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                      <span className="flex-1">{isFavorite ? "Remove favorite" : "Add to favorites"}</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Inline alias picker popover — opened via "Link to token…" context menu item */}
          {aliasPickerOpen && (
            <div
              className="fixed z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg p-2 w-64"
              style={{ top: aliasPickerPos.y, left: aliasPickerPos.x }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-1.5 text-[9px] text-[var(--color-figma-text-tertiary)]">
                Link{" "}
                <span className="font-mono normal-case text-[var(--color-figma-text)]">
                  {node.name}
                </span>{" "}
                to…
              </div>
              <div className="relative">
                <input
                  autoFocus
                  type="text"
                  value={aliasQuery}
                  onChange={(e) => setAliasQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setAliasPickerOpen(false);
                    }
                  }}
                  className="w-full border border-[var(--color-figma-border)] rounded px-2 py-1 text-[11px] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-tertiary)]"
                  placeholder="Search tokens…"
                />
                <AliasAutocomplete
                  query={aliasQuery}
                  allTokensFlat={allTokensFlat}
                  pathToSet={pathToSet}
                  filterType={node.$type}
                  onSelect={(path) => {
                    requestInlineValueSave(
                      `{${path}}`,
                      {
                        type: node.$type,
                        value: node.$value,
                      },
                    );
                    setAliasPickerOpen(false);
                  }}
                  onClose={() => setAliasPickerOpen(false)}
                />
              </div>
            </div>
          )}

          {/* Reverse-reference popover — shows tokens that alias this one */}
          {refsPopover && (
            <div
              ref={refsPopoverRef}
              className="fixed z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg w-60 overflow-hidden"
              style={{ top: refsPopover.pos.y, left: refsPopover.pos.x }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-figma-border)]">
                <span className="text-[11px] font-medium text-[var(--color-figma-text)]">
                  {refsPopover.refs.length === 0
                    ? "No references"
                    : `${refsPopover.refs.length} reference${refsPopover.refs.length !== 1 ? "s" : ""}`}
                </span>
                <button
                  onClick={() => setRefsPopover(null)}
                  className="p-0.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-tertiary)]"
                  aria-label="Close"
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {refsPopover.refs.length === 0 ? (
                <div className="px-3 py-3 text-[11px] text-[var(--color-figma-text-tertiary)] text-center">
                  No tokens reference this one
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  {refsPopover.refs.map((refPath) => {
                    const setLabel = pathToSet?.[refPath];
                    return (
                      <button
                        key={refPath}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                        onClick={() => {
                          setRefsPopover(null);
                          onNavigateToAlias?.(refPath, node.path);
                        }}
                      >
                        <span className="text-[11px] text-[var(--color-figma-text)] truncate flex-1 min-w-0">
                          {refPath}
                        </span>
                        {setLabel && setLabel !== setName && (
                          <span
                            className={`shrink-0 ${BADGE_TEXT_CLASS} text-[var(--color-figma-text-tertiary)] px-1 py-px bg-[var(--color-figma-bg-secondary)] rounded`}
                          >
                            {setLabel}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {showGeneratedEditWarning && producingRecipe && pendingGeneratedSave && (
            <ConfirmModal
              title="Edit Managed Token?"
              description={`"${node.path}" is managed by "${producingRecipe.name}". This manual change will be overwritten the next time the recipe runs unless you detach the token first.`}
              confirmLabel="Save anyway"
              onCancel={() => {
                setShowGeneratedEditWarning(false);
                setPendingGeneratedSave(null);
              }}
              onConfirm={async () => {
                commitInlineValueChange(
                  pendingGeneratedSave.nextValue,
                  pendingGeneratedSave.previousState,
                  pendingGeneratedSave.afterSave,
                );
                setShowGeneratedEditWarning(false);
                setPendingGeneratedSave(null);
              }}
            >
              <div className="mt-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-2 text-[10px] text-[var(--color-figma-text-secondary)]">
                Use <span className="font-medium text-[var(--color-figma-text)]">Detach from recipe</span> in the token actions menu if you want this token to become independently editable.
              </div>
            </ConfirmModal>
          )}

          {showDetachTokenConfirm && producingRecipe && onDetachFromRecipe && (
            <ConfirmModal
              title="Detach Token?"
              description={`Convert "${node.path}" to manual. "${producingRecipe.name}" will stop updating it.`}
              confirmLabel="Detach token"
              onCancel={() => setShowDetachTokenConfirm(false)}
              onConfirm={async () => {
                await onDetachFromRecipe(node.path);
                setShowDetachTokenConfirm(false);
              }}
            />
          )}

          {/* Inline value popover — for complex types and alias-valued tokens */}
          {inlinePopoverOpen && inlinePopoverAnchor && node.$type && (
            <InlineValuePopover
              tokenPath={node.path}
              tokenName={node.name}
              tokenType={node.$type}
              currentValue={node.$value}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
              anchorRect={inlinePopoverAnchor}
              onSave={(newVal, previousState) => {
                requestInlineValueSave(newVal, previousState);
                setInlinePopoverOpen(false);
              }}
              onOpenFullEditor={() => {
                setInlinePopoverOpen(false);
                onEdit(node.path, node.name);
              }}
              onClose={() => setInlinePopoverOpen(false)}
            />
          )}

          {/* Complex type hover preview card */}
          {hoverPreviewVisible && node.$type && !isBrokenAlias && (
            <ComplexTypePreviewCard type={node.$type} value={displayValue} />
          )}
          </div>

          {/* Multi-mode value columns — per-theme-option resolved values */}
          {multiModeValues && multiModeValues.length > 0 && (
            <div className="flex items-center shrink-0">
              {multiModeValues.map((mv) => (
                <MultiModeCell
                  key={mv.optionName}
                  tokenPath={node.path}
                  tokenType={node.$type}
                  value={mv.resolved}
                  targetSet={mv.targetSet}
                  dimId={mv.dimId}
                  optionName={mv.optionName}
                  onSave={onMultiModeInlineSave}
                  isTabPending={
                    pendingTabEdit?.path === node.path &&
                    pendingTabEdit?.columnId === mv.optionName
                  }
                  onTabActivated={clearPendingTabEdit}
                  onTab={(dir) => onTabToNext(node.path, mv.optionName, dir)}
                  onEdit={() => onEdit(node.path, node.name)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Inline nudge — shown after saving a raw value that closely matches an existing token */}
        {inlineNudgeVisible && nearbyMatches.length > 0 && (
          <div
            className="flex items-center border-t border-[var(--color-figma-border)]"
            style={{
              paddingLeft: `${computePaddingLeft(depth, condensedView, 12)}px`,
            }}
          >
            <TokenNudge
              matches={nearbyMatches}
              tokenType={node.$type || ""}
              onAccept={(path) => {
                setInlineNudgeVisible(false);
                requestInlineValueSave(`{${path}}`, {
                  type: node.$type,
                  value: node.$value,
                });
              }}
              onDismiss={() => setInlineNudgeVisible(false)}
            />
          </div>
        )}

        {/* Resolution chain debugger — shows full alias/theme resolution pipeline */}
        {resolutionSteps && resolutionSteps.length >= 2 && chainExpanded && (
          <div
            className="flex flex-col bg-[var(--color-figma-bg-secondary)] border-t border-[var(--color-figma-border)]"
            style={{
              paddingLeft: `${computePaddingLeft(depth, condensedView, 12)}px`,
            }}
          >
            {resolutionSteps.map((step, i) => {
              const isFirst = i === 0;
              const isLast = i === resolutionSteps.length - 1;
              const isConcrete = isLast && !step.isError;
              return (
                <div
                  key={step.path + i}
                  className="flex items-center gap-1 py-0.5 px-2 min-h-[18px]"
                >
                  {/* Step connector */}
                  <div className="flex items-center gap-0.5 shrink-0 w-3 justify-center">
                    {isFirst ? (
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-figma-accent)]" />
                    ) : (
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 8 8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        className="text-[var(--color-figma-text-tertiary)]"
                        aria-hidden="true"
                      >
                        <path d="M4 0v4M1 4l3 4 3-4" />
                      </svg>
                    )}
                  </div>

                  {/* Token path — clickable to navigate */}
                  {!isFirst ? (
                    <button
                      className={`text-[10px] font-mono shrink-0 transition-colors ${step.isError ? "text-[var(--color-figma-error)]" : "text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:underline"}`}
                      onClick={() =>
                        !step.isError &&
                        onNavigateToAlias?.(step.path, node.path)
                      }
                      title={
                        step.isError
                          ? step.errorMsg
                          : `Navigate to ${step.path}`
                      }
                    >
                      {step.path}
                    </button>
                  ) : (
                    <span className="text-[10px] font-mono text-[var(--color-figma-accent)] shrink-0">
                      {step.path}
                    </span>
                  )}

                  {/* Collection context */}
                  {step.setName && (
                    <span
                      className={`${BADGE_TEXT_CLASS} text-[var(--color-figma-text-tertiary)] shrink-0`}
                    >
                      {step.setName}
                    </span>
                  )}

                  {/* Concrete resolved value on the last step */}
                  {isConcrete && step.value != null && !isAlias(step.value) && (
                    <span className="flex items-center gap-1 ml-auto shrink-0">
                      <ValuePreview
                        type={step.$type}
                        value={step.value}
                        size={12}
                      />
                      <span className="text-[10px] font-mono text-[var(--color-figma-text)] font-medium">
                        {formatValue(step.$type, step.value)}
                      </span>
                    </span>
                  )}

                  {/* Error indicator */}
                  {step.isError && (
                    <span
                      className={`${BADGE_TEXT_CLASS} text-[var(--color-figma-error)] italic`}
                    >
                      {step.errorMsg}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.node === next.node &&
      prev.isSelected === next.isSelected &&
      prev.lintViolations === next.lintViolations &&
      prev.multiModeValues === next.multiModeValues &&
      prev.isPinned === next.isPinned &&
      prev.chainExpanded === next.chainExpanded &&
      prev.depth === next.depth
    );
  },
);

// ---------------------------------------------------------------------------
// TokenTreeNode — thin dispatcher; delegates to TokenGroupNode or TokenLeafNode
// ---------------------------------------------------------------------------
export function TokenTreeNode(props: TokenTreeNodeProps) {
  if (props.node.isGroup) return <TokenGroupNode {...props} />;
  return <TokenLeafNode {...props} />;
}

export default TokenTreeNode;
