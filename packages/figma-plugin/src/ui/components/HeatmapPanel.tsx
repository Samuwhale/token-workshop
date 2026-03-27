import { useState, useCallback } from 'react';

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

export function HeatmapPanel({ result, loading, onRescan, onSelectNodes }: HeatmapPanelProps) {
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['red']));

  const toggleGroup = useCallback((status: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  const selectAll = useCallback((status: FilterStatus) => {
    if (!result) return;
    const ids = result.nodes
      .filter(n => status === 'all' || n.status === status)
      .map(n => n.id);
    onSelectNodes(ids);
  }, [result, onSelectNodes]);

  const filteredNodes = result?.nodes.filter(n => filter === 'all' || n.status === filter) ?? [];

  // Group nodes by status for the grouped view
  const groups: { status: 'red' | 'yellow' | 'green'; nodes: HeatmapNode[] }[] = [
    { status: 'red', nodes: result?.nodes.filter(n => n.status === 'red') ?? [] },
    { status: 'yellow', nodes: result?.nodes.filter(n => n.status === 'yellow') ?? [] },
    { status: 'green', nodes: result?.nodes.filter(n => n.status === 'green') ?? [] },
  ].filter(g => g.nodes.length > 0);

  return (
    <div className="flex flex-col h-full">
      {/* Stats bar */}
      {result && !loading && (
        <div className="px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)]">{result.total} layers scanned</span>
            <button
              onClick={onRescan}
              className="ml-auto text-[10px] text-[var(--color-figma-accent)] hover:underline"
            >
              Rescan
            </button>
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
                        onClick={e => { e.stopPropagation(); onSelectNodes(nodes.map(n => n.id)); }}
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
                  onClick={() => selectAll(filter)}
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
