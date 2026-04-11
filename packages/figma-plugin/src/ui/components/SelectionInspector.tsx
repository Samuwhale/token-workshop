import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type MutableRefObject,
} from "react";
import {
  PROPERTY_GROUPS,
  PROPERTY_LABELS,
  ALL_BINDABLE_PROPERTIES,
} from "../../shared/types";
import type {
  BindableProperty,
  SelectionNodeInfo,
  SyncCompleteMessage,
  TokenMapEntry,
  ExtractedTokenEntry,
} from "../../shared/types";
import { resolveTokenValue } from "../../shared/resolveAlias";
import type { UndoSlot } from "../hooks/useUndo";
import { getErrorMessage, tokenPathToUrlSegment } from "../shared/utils";
import { apiFetch } from "../shared/apiFetch";
import type { ApplyWorkflowStage } from "../shared/applyWorkflow";
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
import { MaintenanceToolsSection } from "./MaintenanceToolsSection";
import { SelectionInspectorBanners } from "./SelectionInspectorBanners";
import {
  SelectionInspectorEmptyState,
  SelectionInspectorLoadingState,
} from "./SelectionInspectorStates";
import { FeedbackPlaceholder } from "./FeedbackPlaceholder";
import { NoticePill } from "../shared/noticeSystem";

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
  activeSet: string;
  serverUrl: string;
  onTokenCreated: () => void;
  onNavigateToToken?: (tokenPath: string) => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onToast?: (message: string) => void;
  onGoToTokens?: () => void;
  /** Increment to trigger create-from-first-property (Cmd+T shortcut) */
  triggerCreateToken?: number;
  selectionInspectorHandle?: MutableRefObject<SelectionInspectorHandle | null>;
}

