import { useState, useCallback, useEffect, useRef, useLayoutEffect, useMemo, Fragment, memo } from 'react';
import { dispatchToast } from '../shared/toastBus';
import { TokenTreeNodeProps, DENSITY_PY_CLASS, DENSITY_SWATCH_SIZE, INDENT_PER_LEVEL, CONDENSED_MAX_DEPTH, DEPTH_COLORS } from './tokenListTypes';
import type { TokenMapEntry } from '../../shared/types';
import { TOKEN_PROPERTY_MAP, TOKEN_TYPE_BADGE_CLASS, PROPERTY_LABELS } from '../../shared/types';
import type { BindableProperty } from '../../shared/types';
import { isAlias, extractAliasPath, resolveTokenValue, buildResolutionChain, buildSetThemeMap } from '../../shared/resolveAlias';
import type { ResolutionStep } from '../../shared/resolveAlias';
import { stableStringify } from '../shared/utils';
import { countTokensInGroup, formatDisplayPath, nodeParentPath, formatValue, countLeaves } from './tokenListUtils';
import { getEditableString, parseInlineValue, getInlineValueError, inferGroupTokenType, highlightMatch, resolveCompositeForApply } from './tokenListHelpers';
import { INLINE_SIMPLE_TYPES, INLINE_POPOVER_TYPES } from './tokenListTypes';
import { InlineValuePopover } from './InlineValuePopover';
import { PropertyPicker } from './PropertyPicker';
import { ValuePreview } from './ValuePreview';
import { ColorPicker } from './ColorPicker';
import { getQuickBindTargets } from './selectionInspectorUtils';
import { useTokenTree } from './TokenTreeContext';
import { ComplexTypePreviewCard, COMPLEX_PREVIEW_TYPES } from './ComplexTypePreviewCard';
import { useNearbyTokenMatch } from '../hooks/useNearbyTokenMatch';
import { TokenNudge } from './TokenNudge';
import { AliasAutocomplete } from './AliasAutocomplete';
import { getMenuItems, handleMenuArrowKeys } from '../hooks/useMenuKeyboard';
import { matchesShortcut } from '../shared/shortcutRegistry';
import type { GeneratorType, TokenGenerator } from '../hooks/useGenerators';
import type { GeneratorDialogInitialDraft } from '../hooks/useGeneratorDialog';
import { getGeneratorTypeLabel } from './GeneratorPipelineCard';
import { detectGeneratorType } from './generators/generatorUtils';
import { QuickGeneratorPopover } from './QuickGeneratorPopover';
import { TokenGeneratorDialog } from './TokenGeneratorDialog';

// ---------------------------------------------------------------------------
// Reverse-reference helpers (used by "Find references" popover)
// ---------------------------------------------------------------------------

/** Returns true if `value` contains a direct alias reference to `target`. */
function hasDirectRef(value: unknown, target: string): boolean {
  if (typeof value === 'string') {
    return extractAliasPath(value) === target;
  }
  if (value && typeof value === 'object') {
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (item && typeof item === 'object') {
        for (const v of Object.values(item as Record<string, unknown>)) {
          if (typeof v === 'string' && extractAliasPath(v) === target) return true;
        }
      }
    }
  }
  return false;
}

/** Returns sorted list of token paths in `allTokensFlat` that alias `targetPath`. */
function getIncomingRefs(
  targetPath: string,
  allTokensFlat: Record<string, TokenMapEntry>,
): string[] {
  const results: string[] = [];
  for (const [path, entry] of Object.entries(allTokensFlat)) {
    if (hasDirectRef(entry.$value, targetPath)) results.push(path);
  }
  return results.sort();
}

// Stable empty array to avoid creating new references when a node has no lint violations
const EMPTY_LINT_VIOLATIONS: NonNullable<TokenTreeNodeProps['lintViolations']> = [];

// ---------------------------------------------------------------------------
// Depth utilities — shared by TokenGroupNode and TokenLeafNode
// ---------------------------------------------------------------------------

/**
 * Computes paddingLeft for a row at the given depth.
 * In condensed mode the visual depth is capped at CONDENSED_MAX_DEPTH so
 * indentation never exceeds ~3 levels.
 */
function computePaddingLeft(depth: number, condensedView: boolean, base: number): number {
  const effectiveDepth = condensedView ? Math.min(depth, CONDENSED_MAX_DEPTH) : depth;
  return effectiveDepth * INDENT_PER_LEVEL + base;
}

/**
 * A 2px colored vertical guide bar absolutely positioned at the left edge of a row.
 * Color cycles through DEPTH_COLORS based on the node's true depth (not capped),
 * so the color communicates actual nesting level even when indentation is condensed.
 */
function DepthBar({ depth }: { depth: number }) {
  if (depth === 0) return null;
  const color = DEPTH_COLORS[depth % DEPTH_COLORS.length] ?? DEPTH_COLORS[1];
  return (
    <span
      aria-hidden="true"
      className="absolute top-0 bottom-0 pointer-events-none"
      style={{ left: 4, width: 2, background: color, borderRadius: 1 }}
    />
  );
}

/**
 * When condensed view is on and a node's true depth exceeds CONDENSED_MAX_DEPTH,
 * renders a small pill showing the hidden ancestor path segment(s) so users can
 * still understand where a token lives without full indentation.
 */
function CondensedAncestorBreadcrumb({
  nodePath, nodeName, depth, condensedView,
}: {
  nodePath: string;
  nodeName: string;
  depth: number;
  condensedView: boolean;
}) {
  if (!condensedView || depth <= CONDENSED_MAX_DEPTH) return null;
  // Segments of the path (split by '.') — length equals depth + 1
  const parts = nodePath.split('.');
  // Hidden segments: those between the last visible ancestor and the node itself
  // e.g. path "a.b.c.d.e.name", depth=5, CONDENSED_MAX_DEPTH=3 → hide parts[3]="d" and parts[4]="e"
  const hiddenSegments = parts.slice(CONDENSED_MAX_DEPTH, parts.length - (nodeName.split('.').length));
  if (hiddenSegments.length === 0) return null;
  const label = hiddenSegments.length === 1
    ? hiddenSegments[0]
    : `…${hiddenSegments[hiddenSegments.length - 1]}`;
  const tooltip = `Hidden ancestors: ${hiddenSegments.join(' › ')}`;
  return (
    <span
      className="shrink-0 text-[9px] font-medium px-1 py-0.5 rounded bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-tertiary)] border border-[var(--color-figma-border)] leading-none"
      title={tooltip}
      aria-label={`In: ${hiddenSegments.join(' › ')}`}
    >
      {label}
    </span>
  );
}

const GENERATOR_RUN_AT_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function formatGeneratorRunAt(lastRunAt?: string): string {
  if (!lastRunAt) return 'Never run';
  const date = new Date(lastRunAt);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return GENERATOR_RUN_AT_FORMATTER.format(date);
}

