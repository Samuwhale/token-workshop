import { useState, useCallback } from 'react';
import { Spinner } from './Spinner';
import {
  ALL_BINDABLE_PROPERTIES,
  PROPERTY_LABELS,
  type BindableProperty,
  type TokenMapEntry,
  type ScanScope,
  type ResolvedTokenValue,
} from '../../shared/types';

export interface HeatmapMissingValueEntry {
  property: BindableProperty;
  value: ResolvedTokenValue;
}

export interface HeatmapNode {
  id: string;
  name: string;
  type: string;
  pageName?: string;
  status: 'green' | 'yellow' | 'red';
  boundCount: number;
  totalCheckable: number;
  missingProperties?: BindableProperty[];
  missingValueEntries?: HeatmapMissingValueEntry[];
}

export interface HeatmapResult {
  total: number;
  green: number;
  yellow: number;
  red: number;
  nodes: HeatmapNode[];
}

interface HeatmapPanelProps {
  result: HeatmapResult | null;
  loading: boolean;
  progress?: { processed: number; total: number } | null;
  error?: string | null;
  scope: ScanScope;
  onRescan: (scope?: ScanScope) => void;
  onCancel?: () => void;
  onSelectNodes: (ids: string[]) => void;
  availableTokens?: Record<string, TokenMapEntry>;
  onBatchBind?: (nodeIds: string[], tokenPath: string, property: BindableProperty) => void;
  canCreateToken?: (node: HeatmapNode) => boolean;
  onCreateToken?: (node: HeatmapNode) => void;
}

const STATUS_COLORS = {
  green: { text: 'text-[var(--color-figma-success)]', bar: 'bg-[var(--color-figma-success)]', label: 'Fully bound' },
  yellow: { text: 'text-[var(--color-figma-warning)]', bar: 'bg-[var(--color-figma-warning)]', label: 'Partially bound' },
  red: { text: 'text-[var(--color-figma-error)]', bar: 'bg-[var(--color-figma-error)]', label: 'No bindings' },
};

/** Distinct shape per status so meaning isn't conveyed by color alone. */
function StatusIcon({ status, size = 8 }: { status: 'green' | 'yellow' | 'red'; size?: number }) {
  if (status === 'green') {
    // Checkmark
    return (
      <svg width={size} height={size} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-success)]" aria-label="Fully bound">
        <path d="M2 5.5l2.5 2.5L8 3" />
      </svg>
    );
  }
  if (status === 'yellow') {
    // Dash / minus
    return (
      <svg width={size} height={size} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-[var(--color-figma-warning)]" aria-label="Partially bound">
        <path d="M2.5 5h5" />
      </svg>
    );
  }
  // X mark
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-error)]" aria-label="No bindings">
      <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" />
    </svg>
  );
}

const NODE_TYPE_LABELS: Record<string, string> = {
  FRAME: 'Frame', COMPONENT: 'Component', COMPONENT_SET: 'Component set',
  INSTANCE: 'Instance', RECTANGLE: 'Rect', ELLIPSE: 'Ellipse',
  POLYGON: 'Polygon', STAR: 'Star', VECTOR: 'Vector', LINE: 'Line', TEXT: 'Text',
};

type FilterStatus = 'all' | 'red' | 'yellow' | 'green';

interface QuickBindState {
  nodeIds: string[];
  statusLabel: string;
}


