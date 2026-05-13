/**
 * InspectContext — split into focused sub-contexts to minimise cascade
 * re-renders from high-frequency events:
 *
 *   SelectionContext  — Figma canvas selection (fires on every click in Figma)
 *   UsageContext      — token usage counts
 *   InspectPreferencesContext — persisted deep-inspect and property-filter UI
 *                       preferences used by App shell chrome and the inspector
 * Components that read canvas selection only re-render from SelectionContext.
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
  SelectionNodeInfo,
  TokenUsageMapMessage,
  TokenUsageMapCancelledMessage,
} from "../../shared/types";
import { matchesShortcut } from "../shared/shortcutRegistry";
import { STORAGE_KEYS, lsGet, lsSet } from "../shared/storage";
import { getPluginMessageFromEvent, postPluginMessage } from "../../shared/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  const scanRequestSequenceRef = useRef(0);
  const activeScanRequestIdRef = useRef<string | null>(null);

  const resetTokenUsageState = useCallback(() => {
    setTokenUsageCounts({});
    setHasTokenUsageScanResult(false);
  }, []);

  const startTokenUsageScan = useCallback(() => {
    scanRequestSequenceRef.current += 1;
    const requestId = `usage-map-${scanRequestSequenceRef.current}`;
    activeScanRequestIdRef.current = requestId;
    resetTokenUsageState();
    postPluginMessage({ type: "scan-token-usage", requestId });
  }, [resetTokenUsageState]);

  // Listen for token-usage-map results; re-scan after apply/sync/remap changes.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = getPluginMessageFromEvent<
        TokenUsageMapMessage | TokenUsageMapCancelledMessage | { type?: string }
      >(e);
      if (msg?.type === "token-usage-map") {
        const result = msg as TokenUsageMapMessage;
        if (result.requestId !== activeScanRequestIdRef.current) return;
        activeScanRequestIdRef.current = null;
        setTokenUsageCounts(result.usageMap ?? {});
        setHasTokenUsageScanResult(true);
      } else if (msg?.type === "token-usage-map-cancelled") {
        const cancellation = msg as TokenUsageMapCancelledMessage;
        if (cancellation.requestId !== activeScanRequestIdRef.current) return;
        activeScanRequestIdRef.current = null;
        resetTokenUsageState();
      } else if (
        msg?.type === "applied-to-selection" ||
        msg?.type === "sync-complete" ||
        msg?.type === "remap-complete"
      ) {
        resetTokenUsageState();
        if (scanDebounceRef.current) clearTimeout(scanDebounceRef.current);
        scanDebounceRef.current = setTimeout(() => {
          startTokenUsageScan();
        }, 300);
      }
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      if (scanDebounceRef.current) clearTimeout(scanDebounceRef.current);
    };
  }, [resetTokenUsageState, startTokenUsageScan]);

  const triggerUsageScan = useCallback(() => {
    startTokenUsageScan();
  }, [startTokenUsageScan]);

  const value = useMemo<UsageContextValue>(
    () => ({
      tokenUsageCounts,
      hasTokenUsageScanResult,
      triggerUsageScan,
    }),
    [
      tokenUsageCounts,
      hasTokenUsageScanResult,
      triggerUsageScan,
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
