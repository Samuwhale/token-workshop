import { useState, useCallback, useEffect, useRef, useMemo, useLayoutEffect, Fragment } from 'react';
import type { TokenNode } from '../hooks/useTokens';
import { PropertyPicker } from './PropertyPicker';
import { ConfirmModal } from './ConfirmModal';
import { TOKEN_PROPERTY_MAP } from '../../shared/types';
import type { BindableProperty, NodeCapabilities, SelectionNodeInfo, TokenMapEntry } from '../../shared/types';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';
import type { UndoSlot } from '../hooks/useUndo';
import { ScaffoldingWizard } from './ScaffoldingWizard';
import type { LintViolation } from '../hooks/useLint';

function countTokensInGroup(node: TokenNode): number {
  if (!node.isGroup) return 1;
  return (node.children ?? []).reduce((sum, c) => sum + countTokensInGroup(c), 0);
}

type SortOrder = 'default' | 'alpha-asc' | 'alpha-desc' | 'by-type' | 'by-value' | 'by-usage';

interface TokenListProps {
  tokens: TokenNode[];
  setName: string;
  sets: string[];
  serverUrl: string;
  connected: boolean;
  selectedNodes: SelectionNodeInfo[];
  allTokensFlat: Record<string, TokenMapEntry>;
  onEdit: (path: string) => void;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  defaultCreateOpen?: boolean;
  highlightedToken?: string | null;
  onNavigateToAlias?: (path: string) => void;
  onClearHighlight?: () => void;
  lintViolations?: LintViolation[];
  onSyncGroup?: (groupPath: string, tokenCount: number) => void;
  onSetGroupScopes?: (groupPath: string) => void;
  syncSnapshot?: Record<string, string>;
}

type DeleteConfirm =
  | { type: 'token'; path: string }
  | { type: 'group'; path: string; name: string; tokenCount: number }
  | { type: 'bulk'; paths: string[]; orphanCount: number };

// ---------------------------------------------------------------------------
// Color matching helpers for "Promote to Semantic" (US-026)
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '');
  if (h.length !== 6 && h.length !== 8) return null;
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function rgbToLab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  // sRGB to linear
  const lin = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const R = lin(r), G = lin(g), B = lin(b);
  // linear RGB to XYZ (D65)
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = (0.2126729 * R + 0.7151522 * G + 0.0721750 * B) / 1.0;
  const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  // XYZ to LAB
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return { L: 116 * f(Y) - 16, a: 500 * (f(X) - f(Y)), b: 200 * (f(Y) - f(Z)) };
}

