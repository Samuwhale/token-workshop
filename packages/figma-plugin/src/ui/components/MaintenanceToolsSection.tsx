import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  BindableProperty,
  LayerSearchResult,
  SelectionNodeInfo,
  SyncCompleteMessage,
  TokenMapEntry,
} from "../../shared/types";
import { resolveTokenValue } from "../../shared/resolveAlias";
import type { UndoSlot } from "../hooks/useUndo";
import { DeepInspectSection } from "./DeepInspectSection";
import { RemapBindingsPanel } from "./RemapBindingsPanel";
import { ExtractTokensPanel } from "./ExtractTokensPanel";
import { ConfirmModal } from "./ConfirmModal";
import { InlineBanner } from "./InlineBanner";
import { NoticeFieldMessage } from "../shared/noticeSystem";
import { SHORTCUT_KEYS } from "../shared/shortcutRegistry";
import { adaptShortcut } from "../shared/utils";
import { SelectionSyncStatusPill } from "./SelectionSyncStatusPill";

type InspectorPropFilterMode =
  | "all"
  | "bound"
  | "unbound"
  | "mixed"
  | "colors"
  | "dimensions";
type ToolCardId = "sync" | "search" | "inspect" | "actions" | "filters";

interface MaintenanceToolsSectionProps {
  selectionKey: string;
  connected: boolean;
  activeSet: string;
  serverUrl: string;
  tokenMap: Record<string, TokenMapEntry>;
  onTokenCreated: () => void;
  onSync: (scope: "page" | "selection") => void;
  syncing: boolean;
  syncProgress: { processed: number; total: number } | null;
  syncResult: SyncCompleteMessage | null;
  syncError?: string | null;
  freshSyncResult: SyncCompleteMessage | null;
  totalBindings: number;
  deepInspect: boolean;
  onToggleDeepInspect: () => void;
  deepChildNodes: SelectionNodeInfo[];
  onNavigateToToken?: (tokenPath: string) => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onSelectLayer: (nodeId: string) => void;
  deepRemoveError: string | null;
  hasVisibleProperties: boolean;
  propFilter: string;
  onPropFilterChange: (value: string) => void;
  propFilterMode: InspectorPropFilterMode;
  onPropFilterModeChange: (value: InspectorPropFilterMode) => void;
  mixedBindings: number;
  isFilterActive: boolean;
  onClearFilters: () => void;
  unboundWithValueCount: number;
  onExtractAllUnbound: () => void;
  extractingUnbound: boolean;
  extractUnboundResult: { created: number; bound: number } | null;
  onDismissExtractUnboundResult: () => void;
  extractUnboundError: string | null;
  onDismissExtractUnboundError: () => void;
  onClearAllBindings: () => void;
}

interface ToolIndicator {
  label: string;
  className: string;
}

interface MaintenanceToolCardProps {
  title: string;
  description: string;
  expanded: boolean;
  indicator?: ReactNode;
  onToggle: () => void;
  children: ReactNode;
}

