/**
 * Shared navigation types and constants — extracted from App.tsx so that
 * NavigationContext.tsx can import them without creating a circular dependency.
 * PanelRouter.tsx and other consumers import from here instead of from App.
 */

import { STORAGE_KEYS } from './storage';

export type TopTab = 'define' | 'apply' | 'ship';
type DefineSubTab = 'tokens' | 'themes' | 'generators';
type ApplySubTab = 'inspect' | 'canvas-analysis' | 'dependencies';
type ShipSubTab = 'publish' | 'export' | 'history' | 'health';
export type SubTab = DefineSubTab | ApplySubTab | ShipSubTab;
export type OverflowPanel = 'import' | 'settings' | 'recents' | null;

/**
 * Internal routing structure — kept for PanelRouter compatibility.
 * The visual tab bar uses FLAT_TABS below; this is the source of truth
 * for which panels exist.
 */
export const TOP_TABS: { id: TopTab; label: string; subTabs: { id: SubTab; label: string }[] }[] = [
  { id: 'define', label: 'Define', subTabs: [
    { id: 'tokens', label: 'Tokens' },
    { id: 'themes', label: 'Themes' },
    { id: 'generators', label: 'Generators' },
  ]},
  { id: 'apply', label: 'Apply', subTabs: [
    { id: 'inspect', label: 'Inspect' },
    { id: 'canvas-analysis', label: 'Canvas Analysis' },
    { id: 'dependencies', label: 'Dependencies' },
  ]},
  { id: 'ship', label: 'Ship', subTabs: [
    { id: 'publish', label: 'Publish' },
    { id: 'export', label: 'Export' },
    { id: 'history', label: 'History' },
    { id: 'health', label: 'Health' },
  ]},
];

export const DEFAULT_SUB_TABS: Record<TopTab, SubTab> = {
  define: 'tokens',
  apply: 'inspect',
  ship: 'publish',
};

export const SUB_TAB_STORAGE: Record<TopTab, string> = {
  define: STORAGE_KEYS.ACTIVE_SUB_TAB_DEFINE,
  apply: STORAGE_KEYS.ACTIVE_SUB_TAB_APPLY,
  ship: STORAGE_KEYS.ACTIVE_SUB_TAB_SHIP,
};

// ---------------------------------------------------------------------------
// Flat navigation — the primary visual structure
// ---------------------------------------------------------------------------

export type FlatTabId = 'tokens' | 'themes' | 'generators' | 'inspect' | 'ship';

export interface FlatTab {
  id: FlatTabId;
  label: string;
  /** Optional small hint shown in the primary tab button before activation. */
  hintLabel?: string;
  /** Internal top-tab this maps to. */
  topTab: TopTab;
  /** Internal sub-tab this maps to (default for the top-tab). */
  subTab: SubTab;
  /** Optional secondary tabs shown inline within this flat tab. */
  innerTabs?: { id: SubTab; label: string }[];
}

/**
 * The 5 flat top-level tabs shown in the tab bar.
 * Internally they still route through the (topTab, subTab) system.
 */
export const FLAT_TABS: FlatTab[] = [
  { id: 'tokens', label: 'Tokens', topTab: 'define', subTab: 'tokens' },
  { id: 'themes', label: 'Themes', topTab: 'define', subTab: 'themes' },
  { id: 'generators', label: 'Generators', topTab: 'define', subTab: 'generators' },
  {
    id: 'inspect', label: 'Inspect', topTab: 'apply', subTab: 'inspect',
    hintLabel: '3 sections',
    innerTabs: [
      { id: 'inspect', label: 'Selection' },
      { id: 'canvas-analysis', label: 'Canvas' },
      { id: 'dependencies', label: 'Dependencies' },
    ],
  },
  {
    id: 'ship', label: 'Ship', topTab: 'ship', subTab: 'publish',
    hintLabel: '4 sections',
    innerTabs: [
      { id: 'publish', label: 'Publish' },
      { id: 'export', label: 'Export' },
      { id: 'history', label: 'History' },
      { id: 'health', label: 'Health' },
    ],
  },
];

/** Map a (topTab, subTab) pair to the flat tab ID it belongs to. */
export function toFlatTabId(topTab: TopTab, subTab: SubTab): FlatTabId {
  if (topTab === 'define') {
    if (subTab === 'tokens') return 'tokens';
    if (subTab === 'themes') return 'themes';
    if (subTab === 'generators') return 'generators';
  }
  if (topTab === 'apply') return 'inspect';
  return 'ship';
}
