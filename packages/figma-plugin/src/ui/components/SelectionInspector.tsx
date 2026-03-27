import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  PROPERTY_GROUPS,
  PROPERTY_LABELS,
  ALL_BINDABLE_PROPERTIES,
  TOKEN_PROPERTY_MAP,
} from '../../shared/types';
import type { BindableProperty, SelectionNodeInfo, NodeCapabilities, SyncCompleteMessage, TokenMapEntry } from '../../shared/types';
import { resolveTokenValue } from '../../shared/resolveAlias';
import { nodeParentPath } from './tokenListUtils';
import { RemapAutocompleteInput } from './RemapAutocompleteInput';
import type { UndoSlot } from '../hooks/useUndo';
import { adaptShortcut } from '../shared/utils';

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
}

function shouldShowGroup(condition: string | undefined, caps: NodeCapabilities): boolean {
  if (!condition) return true;
  return caps[condition as keyof NodeCapabilities] ?? false;
}

function getBindingForProperty(nodes: SelectionNodeInfo[], prop: BindableProperty): string | null | 'mixed' {
  if (nodes.length === 0) return null;
  const first = nodes[0].bindings[prop] || null;
  for (let i = 1; i < nodes.length; i++) {
    const val = nodes[i].bindings[prop] || null;
    if (val !== first) return 'mixed';
  }
  return first;
}

function getCurrentValue(nodes: SelectionNodeInfo[], prop: BindableProperty): any {
  if (nodes.length === 0) return undefined;
  return nodes[0].currentValues[prop];
}

function getMergedCapabilities(nodes: SelectionNodeInfo[]): NodeCapabilities {
  if (nodes.length === 0) {
    return { hasFills: false, hasStrokes: false, hasAutoLayout: false, isText: false, hasEffects: false };
  }
  return {
    hasFills: nodes.some(n => n.capabilities.hasFills),
    hasStrokes: nodes.some(n => n.capabilities.hasStrokes),
    hasAutoLayout: nodes.some(n => n.capabilities.hasAutoLayout),
    isText: nodes.some(n => n.capabilities.isText),
    hasEffects: nodes.some(n => n.capabilities.hasEffects),
  };
}

function formatCurrentValue(prop: BindableProperty, value: any): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (prop === 'opacity') return `${Math.round(value * 100)}%`;
    return `${Math.round(value * 100) / 100}`;
  }
  if (typeof value === 'string') return value;
  return '';
}

function getTokenTypeForProperty(prop: BindableProperty): string {
  if (prop === 'fill' || prop === 'stroke') return 'color';
  if (['width', 'height', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
       'itemSpacing', 'cornerRadius', 'strokeWeight'].includes(prop)) return 'dimension';
  if (prop === 'opacity') return 'number';
  if (prop === 'typography') return 'typography';
  if (prop === 'shadow') return 'shadow';
  if (prop === 'visible') return 'boolean';
  console.warn(`[SelectionInspector] getTokenTypeForProperty: unhandled property "${prop}", falling back to "string"`);
  return 'string';
}

// Returns all token types that can bind to a given property (some props accept multiple types)
function getCompatibleTokenTypes(prop: BindableProperty): string[] {
  return Object.entries(TOKEN_PROPERTY_MAP)
    .filter(([, props]) => (props as BindableProperty[]).includes(prop))
    .map(([type]) => type);
}

function getTokenValueFromProp(prop: BindableProperty, currentValue: any): any {
  const type = getTokenTypeForProperty(prop);
  if (type === 'color') return typeof currentValue === 'string' ? currentValue : '#000000';
  if (type === 'dimension') {
    const num = typeof currentValue === 'number' ? currentValue : 0;
    return { value: Math.round(num * 100) / 100, unit: 'px' };
  }
  if (type === 'number') return typeof currentValue === 'number' ? currentValue : 0;
  if (type === 'boolean') return typeof currentValue === 'boolean' ? currentValue : true;
  return currentValue ?? '';
}

