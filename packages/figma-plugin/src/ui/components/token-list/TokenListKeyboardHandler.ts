import type React from "react";
import { useCallback, type MutableRefObject } from "react";
import type { TokenNode } from "../../hooks/useTokens";
import { matchesShortcut } from "../../shared/shortcutRegistry";
import { nodeParentPath } from "../tokenListUtils";

interface KeyboardHandlerConfig {
  selectedPaths: Set<string>;
  expandedPaths: Set<string>;
  zoomRootPath: string | null;
  sortOrder: string;
  connected: boolean;
  navHistoryLength?: number;
  editingTokenPath?: string | null;
  siblingOrderMap: Map<string, string[]>;
  displayedLeafNodesRef: MutableRefObject<TokenNode[]>;
  copyTokensAsJsonRef: MutableRefObject<(nodes: TokenNode[]) => void>;
  copyTokensAsPreferredRef: MutableRefObject<(nodes: TokenNode[]) => void>;
  copyTokensAsDtcgRefRef: MutableRefObject<(nodes: TokenNode[]) => void>;
  lastSelectedPathRef: MutableRefObject<string | null>;
  searchRef: MutableRefObject<HTMLInputElement | null>;
  virtualListRef: MutableRefObject<HTMLDivElement | null>;
  collectionIds: string[];
  collectionId: string;

  // Actions
  setSelectedPaths: React.Dispatch<React.SetStateAction<Set<string>>>;
  setShowBatchEditor: React.Dispatch<React.SetStateAction<boolean>>;
  clearSelection: () => void;
  setZoomRootPath: (v: string | null) => void;
  setVirtualScrollTop: (v: number) => void;
  setBatchMoveToCollectionTarget: (v: string) => void;
  setShowBatchMoveToCollection: (v: boolean) => void;
  setBatchCopyToCollectionTarget: (v: string) => void;
  setShowBatchCopyToCollection: (v: boolean) => void;
  handleOpenCreateSibling: (groupPath: string, tokenType: string) => void;
  onCreateNew?: (initialPath?: string) => void;
  handleToggleExpand: (path: string) => void;
  handleExpandAll: () => void;
  handleCollapseAll: () => void;
  handleMoveTokenInGroup: (path: string, name: string, dir: "up" | "down") => void;
  handleTokenSelect: (path: string, modifiers: { shift: boolean }) => void;
  requestBulkDeleteFromHook: (paths: Set<string>) => void;
  onNavigateBack?: () => void;
  onEdit: (path: string, name?: string) => void;
}

