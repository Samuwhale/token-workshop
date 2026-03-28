import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { swatchBgColor } from '../shared/colorUtils';
import type { TokenMapEntry } from '../../shared/types';
import { extractAliasPath, isAlias, resolveTokenValue } from '../../shared/resolveAlias';
import type { TokenValue, TokenReference } from '@tokenmanager/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FlowNode {
  path: string;
  $type: string;
  $value: TokenValue | TokenReference;
  resolvedHex: string | null; // resolved color hex for swatches
  /** 'source' = upstream ref, 'center' = selected, 'dependent' = downstream */
  role: 'source' | 'center' | 'dependent';
}

export interface TokenFlowPanelProps {
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  onNavigateToToken?: (path: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get all direct alias references from a token value (handles composite sub-props too) */
function getDirectReferences(value: TokenValue | TokenReference): string[] {
  if (typeof value === 'string') {
    const p = extractAliasPath(value);
    return p ? [p] : [];
  }
  if (value && typeof value === 'object') {
    const refs: string[] = [];
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (item && typeof item === 'object') {
        for (const v of Object.values(item as Record<string, unknown>)) {
          if (typeof v === 'string') {
            const p = extractAliasPath(v);
            if (p) refs.push(p);
          }
        }
      }
    }
    return refs;
  }
  return [];
}

/** Build reverse dependency map: path → set of paths that reference it */
function buildDependentsMap(
  tokenMap: Record<string, TokenMapEntry>,
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const [path, entry] of Object.entries(tokenMap)) {
    const refs = getDirectReferences(entry.$value);
    for (const ref of refs) {
      if (!map.has(ref)) map.set(ref, new Set());
      map.get(ref)!.add(path);
    }
  }
  return map;
}

function tryResolveColor(
  path: string,
  tokenMap: Record<string, TokenMapEntry>,
): string | null {
  const entry = tokenMap[path];
  if (!entry) return null;
  const result = resolveTokenValue(entry.$value, entry.$type, tokenMap);
  const v = result.value;
  if (typeof v === 'string' && /^#[0-9a-fA-F]{6,8}$/.test(v)) return v;
  return null;
}

function shortPath(path: string): string {
  const parts = path.split('.');
  if (parts.length <= 2) return path;
  return parts[0] + '…' + parts.slice(-1)[0];
}

function formatValue(value: TokenValue | TokenReference): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') return JSON.stringify(value).slice(0, 60);
  return '?';
}

// ---------------------------------------------------------------------------
// Search component
// ---------------------------------------------------------------------------