function formatTokenValuePreview(prop: BindableProperty, currentValue: any): string {
  const type = getTokenTypeForProperty(prop);
  if (type === 'color') return typeof currentValue === 'string' ? currentValue : '#000000';
  if (type === 'dimension') {
    const num = typeof currentValue === 'number' ? currentValue : 0;
    return `${Math.round(num * 100) / 100}px`;
  }
  if (type === 'number') return String(typeof currentValue === 'number' ? currentValue : 0);
  if (type === 'boolean') return String(currentValue);
  return formatCurrentValue(prop, currentValue);
}

const SUGGESTED_NAMES: Record<BindableProperty, string> = {
  fill: 'color.fill-color',
  stroke: 'color.stroke-color',
  width: 'size.width',
  height: 'size.height',
  paddingTop: 'spacing.padding-top',
  paddingRight: 'spacing.padding-right',
  paddingBottom: 'spacing.padding-bottom',
  paddingLeft: 'spacing.padding-left',
  itemSpacing: 'spacing.item-spacing',
  cornerRadius: 'radius.corner-radius',
  strokeWeight: 'border.stroke-weight',
  opacity: 'opacity.opacity',
  typography: 'typography.text-style',
  shadow: 'shadow.box-shadow',
  visible: 'other.visibility',
};

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
}: SelectionInspectorProps) {
  const [creatingFromProp, setCreatingFromProp] = useState<BindableProperty | null>(null);
  const [newTokenName, setNewTokenName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdTokenPath, setCreatedTokenPath] = useState<string | null>(null);
  const [freshSyncResult, setFreshSyncResult] = useState<SyncCompleteMessage | null>(null);

  // Inline bind-existing-token state
  const [bindingFromProp, setBindingFromProp] = useState<BindableProperty | null>(null);
  const [bindQuery, setBindQuery] = useState('');
  const [bindSelectedIndex, setBindSelectedIndex] = useState(-1);
  const [lastBoundProp, setLastBoundProp] = useState<BindableProperty | null>(null);
  const [deepInspect, setDeepInspect] = useState(false);

  // Remap bindings state
  const [showRemapPanel, setShowRemapPanel] = useState(false);
  const [remapRows, setRemapRows] = useState<{ from: string; to: string }[]>([{ from: '', to: '' }]);
  const [remapScope, setRemapScope] = useState<'selection' | 'page'>('page');
  const [remapRunning, setRemapRunning] = useState(false);
  const [remapResult, setRemapResult] = useState<{ updatedBindings: number; updatedNodes: number } | null>(null);
  const [remapError, setRemapError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);
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

  // Split selected nodes into directly-selected (depth 0) vs deep children (depth 1+)
  const rootNodes = selectedNodes.filter(n => (n.depth ?? 0) === 0);
  const deepChildNodes = selectedNodes.filter(n => (n.depth ?? 0) > 0);

  const hasSelection = rootNodes.length > 0;
  const caps = getMergedCapabilities(rootNodes);

  // Capture sync result for freshness badge (outlives the 3s global clear)
  useEffect(() => {
    if (syncResult) setFreshSyncResult(syncResult);
  }, [syncResult]);

  // Listen for remap-complete messages from the plugin controller
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg?.type === 'remap-complete') {
        setRemapRunning(false);
        if (msg.error) {
          setRemapError(msg.error);
          setRemapResult(null);
        } else {
          setRemapResult({ updatedBindings: msg.updatedBindings, updatedNodes: msg.updatedNodes });
          setRemapError(null);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Clear freshness and cancel any open inline panels when the selected nodes change
  useEffect(() => {
    const ids = rootNodes.map(n => n.id).join(',');
    if (ids !== prevNodeIdsRef.current) {
      prevNodeIdsRef.current = ids;
      setFreshSyncResult(null);
      setBindingFromProp(null);
      setBindQuery('');
      setLastBoundProp(null);
      setCreatingFromProp(null);
      setNewTokenName('');
      setCreateError('');
      setRemapResult(null);
      setRemapError(null);
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

  useLayoutEffect(() => {
    if (creatingFromProp && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [creatingFromProp]);

  const handleRemoveBinding = (prop: BindableProperty) => {
    const binding = getBindingForProperty(selectedNodes, prop);
    parent.postMessage({ pluginMessage: { type: 'remove-binding', property: prop } }, '*');
    if (binding && binding !== 'mixed' && onPushUndo) {
      const entry = tokenMap[binding];
      const tokenType = entry?.$type ?? getTokenTypeForProperty(prop);
      const resolved = entry ? resolveTokenValue(entry.$value, entry.$type, tokenMap) : { value: null };
      const resolvedValue = resolved.value;
      onPushUndo({
        description: `Removed binding "${binding}" from ${PROPERTY_LABELS[prop]}`,
        restore: async () => {
          parent.postMessage({
            pluginMessage: {
              type: 'apply-to-selection',
              tokenPath: binding,
              tokenType,
              targetProperty: prop,
              resolvedValue,
            },
          }, '*');
        },
      });
    }
  };

  const cancelCreate = () => {
    setCreatingFromProp(null);
    setNewTokenName('');
    setCreateError('');
    setCreatedTokenPath(null);
  };

  const cancelBind = () => {
    setBindingFromProp(null);
    setBindQuery('');
    setBindSelectedIndex(-1);
  };

  const openRemapPanel = (prefill?: string[]) => {
    const rows = prefill && prefill.length > 0
      ? prefill.map(p => ({ from: p, to: '' }))
      : [{ from: '', to: '' }];
    setRemapRows(rows);
    setRemapResult(null);
    setRemapError(null);
    setShowRemapPanel(true);
  };

  const handleRemap = () => {
    const validEntries: Record<string, string> = {};
    for (const row of remapRows) {
      if (row.from.trim() && row.to.trim() && row.from.trim() !== row.to.trim()) {
        validEntries[row.from.trim()] = row.to.trim();
      }
    }
    if (Object.keys(validEntries).length === 0) return;
    setRemapRunning(true);
    setRemapResult(null);
    setRemapError(null);
    parent.postMessage({ pluginMessage: { type: 'remap-bindings', remapMap: validEntries, scope: remapScope } }, '*');
  };

  const openCreateFromProp = (prop: BindableProperty) => {
    cancelBind();
    setCreatingFromProp(prop);
    setNewTokenName(SUGGESTED_NAMES[prop] || 'token.new-token');
  };

  const openBindFromProp = (prop: BindableProperty) => {
    cancelCreate();
    setBindingFromProp(prop);
    // Pre-populate with parent group to surface sibling tokens when remapping
    const currentBinding = getBindingForProperty(rootNodes, prop);
    if (currentBinding && currentBinding !== 'mixed') {
      const leafName = tokenMap[currentBinding]?.$name;
      setBindQuery(leafName ? nodeParentPath(currentBinding, leafName) : '');
    } else {
      setBindQuery('');
    }
    setBindSelectedIndex(-1);
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
  };

  const handleCreateToken = async () => {
    if (!creatingFromProp || !newTokenName.trim() || !connected || !activeSet) return;
    const pathTrimmed = newTokenName.trim();
    if (!/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/.test(pathTrimmed)) {
      setCreateError('Path must be dot-separated segments of letters, numbers, - and _');
      return;
    }
    const currentValue = getCurrentValue(selectedNodes, creatingFromProp);
    const tokenType = getTokenTypeForProperty(creatingFromProp);
    const tokenValue = getTokenValueFromProp(creatingFromProp, currentValue);
    const tokenPath = newTokenName.trim();

    setCreating(true);
    try {
      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${tokenPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $type: tokenType, $value: tokenValue }),
      });
      if (res.ok) {
        parent.postMessage({
          pluginMessage: {
            type: 'apply-to-selection',
            tokenPath,
            tokenType,
            targetProperty: creatingFromProp,
            resolvedValue: tokenValue,
          },
        }, '*');
        setCreatingFromProp(null);
        setNewTokenName('');
        setCreateError('');
        setCreatedTokenPath(tokenPath);
        onTokenCreated();
      } else {
        let detail = `Server error (${res.status})`;
        try {
          const body = await res.json();
          if (body.error) detail = body.error;
        } catch { /* use default detail */ }
        setCreateError(detail);
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Network request failed');
    } finally {
      setCreating(false);
    }
  };

  const headerLabel = !hasSelection
    ? 'Select a layer to inspect'
    : rootNodes.length === 1
    ? `${rootNodes[0].name} (${rootNodes[0].type})`
    : `${rootNodes.length} layers selected`;

  const hasAnyTokens = Object.keys(tokenMap).length > 0;

  // No selection — full empty state
  if (!hasSelection) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)] opacity-40" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
        <div>
          <p className="text-[11px] font-medium text-[var(--color-figma-text)]">No layer selected</p>
          <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-1 leading-relaxed">
            Select a layer on the canvas to inspect its token bindings.
          </p>
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
        {/* Remap bindings button — always visible, useful after token rename */}
        <button
          onClick={() => {
            if (showRemapPanel) {
              setShowRemapPanel(false);
            } else {
              openRemapPanel(freshSyncResult?.missingTokens ?? []);
            }
          }}
          title="Bulk-remap token binding paths (useful after renaming tokens)"
          className={`ml-auto text-[9px] px-1.5 py-0.5 rounded transition-colors ${
            showRemapPanel
              ? 'bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)] font-medium'
              : 'bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
          }`}
        >
          Remap
        </button>
      </div>

      {/* Remap bindings panel */}
      {showRemapPanel && (
        <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-semibold text-[var(--color-figma-text)] uppercase tracking-wide">Remap Bindings</span>
            <div className="flex items-center gap-1">
              {/* Scope toggle */}
              <button
                onClick={() => setRemapScope(s => s === 'selection' ? 'page' : 'selection')}
                className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg)] transition-colors"
                title="Toggle scope between selection (including children) and entire page"
              >
                {remapScope === 'selection' ? 'Selection' : 'Page'}
              </button>
            </div>
          </div>

          {/* Mapping rows */}
          <div className="flex flex-col gap-1 mb-1.5">
            {remapRows.map((row, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <RemapAutocompleteInput
                  value={row.from}
                  onChange={v => setRemapRows(rows => rows.map((r, i) => i === idx ? { ...r, from: v } : r))}
                  placeholder="old.token.path"
                  tokenMap={tokenMap}
                />
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-text-secondary)]" aria-hidden="true">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
                <RemapAutocompleteInput
                  value={row.to}
                  onChange={v => setRemapRows(rows => rows.map((r, i) => i === idx ? { ...r, to: v } : r))}
                  placeholder="new.token.path"
                  tokenMap={tokenMap}
                />
                {remapRows.length > 1 && (
                  <button
                    onClick={() => setRemapRows(rows => rows.filter((_, i) => i !== idx))}
                    className="shrink-0 p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error,#f56565)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                    title="Remove row"
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setRemapRows(rows => [...rows, { from: '', to: '' }])}
              className="text-[9px] text-[var(--color-figma-accent)] hover:underline"
            >
              + Add row
            </button>
            <div className="flex items-center gap-1.5">
              {remapError && (
                <span className="text-[9px] text-[var(--color-figma-error)]" title={remapError}>
                  Error: {remapError.length > 40 ? remapError.slice(0, 40) + '…' : remapError}
                </span>
              )}
              {!remapError && remapResult && (
                <span className={`text-[9px] ${remapResult.updatedBindings > 0 ? 'text-[var(--color-figma-success)]' : 'text-[var(--color-figma-text-secondary)]'}`}>
                  {remapResult.updatedBindings > 0
                    ? `${remapResult.updatedBindings} binding${remapResult.updatedBindings !== 1 ? 's' : ''} remapped`
                    : 'No matches found'}
                </span>
              )}
              <button
                onClick={handleRemap}
                disabled={remapRunning || remapRows.every(r => !r.from.trim() || !r.to.trim())}
                className="text-[9px] px-2 py-0.5 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
              >
                {remapRunning ? 'Remapping…' : 'Remap'}
              </button>
            </div>
          </div>
        </div>
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
                {visibleProps.map(prop => {
                  const binding = getBindingForProperty(rootNodes, prop);
                  const value = getCurrentValue(rootNodes, prop);

                  let resolvedDisplay: string | null = null;
                  let resolvedColor: string | null = null;
                  if (binding && binding !== 'mixed' && tokenMap[binding]) {
                    const entry = tokenMap[binding];
                    const resolved = resolveTokenValue(entry.$value, entry.$type, tokenMap);
                    if (resolved.value != null) {
                      if (typeof resolved.value === 'string') {
                        resolvedDisplay = resolved.value;
                        if (resolved.value.startsWith('#')) resolvedColor = resolved.value;
                      } else if (typeof resolved.value === 'object' && 'value' in resolved.value && 'unit' in resolved.value) {
                        resolvedDisplay = `${resolved.value.value}${resolved.value.unit}`;
                      }
                    }
                  }

                  const swatchColor = resolvedColor ?? ((prop === 'fill' || prop === 'stroke') && typeof value === 'string' && value.startsWith('#') ? value : null);
                  const isBound = binding && binding !== 'mixed';
                  const isMixed = binding === 'mixed';
                  const isUnbound = !binding || isMixed;
                  const isThisPropActive = creatingFromProp === prop || bindingFromProp === prop;
                  const hasExtractableValue = value !== undefined && value !== null && connected && isUnbound && activeSet && !isThisPropActive;
                  const canBind = !isBound && !isMixed && connected && hasAnyTokens && !isThisPropActive;
                  const canChangeBind = isBound && connected && hasAnyTokens && !isThisPropActive;

                  // Compute bind candidates here so they're accessible in both the input onKeyDown and the list render
                  const compatibleTypesForBind = bindingFromProp === prop ? getCompatibleTokenTypes(prop) : [];
                  const bindCandidatesAll = bindingFromProp === prop
                    ? Object.entries(tokenMap)
                        .filter(([, entry]) => compatibleTypesForBind.includes(entry.$type))
                        .filter(([path]) => !bindQuery || path.toLowerCase().includes(bindQuery.toLowerCase()))
                    : [];
                  const bindCandidates = bindCandidatesAll.slice(0, 12);
                  const bindTotalCount = bindCandidatesAll.length;
                  const bindHasMore = bindTotalCount > 12;

                  return (
                    <div key={prop}>
                      {/* Property row */}
                      <div
                        className={`flex items-center gap-1.5 px-2 py-1 rounded group transition-colors ${
                          isBound
                            ? 'bg-[var(--color-figma-accent)]/5 hover:bg-[var(--color-figma-accent)]/10'
                            : isThisPropActive
                            ? 'bg-[var(--color-figma-bg-hover)]'
                            : 'hover:bg-[var(--color-figma-bg-hover)]'
                        }`}
                      >
                        {/* Color swatch */}
                        {swatchColor ? (
                          <div
                            className="w-4 h-4 rounded border border-[var(--color-figma-border)] ring-1 ring-white/50 ring-inset shrink-0"
                            style={{ backgroundColor: swatchColor }}
                          />
                        ) : (
                          <div className="w-4 h-4 shrink-0" />
                        )}

                        {/* Property name + value */}
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-[var(--color-figma-text)] font-medium w-[72px] shrink-0 truncate">
                              {PROPERTY_LABELS[prop]}
                            </span>
                            {isBound ? (
                              <span className="text-[10px] text-[var(--color-figma-text-secondary)] truncate" title={resolvedDisplay ?? undefined}>
                                {resolvedDisplay ?? formatCurrentValue(prop, value)}
                              </span>
                            ) : isMixed ? (
                              <span className="text-[10px] text-[var(--color-figma-warning,#f5a623)] italic">Mixed</span>
                            ) : (
                              <span className="text-[10px] text-[var(--color-figma-text-secondary)] truncate">
                                {formatCurrentValue(prop, value)}
                              </span>
                            )}
                          </div>
                          {isBound && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-accent)]" aria-hidden="true">
                                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                              </svg>
                              <span className="text-[9px] text-[var(--color-figma-accent)] font-mono truncate" title={binding as string}>
                                {binding as string}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Actions — post-bind flash or faint buttons */}
                        {lastBoundProp === prop ? (
                          <div className="flex items-center gap-1 shrink-0 text-[9px] text-[var(--color-figma-success,#18a058)]">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                            Bound
                          </div>
                        ) : (
                        <div className="flex items-center gap-0.5 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                          {isBound && onNavigateToToken && (
                            <button
                              onClick={() => onNavigateToToken(binding as string)}
                              title="Go to token"
                              className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                              </svg>
                            </button>
                          )}
                          {isBound && (
                            <button
                              onClick={() => handleRemoveBinding(prop)}
                              title="Remove binding"
                              className="p-1 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] transition-colors"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                          {canChangeBind && (
                            <button
                              onClick={() => openBindFromProp(prop)}
                              title="Remap to another token"
                              className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          )}
                          {canBind && (
                            <button
                              onClick={() => openBindFromProp(prop)}
                              title="Bind existing token"
                              className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                              </svg>
                            </button>
                          )}
                          {hasExtractableValue && (
                            <button
                              onClick={() => openCreateFromProp(prop)}
                              title="Create token from this value"
                              className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M12 5v14M5 12h14" />
                              </svg>
                            </button>
                          )}
                        </div>
                        )}
                      </div>

                      {/* Inline: bind existing token */}
                      {bindingFromProp === prop && (
                        <div className="mx-2 mb-1.5 rounded border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-bg)] overflow-hidden">
                          <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--color-figma-border)]/50 bg-[var(--color-figma-accent)]/5">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-accent)] shrink-0" aria-hidden="true">
                              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                            </svg>
                            <span className="text-[9px] text-[var(--color-figma-accent)] font-medium flex-1">
                              {isBound ? `Remap ${PROPERTY_LABELS[prop]}` : `Bind ${PROPERTY_LABELS[prop]}`}
                            </span>
                            <button
                              onClick={cancelBind}
                              className="p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                              title="Cancel"
                            >
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          {isBound && binding && binding !== 'mixed' && (
                            <div className="flex items-center gap-1.5 px-2 py-1 border-b border-[var(--color-figma-border)]/50 bg-[var(--color-figma-bg-secondary)]">
                              {swatchColor && (
                                <div className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0" style={{ backgroundColor: swatchColor }} />
                              )}
                              <span className="text-[9px] font-mono text-[var(--color-figma-text)] truncate flex-1" title={binding as string}>{binding as string}</span>
                              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)] shrink-0" aria-hidden="true">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                              </svg>
                              <span className="text-[8px] text-[var(--color-figma-text-secondary)] italic shrink-0">pick replacement</span>
                            </div>
                          )}
                          <div className="px-2 py-1.5 flex flex-col gap-1">
                            <input
                              autoFocus
                              value={bindQuery}
                              onChange={e => { setBindQuery(e.target.value); setBindSelectedIndex(-1); }}
                              onKeyDown={e => {
                                if (e.key === 'Escape') { cancelBind(); return; }
                                if (e.key === 'ArrowDown') { e.preventDefault(); setBindSelectedIndex(i => Math.min(i + 1, bindCandidates.length - 1)); return; }
                                if (e.key === 'ArrowUp') { e.preventDefault(); setBindSelectedIndex(i => Math.max(i - 1, 0)); return; }
                                if (e.key === 'Enter' && bindCandidates.length > 0) {
                                  const target = bindSelectedIndex >= 0 ? bindCandidates[bindSelectedIndex] : bindCandidates[0];
                                  if (target) handleBindToken(prop, target[0]);
                                }
                              }}
                              placeholder={`Search ${compatibleTypesForBind.join(' / ')} tokens…`}
                              className="w-full px-2 py-1 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text)] outline-none focus:border-[var(--color-figma-accent)]"
                            />
                            {bindCandidates.length === 0 ? (
                              <div className="text-[9px] text-[var(--color-figma-text-secondary)] py-1 text-center">
                                {bindQuery ? 'No matching tokens' : `No ${compatibleTypesForBind.join(' or ')} tokens in set`}
                              </div>
                            ) : (
                              <div className="max-h-[156px] overflow-y-auto flex flex-col gap-px">
                                {bindCandidates.map(([path, entry], idx) => {
                                  let resolvedColorSwatch: string | null = null;
                                  let resolvedValueDisplay: string | null = null;
                                  const r = resolveTokenValue(entry.$value, entry.$type, tokenMap);
                                  if (entry.$type === 'color') {
                                    if (typeof r.value === 'string' && r.value.startsWith('#')) resolvedColorSwatch = r.value;
                                  } else if ((entry.$type === 'dimension' || entry.$type === 'number') && r.value != null) {
                                    const v = r.value as any;
                                    resolvedValueDisplay = typeof v === 'object' && 'value' in v ? `${v.value}${v.unit}` : String(v);
                                  }
                                  const isSelected = idx === bindSelectedIndex;
                                  const isCurrent = isBound && path === binding;
                                  return (
                                    <button
                                      key={path}
                                      onClick={() => handleBindToken(prop, path)}
                                      className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-left transition-colors group/item ${isSelected ? 'bg-[var(--color-figma-accent)]/15' : 'hover:bg-[var(--color-figma-accent)]/10'} ${isCurrent ? 'opacity-50' : ''}`}
                                    >
                                      {resolvedColorSwatch ? (
                                        <div
                                          className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                                          style={{ backgroundColor: resolvedColorSwatch }}
                                        />
                                      ) : (
                                        <div className="w-3 h-3 shrink-0 flex items-center justify-center">
                                          <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-figma-text-secondary)]/40" />
                                        </div>
                                      )}
                                      <span className={`text-[9px] font-mono truncate flex-1 ${isSelected ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text)] group-hover/item:text-[var(--color-figma-accent)]'}`}>
                                        {path}
                                      </span>
                                      {isCurrent && (
                                        <span className="text-[7px] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] px-1 py-0.5 rounded shrink-0">current</span>
                                      )}
                                      {resolvedValueDisplay && !isCurrent && (
                                        <span className="text-[8px] text-[var(--color-figma-text-secondary)] shrink-0 font-mono">
                                          {resolvedValueDisplay}
                                        </span>
                                      )}
                                      <span className="text-[8px] text-[var(--color-figma-text-secondary)] shrink-0">
                                        {entry.$type}
                                      </span>
                                    </button>
                                  );
                                })}
                                {bindHasMore && (
                                  <div className="text-[9px] text-[var(--color-figma-text-secondary)] text-center py-1 border-t border-[var(--color-figma-border)]">
                                    {bindTotalCount - 12} more — type to refine
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Inline: create token from value */}
                      {creatingFromProp === prop && (
                        <div className="mx-2 mb-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] overflow-hidden">
                          <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--color-figma-border)]/50 bg-[var(--color-figma-bg-secondary)]">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)] shrink-0" aria-hidden="true">
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                            <span className="text-[9px] text-[var(--color-figma-text)] font-medium flex-1">
                              Create token from {PROPERTY_LABELS[prop]}
                            </span>
                            <button
                              onClick={cancelCreate}
                              className="p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                              title="Cancel"
                            >
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          <div className="px-2 py-1.5 flex flex-col gap-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0">Value:</span>
                              {(prop === 'fill' || prop === 'stroke') &&
                               typeof getCurrentValue(rootNodes, prop) === 'string' &&
                               getCurrentValue(rootNodes, prop).startsWith('#') && (
                                <div
                                  className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                                  style={{ backgroundColor: getCurrentValue(rootNodes, prop) }}
                                />
                              )}
                              <span className="text-[9px] text-[var(--color-figma-text)] font-mono truncate">
                                {formatTokenValuePreview(prop, getCurrentValue(rootNodes, prop))}
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <label className="text-[9px] text-[var(--color-figma-text-secondary)]">Token path (set: {activeSet})</label>
                              <input
                                ref={nameInputRef}
                                value={newTokenName}
                                onChange={e => { setNewTokenName(e.target.value); setCreateError(''); }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleCreateToken();
                                  if (e.key === 'Escape') cancelCreate();
                                }}
                                placeholder="group.token-name"
                                className={`w-full px-2 py-1 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)] ${createError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
                              />
                              {createError && <div className="text-[9px] text-[var(--color-figma-error)]">{createError}</div>}
                            </div>
                            <div className="flex gap-1.5 justify-end">
                              <button
                                onClick={cancelCreate}
                                className="px-2 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleCreateToken}
                                disabled={!newTokenName.trim() || creating}
                                className="px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
                              >
                                {creating ? 'Creating…' : 'Create & bind'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
          </div>
        )}

        {/* Deep inspect: nested layers with token bindings */}
        {deepInspect && deepChildNodes.length > 0 && (
          <div className="mt-1 pt-1 border-t border-[var(--color-figma-border)]/50">
            <div className="px-2 py-1 text-[9px] text-[var(--color-figma-text-secondary)] font-semibold uppercase tracking-wide flex items-center gap-1">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <path d="M9 22V12h6v10" />
              </svg>
              Nested Layers ({deepChildNodes.length})
            </div>
            {deepChildNodes.map(child => {
              const boundProps = ALL_BINDABLE_PROPERTIES.filter(p => child.bindings[p]);
              if (boundProps.length === 0) return null;
              const indent = Math.min((child.depth ?? 1) - 1, 3);
              return (
                <div
                  key={child.id}
                  className="group px-2 py-1.5 hover:bg-[var(--color-figma-bg-hover)] rounded"
                  style={{ paddingLeft: `${8 + indent * 10}px` }}
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)] shrink-0" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                    </svg>
                    <span className="text-[9px] font-medium text-[var(--color-figma-text)] truncate flex-1" title={child.name}>
                      {child.name}
                    </span>
                    <span className="text-[8px] text-[var(--color-figma-text-secondary)] shrink-0 uppercase tracking-wide">
                      {child.type}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 pl-3">
                    {boundProps.map(prop => {
                      const tokenPath = child.bindings[prop];
                      const entry = tokenMap[tokenPath];
                      let swatchColor: string | null = null;
                      if (entry?.$type === 'color') {
                        const r = resolveTokenValue(entry.$value, entry.$type, tokenMap);
                        if (typeof r.value === 'string' && r.value.startsWith('#')) swatchColor = r.value;
                      }
                      return (
                        <div key={prop} className="flex items-center gap-1">
                          {swatchColor ? (
                            <div className="w-2.5 h-2.5 rounded-sm border border-[var(--color-figma-border)] shrink-0" style={{ backgroundColor: swatchColor }} />
                          ) : (
                            <div className="w-2.5 h-2.5 shrink-0" />
                          )}
                          <span className="text-[8px] text-[var(--color-figma-text-secondary)] w-[60px] shrink-0 truncate">
                            {PROPERTY_LABELS[prop]}
                          </span>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-accent)] shrink-0" aria-hidden="true">
                            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
                          </svg>
                          <span className="text-[8px] text-[var(--color-figma-accent)] font-mono truncate flex-1" title={tokenPath}>
                            {tokenPath}
                          </span>
                          {onNavigateToToken && (
                            <button
                              onClick={() => onNavigateToToken(tokenPath)}
                              title="Go to token"
                              className="p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                            >
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                              </svg>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {deepInspect && deepChildNodes.length === 0 && hasSelection && (
          <div className="mt-1 pt-1 border-t border-[var(--color-figma-border)]/50 px-3 py-2 text-center">
            <p className="text-[9px] text-[var(--color-figma-text-secondary)]">No token bindings found in nested layers.</p>
          </div>
        )}
      </div>

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
