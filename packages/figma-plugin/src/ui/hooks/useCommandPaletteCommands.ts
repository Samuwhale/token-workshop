import { useCallback, useState, useEffect, useMemo } from "react";
import { createGeneratorOwnershipKey } from "@tokenmanager/core";
import type { Command, TokenEntry } from "../components/CommandPalette";
import { inferTypeFromValue } from "../components/tokenListHelpers";
import { isAlias } from "../../shared/resolveAlias";
import { adaptShortcut } from "../shared/utils";
import { SHORTCUT_KEYS } from "../shared/shortcutRegistry";
import {
  STORAGE_KEY_BUILDERS,
  STORAGE_KEYS,
  lsGet,
  lsGetJson,
  lsSet,
} from "../shared/storage";
import { dispatchToast } from "../shared/toastBus";
import {
  useCollectionStateContext,
  useTokenFlatMapContext,
  useGeneratorContext,
} from "../contexts/TokenDataContext";
import { useSelectionContext } from "../contexts/InspectContext";
import { useNavigationContext } from "../contexts/NavigationContext";
import { useEditorContext } from "../contexts/EditorContext";
import {
  useShellWorkspaceController,
  useSyncWorkspaceController,
  useTokensWorkspaceController,
} from "../contexts/WorkspaceControllerContext";

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function useCommandPaletteCommands(): {
  commands: Command[];
  currentCollectionPaletteTokens: TokenEntry[];
} {
  const {
    collections,
    currentCollectionId,
    setCurrentCollectionId,
    collectionTokenCounts,
  } = useCollectionStateContext();
  const collectionIds = collections.map((collection) => collection.id);
  const { allTokensFlat, pathToCollectionId, perCollectionFlat } = useTokenFlatMapContext();
  const { derivedTokenPaths } = useGeneratorContext();
  const { navigateTo, closeSecondarySurface } = useNavigationContext();
  const { selectedNodes } = useSelectionContext();
  const {
    highlightedToken,
    setHighlightedToken,
    setEditingToken,
    setShowTokensCompare,
    setTokensCompareMode,
    setTokensCompareModeKey,
    setTokensComparePath,
    setTokensComparePaths,
  } = useEditorContext();
  const shell = useShellWorkspaceController();
  const tokens = useTokensWorkspaceController();
  const sync = useSyncWorkspaceController();

  const [exportPresetRev, setExportPresetRev] = useState(0);
  const [tokenListViewRev, setTokenListViewRev] = useState(0);

  useEffect(() => {
    const onChanged = () => setExportPresetRev((revision) => revision + 1);
    window.addEventListener("exportPresetsChanged", onChanged);
    return () => window.removeEventListener("exportPresetsChanged", onChanged);
  }, []);

  useEffect(() => {
    const onChanged = () => setTokenListViewRev((revision) => revision + 1);
    window.addEventListener("tm-token-list-view-changed", onChanged);
    return () =>
      window.removeEventListener("tm-token-list-view-changed", onChanged);
  }, []);

  const baseCommands = useMemo<Command[]>(() => {
    void tokenListViewRev;

    const goToTokens = () => {
      navigateTo("tokens");
      setEditingToken(null);
    };

    const goToTokensAndRun = (
      fn: (handle: NonNullable<typeof tokens.tokenListCompareRef.current>) => void,
    ) => {
      goToTokens();
      setTimeout(() => {
        const handle = tokens.tokenListCompareRef.current;
        if (!handle) return;
        fn(handle);
      }, 0);
    };

    const tokenJsonView = lsGet(STORAGE_KEY_BUILDERS.tokenViewMode(currentCollectionId)) === "json";
    const tokenResolvedValues =
      lsGet(STORAGE_KEY_BUILDERS.tokenShowResolvedValues(currentCollectionId)) === "1";
    const tokenStatsBarOpen = lsGet(STORAGE_KEYS.TOKEN_STATS_BAR_OPEN) === "true";

    return [
      {
        id: "new-token",
        label: "Create new token",
        description: `Start a new token in "${currentCollectionId}"`,
        category: "Tokens",
        shortcut: adaptShortcut("⌘N"),
        handler: () => {
          navigateTo("tokens");
          setEditingToken({ path: "", currentCollectionId, isCreate: true });
        },
      },
      {
        id: "switch-collection",
        label: "Focus collection rail",
        description: `Jump to the collection rail for ${collectionIds.length} collections`,
        category: "Collections",
        shortcut: adaptShortcut(SHORTCUT_KEYS.QUICK_SWITCH_COLLECTION),
        handler: shell.focusCollectionRail,
      },
      {
        id: "paste-tokens",
        label: "Paste tokens",
        description:
          "Import from pasted JSON, CSS vars, CSV, or Tailwind config",
        category: "Tokens",
        shortcut: adaptShortcut(SHORTCUT_KEYS.PASTE_TOKENS),
        handler: shell.openPasteModal,
      },
      {
        id: "new-from-clipboard",
        label: "New token from clipboard",
        description: "Create one token pre-filled from the clipboard",
        category: "Tokens",
        handler: async () => {
          try {
            const text = await navigator.clipboard.readText();
            const trimmed = text?.trim();
            if (!trimmed) {
              dispatchToast("Clipboard is empty", "error");
              return;
            }
            const inferredType = inferTypeFromValue(trimmed) || "string";
            goToTokens();
            setEditingToken({
              path: "",
              currentCollectionId,
              isCreate: true,
              initialType: inferredType,
              initialValue: trimmed,
            });
          } catch (error) {
            console.warn("[App] clipboard read failed:", error);
            dispatchToast(
              "Could not read clipboard — browser may have denied access",
              "error",
            );
          }
        },
      },
      {
        id: "focus-recent-tokens",
        label: "Focus recent tokens",
        description: "Filter the library down to recently edited tokens",
        category: "Tokens",
        handler: () => {
          navigateTo("tokens");
          setEditingToken(null);
          setTimeout(() => {
            tokens.tokenListCompareRef.current?.showRecentlyTouched();
          }, 0);
        },
      },
      {
        id: "toggle-preview",
        label: shell.showPreviewSplit
          ? "Hide preview panel"
          : "Show preview panel",
        description: "Toggle the live preview split for quick visual checks",
        category: "Views",
        shortcut: adaptShortcut(SHORTCUT_KEYS.TOGGLE_PREVIEW),
        handler: () => {
          shell.setShowPreviewSplit((visible) => !visible);
          closeSecondarySurface();
        },
      },
      {
        id: "toggle-token-json-view",
        label: tokenJsonView
          ? "Switch token list to tree view"
          : "Switch token list to JSON view",
        description: tokenJsonView
          ? `Return to the structured token tree for "${currentCollectionId}"`
          : `Open the raw JSON editor for "${currentCollectionId}"`,
        category: "Views",
        handler: () => goToTokensAndRun((handle) => handle.toggleJsonView()),
      },
      {
        id: "toggle-token-resolved-values",
        label: tokenResolvedValues
          ? "Hide resolved token values"
          : "Show resolved token values",
        description: tokenResolvedValues
          ? `Show alias references again in "${currentCollectionId}"`
          : `Resolve aliases inline while browsing "${currentCollectionId}"`,
        category: "Views",
        handler: () =>
          goToTokensAndRun((handle) => handle.toggleResolvedValues()),
      },
      {
        id: "toggle-token-stats-bar",
        label: tokenStatsBarOpen
          ? "Hide token stats bar"
          : "Show token stats bar",
        description: "Toggle the token summary strip above the library",
        category: "Views",
        handler: () => goToTokensAndRun((handle) => handle.toggleStatsBar()),
      },
      {
        id: "validate",
        label: "Run audit now",
        description:
          "Refresh validation across references, duplicates, and generated output",
        category: "Audit",
        handler: () => {
          navigateTo("tokens", "health");
          void sync.refreshValidation();
        },
      },
      {
        id: "generate-color-scale",
        label: "Generate palette…",
        description:
          "Open the generated-group editor for a palette in the current collection",
        category: "Tokens",
        handler: () => {
          goToTokens();
          shell.openGeneratedPalette();
        },
      },
      {
        id: "compare-tokens",
        label: "Compare tokens…",
        description: "Open side-by-side token comparison inside the library",
        category: "Tokens",
        handler: () => {
          navigateTo("tokens");
          tokens.tokenListCompareRef.current?.openCompareMode();
        },
      },
      ...(selectedNodes.length > 0
        ? [
            {
              id: "quick-apply",
              label: "Quick apply token to selection",
              description: `Open contextual apply for ${selectedNodes.length} selected layer${selectedNodes.length !== 1 ? "s" : ""}`,
              category: "Apply" as const,
              shortcut: adaptShortcut(SHORTCUT_KEYS.TOGGLE_QUICK_APPLY),
              handler: shell.toggleQuickApply,
            },
          ]
        : []),
      ...(tokens.lintViolations.length > 0
        ? [
            {
              id: "analytics",
              label: "Toggle issue-only filter",
              description: `Focus the ${tokens.lintViolations.length} token${tokens.lintViolations.length === 1 ? "" : "s"} with validation issues`,
              category: "Audit" as const,
              handler: () => {
                tokens.setShowIssuesOnly((visible) => !visible);
                navigateTo("tokens");
              },
            },
            {
              id: "next-issue",
              label: "Jump to next issue",
              description: `Cycle through ${tokens.lintViolations.length} validation issue${tokens.lintViolations.length === 1 ? "" : "s"} in the current collection`,
              category: "Audit" as const,
              shortcut: SHORTCUT_KEYS.NEXT_LINT_ISSUE,
              handler: tokens.jumpToNextIssue,
            },
          ]
        : []),
    ];
  }, [
    currentCollectionId,
    collectionIds.length,
    navigateTo,
    selectedNodes.length,
    setEditingToken,
    shell,
    closeSecondarySurface,
    tokens,
    sync,
    tokenListViewRev,
  ]);

  const collectionCommands = useMemo<Command[]>(() => {
    const goToTokens = () => {
      navigateTo("tokens");
      setEditingToken(null);
    };

    return collectionIds.map((collectionId) => ({
      id: `switch-collection-${collectionId}`,
      label: `Switch to Collection: ${collectionId}`,
      description: `${collectionTokenCounts[collectionId] ?? 0} tokens`,
      category: "Collections" as const,
      handler: () => {
        setCurrentCollectionId(collectionId);
        goToTokens();
      },
    }));
  }, [navigateTo, setCurrentCollectionId, setEditingToken, collectionTokenCounts, collectionIds]);

  const openCompareInTokens = useCallback(
    (mode: "mode-options" | "cross-collection", path?: string) => {
      setEditingToken(null);
      setTokensCompareMode(mode);
      setTokensComparePath(path ?? "");
      setTokensComparePaths(new Set());
      setTokensCompareModeKey((key) => key + 1);
      setShowTokensCompare(true);
      navigateTo("tokens", "tokens");
    },
    [navigateTo, setEditingToken, setShowTokensCompare, setTokensCompareMode, setTokensCompareModeKey, setTokensComparePath, setTokensComparePaths],
  );

  const modeCompareCommands = useMemo<Command[]>(() => {
    return [
      ...(collections.length > 0
        ? [
            {
              id: "compare-mode-options",
              label: "Compare collection modes…",
              description: "Open a side-by-side diff across collection modes",
              category: "Modes" as const,
              handler: () => openCompareInTokens("mode-options"),
            },
          ]
        : []),
      ...collections
        .filter((collection) => collection.modes.length >= 2)
        .map((collection) => ({
          id: `compare-collection-${collection.id}`,
          label: `Compare ${collection.id} modes: ${collection.modes[0].name} vs ${collection.modes[1].name}`,
          description: `See token differences across ${collection.id} modes`,
          category: "Modes" as const,
          handler: () => openCompareInTokens("mode-options"),
        })),
    ];
  }, [collections, openCompareInTokens]);

  const contextualCommands = useMemo<Command[]>(() => {
    const inCurrentCollection =
      !!highlightedToken && pathToCollectionId[highlightedToken] === currentCollectionId;

    return [
      ...(inCurrentCollection
        ? [
            {
              id: "rename-highlighted-token",
              label: `Rename: ${highlightedToken}`,
              description: "Start inline rename mode for this token",
              category: "Tokens" as const,
              handler: () => tokens.handlePaletteRename(highlightedToken),
            },
            {
              id: "duplicate-highlighted-token",
              label: `Duplicate: ${highlightedToken}`,
              description: "Create a copy of this token with a new path",
              category: "Tokens" as const,
              handler: () => {
                void tokens.handlePaletteDuplicate(highlightedToken);
              },
            },
            {
              id: "move-highlighted-token",
              label: `Move to collection: ${highlightedToken}`,
              description: "Move this token to a different collection",
              category: "Tokens" as const,
              handler: () => tokens.handlePaletteMove(highlightedToken),
            },
            {
              id: "extract-highlighted-token-to-alias",
              label: `Extract to alias: ${highlightedToken}`,
              description:
                "Create a primitive alias token and replace this value with a reference",
              category: "Tokens" as const,
              handler: () => {
                const entry = allTokensFlat[highlightedToken];
                navigateTo("tokens");
                setHighlightedToken(highlightedToken);
                tokens.tokenListCompareRef.current?.triggerExtractToAlias(
                  highlightedToken,
                  entry?.$type,
                  entry?.$value,
                );
              },
            },
            {
              id: "delete-highlighted-token",
              label: `Delete token: ${highlightedToken}`,
              description: `Permanently delete this token from collection "${currentCollectionId}"`,
              category: "Tokens" as const,
              handler: () =>
                tokens.requestPaletteDelete(
                  [highlightedToken],
                  `Delete "${highlightedToken}"?`,
                ),
            },
          ]
        : []),
      ...(tokens.tokenListSelection.length > 0
        ? [
            {
              id: "delete-selected-tokens",
              label: `Delete ${tokens.tokenListSelection.length} selected token${tokens.tokenListSelection.length !== 1 ? "s" : ""}`,
              description: `Permanently delete ${tokens.tokenListSelection.length} token${tokens.tokenListSelection.length !== 1 ? "s" : ""} from collection "${currentCollectionId}"`,
              category: "Tokens" as const,
              handler: () =>
                tokens.requestPaletteDelete(
                  tokens.tokenListSelection,
                  `Delete ${tokens.tokenListSelection.length} token${tokens.tokenListSelection.length !== 1 ? "s" : ""}?`,
                ),
            },
          ]
        : []),
      ...(highlightedToken
        ? [
            {
              id: "show-dependencies",
              label: `Show dependencies: ${highlightedToken}`,
              description: "View what aliases and tokens reference this token",
              category: "Audit" as const,
              handler: () => {
                tokens.setFlowPanelInitialPath(highlightedToken);
                navigateTo("tokens", "health");
              },
            },
          ]
        : []),
      ...(collections.length > 0 && highlightedToken
        ? [
            {
              id: "compare-across-modes",
              label: `Compare across modes: ${highlightedToken}`,
              description:
                "See how this token’s value varies across all collection modes",
              category: "Modes" as const,
              handler: () =>
                tokens.handleOpenCrossCollectionCompare(highlightedToken),
            },
          ]
        : []),
      ...(collections.length > 0 && !highlightedToken
        ? [
            {
              id: "compare-across-modes-pick",
              label: "Compare token across modes…",
              description:
                "Focus a token first, then run this command to compare its values across collection modes",
              category: "Modes" as const,
              handler: () => openCompareInTokens("cross-collection"),
            },
          ]
        : []),
    ];
  }, [
    currentCollectionId,
    allTokensFlat,
    collections.length,
    highlightedToken,
    navigateTo,
    openCompareInTokens,
    pathToCollectionId,
    setHighlightedToken,
    tokens,
  ]);

  const undoRedoCommands = useMemo<Command[]>(() => {
    return [
      ...sync.recentOperations
        .filter((operation) => !operation.rolledBack)
        .slice(0, 5)
        .map((operation, index) => ({
          id: `undo-op-${operation.id}`,
          label:
            index === 0
              ? `Undo: ${operation.description}`
              : `Rollback: ${operation.description}`,
          description: `${operation.affectedPaths.length} path(s) · ${operation.resourceId} · ${timeAgo(operation.timestamp)}`,
          category: "History" as const,
          handler: () => sync.handleRollback(operation.id),
        })),
      ...(sync.canRedo && sync.redoSlot
        ? [
            {
              id: "redo-local",
              label: `Redo: ${sync.redoSlot.description}`,
              description: "Re-apply the last undone action",
              category: "History" as const,
              shortcut: "⇧⌘Z",
              handler: sync.executeRedo,
            },
          ]
        : []),
      ...[...sync.redoableItems]
        .reverse()
        .slice(0, 5)
        .map((item, index) => ({
          id: `redo-op-${item.origOpId}`,
          label:
            index === 0 && !sync.canRedo
              ? `Redo: ${item.description}`
              : `Re-apply: ${item.description}`,
          description: "Re-apply a rolled-back server operation",
          category: "History" as const,
          handler: () => sync.handleServerRedo(item.origOpId),
        })),
    ];
  }, [sync]);

  const exportPresetCommands = useMemo<Command[]>(() => {
    void exportPresetRev;
    const presets = lsGetJson<Array<{ id: string; name: string }>>(
      STORAGE_KEYS.EXPORT_PRESETS,
      [],
    );

    return presets.map((preset) => ({
      id: `export-preset-${preset.id}`,
      label: `Export with preset: ${preset.name}`,
      description: "Apply export preset and open the Export panel",
      category: "Export" as const,
      handler: () => {
        lsSet(STORAGE_KEYS.EXPORT_PRESET_APPLY, preset.id);
        navigateTo("publish", "export");
        window.dispatchEvent(new CustomEvent("applyExportPreset"));
      },
    }));
  }, [exportPresetRev, navigateTo]);

  const commands = useMemo(
    () => [
      ...baseCommands,
      ...modeCompareCommands,
      ...collectionCommands,
      ...contextualCommands,
      ...undoRedoCommands,
      ...exportPresetCommands,
    ],
    [
      baseCommands,
      contextualCommands,
      collectionCommands,
      exportPresetCommands,
      modeCompareCommands,
      undoRedoCommands,
    ],
  );

  const currentCollectionPaletteTokens = useMemo<TokenEntry[]>(() => {
    const collectionFlat = perCollectionFlat[currentCollectionId] ?? {};
    return Object.entries(collectionFlat).map(([path, entry]) => ({
      path,
      type: entry.$type || "unknown",
      value:
        typeof entry.$value === "string"
          ? entry.$value
          : JSON.stringify(entry.$value),
      collectionId: currentCollectionId,
      isAlias: isAlias(entry.$value),
      generatorName:
        derivedTokenPaths.get(createGeneratorOwnershipKey(currentCollectionId, path))
          ?.name,
    }));
  }, [currentCollectionId, derivedTokenPaths, perCollectionFlat]);

  return { commands, currentCollectionPaletteTokens };
}