function colorDeltaE(hexA: string, hexB: string): number | null {
  const rgbA = hexToRgb(hexA);
  const rgbB = hexToRgb(hexB);
  if (!rgbA || !rgbB) return null;
  const labA = rgbToLab(rgbA.r, rgbA.g, rgbA.b);
  const labB = rgbToLab(rgbB.r, rgbB.g, rgbB.b);
  return Math.sqrt((labA.L - labB.L) ** 2 + (labA.a - labB.a) ** 2 + (labA.b - labB.b) ** 2);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object' && a !== null && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

interface PromoteRow {
  path: string;
  $type: string;
  $value: unknown;
  proposedAlias: string | null;
  deltaE?: number;
  accepted: boolean;
}

export function TokenList({ tokens, setName, sets, serverUrl, connected, selectedNodes, allTokensFlat, onEdit, onRefresh, onPushUndo, defaultCreateOpen, highlightedToken, onNavigateToAlias, onClearHighlight, lintViolations = [], onSyncGroup, onSetGroupScopes, syncSnapshot }: TokenListProps) {
  const [showCreateForm, setShowCreateForm] = useState(defaultCreateOpen ?? false);
  const [newTokenPath, setNewTokenPath] = useState('');
  const [newTokenType, setNewTokenTypeState] = useState(() => {
    try { return sessionStorage.getItem('tm_last_token_type') || 'color'; } catch { return 'color'; }
  });
  const setNewTokenType = (t: string) => {
    setNewTokenTypeState(t);
    try { sessionStorage.setItem('tm_last_token_type', t); } catch {}
  };
  const [createError, setCreateError] = useState('');
  const [siblingPrefix, setSiblingPrefix] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [promoteRows, setPromoteRows] = useState<PromoteRow[] | null>(null);
  const [promoteBusy, setPromoteBusy] = useState(false);
  const [showScaffold, setShowScaffold] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [frFind, setFrFind] = useState('');
  const [frReplace, setFrReplace] = useState('');
  const [frIsRegex, setFrIsRegex] = useState(false);
  const [frError, setFrError] = useState('');
  const [frBusy, setFrBusy] = useState(false);

  // Expand/collapse state — persisted in sessionStorage per set
  const setNameRef = useRef(setName);
  setNameRef.current = setName;
  const initializedForSet = useRef<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

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

  // Sort order — persisted in sessionStorage (shared across sets)
  const [sortOrder, setSortOrderState] = useState<SortOrder>(() => {
    try {
      return (sessionStorage.getItem('token-sort') as SortOrder) || 'default';
    } catch {
      return 'default';
    }
  });

  const setSortOrder = useCallback((order: SortOrder) => {
    setSortOrderState(order);
    try {
      sessionStorage.setItem('token-sort', order);
    } catch {}
  }, []);

  const sortedTokens = useMemo(() => sortTokenNodes(tokens, sortOrder), [tokens, sortOrder]);

  // Filters — persisted in sessionStorage (shared across sets)
  const [searchQuery, setSearchQueryState] = useState(() => {
    try { return sessionStorage.getItem('token-search') || ''; } catch { return ''; }
  });
  const [typeFilter, setTypeFilterState] = useState(() => {
    try { return sessionStorage.getItem('token-type-filter') || ''; } catch { return ''; }
  });
  const [refFilter, setRefFilterState] = useState<'all' | 'aliases' | 'direct'>(() => {
    try { return (sessionStorage.getItem('token-ref-filter') as 'all' | 'aliases' | 'direct') || 'all'; } catch { return 'all'; }
  });

  const setSearchQuery = useCallback((v: string) => {
    setSearchQueryState(v);
    try { sessionStorage.setItem('token-search', v); } catch {}
  }, []);
  const setTypeFilter = useCallback((v: string) => {
    setTypeFilterState(v);
    try { sessionStorage.setItem('token-type-filter', v); } catch {}
  }, []);
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

  const filtersActive = searchQuery !== '' || typeFilter !== '' || refFilter !== 'all' || showDuplicates;

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
  const [tableMode, setTableMode] = useState(false);
  const [showScopesCol, setShowScopesCol] = useState(false);

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
    if (inspectMode && selectedNodes.length > 0) result = filterByDuplicatePaths(result, boundTokenPaths);
    return result;
  }, [sortedTokens, searchQuery, typeFilter, refFilter, filtersActive, showDuplicates, duplicateValuePaths, inspectMode, selectedNodes.length, boundTokenPaths]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setTypeFilter('');
    setRefFilter('all');
    setShowDuplicates(false);
  }, [setSearchQuery, setTypeFilter, setRefFilter, setShowDuplicates]);

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
    setSiblingPrefix(groupPath);
    setNewTokenPath(groupPath ? groupPath + '.' : '');
    setNewTokenType(tokenType || 'color');
    setShowCreateForm(true);
  }, []);

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

  const handleCreate = async () => {
    const trimmedPath = newTokenPath.trim();
    if (!trimmedPath) { setCreateError('Token path cannot be empty'); return; }
    if (!connected) return;
    setCreateError('');
    try {
      const res = await fetch(`${serverUrl}/api/tokens/${setName}/${trimmedPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          $type: newTokenType,
          $value: getDefaultValue(newTokenType),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateError((data as any).error || `Failed to create token (${res.status})`);
        return;
      }
      setShowCreateForm(false);
      setNewTokenPath('');
      setSiblingPrefix(null);
      onRefresh();
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

    setDeleteConfirm(null);
    try {
      if (deleteConfirm.type === 'token' || deleteConfirm.type === 'group') {
        await fetch(`${serverUrl}/api/tokens/${setName}/${deleteConfirm.path}`, { method: 'DELETE' });
      } else {
        await Promise.all(
          deleteConfirm.paths.map(path =>
            fetch(`${serverUrl}/api/tokens/${setName}/${path}`, { method: 'DELETE' })
          )
        );
        setSelectedPaths(new Set());
        setSelectMode(false);
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
    setTimeout(() => setApplying(false), 1500);
  };

  const handleApplyStyles = async () => {
    setApplying(true);
    const flat = resolveFlat(flattenTokens(tokens));
    parent.postMessage({ pluginMessage: { type: 'apply-styles', tokens: flat } }, '*');
    setTimeout(() => setApplying(false), 1500);
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
    try {
      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/bulk-rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ find: frFind, replace: frReplace, isRegex: frIsRegex }),
      });
      const data = await res.json() as { renamed?: number; skipped?: string[]; aliasesUpdated?: number; error?: string };
      if (!res.ok) { setFrError(data.error ?? 'Rename failed'); return; }
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
        ? `${orphanCount} other token${orphanCount !== 1 ? 's' : ''} alias these and will become broken references.`
        : undefined,
      confirmLabel: `Delete ${paths.length} token${paths.length !== 1 ? 's' : ''}`,
    };
  };

  const modalProps = getDeleteModalProps();

  return (
    <div className="flex flex-col h-full">
      {/* Token tree */}
      <div className="flex-1 overflow-y-auto">
        {/* Select mode toolbar */}
        {selectMode && (
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] flex-1">
              {selectedPaths.size} selected
            </span>
            {selectedPaths.size > 0 && (
              <>
                <button
                  onClick={handleOpenPromoteModal}
                  className="px-2 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity"
                >
                  Convert to aliases
                </button>
                <button
                  onClick={requestBulkDelete}
                  className="px-2 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-error)] text-white hover:opacity-90 transition-opacity"
                >
                  Delete {selectedPaths.size}
                </button>
              </>
            )}
            <button
              onClick={() => { setSelectMode(false); setSelectedPaths(new Set()); }}
              className="px-2 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              Cancel
            </button>
          </div>
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
              </>
            )}
            <button
              onClick={() => setInspectMode(v => !v)}
              title={inspectMode ? 'Disable inspect mode' : 'Show tokens bound to selected layer'}
              className={`px-2 py-0.5 rounded text-[10px] transition-colors ${inspectMode ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] font-medium' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
            >
              Bound tokens
            </button>
            <button
              onClick={() => setTableMode(v => !v)}
              title={tableMode ? 'Switch to tree view' : 'Switch to table view'}
              className={`px-2 py-0.5 rounded text-[10px] transition-colors ${tableMode ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] font-medium' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
            >
              Table
            </button>
            <div className="ml-auto">
              <select
                value={sortOrder}
                onChange={e => setSortOrder(e.target.value as SortOrder)}
                className="text-[10px] bg-transparent text-[var(--color-figma-text-secondary)] border-none outline-none cursor-pointer hover:text-[var(--color-figma-text)] pr-1"
              >
                <option value="default">Default order</option>
                <option value="alpha-asc">A → Z</option>
                <option value="alpha-desc">Z → A</option>
                <option value="by-type">By type</option>
                <option value="by-value">By value</option>
                <option value="by-usage" disabled>By usage (run scan first)</option>
              </select>
            </div>
          </div>
        )}

        {/* Filter bar */}
        {tokens.length > 0 && !selectMode && (
          <div className={`flex items-center gap-1 px-2 py-1.5 border-b border-[var(--color-figma-border)] overflow-hidden ${filtersActive ? 'bg-[var(--color-figma-accent)]/8' : 'bg-[var(--color-figma-bg)]'}`}>
            <input
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
                <option value="aliases">Aliases only</option>
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
            {/* More filters button — expands other filters */}
            {(refFilter === 'all' || !showDuplicates) && (
              <div className="relative shrink-0 group/more">
                <button
                  title="More filters"
                  className="flex items-center justify-center w-6 h-6 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] hover:bg-[var(--color-figma-bg-hover)] text-[10px]"
                >
                  ⋯
                </button>
                <div className="hidden group-hover/more:flex absolute right-0 top-full mt-0.5 z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg flex-col py-1 min-w-[140px]">
                  {refFilter === 'all' && (
                    <>
                      <button onClick={() => setRefFilter('aliases')} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">Aliases only</button>
                      <button onClick={() => setRefFilter('direct')} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">Direct values only</button>
                    </>
                  )}
                  {!showDuplicates && (
                    <button onClick={() => setShowDuplicates(true)} className="px-3 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]">Show duplicates</button>
                  )}
                </div>
              </div>
            )}
            {filtersActive && (
              <button
                onClick={clearFilters}
                title="Clear all filters"
                className="flex items-center justify-center w-5 h-5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] shrink-0"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                  <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
        )}

        {inspectMode && selectedNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--color-figma-text-secondary)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M13 12H3"/>
            </svg>
            <p className="mt-2 text-[11px] font-medium">Select a layer to inspect</p>
            <p className="text-[10px] mt-0.5">Tokens bound to the selected layer will appear here</p>
          </div>
        ) : tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--color-figma-text-secondary)]">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <p className="mt-2 text-[12px]">No tokens yet</p>
            <p className="text-[10px]">Create a token or import from Figma</p>
          </div>
        ) : tableMode ? (
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
                      <span className="text-[8px]">{showScopesCol ? '▼' : '▶'}</span>
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
                        <span className={`px-1 py-0.5 rounded text-[8px] font-medium uppercase token-type-${leaf.$type}`}>{leaf.$type}</span>
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
        ) : (
          <div className="py-1">
            {displayedTokens.map(node => (
              <TokenTreeNode
                key={node.path}
                node={node}
                depth={0}
                onEdit={onEdit}
                onDelete={requestDeleteToken}
                onDeleteGroup={requestDeleteGroup}
                setName={setName}
                selectionCapabilities={selectionCapabilities}
                allTokensFlat={allTokensFlat}
                selectMode={selectMode}
                isSelected={selectedPaths.has(node.path)}
                onToggleSelect={toggleSelect}
                expandedPaths={expandedPaths}
                onToggleExpand={handleToggleExpand}
                duplicateCounts={duplicateCounts}
                highlightedToken={highlightedToken ?? null}
                onNavigateToAlias={onNavigateToAlias}
                onCreateSibling={handleOpenCreateSibling}
                onRenameGroup={handleRenameGroup}
                onRequestMoveGroup={handleRequestMoveGroup}
                onDuplicateGroup={handleDuplicateGroup}
                onExtractToAlias={handleOpenExtractToAlias}
                inspectMode={inspectMode}
                onHoverToken={handleHoverToken}
                lintViolations={lintViolations.filter(v => v.path === node.path)}
                onExtractToAliasForLint={(path, $type, $value) => handleOpenExtractToAlias(path, $type, $value)}
                onSyncGroup={onSyncGroup}
                onSetGroupScopes={onSetGroupScopes}
                syncSnapshot={syncSnapshot}
                onFilterByType={setTypeFilter}
              />
            ))}
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
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            {createError && <p className="text-[10px] text-[var(--color-figma-error)]">{createError}</p>}
            <select
              value={newTokenType}
              onChange={e => setNewTokenType(e.target.value)}
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none"
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
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newTokenPath.trim()}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
              >
                Create
              </button>
              <button
                onClick={() => { setShowCreateForm(false); setNewTokenPath(''); setSiblingPrefix(null); setCreateError(''); }}
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
        {!showCreateForm && (
          <div className="flex gap-1.5">
            <button
              onClick={() => setShowCreateForm(true)}
              disabled={!connected}
              className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
            >
              + New Token
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
                  Select
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
            className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
          >
            Apply as Variables
          </button>
          <button
            onClick={handleApplyStyles}
            disabled={applying || tokens.length === 0}
            className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
          >
            Apply as Styles
          </button>
        </div>
      </div>

      {/* Scaffolding Wizard */}
      {showScaffold && (
        <ScaffoldingWizard
          serverUrl={serverUrl}
          activeSet={setName}
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

      {/* Extract to alias modal */}
      {extractToken && (() => {
        const candidateTokens = Object.entries(allTokensFlat)
          .filter(([path, t]) => path !== extractToken.path && t.$type === extractToken.$type && !isAlias(t.$value))
          .filter(([path]) => !existingAliasSearch || path.toLowerCase().includes(existingAliasSearch.toLowerCase()))
          .slice(0, 40);
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-72 flex flex-col" style={{ maxHeight: '80vh' }}>
              <div className="p-4 border-b border-[var(--color-figma-border)]">
                <div className="text-[12px] font-medium text-[var(--color-figma-text)]">Extract to alias</div>
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
                    {frPreview.map(({ oldPath, newPath, conflict }) => (
                      <div key={oldPath} className={`text-[10px] font-mono rounded px-2 py-1 ${conflict ? 'bg-red-50 border border-red-300 text-red-700' : 'bg-[var(--color-figma-bg-secondary)]'}`}>
                        <div className="truncate text-[var(--color-figma-text-secondary)] line-through">{oldPath}</div>
                        <div className="truncate text-[var(--color-figma-text)]">{newPath}</div>
                        {conflict && <div className="text-[9px] text-red-600 mt-0.5">⚠ conflicts with existing token — will be skipped</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {frError && <div className="text-[10px] text-[var(--color-figma-error)]">{frError}</div>}
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
              <div className="text-[12px] font-medium text-[var(--color-figma-text)]">Convert to Aliases</div>
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">Each token will be replaced with an alias reference to the matched primitive.</div>
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
                          <span className="ml-1 text-[9px] opacity-60">ΔE={row.deltaE.toFixed(1)}</span>
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
  onRenameGroup,
  onRequestMoveGroup,
  onDuplicateGroup,
  onExtractToAlias,
  inspectMode,
  onHoverToken,
  lintViolations = [],
  onExtractToAliasForLint,
  onSyncGroup,
  onSetGroupScopes,
  syncSnapshot,
  onFilterByType,
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
  onRenameGroup?: (oldGroupPath: string, newGroupPath: string) => void;
  onRequestMoveGroup?: (groupPath: string) => void;
  onDuplicateGroup?: (groupPath: string) => void;
  onExtractToAlias?: (path: string, $type?: string, $value?: any) => void;
  inspectMode?: boolean;
  onHoverToken?: (path: string) => void;
  lintViolations?: LintViolation[];
  onExtractToAliasForLint?: (path: string, $type?: string, $value?: any) => void;
  onSyncGroup?: (groupPath: string, tokenCount: number) => void;
  onSetGroupScopes?: (groupPath: string) => void;
  syncSnapshot?: Record<string, string>;
  onFilterByType?: (type: string) => void;
}) {
  const isExpanded = expandedPaths.has(node.path);
  const isHighlighted = highlightedToken === node.path;
  const [hovered, setHovered] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ top: number; left: number } | undefined>();
  const [copiedWhat, setCopiedWhat] = useState<'path' | 'value' | null>(null);
  const [aliasError, setAliasError] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [chainExpanded, setChainExpanded] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);

  // Group-specific state
  const [groupMenuPos, setGroupMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [renamingGroup, setRenamingGroup] = useState(false);
  const [renameGroupVal, setRenameGroupVal] = useState('');
  const renameGroupInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (renamingGroup && renameGroupInputRef.current) {
      renameGroupInputRef.current.focus();
      renameGroupInputRef.current.select();
    }
  }, [renamingGroup]);

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

  // Scroll highlighted token into view
  useEffect(() => {
    if (isHighlighted && nodeRef.current) {
      nodeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isHighlighted]);

  const resolveResult = isAlias(node.$value)
    ? resolveTokenValue(node.$value, node.$type || 'unknown', allTokensFlat)
    : null;
  const displayValue = resolveResult ? (resolveResult.value ?? node.$value) : node.$value;
  // chain.length is the number of alias hops (e.g. chain=['B','C'] = A→B→C→value = 3 hops)
  const aliasChain = resolveResult?.chain ?? [];
  const showChainBadge = aliasChain.length >= 2;

  // Sync state indicator
  const syncChanged = !node.isGroup && syncSnapshot && node.path in syncSnapshot
    && syncSnapshot[node.path] !== JSON.stringify(node.$value);

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
    if (!isAlias(node.$value)) return;
    const aliasPath = (node.$value as string).slice(1, -1);
    if (!allTokensFlat[aliasPath]) {
      setAliasError(true);
      setTimeout(() => setAliasError(false), 2000);
      return;
    }
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

  if (node.isGroup) {
    const leafCount = countLeaves(node);

    const confirmGroupRename = () => {
      const newName = renameGroupVal.trim();
      setRenamingGroup(false);
      if (!newName || newName === node.name) return;
      const lastDot = node.path.lastIndexOf('.');
      const parentPath = lastDot >= 0 ? node.path.slice(0, lastDot) : '';
      const newGroupPath = parentPath ? `${parentPath}.${newName}` : newName;
      onRenameGroup?.(node.path, newGroupPath);
    };

    return (
      <div>
        <div
          className="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-[var(--color-figma-bg-hover)] transition-colors group/group"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => !renamingGroup && onToggleExpand(node.path)}
          onContextMenu={e => {
            if (selectMode) return;
            e.preventDefault();
            setGroupMenuPos({ x: e.clientX, y: e.clientY });
          }}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            className={`transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
            fill="currentColor"
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
                if (e.key === 'Escape') setRenamingGroup(false);
              }}
              onBlur={confirmGroupRename}
              onClick={e => e.stopPropagation()}
              className="flex-1 text-[11px] font-medium bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[var(--color-figma-text)] rounded px-1 outline-none min-w-0"
            />
          ) : (
            <span className="text-[11px] font-medium text-[var(--color-figma-text)] flex-1">{node.name}</span>
          )}
          {!renamingGroup && node.children && (
            <span className="text-[9px] text-[var(--color-figma-text-secondary)] ml-1 shrink-0">
              ({leafCount})
            </span>
          )}
          {!selectMode && !renamingGroup && (
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteGroup(node.path, node.name, leafCount); }}
              title="Delete group"
              className="opacity-0 group-hover/group:opacity-100 p-1 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-error)] transition-opacity shrink-0"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          )}
        </div>

        {/* Group context menu */}
        {groupMenuPos && (
          <div
            className="fixed rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg z-50 py-1 min-w-[160px]"
            style={{ top: groupMenuPos.y, left: groupMenuPos.x }}
          >
            <button
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
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setGroupMenuPos(null);
                  const count = node.children ? countTokensInGroup(node) : 0;
                  onSyncGroup(node.path, count);
                }}
                className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)] transition-colors border-t border-[var(--color-figma-border)]"
              >
                Sync this group to Figma
              </button>
            )}
          </div>
        )}

        {isExpanded && node.children?.map(child => (
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
            onRenameGroup={onRenameGroup}
            onRequestMoveGroup={onRequestMoveGroup}
            onDuplicateGroup={onDuplicateGroup}
            onExtractToAlias={onExtractToAlias}
            inspectMode={inspectMode}
            onHoverToken={onHoverToken}
            lintViolations={lintViolations.filter(v => v.path === child.path)}
            onExtractToAliasForLint={onExtractToAliasForLint}
            onSyncGroup={onSyncGroup}
            onSetGroupScopes={onSetGroupScopes}
            syncSnapshot={syncSnapshot}
            onFilterByType={onFilterByType}
          />
        ))}
      </div>
    );
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    if (node.isGroup || selectMode) return;
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div ref={nodeRef}>
    <div
      className={`relative flex items-center gap-2 px-2 py-1 hover:bg-[var(--color-figma-bg-hover)] transition-colors group ${isHighlighted ? 'bg-[var(--color-figma-accent)]/15 ring-1 ring-inset ring-[var(--color-figma-accent)]/40' : ''}`}
      style={{ paddingLeft: `${depth * 16 + 20}px` }}
      onMouseEnter={() => { setHovered(true); if (inspectMode) onHoverToken?.(node.path); }}
      onMouseLeave={() => { setHovered(false); setShowPicker(false); }}
      onContextMenu={handleContextMenu}
    >
      {/* Checkbox for select mode */}
      {selectMode && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(node.path)}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 cursor-pointer"
        />
      )}

      {/* Value preview (resolve aliases for display) */}
      <ValuePreview type={node.$type} value={displayValue} />

      {/* Name and info */}
      <div
        className="flex-1 min-w-0"
        onClick={selectMode ? () => onToggleSelect(node.path) : undefined}
        style={selectMode ? { cursor: 'pointer' } : undefined}
      >
        <div className="flex items-center gap-1.5">
          {syncChanged && (
            <span
              title="Changed locally since last sync"
              className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0 cursor-default"
            />
          )}
          <span className="text-[11px] text-[var(--color-figma-text)] truncate" title={node.path}>{node.name}</span>
          {node.$type && (
            <button
              onClick={e => { e.stopPropagation(); onFilterByType?.(node.$type!); }}
              title={`Filter by type: ${node.$type}`}
              className={`px-1 py-0.5 rounded text-[8px] font-medium uppercase token-type-${node.$type} cursor-pointer hover:opacity-80`}
            >
              {node.$type}
            </button>
          )}
          {isAlias(node.$value) && (
            <button
              onClick={handleAliasClick}
              className={`flex items-center gap-0.5 px-1 py-0.5 rounded border text-[8px] transition-colors ${aliasError ? 'border-[var(--color-figma-error)] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]'}`}
              title={aliasError ? 'Token not found — broken alias' : `Navigate to ${node.$value}`}
            >
              <span>{(node.$value as string).slice(1, -1)}</span>
              <svg width="6" height="6" viewBox="0 0 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1 3h4M3 1l2 2-2 2"/>
              </svg>
            </button>
          )}
        </div>
        {node.$description && (
          <div className="text-[9px] text-[var(--color-figma-text-secondary)] truncate">{node.$description}</div>
        )}
      </div>

      {/* Value text */}
      <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0 max-w-[80px] truncate">
        {formatValue(node.$type, displayValue)}
      </span>
      {/* Duplicate annotation */}
      {(() => {
        const count = duplicateCounts.get(JSON.stringify(node.$value));
        return count ? (
          <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] shrink-0" title={`${count} tokens share this value`}>
            ×{count}
          </span>
        ) : null;
      })()}

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
              className={`text-[8px] px-1 py-0.5 rounded border shrink-0 transition-colors ${
                v.severity === 'error'
                  ? 'border-[var(--color-figma-error)] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10'
                  : v.severity === 'warning'
                  ? 'border-yellow-500 text-yellow-700 bg-yellow-50'
                  : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]'
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
          title={chainExpanded ? 'Collapse alias chain' : `Resolves through ${aliasChain.length} aliases`}
          className={`text-[8px] px-1 py-0.5 rounded border shrink-0 transition-colors ${chainExpanded ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]'}`}
        >
          via {aliasChain.length}
        </button>
      )}

      {/* Actions (on hover, not in select mode) */}
      {!selectMode && hovered && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={handleApplyToSelection}
            title="Apply to selection"
            className="p-1 rounded hover:bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)]"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5l7 7-7 7M5 12h14" />
            </svg>
          </button>
          <button
            onClick={handleCopyPath}
            title={copiedWhat === 'path' ? 'Copied!' : `Copy CSS var (--${node.path.replace(/\./g, '-')})`}
            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
          >
            {copiedWhat === 'path' ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            )}
          </button>
          <button
            onClick={handleCopyValue}
            title={copiedWhat === 'value' ? 'Copied!' : 'Copy resolved value'}
            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
          >
            {copiedWhat === 'value' ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h10M4 17h7"/>
              </svg>
            )}
          </button>
          <button
            onClick={() => onEdit(node.path)}
            title="Edit token"
            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(node.path)}
            title="Delete token"
            className="p-1 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-error)]"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
              const parentPath = node.path.includes('.')
                ? node.path.substring(0, node.path.lastIndexOf('.'))
                : '';
              onCreateSibling?.(parentPath, node.$type || 'color');
            }}
          >
            Create sibling
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
              Extract to alias
            </button>
          )}
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

