import { useState, useEffect, useCallback } from 'react';
import { resolveRefValue } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';

interface BoundLayer {
  id: string;
  name: string;
  type: string;
  componentName: string | null;
  properties: string[];
}

interface TokenDependentsProps {
  dependents: Array<{ path: string; setName: string }>;
  dependentsLoading: boolean;
  setName: string;
  tokenPath: string;
  tokenType: string;
  value: any;
  isDirty: boolean;
  aliasMode: boolean;
  allTokensFlat: Record<string, TokenMapEntry>;
  colorFlatMap: Record<string, unknown>;
  initialValue: any;
}

const NODE_TYPE_ICONS: Record<string, string> = {
  FRAME: 'M3 3h18v18H3V3z',
  COMPONENT: 'M12 2l10 10-10 10L2 12 12 2z',
  INSTANCE: 'M12 2l10 10-10 10L2 12 12 2z',
  RECTANGLE: 'M3 3h18v18H3V3z',
  TEXT: 'M4 4h16M12 4v16',
  ELLIPSE: 'M12 2a10 10 0 110 20 10 10 0 010-20z',
  GROUP: 'M3 3h7v7H3V3zM14 3h7v7h-7V3zM3 14h7v7H3v-7zM14 14h7v7h-7v-7z',
};

function getNodeIcon(type: string) {
  const d = NODE_TYPE_ICONS[type] || NODE_TYPE_ICONS.FRAME;
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60">
      <path d={d} />
    </svg>
  );
}

/** Format a value for display in before/after diff. */
function formatDiffValue(val: any, type: string): string {
  if (val === null || val === undefined) return '—';
  if (type === 'color' && typeof val === 'string') return val.slice(0, 7);
  if (typeof val === 'object') {
    try { return JSON.stringify(val); } catch (e) { console.debug('[TokenDependents] stringify failed:', e); return String(val); }
  }
  return String(val);
}

