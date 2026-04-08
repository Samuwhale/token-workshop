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
export type SecondarySurfaceId = 'import' | 'sets' | 'notifications' | 'shortcuts' | 'settings';

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
    { id: 'publish', label: 'Figma Sync' },
    { id: 'export', label: 'Repo / Handoff' },
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
export type UtilityMenuId = 'tools';
export type UtilitySectionId = 'actions';
export type UtilityActionId =
  | 'command-palette'
  | 'paste-tokens'
  | 'window-size';

export interface WorkspaceRoute {
  topTab: TopTab;
  subTab: SubTab;
}

export interface WorkspaceSection extends WorkspaceRoute {
  id: SubTab;
  label: string;
  description?: string;
  summaryTitle?: string;
  summaryGuidance?: string;
}

export interface WorkspaceTab extends WorkspaceRoute {
  id: WorkspaceId;
  label: string;
  description: string;
  summaryTitle?: string;
  summaryGuidance?: string;
  sections?: WorkspaceSection[];
  /** Additional routes that should keep this workspace selected. */
  matchRoutes?: WorkspaceRoute[];
}

export interface SecondarySurface {
  id: SecondarySurfaceId;
  label: string;
  description: string;
  summaryTitle: string;
  summaryGuidance: string;
}

export interface UtilityAction {
  id: UtilityActionId;
  label: string;
  description: string;
}

export interface UtilitySection {
  id: UtilitySectionId;
  label: string;
  description: string;
  actions: UtilityAction[];
}

export interface UtilityMenu {
  id: UtilityMenuId;
  triggerLabel: string;
  label: string;
  description: string;
  sections: UtilitySection[];
}

export interface AppShellNavigation {
  workspaces: WorkspaceTab[];
  secondarySurfaces: SecondarySurface[];
  utilityMenu: UtilityMenu;
}

const route = (topTab: TopTab, subTab: SubTab): WorkspaceRoute => ({ topTab, subTab });