function ValuePreview({ type, value }: { type?: string; value?: any }) {
  // Unresolved alias — degrade gracefully
  if (typeof value === 'string' && value.startsWith('{')) {
    return <div className="w-4 h-4 shrink-0" />;
  }

  if (type === 'color' && typeof value === 'string') {
    return (
      <div
        className="w-4 h-4 rounded border border-[var(--color-figma-border)] shrink-0"
        style={{ backgroundColor: value }}
      />
    );
  }

  if (type === 'typography' && typeof value === 'object' && value !== null) {
    const fontFamily = value.fontFamily || 'inherit';
    const fontWeight = value.fontWeight || 400;
    const sizeVal = typeof value.fontSize === 'object' && value.fontSize !== null
      ? `${value.fontSize.value}${value.fontSize.unit}`
      : value.fontSize ? `${value.fontSize}px` : '12px';
    return (
      <div
        className="w-6 h-4 rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center overflow-hidden bg-[var(--color-figma-bg)]"
        title={`${fontFamily} ${sizeVal} / ${fontWeight}`}
        style={{ fontFamily, fontWeight, fontSize: '9px', lineHeight: 1 }}
      >
        Aa
      </div>
    );
  }

  if (type === 'shadow' && typeof value === 'object' && value !== null) {
    const shadow = Array.isArray(value) ? value[0] : value;
    if (shadow && typeof shadow === 'object') {
      const { color = '#00000040', offsetX, offsetY, blur, spread } = shadow;
      const ox = typeof offsetX === 'object' ? `${offsetX.value}${offsetX.unit}` : (offsetX ?? '0px');
      const oy = typeof offsetY === 'object' ? `${offsetY.value}${offsetY.unit}` : (offsetY ?? '4px');
      const b = typeof blur === 'object' ? `${blur.value}${blur.unit}` : (blur ?? '8px');
      const s = typeof spread === 'object' ? `${spread.value}${spread.unit}` : (spread ?? '0px');
      return (
        <div
          className="w-4 h-4 rounded shrink-0 bg-[var(--color-figma-bg)]"
          style={{ boxShadow: `${ox} ${oy} ${b} ${s} ${color}` }}
        />
      );
    }
  }

  if (type === 'fontFamily' && typeof value === 'string' && value) {
    return (
      <div
        className="w-8 h-4 rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center overflow-hidden bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]"
        title={value}
        style={{ fontFamily: value, fontSize: '9px', lineHeight: 1 }}
      >
        Aa
      </div>
    );
  }

  if (type === 'fontWeight' && typeof value === 'number') {
    return (
      <div
        className="w-8 h-4 rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center overflow-hidden bg-[var(--color-figma-bg)] text-[var(--color-figma-text)]"
        title={String(value)}
        style={{ fontWeight: value, fontSize: '9px', lineHeight: 1 }}
      >
        Aa
      </div>
    );
  }

  if (type === 'gradient') {
    let gradientCss: string | null = null;
    if (typeof value === 'string' && value.includes('gradient')) {
      gradientCss = value;
    } else if (typeof value === 'object' && value !== null && Array.isArray(value.stops)) {
      const stops = (value.stops as Array<{ color: string; position?: number }>)
        .map(s => `${s.color}${s.position != null ? ` ${Math.round(s.position * 100)}%` : ''}`)
        .join(', ');
      gradientCss = `linear-gradient(to right, ${stops})`;
    }
    if (gradientCss) {
      return (
        <div
          className="w-6 h-4 rounded border border-[var(--color-figma-border)] shrink-0"
          style={{ background: gradientCss }}
        />
      );
    }
  }

  if (type === 'fontFamily' && typeof value === 'string' && value) {
    const family = value.split(',')[0].trim();
    return (
      <span
        className="text-[11px] text-[var(--color-figma-text)] shrink-0 truncate max-w-[80px]"
        style={{ fontFamily: value }}
        title={value}
      >
        {family}
      </span>
    );
  }

  if (type === 'fontWeight' && typeof value === 'number') {
    return (
      <span
        className="text-[11px] text-[var(--color-figma-text)] shrink-0"
        style={{ fontWeight: value }}
        title={String(value)}
      >
        Aa
      </span>
    );
  }

  return <div className="w-4 h-4 shrink-0" />;
}