export function TokenDependents({ dependents, dependentsLoading, setName, tokenPath, tokenType, value, isDirty, aliasMode, allTokensFlat, colorFlatMap, initialValue }: TokenDependentsProps) {
  const [showDependents, setShowDependents] = useState(false);
  const [layers, setLayers] = useState<BoundLayer[]>([]);
  const [layersTotal, setLayersTotal] = useState(0);
  const [layersLoading, setLayersLoading] = useState(false);
  const [layersScanned, setLayersScanned] = useState(false);
  const [componentNames, setComponentNames] = useState<string[]>([]);
  const [showComponentList, setShowComponentList] = useState(false);

  // Scan for bound layers when section is expanded
  useEffect(() => {
    if (!showDependents || layersScanned) return;

    setLayersLoading(true);

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg || msg.type !== 'token-usage-result' || msg.tokenPath !== tokenPath) return;
      setLayers(msg.layers ?? []);
      setLayersTotal(msg.total ?? 0);
      setComponentNames(msg.componentNames ?? []);
      setLayersLoading(false);
      setLayersScanned(true);
    };

    window.addEventListener('message', handleMessage);
    parent.postMessage({ pluginMessage: { type: 'scan-single-token-usage', tokenPath } }, '*');

    return () => window.removeEventListener('message', handleMessage);
  }, [showDependents, layersScanned, tokenPath]);

  // Reset layer scan when token path changes
  useEffect(() => {
    setLayersScanned(false);
    setLayers([]);
    setLayersTotal(0);
    setComponentNames([]);
    setShowComponentList(false);
  }, [tokenPath]);

  const selectLayer = useCallback((nodeId: string) => {
    parent.postMessage({ pluginMessage: { type: 'select-node', nodeId } }, '*');
  }, []);

  const highlightAll = useCallback(() => {
    parent.postMessage({ pluginMessage: { type: 'highlight-layer-by-token', tokenPath } }, '*');
  }, [tokenPath]);

  const totalCount = dependents.length + (layersScanned ? layersTotal : 0);
  const countLabel = dependentsLoading
    ? ''
    : layersScanned
      ? (totalCount > 0 ? ` (${totalCount})` : '')
      : (dependents.length > 0 ? ` (${dependents.length}+)` : '');

  // Value diff for non-color types
  const oldValueStr = formatDiffValue(initialValue, tokenType);
  const newValueStr = formatDiffValue(value, tokenType);
  const showValueDiff = isDirty && !aliasMode && oldValueStr !== newValueStr && oldValueStr !== '—';
  const oldColorHex = tokenType === 'color' && typeof initialValue === 'string' ? initialValue.slice(0, 7) : null;
  const newColorHex = tokenType === 'color' && typeof value === 'string' ? value.slice(0, 7) : null;

  return (
    <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
      <button
        type="button"
        onClick={() => setShowDependents(v => !v)}
        className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium hover:bg-[var(--color-figma-bg-hover)] transition-colors"
      >
        <span className="flex items-center gap-1.5">
          Used by
          {dependentsLoading
            ? <svg className="animate-spin shrink-0 opacity-50" width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="22 10" /></svg>
            : countLabel}
        </span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showDependents ? 'rotate-90' : ''}`} aria-hidden="true">
          <path d="M2 1l4 3-4 3V1z"/>
        </svg>
      </button>
      {showDependents && (
        <div className="border-t border-[var(--color-figma-border)]">

          {/* Impact summary banner */}
          {layersScanned && layersTotal > 0 && (
            <div className="px-3 py-2 flex items-center justify-between gap-2 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)]">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[10px] text-[var(--color-figma-text)]">
                  <span className="font-medium">{layersTotal}</span> layer{layersTotal !== 1 ? 's' : ''}
                  {componentNames.length > 0 && (
                    <>
                      {' across '}
                      <button
                        type="button"
                        onClick={() => setShowComponentList(v => !v)}
                        className="font-medium underline decoration-dotted hover:text-[var(--color-figma-accent)] transition-colors"
                        title={componentNames.join(', ')}
                      >
                        {componentNames.length} component{componentNames.length !== 1 ? 's' : ''}
                      </button>
                    </>
                  )}
                </span>
                {/* Before/after value diff */}
                {showValueDiff && (
                  <span className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                    {tokenType === 'color' && oldColorHex && newColorHex ? (
                      <>
                        <span className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0" style={{ background: oldColorHex }} title="Before" />
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none" className="shrink-0" aria-hidden="true">
                          <path d="M1 3h5M4 1l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0" style={{ background: newColorHex }} title="After" />
                        <span className="font-mono truncate">{oldColorHex} → {newColorHex}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-mono truncate max-w-[80px]" title={oldValueStr}>{oldValueStr}</span>
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none" className="shrink-0" aria-hidden="true">
                          <path d="M1 3h5M4 1l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="font-mono truncate max-w-[80px]" title={newValueStr}>{newValueStr}</span>
                        <span className="text-[9px] opacity-50">(unsaved)</span>
                      </>
                    )}
                  </span>
                )}
              </div>
              {/* Highlight all button */}
              <button
                type="button"
                onClick={highlightAll}
                title="Select and zoom to all affected layers on canvas"
                className="shrink-0 flex items-center gap-1 px-1.5 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                Highlight
              </button>
            </div>
          )}

          {/* Collapsible component name list */}
          {showComponentList && componentNames.length > 0 && (
            <div className="px-3 py-1.5 flex flex-wrap gap-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
              {componentNames.map(name => (
                <span key={name} className="px-1.5 py-0.5 rounded text-[9px] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] truncate max-w-[120px]" title={name}>
                  {name}
                </span>
              ))}
            </div>
          )}

          {/* Dependent tokens section */}
          {dependentsLoading ? (
            <div className="flex items-center gap-1.5 px-3 py-2.5 text-[10px] text-[var(--color-figma-text-secondary)]">
              <svg className="animate-spin shrink-0" width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="22 10" /></svg>
              Finding references…
            </div>
          ) : dependents.length > 0 ? (
            <>
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--color-figma-text-secondary)] opacity-60 bg-[var(--color-figma-bg-secondary)]">
                Tokens ({dependents.length})
              </div>
              <div className="flex flex-col divide-y divide-[var(--color-figma-border)]">
                {dependents.map(dep => {
                  const entry = allTokensFlat[dep.path];
                  const resolvedColor = entry?.$type === 'color' ? resolveRefValue(dep.path, colorFlatMap) : null;
                  const isAliasDependent = entry?.$type === 'color' && typeof entry.$value === 'string' && entry.$value.startsWith('{');
                  const showDepBeforeAfter = isAliasDependent && tokenType === 'color' && isDirty && !aliasMode && oldColorHex && newColorHex;

                  return (
                    <div key={dep.path} className="px-3 py-1.5 flex items-center gap-2">
                      {showDepBeforeAfter ? (
                        <span className="flex items-center gap-1 shrink-0">
                          <span
                            className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)]"
                            style={{ background: oldColorHex! }}
                            title="Before"
                          />
                          <svg width="8" height="6" viewBox="0 0 8 6" fill="none" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
                            <path d="M1 3h5M4 1l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <span
                            className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)]"
                            style={{ background: newColorHex! }}
                            title="After"
                          />
                        </span>
                      ) : resolvedColor ? (
                        <span
                          className="shrink-0 w-3 h-3 rounded-sm border border-[var(--color-figma-border)]"
                          style={{ background: resolvedColor }}
                        />
                      ) : null}
                      <span
                        className="flex-1 font-mono text-[10px] text-[var(--color-figma-text)] truncate"
                        title={dep.path}
                      >
                        {dep.path}
                      </span>
                      {dep.setName !== setName && (
                        <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                          {dep.setName}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {/* Bound layers section */}
          {layersLoading ? (
            <div className="flex items-center gap-1.5 px-3 py-2.5 text-[10px] text-[var(--color-figma-text-secondary)]">
              <svg className="animate-spin shrink-0" width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="22 10" /></svg>
              Scanning layers…
            </div>
          ) : layersScanned && layers.length > 0 ? (
            <>
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--color-figma-text-secondary)] opacity-60 bg-[var(--color-figma-bg-secondary)] border-t border-[var(--color-figma-border)]">
                Layers ({layersTotal}{layersTotal > layers.length ? `, showing ${layers.length}` : ''})
              </div>
              <div className="flex flex-col divide-y divide-[var(--color-figma-border)]">
                {layers.map(layer => (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => selectLayer(layer.id)}
                    className="px-3 py-1.5 flex items-center gap-2 text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors group"
                    title={`Select "${layer.name}" on canvas\nType: ${layer.type}${layer.componentName ? `\nComponent: ${layer.componentName}` : ''}\nBound: ${layer.properties.join(', ')}`}
                  >
                    {getNodeIcon(layer.type)}
                    <span className="flex-1 min-w-0">
                      <span className="block text-[10px] text-[var(--color-figma-text)] truncate">
                        {layer.name}
                      </span>
                      {layer.componentName && (
                        <span className="block text-[9px] text-[var(--color-figma-text-secondary)] truncate opacity-70">
                          {layer.componentName}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] opacity-60 group-hover:opacity-100">
                      {layer.properties.join(', ')}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : layersScanned && layers.length === 0 && dependents.length === 0 ? (
            <p className="px-3 py-2.5 text-[10px] text-[var(--color-figma-text-secondary)]">Not referenced by any token or layer.</p>
          ) : !layersScanned && dependents.length === 0 ? (
            <p className="px-3 py-2.5 text-[10px] text-[var(--color-figma-text-secondary)]">Not referenced by any other token.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
