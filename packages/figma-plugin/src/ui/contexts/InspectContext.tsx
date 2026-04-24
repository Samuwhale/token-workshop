/**
 * InspectContext — split into focused sub-contexts to minimise cascade
 * re-renders from high-frequency events:
 *
 *   SelectionContext  — Figma canvas selection (fires on every click in Figma)
 *   UsageContext      — token usage counts + consistency scan state
 *                       (consistency progress fires frequently during a scan)
 *   InspectPreferencesContext — persisted deep-inspect and property-filter UI
 *                       preferences used by App shell chrome and the inspector
 *
 * After the split, a consistency progress tick only re-renders
 * ConsistencyPanel, and a Figma canvas selection change only re-renders
 * components that read `selectedNodes`.
 *
 * `InspectProvider` is a thin wrapper that stacks the inspect-area providers.
 *
 * Note: The effect that triggers `scan-token-usage` based on active tab
 * and current token count stays in App.tsx because it depends on navigation
 * state. Call `inspect.triggerUsageScan()` from that effect.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import type { ReactNode, Dispatch, SetStateAction } from "react";
import { useSelection } from "../hooks/useSelection";
import type {
  ConsistencyScanErrorMessage,
  ConsistencyScanProgressMessage,
  ConsistencyScanResultMessage,
  ConsistencyScope,
  SelectionNodeInfo,
  ConsistencySuggestion,
  TokenMapEntry,
  TokenUsageMapMessage,
  TokenUsageMapCancelledMessage,
} from "../../shared/types";
import { matchesShortcut } from "../shared/shortcutRegistry";
import { STORAGE_KEYS, lsGet, lsSet } from "../shared/storage";
import { getPluginMessageFromEvent, postPluginMessage } from "../../shared/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const CONSISTENCY_SCAN_TIMEOUT_MS = 60_000;

export type InspectorPropFilterMode =
  | "all"
  | "bound"
  | "unbound"
  | "mixed"
  | "colors"
  | "dimensions";

export interface SelectionContextValue {
  selectedNodes: SelectionNodeInfo[];
  selectionLoading: boolean;
}

export interface UsageContextValue {
  tokenUsageCounts: Record<string, number>;
  hasTokenUsageScanResult: boolean;
  /** Imperatively trigger a scan-token-usage postMessage. Called from App.tsx
   *  when the active tab/token state indicates a scan is needed. */
  triggerUsageScan: () => void;
  consistencyResult: ConsistencySuggestion[] | null;
  consistencyLoading: boolean;
  consistencyError: string | null;
  consistencyProgress: { processed: number; total: number } | null;
  consistencyTotalNodes: number;
  consistencySnappedKeys: Set<string>;
  setConsistencySnappedKeys: Dispatch<SetStateAction<Set<string>>>;
  triggerConsistencyScan: (
    tokenMap: Record<string, { $value: unknown; $type: string }>,
    scope: string,
  ) => void;
  cancelConsistencyScan: () => void;
}

export interface InspectPreferencesContextValue {
  deepInspect: boolean;
  setDeepInspect: Dispatch<SetStateAction<boolean>>;
  toggleDeepInspect: () => void;
  propFilter: string;
  setPropFilter: Dispatch<SetStateAction<string>>;
  propFilterMode: InspectorPropFilterMode;
  setPropFilterMode: Dispatch<SetStateAction<InspectorPropFilterMode>>;
  clearPropFilters: () => void;
}

// ---------------------------------------------------------------------------
// Contexts and hooks
// ---------------------------------------------------------------------------

const SelectionContext = createContext<SelectionContextValue | null>(null);
const UsageContext = createContext<UsageContextValue | null>(null);
const InspectPreferencesContext =
  createContext<InspectPreferencesContextValue | null>(null);

export function useSelectionContext(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx)
    throw new Error("useSelectionContext must be used inside InspectProvider");
  return ctx;
}

export function useUsageContext(): UsageContextValue {
  const ctx = useContext(UsageContext);
  if (!ctx)
    throw new Error("useUsageContext must be used inside InspectProvider");
  return ctx;
}