function renderToolIndicator(indicator: ToolIndicator | null): ReactNode {
  if (!indicator) return null;
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-medium ${indicator.className}`}
    >
      {indicator.label}
    </span>
  );
}

export function LayerSearchPanel({
  onSelect,
}: {
  onSelect: (nodeId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LayerSearchResult[]>([]);
  const [totalSearched, setTotalSearched] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg?.type === "search-layers-result") {
        setResults(msg.results);
        setTotalSearched(msg.totalSearched ?? null);
        setSearching(false);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      setTotalSearched(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      parent.postMessage(
        { pluginMessage: { type: "search-layers", query: value } },
        "*",
      );
    }, 200);
  }, []);

  const nodeTypeIcons: Record<string, string> = {
    FRAME: "▢",
    TEXT: "T",
    RECTANGLE: "□",
    ELLIPSE: "○",
    COMPONENT: "◆",
    INSTANCE: "◇",
    GROUP: "⊞",
    VECTOR: "✦",
    LINE: "─",
    STAR: "★",
    POLYGON: "⬠",
    BOOLEAN_OPERATION: "⊕",
    SECTION: "§",
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-secondary)]"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="Search layers by name, type, or component…"
          aria-label="Search layers"
          className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1.5 pl-7 pr-2 text-[10px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-secondary)] focus:focus-visible:border-[var(--color-figma-accent)]"
        />
        {query && (
          <button
            onClick={() => handleQueryChange("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            aria-label="Clear search"
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {searching && results.length === 0 && (
        <p className="px-1 py-2 text-[10px] text-[var(--color-figma-text-secondary)]">
          Searching…
        </p>
      )}

      {!searching && query && results.length === 0 && (
        <p className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-2 text-[10px] text-[var(--color-figma-text-secondary)]">
          Nothing matched "{query}". Try a broader layer name, type, or
          component query.
        </p>
      )}

      {results.length > 0 && (
        <div className="max-h-[200px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
          {totalSearched !== null && (
            <div className="border-b border-[var(--color-figma-border)]/50 bg-[var(--color-figma-bg-secondary)] px-2 py-1 text-[9px] text-[var(--color-figma-text-secondary)]">
              {results.length < 50
                ? `${results.length} result${results.length !== 1 ? "s" : ""} · searched ${totalSearched} layer${totalSearched !== 1 ? "s" : ""}`
                : `Top 50 results · searched ${totalSearched} layer${totalSearched !== 1 ? "s" : ""}`}
            </div>
          )}
          {results.map((layer) => (
            <button
              key={layer.id}
              onClick={() => onSelect(layer.id)}
              className="group flex w-full items-center gap-1.5 border-b border-[var(--color-figma-border)]/30 px-2 py-1 text-left transition-colors last:border-b-0 hover:bg-[var(--color-figma-bg-hover)]"
            >
              <span
                className="w-3 shrink-0 text-center text-[10px] text-[var(--color-figma-text-secondary)]"
                title={layer.type}
              >
                {nodeTypeIcons[layer.type] || "·"}
              </span>
              <span className="flex-1 truncate text-[10px] text-[var(--color-figma-text)]">
                {layer.name}
              </span>
              {layer.parentName && (
                <span
                  className="max-w-[80px] truncate text-[8px] text-[var(--color-figma-text-secondary)]"
                  title={`in ${layer.parentName}`}
                >
                  in {layer.parentName}
                </span>
              )}
              {layer.boundCount > 0 && (
                <span className="shrink-0 rounded-full bg-[var(--color-figma-accent)]/15 px-1 py-0.5 text-[8px] text-[var(--color-figma-accent)]">
                  {layer.boundCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MaintenanceToolCard({
  title,
  description,
  expanded,
  indicator,
  onToggle,
  children,
}: MaintenanceToolCardProps) {
  return (
    <div className="overflow-hidden rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)]"
        aria-expanded={expanded}
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="currentColor"
          className={`mt-0.5 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium text-[var(--color-figma-text)]">
            {title}
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
            {description}
          </p>
        </div>
        {indicator}
      </button>
      {expanded && (
        <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-3">
          {children}
        </div>
      )}
    </div>
  );
}

export const MaintenanceToolsSection = forwardRef<
  HTMLElement,
  MaintenanceToolsSectionProps