function formatValue(type?: string, value?: any): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    if ('value' in value && 'unit' in value) return `${value.value}${value.unit}`;
    if (type === 'typography' && value.fontSize) {
      const size = typeof value.fontSize === 'object' ? `${value.fontSize.value}${value.fontSize.unit}` : `${value.fontSize}px`;
      return `${value.fontFamily || ''} ${size}`;
    }
    if (type === 'shadow') return 'Shadow';
    if (type === 'border') return 'Border';
    return JSON.stringify(value).slice(0, 30);
  }
  return String(value);
}

function filterByDuplicatePaths(nodes: TokenNode[], paths: Set<string>): TokenNode[] {
  const result: TokenNode[] = [];
  for (const node of nodes) {
    if (node.isGroup) {
      const filtered = filterByDuplicatePaths(node.children ?? [], paths);
      if (filtered.length > 0) result.push({ ...node, children: filtered });
    } else if (paths.has(node.path)) {
      result.push(node);
    }
  }
  return result;
}

function filterTokenNodes(
  nodes: TokenNode[],
  searchQuery: string,
  typeFilter: string,
  refFilter: 'all' | 'aliases' | 'direct',
): TokenNode[] {
  const q = searchQuery.toLowerCase();
  const result: TokenNode[] = [];
  for (const node of nodes) {
    if (node.isGroup) {
      const filteredChildren = filterTokenNodes(node.children ?? [], searchQuery, typeFilter, refFilter);
      if (filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren });
      }
    } else {
      const matchesSearch = !q || node.path.toLowerCase().includes(q) || node.name.toLowerCase().includes(q);
      const matchesType = !typeFilter || node.$type === typeFilter;
      const matchesRef = refFilter === 'all'
        || (refFilter === 'aliases' && isAlias(node.$value))
        || (refFilter === 'direct' && !isAlias(node.$value));
      if (matchesSearch && matchesType && matchesRef) result.push(node);
    }
  }
  return result;
}

