/**
 * TokenGroupNode — renders a group row (expand/collapse header) with context menu,
 * inline rename, metadata editing, and generator summary.
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
import type { TokenTreeNodeProps } from "../tokenListTypes";
import {
  createGeneratorOwnershipKey,
  getGeneratorManagedOutputs,
  readTokenCollectionModeValues,
} from "@tokenmanager/core";
import { countTokensInGroup, nodeParentPath, countLeaves } from "../tokenListUtils";
import { inferGroupTokenType, highlightMatch } from "../tokenListHelpers";
import {
  useTokenTreeGroupActions,
  useTokenTreeGroupState,
  useTokenTreeSharedData,
} from "../TokenTreeContext";
import { getMenuItems, handleMenuArrowKeys } from "../../hooks/useMenuKeyboard";
import { ConfirmModal } from "../ConfirmModal";
import {
  getLifecycleLabel,
  readTokenPresentationMetadata,
  summarizeTokenScopes,
} from "../../shared/tokenMetadata";
import {
  clampMenuPosition,
  computePaddingLeft,
  DepthBar,
  EMPTY_LINT_VIOLATIONS,
  GeneratedGlyph,
  GeneratedGroupSummaryRow,
  getManagedGeneratorLeafCount,
  MENU_DANGER_ITEM_CLASS,
  MENU_ITEM_CLASS,
  MENU_SEPARATOR_CLASS,
  MENU_SHORTCUT_CLASS,
  MENU_SURFACE_CLASS,
  formatGeneratedGroupSummaryTitle,
} from "./tokenTreeNodeShared";
import type { MenuPosition } from "./tokenTreeNodeShared";
import type { RowMetadataSegment } from "./tokenTreeNodeUtils";
import { renderRowMetadataSegments } from "./tokenTreeNodeUtils";
import { TokenTreeNode } from "../TokenTreeNode";
import type { GeneratedTokenResult } from "../../hooks/useGenerators";
import { getGeneratedGroupKeepUpdatedAvailability } from "../../shared/generatedGroupUtils";

export const TokenGroupNode = memo(
  function TokenGroupNode(props: TokenTreeNodeProps) {
    const {
      node,
      depth,
      lintViolations = [],
      onMoveUp,
      onMoveDown,
    } = props;

    const {
      collectionId,
      groupBy,
      activeCollectionModeLabel,
      selectMode,
      expandedPaths,
      highlightedToken,
      previewedPath,
      searchHighlight,
      dragOverGroup,
      dragOverGroupIsInvalid,
      dragSource,
      generatorsByTargetGroup,
      collectionCoverage,
      rovingFocusPath: groupRovingFocusPath,
    } = useTokenTreeGroupState();
    const {
      allTokensFlat,
      modeResolvedTokensFlat,
      perCollectionFlat,
      pathToCollectionId,
      collections,
    } = useTokenTreeSharedData();

    const dominantTypeForGroup = useMemo(() => {
      const prefix = `${node.path}.`;
      const types: Record<string, number> = {};
      for (const [path, entry] of Object.entries(allTokensFlat)) {
        if (path === node.path || path.startsWith(prefix)) {
          const t = entry.$type;
          if (t) types[t] = (types[t] ?? 0) + 1;
        }
      }
      return Object.entries(types).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    }, [allTokensFlat, node.path]);

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
      onPublishGroup,
      onSetGroupScopes,
      onCreateGeneratedGroupFromGroup,
      onZoomIntoGroup,
      onDragOverGroup,
      onDropOnGroup,
      onEditGeneratedGroup,
      onDuplicateGeneratedGroup,
      onDeleteGeneratedGroup,
      onNavigateToGeneratedGroup,
      onRunGeneratedGroup,
      onToggleGeneratedGroupEnabled,
      onDetachGeneratedGroup,
      onNavigateToToken,
      onSelectGroupChildren,
      onRovingFocus: onGroupRovingFocus,
    } = useTokenTreeGroupActions();

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
    const [togglingKeepUpdated, setTogglingKeepUpdated] = useState(false);
    const [detachingGroup, setDetachingGroup] = useState(false);
    const [deletingGeneratedGroup, setDeletingGeneratedGroup] = useState(false);
    const [showDetachGroupConfirm, setShowDetachGroupConfirm] = useState(false);
    const [showDeleteGeneratedGroupConfirm, setShowDeleteGeneratedGroupConfirm] =
      useState(false);

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

    const isSyntheticTypeGroup =
      groupBy === "type" && node.path.startsWith("__type/");
    const structuralActionsEnabled = !isSyntheticTypeGroup;
    const isCategoryHeader = depth === 0 && !isSyntheticTypeGroup;
    const leafCount = countLeaves(node);
    const targetGenerator =
      generatorsByTargetGroup?.get(
        createGeneratorOwnershipKey(collectionId, node.path),
      ) ?? null;
    const managedGeneratorLeafCount = useMemo(() => {
      if (!targetGenerator) return 0;
      return getManagedGeneratorLeafCount(node, targetGenerator);
    }, [node, targetGenerator]);
    const manualExceptionCount = useMemo(() => {
      if (!targetGenerator?.overrides) {
        return 0;
      }
      return Object.values(targetGenerator.overrides).filter(
        (override) => override.locked,
      ).length;
    }, [targetGenerator]);
    const keepUpdatedDisabledReason = useMemo(() => {
      if (!targetGenerator) {
        return null;
      }
      return getGeneratedGroupKeepUpdatedAvailability({
        sourceTokenPath: targetGenerator.sourceToken,
        sourceTokenEntry: targetGenerator.sourceToken
          ? allTokensFlat[targetGenerator.sourceToken]
          : undefined,
        collections,
        pathToCollectionId,
        perCollectionFlat,
      }).reason;
    }, [
      allTokensFlat,
      collections,
      pathToCollectionId,
      perCollectionFlat,
      targetGenerator,
    ]);
    const previewTokens = useMemo<GeneratedTokenResult[]>(() => {
      if (!targetGenerator) {
        return [];
      }
      return getGeneratorManagedOutputs(targetGenerator).flatMap((output) => {
        const collectionEntry = perCollectionFlat?.[collectionId]?.[output.path];
        const selectedModeValue =
          collectionEntry && activeCollectionModeLabel
            ? readTokenCollectionModeValues(collectionEntry)[collectionId]?.[
                activeCollectionModeLabel
              ]
            : undefined;
        const entry = collectionEntry
          ? selectedModeValue === undefined
            ? collectionEntry
            : {
                ...collectionEntry,
                $value: selectedModeValue,
              }
          : modeResolvedTokensFlat?.[output.path] ?? allTokensFlat[output.path];
        if (!entry?.$type) {
          return [];
        }
        return [{
          stepName: output.stepName,
          path: output.path,
          type: entry.$type as GeneratedTokenResult["type"],
          value: entry.$value,
          isOverridden: targetGenerator.overrides?.[output.stepName]?.locked,
        }];
      });
    }, [
      activeCollectionModeLabel,
      allTokensFlat,
      collectionId,
      modeResolvedTokensFlat,
      perCollectionFlat,
      targetGenerator,
    ]);
    const collectionCoverageSummary = collectionCoverage?.get(node.path) ?? null;
    const groupPresentation = readTokenPresentationMetadata(node);
    const groupScopeSummary =
      node.$type && groupPresentation.scopes.length > 0
        ? summarizeTokenScopes(node.$type, groupPresentation.scopes)
        : null;
    const groupMetadataSegments: RowMetadataSegment[] = [];
    if (targetGenerator) {
      const countLabel = managedGeneratorLeafCount === leafCount
        ? `${leafCount} token${leafCount === 1 ? "" : "s"}`
        : `${managedGeneratorLeafCount}/${leafCount} tokens`;
      groupMetadataSegments.push({
        label: `${countLabel} via ${targetGenerator.name}`,
        title: `${formatGeneratedGroupSummaryTitle(targetGenerator)}\n${managedGeneratorLeafCount} of ${leafCount} token${leafCount === 1 ? "" : "s"} managed by this generated group`,
        tone: targetGenerator.isStale ? "warning" : "accent",
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
        title: `Can apply to: ${groupPresentation.scopes.join(", ")}`,
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
      <div className={isCategoryHeader ? "mt-1.5" : ""}>
        <div
          role="treeitem"
          aria-level={depth + 1}
          tabIndex={groupRovingFocusPath === node.path ? 0 : -1}
          aria-expanded={isExpanded}
          aria-label={`Toggle group ${node.name}`}
          data-group-path={node.path}
          data-node-name={node.name}
          onFocus={() => onGroupRovingFocus(node.path)}
          className={`sticky left-0 z-[1] relative flex items-center gap-1 px-1.5 py-1 cursor-pointer transition-colors group/group token-row-hover ${targetGenerator ? "bg-[var(--color-figma-generator)]/[0.03] hover:bg-[var(--color-figma-generator)]/[0.08]" : "bg-[var(--color-figma-bg)] hover:bg-[var(--color-figma-bg-hover)]"} ${groupRowStateClass} ${dragOverGroup === node.path ? (dragOverGroupIsInvalid ? "ring-1 ring-inset ring-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10" : "ring-1 ring-inset ring-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10") : ""}`}
          data-roving-focus={groupRovingFocusPath === node.path || undefined}
          style={{
            paddingLeft: `${computePaddingLeft(depth, 8)}px`,
          }}
          onClick={() => !renamingGroup && onToggleExpand(node.path)}
          onDoubleClick={() => {
            if (!renamingGroup && structuralActionsEnabled) {
              onZoomIntoGroup?.(node.path);
            }
          }}
          onDragOver={(e) => {
            if (!structuralActionsEnabled) return;
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
            if (!structuralActionsEnabled) return;
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              onDragOverGroup?.(null);
            }
          }}
          onDrop={(e) => {
            if (!structuralActionsEnabled) return;
            e.preventDefault();
            onDropOnGroup?.(node.path);
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !renamingGroup) {
              e.preventDefault();
              onToggleExpand(node.path);
            }
            if (
              e.key === "z" &&
              !renamingGroup &&
              !selectMode &&
              structuralActionsEnabled
            ) {
              e.preventDefault();
              e.stopPropagation();
              onZoomIntoGroup?.(node.path);
            }
            if (
              e.key === "n" &&
              !renamingGroup &&
              !selectMode &&
              structuralActionsEnabled
            ) {
              e.preventDefault();
              e.stopPropagation();
              onCreateSibling?.(node.path, inferGroupTokenType(node.children));
            }
            if (
              e.key === "s" &&
              !renamingGroup &&
              !selectMode &&
              structuralActionsEnabled &&
              onSetGroupScopes
            ) {
              e.preventDefault();
              e.stopPropagation();
              onSetGroupScopes(node.path);
            }
            if (
              e.key === "m" &&
              !renamingGroup &&
              !selectMode &&
              structuralActionsEnabled
            ) {
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
            if (!structuralActionsEnabled) return;
            e.preventDefault();
            setGroupMenuPos(clampMenuPosition(e.clientX, e.clientY, 192, 420));
          }}
        >
          <DepthBar depth={depth} />
          <svg
            width="10"
            height="10"
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
                  className={`flex-1 text-body font-medium bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] rounded px-1 outline-none min-w-0 focus-visible:border-[var(--color-figma-accent)] ${renameGroupError ? "border-[var(--color-figma-error)]" : "border-[var(--color-figma-border)]"}`}
                />
                <button
                  onClick={confirmGroupRename}
                  disabled={!renameGroupVal.trim()}
                  className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)] text-white text-secondary font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 shrink-0"
                >
                  Save
                </button>
                <button
                  onClick={cancelGroupRename}
                  className="px-1.5 py-0.5 rounded text-secondary text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] shrink-0"
                >
                  Cancel
                </button>
              </div>
              {renameGroupError && (
                <p
                  role="alert"
                  className="text-secondary text-[var(--color-figma-error)]"
                >
                  {renameGroupError}
                </p>
              )}
            </div>
          ) : (
            isCategoryHeader ? (
              <span className="flex-1 text-body font-medium text-[var(--color-figma-text-secondary)]">
                {highlightMatch(node.name, searchHighlight?.nameTerms ?? [])}
              </span>
            ) : (
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-medium text-[var(--color-figma-text)]">
                  {highlightMatch(node.name, searchHighlight?.nameTerms ?? [])}
                </span>
                {groupMetadataSegments.length > 0 && (
                  <div className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden text-secondary">
                    {renderRowMetadataSegments(groupMetadataSegments)}
                  </div>
                )}
              </div>
            )
          )}
          {!renamingGroup && (
            <div className="flex items-center gap-1 shrink-0 ml-auto">
              {collectionCoverageSummary &&
                collectionCoverageSummary.total > 0 &&
                collectionCoverageSummary.totalMissing > 0 && (
                  <span
                    className="shrink-0 text-micro font-normal text-[var(--color-figma-text-tertiary)]"
                    title={`${collectionCoverageSummary.totalMissing} mode value${collectionCoverageSummary.totalMissing === 1 ? "" : "s"} unfilled across ${collectionCoverageSummary.total} tokens`}
                  >
                    {collectionCoverageSummary.totalMissing} mode{collectionCoverageSummary.totalMissing === 1 ? "" : "s"} unfilled
                  </span>
                )}
              {targetGenerator && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (targetGenerator.id) onEditGeneratedGroup?.(targetGenerator.id);
                  }}
                  disabled={!targetGenerator.id || !onEditGeneratedGroup}
                  className={`shrink-0 inline-flex items-center justify-center w-4 h-4 rounded ${
                    targetGenerator.isStale
                      ? "text-[var(--color-figma-generator)]"
                      : "text-[var(--color-figma-text-tertiary)]"
                  } hover:bg-[var(--color-figma-accent)]/10 hover:text-[var(--color-figma-accent)] disabled:cursor-default disabled:opacity-60`}
                  title={targetGenerator.isStale ? "Generated (source changed) — click to edit" : "Generated group — click to edit"}
                  aria-label="Edit generator"
                >
                  <GeneratedGlyph size={12} className="shrink-0" />
                </button>
              )}
              <div
                className={`flex items-center gap-0.5 shrink-0 ${selectMode || !structuralActionsEnabled ? "invisible" : isGroupActive ? "opacity-100" : "opacity-0 pointer-events-none group-hover/group:opacity-100 group-hover/group:pointer-events-auto group-focus-within/group:opacity-100 group-focus-within/group:pointer-events-auto"}`}
              >
                {onZoomIntoGroup && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onZoomIntoGroup(node.path); }}
                    title="Focus on this group"
                    aria-label="Focus on this group"
                    className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onCreateSibling?.(node.path, inferGroupTokenType(node.children)); }}
                  title="Add token to group"
                  aria-label="Add token to group"
                  className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
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
                  className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
                </button>
              </div>
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" /></svg>
                    <span className="flex-1">New subgroup</span>
                    <span className={MENU_SHORTCUT_CLASS}>N</span>
                  </button>
                )}
                {onSelectGroupChildren && (
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { closeGroupMenus(); onSelectGroupChildren(node); }}
                    className={MENU_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                    <span className="flex-1">Select all tokens</span>
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M12 3l7 4v10l-7 4-7-4V7l7-4z" /><path d="M9 12h6" /></svg>
                    <span className="flex-1">Edit applicability</span>
                    <span className={MENU_SHORTCUT_CLASS}>S</span>
                  </button>
                )}
                {targetGenerator?.id && onNavigateToGeneratedGroup && (
                  <>
                    <button
                      role="menuitem"
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        closeGroupMenus();
                        onNavigateToGeneratedGroup(targetGenerator.id!);
                      }}
                      className={MENU_ITEM_CLASS}
                    >
                      <GeneratedGlyph size={10} className="shrink-0 opacity-60" />
                      <span className="flex-1">Open generated group</span>
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
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
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
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
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
                  onClick={() => setGroupMenuAdvanced(false)}
                  className={MENU_ITEM_CLASS}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
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
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  <span className="flex-1">Create from this group</span>
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M18 15l-6-6-6 6" /></svg>
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M6 9l6 6 6-6" /></svg>
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
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
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
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><path d="M12 11v6M9 14l3-3 3 3" /></svg>
                  <span className="flex-1">Move to collection</span>
                  <span className={MENU_SHORTCUT_CLASS}>M</span>
                </button>
                <button
                  role="menuitem"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { closeGroupMenus(); onRequestCopyGroup?.(node.path); }}
                  className={MENU_ITEM_CLASS}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><path d="M12 11v6M9 17h6" /></svg>
                  <span className="flex-1">Copy to collection</span>
                </button>
                {onCreateGeneratedGroupFromGroup && (
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    data-accel="g"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      closeGroupMenus();
                      onCreateGeneratedGroupFromGroup(node.path, dominantTypeForGroup);
                    }}
                    className={MENU_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" /></svg>
                    <span className="flex-1">Generate this group</span>
                    <span className={MENU_SHORTCUT_CLASS}>G</span>
                  </button>
                )}
                {onPublishGroup && (
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    data-accel="p"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { closeGroupMenus(); const count = node.children ? countTokensInGroup(node) : 0; onPublishGroup(node.path, count); }}
                    className={MENU_ITEM_CLASS}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                    <span className="flex-1">Publish to Figma</span>
                    <span className={MENU_SHORTCUT_CLASS}>P</span>
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {editingGroupMeta && (
          <div
            className="mb-0.5 rounded px-2 py-1.5 bg-[var(--color-figma-bg-secondary)] flex flex-col gap-1.5"
            style={{
              marginLeft: `${computePaddingLeft(depth, 8)}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-secondary font-medium text-[var(--color-figma-text-secondary)]">
              Group metadata
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-secondary text-[var(--color-figma-text-secondary)] w-16 shrink-0">
                $type
              </label>
              <select
                value={groupMetaType}
                onChange={(e) => setGroupMetaType(e.target.value)}
                className="flex-1 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-secondary focus-visible:border-[var(--color-figma-accent)]"
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
              <label className="text-secondary text-[var(--color-figma-text-secondary)] w-16 shrink-0">
                $description
              </label>
              <input
                type="text"
                value={groupMetaDescription}
                onChange={(e) => setGroupMetaDescription(e.target.value)}
                placeholder="Optional description…"
                className="flex-1 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-secondary focus-visible:border-[var(--color-figma-accent)]"
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
                className="px-2 py-1 rounded text-secondary text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveGroupMeta}
                disabled={groupMetaSaving}
                className="px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white text-secondary font-medium hover:opacity-90 disabled:opacity-40"
              >
                {groupMetaSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}

        {!props.skipChildren && isExpanded && targetGenerator && (
          <GeneratedGroupSummaryRow
            depth={depth}
            generator={targetGenerator}
            exceptionCount={manualExceptionCount}
            previewTokens={previewTokens}
            running={regenerating}
            keepUpdatedBusy={togglingKeepUpdated}
            keepUpdatedDisabledReason={keepUpdatedDisabledReason}
            detaching={detachingGroup}
            deleting={deletingGeneratedGroup}
            onRun={
              targetGenerator.id && onRunGeneratedGroup
                ? async () => {
                    if (regenerating) return;
                    setRegenerating(true);
                    try {
                      await onRunGeneratedGroup(targetGenerator.id);
                    } finally {
                      setRegenerating(false);
                    }
                  }
                : undefined
            }
            onEdit={
              targetGenerator.id && onEditGeneratedGroup
                ? () => onEditGeneratedGroup(targetGenerator.id)
                : undefined
            }
            onDuplicate={
              targetGenerator.id && onDuplicateGeneratedGroup
                ? () => onDuplicateGeneratedGroup(targetGenerator.id)
                : undefined
            }
            onToggleKeepUpdated={
              targetGenerator.id && onToggleGeneratedGroupEnabled
                ? async (enabled: boolean) => {
                    if (togglingKeepUpdated) return;
                    setTogglingKeepUpdated(true);
                    try {
                      await onToggleGeneratedGroupEnabled(targetGenerator.id, enabled);
                    } finally {
                      setTogglingKeepUpdated(false);
                    }
                  }
                : undefined
            }
            onDelete={
              targetGenerator.id && onDeleteGeneratedGroup
                ? async () => {
                    setShowDeleteGeneratedGroupConfirm(true);
                  }
                : undefined
            }
            onDetach={
              targetGenerator.id && onDetachGeneratedGroup
                ? () => {
                    setShowDetachGroupConfirm(true);
                  }
                : undefined
            }
            onNavigateToSourceToken={onNavigateToToken}
          />
        )}

        {showDeleteGeneratedGroupConfirm && targetGenerator && (
          <ConfirmModal
            title="Delete generated group?"
            description={`Delete "${targetGenerator.name}" and remove the generated tokens in "${node.path}" from this collection.`}
            confirmLabel="Delete generated group"
            danger
            onCancel={() => setShowDeleteGeneratedGroupConfirm(false)}
            onConfirm={async () => {
              if (!targetGenerator.id || !onDeleteGeneratedGroup) {
                setShowDeleteGeneratedGroupConfirm(false);
                return;
              }
              setDeletingGeneratedGroup(true);
              try {
                await onDeleteGeneratedGroup(targetGenerator.id);
                setShowDeleteGeneratedGroupConfirm(false);
              } finally {
                setDeletingGeneratedGroup(false);
              }
            }}
          />
        )}

        {showDetachGroupConfirm && targetGenerator && (
          <ConfirmModal
            title="Detach from generator?"
            description={`Convert ${managedGeneratorLeafCount} generated token${managedGeneratorLeafCount === 1 ? "" : "s"} in "${node.path}" to manual. "${targetGenerator.name}" will stop updating them.`}
            confirmLabel="Detach from generator"
            onCancel={() => setShowDetachGroupConfirm(false)}
            onConfirm={async () => {
              if (!targetGenerator.id || !onDetachGeneratedGroup) {
                setShowDetachGroupConfirm(false);
                return;
              }
              setDetachingGroup(true);
              try {
                await onDetachGeneratedGroup(targetGenerator.id, node.path);
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
              multiModeValues={props.multiModeValues}
              gridTemplate={props.gridTemplate}
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
      prev.chainExpanded === next.chainExpanded &&
      prev.onMoveUp === next.onMoveUp &&
      prev.onMoveDown === next.onMoveDown &&
      prev.multiModeValues === next.multiModeValues
    );
  },
);