>(function MaintenanceToolsSection(
  {
    selectionKey,
    connected,
    activeSet,
    serverUrl,
    tokenMap,
    onTokenCreated,
    onSync,
    syncing,
    syncProgress,
    syncResult,
    syncError,
    freshSyncResult,
    totalBindings,
    deepInspect,
    onToggleDeepInspect,
    deepChildNodes,
    onNavigateToToken,
    onPushUndo,
    onSelectLayer,
    deepRemoveError,
    hasVisibleProperties,
    propFilter,
    onPropFilterChange,
    propFilterMode,
    onPropFilterModeChange,
    mixedBindings,
    isFilterActive,
    onClearFilters,
    unboundWithValueCount,
    onExtractAllUnbound,
    extractingUnbound,
    extractUnboundResult,
    onDismissExtractUnboundResult,
    extractUnboundError,
    onDismissExtractUnboundError,
    onClearAllBindings,
  },
  ref,
) {
  const [expandedCards, setExpandedCards] = useState<
    Record<ToolCardId, boolean>
  >({
    sync: false,
    search: false,
    inspect: deepInspect,
    actions: false,
    filters: isFilterActive,
  });
  const [showExtractPanel, setShowExtractPanel] = useState(false);
  const [showRemapPanel, setShowRemapPanel] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleSelectDeepNode = useCallback((nodeId: string) => {
    parent.postMessage({ pluginMessage: { type: "select-node", nodeId } }, "*");
  }, []);

  const handleDeepRemoveBinding = useCallback(
    (nodeId: string, property: BindableProperty, tokenPath: string) => {
      parent.postMessage(
        {
          pluginMessage: { type: "remove-binding-from-node", nodeId, property },
        },
        "*",
      );
      if (onPushUndo) {
        const entry = tokenMap[tokenPath];
        const tokenType = entry?.$type ?? "unknown";
        const resolved = entry
          ? resolveTokenValue(entry.$value, entry.$type, tokenMap)
          : { value: null };
        onPushUndo({
          description: `Unbound "${tokenPath}" from nested layer`,
          restore: async () => {
            parent.postMessage(
              {
                pluginMessage: {
                  type: "apply-to-nodes",
                  nodeIds: [nodeId],
                  tokenPath,
                  tokenType,
                  targetProperty: property,
                  resolvedValue: resolved.value,
                },
              },
              "*",
            );
          },
        });
      }
    },
    [onPushUndo, tokenMap],
  );

  const handleDeepBindToken = useCallback(
    (nodeId: string, property: BindableProperty, tokenPath: string) => {
      const entry = tokenMap[tokenPath];
      if (!entry) return;
      const resolved = resolveTokenValue(entry.$value, entry.$type, tokenMap);
      parent.postMessage(
        {
          pluginMessage: {
            type: "apply-to-nodes",
            nodeIds: [nodeId],
            tokenPath,
            tokenType: entry.$type,
            targetProperty: property,
            resolvedValue: resolved.value,
          },
        },
        "*",
      );
    },
    [tokenMap],
  );

  const toggleCard = useCallback((cardId: ToolCardId) => {
    setExpandedCards((prev) => ({ ...prev, [cardId]: !prev[cardId] }));
  }, []);

  useEffect(() => {
    setShowExtractPanel(false);
    setShowClearConfirm(false);
  }, [selectionKey]);

  useEffect(() => {
    if (deepInspect) {
      setExpandedCards((prev) =>
        prev.inspect ? prev : { ...prev, inspect: true },
      );
    }
  }, [deepInspect]);

  useEffect(() => {
    if (isFilterActive) {
      setExpandedCards((prev) =>
        prev.filters ? prev : { ...prev, filters: true },
      );
    }
  }, [isFilterActive]);

  useEffect(() => {
    if (
      showExtractPanel ||
      showRemapPanel ||
      extractingUnbound ||
      extractUnboundResult ||
      extractUnboundError
    ) {
      setExpandedCards((prev) =>
        prev.actions ? prev : { ...prev, actions: true },
      );
    }
  }, [
    extractUnboundError,
    extractUnboundResult,
    extractingUnbound,
    showExtractPanel,
    showRemapPanel,
  ]);

  useEffect(() => {
    if (syncing || syncError || syncResult || freshSyncResult) {
      setExpandedCards((prev) => (prev.sync ? prev : { ...prev, sync: true }));
    }
  }, [freshSyncResult, syncError, syncResult, syncing]);

  const activeFilterCount =
    Number(propFilter !== "") + Number(propFilterMode !== "all");
  const activeCards = [
    syncing || syncError || syncResult || freshSyncResult,
    expandedCards.search,
    deepInspect,
    showExtractPanel ||
      showRemapPanel ||
      extractingUnbound ||
      extractUnboundResult ||
      extractUnboundError,
    isFilterActive,
  ].filter(Boolean).length;

  const syncIndicator = (
    <SelectionSyncStatusPill
      syncing={syncing}
      syncProgress={syncProgress}
      syncResult={syncResult}
      syncError={syncError}
      freshSyncResult={freshSyncResult}
      connected={connected}
      totalBindings={totalBindings}
      visibility="active"
    />
  );

  const searchIndicator = renderToolIndicator(
    expandedCards.search
      ? {
          label: "Open",
          className:
            "bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]",
        }
      : null,
  );

  const inspectIndicator = renderToolIndicator(
    deepInspect
      ? {
          label:
            deepChildNodes.length > 0
              ? `${deepChildNodes.length} nested`
              : "On",
          className:
            "bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]",
        }
      : null,
  );

  const actionsIndicator = renderToolIndicator(
    showExtractPanel
      ? {
          label: "Extract",
          className:
            "bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]",
        }
      : showRemapPanel
        ? {
            label: "Remap",
            className:
              "bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]",
          }
        : extractUnboundError
          ? {
              label: "Error",
              className:
                "bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]",
            }
          : extractUnboundResult
            ? {
                label: "Done",
                className:
                  "bg-[var(--color-figma-success)]/10 text-[var(--color-figma-success)]",
              }
            : null,
  );

  const filtersIndicator = renderToolIndicator(
    isFilterActive
      ? {
          label: `${activeFilterCount} active`,
          className:
            "bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]",
        }
      : null,
  );

  return (
    <section
      ref={ref}
      className="overflow-hidden rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]"
    >
      <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
              Step 4
            </p>
            <p className="text-[10px] font-semibold text-[var(--color-figma-text)]">
              Maintenance tools
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
              Search layers, sync bindings, inspect nested children, recover
              from token drift, and focus the property list without crowding the
              main apply flow.
            </p>
          </div>
          {activeCards > 0 && (
            <span className="shrink-0 rounded-full bg-[var(--color-figma-accent)]/15 px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-figma-accent)]">
              {activeCards}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-3 py-3">
        <MaintenanceToolCard
          title="Selection sync"
          description="Refresh bound values from the token server for the current selection or the whole page."
          expanded={expandedCards.sync}
          indicator={syncIndicator}
          onToggle={() => toggleCard("sync")}
        >
          <div className="flex flex-col gap-2">
            <div aria-live="polite">
              {syncing && syncProgress ? (
                <div className="inline-flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                  <span className="inline-block h-1 w-20 overflow-hidden rounded-full bg-[var(--color-figma-border)] align-middle">
                    <span
                      className="block h-full rounded-full bg-[var(--color-figma-accent)] transition-all"
                      style={{
                        width: `${Math.round((syncProgress.processed / syncProgress.total) * 100)}%`,
                      }}
                    />
                  </span>
                  {syncProgress.processed}/{syncProgress.total}
                </div>
              ) : syncError ? (
                <NoticeFieldMessage severity="error">
                  <span title={syncError}>Sync failed — {syncError}</span>
                </NoticeFieldMessage>
              ) : syncResult ? (
                <NoticeFieldMessage
                  severity={
                    syncResult.errors > 0
                      ? "error"
                      : syncResult.missingTokens.length > 0
                        ? "warning"
                        : "success"
                  }
                >
                  <span
                    title={
                      syncResult.errors > 0
                        ? `${syncResult.errors} binding(s) could not be applied — the token type may not be compatible with the layer property`
                        : syncResult.missingTokens.length > 0
                          ? `Missing tokens (not in token server):\n${syncResult.missingTokens.join("\n")}`
                          : undefined
                    }
                  >
                    {syncResult.errors > 0
                      ? `${syncResult.errors} binding${syncResult.errors !== 1 ? "s" : ""} failed — check token types`
                      : syncResult.updated === 0 &&
                          syncResult.missingTokens.length === 0
                        ? "Up to date"
                        : `Updated ${syncResult.updated} binding${syncResult.updated !== 1 ? "s" : ""}${syncResult.missingTokens.length > 0 ? ` · ${syncResult.missingTokens.length} missing` : ""}`}
                  </span>
                </NoticeFieldMessage>
              ) : freshSyncResult &&
                freshSyncResult.missingTokens.length === 0 ? (
                <NoticeFieldMessage severity="success">
                  Latest selection sync completed successfully.
                </NoticeFieldMessage>
              ) : (
                <NoticeFieldMessage severity="info">
                  {totalBindings > 0
                    ? "Run selection sync after token edits, or sync the full page when you need a broader refresh."
                    : "Sync becomes useful once the selection has token bindings."}
                </NoticeFieldMessage>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {totalBindings > 0 && connected && (
                <button
                  onClick={() => onSync("selection")}
                  disabled={syncing}
                  className="rounded bg-[var(--color-figma-accent)]/10 px-2 py-1 text-[10px] text-[var(--color-figma-accent)] transition-colors hover:bg-[var(--color-figma-accent)]/20 disabled:opacity-50"
                >
                  Sync selection
                </button>
              )}
              {connected && (
                <button
                  onClick={() => onSync("page")}
                  disabled={syncing}
                  className="rounded bg-[var(--color-figma-bg-hover)] px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-text)] disabled:opacity-50"
                >
                  Sync page
                </button>
              )}
            </div>
          </div>
        </MaintenanceToolCard>

        <MaintenanceToolCard
          title="Layer search"
          description="Jump directly to another layer when the current selection is not the one you need to fix."
          expanded={expandedCards.search}
          indicator={searchIndicator}
          onToggle={() => toggleCard("search")}
        >
          <LayerSearchPanel onSelect={onSelectLayer} />
        </MaintenanceToolCard>

        <MaintenanceToolCard
          title="Deep inspect"
          description="Inspect nested child bindings without leaving the current selection."
          expanded={expandedCards.inspect}
          indicator={inspectIndicator}
          onToggle={() => toggleCard("inspect")}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                Toggle nested-layer inspection when you need to audit or repair
                bindings below the selected parent.
              </p>
              <button
                onClick={onToggleDeepInspect}
                title={
                  deepInspect
                    ? `Deep inspect on — showing nested children (${adaptShortcut(SHORTCUT_KEYS.TOGGLE_DEEP_INSPECT)})`
                    : `Enable deep inspect to show nested children (${adaptShortcut(SHORTCUT_KEYS.TOGGLE_DEEP_INSPECT)})`
                }
                className={`rounded px-2 py-1 text-[10px] transition-colors ${
                  deepInspect
                    ? "bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]"
                    : "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
                }`}
              >
                {deepInspect ? "Deep inspect on" : "Enable deep inspect"}
              </button>
            </div>

            {deepInspect ? (
              <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1 pb-1">
                <DeepInspectSection
                  deepChildNodes={deepChildNodes}
                  tokenMap={tokenMap}
                  onNavigateToToken={onNavigateToToken}
                  onRemoveBinding={handleDeepRemoveBinding}
                  onBindToken={handleDeepBindToken}
                  onSelectNode={handleSelectDeepNode}
                  showHeader={false}
                />
              </div>
            ) : (
              <NoticeFieldMessage severity="info">
                Enable deep inspect to surface nested child bindings and node
                shortcuts.
              </NoticeFieldMessage>
            )}

            {deepRemoveError && (
              <InlineBanner variant="error">{deepRemoveError}</InlineBanner>
            )}
          </div>
        </MaintenanceToolCard>

        <MaintenanceToolCard
          title="Maintenance actions"
          description="Extract raw values into tokens, remap stale paths, or clear the current selection before rebinding."
          expanded={expandedCards.actions}
          indicator={actionsIndicator}
          onToggle={() => toggleCard("actions")}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {connected && activeSet && (
                <button
                  onClick={() => {
                    setShowExtractPanel((prev) => !prev);
                    setShowRemapPanel(false);
                  }}
                  className={`rounded px-2 py-1 text-[10px] transition-colors ${
                    showExtractPanel
                      ? "bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]"
                      : "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
                  }`}
                >
                  {showExtractPanel ? "Hide extract panel" : "Extract tokens"}
                </button>
              )}
              <button
                onClick={() => {
                  setShowRemapPanel((prev) => !prev);
                  setShowExtractPanel(false);
                }}
                className={`rounded px-2 py-1 text-[10px] transition-colors ${
                  showRemapPanel
                    ? "bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]"
                    : "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
                }`}
              >
                {showRemapPanel ? "Hide remap panel" : "Remap bindings"}
              </button>
              {totalBindings > 0 && (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  title={`Remove all ${totalBindings} binding${totalBindings !== 1 ? "s" : ""} from selection`}
                  className="rounded bg-[var(--color-figma-bg-hover)] px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-error,#f56565)]"
                >
                  Clear all
                </button>
              )}
            </div>

            {connected &&
              activeSet &&
              unboundWithValueCount > 0 &&
              !extractingUnbound &&
              !extractUnboundResult &&
              !extractUnboundError && (
                <button
                  onClick={onExtractAllUnbound}
                  title={`Create tokens for all ${unboundWithValueCount} unbound propert${unboundWithValueCount !== 1 ? "ies" : "y"} and bind them to selected layers in one step`}
                  className="w-fit rounded bg-[var(--color-figma-accent)] px-2 py-1 text-[10px] text-white transition-opacity hover:opacity-90"
                >
                  Extract and bind {unboundWithValueCount} unbound propert
                  {unboundWithValueCount !== 1 ? "ies" : "y"}
                </button>
              )}

            {extractingUnbound && (
              <InlineBanner
                variant="loading"
                className="border-0 bg-transparent px-0 py-0"
              >
                Extracting and binding unbound properties…
              </InlineBanner>
            )}

            {extractUnboundResult && (
              <InlineBanner
                variant="success"
                onDismiss={onDismissExtractUnboundResult}
                dismissMode="icon"
                dismissLabel="Dismiss extract result"
              >
                Created {extractUnboundResult.created}, bound{" "}
                {extractUnboundResult.bound}
              </InlineBanner>
            )}

            {extractUnboundError && (
              <InlineBanner
                variant="error"
                onDismiss={onDismissExtractUnboundError}
                dismissMode="icon"
                dismissLabel="Dismiss extract error"
              >
                <span title={extractUnboundError}>Extract failed</span>
              </InlineBanner>
            )}

            {showExtractPanel && (
              <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-2">
                <ExtractTokensPanel
                  connected={connected}
                  activeSet={activeSet}
                  serverUrl={serverUrl}
                  tokenMap={tokenMap}
                  onTokenCreated={onTokenCreated}
                  onClose={() => setShowExtractPanel(false)}
                  embedded
                />
              </div>
            )}

            {showRemapPanel && (
              <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-2">
                <RemapBindingsPanel
                  tokenMap={tokenMap}
                  initialMissingTokens={freshSyncResult?.missingTokens}
                  onClose={() => setShowRemapPanel(false)}
                  embedded
                />
              </div>
            )}
          </div>
        </MaintenanceToolCard>

        <MaintenanceToolCard
          title="Property filters"
          description="Narrow the property list when you need to focus on a subset of bindable values."
          expanded={expandedCards.filters}
          indicator={filtersIndicator}
          onToggle={() => toggleCard("filters")}
        >
          {hasVisibleProperties ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1">
                <div className="relative min-w-0 flex-1">
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-secondary)]"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    value={propFilter}
                    onChange={(event) => onPropFilterChange(event.target.value)}
                    placeholder="Filter properties…"
                    aria-label="Filter properties"
                    className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 pl-5 pr-5 text-[10px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-secondary)] focus:focus-visible:border-[var(--color-figma-accent)]"
                  />
                  {propFilter && (
                    <button
                      onClick={() => onPropFilterChange("")}
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                      aria-label="Clear filter"
                    >
                      <svg
                        width="7"
                        height="7"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        aria-hidden="true"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {activeFilterCount > 0 && (
                  <button
                    onClick={onClearFilters}
                    className="shrink-0 text-[10px] text-[var(--color-figma-accent)] hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1">
                {(["bound", "unbound", "colors", "dimensions"] as const).map(
                  (mode) => (
                    <button
                      key={mode}
                      onClick={() =>
                        onPropFilterModeChange(
                          propFilterMode === mode ? "all" : mode,
                        )
                      }
                      className={`rounded px-1.5 py-0.5 text-[9px] transition-colors ${
                        propFilterMode === mode
                          ? "bg-[var(--color-figma-accent)]/20 font-medium text-[var(--color-figma-accent)]"
                          : "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
                      }`}
                    >
                      {mode === "bound"
                        ? "Bound"
                        : mode === "unbound"
                          ? "Unbound"
                          : mode === "colors"
                            ? "Colors"
                            : "Dims"}
                    </button>
                  ),
                )}
                {mixedBindings > 0 && (
                  <button
                    onClick={() =>
                      onPropFilterModeChange(
                        propFilterMode === "mixed" ? "all" : "mixed",
                      )
                    }
                    className={`rounded px-1.5 py-0.5 text-[9px] transition-colors ${
                      propFilterMode === "mixed"
                        ? "bg-[var(--color-figma-warning,#f5a623)]/20 font-medium text-[var(--color-figma-warning,#f5a623)]"
                        : "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
                    }`}
                  >
                    Mixed
                  </button>
                )}
              </div>
            </div>
          ) : (
            <NoticeFieldMessage severity="info">
              Filters become available once the selection exposes token-ready
              properties.
            </NoticeFieldMessage>
          )}
        </MaintenanceToolCard>
      </div>

      {showClearConfirm && (
        <ConfirmModal
          title={`Clear ${totalBindings} binding${totalBindings !== 1 ? "s" : ""}?`}
          description="This will remove all token bindings from the selected layer. You can undo this action."
          confirmLabel="Clear all"
          danger
          onConfirm={() => {
            setShowClearConfirm(false);
            onClearAllBindings();
          }}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </section>
  );
});