export function useInspectPreferencesContext(): InspectPreferencesContextValue {
  const ctx = useContext(InspectPreferencesContext);
  if (!ctx)
    throw new Error(
      "useInspectPreferencesContext must be used inside InspectProvider",
    );
  return ctx;
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

function SelectionProvider({ children }: { children: ReactNode }) {
  const { selectedNodes, selectionLoading } = useSelection();
  const value = useMemo<SelectionContextValue>(
    () => ({ selectedNodes, selectionLoading }),
    [selectedNodes, selectionLoading],
  );
  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

function UsageProvider({ children }: { children: ReactNode }) {
  const [tokenUsageCounts, setTokenUsageCounts] = useState<
    Record<string, number>
  >({});
  const [hasTokenUsageScanResult, setHasTokenUsageScanResult] = useState(false);

  const scanDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [consistencyResult, setConsistencyResult] = useState<
    ConsistencySuggestion[] | null
  >(null);
  const [consistencyLoading, setConsistencyLoading] = useState(false);
  const [consistencyError, setConsistencyError] = useState<string | null>(null);
  const [consistencyProgress, setConsistencyProgress] = useState<{
    processed: number;
    total: number;
  } | null>(null);
  const [consistencyTotalNodes, setConsistencyTotalNodes] = useState(0);
  const [consistencySnappedKeys, setConsistencySnappedKeys] = useState<
    Set<string>
  >(new Set());
  const consistencyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const resetTokenUsageState = useCallback(() => {
    setTokenUsageCounts({});
    setHasTokenUsageScanResult(false);
  }, []);

  const clearConsistencyTimeout = useCallback(() => {
    if (consistencyTimeoutRef.current !== null) {
      clearTimeout(consistencyTimeoutRef.current);
      consistencyTimeoutRef.current = null;
    }
  }, []);

  // Listen for token-usage-map results; re-scan after apply/sync/remap changes.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = getPluginMessageFromEvent<
        TokenUsageMapMessage | TokenUsageMapCancelledMessage | { type?: string }
      >(e);
      if (msg?.type === "token-usage-map") {
        setTokenUsageCounts((msg as TokenUsageMapMessage).usageMap ?? {});
        setHasTokenUsageScanResult(true);
      } else if (msg?.type === "token-usage-map-cancelled") {
        resetTokenUsageState();
      } else if (
        msg?.type === "applied-to-selection" ||
        msg?.type === "sync-complete" ||
        msg?.type === "remap-complete"
      ) {
        resetTokenUsageState();
        if (scanDebounceRef.current) clearTimeout(scanDebounceRef.current);
        scanDebounceRef.current = setTimeout(() => {
          postPluginMessage({ type: "scan-token-usage" });
        }, 300);
      }
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      if (scanDebounceRef.current) clearTimeout(scanDebounceRef.current);
    };
  }, [resetTokenUsageState]);

  // Listen for consistency scan messages
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = getPluginMessageFromEvent<
        | ConsistencyScanProgressMessage
        | ConsistencyScanResultMessage
        | ConsistencyScanErrorMessage
        | { type?: "consistency-scan-cancelled" }
      >(e);
      if (!msg) return;
      if (msg.type === "consistency-scan-progress") {
        setConsistencyProgress({ processed: msg.processed, total: msg.total });
      } else if (msg.type === "consistency-scan-result") {
        clearConsistencyTimeout();
        setConsistencyLoading(false);
        setConsistencyProgress(null);
        setConsistencyResult(msg.suggestions);
        setConsistencyTotalNodes(msg.totalNodes);
        setConsistencyError(null);
      } else if (msg.type === "consistency-scan-error") {
        clearConsistencyTimeout();
        setConsistencyLoading(false);
        setConsistencyProgress(null);
        setConsistencyError(msg.error);
      } else if (msg.type === "consistency-scan-cancelled") {
        clearConsistencyTimeout();
        setConsistencyLoading(false);
        setConsistencyProgress(null);
      }
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      clearConsistencyTimeout();
    };
  }, [clearConsistencyTimeout]);

  const triggerUsageScan = useCallback(() => {
    resetTokenUsageState();
    postPluginMessage({ type: "scan-token-usage" });
  }, [resetTokenUsageState]);

  const triggerConsistencyScan = useCallback(
    (
      tokenMap: Record<string, { $value: unknown; $type: string }>,
      scope: string,
    ) => {
      clearConsistencyTimeout();
      setConsistencyLoading(true);
      setConsistencyProgress(null);
      setConsistencyResult(null);
      setConsistencyError(null);
      setConsistencySnappedKeys(new Set());

      consistencyTimeoutRef.current = setTimeout(() => {
        consistencyTimeoutRef.current = null;
        postPluginMessage({ type: "cancel-scan" });
        setConsistencyLoading(false);
        setConsistencyProgress(null);
        setConsistencyError(
          "Scan timed out. Try a smaller scope (Page instead of All pages).",
        );
      }, CONSISTENCY_SCAN_TIMEOUT_MS);

      postPluginMessage({
        type: "scan-consistency",
        tokenMap: tokenMap as Record<string, TokenMapEntry>,
        scope: scope as ConsistencyScope,
      });
    },
    [clearConsistencyTimeout],
  );

  const cancelConsistencyScan = useCallback(() => {
    clearConsistencyTimeout();
    postPluginMessage({ type: "cancel-scan" });
    setConsistencyLoading(false);
    setConsistencyProgress(null);
  }, [clearConsistencyTimeout]);

  const value = useMemo<UsageContextValue>(
    () => ({
      tokenUsageCounts,
      hasTokenUsageScanResult,
      triggerUsageScan,
      consistencyResult,
      consistencyLoading,
      consistencyError,
      consistencyProgress,
      consistencyTotalNodes,
      consistencySnappedKeys,
      setConsistencySnappedKeys,
      triggerConsistencyScan,
      cancelConsistencyScan,
    }),
    [
      tokenUsageCounts,
      hasTokenUsageScanResult,
      triggerUsageScan,
      consistencyResult,
      consistencyLoading,
      consistencyError,
      consistencyProgress,
      consistencyTotalNodes,
      consistencySnappedKeys,
      setConsistencySnappedKeys,
      triggerConsistencyScan,
      cancelConsistencyScan,
    ],
  );

  return (
    <UsageContext.Provider value={value}>{children}</UsageContext.Provider>
  );
}