export interface SelectionInspectorHandle {
  focusStage: (stage: ApplyWorkflowStage) => void;
}

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
  activeSet,
  serverUrl,
  onTokenCreated,
  onNavigateToToken,
  onPushUndo,
  onToast,
  onGoToTokens,
  triggerCreateToken,
  selectionInspectorHandle,
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

  // Inline bind-existing-token state
  const [bindingFromProp, setBindingFromProp] =
    useState<BindableProperty | null>(null);
  const [lastBoundProp, setLastBoundProp] = useState<BindableProperty | null>(
    null,
  );

  // Binding error feedback from the plugin sandbox
  const [bindingErrors, setBindingErrors] = useState<
    Partial<Record<BindableProperty, string>>
  >({});

  // Extract & Bind All Unbound fast-path state
  const [extractingUnbound, setExtractingUnbound] = useState(false);
  const [extractUnboundResult, setExtractUnboundResult] = useState<{
    created: number;
    bound: number;
  } | null>(null);
  const [extractUnboundError, setExtractUnboundError] = useState<string | null>(
    null,
  );

  // Persistent peer suggestion — survives until dismissed or selection changes
  const [peerSuggestion, setPeerSuggestion] = useState<{
    property: BindableProperty;
    peerIds: string[];
    tokenPath: string;
    tokenType: string;
    resolvedValue: any;
  } | null>(null);

  // Persistent prop-type suggestion — offer to apply the same token to all other
  // unbound properties of the same type (e.g., after binding color.primary to fill,
  // offer to also apply it to stroke and any other unbound color properties)
  const [propTypeSuggestion, setPropTypeSuggestion] = useState<{
    tokenPath: string;
    tokenType: string;
    resolvedValue: any;
    targetProps: BindableProperty[];
  } | null>(null);

  // Feedback for select-next-sibling (no more siblings)
  const [noMoreSiblings, setNoMoreSiblings] = useState(false);
  // Error feedback for remove-binding-from-node failures
  const [deepRemoveError, setDeepRemoveError] = useState<string | null>(null);

  // Progress tracking for apply-to-nodes operations (e.g. apply to all peers)
  const [applyProgress, setApplyProgress] = useState<{
    processed: number;
    total: number;
  } | null>(null);

  const prevNodeIdsRef = useRef<string>("");
  const summarySectionRef = useRef<HTMLElement | null>(null);
  const suggestionsSectionRef = useRef<HTMLElement | null>(null);
  const bindingsSectionRef = useRef<HTMLElement | null>(null);
  const advancedSectionRef = useRef<HTMLElement | null>(null);

  const handleToggleDeepInspect = useCallback(() => {
    toggleDeepInspect();
  }, [toggleDeepInspect]);

  // Listen for binding results from the plugin sandbox
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

  // Cmd+T: open create-from-first-unbound-property
  useEffect(() => {
    if (!triggerCreateToken) return;
    const nodes = selectedNodes.filter((n) => (n.depth ?? 0) === 0);
    if (nodes.length === 0 || !connected || !activeSet) return;
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
      setNewTokenName(SUGGESTED_NAMES[target] || "token.new-token");
    }
  }, [
    triggerCreateToken,
    selectedNodes,
    connected,
    activeSet,
    setBindingFromProp,
    setCreatingFromProp,
    setNewTokenName,
  ]);

  // Split selected nodes into directly-selected (depth 0) vs deep children (depth 1+)
  const rootNodes = selectedNodes.filter((n) => (n.depth ?? 0) === 0);
  const deepChildNodes = selectedNodes.filter((n) => (n.depth ?? 0) > 0);

  const hasSelection = rootNodes.length > 0;
  const caps = getMergedCapabilities(rootNodes);
  const workflowSummary = useMemo(
    () => summarizeApplyWorkflow(selectedNodes, tokenMap),
    [selectedNodes, tokenMap],
  );

  // Capture sync result for freshness badge (outlives the 3s global clear)
  useEffect(() => {
    if (syncResult) setFreshSyncResult(syncResult);
  }, [syncResult]);

  // Clear freshness and cancel any open inline panels when the selected nodes change
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
      setExtractingUnbound(false);
      setExtractUnboundResult(null);
      setExtractUnboundError(null);
      setNoMoreSiblings(false);
      setDeepRemoveError(null);
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
      resolvedValue: any;
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
      resolvedValue: any;
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

    // Auto-advance: open bind panel on next unbound property
    // We need to treat the just-bound property as bound for the advance check,
    // so pass afterProp to skip past it and find the next unbound one.
    const nextUnbound = getNextUnboundProperty(prop, rootNodes, caps);
    if (nextUnbound) {
      // Small delay so the "Bound" flash is visible before the next panel opens
      setTimeout(() => {
        setBindingFromProp((prev) => {
          // Only advance if user hasn't manually opened a different panel
          if (prev === null) return nextUnbound;
          return prev;
        });
      }, 300);
    }

    // "Apply to all [type] properties" — detect other visible unbound properties
    // that accept the same token type and offer to apply the same token to all of them
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
        // Clear any stale suggestion from a previous bind
        setPropTypeSuggestion(null);
      }
    }

    // "Apply to peers" fast path: for single-layer selection, check if sibling
    // layers support the same property and offer to apply the binding persistently
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

      // One-shot listener for the response
      const handler = (event: MessageEvent) => {
        const msg = event.data?.pluginMessage;
        if (msg?.type !== "peers-for-property-result" || msg.property !== prop)
          return;
        window.removeEventListener("message", handler);
        const peerIds: string[] = msg.nodeIds;
        if (peerIds.length === 0) return;
        // Store as persistent state — banner stays until dismissed or selection changes
        setPeerSuggestion({
          property: prop,
          peerIds,
          tokenPath,
          tokenType: entry.$type,
          resolvedValue: resolved.value,
        });
      };
      window.addEventListener("message", handler);
      // Clean up listener after 5s if no response
      setTimeout(() => window.removeEventListener("message", handler), 5000);
    }
  };

  const handleTokenCreated = (
    tokenPath: string,
    prop: BindableProperty,
    tokenType: string,
    tokenValue: any,
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

    // Auto-advance: open bind panel on next unbound property
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

  // Context-aware token suggestions for the current selection
  const suggestions = useMemo(
    () =>
      hasSelection && hasAnyTokens
        ? rankTokensForSelection(rootNodes, tokenMap, caps)
        : [],

    [hasSelection, hasAnyTokens, rootNodes, tokenMap, caps],
  );

  // Check if all visible properties with values are bound (no more unbound to advance to)
  const allPropertiesBound =
    hasSelection &&
    totalBindings > 0 &&
    getNextUnboundProperty(null, rootNodes, caps) === null;

  // Count unbound properties that have a current value (candidates for the fast-path batch action)
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

  // Fast-path: extract tokens for all unbound properties and bind them in one step
  const handleExtractAllUnbound = useCallback(() => {
    if (!connected || !activeSet || extractingUnbound) return;
    const snapshot = rootNodes; // capture binding state at click time
    setExtractingUnbound(true);
    setExtractUnboundError(null);
    setExtractUnboundResult(null);

    let handled = false;
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg?.type !== "extracted-tokens") return;
      if (handled) return;
      handled = true;
      clearTimeout(timeout);
      window.removeEventListener("message", handler);

      const extracted = msg.tokens as ExtractedTokenEntry[];
      // Only create tokens for currently unbound properties
      const unboundTokens = extracted.filter((token) => {
        const prop = token.property as BindableProperty;
        return !getBindingForProperty(snapshot, prop);
      });

      if (unboundTokens.length === 0) {
        setExtractingUnbound(false);
        setExtractUnboundResult({ created: 0, bound: 0 });
        return;
      }

      (async () => {
        let created = 0;
        try {
          for (const token of unboundTokens) {
            const pathEncoded = tokenPathToUrlSegment(token.suggestedName);
            const existing = tokenMap[token.suggestedName];
            const method = existing ? "PATCH" : "POST";
            await apiFetch(
              `${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${pathEncoded}`,
              {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  $type: token.tokenType,
                  $value: token.value,
                }),
              },
            );
            created++;
          }
          let totalBound = 0;
          for (const token of unboundTokens) {
            const targetProperty =
              token.property === "border" ? "stroke" : token.property;
            const nodeIds = token.layerIds ?? [token.layerId];
            parent.postMessage(
              {
                pluginMessage: {
                  type: "apply-to-nodes",
                  nodeIds,
                  tokenPath: token.suggestedName,
                  tokenType: token.tokenType,
                  targetProperty,
                  resolvedValue: token.value,
                },
              },
              "*",
            );
            totalBound += nodeIds.length;
          }
          setExtractUnboundResult({ created, bound: totalBound });
          onTokenCreated();
        } catch (err) {
          setExtractUnboundError(getErrorMessage(err));
        } finally {
          setExtractingUnbound(false);
        }
      })();
    };

    const timeout = setTimeout(() => {
      if (!handled) {
        handled = true;
        window.removeEventListener("message", handler);
        setExtractingUnbound(false);
        setExtractUnboundError(
          "No response from Figma — make sure a layer is selected and try again.",
        );
      }
    }, 8000);

    window.addEventListener("message", handler);
    parent.postMessage(
      { pluginMessage: { type: "extract-tokens-from-selection" } },
      "*",
    );
  }, [
    connected,
    activeSet,
    extractingUnbound,
    rootNodes,
    tokenMap,
    serverUrl,
    onTokenCreated,
  ]);

  const visiblePropertyStats = useMemo(
    () => ({
      visible: workflowSummary.visiblePropertyCount,
      bound: workflowSummary.boundPropertyCount,
      mixed: workflowSummary.mixedPropertyCount,
      unbound: workflowSummary.unboundPropertyCount,
    }),
    [workflowSummary],
  );

  const focusStage = useCallback((stage: ApplyWorkflowStage) => {
    const target =
      stage === "summary"
        ? summarySectionRef.current
        : stage === "suggestions"
          ? suggestionsSectionRef.current
          : stage === "bindings"
            ? bindingsSectionRef.current
            : advancedSectionRef.current;
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!selectionInspectorHandle) return;
    selectionInspectorHandle.current = { focusStage };
    return () => {
      selectionInspectorHandle.current = null;
    };
  }, [focusStage, selectionInspectorHandle]);

  if (selectionLoading) {
    return <SelectionInspectorLoadingState />;
  }

  // No selection — full empty state
  if (!hasSelection) {
    return <SelectionInspectorEmptyState onSelectLayer={handleSelectLayer} />;
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

  // Property filter helpers
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
  const nextUnboundProperty = workflowSummary.nextUnboundProperty;

  const summaryGuidance = !connected
    ? "Connect to the token server to bind, extract, or sync tokens for this selection."
    : suggestions.length > 0
      ? `Review ${suggestions.length} best match${suggestions.length === 1 ? "" : "es"} before you bind properties manually.`
      : nextUnboundProperty
        ? `Start with ${PROPERTY_LABELS[nextUnboundProperty]} below, or apply one of the suggested tokens if it already matches.`
        : workflowSummary.allVisiblePropertiesBound
          ? "Everything visible is already tokenized. Replace a binding below or use advanced tools for maintenance work."
          : "Review the visible properties below and bind or create tokens where needed.";

  const syncStatusToneClass = syncing
    ? "bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
    : syncError
      ? "bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]"
      : syncResult
        ? syncResult.errors > 0
          ? "bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]"
          : syncResult.missingTokens.length > 0
            ? "bg-[var(--color-figma-warning,#f5a623)]/15 text-[var(--color-figma-warning,#f5a623)]"
            : "bg-[var(--color-figma-success)]/10 text-[var(--color-figma-success)]"
        : freshSyncResult && freshSyncResult.missingTokens.length === 0
          ? "bg-[var(--color-figma-success)]/10 text-[var(--color-figma-success)]"
          : "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]";

  const syncStatusLabel =
    syncing && syncProgress
      ? `Syncing ${syncProgress.processed}/${syncProgress.total}`
      : syncError
        ? "Sync failed"
        : syncResult
          ? syncResult.errors > 0
            ? `${syncResult.errors} failed`
            : syncResult.updated === 0 && syncResult.missingTokens.length === 0
              ? "Up to date"
              : `Updated ${syncResult.updated}`
          : freshSyncResult && freshSyncResult.missingTokens.length === 0
            ? "Selection in sync"
            : totalBindings > 0 && connected
              ? "Ready to sync"
              : connected
                ? "No sync pending"
                : "Disconnected";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="flex flex-col gap-3">
          <section
            ref={summarySectionRef}
            className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                  Step 1
                </p>
                <p className="text-[10px] font-semibold text-[var(--color-figma-text)]">
                  Selected layer summary
                </p>
                <p className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed">
                  {summaryGuidance}
                  <span className="block truncate">{headerLabel}</span>
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-medium ${syncStatusToneClass}`}
              >
                {syncStatusLabel}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-[var(--color-figma-accent)]/15 px-2 py-1 text-[9px] font-medium text-[var(--color-figma-accent)]">
                {visiblePropertyStats.bound} bound
              </span>
              <span className="rounded-full bg-[var(--color-figma-bg-hover)] px-2 py-1 text-[9px] font-medium text-[var(--color-figma-text-secondary)]">
                {visiblePropertyStats.unbound} unbound
              </span>
              {visiblePropertyStats.mixed > 0 && (
                <NoticePill severity="warning">
                  {visiblePropertyStats.mixed} mixed
                </NoticePill>
              )}
              <span className="rounded-full bg-[var(--color-figma-bg-hover)] px-2 py-1 text-[9px] font-medium text-[var(--color-figma-text-secondary)]">
                {visiblePropertyStats.visible} visible properties
              </span>
            </div>
          </section>

          <section
            ref={suggestionsSectionRef}
            className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                Step 2
              </p>
              <p className="text-[10px] font-semibold text-[var(--color-figma-text)]">
                Best-match suggestions
              </p>
              <p className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed">
                {suggestions.length > 0
                  ? "Start with the strongest suggested token matches before you bind properties one-by-one."
                  : !hasAnyTokens
                    ? "Create tokens in the Tokens workspace first. Once the library exists, the Apply workspace will surface best matches here."
                    : workflowSummary.hasVisibleProperties
                      ? "No strong automatic matches surfaced for this selection. Continue into property binding and choose the right token manually."
                      : "This selection does not expose token-ready properties, so there are no best matches to review."}
              </p>
            </div>
            {suggestions.length > 0 ? (
              <SuggestedTokens
                suggestions={suggestions}
                onApply={(tokenPath, property) =>
                  handleBindToken(property, tokenPath)
                }
                onNavigateToToken={onNavigateToToken}
                showHeader={false}
              />
            ) : (
              <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-[var(--color-figma-bg-hover)] px-2 py-1 text-[9px] font-medium text-[var(--color-figma-text-secondary)]">
                    {workflowSummary.suggestionCount} matches ready
                  </span>
                  {!hasAnyTokens && (
                    <span className="rounded-full bg-[var(--color-figma-warning,#f5a623)]/15 px-2 py-1 text-[9px] font-medium text-[var(--color-figma-warning,#f5a623)]">
                      Token library needed
                    </span>
                  )}
                </div>
                {!hasAnyTokens && onGoToTokens && (
                  <button
                    onClick={onGoToTokens}
                    className="mt-2 text-[10px] text-[var(--color-figma-accent)] hover:underline"
                  >
                    Go to Tokens →
                  </button>
                )}
              </div>
            )}
          </section>

          <section
            ref={bindingsSectionRef}
            className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
              <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                Step 3
              </p>
              <p className="text-[10px] font-semibold text-[var(--color-figma-text)]">
                Bind visible properties
              </p>
              <p className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed">
                Review each visible property, then bind, replace, remove, or
                create a token directly from the current value.
              </p>
            </div>
            <div className="px-1.5 py-1.5">
              {!hasVisibleProperties && totalBindings === 0 ? (
                <FeedbackPlaceholder
                  variant="empty"
                  size="section"
                  title="No token-ready properties found"
                  description="Apply tokens from the Tokens tab or expose more design properties on the selected layer to work here."
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
                          <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-semibold uppercase tracking-wide flex-1">
                            {group.label}
                          </span>
                          {boundPropsInGroup.length > 0 && (
                            <button
                              onClick={() =>
                                handleUnbindAllInGroup(boundPropsInGroup)
                              }
                              className="opacity-0 group-hover/groupheader:opacity-100 pointer-events-none group-hover/groupheader:pointer-events-auto transition-opacity text-[9px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] px-1 py-0.5 rounded hover:bg-[var(--color-figma-bg-hover)] shrink-0"
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
                            activeSet={activeSet}
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
                          const binding = getBindingForProperty(
                            rootNodes,
                            prop,
                          );
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
                        title="No properties match the current filter"
                        description="Try a broader property query or reset the active filter mode."
                        secondaryAction={{
                          label: "Clear filter",
                          onClick: clearPropFilters,
                        }}
                      />
                    )}
                </div>
              )}
            </div>
          </section>

          <MaintenanceToolsSection
            ref={advancedSectionRef}
            selectionKey={rootNodes.map((node) => node.id).join(",")}
            connected={connected}
            activeSet={activeSet}
            serverUrl={serverUrl}
            tokenMap={tokenMap}
            onTokenCreated={onTokenCreated}
            onSync={onSync}
            syncing={syncing}
            syncProgress={syncProgress}
            syncResult={syncResult}
            syncError={syncError}
            freshSyncResult={freshSyncResult}
            syncStatusToneClass={syncStatusToneClass}
            syncStatusLabel={syncStatusLabel}
            totalBindings={totalBindings}
            deepInspect={deepInspect}
            onToggleDeepInspect={handleToggleDeepInspect}
            deepChildNodes={deepChildNodes}
            onNavigateToToken={onNavigateToToken}
            onPushUndo={onPushUndo}
            onSelectLayer={handleSelectLayer}
            deepRemoveError={deepRemoveError}
            hasVisibleProperties={hasVisibleProperties}
            propFilter={propFilter}
            onPropFilterChange={setPropFilter}
            propFilterMode={propFilterMode}
            onPropFilterModeChange={setPropFilterMode}
            mixedBindings={mixedBindings}
            isFilterActive={isFilterActive}
            onClearFilters={clearPropFilters}
            unboundWithValueCount={unboundWithValueCount}
            onExtractAllUnbound={handleExtractAllUnbound}
            extractingUnbound={extractingUnbound}
            extractUnboundResult={extractUnboundResult}
            onDismissExtractUnboundResult={() => setExtractUnboundResult(null)}
            extractUnboundError={extractUnboundError}
            onDismissExtractUnboundError={() => setExtractUnboundError(null)}
            onClearAllBindings={handleClearAllBindings}
          />
        </div>
      </div>

      <SelectionInspectorBanners
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
