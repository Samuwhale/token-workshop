import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Spinner } from './Spinner';
import type { ThemeDimension, ThemeOption } from '@tokenmanager/core';
import type { UndoSlot } from '../hooks/useUndo';
import type { ResolverContentProps } from './ResolverPanel';
import { ResolverContent } from './ResolverPanel';
import type { CoverageToken } from './themeManagerTypes';
import { STATE_LABELS, STATE_DESCRIPTIONS } from './themeManagerTypes';
import { useThemeDragDrop } from '../hooks/useThemeDragDrop';
import { useThemeBulkOps } from '../hooks/useThemeBulkOps';
import { UnifiedComparePanel } from './UnifiedComparePanel';
import type { CompareMode } from './UnifiedComparePanel';
import type { TokenMapEntry } from '../../shared/types';
import { useThemeAutoFill } from '../hooks/useThemeAutoFill';
import { useThemeDimensions } from '../hooks/useThemeDimensions';
import { useThemeOptions } from '../hooks/useThemeOptions';
import { useThemeCoverage } from '../hooks/useThemeCoverage';
import { useThemeCompare } from '../hooks/useThemeCompare';
import { ThemeManagerModalsProvider, ThemeManagerModals } from './ThemeManagerContext';
import type { ThemeManagerModalsState } from './ThemeManagerContext';
import { ThemeCoverageMatrix } from './ThemeCoverageMatrix';
import { adaptShortcut } from '../shared/utils';
import { SHORTCUT_KEYS } from '../shared/shortcutRegistry';
import { apiFetch } from '../shared/apiFetch';
import type { ThemeAuthoringStage, ThemeManagerView, ThemeWorkspaceShellState } from '../shared/themeWorkflow';

export interface ThemeManagerHandle {
  /** Triggers auto-fill for the first dimension that has fillable gaps, showing the confirmation modal. */
  autoFillAllGaps: () => void;
  /** Opens the Compare view inside ThemeManager for the given mode. */
  navigateToCompare: (mode: CompareMode, path?: string, tokenPaths?: Set<string>, optionA?: string, optionB?: string) => void;
  /** Focus one of the default authoring stages inside the Theme workspace. */
  focusStage: (stage: ThemeAuthoringStage) => void;
  /** Returns to authoring and opens the create-axis entry point. */
  openCreateAxis: () => void;
  /** Returns from coverage/compare/advanced views to the default authoring flow. */
  returnToAuthoring: () => void;
  /** Switches to the DTCG Resolvers mode (advanced) inside ThemeManager. */
  switchToResolverMode: () => void;
}

