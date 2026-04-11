/**
 * NavigationContext — owns the two-tier tab navigation state
 * (activeTopTab, activeSubTab, activeSecondarySurface) and the navigateTo /
 * setSubTab actions. `activeSecondarySurface` is reserved for full-height
 * secondary takeovers that preserve shell context while replacing the body.
 * Extracted from App.tsx so PanelRouter and other consumers can read
 * navigation state directly without receiving it as props.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import type { ReactNode } from "react";
import type {
  TopTab,
  SubTab,
  SecondarySurfaceId,
} from "../shared/navigationTypes";
import {
  TOP_TABS,
  DEFAULT_SUB_TABS,
  SUB_TAB_STORAGE,
} from "../shared/navigationTypes";
import { STORAGE_KEYS, lsGet, lsSet } from "../shared/storage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NavigationContextValue {
  activeTopTab: TopTab;
  activeSubTab: SubTab;
  activeSecondarySurface: SecondarySurfaceId | null;
  navigateTo: (
    top: TopTab,
    sub?: SubTab,
    options?: { preserveSecondarySurface?: boolean },
  ) => void;
  openSecondarySurface: (surface: SecondarySurfaceId) => void;
  closeSecondarySurface: () => void;
  /** Update only the sub-tab for the current top-tab (persists to localStorage). */
  setSubTab: (subTab: SubTab) => void;
  /** When set, a breadcrumb linking back to this workspace is shown in the header. */
  returnBreadcrumb: ReturnBreadcrumb | null;
  setReturnBreadcrumb: (breadcrumb: ReturnBreadcrumb | null) => void;
}

export interface ReturnBreadcrumb {
  /** Label shown in the breadcrumb (e.g. "Audit"). */
  label: string;
  /** Route to navigate back to. */
  topTab: TopTab;
  subTab: SubTab;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function useNavigationContext(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx)
    throw new Error(
      "useNavigationContext must be used inside NavigationProvider",
    );
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeSecondarySurface, setActiveSecondarySurface] =
    useState<SecondarySurfaceId | null>(null);
  const [returnBreadcrumb, setReturnBreadcrumb] =
    useState<ReturnBreadcrumb | null>(null);

  const [activeTopTab, setActiveTopTabState] = useState<TopTab>(() => {
    const stored = lsGet(STORAGE_KEYS.ACTIVE_TOP_TAB);
    return (
      stored && TOP_TABS.some((t) => t.id === stored) ? stored : "define"
    ) as TopTab;
  });

  const [activeSubTab, setActiveSubTabState] = useState<SubTab>(() => {
    const topTab = (lsGet(STORAGE_KEYS.ACTIVE_TOP_TAB) || "define") as TopTab;
    const storageKey = SUB_TAB_STORAGE[topTab] || SUB_TAB_STORAGE.define;
    const stored = lsGet(storageKey);
    const topDef = TOP_TABS.find((t) => t.id === topTab);
    return (
      stored && topDef?.subTabs.some((s) => s.id === stored)
        ? stored
        : DEFAULT_SUB_TABS[topTab]
    ) as SubTab;
  });

  const navigateTo = useCallback(
    (
      topTab: TopTab,
      subTab?: SubTab,
      options?: { preserveSecondarySurface?: boolean },
    ) => {
      const topDef = TOP_TABS.find((t) => t.id === topTab)!;
      const resolvedSub =
        subTab && topDef.subTabs.some((s) => s.id === subTab)
          ? subTab
          : ((lsGet(SUB_TAB_STORAGE[topTab]) as SubTab | null) ??
            DEFAULT_SUB_TABS[topTab]);
      lsSet(STORAGE_KEYS.ACTIVE_TOP_TAB, topTab);
      lsSet(SUB_TAB_STORAGE[topTab], resolvedSub);
      setActiveTopTabState(topTab);
      setActiveSubTabState(resolvedSub);
      if (!options?.preserveSecondarySurface) {
        setActiveSecondarySurface(null);
      }
    },
    [],
  );

  // Use a ref so setSubTab stays stable across top-tab changes
  const activeTopTabRef = useRef(activeTopTab);
  activeTopTabRef.current = activeTopTab;

  const setSubTab = useCallback((subTab: SubTab) => {
    const topTab = activeTopTabRef.current;
    lsSet(SUB_TAB_STORAGE[topTab], subTab);
    setActiveSubTabState(subTab);
    setActiveSecondarySurface(null);
  }, []);

  const openSecondarySurface = useCallback((surface: SecondarySurfaceId) => {
    setActiveSecondarySurface(surface);
  }, []);

  const closeSecondarySurface = useCallback(() => {
    setActiveSecondarySurface(null);
  }, []);

  const value = useMemo<NavigationContextValue>(
    () => ({
      activeTopTab,
      activeSubTab,
      activeSecondarySurface,
      navigateTo,
      openSecondarySurface,
      closeSecondarySurface,
      setSubTab,
      returnBreadcrumb,
      setReturnBreadcrumb,
    }),
    [
      activeTopTab,
      activeSubTab,
      activeSecondarySurface,
      closeSecondarySurface,
      navigateTo,
      openSecondarySurface,
      setSubTab,
      returnBreadcrumb,
    ],
  );

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}
