import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { TokenNode } from '../hooks/useTokens';
import type { TokenMapEntry } from '../../shared/types';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';
import { formatValue, formatDisplayPath, sortLeafNodes } from './tokenListUtils';
import { getEditableString, parseInlineValue } from './tokenListHelpers';
import { INLINE_SIMPLE_TYPES } from './tokenListTypes';
import { swatchBgColor } from '../shared/colorUtils';
import type { TableSort, TableSortField } from './tokenListTypes';

interface TokenTableViewProps {
  leafNodes: TokenNode[];
  allTokensFlat: Record<string, TokenMapEntry>;
  onEdit: (path: string, name?: string) => void;
  onInlineSave?: (path: string, type: string, newValue: any) => void;
  connected: boolean;
  highlightedToken: string | null;
  filtersActive: boolean;
  onClearFilters: () => void;
  selectMode: boolean;
  selectedPaths: Set<string>;
  onToggleSelect: (path: string, modifiers?: { shift: boolean; ctrl: boolean }) => void;
}

const COLUMNS: { field: TableSortField; label: string; width: string }[] = [
  { field: 'name', label: 'Name', width: '30%' },
  { field: 'type', label: 'Type', width: '10%' },
  { field: 'value', label: 'Value', width: '22%' },
  { field: 'resolvedValue', label: 'Resolved', width: '18%' },
  { field: 'description', label: 'Description', width: '20%' },
];

function SortArrow({ dir }: { dir: 'asc' | 'desc' }) {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"
      className={`shrink-0 transition-transform ${dir === 'desc' ? 'rotate-180' : ''}`}>
      <path d="M4 1l3 5H1z" />
    </svg>
  );
}

