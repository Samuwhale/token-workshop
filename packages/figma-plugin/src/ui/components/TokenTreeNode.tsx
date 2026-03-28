import { useState, useCallback, useEffect, useRef, useLayoutEffect, Fragment } from 'react';
import { TokenTreeNodeProps } from './tokenListTypes';
import type { TokenMapEntry } from '../../shared/types';
import { TOKEN_PROPERTY_MAP, TOKEN_TYPE_BADGE_CLASS, PROPERTY_LABELS } from '../../shared/types';
import type { BindableProperty } from '../../shared/types';
import { isAlias, resolveTokenValue } from '../../shared/resolveAlias';
import { stableStringify } from '../shared/utils';
import { countTokensInGroup, formatDisplayPath, nodeParentPath, formatValue, countLeaves } from './tokenListUtils';
import { getEditableString, parseInlineValue, inferGroupTokenType, highlightMatch } from './tokenListHelpers';
import { INLINE_SIMPLE_TYPES } from './tokenListTypes';
import { PropertyPicker } from './PropertyPicker';
import { ValuePreview } from './ValuePreview';
import { ColorPicker } from './ColorPicker';
import { getQuickBindTargets } from './selectionInspectorUtils';
import { useTokenTree } from './TokenTreeContext';

// ---------------------------------------------------------------------------
// MultiModeCell — compact inline-editable value cell for a single theme option
// ---------------------------------------------------------------------------
function MultiModeCell({
  tokenPath, tokenType, value, targetSet, optionName, onSave,
}: {
  tokenPath: string;
  tokenType: string | undefined;
  value: TokenMapEntry | undefined;
  targetSet: string | null;
  optionName: string;
  onSave?: (path: string, type: string, newValue: any, targetSet: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const escapedRef = useRef(false);

  const canEdit = !!tokenType && INLINE_SIMPLE_TYPES.has(tokenType) && !!targetSet && !!onSave && !isAlias(value?.$value);

  const handleSubmit = useCallback(() => {
    if (!editing || !tokenType || !targetSet || !onSave) return;
    const raw = editValue.trim();
    if (!raw) { setEditing(false); return; }
    const parsed = parseInlineValue(tokenType, raw);
    if (parsed === null) return;
    setEditing(false);
    onSave(tokenPath, tokenType, parsed, targetSet);
  }, [editing, editValue, tokenType, targetSet, tokenPath, onSave]);

  const displayVal = value ? formatValue(value.$type, value.$value) : '—';
  const isColor = tokenType === 'color' && value && typeof value.$value === 'string';

  return (
    <div
      className="w-[80px] shrink-0 px-1 flex items-center justify-center border-l border-[var(--color-figma-border)] h-full"
      title={`${optionName}: ${displayVal}${targetSet ? `\nSet: ${targetSet}` : ''}`}
    >
      {!value ? (
        <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">—</span>
      ) : isColor ? (
        <span
          className={`w-5 h-5 rounded-sm border border-[var(--color-figma-border)] shrink-0 ${canEdit ? 'cursor-pointer hover:ring-1 hover:ring-[var(--color-figma-accent)]' : ''}`}
          style={{ backgroundColor: value.$value as string }}
          onClick={canEdit ? (e) => {
            e.stopPropagation();
            // For color, open a prompt-style edit (simplified — full color picker in cell would be too complex)
            const result = prompt(`Edit color for "${optionName}":`, value.$value as string);
            if (result && result !== value.$value) {
              onSave!(tokenPath, 'color', result, targetSet!);
            }
          } : undefined}
        />
      ) : editing ? (
        <input
          type="text"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => {
            if (escapedRef.current) { escapedRef.current = false; return; }
            handleSubmit();
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
            if (e.key === 'Escape') { e.preventDefault(); escapedRef.current = true; setEditing(false); }
            e.stopPropagation();
          }}
          onClick={e => e.stopPropagation()}
          aria-label="Edit token value"
          autoFocus
          className="text-[10px] w-full text-[var(--color-figma-text)] bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] rounded px-0.5 outline-none"
        />
      ) : (
        <span
          className={`text-[10px] truncate max-w-full ${canEdit ? 'cursor-text hover:underline hover:decoration-dotted text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]' : 'text-[var(--color-figma-text-secondary)]'}`}
          onClick={canEdit ? (e) => {
            e.stopPropagation();
            setEditValue(getEditableString(value.$type, value.$value));
            setEditing(true);
          } : undefined}
        >
          {displayVal}
        </span>
      )}
    </div>
  );
}

export function TokenTreeNode(props: TokenTreeNodeProps) {
  const {
    node, depth, isSelected, lintViolations = [],
    skipChildren, showFullPath, isPinned,
    chainExpanded: chainExpandedProp = false,
    onMoveUp, onMoveDown, multiModeValues,
  } = props;

  const ctx = useTokenTree();
  const {
    setName, selectionCapabilities, allTokensFlat, selectMode,
    expandedPaths, onToggleExpand, duplicateCounts, highlightedToken,
    inspectMode, syncSnapshot, cascadeDiff, generatorsBySource,
    derivedTokenPaths, tokenUsageCounts, searchHighlight, selectedNodes,
    dragOverGroup, dragOverGroupIsInvalid, dragSource, dragOverReorder,
    selectedLeafNodes,
    onEdit, onPreview, onDelete, onDeleteGroup, onToggleSelect,
    onNavigateToAlias, onCreateSibling, onCreateGroup, onRenameGroup,
    onUpdateGroupMeta, onRequestMoveGroup, onRequestMoveToken,
    onDuplicateGroup, onDuplicateToken, onExtractToAlias, onHoverToken,
    onExtractToAliasForLint, onSyncGroup, onSyncGroupStyles,
    onSetGroupScopes, onGenerateScaleFromGroup, onFilterByType,
    onJumpToGroup, onInlineSave, onRenameToken, onDetachFromGenerator,
    onToggleChain, onTogglePin, onDragStart, onDragEnd,
    onDragOverGroup, onDropOnGroup,
    onDragOverToken, onDragLeaveToken, onDropOnToken,
    onMultiModeInlineSave,
  } = ctx;

  const isExpanded = expandedPaths.has(node.path);
  const isHighlighted = highlightedToken === node.path;
  const [hovered, setHovered] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ top: number; left: number } | undefined>();
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [pendingColor, setPendingColor] = useState('');
  const [copiedWhat, setCopiedWhat] = useState<'path' | 'value' | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const chainExpanded = chainExpandedProp;
  const [inlineEditActive, setInlineEditActive] = useState(false);
  const [inlineEditValue, setInlineEditValue] = useState('');
  const inlineEditEscapedRef = useRef(false);
  const [quickBound, setQuickBound] = useState<string | null>(null);
  const [pickerProps, setPickerProps] = useState<BindableProperty[] | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  // Group-specific state
  const [groupMenuPos, setGroupMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [renamingGroup, setRenamingGroup] = useState(false);
  const [renameGroupVal, setRenameGroupVal] = useState('');
  const renameGroupInputRef = useRef<HTMLInputElement>(null);
  const renameGroupEscapedRef = useRef(false);
  const [editingGroupMeta, setEditingGroupMeta] = useState(false);
  const [groupMetaType, setGroupMetaType] = useState('');
  const [groupMetaDescription, setGroupMetaDescription] = useState('');
  const [groupMetaSaving, setGroupMetaSaving] = useState(false);

  // Token rename state
  const [renamingToken, setRenamingToken] = useState(false);
  const [renameTokenVal, setRenameTokenVal] = useState('');
  const renameTokenInputRef = useRef<HTMLInputElement>(null);
  const renameTokenEscapedRef = useRef(false);

  useLayoutEffect(() => {
    if (renamingGroup && renameGroupInputRef.current) {
      renameGroupInputRef.current.focus();
      renameGroupInputRef.current.select();
    }
  }, [renamingGroup]);

  useLayoutEffect(() => {
    if (renamingToken && renameTokenInputRef.current) {
      renameTokenInputRef.current.focus();
      renameTokenInputRef.current.select();
    }
  }, [renamingToken]);

  useEffect(() => {
    if (!groupMenuPos) return;
    const close = () => setGroupMenuPos(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return; }
      const key = e.key.toLowerCase();
      const menuEl = document.querySelector('[data-context-menu="group"]');
      if (!menuEl) return;
      const btn = menuEl.querySelector(`[data-accel="${key}"]`) as HTMLButtonElement | null;
      if (btn) { e.preventDefault(); btn.click(); }
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey); };
  }, [groupMenuPos]);

  // Close context menu on outside click + letter-key accelerators
  useEffect(() => {
    if (!contextMenuPos) return;
    const close = () => setContextMenuPos(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return; }
      const key = e.key.toLowerCase();
      const menuEl = document.querySelector('[data-context-menu="token"]');
      if (!menuEl) return;
      const btn = menuEl.querySelector(`[data-accel="${key}"]`) as HTMLButtonElement | null;
      if (btn) { e.preventDefault(); btn.click(); }
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey); };
  }, [contextMenuPos]);

  // Scroll highlighted token into view (only when NOT in virtual scroll mode)
  useEffect(() => {
    if (isHighlighted && nodeRef.current && !skipChildren) {
      nodeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isHighlighted, skipChildren]);

  const resolveResult = isAlias(node.$value)
    ? resolveTokenValue(node.$value, node.$type || 'unknown', allTokensFlat)
    : null;
  const displayValue = resolveResult ? (resolveResult.value ?? node.$value) : node.$value;
  // chain.length is the number of alias hops (e.g. chain=['B','C'] = A→B→C→value = 3 hops)
  const aliasChain = resolveResult?.chain ?? [];
  const showChainBadge = aliasChain.length >= 2;
  const isBrokenAlias = isAlias(node.$value) && !!resolveResult?.error;

  // Full resolution chain label for alias hover tooltip
  const aliasChainLabel = isAlias(node.$value) && !isBrokenAlias
    ? [node.path, ...aliasChain, formatValue(node.$type, displayValue)].join(' → ')
    : null;

  // Inline quick-edit eligibility
  const canInlineEdit = !node.isGroup && !isAlias(node.$value) && !!node.$type
    && INLINE_SIMPLE_TYPES.has(node.$type) && !!onInlineSave;

  const handleInlineSubmit = useCallback(() => {
    if (!inlineEditActive) return;
    const raw = inlineEditValue.trim();
    if (!raw || raw === getEditableString(node.$type, node.$value)) { setInlineEditActive(false); return; }
    const parsed = parseInlineValue(node.$type!, raw);
    if (parsed === null) return; // invalid value — keep editor open
    setInlineEditActive(false);
    onInlineSave?.(node.path, node.$type!, parsed);
  }, [inlineEditActive, inlineEditValue, node, onInlineSave]);

  // Stepper helpers for number/dimension/fontWeight/duration inline editing
  const isNumericInlineType = node.$type === 'number' || node.$type === 'dimension' || node.$type === 'fontWeight' || node.$type === 'duration';
  const dimParts = node.$type === 'dimension' && inlineEditActive
    ? (inlineEditValue.trim().match(/^(-?\d*\.?\d+)\s*([a-zA-Z%]*)$/) ?? null)
    : null;
  const stepInlineValue = (delta: number) => {
    if (node.$type === 'dimension') {
      const m = inlineEditValue.trim().match(/^(-?\d*\.?\d+)\s*([a-zA-Z%]*)$/);
      if (m) setInlineEditValue(`${Math.round((parseFloat(m[1]) + delta) * 100) / 100}${m[2] || 'px'}`);
    } else {
      const n = parseFloat(inlineEditValue);
      if (!isNaN(n)) setInlineEditValue(String(Math.round((n + delta) * 100) / 100));
    }
  };

  // Sync state indicator
  const syncChanged = !node.isGroup && syncSnapshot && node.path in syncSnapshot
    && syncSnapshot[node.path] !== stableStringify(node.$value);

  // Cascade diff: token resolves to a different value under the proposed set order
  const cascadeChange = !node.isGroup ? cascadeDiff?.[node.path] : undefined;

  const handleCopyPath = () => {
    navigator.clipboard.writeText(node.path).catch(() => {});
    setCopiedWhat('path');
    setTimeout(() => setCopiedWhat(null), 1500);
  };

  const handleCopyValue = () => {
    const val = typeof displayValue === 'string' ? displayValue : JSON.stringify(displayValue);
    navigator.clipboard.writeText(val).catch(() => {});
    setCopiedWhat('value');
    setTimeout(() => setCopiedWhat(null), 1500);
  };

  const handleAliasClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAlias(node.$value) || isBrokenAlias) return;
    const aliasPath = (node.$value as string).slice(1, -1);
    onNavigateToAlias?.(aliasPath);
  };

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

    // Composition tokens apply all their properties at once
    if (node.$type === 'composition') {
      const rawVal = isAlias(node.$value)
        ? resolveTokenValue(node.$value, 'composition', allTokensFlat).value
        : node.$value;
      const compObj = typeof rawVal === 'object' && rawVal !== null ? rawVal : {};
      // Resolve each property value so the controller receives raw values, not references
      const resolvedComp: Record<string, any> = {};
      for (const [prop, propVal] of Object.entries(compObj)) {
        if (isAlias(propVal)) {
          const r = resolveTokenValue(propVal as string, 'unknown', allTokensFlat);
          resolvedComp[prop] = r.error ? propVal : r.value;
        } else {
          resolvedComp[prop] = propVal;
        }
      }
      parent.postMessage({
        pluginMessage: {
          type: 'apply-to-selection',
          tokenPath: node.path,
          tokenType: 'composition',
          targetProperty: 'composition',
          resolvedValue: resolvedComp,
        },
      }, '*');
      return;
    }

    const validProps = TOKEN_PROPERTY_MAP[node.$type];
    if (!validProps || validProps.length === 0) return;

    // Quick-bind: use scope + capability + binding info to narrow targets
    if (selectedNodes && selectedNodes.length > 0) {
      const entry = allTokensFlat[node.path];
      const targets = getQuickBindTargets(
        node.$type,
        entry?.$scopes,
        selectedNodes,
      );
      if (targets.length === 1) {
        applyWithProperty(targets[0]);
        setQuickBound(PROPERTY_LABELS[targets[0]]);
        setTimeout(() => setQuickBound(null), 1500);
        return;
      }
      // If scope filtering narrowed to a subset, show picker with just those
      if (targets.length > 1 && targets.length < validProps.length) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setPickerAnchor({ top: rect.bottom + 2, left: rect.left });
        setPickerProps(targets);
        setShowPicker(true);
        return;
      }
    }

    if (validProps.length === 1) {
      applyWithProperty(validProps[0]);
    } else {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setPickerAnchor({ top: rect.bottom + 2, left: rect.left });
      setPickerProps(null);
      setShowPicker(true);
    }
  };

  const confirmTokenRename = () => {
    const newName = renameTokenVal.trim();
    setRenamingToken(false);
    if (!newName || newName === node.name) return;
    const parentPath = nodeParentPath(node.path, node.name);
    const newPath = parentPath ? `${parentPath}.${newName}` : newName;
    onRenameToken?.(node.path, newPath);
  };

  if (node.isGroup) {
    const leafCount = countLeaves(node);

    const confirmGroupRename = () => {
      const newName = renameGroupVal.trim();
      setRenamingGroup(false);
      if (!newName || newName === node.name) return;
      const parentPath = nodeParentPath(node.path, node.name);
      const newGroupPath = parentPath ? `${parentPath}.${newName}` : newName;
      onRenameGroup?.(node.path, newGroupPath);
    };

    const handleSaveGroupMeta = async () => {
      setGroupMetaSaving(true);
      try {
        await onUpdateGroupMeta?.(node.path, {
          $type: groupMetaType || null,
          $description: groupMetaDescription || null,
        });
        setEditingGroupMeta(false);
      } catch (err) {
        console.error('Failed to save group metadata:', err);
      } finally {
        setGroupMetaSaving(false);
      }
    };

    return (
      <div>
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          aria-label={`Toggle group ${node.name}`}
          data-group-path={node.path}
          className={`relative flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-[var(--color-figma-bg-hover)] transition-colors group/group bg-[var(--color-figma-bg)] ${dragOverGroup === node.path ? (dragOverGroupIsInvalid ? 'ring-1 ring-inset ring-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10' : 'ring-1 ring-inset ring-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10') : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => !renamingGroup && onToggleExpand(node.path)}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('application/x-token-drag')) return;
            e.preventDefault();
            const isInvalid = dragSource ? dragSource.paths.every((oldPath, i) => {
              const newPath = node.path ? `${node.path}.${dragSource.names[i]}` : dragSource.names[i];
              return newPath === oldPath || node.path.startsWith(oldPath + '.');
            }) : false;
            e.dataTransfer.dropEffect = isInvalid ? 'none' : 'move';
            onDragOverGroup?.(node.path, isInvalid);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              onDragOverGroup?.(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            onDropOnGroup?.(node.path);
          }}
          onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === ' ') && !renamingGroup) {
              e.preventDefault();
              onToggleExpand(node.path);
            }
          }}
          onContextMenu={e => {
            e.preventDefault();
            setGroupMenuPos({
              x: Math.min(e.clientX, window.innerWidth - 168),
              y: Math.min(e.clientY, window.innerHeight - 220),
            });
          }}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            className={`transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
          {renamingGroup ? (
            <input
              ref={renameGroupInputRef}
              value={renameGroupVal}
              onChange={e => setRenameGroupVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') confirmGroupRename();
                if (e.key === 'Escape') { renameGroupEscapedRef.current = true; setRenamingGroup(false); }
              }}
              onBlur={() => {
                if (!renameGroupEscapedRef.current) confirmGroupRename();
                renameGroupEscapedRef.current = false;
              }}
              onClick={e => e.stopPropagation()}
              aria-label="Rename group"
              className="flex-1 text-[11px] font-medium bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[var(--color-figma-text)] rounded px-1 outline-none min-w-0"
            />
          ) : (
            <span className="text-[11px] font-medium text-[var(--color-figma-text)] flex-1">{highlightMatch(node.name, searchHighlight?.nameTerms ?? [])}</span>
          )}
          {!renamingGroup && node.children && (
            <span className={`text-[10px] ml-1 shrink-0 ${leafCount === 0 ? 'text-[var(--color-figma-text-secondary)] opacity-50 italic' : 'text-[var(--color-figma-text-secondary)]'}`}>
              {leafCount === 0 ? 'empty' : `(${leafCount})`}
            </span>
          )}
          {!renamingGroup && node.$type && (
            <span
              className="text-[10px] shrink-0 text-[var(--color-figma-text-secondary)] italic ml-0.5 opacity-60"
              title={`$type: ${node.$type} (inherited by all children)`}
            >
              {node.$type}
            </span>
          )}
          {!selectMode && !renamingGroup && (
            <div className="absolute right-1 top-0 bottom-0 flex items-center gap-0.5 opacity-0 group-hover/group:opacity-100 pointer-events-none group-hover/group:pointer-events-auto transition-opacity">
              {onMoveUp && (
                <button
                  onClick={e => { e.stopPropagation(); onMoveUp(); }}
                  title="Move up"
                  aria-label="Move up"
                  className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 15l-6-6-6 6"/>
                  </svg>
                </button>
              )}
              {onMoveDown && (
                <button
                  onClick={e => { e.stopPropagation(); onMoveDown(); }}
                  title="Move down"
                  aria-label="Move down"
                  className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateSibling?.(node.path, inferGroupTokenType(node.children));
                }}
                title="Add token to group"
                aria-label="Add token to group"
                className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setGroupMenuPos({
                    x: Math.min(rect.left, window.innerWidth - 168),
                    y: Math.min(rect.bottom + 2, window.innerHeight - 220),
                  });
                }}
                title="Group actions"
                aria-label="Group actions"
                className="p-1.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Group context menu */}
        {groupMenuPos && (
          <div
            role="menu"
            data-context-menu="group"
            className="fixed rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg z-50 py-1 min-w-[160px]"
            style={{ top: groupMenuPos.y, left: groupMenuPos.x }}
          >
            {onCreateGroup && (
              <button
                role="menuitem"
                data-accel="n"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setGroupMenuPos(null);
                  onCreateGroup(node.path);
                }}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                <span>New subgroup…</span><span className="ml-4 text-[10px] text-[var(--color-figma-text-tertiary)]">N</span>
              </button>
            )}
            <button
              role="menuitem"
              data-accel="r"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                setGroupMenuPos(null);
                setRenameGroupVal(node.name);
                setRenamingGroup(true);
              }}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              <span>Rename group</span><span className="ml-4 text-[10px] text-[var(--color-figma-text-tertiary)]">R</span>
            </button>
            <button
              role="menuitem"
              data-accel="e"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                setGroupMenuPos(null);
                setGroupMetaType(node.$type ?? '');
                setGroupMetaDescription(node.$description ?? '');
                setEditingGroupMeta(true);
              }}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              <span>Edit type &amp; description…</span><span className="ml-4 text-[10px] text-[var(--color-figma-text-tertiary)]">E</span>
            </button>
            <button
              role="menuitem"
              data-accel="m"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                setGroupMenuPos(null);
                onRequestMoveGroup?.(node.path);
              }}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              <span>Move group to set…</span><span className="ml-4 text-[10px] text-[var(--color-figma-text-tertiary)]">M</span>
            </button>
            <button
              role="menuitem"
              data-accel="d"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                setGroupMenuPos(null);
                onDuplicateGroup?.(node.path);
              }}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              <span>Duplicate group</span><span className="ml-4 text-[10px] text-[var(--color-figma-text-tertiary)]">D</span>
            </button>
            {onSetGroupScopes && (
              <button
                role="menuitem"
                data-accel="s"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setGroupMenuPos(null);
                  onSetGroupScopes(node.path);
                }}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                <span>Set scopes for group…</span><span className="ml-4 text-[10px] text-[var(--color-figma-text-tertiary)]">S</span>
              </button>
            )}
            {onSyncGroup && (
              <button
                role="menuitem"
                data-accel="v"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setGroupMenuPos(null);
                  const count = node.children ? countTokensInGroup(node) : 0;
                  onSyncGroup(node.path, count);
                }}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)] transition-colors border-t border-[var(--color-figma-border)]"
              >
                <span>Create variables from group</span><span className="ml-4 text-[10px] text-[var(--color-figma-text-tertiary)]">V</span>
              </button>
            )}
            {onSyncGroupStyles && (
              <button
                role="menuitem"
                data-accel="y"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setGroupMenuPos(null);
                  const count = node.children ? countTokensInGroup(node) : 0;
                  onSyncGroupStyles(node.path, count);
                }}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                <span>Create styles from group</span><span className="ml-4 text-[10px] text-[var(--color-figma-text-tertiary)]">Y</span>
              </button>
            )}
            {onGenerateScaleFromGroup && (
              <button
                role="menuitem"
                data-accel="g"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setGroupMenuPos(null);
                  // Detect the dominant token type from this group's leaves
                  const prefix = node.path + '.';
                  const types: Record<string, number> = {};
                  for (const [path, entry] of Object.entries(allTokensFlat)) {
                    if (path === node.path || path.startsWith(prefix)) {
                      const t = entry.$type;
                      if (t) types[t] = (types[t] ?? 0) + 1;
                    }
                  }
                  const dominant = Object.entries(types).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
                  onGenerateScaleFromGroup(node.path, dominant);
                }}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors border-t border-[var(--color-figma-border)]"
              >
                <span>Generate scale from this group…</span><span className="ml-4 text-[10px] text-[var(--color-figma-text-tertiary)]">G</span>
              </button>
            )}
            <button
              role="menuitem"
              data-accel="x"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                setGroupMenuPos(null);
                onDeleteGroup(node.path, node.name, leafCount);
              }}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 transition-colors border-t border-[var(--color-figma-border)]"
            >
              <span>Delete group</span><span className="ml-4 text-[10px] text-[var(--color-figma-text-tertiary)]">X</span>
            </button>
          </div>
        )}

        {editingGroupMeta && (
          <div
            className="mx-2 mb-1 p-2 rounded border border-[var(--color-figma-accent)]/40 bg-[var(--color-figma-bg-secondary)] flex flex-col gap-1.5"
            style={{ marginLeft: `${depth * 16 + 8}px` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] uppercase tracking-wide">Group metadata</div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)] w-16 shrink-0">$type</label>
              <select
                value={groupMetaType}
                onChange={e => setGroupMetaType(e.target.value)}
                className="flex-1 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)]"
              >
                <option value="">(none)</option>
                <option value="color">color</option>
                <option value="dimension">dimension</option>
                <option value="fontFamily">fontFamily</option>
                <option value="fontWeight">fontWeight</option>
                <option value="duration">duration</option>
                <option value="cubicBezier">cubicBezier</option>
                <option value="number">number</option>
                <option value="string">string</option>
                <option value="boolean">boolean</option>
                <option value="shadow">shadow</option>
                <option value="gradient">gradient</option>
                <option value="typography">typography</option>
                <option value="border">border</option>
                <option value="strokeStyle">strokeStyle</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)] w-16 shrink-0">$description</label>
              <input
                type="text"
                value={groupMetaDescription}
                onChange={e => setGroupMetaDescription(e.target.value)}
                placeholder="Optional description…"
                className="flex-1 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)]"
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleSaveGroupMeta(); }
                  if (e.key === 'Escape') setEditingGroupMeta(false);
                }}
              />
            </div>
            <div className="flex gap-1 justify-end">
              <button
                onClick={() => setEditingGroupMeta(false)}
                className="px-2 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveGroupMeta}
                disabled={groupMetaSaving}
                className="px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:opacity-90 disabled:opacity-40"
              >
                {groupMetaSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {!skipChildren && isExpanded && node.children?.map(child => (
          <TokenTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            isSelected={false}
            lintViolations={lintViolations.filter(v => v.path === child.path)}
          />
        ))}
      </div>
    );
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    if (node.isGroup) return;
    e.preventDefault();
    setContextMenuPos({
      x: Math.min(e.clientX, window.innerWidth - 168),
      y: Math.min(e.clientY, window.innerHeight - 280),
    });
  };

  // Activate inline editing for simple types (keyboard or double-click)
  const activateInlineEdit = useCallback(() => {
    if (!canInlineEdit || !node.$type) return;
    if (node.$type === 'boolean') {
      onInlineSave?.(node.path, 'boolean', !node.$value);
    } else if (node.$type === 'color') {
      setPendingColor(typeof node.$value === 'string' ? node.$value : '#000000');
      setColorPickerOpen(true);
    } else {
      setInlineEditValue(getEditableString(node.$type, node.$value));
      setInlineEditActive(true);
    }
  }, [canInlineEdit, node, onInlineSave]);

  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (node.isGroup) return;

    // Enter or e: inline edit for simple types, full editor for complex
    if (e.key === 'Enter' || (e.key === 'e' && !e.metaKey && !e.ctrlKey && !e.altKey)) {
      e.preventDefault();
      if (canInlineEdit) {
        activateInlineEdit();
      } else {
        onEdit(node.path, node.name);
      }
      return;
    }

    // Space: toggle selection in select mode; open full editor otherwise
    if (e.key === ' ') {
      e.preventDefault();
      if (selectMode) {
        onToggleSelect(node.path);
      } else {
        onEdit(node.path, node.name);
      }
      return;
    }

    // Delete or Backspace: delete token
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onDelete(node.path);
      return;
    }

    // Cmd+D / Ctrl+D: duplicate token
    if (e.key === 'd' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onDuplicateToken?.(node.path);
      return;
    }
  };

  const parentGroupPath = node.path.length > node.name.length ? nodeParentPath(node.path, node.name) : null;

  const handleJumpToGroup = (groupPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onJumpToGroup) {
      onJumpToGroup(groupPath);
    } else {
      const el = document.querySelector<HTMLElement>(`[data-group-path="${groupPath}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const reorderPos = dragOverReorder?.path === node.path ? dragOverReorder.position : null;

  return (
    <div ref={nodeRef}>
    <div
      className={`relative flex items-center gap-2 px-2 py-1 hover:bg-[var(--color-figma-bg-hover)] transition-colors group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-figma-accent)] ${isHighlighted ? 'bg-[var(--color-figma-accent)]/15 ring-1 ring-inset ring-[var(--color-figma-accent)]/40' : cascadeChange ? 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/30' : ''} ${(node.$extensions?.tokenmanager as any)?.lifecycle === 'deprecated' ? 'opacity-50' : ''}`}
      style={{ paddingLeft: `${depth * 16 + 20}px` }}
      tabIndex={selectMode ? -1 : 0}
      data-token-path={node.path}
      draggable={!selectMode || isSelected}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-token-drag', 'true');
        if (selectMode && isSelected && selectedLeafNodes && selectedLeafNodes.length > 0) {
          onDragStart?.(selectedLeafNodes.map(n => n.path), selectedLeafNodes.map(n => n.name));
        } else {
          onDragStart?.([node.path], [node.name]);
        }
      }}
      onDragEnd={() => onDragEnd?.()}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('application/x-token-drag')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = e.currentTarget.getBoundingClientRect();
        const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        onDragOverToken?.(node.path, node.name, pos);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          onDragLeaveToken?.();
        }
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('application/x-token-drag')) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
        onDropOnToken?.(node.path, node.name, pos);
      }}
      onMouseEnter={() => { setHovered(true); if (inspectMode) onHoverToken?.(node.path); }}
      onMouseLeave={() => { setHovered(false); setShowPicker(false); }}
      onContextMenu={handleContextMenu}
      onKeyDown={handleRowKeyDown}
    >
      {/* Drag reorder indicator line */}
      {reorderPos && (
        <div
          className="absolute left-0 right-0 h-0.5 bg-[var(--color-figma-accent)] pointer-events-none z-10"
          style={reorderPos === 'before' ? { top: 0 } : { bottom: 0 }}
        />
      )}
      {/* Checkbox for select mode */}
      {selectMode && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(node.path)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select token ${node.path}`}
          className="shrink-0 cursor-pointer"
        />
      )}

      {/* Value preview (resolve aliases for display) */}
      {canInlineEdit && node.$type === 'color' && typeof displayValue === 'string' ? (
        <>
          <div className="relative shrink-0">
            <button
              onClick={e => { e.stopPropagation(); setPendingColor(typeof node.$value === 'string' ? node.$value : '#000000'); setColorPickerOpen(true); }}
              title={`${displayValue} — click to edit`}
              className="w-6 h-6 rounded border border-[var(--color-figma-border)] shrink-0 hover:ring-1 hover:ring-[var(--color-figma-accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)]"
              style={{ backgroundColor: displayValue }}
            />
            {colorPickerOpen && (
              <ColorPicker
                value={pendingColor}
                onChange={setPendingColor}
                onClose={() => {
                  setColorPickerOpen(false);
                  if (pendingColor !== node.$value) onInlineSave?.(node.path, 'color', pendingColor);
                }}
              />
            )}
          </div>
        </>
      ) : (
        <button
          onClick={e => { e.stopPropagation(); handleCopyValue(); }}
          title={copiedWhat === 'value' ? 'Copied!' : 'Copy value'}
          aria-label={copiedWhat === 'value' ? 'Value copied' : 'Copy value to clipboard'}
          className={`shrink-0 rounded cursor-copy focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)] transition-shadow ${copiedWhat === 'value' ? 'ring-1 ring-[var(--color-figma-success)]' : 'hover:ring-1 hover:ring-[var(--color-figma-accent)]/50'}`}
        >
          <ValuePreview type={node.$type} value={displayValue} />
        </button>
      )}

      {/* Name and info — single-click previews (non-select mode), double-click edits */}
      {/* ctrl/cmd-click enters select mode; shift-click range-selects */}
      <div
        title={!selectMode ? (canInlineEdit ? 'Double-click to edit inline · Space to open editor' : 'Double-click to open editor') : undefined}
        className={`flex-1 min-w-0${!selectMode ? ' cursor-pointer' : ''}`}
        onClick={(e) => {
          if (selectMode || e.ctrlKey || e.metaKey) {
            e.stopPropagation();
            onToggleSelect(node.path, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
            return;
          }
          e.stopPropagation();
          if (onPreview) { onPreview(node.path, node.name); } else { handleApplyToSelection(e); }
        }}
        onDoubleClick={!selectMode ? (e) => {
          e.stopPropagation();
          if (canInlineEdit) {
            activateInlineEdit();
          } else {
            onEdit(node.path, node.name);
          }
        } : undefined}
        style={selectMode ? { cursor: 'pointer' } : undefined}
      >
        <div className="flex items-center gap-1.5">
          {syncChanged && (
            <span
              title="Changed locally since last sync"
              className="w-1.5 h-1.5 rounded-full bg-[var(--color-figma-warning)] shrink-0 cursor-default"
            />
          )}
          {renamingToken ? (
            <input
              ref={renameTokenInputRef}
              value={renameTokenVal}
              onChange={e => setRenameTokenVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.stopPropagation(); confirmTokenRename(); }
                if (e.key === 'Escape') { e.stopPropagation(); renameTokenEscapedRef.current = true; setRenamingToken(false); }
              }}
              onBlur={() => {
                if (!renameTokenEscapedRef.current) confirmTokenRename();
                renameTokenEscapedRef.current = false;
              }}
              onClick={e => e.stopPropagation()}
              aria-label="Rename token"
              className="text-[11px] text-[var(--color-figma-text)] bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] rounded px-1 outline-none w-32 shrink-0"
            />
          ) : (
            <span className="text-[11px] text-[var(--color-figma-text)] truncate" title={formatDisplayPath(node.path, node.name)}>{highlightMatch(showFullPath ? formatDisplayPath(node.path, node.name) : node.name, searchHighlight?.nameTerms ?? [])}</span>
          )}
          {!renamingToken && node.$type && (
            <button
              onClick={e => { e.stopPropagation(); onFilterByType?.(node.$type!); }}
              title={`Filter by type: ${node.$type}`}
              className={`px-1 py-0.5 rounded text-[8px] font-medium ${TOKEN_TYPE_BADGE_CLASS[node.$type ?? ''] ?? 'token-type-string'} cursor-pointer transition-opacity hover:opacity-70 hover:ring-1 hover:ring-current/40`}
            >
              {node.$type}
            </button>
          )}
          {/* Lifecycle badge */}
          {(() => {
            const lc = (node.$extensions?.tokenmanager as any)?.lifecycle;
            if (lc === 'draft') return (
              <span className="px-1 py-0.5 rounded text-[8px] font-medium shrink-0 bg-amber-500/15 text-amber-700 dark:text-amber-400" title="Draft — not yet published">draft</span>
            );
            if (lc === 'deprecated') return (
              <span className="px-1 py-0.5 rounded text-[8px] font-medium shrink-0 bg-gray-300/40 text-gray-500 dark:bg-gray-700/40 dark:text-gray-400 line-through" title="Deprecated — avoid using this token">deprecated</span>
            );
            return null;
          })()}
          {/* Extends (inheritance) indicator */}
          {(() => {
            const ext = (node.$extensions?.tokenmanager as any)?.extends;
            if (typeof ext === 'string' && ext) return (
              <span
                title={`Extends ${ext}`}
                className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-medium shrink-0 bg-purple-500/15 text-purple-700 dark:text-purple-400 cursor-default max-w-[120px]"
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                <span className="truncate">{ext}</span>
              </span>
            );
            return null;
          })()}
          {/* Generator source indicator */}
          {generatorsBySource?.has(node.path) && (
            <span
              title={`Source for ${generatorsBySource.get(node.path)!.length} derived group${generatorsBySource.get(node.path)!.length !== 1 ? 's' : ''}`}
              className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-medium bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] shrink-0 cursor-default"
            >
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="5" cy="2" r="1.5"/>
                <circle cx="2" cy="8" r="1.5"/>
                <circle cx="8" cy="8" r="1.5"/>
                <path d="M5 3.5V6M5 6L2 6.5M5 6L8 6.5"/>
              </svg>
              {generatorsBySource.get(node.path)!.length}
            </span>
          )}
          {/* Derived token indicator — shows generator name */}
          {derivedTokenPaths?.has(node.path) && !generatorsBySource?.has(node.path) && (() => {
            const gen = derivedTokenPaths.get(node.path);
            return (
              <span
                title={gen ? `Generated by ${gen.name}` : 'Auto-generated by a token generator'}
                className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-medium bg-[var(--color-figma-text-secondary)]/10 text-[var(--color-figma-text-secondary)] shrink-0 cursor-default max-w-[120px]"
              >
                <svg className="shrink-0" width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 2l6 6M8 2l-3 3-3 3"/>
                </svg>
                {gen && <span className="truncate">{gen.name}</span>}
              </span>
            );
          })()}
          {isAlias(node.$value) && (
            <button
              onClick={handleAliasClick}
              className={`flex items-center gap-0.5 px-1 py-0.5 rounded border text-[8px] transition-colors ${isBrokenAlias ? 'border-[var(--color-figma-error)] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 cursor-default' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]'}`}
              title={isBrokenAlias ? `Broken reference — ${resolveResult?.error}` : `${(node.$value as string).slice(1, -1)} → ${formatValue(node.$type, displayValue)}\nClick to navigate`}
            >
              <span>{(node.$value as string).slice(1, -1)}</span>
              <svg width="6" height="6" viewBox="0 0 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1 3h4M3 1l2 2-2 2"/>
              </svg>
            </button>
          )}
        </div>
        {node.$description && (
          <div className="text-[10px] text-[var(--color-figma-text-secondary)] truncate" title={node.$description}>{node.$description}</div>
        )}
      </div>

      {/* Multi-mode value columns — per-theme-option resolved values */}
      {multiModeValues && multiModeValues.length > 0 && !node.isGroup && (
        <div className="flex items-center shrink-0 ml-auto">
          {multiModeValues.map(mv => (
            <MultiModeCell
              key={mv.optionName}
              tokenPath={node.path}
              tokenType={node.$type}
              value={mv.resolved}
              targetSet={mv.targetSet}
              optionName={mv.optionName}
              onSave={onMultiModeInlineSave}
            />
          ))}
        </div>
      )}

      {/* Value text (hidden when multi-mode columns are shown) */}
      {!(multiModeValues && multiModeValues.length > 0) && (canInlineEdit && node.$type === 'boolean' ? (
        <button
          onClick={e => { e.stopPropagation(); onInlineSave?.(node.path, 'boolean', !node.$value); }}
          title="Click to toggle"
          className="text-[11px] text-[var(--color-figma-text-secondary)] shrink-0 cursor-pointer hover:text-[var(--color-figma-accent)] transition-colors"
        >
          {formatValue(node.$type, displayValue)}
        </button>
      ) : canInlineEdit && node.$type !== 'color' && inlineEditActive ? (
        isNumericInlineType ? (
          <div className="flex items-center shrink-0 gap-0.5" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); stepInlineValue(-1); }}
              tabIndex={-1}
              className="w-4 h-5 flex items-center justify-center rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] text-[11px] font-medium leading-none select-none shrink-0"
            >−</button>
            <input
              type="number"
              value={node.$type === 'dimension' ? (dimParts ? dimParts[1] : inlineEditValue) : inlineEditValue}
              onChange={e => {
                if (node.$type === 'dimension') {
                  const unit = dimParts ? (dimParts[2] || 'px') : 'px';
                  setInlineEditValue(`${e.target.value}${unit}`);
                } else {
                  setInlineEditValue(e.target.value);
                }
              }}
              onBlur={() => {
                if (inlineEditEscapedRef.current) { inlineEditEscapedRef.current = false; return; }
                handleInlineSubmit();
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleInlineSubmit(); }
                if (e.key === 'Escape') { e.preventDefault(); inlineEditEscapedRef.current = true; setInlineEditActive(false); }
                e.stopPropagation();
              }}
              aria-label="Token value"
              autoFocus
              className="text-[11px] text-[var(--color-figma-text)] w-[52px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] rounded px-1 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {node.$type === 'dimension' && dimParts && dimParts[2] && (
              <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">{dimParts[2]}</span>
            )}
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); stepInlineValue(1); }}
              tabIndex={-1}
              className="w-4 h-5 flex items-center justify-center rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] text-[11px] font-medium leading-none select-none shrink-0"
            >+</button>
          </div>
        ) : (
          <input
            type="text"
            value={inlineEditValue}
            onChange={e => setInlineEditValue(e.target.value)}
            onBlur={() => {
              if (inlineEditEscapedRef.current) { inlineEditEscapedRef.current = false; return; }
              handleInlineSubmit();
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); handleInlineSubmit(); }
              if (e.key === 'Escape') { e.preventDefault(); inlineEditEscapedRef.current = true; setInlineEditActive(false); }
              e.stopPropagation();
            }}
            onClick={e => e.stopPropagation()}
            aria-label="Token value"
            autoFocus
            className="text-[11px] text-[var(--color-figma-text)] shrink-0 w-[96px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] rounded px-1 outline-none"
          />
        )
      ) : isAlias(node.$value) && !isBrokenAlias ? (
        <span
          className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0 max-w-[96px] truncate"
          title={`${(node.$value as string).slice(1, -1)} → ${formatValue(node.$type, displayValue)}`}
        >
          {highlightMatch(formatValue(node.$type, displayValue), searchHighlight?.valueTerms ?? [])}
        </span>
      ) : canInlineEdit && node.$type !== 'color' ? (
        <span
          className="text-[11px] text-[var(--color-figma-text-secondary)] shrink-0 max-w-[96px] truncate cursor-text hover:underline hover:decoration-dotted hover:text-[var(--color-figma-text)]"
          title="Click to edit"
          onClick={e => {
            e.stopPropagation();
            setInlineEditValue(getEditableString(node.$type, node.$value));
            setInlineEditActive(true);
          }}
        >
          {highlightMatch(formatValue(node.$type, displayValue), searchHighlight?.valueTerms ?? [])}
        </span>
      ) : (
        <span className="text-[11px] text-[var(--color-figma-text-secondary)] shrink-0 max-w-[96px] truncate">
          {highlightMatch(formatValue(node.$type, displayValue), searchHighlight?.valueTerms ?? [])}
        </span>
      ))}
      {/* Status indicators — compact dots/badges instead of verbose labels */}
      {(() => {
        const count = duplicateCounts.get(JSON.stringify(node.$value));
        const hasLint = lintViolations.length > 0;
        const worstSeverity = hasLint ? lintViolations.reduce((worst, v) => v.severity === 'error' ? 'error' : worst === 'error' ? 'error' : v.severity === 'warning' ? 'warning' : worst, 'info' as string) : null;
        const usageCount = tokenUsageCounts?.[node.path] ?? 0;
        return (count || hasLint || cascadeChange || showChainBadge || usageCount > 0) ? (
          <div className="flex items-center gap-1 shrink-0">
            {usageCount > 0 && (
              <button
                className="shrink-0 flex items-center gap-px text-[8px] text-emerald-600 dark:text-emerald-400"
                title={`Bound to ${usageCount} layer${usageCount !== 1 ? 's' : ''} on this page`}
                onClick={e => {
                  e.stopPropagation();
                  parent.postMessage({ pluginMessage: { type: 'highlight-layer-by-token', tokenPath: node.path } }, '*');
                }}
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="12" r="5"/>
                </svg>
                {usageCount > 1 && <span>{usageCount}</span>}
              </button>
            )}
            {hasLint && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  const v = lintViolations[0];
                  if (v.suggestedFix === 'extract-to-alias') onExtractToAliasForLint?.(node.path, node.$type, node.$value);
                  else if (v.suggestedFix === 'add-description') onEdit(node.path, node.name);
                }}
                title={lintViolations.map(v => `${v.severity}: ${v.message}${v.suggestion ? `\nSuggestion: ${v.suggestion}` : ''}`).join('\n')}
                className={`shrink-0 flex items-center justify-center ${worstSeverity === 'error' ? 'text-[var(--color-figma-error)]' : worstSeverity === 'warning' ? 'text-[var(--color-figma-warning)]' : 'text-[var(--color-figma-text-tertiary)]'}`}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/>
                </svg>
              </button>
            )}
            {count && (
              <span className="w-2 h-2 rounded-full bg-[var(--color-figma-accent)] shrink-0" title={`${count} tokens share this value`} />
            )}
            {showChainBadge && (
              <button
                className={`text-[8px] shrink-0 px-0.5 rounded transition-colors ${chainExpanded ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-accent)]'}`}
                title={chainExpanded ? 'Collapse reference chain' : `Show reference chain (${aliasChain.length} hops)`}
                onClick={e => { e.stopPropagation(); onToggleChain?.(node.path); }}
              >{aliasChain.length}×</button>
            )}
            {cascadeChange && (
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title={`Would change: ${formatValue(node.$type, cascadeChange.before)} → ${formatValue(node.$type, cascadeChange.after)}`} />
            )}
          </div>
        ) : null;
      })()}

      {/* Hover actions — absolutely positioned to avoid layout shift */}
      {!selectMode && (
        <div className="absolute right-1 top-0 bottom-0 flex items-center gap-0.5 pointer-events-none group-hover:pointer-events-auto">
          {/* Pin/star toggle */}
          {onTogglePin && (
            <button
              onClick={e => { e.stopPropagation(); onTogglePin(node.path); }}
              title={isPinned ? 'Unpin token' : 'Pin token'}
              aria-label={isPinned ? 'Unpin token' : 'Pin token'}
              className={`p-1 rounded hover:bg-[var(--color-figma-bg-hover)] transition-opacity ${
                isPinned
                  ? 'text-[var(--color-figma-accent)] opacity-100 pointer-events-auto'
                  : 'text-[var(--color-figma-text-secondary)] opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'
              }`}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
            </button>
          )}
          {/* Edit button — always faintly visible as a hint that rows are editable */}
          <button
            onClick={() => onEdit(node.path, node.name)}
            title="Edit (or double-click row)"
            aria-label="Edit token"
            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] opacity-40 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          {onMoveUp && (
            <button
              onClick={e => { e.stopPropagation(); onMoveUp(); }}
              title="Move up"
              aria-label="Move up"
              className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 15l-6-6-6 6"/>
              </svg>
            </button>
          )}
          {onMoveDown && (
            <button
              onClick={e => { e.stopPropagation(); onMoveDown(); }}
              title="Move down"
              aria-label="Move down"
              className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); handleApplyToSelection(e); }}
            title={quickBound ? `Bound to ${quickBound}` : (() => {
              if (!node.$type || !selectedNodes || selectedNodes.length === 0) return 'Apply to selection';
              const entry = allTokensFlat[node.path];
              const targets = getQuickBindTargets(node.$type, entry?.$scopes, selectedNodes);
              if (targets.length === 0) return 'No compatible properties on selection';
              if (targets.length === 1) return `Quick bind to ${PROPERTY_LABELS[targets[0]]}`;
              return `Apply to ${targets.map(t => PROPERTY_LABELS[t]).join(', ')}`;
            })()}
            aria-label={quickBound ? `Bound to ${quickBound}` : 'Apply to selection'}
            className={`p-1 rounded transition-opacity ${
              quickBound
                ? 'text-[var(--color-figma-success)] opacity-100'
                : 'hover:bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)] opacity-0 group-hover:opacity-100'
            }`}
          >
            {quickBound ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 5l7 7-7 7M5 12h14" />
              </svg>
            )}
          </button>
          <button
            onClick={e => { e.stopPropagation(); handleCopyPath(); }}
            title={copiedWhat === 'path' ? 'Copied!' : 'Copy token path'}
            aria-label={copiedWhat === 'path' ? 'Copied' : 'Copy token path'}
            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {copiedWhat === 'path' ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-success)" strokeWidth="2.5" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 6L4 12l4 6M16 6l4 6-4 6M13 4l-2 16"/>
              </svg>
            )}
          </button>
          <button
            onClick={handleCopyValue}
            title={copiedWhat === 'value' ? 'Copied!' : 'Copy value'}
            aria-label={copiedWhat === 'value' ? 'Copied' : 'Copy value'}
            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {copiedWhat === 'value' ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-success)" strokeWidth="2.5" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            )}
          </button>
        </div>
      )}

      {/* Property picker dropdown */}
      {showPicker && node.$type && TOKEN_PROPERTY_MAP[node.$type] && (
        <PropertyPicker
          properties={pickerProps || TOKEN_PROPERTY_MAP[node.$type]}
          capabilities={pickerProps ? null : selectionCapabilities}
          onSelect={applyWithProperty}
          onClose={() => { setShowPicker(false); setPickerProps(null); }}
          anchorRect={pickerAnchor}
        />
      )}

      {/* Right-click context menu */}
      {contextMenuPos && (
        <div
          data-context-menu="token"
          className="fixed z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg py-1 min-w-[160px]"
          style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
          onClick={e => e.stopPropagation()}
        >
          <button
            data-accel="n"
            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              setContextMenuPos(null);
              onCreateSibling?.(nodeParentPath(node.path, node.name), node.$type || 'color');
            }}
          >
            <span>Create sibling</span><span className="ml-4 text-[10px] text-[var(--color-figma-text-tertiary)]">N</span>
          </button>
          <button
            data-accel="d"
            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              setContextMenuPos(null);
              onDuplicateToken?.(node.path);
            }}
          >
            <span>Duplicate token</span><span className="ml-4 text-[10px] text-[var(--color-figma-text-tertiary)]">D</span>
          </button>
          <button
            data-accel="r"
            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              setContextMenuPos(null);
              // Use onCreateSibling to trigger alias creation in parent
              onCreateSibling?.(nodeParentPath(node.path, node.name), node.$type || 'color');
            }}
          >
            Alias to this token
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              setContextMenuPos(null);
              setRenameTokenVal(node.name);
              setRenamingToken(true);
            }}
          >
            <span>Rename token</span><span className="ml-4 text-[10px] text-[var(--color-figma-text-tertiary)]">R</span>
          </button>
          {!isAlias(node.$value) && (
            <button
              data-accel="l"
              className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                setContextMenuPos(null);
                onExtractToAlias?.(node.path, node.$type, node.$value);
              }}
            >
              <span>Link to token</span><span className="ml-4 text-[10px] text-[var(--color-figma-text-tertiary)]">L</span>
            </button>
          )}
          <button
            data-accel="m"
            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              setContextMenuPos(null);
              onRequestMoveToken?.(node.path);
            }}
          >
            <span>Move to set...</span><span className="ml-4 text-[10px] text-[var(--color-figma-text-tertiary)]">M</span>
          </button>
          {onTogglePin && (
            <button
              data-accel="p"
              className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { setContextMenuPos(null); onTogglePin(node.path); }}
            >
              <span>{isPinned ? 'Unpin token' : 'Pin token'}</span>
              <span className="ml-4 text-[10px] text-[var(--color-figma-text-tertiary)]">P</span>
            </button>
          )}
          {onDetachFromGenerator && derivedTokenPaths?.has(node.path) && (
            <button
              className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                setContextMenuPos(null);
                onDetachFromGenerator(node.path);
              }}
            >
              Detach from generator
            </button>
          )}
          <div className="my-1 border-t border-[var(--color-figma-border)]" />
          <button
            data-accel="c"
            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              navigator.clipboard.writeText(node.path).catch(() => {});
              setContextMenuPos(null);
            }}
          >
            <span>Copy path <span className="text-[var(--color-figma-text-tertiary)]">({node.path})</span></span><span className="ml-4 text-[10px] text-[var(--color-figma-text-tertiary)]">C</span>
          </button>
          <button
            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              navigator.clipboard.writeText(`var(--${node.path.replace(/\./g, '-')})`).catch(() => {});
              setContextMenuPos(null);
            }}
          >
            <span>Copy as CSS var <span className="text-[var(--color-figma-text-tertiary)]">(var(--{node.path.replace(/\./g, '-')}))</span></span>
          </button>
          <button
            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              navigator.clipboard.writeText(`$${node.path.replace(/\./g, '-')}`).catch(() => {});
              setContextMenuPos(null);
            }}
          >
            <span>Copy as SCSS var <span className="text-[var(--color-figma-text-tertiary)]">(${node.path.replace(/\./g, '-')})</span></span>
          </button>
          <button
            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              navigator.clipboard.writeText(`{${node.path}}`).catch(() => {});
              setContextMenuPos(null);
            }}
          >
            <span>Copy as reference <span className="text-[var(--color-figma-text-tertiary)]">({`{${node.path}}`})</span></span>
          </button>
          <button
            data-accel="v"
            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              const val = typeof node.$value === 'string' ? node.$value : JSON.stringify(node.$value);
              navigator.clipboard.writeText(val).catch(() => {});
              setContextMenuPos(null);
            }}
          >
            <span>Copy value</span><span className="ml-4 text-[10px] text-[var(--color-figma-text-tertiary)]">V</span>
          </button>
          <button
            data-accel="j"
            className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              const entry: Record<string, unknown> = { $value: node.$value, $type: node.$type };
              if (node.$description) entry.$description = node.$description;
              navigator.clipboard.writeText(JSON.stringify(entry, null, 2)).catch(() => {});
              setContextMenuPos(null);
            }}
          >
            <span>Copy as JSON</span><span className="ml-4 text-[10px] text-[var(--color-figma-text-tertiary)]">J</span>
          </button>
        </div>
      )}

      {/* Alias resolution chain tooltip — visible on row hover */}
      {hovered && aliasChainLabel && (
        <div className="absolute left-4 right-4 bottom-full z-20" style={{ marginBottom: '-2px' }}>
          <div className="inline-flex items-center gap-1 px-2 py-1 rounded shadow-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[10px] font-mono text-[var(--color-figma-text-secondary)] whitespace-nowrap max-w-full overflow-hidden">
            {[node.path, ...aliasChain].map((seg, i, arr) => (
              <Fragment key={i}>
                {i === 0 ? (
                  <span className="text-[var(--color-figma-accent)]">{seg}</span>
                ) : (
                  <button
                    className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:underline cursor-pointer transition-colors"
                    onClick={() => onNavigateToAlias?.(seg)}
                    title={`Navigate to ${seg}`}
                  >{seg}</button>
                )}
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="shrink-0 text-[var(--color-figma-text-tertiary)]" aria-hidden="true"><path d="M1 4h6M4 1l3 3-3 3"/></svg>
              </Fragment>
            ))}
            <span className="text-[var(--color-figma-text)] font-medium">{formatValue(node.$type, displayValue)}</span>
          </div>
        </div>
      )}
    </div>

    {/* Inline alias chain expansion */}
    {showChainBadge && chainExpanded && (
      <div
        className="flex items-center flex-wrap gap-1 px-2 py-1 bg-[var(--color-figma-bg-hover)] border-t border-[var(--color-figma-border)]"
        style={{ paddingLeft: `${depth * 16 + 20}px` }}
      >
        <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium shrink-0">Chain:</span>
        <span className="text-[10px] text-[var(--color-figma-accent)] font-mono shrink-0">{node.path}</span>
        {aliasChain.map((hop, i) => (
          <Fragment key={hop}>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[var(--color-figma-text-secondary)] shrink-0">
              <path d="M1 4h6M4 1l3 3-3 3"/>
            </svg>
            <button
              className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] shrink-0 transition-colors"
              onClick={() => onNavigateToAlias?.(hop)}
              title={`Navigate to ${hop}`}
            >
              {hop}
            </button>
            {i === aliasChain.length - 1 && (
              <>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[var(--color-figma-text-secondary)] shrink-0">
                  <path d="M1 4h6M4 1l3 3-3 3"/>
                </svg>
                <span className="text-[10px] text-[var(--color-figma-text)] font-mono shrink-0">
                  {formatValue(node.$type, displayValue)}
                </span>
              </>
            )}
          </Fragment>
        ))}
      </div>
    )}
    </div>
  );
}