function TokenSearch({
  tokenMap,
  onSelect,
}: {
  tokenMap: Record<string, TokenMapEntry>;
  onSelect: (path: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const paths = Object.keys(tokenMap);
    const matches: string[] = [];
    for (const p of paths) {
      if (p.toLowerCase().includes(q)) {
        matches.push(p);
        if (matches.length >= 20) break;
      }
    }
    return matches;
  }, [query, tokenMap]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        className="w-full px-2 py-1.5 text-xs bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded focus:border-[var(--color-figma-accent)] focus:outline-none"
        placeholder="Search token to visualize…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
      />
      {focused && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-0.5 max-h-48 overflow-y-auto bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded shadow-lg">
          {results.map(p => (
            <button
              key={p}
              className="w-full text-left px-2 py-1 text-xs hover:bg-[var(--color-figma-bg-hover)] truncate"
              onMouseDown={e => {
                e.preventDefault();
                setQuery('');
                setFocused(false);
                onSelect(p);
              }}
            >
              <span className="opacity-50">{tokenMap[p].$type}</span>{' '}
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Graph node component (rendered with HTML overlay, positioned absolutely)
// ---------------------------------------------------------------------------

const NODE_W = 180;
const NODE_H = 56;
const COL_GAP = 80;
const ROW_GAP = 12;

function FlowNodeCard({
  node,
  x,
  y,
  isCenter,
  onClick,
}: {
  node: FlowNode;
  x: number;
  y: number;
  isCenter: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`absolute rounded border text-xs select-none transition-shadow ${
        isCenter
          ? 'border-[var(--color-figma-accent)] shadow-md bg-[var(--color-figma-bg)]'
          : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] hover:border-[var(--color-figma-accent)] hover:shadow cursor-pointer'
      }`}
      style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
      onClick={isCenter ? undefined : onClick}
      title={node.path}
    >
      <div className="px-2 pt-1.5 flex items-center gap-1.5 truncate">
        {node.resolvedHex && (
          <span
            className="inline-block w-3 h-3 rounded-sm border border-[var(--color-figma-border)] flex-shrink-0"
            style={{ backgroundColor: swatchBgColor(node.resolvedHex) }}
          />
        )}
        <span className="font-medium truncate">{node.path.split('.').pop()}</span>
        <span className="ml-auto opacity-40 flex-shrink-0">{node.$type}</span>
      </div>
      <div className="px-2 pt-0.5 truncate opacity-60" title={formatValue(node.$value)}>
        {formatValue(node.$value)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SVG edge drawing
// ---------------------------------------------------------------------------

function FlowEdges({
  edges,
}: {
  edges: { x1: number; y1: number; x2: number; y2: number }[];
}) {
  if (edges.length === 0) return null;
  // Compute bounding box
  let maxX = 0, maxY = 0;
  for (const e of edges) {
    maxX = Math.max(maxX, e.x1, e.x2);
    maxY = Math.max(maxY, e.y1, e.y2);
  }
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ width: maxX + 20, height: maxY + 20 }}
    >
      <defs>
        <marker
          id="flow-arrow"
          viewBox="0 0 10 7"
          refX="10"
          refY="3.5"
          markerWidth="8"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0L10 3.5L0 7z" fill="var(--color-figma-accent)" />
        </marker>
      </defs>
      {edges.map((e, i) => {
        const dx = e.x2 - e.x1;
        const cpOffset = Math.abs(dx) * 0.4;
        return (
          <path
            key={i}
            d={`M${e.x1},${e.y1} C${e.x1 + cpOffset},${e.y1} ${e.x2 - cpOffset},${e.y2} ${e.x2},${e.y2}`}
            fill="none"
            stroke="var(--color-figma-accent)"
            strokeWidth="1.5"
            strokeOpacity="0.5"
            markerEnd="url(#flow-arrow)"
          />
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function TokenFlowPanel({
  allTokensFlat,
  pathToSet,
  onNavigateToToken,
}: TokenFlowPanelProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build dependents map once
  const dependentsMap = useMemo(() => buildDependentsMap(allTokensFlat), [allTokensFlat]);

  // Build graph data for selected token
  const graphData = useMemo(() => {
    if (!selectedPath || !allTokensFlat[selectedPath]) return null;

    const centerEntry = allTokensFlat[selectedPath];
    const centerNode: FlowNode = {
      path: selectedPath,
      $type: centerEntry.$type,
      $value: centerEntry.$value,
      resolvedHex: tryResolveColor(selectedPath, allTokensFlat),
      role: 'center',
    };

    // Upstream: what this token references (walk full chain)
    const sourceNodes: FlowNode[] = [];
    const directRefs = getDirectReferences(centerEntry.$value);
    const seenUp = new Set<string>();
    const queue = [...directRefs];
    while (queue.length > 0 && sourceNodes.length < 20) {
      const ref = queue.shift()!;
      if (seenUp.has(ref) || ref === selectedPath) continue;
      seenUp.add(ref);
      const entry = allTokensFlat[ref];
      if (!entry) continue;
      sourceNodes.push({
        path: ref,
        $type: entry.$type,
        $value: entry.$value,
        resolvedHex: tryResolveColor(ref, allTokensFlat),
        role: 'source',
      });
      // Continue walking chain
      const nextRefs = getDirectReferences(entry.$value);
      for (const nr of nextRefs) {
        if (!seenUp.has(nr)) queue.push(nr);
      }
    }

    // Downstream: what references this token (walk full chain)
    const depNodes: FlowNode[] = [];
    const seenDown = new Set<string>();
    const dQueue = [...(dependentsMap.get(selectedPath) ?? [])];
    while (dQueue.length > 0 && depNodes.length < 30) {
      const dep = dQueue.shift()!;
      if (seenDown.has(dep) || dep === selectedPath) continue;
      seenDown.add(dep);
      const entry = allTokensFlat[dep];
      if (!entry) continue;
      depNodes.push({
        path: dep,
        $type: entry.$type,
        $value: entry.$value,
        resolvedHex: tryResolveColor(dep, allTokensFlat),
        role: 'dependent',
      });
      // Continue walking chain
      const nextDeps = dependentsMap.get(dep);
      if (nextDeps) {
        for (const nd of nextDeps) {
          if (!seenDown.has(nd)) dQueue.push(nd);
        }
      }
    }

    return { centerNode, sourceNodes, depNodes };
  }, [selectedPath, allTokensFlat, dependentsMap]);

  // Layout: 3 columns — sources | center | dependents
  const layout = useMemo(() => {
    if (!graphData) return null;
    const { centerNode, sourceNodes, depNodes } = graphData;

    const srcCount = sourceNodes.length;
    const depCount = depNodes.length;
    const maxSideCount = Math.max(srcCount, depCount, 1);

    const totalHeight = Math.max(
      maxSideCount * (NODE_H + ROW_GAP) - ROW_GAP,
      NODE_H
    );
    const centerY = totalHeight / 2 - NODE_H / 2;

    // Source column (left)
    const srcX = 20;
    const srcStartY = totalHeight / 2 - (srcCount * (NODE_H + ROW_GAP) - ROW_GAP) / 2;
    const srcPositions = sourceNodes.map((_, i) => ({
      x: srcX,
      y: srcStartY + i * (NODE_H + ROW_GAP),
    }));

    // Center column
    const centerX = srcX + NODE_W + COL_GAP;
    const centerPos = { x: centerX, y: centerY };

    // Dependent column (right)
    const depX = centerX + NODE_W + COL_GAP;
    const depStartY = totalHeight / 2 - (depCount * (NODE_H + ROW_GAP) - ROW_GAP) / 2;
    const depPositions = depNodes.map((_, i) => ({
      x: depX,
      y: depStartY + i * (NODE_H + ROW_GAP),
    }));

    // Edges: source → center, center → dependent
    const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const sp of srcPositions) {
      edges.push({
        x1: sp.x + NODE_W,
        y1: sp.y + NODE_H / 2,
        x2: centerPos.x,
        y2: centerPos.y + NODE_H / 2,
      });
    }
    for (const dp of depPositions) {
      edges.push({
        x1: centerPos.x + NODE_W,
        y1: centerPos.y + NODE_H / 2,
        x2: dp.x,
        y2: dp.y + NODE_H / 2,
      });
    }

    const totalWidth = depX + NODE_W + 20;

    return {
      centerNode, sourceNodes, depNodes,
      centerPos, srcPositions, depPositions,
      edges,
      totalWidth,
      totalHeight: totalHeight + 40,
    };
  }, [graphData]);

  const handleNodeClick = useCallback((path: string) => {
    setSelectedPath(path);
  }, []);

  const handleNavigate = useCallback((path: string) => {
    onNavigateToToken?.(path);
  }, [onNavigateToToken]);

  // Scroll to center when layout changes
  useEffect(() => {
    if (layout && scrollRef.current) {
      const el = scrollRef.current;
      const scrollX = Math.max(0, (layout.totalWidth - el.clientWidth) / 2);
      el.scrollLeft = scrollX;
    }
  }, [layout]);

  // Stats
  const stats = useMemo(() => {
    const totalTokens = Object.keys(allTokensFlat).length;
    let aliasCount = 0;
    for (const entry of Object.values(allTokensFlat)) {
      if (isAlias(entry.$value)) aliasCount++;
    }
    return { totalTokens, aliasCount };
  }, [allTokensFlat]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2 border-b border-[var(--color-figma-border)]">
        <div className="flex items-center gap-2 mb-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
            <circle cx="5" cy="12" r="3" /><circle cx="19" cy="6" r="3" /><circle cx="19" cy="18" r="3" />
            <path d="M8 12h4m0 0l4-6m-4 6l4 6" />
          </svg>
          <span className="text-xs font-semibold">Token Flow</span>
          <span className="ml-auto text-[10px] opacity-40">
            {stats.totalTokens} tokens · {stats.aliasCount} aliases
          </span>
        </div>
        <TokenSearch tokenMap={allTokensFlat} onSelect={setSelectedPath} />
      </div>

      {/* Graph area */}
      {!selectedPath && (
        <div className="flex-1 flex items-center justify-center text-xs opacity-40 px-4 text-center">
          <div>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 opacity-30">
              <circle cx="5" cy="12" r="3" /><circle cx="19" cy="6" r="3" /><circle cx="19" cy="18" r="3" />
              <path d="M8 12h4m0 0l4-6m-4 6l4 6" />
            </svg>
            Search for a token above to visualize its reference graph.
            <br />
            See what it references and what depends on it.
          </div>
        </div>
      )}

      {selectedPath && !graphData && (
        <div className="flex-1 flex items-center justify-center text-xs opacity-40">
          Token not found: {selectedPath}
        </div>
      )}

      {layout && (
        <div className="flex-1 overflow-auto" ref={scrollRef}>
          <div
            className="relative"
            style={{
              width: layout.totalWidth,
              minHeight: layout.totalHeight,
              padding: '20px 0',
            }}
          >
            {/* Column labels */}
            {layout.sourceNodes.length > 0 && (
              <div
                className="absolute text-[10px] font-medium uppercase tracking-wider opacity-30"
                style={{ left: layout.srcPositions[0]?.x ?? 20, top: 4 }}
              >
                References
              </div>
            )}
            <div
              className="absolute text-[10px] font-medium uppercase tracking-wider opacity-30"
              style={{ left: layout.centerPos.x, top: 4 }}
            >
              Selected
            </div>
            {layout.depNodes.length > 0 && (
              <div
                className="absolute text-[10px] font-medium uppercase tracking-wider opacity-30"
                style={{ left: layout.depPositions[0]?.x ?? 0, top: 4 }}
              >
                Dependents
              </div>
            )}

            {/* SVG edges */}
            <FlowEdges edges={layout.edges} />

            {/* Source nodes */}
            {layout.sourceNodes.map((node, i) => (
              <FlowNodeCard
                key={node.path}
                node={node}
                x={layout.srcPositions[i].x}
                y={layout.srcPositions[i].y + 20}
                isCenter={false}
                onClick={() => handleNodeClick(node.path)}
              />
            ))}

            {/* Center node */}
            <FlowNodeCard
              node={layout.centerNode}
              x={layout.centerPos.x}
              y={layout.centerPos.y + 20}
              isCenter={true}
              onClick={() => {}}
            />

            {/* Dependent nodes */}
            {layout.depNodes.map((node, i) => (
              <FlowNodeCard
                key={node.path}
                node={node}
                x={layout.depPositions[i].x}
                y={layout.depPositions[i].y + 20}
                isCenter={false}
                onClick={() => handleNodeClick(node.path)}
              />
            ))}
          </div>

          {/* Legend / actions below graph */}
          {selectedPath && (
            <div className="px-3 pb-3 pt-1 border-t border-[var(--color-figma-border)]">
              <div className="flex items-center gap-3 text-[10px] opacity-50">
                <span>Click a node to explore it</span>
                <span>·</span>
                <span>{layout.sourceNodes.length} reference{layout.sourceNodes.length !== 1 ? 's' : ''}</span>
                <span>·</span>
                <span>{layout.depNodes.length} dependent{layout.depNodes.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs truncate font-medium">{selectedPath}</span>
                {pathToSet[selectedPath] && (
                  <span className="text-[10px] opacity-40 flex-shrink-0">
                    in {pathToSet[selectedPath]}
                  </span>
                )}
                {onNavigateToToken && (
                  <button
                    className="ml-auto text-[10px] text-[var(--color-figma-accent)] hover:underline flex-shrink-0"
                    onClick={() => handleNavigate(selectedPath)}
                  >
                    Go to token →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