interface ThemeManagerProps {
  serverUrl: string;
  connected: boolean;
  sets: string[];
  onDimensionsChange?: (dimensions: ThemeDimension[]) => void;
  onNavigateToToken?: (path: string, set: string) => void;
  onCreateToken?: (tokenPath: string, set: string) => void;
  onPushUndo?: (slot: UndoSlot) => void;
  /** Resolver state — when provided, enables the Advanced mode toggle */
  resolverState?: ResolverContentProps;
  /** Flat token map across all sets (for ThemeCompare) */
  allTokensFlat?: Record<string, TokenMapEntry>;
  /** Maps token path → owning set name (for ThemeCompare) */
  pathToSet?: Record<string, string>;
  /** Called whenever the total count of auto-fillable token gaps changes. */
  onGapsDetected?: (count: number) => void;
  /** Called after batch token creation so the app can refresh its token data. */
  onTokensCreated?: () => void;
  /** Called after a new set is created (e.g. via "Create override set") so the parent can update the set list. */
  onSetCreated?: (name: string) => void;
  /** Navigate to the Tokens sub-tab (used in Compare empty states). */
  onGoToTokens?: () => void;
  /** Ref populated with imperative actions for cross-component control (e.g. command palette). */
  themeManagerHandle?: React.MutableRefObject<ThemeManagerHandle | null>;
  /** Called with a success message after a mutation completes (dimension/option create, rename). */
  onSuccess?: (msg: string) => void;
  /** Called when user wants to generate tokens for a theme axis — provides the best target set and axis name. */
  onGenerateForDimension?: (info: { dimensionName: string; targetSet: string }) => void;
  /** Mirrors the current internal theme view so the shell can stay aligned with the active sub-screen. */
  onShellStateChange?: (state: ThemeWorkspaceShellState) => void;
}
export function ThemeManager({ serverUrl, connected, sets, onDimensionsChange, onNavigateToToken, onCreateToken, onPushUndo, resolverState, allTokensFlat = {}, pathToSet = {}, onGapsDetected, onTokensCreated, onGoToTokens, themeManagerHandle, onSuccess, onGenerateForDimension, onSetCreated, onShellStateChange }: ThemeManagerProps) {
  // Live preview panel
  const [showPreview, setShowPreview] = useState(false);
  const [previewSearch, setPreviewSearch] = useState('');
  // The default flow stays in theme authoring; review and resolver tools are explicit secondary views.
  const [activeView, setActiveView] = useState<ThemeManagerView>('authoring');
  // Collapsed "Excluded" sections per dimension
  const [collapsedDisabled, setCollapsedDisabled] = useState<Set<string>>(new Set());
  // Dimension/option search filter
  const [dimSearch, setDimSearch] = useState('');
  const dimSearchRef = useRef<HTMLInputElement | null>(null);
  const previewSearchRef = useRef<HTMLInputElement | null>(null);
  const [showOnlyWithGaps, setShowOnlyWithGaps] = useState(false);
  const dimensionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const setRoleRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const previewSectionRef = useRef<HTMLDivElement | null>(null);
  const [focusedDimensionId, setFocusedDimensionId] = useState<string | null>(null);
  const [coverageContext, setCoverageContext] = useState<{ dimId: string | null; optionName: string | null }>({
    dimId: null,
    optionName: null,
  });
  const [showAllCoverageAxes, setShowAllCoverageAxes] = useState(false);
  const [compareContext, setCompareContext] = useState<{ dimId: string | null; optionName: string | null }>({
    dimId: null,
    optionName: null,
  });
  // Tab strip scroll state — tracks whether each dimension's tab strip can scroll left/right
  const tabScrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [tabScrollState, setTabScrollState] = useState<Record<string, { left: boolean; right: boolean }>>({});

  // --- Domain hooks ---
  const {
    dimensions, setDimensions,
    loading, error, setError, fetchWarnings, clearFetchWarnings,
    coverage, missingOverrides,
    optionSetOrders, setOptionSetOrders,
    selectedOptions, setSelectedOptions,
    setTokenValues,
    newlyCreatedDim,
    fetchDimensions, debouncedFetchDimensions,
    newDimName, setNewDimName,
    showCreateDim, openCreateDim, closeCreateDim,
    createDimError,
    isCreatingDim, handleCreateDimension,
    renameDim, renameValue, setRenameValue, renameError, isRenamingDim: _isRenamingDim,
    startRenameDim, cancelRenameDim, executeRenameDim,
    dimensionDeleteConfirm, openDeleteConfirm, closeDeleteConfirm, isDeletingDim: _isDeletingDim,
    executeDeleteDimension,
    isDuplicatingDim, handleDuplicateDimension,
  } = useThemeDimensions({ serverUrl, connected, sets, onPushUndo, onSuccess });

  useEffect(() => { onDimensionsChange?.(dimensions); }, [dimensions, onDimensionsChange]);
  useEffect(() => { onShellStateChange?.({ activeView, showPreview }); }, [activeView, onShellStateChange, showPreview]);
  useEffect(() => { fetchDimensions(); }, [fetchDimensions]);
  useEffect(() => {
    if (dimensions.length === 0) {
      setFocusedDimensionId(null);
      return;
    }
    if (focusedDimensionId && dimensions.some(dim => dim.id === focusedDimensionId)) return;
    setFocusedDimensionId(dimensions[0].id);
  }, [dimensions, focusedDimensionId]);

  const {
    draggingDimId, dragOverDimId, draggingOpt, dragOverOpt,
    handleMoveDimension, handleMoveOption,
    handleDimDragStart, handleDimDragOver, handleDimDrop, handleDimDragEnd,
    handleOptDragStart, handleOptDragOver, handleOptDrop, handleOptDragEnd,
  } = useThemeDragDrop({ serverUrl, connected, dimensions, setDimensions, fetchDimensions });

  const {
    showCompare, setShowCompare,
    compareMode, setCompareMode,
    compareTokenPath, setCompareTokenPath,
    compareTokenPaths, setCompareTokenPaths,
    compareThemeKey, setCompareThemeKey,
    compareThemeDefaultA, setCompareThemeDefaultA,
    compareThemeDefaultB, setCompareThemeDefaultB,
    navigateToCompare: navigateToCompareState,
  } = useThemeCompare();

  const {
    bulkMenu, setBulkMenu, bulkMenuRef, savingKeys,
    copyFromNewOption, setCopyFromNewOption,
    showCopyFromMenu, setShowCopyFromMenu, copyFromMenuRef,
    handleSetState, handleBulkSetState, handleBulkSetAllInOption, handleCopyAssignmentsFrom,
  } = useThemeBulkOps({ serverUrl, sets, dimensions, setDimensions, debouncedFetchDimensions, setError });

  const {
    fillingKeys, autoFillPreview, setAutoFillPreview, autoFillStrategy, setAutoFillStrategy,
    handleAutoFillSingle, handleAutoFillAll, executeAutoFillAll,
    handleAutoFillAllOptions, executeAutoFillAllOptions,
  } = useThemeAutoFill({ serverUrl, dimensions, coverage, debouncedFetchDimensions, setError });

  const {
    newOptionNames, setNewOptionNames,
    showAddOption, setShowAddOption,
    addOptionErrors, setAddOptionErrors,
    addOptionInputRefs,
    handleAddOption,
    handleDuplicateOption,
    renameOption, renameOptionValue, setRenameOptionValue, renameOptionError, setRenameOptionError,
    startRenameOption, cancelRenameOption, executeRenameOption,
    optionDeleteConfirm, setOptionDeleteConfirm,
    executeDeleteOption,
  } = useThemeOptions({
    serverUrl, connected, sets, dimensions, setDimensions,
    debouncedFetchDimensions, fetchDimensions,
    selectedOptions, setSelectedOptions,
    optionSetOrders, setOptionSetOrders,
    setError, onSuccess, onPushUndo,
    copyFromNewOption, setCopyFromNewOption,
  });

  const {
    expandedCoverage, setExpandedCoverage,
    expandedStale, setExpandedStale,
    showMissingOnly: _showMissingOnly, setShowMissingOnly: _setShowMissingOnly,
    expandedMissingOverrides, setExpandedMissingOverrides,
    creatingMissingKeys, setCreatingMissingKeys,
    missingOverrideSearch, setMissingOverrideSearch,
    totalFillableGaps,
    handleBulkCreateMissingOverrides,
  } = useThemeCoverage({ coverage, missingOverrides, serverUrl, debouncedFetchDimensions, setError });

  useEffect(() => { onGapsDetected?.(totalFillableGaps); }, [totalFillableGaps, onGapsDetected]);

  const getDimensionForContext = useCallback((preferredId?: string | null) => {
    if (preferredId) {
      const matched = dimensions.find(dim => dim.id === preferredId);
      if (matched) return matched;
    }
    if (focusedDimensionId) {
      const focused = dimensions.find(dim => dim.id === focusedDimensionId);
      if (focused) return focused;
    }
    return dimensions[0] ?? null;
  }, [dimensions, focusedDimensionId]);

  const getOptionNameForContext = useCallback((dim: ThemeDimension | null, preferredName?: string | null) => {
    if (!dim) return null;
    if (preferredName && dim.options.some(option => option.name === preferredName)) return preferredName;
    const selectedName = selectedOptions[dim.id];
    if (selectedName && dim.options.some(option => option.name === selectedName)) return selectedName;
    return dim.options[0]?.name ?? null;
  }, [selectedOptions]);

  const scrollToDimension = useCallback((dimId: string | null | undefined) => {
    if (!dimId) return;
    requestAnimationFrame(() => {
      dimensionRefs.current[dimId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const scrollToSetRoles = useCallback((dimId: string, optionName: string) => {
    requestAnimationFrame(() => {
      setRoleRefs.current[`${dimId}:${optionName}`]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }, []);

  const scrollToPreview = useCallback(() => {
    requestAnimationFrame(() => {
      previewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const handleSelectOption = useCallback((dimId: string, optionName: string) => {
    setFocusedDimensionId(dimId);
    setSelectedOptions(prev => ({ ...prev, [dimId]: optionName }));
  }, [setSelectedOptions]);

  const returnToAuthoring = useCallback((dimId?: string | null) => {
    setShowCompare(false);
    setActiveView('authoring');
    scrollToDimension(dimId ?? focusedDimensionId);
  }, [focusedDimensionId, scrollToDimension, setShowCompare]);

  const focusAuthoringStage = useCallback((stage: ThemeAuthoringStage) => {
    setShowCompare(false);
    setActiveView('authoring');

    if (stage === 'preview') {
      setShowPreview(true);
      scrollToPreview();
      return;
    }

    if (stage === 'axes') {
      if (dimensions.length === 0) {
        openCreateDim();
        return;
      }
      scrollToDimension(focusedDimensionId ?? dimensions[0]?.id ?? null);
      return;
    }

    if (stage === 'options') {
      const targetDimension = dimensions.find((dimension) => dimension.options.length === 0) ?? getDimensionForContext();
      if (!targetDimension) {
        openCreateDim();
        return;
      }
      setFocusedDimensionId(targetDimension.id);
      setShowAddOption(prev => ({ ...prev, [targetDimension.id]: true }));
      scrollToDimension(targetDimension.id);
      requestAnimationFrame(() => {
        addOptionInputRefs.current[targetDimension.id]?.focus();
      });
      return;
    }

    for (const dimension of dimensions) {
      for (const option of dimension.options) {
        const hasAssignedSet = Object.values(option.sets).some((status) => status === 'source' || status === 'enabled');
        if (!hasAssignedSet) {
          setFocusedDimensionId(dimension.id);
          setSelectedOptions(prev => ({ ...prev, [dimension.id]: option.name }));
          scrollToDimension(dimension.id);
          scrollToSetRoles(dimension.id, option.name);
          return;
        }
      }
    }

    const fallbackDimension = getDimensionForContext();
    const fallbackOptionName = getOptionNameForContext(fallbackDimension, null);
    if (!fallbackDimension || !fallbackOptionName) return;
    setFocusedDimensionId(fallbackDimension.id);
    setSelectedOptions(prev => ({ ...prev, [fallbackDimension.id]: fallbackOptionName }));
    scrollToDimension(fallbackDimension.id);
    scrollToSetRoles(fallbackDimension.id, fallbackOptionName);
  }, [
    addOptionInputRefs,
    dimensions,
    focusedDimensionId,
    getDimensionForContext,
    getOptionNameForContext,
    openCreateDim,
    scrollToDimension,
    scrollToPreview,
    scrollToSetRoles,
    setSelectedOptions,
    setShowAddOption,
    setShowCompare,
  ]);

  // --- Create override set ---
  const [createOverrideSet, setCreateOverrideSet] = useState<{ dimId: string; setName: string; optName?: string } | null>(null);
  const [isCreatingOverrideSet, setIsCreatingOverrideSet] = useState(false);

  const executeCreateOverrideSet = useCallback(async ({ newName, optionName, startEmpty }: { newName: string; optionName: string; startEmpty: boolean }) => {
    if (!createOverrideSet) return;
    const { dimId, setName: sourceName } = createOverrideSet;
    setIsCreatingOverrideSet(true);
    try {
      if (startEmpty) {
        await apiFetch<{ ok: true; name: string }>(`${serverUrl}/api/sets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName }),
        });
      } else {
        await apiFetch<{ ok: true; name: string; originalName: string }>(
          `${serverUrl}/api/sets/${encodeURIComponent(sourceName)}/duplicate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName }),
          },
        );
      }
      // Link the new set to the selected theme option as Override
      const dim = dimensions.find(d => d.id === dimId);
      const opt = dim?.options.find(o => o.name === optionName);
      if (dim && opt) {
        const updatedSets = { ...opt.sets, [newName]: 'enabled' as const };
        await apiFetch(`${serverUrl}/api/themes/dimensions/${encodeURIComponent(dimId)}/options`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: optionName, sets: updatedSets }),
        });
      }
      onSetCreated?.(newName);
      onTokensCreated?.();
      await debouncedFetchDimensions();
      setCreateOverrideSet(null);
      onSuccess?.(`Created override set "${newName}"${dim && opt ? ` linked to ${dim.name} → ${optionName}` : ''}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create override set');
    } finally {
      setIsCreatingOverrideSet(false);
    }
  }, [createOverrideSet, dimensions, serverUrl, debouncedFetchDimensions, onSetCreated, onTokensCreated, onSuccess, setError]);

  // Sync showCompare (set by external navigateToCompare calls) → activeView
  useEffect(() => {
    if (showCompare) setActiveView('compare');
  }, [showCompare]);

  const openCoverageView = useCallback((dimensionId?: string, optionName?: string, allAxes = false) => {
    const targetDimension = getDimensionForContext(dimensionId);
    const targetOptionName = getOptionNameForContext(targetDimension, optionName);
    if (targetDimension) setFocusedDimensionId(targetDimension.id);
    setCoverageContext({
      dimId: targetDimension?.id ?? null,
      optionName: targetOptionName,
    });
    setShowAllCoverageAxes(allAxes);
    setShowCompare(false);
    setShowPreview(false);
    setActiveView('coverage');
  }, [getDimensionForContext, getOptionNameForContext, setShowCompare]);

  const openCompareView = useCallback((dimension?: ThemeDimension, optionName?: string) => {
    setCompareMode('theme-options');
    const contextualDimension = getDimensionForContext(dimension?.id ?? null);
    const compareDimension = dimension && dimension.options.length >= 2
      ? dimension
      : contextualDimension && contextualDimension.options.length >= 2
        ? contextualDimension
        : dimensions.find(d => d.options.length >= 2);
    if (compareDimension) {
      const optionAName = getOptionNameForContext(compareDimension, optionName) ?? compareDimension.options[0]?.name ?? '';
      const optionBName = compareDimension.options.find(option => option.name !== optionAName)?.name ?? compareDimension.options[1]?.name ?? '';
      setFocusedDimensionId(compareDimension.id);
      setCompareContext({
        dimId: compareDimension.id,
        optionName: optionAName || null,
      });
      setCompareThemeDefaultA(`${compareDimension.id}:${optionAName}`);
      setCompareThemeDefaultB(`${compareDimension.id}:${optionBName}`);
    } else if (dimensions.length >= 2 && dimensions[0].options.length > 0 && dimensions[1].options.length > 0) {
      setCompareContext({
        dimId: dimensions[0].id,
        optionName: dimensions[0].options[0].name,
      });
      setCompareThemeDefaultA(`${dimensions[0].id}:${dimensions[0].options[0].name}`);
      setCompareThemeDefaultB(`${dimensions[1].id}:${dimensions[1].options[0].name}`);
    } else {
      setCompareContext({
        dimId: focusedDimensionId,
        optionName: null,
      });
    }
    setCompareThemeKey(k => k + 1);
    setShowCompare(true);
    setShowPreview(false);
    setActiveView('compare');
  }, [dimensions, focusedDimensionId, getDimensionForContext, getOptionNameForContext, setCompareMode, setCompareThemeDefaultA, setCompareThemeDefaultB, setCompareThemeKey, setShowCompare]);

  const handleNavigateToCompare = useCallback((
    mode: CompareMode,
    path?: string,
    tokenPaths?: Set<string>,
    optionA?: string,
    optionB?: string,
  ) => {
    if (mode === 'theme-options' && optionA) {
      const separator = optionA.indexOf(':');
      const dimId = separator === -1 ? optionA : optionA.slice(0, separator);
      const optionName = separator === -1 ? null : optionA.slice(separator + 1);
      setFocusedDimensionId(dimId);
      setCompareContext({ dimId, optionName });
    } else {
      setCompareContext({
        dimId: focusedDimensionId,
        optionName: null,
      });
    }
    navigateToCompareState(mode, path, tokenPaths, optionA, optionB);
  }, [focusedDimensionId, navigateToCompareState]);

  // Populate imperative handle so parent (e.g. command palette) can trigger auto-fill
  const handleAutoFillAllRef = useRef(handleAutoFillAllOptions);
  handleAutoFillAllRef.current = handleAutoFillAllOptions;
  useEffect(() => {
    if (!themeManagerHandle) return;
    themeManagerHandle.current = {
      autoFillAllGaps: () => {
        const dimWithGaps = dimensions.find(dim => {
          const dimCov = coverage[dim.id] ?? {};
          return Object.values(dimCov).some(opt =>
            opt.uncovered.some(i => i.missingRef && i.fillValue !== undefined),
          );
        });
        if (dimWithGaps) handleAutoFillAllRef.current(dimWithGaps.id);
      },
      navigateToCompare: handleNavigateToCompare,
      focusStage: focusAuthoringStage,
      openCreateAxis: () => {
        setShowCompare(false);
        setActiveView('authoring');
        openCreateDim();
      },
      returnToAuthoring: () => {
        returnToAuthoring();
      },
      switchToResolverMode: () => {
        setShowCompare(false);
        setShowPreview(false);
        setActiveView('advanced');
      },
    };
    return () => { themeManagerHandle.current = null; };
  }, [themeManagerHandle, dimensions, coverage, focusAuthoringStage, handleNavigateToCompare, openCreateDim, returnToAuthoring, setShowCompare]);

  // Tab strip scroll helpers
  const updateTabScroll = useCallback((dimId: string) => {
    const el = tabScrollRefs.current[dimId];
    if (!el) return;
    setTabScrollState(prev => ({
      ...prev,
      [dimId]: {
        left: el.scrollLeft > 0,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      },
    }));
  }, []);

  useEffect(() => {
    const cleanup: (() => void)[] = [];
    dimensions.forEach(dim => {
      const el = tabScrollRefs.current[dim.id];
      if (!el) return;
      const onScroll = () => updateTabScroll(dim.id);
      el.addEventListener('scroll', onScroll, { passive: true });
      const ro = new ResizeObserver(() => updateTabScroll(dim.id));
      ro.observe(el);
      updateTabScroll(dim.id);
      cleanup.push(() => {
        el.removeEventListener('scroll', onScroll);
        ro.disconnect();
      });
    });
    return () => cleanup.forEach(fn => fn());
  }, [dimensions, updateTabScroll]);

  // --- Live preview: compute resolved token values for current selections ---

  const previewTokens = useMemo(() => {
    if (!showPreview || dimensions.length === 0) return [];

    // Merge tokens according to the stacking model
    const merged: Record<string, { value: any; set: string; layer: string }> = {};

    // Apply dimensions bottom to top (last dimension = lowest priority, first = highest)
    for (let i = dimensions.length - 1; i >= 0; i--) {
      const dim = dimensions[i];
      const optName = selectedOptions[dim.id];
      const opt = dim.options.find(o => o.name === optName);
      if (!opt) continue;

      // Base sets first (can be overridden)
      for (const [setName, status] of Object.entries(opt.sets)) {
        if (status !== 'source') continue;
        const tokens = setTokenValues[setName];
        if (!tokens) continue;
        for (const [path, value] of Object.entries(tokens)) {
          merged[path] = { value, set: setName, layer: `${dim.name} / Base` };
        }
      }
      // Override sets (take priority)
      for (const [setName, status] of Object.entries(opt.sets)) {
        if (status !== 'enabled') continue;
        const tokens = setTokenValues[setName];
        if (!tokens) continue;
        for (const [path, value] of Object.entries(tokens)) {
          merged[path] = { value, set: setName, layer: `${dim.name} / Override` };
        }
      }
    }

    // Resolve aliases
    const resolveAlias = (value: any, depth = 0): any => {
      if (depth > 10 || typeof value !== 'string') return value;
      const m = /^\{([^}]+)\}$/.exec(value);
      if (!m) return value;
      const target = m[1];
      if (merged[target]) return resolveAlias(merged[target].value, depth + 1);
      return value;
    };

    let entries = Object.entries(merged).map(([path, info]) => ({
      path,
      rawValue: info.value,
      resolvedValue: resolveAlias(info.value),
      set: info.set,
      layer: info.layer,
    }));

    if (previewSearch) {
      const term = previewSearch.toLowerCase();
      entries = entries.filter(e =>
        e.path.toLowerCase().includes(term) ||
        e.set.toLowerCase().includes(term) ||
        String(e.resolvedValue).toLowerCase().includes(term)
      );
    }

    return entries.slice(0, 50);
  }, [showPreview, dimensions, selectedOptions, setTokenValues, previewSearch]);


  // --- Per-option diff counts vs currently selected option ---
  const optionDiffCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const resolveOpt = (opt: ThemeOption): Record<string, any> => {
      const merged: Record<string, any> = {};
      for (const [s, st] of Object.entries(opt.sets)) {
        if (st === 'source') Object.assign(merged, setTokenValues[s] ?? {});
      }
      for (const [s, st] of Object.entries(opt.sets)) {
        if (st === 'enabled') Object.assign(merged, setTokenValues[s] ?? {});
      }
      const resolve = (v: any, depth = 0): any => {
        if (depth > 10 || typeof v !== 'string') return v;
        const m = /^\{([^}]+)\}$/.exec(v);
        if (!m) return v;
        const t = m[1];
        return t in merged ? resolve(merged[t], depth + 1) : v;
      };
      const out: Record<string, any> = {};
      for (const [p, v] of Object.entries(merged)) out[p] = resolve(v);
      return out;
    };
    for (const dim of dimensions) {
      if (dim.options.length < 2) continue;
      const selOptName = selectedOptions[dim.id] || dim.options[0]?.name || '';
      const selOpt = dim.options.find(o => o.name === selOptName);
      if (!selOpt) continue;
      const selTokens = resolveOpt(selOpt);
      for (const opt of dim.options) {
        if (opt.name === selOptName) continue;
        const optTokens = resolveOpt(opt);
        const allPaths = new Set([...Object.keys(optTokens), ...Object.keys(selTokens)]);
        let diff = 0;
        for (const path of allPaths) {
          if (JSON.stringify(optTokens[path]) !== JSON.stringify(selTokens[path])) diff++;
        }
        counts[`${dim.id}/${opt.name}`] = diff;
      }
    }
    return counts;
  }, [dimensions, selectedOptions, setTokenValues]);

  // --- Render helpers ---

  const renderSetRow = (dim: ThemeDimension, opt: ThemeOption, setName: string, status: string) => {
    const isSaving = savingKeys.has(`${dim.id}/${opt.name}/${setName}`);
    const _saveKey = `${dim.id}/${opt.name}/${setName}`;
    const tokenCount = setTokenValues[setName] ? Object.keys(setTokenValues[setName]).length : null;
    const isEmptyOverride = status === 'enabled' && tokenCount !== null && tokenCount === 0;
    return (
      <div
        key={setName}
        className={`group/setrow flex items-center gap-1.5 px-2 py-0.5 transition-colors hover:bg-[var(--color-figma-bg-hover)] ${isSaving ? 'opacity-50 pointer-events-none' : ''}`}
        onContextMenu={e => {
          e.preventDefault();
          const x = Math.min(e.clientX, window.innerWidth - 180);
          const y = Math.min(e.clientY, window.innerHeight - 120);
          setBulkMenu({ x, y, dimId: dim.id, setName, optName: opt.name });
        }}
      >
        <span className="text-[10px] text-[var(--color-figma-text)] flex-1 truncate" title={setName}>{setName}</span>
        {isEmptyOverride && (
          <span
            title="This override set is empty — it contains no tokens and will not change any values when this theme option is active"
            className="text-[9px] font-medium px-1 py-0.5 rounded bg-[var(--color-figma-warning,#f59e0b)]/15 text-[var(--color-figma-warning,#f59e0b)] leading-none"
          >
            empty
          </span>
        )}
        <div
          role="group"
          aria-label={`Status for ${setName}`}
          className="flex rounded overflow-hidden border border-[var(--color-figma-border)] text-[10px] font-medium"
        >
          {(['disabled', 'source', 'enabled'] as const).map(s => (
            <button
              key={s}
              onClick={() => { if (status !== s) handleSetState(dim.id, opt.name, setName, s); }}
              className={`px-1.5 py-0.5 transition-colors ${
                status === s
                  ? s === 'source'
                    ? 'bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)]'
                    : s === 'enabled'
                    ? 'bg-[var(--color-figma-success)]/20 text-[var(--color-figma-success)]'
                    : 'bg-[var(--color-figma-border)]/60 text-[var(--color-figma-text-secondary)]'
                  : 'text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)]'
              }`}
              aria-label={`${STATE_LABELS[s]} "${setName}": ${STATE_DESCRIPTIONS[s]}`}
              aria-pressed={status === s}
            >
              {STATE_LABELS[s]}
            </button>
          ))}
        </div>
        <button
          onClick={e => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const x = Math.min(rect.right + 4, window.innerWidth - 180);
            const y = Math.min(rect.bottom, window.innerHeight - 120);
            setBulkMenu({ x, y, dimId: dim.id, setName, optName: opt.name });
          }}
          className="opacity-40 group-hover/setrow:opacity-100 focus:opacity-100 transition-opacity px-1 py-0.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
          aria-label={`Set "${setName}" status in all options`}
          aria-haspopup="menu"
          title={`Set "${setName}" in all options`}
        >
          ⋯
        </button>
      </div>
    );
  };

  const renderValuePreview = (value: any) => {
    if (typeof value === 'string') {
      // Color preview
      if (/^#[0-9a-fA-F]{6,8}$/.test(value)) {
        return (
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded border border-[var(--color-figma-border)]"
              style={{ backgroundColor: value }}
            />
            <span className="font-mono text-[10px]">{value}</span>
          </span>
        );
      }
      // Alias reference
      if (/^\{[^}]+\}$/.test(value)) {
        return <span className="font-mono text-[10px] text-[var(--color-figma-warning)]">{value}</span>;
      }
    }
    return <span className="font-mono text-[10px]">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>;
  };

  // Filter dimensions (and their options) by search query and/or gaps toggle
  // Must be before early returns to satisfy rules-of-hooks
  const filteredDimensions = useMemo(() => {
    let result = dimensions;
    if (showOnlyWithGaps) {
      result = result.filter(dim => {
        const dimCov = coverage[dim.id] ?? {};
        return Object.values(dimCov).some(opt => opt.uncovered.length > 0);
      });
    }
    const q = dimSearch.trim().toLowerCase();
    if (!q) return result;
    return result.filter(dim => {
      if (dim.name.toLowerCase().includes(q)) return true;
      return dim.options.some(o => o.name.toLowerCase().includes(q));
    });
  }, [dimensions, dimSearch, showOnlyWithGaps, coverage]);

  const focusedDimension = useMemo(
    () => dimensions.find(dim => dim.id === focusedDimensionId) ?? dimensions[0] ?? null,
    [dimensions, focusedDimensionId],
  );
  const focusedOptionName = useMemo(
    () => getOptionNameForContext(focusedDimension, null),
    [focusedDimension, getOptionNameForContext],
  );
  const coverageFocusDimension = useMemo(
    () => dimensions.find(dim => dim.id === coverageContext.dimId) ?? focusedDimension,
    [coverageContext.dimId, dimensions, focusedDimension],
  );
  const coverageFocusOptionName = useMemo(
    () => getOptionNameForContext(coverageFocusDimension, coverageContext.optionName),
    [coverageContext.optionName, coverageFocusDimension, getOptionNameForContext],
  );
  const coverageDimensions = useMemo(
    () => showAllCoverageAxes || !coverageFocusDimension ? dimensions : [coverageFocusDimension],
    [coverageFocusDimension, dimensions, showAllCoverageAxes],
  );
  const coverageFocusIssueCount = useMemo(() => {
    if (!coverageFocusDimension || !coverageFocusOptionName) return 0;
    return (coverage[coverageFocusDimension.id]?.[coverageFocusOptionName]?.uncovered.length ?? 0)
      + (missingOverrides[coverageFocusDimension.id]?.[coverageFocusOptionName]?.missing.length ?? 0);
  }, [coverage, coverageFocusDimension, coverageFocusOptionName, missingOverrides]);
  const compareFocusDimension = useMemo(
    () => dimensions.find(dim => dim.id === compareContext.dimId) ?? focusedDimension,
    [compareContext.dimId, dimensions, focusedDimension],
  );
  const compareFocusOptionName = useMemo(
    () => getOptionNameForContext(compareFocusDimension, compareContext.optionName),
    [compareContext.optionName, compareFocusDimension, getOptionNameForContext],
  );

  const modalContextValue = useMemo<ThemeManagerModalsState>(() => ({
    dimensions,
    autoFillPreview, setAutoFillPreview, autoFillStrategy, setAutoFillStrategy,
    executeAutoFillAll, executeAutoFillAllOptions,
    dimensionDeleteConfirm, setDimensionDeleteConfirm: openDeleteConfirm, closeDeleteConfirm,
    executeDeleteDimension,
    optionDeleteConfirm, setOptionDeleteConfirm: (v) => setOptionDeleteConfirm(v),
    executeDeleteOption,
    bulkMenu, setBulkMenu: (v) => setBulkMenu(v), bulkMenuRef,
    handleBulkSetState,
    createOverrideSet, setCreateOverrideSet, executeCreateOverrideSet, isCreatingOverrideSet,
  }), [
    dimensions, autoFillPreview, setAutoFillPreview, autoFillStrategy, setAutoFillStrategy, executeAutoFillAll, executeAutoFillAllOptions,
    dimensionDeleteConfirm, openDeleteConfirm, closeDeleteConfirm, executeDeleteDimension,
    optionDeleteConfirm, setOptionDeleteConfirm, executeDeleteOption,
    bulkMenu, setBulkMenu, bulkMenuRef, handleBulkSetState,
    createOverrideSet, setCreateOverrideSet, executeCreateOverrideSet, isCreatingOverrideSet,
  ]);

  if (!connected) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        Connect to server to manage themes
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        <Spinner size="md" className="text-[var(--color-figma-accent)]" />
        Loading themes...
      </div>
    );
  }

  return (
    <ThemeManagerModalsProvider value={modalContextValue}>
    <div className="flex flex-col h-full">
      {error && (
        <div role="alert" className="mx-3 mt-2 px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px] flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-2 text-[var(--color-figma-error)] hover:opacity-70 flex-shrink-0">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}
      {fetchWarnings && (
        <div role="status" className="mx-3 mt-2 px-2 py-1.5 rounded bg-[var(--color-figma-warning)]/10 text-[var(--color-figma-warning)] text-[10px] flex items-center justify-between">
          <span>{fetchWarnings}</span>
          <button onClick={clearFetchWarnings} className="ml-2 text-[var(--color-figma-warning)] hover:opacity-70 flex-shrink-0">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      <>
      {activeView === 'coverage' && (
        <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <div className="px-3 py-2.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
                {showAllCoverageAxes || !coverageFocusDimension ? 'Coverage review' : `Coverage for ${coverageFocusDimension.name}`}
              </p>
              <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                {showAllCoverageAxes || !coverageFocusDimension
                  ? 'Started from the current theme context and expanded to every axis. Click any option to jump back into authoring with that setup selected.'
                  : coverageFocusOptionName
                    ? `Review missing values and overrides for ${coverageFocusDimension.name} → ${coverageFocusOptionName}, then jump straight back into that axis to fix the mapping.`
                    : 'Review missing values and overrides for the current axis, then jump back into authoring to fix the mapping.'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {dimensions.length > 1 && coverageFocusDimension && (
                <button
                  onClick={() => setShowAllCoverageAxes(value => !value)}
                  className="inline-flex items-center gap-1 rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]"
                >
                  {showAllCoverageAxes ? `Focus ${coverageFocusDimension.name}` : 'Show all axes'}
                </button>
              )}
              <button
                onClick={() => returnToAuthoring(coverageFocusDimension?.id ?? coverageContext.dimId)}
                className="inline-flex items-center gap-1 rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]"
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                Back to authoring
              </button>
            </div>
          </div>
          {!showAllCoverageAxes && coverageFocusDimension && (
            <div className="px-3 pb-2 flex flex-wrap items-center gap-1.5 text-[9px] text-[var(--color-figma-text-tertiary)]">
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5">
                <span className="font-medium text-[var(--color-figma-text-secondary)]">Axis</span>
                <span>{coverageFocusDimension.name}</span>
              </span>
              {coverageFocusOptionName && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5">
                  <span className="font-medium text-[var(--color-figma-text-secondary)]">Option</span>
                  <span>{coverageFocusOptionName}</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5">
                <span className="font-medium text-[var(--color-figma-text-secondary)]">Issues</span>
                <span>{coverageFocusIssueCount}</span>
              </span>
            </div>
          )}
        </div>
      )}
      {activeView === 'compare' && (
        <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <div className="px-3 py-2.5">
            <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
              {compareFocusDimension ? `Compare from ${compareFocusDimension.name}` : 'Compare in theme context'}
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
              {compareFocusDimension && compareFocusOptionName
                ? `Theme option comparison starts from ${compareFocusDimension.name} → ${compareFocusOptionName}. Switch compare modes if you need token-level or set-level analysis without losing this context.`
                : 'Compare launches from the current axis or option so you can inspect alternatives without leaving theme authoring.'}
            </p>
          </div>
        </div>
      )}
      {activeView === 'advanced' && resolverState && (
        <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <div className="px-3 py-2.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">Advanced theme logic</p>
              <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                Use DTCG resolvers when you need explicit resolution order, modifier contexts, or cross-dimensional logic beyond light/dark style theme authoring.
              </p>
            </div>
            <button
              onClick={() => setActiveView('authoring')}
              className="shrink-0 inline-flex items-center gap-1 rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]"
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back to authoring
            </button>
          </div>
          <div className="px-3 pb-2 flex items-center gap-2 text-[9px] text-[var(--color-figma-text-tertiary)]">
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5">
              <span className="font-medium text-[var(--color-figma-text-secondary)]">Shortcut</span>
              <kbd className="rounded border border-[var(--color-figma-border)] px-1 font-mono leading-none">
                {adaptShortcut(SHORTCUT_KEYS.GO_TO_RESOLVER)}
              </kbd>
            </span>
          </div>
        </div>
      )}
      <div className={activeView === 'advanced' ? 'flex-1 overflow-hidden' : 'flex-1 overflow-y-auto'}>
        {activeView === 'authoring' && dimensions.length === 0 && !showCreateDim ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center px-5 py-8 text-center gap-4">
            {/* Icon */}
            <div className="w-10 h-10 rounded-xl bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
                <rect x="3" y="3" width="18" height="6" rx="1.5" />
                <rect x="3" y="12" width="18" height="6" rx="1.5" opacity="0.5" />
              </svg>
            </div>

            {/* Heading + description */}
            <div className="flex flex-col gap-1">
              <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">No theme axes yet</p>
              <p className="text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed max-w-[240px]">
                Themes let you switch entire sets of tokens at once — light/dark mode, brand variants, or density levels — without duplicating values.
              </p>
            </div>

            {/* How themes work */}
            <div className="w-full max-w-[260px]">
              <p className="text-[10px] text-[var(--color-figma-text-tertiary)] uppercase tracking-wide font-medium text-left mb-2">How themes work</p>
              <div className="flex items-start gap-0 w-full">
                <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-[var(--color-figma-bg-secondary)] flex items-center justify-center text-[var(--color-figma-text-secondary)]">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                    </svg>
                  </div>
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium leading-tight text-center">Add axes</p>
                  <p className="text-[8px] text-[var(--color-figma-text-tertiary)] leading-tight text-center">Theme axes</p>
                </div>
                <svg width="10" height="10" viewBox="0 0 8 8" fill="var(--color-figma-text-tertiary)" className="mt-2 shrink-0"><path d="M2 1l4 3-4 3V1z" /></svg>
                <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-[var(--color-figma-bg-secondary)] flex items-center justify-center text-[var(--color-figma-text-secondary)]">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M3 9h18M9 21V9" />
                    </svg>
                  </div>
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium leading-tight text-center">Map sets</p>
                  <p className="text-[8px] text-[var(--color-figma-text-tertiary)] leading-tight text-center">Per option</p>
                </div>
                <svg width="10" height="10" viewBox="0 0 8 8" fill="var(--color-figma-text-tertiary)" className="mt-2 shrink-0"><path d="M2 1l4 3-4 3V1z" /></svg>
                <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-[var(--color-figma-bg-secondary)] flex items-center justify-center text-[var(--color-figma-text-secondary)]">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                    </svg>
                  </div>
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium leading-tight text-center">Switch</p>
                  <p className="text-[8px] text-[var(--color-figma-text-tertiary)] leading-tight text-center">Instantly</p>
                </div>
              </div>
            </div>

            {/* Quick start */}
            <div className="w-full max-w-[260px] flex flex-col gap-1.5">
              <p className="text-[10px] text-[var(--color-figma-text-tertiary)] uppercase tracking-wide font-medium text-left">Quick start</p>
              {([
                ['Color Mode', 'Light / Dark'],
                ['Brand', 'Default / Premium'],
                ['Density', 'Regular / Compact'],
              ] as const).map(([name, example]) => (
                <button
                  key={name}
                  onClick={() => openCreateDim(name)}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-left hover:border-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)] transition-colors group"
                >
                  <span className="text-[11px] font-medium text-[var(--color-figma-text)] group-hover:text-[var(--color-figma-accent)]">{name}</span>
                  <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">{example}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => openCreateDim()}
              className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
            >
              or add a custom axis
            </button>

            {resolverState && (
              <div className="w-full max-w-[260px] pt-3 mt-1 border-t border-[var(--color-figma-border)] flex flex-col gap-1">
                <p className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-snug text-left">
                  Need explicit resolution order or cross-dimensional theme logic?
                </p>
                <button
                  onClick={() => {
                    setShowCompare(false);
                    setShowPreview(false);
                    setActiveView('advanced');
                  }}
                  className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-accent)] hover:underline text-left"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                  Open advanced theme logic
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            {activeView === 'authoring' && (<>
            {/* Dimension search filter + gaps toggle */}
            {dimensions.length > 1 && (
              <div className="px-3 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/50 flex flex-col gap-1.5">
                <div className="relative">
                  <svg className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)]" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    ref={dimSearchRef}
                    type="text"
                    value={dimSearch}
                    onChange={e => setDimSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') { setDimSearch(''); dimSearchRef.current?.blur(); } }}
                    placeholder="Filter axes / options…"
                    className="w-full pl-6 pr-6 py-1 rounded text-[11px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:focus-visible:border-[var(--color-figma-accent)]"
                  />
                  {dimSearch && (
                    <button
                      onClick={() => { setDimSearch(''); dimSearchRef.current?.focus(); }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
                      title="Clear search"
                      aria-label="Clear search"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setShowOnlyWithGaps(v => !v)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-colors self-start ${
                    showOnlyWithGaps
                      ? 'bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)] border border-[var(--color-figma-warning)]/30'
                      : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                  }`}
                  title="Show only axes that have unresolved token gaps"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  Show only axes with gaps
                </button>
              </div>
            )}

            {/* Priority hint */}
            {dimensions.length > 1 && (
              <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] bg-[var(--color-figma-bg-secondary)]/50 border-b border-[var(--color-figma-border)] flex items-center gap-1">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                Higher priority
                <span className="flex-1 border-b border-dotted border-[var(--color-figma-border)] mx-1" />
                Lower priority
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
              </div>
            )}

            {/* Global auto-fill suggestion banner — visible without expanding any section */}
            {totalFillableGaps > 0 && (
              <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/8">
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-warning)]">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>
                    <strong>{totalFillableGaps}</strong> gap{totalFillableGaps !== 1 ? 's' : ''} can be auto-filled from source sets
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      const dimWithGaps = dimensions.find(dim => {
                        const dimCov = coverage[dim.id] ?? {};
                        return Object.values(dimCov).some(opt =>
                          opt.uncovered.some(i => i.missingRef && i.fillValue !== undefined),
                        );
                      });
                      openCoverageView(focusedDimension?.id ?? dimWithGaps?.id, focusedOptionName ?? undefined, true);
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded border border-[var(--color-figma-warning)]/35 text-[10px] font-medium text-[var(--color-figma-warning)] hover:bg-[var(--color-figma-warning)]/12 transition-colors"
                    title="Review gap coverage in context"
                  >
                    Review gaps
                  </button>
                  <button
                    onClick={() => {
                      const dimWithGaps = dimensions.find(dim => {
                        const dimCov = coverage[dim.id] ?? {};
                        return Object.values(dimCov).some(opt =>
                          opt.uncovered.some(i => i.missingRef && i.fillValue !== undefined),
                        );
                      });
                      if (dimWithGaps) handleAutoFillAllOptions(dimWithGaps.id);
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors"
                    title={`Auto-fill ${totalFillableGaps} missing token${totalFillableGaps !== 1 ? 's' : ''} — opens confirmation dialog`}
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                    Auto-fill gaps
                  </button>
                </div>
              </div>
            )}

            {/* Dimension layer cards */}
            <div className="flex flex-col">
              {filteredDimensions.length === 0 && (dimSearch || showOnlyWithGaps) && (
                <div className="py-6 text-center text-[11px] text-[var(--color-figma-text-tertiary)]">
                  {showOnlyWithGaps && !dimSearch
                    ? 'No axes have coverage gaps'
                    : 'No axes match your filter'}
                </div>
              )}
              {filteredDimensions.map((dim) => {
                const selectedOpt = selectedOptions[dim.id] || dim.options[0]?.name || '';
                const opt = dim.options.find(o => o.name === selectedOpt);
                const optSets = opt ? (optionSetOrders[dim.id]?.[opt.name] || sets) : sets;
                const dimIdx = dimensions.indexOf(dim);
                const layerNum = dimensions.length - dimIdx;

                // Group sets by status
                const overrideSets = optSets.filter(s => opt?.sets[s] === 'enabled');
                const foundationSets = optSets.filter(s => opt?.sets[s] === 'source');
                const disabledSets = optSets.filter(s => !opt?.sets[s] || opt?.sets[s] === 'disabled');
                const isDisabledCollapsed = collapsedDisabled.has(dim.id);

                const covKey = `${dim.id}:${selectedOpt}`;
                const hasUncovered = (coverage[dim.id]?.[selectedOpt]?.uncovered.length ?? 0) > 0;
                const staleSetNames = opt
                  ? Object.entries(opt.sets).filter(([s, status]) => !sets.includes(s) && status !== 'disabled').map(([s]) => s)
                  : [];

                // Cross-option gap totals for this dimension
                const dimCov = coverage[dim.id] ?? {};
                const optionsWithGaps = dim.options.filter(o => (dimCov[o.name]?.uncovered.length ?? 0) > 0);
                const totalDimGaps = optionsWithGaps.reduce((sum, o) => sum + (dimCov[o.name]?.uncovered.length ?? 0), 0);
                const totalDimMissingOverrides = dim.options.reduce(
                  (sum, option) => sum + (missingOverrides[dim.id]?.[option.name]?.missing.length ?? 0),
                  0,
                );
                const totalDimCoverageIssues = totalDimGaps + totalDimMissingOverrides;
                const totalDimFillable = optionsWithGaps.reduce((sum, o) => {
                  const items = dimCov[o.name]?.uncovered ?? [];
                  return sum + items.filter(i => i.missingRef && i.fillValue !== undefined).length;
                }, 0);
                const multiOptionGaps = optionsWithGaps.length > 1;
                const isFillAllOptionsInProgress = fillingKeys.has(`${dim.id}:__all_options__`);

                return (
                  <div
                    key={dim.id}
                    ref={el => {
                      dimensionRefs.current[dim.id] = el;
                      if (el && dim.id === newlyCreatedDim) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                      }
                    }}
                    draggable
                    onDragStart={e => handleDimDragStart(e, dim.id)}
                    onDragOver={e => handleDimDragOver(e, dim.id)}
                    onDrop={() => handleDimDrop(dim.id)}
                    onDragEnd={handleDimDragEnd}
                    className={`border-b border-[var(--color-figma-border)] transition-opacity ${draggingDimId === dim.id ? 'opacity-40' : ''} ${dragOverDimId === dim.id && draggingDimId !== dim.id ? 'ring-2 ring-inset ring-[var(--color-figma-accent)]/50' : ''}`}
                  >
                    {/* Layer header */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-figma-bg-secondary)] group">
                      {/* Drag grip handle */}
                      {dimensions.length > 1 && (
                        <span
                          className="cursor-grab active:cursor-grabbing text-[var(--color-figma-text-tertiary)] opacity-20 group-hover:opacity-60 hover:!opacity-100 flex-shrink-0 select-none transition-opacity"
                          title="Drag to reorder axis"
                          aria-hidden="true"
                        >
                          <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
                            <circle cx="2" cy="2" r="1.2" /><circle cx="6" cy="2" r="1.2" />
                            <circle cx="2" cy="6" r="1.2" /><circle cx="6" cy="6" r="1.2" />
                            <circle cx="2" cy="10" r="1.2" /><circle cx="6" cy="10" r="1.2" />
                          </svg>
                        </span>
                      )}
                      {/* Layer number badge */}
                      <span className="flex items-center justify-center w-4 h-4 rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] text-[10px] font-bold flex-shrink-0" title={`Axis ${layerNum} — ${dimIdx === 0 ? 'highest' : dimIdx === dimensions.length - 1 ? 'lowest' : ''} priority`}>
                        {layerNum}
                      </span>

                      {renameDim === dim.id ? (
                        <div className="flex flex-col gap-1 flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') executeRenameDim(); else if (e.key === 'Escape') cancelRenameDim(); }}
                              className={`flex-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] ${renameError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
                              autoFocus
                            />
                            <button onClick={executeRenameDim} disabled={!renameValue.trim()} className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40">Save</button>
                            <button onClick={cancelRenameDim} className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]">Cancel</button>
                          </div>
                          {renameError && <p role="alert" className="text-[10px] text-[var(--color-figma-error)]">{renameError}</p>}
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <span className="text-[11px] font-medium text-[var(--color-figma-text)] truncate" title={dim.name}>{dim.name}</span>
                            {totalDimGaps > 0 && (
                              <span
                                className="inline-flex items-center justify-center min-w-[16px] h-[14px] px-1 rounded-full text-[9px] font-bold leading-none bg-[var(--color-figma-warning)]/20 text-[var(--color-figma-warning)] flex-shrink-0"
                                title={`${totalDimGaps} coverage gap${totalDimGaps !== 1 ? 's' : ''} across ${optionsWithGaps.length} option${optionsWithGaps.length !== 1 ? 's' : ''}`}
                              >
                                {totalDimGaps}
                              </span>
                            )}
                            <button
                              onClick={() => startRenameDim(dim.id, dim.name)}
                              className="p-0.5 rounded opacity-20 group-hover:opacity-100 hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] flex-shrink-0 pointer-events-none group-hover:pointer-events-auto transition-opacity"
                              title="Rename axis" aria-label="Rename axis"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          </div>
                          {dimensions.length > 1 && (
                            <div className="flex items-center gap-0 flex-shrink-0 opacity-20 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                              <button
                                onClick={() => handleMoveDimension(dim.id, 'up')}
                                disabled={dimIdx === 0}
                                className="p-0.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] disabled:opacity-25 disabled:pointer-events-none"
                                title="Move axis up (higher priority)" aria-label="Move axis up"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 15l-6-6-6 6" /></svg>
                              </button>
                              <button
                                onClick={() => handleMoveDimension(dim.id, 'down')}
                                disabled={dimIdx === dimensions.length - 1}
                                className="p-0.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] disabled:opacity-25 disabled:pointer-events-none"
                                title="Move axis down (lower priority)" aria-label="Move axis down"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => openCoverageView(dim.id, selectedOpt)}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium flex-shrink-0 opacity-40 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                            title={totalDimCoverageIssues > 0 ? `Review ${totalDimCoverageIssues} issue${totalDimCoverageIssues !== 1 ? 's' : ''} for ${dim.name}` : `Review coverage for ${dim.name}`}
                            aria-label={`Review coverage for ${dim.name}`}
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <rect x="3" y="3" width="7" height="7" />
                              <rect x="14" y="3" width="7" height="7" />
                              <rect x="3" y="14" width="7" height="7" />
                              <rect x="14" y="14" width="7" height="7" />
                            </svg>
                            {totalDimCoverageIssues > 0 ? 'Review gaps' : 'Coverage'}
                          </button>
                          {dim.options.length >= 2 && (
                            <button
                              onClick={() => openCompareView(dim, selectedOpt)}
                              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium flex-shrink-0 opacity-40 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                              title={`Compare ${selectedOpt || dim.name} against another ${dim.name} option`}
                              aria-label={`Compare ${dim.name} options`}
                            >
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
                                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                                <path d="M9 12h6" />
                              </svg>
                              Compare
                            </button>
                          )}
                          {onGenerateForDimension && (
                            <button
                              onClick={() => {
                                const targetSet =
                                  overrideSets[0] ?? foundationSets[0] ?? sets[0] ?? '';
                                if (targetSet) onGenerateForDimension({ dimensionName: dim.name, targetSet });
                              }}
                              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium flex-shrink-0 opacity-40 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10"
                              title={`Generate tokens for ${dim.name} axis`}
                              aria-label={`Generate tokens for ${dim.name} axis`}
                            >
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                              </svg>
                              Generate
                            </button>
                          )}
                          <button
                            onClick={() => handleDuplicateDimension(dim.id)}
                            disabled={isDuplicatingDim}
                            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] text-[10px] flex-shrink-0 opacity-20 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto disabled:opacity-25 disabled:pointer-events-none transition-opacity"
                            title="Duplicate axis" aria-label="Duplicate axis"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                          </button>
                          <button
                            onClick={() => openDeleteConfirm(dim.id)}
                            className="p-1 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-error)] text-[10px] flex-shrink-0 opacity-20 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity"
                            title="Delete axis" aria-label="Delete axis"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>

                    {/* Option tabs */}
                    {dim.options.length > 0 && (
                      <div className="relative flex items-stretch border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
                        {tabScrollState[dim.id]?.left && (
                          <button
                            onClick={() => {
                              const el = tabScrollRefs.current[dim.id];
                              if (el) el.scrollBy({ left: -120, behavior: 'smooth' });
                            }}
                            className="absolute left-0 top-0 bottom-0 z-10 flex items-center px-0.5 bg-gradient-to-r from-[var(--color-figma-bg)] to-transparent text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
                            aria-label="Scroll tabs left"
                          >
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><path d="M6 1L2 4l4 3V1z" /></svg>
                          </button>
                        )}
                      <div
                        ref={el => { tabScrollRefs.current[dim.id] = el; }}
                        className="flex items-center gap-0 px-2 pt-1 pb-0 overflow-x-auto"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                      >
                        {dim.options.map((o, _oIdx) => {
                          const optMatches = dimSearch.trim() !== '' && o.name.toLowerCase().includes(dimSearch.trim().toLowerCase());
                          const optMissingCount = coverage[dim.id]?.[o.name]?.uncovered.length ?? 0;
                          const optMissingOverrideCount = missingOverrides[dim.id]?.[o.name]?.missing.length ?? 0;
                          const isSelected = selectedOpt === o.name;
                          const diffCount = isSelected ? 0 : (optionDiffCounts[`${dim.id}/${o.name}`] ?? 0);
                          const isBeingDragged = draggingOpt?.dimId === dim.id && draggingOpt?.optionName === o.name;
                          const isDragTarget = dragOverOpt?.dimId === dim.id && dragOverOpt?.optionName === o.name && draggingOpt?.optionName !== o.name;
                          return (
                          <button
                            key={o.name}
                            draggable={dim.options.length > 1}
                            onDragStart={e => handleOptDragStart(e, dim.id, o.name)}
                            onDragOver={e => handleOptDragOver(e, dim.id, o.name)}
                            onDrop={e => handleOptDrop(e, dim.id, o.name)}
                            onDragEnd={handleOptDragEnd}
                            onClick={() => handleSelectOption(dim.id, o.name)}
                            className={`relative px-2.5 py-1 text-[10px] font-medium rounded-t transition-colors flex-shrink-0 flex items-center gap-1 ${
                              isSelected
                                ? 'text-[var(--color-figma-accent)] bg-[var(--color-figma-bg-secondary)]'
                                : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
                            }${optMatches ? ' ring-1 ring-[var(--color-figma-accent)]/40 rounded' : ''}${isBeingDragged ? ' opacity-40' : ''}${isDragTarget ? ' ring-2 ring-[var(--color-figma-accent)]/60' : ''}${dim.options.length > 1 ? ' cursor-grab active:cursor-grabbing' : ''}`}
                          >
                            {o.name}
                            {!isSelected && diffCount > 0 && (
                              <span
                                className="inline-flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-bold leading-none bg-[var(--color-figma-text-tertiary)]/20 text-[var(--color-figma-text-tertiary)]"
                                title={`${diffCount} token${diffCount !== 1 ? 's' : ''} differ from ${selectedOpt}`}
                              >
                                {diffCount}
                              </span>
                            )}
                            {optMissingCount > 0 && (
                              <span
                                className="inline-flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-bold leading-none bg-[var(--color-figma-warning)]/20 text-[var(--color-figma-warning)]"
                                title={`${optMissingCount} unresolved alias${optMissingCount !== 1 ? 'es' : ''}`}
                              >
                                {optMissingCount}
                              </span>
                            )}
                            {optMissingOverrideCount > 0 && (
                              <span
                                className="inline-flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-bold leading-none bg-violet-500/15 text-violet-600"
                                title={`${optMissingOverrideCount} Base token${optMissingOverrideCount !== 1 ? 's' : ''} not overridden`}
                              >
                                {optMissingOverrideCount}
                              </span>
                            )}
                            {isSelected && (
                              <span className="absolute bottom-0 left-1 right-1 h-[2px] bg-[var(--color-figma-accent)] rounded-t" />
                            )}
                          </button>
                          );
                        })}
                        {/* Add option inline */}
                        {showAddOption[dim.id] ? null : (
                          <button
                            onClick={() => setShowAddOption(prev => ({ ...prev, [dim.id]: true }))}
                            className="px-1.5 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] flex-shrink-0"
                            title="Add option"
                          >
                            +
                          </button>
                        )}
                      </div>
                        {tabScrollState[dim.id]?.right && (
                          <button
                            onClick={() => {
                              const el = tabScrollRefs.current[dim.id];
                              if (el) el.scrollBy({ left: 120, behavior: 'smooth' });
                            }}
                            className="absolute right-0 top-0 bottom-0 z-10 flex items-center px-0.5 bg-gradient-to-l from-[var(--color-figma-bg)] to-transparent text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
                            aria-label="Scroll tabs right"
                          >
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Add option input (when no options exist or user clicked +) */}
                    {(showAddOption[dim.id] || dim.options.length === 0) && (
                      <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
                        <div className="flex items-center gap-1">
                          <input
                            ref={el => { addOptionInputRefs.current[dim.id] = el; }}
                            type="text"
                            value={newOptionNames[dim.id] || ''}
                            onChange={e => { setNewOptionNames(prev => ({ ...prev, [dim.id]: e.target.value })); setAddOptionErrors(prev => ({ ...prev, [dim.id]: '' })); }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleAddOption(dim.id);
                              if (e.key === 'Escape') { setShowAddOption(prev => ({ ...prev, [dim.id]: false })); setNewOptionNames(prev => ({ ...prev, [dim.id]: '' })); setCopyFromNewOption(prev => ({ ...prev, [dim.id]: '' })); }
                            }}
                            placeholder={dim.options.length === 0 ? 'First option (e.g. Light, Dark)' : 'Option name'}
                            className={`flex-1 px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] ${addOptionErrors[dim.id] ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
                            autoFocus
                          />
                          <button onClick={() => handleAddOption(dim.id)} disabled={!newOptionNames[dim.id]?.trim()} className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40">Add</button>
                          {dim.options.length > 0 && (
                            <button onClick={() => { setShowAddOption(prev => ({ ...prev, [dim.id]: false })); setNewOptionNames(prev => ({ ...prev, [dim.id]: '' })); setCopyFromNewOption(prev => ({ ...prev, [dim.id]: '' })); }} className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]">Cancel</button>
                          )}
                        </div>
                        {/* Copy-from selector — only shown when there are existing options to copy from */}
                        {dim.options.length > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-[9px] text-[var(--color-figma-text-tertiary)] flex-shrink-0">Copy assignments from:</span>
                            <select
                              value={copyFromNewOption[dim.id] || ''}
                              onChange={e => setCopyFromNewOption(prev => ({ ...prev, [dim.id]: e.target.value }))}
                              className="flex-1 px-1 py-0.5 rounded text-[9px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                            >
                              <option value="">None (start empty)</option>
                              {dim.options.map(o => (
                                <option key={o.name} value={o.name}>{o.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {addOptionErrors[dim.id] && <p role="alert" className="text-[10px] text-[var(--color-figma-error)] mt-1">{addOptionErrors[dim.id]}</p>}
                      </div>
                    )}

                    {/* Single-option fill banner — surfaced at dimension level so it's visible without expanding coverage */}
                    {!multiOptionGaps && totalDimFillable > 0 && (
                      <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--color-figma-warning)]/25 bg-[var(--color-figma-warning)]/5">
                        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-warning)]">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          <span>{totalDimFillable} gap{totalDimFillable !== 1 ? 's' : ''} in "{optionsWithGaps[0]?.name}"</span>
                        </div>
                        <button
                          onClick={() => optionsWithGaps[0] && handleAutoFillAll(dim.id, optionsWithGaps[0].name)}
                          disabled={fillingKeys.has(`${dim.id}:${optionsWithGaps[0]?.name}:__all__`)}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                          title={`Auto-fill ${totalDimFillable} token${totalDimFillable !== 1 ? 's' : ''} from source sets`}
                        >
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                          {fillingKeys.has(`${dim.id}:${optionsWithGaps[0]?.name}:__all__`) ? 'Filling…' : `Fill from source (${totalDimFillable})`}
                        </button>
                      </div>
                    )}

                    {/* Cross-option fill banner */}
                    {multiOptionGaps && totalDimFillable > 0 && (
                      <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--color-figma-warning)]/25 bg-[var(--color-figma-warning)]/5">
                        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-warning)]">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          <span>{totalDimGaps} gaps across {optionsWithGaps.length} options</span>
                        </div>
                        <button
                          onClick={() => handleAutoFillAllOptions(dim.id)}
                          disabled={isFillAllOptionsInProgress}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 transition-colors"
                          title={`Auto-fill ${totalDimFillable} missing token${totalDimFillable !== 1 ? 's' : ''} across all options`}
                        >
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                          {isFillAllOptionsInProgress ? 'Filling…' : `Fill all options (${totalDimFillable})`}
                        </button>
                      </div>
                    )}

                    {/* Selected option content */}
                    {opt && (
                      <div className="bg-[var(--color-figma-bg-secondary)]">
                        {/* Option actions bar */}
                        <div className="flex items-center justify-between px-3 py-1 border-t border-[var(--color-figma-border)]">
                          {renameOption?.dimId === dim.id && renameOption?.optionName === opt.name ? (
                            <div className="flex flex-col gap-1 flex-1">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={renameOptionValue}
                                  onChange={e => { setRenameOptionValue(e.target.value); setRenameOptionError(null); }}
                                  onKeyDown={e => { if (e.key === 'Enter') executeRenameOption(); else if (e.key === 'Escape') cancelRenameOption(); }}
                                  className={`flex-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] ${renameOptionError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
                                  autoFocus
                                />
                                <button onClick={executeRenameOption} disabled={!renameOptionValue.trim()} className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40">Save</button>
                                <button onClick={cancelRenameOption} className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]">Cancel</button>
                              </div>
                              {renameOptionError && <p role="alert" className="text-[10px] text-[var(--color-figma-error)]">{renameOptionError}</p>}
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-1">
                                {dim.options.length > 1 && (
                                  <button
                                    onClick={() => openCompareView(dim, opt.name)}
                                    className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] font-medium border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                                    title={`Compare ${opt.name} against another ${dim.name} option`}
                                  >
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
                                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                                      <path d="M9 12h6" />
                                    </svg>
                                    Compare {opt.name}
                                  </button>
                                )}
                                {((coverage[dim.id]?.[selectedOpt]?.uncovered.length ?? 0) > 0 || (missingOverrides[dim.id]?.[selectedOpt]?.missing.length ?? 0) > 0) && (
                                  <button
                                    onClick={() => openCoverageView(dim.id, opt.name)}
                                    className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] font-medium border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                                    title={`Review coverage for ${dim.name} → ${opt.name}`}
                                  >
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <rect x="3" y="3" width="7" height="7" />
                                      <rect x="14" y="3" width="7" height="7" />
                                      <rect x="3" y="14" width="7" height="7" />
                                      <rect x="14" y="14" width="7" height="7" />
                                    </svg>
                                    Review coverage
                                  </button>
                                )}
                                {hasUncovered && (
                                  <button
                                    onClick={() => setExpandedCoverage(prev => { const next = new Set(prev); next.has(covKey) ? next.delete(covKey) : next.add(covKey); return next; })}
                                    className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)] border border-[var(--color-figma-warning)]/40 hover:bg-[var(--color-figma-warning)]/25 transition-colors"
                                    title={`${coverage[dim.id][selectedOpt].uncovered.length} tokens have no value in active sets`}
                                  >
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                    {coverage[dim.id][selectedOpt].uncovered.length} gaps
                                  </button>
                                )}
                                {staleSetNames.length > 0 && (
                                  <button
                                    onClick={() => setExpandedStale(prev => { const next = new Set(prev); next.has(covKey) ? next.delete(covKey) : next.add(covKey); return next; })}
                                    className="flex items-center gap-1 px-1 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-error)]/15 text-[var(--color-figma-error)] border border-[var(--color-figma-error)]/40 hover:bg-[var(--color-figma-error)]/25 transition-colors"
                                    title={`${staleSetNames.length} set${staleSetNames.length !== 1 ? 's' : ''} referenced here no longer exist`}
                                  >
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                                    {staleSetNames.length} stale
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center gap-0.5">
                                {dim.options.length > 1 && (
                                  <>
                                    <button onClick={() => handleMoveOption(dim.id, opt.name, 'up')} disabled={dim.options.indexOf(opt) === 0} className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] disabled:opacity-25 disabled:pointer-events-none" title="Move option left" aria-label="Move option left">
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
                                    </button>
                                    <button onClick={() => handleMoveOption(dim.id, opt.name, 'down')} disabled={dim.options.indexOf(opt) === dim.options.length - 1} className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] disabled:opacity-25 disabled:pointer-events-none" title="Move option right" aria-label="Move option right">
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
                                    </button>
                                  </>
                                )}
                                <button onClick={() => startRenameOption(dim.id, opt.name)} className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]" title="Rename option" aria-label="Rename option">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                </button>
                                <button onClick={() => handleDuplicateOption(dim.id, opt.name)} className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]" title="Duplicate option" aria-label="Duplicate option">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                                  </svg>
                                </button>
                                {/* Copy assignments from another option — only shown when there are other options */}
                                {dim.options.length > 1 && (
                                  <div className="relative">
                                    <button
                                      onClick={e => { e.stopPropagation(); setShowCopyFromMenu(prev => prev?.dimId === dim.id && prev?.optionName === opt.name ? null : { dimId: dim.id, optionName: opt.name }); }}
                                      className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
                                      title="Copy assignments from another option"
                                      aria-label="Copy assignments from another option"
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>
                                        <path d="M9 2h6a1 1 0 011 1v2a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z"/>
                                        <path d="M8 14l4-4 4 4" strokeWidth="1.5"/>
                                      </svg>
                                    </button>
                                    {showCopyFromMenu?.dimId === dim.id && showCopyFromMenu?.optionName === opt.name && (
                                      <div
                                        ref={copyFromMenuRef}
                                        className="absolute right-0 top-full mt-0.5 z-50 min-w-[140px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg py-0.5"
                                        onClick={e => e.stopPropagation()}
                                      >
                                        <div className="px-2 py-1 text-[9px] font-medium text-[var(--color-figma-text-tertiary)] border-b border-[var(--color-figma-border)] mb-0.5">Copy assignments from:</div>
                                        {dim.options.filter(o => o.name !== opt.name).map(sourceOpt => (
                                          <button
                                            key={sourceOpt.name}
                                            onClick={() => handleCopyAssignmentsFrom(dim.id, opt.name, sourceOpt.name)}
                                            className="w-full text-left px-2 py-1 text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] truncate"
                                            role="menuitem"
                                          >
                                            {sourceOpt.name}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                                <button onClick={() => setOptionDeleteConfirm({ dimId: dim.id, optionName: opt.name })} className="p-1.5 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-error)]" title="Delete option" aria-label="Delete option">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                  </svg>
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Set groups */}
                        {sets.length > 0 && (
                          <div
                            ref={(el) => {
                              setRoleRefs.current[`${dim.id}:${opt.name}`] = el;
                            }}
                            className="border-t border-[var(--color-figma-border)]"
                          >
                            {/* Merge model diagram — shows how Base + Override sets resolve to final tokens */}
                            <div className="px-3 pt-2 pb-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/40 text-[9px]">
                              <div className="text-[var(--color-figma-text-tertiary)] font-medium mb-1.5">How sets merge for this option:</div>
                              <div className="flex items-center gap-1.5">
                                {/* Stack: Override layer on top */}
                                <div className="flex-1 flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--color-figma-success)]/10 border border-[var(--color-figma-success)]/25" title={STATE_DESCRIPTIONS['enabled']}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-figma-success)] flex-shrink-0" aria-hidden="true" />
                                    <span className="font-semibold text-[var(--color-figma-success)]">Override</span>
                                    <span className="text-[var(--color-figma-text-tertiary)] ml-auto">wins on conflict</span>
                                  </div>
                                  <div className="flex items-center justify-center text-[var(--color-figma-text-tertiary)] leading-none" aria-hidden="true">+</div>
                                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)]/10 border border-[var(--color-figma-accent)]/25" title={STATE_DESCRIPTIONS['source']}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-figma-accent)] flex-shrink-0" aria-hidden="true" />
                                    <span className="font-semibold text-[var(--color-figma-accent)]">Base</span>
                                    <span className="text-[var(--color-figma-text-tertiary)] ml-auto">all other tokens</span>
                                  </div>
                                </div>
                                {/* Arrow → result */}
                                <div className="flex flex-col items-center gap-0.5 text-[var(--color-figma-text-tertiary)] flex-shrink-0" aria-hidden="true">
                                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8.5 3.5v7.086l2.793-2.793.707.707-3.5 3.5a.5.5 0 01-.707 0l-3.5-3.5.707-.707L7.5 10.586V3.5h1z" transform="rotate(-90 8 8)" /></svg>
                                </div>
                                {/* Result box */}
                                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] flex-shrink-0 self-center">
                                  <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                                  <span className="text-[var(--color-figma-text-secondary)] font-medium">Resolved</span>
                                </div>
                              </div>
                              <div className="mt-1 text-[var(--color-figma-text-tertiary)] opacity-70">
                                <span className="inline-flex items-center gap-0.5">
                                  <span className="w-1 h-1 rounded-full bg-[var(--color-figma-text-tertiary)]/50 inline-block" aria-hidden="true" />
                                  Excluded
                                </span>
                                {' '}sets are not included in resolved output.
                              </div>
                            </div>
                            {/* Batch assignment toolbar — set all sets to one state at once */}
                            {sets.length > 1 && (
                              <div className="px-3 py-1 flex items-center gap-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
                                <span className="text-[9px] text-[var(--color-figma-text-tertiary)] flex-shrink-0">Set all:</span>
                                <button
                                  onClick={() => handleBulkSetAllInOption(dim.id, opt.name, 'source')}
                                  className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] border border-[var(--color-figma-accent)]/20 hover:bg-[var(--color-figma-accent)]/20 transition-colors"
                                  title="Set all token sets to Base (source)"
                                >
                                  Base
                                </button>
                                <button
                                  onClick={() => handleBulkSetAllInOption(dim.id, opt.name, 'enabled')}
                                  className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[var(--color-figma-success)]/10 text-[var(--color-figma-success)] border border-[var(--color-figma-success)]/20 hover:bg-[var(--color-figma-success)]/20 transition-colors"
                                  title="Set all token sets to Override (enabled)"
                                >
                                  Override
                                </button>
                                <button
                                  onClick={() => handleBulkSetAllInOption(dim.id, opt.name, 'disabled')}
                                  className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)] border border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                                  title="Set all token sets to Excluded (disabled)"
                                >
                                  Excluded
                                </button>
                              </div>
                            )}
                            {/* Override section */}
                            {overrideSets.length > 0 && (
                              <div>
                                <div className="px-3 py-0.5 flex items-center gap-1 text-[10px] font-medium text-[var(--color-figma-success)] bg-[var(--color-figma-success)]/5">
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                                  Override ({overrideSets.length})
                                  <span className="text-[var(--color-figma-text-tertiary)] font-normal ml-1">highest priority</span>
                                </div>
                                {overrideSets.map(s => renderSetRow(dim, opt, s, 'enabled'))}
                              </div>
                            )}

                            {/* Base section */}
                            {foundationSets.length > 0 && (
                              <div>
                                <div className="px-3 py-0.5 flex items-center gap-1 text-[10px] font-medium text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/5">
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="3" opacity="0.3" /></svg>
                                  Base ({foundationSets.length})
                                  <span className="text-[var(--color-figma-text-tertiary)] font-normal ml-1">default values</span>
                                </div>
                                {foundationSets.map(s => renderSetRow(dim, opt, s, 'source'))}
                              </div>
                            )}

                            {/* Excluded section — collapsed by default */}
                            {disabledSets.length > 0 && (
                              <div>
                                <button
                                  onClick={() => setCollapsedDisabled(prev => {
                                    const next = new Set(prev);
                                    next.has(dim.id) ? next.delete(dim.id) : next.add(dim.id);
                                    return next;
                                  })}
                                  className="w-full px-3 py-0.5 flex items-center gap-1 text-[10px] font-medium text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors text-left"
                                  title={STATE_DESCRIPTIONS['disabled']}
                                >
                                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${isDisabledCollapsed ? '' : 'rotate-90'}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
                                  Excluded ({disabledSets.length})
                                </button>
                                {!isDisabledCollapsed && disabledSets.map(s => renderSetRow(dim, opt, s, 'disabled'))}
                              </div>
                            )}

                            {/* Getting started hint — shown when no sets are assigned yet */}
                            {overrideSets.length === 0 && foundationSets.length === 0 && disabledSets.length > 0 && !isDisabledCollapsed && (
                              <div className="mx-3 my-2 px-2.5 py-2 rounded border border-[var(--color-figma-accent)]/25 bg-[var(--color-figma-accent)]/5 text-[9px]">
                                <div className="font-semibold text-[var(--color-figma-accent)] mb-1">Assign sets to activate this option</div>
                                <div className="flex flex-col gap-1 text-[var(--color-figma-text-secondary)]">
                                  <div className="flex items-start gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-figma-accent)] flex-shrink-0 mt-0.5" aria-hidden="true" />
                                    <span><span className="font-medium text-[var(--color-figma-accent)]">Base</span> — full-coverage sets that define all token values (e.g. a global primitives set)</span>
                                  </div>
                                  <div className="flex items-start gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-figma-success)] flex-shrink-0 mt-0.5" aria-hidden="true" />
                                    <span><span className="font-medium text-[var(--color-figma-success)]">Override</span> — sets that replace specific tokens for this variant (e.g. a dark-mode color set)</span>
                                  </div>
                                </div>
                                <div className="mt-1.5 text-[var(--color-figma-text-tertiary)]">Expand &ldquo;Excluded&rdquo; below and assign each set a role.</div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Coverage gaps */}
                        {expandedCoverage.has(covKey) && (coverage[dim.id]?.[selectedOpt]?.uncovered.length ?? 0) > 0 && (() => {
                          const uncoveredItems = coverage[dim.id][selectedOpt].uncovered;
                          const fillableItems = uncoveredItems.filter(i => i.missingRef && i.fillValue !== undefined);
                          const unfillableItems = uncoveredItems.filter(i => !i.missingRef || i.fillValue === undefined);
                          const isFillAllInProgress = fillingKeys.has(`${dim.id}:${selectedOpt}:__all__`);

                          const renderCoverageRow = (item: CoverageToken, canFill: boolean) => {
                            const isFilling = fillingKeys.has(`${dim.id}:${selectedOpt}:${item.path}`);
                            return (
                              <div key={item.path} className="flex items-center gap-1.5 group/fill py-0.5" role="listitem">
                                {/* Status chip */}
                                {canFill ? (
                                  <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-1 py-px rounded text-[8px] font-semibold bg-emerald-500/15 text-emerald-600" title="Can be auto-filled from another set">
                                    <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 5.5l2.5 2.5L8 3" /></svg>
                                    Fillable
                                  </span>
                                ) : (
                                  <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-1 py-px rounded text-[8px] font-semibold bg-red-500/15 text-red-600" title="No fill value available — requires manual fix">
                                    <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" /></svg>
                                    Manual
                                  </span>
                                )}
                                {onNavigateToToken && item.set ? (
                                  <button
                                    onClick={() => onNavigateToToken(item.path, item.set)}
                                    className="flex-1 text-left text-[10px] text-[var(--color-figma-text)] font-mono truncate hover:underline cursor-pointer"
                                    title={`Navigate to ${item.path} in set "${item.set}"${item.missingRef ? `\nMissing: {${item.missingRef}}` : ''}`}
                                  >
                                    {item.path}
                                  </button>
                                ) : (
                                  <div className="flex-1 text-[10px] text-[var(--color-figma-text-secondary)] font-mono truncate" title={item.missingRef ? `Missing: {${item.missingRef}}` : undefined}>{item.path}</div>
                                )}
                                {canFill && (
                                  <button
                                    onClick={() => handleAutoFillSingle(dim.id, selectedOpt, item)}
                                    disabled={isFilling}
                                    className="flex-shrink-0 opacity-40 group-hover/fill:opacity-100 pointer-events-none group-hover/fill:pointer-events-auto px-1 py-0.5 rounded text-[9px] font-medium bg-[var(--color-figma-accent)]/80 text-white hover:bg-[var(--color-figma-accent)] disabled:opacity-50 transition-opacity"
                                    title={`Create ${item.missingRef} in override set`}
                                  >
                                    {isFilling ? '…' : 'Fill'}
                                  </button>
                                )}
                                {!canFill && onCreateToken && (
                                  <button
                                    onClick={() => {
                                      const createPath = item.missingRef ?? item.path;
                                      onCreateToken(createPath, item.set);
                                    }}
                                    className="flex-shrink-0 opacity-40 group-hover/fill:opacity-100 pointer-events-none group-hover/fill:pointer-events-auto px-1 py-0.5 rounded text-[9px] font-medium bg-[var(--color-figma-bg-tertiary)] text-[var(--color-figma-text)] border border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-opacity"
                                    title={item.missingRef ? `Create token "${item.missingRef}" to resolve missing alias` : `Create token "${item.path}" in set "${item.set}"`}
                                  >
                                    Create
                                  </button>
                                )}
                              </div>
                            );
                          };

                          return (
                          <div className="border-t border-[var(--color-figma-warning)]/25 bg-[var(--color-figma-warning)]/5 px-3 py-2">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="text-[10px] font-medium text-[var(--color-figma-warning)]">
                                Missing values ({uncoveredItems.length})
                              </div>
                              {fillableItems.length > 0 && (
                                <button
                                  onClick={() => handleAutoFillAll(dim.id, selectedOpt)}
                                  disabled={isFillAllInProgress}
                                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                  title={`Auto-fill ${fillableItems.length} token${fillableItems.length !== 1 ? 's' : ''} from source sets into the override set`}
                                >
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                                  {isFillAllInProgress ? 'Filling…' : `Fill from source (${fillableItems.length})`}
                                </button>
                              )}
                            </div>

                            {/* Summary chips */}
                            <div className="flex items-center gap-2 mb-1.5">
                              {fillableItems.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-medium text-emerald-600">
                                  <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 5.5l2.5 2.5L8 3" /></svg>
                                  {fillableItems.length} fillable
                                </span>
                              )}
                              {unfillableItems.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-medium text-red-600">
                                  <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" /></svg>
                                  {unfillableItems.length} need manual fix
                                </span>
                              )}
                            </div>

                            <div className="flex flex-col gap-0 max-h-48 overflow-y-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)] rounded" role="list" tabIndex={0} aria-label={`Missing tokens for ${selectedOpt}`}>
                              {/* Unfillable tokens first (most urgent) */}
                              {unfillableItems.length > 0 && (
                                <>
                                  {fillableItems.length > 0 && (
                                    <div className="text-[9px] font-semibold text-red-600 uppercase tracking-wider pt-1 pb-0.5">Needs attention</div>
                                  )}
                                  {unfillableItems.map(item => renderCoverageRow(item, false))}
                                </>
                              )}
                              {/* Fillable tokens */}
                              {fillableItems.length > 0 && (
                                <>
                                  {unfillableItems.length > 0 && (
                                    <div className="text-[9px] font-semibold text-emerald-600 uppercase tracking-wider pt-1.5 pb-0.5">Auto-fillable</div>
                                  )}
                                  {fillableItems.map(item => renderCoverageRow(item, true))}
                                </>
                              )}
                            </div>
                          </div>
                          );
                        })()}
                        {/* Missing overrides: source tokens absent from enabled/override sets */}
                        {(() => {
                          const moItems = missingOverrides[dim.id]?.[selectedOpt]?.missing ?? [];
                          if (moItems.length === 0 || overrideSets.length === 0) return null;
                          const moKey = covKey;
                          const isExpanded = expandedMissingOverrides.has(moKey);
                          const searchQ = (missingOverrideSearch[moKey] ?? '').toLowerCase();
                          const filteredMo = searchQ ? moItems.filter(i => i.path.toLowerCase().includes(searchQ)) : moItems;
                          const targetSet = overrideSets[0];
                          const isCreating = creatingMissingKeys.has(`${dim.id}:${selectedOpt}:__missing__`);
                          return (
                            <div className="border-t border-[var(--color-figma-border)]">
                              {/* Collapsible header */}
                              <button
                                onClick={() => setExpandedMissingOverrides(prev => {
                                  const next = new Set(prev);
                                  next.has(moKey) ? next.delete(moKey) : next.add(moKey);
                                  return next;
                                })}
                                className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                                aria-expanded={isExpanded}
                                title={`${moItems.length} token${moItems.length !== 1 ? 's' : ''} from Base sets have no override in "${targetSet}"`}
                              >
                                <div className="flex items-center gap-1.5">
                                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform flex-shrink-0 text-[var(--color-figma-text-tertiary)] ${isExpanded ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
                                  <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                                    Missing overrides
                                  </span>
                                  <span className="inline-flex items-center justify-center min-w-[16px] h-[14px] px-1 rounded-full text-[9px] font-bold leading-none bg-violet-500/15 text-violet-600">
                                    {moItems.length}
                                  </span>
                                </div>
                                {isExpanded && (
                                  <button
                                    onClick={e => { e.stopPropagation(); handleBulkCreateMissingOverrides(dim.id, selectedOpt, targetSet, moItems); }}
                                    disabled={isCreating}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                                    title={`Copy all ${moItems.length} Base token${moItems.length !== 1 ? 's' : ''} into "${targetSet}" as overrides (skip existing)`}
                                    aria-label={`Create ${moItems.length} missing overrides in ${targetSet}`}
                                  >
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                                    {isCreating ? 'Creating…' : `Create all (${moItems.length})`}
                                  </button>
                                )}
                              </button>
                              {isExpanded && (
                                <div className="bg-[var(--color-figma-bg-secondary)]/40 px-3 pb-2">
                                  <p className="text-[9px] text-[var(--color-figma-text-tertiary)] mb-1.5">
                                    These tokens are in Base sets but have no value in <span className="font-medium text-[var(--color-figma-text-secondary)]">{targetSet}</span>. Creating them copies the Base value as a starting point.
                                  </p>
                                  {moItems.length > 8 && (
                                    <input
                                      type="text"
                                      placeholder="Filter tokens…"
                                      value={missingOverrideSearch[moKey] ?? ''}
                                      onChange={e => setMissingOverrideSearch(prev => ({ ...prev, [moKey]: e.target.value }))}
                                      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); if (missingOverrideSearch[moKey]) setMissingOverrideSearch(prev => ({ ...prev, [moKey]: '' })); (e.currentTarget as HTMLInputElement).blur(); } }}
                                      className="w-full mb-1.5 px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-tertiary)]"
                                    />
                                  )}
                                  <div className="flex flex-col gap-0 max-h-48 overflow-y-auto rounded" role="list" aria-label={`Missing override tokens for ${selectedOpt}`}>
                                    {filteredMo.length === 0 && (
                                      <div className="py-1 text-[9px] text-[var(--color-figma-text-tertiary)] italic">No tokens match</div>
                                    )}
                                    {filteredMo.map(item => {
                                      const isItemCreating = creatingMissingKeys.has(`${dim.id}:${selectedOpt}:${item.path}`);
                                      return (
                                        <div key={item.path} className="flex items-center gap-1.5 group/mo py-0.5" role="listitem">
                                          <div className="flex-1 min-w-0">
                                            {onNavigateToToken ? (
                                              <button
                                                onClick={() => onNavigateToToken(item.path, item.sourceSet)}
                                                className="text-left text-[10px] text-[var(--color-figma-text)] font-mono truncate hover:underline cursor-pointer block w-full"
                                                title={`${item.path} — from "${item.sourceSet}"${item.type ? ` (${item.type})` : ''}`}
                                              >
                                                {item.path}
                                              </button>
                                            ) : (
                                              <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-mono truncate" title={`${item.path} — from "${item.sourceSet}"${item.type ? ` (${item.type})` : ''}`}>
                                                {item.path}
                                              </div>
                                            )}
                                          </div>
                                          <span className="flex-shrink-0 text-[9px] text-[var(--color-figma-text-tertiary)] truncate max-w-[60px]" title={String(item.value)}>
                                            {String(item.value).slice(0, 20)}{String(item.value).length > 20 ? '…' : ''}
                                          </span>
                                          <button
                                            onClick={() => {
                                              const key = `${dim.id}:${selectedOpt}:${item.path}`;
                                              setCreatingMissingKeys(prev => { const n = new Set(prev); n.add(key); return n; });
                                              handleBulkCreateMissingOverrides(dim.id, selectedOpt, targetSet, [item]).finally(() => {
                                                setCreatingMissingKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
                                              });
                                            }}
                                            disabled={isItemCreating || isCreating}
                                            className="flex-shrink-0 opacity-0 group-hover/mo:opacity-100 group-focus-within/mo:opacity-100 pointer-events-none group-hover/mo:pointer-events-auto group-focus-within/mo:pointer-events-auto px-1 py-0.5 rounded text-[9px] font-medium bg-violet-600/80 text-white hover:bg-violet-600 disabled:opacity-40 transition-opacity"
                                            title={`Copy "${item.path}" from Base into "${targetSet}"`}
                                          >
                                            {isItemCreating ? '…' : 'Copy'}
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {filteredMo.length < moItems.length && (
                                    <div className="pt-1 text-[9px] text-[var(--color-figma-text-tertiary)]">
                                      Showing {filteredMo.length} of {moItems.length}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {expandedStale.has(covKey) && staleSetNames.length > 0 && (
                          <div className="border-t border-[var(--color-figma-error)]/25 bg-[var(--color-figma-error)]/10 px-3 py-2">
                            <div className="text-[10px] font-medium text-[var(--color-figma-error)] mb-1">
                              Deleted sets ({staleSetNames.length})
                            </div>
                            <p className="text-[10px] text-[var(--color-figma-text-secondary)] mb-1.5">These sets are referenced but no longer exist.</p>
                            <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)] rounded" role="list" tabIndex={0} aria-label={`Deleted sets for ${selectedOpt}`}>
                              {staleSetNames.map(s => (
                                <div key={s} className="text-[10px] text-[var(--color-figma-text-secondary)] font-mono truncate" role="listitem" title={s}>{s}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {dimSearch && filteredDimensions.length === 0 && (
                <div className="px-3 py-4 text-center text-[11px] text-[var(--color-figma-text-tertiary)]">
                  No dimensions or options matching &ldquo;{dimSearch}&rdquo;
                </div>
              )}
              {dimSearch && filteredDimensions.length > 0 && filteredDimensions.length < dimensions.length && (
                <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] text-center">
                  Showing {filteredDimensions.length} of {dimensions.length} axes
                </div>
              )}
            </div>
            </>)}

            {/* Coverage tab view */}
            {activeView === 'coverage' && (
              <ThemeCoverageMatrix
                dimensions={coverageDimensions}
                coverage={coverage}
                missingOverrides={missingOverrides}
                setTokenValues={setTokenValues}
                onSelectOption={(dimId, optionName) => {
                  handleSelectOption(dimId, optionName);
                  returnToAuthoring(dimId);
                }}
              />
            )}

            {/* Compare tab view */}
            {activeView === 'compare' && (
              <UnifiedComparePanel
                mode={compareMode}
                onModeChange={setCompareMode}
                tokenPaths={compareTokenPaths}
                onClearTokenPaths={() => setCompareTokenPaths(new Set())}
                tokenPath={compareTokenPath}
                onClearTokenPath={() => setCompareTokenPath('')}
                allTokensFlat={allTokensFlat}
                pathToSet={pathToSet}
                dimensions={dimensions}
                sets={sets}
                themeOptionsKey={compareThemeKey}
                themeOptionsDefaultA={compareThemeDefaultA}
                themeOptionsDefaultB={compareThemeDefaultB}
                onEditToken={(set, path) => onNavigateToToken?.(path, set)}
                onCreateToken={(path, set) => onCreateToken?.(path, set)}
                onGoToTokens={onGoToTokens ?? (() => setActiveView('authoring'))}
                serverUrl={serverUrl}
                onTokensCreated={() => { debouncedFetchDimensions(); onTokensCreated?.(); }}
                onBack={() => {
                  returnToAuthoring(compareFocusDimension?.id ?? compareContext.dimId);
                }}
                backLabel={compareFocusDimension ? `Back to ${compareFocusDimension.name}` : 'Back to authoring'}
              />
            )}

            {activeView === 'advanced' && resolverState && (
              <div className="h-full min-h-0 overflow-hidden">
                <ResolverContent {...resolverState} onSuccess={onSuccess} />
              </div>
            )}

            {/* Live Token Resolution Preview — only in theme authoring view */}
            {activeView === 'authoring' && showPreview && dimensions.length > 0 && (
              <div ref={previewSectionRef} className="border-t-2 border-[var(--color-figma-accent)]/30">
                <div className="px-3 py-1.5 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--color-figma-text)]">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    Token Resolution Preview
                  </div>
                  <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                    {dimensions.map(d => {
                      const optName = selectedOptions[d.id];
                      return optName ? `${d.name}: ${optName}` : null;
                    }).filter(Boolean).join(' + ')}
                  </span>
                </div>
                <div className="px-3 py-1 border-t border-[var(--color-figma-border)]">
                  <input
                    ref={previewSearchRef}
                    type="text"
                    placeholder="Search tokens..."
                    value={previewSearch}
                    onChange={e => setPreviewSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); if (previewSearch) setPreviewSearch(''); previewSearchRef.current?.blur(); } }}
                    className="w-full bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-tertiary)] focus:focus-visible:border-[var(--color-figma-accent)]"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {previewTokens.length === 0 ? (
                    <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-tertiary)] text-center italic">
                      {Object.keys(setTokenValues).length === 0
                        ? 'No token data available'
                        : dimensions.every(d => {
                            const opt = d.options.find(o => o.name === selectedOptions[d.id]);
                            return !opt || Object.values(opt.sets).every(s => s === 'disabled');
                          })
                        ? 'Assign sets as Base or Override to see resolved tokens'
                        : previewSearch
                        ? 'No matching tokens'
                        : 'No tokens resolved with current selections'}
                    </div>
                  ) : (
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="text-left text-[var(--color-figma-text-tertiary)] bg-[var(--color-figma-bg-secondary)]">
                          <th className="px-3 py-0.5 font-medium">Token</th>
                          <th className="px-2 py-0.5 font-medium">Value</th>
                          <th className="px-2 py-0.5 font-medium text-right">Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-figma-border)]">
                        {previewTokens.map(t => (
                          <tr
                            key={t.path}
                            className="hover:bg-[var(--color-figma-bg-hover)] cursor-default"
                            onClick={() => onNavigateToToken?.(t.path, t.set)}
                            title={`${t.path}\nRaw: ${typeof t.rawValue === 'object' ? JSON.stringify(t.rawValue) : t.rawValue}\nFrom: ${t.set} (${t.layer})`}
                          >
                            <td className="px-3 py-0.5 font-mono text-[var(--color-figma-text)] truncate max-w-[120px]">{t.path}</td>
                            <td className="px-2 py-0.5 text-[var(--color-figma-text-secondary)]">{renderValuePreview(t.resolvedValue)}</td>
                            <td className="px-2 py-0.5 text-right text-[var(--color-figma-text-tertiary)] truncate max-w-[80px]" title={t.layer}>{t.set}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {previewTokens.length >= 50 && (
                    <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] text-center border-t border-[var(--color-figma-border)]">
                      Showing first 50 tokens. Use search to filter.
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Create dimension footer — only shown in the authoring view */}
      <div className={`p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] ${activeView !== 'authoring' ? 'hidden' : ''}`}>
        {showCreateDim ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                Axis name
              </label>
              <input
                type="text"
                value={newDimName}
                onChange={e => setNewDimName(e.target.value)}
                placeholder="e.g. Mode, Brand, Density"
                className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)] ${createDimError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
                onKeyDown={e => e.key === 'Enter' && handleCreateDimension()}
                autoFocus
              />
              <p className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-snug">
                Each axis has options — e.g. <span className="font-medium">Mode:</span> light, dark &nbsp;·&nbsp; <span className="font-medium">Brand:</span> default, premium
              </p>
            </div>
            {createDimError && <p role="alert" className="text-[10px] text-[var(--color-figma-error)]">{createDimError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleCreateDimension}
                disabled={!newDimName || isCreatingDim}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
              >
                {isCreatingDim ? 'Creating…' : 'Create axis'}
              </button>
              <button
                onClick={closeCreateDim}
                className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => openCreateDim()}
            className="w-full px-3 py-1.5 rounded border border-dashed border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)] hover:border-[var(--color-figma-text-secondary)] transition-colors text-left flex items-center gap-1.5"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="6" rx="1.5" />
              <rect x="3" y="12" width="18" height="6" rx="1.5" opacity="0.5" />
            </svg>
            Add theme axis
          </button>
        )}
      </div>
      </>

      <ThemeManagerModals />
    </div>
    </ThemeManagerModalsProvider>
  );
}
