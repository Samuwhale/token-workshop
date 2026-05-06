/**
 * TokenLeafNode — renders a leaf token row with inline editing, context menu,
 * drag-and-drop, alias resolution, and multi-mode value columns.
 * Extracted from TokenTreeNode.tsx.
 */
import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useLayoutEffect,
  useMemo,
  memo,
} from "react";
import { dispatchToast } from "../../shared/toastBus";
import type { TokenTreeNodeProps } from "../tokenListTypes";
import {
  TOKEN_PROPERTY_MAP,
  PROPERTY_LABELS,
} from "../../../shared/types";
import type { BindableProperty } from "../../../shared/types";
import {
  isAlias,
  resolveTokenValue,
  buildResolutionChain,
} from "../../../shared/resolveAlias";
import type { ResolutionStep } from "../../../shared/resolveAlias";
import { stableStringify, modKey } from "../../shared/utils";
import {
  hasSyncSnapshotChange,
  resolveSyncComparableValue,
} from "../../shared/tokenSync";
import { formatDisplayPath, formatValue, nodeParentPath } from "../tokenListUtils";
import {
  highlightMatch,
  resolveCompositeForApply,
} from "../tokenListHelpers";
import { QUICK_EDITABLE_TYPES } from "../tokenListTypes";
import { InlineValuePopover } from "../InlineValuePopover";
import type { QuickEditRequest } from "./ValueCell";
import type { TokenMapEntry } from "../../../shared/types";
import { PropertyPicker } from "../PropertyPicker";
import { ValuePreview, previewIsValueBearing } from "../ValuePreview";
import { getQuickBindTargets } from "../selectionInspectorUtils";
import {
  useTokenTreeLeafActions,
  useTokenTreeLeafState,
  useTokenTreeSharedData,
} from "../TokenTreeContext";
import {
  ComplexTypePreviewCard,
  COMPLEX_PREVIEW_TYPES,
} from "../ComplexTypePreviewCard";
import { useNearbyTokenMatch } from "../../hooks/useNearbyTokenMatch";
import { TokenNudge } from "../TokenNudge";
import { matchesShortcut } from "../../shared/shortcutRegistry";
import { InlineRenameRow } from "../../primitives";
import {
  getLifecycleLabel,
  readTokenPresentationMetadata,
  scopeRestrictsType,
  summarizeTokenScopes,
} from "../../shared/tokenMetadata";
import {
  BADGE_TEXT_CLASS,
  clampMenuPosition,
  computePaddingLeft,
  DepthBar,
  getIncomingRefs,
  getTokenRowStatus,
  MENU_DANGER_ITEM_CLASS,
  MENU_ITEM_CLASS,
  MENU_SEPARATOR_CLASS,
  MENU_SHORTCUT_CLASS,
  MENU_SURFACE_CLASS,
  useContextMenuController,
} from "./tokenTreeNodeShared";
import type { MenuPosition } from "./tokenTreeNodeShared";
import type { RowMetadataSegment } from "./tokenTreeNodeUtils";
import { renderRowMetadataSegments } from "./tokenTreeNodeUtils";
import { ValueCell } from "./ValueCell";

function getTokenMenuAccelerator(event: KeyboardEvent): string {
  return event.key === "Backspace" ? "delete" : event.key.toLowerCase();
}

