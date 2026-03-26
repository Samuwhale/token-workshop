import { useState, useCallback, useEffect, useRef, useMemo, useLayoutEffect, Fragment } from 'react';
import type { TokenNode } from '../hooks/useTokens';
import { PropertyPicker } from './PropertyPicker';
import { ConfirmModal } from './ConfirmModal';
import { TOKEN_PROPERTY_MAP, TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import type { BindableProperty, NodeCapabilities, SelectionNodeInfo, TokenMapEntry } from '../../shared/types';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';
import type { UndoSlot } from '../hooks/useUndo';
import { QuickStartDialog } from './QuickStartDialog';
import { BatchEditor } from './BatchEditor';
import { TokenCanvas } from './TokenCanvas';
import { TokenGraph } from './TokenGraph';
import { hexToRgb, rgbToLab, colorDeltaE, stableStringify } from '../shared/colorUtils';
import { ValuePreview } from './ValuePreview';
import { ColorPicker } from './ColorPicker';
import type { SortOrder } from './tokenListUtils';
import {
  countTokensInGroup, formatDisplayPath, nodeParentPath, flattenVisible,
  formatValue, pruneDeletedPaths, filterByDuplicatePaths, filterTokenNodes,
  sortTokenNodes, collectGroupPathsByDepth, collectAllGroupPaths, countLeaves,
  flattenLeafNodes, findLeafByPath, collectGroupLeaves, getDefaultValue,
} from './tokenListUtils';

type GeneratorType = 'colorRamp' | 'typeScale' | 'spacingScale' | 'opacityScale' | 'borderRadiusScale' | 'zIndexScale' | 'customScale';

interface TokenGenerator {
  id: string;
  type: GeneratorType;
  name: string;
  sourceToken?: string;
  targetSet: string;
  targetGroup: string;
  config: any;
  createdAt: string;
  updatedAt: string;
}
import type { LintViolation } from '../hooks/useLint';

// ---------------------------------------------------------------------------
// Virtual scroll constants
// ---------------------------------------------------------------------------
const VIRTUAL_ITEM_HEIGHT = 28; // px per row (approximate; overscan compensates for taller rows)
const VIRTUAL_OVERSCAN = 8; // extra rows rendered above and below the viewport

interface TokenListProps {
  tokens: TokenNode[];
  setName: string;
  sets: string[];
  serverUrl: string;
  connected: boolean;
  selectedNodes: SelectionNodeInfo[];
  allTokensFlat: Record<string, TokenMapEntry>;
  onEdit: (path: string) => void;
  onCreateNew?: (initialPath?: string, initialType?: string) => void;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onTokenCreated?: (path: string) => void;
  defaultCreateOpen?: boolean;
  highlightedToken?: string | null;
  onNavigateToAlias?: (path: string) => void;
  onClearHighlight?: () => void;
  lintViolations?: LintViolation[];
  onSyncGroup?: (groupPath: string, tokenCount: number) => void;
  onSyncGroupStyles?: (groupPath: string, tokenCount: number) => void;
  onSetGroupScopes?: (groupPath: string) => void;
  onGenerateScaleFromGroup?: (groupPath: string, tokenType: string | null) => void;
  syncSnapshot?: Record<string, string>;
  generators?: TokenGenerator[];
  onRefreshGenerators?: () => void;
  derivedTokenPaths?: Set<string>;
  showIssuesOnly?: boolean;
  onToggleIssuesOnly?: () => void;
  cascadeDiff?: Record<string, { before: any; after: any }>;
}

type DeleteConfirm =
  | { type: 'token'; path: string }
  | { type: 'group'; path: string; name: string; tokenCount: number }
  | { type: 'bulk'; paths: string[]; orphanCount: number };

// ---------------------------------------------------------------------------
// Color matching helpers for "Promote to Semantic" (US-026)
// ---------------------------------------------------------------------------
// hexToRgb, rgbToLab, colorDeltaE are imported from ../shared/colorUtils

/** Find alias refs in JSON text that don't resolve to any known token path. */
function validateJsonRefs(text: string, allTokensFlat: Record<string, any>): string[] {
  const broken: string[] = [];
  const seen = new Set<string>();
  const re = /"\{([^}]+)\}"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const ref = m[1];
    if (!seen.has(ref) && !(ref in allTokensFlat)) {
      seen.add(ref);
      broken.push(ref);
    }
  }
  return broken;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object' && a !== null && b !== null) {
    return stableStringify(a) === stableStringify(b);
  }
  return false;
}

/** Types that can be edited inline in the list row (without opening the drawer). */
const INLINE_SIMPLE_TYPES = new Set(['color', 'dimension', 'number', 'string', 'boolean', 'fontFamily', 'fontWeight', 'duration', 'asset']);

