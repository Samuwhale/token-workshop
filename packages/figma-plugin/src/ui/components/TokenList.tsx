import React, { useState, useCallback } from 'react';
import type { TokenNode } from '../hooks/useTokens';
import { PropertyPicker } from './PropertyPicker';
import { ConfirmModal } from './ConfirmModal';
import { TOKEN_PROPERTY_MAP } from '../../shared/types';
import type { BindableProperty, NodeCapabilities, SelectionNodeInfo, TokenMapEntry } from '../../shared/types';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';

interface TokenListProps {
  tokens: TokenNode[];
  setName: string;
  serverUrl: string;
  connected: boolean;
  selectedNodes: SelectionNodeInfo[];
  allTokensFlat: Record<string, TokenMapEntry>;
  onEdit: (path: string) => void;
  onRefresh: () => void;
}

type DeleteConfirm =
  | { type: 'token'; path: string }
  | { type: 'group'; path: string; name: string; tokenCount: number }
  | { type: 'bulk'; paths: string[]; orphanCount: number };

export function TokenList({ tokens, setName, serverUrl, connected, selectedNodes, allTokensFlat, onEdit, onRefresh }: TokenListProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTokenPath, setNewTokenPath] = useState('');
  const [newTokenType, setNewTokenType] = useState('color');
  const [applying, setApplying] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // Merge capabilities from all selected nodes for the property picker
  const selectionCapabilities: NodeCapabilities | null = selectedNodes.length > 0
    ? {
        hasFills: selectedNodes.some(n => n.capabilities.hasFills),
        hasStrokes: selectedNodes.some(n => n.capabilities.hasStrokes),
        hasAutoLayout: selectedNodes.some(n => n.capabilities.hasAutoLayout),
        isText: selectedNodes.some(n => n.capabilities.isText),
        hasEffects: selectedNodes.some(n => n.capabilities.hasEffects),
      }
    : null;

  const handleCreate = async () => {
    if (!newTokenPath || !connected) return;
    try {
      await fetch(`${serverUrl}/api/tokens/${setName}/${newTokenPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          $type: newTokenType,
          $value: getDefaultValue(newTokenType),
        }),
      });
      setShowCreateForm(false);
      setNewTokenPath('');
      onRefresh();
    } catch (err) {
      console.error('Failed to create token:', err);
    }
  };

  const requestDeleteToken = useCallback((path: string) => {
    if (!connected) return;
    setDeleteConfirm({ type: 'token', path });
  }, [connected]);

  const requestDeleteGroup = useCallback((path: string, name: string, tokenCount: number) => {
    if (!connected) return;
    setDeleteConfirm({ type: 'group', path, name, tokenCount });
  }, [connected]);

  const requestBulkDelete = useCallback(() => {
    if (!connected || selectedPaths.size === 0) return;
    const paths = [...selectedPaths];
    const orphanCount = Object.entries(allTokensFlat).filter(([tokenPath, token]) => {
      if (selectedPaths.has(tokenPath)) return false;
      const val = token.$value;
      if (typeof val !== 'string' || !val.startsWith('{')) return false;
      const aliasPath = val.slice(1, -1);
      return selectedPaths.has(aliasPath);
    }).length;
    setDeleteConfirm({ type: 'bulk', paths, orphanCount });
  }, [connected, selectedPaths, allTokensFlat]);

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    setDeleteConfirm(null);
    try {
      if (deleteConfirm.type === 'token' || deleteConfirm.type === 'group') {
        await fetch(`${serverUrl}/api/tokens/${setName}/${deleteConfirm.path}`, { method: 'DELETE' });
      } else {
        await Promise.all(
          deleteConfirm.paths.map(path =>
            fetch(`${serverUrl}/api/tokens/${setName}/${path}`, { method: 'DELETE' })
          )
        );
        setSelectedPaths(new Set());
        setSelectMode(false);
      }
      onRefresh();
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const toggleSelect = (path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const flattenTokens = (nodes: TokenNode[]): any[] => {
    const result: any[] = [];
    const walk = (list: TokenNode[]) => {
      for (const node of list) {
        if (!node.isGroup) {
          result.push({ path: node.path, $type: node.$type, $value: node.$value, setName });
        }
        if (node.children) walk(node.children);
      }
    };
    walk(nodes);
    return result;
  };

  const resolveFlat = (flat: any[]) =>
    flat.map(t => {
      const resolved = resolveTokenValue(t.$value, t.$type, allTokensFlat);
      return { ...t, $value: resolved.value ?? t.$value, $type: resolved.$type };
    });

  const handleApplyVariables = async () => {
    setApplying(true);
    const flat = resolveFlat(flattenTokens(tokens));
    parent.postMessage({ pluginMessage: { type: 'apply-variables', tokens: flat } }, '*');
    setTimeout(() => setApplying(false), 1500);
  };

  const handleApplyStyles = async () => {
    setApplying(true);
    const flat = resolveFlat(flattenTokens(tokens));
    parent.postMessage({ pluginMessage: { type: 'apply-styles', tokens: flat } }, '*');
    setTimeout(() => setApplying(false), 1500);
  };

  const getDeleteModalProps = (): { title: string; description?: string; confirmLabel: string } | null => {
    if (!deleteConfirm) return null;
    if (deleteConfirm.type === 'token') {
      const name = deleteConfirm.path.split('.').pop() ?? deleteConfirm.path;
      return {
        title: `Delete "${name}"?`,
        description: `Token path: ${deleteConfirm.path}`,
        confirmLabel: 'Delete',
      };
    }
    if (deleteConfirm.type === 'group') {
      return {
        title: `Delete group "${deleteConfirm.name}"?`,
        description: `This will delete ${deleteConfirm.tokenCount} token${deleteConfirm.tokenCount !== 1 ? 's' : ''} in this group.`,
        confirmLabel: `Delete group (${deleteConfirm.tokenCount} token${deleteConfirm.tokenCount !== 1 ? 's' : ''})`,
      };
    }
    const { paths, orphanCount } = deleteConfirm;
    return {
      title: `Delete ${paths.length} token${paths.length !== 1 ? 's' : ''}?`,
      description: orphanCount > 0
        ? `${orphanCount} other token${orphanCount !== 1 ? 's' : ''} alias these and will become broken references.`
        : undefined,
      confirmLabel: `Delete ${paths.length} token${paths.length !== 1 ? 's' : ''}`,
    };
  };

  const modalProps = getDeleteModalProps();

  return (
    <div className="flex flex-col h-full">
      {/* Token tree */}
      <div className="flex-1 overflow-y-auto">
        {/* Select mode toolbar */}
        {selectMode && (
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] flex-1">
              {selectedPaths.size} selected
            </span>
            {selectedPaths.size > 0 && (
              <button
                onClick={requestBulkDelete}
                className="px-2 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-error)] text-white hover:opacity-90 transition-opacity"
              >
                Delete {selectedPaths.size}
              </button>
            )}
            <button
              onClick={() => { setSelectMode(false); setSelectedPaths(new Set()); }}
              className="px-2 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              Cancel
            </button>
          </div>
        )}

        {tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--color-figma-text-secondary)]">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <p className="mt-2 text-[12px]">No tokens yet</p>
            <p className="text-[10px]">Create a token or import from Figma</p>
          </div>
        ) : (
          <div className="py-1">
            {tokens.map(node => (
              <TokenTreeNode
                key={node.path}
                node={node}
                depth={0}
                onEdit={onEdit}
                onDelete={requestDeleteToken}
                onDeleteGroup={requestDeleteGroup}
                setName={setName}
                selectionCapabilities={selectionCapabilities}
                allTokensFlat={allTokensFlat}
                selectMode={selectMode}
                isSelected={selectedPaths.has(node.path)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <div className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="Token path (e.g. color.primary.500)"
              value={newTokenPath}
              onChange={e => setNewTokenPath(e.target.value)}
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <select
              value={newTokenType}
              onChange={e => setNewTokenType(e.target.value)}
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none"
            >
              <option value="color">Color</option>
              <option value="dimension">Dimension</option>
              <option value="typography">Typography</option>
              <option value="shadow">Shadow</option>
              <option value="border">Border</option>
              <option value="number">Number</option>
              <option value="string">String</option>
              <option value="boolean">Boolean</option>
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newTokenPath}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
              >
                Create
              </button>
              <button
                onClick={() => { setShowCreateForm(false); setNewTokenPath(''); }}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom actions */}
      <div className="p-2 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col gap-1.5">
        {!showCreateForm && (
          <div className="flex gap-1.5">
            <button
              onClick={() => setShowCreateForm(true)}
              disabled={!connected}
              className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
            >
              + New Token
            </button>
            {!selectMode && tokens.length > 0 && (
              <button
                onClick={() => setSelectMode(true)}
                className="px-2.5 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[10px] hover:bg-[var(--color-figma-bg-hover)]"
                title="Select tokens for bulk actions"
              >
                Select
              </button>
            )}
          </div>
        )}
        <div className="flex gap-1.5">
          <button
            onClick={handleApplyVariables}
            disabled={applying || tokens.length === 0}
            className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
          >
            Apply as Variables
          </button>
          <button
            onClick={handleApplyStyles}
            disabled={applying || tokens.length === 0}
            className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
          >
            Apply as Styles
          </button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && modalProps && (
        <ConfirmModal
          title={modalProps.title}
          description={modalProps.description}
          confirmLabel={modalProps.confirmLabel}
          danger
          onConfirm={executeDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

function TokenTreeNode({
  node,
  depth,
  onEdit,
  onDelete,
  onDeleteGroup,
  setName,
  selectionCapabilities,
  allTokensFlat,
  selectMode,
  isSelected,
  onToggleSelect,
}: {
  node: TokenNode;
  depth: number;
  onEdit: (path: string) => void;
  onDelete: (path: string) => void;
  onDeleteGroup: (path: string, name: string, tokenCount: number) => void;
  setName: string;
  selectionCapabilities: NodeCapabilities | null;
  allTokensFlat: Record<string, TokenMapEntry>;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [hovered, setHovered] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ top: number; left: number } | undefined>();

  const displayValue = isAlias(node.$value)
    ? resolveTokenValue(node.$value, node.$type || 'unknown', allTokensFlat).value ?? node.$value
    : node.$value;

  const applyWithProperty = (property: BindableProperty) => {
    const resolved = resolveTokenValue(node.$value, node.$type || 'unknown', allTokensFlat);
    if (resolved.error) {
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Cannot apply: ${resolved.error}` } }, '*');
      return;
    }
    parent.postMessage({
      pluginMessage: {
        type: 'apply-to-selection',
        tokenPath: node.path,
        tokenType: resolved.$type,
        targetProperty: property,
        resolvedValue: resolved.value,
      },
    }, '*');
    setShowPicker(false);
  };

  const handleApplyToSelection = (e: React.MouseEvent) => {
    if (!node.$type) return;
    const validProps = TOKEN_PROPERTY_MAP[node.$type];
    if (!validProps || validProps.length === 0) return;

    if (validProps.length === 1) {
      applyWithProperty(validProps[0]);
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPickerAnchor({ top: rect.bottom + 2, left: rect.left });
      setShowPicker(true);
    }
  };

  if (node.isGroup) {
    const leafCount = countLeaves(node);
    return (
      <div>
        <div
          className="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-[var(--color-figma-bg-hover)] transition-colors group/group"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="currentColor"
          >
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
          <span className="text-[11px] font-medium text-[var(--color-figma-text)] flex-1">{node.name}</span>
          {node.children && (
            <span className="text-[9px] text-[var(--color-figma-text-secondary)] ml-1">
              ({leafCount} tokens)
            </span>
          )}
          {!selectMode && (
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteGroup(node.path, node.name, leafCount); }}
              title="Delete group"
              className="opacity-0 group-hover/group:opacity-100 p-1 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-error)] transition-opacity"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          )}
        </div>
        {expanded && node.children?.map(child => (
          <TokenTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            onEdit={onEdit}
            onDelete={onDelete}
            onDeleteGroup={onDeleteGroup}
            setName={setName}
            selectionCapabilities={selectionCapabilities}
            allTokensFlat={allTokensFlat}
            selectMode={selectMode}
            isSelected={false}
            onToggleSelect={onToggleSelect}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="relative flex items-center gap-2 px-2 py-1 hover:bg-[var(--color-figma-bg-hover)] transition-colors group"
      style={{ paddingLeft: `${depth * 16 + 20}px` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowPicker(false); }}
    >
      {/* Checkbox for select mode */}
      {selectMode && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(node.path)}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 cursor-pointer"
        />
      )}

      {/* Value preview (resolve aliases for display) */}
      <ValuePreview type={node.$type} value={displayValue} />

      {/* Name and info */}
      <div
        className="flex-1 min-w-0"
        onClick={selectMode ? () => onToggleSelect(node.path) : undefined}
        style={selectMode ? { cursor: 'pointer' } : undefined}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[var(--color-figma-text)] truncate">{node.name}</span>
          {node.$type && (
            <span className={`px-1 py-0.5 rounded text-[8px] font-medium uppercase token-type-${node.$type}`}>
              {node.$type}
            </span>
          )}
          {isAlias(node.$value) && (
            <span className="text-[8px] text-[var(--color-figma-text-secondary)]" title={`Alias: ${node.$value}`}>
              &rarr;
            </span>
          )}
        </div>
        {node.$description && (
          <div className="text-[9px] text-[var(--color-figma-text-secondary)] truncate">{node.$description}</div>
        )}
      </div>

      {/* Value text */}
      <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0 max-w-[80px] truncate">
        {formatValue(node.$type, displayValue)}
      </span>

      {/* Actions (on hover, not in select mode) */}
      {!selectMode && hovered && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={handleApplyToSelection}
            title="Apply to selection"
            className="p-1 rounded hover:bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)]"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5l7 7-7 7M5 12h14" />
            </svg>
          </button>
          <button
            onClick={() => onEdit(node.path)}
            title="Edit token"
            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(node.path)}
            title="Delete token"
            className="p-1 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-error)]"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      )}

      {/* Property picker dropdown */}
      {showPicker && node.$type && TOKEN_PROPERTY_MAP[node.$type] && (
        <PropertyPicker
          properties={TOKEN_PROPERTY_MAP[node.$type]}
          capabilities={selectionCapabilities}
          onSelect={applyWithProperty}
          onClose={() => setShowPicker(false)}
          anchorRect={pickerAnchor}
        />
      )}
    </div>
  );
}

