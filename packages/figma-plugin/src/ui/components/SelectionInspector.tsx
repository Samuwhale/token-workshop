import { useState, useEffect, useRef, useCallback } from 'react';
import {
  PROPERTY_GROUPS,
  PROPERTY_LABELS,
  ALL_BINDABLE_PROPERTIES,
} from '../../shared/types';
import type { BindableProperty, SelectionNodeInfo, SyncCompleteMessage, TokenMapEntry, LayerSearchResult } from '../../shared/types';
import { resolveTokenValue } from '../../shared/resolveAlias';
import type { UndoSlot } from '../hooks/useUndo';
import { adaptShortcut } from '../shared/utils';
import {
  shouldShowGroup,
  getBindingForProperty,
  getCurrentValue,
  getMergedCapabilities,
  getTokenTypeForProperty,
  getNextUnboundProperty,
  buildRemoveBindingUndo,
  SUGGESTED_NAMES,
  suggestTokenPath,
} from './selectionInspectorUtils';
import { PropertyRow } from './PropertyRow';
import { DeepInspectSection } from './DeepInspectSection';
import { RemapBindingsPanel } from './RemapBindingsPanel';
import { ExtractTokensPanel } from './ExtractTokensPanel';

/* ── Layer Search Panel ─────────────────────────────── */