/** Get a human-editable string representation of a token value for the inline input. */
function getEditableString(type: string | undefined, value: any): string {
  if (value === undefined || value === null) return '';
  if (type === 'dimension' && typeof value === 'object' && value !== null && 'value' in value && 'unit' in value) {
    return `${value.value}${value.unit}`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  return String(value);
}

/** Parse an inline-edited string back to the correct token value shape. */
function parseInlineValue(type: string, str: string): any {
  if (type === 'boolean') return str.trim().toLowerCase() !== 'false';
  if (type === 'number' || type === 'fontWeight' || type === 'duration') {
    const n = parseFloat(str);
    return isNaN(n) ? str : n;
  }
  if (type === 'dimension') {
    const m = str.trim().match(/^(-?\d*\.?\d+)\s*(px|rem|em|%|vw|vh|pt|dp|sp|cm|mm|fr|ch|ex)?$/);
    if (m) return { value: parseFloat(m[1]), unit: m[2] || 'px' };
    return str;
  }
  // color, string, fontFamily: return as-is
  return str;
}

/** Infer token type from a raw value string. Returns null if no pattern matches. */
function inferTypeFromValue(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^#([0-9a-fA-F]{3,8})$/.test(v)) return 'color';
  if (/^(rgb|hsl)a?\s*\(/.test(v)) return 'color';
  if (/^(-?\d+(\.\d+)?)(px|em|rem|%|vh|vw|pt|dp|sp|cm|mm|fr|ch|ex)$/.test(v)) return 'dimension';
  if (/^(-?\d+(\.\d+)?)(ms|s)$/.test(v)) return 'duration';
  if (/^(true|false)$/i.test(v)) return 'boolean';
  if (/^-?\d+(\.\d+)?$/.test(v)) return 'number';
  return null;
}

interface PromoteRow {
  path: string;
  $type: string;
  $value: unknown;
  proposedAlias: string | null;
  deltaE?: number;
  accepted: boolean;
}

export function TokenList({ tokens, setName, sets, serverUrl, connected, selectedNodes, allTokensFlat, onEdit, onCreateNew, onRefresh, onPushUndo, onTokenCreated, defaultCreateOpen, highlightedToken, onNavigateToAlias, onClearHighlight, lintViolations = [], onSyncGroup, onSyncGroupStyles, onSetGroupScopes, syncSnapshot, generators, onRefreshGenerators, derivedTokenPaths, showIssuesOnly, onToggleIssuesOnly, cascadeDiff }: TokenListProps) {
  const [showCreateForm, setShowCreateForm] = useState(defaultCreateOpen ?? false);
  const [newTokenPath, setNewTokenPath] = useState('');
  const [newTokenType, setNewTokenTypeState] = useState(() => {
    try { return sessionStorage.getItem('tm_last_token_type') || 'color'; } catch { return 'color'; }
  });
  const setNewTokenType = (t: string) => {
    setNewTokenTypeState(t);
    try { sessionStorage.setItem('tm_last_token_type', t); } catch {}
  };
  const [newTokenValue, setNewTokenValue] = useState('');
  const [newTokenDescription, setNewTokenDescription] = useState('');
  const [typeAutoInferred, setTypeAutoInferred] = useState(false);
  const [createError, setCreateError] = useState('');
  const [siblingPrefix, setSiblingPrefix] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ type: 'variables' | 'styles'; count: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const [renameTokenConfirm, setRenameTokenConfirm] = useState<{ oldPath: string; newPath: string; depCount: number } | null>(null);
  const [locallyDeletedPaths, setLocallyDeletedPaths] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [dragSource, setDragSource] = useState<{ paths: string[]; names: string[] } | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
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
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const moreFiltersRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const virtualListRef = useRef<HTMLDivElement>(null);
  const [virtualScrollTop, setVirtualScrollTop] = useState(0);

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

    // Don't handle shortcuts when typing in a form field
    if (isTyping) return;

    // n: open create form / drawer
    if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (onCreateNew) { onCreateNew(); } else { setShowCreateForm(true); }
      return;
    }

    // /: focus search input
    if (e.key === '/') {
      e.preventDefault();
      searchRef.current?.focus();
      return;
    }

    // ↑/↓: navigate between visible token rows
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-token-path]'));
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
  }, [showCreateForm, selectMode]);

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
    try {
      const stored = localStorage.getItem(`token-sort:${setName}`) as SortOrder;
      setSortOrderState(stored || 'default');
    } catch {
      setSortOrderState('default');
    }
  }, [setName]);

  const setSortOrder = useCallback((order: SortOrder) => {
    setSortOrderState(order);
    try {
      localStorage.setItem(`token-sort:${setName}`, order);
    } catch {}
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
    try {
      setTypeFilterState(localStorage.getItem(`token-type-filter:${setName}`) || '');
    } catch {
      setTypeFilterState('');
    }
  }, [setName]);

  const setSearchQuery = useCallback((v: string) => {
    setSearchQueryState(v);
    try { sessionStorage.setItem('token-search', v); } catch {}
  }, []);
  const setTypeFilter = useCallback((v: string) => {
    setTypeFilterState(v);
    try { localStorage.setItem(`token-type-filter:${setName}`, v); } catch {}
  }, [setName]);
  const setRefFilter = useCallback((v: 'all' | 'aliases' | 'direct') => {
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

  const filtersActive = searchQuery !== '' || typeFilter !== '' || refFilter !== 'all' || showDuplicates || showIssuesOnly;

  // Compute paths with lint violations for issues-only filter
  const lintPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const v of lintViolations) paths.add(v.path);
    return paths;
  }, [lintViolations]);

  // Compute duplicate value info from all tokens in the current set
  const { duplicateValuePaths, duplicateCounts } = useMemo(() => {
    const valueMap = new Map<string, string[]>(); // serialized value → paths
    const collectLeaves = (nodes: TokenNode[]) => {
      for (const n of nodes) {
        if (!n.isGroup) {
          const key = JSON.stringify(n.$value);
          if (!valueMap.has(key)) valueMap.set(key, []);
          valueMap.get(key)!.push(n.path);
        }
        if (n.children) collectLeaves(n.children);
      }
    };
    collectLeaves(tokens);
    const paths = new Set<string>();
    const counts = new Map<string, number>(); // serialized value → count
    for (const [key, ps] of valueMap) {
      if (ps.length > 1) {
        ps.forEach(p => paths.add(p));
        counts.set(key, ps.length);
      }
    }
    return { duplicateValuePaths: paths, duplicateCounts: counts };
  }, [tokens]);

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
  }, [viewMode, setName, connected, serverUrl]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [tokens]); // eslint-disable-line react-hooks/exhaustive-deps

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
    let result = filtersActive ? filterTokenNodes(sortedTokens, searchQuery, typeFilter, refFilter) : sortedTokens;
    if (showDuplicates) result = filterByDuplicatePaths(result, duplicateValuePaths);
    if (showIssuesOnly && lintPaths.size > 0) result = filterByDuplicatePaths(result, lintPaths);
    if (inspectMode && selectedNodes.length > 0) result = filterByDuplicatePaths(result, boundTokenPaths);
    return result;
  }, [sortedTokens, searchQuery, typeFilter, refFilter, filtersActive, showDuplicates, duplicateValuePaths, showIssuesOnly, lintPaths, inspectMode, selectedNodes.length, boundTokenPaths]);

  // Flat list of visible nodes for virtual scrolling (respects expand/collapse state)
  const flatItems = useMemo(
    () => (viewMode !== 'tree' ? [] : flattenVisible(displayedTokens, expandedPaths)),
    [displayedTokens, expandedPaths, viewMode]
  );

  // Scroll virtual list to bring the highlighted token into view
  useLayoutEffect(() => {
    if (!highlightedToken || viewMode !== 'tree' || !virtualListRef.current) return;
    const idx = flatItems.findIndex(item => item.node.path === highlightedToken);
    if (idx < 0) return;
    const containerH = virtualListRef.current.clientHeight;
    const targetScrollTop = Math.max(0, idx * VIRTUAL_ITEM_HEIGHT - containerH / 2 + VIRTUAL_ITEM_HEIGHT / 2);
    virtualListRef.current.scrollTop = targetScrollTop;
    setVirtualScrollTop(targetScrollTop);
  }, [highlightedToken, flatItems, viewMode]);

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
      const createRes = await fetch(`${serverUrl}/api/tokens/${newPrimitiveSet}/${newPrimitivePath.trim()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $type: extractToken.$type, $value: extractToken.$value }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({})) as { error?: string };
        setExtractError(err.error ?? 'Failed to create primitive token.');
        return;
      }
      await fetch(`${serverUrl}/api/tokens/${setName}/${extractToken.path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $value: `{${newPrimitivePath.trim()}}` }),
      });
    } else {
      if (!existingAlias) { setExtractError('Select an existing token to alias.'); return; }
      await fetch(`${serverUrl}/api/tokens/${setName}/${extractToken.path}`, {
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
  const [moveTargetSet, setMoveTargetSet] = useState('');

  const handleRenameGroup = useCallback(async (oldGroupPath: string, newGroupPath: string) => {
    if (!connected) return;
    await fetch(`${serverUrl}/api/tokens/${setName}/groups/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldGroupPath, newGroupPath }),
    });
    onRefresh();
  }, [connected, serverUrl, setName, onRefresh]);

  const executeTokenRename = useCallback(async (oldPath: string, newPath: string) => {
    if (!connected) return;
    await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/tokens/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath }),
    });
    setRenameTokenConfirm(null);
    onRefresh();
  }, [connected, serverUrl, setName, onRefresh]);

  const handleDropOnGroup = useCallback(async (targetGroupPath: string) => {
    if (!dragSource || !connected) return;
    const source = dragSource;
    setDragSource(null);
    setDragOverGroup(null);
    for (let i = 0; i < source.paths.length; i++) {
      const oldPath = source.paths[i];
      const name = source.names[i];
      const newPath = targetGroupPath ? `${targetGroupPath}.${name}` : name;
      if (newPath === oldPath) continue;
      await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/tokens/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newPath }),
      });
    }
    onRefresh();
  }, [dragSource, connected, serverUrl, setName, onRefresh]);

  const handleRenameToken = useCallback(async (oldPath: string, newPath: string) => {
    if (!connected) return;
    const encodedPath = oldPath.split('.').map(encodeURIComponent).join('/');
    const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/dependents/${encodedPath}`);
    const data = res.ok ? await res.json() as { count: number } : { count: 0 };
    if (data.count > 0) {
      setRenameTokenConfirm({ oldPath, newPath, depCount: data.count });
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
    await fetch(`${serverUrl}/api/tokens/${setName}/groups/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupPath: movingGroup, targetSet: moveTargetSet }),
    });
    setMovingGroup(null);
    onRefresh();
  }, [movingGroup, moveTargetSet, connected, serverUrl, setName, onRefresh]);

  const handleDuplicateGroup = useCallback(async (groupPath: string) => {
    if (!connected) return;
    await fetch(`${serverUrl}/api/tokens/${setName}/groups/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupPath }),
    });
    onRefresh();
  }, [connected, serverUrl, setName, onRefresh]);

  const handleCreateGroup = useCallback(async (parent: string, name: string) => {
    if (!connected || !name.trim()) return;
    const groupPath = parent ? `${parent}.${name.trim()}` : name.trim();
    const res = await fetch(`${serverUrl}/api/tokens/${setName}/groups/create`, {
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
    await fetch(`${serverUrl}/api/tokens/${setName}/${newPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ $type: token.$type, $value: token.$value }),
    });
    onRefresh();
  }, [connected, serverUrl, setName, allTokensFlat, onRefresh]);

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
  }, [connected, serverUrl, setName, allTokensFlat, onRefresh, onPushUndo]);

  const handleCreate = async () => {
    const trimmedPath = newTokenPath.trim();
    if (!trimmedPath) { setCreateError('Token path cannot be empty'); return; }
    if (!connected) return;
    setCreateError('');
    const effectiveSet = setName || 'default';
    try {
      const res = await fetch(`${serverUrl}/api/tokens/${effectiveSet}/${trimmedPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          $type: newTokenType,
          $value: newTokenValue.trim() ? parseInlineValue(newTokenType, newTokenValue.trim()) : getDefaultValue(newTokenType),
          ...(newTokenDescription.trim() ? { $description: newTokenDescription.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateError((data as any).error || `Failed to create token (${res.status})`);
        return;
      }
      const createdPath = trimmedPath;
      const createdType = newTokenType;
      const createdValue = newTokenValue.trim() ? parseInlineValue(newTokenType, newTokenValue.trim()) : getDefaultValue(newTokenType);
      const capturedSet = effectiveSet;
      const capturedUrl = serverUrl;
      setShowCreateForm(false);
      setNewTokenPath('');
      setNewTokenValue('');
      setNewTokenDescription('');
      setSiblingPrefix(null);
      onRefresh();
      onTokenCreated?.(createdPath);
      if (onPushUndo) {
        onPushUndo({
          description: `Create "${createdPath.split('.').pop() ?? createdPath}"`,
          restore: async () => {
            await fetch(`${capturedUrl}/api/tokens/${capturedSet}/${createdPath}`, { method: 'DELETE' });
            onRefresh();
          },
          redo: async () => {
            await fetch(`${capturedUrl}/api/tokens/${capturedSet}/${createdPath}`, {
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
    try {
      const res = await fetch(`${serverUrl}/api/tokens/${effectiveSet}/${trimmedPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          $type: newTokenType,
          $value: newTokenValue.trim() ? parseInlineValue(newTokenType, newTokenValue.trim()) : getDefaultValue(newTokenType),
          ...(newTokenDescription.trim() ? { $description: newTokenDescription.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateError((data as any).error || `Failed to create token (${res.status})`);
        return;
      }
      const createdPath = trimmedPath;
      const createdType = newTokenType;
      const createdValue = newTokenValue.trim() ? parseInlineValue(newTokenType, newTokenValue.trim()) : getDefaultValue(newTokenType);
      const capturedSet = effectiveSet;
      const capturedUrl = serverUrl;
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
      if (onPushUndo) {
        onPushUndo({
          description: `Create "${createdPath.split('.').pop() ?? createdPath}"`,
          restore: async () => {
            await fetch(`${capturedUrl}/api/tokens/${capturedSet}/${createdPath}`, { method: 'DELETE' });
            onRefresh();
          },
          redo: async () => {
            await fetch(`${capturedUrl}/api/tokens/${capturedSet}/${createdPath}`, {
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
    setDeleteConfirm({ type: 'token', path });
  }, [connected]);

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
    try {
      if (deletedType === 'token' || deletedType === 'group') {
        await fetch(`${serverUrl}/api/tokens/${setName}/${deletedPath}`, { method: 'DELETE' });
      } else {
        await Promise.all(
          deletedPaths.map(path =>
            fetch(`${serverUrl}/api/tokens/${setName}/${path}`, { method: 'DELETE' })
          )
        );
        setSelectedPaths(new Set());
        setSelectMode(false);
      }

      // Optimistically remove deleted paths from the tree so empty group headers vanish immediately
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
                fetch(`${capturedUrl}/api/tokens/${capturedSet}/${path}`, {
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

  const displayedLeafPaths = useMemo(
    () => new Set(flattenLeafNodes(displayedTokens).map(n => n.path)),
    [displayedTokens]
  );

  const selectedLeafNodes = useMemo(
    () => flattenLeafNodes(displayedTokens).filter(n => selectedPaths.has(n.path)),
    [displayedTokens, selectedPaths]
  );

  const handleSelectAll = () => {
    const allSelected = [...displayedLeafPaths].every(p => selectedPaths.has(p));
    if (allSelected) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(displayedLeafPaths));
    }
  };

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

  const handleApplyVariables = async () => {
    setApplying(true);
    const flat = resolveFlat(flattenTokens(tokens));
    parent.postMessage({ pluginMessage: { type: 'apply-variables', tokens: flat } }, '*');
    setApplyResult({ type: 'variables', count: flat.length });
    setTimeout(() => setApplying(false), 1500);
    setTimeout(() => setApplyResult(null), 3000);
  };

  const handleApplyStyles = async () => {
    setApplying(true);
    const flat = resolveFlat(flattenTokens(tokens));
    parent.postMessage({ pluginMessage: { type: 'apply-styles', tokens: flat } }, '*');
    setApplyResult({ type: 'styles', count: flat.length });
    setTimeout(() => setApplying(false), 1500);
    setTimeout(() => setApplyResult(null), 3000);
  };

  const frPreview = useMemo(() => {
    if (!frFind) return [];
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
      setFrError(err instanceof Error ? err.message : 'An unexpected error occurred');
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
      return {
        title: `Delete "${name}"?`,
        description: `Token path: ${deleteConfirm.path}`,
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
      const targetScrollTop = Math.max(0, idx * VIRTUAL_ITEM_HEIGHT);
      virtualListRef.current.scrollTop = targetScrollTop;
      setVirtualScrollTop(targetScrollTop);
    }
  }, [flatItems]);

  // Virtual scroll window computation (derived, no memo needed)
  const virtualContainerH = virtualListRef.current?.clientHeight ?? 500;
  const virtualStartIdx = Math.max(0, Math.floor(virtualScrollTop / VIRTUAL_ITEM_HEIGHT) - VIRTUAL_OVERSCAN);
  const virtualEndIdx = Math.min(flatItems.length, Math.ceil((virtualScrollTop + virtualContainerH) / VIRTUAL_ITEM_HEIGHT) + VIRTUAL_OVERSCAN);
  const virtualTopPad = virtualStartIdx * VIRTUAL_ITEM_HEIGHT;
  const virtualBottomPad = Math.max(0, (flatItems.length - virtualEndIdx) * VIRTUAL_ITEM_HEIGHT);

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
            serverUrl={serverUrl}
            connected={connected}
            onApply={onRefresh}
            onPushUndo={onPushUndo}
          />
        )}

        {/* Toolbar: expand/collapse + sort + inspect mode */}
        {tokens.length > 0 && !selectMode && (
          <div className="flex items-center gap-0.5 px-2 py-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            {tokens.some(n => n.isGroup) && (
              <>
                <button
                  onClick={handleExpandAll}
                  className="px-2 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
                >
                  Expand all
                </button>
                <button
                  onClick={handleCollapseAll}
                  className="px-2 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
                >
                  Collapse all
                </button>
                <div className="w-px h-3 bg-[var(--color-figma-border)] mx-0.5 shrink-0" />
              </>
            )}
            <button
              onClick={() => setInspectMode(v => !v)}
              title={inspectMode ? 'Show all tokens' : 'Filter to tokens used by the selected layer'}
              aria-pressed={inspectMode}
              className={`px-2 py-0.5 rounded text-[10px] transition-colors border ${inspectMode ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] font-medium border-[var(--color-figma-accent)]/40' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
            >
              For selection
            </button>
            {(['tree', 'table', 'grid', 'canvas', 'json', 'graph'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={mode === 'tree' ? 'Tree view' : mode === 'table' ? 'Table view' : mode === 'grid' ? 'Grid view — color swatch palette' : mode === 'canvas' ? 'Canvas view — spatial token map' : mode === 'json' ? 'JSON editor — raw DTCG JSON' : 'Graph view — node-based generator editor'}
                aria-pressed={viewMode === mode}
                className={`px-2 py-0.5 rounded text-[10px] transition-colors border capitalize ${viewMode === mode ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] font-medium border-[var(--color-figma-accent)]/40' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
              >
                {mode === 'json' ? '</>' : mode === 'graph' ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <rect x="2" y="9" width="7" height="6" rx="1"/>
                    <rect x="15" y="9" width="7" height="6" rx="1"/>
                    <rect x="8.5" y="7" width="7" height="10" rx="1"/>
                    <path d="M9 12h-1M16 12h-1"/>
                  </svg>
                ) : mode}
              </button>
            ))}
            <div className={`ml-auto flex items-center gap-1 ${sortOrder !== 'default' ? 'text-[var(--color-figma-accent)]' : ''}`}>
              {syncSnapshot && syncChangedCount > 0 && (
                <span
                  title="Tokens edited locally since the last sync"
                  className="flex items-center gap-1 text-[10px] text-orange-500 mr-1"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                  {syncChangedCount} changed since last sync
                </span>
              )}
              {sortOrder !== 'default' && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-figma-accent)] shrink-0" aria-label="Non-default sort active" />
              )}
              <select
                value={sortOrder}
                onChange={e => setSortOrder(e.target.value as SortOrder)}
                aria-label="Sort order"
                className={`text-[10px] bg-transparent border-none outline-none cursor-pointer pr-1 ${sortOrder !== 'default' ? 'text-[var(--color-figma-accent)] font-medium' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
              >
                <option value="default">Default order</option>
                <option value="alpha-asc">A → Z</option>
                <option value="alpha-desc">Z → A</option>
                <option value="by-type">By type</option>
                <option value="by-value">By value</option>
              </select>
            </div>
          </div>
        )}

        {/* Filter bar — hidden in JSON and graph views */}
        {tokens.length > 0 && !selectMode && viewMode !== 'json' && viewMode !== 'graph' && (
          <div className={`flex items-center gap-1 px-2 py-1.5 border-b border-[var(--color-figma-border)] overflow-hidden ${filtersActive ? 'bg-[var(--color-figma-accent)]/20' : 'bg-[var(--color-figma-bg)]'}`}>
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search tokens…"
              className="flex-1 min-w-0 px-2 py-1 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-tertiary)]"
            />
            {/* Type filter — always visible */}
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              title="Filter by type"
              aria-label="Filter by type"
              className={`shrink-0 px-1 py-1 rounded border text-[10px] outline-none cursor-pointer ${typeFilter ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)]'}`}
            >
              <option value="">Type</option>
              {availableTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {/* Ref filter — only when active */}
            {refFilter !== 'all' && (
              <select
                value={refFilter}
                onChange={e => setRefFilter(e.target.value as 'all' | 'aliases' | 'direct')}
                title="Filter by reference"
                className="shrink-0 px-1 py-1 rounded border text-[10px] outline-none cursor-pointer border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10"
              >
                <option value="all">All refs</option>
                <option value="aliases">References only</option>
                <option value="direct">Direct only</option>
              </select>
            )}
            {/* Dup values — only when active */}
            {showDuplicates && (
              <button
                onClick={() => setShowDuplicates(false)}
                title="Clear duplicate filter"
                className="shrink-0 px-1.5 py-1 rounded border text-[10px] whitespace-nowrap transition-colors border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10"
              >
                Dups ✕
              </button>
            )}
            {/* Issues filter — only when active */}
            {showIssuesOnly && (
              <button
                onClick={onToggleIssuesOnly}
                title="Clear issues filter"
                className="shrink-0 px-1.5 py-1 rounded border text-[10px] whitespace-nowrap transition-colors border-red-500 text-red-500 bg-red-500/10"
              >
                Issues{lintViolations.length > 0 ? ` (${lintViolations.length})` : ''} ✕
              </button>
            )}
            {/* More filters button — expands other filters */}
            {(refFilter === 'all' || !showDuplicates) && (
              <div className="relative shrink-0" ref={moreFiltersRef}>
                <button
                  title="More filters"
                  aria-label="More filters"
                  aria-haspopup="menu"
                  aria-expanded={moreFiltersOpen}
                  onClick={() => setMoreFiltersOpen(v => !v)}
                  className="flex items-center justify-center w-6 h-6 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
                    <path d="M1 2h8M2.5 5h5M4 8h2"/>
                  </svg>
                </button>
                {moreFiltersOpen && (
                  <div role="menu" className="absolute right-0 top-full mt-0.5 z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg flex flex-col py-1 min-w-[140px]">
                    {refFilter === 'all' && (
                      <>
                        <button role="menuitem" onClick={() => { setRefFilter('aliases'); setMoreFiltersOpen(false); }} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">References only</button>
                        <button role="menuitem" onClick={() => { setRefFilter('direct'); setMoreFiltersOpen(false); }} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">Direct values only</button>
                      </>
                    )}
                    {!showDuplicates && (
                      <button role="menuitem" onClick={() => { setShowDuplicates(true); setMoreFiltersOpen(false); }} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">Show duplicates</button>
                    )}
                  </div>
                )}
              </div>
            )}
            {filtersActive && (
              <button
                onClick={clearFilters}
                title="Clear all filters"
                className="flex items-center justify-center w-5 h-5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] shrink-0"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
                  <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Lint legend — shown when any violations exist so users know the badges are clickable */}
        {lintViolations.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[9px] text-[var(--color-figma-text-secondary)]">
            <span>Lint:</span>
            <span className="flex items-center gap-0.5">
              <span className="px-1 py-0.5 rounded border border-[var(--color-figma-error)] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 text-[8px]">✕</span>
              <span>error</span>
            </span>
            <span>·</span>
            <span className="flex items-center gap-0.5">
              <span className="px-1 py-0.5 rounded border border-yellow-500 text-yellow-700 bg-yellow-50 text-[8px]">⚠</span>
              <span>warning</span>
            </span>
            <span>·</span>
            <span className="flex items-center gap-0.5">
              <span className="px-1 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[8px]">ℹ</span>
              <span>info</span>
            </span>
            <span className="ml-1 opacity-60">— click to fix</span>
          </div>
        )}
      </div>
      {/* Scrollable token content with virtual scroll */}
      <div
        ref={virtualListRef}
        className="flex-1 overflow-y-auto"
        onScroll={e => setVirtualScrollTop(e.currentTarget.scrollTop)}
      >
        {inspectMode && selectedNodes.length === 0 ? (
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
                  setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
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
                <div className="text-[10px] text-orange-500 flex flex-wrap gap-1 items-center">
                  <span className="font-medium shrink-0">Broken refs:</span>
                  {jsonBrokenRefs.map(r => (
                    <span key={r} className="font-mono bg-orange-500/10 rounded px-1">{'{' + r + '}'}</span>
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
            const leaves = flattenLeafNodes(displayedTokens);
            const colorLeaves = leaves.filter(l => l.$type === 'color');
            if (colorLeaves.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-12 text-[var(--color-figma-text-secondary)]">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="2" width="20" height="20" rx="3" />
                    <circle cx="12" cy="12" r="4" />
                    <path d="M2 12h4M18 12h4M12 2v4M12 18v4" />
                  </svg>
                  <p className="mt-2 text-[11px] font-medium">No color tokens to display</p>
                  <p className="text-[10px] mt-0.5">Grid view shows color tokens as swatches</p>
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
                            onClick={() => onEdit(leaf.path)}
                            title={`${formatDisplayPath(leaf.path, leaf.name)}\n${colorStr}`}
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
          /* Table view */
          <div className="overflow-auto flex-1">
            <table className="w-full text-[10px] border-collapse">
              <thead className="sticky top-0 bg-[var(--color-figma-bg-secondary)] z-10">
                <tr className="border-b border-[var(--color-figma-border)]">
                  <th className="px-2 py-1.5 text-left font-medium text-[var(--color-figma-text-secondary)] w-[40%]">Name</th>
                  <th className="px-2 py-1.5 text-left font-medium text-[var(--color-figma-text-secondary)] w-[15%]">Type</th>
                  <th className="px-2 py-1.5 text-left font-medium text-[var(--color-figma-text-secondary)] w-[30%]">Value</th>
                  <th className="px-2 py-1.5 text-left font-medium text-[var(--color-figma-text-secondary)]">
                    <button
                      onClick={() => setShowScopesCol(v => !v)}
                      className={`flex items-center gap-1 transition-colors ${showScopesCol ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
                      title="Toggle Scopes column"
                    >
                      Scopes
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 8 8"
                        className={`transition-transform shrink-0 ${showScopesCol ? 'rotate-90' : ''}`}
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M2 1l4 3-4 3V1z" />
                      </svg>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {flattenLeafNodes(displayedTokens).map(leaf => {
                  const leafScopes = Array.isArray(leaf.$extensions?.['com.figma.scopes'])
                    ? (leaf.$extensions!['com.figma.scopes'] as string[])
                    : [];
                  return (
                    <tr
                      key={leaf.path}
                      className="border-b border-[var(--color-figma-border)]/50 hover:bg-[var(--color-figma-bg-hover)] cursor-pointer"
                      onClick={() => onEdit(leaf.path)}
                    >
                      <td className="px-2 py-1.5 font-mono text-[var(--color-figma-text)] truncate max-w-0" title={leaf.path}>{leaf.path}</td>
                      <td className="px-2 py-1.5">
                        <span className={`px-1 py-0.5 rounded text-[8px] font-medium ${TOKEN_TYPE_BADGE_CLASS[leaf.$type ?? ''] ?? 'token-type-string'}`}>{leaf.$type}</span>
                      </td>
                      <td className="px-2 py-1.5 text-[var(--color-figma-text-secondary)] truncate max-w-0 font-mono" title={String(leaf.$value)}>
                        {typeof leaf.$value === 'object' ? JSON.stringify(leaf.$value) : String(leaf.$value ?? '')}
                      </td>
                      {showScopesCol && (
                        <td className="px-2 py-1.5">
                          {leafScopes.length > 0 ? (
                            <div className="flex flex-wrap gap-0.5">
                              {leafScopes.map(s => (
                                <span key={s} className="px-1 py-0.5 rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] text-[8px]">{s}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[var(--color-figma-text-secondary)]">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : displayedTokens.length === 0 && filtersActive ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--color-figma-text-secondary)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              <path d="M8 11h6M11 8v6" />
            </svg>
            <p className="mt-2 text-[11px] font-medium">No tokens match your filters</p>
            <button
              onClick={clearFilters}
              className="mt-2 px-3 py-1 rounded text-[10px] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20 transition-colors"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="py-1">
            <div style={{ height: virtualTopPad }} aria-hidden="true" />
            {flatItems.slice(virtualStartIdx, virtualEndIdx).map(({ node, depth }) => (
              <TokenTreeNode
                key={node.path}
                node={node}
                depth={depth}
                skipChildren
                onEdit={onEdit}
                onDelete={requestDeleteToken}
                onDeleteGroup={requestDeleteGroup}
                setName={setName}
                selectionCapabilities={selectionCapabilities}
                allTokensFlat={allTokensFlat}
                selectMode={selectMode}
                isSelected={node.isGroup ? false : selectedPaths.has(node.path)}
                onToggleSelect={toggleSelect}
                expandedPaths={expandedPaths}
                onToggleExpand={handleToggleExpand}
                duplicateCounts={duplicateCounts}
                highlightedToken={highlightedToken ?? null}
                onNavigateToAlias={onNavigateToAlias}
                onCreateSibling={handleOpenCreateSibling}
                onCreateGroup={(parentPath) => setNewGroupDialogParent(parentPath)}
                onRenameGroup={handleRenameGroup}
                onRequestMoveGroup={handleRequestMoveGroup}
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
                onDragEnd={() => { setDragSource(null); setDragOverGroup(null); }}
                onDragOverGroup={setDragOverGroup}
                onDropOnGroup={handleDropOnGroup}
                dragOverGroup={dragOverGroup}
                selectedLeafNodes={selectedLeafNodes}
              />
            ))}
            <div style={{ height: virtualBottomPad }} aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
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

      {/* Bottom actions */}
      <div className="p-2 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col gap-1.5">
        {viewMode === 'tree' && !showCreateForm && (
          <div className="flex gap-1.5">
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
            <button
              onClick={() => setShowScaffold(true)}
              disabled={!connected}
              className="px-2.5 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[10px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
              title="Generate tokens from a preset scaffold"
            >
              Use preset
            </button>
            {!selectMode && tokens.length > 0 && (
              <>
                <button
                  onClick={() => setSelectMode(true)}
                  className="px-2.5 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[10px] hover:bg-[var(--color-figma-bg-hover)]"
                  title="Select tokens for bulk actions"
                >
                  Multi-select
                </button>
                <button
                  onClick={() => setShowFindReplace(true)}
                  disabled={!connected}
                  className="px-2.5 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[10px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                  title="Find & replace token names"
                >
                  Find &amp; Replace
                </button>
              </>
            )}
          </div>
        )}
        <div className="flex gap-1.5">
          <button
            onClick={handleApplyVariables}
            disabled={applying || tokens.length === 0}
            title="Publish tokens as Figma Variables (supports modes and theming)"
            className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
          >
            Apply as Variables
          </button>
          <button
            onClick={handleApplyStyles}
            disabled={applying || tokens.length === 0}
            title="Publish tokens as Figma Styles (color, text, and effect styles)"
            className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
          >
            Apply as Styles
          </button>
        </div>
        {applyResult && (
          <div className="text-[10px] text-[var(--color-figma-accent)] text-center">
            Applied {applyResult.count} {applyResult.type === 'variables' ? 'variables' : 'styles'}
          </div>
        )}
      </div>

      {/* Quick Start Dialog */}
      {showScaffold && (
        <QuickStartDialog
          serverUrl={serverUrl}
          activeSet={setName}
          allSets={sets}
          onClose={() => setShowScaffold(false)}
          onConfirm={() => { setShowScaffold(false); onRefresh(); }}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && modalProps && (
        <ConfirmModal
          title={modalProps.title}
          description={modalProps.description}
          confirmLabel={modalProps.confirmLabel}
          danger
          onConfirm={executeDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* New group dialog */}
      {newGroupDialogParent !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-64 p-4 flex flex-col gap-3">
            <div className="text-[12px] font-medium text-[var(--color-figma-text)]">New group</div>
            {newGroupDialogParent && (
              <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                Inside <span className="font-mono text-[var(--color-figma-text)]">{newGroupDialogParent}</span>
              </div>
            )}
            <input
              type="text"
              placeholder={newGroupDialogParent ? 'subgroup-name' : 'group-name'}
              value={newGroupName}
              onChange={e => { setNewGroupName(e.target.value); setNewGroupError(''); }}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateGroup(newGroupDialogParent ?? '', newGroupName);
                if (e.key === 'Escape') { setNewGroupDialogParent(null); setNewGroupName(''); setNewGroupError(''); }
              }}
              className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] ${newGroupError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
              autoFocus
            />
            {newGroupError && <p className="text-[10px] text-[var(--color-figma-error)]">{newGroupError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setNewGroupDialogParent(null); setNewGroupName(''); setNewGroupError(''); }}
                className="px-3 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={() => handleCreateGroup(newGroupDialogParent ?? '', newGroupName)}
                disabled={!newGroupName.trim()}
                className="px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename token confirmation modal */}
      {renameTokenConfirm && (
        <ConfirmModal
          title={`Rename "${renameTokenConfirm.oldPath.split('.').pop()}"?`}
          description={`${renameTokenConfirm.depCount} token${renameTokenConfirm.depCount !== 1 ? 's' : ''} reference this token. All references will be updated to "${renameTokenConfirm.newPath}".`}
          confirmLabel="Rename and update references"
          onConfirm={() => executeTokenRename(renameTokenConfirm.oldPath, renameTokenConfirm.newPath)}
          onCancel={() => setRenameTokenConfirm(null)}
        />
      )}

      {/* Extract to reference modal */}
      {extractToken && (() => {
        const candidateTokens = Object.entries(allTokensFlat)
          .filter(([path, t]) => path !== extractToken.path && t.$type === extractToken.$type && !isAlias(t.$value))
          .filter(([path]) => !existingAliasSearch || path.toLowerCase().includes(existingAliasSearch.toLowerCase()))
          .slice(0, 40);
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-72 flex flex-col" style={{ maxHeight: '80vh' }}>
              <div className="p-4 border-b border-[var(--color-figma-border)]">
                <div className="text-[12px] font-medium text-[var(--color-figma-text)]">Link to token</div>
                <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5 truncate">
                  <span className="font-mono text-[var(--color-figma-text)]">{extractToken.path}</span>
                </div>
              </div>

              {/* Mode tabs */}
              <div className="flex border-b border-[var(--color-figma-border)]">
                <button
                  onClick={() => setExtractMode('new')}
                  className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${extractMode === 'new' ? 'text-[var(--color-figma-accent)] border-b-2 border-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
                >
                  Create new primitive
                </button>
                <button
                  onClick={() => setExtractMode('existing')}
                  className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${extractMode === 'existing' ? 'text-[var(--color-figma-accent)] border-b-2 border-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'}`}
                >
                  Use existing token
                </button>
              </div>

              <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1">
                {extractMode === 'new' ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-[var(--color-figma-text-secondary)]">New primitive path</label>
                      <input
                        type="text"
                        value={newPrimitivePath}
                        onChange={e => { setNewPrimitivePath(e.target.value); setExtractError(''); }}
                        className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] font-mono"
                        autoFocus
                        placeholder="e.g. primitives.color.blue-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Create in set</label>
                      <select
                        value={newPrimitiveSet}
                        onChange={e => setNewPrimitiveSet(e.target.value)}
                        className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
                      >
                        {sets.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      value={existingAliasSearch}
                      onChange={e => setExistingAliasSearch(e.target.value)}
                      placeholder="Search tokens…"
                      className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)]"
                      autoFocus
                    />
                    <div className="flex flex-col gap-0.5 overflow-y-auto" style={{ maxHeight: '160px' }}>
                      {candidateTokens.length === 0 ? (
                        <div className="text-[10px] text-[var(--color-figma-text-secondary)] py-2 text-center">
                          No matching {extractToken.$type} tokens found
                        </div>
                      ) : candidateTokens.map(([path, t]) => (
                        <button
                          key={path}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => { setExistingAlias(path); setExtractError(''); }}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${existingAlias === path ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]' : 'hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)]'}`}
                        >
                          <ValuePreview type={t.$type} value={t.$value} />
                          <span className="text-[10px] font-mono flex-1 truncate">{path}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {extractError && (
                  <div className="text-[10px] text-[var(--color-figma-error)]">{extractError}</div>
                )}
              </div>

              <div className="flex gap-2 justify-end p-4 border-t border-[var(--color-figma-border)]">
                <button
                  onClick={() => setExtractToken(null)}
                  className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmExtractToAlias}
                  className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
                  disabled={extractMode === 'existing' && !existingAlias}
                >
                  Extract
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Find & Replace modal */}
      {showFindReplace && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-80 flex flex-col" style={{ maxHeight: '80vh' }}>
            <div className="p-4 border-b border-[var(--color-figma-border)]">
              <div className="text-[12px] font-medium text-[var(--color-figma-text)]">Find &amp; Replace Token Names</div>
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">Replace path segments across all tokens in <span className="font-mono text-[var(--color-figma-text)]">{setName}</span></div>
            </div>
            <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Find</label>
                <input
                  type="text"
                  value={frFind}
                  onChange={e => { setFrFind(e.target.value); setFrError(''); }}
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono outline-none focus:border-[var(--color-figma-accent)]"
                  autoFocus
                  placeholder={frIsRegex ? 'e.g. ^colors\\.' : 'e.g. colors'}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Replace with</label>
                <input
                  type="text"
                  value={frReplace}
                  onChange={e => setFrReplace(e.target.value)}
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono outline-none focus:border-[var(--color-figma-accent)]"
                  placeholder={frIsRegex ? 'e.g. palette.' : 'e.g. palette'}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={frIsRegex}
                  onChange={e => { setFrIsRegex(e.target.checked); setFrError(''); }}
                  className="accent-[var(--color-figma-accent)]"
                />
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Use regex</span>
              </label>

              {/* Preview */}
              {frFind && frPreview.length === 0 && (
                <div className="text-[10px] text-[var(--color-figma-text-secondary)] italic">No token paths match.</div>
              )}
              {frPreview.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  <div className="text-[10px] text-[var(--color-figma-text-secondary)] mb-1">{frPreview.length} token{frPreview.length !== 1 ? 's' : ''} will change:</div>
                  <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: '200px' }}>
                    {frPreview.map(({ oldPath, newPath, conflict }) => {
                      // Locate the matched segment in oldPath for highlighting
                      let matchStart = -1, matchLen = 0;
                      if (frIsRegex) {
                        try {
                          const m = new RegExp(frFind).exec(oldPath);
                          if (m) { matchStart = m.index; matchLen = m[0].length; }
                        } catch {}
                      } else {
                        const idx = oldPath.indexOf(frFind);
                        if (idx >= 0) { matchStart = idx; matchLen = frFind.length; }
                      }
                      const hi = matchStart >= 0;
                      // For non-regex, also locate frReplace in newPath for green highlight
                      const newIdx = (!frIsRegex && hi && frReplace !== '') ? newPath.indexOf(frReplace, matchStart) : -1;
                      return (
                        <div key={oldPath} className={`text-[10px] font-mono rounded px-2 py-1 ${conflict ? 'bg-red-50 border border-red-300 text-red-700' : 'bg-[var(--color-figma-bg-secondary)]'}`}>
                          <div className="truncate text-[var(--color-figma-text-secondary)] line-through">
                            {hi
                              ? <>{oldPath.slice(0, matchStart)}<span className="bg-red-100/80 rounded-sm">{oldPath.slice(matchStart, matchStart + matchLen)}</span>{oldPath.slice(matchStart + matchLen)}</>
                              : oldPath}
                          </div>
                          <div className="truncate text-[var(--color-figma-text)]">
                            {newIdx >= 0
                              ? <>{newPath.slice(0, newIdx)}<span className="bg-green-100/80 rounded-sm">{frReplace}</span>{newPath.slice(newIdx + frReplace.length)}</>
                              : newPath}
                          </div>
                          {conflict && <div className="text-[9px] text-red-600 mt-0.5">⚠ conflicts with existing token — will be skipped</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {frError && <div className="text-[10px] text-[var(--color-figma-error)]">{frError}</div>}
              {!frError && frReplace === '' && frPreview.length > 0 && (
                <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  ⚠ Empty replacement will delete the matched segment from token paths. This may break references.
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end p-4 border-t border-[var(--color-figma-border)]">
              <button
                onClick={() => { setShowFindReplace(false); setFrFind(''); setFrReplace(''); setFrIsRegex(false); setFrError(''); }}
                className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFindReplace}
                disabled={!frFind || frBusy || frPreview.length === 0 || frPreview.every(r => r.conflict)}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
              >
                {frBusy ? 'Renaming…' : `Rename ${frPreview.filter(r => !r.conflict).length}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Promote to Semantic (Convert to Aliases) modal */}
      {promoteRows !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-96 flex flex-col" style={{ maxHeight: '80vh' }}>
            <div className="p-4 border-b border-[var(--color-figma-border)]">
              <div className="text-[12px] font-medium text-[var(--color-figma-text)]">Link to tokens</div>
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">Each token will be replaced with a reference to the matched primitive.</div>
            </div>
            <div className="flex flex-col gap-0 overflow-y-auto flex-1">
              {promoteRows.length === 0 && (
                <div className="p-4 text-[11px] text-[var(--color-figma-text-secondary)] italic">No raw-value tokens selected.</div>
              )}
              {promoteRows.map((row, idx) => (
                <div key={row.path} className={`flex items-start gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] ${!row.proposedAlias ? 'opacity-50' : ''}`}>
                  <input
                    type="checkbox"
                    checked={row.accepted && row.proposedAlias !== null}
                    disabled={row.proposedAlias === null}
                    onChange={e => setPromoteRows(prev => prev && prev.map((r, i) => i === idx ? { ...r, accepted: e.target.checked } : r))}
                    className="mt-0.5 accent-[var(--color-figma-accent)] shrink-0"
                  />
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <ValuePreview type={row.$type} value={row.$value} />
                      <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate">{row.path}</span>
                    </div>
                    {row.proposedAlias ? (
                      <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                        → <span className="font-mono text-[var(--color-figma-accent)]">{`{${row.proposedAlias}}`}</span>
                        {row.$type === 'color' && row.deltaE !== undefined && (
                          <span
                            className="ml-1 text-[9px] opacity-60"
                            title={`ΔE=${row.deltaE.toFixed(2)} — color difference score (lower is better)`}
                          >
                            {row.deltaE < 1 ? 'Exact' : row.deltaE < 5 ? 'Close' : 'Approximate'}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] text-[var(--color-figma-text-secondary)] italic">No matching primitive found</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end p-4 border-t border-[var(--color-figma-border)]">
              <button
                onClick={() => setPromoteRows(null)}
                className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPromote}
                disabled={promoteBusy || promoteRows.every(r => !r.accepted || !r.proposedAlias)}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
              >
                {promoteBusy ? 'Converting…' : `Convert ${promoteRows.filter(r => r.accepted && r.proposedAlias).length}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move group to set modal */}
      {movingGroup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-64 p-4 flex flex-col gap-3">
            <div className="text-[12px] font-medium text-[var(--color-figma-text)]">Move group to set</div>
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] truncate">
              <span className="font-mono text-[var(--color-figma-text)]">{movingGroup}</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Destination set</label>
              <select
                value={moveTargetSet}
                onChange={e => setMoveTargetSet(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
              >
                {sets.filter(s => s !== setName).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setMovingGroup(null)}
                className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmMoveGroup}
                disabled={!moveTargetSet}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TokenTreeNode({
  node,
  depth,
  onEdit,
  onDelete,
  onDeleteGroup,
  setName,
  selectionCapabilities,
  allTokensFlat,
  selectMode,
  isSelected,
  onToggleSelect,
  expandedPaths,
  onToggleExpand,
  duplicateCounts,
  highlightedToken,
  onNavigateToAlias,
  onCreateSibling,
  onCreateGroup,
  onRenameGroup,
  onRequestMoveGroup,
  onDuplicateGroup,
  onDuplicateToken,
  onExtractToAlias,
  inspectMode,
  onHoverToken,
  lintViolations = [],
  onExtractToAliasForLint,
  onSyncGroup,
  onSyncGroupStyles,
  onSetGroupScopes,
  onGenerateScaleFromGroup,
  syncSnapshot,
  cascadeDiff,
  onFilterByType,
  generatorsBySource,
  derivedTokenPaths,
  skipChildren,
  onJumpToGroup,
  onInlineSave,
  onRenameToken,
  onDragStart,
  onDragEnd,
  onDragOverGroup,
  onDropOnGroup,
  dragOverGroup,
  selectedLeafNodes,
}: {
  node: TokenNode;
  depth: number;
  onEdit: (path: string) => void;
  onDelete: (path: string) => void;
  onDeleteGroup: (path: string, name: string, tokenCount: number) => void;
  setName: string;
  selectionCapabilities: NodeCapabilities | null;
  allTokensFlat: Record<string, TokenMapEntry>;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (path: string) => void;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  duplicateCounts: Map<string, number>;
  highlightedToken: string | null;
  onNavigateToAlias?: (path: string) => void;
  onCreateSibling?: (groupPath: string, tokenType: string) => void;
  onCreateGroup?: (parentGroupPath: string) => void;
  onRenameGroup?: (oldGroupPath: string, newGroupPath: string) => void;
  onRequestMoveGroup?: (groupPath: string) => void;
  onDuplicateGroup?: (groupPath: string) => void;
  onDuplicateToken?: (path: string) => void;
  onExtractToAlias?: (path: string, $type?: string, $value?: any) => void;
  inspectMode?: boolean;
  onHoverToken?: (path: string) => void;
  lintViolations?: LintViolation[];
  onExtractToAliasForLint?: (path: string, $type?: string, $value?: any) => void;
  onSyncGroup?: (groupPath: string, tokenCount: number) => void;
  onSyncGroupStyles?: (groupPath: string, tokenCount: number) => void;
  onSetGroupScopes?: (groupPath: string) => void;
  onGenerateScaleFromGroup?: (groupPath: string, tokenType: string | null) => void;
  syncSnapshot?: Record<string, string>;
  cascadeDiff?: Record<string, { before: any; after: any }>;
  onFilterByType?: (type: string) => void;
  generatorsBySource?: Map<string, TokenGenerator[]>;
  derivedTokenPaths?: Set<string>;
  /** When true, skip recursive children rendering (used by the virtual scroll flat list). */
  skipChildren?: boolean;
  /** Callback to scroll the virtual list to a group header by path. */
  onJumpToGroup?: (path: string) => void;
  /** Inline quick-save: called when the user edits a simple value directly in the list. */
  onInlineSave?: (path: string, type: string, newValue: any) => void;
  /** Rename a leaf token and update all alias references. */
  onRenameToken?: (oldPath: string, newPath: string) => void;
  onDragStart?: (paths: string[], names: string[]) => void;
  onDragEnd?: () => void;
  onDragOverGroup?: (groupPath: string | null) => void;
  onDropOnGroup?: (groupPath: string) => void;
  dragOverGroup?: string | null;
  selectedLeafNodes?: TokenNode[];
}) {
  const isExpanded = expandedPaths.has(node.path);
  const isHighlighted = highlightedToken === node.path;
  const [hovered, setHovered] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ top: number; left: number } | undefined>();
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [pendingColor, setPendingColor] = useState('');
  const [copiedWhat, setCopiedWhat] = useState<'path' | 'value' | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [chainExpanded, setChainExpanded] = useState(false);
  const [inlineEditActive, setInlineEditActive] = useState(false);
  const [inlineEditValue, setInlineEditValue] = useState('');
  const inlineEditEscapedRef = useRef(false);
  const nodeRef = useRef<HTMLDivElement>(null);

  // Group-specific state
  const [groupMenuPos, setGroupMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [renamingGroup, setRenamingGroup] = useState(false);
  const [renameGroupVal, setRenameGroupVal] = useState('');
  const renameGroupInputRef = useRef<HTMLInputElement>(null);
  const renameGroupEscapedRef = useRef(false);

  // Token rename state
  const [renamingToken, setRenamingToken] = useState(false);
  const [renameTokenVal, setRenameTokenVal] = useState('');
  const renameTokenInputRef = useRef<HTMLInputElement>(null);
  const renameTokenEscapedRef = useRef(false);

  useLayoutEffect(() => {
    if (renamingGroup && renameGroupInputRef.current) {
      renameGroupInputRef.current.focus();
      renameGroupInputRef.current.select();
    }
  }, [renamingGroup]);

  useLayoutEffect(() => {
    if (renamingToken && renameTokenInputRef.current) {
      renameTokenInputRef.current.focus();
      renameTokenInputRef.current.select();
    }
  }, [renamingToken]);

  useEffect(() => {
    if (!groupMenuPos) return;
    const close = () => setGroupMenuPos(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [groupMenuPos]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenuPos) return;
    const close = () => setContextMenuPos(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenuPos]);

  // Scroll highlighted token into view (only when NOT in virtual scroll mode)
  useEffect(() => {
    if (isHighlighted && nodeRef.current && !skipChildren) {
      nodeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isHighlighted, skipChildren]);

  const resolveResult = isAlias(node.$value)
    ? resolveTokenValue(node.$value, node.$type || 'unknown', allTokensFlat)
    : null;
  const displayValue = resolveResult ? (resolveResult.value ?? node.$value) : node.$value;
  // chain.length is the number of alias hops (e.g. chain=['B','C'] = A→B→C→value = 3 hops)
  const aliasChain = resolveResult?.chain ?? [];
  const showChainBadge = aliasChain.length >= 2;
  const isBrokenAlias = isAlias(node.$value) && !!resolveResult?.error;

  // Full resolution chain label for alias hover tooltip
  const aliasChainLabel = isAlias(node.$value) && !isBrokenAlias
    ? [node.path, ...aliasChain, formatValue(node.$type, displayValue)].join(' → ')
    : null;

  // Inline quick-edit eligibility
  const canInlineEdit = !node.isGroup && !isAlias(node.$value) && !!node.$type
    && INLINE_SIMPLE_TYPES.has(node.$type) && !!onInlineSave;

  const handleInlineSubmit = useCallback(() => {
    if (!inlineEditActive) return;
    setInlineEditActive(false);
    const raw = inlineEditValue.trim();
    if (!raw || raw === getEditableString(node.$type, node.$value)) return;
    onInlineSave?.(node.path, node.$type!, parseInlineValue(node.$type!, raw));
  }, [inlineEditActive, inlineEditValue, node, onInlineSave]);

  // Sync state indicator
  const syncChanged = !node.isGroup && syncSnapshot && node.path in syncSnapshot
    && syncSnapshot[node.path] !== stableStringify(node.$value);

  // Cascade diff: token resolves to a different value under the proposed set order
  const cascadeChange = !node.isGroup ? cascadeDiff?.[node.path] : undefined;

  const handleCopyPath = () => {
    const cssVar = '--' + node.path.replace(/\./g, '-');
    navigator.clipboard.writeText(cssVar).catch(() => {});
    setCopiedWhat('path');
    setTimeout(() => setCopiedWhat(null), 1500);
  };

  const handleCopyValue = () => {
    const val = typeof displayValue === 'string' ? displayValue : JSON.stringify(displayValue);
    navigator.clipboard.writeText(val).catch(() => {});
    setCopiedWhat('value');
    setTimeout(() => setCopiedWhat(null), 1500);
  };

  const handleAliasClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAlias(node.$value) || isBrokenAlias) return;
    const aliasPath = (node.$value as string).slice(1, -1);
    onNavigateToAlias?.(aliasPath);
  };

  const applyWithProperty = (property: BindableProperty) => {
    const resolved = resolveTokenValue(node.$value, node.$type || 'unknown', allTokensFlat);
    if (resolved.error) {
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Cannot apply: ${resolved.error}` } }, '*');
      return;
    }
    parent.postMessage({
      pluginMessage: {
        type: 'apply-to-selection',
        tokenPath: node.path,
        tokenType: resolved.$type,
        targetProperty: property,
        resolvedValue: resolved.value,
      },
    }, '*');
    setShowPicker(false);
  };

  const handleApplyToSelection = (e: React.MouseEvent) => {
    if (!node.$type) return;

    // Composition tokens apply all their properties at once
    if (node.$type === 'composition') {
      const rawVal = isAlias(node.$value)
        ? resolveTokenValue(node.$value, 'composition', allTokensFlat).value
        : node.$value;
      const compObj = typeof rawVal === 'object' && rawVal !== null ? rawVal : {};
      // Resolve each property value so the controller receives raw values, not references
      const resolvedComp: Record<string, any> = {};
      for (const [prop, propVal] of Object.entries(compObj)) {
        if (isAlias(propVal)) {
          const r = resolveTokenValue(propVal as string, 'unknown', allTokensFlat);
          resolvedComp[prop] = r.error ? propVal : r.value;
        } else {
          resolvedComp[prop] = propVal;
        }
      }
      parent.postMessage({
        pluginMessage: {
          type: 'apply-to-selection',
          tokenPath: node.path,
          tokenType: 'composition',
          targetProperty: 'composition',
          resolvedValue: resolvedComp,
        },
      }, '*');
      return;
    }

    const validProps = TOKEN_PROPERTY_MAP[node.$type];
    if (!validProps || validProps.length === 0) return;

    if (validProps.length === 1) {
      applyWithProperty(validProps[0]);
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPickerAnchor({ top: rect.bottom + 2, left: rect.left });
      setShowPicker(true);
    }
  };

  const confirmTokenRename = () => {
    const newName = renameTokenVal.trim();
    setRenamingToken(false);
    if (!newName || newName === node.name) return;
    const parentPath = nodeParentPath(node.path, node.name);
    const newPath = parentPath ? `${parentPath}.${newName}` : newName;
    onRenameToken?.(node.path, newPath);
  };

  if (node.isGroup) {
    const leafCount = countLeaves(node);

    const confirmGroupRename = () => {
      const newName = renameGroupVal.trim();
      setRenamingGroup(false);
      if (!newName || newName === node.name) return;
      const parentPath = nodeParentPath(node.path, node.name);
      const newGroupPath = parentPath ? `${parentPath}.${newName}` : newName;
      onRenameGroup?.(node.path, newGroupPath);
    };

    return (
      <div>
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          aria-label={`Toggle group ${node.name}`}
          data-group-path={node.path}
          className={`flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-[var(--color-figma-bg-hover)] transition-colors group/group bg-[var(--color-figma-bg)] ${dragOverGroup === node.path ? 'ring-1 ring-inset ring-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => !renamingGroup && onToggleExpand(node.path)}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('application/x-token-drag')) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            onDragOverGroup?.(node.path);
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
          onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === ' ') && !renamingGroup) {
              e.preventDefault();
              onToggleExpand(node.path);
            }
          }}
          onContextMenu={e => {
            if (selectMode) return;
            e.preventDefault();
            setGroupMenuPos({
              x: Math.min(e.clientX, window.innerWidth - 168),
              y: Math.min(e.clientY, window.innerHeight - 220),
            });
          }}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            className={`transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
          {renamingGroup ? (
            <input
              ref={renameGroupInputRef}
              value={renameGroupVal}
              onChange={e => setRenameGroupVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') confirmGroupRename();
                if (e.key === 'Escape') { renameGroupEscapedRef.current = true; setRenamingGroup(false); }
              }}
              onBlur={() => {
                if (!renameGroupEscapedRef.current) confirmGroupRename();
                renameGroupEscapedRef.current = false;
              }}
              onClick={e => e.stopPropagation()}
              className="flex-1 text-[11px] font-medium bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[var(--color-figma-text)] rounded px-1 outline-none min-w-0"
            />
          ) : (
            <span className="text-[11px] font-medium text-[var(--color-figma-text)] flex-1">{node.name}</span>
          )}
          {!renamingGroup && node.children && (
            <span className={`text-[9px] ml-1 shrink-0 ${leafCount === 0 ? 'text-[var(--color-figma-text-secondary)] opacity-50 italic' : 'text-[var(--color-figma-text-secondary)]'}`}>
              {leafCount === 0 ? 'empty' : `(${leafCount})`}
            </span>
          )}
          {!selectMode && !renamingGroup && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateSibling?.(node.path, 'color');
                }}
                title="Add token to group"
                className="opacity-0 group-hover/group:opacity-100 p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] transition-opacity shrink-0"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setGroupMenuPos({
                    x: Math.min(rect.left, window.innerWidth - 168),
                    y: Math.min(rect.bottom + 2, window.innerHeight - 220),
                  });
                }}
                title="Group actions"
                className="opacity-0 group-hover/group:opacity-100 p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] transition-opacity shrink-0"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Group context menu */}
        {groupMenuPos && (
          <div
            role="menu"
            className="fixed rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg z-50 py-1 min-w-[160px]"
            style={{ top: groupMenuPos.y, left: groupMenuPos.x }}
          >
            {onCreateGroup && (
              <button
                role="menuitem"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setGroupMenuPos(null);
                  onCreateGroup(node.path);
                }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                New subgroup…
              </button>
            )}
            <button
              role="menuitem"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                setGroupMenuPos(null);
                setRenameGroupVal(node.name);
                setRenamingGroup(true);
              }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              Rename group
            </button>
            <button
              role="menuitem"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                setGroupMenuPos(null);
                onRequestMoveGroup?.(node.path);
              }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              Move group to set…
            </button>
            <button
              role="menuitem"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                setGroupMenuPos(null);
                onDuplicateGroup?.(node.path);
              }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              Duplicate group
            </button>
            {onSetGroupScopes && (
              <button
                role="menuitem"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setGroupMenuPos(null);
                  onSetGroupScopes(node.path);
                }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Set scopes for group…
              </button>
            )}
            {onSyncGroup && (
              <button
                role="menuitem"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setGroupMenuPos(null);
                  const count = node.children ? countTokensInGroup(node) : 0;
                  onSyncGroup(node.path, count);
                }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)] transition-colors border-t border-[var(--color-figma-border)]"
              >
                Create variables from group
              </button>
            )}
            {onSyncGroupStyles && (
              <button
                role="menuitem"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setGroupMenuPos(null);
                  const count = node.children ? countTokensInGroup(node) : 0;
                  onSyncGroupStyles(node.path, count);
                }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Create styles from group
              </button>
            )}
            {onGenerateScaleFromGroup && (
              <button
                role="menuitem"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setGroupMenuPos(null);
                  // Detect the dominant token type from this group's leaves
                  const prefix = node.path + '.';
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
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors border-t border-[var(--color-figma-border)]"
              >
                Generate scale from this group…
              </button>
            )}
            <button
              role="menuitem"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                setGroupMenuPos(null);
                onDeleteGroup(node.path, node.name, leafCount);
              }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 transition-colors border-t border-[var(--color-figma-border)]"
            >
              Delete group
            </button>
          </div>
        )}

        {!skipChildren && isExpanded && node.children?.map(child => (
          <TokenTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            onEdit={onEdit}
            onDelete={onDelete}
            onDeleteGroup={onDeleteGroup}
            setName={setName}
            selectionCapabilities={selectionCapabilities}
            allTokensFlat={allTokensFlat}
            selectMode={selectMode}
            isSelected={false}
            onToggleSelect={onToggleSelect}
            expandedPaths={expandedPaths}
            onToggleExpand={onToggleExpand}
            duplicateCounts={duplicateCounts}
            highlightedToken={highlightedToken}
            onNavigateToAlias={onNavigateToAlias}
            onCreateSibling={onCreateSibling}
            onCreateGroup={onCreateGroup}
            onRenameGroup={onRenameGroup}
            onRequestMoveGroup={onRequestMoveGroup}
            onDuplicateGroup={onDuplicateGroup}
            onDuplicateToken={onDuplicateToken}
            onExtractToAlias={onExtractToAlias}
            inspectMode={inspectMode}
            onHoverToken={onHoverToken}
            lintViolations={lintViolations.filter(v => v.path === child.path)}
            onExtractToAliasForLint={onExtractToAliasForLint}
            onSyncGroup={onSyncGroup}
            onSyncGroupStyles={onSyncGroupStyles}
            onSetGroupScopes={onSetGroupScopes}
            onGenerateScaleFromGroup={onGenerateScaleFromGroup}
            syncSnapshot={syncSnapshot}
            cascadeDiff={cascadeDiff}
            onFilterByType={onFilterByType}
            generatorsBySource={generatorsBySource}
            derivedTokenPaths={derivedTokenPaths}
            onInlineSave={onInlineSave}
            onRenameToken={onRenameToken}
          />
        ))}
      </div>
    );
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    if (node.isGroup || selectMode) return;
    e.preventDefault();
    setContextMenuPos({
      x: Math.min(e.clientX, window.innerWidth - 168),
      y: Math.min(e.clientY, window.innerHeight - 280),
    });
  };

  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (node.isGroup) return;

    // Enter or e: open editor
    if (e.key === 'Enter' || (e.key === 'e' && !e.metaKey && !e.ctrlKey && !e.altKey)) {
      e.preventDefault();
      onEdit(node.path);
      return;
    }

    // Space: toggle selection in select mode; open context menu otherwise
    if (e.key === ' ') {
      e.preventDefault();
      if (selectMode) {
        onToggleSelect(node.path);
      } else {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setContextMenuPos({
          x: Math.min(rect.left, window.innerWidth - 168),
          y: Math.min(rect.bottom, window.innerHeight - 280),
        });
      }
      return;
    }

    // Delete or Backspace: delete token
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onDelete(node.path);
      return;
    }

    // Cmd+D / Ctrl+D: duplicate token
    if (e.key === 'd' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onDuplicateToken?.(node.path);
      return;
    }
  };

  const parentGroupPath = node.path.length > node.name.length ? nodeParentPath(node.path, node.name) : null;

  const handleJumpToGroup = (groupPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onJumpToGroup) {
      onJumpToGroup(groupPath);
    } else {
      const el = document.querySelector<HTMLElement>(`[data-group-path="${groupPath}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  return (
    <div ref={nodeRef}>
    <div
      className={`relative flex items-center gap-2 px-2 py-1 hover:bg-[var(--color-figma-bg-hover)] transition-colors group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-figma-accent)] ${isHighlighted ? 'bg-[var(--color-figma-accent)]/15 ring-1 ring-inset ring-[var(--color-figma-accent)]/40' : cascadeChange ? 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/30' : ''}`}
      style={{ paddingLeft: `${depth * 16 + 20}px` }}
      tabIndex={selectMode ? -1 : 0}
      data-token-path={node.path}
      draggable={!selectMode}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-token-drag', 'true');
        onDragStart?.([node.path], [node.name]);
      }}
      onDragEnd={() => onDragEnd?.()}
      onMouseEnter={() => { setHovered(true); if (inspectMode) onHoverToken?.(node.path); }}
      onMouseLeave={() => { setHovered(false); setShowPicker(false); }}
      onContextMenu={handleContextMenu}
      onKeyDown={handleRowKeyDown}
    >
      {/* Checkbox for select mode */}
      {selectMode && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(node.path)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select token ${node.path}`}
          className="shrink-0 cursor-pointer"
        />
      )}

      {/* Value preview (resolve aliases for display) */}
      {canInlineEdit && node.$type === 'color' && typeof displayValue === 'string' ? (
        <>
          <div className="relative shrink-0">
            <button
              onClick={e => { e.stopPropagation(); setPendingColor(typeof node.$value === 'string' ? node.$value : '#000000'); setColorPickerOpen(true); }}
              title="Click to edit color"
              className="w-5 h-5 rounded border border-[var(--color-figma-border)] shrink-0 hover:ring-1 hover:ring-[var(--color-figma-accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)]"
              style={{ backgroundColor: displayValue }}
            />
            {colorPickerOpen && (
              <ColorPicker
                value={pendingColor}
                onChange={setPendingColor}
                onClose={() => {
                  setColorPickerOpen(false);
                  if (pendingColor !== node.$value) onInlineSave?.(node.path, 'color', pendingColor);
                }}
              />
            )}
          </div>
        </>
      ) : (
        <ValuePreview type={node.$type} value={displayValue} />
      )}

      {/* Name and info — single-click applies (non-select mode), double-click edits */}
      <div
        className={`flex-1 min-w-0${!selectMode ? ' cursor-pointer' : ''}`}
        onClick={selectMode ? () => onToggleSelect(node.path) : (e) => { e.stopPropagation(); handleApplyToSelection(e); }}
        onDoubleClick={!selectMode ? (e) => { e.stopPropagation(); onEdit(node.path); } : undefined}
        style={selectMode ? { cursor: 'pointer' } : undefined}
      >
        <div className="flex items-center gap-1.5">
          {syncChanged && (
            <span
              title="Changed locally since last sync"
              className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0 cursor-default"
            />
          )}
          {renamingToken ? (
            <input
              ref={renameTokenInputRef}
              value={renameTokenVal}
              onChange={e => setRenameTokenVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.stopPropagation(); confirmTokenRename(); }
                if (e.key === 'Escape') { e.stopPropagation(); renameTokenEscapedRef.current = true; setRenamingToken(false); }
              }}
              onBlur={() => {
                if (!renameTokenEscapedRef.current) confirmTokenRename();
                renameTokenEscapedRef.current = false;
              }}
              onClick={e => e.stopPropagation()}
              className="text-[11px] text-[var(--color-figma-text)] bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] rounded px-1 outline-none w-32 shrink-0"
            />
          ) : (
            <span className="text-[11px] text-[var(--color-figma-text)] truncate" title={formatDisplayPath(node.path, node.name)}>{node.name}</span>
          )}
          {!renamingToken && node.$type && (
            <button
              onClick={e => { e.stopPropagation(); onFilterByType?.(node.$type!); }}
              title={`Filter by type: ${node.$type}`}
              className={`px-1 py-0.5 rounded text-[8px] font-medium ${TOKEN_TYPE_BADGE_CLASS[node.$type ?? ''] ?? 'token-type-string'} cursor-pointer transition-opacity hover:opacity-70 hover:ring-1 hover:ring-current/40`}
            >
              {node.$type}
            </button>
          )}
          {/* Generator source indicator */}
          {generatorsBySource?.has(node.path) && (
            <span
              title={`Source for ${generatorsBySource.get(node.path)!.length} derived group${generatorsBySource.get(node.path)!.length !== 1 ? 's' : ''}`}
              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-medium bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] shrink-0 cursor-default"
            >
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="5" cy="2" r="1.5"/>
                <circle cx="2" cy="8" r="1.5"/>
                <circle cx="8" cy="8" r="1.5"/>
                <path d="M5 3.5V6M5 6L2 6.5M5 6L8 6.5"/>
              </svg>
              {generatorsBySource.get(node.path)!.length}
            </span>
          )}
          {/* Derived token indicator */}
          {derivedTokenPaths?.has(node.path) && !generatorsBySource?.has(node.path) && (
            <span
              title="Auto-generated by a token generator"
              className="inline-flex items-center px-1 py-0.5 rounded text-[8px] font-medium bg-[var(--color-figma-text-secondary)]/10 text-[var(--color-figma-text-secondary)] shrink-0 cursor-default"
            >
              <svg width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 2l6 6M8 2l-3 3-3 3"/>
              </svg>
            </span>
          )}
          {isAlias(node.$value) && (
            <button
              onClick={handleAliasClick}
              className={`flex items-center gap-0.5 px-1 py-0.5 rounded border text-[8px] transition-colors ${isBrokenAlias ? 'border-[var(--color-figma-error)] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 cursor-default' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]'}`}
              title={isBrokenAlias ? `Broken reference — ${resolveResult?.error}` : `Navigate to ${node.$value}`}
            >
              <span>{(node.$value as string).slice(1, -1)}</span>
              <svg width="6" height="6" viewBox="0 0 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1 3h4M3 1l2 2-2 2"/>
              </svg>
            </button>
          )}
        </div>
        {node.$description && (
          <div className="text-[9px] text-[var(--color-figma-text-secondary)] truncate" title={node.$description}>{node.$description}</div>
        )}
        {parentGroupPath && (
          <button
            onClick={e => handleJumpToGroup(parentGroupPath, e)}
            title={`Jump to group: ${parentGroupPath}`}
            className="text-[9px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] truncate text-left transition-colors opacity-0 group-hover:opacity-100 leading-none mt-0.5"
          >
            ↑ {parentGroupPath}
          </button>
        )}
      </div>

      {/* Value text */}
      {canInlineEdit && node.$type === 'boolean' ? (
        <button
          onClick={e => { e.stopPropagation(); onInlineSave?.(node.path, 'boolean', !node.$value); }}
          title="Click to toggle"
          className="text-[11px] text-[var(--color-figma-text-secondary)] shrink-0 cursor-pointer hover:text-[var(--color-figma-accent)] transition-colors"
        >
          {formatValue(node.$type, displayValue)}
        </button>
      ) : canInlineEdit && node.$type !== 'color' && inlineEditActive ? (
        <input
          type={node.$type === 'number' || node.$type === 'fontWeight' || node.$type === 'duration' ? 'number' : 'text'}
          value={inlineEditValue}
          onChange={e => setInlineEditValue(e.target.value)}
          onBlur={() => {
            if (inlineEditEscapedRef.current) { inlineEditEscapedRef.current = false; return; }
            handleInlineSubmit();
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handleInlineSubmit(); }
            if (e.key === 'Escape') { e.preventDefault(); inlineEditEscapedRef.current = true; setInlineEditActive(false); }
            e.stopPropagation();
          }}
          onClick={e => e.stopPropagation()}
          autoFocus
          className="text-[11px] text-[var(--color-figma-text)] shrink-0 w-[96px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] rounded px-1 outline-none"
        />
      ) : isAlias(node.$value) && !isBrokenAlias ? (
        <span
          className="inline-flex items-center gap-1 text-[10px] shrink-0 max-w-[180px] truncate"
          title={`${(node.$value as string).slice(1, -1)} → ${formatValue(node.$type, displayValue)}`}
        >
          <span className="text-[var(--color-figma-text-tertiary)] truncate">{(node.$value as string).slice(1, -1)}</span>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="shrink-0 text-[var(--color-figma-text-tertiary)]" aria-hidden="true"><path d="M1 4h6M5 2l2 2-2 2"/></svg>
          <span className="text-[var(--color-figma-text-secondary)] font-medium truncate">{formatValue(node.$type, displayValue)}</span>
        </span>
      ) : canInlineEdit && node.$type !== 'color' ? (
        <span
          className="text-[11px] text-[var(--color-figma-text-secondary)] shrink-0 max-w-[96px] truncate cursor-text hover:underline hover:decoration-dotted hover:text-[var(--color-figma-text)]"
          title="Click to edit"
          onClick={e => {
            e.stopPropagation();
            setInlineEditValue(getEditableString(node.$type, node.$value));
            setInlineEditActive(true);
          }}
        >
          {formatValue(node.$type, displayValue)}
        </span>
      ) : (
        <span className="text-[11px] text-[var(--color-figma-text-secondary)] shrink-0 max-w-[96px] truncate">
          {formatValue(node.$type, displayValue)}
        </span>
      )}
      {/* Duplicate annotation */}
      {(() => {
        const count = duplicateCounts.get(JSON.stringify(node.$value));
        return count ? (
          <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] shrink-0" title={`${count} tokens share this value`}>
            {count} shared
          </span>
        ) : null;
      })()}

      {/* Cascade diff badge — shown when set reorder would change this token's resolved value */}
      {cascadeChange && (
        <span
          className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded border border-amber-400/60 bg-amber-500/10 text-[8px] shrink-0"
          title={`Would change: ${formatValue(node.$type, cascadeChange.before)} → ${formatValue(node.$type, cascadeChange.after)}`}
        >
          {node.$type === 'color' && typeof cascadeChange.before === 'string' ? (
            <span style={{ backgroundColor: cascadeChange.before }} className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0 inline-block" />
          ) : (
            <span className="text-[var(--color-figma-text-secondary)] max-w-[36px] truncate">{formatValue(node.$type, cascadeChange.before)}</span>
          )}
          <svg width="6" height="6" viewBox="0 0 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-amber-500 shrink-0" aria-hidden="true">
            <path d="M1 3h4M3 1l2 2-2 2"/>
          </svg>
          {node.$type === 'color' && typeof cascadeChange.after === 'string' ? (
            <span style={{ backgroundColor: cascadeChange.after }} className="w-2.5 h-2.5 rounded-sm border border-black/10 shrink-0 inline-block" />
          ) : (
            <span className="text-amber-700 max-w-[36px] truncate">{formatValue(node.$type, cascadeChange.after)}</span>
          )}
        </span>
      )}

      {/* Lint violation indicators */}
      {lintViolations.length > 0 && (
        <div className="flex items-center gap-0.5 shrink-0">
          {lintViolations.slice(0, 3).map((v, i) => (
            <button
              key={i}
              title={`${v.rule}: ${v.message}${v.suggestedFix ? ` (Fix: ${v.suggestedFix})` : ''}`}
              onClick={e => {
                e.stopPropagation();
                if (v.suggestedFix === 'extract-to-alias') {
                  onExtractToAliasForLint?.(node.path, node.$type, node.$value);
                } else if (v.suggestedFix === 'add-description') {
                  onEdit(node.path);
                }
              }}
              className={`text-[8px] px-1 py-0.5 rounded border shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:opacity-100 ${
                v.severity === 'error'
                  ? 'border-[var(--color-figma-error)] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 focus-visible:ring-[var(--color-figma-error)]'
                  : v.severity === 'warning'
                  ? 'border-yellow-500 text-yellow-700 bg-yellow-50 focus-visible:ring-yellow-500'
                  : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] focus-visible:ring-[var(--color-figma-accent)]'
              }`}
            >
              {v.severity === 'error' ? '✕' : v.severity === 'warning' ? '⚠' : 'ℹ'}
            </button>
          ))}
          {lintViolations.length > 3 && (
            <span className="text-[8px] text-[var(--color-figma-text-secondary)]">+{lintViolations.length - 3}</span>
          )}
        </div>
      )}

      {/* Alias chain badge — shown when token resolves through 3+ hops */}
      {showChainBadge && (
        <button
          onClick={e => { e.stopPropagation(); setChainExpanded(v => !v); }}
          title={chainExpanded ? 'Collapse reference chain' : `${aliasChain.length} hops: ${node.path} → ${aliasChain.join(' → ')}`}
          className={`text-[8px] px-1 py-0.5 rounded border shrink-0 transition-colors ${chainExpanded ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]'}`}
        >
          {aliasChain.length} hops
        </button>
      )}

      {/* Apply to selection — dimly visible at rest, prominent on row hover */}
      {!selectMode && (
        <button
          onClick={e => { e.stopPropagation(); handleApplyToSelection(e); }}
          title="Apply to selection (double-click row to edit)"
          className="p-1.5 rounded shrink-0 opacity-40 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity hover:bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 5l7 7-7 7M5 12h14" />
          </svg>
        </button>
      )}

      {/* Secondary actions (copy, edit, delete — on row hover) */}
      {!selectMode && (
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity [transition-delay:100ms] group-hover:[transition-delay:0ms]">
          <button
            onClick={handleCopyPath}
            title={copiedWhat === 'path' ? 'Copied!' : `Copy CSS var (--${node.path.replace(/\./g, '-')})`}
            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
          >
            {copiedWhat === 'path' ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 6L4 12l4 6M16 6l4 6-4 6M13 4l-2 16"/>
              </svg>
            )}
          </button>
          <button
            onClick={handleCopyValue}
            title={copiedWhat === 'value' ? 'Copied!' : 'Copy resolved value'}
            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
          >
            {copiedWhat === 'value' ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            )}
          </button>
          <button
            onClick={() => onEdit(node.path)}
            title="Edit token"
            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            onClick={() => {
              onCreateSibling?.(nodeParentPath(node.path, node.name), node.$type || 'color');
            }}
            title="Create sibling token"
            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
          <div className="w-px h-3.5 bg-[var(--color-figma-border)] mx-0.5 shrink-0" aria-hidden="true" />
          <button
            onClick={() => onDelete(node.path)}
            title="Delete token"
            className="p-1 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-error)]"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      )}

      {/* Property picker dropdown */}
      {showPicker && node.$type && TOKEN_PROPERTY_MAP[node.$type] && (
        <PropertyPicker
          properties={TOKEN_PROPERTY_MAP[node.$type]}
          capabilities={selectionCapabilities}
          onSelect={applyWithProperty}
          onClose={() => setShowPicker(false)}
          anchorRect={pickerAnchor}
        />
      )}

      {/* Right-click context menu */}
      {contextMenuPos && (
        <div
          className="fixed z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg py-1 min-w-[160px]"
          style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              setContextMenuPos(null);
              onCreateSibling?.(nodeParentPath(node.path, node.name), node.$type || 'color');
            }}
          >
            Create sibling
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              setContextMenuPos(null);
              onDuplicateToken?.(node.path);
            }}
          >
            Duplicate token
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              setContextMenuPos(null);
              setRenameTokenVal(node.name);
              setRenamingToken(true);
            }}
          >
            Rename token
          </button>
          {!isAlias(node.$value) && (
            <button
              className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                setContextMenuPos(null);
                onExtractToAlias?.(node.path, node.$type, node.$value);
              }}
            >
              Link to token
            </button>
          )}
          <div className="my-1 border-t border-[var(--color-figma-border)]" />
          <button
            className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              navigator.clipboard.writeText(node.path).catch(() => {});
              setContextMenuPos(null);
            }}
          >
            Copy token path
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              const entry: Record<string, unknown> = { $value: node.$value, $type: node.$type };
              if (node.$description) entry.$description = node.$description;
              navigator.clipboard.writeText(JSON.stringify(entry, null, 2)).catch(() => {});
              setContextMenuPos(null);
            }}
          >
            Copy as JSON
          </button>
        </div>
      )}

      {/* Alias resolution chain tooltip — visible on row hover */}
      {hovered && aliasChainLabel && (
        <div className="absolute left-4 right-4 top-full z-20 pointer-events-none" style={{ marginTop: '-2px' }}>
          <div className="inline-flex items-center gap-1 px-2 py-1 rounded shadow-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[9px] font-mono text-[var(--color-figma-text-secondary)] whitespace-nowrap max-w-full overflow-hidden">
            {[node.path, ...aliasChain].map((seg, i, arr) => (
              <Fragment key={i}>
                <span className={i === 0 ? 'text-[var(--color-figma-accent)]' : ''}>{seg}</span>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="shrink-0 text-[var(--color-figma-text-tertiary)]" aria-hidden="true"><path d="M1 4h6M4 1l3 3-3 3"/></svg>
              </Fragment>
            ))}
            <span className="text-[var(--color-figma-text)] font-medium">{formatValue(node.$type, displayValue)}</span>
          </div>
        </div>
      )}
    </div>

    {/* Inline alias chain expansion */}
    {showChainBadge && chainExpanded && (
      <div
        className="flex items-center flex-wrap gap-1 px-2 py-1 bg-[var(--color-figma-bg-hover)] border-t border-[var(--color-figma-border)]"
        style={{ paddingLeft: `${depth * 16 + 20}px` }}
      >
        <span className="text-[9px] text-[var(--color-figma-text-secondary)] font-medium shrink-0">Chain:</span>
        <span className="text-[9px] text-[var(--color-figma-accent)] font-mono shrink-0">{node.path}</span>
        {aliasChain.map((hop, i) => (
          <Fragment key={hop}>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[var(--color-figma-text-secondary)] shrink-0">
              <path d="M1 4h6M4 1l3 3-3 3"/>
            </svg>
            <button
              className="text-[9px] font-mono text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] shrink-0 transition-colors"
              onClick={() => onNavigateToAlias?.(hop)}
              title={`Navigate to ${hop}`}
            >
              {hop}
            </button>
            {i === aliasChain.length - 1 && (
              <>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[var(--color-figma-text-secondary)] shrink-0">
                  <path d="M1 4h6M4 1l3 3-3 3"/>
                </svg>
                <span className="text-[9px] text-[var(--color-figma-text)] font-mono shrink-0">
                  {formatValue(node.$type, displayValue)}
                </span>
              </>
            )}
          </Fragment>
        ))}
      </div>
    )}
    </div>
  );
}
