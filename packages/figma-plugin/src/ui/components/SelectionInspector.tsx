import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  PROPERTY_GROUPS,
  PROPERTY_LABELS,
  ALL_BINDABLE_PROPERTIES,
} from '../../shared/types';
import type { BindableProperty, SelectionNodeInfo, NodeCapabilities, SyncCompleteMessage, TokenMapEntry } from '../../shared/types';
import { resolveTokenValue } from '../../shared/resolveAlias';
import type { UndoSlot } from '../hooks/useUndo';

interface SelectionInspectorProps {
  selectedNodes: SelectionNodeInfo[];
  tokenMap: Record<string, TokenMapEntry>;
  onSync: (scope: 'page' | 'selection') => void;
  syncing: boolean;
  syncProgress: { processed: number; total: number } | null;
  syncResult: SyncCompleteMessage | null;
  connected: boolean;
  activeSet: string;
  serverUrl: string;
  onTokenCreated: () => void;
  onNavigateToToken?: (tokenPath: string) => void;
  onPushUndo?: (slot: UndoSlot) => void;
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
  connected,
  activeSet,
  serverUrl,
  onTokenCreated,
  onNavigateToToken,
  onPushUndo,
}: SelectionInspectorProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [creatingFromProp, setCreatingFromProp] = useState<BindableProperty | null>(null);
  const [newTokenName, setNewTokenName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdTokenPath, setCreatedTokenPath] = useState<string | null>(null);
  const [freshSyncResult, setFreshSyncResult] = useState<SyncCompleteMessage | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const prevNodeIdsRef = useRef<string>('');

  const hasSelection = selectedNodes.length > 0;
  const caps = getMergedCapabilities(selectedNodes);

  // Auto-expand when a layer is selected; auto-collapse when deselected
  useEffect(() => {
    setCollapsed(!hasSelection);
  }, [hasSelection]);

  // Capture sync result for freshness badge (outlives the 3s global clear)
  useEffect(() => {
    if (syncResult) setFreshSyncResult(syncResult);
  }, [syncResult]);

  // Clear freshness when the selected nodes change
  useEffect(() => {
    const ids = selectedNodes.map(n => n.id).join(',');
    if (ids !== prevNodeIdsRef.current) {
      prevNodeIdsRef.current = ids;
      setFreshSyncResult(null);
    }
  }, [selectedNodes]);

  const totalBindings = hasSelection
    ? ALL_BINDABLE_PROPERTIES.reduce((sum, prop) => {
        const b = getBindingForProperty(selectedNodes, prop);
        return sum + (b && b !== 'mixed' ? 1 : 0);
      }, 0)
    : 0;

  const mixedBindings = hasSelection && selectedNodes.length > 1
    ? ALL_BINDABLE_PROPERTIES.reduce((sum, prop) => {
        return sum + (getBindingForProperty(selectedNodes, prop) === 'mixed' ? 1 : 0);
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

  const openCreateFromProp = (prop: BindableProperty) => {
    setCreatingFromProp(prop);
    setNewTokenName(SUGGESTED_NAMES[prop] || 'token.new-token');
  };

  const cancelCreate = () => {
    setCreatingFromProp(null);
    setNewTokenName('');
    setCreateError('');
    setCreatedTokenPath(null);
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
      const res = await fetch(`${serverUrl}/api/tokens/${activeSet}/${tokenPath}`, {
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
      }
    } finally {
      setCreating(false);
    }
  };

  const headerLabel = !hasSelection
    ? 'Select a layer to inspect'
    : selectedNodes.length === 1
    ? `${selectedNodes[0].name} (${selectedNodes[0].type})`
    : `${selectedNodes.length} layers selected`;

  return (
    <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col shrink-0">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 px-3 py-1.5 w-full text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors"
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          className={`transition-transform shrink-0 ${collapsed || !hasSelection ? '' : 'rotate-90'}`}
          fill="currentColor"
        >
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
        <span className="text-[10px] font-medium text-[var(--color-figma-text)] truncate flex-1">
          {headerLabel}
        </span>
        {(totalBindings > 0 || mixedBindings > 0) && (
          <span className="text-[9px] text-[var(--color-figma-accent)] shrink-0">
            {selectedNodes.length > 1
              ? [
                  totalBindings > 0 && `${totalBindings} shared`,
                  mixedBindings > 0 && `${mixedBindings} mixed`,
                ].filter(Boolean).join(', ')
              : `${totalBindings} binding${totalBindings !== 1 ? 's' : ''}`
            }
          </span>
        )}
      </button>

      {/* Sync controls */}
      {hasSelection && <div className="flex items-center gap-1 px-3 pb-1">
        {syncing && syncProgress ? (
          <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
            Syncing... {syncProgress.processed}/{syncProgress.total}
          </span>
        ) : syncResult ? (
          <span className={`text-[9px] ${syncResult.missingTokens.length > 0 ? 'text-[var(--color-figma-warning,#f5a623)]' : 'text-[var(--color-figma-success)]'}`}>
            {syncResult.updated === 0 && syncResult.missingTokens.length === 0
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
      </div>}

      {/* Body */}
      {!collapsed && hasSelection && !creatingFromProp && (
        <div className="overflow-y-auto max-h-[30vh] px-1 pb-1">
          {PROPERTY_GROUPS.map(group => {
            if (!shouldShowGroup(group.condition, caps)) return null;

            const visibleProps = group.properties.filter(prop => {
              const binding = getBindingForProperty(selectedNodes, prop);
              const value = getCurrentValue(selectedNodes, prop);
              return binding || value !== undefined;
            });

            if (visibleProps.length === 0) return null;

            return (
              <div key={group.label} className="mb-1">
                <div className="px-2 py-0.5 text-[9px] text-[var(--color-figma-text-secondary)] font-medium">
                  {group.label}
                </div>
                {visibleProps.map(prop => {
                  const binding = getBindingForProperty(selectedNodes, prop);
                  const value = getCurrentValue(selectedNodes, prop);

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
                  const isUnbound = !binding || binding === 'mixed';
                  const hasExtractableValue = value !== undefined && value !== null && connected && isUnbound && activeSet;

                  return (
                    <div
                      key={prop}
                      className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[var(--color-figma-bg-hover)] group"
                    >
                      {/* Color swatch */}
                      {swatchColor ? (
                        <div
                          className="w-3.5 h-3.5 rounded-sm border border-[var(--color-figma-border)] ring-1 ring-white ring-inset shrink-0"
                          style={{ backgroundColor: swatchColor }}
                        />
                      ) : (
                        <div className="w-3.5 h-3.5 shrink-0" />
                      )}

                      <span className="text-[10px] text-[var(--color-figma-text-secondary)] w-[72px] shrink-0 truncate">
                        {PROPERTY_LABELS[prop]}
                      </span>

                      <span className="text-[10px] text-[var(--color-figma-text)] truncate flex-1" title={resolvedDisplay ?? undefined}>
                        {binding === 'mixed'
                          ? 'Mixed'
                          : binding
                            ? resolvedDisplay ? `${binding} → ${resolvedDisplay}` : binding
                            : formatCurrentValue(prop, value)
                        }
                      </span>

                      {binding && binding !== 'mixed' && (
                        <span className="text-[8px] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 px-1 py-0.5 rounded shrink-0">
                          bound
                        </span>
                      )}

                      {binding && binding !== 'mixed' && (
                        <button
                          onClick={() => handleRemoveBinding(prop)}
                          title="Remove binding"
                          className="p-0.5 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-error)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        >
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      )}

                      {hasExtractableValue && (
                        <button
                          onClick={() => openCreateFromProp(prop)}
                          title="Create token from this value"
                          className="p-0.5 rounded text-[var(--color-figma-accent)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 hover:bg-[var(--color-figma-accent)]/10"
                        >
                          <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor">
                            <path d="M5 1v8M1 5h8" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
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
              View token →
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

      {/* Create token form */}
      {creatingFromProp && (
        <div className="border-t border-[var(--color-figma-border)] px-3 py-2 flex flex-col gap-2 bg-[var(--color-figma-bg)]">
          <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
            Create token from {PROPERTY_LABELS[creatingFromProp]}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0">Value:</span>
            {(creatingFromProp === 'fill' || creatingFromProp === 'stroke') &&
             typeof getCurrentValue(selectedNodes, creatingFromProp) === 'string' &&
             getCurrentValue(selectedNodes, creatingFromProp).startsWith('#') && (
              <div
                className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                style={{ backgroundColor: getCurrentValue(selectedNodes, creatingFromProp) }}
              />
            )}
            <span className="text-[9px] text-[var(--color-figma-text)] font-mono truncate">
              {formatTokenValuePreview(creatingFromProp, getCurrentValue(selectedNodes, creatingFromProp))}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] text-[var(--color-figma-text-secondary)]">Token path (in set: {activeSet})</label>
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
      )}
    </div>
  );
}
