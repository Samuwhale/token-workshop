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
export type OverflowPanel = 'import' | 'settings' | 'sets' | null;

/**
 * Internal routing structure — kept for PanelRouter compatibility.
 * The app shell remaps these internal route buckets into user-facing workspaces
 * below, but this table remains the source of truth for which panels exist.
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
  { id: 'ship', label: 'Sync', subTabs: [
    { id: 'publish', label: 'Sync to Figma' },
    { id: 'export', label: 'Export' },
    { id: 'history', label: 'History' },
    { id: 'health', label: 'Audit' },
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
// Workspace navigation — the primary visual structure
// ---------------------------------------------------------------------------

export type WorkspaceId = 'tokens' | 'themes' | 'apply' | 'sync' | 'audit';
export type SecondaryAreaId = 'utilities';
export type SecondarySectionId = 'tools' | 'admin';
export type SecondaryActionId =
  | 'command-palette'
  | 'paste-tokens'
  | 'import'
  | 'notifications'
  | 'keyboard-shortcuts'
  | 'window-size'
  | 'settings';

export interface WorkspaceRoute {
  topTab: TopTab;
  subTab: SubTab;
}

export interface WorkspaceSection extends WorkspaceRoute {
  id: SubTab;
  label: string;
  description?: string;
}

export interface WorkspaceTab extends WorkspaceRoute {
  id: WorkspaceId;
  label: string;
  description: string;
  sections?: WorkspaceSection[];
  /** Additional routes that should keep this workspace selected. */
  matchRoutes?: WorkspaceRoute[];
}

export interface SecondaryAction {
  id: SecondaryActionId;
  label: string;
  description: string;
}

export interface SecondarySection {
  id: SecondarySectionId;
  label: string;
  description: string;
  actions: SecondaryAction[];
}

export interface SecondaryArea {
  id: SecondaryAreaId;
  triggerLabel: string;
  label: string;
  description: string;
  sections: SecondarySection[];
}

export interface AppShellNavigation {
  workspaces: WorkspaceTab[];
  secondaryArea: SecondaryArea;
}

const route = (topTab: TopTab, subTab: SubTab): WorkspaceRoute => ({ topTab, subTab });

export const WORKSPACE_TABS: WorkspaceTab[] = [
  {
    id: 'tokens',
    label: 'Tokens',
    description: 'Edit token sets, compare values, and automate new scales.',
    topTab: 'define',
    subTab: 'tokens',
    sections: [
      { id: 'tokens', label: 'Library', description: 'Browse and edit token sets.', topTab: 'define', subTab: 'tokens' },
      { id: 'generators', label: 'Generators', description: 'Build and tune token generators.', topTab: 'define', subTab: 'generators' },
    ],
    matchRoutes: [
      route('define', 'tokens'),
      route('define', 'generators'),
    ],
  },
  {
    id: 'themes',
    label: 'Themes',
    description: 'Set up theme sources, overrides, and resolver logic.',
    topTab: 'define',
    subTab: 'themes',
  },
  {
    id: 'apply',
    label: 'Apply',
    description: 'Inspect bound layers and apply tokens to the current canvas selection.',
    topTab: 'apply',
    subTab: 'inspect',
    sections: [
      { id: 'inspect', label: 'Selection', description: 'Inspect and edit the current selection.', topTab: 'apply', subTab: 'inspect' },
      { id: 'canvas-analysis', label: 'Canvas', description: 'Review token coverage across the canvas.', topTab: 'apply', subTab: 'canvas-analysis' },
    ],
    matchRoutes: [
      route('apply', 'inspect'),
      route('apply', 'canvas-analysis'),
    ],
  },
  {
    id: 'sync',
    label: 'Sync',
    description: 'Sync variables and styles to Figma, then move on to exports when handoff files are needed.',
    topTab: 'ship',
    subTab: 'publish',
    sections: [
      { id: 'publish', label: 'Sync to Figma', description: 'Run readiness checks and sync variables or styles to the current Figma file.', topTab: 'ship', subTab: 'publish' },
      { id: 'export', label: 'Export', description: 'Generate platform files and handoff artifacts from the token library.', topTab: 'ship', subTab: 'export' },
    ],
    matchRoutes: [
      route('ship', 'publish'),
      route('ship', 'export'),
    ],
  },
  {
    id: 'audit',
    label: 'Audit',
    description: 'Audit token quality, trace dependencies, and review recent changes.',
    topTab: 'ship',
    subTab: 'health',
    sections: [
      { id: 'health', label: 'Audit', description: 'Review validation, warnings, duplicates, and other library quality signals.', topTab: 'ship', subTab: 'health' },
      { id: 'history', label: 'History', description: 'Inspect recent operations and undo history.', topTab: 'ship', subTab: 'history' },
      { id: 'dependencies', label: 'Dependencies', description: 'Trace alias and dependency relationships across the token graph.', topTab: 'apply', subTab: 'dependencies' },
    ],
    matchRoutes: [
      route('ship', 'health'),
      route('ship', 'history'),
      route('apply', 'dependencies'),
    ],
  },
];

export const SECONDARY_AREA: SecondaryArea = {
  id: 'utilities',
  triggerLabel: 'Utilities',
  label: 'Utilities',
  description: 'Global tools, notifications, and app-level administration.',
  sections: [
    {
      id: 'tools',
      label: 'Tools',
      description: 'Short-lived utility surfaces you can open from any workspace.',
      actions: [
        { id: 'command-palette', label: 'Command palette', description: 'Search expert commands and jump straight into actions.' },
        { id: 'paste-tokens', label: 'Paste tokens', description: 'Import tokens directly from pasted content.' },
        { id: 'notifications', label: 'Notifications', description: 'Review recent toasts and status messages.' },
        { id: 'keyboard-shortcuts', label: 'Keyboard shortcuts', description: 'See the current shortcut reference.' },
        { id: 'window-size', label: 'Window size', description: 'Switch between compact and expanded plugin layouts.' },
      ],
    },
    {
      id: 'admin',
      label: 'Admin',
      description: 'Operational flows that replace the current workspace temporarily.',
      actions: [
        { id: 'import', label: 'Import tokens', description: 'Open the import workspace for files, code, or other tools.' },
        { id: 'settings', label: 'Settings', description: 'Adjust plugin preferences, connection settings, and recovery tools.' },
      ],
    },
  ],
};

export const APP_SHELL_NAVIGATION: AppShellNavigation = {
  workspaces: WORKSPACE_TABS,
  secondaryArea: SECONDARY_AREA,
};

function matchesRoute(routeDef: WorkspaceRoute, topTab: TopTab, subTab: SubTab): boolean {
  return routeDef.topTab === topTab && routeDef.subTab === subTab;
}

export function resolveWorkspace(topTab: TopTab, subTab: SubTab): WorkspaceTab {
  return WORKSPACE_TABS.find(workspace =>
    matchesRoute(workspace, topTab, subTab)
    || workspace.sections?.some(section => matchesRoute(section, topTab, subTab))
    || workspace.matchRoutes?.some(routeDef => matchesRoute(routeDef, topTab, subTab))
  ) ?? WORKSPACE_TABS[0];
}

export function resolveWorkspaceSection(
  workspace: WorkspaceTab,
  topTab: TopTab,
  subTab: SubTab,
): WorkspaceSection | null {
  return workspace.sections?.find(section => matchesRoute(section, topTab, subTab)) ?? null;
}

/** Map an internal route to the primary workspace shown in the shell. */
export function toWorkspaceId(topTab: TopTab, subTab: SubTab): WorkspaceId {
  return resolveWorkspace(topTab, subTab).id;
}
