import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  PROPERTY_GROUPS,
  PROPERTY_LABELS,
  ALL_BINDABLE_PROPERTIES,
} from "../../shared/types";
import type {
  BindableProperty,
  BindableTokenValue,
  SelectionNodeInfo,
  SyncCompleteMessage,
  TokenMapEntry,
} from "../../shared/types";
import { resolveTokenValue } from "../../shared/resolveAlias";
import type { UndoSlot } from "../hooks/useUndo";
import { useInspectPreferencesContext } from "../contexts/InspectContext";
import {
  summarizeApplyWorkflow,
  shouldShowGroup,
  getBindingForProperty,
  getCurrentValue,
  getMergedCapabilities,
  getTokenTypeForProperty,
  getCompatibleTokenTypes,
  getNextUnboundProperty,
  buildRemoveBindingUndo,
  rankTokensForSelection,
  SUGGESTED_NAMES,
  suggestTokenPath,
} from "./selectionInspectorUtils";
import { SuggestedTokens } from "./SuggestedTokens";
import { PropertyRow } from "./PropertyRow";
import { SelectionInspectorBanners } from "./SelectionInspectorBanners";
import {
  SelectionInspectorEmptyState,
  SelectionInspectorLoadingState,
} from "./SelectionInspectorStates";
import { FeedbackPlaceholder } from "./FeedbackPlaceholder";
import { SelectionSyncStatusPill } from "./SelectionSyncStatusPill";
import { DeepInspectSection } from "./DeepInspectSection";
import { ExtractTokensPanel } from "./ExtractTokensPanel";
import { ConfirmModal } from "./ConfirmModal";
import { InlineBanner } from "./InlineBanner";
import { useSelectionHealth } from "../hooks/useSelectionHealth";

interface SelectionInspectorProps {
  selectedNodes: SelectionNodeInfo[];
  selectionLoading: boolean;
  tokenMap: Record<string, TokenMapEntry>;
  onSync: (scope: "page" | "selection") => void;
  syncing: boolean;
  syncProgress: { processed: number; total: number } | null;
  syncResult: SyncCompleteMessage | null;
  syncError?: string | null;
  connected: boolean;
  currentCollectionId: string;
  serverUrl: string;
  onTokenCreated: () => void;
  onNavigateToToken?: (tokenPath: string) => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onToast?: (message: string) => void;
  onGoToTokens?: () => void;
  triggerCreateToken?: number;
  triggerExtractToken?: number;
  onOpenRepair?: (
    prefillEntries?: readonly { from: string; to?: string }[],
  ) => void;
}

const PROP_FILTER_MODES = ["bound", "unbound", "colors", "dimensions"] as const;