function LayerSearchPanel({ onSelect }: { onSelect: (nodeId: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Listen for search results from the plugin
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg?.type === 'search-layers-result') {
        setResults(msg.results);
        setSearching(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      parent.postMessage({ pluginMessage: { type: 'search-layers', query: value } }, '*');
    }, 200);
  }, []);

  const NODE_TYPE_ICONS: Record<string, string> = {
    FRAME: '▢', TEXT: 'T', RECTANGLE: '□', ELLIPSE: '○', COMPONENT: '◆',
    INSTANCE: '◇', GROUP: '⊞', VECTOR: '✦', LINE: '─', STAR: '★',
    POLYGON: '⬠', BOOLEAN_OPERATION: '⊕', SECTION: '§',
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-secondary)] pointer-events-none" aria-hidden="true">
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          placeholder="Search layers by name, type, or component…"
          className="w-full pl-7 pr-2 py-1.5 text-[10px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-secondary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
        />
        {query && (
          <button
            onClick={() => handleQueryChange('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            aria-label="Clear search"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {searching && results.length === 0 && (
        <p className="text-[9px] text-[var(--color-figma-text-secondary)] px-1 py-2">Searching…</p>
      )}

      {!searching && query && results.length === 0 && (
        <p className="text-[9px] text-[var(--color-figma-text-secondary)] px-1 py-2">No layers found matching "{query}"</p>
      )}

      {results.length > 0 && (
        <div className="max-h-[200px] overflow-y-auto border border-[var(--color-figma-border)] rounded bg-[var(--color-figma-bg)]">
          {results.map(layer => (
            <button
              key={layer.id}
              onClick={() => onSelect(layer.id)}
              className="w-full flex items-center gap-1.5 px-2 py-1 text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors group border-b border-[var(--color-figma-border)]/30 last:border-b-0"
            >
              <span className="text-[9px] text-[var(--color-figma-text-secondary)] w-3 text-center shrink-0" title={layer.type}>
                {NODE_TYPE_ICONS[layer.type] || '·'}
              </span>
              <span className="text-[10px] text-[var(--color-figma-text)] truncate flex-1">{layer.name}</span>
              {layer.parentName && (
                <span className="text-[8px] text-[var(--color-figma-text-secondary)] truncate max-w-[80px]" title={`in ${layer.parentName}`}>
                  in {layer.parentName}
                </span>
              )}
              {layer.boundCount > 0 && (
                <span className="text-[8px] bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] px-1 py-0.5 rounded-full shrink-0">
                  {layer.boundCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface SelectionInspectorProps {
  selectedNodes: SelectionNodeInfo[];
  tokenMap: Record<string, TokenMapEntry>;
  onSync: (scope: 'page' | 'selection') => void;
  syncing: boolean;
  syncProgress: { processed: number; total: number } | null;
  syncResult: SyncCompleteMessage | null;
  syncError?: string | null;
  connected: boolean;
  activeSet: string;
  serverUrl: string;
  onTokenCreated: () => void;
  onNavigateToToken?: (tokenPath: string) => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onGoToTokens?: () => void;
  /** Increment to trigger create-from-first-property (Cmd+T shortcut) */
  triggerCreateToken?: number;
}

export function SelectionInspector({
  selectedNodes,
  tokenMap,
  onSync,
  syncing,
  syncProgress,
  syncResult,
  syncError,
  connected,
  activeSet,
  serverUrl,
  onTokenCreated,
  onNavigateToToken,
  onPushUndo,
  onGoToTokens,
  triggerCreateToken,
}: SelectionInspectorProps) {
  const [creatingFromProp, setCreatingFromProp] = useState<BindableProperty | null>(null);
  const [newTokenName, setNewTokenName] = useState('');
  const [createdTokenPath, setCreatedTokenPath] = useState<string | null>(null);
  const [freshSyncResult, setFreshSyncResult] = useState<SyncCompleteMessage | null>(null);

  // Inline bind-existing-token state
  const [bindingFromProp, setBindingFromProp] = useState<BindableProperty | null>(null);
  const [lastBoundProp, setLastBoundProp] = useState<BindableProperty | null>(null);
  const [deepInspect, setDeepInspect] = useState(false);

  // Remap bindings state
  const [showRemapPanel, setShowRemapPanel] = useState(false);

  // Extract tokens from selection state
  const [showExtractPanel, setShowExtractPanel] = useState(false);
  const [showLayerSearch, setShowLayerSearch] = useState(false);

  const prevNodeIdsRef = useRef<string>('');

  // Keyboard shortcut: Cmd+Shift+D to toggle deep inspect
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'd') {
        e.preventDefault();
        setDeepInspect(prev => {
          const next = !prev;
          parent.postMessage({ pluginMessage: { type: 'set-deep-inspect', enabled: next } }, '*');
          return next;
        });
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Cmd+T: open create-from-first-unbound-property
  useEffect(() => {
    if (!triggerCreateToken) return;
    const nodes = selectedNodes.filter(n => (n.depth ?? 0) === 0);
    if (nodes.length === 0 || !connected || !activeSet) return;
    const mergedCaps = getMergedCapabilities(nodes);
    const firstUnbound = getNextUnboundProperty(null, nodes, mergedCaps);
    // Fallback to first visible property with a value if all are bound
    let firstEligible: BindableProperty | null = null;
    if (!firstUnbound) {
      for (const group of PROPERTY_GROUPS) {
        if (!shouldShowGroup(group.condition, mergedCaps)) continue;
        for (const prop of group.properties) {
          const value = getCurrentValue(nodes, prop);
          if (value !== undefined && value !== null) { firstEligible = prop; break; }
        }
        if (firstEligible) break;
      }
    }
    const target = firstUnbound ?? firstEligible;
    if (target) {
      setBindingFromProp(null);
      setCreatingFromProp(target);
      setNewTokenName(SUGGESTED_NAMES[target] || 'token.new-token');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerCreateToken]);

  // Split selected nodes into directly-selected (depth 0) vs deep children (depth 1+)
  const rootNodes = selectedNodes.filter(n => (n.depth ?? 0) === 0);
  const deepChildNodes = selectedNodes.filter(n => (n.depth ?? 0) > 0);

  const hasSelection = rootNodes.length > 0;
  const caps = getMergedCapabilities(rootNodes);

  // Capture sync result for freshness badge (outlives the 3s global clear)
  useEffect(() => {
    if (syncResult) setFreshSyncResult(syncResult);
  }, [syncResult]);

  // Clear freshness and cancel any open inline panels when the selected nodes change
  useEffect(() => {
    const ids = rootNodes.map(n => n.id).join(',');
    if (ids !== prevNodeIdsRef.current) {
      prevNodeIdsRef.current = ids;
      setFreshSyncResult(null);
      setBindingFromProp(null);
      setLastBoundProp(null);
      setCreatingFromProp(null);
      setNewTokenName('');
      setShowExtractPanel(false);
    }
  }, [selectedNodes]);

  const totalBindings = hasSelection
    ? ALL_BINDABLE_PROPERTIES.reduce((sum, prop) => {
        const b = getBindingForProperty(rootNodes, prop);
        return sum + (b && b !== 'mixed' ? 1 : 0);
      }, 0)
    : 0;

  const mixedBindings = hasSelection && rootNodes.length > 1
    ? ALL_BINDABLE_PROPERTIES.reduce((sum, prop) => {
        return sum + (getBindingForProperty(rootNodes, prop) === 'mixed' ? 1 : 0);
      }, 0)
    : 0;

  const handleRemoveBinding = (prop: BindableProperty) => {
    const binding = getBindingForProperty(selectedNodes, prop);
    parent.postMessage({ pluginMessage: { type: 'remove-binding', property: prop } }, '*');
    if (binding && binding !== 'mixed' && onPushUndo) {
      onPushUndo(buildRemoveBindingUndo(binding, prop, tokenMap));
    }
  };

  const handleClearAllBindings = () => {
    const boundProps: Array<{ prop: BindableProperty; tokenPath: string; tokenType: string; resolvedValue: any }> = [];
    for (const prop of ALL_BINDABLE_PROPERTIES) {
      const binding = getBindingForProperty(rootNodes, prop);
      if (binding && binding !== 'mixed') {
        const entry = tokenMap[binding];
        const tokenType = entry?.$type ?? getTokenTypeForProperty(prop);
        const resolved = entry ? resolveTokenValue(entry.$value, entry.$type, tokenMap) : { value: null };
        boundProps.push({ prop, tokenPath: binding, tokenType, resolvedValue: resolved.value });
      }
    }
    parent.postMessage({ pluginMessage: { type: 'clear-all-bindings' } }, '*');
    if (boundProps.length > 0 && onPushUndo) {
      onPushUndo({
        description: `Cleared ${boundProps.length} binding${boundProps.length !== 1 ? 's' : ''}`,
        restore: async () => {
          for (const { prop, tokenPath, tokenType, resolvedValue } of boundProps) {
            parent.postMessage({
              pluginMessage: {
                type: 'apply-to-selection',
                tokenPath,
                tokenType,
                targetProperty: prop,
                resolvedValue,
              },
            }, '*');
          }
        },
      });
    }
  };

  const cancelCreate = () => {
    setCreatingFromProp(null);
    setNewTokenName('');
    setCreatedTokenPath(null);
  };

  const cancelBind = () => {
    setBindingFromProp(null);
  };

  const openCreateFromProp = (prop: BindableProperty) => {
    cancelBind();
    setCreatingFromProp(prop);
    const singleNode = rootNodes.length === 1 ? rootNodes[0] : null;
    const suggested = singleNode?.name
      ? suggestTokenPath(prop, singleNode.name)
      : SUGGESTED_NAMES[prop] || 'token.new-token';
    setNewTokenName(suggested);
  };

  const openBindFromProp = (prop: BindableProperty) => {
    cancelCreate();
    setBindingFromProp(prop);
  };

  const handleBindToken = (prop: BindableProperty, tokenPath: string) => {
    const entry = tokenMap[tokenPath];
    if (!entry) return;
    const oldBinding = getBindingForProperty(selectedNodes, prop);
    const resolved = resolveTokenValue(entry.$value, entry.$type, tokenMap);
    parent.postMessage({
      pluginMessage: {
        type: 'apply-to-selection',
        tokenPath,
        tokenType: entry.$type,
        targetProperty: prop,
        resolvedValue: resolved.value,
      },
    }, '*');
    if (onPushUndo) {
      onPushUndo({
        description: `Bound "${tokenPath}" to ${PROPERTY_LABELS[prop]}`,
        restore: async () => {
          if (oldBinding && oldBinding !== 'mixed') {
            const prevEntry = tokenMap[oldBinding];
            const prevResolved = prevEntry ? resolveTokenValue(prevEntry.$value, prevEntry.$type, tokenMap) : { value: null };
            parent.postMessage({
              pluginMessage: {
                type: 'apply-to-selection',
                tokenPath: oldBinding,
                tokenType: prevEntry?.$type ?? entry.$type,
                targetProperty: prop,
                resolvedValue: prevResolved.value,
              },
            }, '*');
          } else {
            parent.postMessage({ pluginMessage: { type: 'remove-binding', property: prop } }, '*');
          }
        },
      });
    }
    cancelBind();
    setLastBoundProp(prop);
    setTimeout(() => setLastBoundProp(prev => prev === prop ? null : prev), 1500);

    // Auto-advance: open bind panel on next unbound property
    // We need to treat the just-bound property as bound for the advance check,
    // so pass afterProp to skip past it and find the next unbound one.
    const nextUnbound = getNextUnboundProperty(prop, rootNodes, caps);
    if (nextUnbound) {
      // Small delay so the "Bound" flash is visible before the next panel opens
      setTimeout(() => {
        setBindingFromProp(prev => {
          // Only advance if user hasn't manually opened a different panel
          if (prev === null) return nextUnbound;
          return prev;
        });
      }, 300);
    }
  };

  const handleTokenCreated = (tokenPath: string, prop: BindableProperty, tokenType: string, tokenValue: any) => {
    parent.postMessage({
      pluginMessage: {
        type: 'apply-to-selection',
        tokenPath,
        tokenType,
        targetProperty: prop,
        resolvedValue: tokenValue,
      },
    }, '*');
    setCreatingFromProp(null);
    setNewTokenName('');
    setCreatedTokenPath(tokenPath);
    onTokenCreated();

    // Auto-advance: open bind panel on next unbound property
    const nextUnbound = getNextUnboundProperty(prop, rootNodes, caps);
    if (nextUnbound) {
      setTimeout(() => {
        setBindingFromProp(prev => {
          if (prev === null) return nextUnbound;
          return prev;
        });
      }, 300);
    }
  };

  const headerLabel = !hasSelection
    ? 'Select a layer to inspect'
    : rootNodes.length === 1
    ? `${rootNodes[0].name} (${rootNodes[0].type})`
    : `${rootNodes.length} layers selected`;

  const handleSelectLayer = useCallback((nodeId: string) => {
    parent.postMessage({ pluginMessage: { type: 'select-node', nodeId } }, '*');
    setShowLayerSearch(false);
  }, []);

  const hasAnyTokens = Object.keys(tokenMap).length > 0;

  // Check if all visible properties with values are bound (no more unbound to advance to)
  const allPropertiesBound = hasSelection && totalBindings > 0 && getNextUnboundProperty(null, rootNodes, caps) === null;

  // No selection — full empty state
  if (!hasSelection) {
    return (
      <div className="flex-1 flex flex-col gap-3 px-4 pt-4">
        <LayerSearchPanel onSelect={handleSelectLayer} />
        <div className="flex flex-col items-center justify-center gap-3 px-2 pt-4 text-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)] opacity-40" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
          <div>
            <p className="text-[11px] font-medium text-[var(--color-figma-text)]">No layer selected</p>
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-1 leading-relaxed">
              Search above or select a layer on the canvas to inspect its token bindings.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Check if there are any visible properties (bindings or current values)
  const hasVisibleProperties = PROPERTY_GROUPS.some(group => {
    if (!shouldShowGroup(group.condition, caps)) return false;
    return group.properties.some(prop => {
      const binding = getBindingForProperty(rootNodes, prop);
      const value = getCurrentValue(rootNodes, prop);
      return binding || value !== undefined;
    });
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
        <button
          onClick={() => setShowLayerSearch(prev => !prev)}
          title="Search layers on this page"
          className={`p-0.5 rounded transition-colors shrink-0 ${
            showLayerSearch
              ? 'text-[var(--color-figma-accent)]'
              : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
          }`}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
        </button>
        <span className="text-[10px] font-medium text-[var(--color-figma-text)] truncate flex-1">
          {headerLabel}
        </span>
        {(totalBindings > 0 || mixedBindings > 0) && (
          <span className="text-[9px] shrink-0 flex items-center gap-1">
            {totalBindings > 0 && (
              <span className="bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] px-1.5 py-0.5 rounded-full font-medium">
                {selectedNodes.length > 1
                  ? `${totalBindings} shared`
                  : `${totalBindings} bound`
                }
              </span>
            )}
            {mixedBindings > 0 && (
              <span className="bg-[var(--color-figma-warning,#f5a623)]/15 text-[var(--color-figma-warning,#f5a623)] px-1.5 py-0.5 rounded-full font-medium">
                {mixedBindings} mixed
              </span>
            )}
          </span>
        )}
      </div>

      {/* Layer search panel */}
      {showLayerSearch && (
        <div className="px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shrink-0">
          <LayerSearchPanel onSelect={handleSelectLayer} />
        </div>
      )}

      {/* Sync controls */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shrink-0">
        {/* Deep inspect toggle */}
        <button
          onClick={() => {
            const next = !deepInspect;
            setDeepInspect(next);
            parent.postMessage({ pluginMessage: { type: 'set-deep-inspect', enabled: next } }, '*');
          }}
          title={deepInspect ? `Deep inspect on — showing nested children (${adaptShortcut('⌘⇧D')})` : `Enable deep inspect to show nested children (${adaptShortcut('⌘⇧D')})`}
          className={`text-[9px] px-1.5 py-0.5 rounded transition-colors mr-1 ${
            deepInspect
              ? 'bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)] font-medium'
              : 'bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
          }`}
        >
          Deep
        </button>
        {syncing && syncProgress ? (
          <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
            Syncing... {syncProgress.processed}/{syncProgress.total} layers
          </span>
        ) : syncError ? (
          <span className="text-[9px] text-[var(--color-figma-error)]" title={syncError}>
            Sync failed — {syncError}
          </span>
        ) : syncResult ? (
          <span className={`text-[9px] ${syncResult.errors > 0 ? 'text-[var(--color-figma-error)]' : syncResult.missingTokens.length > 0 ? 'text-[var(--color-figma-warning,#f5a623)]' : 'text-[var(--color-figma-success)]'}`}
            title={syncResult.errors > 0 ? `${syncResult.errors} binding(s) could not be applied — the token type may not be compatible with the layer property` : undefined}
          >
            {syncResult.errors > 0
              ? `${syncResult.errors} binding${syncResult.errors !== 1 ? 's' : ''} failed — check token types`
              : syncResult.updated === 0 && syncResult.missingTokens.length === 0
                ? 'Up to date'
                : `Updated ${syncResult.updated} binding${syncResult.updated !== 1 ? 's' : ''}${syncResult.missingTokens.length > 0 ? ` (${syncResult.missingTokens.length} missing)` : ''}`
            }
          </span>
        ) : (
          <>
            {freshSyncResult && freshSyncResult.missingTokens.length === 0 && (
              <span className="text-[9px] text-[var(--color-figma-success)] select-none" title="Bindings are up to date">✓</span>
            )}
            {totalBindings > 0 && connected && (
              <button
                onClick={(e) => { e.stopPropagation(); onSync('selection'); }}
                disabled={syncing}
                className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20 transition-colors disabled:opacity-50"
              >
                Sync Selection
              </button>
            )}
            {connected && (
              <button
                onClick={(e) => { e.stopPropagation(); onSync('page'); }}
                disabled={syncing}
                className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg)] transition-colors disabled:opacity-50"
              >
                Sync Page
              </button>
            )}
          </>
        )}
        {/* Extract tokens from selection button */}
        {connected && activeSet && (
          <button
            onClick={() => { setShowExtractPanel(prev => !prev); setShowRemapPanel(false); }}
            title="Extract tokens from selected layers (fills, fonts, dimensions, shadows, borders)"
            className={`ml-auto text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              showExtractPanel
                ? 'bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)] font-medium'
                : 'bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
            }`}
          >
            Extract
          </button>
        )}
        {/* Remap bindings button */}
        <button
          onClick={() => { setShowRemapPanel(prev => !prev); setShowExtractPanel(false); }}
          title="Bulk-remap token binding paths (useful after renaming tokens)"
          className={`${!connected || !activeSet ? 'ml-auto ' : ''}text-[9px] px-1.5 py-0.5 rounded transition-colors ${
            showRemapPanel
              ? 'bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)] font-medium'
              : 'bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
          }`}
        >
          Remap
        </button>
        {totalBindings > 0 && (
          <button
            onClick={handleClearAllBindings}
            title={`Remove all ${totalBindings} binding${totalBindings !== 1 ? 's' : ''} from selection`}
            className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error,#f56565)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Remap bindings panel */}
      {showRemapPanel && (
        <RemapBindingsPanel
          tokenMap={tokenMap}
          initialMissingTokens={freshSyncResult?.missingTokens}
          onClose={() => setShowRemapPanel(false)}
        />
      )}

      {/* Extract tokens panel */}
      {showExtractPanel && (
        <ExtractTokensPanel
          connected={connected}
          activeSet={activeSet}
          serverUrl={serverUrl}
          tokenMap={tokenMap}
          onTokenCreated={onTokenCreated}
          onClose={() => setShowExtractPanel(false)}
        />
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-1 pb-1">
        {!hasVisibleProperties && totalBindings === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)] opacity-40" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            <p className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">No tokens applied</p>
            <p className="text-[9px] text-[var(--color-figma-text-secondary)] leading-relaxed">
              Apply tokens from the Tokens tab to see bindings here.
            </p>
            {onGoToTokens && (
              <button
                onClick={onGoToTokens}
                className="mt-1 text-[9px] text-[var(--color-figma-accent)] hover:underline"
              >
                Go to Tokens →
              </button>
            )}
          </div>
        ) : (
          <div>
          {PROPERTY_GROUPS.map((group, groupIdx) => {
            if (!shouldShowGroup(group.condition, caps)) return null;

            const visibleProps = group.properties.filter(prop => {
              const binding = getBindingForProperty(rootNodes, prop);
              const value = getCurrentValue(rootNodes, prop);
              return binding || value !== undefined;
            });

            if (visibleProps.length === 0) return null;

            return (
              <div key={group.label} className={groupIdx > 0 ? 'mt-1 pt-1 border-t border-[var(--color-figma-border)]/50' : ''}>
                <div className="px-2 py-1 text-[9px] text-[var(--color-figma-text-secondary)] font-semibold uppercase tracking-wide">
                  {group.label}
                </div>
                {visibleProps.map(prop => (
                  <PropertyRow
                    key={prop}
                    prop={prop}
                    rootNodes={rootNodes}
                    selectedNodes={selectedNodes}
                    tokenMap={tokenMap}
                    connected={connected}
                    activeSet={activeSet}
                    serverUrl={serverUrl}
                    hasAnyTokens={hasAnyTokens}
                    creatingFromProp={creatingFromProp}
                    bindingFromProp={bindingFromProp}
                    lastBoundProp={lastBoundProp}
                    onOpenCreate={openCreateFromProp}
                    onOpenBind={openBindFromProp}
                    onCancelCreate={cancelCreate}
                    onCancelBind={cancelBind}
                    onBindToken={handleBindToken}
                    onTokenCreated={handleTokenCreated}
                    onRemoveBinding={handleRemoveBinding}
                    onNavigateToToken={onNavigateToToken}
                    newTokenName={newTokenName}
                    onNewTokenNameChange={setNewTokenName}
                  />
                ))}
              </div>
            );
          })}
          </div>
        )}

        {/* Deep inspect: nested layers with token bindings */}
        {deepInspect && (
          <DeepInspectSection
            deepChildNodes={deepChildNodes}
            tokenMap={tokenMap}
            onNavigateToToken={onNavigateToToken}
          />
        )}
      </div>

      {/* All bound — advance to next layer */}
      {allPropertiesBound && rootNodes.length === 1 && (
        <div className="border-t border-[var(--color-figma-border)] px-3 py-2 flex items-center gap-2 bg-[var(--color-figma-success,#18a058)]/5 shrink-0">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-success,#18a058)]" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <span className="text-[10px] text-[var(--color-figma-text)] font-medium flex-1">All properties bound</span>
          <button
            onClick={() => parent.postMessage({ pluginMessage: { type: 'select-next-sibling' } }, '*')}
            className="text-[9px] px-2 py-1 rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20 transition-colors font-medium"
          >
            Next layer →
          </button>
        </div>
      )}

      {/* Create success banner */}
      {createdTokenPath && (
        <div className="border-t border-[var(--color-figma-border)] px-3 py-2 flex items-center gap-2 bg-[var(--color-figma-bg)]">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-success,#18a058)]" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <span className="text-[9px] text-[var(--color-figma-text)] font-mono truncate flex-1" title={createdTokenPath}>{createdTokenPath}</span>
          {onNavigateToToken && (
            <button
              onClick={() => { onNavigateToToken(createdTokenPath); setCreatedTokenPath(null); }}
              className="text-[9px] text-[var(--color-figma-accent)] hover:underline shrink-0"
            >
              Go to token →
            </button>
          )}
          <button
            onClick={() => setCreatedTokenPath(null)}
            className="p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] shrink-0"
            title="Dismiss"
            aria-label="Dismiss"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
