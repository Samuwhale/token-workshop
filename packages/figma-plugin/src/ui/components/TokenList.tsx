import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { TokenNode } from '../hooks/useTokens';
import { PropertyPicker } from './PropertyPicker';
import { ConfirmModal } from './ConfirmModal';
import { TOKEN_PROPERTY_MAP } from '../../shared/types';
import type { BindableProperty, NodeCapabilities, SelectionNodeInfo, TokenMapEntry } from '../../shared/types';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';
import type { UndoSlot } from '../hooks/useUndo';

type SortOrder = 'default' | 'alpha-asc' | 'alpha-desc' | 'by-type' | 'by-value' | 'by-usage';

interface TokenListProps {
  tokens: TokenNode[];
  setName: string;
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
}

type DeleteConfirm =
  | { type: 'token'; path: string }
  | { type: 'group'; path: string; name: string; tokenCount: number }
  | { type: 'bulk'; paths: string[]; orphanCount: number };

export function TokenList({ tokens, setName, serverUrl, connected, selectedNodes, allTokensFlat, onEdit, onRefresh, onPushUndo, defaultCreateOpen, highlightedToken, onNavigateToAlias, onClearHighlight }: TokenListProps) {
  const [showCreateForm, setShowCreateForm] = useState(defaultCreateOpen ?? false);
  const [newTokenPath, setNewTokenPath] = useState('');
  const [newTokenType, setNewTokenType] = useState('color');
  const [siblingPrefix, setSiblingPrefix] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

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

  const displayedTokens = useMemo(() => {
    let result = filtersActive ? filterTokenNodes(sortedTokens, searchQuery, typeFilter, refFilter) : sortedTokens;
    if (showDuplicates) result = filterByDuplicatePaths(result, duplicateValuePaths);
    return result;
  }, [sortedTokens, searchQuery, typeFilter, refFilter, filtersActive, showDuplicates, duplicateValuePaths]);

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

  const handleCreate = async () => {
    if (!newTokenPath || !connected) return;
    try {
      await fetch(`${serverUrl}/api/tokens/${setName}/${newTokenPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          $type: newTokenType,
          $value: getDefaultValue(newTokenType),
        }),
      });
      setShowCreateForm(false);
      setNewTokenPath('');
      setSiblingPrefix(null);
      onRefresh();
    } catch (err) {
      console.error('Failed to create token:', err);
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
              <button
                onClick={requestBulkDelete}
                className="px-2 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-error)] text-white hover:opacity-90 transition-opacity"
              >
                Delete {selectedPaths.size}
              </button>
            )}
            <button
              onClick={() => { setSelectMode(false); setSelectedPaths(new Set()); }}
              className="px-2 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Toolbar: expand/collapse + sort */}
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
          <div className={`flex items-center gap-1 px-2 py-1.5 border-b border-[var(--color-figma-border)] ${filtersActive ? 'bg-[var(--color-figma-accent)]/8' : 'bg-[var(--color-figma-bg)]'}`}>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search tokens…"
              className="flex-1 min-w-0 px-2 py-1 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-tertiary)]"
            />
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              title="Filter by type"
              className={`px-1 py-1 rounded border text-[10px] outline-none cursor-pointer ${typeFilter ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)]'}`}
            >
              <option value="">All types</option>
              {availableTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={refFilter}
              onChange={e => setRefFilter(e.target.value as 'all' | 'aliases' | 'direct')}
              title="Filter by reference"
              className={`px-1 py-1 rounded border text-[10px] outline-none cursor-pointer ${refFilter !== 'all' ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)]'}`}
            >
              <option value="all">All refs</option>
              <option value="aliases">Aliases only</option>
              <option value="direct">Direct only</option>
            </select>
            <button
              onClick={() => setShowDuplicates(!showDuplicates)}
              title="Show only tokens with duplicate raw values"
              className={`px-1.5 py-1 rounded border text-[10px] whitespace-nowrap transition-colors ${showDuplicates ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
            >
              Dup. values
            </button>
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

        {tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--color-figma-text-secondary)]">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <p className="mt-2 text-[12px]">No tokens yet</p>
            <p className="text-[10px]">Create a token or import from Figma</p>
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
              onChange={e => setNewTokenPath(e.target.value)}
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
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
              <option value="number">Number</option>
              <option value="string">String</option>
              <option value="boolean">Boolean</option>
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newTokenPath}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
              >
                Create
              </button>
              <button
                onClick={() => { setShowCreateForm(false); setNewTokenPath(''); setSiblingPrefix(null); }}
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
            {!selectMode && tokens.length > 0 && (
              <button
                onClick={() => setSelectMode(true)}
                className="px-2.5 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[10px] hover:bg-[var(--color-figma-bg-hover)]"
                title="Select tokens for bulk actions"
              >
                Select
              </button>
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
    return (
      <div>
        <div
          className="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-[var(--color-figma-bg-hover)] transition-colors group/group"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => onToggleExpand(node.path)}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="currentColor"
          >
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
          <span className="text-[11px] font-medium text-[var(--color-figma-text)] flex-1">{node.name}</span>
          {node.children && (
            <span className="text-[9px] text-[var(--color-figma-text-secondary)] ml-1">
              ({leafCount} tokens)
            </span>
          )}
          {!selectMode && (
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteGroup(node.path, node.name, leafCount); }}
              title="Delete group"
              className="opacity-0 group-hover/group:opacity-100 p-1 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-error)] transition-opacity"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          )}
        </div>
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
      onMouseEnter={() => setHovered(true)}
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
          <span className="text-[11px] text-[var(--color-figma-text)] truncate">{node.name}</span>
          {node.$type && (
            <span className={`px-1 py-0.5 rounded text-[8px] font-medium uppercase token-type-${node.$type}`}>
              {node.$type}
            </span>
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
          className="fixed z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg py-1 min-w-[140px]"
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
          <React.Fragment key={hop}>
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
          </React.Fragment>
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
    case 'number': return 0;
    case 'string': return '';
    case 'boolean': return false;
    default: return '';
  }
}