function GeneratorSummaryRow({
  depth,
  condensedView,
  generator,
  running,
  onRun,
  onEdit,
}: {
  depth: number;
  condensedView: boolean;
  generator: TokenGenerator;
  running: boolean;
  onRun?: () => Promise<void> | void;
  onEdit?: () => void;
}) {
  const sourceLabel = generator.sourceToken || 'standalone';
  const typeLabel = getGeneratorTypeLabel(generator.type);
  const lastRunLabel = formatGeneratorRunAt(generator.lastRunAt);

  return (
    <div
      className="mx-2 mb-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-2"
      style={{ marginLeft: `${computePaddingLeft(depth, condensedView, 24)}px` }}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)]">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-figma-bg)] px-1.5 py-0.5 font-medium text-[var(--color-figma-text)]">
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <circle cx="5" cy="2" r="1.5"/>
                <circle cx="2" cy="8" r="1.5"/>
                <circle cx="8" cy="8" r="1.5"/>
                <path d="M5 3.5V6M5 6L2 6.5M5 6L8 6.5"/>
              </svg>
              Generator
            </span>
            {generator.isStale && (
              <span className="rounded-full border border-amber-500/60 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-600">
                Source changed
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            <span>
              Source <span className="font-mono text-[var(--color-figma-text)]">{sourceLabel}</span>
            </span>
            <span>
              Type <span className="text-[var(--color-figma-text)]">{typeLabel}</span>
            </span>
            <span>
              Last run <span className="text-[var(--color-figma-text)]">{lastRunLabel}</span>
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => { void onRun?.(); }}
            disabled={running || !onRun}
            className="px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? 'Running…' : 'Re-run'}
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={!onEdit}
            className="px-2 py-1 rounded border border-[var(--color-figma-border)] text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

type MenuPosition = { x: number; y: number };

const MENU_SURFACE_CLASS =
  'fixed z-50 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg py-1';
const MENU_ITEM_CLASS =
  'w-full flex items-center justify-between gap-3 px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors';
const MENU_DANGER_ITEM_CLASS =
  'w-full flex items-center justify-between gap-3 px-3 py-1.5 text-[11px] text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 transition-colors';

function clampMenuPosition(x: number, y: number, width: number, height: number): MenuPosition {
  return {
    x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
  };
}

function getSubmenuPosition(anchorRect: DOMRect, width: number, height: number): MenuPosition {
  const openRight = anchorRect.right + width + 8 <= window.innerWidth;
  const rawX = openRight ? anchorRect.right + 4 : anchorRect.left - width - 4;
  return clampMenuPosition(rawX, anchorRect.top, width, height);
}

function getQuickGeneratorTypeForToken(
  path: string,
  name: string,
  tokenType: string | undefined,
  tokenValue: unknown,
): GeneratorType | null {
  if (!tokenType) return null;
  if (tokenType === 'color') return 'colorRamp';
  if (tokenType === 'fontSize') return 'typeScale';
  if (tokenType === 'dimension') {
    const label = `${path}.${name}`.toLowerCase();
    if (/(font|type|text|heading|body|display|title)/.test(label)) return 'typeScale';
    if (/(space|spacing|gap|padding|margin|inset|offset)/.test(label)) return 'spacingScale';
  }
  if (tokenType === 'dimension' || tokenType === 'number') {
    return detectGeneratorType(tokenType, tokenValue);
  }
  return null;
}

function getQuickGeneratorActionLabel(type: GeneratorType): string {
  switch (type) {
    case 'colorRamp': return 'Generate color ramp…';
    case 'typeScale': return 'Generate type scale…';
    case 'spacingScale': return 'Generate spacing scale…';
    case 'opacityScale': return 'Generate opacity scale…';
    case 'borderRadiusScale': return 'Generate radius scale…';
    default: return `Generate ${getGeneratorTypeLabel(type).toLowerCase()}…`;
  }
}

// ---------------------------------------------------------------------------
// MultiModeCell — compact inline-editable value cell for a single theme option
// ---------------------------------------------------------------------------
function MultiModeCell({
  tokenPath, tokenType, value, targetSet, optionName, onSave,
  isTabPending, onTabActivated, onTab,
}: {
  tokenPath: string;
  tokenType: string | undefined;
  value: TokenMapEntry | undefined;
  targetSet: string | null;
  optionName: string;
  onSave?: (path: string, type: string, newValue: any, targetSet: string) => void;
  isTabPending?: boolean;
  onTabActivated?: () => void;
  onTab?: (direction: 1 | -1) => void;
}) {
  const { allTokensFlat, pathToSet } = useTokenTree();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const escapedRef = useRef(false);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const cellRef = useRef<HTMLDivElement>(null);

  // Alias editing state
  const [aliasEditing, setAliasEditing] = useState(false);
  const [aliasQuery, setAliasQuery] = useState('');
  const [aliasPopoverPos, setAliasPopoverPos] = useState({ x: 0, y: 0 });

  const isAliasValue = isAlias(value?.$value);
  const canEdit = !!tokenType && INLINE_SIMPLE_TYPES.has(tokenType) && !!targetSet && !!onSave && !isAliasValue;
  const canEditAlias = isAliasValue && !!targetSet && !!onSave;

  // Stable refs so the tab-activation effect always reads fresh values without
  // adding them as trigger dependencies (which would cause spurious re-activations
  // whenever value/tokenType/canEdit change while isTabPending is already true).
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  const valueRef = useRef(value);
  valueRef.current = value;
  const tokenTypeRef = useRef(tokenType);
  tokenTypeRef.current = tokenType;
  const onTabActivatedRef = useRef(onTabActivated);
  onTabActivatedRef.current = onTabActivated;

  // Activate edit mode when Tab navigation lands on this cell
  useEffect(() => {
    if (!isTabPending || !canEditRef.current || !valueRef.current || tokenTypeRef.current === 'color') return;
    setEditValue(getEditableString(tokenTypeRef.current!, valueRef.current.$value));
    setEditing(true);
    onTabActivatedRef.current?.();
  }, [isTabPending]);

  const handleSubmit = useCallback(() => {
    if (!editing || !tokenType || !targetSet || !onSave) return;
    const raw = editValue.trim();
    if (!raw) { setEditing(false); return; }
    const parsed = parseInlineValue(tokenType, raw);
    if (parsed === null) return;
    setEditing(false);
    onSave(tokenPath, tokenType, parsed, targetSet);
  }, [editing, editValue, tokenType, targetSet, tokenPath, onSave]);

  const openAliasEditor = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = cellRef.current?.getBoundingClientRect();
    if (!rect) return;
    const currentPath = extractAliasPath(value?.$value) ?? '';
    setAliasQuery(currentPath);
    setAliasPopoverPos({ x: rect.left, y: rect.bottom + 4 });
    setAliasEditing(true);
  }, [value]);

  const closeAliasEditor = useCallback(() => {
    setAliasEditing(false);
    setAliasQuery('');
  }, []);

  const displayVal = value ? formatValue(value.$type, value.$value) : '—';
  const isColor = tokenType === 'color' && value && typeof value.$value === 'string' && !isAliasValue;

  // For <input type="color">, extract 6-char hex and preserve any alpha suffix
  const colorHex = isColor ? (value!.$value as string) : '';
  const colorHexBase = colorHex.startsWith('#') ? colorHex.slice(0, 7) : '#000000';
  const colorAlphaSuffix = colorHex.startsWith('#') && colorHex.length === 9 ? colorHex.slice(7) : '';

  return (
    <div
      ref={cellRef}
      className="w-[80px] shrink-0 px-1 flex items-center justify-center border-l border-[var(--color-figma-border)] h-full"
      title={`${optionName}: ${displayVal}${targetSet ? `\nSet: ${targetSet}` : ''}`}
    >
      {!value ? (
        <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">—</span>
      ) : isColor ? (
        <>
          <span
            className={`w-5 h-5 rounded-sm border border-[var(--color-figma-border)] shrink-0 ${canEdit ? 'cursor-pointer hover:ring-1 hover:ring-[var(--color-figma-accent)]' : ''}`}
            style={{ backgroundColor: value.$value as string }}
            onClick={canEdit ? (e) => {
              e.stopPropagation();
              colorInputRef.current?.click();
            } : undefined}
          />
          {canEdit && (
            <input
              type="color"
              ref={colorInputRef}
              key={colorHexBase}
              defaultValue={colorHexBase}
              className="sr-only"
              onBlur={(e) => {
                const newHex = e.target.value + colorAlphaSuffix;
                if (newHex !== colorHex) {
                  onSave!(tokenPath, 'color', newHex, targetSet!);
                }
              }}
            />
          )}
        </>
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
            if (e.key === 'Tab') {
              e.preventDefault();
              e.stopPropagation();
              // Use escapedRef to block the onBlur from double-saving
              escapedRef.current = true;
              if (tokenType && targetSet && onSave) {
                const raw = editValue.trim();
                if (raw) {
                  const parsed = parseInlineValue(tokenType, raw);
                  if (parsed !== null) onSave(tokenPath, tokenType, parsed, targetSet);
                }
              }
              setEditing(false);
              onTab?.(e.shiftKey ? -1 : 1);
              return;
            }
            e.stopPropagation();
          }}
          onClick={e => e.stopPropagation()}
          aria-label="Edit token value"
          autoFocus
          className="text-[10px] w-full text-[var(--color-figma-text)] bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] rounded px-0.5 outline-none"
        />
      ) : isAliasValue ? (
        <>
          <span
            className={`text-[10px] truncate max-w-full font-mono ${canEditAlias ? 'cursor-pointer hover:underline hover:decoration-dotted text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]' : 'text-[var(--color-figma-text-secondary)]'}`}
            onClick={canEditAlias ? openAliasEditor : undefined}
            title={`${optionName}: ${displayVal}${targetSet ? `\nSet: ${targetSet}` : ''}\nClick to redirect alias`}
          >
            {displayVal}
          </span>
          {aliasEditing && (
            <div
              className="fixed z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg p-2 w-64"
              style={{ top: aliasPopoverPos.y, left: aliasPopoverPos.x }}
              onClick={e => e.stopPropagation()}
            >
              <div className="text-[9px] text-[var(--color-figma-text-tertiary)] mb-1.5 uppercase tracking-wide">
                Redirect alias · <span className="font-mono normal-case text-[var(--color-figma-text)]">{optionName}</span>
              </div>
              <div className="relative">
                <input
                  autoFocus
                  type="text"
                  value={aliasQuery}
                  onChange={e => setAliasQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { e.stopPropagation(); closeAliasEditor(); }
                  }}
                  className="w-full border border-[var(--color-figma-border)] rounded px-2 py-1 text-[11px] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-tertiary)]"
                  placeholder="Search tokens…"
                />
                <AliasAutocomplete
                  query={aliasQuery}
                  allTokensFlat={allTokensFlat}
                  pathToSet={pathToSet}
                  filterType={tokenType}
                  onSelect={path => {
                    onSave!(tokenPath, tokenType || value.$type || 'color', `{${path}}`, targetSet!);
                    closeAliasEditor();
                  }}
                  onClose={closeAliasEditor}
                />
              </div>
            </div>
          )}
        </>
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

