/**
 * Shared navigation types and constants — extracted from App.tsx so that
 * NavigationContext.tsx can import them without creating a circular dependency.
 * PanelRouter.tsx and other consumers import from here instead of from App.
 */

import { STORAGE_KEYS } from './storage';

export type TopTab = 'define' | 'apply' | 'ship';
type DefineSubTab = 'tokens' | 'themes' | 'generators';
type ApplySubTab = 'inspect' | 'canvas-analysis' | 'components' | 'dependencies';
type ShipSubTab = 'publish' | 'export' | 'history' | 'health';
export type SubTab = DefineSubTab | ApplySubTab | ShipSubTab;
export type OverflowPanel = 'import' | 'settings' | null;

export const TOP_TABS: { id: TopTab; label: string; subTabs: { id: SubTab; label: string }[] }[] = [
  { id: 'define', label: 'Define', subTabs: [
    { id: 'tokens', label: 'Tokens' },
    { id: 'themes', label: 'Themes' },
    { id: 'generators', label: 'Generators' },
  ]},
  { id: 'apply', label: 'Apply', subTabs: [
    { id: 'inspect', label: 'Inspect' },
    { id: 'canvas-analysis', label: 'Canvas Analysis' },
    { id: 'components', label: 'Components' },
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