export function HeatmapPanel({
  result,
  loading,
  progress,
  error,
  scope,
  onRescan,
  onCancel,
  onSelectNodes,
  availableTokens,
  onBatchBind,
  canCreateToken,
  onCreateToken,
}: HeatmapPanelProps) {
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['red']));
  const [quickBind, setQuickBind] = useState<QuickBindState | null>(null);
  const [bindToken, setBindToken] = useState('');
  const [bindProperty, setBindProperty] = useState<BindableProperty>('fill');

  const toggleGroup = useCallback((status: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const selectAll = useCallback((status: FilterStatus, label?: string) => {
    if (!result) return;
    const ids = result.nodes
      .filter(n => status === 'all' || n.status === status)
      .map(n => n.id);
    onSelectNodes(ids);
    if (ids.length > 0 && onBatchBind) {
      setQuickBind({ nodeIds: ids, statusLabel: label ?? status });
      setBindToken('');
      setBindProperty('fill');
    }
  }, [result, onSelectNodes, onBatchBind]);

  const handleApplyBind = useCallback(() => {
    if (!quickBind || !bindToken.trim() || !onBatchBind) return;
    onBatchBind(quickBind.nodeIds, bindToken.trim(), bindProperty);
    setQuickBind(null);
    setBindToken('');
  }, [quickBind, bindToken, bindProperty, onBatchBind]);

  const exportCSV = useCallback(() => {
    if (!result) return;
    const headers = ['name', 'type', 'status', 'bound', 'total'];
    const rows = result.nodes.map(n => [
      `"${n.name.replace(/"/g, '""')}"`,
      n.type,
      n.status,
      n.boundCount,
      n.totalCheckable,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'heatmap.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [result]);

  const exportJSON = useCallback(() => {
    if (!result) return;
    const pct = result.total > 0 ? Math.round((result.green / result.total) * 100) : 0;
    const out = {
      summary: `${result.green}/${result.total} layers fully bound (${pct}%)`,
      total: result.total,
      green: result.green,
      yellow: result.yellow,
      red: result.red,
      nodes: result.nodes,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'heatmap.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [result]);

  const filteredNodes = result?.nodes.filter(n => filter === 'all' || n.status === filter) ?? [];

  // Group nodes by status for the grouped view
  const groups = ([
    { status: 'red' as const, nodes: result?.nodes.filter(n => n.status === 'red') ?? [] },
    { status: 'yellow' as const, nodes: result?.nodes.filter(n => n.status === 'yellow') ?? [] },
    { status: 'green' as const, nodes: result?.nodes.filter(n => n.status === 'green') ?? [] },
  ] as { status: 'red' | 'yellow' | 'green'; nodes: HeatmapNode[] }[]).filter(g => g.nodes.length > 0);

  const tokenPaths = availableTokens ? Object.keys(availableTokens) : [];

  return (
    <div className="flex flex-col h-full">
      {/* Stats bar */}
      {result && !loading && (
        <div className="px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
              {result.total > 0
                ? `${result.green}/${result.total} layers fully bound (${Math.round((result.green / result.total) * 100)}%)`
                : `${result.total} layers scanned`}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={exportCSV}
                className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
                title="Export as CSV"
              >
                CSV
              </button>
              <button
                onClick={exportJSON}
                className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
                title="Export as JSON"
              >
                JSON
              </button>
              <button
                onClick={() => onRescan()}
                className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
              >
                Rescan
              </button>
            </div>
          </div>
          {/* Coverage bar — uses patterns in addition to color for a11y */}
          {result.total > 0 && (
            <div className="flex h-2 rounded overflow-hidden gap-px mb-2">
              <svg className="absolute w-0 h-0" aria-hidden="true">
                <defs>
                  <pattern id="hm-pat-red" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="6" height="6" fill="var(--color-figma-error)" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#fff" strokeWidth="1.5" strokeOpacity="0.35" />
                  </pattern>
                  <pattern id="hm-pat-yellow" width="4" height="4" patternUnits="userSpaceOnUse">
                    <rect width="4" height="4" fill="var(--color-figma-warning)" />
                    <circle cx="2" cy="2" r="0.8" fill="#fff" fillOpacity="0.4" />
                  </pattern>
                </defs>
              </svg>
              {result.red > 0 && (
                <div
                  style={{ flex: result.red, background: 'url(#hm-pat-red)' }}
                  className="bg-[var(--color-figma-error)]"
                  title={`${result.red} unbound`}
                >
                  <svg className="w-full h-full"><rect width="100%" height="100%" fill="url(#hm-pat-red)" /></svg>
                </div>
              )}
              {result.yellow > 0 && (
                <div
                  style={{ flex: result.yellow, background: 'url(#hm-pat-yellow)' }}
                  className="bg-[var(--color-figma-warning)]"
                  title={`${result.yellow} partial`}
                >
                  <svg className="w-full h-full"><rect width="100%" height="100%" fill="url(#hm-pat-yellow)" /></svg>
                </div>
              )}
              {result.green > 0 && (
                <div
                  className="bg-[var(--color-figma-success)]"
                  style={{ flex: result.green }}
                  title={`${result.green} fully bound`}
                />
              )}
            </div>
          )}
          {/* Legend */}
          <div className="flex items-center gap-3">
            {(['red', 'yellow', 'green'] as const).map(s => {
              const count = result[s];
              if (count === 0) return null;
              const cfg = STATUS_COLORS[s];
              return (
                <button
                  key={s}
                  onClick={() => setFilter(prev => prev === s ? 'all' : s)}
                  className={`flex items-center gap-1 text-[10px] transition-opacity ${filter !== 'all' && filter !== s ? 'opacity-40' : ''}`}
                  title={cfg.label}
                >
                  <StatusIcon status={s} size={8} />
                  <span className={cfg.text}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {/* Loading state */}
      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[var(--color-figma-text-secondary)]">
          <Spinner size="xl" className="opacity-60" />
          <span className="text-[11px]">Scanning {scope === 'all-pages' ? 'all pages' : scope === 'selection' ? 'selection' : 'current page'}…</span>
          {progress && progress.total > 0 && (
            <div className="w-32 flex flex-col items-center gap-1">
              <div className="w-full h-1 rounded-full bg-[var(--color-figma-border)] overflow-hidden">
                <div
                  className="h-full bg-[var(--color-figma-accent)] transition-all duration-150"
                  style={{ width: `${Math.round((progress.processed / progress.total) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] tabular-nums">{progress.processed} / {progress.total}</span>
            </div>
          )}
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-3 py-1 rounded text-[11px] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-3 text-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-error)] opacity-70" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="text-[11px] text-[var(--color-figma-text-secondary)]">{error}</p>
          <button
            onClick={() => onRescan()}
            className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors"
          >
            Retry scan
          </button>
        </div>
      )}

      {/* Empty / no result */}
      {!loading && !error && !result && (
        <div className="flex-1 flex flex-col items-center justify-center px-3 py-3 text-center gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-semibold text-[var(--color-figma-text)]">Heatmap</p>
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed max-w-[240px]">
              Scan layers for token coverage.
            </p>
          </div>

          {/* CTA */}
          <button
            onClick={() => onRescan()}
            className="px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors"
          >
            Scan canvas
          </button>
        </div>
      )}

      {/* Node list */}
      {!loading && result && result.total === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center px-3 py-3 text-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
          </svg>
          <p className="text-[11px] text-[var(--color-figma-text-secondary)]">
            {scope === 'all-pages'
              ? 'No bindable layers found in this file.'
              : scope === 'selection'
                ? 'No bindable layers found in the selection.'
                : 'No bindable layers on this page.'}
          </p>
          <button
            onClick={() => onRescan()}
            className="px-3 py-1.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-medium hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Scan again
          </button>
        </div>
      )}

      {!loading && result && result.total > 0 && (
        <div className="flex-1 overflow-y-auto">
          {result.nodes.length < result.total && (
            <div className="px-3 py-1.5 text-[10px] text-[var(--color-figma-text-tertiary)] bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)]">
              {result.nodes.length} of {result.total} layers shown
            </div>
          )}
          {filter === 'all' ? (
            /* Grouped view */
            groups.map(({ status, nodes }) => {
              const cfg = STATUS_COLORS[status];
              const isExpanded = expanded.has(status);
              return (
                <div key={status}>
                  <button
                    onClick={() => toggleGroup(status)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`shrink-0 transition-transform text-[var(--color-figma-text-secondary)] ${isExpanded ? 'rotate-90' : ''}`} aria-hidden="true">
                      <path d="M2 1l4 3-4 3V1z"/>
                    </svg>
                    <StatusIcon status={status} size={10} />
                    <span className="text-[10px] font-medium text-[var(--color-figma-text)]">{cfg.label}</span>
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)] ml-auto">{nodes.length}</span>
                    {nodes.length > 0 && (
                      <button
                        onClick={e => { e.stopPropagation(); onSelectNodes(nodes.map(n => n.id)); if (onBatchBind) { setQuickBind({ nodeIds: nodes.map(n => n.id), statusLabel: cfg.label }); setBindToken(''); setBindProperty('fill'); } }}
                        className="text-[10px] text-[var(--color-figma-accent)] hover:underline ml-1 shrink-0"
                      >
                        Select all
                      </button>
                    )}
                  </button>
                  {isExpanded && nodes.map(node => (
                    <NodeRow
                      key={node.id}
                      node={node}
                      onSelect={() => onSelectNodes([node.id])}
                      onCreate={canCreateToken?.(node) && onCreateToken
                        ? () => onCreateToken(node)
                        : undefined}
                      onBind={node.status !== 'green' && onBatchBind
                        ? () => {
                            onSelectNodes([node.id]);
                            setQuickBind({ nodeIds: [node.id], statusLabel: node.name });
                            setBindToken('');
                            setBindProperty(node.missingProperties?.[0] ?? 'fill');
                          }
                        : undefined}
                    />
                  ))}
                </div>
              );
            })
          ) : (
            /* Filtered flat view */
            <div>
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">{filteredNodes.length} layers</span>
                <button
                  onClick={() => selectAll(filter, STATUS_COLORS[filter as keyof typeof STATUS_COLORS]?.label)}
                  className="ml-auto text-[10px] text-[var(--color-figma-accent)] hover:underline"
                >
                  Select all
                </button>
              </div>
              {filteredNodes.map(node => (
                <NodeRow
                  key={node.id}
                  node={node}
                  onSelect={() => onSelectNodes([node.id])}
                  onCreate={canCreateToken?.(node) && onCreateToken
                    ? () => onCreateToken(node)
                    : undefined}
                  onBind={node.status !== 'green' && onBatchBind
                    ? () => {
                        onSelectNodes([node.id]);
                        setQuickBind({ nodeIds: [node.id], statusLabel: node.name });
                        setBindToken('');
                        setBindProperty(node.missingProperties?.[0] ?? 'fill');
                      }
                    : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick Bind panel — appears after batch selection */}
      {quickBind && onBatchBind && (
        <div className="shrink-0 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-3">
          <div className="flex items-center gap-1 mb-2">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-[var(--color-figma-accent)]">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
            </svg>
            <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Bind to token</span>
            <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
              {quickBind.nodeIds.length === 1
                ? `· ${quickBind.statusLabel}`
                : `· ${quickBind.nodeIds.length} layers selected`}
            </span>
            <button
              onClick={() => setQuickBind(null)}
              className="ml-auto text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors"
              aria-label="Dismiss"
            >
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/>
              </svg>
            </button>
          </div>
          <div className="flex gap-1.5 mb-2">
            <div className="flex-1 relative">
              <input
                type="text"
                list="heatmap-quick-bind-tokens"
                value={bindToken}
                onChange={e => setBindToken(e.target.value)}
                placeholder="Token path…"
                className="w-full text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:focus-visible:border-[var(--color-figma-accent)]"
              />
              <datalist id="heatmap-quick-bind-tokens">
                {tokenPaths.slice(0, 300).map(p => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            <select
              value={bindProperty}
              onChange={e => setBindProperty(e.target.value as BindableProperty)}
              aria-label="Heatmap binding property"
              className="text-[10px] px-1.5 py-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] focus:focus-visible:border-[var(--color-figma-accent)]"
            >
              {ALL_BINDABLE_PROPERTIES.map(p => (
                <option key={p} value={p}>{PROPERTY_LABELS[p]}</option>
              ))}
            </select>
          </div>
          <button
            disabled={!bindToken.trim()}
            onClick={handleApplyBind}
            className="w-full text-[10px] py-1.5 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Bind {quickBind.nodeIds.length} layer{quickBind.nodeIds.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}

function NodeRow({
  node,
  onSelect,
  onBind,
  onCreate,
}: {
  node: HeatmapNode;
  onSelect: () => void;
  onBind?: () => void;
  onCreate?: () => void;
}) {
  const cfg = STATUS_COLORS[node.status];
  const typeLabel = NODE_TYPE_LABELS[node.type] ?? node.type;
  const hasActions = Boolean(onBind || onCreate);
  return (
    <div
      role="group"
      className="flex items-stretch border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors group"
    >
      <button
        onClick={onSelect}
        className="flex-1 flex items-center gap-2 px-3 py-1.5 text-left min-w-0"
        aria-label={`Select ${node.name}`}
      >
        <StatusIcon status={node.status} size={8} />
        <span className="flex-1 min-w-0">
          <span className="block text-[10px] text-[var(--color-figma-text)] truncate">{node.name}</span>
          {node.pageName ? (
            <span className="block text-[10px] text-[var(--color-figma-text-tertiary)] truncate">{node.pageName}</span>
          ) : null}
        </span>
        <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">{typeLabel}</span>
        {node.totalCheckable > 0 && (
          <span className={`text-[10px] shrink-0 ${cfg.text}`}>{node.boundCount}/{node.totalCheckable}</span>
        )}
        {!hasActions && (
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-0 group-hover:opacity-60 text-[var(--color-figma-text-secondary)]" aria-hidden="true">
            <path d="M1.5 5h7M5.5 2l3 3-3 3"/>
          </svg>
        )}
      </button>
      {hasActions && (
        <div className="flex items-center gap-1 pr-2 opacity-40 group-hover:opacity-100 transition-opacity">
          {onCreate && (
            <button
              onClick={e => { e.stopPropagation(); onCreate(); }}
              className="text-[10px] px-1.5 py-0.5 rounded font-medium border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              aria-label={`Create token for ${node.name}`}
              title="Create token from this value"
            >
              Create
            </button>
          )}
          {onBind && (
            <button
              onClick={e => { e.stopPropagation(); onBind(); }}
              className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover,var(--color-figma-accent))] transition-colors"
              aria-label={`Bind ${node.name} to a token`}
              title="Quick bind to token"
            >
              Bind
            </button>
          )}
        </div>
      )}
    </div>
  );
}