export const WORKSPACE_TABS: WorkspaceTab[] = [
  {
    id: 'tokens',
    label: 'Tokens',
    description: 'Edit token sets, compare values, and automate new scales.',
    summaryTitle: 'Token library',
    summaryGuidance: 'Build and edit the token library, switch the active set, and open deeper comparison or generation tools when needed.',
    topTab: 'define',
    subTab: 'tokens',
    sections: [
      {
        id: 'tokens',
        label: 'Library',
        description: 'Browse and edit token sets.',
        summaryTitle: 'Token library',
        summaryGuidance: 'Build and edit the token library, switch the active set, and create new tokens in the current workspace.',
        topTab: 'define',
        subTab: 'tokens',
      },
      {
        id: 'generators',
        label: 'Generators',
        description: 'Build and tune token generators.',
        summaryTitle: 'Token generators',
        summaryGuidance: 'Build, tune, and review generators that create or maintain token groups for the active system.',
        topTab: 'define',
        subTab: 'generators',
      },
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
    summaryTitle: 'Theme authoring',
    summaryGuidance: 'Create axes, define options, map sets, and preview the active combination before opening advanced theme logic.',
    topTab: 'define',
    subTab: 'themes',
  },
  {
    id: 'apply',
    label: 'Apply',
    description: 'Review the current selection, surface best matches, bind visible properties, and keep maintenance tools out of the default path.',
    topTab: 'apply',
    subTab: 'inspect',
    sections: [
      {
        id: 'inspect',
        label: 'Selection',
        description: 'Inspect and edit the current selection.',
        summaryTitle: 'Bind tokens to selection',
        summaryGuidance: 'Review the current selection first, inspect best matches second, bind visible properties third, and open advanced tools only when you need maintenance work.',
        topTab: 'apply',
        subTab: 'inspect',
      },
      {
        id: 'canvas-analysis',
        label: 'Canvas',
        description: 'Review token coverage across the canvas.',
        summaryTitle: 'Canvas analysis',
        summaryGuidance: 'Scan broader canvas coverage and surface token usage or gaps outside the current selection.',
        topTab: 'apply',
        subTab: 'canvas-analysis',
      },
    ],
    matchRoutes: [
      route('apply', 'inspect'),
      route('apply', 'canvas-analysis'),
    ],
  },
  {
    id: 'sync',
    label: 'Sync',
    description: 'Keep Figma publishing primary, then switch into repo or handoff tooling only when files or repository work is needed.',
    topTab: 'ship',
    subTab: 'publish',
    sections: [
      {
        id: 'publish',
        label: 'Figma Sync',
        description: 'Run preflight, compare variables or styles, then sync the reviewed plan to the current Figma file.',
        summaryTitle: 'Figma Sync',
        summaryGuidance: 'Start with preflight, then compare local tokens against Figma variables and styles, and finally apply the reviewed sync plan to the current file.',
        topTab: 'ship',
        subTab: 'publish',
      },
      {
        id: 'export',
        label: 'Repo / Handoff',
        description: 'Generate handoff files, inspect repository state, and reconcile saved token changes.',
        summaryTitle: 'Repo / Handoff',
        summaryGuidance: 'Package handoff files, inspect repository status, and handle commit, pull, push, or merge-resolution work when downstream delivery needs it.',
        topTab: 'ship',
        subTab: 'export',
      },
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

export const SECONDARY_SURFACES: SecondarySurface[] = [
  {
    id: 'import',
    label: 'Import',
    description: 'Bring in token files, code exports, migration data, or Figma variables.',
    summaryTitle: 'Import tokens',
    summaryGuidance: 'Choose the source family first, then the exact format, destination rules, and preview before writing tokens into the library.',
  },
  {
    id: 'sets',
    label: 'Sets',
    description: 'Rename, reorder, merge, split, and annotate token sets without leaving the shell.',
    summaryTitle: 'Token set manager',
    summaryGuidance: 'Switch quickly between sets or open structural management flows like rename, merge, split, and metadata updates in one place.',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Review the recent toast history and clear resolved status messages.',
    summaryTitle: 'Notification history',
    summaryGuidance: 'Review recent success and error messages from imports, sync, validation, and other workflows without relying on transient toasts.',
  },
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    description: 'Keep the shortcut reference available as a persistent secondary surface.',
    summaryTitle: 'Keyboard shortcuts',
    summaryGuidance: 'Review the current shortcut reference while you work instead of opening it as a temporary modal that disappears behind the shell.',
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Adjust preferences, recovery controls, and advanced maintenance settings.',
    summaryTitle: 'Settings',
    summaryGuidance: 'Use preferences for day-to-day defaults, then open advanced sections only when you need setup, diagnostics, backup, or destructive recovery work.',
  },
];

export const UTILITY_MENU: UtilityMenu = {
  id: 'tools',
  triggerLabel: 'Tools',
  label: 'Tools',
  description: 'Transient actions you can run from any workspace.',
  sections: [
    {
      id: 'actions',
      label: 'Actions',
      description: 'Short-lived tools that do not replace the current workspace.',
      actions: [
        { id: 'command-palette', label: 'Command palette', description: 'Search expert commands and jump straight into actions.' },
        { id: 'paste-tokens', label: 'Paste tokens', description: 'Import tokens directly from pasted content.' },
        { id: 'window-size', label: 'Window size', description: 'Switch between compact and expanded plugin layouts.' },
      ],
    },
  ],
};

export const APP_SHELL_NAVIGATION: AppShellNavigation = {
  workspaces: WORKSPACE_TABS,
  secondarySurfaces: SECONDARY_SURFACES,
  utilityMenu: UTILITY_MENU,
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

export function resolveSecondarySurface(id: SecondarySurfaceId | null): SecondarySurface | null {
  if (id === null) return null;
  return SECONDARY_SURFACES.find(surface => surface.id === id) ?? null;
}
