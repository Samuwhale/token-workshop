import { useState, useEffect, useMemo } from 'react';
import type { RefObject } from 'react';
import type { Command, TokenEntry } from '../components/CommandPalette';
import type { TokenListImperativeHandle } from '../components/tokenListTypes';
import type { ThemeManagerHandle } from '../components/ThemeManager';
import type { StartHereBranch } from '../components/WelcomePrompt';
import type { OperationEntry } from './useRecentOperations';
import type { UndoSlot } from './useUndo';
import type { LintViolation } from './useLint';
import type { OverflowPanel } from '../shared/navigationTypes';
import { GRAPH_TEMPLATES } from '../components/graph-templates';
import { inferTypeFromValue } from '../components/tokenListHelpers';
import { isAlias } from '../../shared/resolveAlias';
import { adaptShortcut } from '../shared/utils';
import { SHORTCUT_KEYS } from '../shared/shortcutRegistry';
import { STORAGE_KEY, STORAGE_KEYS, lsGet, lsGetJson, lsSet } from '../shared/storage';
import { dispatchToast } from '../shared/toastBus';
import { useConnectionContext } from '../contexts/ConnectionContext';
import { useTokenSetsContext, useTokenFlatMapContext, useGeneratorContext } from '../contexts/TokenDataContext';
import { useThemeSwitcherContext } from '../contexts/ThemeContext';
import { useSelectionContext, useHeatmapContext } from '../contexts/InspectContext';
import { useNavigationContext } from '../contexts/NavigationContext';
import { useEditorContext } from '../contexts/EditorContext';

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export interface CommandPaletteCommandsOptions {
  // From usePreviewSplit (local state in App — not a context)
  showPreviewSplit: boolean;
  setShowPreviewSplit: (updater: boolean | ((v: boolean) => boolean)) => void;
  // From useLint (local state in App)
  lintViolations: LintViolation[];
  // Local App state
  themeGapCount: number;
  tokenListSelection: string[];
  openStartHere: (branch?: StartHereBranch, firstRun?: boolean) => void;
  setFlowPanelInitialPath: (v: string | null) => void;
  setPaletteDeleteConfirm: (v: { paths: string[]; label: string } | null) => void;
  // From useAnalyticsState (local state in App)
  setShowIssuesOnly: (updater: boolean | ((v: boolean) => boolean)) => void;
  // From useModalVisibility (local state in App — not a context)
  setShowPasteModal: (v: boolean) => void;
  setShowColorScaleGen: (v: boolean) => void;
  setShowKeyboardShortcuts: (v: boolean | ((v: boolean) => boolean)) => void;
  setShowQuickApply: (v: boolean) => void;
  setShowSetSwitcher: (v: boolean) => void;
  setShowManageSets: (v: boolean) => void;
  // From useGraphState (local state in App — not a context)
  setPendingGraphTemplate: (v: string | null) => void;
  // Callbacks computed in App
  refreshValidation: () => void;
  jumpToNextIssue: () => void;
  openOverflowPanel: (panel: OverflowPanel) => void;
  handlePaletteRename: (path: string) => void;
  handlePaletteDuplicate: (path: string) => void;
  handlePaletteMove: (path: string) => void;
  handleOpenCrossThemeCompare: (path: string) => void;
  // Refs
  tokenListCompareRef: RefObject<TokenListImperativeHandle | null>;
  themeManagerHandleRef: RefObject<ThemeManagerHandle | null>;
  // From useRecentOperations
  recentOperations: OperationEntry[];
  handleRollback: (id: string) => void;
  redoableItems: Array<{ origOpId: string; description: string }>;
  handleServerRedo: (id: string) => void;
  // From useUndo
  canRedo: boolean;
  redoSlot: UndoSlot | null;
  executeRedo: () => void;
}

