import React, { useState } from 'react';
import {
  PROPERTY_GROUPS,
  PROPERTY_LABELS,
  ALL_BINDABLE_PROPERTIES,
} from '../../shared/types';
import type { BindableProperty, SelectionNodeInfo, NodeCapabilities, SyncCompleteMessage, TokenMapEntry } from '../../shared/types';
import { resolveTokenValue } from '../../shared/resolveAlias';

interface SelectionInspectorProps {
  selectedNodes: SelectionNodeInfo[];
  tokenMap: Record<string, TokenMapEntry>;
  onSync: (scope: 'page' | 'selection') => void;
  syncing: boolean;
  syncProgress: { processed: number; total: number } | null;
  syncResult: SyncCompleteMessage | null;
  connected: boolean;
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
  // Show a property group if ANY selected node has the capability
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

export function SelectionInspector({ selectedNodes, tokenMap, onSync, syncing, syncProgress, syncResult, connected }: SelectionInspectorProps) {
  const [collapsed, setCollapsed] = useState(false);

  const hasSelection = selectedNodes.length > 0;
  const caps = getMergedCapabilities(selectedNodes);

  // Count total bindings
  const totalBindings = hasSelection
    ? ALL_BINDABLE_PROPERTIES.reduce((sum, prop) => {
        const b = getBindingForProperty(selectedNodes, prop);
        return sum + (b && b !== 'mixed' ? 1 : 0);
      }, 0)
    : 0;

  const handleRemoveBinding = (prop: BindableProperty) => {
    parent.postMessage({ pluginMessage: { type: 'remove-binding', property: prop } }, '*');
  };

  const headerLabel = !hasSelection
    ? 'No selection'
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
        {totalBindings > 0 && (
          <span className="text-[9px] text-[var(--color-figma-accent)] shrink-0">
            {totalBindings} binding{totalBindings !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {/* Sync controls */}
      <div className="flex items-center gap-1 px-3 pb-1">
        {syncing && syncProgress ? (
          <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
            Syncing... {syncProgress.processed}/{syncProgress.total}
          </span>
        ) : syncResult ? (
          <span className={`text-[9px] ${syncResult.missingTokens.length > 0 ? 'text-[var(--color-figma-warning,#f5a623)]' : 'text-[var(--color-figma-success)]'}`}>
            Updated {syncResult.updated} binding{syncResult.updated !== 1 ? 's' : ''}
            {syncResult.missingTokens.length > 0 && ` (${syncResult.missingTokens.length} missing)`}
          </span>
        ) : (
          <>
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
      </div>

      {/* Body */}
      {!collapsed && hasSelection && (
        <div className="overflow-y-auto max-h-[200px] px-1 pb-1">
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
                <div className="px-2 py-0.5 text-[8px] uppercase tracking-wider text-[var(--color-figma-text-secondary)] font-medium">
                  {group.label}
                </div>
                {visibleProps.map(prop => {
                  const binding = getBindingForProperty(selectedNodes, prop);
                  const value = getCurrentValue(selectedNodes, prop);

                  // Resolve bound token value for display
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

                  return (
                    <div
                      key={prop}
                      className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[var(--color-figma-bg-hover)] group"
                    >
                      {/* Color swatch */}
                      {swatchColor ? (
                        <div
                          className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                          style={{ backgroundColor: swatchColor }}
                        />
                      ) : (
                        <div className="w-3 h-3 shrink-0" />
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
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