function ValuePreview({ type, value }: { type?: string; value?: any }) {
  if (type === 'color' && typeof value === 'string') {
    return (
      <div
        className="w-4 h-4 rounded border border-[var(--color-figma-border)] shrink-0"
        style={{ backgroundColor: value }}
      />
    );
  }
  return <div className="w-4 h-4 shrink-0" />;
}

function formatValue(type?: string, value?: any): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') {
    if ('value' in value && 'unit' in value) return `${value.value}${value.unit}`;
    if (type === 'typography' && value.fontSize) {
      const size = typeof value.fontSize === 'object' ? `${value.fontSize.value}${value.fontSize.unit}` : `${value.fontSize}px`;
      return `${value.fontFamily || ''} ${size}`;
    }
    if (type === 'shadow') return 'Shadow';
    if (type === 'border') return 'Border';
    return JSON.stringify(value).slice(0, 30);
  }
  return String(value);
}

function countLeaves(node: TokenNode): number {
  if (!node.isGroup || !node.children) return node.isGroup ? 0 : 1;
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

function getDefaultValue(type: string): any {
  switch (type) {
    case 'color': return '#000000';
    case 'dimension': return { value: 16, unit: 'px' };
    case 'typography': return { fontFamily: 'Inter', fontSize: { value: 16, unit: 'px' }, fontWeight: 400, lineHeight: 1.5, letterSpacing: { value: 0, unit: 'px' } };
    case 'shadow': return { color: '#00000040', offsetX: { value: 0, unit: 'px' }, offsetY: { value: 4, unit: 'px' }, blur: { value: 8, unit: 'px' }, spread: { value: 0, unit: 'px' }, type: 'dropShadow' };
    case 'border': return { color: '#000000', width: { value: 1, unit: 'px' }, style: 'solid' };
    case 'number': return 0;
    case 'string': return '';
    case 'boolean': return false;
    default: return '';
  }
}
