import { useState, useCallback, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import type { TokenNode } from '../hooks/useTokens';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import type { ApiErrorBody, NodeCapabilities, TokenMapEntry } from '../../shared/types';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';
import { BatchEditor } from './BatchEditor';
import { TokenCanvas } from './TokenCanvas';
import { TokenGraph } from './TokenGraph';
import { colorDeltaE } from '../shared/colorUtils';
import { stableStringify, getErrorMessage } from '../shared/utils';
import { STORAGE_KEY, lsGet, lsSet } from '../shared/storage';
import type { SortOrder } from './tokenListUtils';
import {
  formatDisplayPath, nodeParentPath, flattenVisible,
  pruneDeletedPaths, filterByDuplicatePaths, filterTokenNodes,
  sortTokenNodes, collectGroupPathsByDepth, collectAllGroupPaths,
  flattenLeafNodes, findLeafByPath, collectGroupLeaves, getDefaultValue,
  hasStructuredQualifiers, parseStructuredQuery, QUERY_QUALIFIERS,
} from './tokenListUtils';
import type { TokenGenerator } from '../hooks/useGenerators';
import type { LintViolation } from '../hooks/useLint';
import type { TokenListProps, DeleteConfirm, PromoteRow } from './tokenListTypes';
import { VIRTUAL_ITEM_HEIGHT, VIRTUAL_CHAIN_EXPAND_HEIGHT, VIRTUAL_OVERSCAN } from './tokenListTypes';
import { validateJsonRefs, valuesEqual, parseInlineValue, inferTypeFromValue, highlightMatch } from './tokenListHelpers';
import { TokenTreeNode } from './TokenTreeNode';
import { TokenListModals } from './TokenListModals';
import { TokenTableView } from './TokenTableView';
import { useRecentlyTouched } from '../hooks/useRecentlyTouched';

export function TokenList({
  ctx: { setName, sets, serverUrl, connected, selectedNodes },
  data: { tokens, allTokensFlat, lintViolations = [], syncSnapshot, generators, derivedTokenPaths, cascadeDiff, perSetFlat, collectionMap = {}, modeMap = {} },
  actions: { onEdit, onPreview, onCreateNew, onRefresh, onPushUndo, onTokenCreated, onNavigateToAlias, onClearHighlight, onSyncGroup, onSyncGroupStyles, onSetGroupScopes, onGenerateScaleFromGroup, onRefreshGenerators, onToggleIssuesOnly, onFilteredCountChange, onNavigateToSet, onTokenTouched, onError },
  defaultCreateOpen,
  highlightedToken,
  showIssuesOnly,
}: TokenListProps) {
  const [showCreateForm, setShowCreateForm] = useState(defaultCreateOpen ?? false);
  const [newTokenPath, setNewTokenPath] = useState('');
  const [newTokenType, setNewTokenTypeState] = useState(() => {
    try { return localStorage.getItem('tm_last_token_type') || 'color'; } catch { return 'color'; }
  });
  const setNewTokenType = (t: string) => {
    setNewTokenTypeState(t);
    try { localStorage.setItem('tm_last_token_type', t); } catch {}
  };
  const [newTokenValue, setNewTokenValue] = useState('');
  const [newTokenDescription, setNewTokenDescription] = useState('');
  const [typeAutoInferred, setTypeAutoInferred] = useState(false);
  const [createError, setCreateError] = useState('');
  const [siblingPrefix, setSiblingPrefix] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ type: 'variables' | 'styles'; count: number } | null>(null);
  const [varDiffPending, setVarDiffPending] = useState<{ added: number; modified: number; unchanged: number; flat: any[] } | null>(null);
  const [varDiffLoading, setVarDiffLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const [renameTokenConfirm, setRenameTokenConfirm] = useState<{ oldPath: string; newPath: string; depCount: number; deps: Array<{ path: string; setName: string }> } | null>(null);
  const [locallyDeletedPaths, setLocallyDeletedPaths] = useState<Set<string>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const lastSelectedPathRef = useRef<string | null>(null);
  const varReadResolveRef = useRef<((tokens: any[]) => void) | null>(null);
  const varReadCorrelIdRef = useRef<string | null>(null);
  const [dragSource, setDragSource] = useState<{ paths: string[]; names: string[] } | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [dragOverGroupIsInvalid, setDragOverGroupIsInvalid] = useState(false);
  const [dragOverReorder, setDragOverReorder] = useState<{ path: string; position: 'before' | 'after' } | null>(null);
  const [showBatchEditor, setShowBatchEditor] = useState(false);
  const [promoteRows, setPromoteRows] = useState<PromoteRow[] | null>(null);
  const [promoteBusy, setPromoteBusy] = useState(false);
  const [showScaffold, setShowScaffold] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [frFind, setFrFind] = useState('');
  const [frReplace, setFrReplace] = useState('');
  const [frIsRegex, setFrIsRegex] = useState(false);
  const [frError, setFrError] = useState('');
  const [frBusy, setFrBusy] = useState(false);

  // New-group dialog: null = closed, string = parent path ('' = root level)
  const [newGroupDialogParent, setNewGroupDialogParent] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupError, setNewGroupError] = useState('');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [showRecentlyTouched, setShowRecentlyTouched] = useState(false);
  const recentlyTouched = useRecentlyTouched();

  // Track editor saves: highlightedToken is set to saved path after TokenEditor save
  const prevHighlightRef = useRef<string | null>(null);
  useEffect(() => {
    if (highlightedToken && highlightedToken !== prevHighlightRef.current) {
      recentlyTouched.recordTouch(highlightedToken);
    }
    prevHighlightRef.current = highlightedToken ?? null;
  }, [highlightedToken, recentlyTouched]);

  const generatorsBySource = useMemo(() => {
    const map = new Map<string, TokenGenerator[]>();
    for (const gen of generators ?? []) {
      if (!gen.sourceToken) continue;
      const arr = map.get(gen.sourceToken) ?? [];
      arr.push(gen);
      map.set(gen.sourceToken, arr);
    }
    return map;
  }, [generators]);

  // Expand/collapse state — persisted in sessionStorage per set
  const setNameRef = useRef(setName);
  setNameRef.current = setName;
  const initializedForSet = useRef<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [expandedChains, setExpandedChains] = useState<Set<string>>(new Set());
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const moreFiltersRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const createFormRef = useRef<HTMLDivElement>(null);
  const virtualListRef = useRef<HTMLDivElement>(null);
  const [virtualScrollTop, setVirtualScrollTop] = useState(0);
  // Refs for scroll-position preservation across filter changes (avoids TDZ issues with stale closures)
  const virtualScrollTopRef = useRef(0);
  const flatItemsRef = useRef<Array<{ node: { path: string } }>>([]);
  const itemOffsetsRef = useRef<number[]>([0]);
  const scrollAnchorPathRef = useRef<string | null>(null);
  const isFilterChangeRef = useRef(false);

  // Scroll to and pulse the create form when it appears
  useEffect(() => {
    if (showCreateForm && createFormRef.current) {
      createFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      createFormRef.current.classList.remove('create-form-pulse');
      // Force reflow so re-adding the class restarts the animation
      void createFormRef.current.offsetWidth;
      createFormRef.current.classList.add('create-form-pulse');
    }
  }, [showCreateForm]);

  useEffect(() => {
    if (tokens.length === 0) return;
    if (initializedForSet.current === setName) return;
    initializedForSet.current = setName;
    try {
      const stored = sessionStorage.getItem(`token-expand:${setName}`);
      if (stored !== null) {
        setExpandedPaths(new Set(JSON.parse(stored) as string[]));
      } else {
        setExpandedPaths(new Set(collectGroupPathsByDepth(tokens, 2)));
      }
    } catch {
      setExpandedPaths(new Set(collectGroupPathsByDepth(tokens, 2)));
    }
  }, [setName, tokens]);

  useEffect(() => {
    if (initializedForSet.current !== setNameRef.current) return;
    try {
      sessionStorage.setItem(`token-expand:${setNameRef.current}`, JSON.stringify([...expandedPaths]));
    } catch {}
  }, [expandedPaths]);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data?.pluginMessage;
      if (msg?.type === 'variables-read' && msg.correlationId === varReadCorrelIdRef.current && varReadResolveRef.current) {
        varReadCorrelIdRef.current = null;
        varReadResolveRef.current(msg.tokens ?? []);
        varReadResolveRef.current = null;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedPaths(new Set(collectAllGroupPaths(tokens)));
  }, [tokens]);

  const handleCollapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  const handleOpenCreateSibling = useCallback((groupPath: string, tokenType: string) => {
    if (onCreateNew) {
      onCreateNew(groupPath ? groupPath + '.' : '', tokenType || 'color');
      return;
    }
    setSiblingPrefix(groupPath);
    setNewTokenPath(groupPath ? groupPath + '.' : '');
    setNewTokenType(tokenType || 'color');
    setShowCreateForm(true);
  }, [onCreateNew]);

  // Container-level keyboard shortcut handler for the token list
  const handleListKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

    // Escape: close create form, exit select mode, or blur search
    if (e.key === 'Escape') {
      if (showCreateForm) {
        e.preventDefault();
        setShowCreateForm(false);
        setNewTokenPath('');
        setSiblingPrefix(null);
        setCreateError('');
        return;
      }
      if (selectMode) {
        e.preventDefault();
        setSelectMode(false);
        setSelectedPaths(new Set());
        setShowBatchEditor(false);
        return;
      }
      return;
    }

    // Cmd/Ctrl+C: copy selected tokens as DTCG JSON
    if (e.key === 'c' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      if (selectMode && selectedPaths.size > 0) {
        e.preventDefault();
        const nodes = displayedLeafNodes.filter(n => selectedPaths.has(n.path));
        copyTokensAsJson(nodes);
        return;
      }
      // Single focused token row — copy that token
      if (!isTyping) {
        const focusedPath = (document.activeElement as HTMLElement)?.dataset?.tokenPath;
        if (focusedPath) {
          const node = displayedLeafNodes.find(n => n.path === focusedPath);
          if (node) {
            e.preventDefault();
            copyTokensAsJson([node]);
            return;
          }
        }
      }
    }

    // Don't handle shortcuts when typing in a form field
    if (isTyping) return;

    // m: toggle multi-select mode
    if (e.key === 'm' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (selectMode) {
        setSelectMode(false);
        setSelectedPaths(new Set());
        setShowBatchEditor(false);
      } else {
        setSelectMode(true);
      }
      return;
    }

    // n: open create form / drawer, pre-filling path from focused group or token's parent group
    if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const activeEl = document.activeElement as HTMLElement;
      const groupPath = activeEl?.dataset?.groupPath;
      const tokenPath = activeEl?.dataset?.tokenPath;

      let prefixPath = '';
      if (groupPath) {
        prefixPath = groupPath;
      } else if (tokenPath) {
        // Find the deepest group that is an ancestor of this token
        const groups = Array.from(document.querySelectorAll<HTMLElement>('[data-group-path]'));
        const parentGroup = groups
          .filter(el => tokenPath.startsWith((el.dataset.groupPath ?? '') + '.'))
          .sort((a, b) => (b.dataset.groupPath?.length ?? 0) - (a.dataset.groupPath?.length ?? 0))[0];
        prefixPath = parentGroup?.dataset?.groupPath ?? '';
      }

      if (prefixPath) {
        handleOpenCreateSibling(prefixPath, 'color');
      } else if (onCreateNew) {
        onCreateNew();
      } else {
        setShowCreateForm(true);
      }
      return;
    }

    // /: focus search input
    if (e.key === '/') {
      e.preventDefault();
      searchRef.current?.focus();
      return;
    }

    // ↑/↓: navigate between visible token and group rows
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-token-path],[data-group-path]'));
      if (rows.length === 0) return;
      const currentIndex = rows.findIndex(el => el === document.activeElement);
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = currentIndex > 0 ? rows[currentIndex - 1] : rows[rows.length - 1];
        prev?.focus();
        prev?.scrollIntoView({ block: 'nearest' });
      } else {
        e.preventDefault();
        const next = currentIndex < rows.length - 1 ? rows[currentIndex + 1] : rows[0];
        next?.focus();
        next?.scrollIntoView({ block: 'nearest' });
      }
    }

    // Cmd/Ctrl+→: expand all groups; Cmd/Ctrl+←: collapse all groups
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      if (e.key === 'ArrowRight') {
        handleExpandAll();
      } else {
        handleCollapseAll();
      }
      return;
    }

    // ←/→: expand/collapse groups (standard tree keyboard pattern)
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const activeEl = document.activeElement as HTMLElement;
      const groupPath = activeEl?.dataset?.groupPath;
      const tokenPath = activeEl?.dataset?.tokenPath;

      if (groupPath) {
        const isExpanded = expandedPaths.has(groupPath);
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (!isExpanded) {
            // Expand the group
            handleToggleExpand(groupPath);
          } else {
            // Already expanded — move focus to first child row
            const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-token-path],[data-group-path]'));
            const idx = rows.indexOf(activeEl);
            if (idx >= 0 && idx < rows.length - 1) {
              rows[idx + 1]?.focus();
              rows[idx + 1]?.scrollIntoView({ block: 'nearest' });
            }
          }
        } else {
          e.preventDefault();
          if (isExpanded) {
            // Collapse the group
            handleToggleExpand(groupPath);
          } else {
            // Already collapsed — move focus to parent group
            const dotIdx = groupPath.lastIndexOf('.');
            if (dotIdx > 0) {
              const parentPath = groupPath.slice(0, dotIdx);
              const parentEl = document.querySelector<HTMLElement>(`[data-group-path="${CSS.escape(parentPath)}"]`);
              if (parentEl) {
                parentEl.focus();
                parentEl.scrollIntoView({ block: 'nearest' });
              }
            }
          }
        }
      } else if (tokenPath && e.key === 'ArrowLeft') {
        // On a token row, ArrowLeft moves focus to parent group
        e.preventDefault();
        const dotIdx = tokenPath.lastIndexOf('.');
        if (dotIdx > 0) {
          const parentPath = tokenPath.slice(0, dotIdx);
          const parentEl = document.querySelector<HTMLElement>(`[data-group-path="${CSS.escape(parentPath)}"]`);
          if (parentEl) {
            parentEl.focus();
            parentEl.scrollIntoView({ block: 'nearest' });
          }
        }
      }
    }
  }, [showCreateForm, selectMode, handleOpenCreateSibling, expandedPaths, handleToggleExpand, handleExpandAll, handleCollapseAll]);

  // Expand ancestor groups when navigating to a highlighted token
  useEffect(() => {
    if (!highlightedToken) return;
    const parts = highlightedToken.split('.');
    const ancestors: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      ancestors.push(parts.slice(0, i).join('.'));
    }
    if (ancestors.length > 0) {
      setExpandedPaths(prev => {
        const next = new Set(prev);
        ancestors.forEach(a => next.add(a));
        return next;
      });
    }
    const timer = setTimeout(() => onClearHighlight?.(), 3000);
    return () => clearTimeout(timer);
  }, [highlightedToken, onClearHighlight]);

  useEffect(() => {
    if (!moreFiltersOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreFiltersRef.current && !moreFiltersRef.current.contains(e.target as Node)) {
        setMoreFiltersOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreFiltersOpen]);

  // Sort order — persisted in localStorage per-set so each set remembers its own order
  const [sortOrder, setSortOrderState] = useState<SortOrder>('default');

  useEffect(() => {
    setSortOrderState((lsGet(STORAGE_KEY.tokenSort(setName)) as SortOrder) || 'default');
  }, [setName]);

  const setSortOrder = useCallback((order: SortOrder) => {
    setSortOrderState(order);
    lsSet(STORAGE_KEY.tokenSort(setName), order);
  }, [setName]);

  // Clear optimistic deletions when the server response arrives with fresh tokens
  useEffect(() => { setLocallyDeletedPaths(new Set()); }, [tokens]);

  const sortedTokens = useMemo(() => {
    const sorted = sortTokenNodes(tokens, sortOrder);
    return locallyDeletedPaths.size > 0 ? pruneDeletedPaths(sorted, locallyDeletedPaths) : sorted;
  }, [tokens, sortOrder, locallyDeletedPaths]);

  // Filters — search/ref persisted in sessionStorage (shared across sets);
  // typeFilter persisted in localStorage per-set so each set remembers its own filter
  const [searchQuery, setSearchQueryState] = useState(() => {
    try { return sessionStorage.getItem('token-search') || ''; } catch { return ''; }
  });
  const [typeFilter, setTypeFilterState] = useState<string>('');
  const [refFilter, setRefFilterState] = useState<'all' | 'aliases' | 'direct'>(() => {
    try { return (sessionStorage.getItem('token-ref-filter') as 'all' | 'aliases' | 'direct') || 'all'; } catch { return 'all'; }
  });

  useEffect(() => {
    setTypeFilterState(lsGet(STORAGE_KEY.tokenTypeFilter(setName), ''));
  }, [setName]);

  const setSearchQuery = useCallback((v: string) => {
    const top = virtualScrollTopRef.current;
    const items = flatItemsRef.current;
    const offsets = itemOffsetsRef.current;
    let firstIdx = 0;
    while (firstIdx < items.length && offsets[firstIdx + 1] <= top) firstIdx++;
    scrollAnchorPathRef.current = items[firstIdx]?.node.path ?? null;
    isFilterChangeRef.current = true;
    setSearchQueryState(v);
    try { sessionStorage.setItem('token-search', v); } catch {}
  }, []);
  const setTypeFilter = useCallback((v: string) => {
    const top = virtualScrollTopRef.current;
    const items = flatItemsRef.current;
    const offsets = itemOffsetsRef.current;
    let firstIdx = 0;
    while (firstIdx < items.length && offsets[firstIdx + 1] <= top) firstIdx++;
    scrollAnchorPathRef.current = items[firstIdx]?.node.path ?? null;
    isFilterChangeRef.current = true;
    setTypeFilterState(v);
    lsSet(STORAGE_KEY.tokenTypeFilter(setName), v);
  }, [setName]);
  const setRefFilter = useCallback((v: 'all' | 'aliases' | 'direct') => {
    const top = virtualScrollTopRef.current;
    const items = flatItemsRef.current;
    const offsets = itemOffsetsRef.current;
    let firstIdx = 0;
    while (firstIdx < items.length && offsets[firstIdx + 1] <= top) firstIdx++;
    scrollAnchorPathRef.current = items[firstIdx]?.node.path ?? null;
    isFilterChangeRef.current = true;
    setRefFilterState(v);
    try { sessionStorage.setItem('token-ref-filter', v); } catch {}
  }, []);

  const [showDuplicates, setShowDuplicatesState] = useState(() => {
    try { return sessionStorage.getItem('token-duplicates') === '1'; } catch { return false; }
  });
  const setShowDuplicates = useCallback((v: boolean) => {
    setShowDuplicatesState(v);
    try { sessionStorage.setItem('token-duplicates', v ? '1' : '0'); } catch {}
  }, []);

  const [crossSetSearch, setCrossSetSearch] = useState(false);
  const [showQualifierHints, setShowQualifierHints] = useState(false);
  const [showQualifierHelp, setShowQualifierHelp] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const qualifierHintsRef = useRef<HTMLDivElement>(null);
  const qualifierHelpRef = useRef<HTMLDivElement>(null);

  // Compute filtered qualifier hints based on what the user is currently typing
  const qualifierHints = useMemo(() => {
    // Find the word the cursor is at the end of
    const lastWord = searchQuery.split(/\s+/).pop() || '';
    if (!lastWord || lastWord.includes(':')) return [];
    const lw = lastWord.toLowerCase();
    return QUERY_QUALIFIERS.filter(q => q.qualifier.toLowerCase().startsWith(lw));
  }, [searchQuery]);

  const filtersActive = searchQuery !== '' || typeFilter !== '' || refFilter !== 'all' || showDuplicates || showIssuesOnly || showRecentlyTouched;

  // Compute paths with lint violations for issues-only filter
  const lintPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const v of lintViolations) paths.add(v.path);
    return paths;
  }, [lintViolations]);

  // Debounced tokens reference for the expensive duplicate-value computation.
  // Without debouncing, every keystroke in a large set triggers an O(n) walk
  // over all tokens. 300 ms idle time is imperceptible for a background stat.
  const [debouncedTokens, setDebouncedTokens] = useState(tokens);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTokens(tokens), 300);
    return () => clearTimeout(timer);
  }, [tokens]);

  // Compute duplicate value info from all tokens in the current set
  const { duplicateValuePaths, duplicateCounts } = useMemo(() => {
    const valueMap = new Map<string, string[]>(); // serialized value → paths
    const collectLeaves = (nodes: TokenNode[]) => {
      for (const n of nodes) {
        if (!n.isGroup) {
          const key = stableStringify(n.$value);
          if (!valueMap.has(key)) valueMap.set(key, []);
          valueMap.get(key)!.push(n.path);
        }
        if (n.children) collectLeaves(n.children);
      }
    };
    collectLeaves(debouncedTokens);
    const paths = new Set<string>();
    const counts = new Map<string, number>(); // serialized value → count
    for (const [key, ps] of valueMap) {
      if (ps.length > 1) {
        ps.forEach(p => paths.add(p));
        counts.set(key, ps.length);
      }
    }
    return { duplicateValuePaths: paths, duplicateCounts: counts };
  }, [debouncedTokens]);

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    const collect = (nodes: TokenNode[]) => {
      for (const n of nodes) {
        if (!n.isGroup && n.$type) types.add(n.$type);
        if (n.children) collect(n.children);
      }
    };
    collect(tokens);
    return [...types].sort();
  }, [tokens]);

  // Inspect mode — show only tokens bound to selected layers
  const [inspectMode, setInspectMode] = useState(false);
  const [viewMode, setViewMode] = useState<'tree' | 'table' | 'canvas' | 'grid' | 'json' | 'graph'>('tree');
  const [showScopesCol, setShowScopesCol] = useState(false);

  // JSON editor state
  const [jsonText, setJsonText] = useState('');
  const [jsonDirty, setJsonDirty] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonSaving, setJsonSaving] = useState(false);
  const [jsonBrokenRefs, setJsonBrokenRefs] = useState<string[]>([]);
  const jsonTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Load raw JSON when entering JSON view (or when setName changes in JSON view)
  useEffect(() => {
    if (viewMode !== 'json' || !connected || !serverUrl || !setName) return;
    if (jsonDirty) return; // don't clobber unsaved edits
    fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/raw`)
      .then(r => r.json())
      .then(data => {
        const text = JSON.stringify(data, null, 2);
        setJsonText(text);
        setJsonError(null);
        setJsonBrokenRefs(validateJsonRefs(text, allTokensFlat));
      })
      .catch(() => setJsonError('Failed to load JSON'));
  }, [viewMode, setName, connected, serverUrl, jsonDirty, allTokensFlat]);

  // Sync from list view → JSON when tokens change externally (not dirty)
  useEffect(() => {
    if (viewMode !== 'json' || jsonDirty || !connected || !serverUrl || !setName) return;
    fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/raw`)
      .then(r => r.json())
      .then(data => {
        const text = JSON.stringify(data, null, 2);
        setJsonText(text);
        setJsonBrokenRefs(validateJsonRefs(text, allTokensFlat));
      })
      .catch(() => {});
  }, [tokens, viewMode, jsonDirty, connected, serverUrl, setName, allTokensFlat]);

  const boundTokenPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const node of selectedNodes) {
      for (const tokenPath of Object.values(node.bindings)) {
        if (tokenPath) paths.add(tokenPath);
      }
    }
    return paths;
  }, [selectedNodes]);

  const handleHoverToken = useCallback((tokenPath: string) => {
    parent.postMessage({ pluginMessage: { type: 'highlight-layer-by-token', tokenPath } }, '*');
  }, []);

  const displayedTokens = useMemo(() => {
    let result = filtersActive ? filterTokenNodes(sortedTokens, searchQuery, typeFilter, refFilter, duplicateValuePaths) : sortedTokens;
    if (showDuplicates) result = filterByDuplicatePaths(result, duplicateValuePaths);
    if (showIssuesOnly && lintPaths.size > 0) result = filterByDuplicatePaths(result, lintPaths);
    if (inspectMode && selectedNodes.length > 0) result = filterByDuplicatePaths(result, boundTokenPaths);
    if (showRecentlyTouched) {
      if (recentlyTouched.paths.size > 0) result = filterByDuplicatePaths(result, recentlyTouched.paths);
      else result = [];
    }
    return result;
  }, [sortedTokens, searchQuery, typeFilter, refFilter, filtersActive, showDuplicates, duplicateValuePaths, showIssuesOnly, lintPaths, inspectMode, selectedNodes.length, boundTokenPaths, showRecentlyTouched, recentlyTouched.paths]);

  // Memoized flat leaf list for displayedTokens — avoids repeated O(n) walks per render
  const displayedLeafNodes = useMemo(() => flattenLeafNodes(displayedTokens), [displayedTokens]);

  // Compute highlight terms from the parsed search query for substring highlighting
  const searchHighlight = useMemo(() => {
    if (!searchQuery) return undefined;
    const parsed = parseStructuredQuery(searchQuery);
    const nameTerms: string[] = [];
    const valueTerms: string[] = [];
    if (parsed.text) nameTerms.push(parsed.text);
    nameTerms.push(...parsed.names, ...parsed.paths);
    valueTerms.push(...parsed.values);
    // For plain text search, the term also matches values
    if (parsed.text) valueTerms.push(parsed.text);
    if (!nameTerms.length && !valueTerms.length) return undefined;
    return { nameTerms, valueTerms };
  }, [searchQuery]);

  // Cross-set search: debounced server-side search across all sets
  const [crossSetResults, setCrossSetResults] = useState<Array<{ setName: string; path: string; entry: TokenMapEntry }> | null>(null);
  const crossSetAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!crossSetSearch || !searchQuery.trim()) {
      setCrossSetResults(crossSetSearch ? [] : null);
      return;
    }
    const parsed = parseStructuredQuery(searchQuery);
    const params = new URLSearchParams();
    if (parsed.text) params.set('q', parsed.text);
    if (parsed.types.length) params.set('type', parsed.types.join(','));
    if (parsed.has.length) params.set('has', parsed.has.join(','));
    if (parsed.values.length) params.set('value', parsed.values.join(','));
    if (parsed.paths.length) params.set('path', parsed.paths.join(','));
    if (parsed.names.length) params.set('name', parsed.names.join(','));
    params.set('limit', '200');

    crossSetAbortRef.current?.abort();
    const ctrl = new AbortController();
    crossSetAbortRef.current = ctrl;

    const timer = setTimeout(() => {
      fetch(`${serverUrl}/api/tokens/search?${params}`, { signal: ctrl.signal })
        .then(r => r.json())
        .then((data: { results: Array<{ setName: string; path: string; name: string; $type: string; $value: unknown; $description?: string }> }) => {
          setCrossSetResults(data.results.map(r => ({
            setName: r.setName,
            path: r.path,
            entry: { $value: r.$value as any, $type: r.$type, $name: r.name },
          })));
        })
        .catch(err => {
          if (err instanceof Error && err.name === 'AbortError') return;
          console.error('Cross-set search failed:', err);
        });
    }, 150);

    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [crossSetSearch, searchQuery, serverUrl]);

  // Report filtered leaf count to parent so set tabs can show "X / Y"
  useEffect(() => {
    if (!onFilteredCountChange) return;
    onFilteredCountChange(filtersActive ? displayedLeafNodes.length : null);
  }, [displayedLeafNodes, filtersActive, onFilteredCountChange]);

  // Flat list of visible nodes for virtual scrolling (respects expand/collapse state)
  const flatItems = useMemo(() => {
    if (viewMode !== 'tree') return [];
    if (showRecentlyTouched) {
      // In recency mode, flatten and sort by timestamp (newest first)
      const leaves = flattenLeafNodes(displayedTokens);
      leaves.sort((a, b) => (recentlyTouched.timestamps.get(b.path) ?? 0) - (recentlyTouched.timestamps.get(a.path) ?? 0));
      return leaves.map(node => ({ node, depth: 0 }));
    }
    return flattenVisible(displayedTokens, expandedPaths);
  }, [displayedTokens, expandedPaths, viewMode, showRecentlyTouched, recentlyTouched.paths, recentlyTouched.timestamps]);

  // Toggle alias chain expansion for a token row
  const handleToggleChain = useCallback((path: string) => {
    setExpandedChains(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  // Cumulative row offsets for variable-height virtual scroll.
  // Each item is VIRTUAL_ITEM_HEIGHT px, plus VIRTUAL_CHAIN_EXPAND_HEIGHT when its chain panel is open.
  const itemOffsets = useMemo(() => {
    const offsets = new Array<number>(flatItems.length + 1);
    offsets[0] = 0;
    for (let i = 0; i < flatItems.length; i++) {
      const h = expandedChains.has(flatItems[i].node.path)
        ? VIRTUAL_ITEM_HEIGHT + VIRTUAL_CHAIN_EXPAND_HEIGHT
        : VIRTUAL_ITEM_HEIGHT;
      offsets[i + 1] = offsets[i] + h;
    }
    return offsets;
  }, [flatItems, expandedChains]);
  // Sync refs so filter callbacks can read latest values without stale closure issues
  flatItemsRef.current = flatItems;
  itemOffsetsRef.current = itemOffsets;

  // Map of group path ('' = root) → ordered child names, reflecting actual file order
  const siblingOrderMap = useMemo(() => {
    const map = new Map<string, string[]>();
    const walk = (nodes: TokenNode[], parentPath: string) => {
      map.set(parentPath, nodes.map(n => n.name));
      for (const node of nodes) {
        if (node.isGroup && node.children) walk(node.children, node.path);
      }
    };
    walk(tokens, '');
    return map;
  }, [tokens]);

  // Scroll virtual list to bring the highlighted token into view
  useLayoutEffect(() => {
    if (!highlightedToken || viewMode !== 'tree' || !virtualListRef.current) return;
    const idx = flatItems.findIndex(item => item.node.path === highlightedToken);
    if (idx < 0) return;
    const containerH = virtualListRef.current.clientHeight;
    const targetScrollTop = Math.max(0, itemOffsets[idx] - containerH / 2 + VIRTUAL_ITEM_HEIGHT / 2);
    virtualListRef.current.scrollTop = targetScrollTop;
    setVirtualScrollTop(targetScrollTop);
  }, [highlightedToken, flatItems, itemOffsets, viewMode]);

  // Restore scroll anchor after filter changes so the first visible item stays visible
  useLayoutEffect(() => {
    if (!isFilterChangeRef.current) return;
    isFilterChangeRef.current = false;
    const anchorPath = scrollAnchorPathRef.current;
    scrollAnchorPathRef.current = null;
    if (!virtualListRef.current) return;
    if (anchorPath) {
      const idx = flatItems.findIndex(item => item.node.path === anchorPath);
      if (idx >= 0) {
        const targetScrollTop = itemOffsets[idx];
        virtualListRef.current.scrollTop = targetScrollTop;
        setVirtualScrollTop(targetScrollTop);
        return;
      }
    }
    // Anchor not in filtered list — scroll to top of results
    virtualListRef.current.scrollTop = 0;
    setVirtualScrollTop(0);
  }, [flatItems, itemOffsets]);

  const syncChangedCount = useMemo(() => {
    if (!syncSnapshot) return 0;
    return Object.entries(allTokensFlat).filter(
      ([path, token]) => path in syncSnapshot && syncSnapshot[path] !== stableStringify(token.$value)
    ).length;
  }, [syncSnapshot, allTokensFlat]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setTypeFilter('');
    setRefFilter('all');
    setShowDuplicates(false);
    setShowRecentlyTouched(false);
    if (showIssuesOnly && onToggleIssuesOnly) onToggleIssuesOnly();
  }, [setSearchQuery, setTypeFilter, setRefFilter, setShowDuplicates, showIssuesOnly, onToggleIssuesOnly]);

  // Merge capabilities from all selected nodes for the property picker
  const selectionCapabilities: NodeCapabilities | null = selectedNodes.length > 0
    ? {
        hasFills: selectedNodes.some(n => n.capabilities.hasFills),
        hasStrokes: selectedNodes.some(n => n.capabilities.hasStrokes),
        hasAutoLayout: selectedNodes.some(n => n.capabilities.hasAutoLayout),
        isText: selectedNodes.some(n => n.capabilities.isText),
        hasEffects: selectedNodes.some(n => n.capabilities.hasEffects),
      }
    : null;

  // Extract to alias state
  const [extractToken, setExtractToken] = useState<{ path: string; $type?: string; $value: any } | null>(null);
  const [extractMode, setExtractMode] = useState<'new' | 'existing'>('new');
  const [newPrimitivePath, setNewPrimitivePath] = useState('');
  const [newPrimitiveSet, setNewPrimitiveSet] = useState('');
  const [existingAlias, setExistingAlias] = useState('');
  const [existingAliasSearch, setExistingAliasSearch] = useState('');
  const [extractError, setExtractError] = useState('');

  const handleOpenExtractToAlias = useCallback((path: string, $type?: string, $value?: any) => {
    const lastSegment = path.split('.').pop() ?? 'token';
    const suggested = `primitives.${$type || 'color'}.${lastSegment}`;
    setNewPrimitivePath(suggested);
    setNewPrimitiveSet(setName);
    setExistingAlias('');
    setExistingAliasSearch('');
    setExtractMode('new');
    setExtractError('');
    setExtractToken({ path, $type, $value });
  }, [setName]);

  const handleConfirmExtractToAlias = useCallback(async () => {
    if (!extractToken || !connected) return;
    setExtractError('');

    if (extractMode === 'new') {
      if (!newPrimitivePath.trim()) { setExtractError('Enter a path for the new primitive token.'); return; }
      const createRes = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(newPrimitiveSet)}/${newPrimitivePath.trim().split('.').map(encodeURIComponent).join('/')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $type: extractToken.$type, $value: extractToken.$value }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({})) as { error?: string };
        setExtractError(err.error ?? 'Failed to create primitive token.');
        return;
      }
      await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${extractToken.path.split('.').map(encodeURIComponent).join('/')}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $value: `{${newPrimitivePath.trim()}}` }),
      });
    } else {
      if (!existingAlias) { setExtractError('Select an existing token to alias.'); return; }
      await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${extractToken.path.split('.').map(encodeURIComponent).join('/')}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $value: `{${existingAlias}}` }),
      });
    }

    setExtractToken(null);
    onRefresh();
  }, [extractToken, extractMode, newPrimitivePath, newPrimitiveSet, existingAlias, connected, serverUrl, setName, onRefresh]);

  // Group management
  const [movingGroup, setMovingGroup] = useState<string | null>(null);
  const [movingToken, setMovingToken] = useState<string | null>(null);
  const [moveTargetSet, setMoveTargetSet] = useState('');

  const handleRenameGroup = useCallback(async (oldGroupPath: string, newGroupPath: string) => {
    if (!connected) return;
    await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/groups/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldGroupPath, newGroupPath }),
    });
    if (onPushUndo) {
      const capturedSet = setName;
      const capturedUrl = serverUrl;
      onPushUndo({
        description: `Rename group "${oldGroupPath.split('.').pop() ?? oldGroupPath}"`,
        restore: async () => {
          await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/groups/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldGroupPath: newGroupPath, newGroupPath: oldGroupPath }),
          });
          onRefresh();
        },
        redo: async () => {
          await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/groups/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldGroupPath, newGroupPath }),
          });
          onRefresh();
        },
      });
    }
    onRefresh();
  }, [connected, serverUrl, setName, onRefresh, onPushUndo]);

  const executeTokenRename = useCallback(async (oldPath: string, newPath: string) => {
    if (!connected) return;
    await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/tokens/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath }),
    });
    setRenameTokenConfirm(null);
    if (onPushUndo) {
      const capturedSet = setName;
      const capturedUrl = serverUrl;
      onPushUndo({
        description: `Rename "${oldPath.split('.').pop() ?? oldPath}"`,
        restore: async () => {
          await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/tokens/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPath: newPath, newPath: oldPath }),
          });
          onRefresh();
        },
        redo: async () => {
          await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/tokens/rename`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPath, newPath }),
          });
          onRefresh();
        },
      });
    }
    onRefresh();
    recentlyTouched.renamePath(oldPath, newPath);
  }, [connected, serverUrl, setName, onRefresh, onPushUndo, recentlyTouched]);

  const handleDropOnGroup = useCallback(async (targetGroupPath: string) => {
    if (!dragSource || !connected) return;
    const source = dragSource;
    setDragSource(null);
    setDragOverGroup(null);
    const moves: Array<{ oldPath: string; newPath: string }> = [];
    for (let i = 0; i < source.paths.length; i++) {
      const oldPath = source.paths[i];
      const name = source.names[i];
      const newPath = targetGroupPath ? `${targetGroupPath}.${name}` : name;
      if (newPath === oldPath) continue;
      moves.push({ oldPath, newPath });
      await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/tokens/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newPath }),
      });
    }
    if (onPushUndo && moves.length > 0) {
      const capturedSet = setName;
      const capturedUrl = serverUrl;
      const label = moves.length === 1
        ? `Move "${moves[0].oldPath.split('.').pop() ?? moves[0].oldPath}"`
        : `Move ${moves.length} tokens`;
      onPushUndo({
        description: label,
        restore: async () => {
          for (const { oldPath, newPath } of moves) {
            await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/tokens/rename`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ oldPath: newPath, newPath: oldPath }),
            });
          }
          onRefresh();
        },
        redo: async () => {
          for (const { oldPath, newPath } of moves) {
            await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/tokens/rename`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ oldPath, newPath }),
            });
          }
          onRefresh();
        },
      });
    }
    for (const { oldPath, newPath } of moves) recentlyTouched.renamePath(oldPath, newPath);
    onRefresh();
  }, [dragSource, connected, serverUrl, setName, onRefresh, onPushUndo, recentlyTouched]);

  const handleRenameToken = useCallback(async (oldPath: string, newPath: string) => {
    if (!connected) return;
    const encodedPath = oldPath.split('.').map(encodeURIComponent).join('/');
    const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/dependents/${encodedPath}`);
    const data = res.ok ? await res.json() as { count: number; dependents: Array<{ path: string; setName: string }> } : { count: 0, dependents: [] };
    if (data.count > 0) {
      setRenameTokenConfirm({ oldPath, newPath, depCount: data.count, deps: data.dependents ?? [] });
    } else {
      await executeTokenRename(oldPath, newPath);
    }
  }, [connected, serverUrl, setName, executeTokenRename]);

  const handleRequestMoveGroup = useCallback((groupPath: string) => {
    const otherSets = sets.filter(s => s !== setName);
    setMoveTargetSet(otherSets[0] ?? '');
    setMovingGroup(groupPath);
  }, [sets, setName]);

  const handleConfirmMoveGroup = useCallback(async () => {
    if (!movingGroup || !moveTargetSet || !connected) { setMovingGroup(null); return; }
    await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/groups/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupPath: movingGroup, targetSet: moveTargetSet }),
    });
    setMovingGroup(null);
    onRefresh();
  }, [movingGroup, moveTargetSet, connected, serverUrl, setName, onRefresh]);

  const handleRequestMoveToken = useCallback((tokenPath: string) => {
    const otherSets = sets.filter(s => s !== setName);
    setMoveTargetSet(otherSets[0] ?? '');
    setMovingToken(tokenPath);
  }, [sets, setName]);

  const handleConfirmMoveToken = useCallback(async () => {
    if (!movingToken || !moveTargetSet || !connected) { setMovingToken(null); return; }
    try {
      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/tokens/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenPath: movingToken, targetSet: moveTargetSet }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `Move failed (${res.status})` }));
        onError?.(body.error || `Move failed (${res.status})`);
        return;
      }
    } catch {
      onError?.('Move failed: network error');
      return;
    }
    setMovingToken(null);
    onRefresh();
  }, [movingToken, moveTargetSet, connected, serverUrl, setName, onRefresh, onError]);

  const handleDuplicateGroup = useCallback(async (groupPath: string) => {
    if (!connected) return;
    await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/groups/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupPath }),
    });
    onRefresh();
  }, [connected, serverUrl, setName, onRefresh]);

  const handleUpdateGroupMeta = useCallback(async (
    groupPath: string,
    meta: { $type?: string | null; $description?: string | null },
  ) => {
    if (!connected) return;
    const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/groups/meta`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupPath, ...meta }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error || 'Failed to update group metadata');
    }
    onRefresh();
  }, [connected, serverUrl, setName, onRefresh]);

  const handleCreateGroup = useCallback(async (parent: string, name: string) => {
    if (!connected || !name.trim()) return;
    const groupPath = parent ? `${parent}.${name.trim()}` : name.trim();
    const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/groups/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupPath }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setNewGroupError(data.error ?? 'Failed to create group');
      return;
    }
    setNewGroupDialogParent(null);
    setNewGroupName('');
    setNewGroupError('');
    onRefresh();
  }, [connected, serverUrl, setName, onRefresh]);

  const handleDuplicateToken = useCallback(async (path: string) => {
    if (!connected) return;
    const token = allTokensFlat[path];
    if (!token) return;
    const baseCopy = `${path}-copy`;
    let newPath = baseCopy;
    let i = 2;
    while (allTokensFlat[newPath]) {
      newPath = `${baseCopy}-${i++}`;
    }
    await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${newPath.split('.').map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ $type: token.$type, $value: token.$value, ...(token.$description ? { $description: token.$description } : {}) }),
    });
    onRefresh();
    recentlyTouched.recordTouch(newPath);
  }, [connected, serverUrl, setName, allTokensFlat, onRefresh, recentlyTouched]);

  const handleMoveTokenInGroup = useCallback(async (nodePath: string, nodeName: string, direction: 'up' | 'down') => {
    if (!connected || !serverUrl || !setName) return;
    const parentPath = nodeParentPath(nodePath, nodeName) ?? '';
    const siblings = siblingOrderMap.get(parentPath) ?? [];
    const idx = siblings.indexOf(nodeName);
    if (idx < 0) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= siblings.length) return;
    const newOrder = [...siblings];
    [newOrder[idx], newOrder[newIdx]] = [newOrder[newIdx], newOrder[idx]];
    const prevOrder = [...siblings];
    await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/groups/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupPath: parentPath, orderedKeys: newOrder }),
    });
    if (onPushUndo) {
      const capturedSet = setName;
      const capturedUrl = serverUrl;
      onPushUndo({
        description: `Reorder "${nodeName}"`,
        restore: async () => {
          await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/groups/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupPath: parentPath, orderedKeys: prevOrder }),
          });
          onRefresh();
        },
        redo: async () => {
          await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/groups/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupPath: parentPath, orderedKeys: newOrder }),
          });
          onRefresh();
        },
      });
    }
    onRefresh();
  }, [connected, serverUrl, setName, siblingOrderMap, onRefresh, onPushUndo]);

  const handleDropReorder = useCallback(async (targetPath: string, targetName: string, position: 'before' | 'after') => {
    if (!dragSource || !connected || !serverUrl || !setName) return;
    setDragOverReorder(null);
    const source = dragSource;
    setDragSource(null);
    setDragOverGroup(null);

    // Only reorder within same group — all dragged tokens must share the target's parent
    const targetParent = nodeParentPath(targetPath, targetName) ?? '';
    const siblings = siblingOrderMap.get(targetParent);
    if (!siblings) return;

    // Verify all dragged tokens are siblings in the same group
    for (let i = 0; i < source.paths.length; i++) {
      const srcParent = nodeParentPath(source.paths[i], source.names[i]) ?? '';
      if (srcParent !== targetParent) {
        // Cross-group: fall back to existing move-to-group behaviour
        return;
      }
    }
    // Don't reorder onto self
    if (source.paths.length === 1 && source.paths[0] === targetPath) return;

    const draggedNames = new Set(source.names);
    // Build new order: remove dragged items, then insert at target position
    const withoutDragged = siblings.filter(n => !draggedNames.has(n));
    const targetIdx = withoutDragged.indexOf(targetName);
    if (targetIdx < 0) return;
    const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
    const newOrder = [...withoutDragged.slice(0, insertIdx), ...source.names, ...withoutDragged.slice(insertIdx)];

    const prevOrder = [...siblings];
    await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/groups/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupPath: targetParent, orderedKeys: newOrder }),
    });
    if (onPushUndo) {
      const capturedSet = setName;
      const capturedUrl = serverUrl;
      const label = source.names.length === 1
        ? `Reorder "${source.names[0]}"`
        : `Reorder ${source.names.length} tokens`;
      onPushUndo({
        description: label,
        restore: async () => {
          await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/groups/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupPath: targetParent, orderedKeys: prevOrder }),
          });
          onRefresh();
        },
        redo: async () => {
          await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/groups/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupPath: targetParent, orderedKeys: newOrder }),
          });
          onRefresh();
        },
      });
    }
    onRefresh();
  }, [dragSource, connected, serverUrl, setName, siblingOrderMap, onRefresh, onPushUndo]);

  const handleInlineSave = useCallback(async (path: string, type: string, newValue: any) => {
    if (!connected) return;
    const oldEntry = allTokensFlat[path];
    const encodedPath = path.split('.').map(encodeURIComponent).join('/');
    await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedPath}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ $type: type, $value: newValue }),
    });
    if (onPushUndo && oldEntry) {
      onPushUndo({
        description: `Edit ${path}`,
        restore: async () => {
          await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedPath}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ $type: oldEntry.$type, $value: oldEntry.$value }),
          });
          onRefresh();
        },
        redo: async () => {
          await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${encodedPath}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ $type: type, $value: newValue }),
          });
          onRefresh();
        },
      });
    }
    onRefresh();
    recentlyTouched.recordTouch(path);
  }, [connected, serverUrl, setName, allTokensFlat, onRefresh, onPushUndo, recentlyTouched]);

  const handleCreate = async () => {
    const trimmedPath = newTokenPath.trim();
    if (!trimmedPath) { setCreateError('Token path cannot be empty'); return; }
    if (!connected) return;
    setCreateError('');
    const effectiveSet = setName || 'default';
    const parsedValue = newTokenValue.trim() ? parseInlineValue(newTokenType, newTokenValue.trim()) : getDefaultValue(newTokenType);
    if (parsedValue === null) { setCreateError('Invalid value — boolean tokens must be "true" or "false"'); return; }
    try {
      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(effectiveSet)}/${trimmedPath.split('.').map(encodeURIComponent).join('/')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          $type: newTokenType,
          $value: parsedValue,
          ...(newTokenDescription.trim() ? { $description: newTokenDescription.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const data: ApiErrorBody = await res.json().catch(() => ({}));
        setCreateError(data.error || `Failed to create token (${res.status})`);
        return;
      }
      const createdPath = trimmedPath;
      const createdType = newTokenType;
      const createdValue = parsedValue;
      const capturedSet = effectiveSet;
      const capturedUrl = serverUrl;
      const capturedEncodedPath = createdPath.split('.').map(encodeURIComponent).join('/');
      setShowCreateForm(false);
      setNewTokenPath('');
      setNewTokenValue('');
      setNewTokenDescription('');
      setSiblingPrefix(null);
      onRefresh();
      onTokenCreated?.(createdPath);
      recentlyTouched.recordTouch(createdPath);
      if (onPushUndo) {
        onPushUndo({
          description: `Create "${createdPath.split('.').pop() ?? createdPath}"`,
          restore: async () => {
            await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/${capturedEncodedPath}`, { method: 'DELETE' });
            onRefresh();
          },
          redo: async () => {
            await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/${capturedEncodedPath}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ $type: createdType, $value: createdValue }),
            });
            onRefresh();
          },
        });
      }
    } catch (err) {
      setCreateError('Network error — could not create token');
    }
  };

  const handleCreateAndNew = async () => {
    const trimmedPath = newTokenPath.trim();
    if (!trimmedPath) { setCreateError('Token path cannot be empty'); return; }
    if (!connected) return;
    setCreateError('');
    const effectiveSet = setName || 'default';
    const parsedValue2 = newTokenValue.trim() ? parseInlineValue(newTokenType, newTokenValue.trim()) : getDefaultValue(newTokenType);
    if (parsedValue2 === null) { setCreateError('Invalid value — boolean tokens must be "true" or "false"'); return; }
    try {
      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(effectiveSet)}/${trimmedPath.split('.').map(encodeURIComponent).join('/')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          $type: newTokenType,
          $value: parsedValue2,
          ...(newTokenDescription.trim() ? { $description: newTokenDescription.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const data: ApiErrorBody = await res.json().catch(() => ({}));
        setCreateError(data.error || `Failed to create token (${res.status})`);
        return;
      }
      const createdPath = trimmedPath;
      const createdType = newTokenType;
      const createdValue = parsedValue2;
      const capturedSet = effectiveSet;
      const capturedUrl = serverUrl;
      const capturedEncodedPath = createdPath.split('.').map(encodeURIComponent).join('/');
      // Compute parent prefix to pre-fill the next token in the same group
      const prefix = createdPath.length > (createdPath.split('.').pop()?.length ?? 0) + 1
        ? nodeParentPath(createdPath, createdPath.split('.').pop()!)
        : null;
      setSiblingPrefix(prefix ?? '');
      setNewTokenPath(prefix ? prefix + '.' : '');
      setNewTokenValue('');
      setNewTokenDescription('');
      setTypeAutoInferred(false);
      setCreateError('');
      onRefresh();
      onTokenCreated?.(createdPath);
      recentlyTouched.recordTouch(createdPath);
      if (onPushUndo) {
        onPushUndo({
          description: `Create "${createdPath.split('.').pop() ?? createdPath}"`,
          restore: async () => {
            await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/${capturedEncodedPath}`, { method: 'DELETE' });
            onRefresh();
          },
          redo: async () => {
            await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/${capturedEncodedPath}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ $type: createdType, $value: createdValue }),
            });
            onRefresh();
          },
        });
      }
    } catch (err) {
      setCreateError('Network error — could not create token');
    }
  };

  const requestDeleteToken = useCallback((path: string) => {
    if (!connected) return;
    const orphanCount = Object.entries(allTokensFlat).filter(([tokenPath, token]) => {
      if (tokenPath === path) return false;
      const val = token.$value;
      if (typeof val !== 'string' || !val.startsWith('{')) return false;
      return val.slice(1, -1) === path;
    }).length;
    setDeleteConfirm({ type: 'token', path, orphanCount });
  }, [connected, allTokensFlat]);

  const requestDeleteGroup = useCallback((path: string, name: string, tokenCount: number) => {
    if (!connected) return;
    setDeleteConfirm({ type: 'group', path, name, tokenCount });
  }, [connected]);

  const requestBulkDelete = useCallback(() => {
    if (!connected || selectedPaths.size === 0) return;
    const paths = [...selectedPaths];
    const orphanCount = Object.entries(allTokensFlat).filter(([tokenPath, token]) => {
      if (selectedPaths.has(tokenPath)) return false;
      const val = token.$value;
      if (typeof val !== 'string' || !val.startsWith('{')) return false;
      const aliasPath = val.slice(1, -1);
      return selectedPaths.has(aliasPath);
    }).length;
    setDeleteConfirm({ type: 'bulk', paths, orphanCount });
  }, [connected, selectedPaths, allTokensFlat]);

  const executeDelete = async () => {
    if (!deleteConfirm) return;

    // Capture snapshot before deletion for undo
    type TokenSnapshot = { path: string; data: { $type?: string; $value?: any; $description?: string } };
    let undoTokens: TokenSnapshot[] = [];
    let undoDescription = '';

    if (deleteConfirm.type === 'token') {
      const found = findLeafByPath(tokens, deleteConfirm.path);
      if (found) {
        undoTokens = [{ path: deleteConfirm.path, data: { $type: found.$type, $value: found.$value, $description: found.$description } }];
      }
      const name = deleteConfirm.path.split('.').pop() ?? deleteConfirm.path;
      undoDescription = `Deleted "${name}"`;
    } else if (deleteConfirm.type === 'group') {
      undoTokens = collectGroupLeaves(tokens, deleteConfirm.path);
      undoDescription = `Deleted group "${deleteConfirm.name}" (${undoTokens.length} token${undoTokens.length !== 1 ? 's' : ''})`;
    } else {
      undoTokens = deleteConfirm.paths.map(p => {
        const found = findLeafByPath(tokens, p);
        return { path: p, data: found ? { $type: found.$type, $value: found.$value, $description: found.$description } : {} };
      });
      undoDescription = `Deleted ${deleteConfirm.paths.length} token${deleteConfirm.paths.length !== 1 ? 's' : ''}`;
    }

    // Capture delete info before clearing state
    const deletedType = deleteConfirm.type;
    const deletedPath = deleteConfirm.type !== 'bulk' ? deleteConfirm.path : '';
    const deletedPaths = deleteConfirm.type === 'bulk' ? deleteConfirm.paths : [];

    setDeleteConfirm(null);
    setDeleteError(null);
    try {
      if (deletedType === 'token' || deletedType === 'group') {
        const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${deletedPath.split('.').map(encodeURIComponent).join('/')}`, { method: 'DELETE' });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Server returned ${res.status}`);
        }
      } else {
        const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/bulk-delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: deletedPaths }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Server returned ${res.status}`);
        }
        setSelectedPaths(new Set());
        setSelectMode(false);
      }

      // Remove deleted paths from the tree so empty group headers vanish immediately
      if (deletedType === 'token' || deletedType === 'group') {
        setLocallyDeletedPaths(new Set([deletedPath]));
      } else {
        setLocallyDeletedPaths(new Set(deletedPaths));
      }

      // Push undo slot after successful delete
      if (onPushUndo && undoTokens.length > 0) {
        const captured = undoTokens;
        const capturedSet = setName;
        const capturedUrl = serverUrl;
        onPushUndo({
          description: undoDescription,
          restore: async () => {
            await Promise.all(
              captured.map(({ path, data }) =>
                fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/${path.split('.').map(encodeURIComponent).join('/')}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data),
                })
              )
            );
            onRefresh();
          },
        });
      }

      onRefresh();
    } catch (err) {
      console.error('Failed to delete:', err);
      setDeleteError(getErrorMessage(err, 'Delete failed'));
      onRefresh();
    }
  };

  const toggleSelect = (path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // Handles token selection with modifier key support:
  // - ctrl/cmd-click: enter select mode and toggle the token
  // - shift-click (in select mode): range-select from last selected to current
  // - plain click (in select mode): toggle the token
  const handleTokenSelect = useCallback((path: string, modifiers?: { shift: boolean; ctrl: boolean }) => {
    const isCtrl = modifiers?.ctrl ?? false;
    const isShift = modifiers?.shift ?? false;

    if (isCtrl) {
      // Enter select mode on ctrl/cmd-click, then toggle this token
      if (!selectMode) setSelectMode(true);
      setSelectedPaths(prev => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
      lastSelectedPathRef.current = path;
      return;
    }

    if (isShift && selectMode && lastSelectedPathRef.current !== null) {
      // Range-select from the anchor to the current path
      const orderedPaths = viewMode === 'tree'
        ? flatItems.filter(i => !i.node.isGroup).map(i => i.node.path)
        : displayedLeafNodes.map(n => n.path);
      const anchorIdx = orderedPaths.indexOf(lastSelectedPathRef.current);
      const targetIdx = orderedPaths.indexOf(path);
      if (anchorIdx !== -1 && targetIdx !== -1) {
        const lo = Math.min(anchorIdx, targetIdx);
        const hi = Math.max(anchorIdx, targetIdx);
        setSelectedPaths(prev => {
          const next = new Set(prev);
          for (let i = lo; i <= hi; i++) next.add(orderedPaths[i]);
          return next;
        });
        return; // Keep anchor at lastSelectedPathRef — don't update it on shift-click
      }
    }

    // Plain toggle
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    lastSelectedPathRef.current = path;
  }, [selectMode, viewMode, flatItems, displayedLeafNodes]);

  const displayedLeafPaths = useMemo(
    () => crossSetResults !== null
      ? new Set(crossSetResults.map(r => r.path))
      : new Set(displayedLeafNodes.map(n => n.path)),
    [displayedLeafNodes, crossSetResults]
  );

  const selectedLeafNodes = useMemo(
    () => displayedLeafNodes.filter(n => selectedPaths.has(n.path)),
    [displayedLeafNodes, selectedPaths]
  );

  const handleSelectAll = () => {
    const allSelected = [...displayedLeafPaths].every(p => selectedPaths.has(p));
    if (allSelected) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(displayedLeafPaths));
    }
  };

  /** Build nested DTCG JSON from a list of token nodes and copy to clipboard. */
  const copyTokensAsJson = useCallback((nodes: TokenNode[]) => {
    if (nodes.length === 0) return;
    // Build a nested DTCG object from flat token paths
    const root: Record<string, any> = {};
    for (const node of nodes) {
      if (node.isGroup) continue;
      const segments = node.path.split('.');
      let cursor = root;
      for (let i = 0; i < segments.length - 1; i++) {
        if (!(segments[i] in cursor)) cursor[segments[i]] = {};
        cursor = cursor[segments[i]];
      }
      const leaf: Record<string, unknown> = { $value: node.$value, $type: node.$type };
      if (node.$description) leaf.$description = node.$description;
      cursor[segments[segments.length - 1]] = leaf;
    }
    const json = JSON.stringify(root, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    }).catch(() => {});
  }, []);

  const flattenTokens = (nodes: TokenNode[]): any[] => {
    const result: any[] = [];
    const walk = (list: TokenNode[]) => {
      for (const node of list) {
        if (!node.isGroup) {
          result.push({ path: node.path, $type: node.$type, $value: node.$value, setName });
        }
        if (node.children) walk(node.children);
      }
    };
    walk(nodes);
    return result;
  };

  const resolveFlat = (flat: any[]) =>
    flat.map(t => {
      if (t.$type === 'gradient' && Array.isArray(t.$value)) {
        const resolvedStops = t.$value.map((stop: { color: string; position: number }) => {
          if (typeof stop.color === 'string' && stop.color.startsWith('{') && stop.color.endsWith('}')) {
            const refPath = stop.color.slice(1, -1);
            const refEntry = allTokensFlat[refPath];
            if (refEntry) {
              const inner = resolveTokenValue(refEntry.$value, refEntry.$type, allTokensFlat);
              return { ...stop, color: inner.value ?? refEntry.$value };
            }
          }
          return stop;
        });
        return { ...t, $value: resolvedStops };
      }
      const resolved = resolveTokenValue(t.$value, t.$type, allTokensFlat);
      return { ...t, $value: resolved.value ?? t.$value, $type: resolved.$type };
    });

  const doApplyVariables = (flat: any[]) => {
    parent.postMessage({ pluginMessage: { type: 'apply-variables', tokens: flat, collectionMap, modeMap } }, '*');
    setApplyResult({ type: 'variables', count: flat.length });
    setTimeout(() => setApplyResult(null), 3000);
  };

  const handleApplyVariables = async () => {
    const flat = resolveFlat(flattenTokens(tokens)).map((t: any) => ({ ...t, setName }));
    setVarDiffLoading(true);
    try {
      const figmaTokens: any[] = await new Promise((resolve, reject) => {
        const cid = `tl-vars-${Date.now()}-${Math.random()}`;
        const timeout = setTimeout(() => {
          if (varReadCorrelIdRef.current === cid) {
            varReadCorrelIdRef.current = null;
            varReadResolveRef.current = null;
          }
          reject(new Error('timeout'));
        }, 8000);
        varReadCorrelIdRef.current = cid;
        varReadResolveRef.current = (toks) => { clearTimeout(timeout); resolve(toks); };
        parent.postMessage({ pluginMessage: { type: 'read-variables', correlationId: cid } }, '*');
      });
      const figmaMap = new Map(figmaTokens.map((t: any) => [t.path, String(t.$value ?? '')]));
      let added = 0, modified = 0, unchanged = 0;
      for (const t of flat) {
        if (!figmaMap.has(t.path)) added++;
        else if (figmaMap.get(t.path) !== String(t.$value ?? '')) modified++;
        else unchanged++;
      }
      setVarDiffPending({ added, modified, unchanged, flat });
    } catch {
      // Figma not reachable — show count-only confirmation
      setVarDiffPending({ added: flat.length, modified: 0, unchanged: 0, flat });
    } finally {
      setVarDiffLoading(false);
    }
  };

  const handleApplyStyles = async () => {
    setApplying(true);
    const flat = resolveFlat(flattenTokens(tokens));
    parent.postMessage({ pluginMessage: { type: 'apply-styles', tokens: flat } }, '*');
    setApplyResult({ type: 'styles', count: flat.length });
    setTimeout(() => setApplying(false), 1500);
    setTimeout(() => setApplyResult(null), 3000);
  };

  const frRegexError = useMemo(() => {
    if (!frIsRegex || !frFind) return null;
    try { new RegExp(frFind); return null; }
    catch (e) { return e instanceof Error ? e.message : 'Invalid regular expression'; }
  }, [frFind, frIsRegex]);

  const frPreview = useMemo(() => {
    if (!frFind) return [];
    if (frIsRegex && frRegexError) return [];
    const currentSetPaths = flattenTokens(tokens).map(t => t.path as string);
    const existingPathSet = new Set(currentSetPaths);
    let pattern: RegExp | null = null;
    if (frIsRegex) {
      try { pattern = new RegExp(frFind, 'g'); } catch { return []; }
    }
    const renames: Array<{ oldPath: string; newPath: string; conflict: boolean }> = [];
    const willBeFreed = new Set<string>();
    for (const oldPath of currentSetPaths) {
      const newPath = pattern ? oldPath.replace(pattern, frReplace) : oldPath.split(frFind).join(frReplace);
      if (newPath !== oldPath) {
        willBeFreed.add(oldPath);
        renames.push({ oldPath, newPath, conflict: false });
      }
    }
    // Mark conflicts
    for (const r of renames) {
      if (existingPathSet.has(r.newPath) && !willBeFreed.has(r.newPath)) {
        r.conflict = true;
      }
    }
    return renames;
  }, [frFind, frReplace, frIsRegex, tokens]);

  const handleFindReplace = async () => {
    if (!frFind || frBusy) return;
    setFrError('');
    setFrBusy(true);
    // Capture values before async call so undo closure has stable references
    const capturedFind = frFind;
    const capturedReplace = frReplace;
    const capturedIsRegex = frIsRegex;
    const renamedCount = frPreview.filter(r => !r.conflict).length;
    try {
      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/bulk-rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ find: capturedFind, replace: capturedReplace, isRegex: capturedIsRegex }),
      });
      const data = await res.json() as { renamed?: number; skipped?: string[]; aliasesUpdated?: number; error?: string };
      if (!res.ok) { setFrError(data.error ?? 'Rename failed'); return; }
      if ((data.renamed ?? 0) === 0) {
        const skippedCount = data.skipped?.length ?? 0;
        setFrError(skippedCount > 0
          ? `All ${skippedCount} match${skippedCount === 1 ? '' : 'es'} conflict with existing tokens and were skipped`
          : 'No token paths matched the search pattern');
        return;
      }
      // Push undo for plain-text renames with a non-empty replacement string.
      // Regex and empty-replacement cases can't be automatically inverted safely.
      if (onPushUndo && renamedCount > 0 && !capturedIsRegex && capturedReplace !== '') {
        const capturedSet = setName;
        const capturedUrl = serverUrl;
        onPushUndo({
          description: `Rename ${renamedCount} token${renamedCount !== 1 ? 's' : ''}: "${capturedFind}" → "${capturedReplace}"`,
          restore: async () => {
            await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/bulk-rename`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ find: capturedReplace, replace: capturedFind, isRegex: false }),
            });
            onRefresh();
          },
          redo: async () => {
            await fetch(`${capturedUrl}/api/tokens/${encodeURIComponent(capturedSet)}/bulk-rename`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ find: capturedFind, replace: capturedReplace, isRegex: false }),
            });
            onRefresh();
          },
        });
      }
      setShowFindReplace(false);
      setFrFind('');
      setFrReplace('');
      setFrIsRegex(false);
      onRefresh();
    } catch (err) {
      setFrError(getErrorMessage(err));
    } finally {
      setFrBusy(false);
    }
  };

  const handleOpenPromoteModal = () => {
    const flat = flattenTokens(tokens);
    const selectedFlat = flat.filter(t => selectedPaths.has(t.path) && !isAlias(t.$value));
    const rows: PromoteRow[] = selectedFlat.map(t => {
      // Find candidate primitives: same type, not an alias, not the token itself
      const candidates = Object.entries(allTokensFlat).filter(
        ([candidatePath, entry]) => candidatePath !== t.path && entry.$type === t.$type && !isAlias(entry.$value),
      );
      if (t.$type === 'color' && typeof t.$value === 'string') {
        let bestPath: string | null = null;
        let bestDelta = Infinity;
        for (const [candidatePath, entry] of candidates) {
          if (typeof entry.$value !== 'string') continue;
          // Resolve alias if needed
          const resolved = resolveTokenValue(entry.$value, entry.$type, allTokensFlat);
          const resolvedHex = typeof resolved.value === 'string' ? resolved.value : entry.$value as string;
          const d = colorDeltaE(t.$value, resolvedHex);
          if (d !== null && d < bestDelta) {
            bestDelta = d;
            bestPath = candidatePath;
          }
        }
        return { path: t.path, $type: t.$type, $value: t.$value, proposedAlias: bestPath, deltaE: bestDelta === Infinity ? undefined : bestDelta, accepted: bestPath !== null };
      } else {
        // Exact value match for other types
        const match = candidates.find(([, entry]) => valuesEqual(entry.$value, t.$value));
        return { path: t.path, $type: t.$type, $value: t.$value, proposedAlias: match?.[0] ?? null, accepted: match !== undefined };
      }
    });
    setPromoteRows(rows);
  };

  const handleConfirmPromote = async () => {
    if (!promoteRows) return;
    setPromoteBusy(true);
    const toApply = promoteRows.filter(r => r.accepted && r.proposedAlias);
    try {
      await Promise.all(
        toApply.map(r =>
          fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${r.path.split('.').map(encodeURIComponent).join('/')}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ $value: `{${r.proposedAlias}}` }),
          }),
        ),
      );
      setPromoteRows(null);
      setSelectMode(false);
      setSelectedPaths(new Set());
      onRefresh();
    } finally {
      setPromoteBusy(false);
    }
  };

  const getDeleteModalProps = (): { title: string; description?: string; confirmLabel: string } | null => {
    if (!deleteConfirm) return null;
    if (deleteConfirm.type === 'token') {
      const name = deleteConfirm.path.split('.').pop() ?? deleteConfirm.path;
      const { orphanCount } = deleteConfirm;
      return {
        title: `Delete "${name}"?`,
        description: orphanCount > 0
          ? `${orphanCount} other token${orphanCount !== 1 ? 's' : ''} reference this and will become broken.`
          : `Token path: ${deleteConfirm.path}`,
        confirmLabel: 'Delete',
      };
    }
    if (deleteConfirm.type === 'group') {
      return {
        title: `Delete group "${deleteConfirm.name}"?`,
        description: `This will delete ${deleteConfirm.tokenCount} token${deleteConfirm.tokenCount !== 1 ? 's' : ''} in this group.`,
        confirmLabel: `Delete group (${deleteConfirm.tokenCount} token${deleteConfirm.tokenCount !== 1 ? 's' : ''})`,
      };
    }
    const { paths, orphanCount } = deleteConfirm;
    return {
      title: `Delete ${paths.length} token${paths.length !== 1 ? 's' : ''}?`,
      description: orphanCount > 0
        ? `${orphanCount} other token${orphanCount !== 1 ? 's' : ''} reference these and will become broken.`
        : undefined,
      confirmLabel: `Delete ${paths.length} token${paths.length !== 1 ? 's' : ''}`,
    };
  };

  const modalProps = getDeleteModalProps();

  // Scroll the virtual list to a group header row
  const handleJumpToGroup = useCallback((groupPath: string) => {
    const idx = flatItems.findIndex(item => item.node.path === groupPath);
    if (idx >= 0 && virtualListRef.current) {
      const targetScrollTop = Math.max(0, itemOffsets[idx]);
      virtualListRef.current.scrollTop = targetScrollTop;
      setVirtualScrollTop(targetScrollTop);
    }
  }, [flatItems, itemOffsets]);

  // Virtual scroll window computation — uses itemOffsets for variable-height rows
  const virtualContainerH = virtualListRef.current?.clientHeight ?? 500;
  const totalVirtualH = itemOffsets[flatItems.length];
  // Find the first item whose bottom edge is below virtualScrollTop
  let rawStart = 0;
  while (rawStart < flatItems.length && itemOffsets[rawStart + 1] <= virtualScrollTop) rawStart++;
  // Find the first item whose top edge is past the bottom of the viewport
  let rawEnd = rawStart;
  while (rawEnd < flatItems.length && itemOffsets[rawEnd] < virtualScrollTop + virtualContainerH) rawEnd++;
  const virtualStartIdx = Math.max(0, rawStart - VIRTUAL_OVERSCAN);
  const virtualEndIdx = Math.min(flatItems.length, rawEnd + VIRTUAL_OVERSCAN);
  const virtualTopPad = itemOffsets[virtualStartIdx];
  const virtualBottomPad = Math.max(0, totalVirtualH - itemOffsets[virtualEndIdx]);

  // Breadcrumb: build ancestor path segments for the first visible item
  // Map group paths → display names from the flat items list
  const groupNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const { node } of flatItems) {
      if (node.isGroup) map.set(node.path, node.name);
    }
    return map;
  }, [flatItems]);

  const breadcrumbSegments = useMemo(() => {
    if (flatItems.length === 0 || rawStart >= flatItems.length) return [];
    const topItem = flatItems[rawStart];
    if (topItem.depth === 0) return [];
    // Walk up the ancestor chain from the top visible item
    const segments: Array<{ name: string; path: string }> = [];
    let currentPath = topItem.node.path;
    let currentName = topItem.node.name;
    while (currentPath.length > currentName.length) {
      const parentPath = currentPath.slice(0, currentPath.length - currentName.length - 1);
      if (!parentPath) break;
      const parentName = groupNameMap.get(parentPath);
      if (parentName) {
        segments.unshift({ name: parentName, path: parentPath });
        currentPath = parentPath;
        currentName = parentName;
      } else {
        break;
      }
    }
    return segments;
  }, [flatItems, rawStart, groupNameMap]);

  return (
    <div className="flex flex-col h-full" onKeyDown={handleListKeyDown}>
      {/* Toolbars — fixed above the scrollable token list */}
      <div className="flex-shrink-0">
        {/* Select mode toolbar */}
        {selectMode && (
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] flex-1">
              {selectedPaths.size} of {displayedLeafPaths.size} selected
            </span>
            <button
              onClick={handleSelectAll}
              className="px-2 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              {[...displayedLeafPaths].every(p => selectedPaths.has(p)) && displayedLeafPaths.size > 0 ? 'Deselect all' : 'Select all'}
            </button>
            {selectedPaths.size > 0 && (
              <>
                <button
                  onClick={() => setShowBatchEditor(v => !v)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${showBatchEditor ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                >
                  Batch edit
                </button>
                <button
                  onClick={handleOpenPromoteModal}
                  className="px-2 py-1 rounded text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  Link to tokens
                </button>
                <button
                  onClick={() => {
                    const nodes = displayedLeafNodes.filter(n => selectedPaths.has(n.path));
                    copyTokensAsJson(nodes);
                  }}
                  className="px-2 py-1 rounded text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  {copyFeedback ? 'Copied!' : 'Copy JSON'}
                </button>
                <button
                  onClick={requestBulkDelete}
                  className="px-2 py-1 rounded text-[10px] font-medium text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  Delete {selectedPaths.size}
                </button>
              </>
            )}
            <button
              onClick={() => { setSelectMode(false); setSelectedPaths(new Set()); setShowBatchEditor(false); }}
              className="px-2 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Batch editor panel */}
        {selectMode && showBatchEditor && selectedPaths.size > 0 && (
          <BatchEditor
            selectedPaths={selectedPaths}
            allTokensFlat={allTokensFlat}
            setName={setName}
            sets={sets}
            serverUrl={serverUrl}
            connected={connected}
            onApply={onRefresh}
            onPushUndo={onPushUndo}
          />
        )}

        {/* Unified toolbar — view modes, search, filters, and actions in one compact bar */}
        {tokens.length > 0 && !selectMode && (
          <div className="flex flex-col border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            {/* Row 1: View modes + expand/collapse + sort + actions */}
            <div className="flex items-center gap-0.5 px-2 py-1">
              {/* View mode segmented control */}
              <div className="flex items-center bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] p-0.5">
                {(['tree', 'table', 'grid', 'canvas', 'json'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    title={mode === 'tree' ? 'Tree view' : mode === 'table' ? 'Table view' : mode === 'grid' ? 'Grid view — color swatches' : mode === 'canvas' ? 'Canvas — spatial map' : 'JSON editor'}
                    aria-pressed={viewMode === mode}
                    className={`px-1.5 py-0.5 rounded text-[9px] transition-colors capitalize ${viewMode === mode ? 'bg-[var(--color-figma-accent)] text-white font-medium' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                  >
                    {mode === 'json' ? '</>' : mode}
                  </button>
                ))}
              </div>

              {/* Expand/Collapse (tree view only) */}
              {viewMode === 'tree' && tokens.some(n => n.isGroup) && (
                <>
                  <div className="w-px h-3 bg-[var(--color-figma-border)] mx-0.5 shrink-0" />
                  <button
                    onClick={handleExpandAll}
                    title="Expand all groups"
                    aria-label="Expand all groups"
                    className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M2 3.5l3 3 3-3"/>
                      <path d="M2 6.5l3 3 3-3"/>
                    </svg>
                  </button>
                  <button
                    onClick={handleCollapseAll}
                    title="Collapse all groups"
                    aria-label="Collapse all groups"
                    className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M2 6.5l3-3 3 3"/>
                      <path d="M2 3.5l3-3 3 3"/>
                    </svg>
                  </button>
                </>
              )}

              {/* Spacer */}
              <div className="flex-1" />

              {/* Sync changed indicator */}
              {syncSnapshot && syncChangedCount > 0 && (
                <span
                  title="Tokens edited locally since the last sync"
                  className="flex items-center gap-1 text-[9px] text-[var(--color-figma-warning)] mr-0.5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-figma-warning)] shrink-0" />
                  {syncChangedCount}
                </span>
              )}

              {/* Lint issue count badge */}
              {lintViolations.length > 0 && (
                <button
                  onClick={onToggleIssuesOnly}
                  title={`${lintViolations.length} lint issue${lintViolations.length !== 1 ? 's' : ''} — click to filter`}
                  aria-label={`${lintViolations.length} lint issue${lintViolations.length !== 1 ? 's' : ''}`}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${showIssuesOnly ? 'bg-[var(--color-figma-error)] text-white' : 'text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 hover:bg-[var(--color-figma-error)]/20'}`}
                >
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                    <path d="M5 1L0.5 9h9L5 1zM5 3.5v2.5M5 7.5v.5"/>
                  </svg>
                  {lintViolations.length}
                </button>
              )}

              {/* Sort */}
              <select
                value={sortOrder}
                onChange={e => setSortOrder(e.target.value as SortOrder)}
                aria-label="Sort order"
                className={`text-[9px] bg-transparent border-none outline-none cursor-pointer shrink-0 ${sortOrder !== 'default' ? 'text-[var(--color-figma-accent)] font-medium' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
              >
                <option value="default">Sort</option>
                <option value="alpha-asc">A → Z</option>
                <option value="alpha-desc">Z → A</option>
                <option value="by-type">By type</option>
                <option value="by-value">By value</option>
              </select>

              {/* Recently touched filter */}
              {recentlyTouched.count > 0 && (
                <button
                  onClick={() => setShowRecentlyTouched(v => !v)}
                  title={showRecentlyTouched ? 'Show all tokens' : `Show ${recentlyTouched.count} recently touched token${recentlyTouched.count !== 1 ? 's' : ''}`}
                  aria-label={showRecentlyTouched ? 'Show all tokens' : 'Show recently touched tokens'}
                  aria-pressed={showRecentlyTouched}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${showRecentlyTouched ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="5" cy="5" r="4" />
                    <path d="M5 3v2.5l1.5 1" />
                  </svg>
                  {recentlyTouched.count}
                </button>
              )}

              {/* Selection filter */}
              <button
                onClick={() => setInspectMode(v => !v)}
                title={inspectMode ? 'Show all tokens' : 'Show only tokens bound to selection'}
                aria-label={inspectMode ? 'Show all tokens' : 'Show only tokens bound to selection'}
                aria-pressed={inspectMode}
                className={`p-1 rounded transition-colors ${inspectMode ? 'text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/15' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
                  <rect x="1" y="1" width="8" height="8" rx="1" />
                  <path d="M3.5 5l1.5 1.5 2-2.5"/>
                </svg>
              </button>

              {/* Multi-select */}
              <button
                onClick={() => setSelectMode(true)}
                title="Multi-select tokens (M)"
                aria-label="Multi-select tokens"
                className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
                  <rect x="0.5" y="0.5" width="4" height="4" rx="0.5"/>
                  <rect x="5.5" y="0.5" width="4" height="4" rx="0.5"/>
                  <rect x="0.5" y="5.5" width="4" height="4" rx="0.5"/>
                  <rect x="5.5" y="5.5" width="4" height="4" rx="0.5"/>
                </svg>
              </button>

              {/* More actions menu */}
              <div className="relative shrink-0" ref={moreFiltersRef}>
                <button
                  title="More actions"
                  aria-label="More actions"
                  aria-haspopup="menu"
                  aria-expanded={moreFiltersOpen}
                  onClick={() => setMoreFiltersOpen(v => !v)}
                  className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                    <circle cx="2" cy="5" r="1"/>
                    <circle cx="5" cy="5" r="1"/>
                    <circle cx="8" cy="5" r="1"/>
                  </svg>
                </button>
                {moreFiltersOpen && (
                  <div role="menu" className="absolute right-0 top-full mt-0.5 z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg flex flex-col py-1 min-w-[160px]">
                    <button role="menuitem" onClick={() => { setShowScaffold(true); setMoreFiltersOpen(false); }} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">Use preset…</button>
                    <button role="menuitem" onClick={() => { setShowFindReplace(true); setMoreFiltersOpen(false); }} disabled={!connected} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40">Find &amp; Replace…</button>
                    <div className="border-t border-[var(--color-figma-border)] my-1" />
                    <button role="menuitem" onClick={() => { setMoreFiltersOpen(false); handleApplyVariables(); }} disabled={applying || varDiffLoading || tokens.length === 0} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40">{varDiffLoading ? 'Comparing…' : 'Apply as Variables'}</button>
                    <button role="menuitem" onClick={() => { handleApplyStyles(); setMoreFiltersOpen(false); }} disabled={applying || tokens.length === 0} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40">Apply as Styles</button>
                    <div className="border-t border-[var(--color-figma-border)] my-1" />
                    {refFilter === 'all' && (
                      <>
                        <button role="menuitem" onClick={() => { setRefFilter('aliases'); setMoreFiltersOpen(false); }} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">Show references only</button>
                        <button role="menuitem" onClick={() => { setRefFilter('direct'); setMoreFiltersOpen(false); }} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">Show direct values only</button>
                      </>
                    )}
                    {!showDuplicates && (
                      <button role="menuitem" onClick={() => { setShowDuplicates(true); setMoreFiltersOpen(false); }} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">Show duplicates</button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Search + active filters (only in non-json/graph views) */}
            {viewMode !== 'json' && viewMode !== 'graph' && (
              <div className="flex items-center gap-1 px-2 pb-1">
                <div className="flex-1 min-w-0 relative">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)] pointer-events-none" aria-hidden="true">
                    <circle cx="4" cy="4" r="3"/>
                    <path d="M6.5 6.5L9 9" strokeLinecap="round"/>
                  </svg>
                  <input
                    ref={searchRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                      setHintIndex(0);
                    }}
                    onFocus={() => setShowQualifierHints(true)}
                    onBlur={() => { setTimeout(() => setShowQualifierHints(false), 150); }}
                    onKeyDown={e => {
                      if (!showQualifierHints || qualifierHints.length === 0) return;
                      if (e.key === 'ArrowDown') { e.preventDefault(); setHintIndex(i => Math.min(i + 1, qualifierHints.length - 1)); }
                      else if (e.key === 'ArrowUp') { e.preventDefault(); setHintIndex(i => Math.max(i - 1, 0)); }
                      else if (e.key === 'Tab' || (e.key === 'Enter' && qualifierHints.length > 0)) {
                        e.preventDefault();
                        const hint = qualifierHints[hintIndex];
                        if (hint) {
                          const words = searchQuery.split(/\s+/);
                          words[words.length - 1] = hint.qualifier;
                          setSearchQuery(words.join(' '));
                          setHintIndex(0);
                        }
                      }
                    }}
                    placeholder={hasStructuredQualifiers(searchQuery) ? 'Add more filters…' : 'Search (/) — try type: has: value:'}
                    className={`w-full pl-6 pr-2 py-1 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[10px] outline-none placeholder:text-[var(--color-figma-text-tertiary)] ${hasStructuredQualifiers(searchQuery) ? 'border-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)]'} focus:border-[var(--color-figma-accent)]`}
                  />
                  {/* Qualifier autocomplete hints */}
                  {showQualifierHints && qualifierHints.length > 0 && (
                    <div ref={qualifierHintsRef} className="absolute left-0 top-full mt-0.5 w-full z-50 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shadow-lg overflow-hidden">
                      {qualifierHints.map((hint, i) => (
                        <button
                          key={hint.qualifier}
                          onMouseDown={e => {
                            e.preventDefault();
                            const words = searchQuery.split(/\s+/);
                            words[words.length - 1] = hint.qualifier;
                            setSearchQuery(words.join(' '));
                            setHintIndex(0);
                            searchRef.current?.focus();
                          }}
                          className={`w-full text-left px-2 py-1 text-[10px] flex items-center gap-2 ${i === hintIndex ? 'bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text)]' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                        >
                          <span className="font-mono font-semibold text-[var(--color-figma-accent)]">{hint.qualifier}</span>
                          <span className="truncate">{hint.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* Search qualifier help button */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setShowQualifierHelp(v => !v)}
                    onBlur={() => { setTimeout(() => setShowQualifierHelp(false), 150); }}
                    title="Search qualifiers cheat sheet"
                    aria-label="Search qualifiers cheat sheet"
                    className={`flex items-center justify-center w-5 h-5 rounded border text-[10px] font-bold cursor-pointer transition-colors ${showQualifierHelp ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-tertiary)] bg-[var(--color-figma-bg)] hover:text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-text-tertiary)]'}`}
                  >
                    ?
                  </button>
                  {showQualifierHelp && (
                    <div ref={qualifierHelpRef} className="absolute right-0 top-full mt-1 w-56 z-50 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shadow-lg overflow-hidden">
                      <div className="px-2 py-1.5 border-b border-[var(--color-figma-border)]">
                        <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">Search Qualifiers</span>
                        <span className="text-[9px] text-[var(--color-figma-text-tertiary)] ml-1">click to insert</span>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {QUERY_QUALIFIERS.map(hint => (
                          <button
                            key={hint.qualifier}
                            onMouseDown={e => {
                              e.preventDefault();
                              const q = searchQuery ? searchQuery + ' ' + hint.qualifier : hint.qualifier;
                              setSearchQuery(q);
                              setShowQualifierHelp(false);
                              searchRef.current?.focus();
                            }}
                            className="w-full text-left px-2 py-1 text-[10px] flex flex-col gap-0 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-semibold text-[var(--color-figma-accent)]">{hint.qualifier}</span>
                              <span className="text-[var(--color-figma-text-secondary)] truncate">{hint.desc}</span>
                            </div>
                            {hint.example && (
                              <span className="text-[9px] text-[var(--color-figma-text-tertiary)] font-mono ml-0.5">e.g. {hint.example}</span>
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="px-2 py-1 border-t border-[var(--color-figma-border)] text-[9px] text-[var(--color-figma-text-tertiary)]">
                        Combine qualifiers: <span className="font-mono">type:color has:alias</span>
                      </div>
                    </div>
                  )}
                </div>
                <select
                  value={typeFilter}
                  onChange={e => setTypeFilter(e.target.value)}
                  title="Filter by type"
                  aria-label="Filter by type"
                  className={`shrink-0 px-1 py-1 rounded border text-[10px] outline-none cursor-pointer ${typeFilter ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg)]'}`}
                >
                  <option value="">Type</option>
                  {availableTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {/* Cross-set search toggle (only with multiple sets) */}
                {sets.length > 1 && (
                  <button
                    onClick={() => setCrossSetSearch(v => !v)}
                    title={crossSetSearch ? 'Search current set only' : 'Search across all sets'}
                    className={`shrink-0 px-1.5 py-1 rounded border text-[10px] outline-none cursor-pointer transition-colors ${crossSetSearch ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg)]'}`}
                  >
                    All sets
                  </button>
                )}
                {/* Active filter pills */}
                {refFilter !== 'all' && (
                  <button
                    onClick={() => setRefFilter('all')}
                    title="Clear reference filter"
                    className="shrink-0 px-1.5 py-0.5 rounded text-[9px] whitespace-nowrap transition-colors bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20"
                  >
                    {refFilter === 'aliases' ? 'Refs' : 'Direct'} ✕
                  </button>
                )}
                {showDuplicates && (
                  <button
                    onClick={() => setShowDuplicates(false)}
                    title="Clear duplicate filter"
                    className="shrink-0 px-1.5 py-0.5 rounded text-[9px] whitespace-nowrap transition-colors bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20"
                  >
                    Dups ✕
                  </button>
                )}
                {showIssuesOnly && (
                  <button
                    onClick={onToggleIssuesOnly}
                    title="Clear issues filter"
                    className="shrink-0 px-1.5 py-0.5 rounded text-[9px] whitespace-nowrap transition-colors bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/20"
                  >
                    Issues ✕
                  </button>
                )}
                {showRecentlyTouched && (
                  <button
                    onClick={() => setShowRecentlyTouched(false)}
                    title="Clear recently touched filter"
                    className="shrink-0 px-1.5 py-0.5 rounded text-[9px] whitespace-nowrap transition-colors bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20"
                  >
                    Recent ✕
                  </button>
                )}
                {filtersActive && (
                  <button
                    onClick={clearFilters}
                    title="Clear all filters"
                    aria-label="Clear all filters"
                    className="flex items-center justify-center w-5 h-5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] shrink-0"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                      <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {/* Delete error banner */}
      {deleteError && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-figma-error)] text-white text-[11px]">
          <span className="flex-1">Delete failed: {deleteError}</span>
          <button onClick={() => setDeleteError(null)} aria-label="Dismiss error" className="opacity-70 hover:opacity-100 font-bold text-[13px] leading-none">&times;</button>
        </div>
      )}
      {/* Scrollable token content with virtual scroll */}
      <div
        ref={virtualListRef}
        className="flex-1 overflow-y-auto"
        onScroll={e => { const top = e.currentTarget.scrollTop; virtualScrollTopRef.current = top; setVirtualScrollTop(top); }}
      >
        {crossSetResults !== null ? (
          /* Cross-set search results */
          crossSetResults.length === 0 ? (
            <div className="py-8 text-center text-[10px] text-[var(--color-figma-text-tertiary)]">
              No tokens found across all sets
            </div>
          ) : (
            <div>
              {sets
                .filter(sn => crossSetResults.some(r => r.setName === sn))
                .map(sn => {
                  const setResults = crossSetResults.filter(r => r.setName === sn);
                  return (
                    <div key={sn}>
                      <div className="px-2 py-1 text-[9px] font-medium text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] sticky top-0 z-10">
                        {sn} <span className="font-normal opacity-60">({setResults.length})</span>
                      </div>
                      {setResults.map(r => (
                        <button
                          key={r.path}
                          onClick={() => onNavigateToSet?.(r.setName, r.path)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--color-figma-bg-hover)] border-b border-[var(--color-figma-border)]/50"
                        >
                          {r.entry.$type === 'color' && typeof r.entry.$value === 'string' && r.entry.$value.startsWith('#') && (
                            <span className="shrink-0 w-3 h-3 rounded-sm border border-[var(--color-figma-border)]" style={{ background: r.entry.$value }} />
                          )}
                          <span className="flex-1 min-w-0 font-mono text-[10px] text-[var(--color-figma-text)] truncate">{highlightMatch(r.path, searchHighlight?.nameTerms ?? [])}</span>
                          <span className={`shrink-0 text-[8px] px-1 py-0.5 rounded ${TOKEN_TYPE_BADGE_CLASS[r.entry.$type] ?? 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>{r.entry.$type}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
            </div>
          )
        ) : inspectMode && selectedNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--color-figma-text-secondary)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M13 12H3"/>
            </svg>
            <p className="mt-2 text-[11px] font-medium">Select a layer to inspect</p>
            <p className="text-[10px] mt-0.5">Tokens bound to the selected layer will appear here</p>
          </div>
        ) : viewMode === 'graph' ? (
          /* Graph view — node-based generator editor */
          <TokenGraph
            generators={generators ?? []}
            serverUrl={serverUrl}
            sets={sets}
            activeSet={setName}
            onRefresh={onRefresh}
            onRefreshGenerators={onRefreshGenerators ?? (() => {})}
          />
        ) : viewMode === 'json' ? (
          /* JSON editor — raw DTCG JSON, works for both empty and non-empty sets */
          <div className="h-full flex flex-col">
            <textarea
              ref={jsonTextareaRef}
              value={jsonText}
              onChange={e => {
                const val = e.target.value;
                setJsonText(val);
                setJsonDirty(true);
                try {
                  JSON.parse(val);
                  setJsonError(null);
                  setJsonBrokenRefs(validateJsonRefs(val, allTokensFlat));
                } catch (err) {
                  setJsonError(getErrorMessage(err, 'Invalid JSON'));
                  setJsonBrokenRefs([]);
                }
              }}
              placeholder={'{\n  "color": {\n    "primary": {\n      "$value": "#3b82f6",\n      "$type": "color"\n    }\n  }\n}'}
              spellCheck={false}
              className="flex-1 p-3 font-mono text-[10px] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] outline-none resize-none leading-relaxed placeholder:text-[var(--color-figma-text-tertiary)]"
              style={{ minHeight: 0 }}
            />
            <div className="shrink-0 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 flex flex-col gap-1">
              {jsonError && (
                <p className="text-[10px] text-[var(--color-figma-error)] font-mono leading-tight">{jsonError}</p>
              )}
              {jsonBrokenRefs.length > 0 && !jsonError && (
                <div className="text-[10px] text-[var(--color-figma-warning)] flex flex-wrap gap-1 items-center">
                  <span className="font-medium shrink-0">Broken refs:</span>
                  {jsonBrokenRefs.map(r => (
                    <span key={r} className="font-mono bg-[var(--color-figma-warning)]/10 rounded px-1">{'{' + r + '}'}</span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                  {tokens.length === 0 ? 'Paste DTCG JSON to import tokens' : jsonDirty ? 'Unsaved changes' : 'Up to date'}
                </span>
                <div className="flex gap-1">
                  {jsonDirty && tokens.length > 0 && (
                    <button
                      onClick={() => {
                        setJsonDirty(false);
                        fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/raw`)
                          .then(r => r.json())
                          .then(data => {
                            const text = JSON.stringify(data, null, 2);
                            setJsonText(text);
                            setJsonError(null);
                            setJsonBrokenRefs(validateJsonRefs(text, allTokensFlat));
                          })
                          .catch(() => {});
                      }}
                      className="px-2 py-0.5 rounded text-[10px] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                    >
                      Revert
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      if (jsonError || !jsonText.trim()) return;
                      setJsonSaving(true);
                      try {
                        const parsed = JSON.parse(jsonText);
                        const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(parsed),
                        });
                        if (!res.ok) {
                          const err = await res.json().catch(() => ({})) as { error?: string };
                          setJsonError(err.error ?? 'Save failed');
                        } else {
                          setJsonDirty(false);
                          onRefresh();
                        }
                      } catch {
                        setJsonError('Invalid JSON — cannot save');
                      } finally {
                        setJsonSaving(false);
                      }
                    }}
                    disabled={!!jsonError || jsonSaving || !connected || !jsonText.trim()}
                    className="px-2 py-0.5 rounded text-[10px] transition-colors bg-[var(--color-figma-accent)] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                  >
                    {jsonSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--color-figma-text-secondary)]">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M12 8v8M8 12h8" />
            </svg>
            <p className="mt-2 text-[12px]">No tokens yet</p>
            <p className="text-[10px]">Create a token or import from Figma</p>
          </div>
        ) : viewMode === 'canvas' ? (
          /* Canvas view */
          <TokenCanvas
            tokens={displayedTokens}
            allTokensFlat={allTokensFlat}
            onEdit={onEdit}
          />
        ) : viewMode === 'grid' ? (
          /* Grid view — color swatch palette */
          (() => {
            const leaves = displayedLeafNodes;
            const colorLeaves = leaves.filter(l => l.$type === 'color');
            if (colorLeaves.length === 0) {
              const filterIsBlockingColors = typeFilter !== '' && typeFilter !== 'color';
              const allColorCount = flattenLeafNodes(sortedTokens).filter(l => l.$type === 'color').length;
              const filtersHidingColors = !filterIsBlockingColors && allColorCount > 0 && filtersActive;
              return (
                <div className="flex flex-col items-center justify-center py-12 text-[var(--color-figma-text-secondary)]">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="2" width="20" height="20" rx="3" />
                    <circle cx="12" cy="12" r="4" />
                    <path d="M2 12h4M18 12h4M12 2v4M12 18v4" />
                  </svg>
                  {filterIsBlockingColors ? (
                    <>
                      <p className="mt-2 text-[11px] font-medium">No color tokens match current filter</p>
                      <p className="text-[10px] mt-0.5">Grid view only shows color swatches — clear the type filter to see them</p>
                      <button
                        onClick={() => setTypeFilter('')}
                        className="mt-3 px-2.5 py-1 text-[10px] rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                      >
                        Clear type filter
                      </button>
                    </>
                  ) : filtersHidingColors ? (
                    <>
                      <p className="mt-2 text-[11px] font-medium">Filters hide all {allColorCount} color token{allColorCount !== 1 ? 's' : ''}</p>
                      <p className="text-[10px] mt-0.5">This set has color tokens, but none match the current search or filters</p>
                      <button
                        onClick={() => setViewMode('tree')}
                        className="mt-3 px-2.5 py-1 text-[10px] rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                      >
                        Switch to Tree view
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="mt-2 text-[11px] font-medium">No color tokens in this set</p>
                      <p className="text-[10px] mt-0.5">Grid view shows color tokens as swatches — this set has no color tokens</p>
                      <button
                        onClick={() => setViewMode('tree')}
                        className="mt-3 px-2.5 py-1 text-[10px] rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                      >
                        Switch to Tree view
                      </button>
                    </>
                  )}
                </div>
              );
            }
            // Group color leaves by their parent path
            const groups = new Map<string, typeof colorLeaves>();
            for (const leaf of colorLeaves) {
              const parent = nodeParentPath(leaf.path, leaf.name);
              const key = parent || '(root)';
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(leaf);
            }
            return (
              <div className="p-2 space-y-3">
                {[...groups.entries()].map(([groupPath, groupLeaves]) => (
                  <div key={groupPath}>
                    <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] mb-1 px-0.5 truncate" title={groupPath}>
                      {groupPath === '(root)' ? 'Ungrouped' : groupPath}
                    </div>
                    <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))' }}>
                      {groupLeaves.map(leaf => {
                        const resolved = typeof leaf.$value === 'string' && leaf.$value.startsWith('{')
                          ? allTokensFlat[leaf.$value.slice(1, -1)]?.$value
                          : leaf.$value;
                        const colorStr = typeof resolved === 'string' ? resolved : '#ccc';
                        return (
                          <button
                            key={leaf.path}
                            onClick={() => onPreview ? onPreview(leaf.path, leaf.name) : onEdit(leaf.path, leaf.name)}
                            onDoubleClick={() => onEdit(leaf.path, leaf.name)}
                            title={`${formatDisplayPath(leaf.path, leaf.name)}\n${colorStr}\nClick to preview · Double-click to edit`}
                            className="group flex flex-col items-center gap-0.5 rounded transition-colors hover:bg-[var(--color-figma-bg-hover)] p-0.5"
                          >
                            <div
                              className="w-full aspect-square rounded border border-[var(--color-figma-border)] group-hover:ring-1 group-hover:ring-[var(--color-figma-accent)]/50 transition-shadow"
                              style={{ backgroundColor: colorStr }}
                            />
                            <span className="text-[8px] text-[var(--color-figma-text-secondary)] truncate w-full text-center leading-tight">
                              {leaf.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()
        ) : viewMode === 'table' ? (
          <TokenTableView
            leafNodes={displayedLeafNodes}
            allTokensFlat={allTokensFlat}
            onEdit={onEdit}
            onInlineSave={handleInlineSave}
            connected={connected}
            highlightedToken={highlightedToken ?? null}
            filtersActive={filtersActive}
            onClearFilters={clearFilters}
            selectMode={selectMode}
            selectedPaths={selectedPaths}
            onToggleSelect={handleTokenSelect}
          />
        ) : displayedTokens.length === 0 && filtersActive ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--color-figma-text-secondary)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              <path d="M8 11h6M11 8v6" />
            </svg>
            <p className="mt-2 text-[11px] font-medium">No tokens match your filters</p>
            {searchQuery && connected && (
              <button
                onClick={() => {
                  if (onCreateNew) {
                    onCreateNew(searchQuery);
                  } else {
                    setNewTokenPath(searchQuery);
                    setShowCreateForm(true);
                  }
                }}
                className="mt-2 px-3 py-1 rounded text-[10px] bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors"
              >
                Create &ldquo;{searchQuery}&rdquo;
              </button>
            )}
            <button
              onClick={clearFilters}
              className="mt-2 px-3 py-1 rounded text-[10px] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20 transition-colors"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="py-1">
            {breadcrumbSegments.length > 0 && (
              <div className="sticky top-0 z-10 flex items-center gap-0.5 px-2 py-1 bg-[var(--color-figma-bg)] border-b border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)]">
                {breadcrumbSegments.map((seg, i) => (
                  <span key={seg.path} className="flex items-center gap-0.5">
                    {i > 0 && <span className="opacity-40 mx-0.5">›</span>}
                    <button
                      className="hover:text-[var(--color-figma-text)] hover:underline truncate max-w-[120px]"
                      title={seg.path}
                      onClick={() => handleJumpToGroup(seg.path)}
                    >
                      {seg.name}
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ height: virtualTopPad }} aria-hidden="true" />
            {flatItems.slice(virtualStartIdx, virtualEndIdx).map(({ node, depth }) => {
              const moveEnabled = sortOrder === 'default' && connected;
              const parentPath = moveEnabled ? (nodeParentPath(node.path, node.name) ?? '') : '';
              const siblings = moveEnabled ? (siblingOrderMap.get(parentPath) ?? []) : [];
              const sibIdx = moveEnabled ? siblings.indexOf(node.name) : -1;
              return (
              <TokenTreeNode
                key={node.path}
                node={node}
                depth={depth}
                skipChildren
                onEdit={onEdit}
                onPreview={onPreview}
                onDelete={requestDeleteToken}
                onDeleteGroup={requestDeleteGroup}
                setName={setName}
                selectionCapabilities={selectionCapabilities}
                allTokensFlat={allTokensFlat}
                selectMode={selectMode}
                isSelected={node.isGroup ? false : selectedPaths.has(node.path)}
                onToggleSelect={handleTokenSelect}
                expandedPaths={expandedPaths}
                onToggleExpand={handleToggleExpand}
                duplicateCounts={duplicateCounts}
                highlightedToken={highlightedToken ?? null}
                onNavigateToAlias={onNavigateToAlias}
                onCreateSibling={handleOpenCreateSibling}
                onCreateGroup={(parentPath) => setNewGroupDialogParent(parentPath)}
                onRenameGroup={handleRenameGroup}
                onUpdateGroupMeta={handleUpdateGroupMeta}
                onRequestMoveGroup={handleRequestMoveGroup}
                onRequestMoveToken={handleRequestMoveToken}
                onDuplicateGroup={handleDuplicateGroup}
                onDuplicateToken={handleDuplicateToken}
                onExtractToAlias={handleOpenExtractToAlias}
                inspectMode={inspectMode}
                onHoverToken={handleHoverToken}
                lintViolations={lintViolations.filter(v => v.path === node.path)}
                onExtractToAliasForLint={(path, $type, $value) => handleOpenExtractToAlias(path, $type, $value)}
                onSyncGroup={onSyncGroup}
                onSyncGroupStyles={onSyncGroupStyles}
                onSetGroupScopes={onSetGroupScopes}
                onGenerateScaleFromGroup={onGenerateScaleFromGroup}
                syncSnapshot={syncSnapshot}
                cascadeDiff={cascadeDiff}
                onFilterByType={setTypeFilter}
                generatorsBySource={generatorsBySource}
                derivedTokenPaths={derivedTokenPaths}
                onJumpToGroup={handleJumpToGroup}
                onInlineSave={handleInlineSave}
                onRenameToken={handleRenameToken}
                onDragStart={(paths, names) => setDragSource({ paths, names })}
                onDragEnd={() => { setDragSource(null); setDragOverGroup(null); setDragOverGroupIsInvalid(false); setDragOverReorder(null); }}
                onDragOverGroup={(path, invalid) => { setDragOverGroup(path); setDragOverGroupIsInvalid(invalid ?? false); setDragOverReorder(null); }}
                onDropOnGroup={handleDropOnGroup}
                dragOverGroup={dragOverGroup}
                dragOverGroupIsInvalid={dragOverGroupIsInvalid}
                dragSource={dragSource}
                onDragOverToken={(path, _name, pos) => { setDragOverReorder({ path, position: pos }); setDragOverGroup(null); }}
                onDragLeaveToken={() => setDragOverReorder(null)}
                onDropOnToken={(path, name, pos) => handleDropReorder(path, name, pos)}
                dragOverReorder={sortOrder === 'default' ? dragOverReorder : null}
                selectedLeafNodes={selectedLeafNodes}
                onMoveUp={moveEnabled && sibIdx > 0 ? () => handleMoveTokenInGroup(node.path, node.name, 'up') : undefined}
                onMoveDown={moveEnabled && sibIdx >= 0 && sibIdx < siblings.length - 1 ? () => handleMoveTokenInGroup(node.path, node.name, 'down') : undefined}
                chainExpanded={expandedChains.has(node.path)}
                onToggleChain={handleToggleChain}
                searchHighlight={searchHighlight}
                showFullPath={showRecentlyTouched}
                tokenUsageCounts={tokenUsageCounts}
              />
              );
            })}
            <div style={{ height: virtualBottomPad }} aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div ref={createFormRef} className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <div className="flex flex-col gap-2">
            {siblingPrefix !== null && (
              <div className="text-[9px] text-[var(--color-figma-text-secondary)]">
                Creating sibling in <span className="font-medium text-[var(--color-figma-text)]">{siblingPrefix || 'root'}</span>
              </div>
            )}
            <input
              type="text"
              placeholder={siblingPrefix ? `${siblingPrefix}.name` : 'Token path (e.g. color.primary.500)'}
              value={newTokenPath}
              onChange={e => { setNewTokenPath(e.target.value); setCreateError(''); }}
              className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] ${createError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
              onKeyDown={e => { if (e.key === 'Enter') { e.shiftKey ? handleCreateAndNew() : handleCreate(); } }}
              autoFocus
            />
            {createError && <p className="text-[10px] text-[var(--color-figma-error)]">{createError}</p>}
            <input
              type="text"
              placeholder="Value (optional, e.g. #FF0000, 16px)"
              value={newTokenValue}
              onChange={e => {
                const val = e.target.value;
                setNewTokenValue(val);
                const inferred = inferTypeFromValue(val);
                if (inferred) {
                  setNewTokenType(inferred);
                  setTypeAutoInferred(true);
                } else if (typeAutoInferred && !val.trim()) {
                  setTypeAutoInferred(false);
                }
              }}
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
              onKeyDown={e => { if (e.key === 'Enter') { e.shiftKey ? handleCreateAndNew() : handleCreate(); } }}
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newTokenDescription}
              onChange={e => setNewTokenDescription(e.target.value)}
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
              onKeyDown={e => { if (e.key === 'Enter') { e.shiftKey ? handleCreateAndNew() : handleCreate(); } }}
            />
            <select
              value={newTokenType}
              onChange={e => { setNewTokenType(e.target.value); setTypeAutoInferred(false); }}
              className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] outline-none ${typeAutoInferred ? 'border-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)]'}`}
            >
              <option value="color">Color</option>
              <option value="dimension">Dimension</option>
              <option value="typography">Typography</option>
              <option value="shadow">Shadow</option>
              <option value="border">Border</option>
              <option value="gradient">Gradient</option>
              <option value="duration">Duration</option>
              <option value="fontFamily">Font Family</option>
              <option value="fontWeight">Font Weight</option>
              <option value="strokeStyle">Stroke Style</option>
              <option value="number">Number</option>
              <option value="string">String</option>
              <option value="boolean">Boolean</option>
            </select>
            <div className="flex gap-1.5">
              <button
                onClick={handleCreate}
                disabled={!newTokenPath.trim()}
                title={!newTokenPath.trim() ? 'Enter a token name first' : 'Create token (Enter)'}
                className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
              >
                Create
              </button>
              <button
                onClick={handleCreateAndNew}
                disabled={!newTokenPath.trim()}
                title={!newTokenPath.trim() ? 'Enter a token name first' : 'Create and start a new token in the same group (Shift+Enter)'}
                className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] text-[11px] font-medium hover:bg-[var(--color-figma-accent)] hover:text-white disabled:opacity-40 whitespace-nowrap"
              >
                & New
              </button>
              {onCreateNew && (
                <button
                  onClick={() => {
                    const path = newTokenPath.trim();
                    onCreateNew(path || undefined, newTokenType, newTokenValue.trim() || undefined);
                    setShowCreateForm(false); setNewTokenPath(''); setNewTokenValue(''); setNewTokenDescription(''); setTypeAutoInferred(false); setSiblingPrefix(null); setCreateError('');
                  }}
                  title="Open full editor with more fields (references, scopes, extensions, modes)"
                  className="px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M14 10l6.1-6.1M9 21H3v-6M10 14l-6.1 6.1"/></svg>
                </button>
              )}
              <button
                onClick={() => { setShowCreateForm(false); setNewTokenPath(''); setNewTokenValue(''); setNewTokenDescription(''); setTypeAutoInferred(false); setSiblingPrefix(null); setCreateError(''); }}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom actions — streamlined primary actions only */}
      {!showCreateForm && (
        <div className="px-2 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex items-center gap-1.5">
          <button
            onClick={() => onCreateNew ? onCreateNew() : setShowCreateForm(true)}
            disabled={!connected}
            className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
          >
            + New Token
          </button>
          <button
            onClick={() => { setNewGroupDialogParent(''); setNewGroupName(''); setNewGroupError(''); }}
            disabled={!connected}
            title="Create an empty group to organize tokens"
            className="px-2.5 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[10px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
          >
            New Group
          </button>
          {applyResult && (
            <span className="text-[10px] text-[var(--color-figma-accent)] ml-auto shrink-0">
              Applied {applyResult.count} {applyResult.type === 'variables' ? 'variables' : 'styles'}
            </span>
          )}
        </div>
      )}

      <TokenListModals
        showScaffold={showScaffold}
        onSetShowScaffold={setShowScaffold}
        serverUrl={serverUrl}
        setName={setName}
        sets={sets}
        onRefresh={onRefresh}
        allTokensFlat={allTokensFlat}
        connected={connected}
        deleteConfirm={deleteConfirm}
        modalProps={modalProps}
        executeDelete={executeDelete}
        onSetDeleteConfirm={setDeleteConfirm}
        newGroupDialogParent={newGroupDialogParent}
        newGroupName={newGroupName}
        newGroupError={newGroupError}
        onSetNewGroupName={setNewGroupName}
        onSetNewGroupError={setNewGroupError}
        handleCreateGroup={handleCreateGroup}
        onSetNewGroupDialogParent={setNewGroupDialogParent}
        renameTokenConfirm={renameTokenConfirm}
        executeTokenRename={executeTokenRename}
        onSetRenameTokenConfirm={setRenameTokenConfirm}
        varDiffPending={varDiffPending}
        doApplyVariables={doApplyVariables}
        onSetVarDiffPending={setVarDiffPending}
        extractToken={extractToken}
        extractMode={extractMode}
        onSetExtractMode={setExtractMode}
        newPrimitivePath={newPrimitivePath}
        onSetNewPrimitivePath={setNewPrimitivePath}
        newPrimitiveSet={newPrimitiveSet}
        onSetNewPrimitiveSet={setNewPrimitiveSet}
        existingAlias={existingAlias}
        onSetExistingAlias={setExistingAlias}
        existingAliasSearch={existingAliasSearch}
        onSetExistingAliasSearch={setExistingAliasSearch}
        extractError={extractError}
        onSetExtractError={setExtractError}
        handleConfirmExtractToAlias={handleConfirmExtractToAlias}
        onSetExtractToken={setExtractToken}
        showFindReplace={showFindReplace}
        frFind={frFind}
        frReplace={frReplace}
        frIsRegex={frIsRegex}
        frError={frError}
        frBusy={frBusy}
        frRegexError={frRegexError}
        frPreview={frPreview}
        onSetFrFind={setFrFind}
        onSetFrReplace={setFrReplace}
        onSetFrIsRegex={setFrIsRegex}
        onSetFrError={setFrError}
        onSetShowFindReplace={setShowFindReplace}
        handleFindReplace={handleFindReplace}
        promoteRows={promoteRows}
        promoteBusy={promoteBusy}
        onSetPromoteRows={setPromoteRows}
        handleConfirmPromote={handleConfirmPromote}
        movingToken={movingToken}
        movingGroup={movingGroup}
        moveTargetSet={moveTargetSet}
        onSetMoveTargetSet={setMoveTargetSet}
        onSetMovingToken={setMovingToken}
        onSetMovingGroup={setMovingGroup}
        handleConfirmMoveToken={handleConfirmMoveToken}
        handleConfirmMoveGroup={handleConfirmMoveGroup}
      />
    </div>
  );
}
