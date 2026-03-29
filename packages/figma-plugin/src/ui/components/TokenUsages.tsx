import { useState, useEffect, useCallback } from 'react';
import { Spinner } from './Spinner';
import { resolveRefValue } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import type { TokenGenerator } from '../hooks/useGenerators';

interface BoundLayer {
  id: string;
  name: string;
  type: string;
  componentName: string | null;
  properties: string[];
}

interface BoundVariable {
  name: string;
  collection: string;
  resolvedType: string;
}

interface TokenUsagesProps {
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
  /** Generator that produces this token (if any). */
  producingGenerator: TokenGenerator | null;
  /** Generators that use this token as their source. */
  sourceGenerators: TokenGenerator[];
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

function formatDiffValue(val: any, type: string): string {
  if (val === null || val === undefined) return '—';
  if (type === 'color' && typeof val === 'string') return val.slice(0, 7);
  if (typeof val === 'object') {
    try { return JSON.stringify(val); } catch { return String(val); }
  }
  return String(val);
}

const GENERATOR_TYPE_STYLES: Record<string, { label: string; classes: string }> = {
  colorRamp: { label: 'Color Ramp', classes: 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]' },
  typeScale: { label: 'Type Scale', classes: 'bg-purple-500/15 text-purple-600' },
  spacingScale: { label: 'Spacing', classes: 'bg-green-500/15 text-green-600' },
  opacityScale: { label: 'Opacity', classes: 'bg-orange-500/15 text-orange-600' },
};

export function TokenUsages({
  dependents, dependentsLoading, setName, tokenPath, tokenType, value,
  isDirty, aliasMode, allTokensFlat, colorFlatMap, initialValue,
  producingGenerator, sourceGenerators,
}: TokenUsagesProps) {
  const [expanded, setExpanded] = useState(false);

  // Layers state
  const [layers, setLayers] = useState<BoundLayer[]>([]);
  const [layersTotal, setLayersTotal] = useState(0);
  const [layersLoading, setLayersLoading] = useState(false);
  const [layersScanned, setLayersScanned] = useState(false);
  const [componentNames, setComponentNames] = useState<string[]>([]);
  const [showComponentList, setShowComponentList] = useState(false);

  // Variable bindings state
  const [variables, setVariables] = useState<BoundVariable[]>([]);
  const [variablesLoading, setVariablesLoading] = useState(false);
  const [variablesScanned, setVariablesScanned] = useState(false);

  // Scan for bound layers when section is expanded
  useEffect(() => {
    if (!expanded || layersScanned) return;

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

    // Timeout: if no response after 5s, mark scan as complete with no results
    const timeout = setTimeout(() => {
      setLayersLoading(false);
      setLayersScanned(true);
    }, 5000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(timeout);
    };
  }, [expanded, layersScanned, tokenPath]);

  // Scan for variable bindings when section is expanded
  useEffect(() => {
    if (!expanded || variablesScanned) return;

    setVariablesLoading(true);

    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg || msg.type !== 'token-variable-bindings-result' || msg.tokenPath !== tokenPath) return;
      setVariables(msg.variables ?? []);
      setVariablesLoading(false);
      setVariablesScanned(true);
    };

    window.addEventListener('message', handleMessage);
    parent.postMessage({ pluginMessage: { type: 'scan-token-variable-bindings', tokenPath } }, '*');

    // Timeout: if no response after 5s, mark scan as complete with no results
    const timeout = setTimeout(() => {
      setVariablesLoading(false);
      setVariablesScanned(true);
    }, 5000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(timeout);
    };
  }, [expanded, variablesScanned, tokenPath]);

  // Reset scans when token path changes
  useEffect(() => {
    setLayersScanned(false);
    setLayers([]);
    setLayersTotal(0);
    setComponentNames([]);
    setShowComponentList(false);
    setVariablesScanned(false);
    setVariables([]);
  }, [tokenPath]);

  const selectLayer = useCallback((nodeId: string) => {
    parent.postMessage({ pluginMessage: { type: 'select-node', nodeId } }, '*');
  }, []);

  const highlightAll = useCallback(() => {
    parent.postMessage({ pluginMessage: { type: 'highlight-layer-by-token', tokenPath } }, '*');
  }, [tokenPath]);

  // Count
  const generatorCount = (producingGenerator ? 1 : 0) + sourceGenerators.length;
  const variableCount = variablesScanned ? variables.length : 0;
  const layerCount = layersScanned ? layersTotal : 0;
  const knownTotal = dependents.length + variableCount + layerCount + generatorCount;
  const hasUnscannedSections = !layersScanned || !variablesScanned;

  const countLabel = dependentsLoading
    ? ''
    : knownTotal > 0
      ? ` (${knownTotal}${hasUnscannedSections ? '+' : ''})`
      : hasUnscannedSections
        ? ''
        : '';

  // Value diff
  const oldValueStr = formatDiffValue(initialValue, tokenType);
  const newValueStr = formatDiffValue(value, tokenType);
  const showValueDiff = isDirty && !aliasMode && oldValueStr !== newValueStr && oldValueStr !== '—';
  const oldColorHex = tokenType === 'color' && typeof initialValue === 'string' ? initialValue.slice(0, 7) : null;
  const newColorHex = tokenType === 'color' && typeof value === 'string' ? value.slice(0, 7) : null;

  const hasAnyContent = dependents.length > 0 || generatorCount > 0 ||
    (variablesScanned && variables.length > 0) || (layersScanned && layers.length > 0);
  const nothingFound = !dependentsLoading && !layersLoading && !variablesLoading &&
    layersScanned && variablesScanned && !hasAnyContent;

  return (
    <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium hover:bg-[var(--color-figma-bg-hover)] transition-colors"
      >
        <span className="flex items-center gap-1.5">
          Usages
          {dependentsLoading
            ? <Spinner className="opacity-50" />
            : countLabel}
        </span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${expanded ? 'rotate-90' : ''}`} aria-hidden="true">
          <path d="M2 1l4 3-4 3V1z"/>
        </svg>
      </button>

      {expanded && (
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

          {showComponentList && componentNames.length > 0 && (
            <div className="px-3 py-1.5 flex flex-wrap gap-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
              {componentNames.map(name => (
                <span key={name} className="px-1.5 py-0.5 rounded text-[9px] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] truncate max-w-[120px]" title={name}>
                  {name}
                </span>
              ))}
            </div>
          )}

          {/* Incoming aliases (dependent tokens) */}
          {dependentsLoading ? (
            <div className="flex items-center gap-1.5 px-3 py-2.5 text-[10px] text-[var(--color-figma-text-secondary)]">
              <Spinner />
              Finding references…
            </div>
          ) : dependents.length > 0 ? (
            <>
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--color-figma-text-secondary)] opacity-60 bg-[var(--color-figma-bg-secondary)]">
                Incoming aliases ({dependents.length})
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
                          <span className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)]" style={{ background: oldColorHex! }} title="Before" />
                          <svg width="8" height="6" viewBox="0 0 8 6" fill="none" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
                            <path d="M1 3h5M4 1l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <span className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)]" style={{ background: newColorHex! }} title="After" />
                        </span>
                      ) : resolvedColor ? (
                        <span className="shrink-0 w-3 h-3 rounded-sm border border-[var(--color-figma-border)]" style={{ background: resolvedColor }} />
                      ) : null}
                      <span className="flex-1 font-mono text-[10px] text-[var(--color-figma-text)] truncate" title={dep.path}>
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

          {/* Figma variable bindings */}
          {variablesLoading ? (
            <div className="flex items-center gap-1.5 px-3 py-2.5 text-[10px] text-[var(--color-figma-text-secondary)]">
              <Spinner />
              Scanning variables…
            </div>
          ) : variablesScanned && variables.length > 0 ? (
            <>
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--color-figma-text-secondary)] opacity-60 bg-[var(--color-figma-bg-secondary)] border-t border-[var(--color-figma-border)]">
                Figma variables ({variables.length})
              </div>
              <div className="flex flex-col divide-y divide-[var(--color-figma-border)]">
                {variables.map(v => (
                  <div key={`${v.collection}/${v.name}`} className="px-3 py-1.5 flex items-center gap-2">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <path d="M9 8h6M9 12h6M9 16h4"/>
                    </svg>
                    <span className="flex-1 font-mono text-[10px] text-[var(--color-figma-text)] truncate" title={`${v.collection} / ${v.name}`}>
                      {v.name}
                    </span>
                    <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                      {v.collection}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {/* Generator references */}
          {generatorCount > 0 && (
            <>
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--color-figma-text-secondary)] opacity-60 bg-[var(--color-figma-bg-secondary)] border-t border-[var(--color-figma-border)]">
                Generators ({generatorCount})
              </div>
              <div className="flex flex-col divide-y divide-[var(--color-figma-border)]">
                {producingGenerator && (
                  <div className="px-3 py-1.5 flex items-center gap-2">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Produced by</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium uppercase ${
                      GENERATOR_TYPE_STYLES[producingGenerator.type]?.classes ?? 'bg-gray-500/15 text-gray-600'
                    }`}>
                      {GENERATOR_TYPE_STYLES[producingGenerator.type]?.label ?? producingGenerator.type}
                    </span>
                    <span className="flex-1 font-mono text-[10px] text-[var(--color-figma-text)] truncate" title={producingGenerator.sourceToken}>
                      {producingGenerator.sourceToken}
                    </span>
                  </div>
                )}
                {sourceGenerators.map(gen => (
                  <div key={gen.id} className="px-3 py-1.5 flex items-center gap-2">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-60">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Source for</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium uppercase ${
                      GENERATOR_TYPE_STYLES[gen.type]?.classes ?? 'bg-gray-500/15 text-gray-600'
                    }`}>
                      {GENERATOR_TYPE_STYLES[gen.type]?.label ?? gen.type}
                    </span>
                    <span className="flex-1 font-mono text-[10px] text-[var(--color-figma-text)] truncate" title={gen.targetGroup}>
                      {gen.targetGroup}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Bound layers section */}
          {layersLoading ? (
            <div className="flex items-center gap-1.5 px-3 py-2.5 text-[10px] text-[var(--color-figma-text-secondary)]">
              <Spinner />
              Scanning layers…
            </div>
          ) : layersScanned && layers.length > 0 ? (
            <>
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--color-figma-text-secondary)] opacity-60 bg-[var(--color-figma-bg-secondary)] border-t border-[var(--color-figma-border)]">
                Layers ({layersTotal})
              </div>
              {layersTotal > layers.length && (
                <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)]">
                  {layers.length} of {layersTotal} shown
                </div>
              )}
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
          ) : null}

          {/* Empty state */}
          {nothingFound && (
            <div className="px-3 py-4 flex flex-col items-center gap-1 text-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[var(--color-figma-text-secondary)] opacity-40">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <p className="text-[10px] text-[var(--color-figma-text-secondary)]">No usages found</p>
              <p className="text-[9px] text-[var(--color-figma-text-secondary)] opacity-60">Not referenced by any token, variable, generator, or layer.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