function sortTokenNodes(nodes: TokenNode[], order: SortOrder): TokenNode[] {
  if (order === 'default' || order === 'by-usage') return nodes;
  const sorted = [...nodes].sort((a, b) => {
    switch (order) {
      case 'alpha-asc': return a.name.localeCompare(b.name);
      case 'alpha-desc': return b.name.localeCompare(a.name);
      case 'by-type': {
        const tc = (a.$type || '').localeCompare(b.$type || '');
        return tc !== 0 ? tc : a.name.localeCompare(b.name);
      }
      case 'by-value': {
        const av = typeof a.$value === 'string' ? a.$value : JSON.stringify(a.$value ?? '');
        const bv = typeof b.$value === 'string' ? b.$value : JSON.stringify(b.$value ?? '');
        return av.localeCompare(bv);
      }
      default: return 0;
    }
  });
  return sorted.map(node => ({
    ...node,
    children: node.children ? sortTokenNodes(node.children, order) : undefined,
  }));
}

function collectGroupPathsByDepth(nodes: TokenNode[], maxExpandDepth: number, depth = 0): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.isGroup && depth < maxExpandDepth) {
      paths.push(node.path);
      if (node.children) {
        paths.push(...collectGroupPathsByDepth(node.children, maxExpandDepth, depth + 1));
      }
    }
  }
  return paths;
}

