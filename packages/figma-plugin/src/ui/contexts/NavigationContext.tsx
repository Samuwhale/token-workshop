/**
 * NavigationContext — owns the two-tier tab navigation state
 * (activeTopTab, activeSubTab, overflowPanel) and the navigateTo / setSubTab
 * actions. Extracted from App.tsx so PanelRouter and other consumers can read
 * navigation state directly without receiving it as props.
 */

import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import type { TopTab, SubTab, OverflowPanel } from '../shared/navigationTypes';
import { TOP_TABS, DEFAULT_SUB_TABS, SUB_TAB_STORAGE } from '../shared/navigationTypes';
import { STORAGE_KEYS, lsGet, lsSet } from '../shared/storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NavigationContextValue {
  activeTopTab: TopTab;
  activeSubTab: SubTab;
  overflowPanel: OverflowPanel;
  navigateTo: (top: TopTab, sub?: SubTab) => void;
  setOverflowPanel: Dispatch<SetStateAction<OverflowPanel>>;
  /** Update only the sub-tab for the current top-tab (persists to localStorage). */
  setSubTab: (subTab: SubTab) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function useNavigationContext(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigationContext must be used inside NavigationProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [overflowPanel, setOverflowPanel] = useState<OverflowPanel>(null);

  const [activeTopTab, setActiveTopTabState] = useState<TopTab>(() => {
    const stored = lsGet(STORAGE_KEYS.ACTIVE_TOP_TAB);
    return (stored && TOP_TABS.some(t => t.id === stored) ? stored : 'define') as TopTab;
  });

  const [activeSubTab, setActiveSubTabState] = useState<SubTab>(() => {
    const topTab = (lsGet(STORAGE_KEYS.ACTIVE_TOP_TAB) || 'define') as TopTab;
    const storageKey = SUB_TAB_STORAGE[topTab] || SUB_TAB_STORAGE.define;
    const stored = lsGet(storageKey);
    const topDef = TOP_TABS.find(t => t.id === topTab);
    return (stored && topDef?.subTabs.some(s => s.id === stored) ? stored : DEFAULT_SUB_TABS[topTab]) as SubTab;
  });

  const navigateTo = useCallback((topTab: TopTab, subTab?: SubTab) => {
    const topDef = TOP_TABS.find(t => t.id === topTab)!;
    const resolvedSub = subTab && topDef.subTabs.some(s => s.id === subTab)
      ? subTab
      : (lsGet(SUB_TAB_STORAGE[topTab]) as SubTab | null) ?? DEFAULT_SUB_TABS[topTab];
    lsSet(STORAGE_KEYS.ACTIVE_TOP_TAB, topTab);
    lsSet(SUB_TAB_STORAGE[topTab], resolvedSub);
    setActiveTopTabState(topTab);
    setActiveSubTabState(resolvedSub);
    setOverflowPanel(null);
  }, []);

  // Use a ref so setSubTab stays stable across top-tab changes
  const activeTopTabRef = useRef(activeTopTab);
  activeTopTabRef.current = activeTopTab;

  const setSubTab = useCallback((subTab: SubTab) => {
    const topTab = activeTopTabRef.current;
    lsSet(SUB_TAB_STORAGE[topTab], subTab);
    setActiveSubTabState(subTab);
    setOverflowPanel(null);
  }, []);

  const value = useMemo<NavigationContextValue>(() => ({
    activeTopTab,
    activeSubTab,
    overflowPanel,
    navigateTo,
    setOverflowPanel,
    setSubTab,
  }), [activeTopTab, activeSubTab, overflowPanel, navigateTo, setSubTab]);

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}