export function useTokenListKeyboardHandler(config: KeyboardHandlerConfig) {
  const {
    selectedPaths,
    expandedPaths,
    zoomRootPath,
    sortOrder,
    connected,
    navHistoryLength,
    editingTokenPath,
    siblingOrderMap,
    displayedLeafNodesRef,
    copyTokensAsJsonRef,
    copyTokensAsPreferredRef,
    copyTokensAsDtcgRefRef,
    lastSelectedPathRef,
    searchRef,
    virtualListRef,
    collectionIds,
    collectionId,
    setSelectedPaths,
    setShowBatchEditor,
    clearSelection,
    setZoomRootPath,
    setVirtualScrollTop,
    setBatchMoveToCollectionTarget,
    setShowBatchMoveToCollection,
    setBatchCopyToCollectionTarget,
    setShowBatchCopyToCollection,
    handleOpenCreateSibling,
    onCreateNew,
    handleToggleExpand,
    handleExpandAll,
    handleCollapseAll,
    handleMoveTokenInGroup,
    handleTokenSelect,
    requestBulkDeleteFromHook,
    onNavigateBack,
    onEdit,
  } = config;

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT";
      const activeEl = document.activeElement as HTMLElement | null;
      const focusedTokenPath = activeEl?.dataset?.tokenPath;
      const focusedGroupPath = activeEl?.dataset?.groupPath;
      const hasSelection = selectedPaths.size > 0;

      // Escape: clear selection, exit zoom, or blur search
      if (e.key === "Escape") {
        if (hasSelection) {
          e.preventDefault();
          clearSelection();
          return;
        }
        if (zoomRootPath) {
          e.preventDefault();
          setZoomRootPath(null);
          setVirtualScrollTop(0);
          if (virtualListRef.current) virtualListRef.current.scrollTop = 0;
          return;
        }
        return;
      }

      // Cmd/Ctrl+C: copy selected tokens as DTCG JSON
      if (matchesShortcut(e, "TOKEN_COPY")) {
        if (hasSelection) {
          e.preventDefault();
          const nodes = displayedLeafNodesRef.current.filter((n) =>
            selectedPaths.has(n.path),
          );
          copyTokensAsJsonRef.current(nodes);
          return;
        }
        // Single focused token row — copy that token
        if (!isTyping) {
          const focusedPath = (document.activeElement as HTMLElement)?.dataset
            ?.tokenPath;
          if (focusedPath) {
            const node = displayedLeafNodesRef.current.find(
              (n) => n.path === focusedPath,
            );
            if (node) {
              e.preventDefault();
              copyTokensAsJsonRef.current([node]);
              return;
            }
          }
        }
      }

      // Cmd/Ctrl+Shift+C: copy selected tokens in preferred format
      if (matchesShortcut(e, "TOKEN_COPY_CSS_VAR")) {
        if (hasSelection) {
          e.preventDefault();
          const nodes = displayedLeafNodesRef.current.filter((n) =>
            selectedPaths.has(n.path),
          );
          copyTokensAsPreferredRef.current(nodes);
          return;
        }
        if (!isTyping) {
          const focusedPath = (document.activeElement as HTMLElement)?.dataset
            ?.tokenPath;
          if (focusedPath) {
            const node = displayedLeafNodesRef.current.find(
              (n) => n.path === focusedPath,
            );
            if (node) {
              e.preventDefault();
              copyTokensAsPreferredRef.current([node]);
              return;
            }
          }
        }
      }

      // Cmd/Ctrl+Alt+C: copy selected tokens as DTCG alias reference
      if (
        e.key === "c" &&
        (e.metaKey || e.ctrlKey) &&
        e.altKey &&
        !e.shiftKey
      ) {
        if (hasSelection) {
          e.preventDefault();
          const nodes = displayedLeafNodesRef.current.filter((n) =>
            selectedPaths.has(n.path),
          );
          copyTokensAsDtcgRefRef.current(nodes);
          return;
        }
        if (!isTyping) {
          const focusedPath = (document.activeElement as HTMLElement)?.dataset
            ?.tokenPath;
          if (focusedPath) {
            const node = displayedLeafNodesRef.current.find(
              (n) => n.path === focusedPath,
            );
            if (node) {
              e.preventDefault();
              copyTokensAsDtcgRefRef.current([node]);
              return;
            }
          }
        }
      }

      // Cmd/Ctrl+] / Cmd/Ctrl+[: navigate to next/previous token in the editor
      if (
        (matchesShortcut(e, "EDITOR_NEXT_TOKEN") ||
          matchesShortcut(e, "EDITOR_PREV_TOKEN")) &&
        editingTokenPath
      ) {
        e.preventDefault();
        const nodes = displayedLeafNodesRef.current;
        const idx = nodes.findIndex((n) => n.path === editingTokenPath);
        if (idx !== -1) {
          const next = matchesShortcut(e, "EDITOR_NEXT_TOKEN")
            ? nodes[idx + 1]
            : nodes[idx - 1];
          if (next) onEdit(next.path, next.name);
        }
        return;
      }

      // Don't handle shortcuts when typing in a form field
      if (isTyping) return;

      // Cmd/Ctrl+A: select all visible leaf tokens
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "a"
      ) {
        e.preventDefault();
        setSelectedPaths(
          new Set(displayedLeafNodesRef.current.map((n) => n.path)),
        );
        return;
      }

      // Backspace/Del: bulk delete when tokens are selected
      if (
        matchesShortcut(e, "TOKEN_DELETE") &&
        hasSelection &&
        (focusedTokenPath || focusedGroupPath)
      ) {
        e.preventDefault();
        requestBulkDeleteFromHook(selectedPaths);
        return;
      }

      // Cmd+Shift+M: batch move selected tokens to another collection
      if (
        matchesShortcut(e, "TOKEN_BATCH_MOVE_TO_COLLECTION") &&
        hasSelection
      ) {
        e.preventDefault();
        setBatchMoveToCollectionTarget(collectionIds.filter((s) => s !== collectionId)[0] ?? "");
        setShowBatchMoveToCollection(true);
        return;
      }

      // Cmd+Shift+Y: batch copy selected tokens to another collection
      if (
        matchesShortcut(e, "TOKEN_BATCH_COPY_TO_COLLECTION") &&
        hasSelection
      ) {
        e.preventDefault();
        setBatchCopyToCollectionTarget(collectionIds.filter((s) => s !== collectionId)[0] ?? "");
        setShowBatchCopyToCollection(true);
        return;
      }

      // m: clear selection when tokens are selected
      if (matchesShortcut(e, "TOKEN_MULTI_SELECT")) {
        if (hasSelection) {
          e.preventDefault();
          clearSelection();
        }
        return;
      }

      // e: open/toggle batch editor when tokens are selected
      if (e.key === "e" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (hasSelection) {
          e.preventDefault();
          setShowBatchEditor((v) => !v);
          return;
        }
      }

      // n: open create form / drawer
      if (matchesShortcut(e, "TOKEN_NEW")) {
        e.preventDefault();
        const groupPath = focusedGroupPath;
        const tokenPath = focusedTokenPath;

        let prefixPath = "";
        if (groupPath) {
          prefixPath = groupPath;
        } else if (tokenPath) {
          const groups = Array.from(
            document.querySelectorAll<HTMLElement>("[data-group-path]"),
          );
          const parentGroup = groups
            .filter((el) =>
              tokenPath.startsWith((el.dataset.groupPath ?? "") + "."),
            )
            .sort(
              (a, b) =>
                (b.dataset.groupPath?.length ?? 0) -
                (a.dataset.groupPath?.length ?? 0),
            )[0];
          prefixPath = parentGroup?.dataset?.groupPath ?? "";
        }

        if (prefixPath) {
          handleOpenCreateSibling(prefixPath, "color");
        } else if (onCreateNew) {
          onCreateNew();
        }
        return;
      }

      // /: focus search input
      if (matchesShortcut(e, "TOKEN_SEARCH")) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      // Alt+Up/Down: move focused token/group up or down within its parent group
      if (
        e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        (e.key === "ArrowUp" || e.key === "ArrowDown")
      ) {
        const nodePath =
          activeEl?.dataset?.tokenPath ?? activeEl?.dataset?.groupPath;
        const nodeName = activeEl?.dataset?.nodeName;
        if (nodePath && nodeName && sortOrder === "default" && connected) {
          const direction = e.key === "ArrowUp" ? "up" : "down";
          const parentPath = nodeParentPath(nodePath, nodeName) ?? "";
          const siblings = siblingOrderMap.get(parentPath) ?? [];
          const idx = siblings.indexOf(nodeName);
          const newIdx = direction === "up" ? idx - 1 : idx + 1;
          if (idx >= 0 && newIdx >= 0 && newIdx < siblings.length) {
            e.preventDefault();
            handleMoveTokenInGroup(nodePath, nodeName, direction);
          }
        }
        return;
      }

      // Up/Down: navigate between visible token and group rows
      // Shift+Up/Down: extend/shrink range selection
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const rows = Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-token-path],[data-group-path]",
          ),
        );
        if (rows.length === 0) return;
        const currentIndex = rows.findIndex(
          (el) => el === document.activeElement,
        );
        let targetRow: HTMLElement | undefined;
        if (e.key === "ArrowUp") {
          e.preventDefault();
          targetRow =
            currentIndex > 0 ? rows[currentIndex - 1] : rows[rows.length - 1];
        } else {
          e.preventDefault();
          targetRow =
            currentIndex < rows.length - 1 ? rows[currentIndex + 1] : rows[0];
        }
        targetRow?.focus();
        targetRow?.scrollIntoView({ block: "nearest" });

        // Shift+Arrow: extend/shrink range selection
        if (e.shiftKey && targetRow) {
          const targetPath =
            targetRow.dataset.tokenPath || targetRow.dataset.groupPath;
          if (targetPath) {
            if (lastSelectedPathRef.current === null) {
              const currentRow =
                currentIndex >= 0 ? rows[currentIndex] : undefined;
              const currentPath =
                currentRow?.dataset.tokenPath || currentRow?.dataset.groupPath;
              if (currentPath) {
                lastSelectedPathRef.current = currentPath;
                setSelectedPaths((prev) => {
                  const next = new Set(prev);
                  next.add(currentPath);
                  return next;
                });
              }
            }
            handleTokenSelect(targetPath, { shift: true });
          }
        }
      }

      // Alt+Left: navigate back in alias navigation history
      if (
        e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        e.key === "ArrowLeft" &&
        (navHistoryLength ?? 0) > 0
      ) {
        e.preventDefault();
        onNavigateBack?.();
        return;
      }

      // Cmd/Ctrl+Right: expand all groups; Cmd/Ctrl+Left: collapse all groups
      if (matchesShortcut(e, "TOKEN_EXPAND_ALL")) {
        e.preventDefault();
        handleExpandAll();
        return;
      }
      if (matchesShortcut(e, "TOKEN_COLLAPSE_ALL")) {
        e.preventDefault();
        handleCollapseAll();
        return;
      }

      // Left/Right: expand/collapse groups (standard tree keyboard pattern)
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const groupPath = activeEl?.dataset?.groupPath;
        const tokenPath = activeEl?.dataset?.tokenPath;

        if (groupPath) {
          const isExpanded = expandedPaths.has(groupPath);
          if (e.key === "ArrowRight") {
            e.preventDefault();
            if (!isExpanded) {
              handleToggleExpand(groupPath);
            } else {
              const rows = Array.from(
                document.querySelectorAll<HTMLElement>(
                  "[data-token-path],[data-group-path]",
                ),
              );
              const idx = rows.indexOf(activeEl!);
              if (idx >= 0 && idx < rows.length - 1) {
                rows[idx + 1]?.focus();
                rows[idx + 1]?.scrollIntoView({ block: "nearest" });
              }
            }
          } else {
            e.preventDefault();
            if (isExpanded) {
              handleToggleExpand(groupPath);
            } else {
              const parentPath = nodeParentPath(
                groupPath,
                activeEl?.dataset.nodeName ?? "",
              );
              if (parentPath) {
                const parentEl = document.querySelector<HTMLElement>(
                  `[data-group-path="${CSS.escape(parentPath)}"]`,
                );
                if (parentEl) {
                  parentEl.focus();
                  parentEl.scrollIntoView({ block: "nearest" });
                }
              }
            }
          }
        } else if (tokenPath && e.key === "ArrowLeft") {
          e.preventDefault();
          const parentPath = nodeParentPath(
            tokenPath,
            activeEl?.dataset.nodeName ?? "",
          );
          if (parentPath) {
            const parentEl = document.querySelector<HTMLElement>(
              `[data-group-path="${CSS.escape(parentPath)}"]`,
            );
            if (parentEl) {
              parentEl.focus();
              parentEl.scrollIntoView({ block: "nearest" });
            }
          }
        }
      }
    },
    [
      selectedPaths,
      handleOpenCreateSibling,
      onCreateNew,
      expandedPaths,
      handleToggleExpand,
      handleExpandAll,
      handleCollapseAll,
      zoomRootPath,
      navHistoryLength,
      onNavigateBack,
      handleMoveTokenInGroup,
      siblingOrderMap,
      sortOrder,
      connected,
      requestBulkDeleteFromHook,
      collectionIds,
      collectionId,
      setBatchMoveToCollectionTarget,
      setShowBatchMoveToCollection,
      setBatchCopyToCollectionTarget,
      setShowBatchCopyToCollection,
      editingTokenPath,
      handleTokenSelect,
      lastSelectedPathRef,
      onEdit,
      searchRef,
      clearSelection,
      setSelectedPaths,
      setShowBatchEditor,
      setVirtualScrollTop,
      displayedLeafNodesRef,
      copyTokensAsJsonRef,
      copyTokensAsPreferredRef,
      copyTokensAsDtcgRefRef,
      virtualListRef,
      setZoomRootPath,
    ],
  );

  return handleListKeyDown;
}