function collectAllGroupPaths(nodes: TokenNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.isGroup) {
      paths.push(node.path);
      if (node.children) paths.push(...collectAllGroupPaths(node.children));
    }
  }
  return paths;
}

function countLeaves(node: TokenNode): number {
  if (!node.isGroup || !node.children) return node.isGroup ? 0 : 1;
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

function flattenLeafNodes(nodes: TokenNode[]): TokenNode[] {
  const result: TokenNode[] = [];
  const walk = (list: TokenNode[]) => {
    for (const node of list) {
      if (!node.isGroup) result.push(node);
      else if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return result;
}

function findLeafByPath(nodes: TokenNode[], path: string): TokenNode | null {
  for (const node of nodes) {
    if (!node.isGroup && node.path === path) return node;
    if (node.children) {
      const found = findLeafByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function collectGroupLeaves(nodes: TokenNode[], groupPath: string): Array<{ path: string; data: { $type?: string; $value?: any; $description?: string } }> {
  const result: Array<{ path: string; data: { $type?: string; $value?: any; $description?: string } }> = [];
  const walk = (list: TokenNode[]) => {
    for (const node of list) {
      if (!node.isGroup && (node.path === groupPath || node.path.startsWith(`${groupPath}.`))) {
        result.push({ path: node.path, data: { $type: node.$type, $value: node.$value, $description: node.$description } });
      }
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return result;
}

function getDefaultValue(type: string): any {
  switch (type) {
    case 'color': return '#000000';
    case 'dimension': return { value: 16, unit: 'px' };
    case 'typography': return { fontFamily: 'Inter', fontSize: { value: 16, unit: 'px' }, fontWeight: 400, lineHeight: 1.5, letterSpacing: { value: 0, unit: 'px' } };
    case 'shadow': return { color: '#00000040', offsetX: { value: 0, unit: 'px' }, offsetY: { value: 4, unit: 'px' }, blur: { value: 8, unit: 'px' }, spread: { value: 0, unit: 'px' }, type: 'dropShadow' };
    case 'border': return { color: '#000000', width: { value: 1, unit: 'px' }, style: 'solid' };
    case 'gradient': return { type: 'linear', stops: [{ color: '#000000', position: 0 }, { color: '#ffffff', position: 1 }] };
    case 'duration': return { value: 200, unit: 'ms' };
    case 'fontFamily': return 'Inter';
    case 'fontWeight': return 400;
    case 'strokeStyle': return 'solid';
    case 'number': return 0;
    case 'string': return '';
    case 'boolean': return false;
    default: return '';
  }
}