export const TokenLeafNode = memo(
  function TokenLeafNode(props: TokenTreeNodeProps) {
    const {
      node,
      depth,
      isSelected,
      lintViolations = [],
      skipChildren,
      showFullPath,
      ancestorPathLabel,
      chainExpanded: chainExpandedProp = false,
      onMoveUp: _onMoveUp,
      onMoveDown: _onMoveDown,
      multiModeValues,
      gridTemplate,
    } = props;

    const {
      collectionId,
      selectionCapabilities,
      groupBy,
      selectMode,
      duplicateCounts,
      highlightedToken,
      previewedPath,
      inspectMode,
      syncSnapshot,
      searchHighlight,
      selectedNodes,
      boundTokenPaths,
      dragOverReorder,
      selectedLeafNodes,
      starredPaths,
      pendingRenameToken,
      pendingTabEdit,
      rovingFocusPath,
      showDuplicatesFilter,
    } = useTokenTreeLeafState();
    const { allTokensFlat, pathToCollectionId } = useTokenTreeSharedData();
    const {
      onEdit,
      onDelete,
      onToggleSelect,
      onNavigateToAlias,
      onRequestMoveToken,
      onRequestCopyToken,
      onDuplicateToken,
      onExtractToAlias,
      onHoverToken,
      onFilterByType,
      onInlineSave,
      onRenameToken,
      onViewTokenHistory,
      onOpenTokenIssues,
      onCompareAcrossCollections,
      onDragStart,
      onDragEnd,
      onDragOverToken,
      onDragLeaveToken,
      onDropOnToken,
      onMultiModeInlineSave,
      onCopyValueToAllModes,
      onToggleStar,
      clearPendingRename,
      clearPendingTabEdit,
      onTabToNext,
      onRovingFocus,
    } = useTokenTreeLeafActions();

    const isHighlighted = highlightedToken === node.path;
    const structuralActionsEnabled = groupBy === "path";
    const isPreviewed = previewedPath === node.path;
    const [hovered, setHovered] = useState(false);
    const [hoverPreviewVisible, setHoverPreviewVisible] = useState(false);
    const [showPicker, setShowPicker] = useState(false);
    const [pickerAnchor, setPickerAnchor] = useState<
      { top: number; left: number } | undefined
    >();
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
    const [inlineNudgeVisible, setInlineNudgeVisible] = useState(false);
    const [quickBound, setQuickBound] = useState<string | null>(null);
    const [pickerProps, setPickerProps] = useState<BindableProperty[] | null>(
      null,
    );
    const [quickEditor, setQuickEditor] = useState<{
      anchor: DOMRect;
      optionName: string;
      collectionId: string;
      targetCollectionId: string | null;
      currentValue: TokenMapEntry | undefined;
    } | null>(null);
    const closeQuickEditor = useCallback(() => setQuickEditor(null), []);
    const nodeRef = useRef<HTMLDivElement>(null);

    // Token rename state
    const [renamingToken, setRenamingToken] = useState(false);
    const [renameTokenVal, setRenameTokenVal] = useState("");
    const [renameTokenError, setRenameTokenError] = useState("");
    const renameTokenInputRef = useRef<HTMLInputElement>(null);
    const tokenMenuRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
      if (renamingToken && renameTokenInputRef.current) {
        renameTokenInputRef.current.focus();
        renameTokenInputRef.current.select();
      }
    }, [renamingToken]);

    // When this token is the pending rename target (e.g. after Cmd+D duplicate), activate inline rename
    useEffect(() => {
      if (pendingRenameToken === node.path) {
        if (structuralActionsEnabled) {
          setRenameTokenVal(node.name);
          setRenamingToken(true);
        }
        clearPendingRename();
      }
    }, [
      structuralActionsEnabled,
      pendingRenameToken,
      node.path,
      node.name,
      clearPendingRename,
    ]);

    const closeTokenMenus = useCallback(() => {
      setContextMenuPos(null);
      setTokenMenuAdvanced(false);
    }, []);

    useContextMenuController({
      isOpen: contextMenuPos !== null,
      menuRef: tokenMenuRef,
      onClose: closeTokenMenus,
      getAcceleratorKey: getTokenMenuAccelerator,
    });

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
    const isFavorite = starredPaths?.has(node.path) ?? false;
    const isRowActive =
      isSelected || rovingFocusPath === node.path || isPreviewed;
    const selectionControlVisibilityClass = "opacity-100";
    const overflowActionVisibilityClass = selectMode
      ? "hidden"
      : isRowActive
        ? "opacity-100"
        : "opacity-90";
    const rowStateClass = isHighlighted
      ? "bg-[var(--color-figma-accent)]/15 ring-1 ring-inset ring-[var(--color-figma-accent)]/40"
      : isSelected
        ? "bg-[var(--color-figma-accent)]/12"
      : isPreviewed
        ? "bg-[var(--color-figma-accent)]/8"
        : "";
    const stickyCellStateClass = isHighlighted
      ? "bg-[var(--color-figma-accent)]/15"
      : isSelected
        ? "bg-[var(--color-figma-accent)]/12"
        : isPreviewed
          ? "bg-[var(--color-figma-accent)]/8"
          : "bg-[var(--color-figma-bg)] group-hover:bg-[var(--color-figma-bg-hover)]";
    // Suppressed on accent-colored row states so the edge doesn't compete with the ring/background.
    const isBoundToSelection =
      !!boundTokenPaths?.has(node.path) &&
      selectedNodes.length > 0 &&
      !isRowActive &&
      !isHighlighted;
    const boundAccentClass = isBoundToSelection
      ? "before:content-[''] before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-[var(--color-figma-accent)]"
      : "";
    const duplicateCount = showDuplicatesFilter
      ? (duplicateCounts.get(stableStringify(node.$value)) ?? 0)
      : 0;

    // Enriched resolution chain with per-hop collection/mode metadata.
    const resolutionSteps: ResolutionStep[] | null = useMemo(() => {
      if (!isAlias(node.$value)) return null;
      return buildResolutionChain(
        node.path,
        node.$value,
        node.$type || "unknown",
        allTokensFlat,
        pathToCollectionId,
      );
    }, [
      node.path,
      node.$value,
      node.$type,
      allTokensFlat,
      pathToCollectionId,
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
        commitInlineValueChange(nextValue, previousState, afterSave);
      },
      [commitInlineValueChange],
    );

    const handleMultiModeInlineSaveRequest = useCallback(
      (
        nextValue: unknown,
        targetCollectionId: string,
        collectionId: string,
        optionName: string,
        previousState?: { type?: string; value: unknown },
      ) => {
        if (!node.$type || !onMultiModeInlineSave) {
          return;
        }
        onMultiModeInlineSave(
          node.path,
          node.$type,
          nextValue,
          targetCollectionId,
          collectionId,
          optionName,
          previousState,
        );
      },
      [node.$type, node.path, onMultiModeInlineSave],
    );

    // Quick editor eligibility — every editable type + alias-valued tokens.
    const canQuickEdit =
      !!onInlineSave &&
      !!node.$type &&
      (QUICK_EDITABLE_TYPES.has(node.$type) || isAlias(node.$value));

    // Nearby token match for inline editing nudge
    const nearbyMatches = useNearbyTokenMatch(
      node.$value,
      node.$type || "",
      allTokensFlat,
      node.path,
      !isAlias(node.$value) && inlineNudgeVisible,
    );

    // Sync state indicator
    const syncChanged = hasSyncSnapshotChange(
      syncSnapshot,
      node.path,
      resolveSyncComparableValue({
        tokenPath: node.path,
        allTokensFlat,
      }),
    );
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
    }, [node.path]);

    const handleCopyValue = useCallback(() => {
      const val =
        typeof displayValue === "string"
          ? displayValue
          : JSON.stringify(displayValue);
      navigator.clipboard
        .writeText(val)
        .catch((e) => console.warn("[clipboard] write failed:", e));
    }, [displayValue]);

    const presentationEntry = allTokensFlat[node.path] ?? node;
    const presentationMetadata = readTokenPresentationMetadata(
      presentationEntry,
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
    if (incomingRefs.length > 0) {
      leafMetadataSegments.push({
        label: String(incomingRefs.length),
        title:
          incomingRefs.length === 1
            ? `Referenced by 1 token:\n${incomingRefs[0]}`
            : `Referenced by ${incomingRefs.length} tokens:\n${incomingRefs.join("\n")}`,
        priority: "detail" as const,
        onClick: openRefsPopover,
      });
    }
    if (lifecycleLabel && presentationMetadata.lifecycle !== "published") {
      leafMetadataSegments.push({
        label: lifecycleLabel,
        tone:
          presentationMetadata.lifecycle === "draft" ? "warning" : "default",
        priority: "status" as const,
      });
    }
    if (
      node.$type &&
      scopeRestrictsType(node.$type, presentationMetadata.scopes)
    ) {
      const scopeSummary = summarizeTokenScopes(
        node.$type,
        presentationMetadata.scopes,
      );
      if (scopeSummary) {
        leafMetadataSegments.push({
          label: scopeSummary,
          title: `Restricted to ${scopeSummary.replace(/\s\+\d+$/, "")}. Won't appear for other fields.`,
          priority: "detail" as const,
        });
      }
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

    // When a Tab from a sibling row targets this row, open the popover on the matching mode.
    useEffect(() => {
      if (pendingTabEdit?.path !== node.path) return;
      if (!canQuickEdit || !node.$type) return;
      const targetMv =
        multiModeValues.find((m) => m.optionName === pendingTabEdit.columnId) ??
        multiModeValues[0];
      if (!targetMv) return;
      const rect = nodeRef.current?.getBoundingClientRect();
      if (!rect) return;
      setQuickEditor({
        anchor: rect,
        optionName: targetMv.optionName,
        collectionId: targetMv.collectionId,
        targetCollectionId: targetMv.targetCollectionId,
        currentValue: targetMv.resolved,
      });
      clearPendingTabEdit();
    }, [pendingTabEdit, node.path, node.$type, canQuickEdit, multiModeValues, clearPendingTabEdit]);

    // Open the quick editor popover on the first editable mode cell.
    const openQuickEditorFirstMode = useCallback(() => {
      if (!canQuickEdit || !node.$type) return;
      const firstEditable = multiModeValues.find((mv) => mv.targetCollectionId) ?? multiModeValues[0];
      if (!firstEditable) return;
      const rect = nodeRef.current?.getBoundingClientRect();
      if (!rect) return;
      setQuickEditor({
        anchor: rect,
        optionName: firstEditable.optionName,
        collectionId: firstEditable.collectionId,
        targetCollectionId: firstEditable.targetCollectionId,
        currentValue: firstEditable.resolved,
      });
      setInlineNudgeVisible(false);
    }, [canQuickEdit, node.$type, multiModeValues]);

    const handleRowKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        // Enter or e: open the quick editor on the first mode cell; fall back to full editor.
        if (
          e.key === "Enter" ||
          (e.key === "e" && !e.metaKey && !e.ctrlKey && !e.altKey)
        ) {
          e.preventDefault();
          if (canQuickEdit) {
            openQuickEditorFirstMode();
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
        if (structuralActionsEnabled && matchesShortcut(e, "TOKEN_DUPLICATE")) {
          e.preventDefault();
          onDuplicateToken?.(node.path);
          return;
        }

        // F2: rename token inline
        if (structuralActionsEnabled && matchesShortcut(e, "TOKEN_RENAME")) {
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
        canQuickEdit,
        openQuickEditorFirstMode,
        onEdit,
        node.path,
        node.name,
        selectMode,
        onToggleSelect,
        onDelete,
        onDuplicateToken,
        handleContextMenuApply,
        structuralActionsEnabled,
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
          aria-selected={isSelected}
          style={{ display: "grid", gridTemplateColumns: gridTemplate }}
          className={`relative items-stretch py-1 hover:bg-[var(--color-figma-bg-hover)] transition-colors group token-row-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-figma-accent)] ${rowStateClass} ${boundAccentClass}`}
          data-roving-focus={rovingFocusPath === node.path || undefined}
          tabIndex={rovingFocusPath === node.path ? 0 : -1}
          data-token-path={node.path}
          data-node-name={node.name}
          onFocus={() => onRovingFocus(node.path)}
          draggable={structuralActionsEnabled && (!selectMode || isSelected)}
          onDragStart={(e) => {
            if (!structuralActionsEnabled) return;
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
          onDragEnd={() => {
            if (structuralActionsEnabled) {
              onDragEnd?.();
            }
          }}
          onDragOver={(e) => {
            if (!structuralActionsEnabled) return;
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
            if (!structuralActionsEnabled) return;
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              onDragLeaveToken?.();
            }
          }}
          onDrop={(e) => {
            if (!structuralActionsEnabled) return;
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
          {isSelected && (
            <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--color-figma-accent)] pointer-events-none z-10" />
          )}
          <div
            className={`tm-token-tree-row__main sticky left-0 z-[1] flex min-w-0 items-center gap-1.5 pr-1 ${stickyCellStateClass}`}
            style={{ paddingLeft: `${computePaddingLeft(depth, 14)}px` }}
          >
          <DepthBar depth={depth} />
          {/* Drag reorder indicator line */}
          {reorderPos && (
            <div
              className="absolute left-0 right-0 h-0.5 bg-[var(--color-figma-accent)] pointer-events-none z-10"
              style={reorderPos === "before" ? { top: 0 } : { bottom: 0 }}
            />
          )}
          <button
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-label={`Select ${node.name}`}
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect(node.path, {
                shift: e.shiftKey,
              });
            }}
            className={`shrink-0 inline-flex h-7 w-7 items-center justify-center rounded transition-opacity focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-accent)] ${
              selectionControlVisibilityClass
            } hover:bg-[var(--color-figma-bg-hover)]`}
          >
            <span
              className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border transition-colors ${
                isSelected
                  ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]"
                  : "border-[var(--color-figma-text-tertiary)]"
              }`}
              aria-hidden="true"
            >
              {isSelected ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2.5 5L4.5 7L7.5 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </span>
          </button>

          <div
            title={[
              formatDisplayPath(node.path, node.name),
              node.$type ? `Type: ${node.$type}` : null,
              `Value: ${formatValue(node.$type, displayValue)}`,
              node.$description ? `Description: ${node.$description}` : null,
              `${modKey}Click to select`,
            ]
              .filter(Boolean)
              .join("\n")}
            className="flex-1 min-w-0 cursor-pointer"
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey || e.shiftKey) {
                e.stopPropagation();
                onToggleSelect(node.path, {
                  shift: e.shiftKey,
                });
                return;
              }
              e.stopPropagation();
              onEdit(node.path, node.name);
            }}
          >
            {renamingToken ? (
              <InlineRenameRow
                inputRef={renameTokenInputRef}
                value={renameTokenVal}
                ariaLabel="Rename token"
                error={renameTokenError}
                confirmDisabled={!renameTokenVal.trim()}
                onChange={(nextValue) => {
                  setRenameTokenVal(nextValue);
                  setRenameTokenError("");
                }}
                onConfirm={confirmTokenRename}
                onCancel={cancelTokenRename}
              />
            ) : (
              <div className="tm-token-tree-row__content">
                <div className="tm-token-tree-row__title-line">
                  {node.$type && !previewIsValueBearing(node.$type) && (
                    <span className="shrink-0" aria-hidden="true">
                      <ValuePreview type={node.$type} value={displayValue} size={12} />
                    </span>
                  )}
                  {ancestorPathLabel && (
                    <span
                      className="tm-token-tree-row__context shrink min-w-0 truncate text-secondary text-[color:var(--color-figma-text-tertiary)]"
                      title={`In ${ancestorPathLabel}`}
                    >
                      {ancestorPathLabel}
                      <span aria-hidden="true" className="mx-1 text-[color:var(--color-figma-text-tertiary)]/60">/</span>
                    </span>
                  )}
                  <span
                    className="tm-token-tree-row__name min-w-0 truncate text-body text-[color:var(--color-figma-text)]"
                    title={formatDisplayPath(node.path, node.name)}
                  >
                    {highlightMatch(
                      showFullPath
                        ? formatDisplayPath(node.path, node.name)
                        : node.name,
                      searchHighlight?.nameTerms ?? [],
                    )}
                  </span>
                </div>
                {leafMetadataSegments.length > 0 && (
                  <span className="tm-token-tree-row__meta flex min-w-0 items-center gap-1 overflow-hidden text-secondary">
                    {renderRowMetadataSegments(leafMetadataSegments)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right-edge status cluster: star, status icon, action menu */}
          {!renamingToken && (
            <div className="flex items-center gap-1 shrink-0">
              {isFavorite && (
                <span
                  className="shrink-0 text-[color:var(--color-figma-text-warning)]"
                  title="Favorited"
                  aria-label="Favorited"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </span>
              )}
              {tokenStatus && (tokenStatus.kind === "lint" ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenTokenIssues) {
                      onOpenTokenIssues(node.path, collectionId);
                    } else {
                      onEdit(node.path, node.name);
                    }
                  }}
                  title={`${tokenStatus.title}\n\nClick to view issues`}
                  aria-label={`${tokenStatus.title}. Open review issues`}
                  className={`shrink-0 inline-flex items-center justify-center w-4 h-4 rounded cursor-pointer transition-colors hover:bg-[var(--color-figma-bg-secondary)] ${tokenStatus.toneClass}`}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
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
                  aria-label={tokenStatus.title}
                >
                  {tokenStatus.kind === "applied" ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : tokenStatus.kind === "sync" ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="9" y="9" width="10" height="10" rx="2" />
                      <path d="M5 15V7a2 2 0 0 1 2-2h8" />
                    </svg>
                  )}
                </span>
              ))}
              <div
                className={`shrink-0 transition-opacity ${overflowActionVisibilityClass}`}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenTokenActions(e.currentTarget);
                  }}
                  title={`More actions for ${formatDisplayPath(node.path, node.name)}`}
                  aria-label={`More actions for ${formatDisplayPath(node.path, node.name)}`}
                  aria-haspopup="menu"
                  aria-expanded={!!contextMenuPos}
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-accent)]"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="5" cy="12" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="19" cy="12" r="2" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          </div>
          {/* end name cell (grid column 1) */}

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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    <span className="flex-1">Edit</span>
                  </button>
                  {structuralActionsEnabled && (
                    <button
                      role="menuitem"
                      tabIndex={-1}
                      data-accel="r"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { closeTokenMenus(); setRenameTokenVal(node.name); setRenamingToken(true); }}
                      className={MENU_ITEM_CLASS}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                      <span className="flex-1">Rename</span>
                      <span className={MENU_SHORTCUT_CLASS}>F2</span>
                    </button>
                  )}
                  {structuralActionsEnabled && onDuplicateToken && (
                    <button
                      role="menuitem"
                      tabIndex={-1}
                      data-accel="d"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { closeTokenMenus(); onDuplicateToken(node.path); }}
                      className={MENU_ITEM_CLASS}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                      <span className="flex-1">Create from this token</span>
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
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
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                        <span className="flex-1">Bind to selection</span>
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M20 6L9 17l-5-5" /></svg>
                    <span className="flex-1">Copy value</span>
                  </button>
                  {structuralActionsEnabled && onRequestMoveToken && (
                    <button
                      role="menuitem"
                      tabIndex={-1}
                      data-accel="m"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { closeTokenMenus(); onRequestMoveToken(node.path); }}
                      className={MENU_ITEM_CLASS}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><path d="M12 11v6M9 14l3-3 3 3" /></svg>
                      <span className="flex-1">Move to collection</span>
                      <span className={MENU_SHORTCUT_CLASS}>M</span>
                    </button>
                  )}
                  {structuralActionsEnabled && onRequestCopyToken && (
                    <button
                      role="menuitem"
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { closeTokenMenus(); onRequestCopyToken(node.path); }}
                      className={MENU_ITEM_CLASS}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><path d="M12 11v6M9 17h6" /></svg>
                      <span className="flex-1">Copy to collection</span>
                    </button>
                  )}
                  {onCopyValueToAllModes &&
                    multiModeValues.length > 1 &&
                    !isAlias(node.$value) &&
                    node.$value !== "" &&
                    node.$value != null && (
                      <button
                        role="menuitem"
                        tabIndex={-1}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          closeTokenMenus();
                          onCopyValueToAllModes(node.path, collectionId);
                        }}
                        className={MENU_ITEM_CLASS}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M3 5h18M3 12h18M3 19h18" /></svg>
                        <span className="flex-1">Copy value to all modes</span>
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
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                      <span className="flex-1">Extract to alias</span>
                      <span className={MENU_SHORTCUT_CLASS}>E</span>
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                    <span className="flex-1">Find references</span>
                  </button>
                  {onCompareAcrossCollections && (
                    <button
                      role="menuitem"
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        closeTokenMenus();
                        onCompareAcrossCollections(node.path);
                      }}
                      className={MENU_ITEM_CLASS}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><rect x="3" y="3" width="7" height="18" rx="1" /><rect x="14" y="3" width="7" height="18" rx="1" /></svg>
                      <span className="flex-1">Compare across collections</span>
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
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
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
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
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
                      <svg width="12" height="12" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${isFavorite ? "text-[color:var(--color-figma-text-warning)]" : "opacity-60"}`}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                      <span className="flex-1">{isFavorite ? "Remove favorite" : "Add to favorites"}</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Reverse-reference popover — shows tokens that alias this one */}
          {refsPopover && (
            <div
              ref={refsPopoverRef}
              className="fixed z-50 w-60 overflow-hidden rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-[var(--shadow-popover)]"
              style={{ top: refsPopover.pos.y, left: refsPopover.pos.x }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-figma-bg-secondary)]">
                <span className="text-body font-medium text-[color:var(--color-figma-text)]">
                  {refsPopover.refs.length === 0
                    ? "No references"
                    : `${refsPopover.refs.length} reference${refsPopover.refs.length !== 1 ? "s" : ""}`}
                </span>
                <button
                  onClick={() => setRefsPopover(null)}
                  className="p-0.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[color:var(--color-figma-text-tertiary)]"
                  aria-label="Close"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {refsPopover.refs.length === 0 ? (
                <div className="px-3 py-3 text-body text-[color:var(--color-figma-text-tertiary)] text-center">
                  No tokens reference this one
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  {refsPopover.refs.map((refPath) => {
                    const collectionLabel = pathToCollectionId?.[refPath];
                    return (
                      <button
                        key={refPath}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                        onClick={() => {
                          setRefsPopover(null);
                          onNavigateToAlias?.(refPath, node.path);
                        }}
                      >
                        <span className="text-body text-[color:var(--color-figma-text)] truncate flex-1 min-w-0">
                          {refPath}
                        </span>
                        {collectionLabel && collectionLabel !== collectionId && (
                          <span
                            className={`shrink-0 ${BADGE_TEXT_CLASS} text-[color:var(--color-figma-text-tertiary)] px-1 py-px bg-[var(--color-figma-bg-secondary)] rounded`}
                          >
                            {collectionLabel}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Unified quick value editor — every editable type + alias editing. */}
          {quickEditor && node.$type && (
            <InlineValuePopover
              tokenPath={node.path}
              tokenName={node.name}
              tokenType={node.$type}
              currentValue={quickEditor.currentValue?.$value}
              modeLabel={multiModeValues.length > 1 ? quickEditor.optionName : undefined}
              allTokensFlat={allTokensFlat}
              pathToCollectionId={pathToCollectionId}
              anchorRect={quickEditor.anchor}
              onSave={(newVal, previousState) => {
                if (quickEditor.targetCollectionId) {
                  handleMultiModeInlineSaveRequest(
                    newVal,
                    quickEditor.targetCollectionId,
                    quickEditor.collectionId,
                    quickEditor.optionName,
                    previousState,
                  );
                } else {
                  requestInlineValueSave(newVal, previousState);
                }
                closeQuickEditor();
              }}
              onOpenFullEditor={() => {
                closeQuickEditor();
                onEdit(node.path, node.name);
              }}
              onClose={closeQuickEditor}
              onTab={(dir) => {
                const idx = multiModeValues.findIndex(
                  (m) => m.optionName === quickEditor.optionName,
                );
                const nextIdx = idx + dir;
                if (nextIdx >= 0 && nextIdx < multiModeValues.length) {
                  const next = multiModeValues[nextIdx];
                  const rect = nodeRef.current?.getBoundingClientRect();
                  if (rect) {
                    setQuickEditor({
                      anchor: rect,
                      optionName: next.optionName,
                      collectionId: next.collectionId,
                      targetCollectionId: next.targetCollectionId,
                      currentValue: next.resolved,
                    });
                  }
                } else {
                  closeQuickEditor();
                  onTabToNext(node.path, quickEditor.optionName, dir);
                }
              }}
            />
          )}

          {/* Complex type hover preview card */}
          {hoverPreviewVisible && node.$type && !isBrokenAlias && (
            <ComplexTypePreviewCard type={node.$type} value={displayValue} />
          )}

          {/* Value columns — one ValueCell per mode. Always length ≥ 1. */}
          {multiModeValues.map((mv) => (
            <ValueCell
              key={mv.optionName}
              tokenType={node.$type}
              currentValue={mv.resolved}
              targetCollectionId={mv.targetCollectionId}
              collectionId={mv.collectionId}
              optionName={mv.optionName}
              sourceTokenPath={node.path}
              onRequestQuickEdit={canQuickEdit ? (req: QuickEditRequest) => {
                setQuickEditor(req);
                setInlineNudgeVisible(false);
              } : undefined}
              onEdit={() => onEdit(node.path, node.name)}
              onNavigateToAlias={onNavigateToAlias}
            />
          ))}

          {/* Trailing empty cell — aligns with the header's add-mode + button */}
          <div aria-hidden="true" />
        </div>

        {/* Inline nudge — shown after saving a raw value that closely matches an existing token */}
        {inlineNudgeVisible && nearbyMatches.length > 0 && (
          <div
            className="flex items-center"
            style={{
              paddingLeft: `${computePaddingLeft(depth, 12)}px`,
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

        {/* Resolution chain debugger — shows full alias/mode resolution pipeline */}
        {resolutionSteps && resolutionSteps.length >= 2 && chainExpanded && (
          <div
            className="flex flex-col bg-[var(--color-figma-bg-secondary)]"
            style={{
              paddingLeft: `${computePaddingLeft(depth, 12)}px`,
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
                        width="10"
                        height="10"
                        viewBox="0 0 8 8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        className="text-[color:var(--color-figma-text-tertiary)]"
                        aria-hidden="true"
                      >
                        <path d="M4 0v4M1 4l3 4 3-4" />
                      </svg>
                    )}
                  </div>

                  {/* Token path — clickable to navigate */}
                  {!isFirst ? (
                    <button
                      className={`text-secondary font-mono shrink-0 transition-colors ${step.isError ? "text-[color:var(--color-figma-text-error)]" : "text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text-accent)] hover:underline"}`}
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
                    <span className="text-secondary font-mono text-[color:var(--color-figma-text-accent)] shrink-0">
                      {step.path}
                    </span>
                  )}

                  {/* Collection context */}
                  {step.collectionId && (
                    <span
                      className={`${BADGE_TEXT_CLASS} text-[color:var(--color-figma-text-tertiary)] shrink-0`}
                    >
                      {step.collectionId}
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
                      <span className="text-secondary font-mono text-[color:var(--color-figma-text)] font-medium">
                        {formatValue(step.$type, step.value)}
                      </span>
                    </span>
                  )}

                  {/* Error indicator */}
                  {step.isError && (
                    <span
                      className={`${BADGE_TEXT_CLASS} text-[color:var(--color-figma-text-error)] italic`}
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
      prev.gridTemplate === next.gridTemplate &&
      prev.chainExpanded === next.chainExpanded &&
      prev.depth === next.depth
    );
  },
);
