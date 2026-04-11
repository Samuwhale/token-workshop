import { useState, useCallback, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { Spinner } from './Spinner';
import type { TokenNode } from '../hooks/useTokens';
import { isAlias, extractAliasPath, resolveTokenValue, resolveAllAliases } from '../../shared/resolveAlias';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import type { NodeCapabilities, TokenMapEntry } from '../../shared/types';
import { BatchEditor } from './BatchEditor';
import { stableStringify, getErrorMessage } from '../shared/utils';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { STORAGE_KEY, STORAGE_KEYS, lsGet, lsRemove, lsSet } from '../shared/storage';
import { useSettingsListener, type PreferredCopyFormat } from './SettingsPanel';
import type { SortOrder } from './tokenListUtils';
import {
  formatDisplayPath, nodeParentPath, flattenVisible,
  pruneDeletedPaths,
  sortTokenNodes, collectAllGroupPaths,
  flattenLeafNodes, findGroupByPath,
  buildZoomBreadcrumb,
  QUERY_QUALIFIERS,
  replaceQueryToken,
} from './tokenListUtils';
import type { TokenGenerator } from '../hooks/useGenerators';
import type { LintViolation } from '../hooks/useLint';
import type { TokenListProps, MultiModeValue, Density, AffectedRef, GeneratorImpact, ThemeImpact } from './tokenListTypes';
import { VIRTUAL_OVERSCAN, DENSITY_ROW_HEIGHT } from './tokenListTypes';
import { validateJsonRefs, inferTypeFromValue, highlightMatch } from './tokenListHelpers';
import { ValuePreview } from './ValuePreview';
import { TokenTreeNode } from './TokenTreeNode';
import { TokenTreeProvider } from './TokenTreeContext';
import type { TokenTreeContextType } from './tokenListTypes';
import { TokenListModals } from './TokenListModals';
import { TokenListModalsProvider } from './TokenListModalsContext';
import type { TokenListModalsState } from './TokenListModalsContext';
import { useExtractToAlias } from '../hooks/useExtractToAlias';
import { matchesShortcut } from '../shared/shortcutRegistry';
import { useTokenCreate } from '../hooks/useTokenCreate';
import { useTableCreate } from '../hooks/useTableCreate';
import { useFindReplace } from '../hooks/useFindReplace';
import { useDragDrop } from '../hooks/useDragDrop';
import { useGroupOperations } from '../hooks/useGroupOperations';
import { useTokenPromotion } from '../hooks/useTokenPromotion';
import { useTokenCrud } from '../hooks/useTokenCrud';
import { useFigmaMessage } from '../hooks/useFigmaMessage';
import { extractSyncApplyResult } from '../hooks/useTokenSyncBase';
import { useTokenWhereIs } from '../hooks/useTokenWhereIs';
import { useTokenExpansion } from '../hooks/useTokenExpansion';
import { useTokenVirtualScroll } from '../hooks/useTokenVirtualScroll';
import { useTokenSearch } from '../hooks/useTokenSearch';
import { useTokenSelection } from '../hooks/useTokenSelection';
import { dispatchToast } from '../shared/toastBus';
import { NoticeBanner, NoticeFieldMessage } from '../shared/noticeSystem';
import { TokenSearchFilterBuilder } from './TokenSearchFilterBuilder';
import type { FilterBuilderSection } from './TokenSearchFilterBuilder';
import { getStartHereBranchCopy, TOKENS_START_HERE_BRANCHES } from './WelcomePrompt';

const TOKEN_TYPE_COLORS: Record<string, string> = {
  color:      '#e85d4a',
  dimension:  '#4a9ee8',
  spacing:    '#5bc4a0',
  typography: '#a77de8',
  fontFamily: '#c47de8',
  fontSize:   '#e8a77d',
  fontWeight: '#7de8c4',
  lineHeight: '#e8c47d',
  number:     '#7db8e8',
  string:     '#aae87d',
  shadow:     '#e87dc4',
  border:     '#e8e07d',
};
const TOKEN_TYPE_COLOR_FALLBACK = '#8888aa';
const EMPTY_LINT_VIOLATIONS: LintViolation[] = [];
const EMPTY_PATH_SET = new Set<string>();
const VALID_SORT_ORDERS: SortOrder[] = ['default', 'alpha-asc', 'by-type'];
const TOKENS_LIBRARY_BODY_SURFACE = 'library-body';
const TOKENS_LIBRARY_SPLIT_PREVIEW_LABEL = 'Split preview';

type BulkEditScope = {
  source: 'current-scope' | 'saved-preset';
  title: string;
  detail: string;
};

type PendingBulkPresetLaunch = {
  presetId: string;
  presetName: string;
  query: string;
};

type BatchEditorFocusTarget = 'find-path';

type RelocateTokenReviewMode = 'move' | 'copy';

function dispatchTokenListViewChanged(setName: string): void {
  window.dispatchEvent(new CustomEvent('tm-token-list-view-changed', { detail: { setName } }));
}

function ContextualReviewPanel({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
      <div className="flex items-start justify-between gap-3 px-3 py-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">{title}</div>
          <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
            {description}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
        >
          Close
        </button>
      </div>
      <div className="px-3 pb-3">
        {children}
      </div>
      {footer ? (
        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

function VariableDiffReviewPanel({
  pending,
  onApply,
  onClose,
}: {
  pending: { added: number; modified: number; unchanged: number; flat: any[] };
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <ContextualReviewPanel
      title="Apply as Figma Variables"
      description="Review the variable sync impact before pushing the current token scope into Figma."
      onClose={onClose}
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            className="rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-[10px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)]"
          >
            Apply
          </button>
        </>
      )}
    >
      <div className="space-y-2 text-[10px] text-[var(--color-figma-text-secondary)]">
        <p>{pending.flat.length} token{pending.flat.length !== 1 ? 's' : ''} will be pushed to Figma.</p>
        <div className="overflow-hidden rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          {pending.added > 0 && (
            <div className="flex items-center gap-2 border-b border-[var(--color-figma-border)] px-2 py-1.5 last:border-b-0">
              <span className="font-medium text-[var(--color-figma-success)]">+{pending.added}</span>
              <span>new variable{pending.added !== 1 ? 's' : ''} will be created</span>
            </div>
          )}
          {pending.modified > 0 && (
            <div className="flex items-center gap-2 border-b border-[var(--color-figma-border)] px-2 py-1.5 last:border-b-0">
              <span className="font-medium text-yellow-600">~{pending.modified}</span>
              <span>existing variable{pending.modified !== 1 ? 's' : ''} will be updated</span>
            </div>
          )}
          {pending.unchanged > 0 && (
            <div className="flex items-center gap-2 px-2 py-1.5 text-[var(--color-figma-text-tertiary)]">
              <span>{pending.unchanged} unchanged</span>
            </div>
          )}
        </div>
      </div>
    </ContextualReviewPanel>
  );
}

function PromoteReviewPanel({
  rows,
  busy,
  onRowsChange,
  onConfirm,
  onClose,
}: {
  rows: PromoteRow[];
  busy: boolean;
  onRowsChange: (rows: PromoteRow[] | null) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const acceptedCount = rows.filter(row => row.accepted && row.proposedAlias).length;

  return (
    <ContextualReviewPanel
      title="Link to tokens"
      description="Review each proposed alias before replacing raw values with references."
      onClose={onClose}
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || acceptedCount === 0}
            className="rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-[10px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
          >
            {busy ? 'Converting…' : `Convert ${acceptedCount}`}
          </button>
        </>
      )}
    >
      {rows.length === 0 ? (
        <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-[10px] italic text-[var(--color-figma-text-secondary)]">
          No raw-value tokens were available for alias promotion.
        </div>
      ) : (
        <div className="max-h-[300px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          {rows.map((row, index) => (
            <div
              key={row.path}
              className={`flex items-start gap-2 border-b border-[var(--color-figma-border)] px-3 py-2 last:border-b-0 ${row.proposedAlias ? '' : 'opacity-50'}`}
            >
              <input
                type="checkbox"
                checked={row.accepted && row.proposedAlias !== null}
                disabled={row.proposedAlias === null}
                onChange={(event) => {
                  onRowsChange(rows.map((candidate, candidateIndex) => (
                    candidateIndex === index
                      ? { ...candidate, accepted: event.target.checked }
                      : candidate
                  )));
                }}
                aria-label={`Promote ${row.path} to alias`}
                className="mt-0.5 shrink-0 accent-[var(--color-figma-accent)]"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <ValuePreview type={row.$type} value={row.$value} />
                  <span className="truncate font-mono text-[10px] text-[var(--color-figma-text)]">{row.path}</span>
                </div>
                {row.proposedAlias ? (
                  <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                    → <span className="font-mono text-[var(--color-figma-accent)]">{`{${row.proposedAlias}}`}</span>
                    {row.$type === 'color' && row.deltaE !== undefined && (
                      <span
                        className="ml-1 opacity-60"
                        title={`ΔE=${row.deltaE.toFixed(2)} — lower is a closer color match`}
                      >
                        {row.deltaE < 1 ? 'Exact' : row.deltaE < 5 ? 'Close' : 'Approximate'}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 text-[10px] italic text-[var(--color-figma-text-secondary)]">
                    No matching primitive found
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </ContextualReviewPanel>
  );
}

function RelocateTokenReviewPanel({
  mode,
  tokenPath,
  setName,
  sets,
  targetSet,
  onTargetSetChange,
  conflict,
  conflictAction,
  onConflictActionChange,
  conflictNewPath,
  onConflictNewPathChange,
  sourceToken,
  onConfirm,
  onClose,
}: {
  mode: RelocateTokenReviewMode;
  tokenPath: string;
  setName: string;
  sets: string[];
  targetSet: string;
  onTargetSetChange: (value: string) => void;
  conflict: TokenMapEntry | null;
  conflictAction: 'overwrite' | 'skip' | 'rename';
  onConflictActionChange: (value: 'overwrite' | 'skip' | 'rename') => void;
  conflictNewPath: string;
  onConflictNewPathChange: (value: string) => void;
  sourceToken: TokenMapEntry | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const isMove = mode === 'move';
  const confirmLabel = conflict && conflictAction === 'skip'
    ? 'Skip'
    : (isMove ? 'Move' : 'Copy');

  return (
    <ContextualReviewPanel
      title={`${isMove ? 'Move' : 'Copy'} token to set`}
      description={`Review the destination for ${tokenPath} before ${isMove ? 'removing it from' : 'duplicating it out of'} ${setName}.`}
      onClose={onClose}
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!targetSet || (conflictAction === 'rename' && !conflictNewPath.trim())}
            className="rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-[10px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </>
      )}
    >
      <div className="space-y-3">
        <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-2">
          <div className="text-[9px] uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">Token</div>
          <div className="mt-1 truncate font-mono text-[10px] text-[var(--color-figma-text)]" title={tokenPath}>
            {tokenPath}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Destination set</label>
          <select
            value={targetSet}
            onChange={(event) => onTargetSetChange(event.target.value)}
            className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
          >
            {sets.filter((candidateSet) => candidateSet !== setName).map((candidateSet) => (
              <option key={candidateSet} value={candidateSet}>{candidateSet}</option>
            ))}
          </select>
        </div>

        {conflict ? (
          <div className="space-y-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2">
            <NoticeFieldMessage severity="warning" className="font-medium">
              Conflict: a token already exists at this path in {targetSet}
            </NoticeFieldMessage>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <div className="text-[var(--color-figma-text-secondary)]">Existing</div>
                <div className="mt-1">
                  <ValuePreview value={conflict.$value} type={conflict.$type} />
                </div>
              </div>
              <div>
                <div className="text-[var(--color-figma-text-secondary)]">Incoming</div>
                <div className="mt-1">
                  {sourceToken ? (
                    <ValuePreview value={sourceToken.$value} type={sourceToken.$type} />
                  ) : (
                    <span className="text-[var(--color-figma-text-secondary)]">—</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-1">
              {(['overwrite', 'skip', 'rename'] as const).map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => onConflictActionChange(action)}
                  className={`flex-1 rounded border px-2 py-1 text-[10px] font-medium transition-colors ${
                    conflictAction === action
                      ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)] text-white'
                      : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                  }`}
                >
                  {action.charAt(0).toUpperCase() + action.slice(1)}
                </button>
              ))}
            </div>
            {conflictAction === 'rename' ? (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)]">New path in target set</label>
                <input
                  type="text"
                  value={conflictNewPath}
                  onChange={(event) => onConflictNewPathChange(event.target.value)}
                  placeholder="e.g. color.primary.new"
                  className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </ContextualReviewPanel>
  );
}

export function TokenList({
  ctx: { setName, sets, serverUrl, connected, selectedNodes },
  data: { tokens, allTokensFlat, lintViolations = [], syncSnapshot, generators, generatorsByTargetGroup, derivedTokenPaths, cascadeDiff, tokenUsageCounts, perSetFlat, collectionMap = {}, modeMap = {}, dimensions = [], unthemedAllTokensFlat, pathToSet = {}, activeThemes = {} },
  actions: { onEdit, onPreview, onCreateNew, onRefresh, onPushUndo, onTokenCreated, onNavigateToAlias, onNavigateBack, navHistoryLength, onClearHighlight, onSyncGroup, onSyncGroupStyles, onSetGroupScopes, onGenerateScaleFromGroup, onRefreshGenerators, onToggleIssuesOnly, onFilteredCountChange, onNavigateToSet, onTokenTouched, onToggleStar, starredPaths, onError, onViewTokenHistory, onEditGenerator, onNavigateToGenerator, onShowReferences, onDisplayedLeafNodesChange, onSelectionChange, onOpenCompare, onOpenCrossThemeCompare, onOpenCommandPaletteWithQuery, onTokenDragStart, onTokenDragEnd, onOpenStartHere, onTogglePreviewSplit },
  recentlyTouched,
  defaultCreateOpen: _defaultCreateOpen,
  highlightedToken,
  showIssuesOnly,
  showPreviewSplit = false,
  editingTokenPath,
  compareHandle,
}: TokenListProps) {
  const librarySurfaceSlot = TOKENS_LIBRARY_BODY_SURFACE;
  // Token create state is managed by useTokenCreate hook (called below after dependencies)
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ type: 'variables' | 'styles'; count: number } | null>(null);
  const [varDiffPending, setVarDiffPending] = useState<{ added: number; modified: number; unchanged: number; flat: any[] } | null>(null);
  const [varDiffLoading, setVarDiffLoading] = useState(false);
  // Loading indicator for async token operations (delete, rename, move, duplicate, reorder, etc.)
  const [operationLoading, setOperationLoading] = useState<string | null>(null);
  const [locallyDeletedPaths, setLocallyDeletedPaths] = useState<Set<string>>(new Set());
  // selectMode/selectedPaths/showBatchEditor/lastSelectedPathRef managed by useTokenSelection (called below)
  const varReadPendingRef = useRef<Map<string, (tokens: any[]) => void>>(new Map());
  // Drag/drop state is managed by useDragDrop hook (called below after dependencies)
  // Find/replace state is managed by useFindReplace hook (called below after dependencies)
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [copyCssFeedback, setCopyCssFeedback] = useState(false);
  const [copyPreferredFeedback, setCopyPreferredFeedback] = useState(false);
  const [copyAliasFeedback, setCopyAliasFeedback] = useState(false);
  const [showMoveToGroup, setShowMoveToGroup] = useState(false);
  const [moveToGroupTarget, setMoveToGroupTarget] = useState('');
  const [moveToGroupError, setMoveToGroupError] = useState('');
  const [showBatchMoveToSet, setShowBatchMoveToSet] = useState(false);
  const [batchMoveToSetTarget, setBatchMoveToSetTarget] = useState('');
  const [showBatchCopyToSet, setShowBatchCopyToSet] = useState(false);
  const [batchCopyToSetTarget, setBatchCopyToSetTarget] = useState('');
  const [showRecentlyTouched, setShowRecentlyTouched] = useState(false);
  const [runningStaleGenerators, setRunningStaleGenerators] = useState(false);
  const [filterBuilderOpen, setFilterBuilderOpen] = useState(false);
  const [activeFilterBuilderSection, setActiveFilterBuilderSection] = useState<FilterBuilderSection | null>(null);
  const [bulkWorkflowOpen, setBulkWorkflowOpen] = useState(false);
  const [activeBulkEditScope, setActiveBulkEditScope] = useState<BulkEditScope | null>(null);
  const [pendingBulkPresetLaunch, setPendingBulkPresetLaunch] = useState<PendingBulkPresetLaunch | null>(null);
  const [pendingBatchEditorFocus, setPendingBatchEditorFocus] = useState<BatchEditorFocusTarget | null>(null);
  const sendStyleApply = useFigmaMessage<{ count: number; total: number; failures: { path: string; error: string }[] }>({
    responseType: 'styles-applied',
    errorType: 'styles-apply-error',
    timeout: 15000,
    extractResponse: extractSyncApplyResult,
  });
  const [showResolvedValues, setShowResolvedValuesState] = useState(false);
  const [zoomRootPath, setZoomRootPath] = useState<string | null>(null);
  const [statsBarOpen, setStatsBarOpenState] = useState(() => lsGet(STORAGE_KEYS.TOKEN_STATS_BAR_OPEN) === 'true');
  // Roving tabindex: tracks which row path currently has tabIndex=0
  const [rovingFocusPath, setRovingFocusPath] = useState<string | null>(null);

  // Track editor saves: highlightedToken is set to saved path after TokenEditor save
  const prevHighlightRef = useRef<string | null>(null);
  useEffect(() => {
    if (highlightedToken && highlightedToken !== prevHighlightRef.current) {
      recentlyTouched.recordTouch(highlightedToken);
      onTokenTouched?.(highlightedToken);
    }
    prevHighlightRef.current = highlightedToken ?? null;
  }, [highlightedToken, recentlyTouched, onTokenTouched]);

  const generatorsBySource = useMemo(() => {
    const map = new Map<string, TokenGenerator[]>();
    for (const gen of generators ?? []) {
      if (!gen.sourceToken) continue;
      const arr = map.get(gen.sourceToken) ?? [];
      arr.push(gen);
      map.set(gen.sourceToken, arr);
    }
    return map;
  }, [generators]);

  const staleGeneratorsForSet = useMemo(
    () => (generators ?? []).filter(generator => generator.targetSet === setName && generator.isStale === true),
    [generators, setName],
  );

  const staleGeneratorBannerStorageKey = useMemo(
    () => STORAGE_KEY.staleGeneratorBannerDismissed(setName),
    [setName],
  );

  const staleGeneratorSignature = useMemo(() => (
    stableStringify(staleGeneratorsForSet.map(generator => ({
      id: generator.id,
      sourceToken: generator.sourceToken ?? null,
      currentSourceValue: generator.sourceToken ? (allTokensFlat[generator.sourceToken]?.$value ?? null) : null,
      lastRunAt: generator.lastRunAt ?? null,
      lastRunSourceValue: generator.lastRunSourceValue ?? null,
    })))
  ), [staleGeneratorsForSet, allTokensFlat]);

  const [dismissedStaleGeneratorSignature, setDismissedStaleGeneratorSignature] = useState<string | null>(
    () => lsGet(STORAGE_KEY.staleGeneratorBannerDismissed(setName)),
  );

  // Expand/collapse state managed by useTokenExpansion (called below)
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);
  const viewOptionsRef = useRef<HTMLDivElement>(null);
  const bulkWorkflowRef = useRef<HTMLDivElement>(null);
  const batchEditorPanelRef = useRef<HTMLDivElement>(null);
  const virtualListRef = useRef<HTMLDivElement>(null);
  // Refs for values defined later in the component, used inside handleListKeyDown to avoid TDZ
  const displayedLeafNodesRef = useRef<TokenNode[]>([]);
  const copyTokensAsJsonRef = useRef<(nodes: TokenNode[]) => void>(() => {});
  const copyTokensAsCssVarRef = useRef<(nodes: TokenNode[]) => void>(() => {});
  const copyTokensAsPreferredRef = useRef<(nodes: TokenNode[]) => void>(() => {});
  const copyTokensAsDtcgRefRef = useRef<(nodes: TokenNode[]) => void>(() => {});

  // Bridging refs — created here so they can be passed to both useTokenSearch and useTokenVirtualScroll
  // useTokenVirtualScroll assigns flatItemsRef.current and itemOffsetsRef.current after its memos
  const virtualScrollTopRef = useRef(0);
  const flatItemsRef = useRef<Array<{ node: { path: string } }>>([]);
  const itemOffsetsRef = useRef<number[]>([0]);
  const scrollAnchorPathRef = useRef<string | null>(null);
  const isFilterChangeRef = useRef(false);

  // Ref-based clearSelection and selectedPaths — defined here so they're available before useTokenSelection is called.
  // useTokenCrud and useTokenPromotion are called before useTokenSelection, so we use ref-based proxies.
  const clearSelectionRef = useRef<() => void>(() => {});
  const clearSelection = useCallback(() => clearSelectionRef.current(), []);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data?.pluginMessage;
      if (msg?.type === 'variables-read' && msg.correlationId) {
        const resolve = varReadPendingRef.current.get(msg.correlationId);
        if (resolve) {
          varReadPendingRef.current.delete(msg.correlationId);
          resolve(msg.tokens ?? []);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // handleListKeyDown is defined after custom hook calls (below) to avoid TDZ issues

  useEffect(() => {
    if (!viewOptionsOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (viewOptionsRef.current && !viewOptionsRef.current.contains(e.target as Node)) {
        setViewOptionsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewOptionsOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [viewOptionsOpen]);

  useEffect(() => {
    if (!bulkWorkflowOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (bulkWorkflowRef.current && !bulkWorkflowRef.current.contains(e.target as Node)) {
        setBulkWorkflowOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBulkWorkflowOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [bulkWorkflowOpen]);

  // Sort order — persisted in localStorage per-set so each set remembers its own order
  const [sortOrder, setSortOrderState] = useState<SortOrder>('default');

  useEffect(() => {
    const stored = lsGet(STORAGE_KEY.tokenSort(setName));
    setSortOrderState(VALID_SORT_ORDERS.includes(stored as SortOrder) ? stored as SortOrder : 'default');
  }, [setName]);

  useEffect(() => {
    setDismissedStaleGeneratorSignature(lsGet(staleGeneratorBannerStorageKey));
  }, [staleGeneratorBannerStorageKey]);

  useEffect(() => {
    if (staleGeneratorsForSet.length === 0) {
      if (dismissedStaleGeneratorSignature !== null) {
        setDismissedStaleGeneratorSignature(null);
        lsRemove(staleGeneratorBannerStorageKey);
      }
      return;
    }
    if (
      dismissedStaleGeneratorSignature !== null &&
      dismissedStaleGeneratorSignature !== staleGeneratorSignature
    ) {
      setDismissedStaleGeneratorSignature(null);
      lsRemove(staleGeneratorBannerStorageKey);
    }
  }, [
    dismissedStaleGeneratorSignature,
    staleGeneratorBannerStorageKey,
    staleGeneratorSignature,
    staleGeneratorsForSet.length,
  ]);

  const setSortOrder = useCallback((order: SortOrder) => {
    setSortOrderState(order);
    lsSet(STORAGE_KEY.tokenSort(setName), order);
  }, [setName]);

  const setShowResolvedValues = useCallback((value: boolean | ((current: boolean) => boolean)) => {
    setShowResolvedValuesState(current => {
      const next = typeof value === 'function' ? value(current) : value;
      lsSet(STORAGE_KEY.tokenShowResolvedValues(setName), next ? '1' : '0');
      dispatchTokenListViewChanged(setName);
      return next;
    });
  }, [setName]);

  const setStatsBarOpen = useCallback((value: boolean | ((current: boolean) => boolean)) => {
    setStatsBarOpenState(current => {
      const next = typeof value === 'function' ? value(current) : value;
      lsSet(STORAGE_KEYS.TOKEN_STATS_BAR_OPEN, next ? 'true' : 'false');
      dispatchTokenListViewChanged(setName);
      return next;
    });
  }, [setName]);

  // Clear optimistic deletions when the server response arrives with fresh tokens
  useEffect(() => { setLocallyDeletedPaths(new Set()); }, [tokens]);

  const sortedTokens = useMemo(() => {
    const sorted = sortTokenNodes(tokens, sortOrder);
    return locallyDeletedPaths.size > 0 ? pruneDeletedPaths(sorted, locallyDeletedPaths) : sorted;
  }, [tokens, sortOrder, locallyDeletedPaths]);

  // Search/filter state managed by useTokenSearch (called below after sortedTokens/lintPaths are available)

  // Compute the set of token paths that are "unused": zero Figma usage AND not referenced by any other token as an alias
  const unusedTokenPaths = useMemo<Set<string> | undefined>(() => {
    if (!tokenUsageCounts || Object.keys(tokenUsageCounts).length === 0) return undefined;
    // Collect all alias target paths from allTokensFlat
    const referencedPaths = new Set<string>();
    const collectRefs = (value: unknown) => {
      if (typeof value === 'string') {
        const m = value.match(/^\{([^}]+)\}$/);
        if (m) referencedPaths.add(m[1]);
      } else if (Array.isArray(value)) {
        for (const item of value) collectRefs(item);
      } else if (value && typeof value === 'object') {
        for (const v of Object.values(value as Record<string, unknown>)) collectRefs(v);
      }
    };
    for (const entry of Object.values(allTokensFlat)) collectRefs(entry.$value);
    // Tokens with 0 Figma usage count AND not referenced by another token
    const paths = new Set<string>();
    for (const path of Object.keys(allTokensFlat)) {
      if ((tokenUsageCounts[path] ?? 0) === 0 && !referencedPaths.has(path)) {
        paths.add(path);
      }
    }
    return paths.size > 0 ? paths : undefined;
  }, [tokenUsageCounts, allTokensFlat]);

  // Stats computed from allTokensFlat (cross-set) and perSetFlat for the stats bar
  const statsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of Object.values(allTokensFlat)) {
      const t = entry.$type || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allTokensFlat]);

  const statsTotalTokens = useMemo(() => Object.keys(allTokensFlat).length, [allTokensFlat]);

  const statsSetTotals = useMemo(() => {
    if (!perSetFlat) return [];
    return Object.entries(perSetFlat)
      .map(([name, flat]) => ({ name, total: Object.keys(flat).length }))
      .sort((a, b) => b.total - a.total);
  }, [perSetFlat]);

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

  // promotableDuplicateCount computed after useTokenSearch hook call (below)

  // Inspect mode — show only tokens bound to selected layers
  const [inspectMode, setInspectMode] = useState(false);
  const [viewMode, setViewModeState] = useState<'tree' | 'json'>('tree');

  useEffect(() => {
    const stored = lsGet(STORAGE_KEY.tokenViewMode(setName));
    setViewModeState(stored === 'json' ? 'json' : 'tree');
  }, [setName]);

  const setViewMode = useCallback((mode: 'tree' | 'json') => {
    setViewModeState(mode);
    lsSet(STORAGE_KEY.tokenViewMode(setName), mode);
    dispatchTokenListViewChanged(setName);
  }, [setName]);
  const [density, setDensityState] = useState<Density>(() => {
    const stored = lsGet(STORAGE_KEYS.DENSITY);
    return stored === 'compact' ? 'compact' : 'comfortable';
  });
  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    lsSet(STORAGE_KEYS.DENSITY, d);
  }, []);
  // Sync density when changed from Settings panel
  const densityRev = useSettingsListener(STORAGE_KEYS.DENSITY);
  useEffect(() => {
    if (densityRev === 0) return;
    const stored = lsGet(STORAGE_KEYS.DENSITY);
    setDensityState(stored === 'compact' ? 'compact' : 'comfortable');
  }, [densityRev]);
  const rowHeight = DENSITY_ROW_HEIGHT[density];

  useEffect(() => {
    setShowResolvedValuesState(lsGet(STORAGE_KEY.tokenShowResolvedValues(setName)) === '1');
  }, [setName]);

  // Condensed view — caps indentation at CONDENSED_MAX_DEPTH to prevent deep nesting from pushing content off-screen
  const [condensedView, setCondensedViewState] = useState<boolean>(() => lsGet(STORAGE_KEYS.CONDENSED_VIEW) === '1');
  const setCondensedView = useCallback((v: boolean) => {
    setCondensedViewState(v);
    lsSet(STORAGE_KEYS.CONDENSED_VIEW, v ? '1' : '0');
  }, []);

  // Multi-mode column view — show resolved values per theme option side-by-side
  const [multiModeEnabled, setMultiModeEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('tm_multi_mode') === '1'; } catch (e) { console.debug('[TokenList] storage read multi-mode:', e); return false; }
  });
  const [multiModeDimId, setMultiModeDimId] = useState<string | null>(null);
  const toggleMultiMode = useCallback(() => {
    setMultiModeEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem('tm_multi_mode', next ? '1' : '0'); } catch (e) { console.debug('[TokenList] storage write multi-mode:', e); }
      return next;
    });
  }, []);

  // Auto-select first dimension when multi-mode is enabled and no dimension is selected
  useEffect(() => {
    if (multiModeEnabled && dimensions.length > 0 && (!multiModeDimId || !dimensions.some(d => d.id === multiModeDimId))) {
      setMultiModeDimId(dimensions[0].id);
    }
  }, [multiModeEnabled, dimensions, multiModeDimId]);

  // Compute per-option resolved token maps for the selected dimension
  const multiModeData = useMemo(() => {
    if (!multiModeEnabled || !multiModeDimId || !unthemedAllTokensFlat || dimensions.length === 0) return null;
    const dim = dimensions.find(d => d.id === multiModeDimId);
    if (!dim || dim.options.length < 2) return null;

    // Collect all themed set names (from all dimensions)
    const themedSets = new Set<string>();
    for (const d of dimensions) {
      for (const opt of d.options) {
        for (const sn of Object.keys(opt.sets)) themedSets.add(sn);
      }
    }

    const results: Array<{ optionName: string; dimId: string; resolved: Record<string, TokenMapEntry> }> = [];
    for (const option of dim.options) {
      // Base layer: tokens from non-themed sets
      const merged: Record<string, TokenMapEntry> = {};
      for (const [path, entry] of Object.entries(unthemedAllTokensFlat)) {
        const set = pathToSet[path];
        if (!set || !themedSets.has(set)) merged[path] = entry;
      }
      // Source sets
      for (const [sn, status] of Object.entries(option.sets)) {
        if (status !== 'source') continue;
        for (const [path, entry] of Object.entries(unthemedAllTokensFlat)) {
          if (pathToSet[path] === sn) merged[path] = entry;
        }
      }
      // Enabled sets (overrides)
      for (const [sn, status] of Object.entries(option.sets)) {
        if (status !== 'enabled') continue;
        for (const [path, entry] of Object.entries(unthemedAllTokensFlat)) {
          if (pathToSet[path] === sn) merged[path] = entry;
        }
      }
      results.push({ optionName: option.name, dimId: dim.id, resolved: resolveAllAliases(merged) });
    }
    return { dim, results };
  }, [multiModeEnabled, multiModeDimId, unthemedAllTokensFlat, pathToSet, dimensions]);

  // Build multiModeValues for a given token path
  const getMultiModeValues = useCallback((tokenPath: string): MultiModeValue[] | undefined => {
    if (!multiModeData || !perSetFlat) return undefined;
    const { dim, results } = multiModeData;
    return results.map(({ optionName, dimId, resolved }) => {
      const option = dim.options.find(o => o.name === optionName)!;
      // Find the best target set for edits: first enabled set that already has the token, or first enabled set
      let targetSet: string | null = null;
      const enabledSets = Object.entries(option.sets).filter(([_, s]) => s === 'enabled').map(([sn]) => sn);
      for (const sn of enabledSets) {
        if (perSetFlat[sn]?.[tokenPath]) { targetSet = sn; break; }
      }
      if (!targetSet && enabledSets.length > 0) targetSet = enabledSets[0];
      // Fall back to source sets if no enabled sets exist
      if (!targetSet) {
        const sourceSets = Object.entries(option.sets).filter(([_, s]) => s === 'source').map(([sn]) => sn);
        for (const sn of sourceSets) {
          if (perSetFlat[sn]?.[tokenPath]) { targetSet = sn; break; }
        }
        if (!targetSet && sourceSets.length > 0) targetSet = sourceSets[0];
      }
      return { optionName, dimId, resolved: resolved[tokenPath], targetSet };
    });
  }, [multiModeData, perSetFlat]);

  // Pre-compute per-group theme coverage for the coverage badge
  const themeCoverage = useMemo(() => {
    if (!dimensions || dimensions.length === 0 || !perSetFlat) return undefined;
    // Collect all themed set names (sets referenced by any dimension option)
    const themedSetNames = new Set<string>();
    for (const d of dimensions) {
      for (const opt of d.options) {
        for (const [sn, status] of Object.entries(opt.sets)) {
          if (status === 'enabled' || status === 'source') themedSetNames.add(sn);
        }
      }
    }
    if (themedSetNames.size === 0) return undefined;
    // Build set of token paths that exist in any themed set
    const themedTokenPaths = new Set<string>();
    for (const sn of themedSetNames) {
      if (perSetFlat[sn]) {
        for (const path of Object.keys(perSetFlat[sn])) themedTokenPaths.add(path);
      }
    }
    if (themedTokenPaths.size === 0) return undefined;
    // Walk token tree, computing per-group coverage
    const map = new Map<string, { themed: number; total: number }>();
    function walk(nodes: TokenNode[]): { themed: number; total: number } {
      let themed = 0, total = 0;
      for (const node of nodes) {
        if (node.isGroup && node.children) {
          const sub = walk(node.children);
          themed += sub.themed;
          total += sub.total;
          map.set(node.path, sub);
        } else if (!node.isGroup) {
          total++;
          if (themedTokenPaths.has(node.path)) themed++;
        }
      }
      return { themed, total };
    }
    walk(tokens);
    return map;
  }, [dimensions, perSetFlat, tokens]);

  // JSON editor state
  const [jsonText, setJsonText] = useState('');
  const [jsonDirty, setJsonDirty] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonSaving, setJsonSaving] = useState(false);
  const [jsonBrokenRefs, setJsonBrokenRefs] = useState<string[]>([]);
  const jsonTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Load raw JSON when entering JSON view (or when setName changes in JSON view)
  useEffect(() => {
    if (viewMode !== 'json' || !connected || !serverUrl || !setName) return;
    if (jsonDirty) return; // don't clobber unsaved edits
    apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/raw`)
      .then(data => {
        const text = JSON.stringify(data, null, 2);
        setJsonText(text);
        setJsonError(null);
        setJsonBrokenRefs(validateJsonRefs(text, allTokensFlat));
      })
      .catch(() => setJsonError('Failed to load JSON'));
  }, [viewMode, setName, connected, serverUrl, jsonDirty, allTokensFlat]);

  // Sync from list view → JSON when tokens change externally (not dirty)
  useEffect(() => {
    if (viewMode !== 'json' || jsonDirty || !connected || !serverUrl || !setName) return;
    apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/raw`)
      .then(data => {
        const text = JSON.stringify(data, null, 2);
        setJsonText(text);
        setJsonBrokenRefs(validateJsonRefs(text, allTokensFlat));
      })
      .catch(err => console.warn('[TokenList] fetch raw JSON failed:', err));
  }, [tokens, viewMode, jsonDirty, connected, serverUrl, setName, allTokensFlat]);

  const boundTokenPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const node of selectedNodes) {
      for (const tokenPath of Object.values(node.bindings)) {
        if (tokenPath) paths.add(tokenPath);
      }
    }
    return paths;
  }, [selectedNodes]);

  const handleHoverToken = useCallback((tokenPath: string) => {
    parent.postMessage({ pluginMessage: { type: 'highlight-layer-by-token', tokenPath } }, '*');
  }, []);

  // displayedTokens/displayedLeafNodes/flatItems/itemOffsets computed by hooks below

  // Map of group path ('' = root) → ordered child names, reflecting actual file order
  const siblingOrderMap = useMemo(() => {
    const map = new Map<string, string[]>();
    const walk = (nodes: TokenNode[], parentPath: string) => {
      map.set(parentPath, nodes.map(n => n.name));
      for (const node of nodes) {
        if (node.isGroup && node.children) walk(node.children, node.path);
      }
    };
    walk(tokens, '');
    return map;
  }, [tokens]);

  // --- Custom hooks for extracted state groups ---
  const allGroupPaths = useMemo(() => collectAllGroupPaths(tokens), [tokens]);

  const { handleOpenCreateSibling } = useTokenCreate({
    selectedNodes,
    siblingOrderMap,
    onCreateNew,
  });

  const tableCreate = useTableCreate({
    connected,
    serverUrl,
    setName,
    siblingOrderMap,
    onRefresh,
    onPushUndo,
    onTokenCreated,
    onRecordTouch: recentlyTouched.recordTouch,
  });
  const {
    showTableCreate,
    tableGroup, setTableGroup,
    tableRows, rowErrors, createAllError, busy: tableCreateBusy,
    hasDraft: tableCreateHasDraft,
    addRow: addTableRow, removeRow: removeTableRow, updateRow: updateTableRow,
    closeTableCreate, restoreDraft: restoreTableDraft, dismissDraft: dismissTableDraft,
    openTableCreate, handleCreateAll,
    tableSuggestions,
  } = tableCreate;

  const findReplace = useFindReplace({
    connected,
    serverUrl,
    setName,
    tokens,
    allSets: sets,
    perSetFlat,
    onRefresh,
    onPushUndo,
  });
  const {
    showFindReplace, setShowFindReplace,
    frFind, setFrFind, frReplace, setFrReplace,
    frIsRegex, setFrIsRegex, frScope, setFrScope, frTarget, setFrTarget,
    frTypeFilter, setFrTypeFilter, frAvailableTypes,
    frError, setFrError, frBusy,
    frRegexError, frPreview, frValuePreview, frConflictCount, frRenameCount, frValueCount,
    frAliasImpact,
    handleFindReplace, cancelFindReplace,
  } = findReplace;

  const dragDrop = useDragDrop({
    connected,
    serverUrl,
    setName,
    siblingOrderMap,
    onRefresh,
    onPushUndo,
    onError,
    onRenamePath: (oldPath, newPath) => {
      recentlyTouched.renamePath(oldPath, newPath);
    },
  });
  const {
    dragSource, dragOverGroup, dragOverGroupIsInvalid, dragOverReorder,
    handleDragStart, handleDragEnd, handleDragOverGroup,
    handleDragOverToken, handleDragLeaveToken,
    handleDropOnGroup, handleDropReorder,
  } = dragDrop;

  // Wrap drag callbacks to notify parent so it can expose set-tab drop zones
  const handleDragStartNotify = useCallback((paths: string[], names: string[]) => {
    handleDragStart(paths, names);
    onTokenDragStart?.(paths, setName);
  }, [handleDragStart, onTokenDragStart, setName]);

  const handleDragEndNotify = useCallback(() => {
    handleDragEnd();
    onTokenDragEnd?.();
  }, [handleDragEnd, onTokenDragEnd]);

  const groupOps = useGroupOperations({
    connected,
    serverUrl,
    setName,
    sets,
    siblingOrderMap,
    onRefresh,
    onPushUndo,
    onSetOperationLoading: setOperationLoading,
    onError,
  });
  const {
    renameGroupConfirm, setRenameGroupConfirm,
    newGroupDialogParent, setNewGroupDialogParent,
    newGroupName, setNewGroupName,
    newGroupError, setNewGroupError,
    movingGroup, setMovingGroup,
    copyingGroup, setCopyingGroup,
    moveGroupTargetSet, setMoveGroupTargetSet,
    copyGroupTargetSet, setCopyGroupTargetSet,
    executeGroupRename, handleRenameGroup,
    handleRequestMoveGroup, handleConfirmMoveGroup,
    handleRequestCopyGroup, handleConfirmCopyGroup,
    handleDuplicateGroup, handleUpdateGroupMeta,
    handleCreateGroup, handleMoveTokenInGroup,
  } = groupOps;

  // Phase 1: useTokenWhereIs
  const tokenWhereIs = useTokenWhereIs({ serverUrl });
  const {
    whereIsPath, setWhereIsPath,
    whereIsResults, setWhereIsResults,
    whereIsLoading, setWhereIsLoading: _setWhereIsLoading,
    whereIsAbortRef,
    handleFindInAllSets,
  } = tokenWhereIs;

  // Phase 2: useTokenExpansion
  const tokenExpansion = useTokenExpansion({
    setName,
    tokens,
    highlightedToken,
    onClearHighlight,
  });
  const {
    expandedPaths, setExpandedPaths,
    expandedChains, setExpandedChains: _setExpandedChains,
    handleToggleExpand,
    handleExpandAll,
    handleCollapseAll,
    handleToggleChain,
  } = tokenExpansion;

  // Compute lintPaths here so we can pass it to useTokenSearch
  const lintPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const v of lintViolations) paths.add(v.path);
    return paths;
  }, [lintViolations]);

  // Stable map of path → filtered violations so we don't create new arrays per-row on every render
  const lintViolationsMap = useMemo(() => {
    const map = new Map<string, LintViolation[]>();
    for (const v of lintViolations) {
      let arr = map.get(v.path);
      if (!arr) { arr = []; map.set(v.path, arr); }
      arr.push(v);
    }
    return map;
  }, [lintViolations]);

  // Phase 4: useTokenSearch (needs bridging refs + sortedTokens + expansion state)
  const tokenSearch = useTokenSearch({
    setName,
    tokens,
    sets,
    serverUrl,
    onOpenCommandPaletteWithQuery,
    virtualScrollTopRef,
    flatItemsRef,
    itemOffsetsRef,
    scrollAnchorPathRef,
    isFilterChangeRef,
    expandedPaths,
    pinnedPaths: EMPTY_PATH_SET,
    sortedTokens,
    recentlyTouched,
    showIssuesOnly,
    showRecentlyTouched,
    showPinnedOnly: false,
    inspectMode,
    zoomRootPath,
    lintPaths,
    boundTokenPaths,
    unusedTokenPaths,
    derivedTokenPaths,
  });
  const {
    searchQuery,
    typeFilter,
    refFilter,
    showDuplicates,
    crossSetSearch, setCrossSetSearch,
    filterPresets,
    presetNameInput, setPresetNameInput,
    saveFilterPreset,
    deleteFilterPreset,
    applyFilterPreset,
    showQualifierHints, setShowQualifierHints,
    hintIndex, setHintIndex,
    crossSetResults,
    crossSetTotal,
    crossSetOffset: _crossSetOffset, setCrossSetOffset,
    CROSS_SET_PAGE_SIZE,
    searchRef,
    qualifierHintsRef,
    crossSetAbortRef: _crossSetAbortRef,
    saveScrollAnchor: _saveScrollAnchor,
    setSearchQuery,
    setTypeFilter,
    setRefFilter,
    setShowDuplicates,
    toggleQueryQualifierValue,
    addQueryQualifierValue,
    removeQueryQualifierValue,
    clearQueryQualifier,
    filtersActive,
    activeFilterCount,
    duplicateValuePaths,
    duplicateCounts,
    availableTypes,
    qualifierTypeOptions,
    generatorNames,
    qualifierHints,
    activeQueryToken,
    parsedSearchQuery,
    selectedTypeQualifiers,
    selectedHasQualifiers,
    structuredFilterChips,
    searchHighlight,
    searchTooltip,
    displayedTokens,
    displayedLeafNodes,
  } = tokenSearch;

  const viewOptionsActiveCount = useMemo(() => {
    let count = activeFilterCount;
    if (sortOrder !== 'default') count += 1;
    if (inspectMode) count += 1;
    if (crossSetSearch) count += 1;
    if (multiModeEnabled) count += 1;
    if (condensedView) count += 1;
    if (showPreviewSplit) count += 1;
    return count;
  }, [
    activeFilterCount,
    condensedView,
    crossSetSearch,
    inspectMode,
    multiModeEnabled,
    showPreviewSplit,
    sortOrder,
  ]);

  const multiModeDimensionName = useMemo(
    () => dimensions.find(d => d.id === multiModeDimId)?.name ?? null,
    [dimensions, multiModeDimId],
  );

  const activeFilterSummary = useMemo(() => {
    const items: string[] = [];
    if (sortOrder !== 'default') items.push(sortOrder === 'alpha-asc' ? 'A to Z' : 'By type');
    if (refFilter !== 'all') items.push(refFilter === 'aliases' ? 'References only' : 'Direct only');
    if (showDuplicates) items.push('Duplicates');
    if (showIssuesOnly) items.push(lintViolations.length > 0 ? `Issues (${lintViolations.length})` : 'Issues');
    if (showRecentlyTouched) items.push('Recent');
    if (typeFilter !== '') items.push(typeFilter);
    if (inspectMode) items.push('Selection only');
    if (crossSetSearch) items.push('All sets');
    return items;
  }, [
    crossSetSearch,
    inspectMode,
    lintViolations.length,
    refFilter,
    showDuplicates,
    showIssuesOnly,
    showRecentlyTouched,
    sortOrder,
    typeFilter,
  ]);

  const activeViewSummary = useMemo(() => {
    const items: string[] = [];
    if (multiModeEnabled) {
      items.push(multiModeDimensionName ? `Mode columns · ${multiModeDimensionName}` : 'Mode columns');
    }
    if (condensedView) items.push('Condensed');
    if (showPreviewSplit) items.push(TOKENS_LIBRARY_SPLIT_PREVIEW_LABEL);
    return items;
  }, [condensedView, multiModeDimensionName, multiModeEnabled, showPreviewSplit]);

  const hasStructuredFilters = structuredFilterChips.length > 0;

  const currentBulkEditScope = useMemo<BulkEditScope>(() => {
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery) {
      return {
        source: 'current-scope',
        title: 'Current query results',
        detail: trimmedQuery,
      };
    }
    if (activeFilterSummary.length > 0) {
      return {
        source: 'current-scope',
        title: 'Current filtered tokens',
        detail: activeFilterSummary.join(' · '),
      };
    }
    return {
      source: 'current-scope',
      title: `All tokens in ${setName}`,
      detail: 'No search or filter constraints',
    };
  }, [activeFilterSummary, searchQuery, setName]);

  const getPreferredFilterBuilderSection = useCallback((): FilterBuilderSection => {
    if (parsedSearchQuery.types.length > 0) return 'type';
    if (selectedHasQualifiers.length > 0) return 'has';
    if (parsedSearchQuery.paths.length > 0) return 'path';
    if (parsedSearchQuery.names.length > 0) return 'name';
    if (parsedSearchQuery.values.length > 0) return 'value';
    if (parsedSearchQuery.descs.length > 0) return 'desc';
    if (parsedSearchQuery.generators.length > 0) return 'generator';
    return 'type';
  }, [parsedSearchQuery, selectedHasQualifiers.length]);

  const openFilterBuilderSection = useCallback((section: FilterBuilderSection) => {
    setFilterBuilderOpen(true);
    setActiveFilterBuilderSection(section);
  }, []);

  const toggleFilterBuilder = useCallback(() => {
    setFilterBuilderOpen(open => {
      const next = !open;
      if (next) {
        setActiveFilterBuilderSection(current => current ?? getPreferredFilterBuilderSection());
      }
      return next;
    });
  }, [getPreferredFilterBuilderSection]);

  useEffect(() => {
    if (!filterBuilderOpen && !hasStructuredFilters) {
      setActiveFilterBuilderSection(null);
      return;
    }
    if (activeFilterBuilderSection === null) {
      setActiveFilterBuilderSection(getPreferredFilterBuilderSection());
    }
  }, [activeFilterBuilderSection, filterBuilderOpen, getPreferredFilterBuilderSection, hasStructuredFilters]);

  // Sync displayedLeafNodesRef
  displayedLeafNodesRef.current = displayedLeafNodes;

  // Notify parent when the visible leaf list changes
  useEffect(() => { onDisplayedLeafNodesChange?.(displayedLeafNodes); }, [displayedLeafNodes, onDisplayedLeafNodesChange]);

  // Auto-clear zoom if the zoomed group no longer exists in the tree
  useEffect(() => {
    if (zoomRootPath && !findGroupByPath(sortedTokens, zoomRootPath)) {
      setZoomRootPath(null);
    }
  }, [sortedTokens, zoomRootPath]);

  // Phase 3: useTokenVirtualScroll (needs displayedTokens from useTokenSearch)
  // Note: showRecentlyTouched special-case for flatItems is handled here
  const flatItemsForScroll = useMemo(() => {
    if (viewMode !== 'tree') return [];
    if (showRecentlyTouched) {
      const leaves = flattenLeafNodes(displayedTokens);
      leaves.sort((a, b) => (recentlyTouched.timestamps.get(b.path) ?? 0) - (recentlyTouched.timestamps.get(a.path) ?? 0));
      return leaves.map(node => ({ node, depth: 0 }));
    }
    return flattenVisible(displayedTokens, expandedPaths);
  }, [displayedTokens, expandedPaths, viewMode, showRecentlyTouched, recentlyTouched.timestamps]);

  const tokenVirtualScroll = useTokenVirtualScroll({
    displayedTokens: flatItemsForScroll.length === 0 ? displayedTokens : displayedTokens,
    expandedPaths,
    expandedChains,
    rowHeight,
    allTokensFlat,
    viewMode,
    recentlyTouched,
    highlightedToken,
    virtualListRef,
    virtualScrollTopRef,
    flatItemsRef,
    itemOffsetsRef,
    scrollAnchorPathRef,
    isFilterChangeRef,
  });
  // Override flatItems from the hook with our special recency-sorted version
  const flatItems = flatItemsForScroll;
  const {
    virtualScrollTop, setVirtualScrollTop,
    itemOffsets,
    pendingTabEdit,
    handleClearPendingTabEdit,
    handleJumpToGroup,
    handleTabToNext,
  } = tokenVirtualScroll;
  // Sync flatItemsRef/itemOffsetsRef (useTokenVirtualScroll already does this, but flatItems is overridden above)
  flatItemsRef.current = flatItems;
  // itemOffsetsRef is set by useTokenVirtualScroll internally

  // Report filtered leaf count to parent so set tabs can show "X / Y"
  useEffect(() => {
    if (!onFilteredCountChange) return;
    onFilteredCountChange(filtersActive ? displayedLeafNodes.length : null);
  }, [displayedLeafNodes, filtersActive, onFilteredCountChange]);

  // Phase 5: useTokenSelection (called before tokenCrud/tokenPromotion so selectedPaths is available)
  const tokenSelection = useTokenSelection({
    viewMode,
    flatItems,
    displayedLeafNodes,
    crossSetResults,
    onSelectionChange,
  });
  const {
    selectMode, setSelectMode,
    selectedPaths, setSelectedPaths,
    showBatchEditor, setShowBatchEditor,
    lastSelectedPathRef,
    displayedLeafPaths,
    selectedLeafNodes,
    handleTokenSelect,
    handleSelectAll,
    handleSelectGroupChildren,
  } = tokenSelection;

  const primaryCreateInToolbar = tokens.length > 0 && !selectMode && viewMode === 'tree';

  // Wire up the clearSelection ref now that useTokenSelection has been called
  clearSelectionRef.current = () => { setSelectMode(false); setSelectedPaths(new Set()); };

  const openBulkEditorForPaths = useCallback((paths: Set<string>, scope: BulkEditScope) => {
    if (paths.size === 0) {
      dispatchToast('No tokens match that bulk-edit scope.', 'error');
      return;
    }
    setSelectMode(true);
    setSelectedPaths(paths);
    setShowBatchEditor(true);
    setActiveBulkEditScope(scope);
    setBulkWorkflowOpen(false);
    setViewOptionsOpen(false);
  }, [setSelectMode, setSelectedPaths, setShowBatchEditor]);

  const handleOpenBulkWorkflowForVisibleTokens = useCallback(() => {
    if (crossSetSearch) {
      dispatchToast('Turn off "Search all sets" before bulk editing tokens in this set.', 'error');
      return;
    }
    openBulkEditorForPaths(
      new Set(displayedLeafNodes.map(node => node.path)),
      currentBulkEditScope,
    );
  }, [crossSetSearch, currentBulkEditScope, displayedLeafNodes, openBulkEditorForPaths]);

  const handleOpenBulkWorkflowForPreset = useCallback((preset: { id: string; name: string; query: string }) => {
    setCrossSetSearch(false);
    setPendingBulkPresetLaunch({
      presetId: preset.id,
      presetName: preset.name,
      query: preset.query,
    });
    setSearchQuery(preset.query);
  }, [setCrossSetSearch, setSearchQuery]);

  useEffect(() => {
    if (!pendingBulkPresetLaunch) return;
    if (crossSetSearch) return;
    if (searchQuery !== pendingBulkPresetLaunch.query) return;
    const presetPaths = new Set(displayedLeafNodes.map(node => node.path));
    if (presetPaths.size === 0) {
      dispatchToast(`Saved scope "${pendingBulkPresetLaunch.presetName}" does not match any tokens in ${setName}.`, 'error');
      setPendingBulkPresetLaunch(null);
      return;
    }
    openBulkEditorForPaths(presetPaths, {
      source: 'saved-preset',
      title: pendingBulkPresetLaunch.presetName,
      detail: pendingBulkPresetLaunch.query,
    });
    setPendingBulkPresetLaunch(null);
  }, [
    crossSetSearch,
    displayedLeafNodes,
    openBulkEditorForPaths,
    pendingBulkPresetLaunch,
    searchQuery,
    setName,
  ]);

  useEffect(() => {
    if (!selectMode || selectedPaths.size === 0) {
      setActiveBulkEditScope(null);
    }
    if (selectMode) {
      setBulkWorkflowOpen(false);
    }
  }, [selectMode, selectedPaths.size]);

  const bulkWorkflowDisabledReason = useMemo(() => {
    if (crossSetSearch) return 'Bulk editing runs against the current set only. Turn off "Search all sets" first.';
    if (displayedLeafNodes.length === 0) return 'No tokens match the current search scope.';
    return null;
  }, [crossSetSearch, displayedLeafNodes.length]);

  const tokenCrud = useTokenCrud({
    connected,
    serverUrl,
    setName,
    sets,
    tokens,
    allTokensFlat,
    perSetFlat,
    generators,
    dimensions,
    onRefresh,
    onPushUndo,
    onRefreshGenerators,
    onSetOperationLoading: setOperationLoading,
    onSetLocallyDeletedPaths: setLocallyDeletedPaths,
    onRecordTouch: recentlyTouched.recordTouch,
    onRenamePath: (oldPath, newPath) => {
      recentlyTouched.renamePath(oldPath, newPath);
    },
    onClearSelection: clearSelection,
    onError,
  });
  const {
    deleteConfirm, setDeleteConfirm,
    renameTokenConfirm, setRenameTokenConfirm,
    deleteError, setDeleteError,
    pendingRenameToken, setPendingRenameToken,
    movingToken, setMovingToken,
    copyingToken, setCopyingToken,
    moveTokenTargetSet, setMoveTokenTargetSet: _setMoveTokenTargetSet,
    copyTokenTargetSet, setCopyTokenTargetSet: _setCopyTokenTargetSet,
    moveConflict, copyConflict,
    moveConflictAction, setMoveConflictAction,
    copyConflictAction, setCopyConflictAction,
    moveConflictNewPath, setMoveConflictNewPath,
    copyConflictNewPath, setCopyConflictNewPath,
    executeTokenRename, handleRenameToken,
    requestDeleteToken, requestDeleteGroup,
    requestBulkDelete: requestBulkDeleteFromHook,
    executeDelete,
    handleDuplicateToken, handleInlineSave, handleDescriptionSave: _handleDescriptionSave,
    handleMultiModeInlineSave, handleDetachFromGenerator,
    handleRequestMoveToken, handleConfirmMoveToken, handleChangeMoveTokenTargetSet,
    handleRequestCopyToken, handleConfirmCopyToken, handleChangeCopyTokenTargetSet,
  } = tokenCrud;

  const handleRegenerateGenerator = useCallback(async (generatorId: string) => {
    try {
      await apiFetch(`${serverUrl}/api/generators/${generatorId}/run`, { method: 'POST' });
      onRefresh();
    } catch {
      onError?.('Failed to regenerate — check server connection');
    }
  }, [serverUrl, onRefresh, onError]);

  const handleDismissStaleGeneratorBanner = useCallback(() => {
    lsSet(staleGeneratorBannerStorageKey, staleGeneratorSignature);
    setDismissedStaleGeneratorSignature(staleGeneratorSignature);
  }, [staleGeneratorBannerStorageKey, staleGeneratorSignature]);

  const handleRegenerateAllStaleGenerators = useCallback(async () => {
    if (runningStaleGenerators || staleGeneratorsForSet.length === 0) return;
    setRunningStaleGenerators(true);
    let successCount = 0;
    let totalUpdatedTokens = 0;
    const failedGenerators: string[] = [];
    try {
      for (const generator of staleGeneratorsForSet) {
        try {
          const result = await apiFetch<{ count?: number }>(
            `${serverUrl}/api/generators/${generator.id}/run`,
            { method: 'POST' },
          );
          successCount += 1;
          totalUpdatedTokens += result.count ?? 0;
        } catch {
          failedGenerators.push(generator.name);
        }
      }
      if (failedGenerators.length === 0) {
        dispatchToast(
          `Re-ran ${successCount} stale generator${successCount !== 1 ? 's' : ''}${totalUpdatedTokens > 0 ? ` — ${totalUpdatedTokens} token${totalUpdatedTokens !== 1 ? 's' : ''} updated` : ''}`,
          'success',
        );
      } else {
        dispatchToast(
          `${failedGenerators.length} generator${failedGenerators.length !== 1 ? 's' : ''} failed: ${failedGenerators.join(', ')}`,
          'error',
        );
      }
      onRefresh();
    } finally {
      setRunningStaleGenerators(false);
    }
  }, [runningStaleGenerators, staleGeneratorsForSet, serverUrl, onRefresh]);

  const tokenPromotion = useTokenPromotion({
    connected,
    serverUrl,
    setName,
    tokens,
    allTokensFlat,
    selectedPaths,
    onRefresh,
    onClearSelection: clearSelection,
    onError,
  });
  const {
    promoteRows, setPromoteRows,
    promoteBusy,
    handleOpenPromoteModal, handleConfirmPromote,
  } = tokenPromotion;

  const closeLongLivedReviewSurfaces = useCallback(() => {
    setVarDiffPending(null);
    setPromoteRows(null);
    setMovingToken(null);
    setCopyingToken(null);
    setShowFindReplace(false);
    setShowBatchEditor(false);
    setPendingBatchEditorFocus(null);
  }, [
    setCopyingToken,
    setMovingToken,
    setPromoteRows,
    setShowBatchEditor,
    setShowFindReplace,
  ]);

  const handleOpenFindReplaceReview = useCallback(() => {
    if (crossSetSearch) {
      dispatchToast('Turn off "Search all sets" before bulk renaming tokens in this set.', 'error');
      return;
    }
    closeLongLivedReviewSurfaces();
    openBulkEditorForPaths(
      new Set(displayedLeafNodes.map(node => node.path)),
      currentBulkEditScope,
    );
    setPendingBatchEditorFocus('find-path');
  }, [
    closeLongLivedReviewSurfaces,
    crossSetSearch,
    currentBulkEditScope,
    displayedLeafNodes,
    openBulkEditorForPaths,
  ]);

  const handleOpenPromoteReview = useCallback((paths?: Set<string>) => {
    closeLongLivedReviewSurfaces();
    handleOpenPromoteModal(paths);
  }, [closeLongLivedReviewSurfaces, handleOpenPromoteModal]);

  const handleRequestMoveTokenReview = useCallback((path: string) => {
    closeLongLivedReviewSurfaces();
    handleRequestMoveToken(path);
  }, [closeLongLivedReviewSurfaces, handleRequestMoveToken]);

  const handleRequestCopyTokenReview = useCallback((path: string) => {
    closeLongLivedReviewSurfaces();
    handleRequestCopyToken(path);
  }, [closeLongLivedReviewSurfaces, handleRequestCopyToken]);

  useEffect(() => {
    if (!showBatchEditor || pendingBatchEditorFocus !== 'find-path') return;
    const frameId = window.requestAnimationFrame(() => {
      const input = batchEditorPanelRef.current?.querySelector<HTMLInputElement>('input[aria-label="Find in path"]');
      input?.focus();
      input?.select();
      setPendingBatchEditorFocus(null);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [pendingBatchEditorFocus, showBatchEditor]);

  // promotableDuplicateCount — needs duplicateValuePaths (from useTokenSearch) and tokens
  const promotableDuplicateCount = useMemo(() => {
    const flat: Array<{ path: string; $value: unknown }> = [];
    const walk = (list: TokenNode[]) => {
      for (const node of list) {
        if (!node.isGroup) flat.push({ path: node.path, $value: node.$value });
        if (node.children) walk(node.children);
      }
    };
    walk(tokens);
    return flat.filter(t => duplicateValuePaths.has(t.path) && !isAlias(t.$value as import('@tokenmanager/core').TokenValue | undefined)).length;
  }, [tokens, duplicateValuePaths]);

  // handleListKeyDown is defined after custom hook calls to avoid TDZ
  // Container-level keyboard shortcut handler for the token list
  const handleListKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
    const activeEl = document.activeElement as HTMLElement | null;
    const focusedTokenPath = activeEl?.dataset?.tokenPath;
    const focusedGroupPath = activeEl?.dataset?.groupPath;

    // Escape: close create form, exit select mode, exit zoom, or blur search
    if (e.key === 'Escape') {
      if (selectMode) {
        e.preventDefault();
        setSelectMode(false);
        setSelectedPaths(new Set());
        setShowBatchEditor(false);
        return;
      }
      if (zoomRootPath) {
        e.preventDefault();
        setZoomRootPath(null);
        setVirtualScrollTop(0);
        if (virtualListRef.current) virtualListRef.current.scrollTop = 0;
        return;
      }
      return;
    }

    // Cmd/Ctrl+C: copy selected tokens as DTCG JSON
    if (matchesShortcut(e, 'TOKEN_COPY')) {
      if (selectMode && selectedPaths.size > 0) {
        e.preventDefault();
        const nodes = displayedLeafNodesRef.current.filter(n => selectedPaths.has(n.path));
        copyTokensAsJsonRef.current(nodes);
        return;
      }
      // Single focused token row — copy that token
      if (!isTyping) {
        const focusedPath = (document.activeElement as HTMLElement)?.dataset?.tokenPath;
        if (focusedPath) {
          const node = displayedLeafNodesRef.current.find(n => n.path === focusedPath);
          if (node) {
            e.preventDefault();
            copyTokensAsJsonRef.current([node]);
            return;
          }
        }
      }
    }

    // Cmd/Ctrl+Shift+C: copy selected tokens in preferred format (configured in Settings)
    if (matchesShortcut(e, 'TOKEN_COPY_CSS_VAR')) {
      if (selectMode && selectedPaths.size > 0) {
        e.preventDefault();
        const nodes = displayedLeafNodesRef.current.filter(n => selectedPaths.has(n.path));
        copyTokensAsPreferredRef.current(nodes);
        return;
      }
      // Single focused token row — copy that token
      if (!isTyping) {
        const focusedPath = (document.activeElement as HTMLElement)?.dataset?.tokenPath;
        if (focusedPath) {
          const node = displayedLeafNodesRef.current.find(n => n.path === focusedPath);
          if (node) {
            e.preventDefault();
            copyTokensAsPreferredRef.current([node]);
            return;
          }
        }
      }
    }

    // Cmd/Ctrl+Alt+C: copy selected tokens as DTCG alias reference ({path.to.token})
    if (e.key === 'c' && (e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey) {
      if (selectMode && selectedPaths.size > 0) {
        e.preventDefault();
        const nodes = displayedLeafNodesRef.current.filter(n => selectedPaths.has(n.path));
        copyTokensAsDtcgRefRef.current(nodes);
        return;
      }
      // Single focused token row — copy that token
      if (!isTyping) {
        const focusedPath = (document.activeElement as HTMLElement)?.dataset?.tokenPath;
        if (focusedPath) {
          const node = displayedLeafNodesRef.current.find(n => n.path === focusedPath);
          if (node) {
            e.preventDefault();
            copyTokensAsDtcgRefRef.current([node]);
            return;
          }
        }
      }
    }

    // Cmd/Ctrl+] / Cmd/Ctrl+[: navigate to next/previous token in the editor (works from list when side panel is visible)
    if ((matchesShortcut(e, 'EDITOR_NEXT_TOKEN') || matchesShortcut(e, 'EDITOR_PREV_TOKEN')) && editingTokenPath) {
      e.preventDefault();
      const nodes = displayedLeafNodesRef.current;
      const idx = nodes.findIndex(n => n.path === editingTokenPath);
      if (idx !== -1) {
        const next = matchesShortcut(e, 'EDITOR_NEXT_TOKEN') ? nodes[idx + 1] : nodes[idx - 1];
        if (next) onEdit(next.path, next.name);
      }
      return;
    }

    // Don't handle shortcuts when typing in a form field
    if (isTyping) return;

    // Cmd/Ctrl+A: select all visible leaf tokens (auto-enters select mode)
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      if (!selectMode) setSelectMode(true);
      setSelectedPaths(new Set(displayedLeafNodesRef.current.map(n => n.path)));
      return;
    }

    // ⌫/Del: bulk delete when in select mode with tokens selected
    if (
      matchesShortcut(e, 'TOKEN_DELETE')
      && selectMode
      && selectedPaths.size > 0
      && (focusedTokenPath || focusedGroupPath)
    ) {
      e.preventDefault();
      requestBulkDeleteFromHook(selectedPaths);
      return;
    }

    // ⌘⇧M: batch move selected tokens to another set
    if (matchesShortcut(e, 'TOKEN_BATCH_MOVE_TO_SET') && selectMode && selectedPaths.size > 0) {
      e.preventDefault();
      setBatchMoveToSetTarget(sets.filter(s => s !== setName)[0] ?? '');
      setShowBatchMoveToSet(true);
      return;
    }

    // ⌘⇧Y: batch copy selected tokens to another set
    if (matchesShortcut(e, 'TOKEN_BATCH_COPY_TO_SET') && selectMode && selectedPaths.size > 0) {
      e.preventDefault();
      setBatchCopyToSetTarget(sets.filter(s => s !== setName)[0] ?? '');
      setShowBatchCopyToSet(true);
      return;
    }

    // m: toggle multi-select mode
    if (matchesShortcut(e, 'TOKEN_MULTI_SELECT')) {
      e.preventDefault();
      if (selectMode) {
        setSelectMode(false);
        setSelectedPaths(new Set());
        setShowBatchEditor(false);
      } else {
        setSelectMode(true);
      }
      return;
    }

    // e: open/toggle batch editor when in select mode with tokens selected
    if (e.key === 'e' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (selectMode && selectedPaths.size > 0) {
        e.preventDefault();
        setShowBatchEditor(v => !v);
        return;
      }
    }

    // n: open create form / drawer, pre-filling path from focused group or token's parent group
    if (matchesShortcut(e, 'TOKEN_NEW')) {
      e.preventDefault();
      const groupPath = focusedGroupPath;
      const tokenPath = focusedTokenPath;

      let prefixPath = '';
      if (groupPath) {
        prefixPath = groupPath;
      } else if (tokenPath) {
        const groups = Array.from(document.querySelectorAll<HTMLElement>('[data-group-path]'));
        const parentGroup = groups
          .filter(el => tokenPath.startsWith((el.dataset.groupPath ?? '') + '.'))
          .sort((a, b) => (b.dataset.groupPath?.length ?? 0) - (a.dataset.groupPath?.length ?? 0))[0];
        prefixPath = parentGroup?.dataset?.groupPath ?? '';
      }

      if (prefixPath) {
        handleOpenCreateSibling(prefixPath, 'color');
      } else if (onCreateNew) {
        onCreateNew();
      }
      return;
    }

    // /: focus search input
    if (matchesShortcut(e, 'TOKEN_SEARCH')) {
      e.preventDefault();
      searchRef.current?.focus();
      return;
    }

    // Alt+↑/↓: move focused token/group up or down within its parent group
    if (e.altKey && !e.metaKey && !e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const activeEl = document.activeElement as HTMLElement;
      const nodePath = activeEl?.dataset?.tokenPath ?? activeEl?.dataset?.groupPath;
      const nodeName = activeEl?.dataset?.nodeName;
      if (nodePath && nodeName && sortOrder === 'default' && connected) {
        const direction = e.key === 'ArrowUp' ? 'up' : 'down';
        const parentPath = nodeParentPath(nodePath, nodeName) ?? '';
        const siblings = siblingOrderMap.get(parentPath) ?? [];
        const idx = siblings.indexOf(nodeName);
        const newIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (idx >= 0 && newIdx >= 0 && newIdx < siblings.length) {
          e.preventDefault();
          handleMoveTokenInGroup(nodePath, nodeName, direction);
        }
      }
      return;
    }

    // ↑/↓: navigate between visible token and group rows
    // Shift+↑/↓ in select mode: extend/shrink range selection
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-token-path],[data-group-path]'));
      if (rows.length === 0) return;
      const currentIndex = rows.findIndex(el => el === document.activeElement);
      let targetRow: HTMLElement | undefined;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        targetRow = currentIndex > 0 ? rows[currentIndex - 1] : rows[rows.length - 1];
      } else {
        e.preventDefault();
        targetRow = currentIndex < rows.length - 1 ? rows[currentIndex + 1] : rows[0];
      }
      targetRow?.focus();
      targetRow?.scrollIntoView({ block: 'nearest' });

      // Shift+Arrow: extend/shrink range selection (auto-enters select mode)
      if (e.shiftKey && targetRow) {
        const targetPath = targetRow.dataset.tokenPath || targetRow.dataset.groupPath;
        if (targetPath) {
          if (!selectMode) setSelectMode(true);
          // Set anchor on first shift-arrow if none exists
          if (lastSelectedPathRef.current === null) {
            const currentRow = currentIndex >= 0 ? rows[currentIndex] : undefined;
            const currentPath = currentRow?.dataset.tokenPath || currentRow?.dataset.groupPath;
            if (currentPath) {
              lastSelectedPathRef.current = currentPath;
              setSelectedPaths(prev => {
                const next = new Set(prev);
                next.add(currentPath);
                return next;
              });
            }
          }
          handleTokenSelect(targetPath, { shift: true, ctrl: false });
        }
      }
    }

    // Alt+←: navigate back in alias navigation history
    if (e.altKey && !e.metaKey && !e.ctrlKey && e.key === 'ArrowLeft' && (navHistoryLength ?? 0) > 0) {
      e.preventDefault();
      onNavigateBack?.();
      return;
    }

    // Cmd/Ctrl+→: expand all groups; Cmd/Ctrl+←: collapse all groups
    if (matchesShortcut(e, 'TOKEN_EXPAND_ALL')) {
      e.preventDefault();
      handleExpandAll();
      return;
    }
    if (matchesShortcut(e, 'TOKEN_COLLAPSE_ALL')) {
      e.preventDefault();
      handleCollapseAll();
      return;
    }

    // ←/→: expand/collapse groups (standard tree keyboard pattern)
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const activeEl = document.activeElement as HTMLElement;
      const groupPath = activeEl?.dataset?.groupPath;
      const tokenPath = activeEl?.dataset?.tokenPath;

      if (groupPath) {
        const isExpanded = expandedPaths.has(groupPath);
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          if (!isExpanded) {
            handleToggleExpand(groupPath);
          } else {
            const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-token-path],[data-group-path]'));
            const idx = rows.indexOf(activeEl);
            if (idx >= 0 && idx < rows.length - 1) {
              rows[idx + 1]?.focus();
              rows[idx + 1]?.scrollIntoView({ block: 'nearest' });
            }
          }
        } else {
          e.preventDefault();
          if (isExpanded) {
            handleToggleExpand(groupPath);
          } else {
            const parentPath = nodeParentPath(groupPath, activeEl.dataset.nodeName ?? '');
            if (parentPath) {
              const parentEl = document.querySelector<HTMLElement>(`[data-group-path="${CSS.escape(parentPath)}"]`);
              if (parentEl) {
                parentEl.focus();
                parentEl.scrollIntoView({ block: 'nearest' });
              }
            }
          }
        }
      } else if (tokenPath && e.key === 'ArrowLeft') {
        e.preventDefault();
        const parentPath = nodeParentPath(tokenPath, activeEl.dataset.nodeName ?? '');
        if (parentPath) {
          const parentEl = document.querySelector<HTMLElement>(`[data-group-path="${CSS.escape(parentPath)}"]`);
          if (parentEl) {
            parentEl.focus();
            parentEl.scrollIntoView({ block: 'nearest' });
          }
        }
      }
    }
  }, [selectMode, selectedPaths, handleOpenCreateSibling, onCreateNew, expandedPaths, handleToggleExpand, handleExpandAll, handleCollapseAll, zoomRootPath, navHistoryLength, onNavigateBack, handleMoveTokenInGroup, siblingOrderMap, sortOrder, connected, requestBulkDeleteFromHook, sets, setName, setBatchMoveToSetTarget, setShowBatchMoveToSet, setBatchCopyToSetTarget, setShowBatchCopyToSet, editingTokenPath, handleTokenSelect, lastSelectedPathRef, onEdit, searchRef, setSelectMode, setSelectedPaths, setShowBatchEditor, setVirtualScrollTop]);

  // Scroll virtual list to bring the highlighted token into view
  useLayoutEffect(() => {
    if (!highlightedToken || viewMode !== 'tree' || !virtualListRef.current) return;
    const idx = flatItems.findIndex(item => item.node.path === highlightedToken);
    if (idx < 0) return;
    const containerH = virtualListRef.current.clientHeight;
    const targetScrollTop = Math.max(0, itemOffsets[idx] - containerH / 2 + rowHeight / 2);
    virtualListRef.current.scrollTop = targetScrollTop;
    setVirtualScrollTop(targetScrollTop);
  }, [highlightedToken, flatItems, itemOffsets, viewMode, rowHeight, setVirtualScrollTop]);

  // Restore scroll anchor after filter changes so the first visible item stays visible
  useLayoutEffect(() => {
    if (!isFilterChangeRef.current) return;
    isFilterChangeRef.current = false;
    const anchorPath = scrollAnchorPathRef.current;
    scrollAnchorPathRef.current = null;
    if (!virtualListRef.current) return;
    if (anchorPath) {
      const idx = flatItems.findIndex(item => item.node.path === anchorPath);
      if (idx >= 0) {
        const targetScrollTop = itemOffsets[idx];
        virtualListRef.current.scrollTop = targetScrollTop;
        setVirtualScrollTop(targetScrollTop);
        return;
      }
    }
    // Anchor not in filtered list — scroll to top of results
    virtualListRef.current.scrollTop = 0;
    setVirtualScrollTop(0);
  }, [flatItems, itemOffsets, setVirtualScrollTop]);

  const syncChangedCount = useMemo(() => {
    if (!syncSnapshot) return 0;
    return Object.entries(allTokensFlat).filter(
      ([path, token]) => path in syncSnapshot && syncSnapshot[path] !== stableStringify(token.$value)
    ).length;
  }, [syncSnapshot, allTokensFlat]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setTypeFilter('');
    setRefFilter('all');
    setShowDuplicates(false);
    setCrossSetSearch(false);
    setInspectMode(false);
    setShowRecentlyTouched(false);
    setFilterBuilderOpen(false);
    setActiveFilterBuilderSection(null);
    if (showIssuesOnly && onToggleIssuesOnly) onToggleIssuesOnly();
  }, [
    onToggleIssuesOnly,
    setActiveFilterBuilderSection,
    setCrossSetSearch,
    setFilterBuilderOpen,
    setInspectMode,
    setRefFilter,
    setSearchQuery,
    setShowDuplicates,
    setShowRecentlyTouched,
    setTypeFilter,
    showIssuesOnly,
  ]);

  const clearViewModes = useCallback(() => {
    if (multiModeEnabled) toggleMultiMode();
    if (condensedView) setCondensedView(false);
    if (showPreviewSplit) onTogglePreviewSplit?.();
  }, [condensedView, multiModeEnabled, onTogglePreviewSplit, setCondensedView, showPreviewSplit, toggleMultiMode]);

  const handleOpenPrimaryCreate = useCallback(() => {
    onCreateNew?.();
  }, [onCreateNew]);

  // Merge capabilities from all selected nodes for the property picker
  const selectionCapabilities = useMemo<NodeCapabilities | null>(() => selectedNodes.length > 0
    ? {
        hasFills: selectedNodes.some(n => n.capabilities.hasFills),
        hasStrokes: selectedNodes.some(n => n.capabilities.hasStrokes),
        hasAutoLayout: selectedNodes.some(n => n.capabilities.hasAutoLayout),
        isText: selectedNodes.some(n => n.capabilities.isText),
        hasEffects: selectedNodes.some(n => n.capabilities.hasEffects),
      }
    : null, [selectedNodes]);

  // Extract to alias state — managed by useExtractToAlias hook
  const {
    extractToken, setExtractToken,
    extractMode, setExtractMode,
    newPrimitivePath, setNewPrimitivePath,
    newPrimitiveSet, setNewPrimitiveSet,
    existingAlias, setExistingAlias,
    existingAliasSearch, setExistingAliasSearch,
    extractError, setExtractError,
    handleOpenExtractToAlias,
    handleConfirmExtractToAlias,
  } = useExtractToAlias({ connected, serverUrl, setName, onRefresh });

  // requestBulkDelete wrapper — passes current selectedPaths
  const requestBulkDelete = useCallback(() => {
    requestBulkDeleteFromHook(selectedPaths);
  }, [requestBulkDeleteFromHook, selectedPaths]);

  const handleBatchMoveToGroup = useCallback(async () => {
    const target = moveToGroupTarget.trim();
    if (!target || selectedPaths.size === 0 || !connected) return;

    const renames = [...selectedPaths].map(oldPath => {
      const name = oldPath.split('.').pop()!;
      const newPath = `${target}.${name}`;
      return { oldPath, newPath };
    });

    const newPaths = renames.map(r => r.newPath);
    if (new Set(newPaths).size !== newPaths.length) {
      setMoveToGroupError('Some selected tokens have the same name — resolve conflicts before moving');
      return;
    }

    setShowMoveToGroup(false);
    setMoveToGroupError('');
    setOperationLoading(`Moving ${selectedPaths.size} token${selectedPaths.size !== 1 ? 's' : ''}…`);
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch-rename-paths`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renames, updateAliases: true }),
      });
      setSelectedPaths(new Set());
      setSelectMode(false);
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Move failed: network error');
    }
    setOperationLoading(null);
    onRefresh();
  }, [moveToGroupTarget, selectedPaths, connected, serverUrl, setName, onRefresh, onError, setSelectMode, setSelectedPaths]);

  const handleBatchMoveToSet = useCallback(async () => {
    const target = batchMoveToSetTarget.trim();
    if (!target || selectedPaths.size === 0 || !connected) return;
    setShowBatchMoveToSet(false);
    setOperationLoading(`Moving ${selectedPaths.size} token${selectedPaths.size !== 1 ? 's' : ''} to ${target}…`);
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch-move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: [...selectedPaths], targetSet: target }),
      });
      setSelectedPaths(new Set());
      setSelectMode(false);
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Move to set failed: network error');
    }
    setOperationLoading(null);
    onRefresh();
  }, [batchMoveToSetTarget, selectedPaths, connected, serverUrl, setName, onRefresh, onError, setSelectMode, setSelectedPaths]);

  const handleBatchCopyToSet = useCallback(async () => {
    const target = batchCopyToSetTarget.trim();
    if (!target || selectedPaths.size === 0 || !connected) return;
    setShowBatchCopyToSet(false);
    setOperationLoading(`Copying ${selectedPaths.size} token${selectedPaths.size !== 1 ? 's' : ''} to ${target}…`);
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: [...selectedPaths], targetSet: target }),
      });
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : 'Copy to set failed: network error');
    }
    setOperationLoading(null);
    onRefresh();
  }, [batchCopyToSetTarget, selectedPaths, connected, serverUrl, setName, onRefresh, onError]);

  // handleTokenSelect, displayedLeafPaths, selectedLeafNodes, handleSelectAll, handleSelectGroupChildren
  // are managed by useTokenSelection (destructured above)

  /** Build nested DTCG JSON from a list of token nodes and copy to clipboard. */
  const copyTokensAsJson = useCallback((nodes: TokenNode[]) => {
    if (nodes.length === 0) return;
    // Build a nested DTCG object from flat token paths
    const root: Record<string, any> = {};
    for (const node of nodes) {
      if (node.isGroup) continue;
      const segments = node.path.split('.');
      let cursor = root;
      for (let i = 0; i < segments.length - 1; i++) {
        if (!(segments[i] in cursor)) cursor[segments[i]] = {};
        cursor = cursor[segments[i]];
      }
      const leaf: Record<string, unknown> = { $value: node.$value, $type: node.$type };
      if (node.$description) leaf.$description = node.$description;
      cursor[segments[segments.length - 1]] = leaf;
    }
    const json = JSON.stringify(root, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1500);
    }).catch(err => console.warn('[TokenList] clipboard write failed:', err));
  }, []);
  copyTokensAsJsonRef.current = copyTokensAsJson;

  /** Convert token paths to CSS custom property references and copy to clipboard. */
  const copyTokensAsCssVar = useCallback((nodes: TokenNode[]) => {
    const leafNodes = nodes.filter(n => !n.isGroup);
    if (leafNodes.length === 0) return;
    const text = leafNodes
      .map(n => `var(--${n.path.replace(/\./g, '-')})`)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopyCssFeedback(true);
      setTimeout(() => setCopyCssFeedback(false), 1500);
    }).catch(err => console.warn('[TokenList] clipboard write failed:', err));
  }, []);
  copyTokensAsCssVarRef.current = copyTokensAsCssVar;

  /** Copy token paths as DTCG alias reference syntax ({path.to.token}) — ⌘⌥C. */
  const copyTokensAsDtcgRef = useCallback((nodes: TokenNode[]) => {
    const leafNodes = nodes.filter(n => !n.isGroup);
    if (leafNodes.length === 0) return;
    const text = leafNodes.map(n => `{${n.path}}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopyAliasFeedback(true);
      setTimeout(() => setCopyAliasFeedback(false), 1500);
    }).catch(err => console.warn('[TokenList] clipboard write failed:', err));
  }, []);
  copyTokensAsDtcgRefRef.current = copyTokensAsDtcgRef;

  /** Copy the focused/selected token(s) in the user's preferred format (⌘⇧C). */
  const copyTokensAsPreferred = useCallback((nodes: TokenNode[]) => {
    const leafNodes = nodes.filter(n => !n.isGroup);
    if (leafNodes.length === 0) return;

    const fmt = (lsGet(STORAGE_KEYS.PREFERRED_COPY_FORMAT) ?? 'css-var') as PreferredCopyFormat;

    let text: string;
    if (fmt === 'json') {
      const root: Record<string, any> = {};
      for (const node of leafNodes) {
        const segments = node.path.split('.');
        let cursor = root;
        for (let i = 0; i < segments.length - 1; i++) {
          if (!(segments[i] in cursor)) cursor[segments[i]] = {};
          cursor = cursor[segments[i]];
        }
        const leaf: Record<string, unknown> = { $value: node.$value, $type: node.$type };
        if (node.$description) leaf.$description = node.$description;
        cursor[segments[segments.length - 1]] = leaf;
      }
      text = JSON.stringify(root, null, 2);
    } else if (fmt === 'raw') {
      text = leafNodes.map(n => typeof n.$value === 'string' ? n.$value : JSON.stringify(n.$value)).join('\n');
    } else if (fmt === 'dtcg-ref') {
      text = leafNodes.map(n => `{${n.path}}`).join('\n');
    } else if (fmt === 'scss') {
      text = leafNodes.map(n => `$${n.path.replace(/\./g, '-')}`).join('\n');
    } else {
      // css-var (default)
      text = leafNodes.map(n => `var(--${n.path.replace(/\./g, '-')})`).join('\n');
    }

    navigator.clipboard.writeText(text).then(() => {
      setCopyPreferredFeedback(true);
      setTimeout(() => setCopyPreferredFeedback(false), 1500);
    }).catch(err => console.warn('[TokenList] clipboard write failed:', err));
  }, []);
  copyTokensAsPreferredRef.current = copyTokensAsPreferred;

  const resolveFlat = (flat: any[]) =>
    flat.map(t => {
      if (t.$type === 'gradient' && Array.isArray(t.$value)) {
        const resolvedStops = t.$value.map((stop: { color: string; position: number }) => {
          if (isAlias(stop.color)) {
            const refPath = extractAliasPath(stop.color)!;
            const refEntry = allTokensFlat[refPath];
            if (refEntry) {
              const inner = resolveTokenValue(refEntry.$value, refEntry.$type, allTokensFlat);
              return { ...stop, color: inner.value ?? refEntry.$value };
            }
          }
          return stop;
        });
        return { ...t, $value: resolvedStops };
      }
      const resolved = resolveTokenValue(t.$value, t.$type, allTokensFlat);
      return { ...t, $value: resolved.value ?? t.$value, $type: resolved.$type };
    });

  const doApplyVariables = useCallback((flat: any[]) => {
    parent.postMessage({ pluginMessage: { type: 'apply-variables', tokens: flat, collectionMap, modeMap } }, '*');
    setApplyResult({ type: 'variables', count: flat.length });
    setTimeout(() => setApplyResult(null), 3000);
  }, [collectionMap, modeMap, setApplyResult]);

  const handleApplyVariables = async () => {
    closeLongLivedReviewSurfaces();
    const flat = resolveFlat(flattenTokens(tokens)).map((t: any) => ({ ...t, setName }));
    setVarDiffLoading(true);
    try {
      const figmaTokens: any[] = await new Promise((resolve, reject) => {
        const cid = `tl-vars-${Date.now()}-${Math.random()}`;
        const timeout = setTimeout(() => {
          varReadPendingRef.current.delete(cid);
          reject(new Error('timeout'));
        }, 8000);
        varReadPendingRef.current.set(cid, (toks) => { clearTimeout(timeout); resolve(toks); });
        parent.postMessage({ pluginMessage: { type: 'read-variables', correlationId: cid } }, '*');
      });
      const figmaMap = new Map(figmaTokens.map((t: any) => [t.path, String(t.$value ?? '')]));
      let added = 0, modified = 0, unchanged = 0;
      for (const t of flat) {
        if (!figmaMap.has(t.path)) added++;
        else if (figmaMap.get(t.path) !== String(t.$value ?? '')) modified++;
        else unchanged++;
      }
      setVarDiffPending({ added, modified, unchanged, flat });
    } catch (err) {
      // Figma not reachable — show count-only confirmation
      console.warn('[TokenList] Figma variable diff failed:', err);
      setVarDiffPending({ added: flat.length, modified: 0, unchanged: 0, flat });
    } finally {
      setVarDiffLoading(false);
    }
  };

  const handleApplyStyles = async () => {
    setApplying(true);
    const flat = resolveFlat(flattenTokens(tokens));
    try {
      const result = await sendStyleApply('apply-styles', { tokens: flat });
      setApplyResult({ type: 'styles', count: result.count });
      if (result.failures.length > 0) {
        const failedPaths = result.failures.map(f => f.path).join(', ');
        onError?.(`${result.count}/${result.total} styles created. Failed: ${failedPaths}`);
      }
    } catch (err) {
      onError?.(getErrorMessage(err, 'Failed to apply styles'));
    } finally {
      setApplying(false);
      setTimeout(() => setApplyResult(null), 3000);
    }
  };


  const getDeleteModalProps = (): { title: string; description?: string; confirmLabel: string; pathList?: string[]; affectedRefs?: AffectedRef[]; generatorImpacts?: GeneratorImpact[]; themeImpacts?: ThemeImpact[] } | null => {
    if (!deleteConfirm) return null;
    const genImpacts = deleteConfirm.generatorImpacts.length > 0 ? deleteConfirm.generatorImpacts : undefined;
    const thmImpacts = deleteConfirm.themeImpacts.length > 0 ? deleteConfirm.themeImpacts : undefined;
    if (deleteConfirm.type === 'token') {
      const name = deleteConfirm.path.split('.').pop() ?? deleteConfirm.path;
      const { orphanCount, affectedRefs } = deleteConfirm;
      const setCount = new Set(affectedRefs.map(r => r.setName)).size;
      const parts: string[] = [];
      if (orphanCount > 0) parts.push(`break ${orphanCount} alias reference${orphanCount !== 1 ? 's' : ''} in ${setCount} set${setCount !== 1 ? 's' : ''}`);
      if (genImpacts) parts.push(`affect ${genImpacts.length} generator${genImpacts.length !== 1 ? 's' : ''}`);
      if (thmImpacts) parts.push(`affect ${thmImpacts.length} theme option${thmImpacts.length !== 1 ? 's' : ''}`);
      return {
        title: `Delete "${name}"?`,
        description: parts.length > 0 ? `This will ${parts.join(', ')}.` : `Token path: ${deleteConfirm.path}`,
        confirmLabel: 'Delete',
        affectedRefs: orphanCount > 0 ? affectedRefs : undefined,
        generatorImpacts: genImpacts,
        themeImpacts: thmImpacts,
      };
    }
    if (deleteConfirm.type === 'group') {
      const { orphanCount, affectedRefs } = deleteConfirm;
      const setCount = new Set(affectedRefs.map(r => r.setName)).size;
      const parts: string[] = [`delete ${deleteConfirm.tokenCount} token${deleteConfirm.tokenCount !== 1 ? 's' : ''}`];
      if (orphanCount > 0) parts.push(`break ${orphanCount} alias reference${orphanCount !== 1 ? 's' : ''} in ${setCount} set${setCount !== 1 ? 's' : ''}`);
      if (genImpacts) parts.push(`affect ${genImpacts.length} generator${genImpacts.length !== 1 ? 's' : ''}`);
      if (thmImpacts) parts.push(`affect ${thmImpacts.length} theme option${thmImpacts.length !== 1 ? 's' : ''}`);
      return {
        title: `Delete group "${deleteConfirm.name}"?`,
        description: `This will ${parts.join(', ')}.`,
        confirmLabel: `Delete group (${deleteConfirm.tokenCount} token${deleteConfirm.tokenCount !== 1 ? 's' : ''})`,
        affectedRefs: orphanCount > 0 ? affectedRefs : undefined,
        generatorImpacts: genImpacts,
        themeImpacts: thmImpacts,
      };
    }
    const { paths, orphanCount, affectedRefs } = deleteConfirm;
    const setCount = new Set(affectedRefs.map(r => r.setName)).size;
    const parts: string[] = [];
    if (orphanCount > 0) parts.push(`break ${orphanCount} alias reference${orphanCount !== 1 ? 's' : ''} in ${setCount} set${setCount !== 1 ? 's' : ''}`);
    if (genImpacts) parts.push(`affect ${genImpacts.length} generator${genImpacts.length !== 1 ? 's' : ''}`);
    if (thmImpacts) parts.push(`affect ${thmImpacts.length} theme option${thmImpacts.length !== 1 ? 's' : ''}`);
    return {
      title: `Delete ${paths.length} token${paths.length !== 1 ? 's' : ''}?`,
      description: parts.length > 0 ? `This will ${parts.join(', ')}.` : undefined,
      confirmLabel: `Delete ${paths.length} token${paths.length !== 1 ? 's' : ''}`,
      pathList: paths,
      affectedRefs: orphanCount > 0 ? affectedRefs : undefined,
      generatorImpacts: genImpacts,
      themeImpacts: thmImpacts,
    };
  };

  const modalProps = getDeleteModalProps();

  // handleJumpToGroup is managed by useTokenVirtualScroll (destructured above)

  // Collapse all groups that are descendants of the given group path,
  // keeping the ancestor chain expanded so the group header stays visible
  const handleCollapseBelow = useCallback((groupPath: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      const prefix = groupPath + '.';
      for (const p of prev) {
        if (p === groupPath || p.startsWith(prefix)) {
          next.delete(p);
        }
      }
      return next;
    });
    // Jump to the (now-collapsed) group header
    const idx = flatItems.findIndex(item => item.node.path === groupPath);
    if (idx >= 0 && virtualListRef.current) {
      const targetScrollTop = Math.max(0, itemOffsets[idx]);
      virtualListRef.current.scrollTop = targetScrollTop;
      setVirtualScrollTop(targetScrollTop);
    }
  }, [flatItems, itemOffsets, setExpandedPaths, setVirtualScrollTop]);

  const handleZoomIntoGroup = useCallback((groupPath: string) => {
    setZoomRootPath(groupPath);
    setVirtualScrollTop(0);
    if (virtualListRef.current) virtualListRef.current.scrollTop = 0;
    // Ensure the zoom target's children are visible
    setExpandedPaths(prev => { const next = new Set(prev); next.add(groupPath); return next; });
  }, [setExpandedPaths, setVirtualScrollTop, setZoomRootPath]);

  const handleZoomOut = useCallback(() => {
    setZoomRootPath(null);
    setVirtualScrollTop(0);
    if (virtualListRef.current) virtualListRef.current.scrollTop = 0;
  }, [setVirtualScrollTop, setZoomRootPath]);

  const handleZoomToAncestor = useCallback((ancestorPath: string) => {
    setZoomRootPath(ancestorPath || null);
    setVirtualScrollTop(0);
    if (virtualListRef.current) virtualListRef.current.scrollTop = 0;
  }, [setVirtualScrollTop, setZoomRootPath]);

  // Virtual scroll window computation — uses itemOffsets for variable-height rows
  const virtualContainerH = virtualListRef.current?.clientHeight ?? 500;
  const totalVirtualH = itemOffsets[flatItems.length];
  // Find the first item whose bottom edge is below virtualScrollTop
  let rawStart = 0;
  while (rawStart < flatItems.length && itemOffsets[rawStart + 1] <= virtualScrollTop) rawStart++;
  // Find the first item whose top edge is past the bottom of the viewport
  let rawEnd = rawStart;
  while (rawEnd < flatItems.length && itemOffsets[rawEnd] < virtualScrollTop + virtualContainerH) rawEnd++;
  const virtualStartIdx = Math.max(0, rawStart - VIRTUAL_OVERSCAN);
  const virtualEndIdx = Math.min(flatItems.length, rawEnd + VIRTUAL_OVERSCAN);
  const virtualTopPad = itemOffsets[virtualStartIdx];
  const virtualBottomPad = Math.max(0, totalVirtualH - itemOffsets[virtualEndIdx]);

  // Breadcrumb: build ancestor path segments for the first visible item
  // Map group paths → display names from the flat items list
  const groupNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const { node } of flatItems) {
      if (node.isGroup) map.set(node.path, node.name);
    }
    return map;
  }, [flatItems]);

  const zoomBreadcrumb = useMemo(() => {
    if (!zoomRootPath) return null;
    return buildZoomBreadcrumb(zoomRootPath, sortedTokens);
  }, [zoomRootPath, sortedTokens]);

  const breadcrumbSegments = useMemo(() => {
    if (flatItems.length === 0 || rawStart >= flatItems.length) return [];
    const topItem = flatItems[rawStart];
    if (topItem.depth === 0) return [];
    // Walk up the ancestor chain from the top visible item
    const segments: Array<{ name: string; path: string }> = [];
    let currentPath = topItem.node.path;
    let currentName = topItem.node.name;
    while (currentPath.length > currentName.length) {
      const parentPath = currentPath.slice(0, currentPath.length - currentName.length - 1);
      if (!parentPath) break;
      const parentName = groupNameMap.get(parentPath);
      if (parentName) {
        segments.unshift({ name: parentName, path: parentPath });
        currentPath = parentPath;
        currentName = parentName;
      } else {
        break;
      }
    }
    return segments;
  }, [flatItems, rawStart, groupNameMap]);

  // Enter select mode with a single token pre-selected, then navigate to compare tab
  const handleCompareToken = useCallback((path: string) => {
    if (onOpenCompare) {
      onOpenCompare(new Set([path]));
    } else {
      setSelectMode(true);
      setSelectedPaths(new Set([path]));
      setShowBatchEditor(false);
    }
  }, [onOpenCompare, setSelectMode, setSelectedPaths, setShowBatchEditor]);

  const handleCompareAcrossThemes = useCallback((path: string) => {
    if (onOpenCrossThemeCompare) {
      onOpenCrossThemeCompare(path);
    }
  }, [onOpenCrossThemeCompare]);

  // handleFindInAllSets is managed by useTokenWhereIs (destructured above)

  // Expose imperative actions to the parent via compareHandle ref
  useEffect(() => {
    if (!compareHandle) return;
    compareHandle.current = {
      openCompareMode: () => {
        setSelectMode(true);
        setShowBatchEditor(false);
      },
      showRecentlyTouched: () => {
        setShowRecentlyTouched(true);
      },
      toggleJsonView: () => {
        setViewMode(viewMode === 'json' ? 'tree' : 'json');
      },
      toggleStatsBar: () => {
        setStatsBarOpen(v => !v);
      },
      toggleResolvedValues: () => {
        setViewMode('tree');
        setShowResolvedValues(v => !v);
      },
      triggerInlineRename: (path: string) => {
        setPendingRenameToken(path);
      },
      triggerMoveToken: (path: string) => {
        handleRequestMoveTokenReview(path);
      },
      triggerExtractToAlias: (path: string, $type?: string, $value?: unknown) => {
        handleOpenExtractToAlias(path, $type, $value as any);
      },
    };
    return () => { compareHandle.current = null; };
  }, [compareHandle, setSelectMode, setShowBatchEditor, setShowRecentlyTouched, viewMode, setViewMode, setStatsBarOpen, setShowResolvedValues, setPendingRenameToken, handleRequestMoveTokenReview, handleOpenExtractToAlias]);

  const handleClearPendingRename = useCallback(() => setPendingRenameToken(null), [setPendingRenameToken]);

  // Effective roving focus path: if none has been set yet, default to the first visible row
  // so Tab-into-tree always lands on a meaningful starting point.
  const effectiveRovingPath = rovingFocusPath ?? flatItems[0]?.node.path ?? null;

  // --- Token tree context: shared state & callbacks for all TokenTreeNode instances ---
  const treeCtx: TokenTreeContextType = useMemo(() => ({
    density,
    serverUrl,
    setName,
    sets,
    selectionCapabilities,
    allTokensFlat,
    selectMode,
    expandedPaths,
    duplicateCounts,
    highlightedToken: highlightedToken ?? null,
    previewedPath: highlightedToken ?? null,
    inspectMode,
    syncSnapshot,
    cascadeDiff,
    generatorsBySource,
    generatorsByTargetGroup,
    derivedTokenPaths,
    tokenUsageCounts,
    searchHighlight,
    selectedNodes,
    dragOverGroup,
    dragOverGroupIsInvalid,
    dragSource,
    dragOverReorder,
    selectedLeafNodes,
    onEdit,
    onPreview,
    onDelete: requestDeleteToken,
    onDeleteGroup: requestDeleteGroup,
    onToggleSelect: handleTokenSelect,
    onSelectGroupChildren: handleSelectGroupChildren,
    onToggleExpand: handleToggleExpand,
    onNavigateToAlias,
    onRefresh,
    onPushUndo,
    onCreateSibling: handleOpenCreateSibling,
    onCreateGroup: setNewGroupDialogParent,
    onRenameGroup: handleRenameGroup,
    onUpdateGroupMeta: handleUpdateGroupMeta,
    onRequestMoveGroup: handleRequestMoveGroup,
    onRequestCopyGroup: handleRequestCopyGroup,
    onRequestMoveToken: handleRequestMoveTokenReview,
    onRequestCopyToken: handleRequestCopyTokenReview,
    onDuplicateGroup: handleDuplicateGroup,
    onDuplicateToken: handleDuplicateToken,
    onExtractToAlias: handleOpenExtractToAlias,
    onHoverToken: handleHoverToken,
    onExtractToAliasForLint: handleOpenExtractToAlias,
    onSyncGroup,
    onSyncGroupStyles,
    onSetGroupScopes,
    onGenerateScaleFromGroup,
    onFilterByType: setTypeFilter,
    onJumpToGroup: handleJumpToGroup,
    onZoomIntoGroup: handleZoomIntoGroup,
    onInlineSave: handleInlineSave,
    onRenameToken: handleRenameToken,
    onDetachFromGenerator: handleDetachFromGenerator,
    onEditGenerator,
    onNavigateToGenerator,
    onRegenerateGenerator: handleRegenerateGenerator,
    onToggleChain: handleToggleChain,
    onToggleStar,
    starredPaths,
    onCompareToken: handleCompareToken,
    onViewTokenHistory,
    onShowReferences,
    onCompareAcrossThemes: dimensions.length > 0 ? handleCompareAcrossThemes : undefined,
    onFindInAllSets: sets.length > 1 ? handleFindInAllSets : undefined,
    onDragStart: handleDragStartNotify,
    onDragEnd: handleDragEndNotify,
    onDragOverGroup: handleDragOverGroup,
    onDropOnGroup: handleDropOnGroup,
    onDragOverToken: handleDragOverToken,
    onDragLeaveToken: handleDragLeaveToken,
    onDropOnToken: handleDropReorder,
    onMultiModeInlineSave: multiModeData ? handleMultiModeInlineSave : undefined,
    showResolvedValues,
    condensedView,
    themeCoverage,
    pathToSet,
    dimensions,
    activeThemes,
    pendingRenameToken,
    clearPendingRename: handleClearPendingRename,
    pendingTabEdit,
    clearPendingTabEdit: handleClearPendingTabEdit,
    onTabToNext: handleTabToNext,
    rovingFocusPath: effectiveRovingPath,
    onRovingFocus: setRovingFocusPath,
  }), [
    density, serverUrl, setName, sets, selectionCapabilities, allTokensFlat, selectMode, expandedPaths,
    duplicateCounts, highlightedToken, inspectMode, syncSnapshot, cascadeDiff,
    generatorsBySource, generatorsByTargetGroup, derivedTokenPaths, tokenUsageCounts, searchHighlight,
    selectedNodes, dragOverGroup, dragOverGroupIsInvalid, dragSource,
    dragOverReorder, selectedLeafNodes, onEdit, onPreview, requestDeleteToken,
    requestDeleteGroup, handleTokenSelect, handleToggleExpand, handleSelectGroupChildren, onNavigateToAlias,
    onRefresh, onPushUndo,
    handleOpenCreateSibling, handleRenameGroup, handleUpdateGroupMeta,
    handleRequestMoveGroup, handleRequestCopyGroup, handleRequestMoveTokenReview, handleRequestCopyTokenReview,
    setNewGroupDialogParent, onEditGenerator, onNavigateToGenerator, handleDuplicateGroup,
    handleDuplicateToken, handleOpenExtractToAlias, handleHoverToken,
    onSyncGroup, onSyncGroupStyles, onSetGroupScopes, onGenerateScaleFromGroup,
    setTypeFilter, handleJumpToGroup, handleInlineSave, handleRenameToken,
    handleDetachFromGenerator, handleRegenerateGenerator, handleToggleChain, handleZoomIntoGroup,
    handleCompareToken, onViewTokenHistory, onShowReferences, handleCompareAcrossThemes, handleFindInAllSets, handleDragStartNotify, handleDragEndNotify, handleDragOverGroup, handleDropOnGroup,
    handleDragOverToken, handleDragLeaveToken, handleDropReorder,
    multiModeData, handleMultiModeInlineSave, showResolvedValues, condensedView, themeCoverage,
    onToggleStar, starredPaths,
    pathToSet, dimensions, activeThemes, pendingRenameToken, handleClearPendingRename,
    pendingTabEdit, handleClearPendingTabEdit, handleTabToNext,
    effectiveRovingPath, setRovingFocusPath,
    sets,
  ]);

  // Build modal context value — memoized so TokenListModals only re-renders when
  // modal-related state actually changes, not on every TokenList render.
  const modalContextValue = useMemo<TokenListModalsState>(() => ({
    setName,
    sets,
    allTokensFlat,
    connected,
    deleteConfirm,
    modalProps,
    executeDelete,
    onSetDeleteConfirm: setDeleteConfirm,
    newGroupDialogParent,
    newGroupName,
    newGroupError,
    onSetNewGroupName: setNewGroupName,
    onSetNewGroupError: setNewGroupError,
    handleCreateGroup,
    onSetNewGroupDialogParent: setNewGroupDialogParent,
    renameTokenConfirm,
    executeTokenRename,
    onSetRenameTokenConfirm: setRenameTokenConfirm,
    renameGroupConfirm,
    executeGroupRename,
    onSetRenameGroupConfirm: setRenameGroupConfirm,
    varDiffPending,
    doApplyVariables,
    onSetVarDiffPending: setVarDiffPending,
    extractToken,
    extractMode,
    onSetExtractMode: setExtractMode,
    newPrimitivePath,
    onSetNewPrimitivePath: setNewPrimitivePath,
    newPrimitiveSet,
    onSetNewPrimitiveSet: setNewPrimitiveSet,
    existingAlias,
    onSetExistingAlias: setExistingAlias,
    existingAliasSearch,
    onSetExistingAliasSearch: setExistingAliasSearch,
    extractError,
    onSetExtractError: setExtractError,
    handleConfirmExtractToAlias,
    onSetExtractToken: setExtractToken,
    showFindReplace,
    frFind,
    frReplace,
    frIsRegex,
    frScope,
    frTarget,
    frError,
    frBusy,
    frRegexError,
    frPreview,
    frValuePreview,
    frConflictCount,
    frRenameCount,
    frValueCount,
    frAliasImpact,
    frTypeFilter,
    frAvailableTypes,
    onSetFrFind: setFrFind,
    onSetFrReplace: setFrReplace,
    onSetFrIsRegex: setFrIsRegex,
    onSetFrScope: setFrScope,
    onSetFrTarget: setFrTarget,
    onSetFrTypeFilter: setFrTypeFilter,
    onSetFrError: setFrError,
    onSetShowFindReplace: setShowFindReplace,
    handleFindReplace,
    cancelFindReplace,
    promoteRows,
    promoteBusy,
    onSetPromoteRows: setPromoteRows,
    handleConfirmPromote,
    movingToken,
    movingGroup,
    moveTargetSet: movingGroup ? moveGroupTargetSet : moveTokenTargetSet,
    onSetMoveTargetSet: movingGroup ? setMoveGroupTargetSet : handleChangeMoveTokenTargetSet,
    onSetMovingToken: setMovingToken,
    onSetMovingGroup: setMovingGroup,
    handleConfirmMoveToken,
    handleConfirmMoveGroup,
    moveConflict: movingToken ? moveConflict : null,
    moveConflictAction,
    onSetMoveConflictAction: setMoveConflictAction,
    moveConflictNewPath,
    onSetMoveConflictNewPath: setMoveConflictNewPath,
    moveSourceToken: movingToken ? (allTokensFlat[movingToken] ?? null) : null,
    copyingToken,
    copyingGroup,
    copyTargetSet: copyingGroup ? copyGroupTargetSet : copyTokenTargetSet,
    onSetCopyTargetSet: copyingGroup ? setCopyGroupTargetSet : handleChangeCopyTokenTargetSet,
    onSetCopyingToken: setCopyingToken,
    onSetCopyingGroup: setCopyingGroup,
    handleConfirmCopyToken,
    handleConfirmCopyGroup,
    copyConflict: copyingToken ? copyConflict : null,
    copyConflictAction,
    onSetCopyConflictAction: setCopyConflictAction,
    copyConflictNewPath,
    onSetCopyConflictNewPath: setCopyConflictNewPath,
    copySourceToken: copyingToken ? (allTokensFlat[copyingToken] ?? null) : null,
    showMoveToGroup,
    moveToGroupTarget,
    moveToGroupError,
    selectedMoveCount: selectedPaths.size,
    onSetShowMoveToGroup: setShowMoveToGroup,
    onSetMoveToGroupTarget: setMoveToGroupTarget,
    onSetMoveToGroupError: setMoveToGroupError,
    handleBatchMoveToGroup,
    showBatchMoveToSet,
    batchMoveToSetTarget,
    onSetBatchMoveToSetTarget: setBatchMoveToSetTarget,
    onSetShowBatchMoveToSet: setShowBatchMoveToSet,
    handleBatchMoveToSet,
    showBatchCopyToSet,
    batchCopyToSetTarget,
    onSetBatchCopyToSetTarget: setBatchCopyToSetTarget,
    onSetShowBatchCopyToSet: setShowBatchCopyToSet,
    handleBatchCopyToSet,
  }), [
    setName, sets, allTokensFlat, connected,
    deleteConfirm, modalProps, executeDelete,
    newGroupDialogParent, newGroupName, newGroupError, handleCreateGroup,
    renameTokenConfirm, executeTokenRename,
    renameGroupConfirm, executeGroupRename,
    varDiffPending, doApplyVariables,
    extractToken, extractMode, newPrimitivePath, newPrimitiveSet,
    existingAlias, existingAliasSearch, extractError, handleConfirmExtractToAlias,
    showFindReplace, frFind, frReplace, frIsRegex, frScope, frTarget,
    frError, frBusy, frRegexError, frPreview, frValuePreview,
    frConflictCount, frRenameCount, frValueCount, frAliasImpact,
    frTypeFilter, frAvailableTypes, handleFindReplace, cancelFindReplace,
    promoteRows, promoteBusy, handleConfirmPromote,
    movingToken, movingGroup, moveGroupTargetSet, moveTokenTargetSet,
    setMoveGroupTargetSet, handleChangeMoveTokenTargetSet,
    handleConfirmMoveToken, handleConfirmMoveGroup,
    moveConflict, moveConflictAction, setMoveConflictAction, moveConflictNewPath, setMoveConflictNewPath,
    copyingToken, copyingGroup, copyGroupTargetSet, copyTokenTargetSet,
    setCopyGroupTargetSet, handleChangeCopyTokenTargetSet,
    handleConfirmCopyToken, handleConfirmCopyGroup,
    copyConflict, copyConflictAction, setCopyConflictAction, copyConflictNewPath, setCopyConflictNewPath,
    showMoveToGroup, moveToGroupTarget, moveToGroupError,
    selectedPaths, handleBatchMoveToGroup,
    showBatchMoveToSet, batchMoveToSetTarget, handleBatchMoveToSet,
    showBatchCopyToSet, batchCopyToSetTarget, handleBatchCopyToSet,
    setCopyingGroup, setCopyingToken, setDeleteConfirm, setExistingAlias, setExistingAliasSearch,
    setExtractError, setExtractMode, setExtractToken, setFrError, setFrFind, setFrIsRegex,
    setFrReplace, setFrScope, setFrTarget, setFrTypeFilter, setMovingGroup, setMovingToken,
    setNewGroupDialogParent, setNewGroupError, setNewGroupName, setNewPrimitivePath, setNewPrimitiveSet,
    setPromoteRows, setRenameGroupConfirm, setRenameTokenConfirm, setShowFindReplace,
  ]);

  const showStaleGeneratorBanner =
    staleGeneratorsForSet.length > 0 &&
    dismissedStaleGeneratorSignature !== staleGeneratorSignature;

  return (
    <div
      className="flex flex-col h-full relative"
      data-tokens-library-surface-slot={librarySurfaceSlot}
      onKeyDown={handleListKeyDown}
    >
      {/* ⌘⌥C alias-ref copy feedback toast */}
      {copyAliasFeedback && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 pointer-events-none px-3 py-1 rounded bg-[var(--color-figma-bg-brand,var(--color-figma-accent))] text-white text-[11px] font-medium shadow-md" aria-live="polite">
          Copied!
        </div>
      )}
      {/* ⌘⇧C preferred-format copy feedback toast */}
      {copyPreferredFeedback && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 pointer-events-none px-3 py-1 rounded bg-[var(--color-figma-bg-brand,var(--color-figma-accent))] text-white text-[11px] font-medium shadow-md" aria-live="polite">
          Copied!
        </div>
      )}
      {/* Toolbars — fixed above the scrollable token list */}
      <div className="flex-shrink-0">
        {/* Select mode toolbar */}
        {selectMode && (
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] flex-1">
              {selectedPaths.size} of {displayedLeafPaths.size} selected
              <span className="ml-2 opacity-60">· Tab to navigate · Space to toggle</span>
            </span>
            <button
              onClick={handleSelectAll}
              className="px-2 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              {[...displayedLeafPaths].every(p => selectedPaths.has(p)) && displayedLeafPaths.size > 0 ? 'Deselect all' : 'Select all'}
            </button>
            {selectedPaths.size > 0 && (
              <>
                <button
                  onClick={() => setShowBatchEditor(v => !v)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${showBatchEditor ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                >
                  Bulk edit {selectedPaths.size}
                </button>
                {selectedPaths.size >= 2 && onOpenCompare && (
                  <button
                    onClick={() => onOpenCompare(selectedPaths)}
                    className="px-2 py-1 rounded text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                  >
                    Compare
                  </button>
                )}
                <button
                  onClick={() => handleOpenPromoteReview()}
                  className="px-2 py-1 rounded text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  Link to tokens
                </button>
                <button
                  onClick={() => { setMoveToGroupTarget(''); setMoveToGroupError(''); setShowMoveToGroup(true); }}
                  disabled={!!operationLoading}
                  className="px-2 py-1 rounded text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  Move to group…
                </button>
                {sets.length > 1 && (
                  <>
                    <button
                      onClick={() => { setBatchMoveToSetTarget(sets.filter(s => s !== setName)[0] ?? ''); setShowBatchMoveToSet(true); }}
                      disabled={!!operationLoading}
                      title={`Move selected tokens to another set (⌘⇧M)`}
                      className="px-2 py-1 rounded text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-50 disabled:pointer-events-none"
                    >
                      Move to set…
                    </button>
                    <button
                      onClick={() => { setBatchCopyToSetTarget(sets.filter(s => s !== setName)[0] ?? ''); setShowBatchCopyToSet(true); }}
                      disabled={!!operationLoading}
                      title={`Copy selected tokens to another set (⌘⇧Y)`}
                      className="px-2 py-1 rounded text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-50 disabled:pointer-events-none"
                    >
                      Copy to set…
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    const nodes = displayedLeafNodes.filter(n => selectedPaths.has(n.path));
                    copyTokensAsJson(nodes);
                  }}
                  className="px-2 py-1 rounded text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  <span aria-live="polite">{copyFeedback ? 'Copied!' : 'Copy JSON'}</span>
                </button>
                <button
                  onClick={() => {
                    const nodes = displayedLeafNodes.filter(n => selectedPaths.has(n.path));
                    copyTokensAsCssVar(nodes);
                  }}
                  className="px-2 py-1 rounded text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  <span aria-live="polite">{copyCssFeedback ? 'Copied!' : 'Copy CSS var'}</span>
                </button>
                <button
                  title="Copy as DTCG alias reference — {path.to.token} (⌘⌥C)"
                  onClick={() => {
                    const nodes = displayedLeafNodes.filter(n => selectedPaths.has(n.path));
                    copyTokensAsDtcgRef(nodes);
                  }}
                  className="px-2 py-1 rounded text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors font-mono"
                >
                  <span aria-live="polite">{copyAliasFeedback ? 'Copied!' : 'Copy {ref}'}</span>
                </button>
                <button
                  onClick={requestBulkDelete}
                  disabled={!!operationLoading}
                  className="px-2 py-1 rounded text-[10px] font-medium text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  Delete {selectedPaths.size}
                </button>
              </>
            )}
            <button
              onClick={() => { setSelectMode(false); setSelectedPaths(new Set()); setShowBatchEditor(false); }}
              className="px-2 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Batch editor panel */}
        {selectMode && showBatchEditor && selectedPaths.size > 0 && (
          <div ref={batchEditorPanelRef}>
            <BatchEditor
              selectedPaths={selectedPaths}
              allTokensFlat={allTokensFlat}
              setName={setName}
              sets={sets}
              serverUrl={serverUrl}
              connected={connected}
              onApply={onRefresh}
              onPushUndo={onPushUndo}
              onRequestDelete={requestBulkDelete}
              selectionScope={activeBulkEditScope}
            />
          </div>
        )}

        {!showBatchEditor && varDiffPending && (
          <VariableDiffReviewPanel
            pending={varDiffPending}
            onApply={() => {
              doApplyVariables(varDiffPending.flat);
              setVarDiffPending(null);
            }}
            onClose={() => setVarDiffPending(null)}
          />
        )}

        {!showBatchEditor && promoteRows !== null && (
          <PromoteReviewPanel
            rows={promoteRows}
            busy={promoteBusy}
            onRowsChange={setPromoteRows}
            onConfirm={handleConfirmPromote}
            onClose={() => setPromoteRows(null)}
          />
        )}

        {!showBatchEditor && movingToken && (
          <RelocateTokenReviewPanel
            mode="move"
            tokenPath={movingToken}
            setName={setName}
            sets={sets}
            targetSet={moveTokenTargetSet}
            onTargetSetChange={handleChangeMoveTokenTargetSet}
            conflict={moveConflict}
            conflictAction={moveConflictAction}
            onConflictActionChange={setMoveConflictAction}
            conflictNewPath={moveConflictNewPath}
            onConflictNewPathChange={setMoveConflictNewPath}
            sourceToken={allTokensFlat[movingToken] ?? null}
            onConfirm={handleConfirmMoveToken}
            onClose={() => setMovingToken(null)}
          />
        )}

        {!showBatchEditor && copyingToken && (
          <RelocateTokenReviewPanel
            mode="copy"
            tokenPath={copyingToken}
            setName={setName}
            sets={sets}
            targetSet={copyTokenTargetSet}
            onTargetSetChange={handleChangeCopyTokenTargetSet}
            conflict={copyConflict}
            conflictAction={copyConflictAction}
            onConflictActionChange={setCopyConflictAction}
            conflictNewPath={copyConflictNewPath}
            onConflictNewPathChange={setCopyConflictNewPath}
            sourceToken={allTokensFlat[copyingToken] ?? null}
            onConfirm={handleConfirmCopyToken}
            onClose={() => setCopyingToken(null)}
          />
        )}

        {/* Navigation back button — appears after alias navigation */}
        {(navHistoryLength ?? 0) > 0 && !selectMode && (
          <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            <button
              onClick={onNavigateBack}
              className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
              title="Go back to previous token (Alt+←)"
              aria-label="Go back to previous token"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            {(navHistoryLength ?? 0) > 1 && (
              <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">({navHistoryLength})</span>
            )}
          </div>
        )}

        {/* Search-first library toolbar with advanced controls collapsed behind one entry */}
        {tokens.length > 0 && !selectMode && viewMode === 'tree' && (
          <div className="flex flex-col border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            <div className="flex flex-wrap items-start gap-2 px-2 py-2">
              <div className="min-w-[180px] flex-[999_1_0%]">
                <div className="relative">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
                    <circle cx="4" cy="4" r="3"/>
                    <path d="M6.5 6.5L9 9" strokeLinecap="round"/>
                  </svg>
                  <input
                    ref={searchRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                      setHintIndex(0);
                    }}
                    onFocus={() => { setShowQualifierHints(true); }}
                    onBlur={() => { setTimeout(() => setShowQualifierHints(false), 150); }}
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        if (searchQuery) { setSearchQuery(''); setHintIndex(0); }
                        searchRef.current?.blur();
                        return;
                      }
                      if (!showQualifierHints || qualifierHints.length === 0) return;
                      if (e.key === 'ArrowDown') { e.preventDefault(); setHintIndex(i => Math.min(i + 1, qualifierHints.length - 1)); }
                      else if (e.key === 'ArrowUp') { e.preventDefault(); setHintIndex(i => Math.max(i - 1, 0)); }
                      else if (e.key === 'Tab' || (e.key === 'Enter' && qualifierHints.length > 0)) {
                        const hint = qualifierHints[hintIndex];
                        if (!hint || hint.kind !== 'replacement') return;
                        e.preventDefault();
                        setSearchQuery(replaceQueryToken(searchQuery, activeQueryToken, hint.replacement));
                        setHintIndex(0);
                      }
                    }}
                    placeholder="Search names, paths, or descriptions"
                    title={searchTooltip}
                    className={`w-full rounded border bg-[var(--color-figma-bg)] py-1.5 pl-6 text-[10px] text-[var(--color-figma-text)] outline-none placeholder:text-[var(--color-figma-text-tertiary)] ${searchQuery ? 'pr-6' : 'pr-2'} ${structuredFilterChips.length > 0 ? 'border-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] focus-visible:border-[var(--color-figma-accent)]'}`}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => { setSearchQuery(''); setHintIndex(0); searchRef.current?.focus(); }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
                      title="Clear search"
                      aria-label="Clear search"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  {showQualifierHints && activeQueryToken.token.includes(':') && qualifierHints.length > 0 && (
                    <div ref={qualifierHintsRef} className="absolute left-0 top-full z-50 mt-0.5 max-h-48 w-full overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shadow-lg">
                      {qualifierHints.map((hint, i) => (
                        <button
                          key={hint.id}
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            if (hint.kind !== 'replacement') return;
                            setSearchQuery(replaceQueryToken(searchQuery, activeQueryToken, hint.replacement));
                            setHintIndex(0);
                            searchRef.current?.focus();
                          }}
                          className={`flex w-full items-center gap-2 px-2 py-1 text-left text-[10px] ${i === hintIndex ? 'bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text)]' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'} ${hint.kind === 'replacement' ? '' : 'cursor-default'}`}
                        >
                          <span className="font-mono font-semibold text-[var(--color-figma-accent)]">{hint.label}</span>
                          <span className="truncate">{hint.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-1 pl-0.5 text-[9px] text-[var(--color-figma-text-tertiary)]">
                  Search text stays simple. Use <span className="font-medium text-[var(--color-figma-text-secondary)]">Add filter</span> for type, token-state, path, value, description, or generator filters.
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleOpenPrimaryCreate}
                  disabled={!connected}
                  title="Create a new token (N)"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded bg-[var(--color-figma-accent)] px-2.5 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="text-[11px] leading-none">+</span>
                  <span>New token</span>
                </button>

                <button
                  onClick={toggleFilterBuilder}
                  aria-expanded={filterBuilderOpen || hasStructuredFilters}
                  aria-haspopup="dialog"
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded border px-2 py-1.5 text-[10px] font-medium transition-colors ${(filterBuilderOpen || hasStructuredFilters) ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]'}`}
                  title="Build filters without typing query clauses"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
                  </svg>
                  <span>{hasStructuredFilters ? 'Filters' : 'Add filter'}</span>
                  {structuredFilterChips.length > 0 && (
                    <span className="rounded-full bg-[var(--color-figma-accent)] px-1.5 py-0.5 text-[9px] leading-none text-white">
                      {structuredFilterChips.length}
                    </span>
                  )}
                </button>

                <div className="relative shrink-0" ref={bulkWorkflowRef}>
                  <button
                    onClick={() => setBulkWorkflowOpen(open => !open)}
                    aria-expanded={bulkWorkflowOpen}
                    aria-haspopup="dialog"
                    className={`inline-flex items-center gap-1.5 rounded border px-2 py-1.5 text-[10px] font-medium transition-colors ${bulkWorkflowOpen ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]'}`}
                    title="Open the bulk-edit workflow"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 11H3" />
                      <path d="M21 11h-6" />
                      <path d="M12 8v6" />
                      <path d="M4 6h4v10H4z" />
                      <path d="M16 4h4v14h-4z" />
                    </svg>
                    <span>Bulk edit</span>
                    <span className="rounded-full bg-[var(--color-figma-accent)] px-1.5 py-0.5 text-[9px] leading-none text-white">
                      {displayedLeafNodes.length}
                    </span>
                  </button>

                  {bulkWorkflowOpen && (
                    <div className="absolute right-0 top-full z-50 mt-1 w-[320px] overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl">
                      <div className="border-b border-[var(--color-figma-border)] px-3 py-2">
                        <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">Bulk maintenance</div>
                        <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                          Launch bulk edits directly from the current search scope or a saved preset without hand-picking rows first.
                        </div>
                      </div>
                      <div className="space-y-3 p-3">
                        <section className="space-y-2">
                          <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">Current scope</div>
                          <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2">
                            <div className="text-[10px] font-medium text-[var(--color-figma-text)]">{currentBulkEditScope.title}</div>
                            <div className="mt-0.5 text-[9px] text-[var(--color-figma-text-tertiary)]">
                              {currentBulkEditScope.detail}
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                                {displayedLeafNodes.length} token{displayedLeafNodes.length === 1 ? '' : 's'} ready
                              </div>
                              <button
                                onClick={handleOpenBulkWorkflowForVisibleTokens}
                                disabled={bulkWorkflowDisabledReason !== null}
                                className="rounded bg-[var(--color-figma-accent)] px-2.5 py-1 text-[10px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Edit results
                              </button>
                            </div>
                            {bulkWorkflowDisabledReason && (
                              <div className="mt-2 text-[10px] text-[var(--color-figma-text-tertiary)]">
                                {bulkWorkflowDisabledReason}
                              </div>
                            )}
                          </div>
                        </section>

                        <section className="space-y-2">
                          <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">Saved scopes</div>
                          {filterPresets.length === 0 ? (
                            <div className="rounded border border-dashed border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-2 text-[10px] text-[var(--color-figma-text-tertiary)]">
                              Save a filter preset in View options to reopen the same bulk-edit scope later.
                            </div>
                          ) : (
                            <div className="max-h-[220px] space-y-1 overflow-y-auto">
                              {filterPresets.map(preset => {
                                const launchingPreset = pendingBulkPresetLaunch?.presetId === preset.id;
                                return (
                                  <div key={preset.id} className="flex items-center gap-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
                                    <button
                                      onClick={() => handleOpenBulkWorkflowForPreset(preset)}
                                      className="min-w-0 flex-1 text-left"
                                      title={`Launch bulk edit for ${preset.query}`}
                                    >
                                      <div className="truncate text-[10px] font-medium text-[var(--color-figma-text)]">{preset.name}</div>
                                      <div className="truncate font-mono text-[9px] text-[var(--color-figma-text-tertiary)]">{preset.query}</div>
                                    </button>
                                    <button
                                      onClick={() => handleOpenBulkWorkflowForPreset(preset)}
                                      className="shrink-0 rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                                    >
                                      {launchingPreset ? 'Preparing…' : 'Use'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </section>
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative shrink-0" ref={viewOptionsRef}>
                  <button
                    onClick={() => setViewOptionsOpen(v => !v)}
                    aria-expanded={viewOptionsOpen}
                    aria-haspopup="dialog"
                    className={`inline-flex items-center gap-1.5 rounded border px-2 py-1.5 text-[10px] font-medium transition-colors ${viewOptionsOpen ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]'}`}
                    title="View options and advanced actions"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="4" y1="21" x2="4" y2="14" />
                      <line x1="4" y1="10" x2="4" y2="3" />
                      <line x1="12" y1="21" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12" y2="3" />
                      <line x1="20" y1="21" x2="20" y2="16" />
                      <line x1="20" y1="12" x2="20" y2="3" />
                      <line x1="1" y1="14" x2="7" y2="14" />
                      <line x1="9" y1="8" x2="15" y2="8" />
                      <line x1="17" y1="16" x2="23" y2="16" />
                    </svg>
                    <span>View options</span>
                    {viewOptionsActiveCount > 0 && (
                      <span className="rounded-full bg-[var(--color-figma-accent)] px-1.5 py-0.5 text-[9px] leading-none text-white">
                        {viewOptionsActiveCount}
                      </span>
                    )}
                  </button>

                  {viewOptionsOpen && (
                    <div className="absolute right-0 top-full z-50 mt-1 w-[320px] overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl">
                    <div className="border-b border-[var(--color-figma-border)] px-3 py-2">
                      <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">Library options</div>
                      <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                        Keep the main library flow focused on sets, theme mode, search, and creation. Advanced controls live here.
                      </div>
                    </div>

                    <div className="max-h-[420px] space-y-4 overflow-y-auto p-3">
                      <section className="space-y-2">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">View</div>
                        {tokens.some(n => n.isGroup) && (
                          <div className="flex gap-2">
                            <button
                              onClick={handleExpandAll}
                              className="flex-1 rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                            >
                              Expand all
                            </button>
                            <button
                              onClick={handleCollapseAll}
                              className="flex-1 rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                            >
                              Collapse all
                            </button>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => {
                              const cycle: Density[] = ['compact', 'comfortable'];
                              setDensity(cycle[(cycle.indexOf(density) + 1) % cycle.length]);
                            }}
                            className={`rounded border px-2 py-1 text-[10px] font-medium transition-colors ${density === 'compact' ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
                          >
                            Density: {density === 'compact' ? 'Compact' : 'Comfortable'}
                          </button>
                          <button
                            onClick={() => setCondensedView(v => !v)}
                            className={`rounded border px-2 py-1 text-[10px] font-medium transition-colors ${condensedView ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
                          >
                            {condensedView ? 'Condensed on' : 'Condense deep groups'}
                          </button>
                        </div>
                        {dimensions.length > 0 && (
                          <div className="space-y-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="text-[10px] font-medium text-[var(--color-figma-text)]">Mode columns</div>
                                <div className="text-[9px] text-[var(--color-figma-text-tertiary)]">Compare resolved values across theme options inline.</div>
                              </div>
                              <button
                                onClick={toggleMultiMode}
                                className={`rounded-full px-2 py-1 text-[10px] font-medium transition-colors ${multiModeEnabled ? 'bg-[var(--color-figma-accent)] text-white' : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
                              >
                                {multiModeEnabled ? 'On' : 'Off'}
                              </button>
                            </div>
                            {multiModeEnabled && dimensions.length > 1 && (
                              <label className="flex flex-col gap-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                                Dimension
                                <select
                                  value={multiModeDimId ?? ''}
                                  onChange={e => setMultiModeDimId(e.target.value)}
                                  className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] text-[var(--color-figma-text)] outline-none"
                                >
                                  {dimensions.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </div>
                        )}
                        <button
                          onClick={() => {
                            onTogglePreviewSplit?.();
                            setViewOptionsOpen(false);
                          }}
                          className={`w-full rounded border px-2 py-1 text-[10px] font-medium transition-colors ${showPreviewSplit ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
                        >
                          {showPreviewSplit ? 'Hide split preview' : 'Show split preview'}
                        </button>
                      </section>

                      <section className="space-y-2">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">Filters</div>
                        <label className="flex flex-col gap-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                          Sort
                          <select
                            value={sortOrder}
                            onChange={e => setSortOrder(e.target.value as SortOrder)}
                            className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] text-[var(--color-figma-text)] outline-none"
                          >
                            <option value="default">Default order</option>
                            <option value="alpha-asc">A to Z</option>
                            <option value="by-type">Group by type</option>
                          </select>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {lintViolations.length > 0 && (
                            <button
                              onClick={() => onToggleIssuesOnly?.()}
                              className={`rounded border px-2 py-1 text-[10px] font-medium transition-colors ${showIssuesOnly ? 'border-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
                            >
                              Issues only ({lintViolations.length})
                            </button>
                          )}
                          {recentlyTouched.count > 0 && (
                            <button
                              onClick={() => setShowRecentlyTouched(v => !v)}
                              className={`rounded border px-2 py-1 text-[10px] font-medium transition-colors ${showRecentlyTouched ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
                            >
                              Recent ({recentlyTouched.count})
                            </button>
                          )}
                          <button
                            onClick={() => setInspectMode(v => !v)}
                            className={`rounded border px-2 py-1 text-[10px] font-medium transition-colors ${inspectMode ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
                          >
                            Selection only
                          </button>
                          {sets.length > 1 && (
                            <button
                              onClick={() => setCrossSetSearch(!crossSetSearch)}
                              className={`rounded border px-2 py-1 text-[10px] font-medium transition-colors ${crossSetSearch ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
                            >
                              Search all sets
                            </button>
                          )}
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] font-medium text-[var(--color-figma-text)]">Values shown</div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => setRefFilter('all')}
                              className={`flex-1 rounded border px-2 py-1 text-[10px] font-medium transition-colors ${refFilter === 'all' ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)] text-white' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
                            >
                              All
                            </button>
                            <button
                              onClick={() => setRefFilter('aliases')}
                              className={`flex-1 rounded border px-2 py-1 text-[10px] font-medium transition-colors ${refFilter === 'aliases' ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)] text-white' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
                            >
                              References
                            </button>
                            <button
                              onClick={() => setRefFilter('direct')}
                              className={`flex-1 rounded border px-2 py-1 text-[10px] font-medium transition-colors ${refFilter === 'direct' ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)] text-white' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
                            >
                              Direct
                            </button>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowDuplicates(!showDuplicates)}
                          className={`w-full rounded border px-2 py-1 text-[10px] font-medium transition-colors ${showDuplicates ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'}`}
                        >
                          Duplicate values
                        </button>
                        <div className="space-y-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2">
                          <div>
                            <div className="text-[10px] font-medium text-[var(--color-figma-text)]">Filter presets</div>
                            <div className="mt-0.5 text-[9px] text-[var(--color-figma-text-tertiary)]">Save the current search state for repeated library reviews.</div>
                          </div>
                          {filterPresets.length === 0 ? (
                            <div className="text-[10px] text-[var(--color-figma-text-tertiary)]">No saved presets yet.</div>
                          ) : (
                            <div className="space-y-1">
                              {filterPresets.map(preset => (
                                <div key={preset.id} className="flex items-center gap-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1">
                                  <button
                                    onClick={() => {
                                      applyFilterPreset(preset);
                                      setViewOptionsOpen(false);
                                    }}
                                    className="min-w-0 flex-1 text-left"
                                    title={`Apply: ${preset.query}`}
                                  >
                                    <div className="truncate text-[10px] font-medium text-[var(--color-figma-text)]">{preset.name}</div>
                                    <div className="truncate font-mono text-[9px] text-[var(--color-figma-text-tertiary)]">{preset.query}</div>
                                  </button>
                                  <button
                                    onClick={() => deleteFilterPreset(preset.id)}
                                    title="Delete preset"
                                    aria-label={`Delete preset "${preset.name}"`}
                                    className="shrink-0 text-[var(--color-figma-text-tertiary)] transition-colors hover:text-[var(--color-figma-text-secondary)]"
                                  >
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M18 6L6 18M6 6l12 12"/>
                                    </svg>
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <form
                            onSubmit={e => {
                              e.preventDefault();
                              saveFilterPreset(presetNameInput);
                            }}
                            className="flex gap-1"
                          >
                            <input
                              type="text"
                              value={presetNameInput}
                              onChange={e => setPresetNameInput(e.target.value)}
                              placeholder={searchQuery.trim() ? 'Preset name…' : 'Search first to save a preset'}
                              disabled={!searchQuery.trim()}
                              className="min-w-0 flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] text-[var(--color-figma-text)] outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            />
                            <button
                              type="submit"
                              disabled={!searchQuery.trim() || !presetNameInput.trim()}
                              className="rounded bg-[var(--color-figma-accent)] px-2 py-1 text-[10px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Save
                            </button>
                          </form>
                        </div>
                      </section>

                      <section className="space-y-2">
                        <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">Advanced actions</div>
                        <button
                          onClick={() => {
                            setSelectMode(true);
                            setShowBatchEditor(false);
                            setViewOptionsOpen(false);
                          }}
                          className="w-full rounded border border-[var(--color-figma-border)] px-2 py-1 text-left text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                        >
                          Open manual multi-select
                        </button>
                        <button
                          onClick={() => {
                            onOpenStartHere?.('template-library');
                            setViewOptionsOpen(false);
                          }}
                          className="w-full rounded border border-[var(--color-figma-border)] px-2 py-1 text-left text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                        >
                          Foundation templates…
                        </button>
                        <button
                          onClick={() => {
                            handleOpenFindReplaceReview();
                            setViewOptionsOpen(false);
                          }}
                          disabled={!connected}
                          className="w-full rounded border border-[var(--color-figma-border)] px-2 py-1 text-left text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Find &amp; Replace…
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => {
                              handleApplyVariables();
                              setViewOptionsOpen(false);
                            }}
                            disabled={applying || varDiffLoading || tokens.length === 0}
                            className="rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {varDiffLoading ? 'Comparing…' : 'Apply as Variables'}
                          </button>
                          <button
                            onClick={() => {
                              handleApplyStyles();
                              setViewOptionsOpen(false);
                            }}
                            disabled={applying || tokens.length === 0}
                            className="rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Apply as Styles
                          </button>
                        </div>
                      </section>
                    </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {(filterBuilderOpen || hasStructuredFilters) && (
              <div className="px-2 pb-2">
                <TokenSearchFilterBuilder
                  isOpen={filterBuilderOpen}
                  selectedSection={activeFilterBuilderSection}
                  onSelectSection={openFilterBuilderSection}
                  onToggleOpen={toggleFilterBuilder}
                  parsedSearchQuery={parsedSearchQuery}
                  selectedTypeQualifiers={selectedTypeQualifiers}
                  selectedHasQualifiers={selectedHasQualifiers}
                  qualifierTypeOptions={qualifierTypeOptions}
                  generatorNames={generatorNames}
                  onToggleQualifierValue={toggleQueryQualifierValue}
                  onAddQualifierValue={addQueryQualifierValue}
                  onRemoveQualifierValue={removeQueryQualifierValue}
                  onClearQualifier={clearQueryQualifier}
                />
              </div>
            )}

            {(activeFilterSummary.length > 0 || activeViewSummary.length > 0 || hasStructuredFilters) && (
              <div className="flex flex-wrap items-start gap-2 px-2 pb-2">
                {activeFilterSummary.length > 0 && (
                  <button
                    onClick={() => setViewOptionsOpen(true)}
                    className="min-w-[140px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-left transition-colors hover:border-[var(--color-figma-accent)]/40 hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">Filters</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {activeFilterSummary.slice(0, 3).map(label => (
                        <span
                          key={label}
                          className="rounded bg-[var(--color-figma-accent)]/10 px-1.5 py-0.5 text-[10px] text-[var(--color-figma-accent)]"
                        >
                          {label}
                        </span>
                      ))}
                      {activeFilterSummary.length > 3 && (
                        <span className="rounded bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                          +{activeFilterSummary.length - 3} more
                        </span>
                      )}
                    </div>
                  </button>
                )}

                {activeViewSummary.length > 0 && (
                  <button
                    onClick={() => setViewOptionsOpen(true)}
                    className="min-w-[140px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-left transition-colors hover:border-[var(--color-figma-accent)]/40 hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">View</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {activeViewSummary.slice(0, 2).map(label => (
                        <span
                          key={label}
                          className="rounded bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)]"
                        >
                          {label}
                        </span>
                      ))}
                      {activeViewSummary.length > 2 && (
                        <span className="rounded bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                          +{activeViewSummary.length - 2} more
                        </span>
                      )}
                    </div>
                  </button>
                )}

                {(activeFilterSummary.length > 0 || hasStructuredFilters) && (
                  <button
                    onClick={clearFilters}
                    className="rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                  >
                    Clear filters
                  </button>
                )}

                {activeViewSummary.length > 0 && (
                  <button
                    onClick={clearViewModes}
                    className="rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                  >
                    Reset view
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {showStaleGeneratorBanner && (
        <NoticeBanner
          severity="warning"
          onDismiss={!runningStaleGenerators ? handleDismissStaleGeneratorBanner : undefined}
          dismissLabel="Dismiss"
          actions={
            <button
              type="button"
              onClick={handleRegenerateAllStaleGenerators}
              disabled={runningStaleGenerators}
              className="inline-flex items-center gap-1 shrink-0 px-2 py-1 rounded bg-amber-500/15 text-amber-700 font-medium hover:bg-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {runningStaleGenerators && <Spinner size="xs" />}
              <span>{runningStaleGenerators ? 'Regenerating…' : 'Regenerate all'}</span>
            </button>
          }
        >
          {staleGeneratorsForSet.length === 1 ? '1 generator' : `${staleGeneratorsForSet.length} generators`} in{' '}
          <strong>{setName}</strong> {staleGeneratorsForSet.length === 1 ? 'is' : 'are'} out of date
        </NoticeBanner>
      )}
      {/* Token stats bar — opened from the command palette to avoid permanent toolbar clutter */}
      {statsBarOpen && statsTotalTokens > 0 && (
        <div className="shrink-0 border-b border-[var(--color-figma-border)]">
          <div className="flex items-center gap-2 px-3 py-1 text-[10px] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)]">
            <span className="font-medium text-[var(--color-figma-text)]">{statsTotalTokens}</span>
            <span>token{statsTotalTokens !== 1 ? 's' : ''}</span>
            <div className="flex-1 ml-1 h-1.5 rounded-full overflow-hidden flex gap-px min-w-0 max-w-[120px]">
              {statsByType.map(([type, count]) => (
                <div
                  key={type}
                  style={{ width: `${(count / statsTotalTokens) * 100}%`, backgroundColor: TOKEN_TYPE_COLORS[type] ?? TOKEN_TYPE_COLOR_FALLBACK }}
                  title={`${type}: ${count}`}
                  className="shrink-0"
                />
              ))}
            </div>
            <button
              onClick={() => setStatsBarOpen(false)}
              className="ml-auto p-1 rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              aria-label="Hide token statistics"
              title="Hide token statistics"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
              </svg>
            </button>
          </div>
          <div className="px-3 pb-2 flex flex-col gap-2">
            {/* Type breakdown */}
            <div>
              <div className="h-2 rounded-full overflow-hidden flex gap-px mb-1.5">
                {statsByType.map(([type, count]) => (
                  <div
                    key={type}
                    style={{ width: `${(count / statsTotalTokens) * 100}%`, backgroundColor: TOKEN_TYPE_COLORS[type] ?? TOKEN_TYPE_COLOR_FALLBACK }}
                    title={`${type}: ${count}`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {statsByType.map(([type, count]) => (
                  <span key={type} className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: TOKEN_TYPE_COLORS[type] ?? TOKEN_TYPE_COLOR_FALLBACK }} aria-hidden="true" />
                    <span className="font-medium text-[var(--color-figma-text)]">{count}</span>
                    {type}
                  </span>
                ))}
              </div>
            </div>
            {/* Per-set breakdown (only when multiple sets) */}
            {statsSetTotals.length > 1 && (
              <div className="flex flex-col gap-0.5">
                {statsSetTotals.map(({ name, total }) => (
                  <div key={name} className="flex items-center gap-2 text-[10px]">
                    <span className="text-[var(--color-figma-text-secondary)] truncate flex-1" title={name}>{name}</span>
                    <div className="h-1 rounded-full bg-[var(--color-figma-bg-hover)] overflow-hidden w-16 shrink-0">
                      <div
                        className="h-full rounded-full bg-[var(--color-figma-accent)]"
                        style={{ width: `${Math.round((total / statsTotalTokens) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[var(--color-figma-text)] font-medium w-6 text-right shrink-0">{total}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Promote duplicates callout — shown when the duplicates filter is active */}
      {showDuplicates && promotableDuplicateCount > 0 && (
        <div role="status" aria-live="polite" className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] text-[11px]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-accent)]" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
          </svg>
          <span className="flex-1 text-[var(--color-figma-text-secondary)]">
            {promotableDuplicateCount} token{promotableDuplicateCount !== 1 ? 's' : ''} share duplicate values
          </span>
          <button
            onClick={() => handleOpenPromoteReview(duplicateValuePaths)}
            className="shrink-0 px-2 py-0.5 rounded text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)] font-medium transition-colors"
          >
            Promote all to aliases
          </button>
        </div>
      )}
      {/* Operation loading banner */}
      {operationLoading && (
        <div role="status" aria-live="polite" className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[11px] text-[var(--color-figma-text-secondary)]">
          <Spinner size="sm" />
          <span>{operationLoading}</span>
        </div>
      )}
      {/* Delete error banner */}
      {deleteError && (
        <NoticeBanner severity="error" onDismiss={() => setDeleteError(null)} dismissLabel="Dismiss">
          Delete failed: {deleteError}
        </NoticeBanner>
      )}
      {/* Scrollable token content with virtual scroll */}
      <div
        ref={virtualListRef}
        className={`flex-1 overflow-y-auto${operationLoading ? ' opacity-50 pointer-events-none' : ''}`}
        onScroll={e => { const top = e.currentTarget.scrollTop; virtualScrollTopRef.current = top; setVirtualScrollTop(top); }}
      >
      <TokenTreeProvider value={treeCtx}>
        {/* Multi-mode column headers */}
        {multiModeData && viewMode === 'tree' && (
          <div className="sticky top-0 z-20 flex items-center border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            <div className="flex-1 min-w-0 px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
              Token
            </div>
            {multiModeData.results.map(r => (
              <div key={r.optionName} className="w-[80px] shrink-0 px-1 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] text-center truncate border-l border-[var(--color-figma-border)]" title={r.optionName}>
                {r.optionName}
              </div>
            ))}
          </div>
        )}
        {crossSetResults !== null ? (
          /* Cross-set search results */
          crossSetResults.length === 0 ? (
            <div className="py-8 text-center text-[10px] text-[var(--color-figma-text-tertiary)]">
              <p>No tokens found across all sets</p>
              {searchQuery && (() => {
                const q = searchQuery.trim();
                const qLower = q.toLowerCase();
                const matchingType = availableTypes.find(t => t.toLowerCase() === qLower)
                  || availableTypes.find(t => t.toLowerCase().startsWith(qLower));
                if (matchingType && typeFilter !== matchingType) {
                  return (
                    <button
                      onClick={() => { setSearchQuery(''); setTypeFilter(matchingType); }}
                      className="mt-2 inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors"
                    >
                      Filter by type: {matchingType} <span aria-hidden="true">&rarr;</span>
                    </button>
                  );
                }
                return null;
              })()}
            </div>
          ) : (
            <div>
              {sets
                .filter(sn => crossSetResults.some(r => r.setName === sn))
                .map(sn => {
                  const setResults = crossSetResults.filter(r => r.setName === sn);
                  return (
                    <div key={sn}>
                      <div className="px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] sticky top-0 z-10">
                        {sn} <span className="font-normal opacity-60">({setResults.length})</span>
                      </div>
                      {setResults.map(r => (
                        <button
                          key={r.path}
                          onClick={() => onNavigateToSet?.(r.setName, r.path)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--color-figma-bg-hover)] border-b border-[var(--color-figma-border)]/50"
                        >
                          {r.entry.$type === 'color' && typeof r.entry.$value === 'string' && r.entry.$value.startsWith('#') && (
                            <span className="shrink-0 w-3 h-3 rounded-sm border border-[var(--color-figma-border)]" style={{ background: r.entry.$value }} />
                          )}
                          <span className="flex-1 min-w-0 font-mono text-[10px] text-[var(--color-figma-text)] truncate" title={r.path}>{highlightMatch(r.path, searchHighlight?.nameTerms ?? [])}</span>
                          <span className={`shrink-0 text-[8px] px-1 py-0.5 rounded ${TOKEN_TYPE_BADGE_CLASS[r.entry.$type] ?? 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>{r.entry.$type}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              {crossSetTotal > crossSetResults.length && (
                <div className="px-3 py-2 flex items-center justify-between border-t border-[var(--color-figma-border)]">
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    {crossSetResults.length} of {crossSetTotal} shown
                  </span>
                  <button
                    className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
                    onClick={() => setCrossSetOffset(crossSetResults.length)}
                  >
                    Load {Math.min(CROSS_SET_PAGE_SIZE, crossSetTotal - crossSetResults.length)} more
                  </button>
                </div>
              )}
            </div>
          )
        ) : inspectMode && selectedNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--color-figma-text-secondary)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M13 12H3"/>
            </svg>
            <p className="mt-2 text-[11px] font-medium">Select a layer to inspect</p>
            <p className="text-[10px] mt-0.5">Tokens bound to the selected layer will appear here</p>
          </div>
        ) : viewMode === 'json' ? (
          /* JSON editor — raw DTCG JSON, works for both empty and non-empty sets */
          <div className="h-full flex flex-col">
            <textarea
              ref={jsonTextareaRef}
              value={jsonText}
              onChange={e => {
                const val = e.target.value;
                setJsonText(val);
                setJsonDirty(true);
                try {
                  JSON.parse(val);
                  setJsonError(null);
                  setJsonBrokenRefs(validateJsonRefs(val, allTokensFlat));
                } catch (err) {
                  setJsonError(getErrorMessage(err, 'Invalid JSON'));
                  setJsonBrokenRefs([]);
                }
              }}
              onKeyDown={async e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                  e.preventDefault();
                  if (jsonError || jsonSaving || !connected || !jsonText.trim()) return;
                  setJsonSaving(true);
                  try {
                    const parsed = JSON.parse(jsonText);
                    await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(parsed),
                    });
                    setJsonDirty(false);
                    onRefresh();
                  } catch (err) {
                    setJsonError(err instanceof ApiError ? err.message : 'Invalid JSON — cannot save');
                  } finally {
                    setJsonSaving(false);
                  }
                }
              }}
              placeholder={'{\n  "color": {\n    "primary": {\n      "$value": "#3b82f6",\n      "$type": "color"\n    }\n  }\n}'}
              spellCheck={false}
              className="flex-1 p-3 font-mono text-[10px] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] outline-none resize-none leading-relaxed placeholder:text-[var(--color-figma-text-tertiary)]"
              style={{ minHeight: 0 }}
            />
            <div className="shrink-0 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 flex flex-col gap-1">
              {jsonError && (
                <NoticeFieldMessage severity="error" className="font-mono">{jsonError}</NoticeFieldMessage>
              )}
              {jsonBrokenRefs.length > 0 && !jsonError && (
                <NoticeFieldMessage severity="warning">
                  <span className="flex flex-wrap gap-1 items-center">
                    <span className="font-medium shrink-0">Broken refs:</span>
                    {jsonBrokenRefs.map(r => (
                      <span key={r} className="font-mono bg-[var(--color-figma-warning)]/10 rounded px-1">{'{' + r + '}'}</span>
                    ))}
                  </span>
                </NoticeFieldMessage>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                  {tokens.length === 0 ? 'Paste DTCG JSON to import tokens' : jsonDirty ? 'Unsaved changes' : 'Up to date'}
                </span>
                <div className="flex gap-1">
                  {jsonDirty && tokens.length > 0 && (
                    <button
                      onClick={() => {
                        setJsonDirty(false);
                        apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/raw`)
                          .then(data => {
                            const text = JSON.stringify(data, null, 2);
                            setJsonText(text);
                            setJsonError(null);
                            setJsonBrokenRefs(validateJsonRefs(text, allTokensFlat));
                          })
                          .catch(err => console.warn('[TokenList] reload raw JSON failed:', err));
                      }}
                      className="px-2 py-0.5 rounded text-[10px] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                    >
                      Revert
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      if (jsonError || !jsonText.trim()) return;
                      setJsonSaving(true);
                      try {
                        const parsed = JSON.parse(jsonText);
                        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(parsed),
                        });
                        setJsonDirty(false);
                        onRefresh();
                      } catch (err) {
                        setJsonError(err instanceof ApiError ? err.message : 'Invalid JSON — cannot save');
                      } finally {
                        setJsonSaving(false);
                      }
                    }}
                    disabled={!!jsonError || jsonSaving || !connected || !jsonText.trim()}
                    className="px-2 py-0.5 rounded text-[10px] transition-colors bg-[var(--color-figma-accent)] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                  >
                    {jsonSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-5 gap-4 text-center">
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-[var(--color-figma-bg-secondary)] flex items-center justify-center text-[var(--color-figma-text-secondary)]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
                </svg>
              </div>
              <div>
                <p className="text-[12px] font-medium text-[var(--color-figma-text)]">This set is empty</p>
                <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                  Open the start branch you need instead of bouncing through a separate empty-state flow.
                </p>
              </div>
            </div>

            <div className="flex w-full max-w-[260px] flex-col gap-1.5 text-left">
              {TOKENS_START_HERE_BRANCHES.map((branch) => {
                const shortcut = getStartHereBranchCopy(branch);
                const isRecommended = branch === 'guided-setup';
                return (
                  <button
                    key={branch}
                    onClick={() => onOpenStartHere?.(branch)}
                    className={[
                      'rounded border px-3 py-2 transition-colors',
                      isRecommended
                        ? 'border-[var(--color-figma-accent)]/35 bg-[var(--color-figma-accent)]/5 hover:border-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10'
                        : 'border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)]',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-[var(--color-figma-text)]">{shortcut.title}</span>
                      {isRecommended && (
                        <span className="rounded-full bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--color-figma-text-secondary)]">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                      {shortcut.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        ) : displayedTokens.length === 0 && filtersActive ? (
          <div className="flex flex-col items-center justify-center py-12 text-[var(--color-figma-text-secondary)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              <path d="M8 11h6M11 8v6" />
            </svg>
            <p className="mt-2 text-[11px] font-medium">No tokens match your filters</p>

            {/* Smart suggestions based on query shape */}
            {searchQuery && (() => {
              const q = searchQuery.trim();
              const qLower = q.toLowerCase();
              const suggestions: { label: string; icon: string; action: () => void }[] = [];

              // Path-like query (contains dots) → offer to create token at that path
              const looksLikePath = q.includes('.') && /^[a-zA-Z0-9._-]+$/.test(q);
              if (looksLikePath && connected) {
                suggestions.push({
                  label: `Create token at "${formatDisplayPath(q, q.split('.').pop() || q)}"`,
                  icon: 'create',
                  action: () => {
                    onCreateNew?.(q);
                  },
                });
              }

              // Non-path plain name → still offer create
              if (!looksLikePath && connected && /^[a-zA-Z0-9_-]+$/.test(q)) {
                suggestions.push({
                  label: `Create token "${q}"`,
                  icon: 'create',
                  action: () => {
                    onCreateNew?.(q);
                  },
                });
              }

              // Type-like query → offer to filter by matching type
              const matchingType = availableTypes.find(t => t.toLowerCase() === qLower)
                || availableTypes.find(t => t.toLowerCase().startsWith(qLower));
              if (matchingType && typeFilter !== matchingType) {
                suggestions.push({
                  label: `Filter by type: ${matchingType}`,
                  icon: 'filter',
                  action: () => {
                    setSearchQuery('');
                    setTypeFilter(matchingType);
                  },
                });
              }

              // Value-like query (hex color, number) → suggest value: qualifier
              const looksLikeValue = /^#[0-9a-fA-F]{3,8}$/.test(q) || /^\d+(\.\d+)?(px|rem|em|%)?$/.test(q);
              if (looksLikeValue) {
                suggestions.push({
                  label: `Add value filter for "${q}"`,
                  icon: 'value',
                  action: () => {
                    addQueryQualifierValue('value', q);
                    openFilterBuilderSection('value');
                  },
                });
              }

              // Filter-builder hint → if query partially matches a qualifier keyword
              if (!q.includes(':')) {
                const sectionLabels: Record<FilterBuilderSection, string> = {
                  type: 'Type',
                  has: 'Token state',
                  path: 'Path',
                  name: 'Leaf name',
                  value: 'Value',
                  desc: 'Description',
                  generator: 'Generator',
                };
                const matchingSections = new Map<FilterBuilderSection, string>();
                for (const qualifier of QUERY_QUALIFIERS) {
                  if (qualifier.key === 'group') continue;
                  if (
                    qualifier.qualifier.toLowerCase().startsWith(qLower)
                    || qualifier.key.toLowerCase().startsWith(qLower)
                    || qualifier.desc.toLowerCase().includes(qLower)
                  ) {
                    matchingSections.set(qualifier.key, sectionLabels[qualifier.key]);
                  }
                }
                for (const [sectionKey, label] of Array.from(matchingSections.entries()).slice(0, 2)) {
                  suggestions.push({
                    label: `Open ${label} filter`,
                    icon: 'hint',
                    action: () => openFilterBuilderSection(sectionKey),
                  });
                }
              }

              if (suggestions.length === 0) return null;

              return (
                <div className="mt-3 flex flex-col gap-1 w-full max-w-[240px]">
                  <p className="text-[9px] uppercase tracking-wider text-[var(--color-figma-text-tertiary)] mb-0.5">Suggestions</p>
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={s.action}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] text-left bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors"
                    >
                      {s.icon === 'create' && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                      )}
                      {s.icon === 'filter' && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></svg>
                      )}
                      {s.icon === 'value' && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                      )}
                      {s.icon === 'hint' && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 6L4 12l4 6M16 6l4 6-4 6M13 4l-2 16" /></svg>
                      )}
                      <span className="truncate">{s.label}</span>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-auto shrink-0 opacity-40" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                  ))}
                </div>
              );
            })()}

            <button
              onClick={clearFilters}
              className="mt-3 px-3 py-1 rounded text-[10px] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20 transition-colors"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="py-1">
            {zoomBreadcrumb ? (
              <div className="sticky top-0 z-10 flex items-center gap-0.5 px-2 py-1.5 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] text-[10px]">
                <button
                  onClick={handleZoomOut}
                  className="flex items-center gap-0.5 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] mr-1"
                  title="Exit focus mode (Esc)"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={handleZoomOut}
                  className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:underline"
                >
                  Root
                </button>
                {zoomBreadcrumb.map((seg, i) => (
                  <span key={seg.path} className="flex items-center gap-0.5">
                    <span className="opacity-40 mx-0.5">›</span>
                    {i < zoomBreadcrumb.length - 1 ? (
                      <button
                        className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:underline truncate max-w-[120px]"
                        title={seg.path}
                        onClick={() => handleZoomToAncestor(seg.path)}
                      >
                        {seg.name}
                      </button>
                    ) : (
                      <span className="font-medium text-[var(--color-figma-text)] truncate max-w-[120px]" title={seg.path}>
                        {seg.name}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            ) : breadcrumbSegments.length > 0 ? (
              <div className="sticky top-0 z-10 flex items-center gap-0.5 px-2 py-1 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)] group/breadcrumb">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-40 mr-0.5">
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                {breadcrumbSegments.map((seg, i) => (
                  <span key={seg.path} className="flex items-center gap-0.5">
                    {i > 0 && <span className="opacity-40 mx-0.5">›</span>}
                    {i < breadcrumbSegments.length - 1 ? (
                      <button
                        className="hover:text-[var(--color-figma-text)] hover:underline truncate max-w-[120px]"
                        title={`Jump to ${seg.path}`}
                        onClick={() => handleJumpToGroup(seg.path)}
                      >
                        {seg.name}
                      </button>
                    ) : (
                      <span className="font-medium text-[var(--color-figma-text)] truncate max-w-[120px]" title={seg.path}>
                        {seg.name}
                      </span>
                    )}
                  </span>
                ))}
                <button
                  className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/breadcrumb:opacity-100 group-focus-within/breadcrumb:opacity-100 transition-opacity text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] shrink-0"
                  title="Collapse all groups below and jump to this group"
                  onClick={() => handleCollapseBelow(breadcrumbSegments[breadcrumbSegments.length - 1].path)}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 15l-6-6-6 6" />
                  </svg>
                  <span>Collapse</span>
                </button>
              </div>
            ) : null}
            <div style={{ height: virtualTopPad }} aria-hidden="true" />
            {flatItems.slice(virtualStartIdx, virtualEndIdx).map(({ node, depth }) => {
              const moveEnabled = sortOrder === 'default' && connected;
              const parentPath = moveEnabled ? (nodeParentPath(node.path, node.name) ?? '') : '';
              const siblings = moveEnabled ? (siblingOrderMap.get(parentPath) ?? []) : [];
              const sibIdx = moveEnabled ? siblings.indexOf(node.name) : -1;
              return (
              <TokenTreeNode
                key={node.path}
                node={node}
                depth={depth}
                skipChildren
                isSelected={node.isGroup ? false : selectedPaths.has(node.path)}
                lintViolations={lintViolationsMap.get(node.path) ?? EMPTY_LINT_VIOLATIONS}
                chainExpanded={expandedChains.has(node.path)}
                showFullPath={showRecentlyTouched}
                onMoveUp={moveEnabled && sibIdx > 0 ? () => handleMoveTokenInGroup(node.path, node.name, 'up') : undefined}
                onMoveDown={moveEnabled && sibIdx >= 0 && sibIdx < siblings.length - 1 ? () => handleMoveTokenInGroup(node.path, node.name, 'down') : undefined}
                multiModeValues={multiModeData ? getMultiModeValues(node.path) : undefined}
              />
              );
            })}
            <div style={{ height: virtualBottomPad }} aria-hidden="true" />
          </div>
        )}
      </TokenTreeProvider>
      </div>

      {/* Table create mode */}
      {showTableCreate && (
        <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <div className="flex flex-col gap-2">
            {/* Draft recovery banner */}
            {tableCreateHasDraft && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[11px]">
                <span className="flex-1 text-[var(--color-figma-text)]">You have unsaved bulk-create data. Restore it?</span>
                <button
                  type="button"
                  onClick={restoreTableDraft}
                  className="px-2 py-0.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)]"
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={dismissTableDraft}
                  className="px-2 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[10px] hover:bg-[var(--color-figma-bg-hover)]"
                >
                  Discard
                </button>
              </div>
            )}
            {/* Active set indicator */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-[var(--color-figma-text-secondary)]">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Bulk create in:</span>
              <span className="text-[10px] font-medium text-[var(--color-figma-text)] truncate">{setName}</span>
            </div>
            {/* Group picker */}
            <div>
              <label className="block text-[10px] text-[var(--color-figma-text-tertiary)] mb-0.5" htmlFor="table-create-group">Group</label>
              <input
                id="table-create-group"
                type="text"
                list="table-create-groups-list"
                placeholder="Root (none)"
                value={tableGroup}
                onChange={e => setTableGroup(e.target.value)}
                aria-label="Token group for bulk create"
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
              />
              <datalist id="table-create-groups-list">
                {allGroupPaths.map(g => <option key={g} value={g} />)}
              </datalist>
            </div>
            {/* Smart name suggestions for table create */}
            {tableSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <span className="text-[10px] text-[var(--color-figma-text-tertiary)] self-center mr-0.5">Suggest:</span>
                {tableSuggestions.map(s => {
                  const leafName = s.value.includes('.') ? s.value.slice(s.value.lastIndexOf('.') + 1) : s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      title={s.source}
                      onClick={() => {
                        // Fill the next empty row, or add a new row
                        const emptyRow = tableRows.find(r => !r.name.trim());
                        if (emptyRow) {
                          updateTableRow(emptyRow.id, 'name', leafName);
                        } else {
                          addTableRow();
                          // We need to set it after the row is added
                          requestAnimationFrame(() => {
                            const inputs = document.querySelectorAll<HTMLInputElement>('[data-table-name-input]');
                            const last = inputs[inputs.length - 1];
                            if (last) { last.value = leafName; last.dispatchEvent(new Event('input', { bubbles: true })); }
                          });
                        }
                      }}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors cursor-pointer"
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            )}
            {/* Token rows */}
            <div>
              {/* Column headers */}
              <div className="grid gap-1 mb-1 px-0.5" style={{ gridTemplateColumns: 'minmax(0,1fr) 76px minmax(0,1fr) 18px' }}>
                <span className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)] uppercase tracking-wide">Name</span>
                <span className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)] uppercase tracking-wide">Type</span>
                <span className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)] uppercase tracking-wide">Value</span>
                <span />
              </div>
              {tableRows.map((row, idx) => (
                <div key={row.id} className="mb-1">
                  <div className="grid gap-1 items-center" style={{ gridTemplateColumns: 'minmax(0,1fr) 76px minmax(0,1fr) 18px' }}>
                    <input
                      type="text"
                      placeholder="name"
                      value={row.name}
                      onChange={e => updateTableRow(row.id, 'name', e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCreateAll();
                      }}
                      data-table-name-input="true"
                      aria-label={`Token ${idx + 1} name`}
                      autoFocus={idx === 0}
                      className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)] ${rowErrors[row.id] ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
                    />
                    <select
                      value={row.type}
                      onChange={e => updateTableRow(row.id, 'type', e.target.value)}
                      aria-label={`Token ${idx + 1} type`}
                      className="w-full px-1 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
                    >
                      <option value="color">Color</option>
                      <option value="dimension">Dimension</option>
                      <option value="number">Number</option>
                      <option value="string">String</option>
                      <option value="boolean">Boolean</option>
                      <option value="duration">Duration</option>
                      <option value="fontFamily">Font Family</option>
                      <option value="fontWeight">Font Weight</option>
                      <option value="typography">Typography</option>
                      <option value="shadow">Shadow</option>
                      <option value="border">Border</option>
                      <option value="gradient">Gradient</option>
                      <option value="strokeStyle">Stroke Style</option>
                    </select>
                    <input
                      type="text"
                      placeholder="value"
                      value={row.value}
                      onChange={e => {
                        const val = e.target.value;
                        updateTableRow(row.id, 'value', val);
                        const inferred = inferTypeFromValue(val);
                        if (inferred) updateTableRow(row.id, 'type', inferred);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Tab' && !e.shiftKey && idx === tableRows.length - 1) {
                          e.preventDefault();
                          addTableRow();
                          requestAnimationFrame(() => {
                            const inputs = document.querySelectorAll<HTMLInputElement>('[data-table-name-input]');
                            inputs[inputs.length - 1]?.focus();
                          });
                        }
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCreateAll();
                      }}
                      aria-label={`Token ${idx + 1} value`}
                      className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
                    />
                    <button
                      type="button"
                      onClick={() => removeTableRow(row.id)}
                      tabIndex={-1}
                      aria-label={`Remove row ${idx + 1}`}
                      className="w-[18px] h-[18px] flex items-center justify-center rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
                    </button>
                  </div>
                  {rowErrors[row.id] && (
                    <NoticeFieldMessage severity="error" className="pl-0.5">{rowErrors[row.id]}</NoticeFieldMessage>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => addTableRow()}
                className="mt-0.5 w-full px-2 py-1 rounded border border-dashed border-[var(--color-figma-border)] text-[var(--color-figma-text-tertiary)] text-[10px] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors"
              >
                + Add Row
              </button>
            </div>
            {createAllError && (
              <NoticeFieldMessage severity="error">{createAllError}</NoticeFieldMessage>
            )}
            <div className="flex gap-1.5">
              <button
                onClick={handleCreateAll}
                disabled={tableCreateBusy || !connected || tableRows.every(r => !r.name.trim())}
                title={tableRows.every(r => !r.name.trim()) ? 'Enter at least one token name' : 'Create all tokens (Ctrl+Enter)'}
                className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
              >
                {tableCreateBusy
                  ? 'Creating…'
                  : `Create ${tableRows.filter(r => r.name.trim()).length > 0 ? tableRows.filter(r => r.name.trim()).length + ' ' : ''}Token${tableRows.filter(r => r.name.trim()).length !== 1 ? 's' : ''}`}
              </button>
              <button
                onClick={closeTableCreate}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom actions — streamlined primary actions only */}
      {!showTableCreate && (
        <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {!primaryCreateInToolbar && (
              <button
                onClick={handleOpenPrimaryCreate}
                disabled={!connected}
                title="Create a new token (N)"
                className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
              >
                + New Token
              </button>
            )}
            <div className={`min-w-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 ${primaryCreateInToolbar ? 'flex-1' : 'shrink-0'}`}>
              <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                {primaryCreateInToolbar ? 'More creation' : 'Create tools'}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <button
                  onClick={openTableCreate}
                  disabled={!connected}
                  title="Create multiple tokens at once in a spreadsheet-like table (Tab between cells)"
                  className="px-2.5 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[10px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                >
                  Bulk
                </button>
                <button
                  onClick={() => { setNewGroupDialogParent(''); setNewGroupName(''); setNewGroupError(''); }}
                  disabled={!connected}
                  title="Create an empty group to organize tokens"
                  className="px-2.5 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[10px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                >
                  New Group
                </button>
              </div>
            </div>
          </div>
          {applyResult && (
            <span role="status" aria-live="polite" className="mt-1 block text-[10px] text-[var(--color-figma-accent)]">
              Applied {applyResult.count} {applyResult.type === 'variables' ? 'variables' : 'styles'}
            </span>
          )}
        </div>
      )}

      <TokenListModalsProvider value={modalContextValue}>
        <TokenListModals />
      </TokenListModalsProvider>

      {/* "Find in all sets" overlay — shows all set definitions for a specific token path */}
      {whereIsPath !== null && (
        <div className="absolute inset-0 z-40 flex flex-col bg-[var(--color-figma-bg)]">
          {/* Header */}
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
            <button
              onClick={() => { setWhereIsPath(null); setWhereIsResults(null); whereIsAbortRef.current?.abort(); }}
              className="flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] shrink-0"
              title="Close"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
                <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              </svg>
            </button>
            <span className="flex-1 min-w-0 font-mono text-[10px] text-[var(--color-figma-text)] truncate" title={whereIsPath}>{whereIsPath}</span>
            {!whereIsLoading && whereIsResults !== null && (
              <span className="shrink-0 text-[10px] text-[var(--color-figma-text-tertiary)]">
                {whereIsResults.length} set{whereIsResults.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {whereIsLoading ? (
              <div className="py-8 text-center text-[10px] text-[var(--color-figma-text-tertiary)]">
                Searching…
              </div>
            ) : whereIsResults !== null && whereIsResults.length === 0 ? (
              <div className="py-8 text-center text-[10px] text-[var(--color-figma-text-tertiary)]">
                Token not found in any set
              </div>
            ) : whereIsResults !== null ? (
              <div>
                {whereIsResults.map((def, i) => {
                  const isColor = def.$type === 'color' && typeof def.$value === 'string';
                  const colorHex = isColor ? (def.$value as string).slice(0, 7) : null;
                  const valueLabel = def.isAlias
                    ? String(def.$value)
                    : typeof def.$value === 'string'
                      ? def.$value
                      : JSON.stringify(def.$value);
                  return (
                    <div key={def.setName} className="flex items-center gap-2 px-2 py-2 border-b border-[var(--color-figma-border)]/50 hover:bg-[var(--color-figma-bg-hover)] group">
                      {/* Color swatch */}
                      {colorHex ? (
                        <span
                          className="shrink-0 w-3 h-3 rounded-sm border border-[var(--color-figma-border)]"
                          style={{ background: colorHex }}
                        />
                      ) : (
                        <span className="shrink-0 w-3 h-3" />
                      )}
                      {/* Set name + value */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium text-[var(--color-figma-text)] truncate">{def.setName}</span>
                          {i === 0 && (
                            <span className="text-[8px] px-1 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)] shrink-0">base</span>
                          )}
                          {def.isDifferentFromFirst && (
                            <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-600 shrink-0">override</span>
                          )}
                        </div>
                        <div className="font-mono text-[10px] text-[var(--color-figma-text-secondary)] truncate" title={valueLabel}>
                          {valueLabel}
                          {def.$description && (
                            <span className="ml-1 text-[var(--color-figma-text-tertiary)] not-italic">{def.$description}</span>
                          )}
                        </div>
                      </div>
                      {/* Type badge */}
                      <span className={`shrink-0 text-[8px] px-1 py-0.5 rounded ${TOKEN_TYPE_BADGE_CLASS[def.$type] ?? 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'}`}>{def.$type}</span>
                      {/* Navigate button */}
                      <button
                        className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[9px] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]"
                        onClick={() => onNavigateToSet?.(def.setName, whereIsPath)}
                        title={`Go to ${def.setName}`}
                      >
                        Go
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
