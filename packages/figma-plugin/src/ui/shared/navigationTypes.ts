/**
 * Shared navigation types and constants — extracted from App.tsx so that
 * NavigationContext.tsx can import them without creating a circular dependency.
 * PanelRouter.tsx and other consumers import from here instead of from App.
 */

import { STORAGE_KEYS } from './storage';

export type TopTab = 'define' | 'apply' | 'ship';
type DefineSubTab = 'tokens' | 'themes' | 'generators' | 'resolver';
type ApplySubTab = 'inspect' | 'canvas-audit' | 'dependencies';
type ShipSubTab = 'publish' | 'export' | 'history' | 'validation';
export type SubTab = DefineSubTab | ApplySubTab | ShipSubTab;
export type OverflowPanel = 'import' | 'settings' | null;

export const TOP_TABS: { id: TopTab; label: string; subTabs: { id: SubTab; label: string }[] }[] = [
  { id: 'define', label: 'Define', subTabs: [
    { id: 'tokens', label: 'Tokens' },
    { id: 'themes', label: 'Themes' },
    { id: 'generators', label: 'Generators' },
    { id: 'resolver', label: 'Resolver' },
  ]},
  { id: 'apply', label: 'Apply', subTabs: [
    { id: 'inspect', label: 'Inspect' },
    { id: 'canvas-audit', label: 'Canvas Audit' },
    { id: 'dependencies', label: 'Dependencies' },
  ]},
  { id: 'ship', label: 'Ship', subTabs: [
    { id: 'publish', label: 'Publish' },
    { id: 'export', label: 'Export' },
    { id: 'history', label: 'History' },
    { id: 'validation', label: 'Validation' },
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