export function useCommandPaletteCommands(opts: CommandPaletteCommandsOptions): {
  commands: Command[];
  activeSetPaletteTokens: TokenEntry[];
} {
  const { connected, serverUrl } = useConnectionContext();
  const { sets, activeSet, setActiveSet, setTokenCounts } = useTokenSetsContext();
  const { allTokensFlat, pathToSet, perSetFlat } = useTokenFlatMapContext();
  const { derivedTokenPaths } = useGeneratorContext();
  const { navigateTo, setOverflowPanel } = useNavigationContext();
  const { dimensions } = useThemeSwitcherContext();
  const { selectedNodes } = useSelectionContext();
  const { triggerHeatmapScan } = useHeatmapContext();
  const { highlightedToken, setHighlightedToken, setEditingToken } = useEditorContext();

  const {
    showPreviewSplit, setShowPreviewSplit,
    lintViolations, themeGapCount, tokenListSelection,
    setShowIssuesOnly, openStartHere,
    setFlowPanelInitialPath, setPaletteDeleteConfirm,
    setShowPasteModal, setShowColorScaleGen,
    setShowKeyboardShortcuts, setShowQuickApply, setShowSetSwitcher, setShowManageSets,
    setPendingGraphTemplate,
    refreshValidation, jumpToNextIssue, openOverflowPanel,
    handlePaletteRename, handlePaletteDuplicate, handlePaletteMove,
    handleOpenCrossThemeCompare,
    tokenListCompareRef, themeManagerHandleRef,
    recentOperations, handleRollback,
    canRedo, redoSlot, executeRedo,
    redoableItems, handleServerRedo,
  } = opts;

  // Track export preset changes so the command palette stays in sync.
  const [exportPresetRev, setExportPresetRev] = useState(0);
  const [tokenListViewRev, setTokenListViewRev] = useState(0);
  useEffect(() => {
    const onChanged = () => setExportPresetRev(r => r + 1);
    window.addEventListener('exportPresetsChanged', onChanged);
    return () => window.removeEventListener('exportPresetsChanged', onChanged);
  }, []);
  useEffect(() => {
    const onChanged = () => setTokenListViewRev(r => r + 1);
    window.addEventListener('tm-token-list-view-changed', onChanged);
    return () => window.removeEventListener('tm-token-list-view-changed', onChanged);
  }, []);

  // Split the command palette registry into focused sub-memos so that
  // frequently-changing state (highlightedToken on every hover, undo stack on
  // every op) only rebuilds its own small slice instead of all 40+ commands.

  // Base commands: stable navigation / action commands.
  const baseCommands = useMemo<Command[]>(() => {
    const goToTokens = () => { navigateTo('define', 'tokens'); setEditingToken(null); };
    const goToTokensAndRun = (fn: (handle: TokenListImperativeHandle) => void) => {
      goToTokens();
      setTimeout(() => {
        const handle = tokenListCompareRef.current;
        if (!handle) return;
        fn(handle);
      }, 0);
    };
    const tokenJsonView = lsGet(STORAGE_KEY.tokenViewMode(activeSet)) === 'json';
    const tokenResolvedValues = lsGet(STORAGE_KEY.tokenShowResolvedValues(activeSet)) === '1';
    const tokenStatsBarOpen = lsGet(STORAGE_KEYS.TOKEN_STATS_BAR_OPEN) === 'true';
    return [
      {
        id: 'new-token',
        label: 'Create new token',
        description: 'Open the token editor in create mode',
        category: 'Tokens',
        shortcut: adaptShortcut('⌘N'),
        handler: () => { navigateTo('define', 'tokens'); setEditingToken({ path: '', set: activeSet, isCreate: true }); },
      },
      {
        id: 'generate-scale',
        label: 'Generate a scale',
        description: 'Create a scale of tokens from a generator template',
        category: 'Tokens',
        handler: () => { navigateTo('define', 'generators'); },
      },
      {
        id: 'switch-set',
        label: 'Switch set\u2026',
        description: `${sets.length} set${sets.length !== 1 ? 's' : ''} available`,
        category: 'Sets',
        shortcut: adaptShortcut(SHORTCUT_KEYS.QUICK_SWITCH_SET),
        handler: () => setShowSetSwitcher(true),
      },
      {
        id: 'manage-sets',
        label: 'Manage sets\u2026',
        description: `Create, rename, duplicate, reorder, and delete sets`,
        category: 'Sets',
        handler: () => setShowManageSets(true),
      },
      {
        id: 'paste-tokens',
        label: 'Paste tokens',
        description: 'Create tokens from JSON, CSS vars, CSV, or Tailwind config',
        category: 'Tokens',
        shortcut: adaptShortcut(SHORTCUT_KEYS.PASTE_TOKENS),
        handler: () => setShowPasteModal(true),
      },
      {
        id: 'new-from-clipboard',
        label: 'New token from clipboard',
        description: 'Create a single token pre-filled with your clipboard value',
        category: 'Tokens',
        handler: async () => {
          try {
            const text = await navigator.clipboard.readText();
            const trimmed = text?.trim();
            if (!trimmed) {
              dispatchToast('Clipboard is empty', 'error');
              return;
            }
            const inferredType = inferTypeFromValue(trimmed) || 'string';
            goToTokens();
            setEditingToken({ path: '', set: activeSet, isCreate: true, initialType: inferredType, initialValue: trimmed });
          } catch (err) {
            console.warn('[App] clipboard read failed:', err);
            dispatchToast('Could not read clipboard \u2014 browser may have denied access', 'error');
          }
        },
      },
      {
        id: 'find-replace-names',
        label: 'Find & Replace Names',
        description: 'Rename token paths by pattern',
        category: 'Tokens',
        handler: goToTokens,
      },
      {
        id: 'recents-favorites',
        label: 'Show Recent Tokens',
        description: 'Jump to Tokens and filter the list to recently touched items',
        category: 'View',
        handler: () => {
          navigateTo('define', 'tokens');
          setEditingToken(null);
          setTimeout(() => { tokenListCompareRef.current?.showRecentlyTouched(); }, 0);
        },
      },
      {
        id: 'import',
        label: 'Import Tokens',
        description: 'Import tokens from a file',
        category: 'Data',
        handler: () => openOverflowPanel('import'),
      },
      {
        id: 'export',
        label: 'Export Tokens',
        description: 'Export tokens as CSS, JSON, or other formats',
        category: 'Data',
        handler: () => navigateTo('ship', 'export'),
      },
      {
        id: 'toggle-preview',
        label: showPreviewSplit ? 'Hide preview panel' : 'Show preview panel',
        description: 'Split-view with live token previews \u2014 colors, typography, buttons, and more',
        category: 'View',
        shortcut: adaptShortcut(SHORTCUT_KEYS.TOGGLE_PREVIEW),
        handler: () => { setShowPreviewSplit(v => !v); setOverflowPanel(null); },
      },
      {
        id: 'toggle-token-json-view',
        label: tokenJsonView ? 'Switch token list to tree view' : 'Switch token list to JSON view',
        description: tokenJsonView ? `Leave the raw JSON editor for "${activeSet}"` : `Open the raw JSON editor for "${activeSet}"`,
        category: 'View',
        handler: () => goToTokensAndRun(handle => handle.toggleJsonView()),
      },
      {
        id: 'toggle-token-resolved-values',
        label: tokenResolvedValues ? 'Hide resolved token values' : 'Show resolved token values',
        description: tokenResolvedValues ? `Show alias references in "${activeSet}"` : `Resolve aliases inline in "${activeSet}"`,
        category: 'View',
        handler: () => goToTokensAndRun(handle => handle.toggleResolvedValues()),
      },
      {
        id: 'toggle-token-stats-bar',
        label: tokenStatsBarOpen ? 'Hide token stats bar' : 'Show token stats bar',
        description: 'Toggle the token type and per-set summary panel',
        category: 'View',
        handler: () => goToTokensAndRun(handle => handle.toggleStatsBar()),
      },
      {
        id: 'settings',
        label: 'Open Settings',
        description: 'UI preferences, server, lint rules, and export defaults',
        category: 'Settings',
        handler: () => openOverflowPanel('settings'),
      },
      {
        id: 'restart-guided-setup',
        label: 'Restart guided setup',
        description: 'Jump back into the guided system setup flow for foundations, semantics, and themes',
        category: 'Settings',
        handler: () => { setOverflowPanel(null); openStartHere('guided-setup'); },
      },
      {
        id: 'quick-apply',
        label: 'Quick apply token to selection',
        description: 'Contextual token picker \u2014 infers property, shows relevant tokens',
        category: 'Selection',
        shortcut: adaptShortcut(SHORTCUT_KEYS.TOGGLE_QUICK_APPLY),
        handler: () => { if (selectedNodes.length > 0) setShowQuickApply(true); },
      },
      {
        id: 'inspect',
        label: 'Go to Inspect',
        description: 'Inspect token bindings on selected layers',
        category: 'Navigation',
        handler: () => navigateTo('apply', 'inspect'),
      },
      {
        id: 'themes',
        label: 'Open Themes',
        description: 'Manage design themes and set assignments',
        category: 'Navigation',
        handler: () => navigateTo('define', 'themes'),
      },
      {
        id: 'autofill-theme-gaps',
        label: 'Auto-fill theme gaps',
        description: themeGapCount > 0
          ? `Fill ${themeGapCount} missing token value${themeGapCount !== 1 ? 's' : ''} from source sets`
          : 'No fillable gaps detected \u2014 open Themes to run a coverage check',
        category: 'Themes',
        handler: () => {
          navigateTo('define', 'themes');
          // Small delay so ThemeManager has time to mount / receive focus before the modal opens
          setTimeout(() => { themeManagerHandleRef.current?.autoFillAllGaps(); }, 150);
        },
      },
      {
        id: 'resolver',
        label: 'Open DTCG Resolver',
        description: 'Configure DTCG v2025.10 resolver rules and preview resolved tokens (in Themes)',
        category: 'Navigation',
        shortcut: adaptShortcut(SHORTCUT_KEYS.GO_TO_RESOLVER),
        handler: () => { navigateTo('define', 'themes'); setTimeout(() => { themeManagerHandleRef.current?.switchToResolverMode(); }, 50); },
      },
      {
        id: 'canvas-coverage',
        label: 'Canvas Coverage',
        description: 'Token binding coverage heatmap for the canvas',
        category: 'Navigation',
        handler: () => { navigateTo('apply', 'canvas-analysis'); triggerHeatmapScan(); },
      },
      {
        id: 'canvas-consistency',
        label: 'Canvas Suggestions',
        description: 'Near-match token consistency check for the canvas',
        category: 'Navigation',
        handler: () => navigateTo('apply', 'canvas-analysis'),
      },
      {
        id: 'canvas-components',
        label: 'Canvas Components',
        description: 'Component token coverage report',
        category: 'Navigation',
        handler: () => navigateTo('apply', 'canvas-analysis'),
      },
      {
        id: 'publish',
        label: 'Go to Publish',
        description: 'Sync tokens to Figma and export',
        category: 'Navigation',
        handler: () => navigateTo('ship', 'publish'),
      },
      {
        id: 'analytics',
        label: 'Filter Validation Issues',
        description: 'Show only tokens with lint violations',
        category: 'Tokens',
        handler: () => { setShowIssuesOnly(v => !v); navigateTo('define', 'tokens'); },
      },
      {
        id: 'next-issue',
        label: 'Jump to Next Issue',
        description: lintViolations.length > 0
          ? `Cycle through ${lintViolations.length} validation issue${lintViolations.length === 1 ? '' : 's'} in the current set`
          : 'No validation issues in the current set',
        category: 'Tokens',
        shortcut: SHORTCUT_KEYS.NEXT_LINT_ISSUE,
        handler: jumpToNextIssue,
      },
      {
        id: 'validate',
        label: 'Validate All Tokens',
        description: 'Run cross-set validation for broken references, circular refs, and more',
        category: 'Tokens',
        handler: () => { navigateTo('ship', 'health'); refreshValidation(); },
      },
      {
        id: 'health-dashboard',
        label: 'Token Health',
        description: 'Validation report, lint summary, generator health, canvas coverage, and unused tokens',
        category: 'Navigation',
        handler: () => navigateTo('ship', 'health'),
      },
      {
        id: 'generate-color-scale',
        label: 'Generate Color Scale',
        description: 'Create a perceptually uniform color ramp',
        category: 'Tokens',
        handler: () => { goToTokens(); setShowColorScaleGen(true); },
      },
      {
        id: 'new-graph',
        label: 'New generator',
        description: 'Create a token generator \u2014 color ramps, spacing scales, type scales, and more',
        category: 'Generate',
        handler: () => navigateTo('define', 'generators'),
      },
      {
        id: 'open-graph',
        label: 'Open Generators',
        description: 'View token generators for the current set',
        category: 'Generate',
        handler: () => navigateTo('define', 'generators'),
      },
      ...GRAPH_TEMPLATES.map(t => ({
        id: `graph-template-${t.id}`,
        label: `Generate ${t.label}`,
        description: `Generator template \u2014 ${t.description}`,
        category: 'Generate' as const,
        handler: () => {
          navigateTo('define', 'generators');
          setPendingGraphTemplate(t.id);
        },
      })),
      {
        id: 'guided-setup',
        label: 'Guided setup',
        description: 'Step through foundations, semantic roles, and theme modes',
        category: 'Help',
        handler: () => openStartHere('guided-setup'),
      },
      {
        id: 'view-style-guide',
        label: 'View style guide',
        description: connected ? `Open ${serverUrl}/docs in browser` : 'Connect to server first',
        category: 'Help',
        handler: () => { if (connected) window.open(`${serverUrl}/docs`, '_blank', 'noopener,noreferrer'); },
      },
      {
        id: 'keyboard-shortcuts',
        label: 'Keyboard shortcuts\u2026',
        description: 'View all keyboard shortcuts',
        category: 'Help',
        shortcut: SHORTCUT_KEYS.SHOW_SHORTCUTS,
        handler: () => setShowKeyboardShortcuts(true),
      },
      {
        id: 'compare-tokens',
        label: 'Compare tokens\u2026',
        description: 'Enter multi-select mode and compare two or more tokens side-by-side',
        category: 'Tokens',
        handler: () => { navigateTo('define', 'tokens'); tokenListCompareRef.current?.openCompareMode(); },
      },
    ];
  }, [activeSet, sets, openOverflowPanel, navigateTo, triggerHeatmapScan, selectedNodes, lintViolations, jumpToNextIssue, showPreviewSplit, setShowPreviewSplit, connected, serverUrl, themeGapCount, refreshValidation, setEditingToken, setOverflowPanel, setPendingGraphTemplate, setShowColorScaleGen, setShowIssuesOnly, setShowKeyboardShortcuts, setShowManageSets, setShowPasteModal, setShowQuickApply, setShowSetSwitcher, openStartHere, themeManagerHandleRef, tokenListCompareRef, tokenListViewRev]);

  // Per-set switch commands — rebuilds when the set list or token counts change.
  const setCommands = useMemo<Command[]>(() => {
    const goToTokens = () => { navigateTo('define', 'tokens'); setEditingToken(null); };
    return sets.map(s => ({
      id: `switch-set-${s}`,
      label: `Switch to Set: ${s}`,
      description: `${setTokenCounts[s] ?? 0} tokens`,
      category: 'Sets' as const,
      handler: () => { setActiveSet(s); goToTokens(); },
    }));
  }, [sets, setTokenCounts, navigateTo, setActiveSet, setEditingToken]);

  // Theme compare commands — rebuilds when dimensions change (rare: theme config edits).
  const themeCompareCommands = useMemo<Command[]>(() => [
    ...(dimensions.length > 0 ? [{
      id: 'compare-theme-options',
      label: 'Compare theme options\u2026',
      description: 'Side-by-side token diff across theme options',
      category: 'Themes' as const,
      handler: () => {
        themeManagerHandleRef.current?.navigateToCompare('theme-options');
        navigateTo('define', 'themes');
      },
    }] : []),
    ...dimensions.filter(d => d.options.length >= 2).map(d => ({
      id: `compare-dim-${d.id}`,
      label: `Compare ${d.name}: ${d.options[0].name} vs ${d.options[1].name}`,
      description: `See token differences across ${d.name} options`,
      category: 'Themes' as const,
      handler: () => {
        themeManagerHandleRef.current?.navigateToCompare('theme-options', undefined, undefined, `${d.id}:${d.options[0].name}`, `${d.id}:${d.options[1].name}`);
        navigateTo('define', 'themes');
      },
    })),
  ], [dimensions, navigateTo, themeManagerHandleRef]);

  // Contextual commands — rebuilds on hover/selection changes (most frequent).
  // Kept small (~5 entries) so the rebuild cost is negligible.
  const contextualCommands = useMemo<Command[]>(() => {
    const inActiveSet = !!(highlightedToken && pathToSet[highlightedToken] === activeSet);
    return [
    ...(inActiveSet ? [{
      id: 'rename-highlighted-token',
      label: `Rename: ${highlightedToken}`,
      description: 'Start inline rename mode for this token',
      category: 'Tokens' as const,
      handler: () => handlePaletteRename(highlightedToken!),
    }] : []),
    ...(inActiveSet ? [{
      id: 'duplicate-highlighted-token',
      label: `Duplicate: ${highlightedToken}`,
      description: 'Create a copy of this token with a new path',
      category: 'Tokens' as const,
      handler: () => { handlePaletteDuplicate(highlightedToken!); },
    }] : []),
    ...(inActiveSet ? [{
      id: 'move-highlighted-token',
      label: `Move to set: ${highlightedToken}`,
      description: 'Move this token to a different token set',
      category: 'Tokens' as const,
      handler: () => handlePaletteMove(highlightedToken!),
    }] : []),
    ...(inActiveSet ? [{
      id: 'extract-highlighted-token-to-alias',
      label: `Extract to alias: ${highlightedToken}`,
      description: 'Create a primitive alias token and replace this value with a reference',
      category: 'Tokens' as const,
      handler: () => {
        const entry = allTokensFlat[highlightedToken!];
        navigateTo('define', 'tokens');
        setHighlightedToken(highlightedToken!);
        tokenListCompareRef.current?.triggerExtractToAlias(highlightedToken!, entry?.$type, entry?.$value);
      },
    }] : []),
    ...(inActiveSet ? [{
      id: 'delete-highlighted-token',
      label: `Delete token: ${highlightedToken}`,
      description: `Permanently delete this token from set "${activeSet}"`,
      category: 'Tokens' as const,
      handler: () => setPaletteDeleteConfirm({ paths: [highlightedToken!], label: `Delete "${highlightedToken}"?` }),
    }] : []),
    ...(tokenListSelection.length > 0 ? [{
      id: 'delete-selected-tokens',
      label: `Delete ${tokenListSelection.length} selected token${tokenListSelection.length !== 1 ? 's' : ''}`,
      description: `Permanently delete ${tokenListSelection.length} token${tokenListSelection.length !== 1 ? 's' : ''} from set "${activeSet}"`,
      category: 'Tokens' as const,
      handler: () => setPaletteDeleteConfirm({
        paths: tokenListSelection,
        label: `Delete ${tokenListSelection.length} token${tokenListSelection.length !== 1 ? 's' : ''}?`,
      }),
    }] : []),
    ...(highlightedToken ? [{
      id: 'show-dependencies',
      label: `Show dependencies: ${highlightedToken}`,
      description: 'View what aliases and tokens reference this token',
      category: 'Tokens' as const,
      handler: () => { setFlowPanelInitialPath(highlightedToken); navigateTo('apply', 'dependencies'); },
    }] : []),
    ...(dimensions.length > 0 && highlightedToken ? [{
      id: 'compare-across-themes',
      label: `Compare across themes: ${highlightedToken}`,
      description: 'See how this token\u2019s value varies across all theme options',
      category: 'Tokens' as const,
      handler: () => { handleOpenCrossThemeCompare(highlightedToken); },
    }] : []),
    ...(dimensions.length > 0 && !highlightedToken ? [{
      id: 'compare-across-themes-pick',
      label: 'Compare token across themes\u2026',
      description: 'Focus a token first, then run this command to compare its values across theme options',
      category: 'Tokens' as const,
      handler: () => { themeManagerHandleRef.current?.navigateToCompare('cross-theme'); navigateTo('define', 'themes'); },
    }] : []),
  ];
  }, [highlightedToken, tokenListSelection, pathToSet, activeSet, dimensions, setPaletteDeleteConfirm, navigateTo, setFlowPanelInitialPath, handleOpenCrossThemeCompare, handlePaletteRename, handlePaletteDuplicate, handlePaletteMove, allTokensFlat, setHighlightedToken, themeManagerHandleRef, tokenListCompareRef]);

  // Undo/redo commands — rebuilds when the operation log or redo stack changes.
  const undoRedoCommands = useMemo<Command[]>(() => [
    ...recentOperations
      .filter(op => !op.rolledBack)
      .slice(0, 5)
      .map((op, i) => ({
        id: `undo-op-${op.id}`,
        label: i === 0 ? `Undo: ${op.description}` : `Rollback: ${op.description}`,
        description: `${op.affectedPaths.length} path(s) \u00b7 ${op.setName} \u00b7 ${timeAgo(op.timestamp)}`,
        category: 'Undo' as const,
        handler: () => handleRollback(op.id),
      })),
    ...(canRedo && redoSlot ? [{
      id: 'redo-local',
      label: `Redo: ${redoSlot.description}`,
      description: 'Re-apply the last undone action',
      category: 'Undo' as const,
      shortcut: '\u21e7\u2318Z',
      handler: executeRedo,
    }] : []),
    ...[...redoableItems].reverse().slice(0, 5).map((item, i) => ({
      id: `redo-op-${item.origOpId}`,
      label: i === 0 && !canRedo ? `Redo: ${item.description}` : `Re-apply: ${item.description}`,
      description: 'Re-apply a rolled-back server operation',
      category: 'Undo' as const,
      handler: () => handleServerRedo(item.origOpId),
    })),
  ], [recentOperations, handleRollback, canRedo, redoSlot, executeRedo, redoableItems, handleServerRedo]);

  // Export preset commands — one entry per saved preset.
  // Rebuilds only when presets change (exportPresetRev bumped by custom event from ExportPanel).
  const exportPresetCommands = useMemo<Command[]>(() => {
    const presets = lsGetJson<Array<{ id: string; name: string }>>(STORAGE_KEYS.EXPORT_PRESETS, []);
    return presets.map(preset => ({
      id: `export-preset-${preset.id}`,
      label: `Export with preset: ${preset.name}`,
      description: 'Apply export preset and open the Export panel',
      category: 'Data' as const,
      handler: () => {
        lsSet(STORAGE_KEYS.EXPORT_PRESET_APPLY, preset.id);
        navigateTo('ship', 'export');
        window.dispatchEvent(new CustomEvent('applyExportPreset'));
      },
    }));
  // exportPresetRev is the only dep that changes when presets are added/removed/renamed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportPresetRev, navigateTo]);

  // Merge all command slices. Each slice has a stable reference until its own
  // deps change, so this array spread is the only work done on hover events.
  const commands = useMemo(
    () => [...baseCommands, ...themeCompareCommands, ...setCommands, ...contextualCommands, ...undoRedoCommands, ...exportPresetCommands],
    [baseCommands, themeCompareCommands, setCommands, contextualCommands, undoRedoCommands, exportPresetCommands],
  );

  // Flat token list for command palette — active set only (default mode)
  const activeSetPaletteTokens = useMemo<TokenEntry[]>(() => {
    const setFlat = perSetFlat[activeSet] ?? {};
    return Object.entries(setFlat).map(([path, entry]) => ({
      path,
      type: entry.$type || 'unknown',
      value: typeof entry.$value === 'string' ? entry.$value : JSON.stringify(entry.$value),
      set: activeSet,
      isAlias: isAlias(entry.$value),
      generatorName: derivedTokenPaths.get(path)?.name,
    }));
  }, [perSetFlat, activeSet, derivedTokenPaths]);

  return { commands, activeSetPaletteTokens };
}
