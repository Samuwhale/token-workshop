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
  resolveWorkspaceSummary,
  resolveSecondarySurface,
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
    options?: { preserveSecondarySurface?: boolean; preserveHandoff?: boolean },
  ) => void;
  openSecondarySurface: (surface: SecondarySurfaceId) => void;
  closeSecondarySurface: () => void;
  /** Update only the sub-tab for the current top-tab (persists to localStorage). */
  setSubTab: (subTab: SubTab) => void;
  activeHandoff: NavigationHandoff | null;
  beginHandoff: (options: BeginHandoffOptions) => void;
  clearHandoff: () => void;
  returnFromHandoff: () => void;
  notificationsOpen: boolean;
  openNotifications: () => void;
  closeNotifications: () => void;
  toggleNotifications: () => void;
  /**
   * One-shot prefill for the Canvas → Repair subtab. Selection emits stale
   * binding entries (each with an optional suggested replacement) before
   * navigating; CanvasRepairPanel reads and clears on mount. Mirrors the
   * pendingHighlight pattern in EditorContext.
   */
  pendingRepairPrefill: readonly RepairPrefillEntry[] | null;
  setPendingRepairPrefill: (
    entries: readonly RepairPrefillEntry[] | null,
  ) => void;
  consumePendingRepairPrefill: () => readonly RepairPrefillEntry[] | null;
}

export interface RepairPrefillEntry {
  from: string;
  to?: string;
}

export interface NavigationHandoff {
  returnLabel: string;
  reason: string;
  origin: {
    workspaceLabel: string;
    sectionLabel: string | null;
    secondarySurfaceLabel: string | null;
  };
  returnTarget: {
    secondarySurfaceId: SecondarySurfaceId | null;
    topTab: TopTab;
    subTab: SubTab;
  };
  onReturn: (() => void) | null;
}

export interface BeginHandoffOptions {
  reason: string;
  returnLabel?: string;
  returnSecondarySurfaceId?: SecondarySurfaceId | null;
  onReturn?: (() => void) | null;
}

function schedulePostNavigation(fn: (() => void) | null | undefined): void {
  if (!fn) {
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      fn();
    });
  });
}

function formatReturnLabel(
  workspaceLabel: string,
  sectionLabel: string | null,
  secondarySurfaceLabel: string | null,
): string {
  if (secondarySurfaceLabel) {
    return `Back to ${secondarySurfaceLabel}`;
  }

  if (sectionLabel && sectionLabel !== workspaceLabel) {
    return `Back to ${workspaceLabel}`;
  }

  return `Back to ${workspaceLabel}`;
}

function normalizeOriginSectionLabel(
  workspaceLabel: string,
  sectionLabel: string | null,
): string | null {
  if (!sectionLabel || sectionLabel === workspaceLabel) {
    return null;
  }

  return sectionLabel;
}

function resolveOriginMetadata(
  topTab: TopTab,
  subTab: SubTab,
  secondarySurfaceId: SecondarySurfaceId | null,
) {
  const workspaceSummary = resolveWorkspaceSummary(topTab, subTab);
  const secondarySurface = resolveSecondarySurface(secondarySurfaceId);

  return {
    workspaceLabel: workspaceSummary.workspaceLabel,
    sectionLabel: normalizeOriginSectionLabel(
      workspaceSummary.workspaceLabel,
      workspaceSummary.section?.label ?? null,
    ),
    secondarySurfaceLabel: secondarySurface?.label ?? null,
  };
}