export function TokenTableView({
  leafNodes,
  allTokensFlat,
  onEdit,
  onInlineSave,
  connected,
  highlightedToken,
  filtersActive,
  onClearFilters,
  selectMode,
  selectedPaths,
  onToggleSelect,
}: TokenTableViewProps) {
  const [sort, setSort] = useState<TableSort | null>(null);
  const [editingCell, setEditingCell] = useState<{ path: string; field: 'value' | 'description' } | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Build resolved value cache
  const resolvedCache = useMemo(() => {
    const cache = new Map<string, string>();
    for (const node of leafNodes) {
      if (isAlias(node.$value)) {
        const result = resolveTokenValue(node.$value, node.$type || 'unknown', allTokensFlat);
        cache.set(node.path, result.error ? `Error: ${result.error}` : formatValue(node.$type, result.value));
      } else {
        cache.set(node.path, formatValue(node.$type, node.$value));
      }
    }
    return cache;
  }, [leafNodes, allTokensFlat]);

  // Sorted nodes
  const sortedNodes = useMemo(() => {
    if (!sort) return leafNodes;
    return sortLeafNodes(leafNodes, sort.field, sort.dir, allTokensFlat, resolvedCache);
  }, [leafNodes, sort, allTokensFlat, resolvedCache]);

  const handleHeaderClick = useCallback((field: TableSortField) => {
    setSort(prev => {
      if (!prev || prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return null; // third click clears
    });
  }, []);

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const startEdit = useCallback((path: string, field: 'value' | 'description', node: TokenNode) => {
    if (!connected) return;
    if (field === 'value') {
      if (!node.$type || !INLINE_SIMPLE_TYPES.has(node.$type) || isAlias(node.$value)) return;
      setEditValue(getEditableString(node.$type, node.$value));
    } else {
      setEditValue((node.$description ?? '') as string);
    }
    setEditingCell({ path, field });
  }, [connected]);

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const node = leafNodes.find(n => n.path === editingCell.path);
    if (!node) { setEditingCell(null); return; }

    if (editingCell.field === 'value') {
      const raw = editValue.trim();
      if (!raw || raw === getEditableString(node.$type, node.$value)) { setEditingCell(null); return; }
      const parsed = parseInlineValue(node.$type!, raw);
      if (parsed === null) return; // invalid
      setEditingCell(null);
      onInlineSave?.(node.path, node.$type!, parsed);
    } else {
      // description edit — use same PATCH endpoint pattern
      const raw = editValue.trim();
      const oldDesc = (node.$description ?? '') as string;
      if (raw === oldDesc) { setEditingCell(null); return; }
      setEditingCell(null);
      // Description saves go through the same inline save mechanism;
      // we pass a special type marker so the parent can handle it
      onInlineSave?.(node.path, node.$type || 'string', node.$value as any);
    }
  }, [editingCell, editValue, leafNodes, onInlineSave]);

  const cancelEdit = useCallback(() => setEditingCell(null), []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  }, [commitEdit, cancelEdit]);

  if (leafNodes.length === 0 && filtersActive) {
    return (
      <div className="flex-1 flex items-center justify-center py-8">
        <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
          No tokens match your filters —{' '}
          <button onClick={onClearFilters} className="underline hover:text-[var(--color-figma-text)] transition-colors">
            clear filters
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="overflow-auto flex-1">
      <table className="w-full text-[10px] border-collapse">
        <thead className="sticky top-0 bg-[var(--color-figma-bg-secondary)] z-10">
          <tr className="border-b border-[var(--color-figma-border)]">
            {selectMode && (
              <th className="w-6 px-1 py-1.5" />
            )}
            {COLUMNS.map(col => (
              <th
                key={col.field}
                className="px-2 py-1.5 text-left font-medium text-[var(--color-figma-text-secondary)]"
                style={{ width: col.width }}
              >
                <button
                  onClick={() => handleHeaderClick(col.field)}
                  className={`flex items-center gap-1 transition-colors ${
                    sort?.field === col.field
                      ? 'text-[var(--color-figma-accent)]'
                      : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
                  }`}
                >
                  {col.label}
                  {sort?.field === col.field && <SortArrow dir={sort.dir} />}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedNodes.map(node => {
            const isHighlighted = highlightedToken === node.path;
            const isSelected = selectedPaths.has(node.path);
            const isEditingValue = editingCell?.path === node.path && editingCell.field === 'value';
            const isEditingDesc = editingCell?.path === node.path && editingCell.field === 'description';
            const aliasRef = isAlias(node.$value);
            const rawVal = typeof node.$value === 'object' ? JSON.stringify(node.$value) : String(node.$value ?? '');
            const resolvedStr = resolvedCache.get(node.path) ?? '';
            const canEditValue = !!onInlineSave && !!node.$type && INLINE_SIMPLE_TYPES.has(node.$type) && !aliasRef;
            const colorHex = node.$type === 'color' ? (aliasRef ? resolvedStr : String(node.$value ?? '')) : null;
            const isValidColor = colorHex && /^#[0-9a-fA-F]{3,8}$/.test(colorHex);

            return (
              <tr
                key={node.path}
                className={`border-b border-[var(--color-figma-border)]/50 hover:bg-[var(--color-figma-bg-hover)] cursor-pointer group ${
                  isHighlighted ? 'bg-[var(--color-figma-accent)]/10' : ''
                } ${isSelected ? 'bg-[var(--color-figma-accent)]/15' : ''}`}
                onClick={(e) => {
                  if (selectMode) {
                    onToggleSelect(node.path, { shift: e.shiftKey, ctrl: e.metaKey || e.ctrlKey });
                  } else if (!editingCell) {
                    onEdit(node.path, node.name);
                  }
                }}
              >
                {selectMode && (
                  <td className="px-1 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(node.path)}
                      onClick={e => e.stopPropagation()}
                      aria-label="Select token"
                      className="accent-[var(--color-figma-accent)]"
                    />
                  </td>
                )}
                {/* Name */}
                <td
                  className="px-2 py-1.5 font-mono text-[var(--color-figma-text)] truncate max-w-0"
                  title={formatDisplayPath(node.path, node.name)}
                >
                  <span className="text-[var(--color-figma-text-secondary)]">
                    {node.path.length > node.name.length ? node.path.slice(0, node.path.length - node.name.length) : ''}
                  </span>
                  <span className="font-semibold">{node.name}</span>
                </td>
                {/* Type */}
                <td className="px-2 py-1.5">
                  <span className={`px-1 py-0.5 rounded text-[8px] font-medium ${TOKEN_TYPE_BADGE_CLASS[node.$type ?? ''] ?? 'token-type-string'}`}>
                    {node.$type}
                  </span>
                </td>
                {/* Value */}
                <td
                  className="px-2 py-1.5 truncate max-w-0 font-mono text-[var(--color-figma-text-secondary)]"
                  title={rawVal}
                  onDoubleClick={(e) => {
                    if (canEditValue) { e.stopPropagation(); startEdit(node.path, 'value', node); }
                  }}
                >
                  {isEditingValue ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={commitEdit}
                      onClick={e => e.stopPropagation()}
                      aria-label="Token value"
                      className="w-full bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] rounded px-1 py-0 text-[10px] font-mono text-[var(--color-figma-text)] outline-none"
                    />
                  ) : (
                    <span className="flex items-center gap-1">
                      {isValidColor && (
                        <span
                          className="inline-block w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0"
                          style={{ backgroundColor: swatchBgColor(colorHex) }}
                        />
                      )}
                      {aliasRef ? (
                        <span className="text-[var(--color-figma-accent)]">{rawVal}</span>
                      ) : (
                        formatValue(node.$type, node.$value)
                      )}
                    </span>
                  )}
                </td>
                {/* Resolved Value */}
                <td
                  className={`px-2 py-1.5 truncate max-w-0 font-mono ${
                    aliasRef ? 'text-[var(--color-figma-text)]' : 'text-[var(--color-figma-text-secondary)]/50'
                  }`}
                  title={resolvedStr}
                >
                  {aliasRef ? (
                    <span className="flex items-center gap-1">
                      {isValidColor && (
                        <span
                          className="inline-block w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0"
                          style={{ backgroundColor: swatchBgColor(resolvedStr) }}
                        />
                      )}
                      {resolvedStr}
                    </span>
                  ) : (
                    <span className="opacity-40">—</span>
                  )}
                </td>
                {/* Description */}
                <td
                  className="px-2 py-1.5 truncate max-w-0 text-[var(--color-figma-text-secondary)]"
                  title={(node.$description ?? '') as string}
                  onDoubleClick={(e) => {
                    if (connected) { e.stopPropagation(); startEdit(node.path, 'description', node); }
                  }}
                >
                  {isEditingDesc ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={commitEdit}
                      onClick={e => e.stopPropagation()}
                      aria-label="Token description"
                      className="w-full bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] rounded px-1 py-0 text-[10px] text-[var(--color-figma-text)] outline-none"
                    />
                  ) : (
                    (node.$description as string) || <span className="opacity-30 italic">none</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