function InspectPreferencesProvider({ children }: { children: ReactNode }) {
  const [deepInspect, setDeepInspect] = useState(
    () => lsGet(STORAGE_KEYS.DEEP_INSPECT) === "true",
  );
  const [propFilter, setPropFilter] = useState(
    () => lsGet(STORAGE_KEYS.INSPECT_PROP_FILTER) ?? "",
  );
  const [propFilterMode, setPropFilterMode] = useState<InspectorPropFilterMode>(
    () => {
      const stored = lsGet(STORAGE_KEYS.INSPECT_PROP_FILTER_MODE);
      return (stored as InspectorPropFilterMode | null) ?? "all";
    },
  );

  useEffect(() => {
    lsSet(STORAGE_KEYS.DEEP_INSPECT, String(deepInspect));
    postPluginMessage({ type: "set-deep-inspect", enabled: deepInspect });
  }, [deepInspect]);

  useEffect(() => {
    lsSet(STORAGE_KEYS.INSPECT_PROP_FILTER, propFilter);
  }, [propFilter]);

  useEffect(() => {
    lsSet(STORAGE_KEYS.INSPECT_PROP_FILTER_MODE, propFilterMode);
  }, [propFilterMode]);

  const toggleDeepInspect = useCallback(() => {
    setDeepInspect((prev) => !prev);
  }, []);

  const clearPropFilters = useCallback(() => {
    setPropFilter("");
    setPropFilterMode("all");
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!matchesShortcut(event, "TOGGLE_DEEP_INSPECT")) return;
      event.preventDefault();
      toggleDeepInspect();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [toggleDeepInspect]);

  const value = useMemo<InspectPreferencesContextValue>(
    () => ({
      deepInspect,
      setDeepInspect,
      toggleDeepInspect,
      propFilter,
      setPropFilter,
      propFilterMode,
      setPropFilterMode,
      clearPropFilters,
    }),
    [
      deepInspect,
      toggleDeepInspect,
      propFilter,
      propFilterMode,
      clearPropFilters,
    ],
  );

  return (
    <InspectPreferencesContext.Provider value={value}>
      {children}
    </InspectPreferencesContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Public wrapper — stacks the three providers
// ---------------------------------------------------------------------------

export function InspectProvider({ children }: { children: ReactNode }) {
  return (
    <SelectionProvider>
      <UsageProvider>
        <InspectPreferencesProvider>{children}</InspectPreferencesProvider>
      </UsageProvider>
    </SelectionProvider>
  );
}