function resolveSubTabForTopTab(
  topTab: TopTab,
  subTab?: SubTab | null,
): SubTab {
  const topDef = TOP_TABS.find((tab) => tab.id === topTab);
  if (!topDef) {
    return DEFAULT_SUB_TABS.library;
  }
  if (subTab && topDef.subTabs.some((tab) => tab.id === subTab)) {
    return subTab;
  }
  return DEFAULT_SUB_TABS[topTab];
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
  const [activeHandoff, setActiveHandoff] =
    useState<NavigationHandoff | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pendingRepairPrefill, setPendingRepairPrefillState] = useState<
    readonly RepairPrefillEntry[] | null
  >(null);

  const [activeTopTab, setActiveTopTabState] = useState<TopTab>(() => {
    const stored = lsGet(STORAGE_KEYS.ACTIVE_TOP_TAB);
    return (
      stored && TOP_TABS.some((t) => t.id === stored) ? stored : "library"
    ) as TopTab;
  });

  const [activeSubTab, setActiveSubTabState] = useState<SubTab>(() => {
    const topTab = (lsGet(STORAGE_KEYS.ACTIVE_TOP_TAB) || "library") as TopTab;
    const storageKey = SUB_TAB_STORAGE[topTab] || SUB_TAB_STORAGE.library;
    const stored = lsGet(storageKey);
    return resolveSubTabForTopTab(topTab, stored as SubTab | null);
  });

  const navigateTo = useCallback(
    (
      topTab: TopTab,
      subTab?: SubTab,
      options?: { preserveSecondarySurface?: boolean; preserveHandoff?: boolean },
    ) => {
      const resolvedSub = resolveSubTabForTopTab(
        topTab,
        subTab ?? (lsGet(SUB_TAB_STORAGE[topTab]) as SubTab | null),
      );
      lsSet(STORAGE_KEYS.ACTIVE_TOP_TAB, topTab);
      lsSet(SUB_TAB_STORAGE[topTab], resolvedSub);
      setActiveTopTabState(topTab);
      setActiveSubTabState(resolvedSub);
      if (!options?.preserveSecondarySurface) {
        setActiveSecondarySurface(null);
      }
      if (!options?.preserveHandoff) {
        setActiveHandoff(null);
      }
    },
    [],
  );

  // Use a ref so setSubTab stays stable across top-tab changes
  const activeTopTabRef = useRef(activeTopTab);
  activeTopTabRef.current = activeTopTab;
  const activeSubTabRef = useRef(activeSubTab);
  activeSubTabRef.current = activeSubTab;
  const activeSecondarySurfaceRef = useRef(activeSecondarySurface);
  activeSecondarySurfaceRef.current = activeSecondarySurface;

  const setSubTab = useCallback((subTab: SubTab) => {
    const topTab = activeTopTabRef.current;
    const resolvedSubTab = resolveSubTabForTopTab(topTab, subTab);
    lsSet(SUB_TAB_STORAGE[topTab], resolvedSubTab);
    setActiveSubTabState(resolvedSubTab);
    setActiveSecondarySurface(null);
    setActiveHandoff(null);
  }, []);

  const openSecondarySurface = useCallback((surface: SecondarySurfaceId) => {
    setActiveSecondarySurface(surface);
  }, []);

  const closeSecondarySurface = useCallback(() => {
    setActiveSecondarySurface(null);
  }, []);

  const openNotifications = useCallback(() => {
    setNotificationsOpen(true);
  }, []);

  const closeNotifications = useCallback(() => {
    setNotificationsOpen(false);
  }, []);

  const toggleNotifications = useCallback(() => {
    setNotificationsOpen((prev) => !prev);
  }, []);

  const setPendingRepairPrefill = useCallback(
    (entries: readonly RepairPrefillEntry[] | null) => {
      setPendingRepairPrefillState(
        entries && entries.length > 0 ? entries : null,
      );
    },
    [],
  );

  const pendingRepairPrefillRef = useRef(pendingRepairPrefill);
  pendingRepairPrefillRef.current = pendingRepairPrefill;

  const consumePendingRepairPrefill = useCallback<
    () => readonly RepairPrefillEntry[] | null
  >(() => {
    const current = pendingRepairPrefillRef.current;
    if (current) {
      setPendingRepairPrefillState(null);
    }
    return current;
  }, []);

  const clearHandoff = useCallback(() => {
    setActiveHandoff(null);
  }, []);

  const beginHandoff = useCallback((options: BeginHandoffOptions) => {
    const topTab = activeTopTabRef.current;
    const subTab = activeSubTabRef.current;
    const secondarySurfaceId =
      options.returnSecondarySurfaceId === undefined
        ? activeSecondarySurfaceRef.current
        : options.returnSecondarySurfaceId;
    const origin = resolveOriginMetadata(topTab, subTab, secondarySurfaceId);

    setActiveHandoff({
      returnLabel:
        options.returnLabel ??
        formatReturnLabel(
          origin.workspaceLabel,
          origin.sectionLabel,
          origin.secondarySurfaceLabel,
        ),
      reason: options.reason,
      origin,
      returnTarget: {
        secondarySurfaceId,
        topTab,
        subTab,
      },
      onReturn: options.onReturn ?? null,
    });
  }, []);

  const returnFromHandoff = useCallback(() => {
    if (!activeHandoff) {
      return;
    }

    setActiveHandoff(null);
    navigateTo(activeHandoff.returnTarget.topTab, activeHandoff.returnTarget.subTab, {
      preserveSecondarySurface:
        activeHandoff.returnTarget.secondarySurfaceId !== null,
      preserveHandoff: true,
    });

    if (activeHandoff.returnTarget.secondarySurfaceId !== null) {
      setActiveSecondarySurface(activeHandoff.returnTarget.secondarySurfaceId);
    }

    schedulePostNavigation(activeHandoff.onReturn);
  }, [activeHandoff, navigateTo]);

  const value = useMemo<NavigationContextValue>(
    () => ({
      activeTopTab,
      activeSubTab,
      activeSecondarySurface,
      navigateTo,
      openSecondarySurface,
      closeSecondarySurface,
      setSubTab,
      activeHandoff,
      beginHandoff,
      clearHandoff,
      returnFromHandoff,
      notificationsOpen,
      openNotifications,
      closeNotifications,
      toggleNotifications,
      pendingRepairPrefill,
      setPendingRepairPrefill,
      consumePendingRepairPrefill,
    }),
    [
      activeTopTab,
      activeSubTab,
      activeSecondarySurface,
      activeHandoff,
      beginHandoff,
      clearHandoff,
      closeNotifications,
      closeSecondarySurface,
      navigateTo,
      notificationsOpen,
      openNotifications,
      openSecondarySurface,
      returnFromHandoff,
      setSubTab,
      toggleNotifications,
      pendingRepairPrefill,
      setPendingRepairPrefill,
      consumePendingRepairPrefill,
    ],
  );

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}