// ---------------------------------------------------------------------------
// TokenGroupNode — renders a group row (expand/collapse header)
// ---------------------------------------------------------------------------
const TokenGroupNode = memo(function TokenGroupNode(props: TokenTreeNodeProps) {
  const {
    node, depth, lintViolations = [],
    isPinned: _isPinned, onMoveUp, onMoveDown,
  } = props;

  const ctx = useTokenTree();
  const {
    density, selectMode,
    expandedPaths, onToggleExpand, highlightedToken,
    searchHighlight, selectedNodes: _selectedNodes,
    dragOverGroup, dragOverGroupIsInvalid, dragSource, dragOverReorder: _dragOverReorder,
    onDeleteGroup, onToggleSelect: _onToggleSelect,
    onNavigateToAlias: _onNavigateToAlias, onCreateSibling, onCreateGroup, onRenameGroup,
    onUpdateGroupMeta, onRequestMoveGroup, onRequestCopyGroup,
    onDuplicateGroup, allTokensFlat,
    onSyncGroup, onSyncGroupStyles,
    onSetGroupScopes, onGenerateScaleFromGroup, onFilterByType: _onFilterByType,
    onZoomIntoGroup, onDragStart: _onDragStart, onDragEnd: _onDragEnd,
    onDragOverGroup, onDropOnGroup,
    generatorsBySource: _generatorsBySource, generatorsByTargetGroup, derivedTokenPaths: _derivedTokenPaths,
    onEditGenerator, onNavigateToGenerator: _onNavigateToGeneratorGroup, onRegenerateGenerator,
    themeCoverage, onSelectGroupChildren: _onSelectGroupChildren,
    condensedView = false,
    rovingFocusPath: groupRovingFocusPath, onRovingFocus: onGroupRovingFocus,
  } = ctx;

  const pyClass = DENSITY_PY_CLASS[density];
  const isExpanded = expandedPaths.has(node.path);
  const isHighlighted = highlightedToken === node.path;

  // Group-specific state
  const [groupMenuPos, setGroupMenuPos] = useState<MenuPosition | null>(null);
  const [groupMoreMenuPos, setGroupMoreMenuPos] = useState<MenuPosition | null>(null);
  const [renamingGroup, setRenamingGroup] = useState(false);
  const [renameGroupVal, setRenameGroupVal] = useState('');
  const [renameGroupError, setRenameGroupError] = useState('');
  const renameGroupInputRef = useRef<HTMLInputElement>(null);
  const groupMenuRef = useRef<HTMLDivElement>(null);
  const groupMoreMenuRef = useRef<HTMLDivElement>(null);
  const groupMoreButtonRef = useRef<HTMLButtonElement>(null);
  const [editingGroupMeta, setEditingGroupMeta] = useState(false);
  const [groupMetaType, setGroupMetaType] = useState('');
  const [groupMetaDescription, setGroupMetaDescription] = useState('');
  const [groupMetaSaving, setGroupMetaSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useLayoutEffect(() => {
    if (renamingGroup && renameGroupInputRef.current) {
      renameGroupInputRef.current.focus();
      renameGroupInputRef.current.select();
    }
  }, [renamingGroup]);

  const closeGroupMenus = useCallback(() => {
    setGroupMenuPos(null);
    setGroupMoreMenuPos(null);
  }, []);

  const closeGroupMoreMenu = useCallback(() => {
    setGroupMoreMenuPos(null);
    requestAnimationFrame(() => groupMoreButtonRef.current?.focus());
  }, []);

  const openGroupMoreMenu = useCallback((anchor?: HTMLElement | null) => {
    const rect = anchor?.getBoundingClientRect() ?? groupMoreButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setGroupMoreMenuPos(getSubmenuPosition(rect, 188, 260));
  }, []);

  useEffect(() => {
    if (!groupMenuPos) return;
    requestAnimationFrame(() => {
      if (groupMenuRef.current) getMenuItems(groupMenuRef.current)[0]?.focus();
    });
    const onDocumentClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (
        groupMenuRef.current?.contains(target) ||
        groupMoreMenuRef.current?.contains(target)
      ) {
        return;
      }
      closeGroupMenus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (groupMoreMenuPos) {
          closeGroupMoreMenu();
          return;
        }
        closeGroupMenus();
        return;
      }
      const activeMenuEl = groupMoreMenuRef.current?.contains(document.activeElement)
        ? groupMoreMenuRef.current
        : groupMenuRef.current;
      if (!activeMenuEl) return;
      if (handleMenuArrowKeys(e, activeMenuEl, {
        onOpenSubmenu: activeMenuEl === groupMenuRef.current && document.activeElement === groupMoreButtonRef.current
          ? () => openGroupMoreMenu(groupMoreButtonRef.current)
          : undefined,
        onCloseSubmenu: activeMenuEl === groupMoreMenuRef.current ? closeGroupMoreMenu : undefined,
      })) {
        return;
      }
      const key = e.key.toLowerCase();
      const btn = activeMenuEl.querySelector(`[data-accel="${key}"]`) as HTMLButtonElement | null;
      if (btn) {
        e.preventDefault();
        btn.click();
      }
    };
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [closeGroupMenus, closeGroupMoreMenu, groupMenuPos, groupMoreMenuPos, openGroupMoreMenu]);

  useEffect(() => {
    if (!groupMoreMenuPos) return;
    requestAnimationFrame(() => {
      if (groupMoreMenuRef.current) getMenuItems(groupMoreMenuRef.current)[0]?.focus();
    });
  }, [groupMoreMenuPos]);

  const leafCount = countLeaves(node);
  const targetGenerator = generatorsByTargetGroup?.get(node.path) ?? null;

  // Build a stable map of child path → filtered lint violations so we don't create
  // a new array on every render when passing violations down to child nodes.
  const childLintMap = useMemo(() => {
    if (!lintViolations.length) return null;
    const map = new Map<string, NonNullable<TokenTreeNodeProps['lintViolations']>>();
    for (const v of lintViolations) {
      let arr = map.get(v.path);
      if (!arr) { arr = []; map.set(v.path, arr); }
      arr.push(v);
    }
    return map;
  }, [lintViolations]);

  const confirmGroupRename = useCallback(() => {
    const newName = renameGroupVal.trim();
    if (!newName) { setRenameGroupError('Name cannot be empty'); return; }
    if (newName === node.name) { setRenamingGroup(false); setRenameGroupError(''); return; }
    const parentPath = nodeParentPath(node.path, node.name);
    const newGroupPath = parentPath ? `${parentPath}.${newName}` : newName;
    // Check for conflict: a token or group already exists at the target path
    const prefix = newGroupPath + '.';
    const hasConflict = Object.keys(allTokensFlat).some(p => p === newGroupPath || p.startsWith(prefix));
    if (hasConflict) { setRenameGroupError(`A group named '${newName}' already exists here`); return; }
    setRenamingGroup(false);
    setRenameGroupError('');
    onRenameGroup?.(node.path, newGroupPath);
  }, [renameGroupVal, node.name, node.path, allTokensFlat, onRenameGroup]);

  const cancelGroupRename = useCallback(() => {
    setRenamingGroup(false);
    setRenameGroupError('');
  }, []);

  const handleSaveGroupMeta = useCallback(async () => {
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
  }, [onUpdateGroupMeta, node.path, groupMetaType, groupMetaDescription]);

  const isCategoryHeader = depth === 0;

  return (
    <div className={isCategoryHeader ? 'border-t border-[var(--color-figma-border)]' : ''}>
      <div
        role="button"
        tabIndex={groupRovingFocusPath === node.path ? 0 : -1}
        aria-expanded={isExpanded}
        aria-label={`Toggle group ${node.name}`}
        data-group-path={node.path}
        data-node-name={node.name}
        onFocus={() => onGroupRovingFocus(node.path)}
        className={`relative flex items-center gap-1 px-2 ${pyClass} cursor-pointer hover:bg-[var(--color-figma-bg-hover)] transition-colors group/group bg-[var(--color-figma-bg)] ${isHighlighted ? 'bg-[var(--color-figma-accent)]/15 ring-1 ring-inset ring-[var(--color-figma-accent)]/40' : ''} ${dragOverGroup === node.path ? (dragOverGroupIsInvalid ? 'ring-1 ring-inset ring-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10' : 'ring-1 ring-inset ring-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10') : ''}`}
        style={{ paddingLeft: `${computePaddingLeft(depth, condensedView, 8)}px` }}
        onClick={() => !renamingGroup && onToggleExpand(node.path)}
        onDoubleClick={() => !renamingGroup && onZoomIntoGroup?.(node.path)}
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
          if (e.key === 'n' && !renamingGroup && !selectMode) {
            e.preventDefault();
            e.stopPropagation();
            onCreateSibling?.(node.path, inferGroupTokenType(node.children));
          }
          if (e.key === 'm' && !renamingGroup && !selectMode) {
            e.preventDefault();
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setGroupMoreMenuPos(null);
            setGroupMenuPos(clampMenuPosition(rect.left, rect.bottom + 2, 184, 240));
          }
        }}
        onContextMenu={e => {
          e.preventDefault();
          setGroupMoreMenuPos(null);
          setGroupMenuPos(clampMenuPosition(e.clientX, e.clientY, 184, 240));
        }}
      >
        <DepthBar depth={depth} />
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
          <div className="flex flex-col flex-1 min-w-0 gap-0.5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-1">
              <input
                ref={renameGroupInputRef}
                value={renameGroupVal}
                onChange={e => { setRenameGroupVal(e.target.value); setRenameGroupError(''); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.stopPropagation(); confirmGroupRename(); }
                  if (e.key === 'Escape') { e.stopPropagation(); cancelGroupRename(); }
                }}
                aria-label="Rename group"
                className={`flex-1 text-[11px] font-medium bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] rounded px-1 outline-none min-w-0 focus-visible:border-[var(--color-figma-accent)] ${renameGroupError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
              />
              <button onClick={confirmGroupRename} disabled={!renameGroupVal.trim()} className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 shrink-0">Save</button>
              <button onClick={cancelGroupRename} className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] shrink-0">Cancel</button>
            </div>
            {renameGroupError && <p role="alert" className="text-[10px] text-[var(--color-figma-error)]">{renameGroupError}</p>}
          </div>
        ) : (
          <span className={isCategoryHeader ? 'text-[10px] font-semibold uppercase tracking-wider text-[var(--color-figma-text-secondary)] flex-1' : 'text-[11px] font-medium text-[var(--color-figma-text)] flex-1'}>{highlightMatch(node.name, searchHighlight?.nameTerms ?? [])}</span>
        )}
        {!renamingGroup && node.children && (
          isCategoryHeader ? (
            <span className={`text-[10px] ml-1 shrink-0 px-1.5 py-0.5 rounded-full font-medium ${leafCount === 0 ? 'text-[var(--color-figma-text-tertiary)] opacity-60' : 'bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]'}`}>
              {leafCount === 0 ? 'empty' : leafCount}
            </span>
          ) : (
            <span className={`text-[10px] ml-1 shrink-0 ${leafCount === 0 ? 'text-[var(--color-figma-text-secondary)] opacity-50 italic' : 'text-[var(--color-figma-text-secondary)]'}`}>
              {leafCount === 0 ? 'empty' : `(${leafCount})`}
            </span>
          )
        )}
        {!renamingGroup && themeCoverage && (() => {
          const cov = themeCoverage!.get(node.path);
          if (!cov || cov.total === 0) return null;
          const isFull = cov.themed === cov.total;
          return (
            <span
              className={`text-[10px] ml-1 shrink-0 ${isFull ? 'text-[var(--color-figma-success)]' : 'text-[var(--color-figma-text-tertiary)]'}`}
              title={`${cov.themed} of ${cov.total} tokens have themed overrides`}
            >
              {cov.themed}/{cov.total} themed
            </span>
          );
        })()}
        {!renamingGroup && (() => {
          if (!targetGenerator) return null;
          const canEdit = Boolean(onEditGenerator);
          const isStale = !!targetGenerator.isStale;
          const Tag = canEdit ? 'button' : 'span';
          return (
            <>
              {isStale && (
                <button
                  type="button"
                  title={regenerating ? 'Regenerating…' : 'Source token changed — click to regenerate'}
                  aria-label={regenerating ? 'Regenerating' : 'Regenerate stale generator'}
                  disabled={regenerating || !targetGenerator.id || !onRegenerateGenerator}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!targetGenerator.id || !onRegenerateGenerator || regenerating) return;
                    setRegenerating(true);
                    try { await onRegenerateGenerator(targetGenerator.id); } finally { setRegenerating(false); }
                  }}
                  className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-amber-500/20 shrink-0 ml-0.5 hover:bg-amber-500/40 transition-colors disabled:cursor-default"
                >
                  {regenerating ? (
                    <svg width="6" height="6" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-amber-500 animate-spin" aria-hidden="true">
                      <path d="M5 1v2M5 7v2M1 5h2M7 5h2"/>
                    </svg>
                  ) : (
                    <svg width="6" height="6" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500" aria-hidden="true">
                      <path d="M8 2a4.5 4.5 0 1 1-6.5 1.5"/>
                      <path d="M8 2v2.5H5.5"/>
                    </svg>
                  )}
                </button>
              )}
              <Tag
                {...(canEdit ? {
                  type: 'button' as const,
                  onClick: (e: React.MouseEvent) => { e.stopPropagation(); onEditGenerator?.(targetGenerator.id); },
                } : {})}
                title={canEdit ? `Generated by ${targetGenerator.name} — click to edit inline` : `Generated by ${targetGenerator.name}`}
                className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-medium shrink-0 ml-0.5 bg-[var(--color-figma-text-secondary)]/10 text-[var(--color-figma-text-secondary)]${canEdit ? ' cursor-pointer hover:bg-[var(--color-figma-accent)]/20 hover:text-[var(--color-figma-accent)]' : ''}${isStale ? ' border border-amber-500/60' : ''}`}
              >
                <svg className="shrink-0" width="7" height="7" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="5" cy="2" r="1.5"/>
                  <circle cx="2" cy="8" r="1.5"/>
                  <circle cx="8" cy="8" r="1.5"/>
                  <path d="M5 3.5V6M5 6L2 6.5M5 6L8 6.5"/>
                </svg>
                {targetGenerator.name}
              </Tag>
            </>
          );
        })()}
        {!renamingGroup && node.$type && (
          <span
            className="text-[10px] shrink-0 text-[var(--color-figma-text-secondary)] italic ml-0.5 opacity-60"
            title={`$type: ${node.$type} (inherited by all children)`}
          >
            {node.$type}
          </span>
        )}
        {!selectMode && !renamingGroup && (
          <kbd className="hidden group-focus-visible/group:inline text-[9px] leading-none px-1 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg)] font-sans ml-auto shrink-0" aria-hidden="true">N</kbd>
        )}
        {!selectMode && !renamingGroup && (
          <div className="hidden group-hover/group:flex group-focus-within/group:flex items-center gap-0.5 shrink-0 ml-auto">
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
                setGroupMoreMenuPos(null);
                setGroupMenuPos(clampMenuPosition(rect.left, rect.bottom + 2, 184, 240));
              }}
              title="Group actions (M)"
              aria-label="Group actions"
              aria-haspopup="menu"
              aria-expanded={!!groupMenuPos}
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
        <>
          <div
            ref={groupMenuRef}
            role="menu"
            data-context-menu="group"
            className={`${MENU_SURFACE_CLASS} min-w-[184px]`}
            style={{ top: groupMenuPos.y, left: groupMenuPos.x }}
            onClick={e => e.stopPropagation()}
          >
            {onCreateSibling && (
              <button
                role="menuitem"
                tabIndex={-1}
                data-accel="c"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  closeGroupMenus();
                  onCreateSibling(node.path, inferGroupTokenType(node.children));
                }}
                className={MENU_ITEM_CLASS}
              >
                <span>Add token</span>
                <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">C</span>
              </button>
            )}
            <button
              role="menuitem"
              tabIndex={-1}
              data-accel="r"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                closeGroupMenus();
                setRenameGroupVal(node.name);
                setRenamingGroup(true);
              }}
              className={MENU_ITEM_CLASS}
            >
              <span>Rename</span>
              <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">R</span>
            </button>
            <button
              role="menuitem"
              tabIndex={-1}
              data-accel="x"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                closeGroupMenus();
                onDeleteGroup(node.path, node.name, leafCount);
              }}
              className={MENU_DANGER_ITEM_CLASS}
            >
              <span>Delete</span>
              <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">X</span>
            </button>
            {onGenerateScaleFromGroup && (
              <button
                role="menuitem"
                tabIndex={-1}
                data-accel="g"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  closeGroupMenus();
                  const prefix = `${node.path}.`;
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
                className={MENU_ITEM_CLASS}
              >
                <span>Generate scale</span>
                <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">G</span>
              </button>
            )}
            <button
              ref={groupMoreButtonRef}
              role="menuitem"
              tabIndex={-1}
              aria-haspopup="menu"
              aria-expanded={!!groupMoreMenuPos}
              onMouseDown={e => e.preventDefault()}
              onClick={e => {
                e.stopPropagation();
                if (groupMoreMenuPos) {
                  closeGroupMoreMenu();
                } else {
                  openGroupMoreMenu(e.currentTarget);
                }
              }}
              className={MENU_ITEM_CLASS}
            >
              <span>More…</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {groupMoreMenuPos && (
            <div
              ref={groupMoreMenuRef}
              role="menu"
              aria-label="More group actions"
              className={`${MENU_SURFACE_CLASS} min-w-[188px]`}
              style={{ top: groupMoreMenuPos.y, left: groupMoreMenuPos.x }}
              onClick={e => e.stopPropagation()}
            >
              {onCreateGroup && (
                <button
                  role="menuitem"
                  tabIndex={-1}
                  data-accel="n"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    closeGroupMenus();
                    onCreateGroup(node.path);
                  }}
                  className={MENU_ITEM_CLASS}
                >
                  <span>New subgroup</span>
                  <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">N</span>
                </button>
              )}
              <button
                role="menuitem"
                tabIndex={-1}
                data-accel="e"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  closeGroupMenus();
                  setGroupMetaType(node.$type ?? '');
                  setGroupMetaDescription(node.$description ?? '');
                  setEditingGroupMeta(true);
                }}
                className={MENU_ITEM_CLASS}
              >
                <span>Edit type &amp; description</span>
                <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">E</span>
              </button>
              <button
                role="menuitem"
                tabIndex={-1}
                data-accel="m"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  closeGroupMenus();
                  onRequestMoveGroup?.(node.path);
                }}
                className={MENU_ITEM_CLASS}
              >
                <span>Move to set</span>
                <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">M</span>
              </button>
              <button
                role="menuitem"
                tabIndex={-1}
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  closeGroupMenus();
                  onRequestCopyGroup?.(node.path);
                }}
                className={MENU_ITEM_CLASS}
              >
                <span>Copy to set</span>
              </button>
              <button
                role="menuitem"
                tabIndex={-1}
                data-accel="d"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  closeGroupMenus();
                  onDuplicateGroup?.(node.path);
                }}
                className={MENU_ITEM_CLASS}
              >
                <span>Duplicate</span>
                <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">D</span>
              </button>
              {onSetGroupScopes && (
                <button
                  role="menuitem"
                  tabIndex={-1}
                  data-accel="s"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    closeGroupMenus();
                    onSetGroupScopes(node.path);
                  }}
                  className={MENU_ITEM_CLASS}
                >
                  <span>Set scopes</span>
                  <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">S</span>
                </button>
              )}
              {onSyncGroup && (
                <button
                  role="menuitem"
                  tabIndex={-1}
                  data-accel="v"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    closeGroupMenus();
                    const count = node.children ? countTokensInGroup(node) : 0;
                    onSyncGroup(node.path, count);
                  }}
                  className={MENU_ITEM_CLASS}
                >
                  <span>Sync to Figma variables</span>
                  <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">V</span>
                </button>
              )}
              {onSyncGroupStyles && (
                <button
                  role="menuitem"
                  tabIndex={-1}
                  data-accel="y"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    closeGroupMenus();
                    const count = node.children ? countTokensInGroup(node) : 0;
                    onSyncGroupStyles(node.path, count);
                  }}
                  className={MENU_ITEM_CLASS}
                >
                  <span>Sync to Figma styles</span>
                  <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">Y</span>
                </button>
              )}
            </div>
          )}
        </>
      )}

      {editingGroupMeta && (
        <div
          className="mx-2 mb-1 p-2 rounded border border-[var(--color-figma-accent)]/40 bg-[var(--color-figma-bg-secondary)] flex flex-col gap-1.5"
          style={{ marginLeft: `${computePaddingLeft(depth, condensedView, 8)}px` }}
          onClick={e => e.stopPropagation()}
        >
          <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] uppercase tracking-wide">Group metadata</div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-[var(--color-figma-text-secondary)] w-16 shrink-0">$type</label>
            <select
              value={groupMetaType}
              onChange={e => setGroupMetaType(e.target.value)}
              className="flex-1 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)]"
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
              className="flex-1 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)]"
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

      {!props.skipChildren && isExpanded && targetGenerator && (
        <GeneratorSummaryRow
          depth={depth}
          condensedView={condensedView}
          generator={targetGenerator}
          running={regenerating}
          onRun={targetGenerator.id && onRegenerateGenerator
            ? async () => {
                if (regenerating) return;
                setRegenerating(true);
                try {
                  await onRegenerateGenerator(targetGenerator.id);
                } finally {
                  setRegenerating(false);
                }
              }
            : undefined}
          onEdit={targetGenerator.id && onEditGenerator ? () => onEditGenerator(targetGenerator.id) : undefined}
        />
      )}

      {!props.skipChildren && isExpanded && node.children?.map(child => (
        <TokenTreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          isSelected={false}
          lintViolations={childLintMap?.get(child.path) ?? EMPTY_LINT_VIOLATIONS}
        />
      ))}
    </div>
  );
}, (prev, next) => {
  return (
    prev.node === next.node &&
    prev.depth === next.depth &&
    prev.isSelected === next.isSelected &&
    prev.lintViolations === next.lintViolations &&
    prev.skipChildren === next.skipChildren &&
    prev.showFullPath === next.showFullPath &&
    prev.isPinned === next.isPinned &&
    prev.chainExpanded === next.chainExpanded &&
    prev.onMoveUp === next.onMoveUp &&
    prev.onMoveDown === next.onMoveDown &&
    prev.multiModeValues === next.multiModeValues
  );
});

