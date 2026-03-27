import { useState, useCallback } from 'react';
import { ALL_BINDABLE_PROPERTIES, PROPERTY_LABELS, type BindableProperty, type TokenMapEntry } from '../../shared/types';

interface HeatmapNode {
  id: string;
  name: string;
  type: string;
  status: 'green' | 'yellow' | 'red';
  boundCount: number;
  totalCheckable: number;
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
  onRescan: () => void;
  onSelectNodes: (ids: string[]) => void;
  availableTokens?: Record<string, TokenMapEntry>;
  onBatchBind?: (nodeIds: string[], tokenPath: string, property: BindableProperty) => void;
}

const STATUS_COLORS = {
  green: { dot: 'bg-emerald-500', text: 'text-emerald-600', bar: 'bg-emerald-500', label: 'Fully bound' },
  yellow: { dot: 'bg-amber-400', text: 'text-amber-600', bar: 'bg-amber-400', label: 'Partially bound' },
  red: { dot: 'bg-red-500', text: 'text-red-600', bar: 'bg-red-500', label: 'No bindings' },
};

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

export function HeatmapPanel({ result, loading, onRescan, onSelectNodes, availableTokens, onBatchBind }: HeatmapPanelProps) {
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
    URL.revokeObjectURL(url);
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
    URL.revokeObjectURL(url);
  }, [result]);

  const filteredNodes = result?.nodes.filter(n => filter === 'all' || n.status === filter) ?? [];

  // Group nodes by status for the grouped view
  const groups: { status: 'red' | 'yellow' | 'green'; nodes: HeatmapNode[] }[] = [
    { status: 'red', nodes: result?.nodes.filter(n => n.status === 'red') ?? [] },
    { status: 'yellow', nodes: result?.nodes.filter(n => n.status === 'yellow') ?? [] },
    { status: 'green', nodes: result?.nodes.filter(n => n.status === 'green') ?? [] },
  ].filter(g => g.nodes.length > 0);

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
                onClick={onRescan}
                className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
              >
                Rescan
              </button>
            </div>
          </div>
          {/* Coverage bar */}
          {result.total > 0 && (
            <div className="flex h-2 rounded overflow-hidden gap-px mb-2">
              {result.red > 0 && (
                <div
                  className="bg-red-500"
                  style={{ flex: result.red }}
                  title={`${result.red} unbound`}
                />
              )}
              {result.yellow > 0 && (
                <div
                  className="bg-amber-400"
                  style={{ flex: result.yellow }}
                  title={`${result.yellow} partial`}
                />
              )}
              {result.green > 0 && (
                <div
                  className="bg-emerald-500"
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
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                  <span className={cfg.text}>{count}</span>
                  <span className="text-[var(--color-figma-text-secondary)]">{cfg.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[var(--color-figma-text-secondary)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="animate-spin opacity-60" aria-hidden="true">
            <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.3"/>
            <path d="M21 12a9 9 0 00-9-9"/>
          </svg>
          <span className="text-[11px]">Scanning canvas…</span>
        </div>
      )}

      {/* Empty / no result */}
      {!loading && !result && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-30" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 21V9"/>
          </svg>
          <p className="text-[11px] text-[var(--color-figma-text-secondary)]">
            Scan the current page to see which layers have token bindings.
          </p>
          <button
            onClick={onRescan}
            className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors"
          >
            Scan canvas
          </button>
        </div>
      )}

      {/* Node list */}
      {!loading && result && result.total === 0 && (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-[11px] text-[var(--color-figma-text-secondary)] text-center">No visual layers found on this page.</p>
        </div>
      )}

      {!loading && result && result.total > 0 && (
        <div className="flex-1 overflow-y-auto">
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
                    <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                    <span className="text-[10px] font-medium text-[var(--color-figma-text)]">{cfg.label}</span>
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)] ml-auto">{nodes.length}</span>
                    {nodes.length > 0 && (
                      <button
                        onClick={e => { e.stopPropagation(); onSelectNodes(nodes.map(n => n.id)); if (onBatchBind) { setQuickBind({ nodeIds: nodes.map(n => n.id), statusLabel: cfg.label }); setBindToken(''); setBindProperty('fill'); } }}
                        className="text-[9px] text-[var(--color-figma-accent)] hover:underline ml-1 shrink-0"
                      >
                        Select all
                      </button>
                    )}
                  </button>
                  {isExpanded && nodes.map(node => (
                    <NodeRow key={node.id} node={node} onSelect={() => onSelectNodes([node.id])} />
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
                  className="ml-auto text-[9px] text-[var(--color-figma-accent)] hover:underline"
                >
                  Select all
                </button>
              </div>
              {filteredNodes.map(node => (
                <NodeRow key={node.id} node={node} onSelect={() => onSelectNodes([node.id])} />
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
            <span className="text-[10px] text-[var(--color-figma-text-secondary)]">· {quickBind.nodeIds.length} layer{quickBind.nodeIds.length !== 1 ? 's' : ''} selected</span>
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
                className="w-full text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
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
              className="text-[10px] px-1.5 py-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] focus:outline-none focus:border-[var(--color-figma-accent)]"
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

function NodeRow({ node, onSelect }: { node: HeatmapNode; onSelect: () => void }) {
  const cfg = STATUS_COLORS[node.status];
  const typeLabel = NODE_TYPE_LABELS[node.type] ?? node.type;
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors group"
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      <span className="flex-1 text-[10px] text-[var(--color-figma-text)] truncate">{node.name}</span>
      <span className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0">{typeLabel}</span>
      {node.totalCheckable > 0 && (
        <span className={`text-[9px] shrink-0 ${cfg.text}`}>{node.boundCount}/{node.totalCheckable}</span>
      )}
      <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-0 group-hover:opacity-60 text-[var(--color-figma-text-secondary)]" aria-hidden="true">
        <path d="M1.5 5h7M5.5 2l3 3-3 3"/>
      </svg>
    </button>
  );
}
