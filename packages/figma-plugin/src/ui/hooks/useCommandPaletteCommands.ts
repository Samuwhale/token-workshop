import { useState, useEffect, useMemo } from "react";
import { createRecipeOwnershipKey } from "@tokenmanager/core";
import type { Command, TokenEntry } from "../components/CommandPalette";
import { GRAPH_TEMPLATES } from "../components/graph-templates";
import { inferTypeFromValue } from "../components/tokenListHelpers";
import { isAlias } from "../../shared/resolveAlias";
import { adaptShortcut } from "../shared/utils";
import { SHORTCUT_KEYS } from "../shared/shortcutRegistry";
import {
  STORAGE_KEY,
  STORAGE_KEYS,
  lsGet,
  lsGetJson,
  lsSet,
} from "../shared/storage";
import { dispatchToast } from "../shared/toastBus";
import {
  useTokenSetsContext,
  useTokenFlatMapContext,
  useRecipeContext,
} from "../contexts/TokenDataContext";
import { useThemeSwitcherContext } from "../contexts/ThemeContext";
import { useSelectionContext } from "../contexts/InspectContext";
import { useNavigationContext } from "../contexts/NavigationContext";
import { useEditorContext } from "../contexts/EditorContext";
import {
  useShellWorkspaceController,
  useSyncWorkspaceController,
  useThemeWorkspaceController,
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
  activeSetPaletteTokens: TokenEntry[];
} {
  const { sets, activeSet, setActiveSet, setTokenCounts } =
    useTokenSetsContext();
  const { allTokensFlat, pathToSet, perSetFlat } = useTokenFlatMapContext();
  const { derivedTokenPaths } = useRecipeContext();
  const { navigateTo, openSecondarySurface, closeSecondarySurface } =
    useNavigationContext();
  const { dimensions } = useThemeSwitcherContext();
  const { selectedNodes } = useSelectionContext();
  const { highlightedToken, setHighlightedToken, setEditingToken } =
    useEditorContext();
  const shell = useShellWorkspaceController();
  const tokens = useTokensWorkspaceController();
  const themes = useThemeWorkspaceController();
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

    const tokenJsonView = lsGet(STORAGE_KEY.tokenViewMode(activeSet)) === "json";
    const tokenResolvedValues =
      lsGet(STORAGE_KEY.tokenShowResolvedValues(activeSet)) === "1";
    const tokenStatsBarOpen = lsGet(STORAGE_KEYS.TOKEN_STATS_BAR_OPEN) === "true";

    return [
      {
        id: "new-token",
        label: "Create new token",
        description: `Start a new token in "${activeSet}"`,
        category: "Tokens",
        shortcut: adaptShortcut("⌘N"),
        handler: () => {
          navigateTo("tokens");
          setEditingToken({ path: "", set: activeSet, isCreate: true });
        },
      },
      {
        id: "switch-set",
        label: "Switch set…",
        description: `Jump between ${sets.length} token set${sets.length !== 1 ? "s" : ""}`,
        category: "Sets",
        shortcut: adaptShortcut(SHORTCUT_KEYS.QUICK_SWITCH_SET),
        handler: shell.toggleSetSwitcher,
      },
      {
        id: "manage-sets",
        label: "Open set manager",
        description:
          "Rename, reorder, merge, split, annotate, and bulk-edit token sets",
        category: "Sets",
        handler: () => {
          navigateTo("tokens");
          openSecondarySurface("sets");
        },
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
              set: activeSet,
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
          ? `Return to the structured token tree for "${activeSet}"`
          : `Open the raw JSON editor for "${activeSet}"`,
        category: "Views",
        handler: () => goToTokensAndRun((handle) => handle.toggleJsonView()),
      },
      {
        id: "toggle-token-resolved-values",
        label: tokenResolvedValues
          ? "Hide resolved token values"
          : "Show resolved token values",
        description: tokenResolvedValues
          ? `Show alias references again in "${activeSet}"`
          : `Resolve aliases inline while browsing "${activeSet}"`,
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
          "Refresh validation across references, duplicates, and recipe output",
        category: "Audit",
        handler: () => {
          navigateTo("sync", "health");
          void sync.refreshValidation();
        },
      },
      {
        id: "generate-color-scale",
        label: "Generate Color Scale",
        description: "Open the fast color ramp tool",
        category: "Tokens",
        handler: () => {
          goToTokens();
          shell.openColorScaleRecipe();
        },
      },
      ...GRAPH_TEMPLATES.map((template) => ({
        id: `graph-template-${template.id}`,
        label: `Create recipe: ${template.label}`,
        description: template.description,
        category: "Recipes" as const,
        handler: () => {
          navigateTo("recipes");
          tokens.setPendingGraphTemplate(template.id);
        },
      })),
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
      ...(themes.themeGapCount > 0
        ? [
            {
              id: "autofill-theme-gaps",
              label: "Auto-fill mode gaps",
              description: `Fill ${themes.themeGapCount} missing token value${themes.themeGapCount !== 1 ? "s" : ""} from source sets`,
              category: "Modes" as const,
              handler: () => {
                navigateTo("themes");
                setTimeout(() => {
                  themes.themeManagerHandleRef.current?.autoFillAllGaps();
                }, 150);
              },
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
              description: `Cycle through ${tokens.lintViolations.length} validation issue${tokens.lintViolations.length === 1 ? "" : "s"} in the current set`,
              category: "Audit" as const,
              shortcut: SHORTCUT_KEYS.NEXT_LINT_ISSUE,
              handler: tokens.jumpToNextIssue,
            },
          ]
        : []),
    ];
  }, [
    activeSet,
    sets.length,
    navigateTo,
    openSecondarySurface,
    selectedNodes.length,
    setEditingToken,
    shell,
    closeSecondarySurface,
    tokens,
    themes,
    sync,
    tokenListViewRev,
  ]);

  const setCommands = useMemo<Command[]>(() => {
    const goToTokens = () => {
      navigateTo("tokens");
      setEditingToken(null);
    };

    return sets.map((setName) => ({
      id: `switch-set-${setName}`,
      label: `Switch to Set: ${setName}`,
      description: `${setTokenCounts[setName] ?? 0} tokens`,
      category: "Sets" as const,
      handler: () => {
        setActiveSet(setName);
        goToTokens();
      },
    }));
  }, [navigateTo, setActiveSet, setEditingToken, setTokenCounts, sets]);

  const themeCompareCommands = useMemo<Command[]>(() => {
    return [
      ...(dimensions.length > 0
        ? [
            {
              id: "compare-theme-options",
              label: "Compare mode options…",
              description: "Open a side-by-side diff across mode options",
              category: "Modes" as const,
              handler: () => {
                themes.themeManagerHandleRef.current?.navigateToCompare(
                  "theme-options",
                );
                navigateTo("themes");
              },
            },
          ]
        : []),
      ...dimensions
        .filter((dimension) => dimension.options.length >= 2)
        .map((dimension) => ({
          id: `compare-dim-${dimension.id}`,
          label: `Compare ${dimension.name}: ${dimension.options[0].name} vs ${dimension.options[1].name}`,
          description: `See token differences across ${dimension.name} options`,
          category: "Modes" as const,
          handler: () => {
            themes.themeManagerHandleRef.current?.navigateToCompare(
              "theme-options",
              undefined,
              undefined,
              `${dimension.id}:${dimension.options[0].name}`,
              `${dimension.id}:${dimension.options[1].name}`,
            );
            navigateTo("themes");
          },
        })),
    ];
  }, [dimensions, navigateTo, themes.themeManagerHandleRef]);

  const contextualCommands = useMemo<Command[]>(() => {
    const inActiveSet =
      !!highlightedToken && pathToSet[highlightedToken] === activeSet;

    return [
      ...(inActiveSet
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
              label: `Move to set: ${highlightedToken}`,
              description: "Move this token to a different token set",
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
              description: `Permanently delete this token from set "${activeSet}"`,
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
              description: `Permanently delete ${tokens.tokenListSelection.length} token${tokens.tokenListSelection.length !== 1 ? "s" : ""} from set "${activeSet}"`,
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
                navigateTo("sync", "health");
              },
            },
          ]
        : []),
      ...(dimensions.length > 0 && highlightedToken
        ? [
            {
              id: "compare-across-themes",
              label: `Compare across modes: ${highlightedToken}`,
              description:
                "See how this token’s value varies across all mode options",
              category: "Modes" as const,
              handler: () =>
                tokens.handleOpenCrossThemeCompare(highlightedToken),
            },
          ]
        : []),
      ...(dimensions.length > 0 && !highlightedToken
        ? [
            {
              id: "compare-across-themes-pick",
              label: "Compare token across modes…",
              description:
                "Focus a token first, then run this command to compare its values across mode options",
              category: "Modes" as const,
              handler: () => {
                themes.themeManagerHandleRef.current?.navigateToCompare(
                  "cross-theme",
                );
                navigateTo("themes");
              },
            },
          ]
        : []),
    ];
  }, [
    activeSet,
    allTokensFlat,
    dimensions.length,
    highlightedToken,
    navigateTo,
    pathToSet,
    setHighlightedToken,
    themes.themeManagerHandleRef,
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
          description: `${operation.affectedPaths.length} path(s) · ${operation.setName} · ${timeAgo(operation.timestamp)}`,
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
        navigateTo("sync", "export");
        window.dispatchEvent(new CustomEvent("applyExportPreset"));
      },
    }));
  }, [exportPresetRev, navigateTo]);

  const commands = useMemo(
    () => [
      ...baseCommands,
      ...themeCompareCommands,
      ...setCommands,
      ...contextualCommands,
      ...undoRedoCommands,
      ...exportPresetCommands,
    ],
    [
      baseCommands,
      contextualCommands,
      exportPresetCommands,
      setCommands,
      themeCompareCommands,
      undoRedoCommands,
    ],
  );

  const activeSetPaletteTokens = useMemo<TokenEntry[]>(() => {
    const setFlat = perSetFlat[activeSet] ?? {};
    return Object.entries(setFlat).map(([path, entry]) => ({
      path,
      type: entry.$type || "unknown",
      value:
        typeof entry.$value === "string"
          ? entry.$value
          : JSON.stringify(entry.$value),
      set: activeSet,
      isAlias: isAlias(entry.$value),
      recipeName:
        derivedTokenPaths.get(createRecipeOwnershipKey(activeSet, path))
          ?.name,
    }));
  }, [activeSet, derivedTokenPaths, perSetFlat]);

  return { commands, activeSetPaletteTokens };
}