// ---------------------------------------------------------------------------
// TokenLeafNode — renders a leaf token row
// ---------------------------------------------------------------------------
const TokenLeafNode = memo(function TokenLeafNode(props: TokenTreeNodeProps) {
  const {
    node, depth, isSelected, lintViolations = [],
    skipChildren, showFullPath, isPinned: _isPinned,
    chainExpanded: chainExpandedProp = false,
    onMoveUp: _onMoveUp, onMoveDown: _onMoveDown, multiModeValues,
  } = props;

  const ctx = useTokenTree();
  const {
    density, serverUrl, setName, sets, selectionCapabilities, allTokensFlat, selectMode,
    expandedPaths: _expandedPaths, onToggleExpand: _onToggleExpand, duplicateCounts, highlightedToken,
    inspectMode, syncSnapshot, cascadeDiff: _cascadeDiff, generatorsBySource: _generatorsBySource,
    derivedTokenPaths: _derivedTokenPaths, tokenUsageCounts: _tokenUsageCounts, searchHighlight, selectedNodes,
    dragOverGroup: _dragOverGroup, dragOverGroupIsInvalid: _dragOverGroupIsInvalid,
    dragSource: _dragSource, dragOverReorder,
    selectedLeafNodes,
    onEdit, onPreview, onDelete, onDeleteGroup: _onDeleteGroup, onToggleSelect,
    onNavigateToAlias, onCreateSibling: _onCreateSibling, onCreateGroup: _onCreateGroup, onRenameGroup: _onRenameGroup,
    onUpdateGroupMeta: _onUpdateGroupMeta, onRequestMoveGroup: _onRequestMoveGroup,
    onRequestCopyGroup: _onRequestCopyGroup, onRequestMoveToken, onRequestCopyToken,
    onDuplicateGroup: _onDuplicateGroup, onDuplicateToken, onExtractToAlias, onHoverToken,
    onExtractToAliasForLint, onSyncGroup: _onSyncGroup, onSyncGroupStyles: _onSyncGroupStyles,
    onSetGroupScopes: _onSetGroupScopes, onGenerateScaleFromGroup: _onGenerateScaleFromGroup,
    onFilterByType,
    onJumpToGroup: _onJumpToGroup, onZoomIntoGroup: _onZoomIntoGroup, onInlineSave, onRenameToken, onDetachFromGenerator: _onDetachFromGenerator,
    onToggleChain: _onToggleChain, onTogglePin: _onTogglePin, onCompareToken: _onCompareToken, onViewTokenHistory, onShowReferences: _onShowReferences, onCompareAcrossThemes, onFindInAllSets: _onFindInAllSets,
    onRefresh, onPushUndo,
    onDragStart, onDragEnd,
    onDragOverGroup: _onDragOverGroup, onDropOnGroup: _onDropOnGroup,
    onDragOverToken, onDragLeaveToken, onDropOnToken,
    onMultiModeInlineSave,
    showResolvedValues,
    condensedView = false,
    onToggleStar, starredPaths,
    pathToSet, dimensions, activeThemes,
    pendingRenameToken, clearPendingRename,
    pendingTabEdit, clearPendingTabEdit, onTabToNext,
    onNavigateToGenerator: _onNavigateToGenerator,
    rovingFocusPath, onRovingFocus,
  } = ctx;

  const pyClass = DENSITY_PY_CLASS[density];
  const swatchSize = DENSITY_SWATCH_SIZE[density];

  const isHighlighted = highlightedToken === node.path;
  const [hovered, setHovered] = useState(false);
  const [hoverPreviewVisible, setHoverPreviewVisible] = useState(false);
  const [hoverInfoVisible, setHoverInfoVisible] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ top: number; left: number } | undefined>();
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [pendingColor, setPendingColor] = useState('');
  const [copiedWhat, setCopiedWhat] = useState<'path' | 'value' | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<MenuPosition | null>(null);
  const [tokenMoreMenuPos, setTokenMoreMenuPos] = useState<MenuPosition | null>(null);
  const [quickGeneratorPopover, setQuickGeneratorPopover] = useState<{ position: MenuPosition; type: GeneratorType } | null>(null);
  const [advancedGeneratorDraft, setAdvancedGeneratorDraft] = useState<GeneratorDialogInitialDraft | null>(null);
  const [refsPopover, setRefsPopover] = useState<{ pos: { x: number; y: number }; refs: string[] } | null>(null);
  const refsPopoverRef = useRef<HTMLDivElement>(null);
  const chainExpanded = chainExpandedProp;
  const [inlineEditActive, setInlineEditActive] = useState(false);
  const [inlineEditValue, setInlineEditValue] = useState('');
  const [inlineEditError, setInlineEditError] = useState<string | null>(null);
  const inlineEditEscapedRef = useRef(false);
  const [inlineNudgeVisible, setInlineNudgeVisible] = useState(false);
  const [quickBound, setQuickBound] = useState<string | null>(null);
  const [pickerProps, setPickerProps] = useState<BindableProperty[] | null>(null);
  const [aliasPickerOpen, setAliasPickerOpen] = useState(false);
  const [aliasQuery, setAliasQuery] = useState('');
  const [aliasPickerPos, setAliasPickerPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [inlinePopoverOpen, setInlinePopoverOpen] = useState(false);
  const [inlinePopoverAnchor, setInlinePopoverAnchor] = useState<DOMRect | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  // Stable refs for the tab-edit effect (see useEffect near pendingTabEdit)
  const nodeDataRef = useRef(node);
  const canInlineEditRef = useRef(false);
  const clearPendingTabEditRef = useRef(clearPendingTabEdit);

  // Token rename state
  const [renamingToken, setRenamingToken] = useState(false);
  const [renameTokenVal, setRenameTokenVal] = useState('');
  const [renameTokenError, setRenameTokenError] = useState('');
  const renameTokenInputRef = useRef<HTMLInputElement>(null);
  const tokenMenuRef = useRef<HTMLDivElement>(null);
  const tokenMoreMenuRef = useRef<HTMLDivElement>(null);
  const tokenMoreButtonRef = useRef<HTMLButtonElement>(null);
  const booleanInlineEditRef = useRef<HTMLDivElement>(null);
  const quickGeneratorType = useMemo(
    () => getQuickGeneratorTypeForToken(node.path, node.name, node.$type, node.$value),
    [node.path, node.name, node.$type, node.$value],
  );

  useLayoutEffect(() => {
    if (renamingToken && renameTokenInputRef.current) {
      renameTokenInputRef.current.focus();
      renameTokenInputRef.current.select();
    }
  }, [renamingToken]);

  useLayoutEffect(() => {
    if (inlineEditActive && node.$type === 'boolean') {
      booleanInlineEditRef.current?.focus();
    }
  }, [inlineEditActive, node.$type]);

  // When this token is the pending rename target (e.g. after Cmd+D duplicate), activate inline rename
  useEffect(() => {
    if (pendingRenameToken === node.path) {
      setRenameTokenVal(node.name);
      setRenamingToken(true);
      clearPendingRename();
    }
  }, [pendingRenameToken, node.path, node.name, clearPendingRename]);

  // When Tab navigation lands on this token (non-multi-mode), activate inline edit.
  // Reads node/canInlineEdit/clearPendingTabEdit via stable refs so the effect only
  // fires when pendingTabEdit changes, not on every unrelated prop update.
  useEffect(() => {
    const n = nodeDataRef.current;
    if (!pendingTabEdit || pendingTabEdit.path !== n.path || pendingTabEdit.columnId !== null) return;
    if (canInlineEditRef.current && n.$type && n.$type !== 'color') {
      setInlineEditValue(getEditableString(n.$type, n.$value));
      setInlineEditError(null);
      setInlineEditActive(true);
      setInlineNudgeVisible(false);
    }
    clearPendingTabEditRef.current();
  }, [pendingTabEdit]);

  const closeTokenMenus = useCallback(() => {
    setContextMenuPos(null);
    setTokenMoreMenuPos(null);
  }, []);

  const closeTokenMoreMenu = useCallback(() => {
    setTokenMoreMenuPos(null);
    requestAnimationFrame(() => tokenMoreButtonRef.current?.focus());
  }, []);

  const openTokenMoreMenu = useCallback((anchor?: HTMLElement | null) => {
    const rect = anchor?.getBoundingClientRect() ?? tokenMoreButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTokenMoreMenuPos(getSubmenuPosition(rect, 212, 320));
  }, []);

  const openQuickGenerator = useCallback(() => {
    if (!quickGeneratorType) return;
    const rect = nodeRef.current?.getBoundingClientRect();
    const rawX = rect ? rect.right + 8 : window.innerWidth / 2 - 180;
    const rawY = rect ? rect.top : 64;
    closeTokenMenus();
    setQuickGeneratorPopover({
      type: quickGeneratorType,
      position: clampMenuPosition(rawX, rawY, 360, 520),
    });
  }, [closeTokenMenus, quickGeneratorType]);

  const handleQuickGeneratorCreated = useCallback(() => {
    setQuickGeneratorPopover(null);
    onRefresh();
  }, [onRefresh]);

  const handleOpenAdvancedGenerator = useCallback((draft: GeneratorDialogInitialDraft) => {
    setQuickGeneratorPopover(null);
    setAdvancedGeneratorDraft(draft);
  }, []);

  // Close context menu on outside click + scoped arrow-key navigation + letter-key accelerators
  useEffect(() => {
    if (!contextMenuPos) return;
    requestAnimationFrame(() => {
      if (tokenMenuRef.current) getMenuItems(tokenMenuRef.current)[0]?.focus();
    });
    const onDocumentClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (
        tokenMenuRef.current?.contains(target) ||
        tokenMoreMenuRef.current?.contains(target)
      ) {
        return;
      }
      closeTokenMenus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (tokenMoreMenuPos) {
          closeTokenMoreMenu();
          return;
        }
        closeTokenMenus();
        return;
      }
      const activeMenuEl = tokenMoreMenuRef.current?.contains(document.activeElement)
        ? tokenMoreMenuRef.current
        : tokenMenuRef.current;
      if (!activeMenuEl) return;
      if (handleMenuArrowKeys(e, activeMenuEl, {
        onOpenSubmenu: activeMenuEl === tokenMenuRef.current && document.activeElement === tokenMoreButtonRef.current
          ? () => openTokenMoreMenu(tokenMoreButtonRef.current)
          : undefined,
        onCloseSubmenu: activeMenuEl === tokenMoreMenuRef.current ? closeTokenMoreMenu : undefined,
      })) {
        return;
      }
      const key = e.key === 'Backspace' ? 'delete' : e.key.toLowerCase();
      const btn = activeMenuEl.querySelector(`[data-accel="${key}"]`) as HTMLButtonElement | null;
      if (btn) {
        e.preventDefault();
        btn.click();
      }
    };
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [closeTokenMenus, closeTokenMoreMenu, contextMenuPos, openTokenMoreMenu, tokenMoreMenuPos]);

  useEffect(() => {
    if (!tokenMoreMenuPos) return;
    requestAnimationFrame(() => {
      if (tokenMoreMenuRef.current) getMenuItems(tokenMoreMenuRef.current)[0]?.focus();
    });
  }, [tokenMoreMenuPos]);

  // Close refs popover on outside click or Escape
  useEffect(() => {
    if (!refsPopover) return;
    const close = () => setRefsPopover(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setRefsPopover(null); } };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey); };
  }, [refsPopover]);

  // Close alias picker on outside click
  useEffect(() => {
    if (!aliasPickerOpen) return;
    const close = () => setAliasPickerOpen(false);
    const timer = setTimeout(() => document.addEventListener('click', close), 0);
    return () => { clearTimeout(timer); document.removeEventListener('click', close); };
  }, [aliasPickerOpen]);

  // Scroll highlighted token into view (only when NOT in virtual scroll mode)
  useEffect(() => {
    if (isHighlighted && nodeRef.current && !skipChildren) {
      nodeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isHighlighted, skipChildren]);

  // Delayed hover preview for complex token types (typography, shadow, gradient, border)
  useEffect(() => {
    if (!hovered || !node.$type || !COMPLEX_PREVIEW_TYPES.has(node.$type)) {
      setHoverPreviewVisible(false);
      return;
    }
    const timer = setTimeout(() => setHoverPreviewVisible(true), 300);
    return () => clearTimeout(timer);
  }, [hovered, node.$type]);

  // Memoized alias resolution — expensive traversal, only recompute when value/type/map changes
  const resolveResult = useMemo(
    () => isAlias(node.$value)
      ? resolveTokenValue(node.$value, node.$type || 'unknown', allTokensFlat)
      : null,
    [node.$value, node.$type, allTokensFlat],
  );

  const displayValue = resolveResult ? (resolveResult.value ?? node.$value) : node.$value;
  const isBrokenAlias = isAlias(node.$value) && !!resolveResult?.error;
  const aliasTargetPath = isAlias(node.$value) ? String(node.$value).slice(1, -1) : null;
  const isFavorite = starredPaths?.has(node.path) ?? false;
  const showExpandedMeta = !renamingToken && (isSelected || rovingFocusPath === node.path || isHighlighted);

  // Enriched resolution chain with per-hop set/theme metadata (for debugger view)
  const setThemeMap = useMemo(
    () => (dimensions?.length && activeThemes) ? buildSetThemeMap(dimensions, activeThemes) : undefined,
    [dimensions, activeThemes],
  );
  const resolutionSteps: ResolutionStep[] | null = useMemo(() => {
    if (!isAlias(node.$value)) return null;
    return buildResolutionChain(
      node.path, node.$value, node.$type || 'unknown',
      allTokensFlat, pathToSet, setThemeMap,
    );
  }, [node.path, node.$value, node.$type, allTokensFlat, pathToSet, setThemeMap]);

  // Delayed quick-info tooltip for tokens without an alias chain tooltip
  useEffect(() => {
    const aliasChainShowing = !!(resolutionSteps && resolutionSteps.length >= 2 && !isBrokenAlias);
    if (!hovered || aliasChainShowing || (!node.$type && !node.$description)) {
      setHoverInfoVisible(false);
      return;
    }
    const timer = setTimeout(() => setHoverInfoVisible(true), 400);
    return () => clearTimeout(timer);
  }, [hovered, resolutionSteps, isBrokenAlias, node.$type, node.$description]);

  // Inline quick-edit eligibility
  const canInlineEdit = !isAlias(node.$value) && !!node.$type
    && INLINE_SIMPLE_TYPES.has(node.$type) && !!onInlineSave;

  // Complex type or alias — eligible for the inline value popover
  const canInlinePopover = !!onInlineSave && !!node.$type
    && (INLINE_POPOVER_TYPES.has(node.$type) || isAlias(node.$value))
    && !canInlineEdit;

  // Keep stable refs up-to-date for the tab-edit effect
  nodeDataRef.current = node;
  canInlineEditRef.current = canInlineEdit;
  clearPendingTabEditRef.current = clearPendingTabEdit;

  // Nearby token match for inline editing nudge
  const nearbyMatches = useNearbyTokenMatch(
    node.$value, node.$type || '', allTokensFlat, node.path,
    !isAlias(node.$value) && inlineNudgeVisible,
  );

  const handleInlineSubmit = useCallback(() => {
    if (!inlineEditActive) return;
    const raw = inlineEditValue.trim();
    if (!raw || raw === getEditableString(node.$type, node.$value)) { setInlineEditActive(false); return; }
    const parsed = parseInlineValue(node.$type!, raw);
    if (parsed === null) {
      setInlineEditError(getInlineValueError(node.$type!));
      return;
    }
    setInlineEditError(null);
    setInlineEditActive(false);
    onInlineSave?.(node.path, node.$type!, parsed);
    // Show nudge after saving a raw value — matches will be computed by the hook
    setInlineNudgeVisible(true);
  }, [inlineEditActive, inlineEditValue, node, onInlineSave]);

  const cancelInlineEdit = useCallback(() => {
    inlineEditEscapedRef.current = true;
    setInlineEditError(null);
    setInlineEditActive(false);
  }, []);

  // Tab from an inline-edit cell: save current value (if valid) then navigate to next/prev token
  const handleInlineTabToNext = useCallback((shiftKey: boolean) => {
    if (inlineEditActive && node.$type) {
      const raw = inlineEditValue.trim();
      if (raw && raw !== getEditableString(node.$type, node.$value)) {
        const parsed = parseInlineValue(node.$type, raw);
        if (parsed === null) {
          // Invalid value — show error and stay in this editor instead of silently dropping the edit
          setInlineEditError(getInlineValueError(node.$type));
          return;
        }
        onInlineSave?.(node.path, node.$type, parsed);
      }
    }
    setInlineEditError(null);
    inlineEditEscapedRef.current = true; // block onBlur from double-saving
    setInlineEditActive(false);
    onTabToNext(node.path, null, shiftKey ? -1 : 1);
  }, [inlineEditActive, inlineEditValue, node, onInlineSave, onTabToNext]);

  // Stepper helpers for number/dimension/fontWeight/duration inline editing
  const isNumericInlineType = node.$type === 'number' || node.$type === 'dimension' || node.$type === 'fontWeight' || node.$type === 'duration';
  const dimParts = node.$type === 'dimension' && inlineEditActive
    ? (inlineEditValue.trim().match(/^(-?\d*\.?\d+)\s*([a-zA-Z%]*)$/) ?? null)
    : null;
  const stepInlineValue = useCallback((delta: number) => {
    if (node.$type === 'dimension') {
      const m = inlineEditValue.trim().match(/^(-?\d*\.?\d+)\s*([a-zA-Z%]*)$/);
      if (m) setInlineEditValue(`${Math.round((parseFloat(m[1]) + delta) * 100) / 100}${m[2] || 'px'}`);
    } else {
      const n = parseFloat(inlineEditValue);
      if (!isNaN(n)) setInlineEditValue(String(Math.round((n + delta) * 100) / 100));
    }
  }, [node.$type, inlineEditValue]);

  // Sync state indicator
  const syncChanged = syncSnapshot && node.path in syncSnapshot
    && syncSnapshot[node.path] !== stableStringify(node.$value);

  const handleCopyPath = useCallback(() => {
    navigator.clipboard.writeText(node.path).catch(e => console.warn('[clipboard] write failed:', e));
    setCopiedWhat('path');
    setTimeout(() => setCopiedWhat(null), 1500);
  }, [node.path]);

  const handleCopyValue = useCallback(() => {
    const val = typeof displayValue === 'string' ? displayValue : JSON.stringify(displayValue);
    navigator.clipboard.writeText(val).catch(e => console.warn('[clipboard] write failed:', e));
    setCopiedWhat('value');
    setTimeout(() => setCopiedWhat(null), 1500);
  }, [displayValue]);

  const handleAliasClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAlias(node.$value) || isBrokenAlias) return;
    const aliasPath = (node.$value as string).slice(1, -1);
    onNavigateToAlias?.(aliasPath, node.path);
  }, [node.$value, isBrokenAlias, onNavigateToAlias, node.path]);

  const applyWithProperty = useCallback((property: BindableProperty) => {
    if (node.$value === undefined) return;
    const resolved = resolveTokenValue(node.$value, node.$type || 'unknown', allTokensFlat);
    if (resolved.error) {
      dispatchToast(`Cannot apply: ${resolved.error}`, 'error');
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
  }, [node.$value, node.$type, node.path, allTokensFlat]);

  const handleApplyToSelection = useCallback((e: React.MouseEvent) => {
    if (!node.$type) return;

    // Composition tokens apply all their properties at once
    if (node.$type === 'composition') {
      parent.postMessage({
        pluginMessage: {
          type: 'apply-to-selection',
          tokenPath: node.path,
          tokenType: 'composition',
          targetProperty: 'composition',
          resolvedValue: resolveCompositeForApply(node, allTokensFlat),
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
  }, [node, allTokensFlat, selectedNodes, applyWithProperty]);

  const confirmTokenRename = useCallback(() => {
    const newName = renameTokenVal.trim();
    if (!newName) { setRenameTokenError('Name cannot be empty'); return; }
    if (newName === node.name) { setRenamingToken(false); setRenameTokenError(''); return; }
    const parentPath = nodeParentPath(node.path, node.name);
    const newPath = parentPath ? `${parentPath}.${newName}` : newName;
    // Check for conflict: a token already exists at the target path
    if (allTokensFlat[newPath]) { setRenameTokenError(`A token named '${newName}' already exists here`); return; }
    setRenamingToken(false);
    setRenameTokenError('');
    onRenameToken?.(node.path, newPath);
  }, [renameTokenVal, node.name, node.path, allTokensFlat, onRenameToken]);

  const cancelTokenRename = useCallback(() => {
    setRenamingToken(false);
    setRenameTokenError('');
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setQuickGeneratorPopover(null);
    setTokenMoreMenuPos(null);
    setContextMenuPos(clampMenuPosition(e.clientX, e.clientY, 192, 220));
  }, []);

  /**
   * Apply this token to the current Figma selection from the context menu.
   * Uses the same logic as the hover apply button, but anchors the property
   * picker to the node row instead of the button.
   */
  const handleContextMenuApply = useCallback(() => {
    setContextMenuPos(null);
    if (!node.$type) return;

    const rect = nodeRef.current?.getBoundingClientRect();
    const anchorTop = rect ? rect.bottom + 2 : 100;
    const anchorLeft = rect ? rect.left : 0;

    // Composition tokens apply all their sub-properties at once
    if (node.$type === 'composition') {
      parent.postMessage({
        pluginMessage: {
          type: 'apply-to-selection',
          tokenPath: node.path,
          tokenType: 'composition',
          targetProperty: 'composition',
          resolvedValue: resolveCompositeForApply(node, allTokensFlat),
        },
      }, '*');
      return;
    }

    const validProps = TOKEN_PROPERTY_MAP[node.$type];
    if (!validProps || validProps.length === 0) return;

    const entry = allTokensFlat[node.path];
    const targets = getQuickBindTargets(node.$type, entry?.$scopes, selectedNodes);

    if (targets.length === 1) {
      applyWithProperty(targets[0]);
      setQuickBound(PROPERTY_LABELS[targets[0]]);
      setTimeout(() => setQuickBound(null), 1500);
      return;
    }
    if (targets.length > 1 && targets.length < validProps.length) {
      setPickerAnchor({ top: anchorTop, left: anchorLeft });
      setPickerProps(targets);
      setShowPicker(true);
      return;
    }
    if (validProps.length === 1) {
      applyWithProperty(validProps[0]);
    } else {
      setPickerAnchor({ top: anchorTop, left: anchorLeft });
      setPickerProps(null);
      setShowPicker(true);
    }
  }, [node, allTokensFlat, selectedNodes, applyWithProperty]);

  // Activate inline editing for simple types (keyboard or double-click)
  const activateInlineEdit = useCallback(() => {
    if (!canInlineEdit || !node.$type) return;
    if (node.$type === 'color') {
      setPendingColor(typeof node.$value === 'string' ? node.$value : '#000000');
      setColorPickerOpen(true);
    } else {
      setInlineEditValue(getEditableString(node.$type, node.$value));
      setInlineEditError(null);
      setInlineEditActive(true);
      setInlineNudgeVisible(false);
    }
  }, [canInlineEdit, node]);

  const handleRowKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Enter or e: inline edit for simple types, inline popover for complex, full editor otherwise
    if (e.key === 'Enter' || (e.key === 'e' && !e.metaKey && !e.ctrlKey && !e.altKey)) {
      e.preventDefault();
      if (canInlineEdit) {
        activateInlineEdit();
      } else if (canInlinePopover) {
        const rect = nodeRef.current?.getBoundingClientRect();
        if (rect) {
          setInlinePopoverAnchor(rect);
          setInlinePopoverOpen(true);
        }
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

    // Delete or Backspace: delete token (skip in select mode — container handles bulk delete)
    if (!selectMode && (e.key === 'Delete' || matchesShortcut(e, 'TOKEN_DELETE'))) {
      e.preventDefault();
      onDelete(node.path);
      return;
    }

    // Cmd+D / Ctrl+D: duplicate token
    if (matchesShortcut(e, 'TOKEN_DUPLICATE')) {
      e.preventDefault();
      onDuplicateToken?.(node.path);
      return;
    }

    // F2: rename token inline
    if (matchesShortcut(e, 'TOKEN_RENAME')) {
      e.preventDefault();
      setRenameTokenVal(node.name);
      setRenamingToken(true);
      return;
    }

    // V: apply focused token to current Figma selection (same as context menu accelerator)
    if (matchesShortcut(e, 'TOKEN_APPLY_SELECTION')) {
      e.preventDefault();
      handleContextMenuApply();
      return;
    }
  }, [canInlineEdit, canInlinePopover, activateInlineEdit, onEdit, node.path, node.name, selectMode, onToggleSelect, onDelete, onDuplicateToken, handleContextMenuApply]);

  // Memoize quick bind targets for the apply button tooltip
  const quickBindTargets = useMemo(() => {
    if (!node.$type || !selectedNodes || selectedNodes.length === 0) return null;
    const entry = allTokensFlat[node.path];
    return getQuickBindTargets(node.$type, entry?.$scopes, selectedNodes);
  }, [node.$type, node.path, allTokensFlat, selectedNodes]);

  const reorderPos = dragOverReorder?.path === node.path ? dragOverReorder.position : null;

  return (
    <div ref={nodeRef}>
    <div
      className={`relative flex items-center gap-2 px-2 ${pyClass} hover:bg-[var(--color-figma-bg-hover)] transition-colors group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--color-figma-accent)] ${isHighlighted ? 'bg-[var(--color-figma-accent)]/15 ring-1 ring-inset ring-[var(--color-figma-accent)]/40' : ''}`}
      style={{ paddingLeft: `${computePaddingLeft(depth, condensedView, 20)}px` }}
      tabIndex={rovingFocusPath === node.path ? 0 : -1}
      data-token-path={node.path}
      data-node-name={node.name}
      onFocus={() => onRovingFocus(node.path)}
      draggable={!selectMode || isSelected}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-token-drag', 'true');
        let dragPaths: string[];
        let dragNames: string[];
        if (selectMode && isSelected && selectedLeafNodes && selectedLeafNodes.length > 0) {
          dragPaths = selectedLeafNodes.map(n => n.path);
          dragNames = selectedLeafNodes.map(n => n.name);
        } else {
          dragPaths = [node.path];
          dragNames = [node.name];
        }
        if (dragPaths.length > 1) {
          const ghost = document.createElement('div');
          ghost.style.cssText = 'position:fixed;top:-9999px;left:-9999px;display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;background:var(--color-figma-accent,#18a0fb);color:#fff;font-size:11px;font-weight:600;white-space:nowrap;pointer-events:none;';
          ghost.textContent = `${dragPaths.length} tokens`;
          document.body.appendChild(ghost);
          e.dataTransfer.setDragImage(ghost, -8, -8);
          requestAnimationFrame(() => document.body.removeChild(ghost));
        }
        onDragStart?.(dragPaths, dragNames);
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
      <DepthBar depth={depth} />
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
          onChange={() => {}} // controlled; onClick handles logic with modifier support
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(node.path, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
          }}
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
              aria-label={`Edit color: ${displayValue}`}
              className="rounded border border-[var(--color-figma-border)] shrink-0 hover:ring-1 hover:ring-[var(--color-figma-accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)]"
              style={{ backgroundColor: displayValue, width: swatchSize, height: swatchSize }}
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
          <ValuePreview type={node.$type} value={displayValue} size={swatchSize} />
        </button>
      )}

      {/* Name and info — single-click previews (non-select mode), double-click edits */}
      {/* ctrl/cmd-click enters select mode; shift-click range-selects */}
      <div
        title={[
          formatDisplayPath(node.path, node.name),
          node.$type ? `Type: ${node.$type}` : null,
          `Value: ${formatValue(node.$type, displayValue)}`,
          node.$description ? `Description: ${node.$description}` : null,
        ].filter(Boolean).join('\n')}
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
          } else if (canInlinePopover) {
            const rect = nodeRef.current?.getBoundingClientRect();
            if (rect) {
              setInlinePopoverAnchor(rect);
              setInlinePopoverOpen(true);
            }
          } else {
            onEdit(node.path, node.name);
          }
        } : undefined}
        style={selectMode ? { cursor: 'pointer' } : undefined}
      >
        <div className="flex items-center gap-1.5">
          <CondensedAncestorBreadcrumb nodePath={node.path} nodeName={node.name} depth={depth} condensedView={condensedView} />
          {renamingToken ? (
            <div className="flex flex-col gap-0.5 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-1">
                <input
                  ref={renameTokenInputRef}
                  value={renameTokenVal}
                  onChange={e => { setRenameTokenVal(e.target.value); setRenameTokenError(''); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.stopPropagation(); confirmTokenRename(); }
                    if (e.key === 'Escape') { e.stopPropagation(); cancelTokenRename(); }
                  }}
                  aria-label="Rename token"
                  className={`flex-1 text-[11px] text-[var(--color-figma-text)] bg-[var(--color-figma-bg)] border rounded px-1 outline-none min-w-0 focus-visible:border-[var(--color-figma-accent)] ${renameTokenError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
                />
                <button onClick={confirmTokenRename} disabled={!renameTokenVal.trim()} className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 shrink-0">Save</button>
                <button onClick={cancelTokenRename} className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] shrink-0">Cancel</button>
              </div>
              {renameTokenError && <p role="alert" className="text-[10px] text-[var(--color-figma-error)]">{renameTokenError}</p>}
            </div>
          ) : (
            <span className="text-[11px] text-[var(--color-figma-text)] truncate" title={formatDisplayPath(node.path, node.name)}>{highlightMatch(showFullPath ? formatDisplayPath(node.path, node.name) : node.name, searchHighlight?.nameTerms ?? [])}</span>
          )}
          {showExpandedMeta && node.$type && (
            <button
              onClick={e => { e.stopPropagation(); onFilterByType?.(node.$type!); }}
              title={`Filter by type: ${node.$type}`}
              className={`px-1 py-0.5 rounded text-[8px] font-medium ${TOKEN_TYPE_BADGE_CLASS[node.$type ?? ''] ?? 'token-type-string'} cursor-pointer transition-opacity hover:opacity-70 hover:ring-1 hover:ring-current/40`}
            >
              {node.$type}
            </button>
          )}
          {showExpandedMeta && aliasTargetPath && !showResolvedValues && (
            <button
              onClick={handleAliasClick}
              className={`flex items-center gap-0.5 px-0.5 py-0.5 rounded text-[8px] transition-colors ${isBrokenAlias ? 'text-[var(--color-figma-error)] cursor-default' : 'text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-accent)]'}`}
              title={isBrokenAlias ? `Broken reference — ${resolveResult?.error}` : `${aliasTargetPath}\nClick to navigate`}
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
              </svg>
              <span className="max-w-[96px] truncate" title={aliasTargetPath}>{aliasTargetPath}</span>
            </button>
          )}
        </div>
      </div>

      {/* Multi-mode value columns — per-theme-option resolved values */}
      {multiModeValues && multiModeValues.length > 0 && (
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
              isTabPending={pendingTabEdit?.path === node.path && pendingTabEdit?.columnId === mv.optionName}
              onTabActivated={clearPendingTabEdit}
              onTab={(dir) => onTabToNext(node.path, mv.optionName, dir)}
            />
          ))}
        </div>
      )}

      {/* Value text (hidden when multi-mode columns are shown) */}
      {!(multiModeValues && multiModeValues.length > 0) && (canInlineEdit && node.$type === 'boolean' && inlineEditActive ? (
        <div
          ref={booleanInlineEditRef}
          tabIndex={-1}
          className="flex items-center gap-1 shrink-0 rounded border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)] p-0.5"
          onClick={e => e.stopPropagation()}
          onBlur={e => {
            if (inlineEditEscapedRef.current) {
              inlineEditEscapedRef.current = false;
              return;
            }
            if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
            handleInlineSubmit();
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); handleInlineSubmit(); }
            if (e.key === 'Escape') { e.preventDefault(); cancelInlineEdit(); }
            if (e.key === 'Tab') { e.preventDefault(); handleInlineTabToNext(e.shiftKey); }
            e.stopPropagation();
          }}
        >
          <button
            type="button"
            onClick={() => { setInlineEditValue('true'); setInlineEditError(null); }}
            className={`rounded px-1.5 py-0.5 text-[10px] leading-none transition-colors ${inlineEditValue === 'true' ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
            aria-pressed={inlineEditValue === 'true'}
          >
            true
          </button>
          <button
            type="button"
            onClick={() => { setInlineEditValue('false'); setInlineEditError(null); }}
            className={`rounded px-1.5 py-0.5 text-[10px] leading-none transition-colors ${inlineEditValue === 'false' ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
            aria-pressed={inlineEditValue === 'false'}
          >
            false
          </button>
        </div>
      ) : canInlineEdit && node.$type === 'boolean' ? (
        <span
          className="text-[11px] text-[var(--color-figma-text-secondary)] shrink-0 max-w-[96px] truncate"
          title="Double-click to edit"
        >
          {highlightMatch(formatValue(node.$type, displayValue), searchHighlight?.valueTerms ?? [])}
        </span>
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
                setInlineEditError(null);
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
                if (e.key === 'Escape') { e.preventDefault(); cancelInlineEdit(); }
                if (e.key === 'Tab') { e.preventDefault(); handleInlineTabToNext(e.shiftKey); return; }
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
          <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
            <input
              type="text"
              value={inlineEditValue}
              onChange={e => { setInlineEditValue(e.target.value); setInlineEditError(null); }}
              onBlur={() => {
                if (inlineEditEscapedRef.current) { inlineEditEscapedRef.current = false; return; }
                handleInlineSubmit();
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleInlineSubmit(); }
                if (e.key === 'Escape') { e.preventDefault(); cancelInlineEdit(); }
                if (e.key === 'Tab') { e.preventDefault(); handleInlineTabToNext(e.shiftKey); return; }
                e.stopPropagation();
              }}
              aria-label="Token value"
              aria-invalid={inlineEditError ? 'true' : undefined}
              autoFocus
              className={`text-[11px] text-[var(--color-figma-text)] w-[96px] bg-[var(--color-figma-bg)] border rounded px-1 outline-none ${inlineEditError ? 'border-red-400 focus:border-red-400' : 'border-[var(--color-figma-accent)]'}`}
            />
            {inlineEditError && (
              <div role="alert" className="absolute top-full left-0 mt-0.5 z-50 bg-[var(--color-figma-bg)] border border-red-400 rounded px-1.5 py-0.5 text-[10px] text-red-400 whitespace-nowrap shadow-sm pointer-events-none">
                {inlineEditError}
              </div>
            )}
          </div>
        )
      ) : isAlias(node.$value) && !isBrokenAlias && !showResolvedValues ? (
        <span
          className="text-[11px] text-[var(--color-figma-text-secondary)] shrink-0 max-w-[96px] truncate"
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
            setInlineEditError(null);
            setInlineEditActive(true);
            setInlineNudgeVisible(false);
          }}
        >
          {highlightMatch(formatValue(node.$type, displayValue), searchHighlight?.valueTerms ?? [])}
        </span>
      ) : canInlineEdit && node.$type === 'color' ? (
        <span
          className="text-[11px] text-[var(--color-figma-text-secondary)] shrink-0 max-w-[96px] truncate cursor-pointer hover:underline hover:decoration-dotted hover:text-[var(--color-figma-text)]"
          title="Click to edit color"
          onClick={e => {
            e.stopPropagation();
            setPendingColor(typeof node.$value === 'string' ? node.$value : '#000000');
            setColorPickerOpen(true);
          }}
        >
          {highlightMatch(formatValue(node.$type, displayValue), searchHighlight?.valueTerms ?? [])}
        </span>
      ) : (
        <span className="text-[11px] text-[var(--color-figma-text-secondary)] shrink-0 max-w-[96px] truncate" title={formatValue(node.$type, displayValue)}>
          {highlightMatch(formatValue(node.$type, displayValue), searchHighlight?.valueTerms ?? [])}
        </span>
      ))}
      {/* Status indicators — compact dots/badges instead of verbose labels */}
      {(() => {
        const count = duplicateCounts.get(JSON.stringify(node.$value));
        const hasLint = lintViolations.length > 0;
        const worstSeverity = hasLint ? lintViolations.reduce((worst, v) => v.severity === 'error' ? 'error' : worst === 'error' ? 'error' : v.severity === 'warning' ? 'warning' : worst, 'info' as string) : null;
        if (hasLint) {
          return (
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
          );
        }
        if (syncChanged) {
          return <span className="w-2 h-2 rounded-full bg-[var(--color-figma-warning)] shrink-0" title="Changed locally since last sync" />;
        }
        if (count) {
          return <span className="w-2 h-2 rounded-full bg-[var(--color-figma-accent)] shrink-0" title={`${count} tokens share this value`} />;
        }
        return null;
      })()}
      {/* Hover actions — in-flow to avoid overlapping status indicators */}
      {!selectMode && (
        <div className="hidden group-hover:flex group-focus-within:flex items-center gap-0.5 shrink-0 ml-auto">
          {onToggleStar && (
            <button
              onClick={e => { e.stopPropagation(); onToggleStar(node.path); }}
              title={isFavorite ? 'Remove favorite' : 'Add to favorites'}
              aria-label={isFavorite ? 'Remove favorite' : 'Add to favorites'}
              className={`p-1 rounded hover:bg-[var(--color-figma-bg-hover)] ${isFavorite ? 'text-amber-400' : 'text-[var(--color-figma-text-secondary)]'}`}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          )}
          {/* Edit button */}
          <button
            onClick={() => onEdit(node.path, node.name)}
            title="Edit (or double-click row)"
            aria-label="Edit token"
            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            onClick={e => { e.stopPropagation(); handleApplyToSelection(e); }}
            title={quickBound ? `Bound to ${quickBound}` : (() => {
              if (!quickBindTargets) return 'Apply to selection';
              if (quickBindTargets.length === 0) return 'No compatible properties on selection';
              if (quickBindTargets.length === 1) return `Quick bind to ${PROPERTY_LABELS[quickBindTargets[0]]}`;
              return `Apply to ${quickBindTargets.map(t => PROPERTY_LABELS[t]).join(', ')}`;
            })()}
            aria-label={quickBound ? `Bound to ${quickBound}` : 'Apply to selection'}
            className={`p-1 rounded ${quickBound ? 'text-[var(--color-figma-success)]' : 'hover:bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)]'}`}
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
            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
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

      {/* Right-click context menu — organized into labeled sections */}
      {contextMenuPos && (
        <>
          <div
            ref={tokenMenuRef}
            data-context-menu="token"
            role="menu"
            className={`${MENU_SURFACE_CLASS} min-w-[192px]`}
            style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
            onClick={e => e.stopPropagation()}
          >
            <button
              role="menuitem"
              tabIndex={-1}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                closeTokenMenus();
                onEdit(node.path, node.name);
              }}
              className={MENU_ITEM_CLASS}
            >
              <span>Edit</span>
            </button>
            <button
              role="menuitem"
              tabIndex={-1}
              data-accel="r"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                closeTokenMenus();
                setRenameTokenVal(node.name);
                setRenamingToken(true);
              }}
              className={MENU_ITEM_CLASS}
            >
              <span>Rename</span>
              <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">F2</span>
            </button>
            <button
              role="menuitem"
              tabIndex={-1}
              data-accel="delete"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                closeTokenMenus();
                onDelete(node.path);
              }}
              className={MENU_DANGER_ITEM_CLASS}
            >
              <span>Delete</span>
              <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">⌫</span>
            </button>
            <button
              role="menuitem"
              tabIndex={-1}
              data-accel="c"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                handleCopyPath();
                closeTokenMenus();
              }}
              className={MENU_ITEM_CLASS}
            >
              <span>Copy path</span>
              <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">C</span>
            </button>
            {!selectMode && node.$type && (TOKEN_PROPERTY_MAP[node.$type]?.length > 0 || node.$type === 'composition') && selectedNodes.length > 0 && (
              <button
                role="menuitem"
                tabIndex={-1}
                data-accel="v"
                onMouseDown={e => e.preventDefault()}
                onClick={handleContextMenuApply}
                className={MENU_ITEM_CLASS}
              >
                <span>Apply to selection</span>
                {quickBindTargets?.length === 1 && (
                  <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">{PROPERTY_LABELS[quickBindTargets[0]]}</span>
                )}
              </button>
            )}
            <button
              ref={tokenMoreButtonRef}
              role="menuitem"
              tabIndex={-1}
              aria-haspopup="menu"
              aria-expanded={!!tokenMoreMenuPos}
              onMouseDown={e => e.preventDefault()}
              onClick={e => {
                e.stopPropagation();
                if (tokenMoreMenuPos) {
                  closeTokenMoreMenu();
                } else {
                  openTokenMoreMenu(e.currentTarget);
                }
              }}
              className={MENU_ITEM_CLASS}
            >
              <span>More…</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {tokenMoreMenuPos && (
            <div
              ref={tokenMoreMenuRef}
              role="menu"
              aria-label="More token actions"
              className={`${MENU_SURFACE_CLASS} min-w-[212px] max-h-[80vh] overflow-y-auto`}
              style={{ top: tokenMoreMenuPos.y, left: tokenMoreMenuPos.x }}
              onClick={e => e.stopPropagation()}
            >
              {onDuplicateToken && (
                <button
                  role="menuitem"
                  tabIndex={-1}
                  data-accel="d"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    closeTokenMenus();
                    onDuplicateToken(node.path);
                  }}
                  className={MENU_ITEM_CLASS}
                >
                  <span>Duplicate</span>
                  <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">D</span>
                </button>
              )}
              {onRequestMoveToken && (
                <button
                  role="menuitem"
                  tabIndex={-1}
                  data-accel="m"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    closeTokenMenus();
                    onRequestMoveToken(node.path);
                  }}
                  className={MENU_ITEM_CLASS}
                >
                  <span>Move to set</span>
                  <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">M</span>
                </button>
              )}
              {onRequestCopyToken && (
                <button
                  role="menuitem"
                  tabIndex={-1}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    closeTokenMenus();
                    onRequestCopyToken(node.path);
                  }}
                  className={MENU_ITEM_CLASS}
                >
                  <span>Copy to set</span>
                </button>
              )}
              {!isAlias(node.$value) && onExtractToAlias && (
                <button
                  role="menuitem"
                  tabIndex={-1}
                  data-accel="e"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    closeTokenMenus();
                    onExtractToAlias(node.path, node.$type, node.$value);
                  }}
                  className={MENU_ITEM_CLASS}
                >
                  <span>Extract to alias</span>
                  <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">E</span>
                </button>
              )}
              {!isAlias(node.$value) && quickGeneratorType && (
                <button
                  role="menuitem"
                  tabIndex={-1}
                  data-accel="g"
                  onMouseDown={e => e.preventDefault()}
                  onClick={openQuickGenerator}
                  className={MENU_ITEM_CLASS}
                >
                  <span>{getQuickGeneratorActionLabel(quickGeneratorType)}</span>
                  <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">G</span>
                </button>
              )}
              {onCompareAcrossThemes && (
                <button
                  role="menuitem"
                  tabIndex={-1}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    closeTokenMenus();
                    onCompareAcrossThemes(node.path);
                  }}
                  className={MENU_ITEM_CLASS}
                >
                  <span>Compare across themes</span>
                </button>
              )}
              <button
                role="menuitem"
                tabIndex={-1}
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  const refs = getIncomingRefs(node.path, allTokensFlat);
                  const rect = nodeRef.current?.getBoundingClientRect();
                  closeTokenMenus();
                  setRefsPopover({
                    refs,
                    pos: rect
                      ? {
                          x: Math.min(rect.right + 4, window.innerWidth - 244),
                          y: Math.min(rect.top, window.innerHeight - 240),
                        }
                      : { x: 100, y: 100 },
                  });
                }}
                className={MENU_ITEM_CLASS}
              >
                <span>Find references</span>
              </button>
              {onViewTokenHistory && (
                <button
                  role="menuitem"
                  tabIndex={-1}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    closeTokenMenus();
                    onViewTokenHistory(node.path);
                  }}
                  className={MENU_ITEM_CLASS}
                >
                  <span>View history</span>
                </button>
              )}
            </div>
          )}
        </>
      )}

      {quickGeneratorPopover && quickGeneratorType && (
        <QuickGeneratorPopover
          serverUrl={serverUrl}
          position={quickGeneratorPopover.position}
          generatorType={quickGeneratorPopover.type}
          sourceTokenPath={node.path}
          sourceTokenName={node.name}
          sourceTokenType={node.$type}
          sourceTokenValue={node.$value}
          activeSet={setName}
          onClose={() => setQuickGeneratorPopover(null)}
          onCreated={handleQuickGeneratorCreated}
          onOpenAdvanced={handleOpenAdvancedGenerator}
          onPushUndo={onPushUndo}
        />
      )}

      {advancedGeneratorDraft && (
        <TokenGeneratorDialog
          serverUrl={serverUrl}
          sourceTokenPath={node.path}
          sourceTokenName={node.name}
          sourceTokenType={node.$type}
          sourceTokenValue={node.$value}
          allSets={sets}
          activeSet={setName}
          allTokensFlat={allTokensFlat}
          initialDraft={advancedGeneratorDraft}
          pathToSet={pathToSet}
          onClose={() => setAdvancedGeneratorDraft(null)}
          onSaved={() => {
            setAdvancedGeneratorDraft(null);
            onRefresh();
          }}
          onPushUndo={onPushUndo}
        />
      )}

      {/* Inline alias picker popover — opened via "Link to token…" context menu item */}
      {aliasPickerOpen && (
        <div
          className="fixed z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg p-2 w-64"
          style={{ top: aliasPickerPos.y, left: aliasPickerPos.x }}
          onClick={e => e.stopPropagation()}
        >
          <div className="text-[9px] text-[var(--color-figma-text-tertiary)] mb-1.5 uppercase tracking-wide">
            Link <span className="font-mono normal-case text-[var(--color-figma-text)]">{node.name}</span> to…
          </div>
          <div className="relative">
            <input
              autoFocus
              type="text"
              value={aliasQuery}
              onChange={e => setAliasQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') { e.stopPropagation(); setAliasPickerOpen(false); }
              }}
              className="w-full border border-[var(--color-figma-border)] rounded px-2 py-1 text-[11px] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-tertiary)]"
              placeholder="Search tokens…"
            />
            <AliasAutocomplete
              query={aliasQuery}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
              filterType={node.$type}
              onSelect={path => {
                onInlineSave?.(node.path, node.$type || 'color', `{${path}}`);
                setAliasPickerOpen(false);
              }}
              onClose={() => setAliasPickerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Reverse-reference popover — shows tokens that alias this one */}
      {refsPopover && (
        <div
          ref={refsPopoverRef}
          className="fixed z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg w-60 overflow-hidden"
          style={{ top: refsPopover.pos.y, left: refsPopover.pos.x }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-figma-border)]">
            <span className="text-[11px] font-medium text-[var(--color-figma-text)]">
              {refsPopover.refs.length === 0
                ? 'No references'
                : `${refsPopover.refs.length} reference${refsPopover.refs.length !== 1 ? 's' : ''}`}
            </span>
            <button
              onClick={() => setRefsPopover(null)}
              className="p-0.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-tertiary)]"
              aria-label="Close"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          {refsPopover.refs.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-[var(--color-figma-text-tertiary)] text-center">
              No tokens reference this one
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              {refsPopover.refs.map(refPath => {
                const setLabel = pathToSet?.[refPath];
                return (
                  <button
                    key={refPath}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                    onClick={() => {
                      setRefsPopover(null);
                      onNavigateToAlias?.(refPath, node.path);
                    }}
                  >
                    <span className="text-[11px] text-[var(--color-figma-text)] truncate flex-1 min-w-0">{refPath}</span>
                    {setLabel && setLabel !== _setName && (
                      <span className="shrink-0 text-[9px] text-[var(--color-figma-text-tertiary)] px-1 py-px bg-[var(--color-figma-bg-secondary)] rounded">{setLabel}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Inline value popover — for complex types and alias-valued tokens */}
      {inlinePopoverOpen && inlinePopoverAnchor && node.$type && (
        <InlineValuePopover
          tokenPath={node.path}
          tokenName={node.name}
          tokenType={node.$type}
          currentValue={node.$value}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          anchorRect={inlinePopoverAnchor}
          onSave={(newVal) => {
            onInlineSave?.(node.path, node.$type!, newVal);
            setInlinePopoverOpen(false);
          }}
          onOpenFullEditor={() => {
            setInlinePopoverOpen(false);
            onEdit(node.path, node.name);
          }}
          onClose={() => setInlinePopoverOpen(false)}
        />
      )}

      {/* Complex type hover preview card */}
      {hoverPreviewVisible && node.$type && !isBrokenAlias && (
        <ComplexTypePreviewCard type={node.$type} value={displayValue} />
      )}

      {/* Quick-info tooltip — shows type, resolved value, and description for tokens without an alias chain */}
      {hoverInfoVisible && (node.$type || node.$description) && (
        <div className="absolute left-4 right-4 bottom-full z-20" style={{ marginBottom: '-2px' }}>
          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded shadow-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[10px] text-[var(--color-figma-text-secondary)] whitespace-nowrap max-w-full overflow-hidden">
            {node.$type && (
              <span className="px-1 py-px rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)] font-mono text-[9px] shrink-0">{node.$type}</span>
            )}
            {node.$type && (
              <span className="font-mono text-[var(--color-figma-text)]">{formatValue(node.$type, displayValue)}</span>
            )}
            {node.$description && (
              <>
                {node.$type && <span className="text-[var(--color-figma-border)] shrink-0">—</span>}
                <span className="text-[var(--color-figma-text-secondary)] truncate max-w-[200px]">{node.$description}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Alias resolution chain tooltip — visible on row hover */}
      {hovered && resolutionSteps && resolutionSteps.length >= 2 && !isBrokenAlias && (
        <div className="absolute left-4 right-4 bottom-full z-20" style={{ marginBottom: '-2px' }}>
          <div className="inline-flex items-center gap-1 px-2 py-1 rounded shadow-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[10px] font-mono text-[var(--color-figma-text-secondary)] whitespace-nowrap max-w-full overflow-hidden">
            {resolutionSteps.map((step, i) => {
              const isLast = i === resolutionSteps.length - 1;
              const isConcrete = isLast && !step.isError && step.value != null && !isAlias(step.value);
              return (
                <Fragment key={i}>
                  {i > 0 && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="shrink-0 text-[var(--color-figma-text-tertiary)]" aria-hidden="true"><path d="M1 4h6M4 1l3 3-3 3"/></svg>
                  )}
                  {i === 0 ? (
                    <span className="text-[var(--color-figma-accent)]">{step.path}</span>
                  ) : isConcrete ? (
                    <span className="text-[var(--color-figma-text)] font-medium">{formatValue(step.$type, step.value)}</span>
                  ) : (
                    <button
                      className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:underline cursor-pointer transition-colors"
                      onClick={() => onNavigateToAlias?.(step.path, node.path)}
                      title={`Navigate to ${step.path}`}
                    >{step.path}</button>
                  )}
                  {step.isThemed && (
                    <span className="text-[8px] px-0.5 text-[var(--color-figma-accent)] font-sans not-italic">
                      {step.themeOption}
                    </span>
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>

    {/* Inline nudge — shown after saving a raw value that closely matches an existing token */}
    {inlineNudgeVisible && nearbyMatches.length > 0 && (
      <div
        className="flex items-center border-t border-[var(--color-figma-border)]"
        style={{ paddingLeft: `${computePaddingLeft(depth, condensedView, 12)}px` }}
      >
        <TokenNudge
          matches={nearbyMatches}
          tokenType={node.$type || ''}
          onAccept={(path) => {
            setInlineNudgeVisible(false);
            onInlineSave?.(node.path, node.$type!, `{${path}}`);
          }}
          onDismiss={() => setInlineNudgeVisible(false)}
        />
      </div>
    )}

    {/* Resolution chain debugger — shows full alias/theme resolution pipeline */}
    {resolutionSteps && resolutionSteps.length >= 2 && chainExpanded && (
      <div
        className="flex flex-col bg-[var(--color-figma-bg-secondary)] border-t border-[var(--color-figma-border)]"
        style={{ paddingLeft: `${computePaddingLeft(depth, condensedView, 12)}px` }}
      >
        {resolutionSteps.map((step, i) => {
          const isFirst = i === 0;
          const isLast = i === resolutionSteps.length - 1;
          const isConcrete = isLast && !step.isError;
          return (
            <div key={step.path + i} className="flex items-center gap-1 py-0.5 px-2 min-h-[18px]">
              {/* Step connector */}
              <div className="flex items-center gap-0.5 shrink-0 w-3 justify-center">
                {isFirst ? (
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-figma-accent)]" />
                ) : (
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[var(--color-figma-text-tertiary)]" aria-hidden="true"><path d="M4 0v4M1 4l3 4 3-4"/></svg>
                )}
              </div>

              {/* Token path — clickable to navigate */}
              {!isFirst ? (
                <button
                  className={`text-[10px] font-mono shrink-0 transition-colors ${step.isError ? 'text-[var(--color-figma-error)]' : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:underline'}`}
                  onClick={() => !step.isError && onNavigateToAlias?.(step.path, node.path)}
                  title={step.isError ? step.errorMsg : `Navigate to ${step.path}`}
                >
                  {step.path}
                </button>
              ) : (
                <span className="text-[10px] font-mono text-[var(--color-figma-accent)] shrink-0">{step.path}</span>
              )}

              {/* Set name pill */}
              {step.setName && (
                <span className="text-[8px] px-1 py-px rounded bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-tertiary)] shrink-0 font-medium">{step.setName}</span>
              )}

              {/* Theme dimension:option pill */}
              {step.isThemed && step.themeDimension && step.themeOption && (
                <span className="text-[8px] px-1 py-px rounded bg-[var(--color-figma-accent-bg,rgba(24,119,232,0.1))] text-[var(--color-figma-accent)] shrink-0 font-medium">
                  {step.themeDimension}:{step.themeOption}
                </span>
              )}

              {/* Concrete resolved value on the last step */}
              {isConcrete && step.value != null && !isAlias(step.value) && (
                <span className="flex items-center gap-1 ml-auto shrink-0">
                  <ValuePreview type={step.$type} value={step.value} size={12} />
                  <span className="text-[10px] font-mono text-[var(--color-figma-text)] font-medium">{formatValue(step.$type, step.value)}</span>
                </span>
              )}

              {/* Error indicator */}
              {step.isError && (
                <span className="text-[8px] text-[var(--color-figma-error)] italic">{step.errorMsg}</span>
              )}
            </div>
          );
        })}
      </div>
    )}
    </div>
  );
}, (prev, next) => {
  return (
    prev.node === next.node &&
    prev.isSelected === next.isSelected &&
    prev.lintViolations === next.lintViolations &&
    prev.multiModeValues === next.multiModeValues &&
    prev.isPinned === next.isPinned &&
    prev.chainExpanded === next.chainExpanded &&
    prev.depth === next.depth
  );
});

// ---------------------------------------------------------------------------
// TokenTreeNode — thin dispatcher; delegates to TokenGroupNode or TokenLeafNode
// ---------------------------------------------------------------------------
export function TokenTreeNode(props: TokenTreeNodeProps) {
  if (props.node.isGroup) return <TokenGroupNode {...props} />;
  return <TokenLeafNode {...props} />;
}

export default TokenTreeNode;