export function SelectionInspector({
  selectedNodes,
  selectionLoading,
  tokenMap,
  onSync,
  syncing,
  syncProgress,
  syncResult,
  syncError,
  connected,
  currentCollectionId,
  serverUrl,
  onTokenCreated,
  onNavigateToToken,
  onPushUndo,
  onToast,
  onGoToTokens,
  triggerCreateToken,
  triggerExtractToken,
  onOpenRepair,
}: SelectionInspectorProps) {
  const {
    deepInspect,
    toggleDeepInspect,
    propFilter,
    setPropFilter,
    propFilterMode,
    setPropFilterMode,
    clearPropFilters,
  } = useInspectPreferencesContext();
  const [creatingFromProp, setCreatingFromProp] =
    useState<BindableProperty | null>(null);
  const [newTokenName, setNewTokenName] = useState("");
  const [createdTokenPath, setCreatedTokenPath] = useState<string | null>(null);
  const [freshSyncResult, setFreshSyncResult] =
    useState<SyncCompleteMessage | null>(null);

  const [bindingFromProp, setBindingFromProp] =
    useState<BindableProperty | null>(null);
  const [lastBoundProp, setLastBoundProp] = useState<BindableProperty | null>(
    null,
  );

  const [bindingErrors, setBindingErrors] = useState<
    Partial<Record<BindableProperty, string>>
  >({});

  const [peerSuggestion, setPeerSuggestion] = useState<{
    property: BindableProperty;
    peerIds: string[];
    tokenPath: string;
    tokenType: string;
    resolvedValue: unknown;
  } | null>(null);

  const [propTypeSuggestion, setPropTypeSuggestion] = useState<{
    tokenPath: string;
    tokenType: string;
    resolvedValue: unknown;
    targetProps: BindableProperty[];
  } | null>(null);

  const [noMoreSiblings, setNoMoreSiblings] = useState(false);
  const [deepRemoveError, setDeepRemoveError] = useState<string | null>(null);

  const [applyProgress, setApplyProgress] = useState<{
    processed: number;
    total: number;
  } | null>(null);

  const prevNodeIdsRef = useRef<string>("");

  const handleToggleDeepInspect = useCallback(() => {
    toggleDeepInspect();
  }, [toggleDeepInspect]);

  const handleDeepRemoveBinding = useCallback(
    (nodeId: string, property: BindableProperty, tokenPath: string) => {
      parent.postMessage(
        { pluginMessage: { type: "remove-binding-from-node", nodeId, property } },
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

  const handleSelectDeepNode = useCallback((nodeId: string) => {
    parent.postMessage({ pluginMessage: { type: "select-node", nodeId } }, "*");
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg?.type === "applied-to-selection" && msg.targetProperty) {
        if (msg.errors?.length > 0) {
          setBindingErrors((prev) => ({
            ...prev,
            [msg.targetProperty]: msg.errors[0],
          }));
        } else {
          // Clear any previous error for this property on success
          setBindingErrors((prev) => {
            if (!(msg.targetProperty in prev)) return prev;
            const next = { ...prev };
            delete next[msg.targetProperty as BindableProperty];
            return next;
          });
        }
      }
      if (msg?.type === "select-next-sibling-result") {
        if (!msg.found) {
          setNoMoreSiblings(true);
          setTimeout(() => setNoMoreSiblings(false), 2000);
        }
      }
      if (msg?.type === "removed-binding-from-node" && !msg.success) {
        setDeepRemoveError(msg.error ?? "Failed to remove binding");
        setTimeout(() => setDeepRemoveError(null), 3000);
      }
      if (msg?.type === "apply-progress") {
        setApplyProgress({ processed: msg.processed, total: msg.total });
      }
      if (msg?.type === "applied-to-nodes") {
        setApplyProgress(null);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    if (!triggerCreateToken) return;
    const nodes = selectedNodes.filter((n) => (n.depth ?? 0) === 0);
    if (nodes.length === 0 || !connected || !currentCollectionId) return;
    const mergedCaps = getMergedCapabilities(nodes);
    const firstUnbound = getNextUnboundProperty(null, nodes, mergedCaps);
    // Fallback to first visible property with a value if all are bound
    let firstEligible: BindableProperty | null = null;
    if (!firstUnbound) {
      for (const group of PROPERTY_GROUPS) {
        if (!shouldShowGroup(group.condition, mergedCaps)) continue;
        for (const prop of group.properties) {
          const value = getCurrentValue(nodes, prop);
          if (value !== undefined && value !== null) {
            firstEligible = prop;
            break;
          }
        }
        if (firstEligible) break;
      }
    }
    const target = firstUnbound ?? firstEligible;
    if (target) {
      setBindingFromProp(null);
      setCreatingFromProp(target);
      const suggestedName =
        nodes.length === 1
          ? suggestTokenPath(target, nodes[0].name)
          : SUGGESTED_NAMES[target] || "token.new-token";
      setNewTokenName(suggestedName);
    }
  }, [
    triggerCreateToken,
    selectedNodes,
    connected,
    currentCollectionId,
    setBindingFromProp,
    setCreatingFromProp,
    setNewTokenName,
  ]);

  const rootNodes = selectedNodes.filter((n) => (n.depth ?? 0) === 0);
  const deepChildNodes = selectedNodes.filter((n) => (n.depth ?? 0) > 0);

  const hasSelection = rootNodes.length > 0;
  const caps = getMergedCapabilities(rootNodes);
  const workflowSummary = useMemo(
    () => summarizeApplyWorkflow(selectedNodes, tokenMap),
    [selectedNodes, tokenMap],
  );

  useEffect(() => {
    if (syncResult) setFreshSyncResult(syncResult);
  }, [syncResult]);

  useEffect(() => {
    const ids = rootNodes.map((n) => n.id).join(",");
    if (ids !== prevNodeIdsRef.current) {
      prevNodeIdsRef.current = ids;
      setFreshSyncResult(null);
      setBindingFromProp(null);
      setLastBoundProp(null);
      setCreatingFromProp(null);
      setNewTokenName("");
      setBindingErrors({});
      setPeerSuggestion(null);
      setPropTypeSuggestion(null);
      setNoMoreSiblings(false);
      setDeepRemoveError(null);
      setExtractOpen(null);
      setShowClearConfirm(false);
    }
  }, [selectedNodes, rootNodes]);

  const totalBindings = workflowSummary.boundPropertyCount;
  const mixedBindings = workflowSummary.mixedPropertyCount;

  const handleRemoveBinding = (prop: BindableProperty) => {
    const binding = getBindingForProperty(selectedNodes, prop);
    parent.postMessage(
      { pluginMessage: { type: "remove-binding", property: prop } },
      "*",
    );
    if (binding && binding !== "mixed") {
      if (onPushUndo) {
        onPushUndo(buildRemoveBindingUndo(binding, prop, tokenMap));
      }
      onToast?.("Binding removed");
    }
  };

  const handleUnbindAllInGroup = (groupProps: BindableProperty[]) => {
    const boundProps: Array<{
      prop: BindableProperty;
      tokenPath: string;
      tokenType: string;
      resolvedValue: unknown;
    }> = [];
    for (const prop of groupProps) {
      const binding = getBindingForProperty(rootNodes, prop);
      if (binding && binding !== "mixed") {
        const entry = tokenMap[binding];
        const tokenType = entry?.$type ?? getTokenTypeForProperty(prop);
        const resolved = entry
          ? resolveTokenValue(entry.$value, entry.$type, tokenMap)
          : { value: null };
        boundProps.push({
          prop,
          tokenPath: binding,
          tokenType,
          resolvedValue: resolved.value,
        });
      }
    }
    if (boundProps.length === 0) return;
    for (const { prop } of boundProps) {
      parent.postMessage(
        { pluginMessage: { type: "remove-binding", property: prop } },
        "*",
      );
    }
    onToast?.(
      `Unbound ${boundProps.length} binding${boundProps.length !== 1 ? "s" : ""}`,
    );
    if (onPushUndo) {
      onPushUndo({
        description: `Unbound ${boundProps.length} binding${boundProps.length !== 1 ? "s" : ""}`,
        restore: async () => {
          for (const {
            prop,
            tokenPath,
            tokenType,
            resolvedValue,
          } of boundProps) {
            parent.postMessage(
              {
                pluginMessage: {
                  type: "apply-to-selection",
                  tokenPath,
                  tokenType,
                  targetProperty: prop,
                  resolvedValue,
                },
              },
              "*",
            );
          }
        },
      });
    }
  };

  const handleClearAllBindings = () => {
    const boundProps: Array<{
      prop: BindableProperty;
      tokenPath: string;
      tokenType: string;
      resolvedValue: unknown;
    }> = [];
    for (const prop of ALL_BINDABLE_PROPERTIES) {
      const binding = getBindingForProperty(rootNodes, prop);
      if (binding && binding !== "mixed") {
        const entry = tokenMap[binding];
        const tokenType = entry?.$type ?? getTokenTypeForProperty(prop);
        const resolved = entry
          ? resolveTokenValue(entry.$value, entry.$type, tokenMap)
          : { value: null };
        boundProps.push({
          prop,
          tokenPath: binding,
          tokenType,
          resolvedValue: resolved.value,
        });
      }
    }
    parent.postMessage({ pluginMessage: { type: "clear-all-bindings" } }, "*");
    if (boundProps.length > 0) {
      onToast?.(
        `Cleared ${boundProps.length} binding${boundProps.length !== 1 ? "s" : ""}`,
      );
    }
    if (boundProps.length > 0 && onPushUndo) {
      onPushUndo({
        description: `Cleared ${boundProps.length} binding${boundProps.length !== 1 ? "s" : ""}`,
        restore: async () => {
          for (const {
            prop,
            tokenPath,
            tokenType,
            resolvedValue,
          } of boundProps) {
            parent.postMessage(
              {
                pluginMessage: {
                  type: "apply-to-selection",
                  tokenPath,
                  tokenType,
                  targetProperty: prop,
                  resolvedValue,
                },
              },
              "*",
            );
          }
        },
      });
    }
  };

  const cancelCreate = () => {
    setCreatingFromProp(null);
    setNewTokenName("");
    setCreatedTokenPath(null);
  };

  const cancelBind = () => {
    setBindingFromProp(null);
  };

  const openCreateFromProp = (prop: BindableProperty) => {
    cancelBind();
    setCreatingFromProp(prop);
    const singleNode = rootNodes.length === 1 ? rootNodes[0] : null;
    const suggested = singleNode?.name
      ? suggestTokenPath(prop, singleNode.name)
      : SUGGESTED_NAMES[prop] || "token.new-token";
    setNewTokenName(suggested);
  };

  const openBindFromProp = (prop: BindableProperty) => {
    cancelCreate();
    setBindingFromProp(prop);
  };

  const handleBindToken = (prop: BindableProperty, tokenPath: string) => {
    const entry = tokenMap[tokenPath];
    if (!entry) return;
    const oldBinding = getBindingForProperty(selectedNodes, prop);
    const resolved = resolveTokenValue(entry.$value, entry.$type, tokenMap);
    parent.postMessage(
      {
        pluginMessage: {
          type: "apply-to-selection",
          tokenPath,
          tokenType: entry.$type,
          targetProperty: prop,
          resolvedValue: resolved.value,
        },
      },
      "*",
    );
    if (onPushUndo) {
      onPushUndo({
        description: `Bound "${tokenPath}" to ${PROPERTY_LABELS[prop]}`,
        restore: async () => {
          if (oldBinding && oldBinding !== "mixed") {
            const prevEntry = tokenMap[oldBinding];
            const prevResolved = prevEntry
              ? resolveTokenValue(prevEntry.$value, prevEntry.$type, tokenMap)
              : { value: null };
            parent.postMessage(
              {
                pluginMessage: {
                  type: "apply-to-selection",
                  tokenPath: oldBinding,
                  tokenType: prevEntry?.$type ?? entry.$type,
                  targetProperty: prop,
                  resolvedValue: prevResolved.value,
                },
              },
              "*",
            );
          } else {
            parent.postMessage(
              { pluginMessage: { type: "remove-binding", property: prop } },
              "*",
            );
          }
        },
      });
    }
    cancelBind();
    setLastBoundProp(prop);
    setTimeout(
      () => setLastBoundProp((prev) => (prev === prop ? null : prev)),
      1500,
    );

    const nextUnbound = getNextUnboundProperty(prop, rootNodes, caps);
    if (nextUnbound) {
      setTimeout(() => {
        setBindingFromProp((prev) => {
          // Only advance if user hasn't manually opened a different panel
          if (prev === null) return nextUnbound;
          return prev;
        });
      }, 300);
    }

    {
      const compatUnboundProps = ALL_BINDABLE_PROPERTIES.filter((p) => {
        if (p === prop) return false;
        const b = getBindingForProperty(rootNodes, p);
        if (b) return false; // already bound
        const v = getCurrentValue(rootNodes, p);
        if (v === undefined || v === null) return false; // not visible / no value
        return getCompatibleTokenTypes(p).includes(entry.$type);
      });
      if (compatUnboundProps.length > 0) {
        setPropTypeSuggestion({
          tokenPath,
          tokenType: entry.$type,
          resolvedValue: resolved.value,
          targetProps: compatUnboundProps,
        });
      } else {
        setPropTypeSuggestion(null);
      }
    }

    if (rootNodes.length === 1) {
      const nodeId = rootNodes[0].id;
      parent.postMessage(
        {
          pluginMessage: {
            type: "find-peers-for-property",
            nodeId,
            property: prop,
          },
        },
        "*",
      );

      const handler = (event: MessageEvent) => {
        const msg = event.data?.pluginMessage;
        if (msg?.type !== "peers-for-property-result" || msg.property !== prop)
          return;
        window.removeEventListener("message", handler);
        const peerIds: string[] = msg.nodeIds;
        if (peerIds.length === 0) return;
        setPeerSuggestion({
          property: prop,
          peerIds,
          tokenPath,
          tokenType: entry.$type,
          resolvedValue: resolved.value,
        });
      };
      window.addEventListener("message", handler);
      setTimeout(() => window.removeEventListener("message", handler), 5000);
    }
  };

  const handleTokenCreated = (
    tokenPath: string,
    prop: BindableProperty,
    tokenType: string,
    tokenValue: BindableTokenValue,
  ) => {
    parent.postMessage(
      {
        pluginMessage: {
          type: "apply-to-selection",
          tokenPath,
          tokenType,
          targetProperty: prop,
          resolvedValue: tokenValue,
        },
      },
      "*",
    );
    setCreatingFromProp(null);
    setNewTokenName("");
    setCreatedTokenPath(tokenPath);
    onTokenCreated();

    const nextUnbound = getNextUnboundProperty(prop, rootNodes, caps);
    if (nextUnbound) {
      setTimeout(() => {
        setBindingFromProp((prev) => {
          if (prev === null) return nextUnbound;
          return prev;
        });
      }, 300);
    }
  };

  const headerLabel = !hasSelection
    ? "Select a layer to inspect"
    : rootNodes.length === 1
      ? `${rootNodes[0].name} (${rootNodes[0].type})`
      : `${rootNodes.length} layers selected`;

  const handleSelectLayer = useCallback((nodeId: string) => {
    parent.postMessage({ pluginMessage: { type: "select-node", nodeId } }, "*");
  }, []);

  const hasAnyTokens = Object.keys(tokenMap).length > 0;

  const suggestions = useMemo(
    () =>
      hasSelection && hasAnyTokens
        ? rankTokensForSelection(rootNodes, tokenMap, caps)
        : [],

    [hasSelection, hasAnyTokens, rootNodes, tokenMap, caps],
  );

  const allPropertiesBound =
    hasSelection &&
    totalBindings > 0 &&
    getNextUnboundProperty(null, rootNodes, caps) === null;

  const unboundWithValueCount = useMemo(() => {
    if (!hasSelection) return 0;
    return ALL_BINDABLE_PROPERTIES.reduce((sum, prop) => {
      const binding = getBindingForProperty(rootNodes, prop);
      if (binding) return sum;
      const value = getCurrentValue(rootNodes, prop);
      if (value === undefined || value === null) return sum;
      return sum + 1;
    }, 0);
  }, [hasSelection, rootNodes]);

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [extractOpen, setExtractOpen] = useState<BindableProperty[] | null>(
    null,
  );
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const remapMissingTokens = useMemo(() => {
    if (syncResult?.missingTokens.length) return syncResult.missingTokens;
    if (freshSyncResult?.missingTokens.length)
      return freshSyncResult.missingTokens;
    return [];
  }, [freshSyncResult, syncResult]);

  const selectionHealth = useSelectionHealth(selectedNodes, tokenMap);

  const staleBindingEntries = useMemo(() => {
    const byFrom = new Map<string, { from: string; to?: string }>();
    for (const entry of selectionHealth.staleBindingEntries) {
      byFrom.set(entry.from, entry);
    }
    for (const path of remapMissingTokens) {
      if (!path || tokenMap[path]) continue;
      if (!byFrom.has(path)) byFrom.set(path, { from: path });
    }
    return Array.from(byFrom.values());
  }, [remapMissingTokens, selectionHealth.staleBindingEntries, tokenMap]);

  const openExtract = useCallback(() => {
    const unboundProperties = ALL_BINDABLE_PROPERTIES.filter((prop) => {
      const binding = getBindingForProperty(rootNodes, prop);
      if (binding) return false;
      const value = getCurrentValue(rootNodes, prop);
      return value !== undefined && value !== null;
    });
    setExtractOpen(unboundProperties);
  }, [rootNodes]);

  const lastHandledExtractTrigger = useRef(0);
  useEffect(() => {
    if (!triggerExtractToken) return;
    if (triggerExtractToken === lastHandledExtractTrigger.current) return;
    if (!hasSelection) return;
    lastHandledExtractTrigger.current = triggerExtractToken;
    openExtract();
  }, [triggerExtractToken, hasSelection, openExtract]);

  const extractPending =
    !!triggerExtractToken &&
    triggerExtractToken !== lastHandledExtractTrigger.current &&
    !hasSelection;

  if (selectionLoading) {
    return <SelectionInspectorLoadingState />;
  }

  // No selection — full empty state
  if (!hasSelection) {
    return (
      <SelectionInspectorEmptyState
        onSelectLayer={handleSelectLayer}
        extractPending={extractPending}
      />
    );
  }

  // Check if there are any visible properties (bindings or current values)
  const hasVisibleProperties = PROPERTY_GROUPS.some((group) => {
    if (!shouldShowGroup(group.condition, caps)) return false;
    return group.properties.some((prop) => {
      const binding = getBindingForProperty(rootNodes, prop);
      const value = getCurrentValue(rootNodes, prop);
      return binding || value !== undefined;
    });
  });

  const COLOR_PROPS = new Set<BindableProperty>(["fill", "stroke"]);
  const DIMENSION_PROPS = new Set<BindableProperty>([
    "width",
    "height",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "itemSpacing",
    "cornerRadius",
    "strokeWeight",
  ]);

  const matchesPropFilter = (prop: BindableProperty): boolean => {
    // Text search
    if (propFilter) {
      const label = PROPERTY_LABELS[prop].toLowerCase();
      const q = propFilter.toLowerCase();
      if (!label.includes(q) && !prop.toLowerCase().includes(q)) return false;
    }
    // Mode filter
    if (propFilterMode === "bound") {
      const binding = getBindingForProperty(rootNodes, prop);
      return !!binding;
    }
    if (propFilterMode === "unbound") {
      const binding = getBindingForProperty(rootNodes, prop);
      return !binding;
    }
    if (propFilterMode === "mixed") {
      return getBindingForProperty(rootNodes, prop) === "mixed";
    }
    if (propFilterMode === "colors") return COLOR_PROPS.has(prop);
    if (propFilterMode === "dimensions") return DIMENSION_PROPS.has(prop);
    return true;
  };

  const isFilterActive = propFilter !== "" || propFilterMode !== "all";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Compact header */}
      <div className="flex items-center gap-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2 shrink-0">
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <span className="text-secondary font-medium text-[var(--color-figma-text)] truncate">
            {headerLabel}
          </span>
          <span className="text-secondary text-[var(--color-figma-text-secondary)] shrink-0">
            {totalBindings}/{workflowSummary.visiblePropertyCount} bound
          </span>
          {mixedBindings > 0 && (
            <span className="text-secondary text-[var(--color-figma-warning)] shrink-0">
              {mixedBindings} mixed
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <SelectionSyncStatusPill
            syncing={syncing}
            syncProgress={syncProgress}
            syncResult={syncResult}
            syncError={syncError}
            freshSyncResult={freshSyncResult}
            connected={connected}
            totalBindings={totalBindings}
          />
          {totalBindings > 0 && connected && (
            <button
              onClick={() => onSync("selection")}
              disabled={syncing}
              className="rounded px-1.5 py-0.5 text-secondary text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors disabled:opacity-50"
              title="Apply to selection"
            >
              Apply to selection
            </button>
          )}
          {connected && (
            <button
              onClick={() => onSync("page")}
              disabled={syncing}
              className="rounded px-1.5 py-0.5 text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-50"
              title="Apply to page"
            >
              Apply to page
            </button>
          )}
          {totalBindings > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="rounded px-1.5 py-0.5 text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              title={`Remove all ${totalBindings} binding${totalBindings !== 1 ? "s" : ""}`}
            >
              Remove bindings
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 shrink-0">
        <div className="relative min-w-0 flex-1">
          <svg
            width="9" height="9" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-secondary)]"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={propFilter}
            onChange={(e) => setPropFilter(e.target.value)}
            placeholder="Filter properties…"
            aria-label="Filter properties"
            className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 pl-5 pr-5 text-secondary text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)]"
          />
          {propFilter && (
            <button
              onClick={() => setPropFilter("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              aria-label="Clear filter"
            >
              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilterPanel((p) => !p)}
          title="Property filters"
          aria-label="Toggle property filters"
          className={`shrink-0 rounded p-1 transition-colors ${
            showFilterPanel || propFilterMode !== "all"
              ? "text-[var(--color-figma-accent)]"
              : "text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
          }`}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
        </button>
        <span className="w-px h-3 bg-[var(--color-figma-border)] shrink-0" />
        <button
          onClick={handleToggleDeepInspect}
          className={`shrink-0 rounded px-1.5 py-0.5 text-secondary transition-colors ${
            deepInspect
              ? "bg-[var(--color-figma-accent)]/20 font-medium text-[var(--color-figma-accent)]"
              : "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
          }`}
          title={deepInspect ? "Hide nested layers" : "Show nested layers"}
        >
          Children
        </button>
      </div>

      {showFilterPanel && (
        <div className="flex flex-wrap items-center gap-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 shrink-0">
          {PROP_FILTER_MODES.map((mode) => (
            <button
              key={mode}
              onClick={() => setPropFilterMode(propFilterMode === mode ? "all" : mode)}
              className={`rounded px-1.5 py-0.5 text-secondary transition-colors ${
                propFilterMode === mode
                  ? "bg-[var(--color-figma-accent)]/20 font-medium text-[var(--color-figma-accent)]"
                  : "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
              }`}
            >
              {mode === "bound" ? "Bound" : mode === "unbound" ? "Unbound" : mode === "colors" ? "Colors" : "Dimensions"}
            </button>
          ))}
          {mixedBindings > 0 && (
            <button
              onClick={() => setPropFilterMode(propFilterMode === "mixed" ? "all" : "mixed")}
              className={`rounded px-1.5 py-0.5 text-secondary transition-colors ${
                propFilterMode === "mixed"
                  ? "bg-[var(--color-figma-warning)]/20 font-medium text-[var(--color-figma-warning)]"
                  : "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
              }`}
            >
              Mixed
            </button>
          )}
          {isFilterActive && (
            <button
              onClick={clearPropFilters}
              className="text-secondary text-[var(--color-figma-accent)] hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden min-h-0">
        <div
          className="flex flex-col overflow-hidden min-w-0"
          style={{ flex: extractOpen || suggestions.length > 0 ? '56 0 0%' : '1 0 0%' }}
        >
          <div className="flex-1 overflow-y-auto">

            {/* Property list */}
            <div className="px-1 py-1">
              {!hasVisibleProperties && totalBindings === 0 ? (
                <FeedbackPlaceholder
                  variant="empty"
                  size="section"
                  title="No bindable properties"
                  description="Select a layer with design properties."
                  secondaryAction={
                    onGoToTokens
                      ? { label: "Go to Tokens", onClick: onGoToTokens }
                      : undefined
                  }
                />
              ) : (
                <div>
                  {PROPERTY_GROUPS.map((group, groupIdx) => {
                    if (!shouldShowGroup(group.condition, caps)) return null;

                    const visibleProps = group.properties.filter((prop) => {
                      const binding = getBindingForProperty(rootNodes, prop);
                      const value = getCurrentValue(rootNodes, prop);
                      if (!binding && value === undefined) return false;
                      return matchesPropFilter(prop);
                    });

                    if (visibleProps.length === 0) return null;

                    const boundPropsInGroup = visibleProps.filter((prop) => {
                      const binding = getBindingForProperty(rootNodes, prop);
                      return binding && binding !== "mixed";
                    });

                    return (
                      <div
                        key={group.label}
                        className={
                          groupIdx > 0
                            ? "mt-1 pt-1 border-t border-[var(--color-figma-border)]/50"
                            : ""
                        }
                      >
                        <div className="relative group/groupheader px-2 py-1 flex items-center">
                          <span className="text-secondary text-[var(--color-figma-text-secondary)] font-semibold flex-1">
                            {group.label}
                          </span>
                          {boundPropsInGroup.length > 0 && (
                            <button
                              onClick={() =>
                                handleUnbindAllInGroup(boundPropsInGroup)
                              }
                              className="opacity-0 group-hover/groupheader:opacity-100 pointer-events-none group-hover/groupheader:pointer-events-auto transition-opacity text-secondary text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] px-1 py-0.5 rounded hover:bg-[var(--color-figma-bg-hover)] shrink-0"
                              title={`Unbind all ${group.label.toLowerCase()} properties`}
                            >
                              Unbind all
                            </button>
                          )}
                        </div>
                        {visibleProps.map((prop) => (
                          <PropertyRow
                            key={prop}
                            prop={prop}
                            rootNodes={rootNodes}
                            selectedNodes={selectedNodes}
                            tokenMap={tokenMap}
                            connected={connected}
                            currentCollectionId={currentCollectionId}
                            serverUrl={serverUrl}
                            hasAnyTokens={hasAnyTokens}
                            creatingFromProp={creatingFromProp}
                            bindingFromProp={bindingFromProp}
                            lastBoundProp={lastBoundProp}
                            bindingError={bindingErrors[prop] ?? null}
                            onOpenCreate={openCreateFromProp}
                            onOpenBind={openBindFromProp}
                            onCancelCreate={cancelCreate}
                            onCancelBind={cancelBind}
                            onBindToken={handleBindToken}
                            onTokenCreated={handleTokenCreated}
                            onRemoveBinding={handleRemoveBinding}
                            onDismissBindingError={(p) =>
                              setBindingErrors((prev) => {
                                const n = { ...prev };
                                delete n[p];
                                return n;
                              })
                            }
                            onNavigateToToken={onNavigateToToken}
                            newTokenName={newTokenName}
                            onNewTokenNameChange={setNewTokenName}
                          />
                        ))}
                      </div>
                    );
                  })}
                  {isFilterActive &&
                    !PROPERTY_GROUPS.some(
                      (group) =>
                        shouldShowGroup(group.condition, caps) &&
                        group.properties.some((prop) => {
                          const binding = getBindingForProperty(rootNodes, prop);
                          const value = getCurrentValue(rootNodes, prop);
                          return (
                            (binding || value !== undefined) &&
                            matchesPropFilter(prop)
                          );
                        }),
                    ) && (
                      <FeedbackPlaceholder
                        variant="no-results"
                        size="section"
                        title="No matching properties"
                        description="Broaden or reset the filter."
                        secondaryAction={{
                          label: "Clear filter",
                          onClick: clearPropFilters,
                        }}
                      />
                    )}
                </div>
              )}
            </div>

            {/* Deep inspect (inline when toggled on) */}
            {deepInspect && (
              <div className="border-t border-[var(--color-figma-border)] px-1.5 py-1.5">
                <DeepInspectSection
                  deepChildNodes={deepChildNodes}
                  tokenMap={tokenMap}
                  onNavigateToToken={onNavigateToToken}
                  onRemoveBinding={handleDeepRemoveBinding}
                  onBindToken={handleDeepBindToken}
                  onSelectNode={handleSelectDeepNode}
                  showHeader
                />
                {deepRemoveError && (
                  <InlineBanner variant="error">{deepRemoveError}</InlineBanner>
                )}
              </div>
            )}

            {connected && currentCollectionId && unboundWithValueCount > 0 && !extractOpen && (
              <div className="flex items-center justify-end border-t border-[var(--color-figma-border)] px-3 py-1.5">
                <button
                  onClick={openExtract}
                  className="rounded px-2 py-0.5 text-secondary text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors"
                >
                  Extract {unboundWithValueCount} unbound
                </button>
              </div>
            )}
          </div>
        </div>

        {extractOpen ? (
          <div
            className="flex flex-col border-l border-[var(--color-figma-border)] overflow-hidden"
            style={{ flex: '44 0 0%', minWidth: 0 }}
          >
            <div className="px-2 py-1.5 border-b border-[var(--color-figma-border)] shrink-0 flex items-center gap-1.5">
              <span className="text-secondary font-semibold text-[var(--color-figma-text-secondary)] flex-1">Extract</span>
              <button
                onClick={() => setExtractOpen(null)}
                className="rounded p-0.5 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                title="Close"
                aria-label="Close"
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
            </div>
            <div className="flex-1 overflow-y-auto">
              <ExtractTokensPanel
                connected={connected}
                currentCollectionId={currentCollectionId}
                serverUrl={serverUrl}
                tokenMap={tokenMap}
                onTokenCreated={onTokenCreated}
                onClose={() => setExtractOpen(null)}
                propertyFilter={extractOpen}
                propertyFilterLabel="unbound"
                embedded
              />
            </div>
          </div>
        ) : suggestions.length > 0 ? (
          <div
            className="flex flex-col border-l border-[var(--color-figma-border)] overflow-hidden"
            style={{ flex: '44 0 0%', minWidth: 0 }}
          >
            <div className="px-2 py-1.5 border-b border-[var(--color-figma-border)] shrink-0 flex items-center gap-1.5">
              <span className="text-secondary font-semibold text-[var(--color-figma-text-secondary)] flex-1">Matches</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SuggestedTokens
                suggestions={suggestions}
                onApply={(tokenPath, property) =>
                  handleBindToken(property, tokenPath)
                }
                onApplyBatch={(items) => {
                  for (const item of items) {
                    handleBindToken(item.property, item.tokenPath);
                  }
                }}
                onNavigateToToken={onNavigateToToken}
                showHeader={false}
              />
            </div>
          </div>
        ) : null}
      </div>

      {showClearConfirm && (
        <ConfirmModal
          title={`Clear ${totalBindings} binding${totalBindings !== 1 ? "s" : ""}?`}
          description="Remove all token bindings from this layer. This can be undone."
          confirmLabel="Clear all"
          danger
          onConfirm={() => {
            setShowClearConfirm(false);
            handleClearAllBindings();
          }}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}

      <SelectionInspectorBanners
        staleBindingCount={staleBindingEntries.length}
        onOpenRepair={
          onOpenRepair && staleBindingEntries.length > 0
            ? () => onOpenRepair(staleBindingEntries)
            : undefined
        }
        peerSuggestion={peerSuggestion}
        onApplyPeerSuggestion={() => {
          if (!peerSuggestion) return;
          parent.postMessage(
            {
              pluginMessage: {
                type: "apply-to-nodes",
                nodeIds: peerSuggestion.peerIds,
                tokenPath: peerSuggestion.tokenPath,
                tokenType: peerSuggestion.tokenType,
                targetProperty: peerSuggestion.property,
                resolvedValue: peerSuggestion.resolvedValue,
              },
            },
            "*",
          );
          setPeerSuggestion(null);
        }}
        onDismissPeerSuggestion={() => setPeerSuggestion(null)}
        propTypeSuggestion={propTypeSuggestion}
        onApplyPropTypeSuggestion={() => {
          if (!propTypeSuggestion) return;
          for (const prop of propTypeSuggestion.targetProps) {
            parent.postMessage(
              {
                pluginMessage: {
                  type: "apply-to-selection",
                  tokenPath: propTypeSuggestion.tokenPath,
                  tokenType: propTypeSuggestion.tokenType,
                  targetProperty: prop,
                  resolvedValue: propTypeSuggestion.resolvedValue,
                },
              },
              "*",
            );
          }
          setPropTypeSuggestion(null);
        }}
        onDismissPropTypeSuggestion={() => setPropTypeSuggestion(null)}
        allPropertiesBound={allPropertiesBound && rootNodes.length === 1}
        noMoreSiblings={noMoreSiblings}
        onSelectNextSibling={() =>
          parent.postMessage(
            { pluginMessage: { type: "select-next-sibling" } },
            "*",
          )
        }
        applyProgress={applyProgress}
        createdTokenPath={createdTokenPath}
        onNavigateToToken={onNavigateToToken}
        onDismissCreatedToken={() => setCreatedTokenPath(null)}
      />
    </div>
  );
}
