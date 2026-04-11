/**
 * Shared navigation types and constants — extracted from App.tsx so that
 * NavigationContext.tsx can import them without creating a circular dependency.
 * PanelRouter.tsx and other consumers import from here instead of from App.
 */

import { STORAGE_KEYS } from './storage';
import type { GeneratorDialogInitialDraft } from '../hooks/useGeneratorDialog';
import type { GeneratorTemplate } from '../hooks/useGenerators';

export type TopTab = 'define' | 'apply' | 'ship';
type DefineSubTab = 'tokens' | 'themes' | 'generators';
type ApplySubTab = 'inspect' | 'canvas-analysis' | 'dependencies';
type ShipSubTab = 'publish' | 'export' | 'history' | 'health';
export type SubTab = DefineSubTab | ApplySubTab | ShipSubTab;
export type SecondarySurfaceId = 'import' | 'sets' | 'notifications' | 'shortcuts' | 'settings';
export type SurfaceKind =
  | 'workspace-screen'
  | 'contextual-sub-screen'
  | 'secondary-takeover'
  | 'contextual-panel'
  | 'transient-overlay';
export type SurfacePresentation =
  | 'route'
  | 'full-height-body'
  | 'side-panel'
  | 'bottom-drawer'
  | 'split-pane'
  | 'centered-dialog'
  | 'bottom-sheet';
export type SurfaceCloseBehavior = 'none' | 'restore-underlying-surface' | 'dismiss-in-place';
export type TokensLibraryContextualSurface =
  | 'compare'
  | 'token-editor'
  | 'generator-editor'
  | 'token-preview';
export type TokensLibrarySurfaceSlot = 'library-body' | 'contextual-panel' | 'split-preview';
export type TokensLibraryGeneratorEditorTarget =
  | {
    mode: 'edit';
    id: string;
  }
  | {
    mode: 'create';
    sourceTokenPath?: string;
    sourceTokenName?: string;
    sourceTokenType?: string;
    sourceTokenValue?: unknown;
    initialDraft?: GeneratorDialogInitialDraft;
    template?: GeneratorTemplate;
  };

export interface SurfaceTransition {
  kind: SurfaceKind;
  presentation: SurfacePresentation;
  closeBehavior: SurfaceCloseBehavior;
  usage: string;
}

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
    { id: 'export', label: 'Handoff files' },
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
  transition?: SurfaceTransition;
}

export interface WorkspaceTab extends WorkspaceRoute {
  id: WorkspaceId;
  label: string;
  description: string;
  summaryTitle?: string;
  summaryGuidance?: string;
  transition: SurfaceTransition;
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
  transition: SurfaceTransition;
}

export interface UtilityAction {
  id: UtilityActionId;
  label: string;
  description: string;
  transition?: SurfaceTransition;
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
const workspaceTransition = (usage: string): SurfaceTransition => ({
  kind: 'workspace-screen',
  presentation: 'route',
  closeBehavior: 'none',
  usage,
});

const contextualSubScreenTransition = (usage: string): SurfaceTransition => ({
  kind: 'contextual-sub-screen',
  presentation: 'route',
  closeBehavior: 'restore-underlying-surface',
  usage,
});

const secondaryTakeoverTransition = (usage: string): SurfaceTransition => ({
  kind: 'secondary-takeover',
  presentation: 'full-height-body',
  closeBehavior: 'restore-underlying-surface',
  usage,
});

const transientOverlayTransition = (
  presentation: Extract<SurfacePresentation, 'centered-dialog' | 'bottom-sheet'>,
  usage: string,
): SurfaceTransition => ({
  kind: 'transient-overlay',
  presentation,
  closeBehavior: 'dismiss-in-place',
  usage,
});

export const CONTEXTUAL_PANEL_MIN_WIDTH = 401;
export const CONTEXTUAL_PANEL_TRANSITIONS = {
  sidePanel: {
    kind: 'contextual-panel',
    presentation: 'side-panel',
    closeBehavior: 'restore-underlying-surface',
    usage: 'Keep editing the current object beside the active screen when the viewport is wide enough.',
  },
  bottomDrawer: {
    kind: 'contextual-panel',
    presentation: 'bottom-drawer',
    closeBehavior: 'restore-underlying-surface',
    usage: 'Keep editing the current object in a bottom drawer when the viewport is constrained.',
  },
  splitPreview: {
    kind: 'contextual-panel',
    presentation: 'split-pane',
    closeBehavior: 'restore-underlying-surface',
    usage: 'Show a live preview beside the current authoring screen without leaving it.',
  },
} satisfies Record<'sidePanel' | 'bottomDrawer' | 'splitPreview', SurfaceTransition>;

export const TOKENS_LIBRARY_SURFACE_CONTRACT = {
  body: {
    id: 'library-body',
    label: 'Tokens > Library body',
    usage: 'Keep token browsing, search, filters, and set switching mounted as the stable parent surface for the Tokens workspace.',
  },
  contextualPanel: {
    id: 'contextual-panel',
    label: 'Tokens > Library contextual panel',
    usage: 'Attach compare, token editing, generator editing, and token detail preview to the current library browse state instead of replacing it.',
    presentations: {
      wide: CONTEXTUAL_PANEL_TRANSITIONS.sidePanel,
      narrow: CONTEXTUAL_PANEL_TRANSITIONS.bottomDrawer,
    },
    surfaces: {
      compare: {
        label: 'Compare',
        usage: 'Review token-to-token or cross-theme differences without leaving the current library browse context.',
      },
      'token-editor': {
        label: 'Token editor',
        usage: 'Edit or create a token while keeping the current library list, search, and set context mounted.',
      },
      'generator-editor': {
        label: 'Generator editor',
        usage: 'Tune a generator from the library without replacing the underlying browse state.',
      },
      'token-preview': {
        label: 'Token preview',
        usage: 'Inspect one token in detail while keeping the current library browse context available.',
      },
    } satisfies Record<TokensLibraryContextualSurface, { label: string; usage: string }>,
  },
  splitPreview: {
    id: 'split-preview',
    label: 'Tokens > Library split preview',
    usage: 'Keep the library body mounted while a live preview occupies the secondary pane and can optionally focus a specific token.',
    transition: CONTEXTUAL_PANEL_TRANSITIONS.splitPreview,
  },
} satisfies {
  body: { id: TokensLibrarySurfaceSlot; label: string; usage: string };
  contextualPanel: {
    id: TokensLibrarySurfaceSlot;
    label: string;
    usage: string;
    presentations: {
      wide: SurfaceTransition;
      narrow: SurfaceTransition;
    };
    surfaces: Record<TokensLibraryContextualSurface, { label: string; usage: string }>;
  };
  splitPreview: { id: TokensLibrarySurfaceSlot; label: string; usage: string; transition: SurfaceTransition };
};

export const WORKSPACE_TABS: WorkspaceTab[] = [
  {
    id: 'tokens',
    label: 'Tokens',
    description: 'Edit token sets, keep the library browse state mounted, compare values, and automate new scales.',
    summaryTitle: 'Token library',
    summaryGuidance: 'Build and edit the token library, keep browsing context mounted, and open compare, preview, or generator tools as attached contextual surfaces when needed.',
    topTab: 'define',
    subTab: 'tokens',
    transition: workspaceTransition('Primary authoring home for the token library and its generator workflows.'),
    sections: [
      {
        id: 'tokens',
        label: 'Library',
        description: 'Browse and edit token sets.',
        summaryTitle: 'Token library',
        summaryGuidance: 'Browse the library as the stable parent surface, then attach compare, preview, or editor work without replacing the current browse context.',
        topTab: 'define',
        subTab: 'tokens',
        transition: workspaceTransition('Default token authoring screen.'),
      },
      {
        id: 'generators',
        label: 'Generators',
        description: 'Build and tune token generators.',
        summaryTitle: 'Token generators',
        summaryGuidance: 'Build, tune, and review generators that create or maintain token groups for the active system.',
        topTab: 'define',
        subTab: 'generators',
        transition: workspaceTransition('Generator authoring screen inside the Tokens workspace.'),
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
    transition: workspaceTransition('Primary theme authoring home; deeper theme views still stay in this workspace.'),
  },
  {
    id: 'apply',
    label: 'Apply',
    description: 'Review the current selection, surface best matches, bind visible properties, and keep maintenance tools out of the default path.',
    topTab: 'apply',
    subTab: 'inspect',
    transition: workspaceTransition('Primary application workspace for current selection and canvas review flows.'),
    sections: [
      {
        id: 'inspect',
        label: 'Selection',
        description: 'Inspect and edit the current selection.',
        summaryTitle: 'Bind tokens to selection',
        summaryGuidance: 'Review the current selection first, inspect best matches second, bind visible properties third, and open advanced tools only when you need maintenance work.',
        topTab: 'apply',
        subTab: 'inspect',
        transition: workspaceTransition('Default Apply view for selection-driven token binding.'),
      },
      {
        id: 'canvas-analysis',
        label: 'Canvas',
        description: 'Review token coverage across the canvas.',
        summaryTitle: 'Canvas analysis',
        summaryGuidance: 'Scan broader canvas coverage and surface token usage or gaps outside the current selection.',
        topTab: 'apply',
        subTab: 'canvas-analysis',
        transition: workspaceTransition('Canvas-level review screen inside Apply.'),
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
    description: 'Publish Figma variables and styles first, then generate handoff files or open repository controls only when downstream delivery needs them.',
    topTab: 'ship',
    subTab: 'publish',
    transition: workspaceTransition('Primary delivery workspace for publish and handoff work.'),
    sections: [
      {
        id: 'publish',
        label: 'Figma Sync',
        description: 'Run preflight, compare variables or styles, then sync the reviewed plan to the current Figma file.',
        summaryTitle: 'Figma Sync',
        summaryGuidance: 'Start with preflight, then compare local tokens against Figma variables and styles, and finally apply the reviewed sync plan to the current file.',
        topTab: 'ship',
        subTab: 'publish',
        transition: workspaceTransition('Primary publish screen inside Sync.'),
      },
      {
        id: 'export',
        label: 'Handoff files',
        description: 'Generate platform-specific handoff files from the token server. Open the repository workflow section only when saved files or branch coordination are needed.',
        summaryTitle: 'Handoff files',
        summaryGuidance: 'Generate CSS, Dart, Swift, Android, or W3C JSON handoff files as the primary path. Use the repository workflow section — reachable at the bottom of this surface — only when commit, pull, push, or merge-resolution work is needed.',
        topTab: 'ship',
        subTab: 'export',
        transition: workspaceTransition('Handoff files screen inside Sync; repository actions are a secondary expert section at the bottom.'),
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
    transition: workspaceTransition('Primary review workspace for quality checks, history, and dependency tracing.'),
    sections: [
      {
        id: 'health',
        label: 'Audit',
        description: 'Review validation, warnings, duplicates, and other library quality signals.',
        topTab: 'ship',
        subTab: 'health',
        transition: workspaceTransition('Quality review screen inside Audit.'),
      },
      {
        id: 'history',
        label: 'History',
        description: 'Inspect recent operations and undo history.',
        topTab: 'ship',
        subTab: 'history',
        transition: workspaceTransition('History screen inside Audit.'),
      },
      {
        id: 'dependencies',
        label: 'Dependencies',
        description: 'Trace alias and dependency relationships across the token graph.',
        topTab: 'apply',
        subTab: 'dependencies',
        transition: contextualSubScreenTransition('Contextual dependency tracing screen owned by Audit but routed through the Apply bucket.'),
      },
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
    description: 'Full-height secondary surface for bringing in token files, code exports, migration data, or Figma variables.',
    summaryTitle: 'Import tokens',
    summaryGuidance: 'This takeover replaces the main body while you choose the source family, destination rules, and preview before writing tokens into the library.',
    transition: secondaryTakeoverTransition('Longer import workflow that keeps the shell visible while replacing the main body until dismissed.'),
  },
  {
    id: 'sets',
    label: 'Sets',
    description: 'Full-height secondary surface for renaming, reordering, merging, splitting, and annotating token sets.',
    summaryTitle: 'Token set manager',
    summaryGuidance: 'This takeover replaces the main body while you run structural set-management flows like rename, merge, split, and metadata updates.',
    transition: secondaryTakeoverTransition('Structural set-management workflow that temporarily takes over the body while preserving shell context.'),
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Full-height secondary surface for reviewing recent toast history and clearing resolved status messages.',
    summaryTitle: 'Notification history',
    summaryGuidance: 'This takeover keeps the shell in place while you review recent success and error messages from imports, sync, validation, and other workflows.',
    transition: secondaryTakeoverTransition('Reference surface for longer review of notification history without losing the current shell context.'),
  },
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    description: 'Full-height secondary surface for keeping the shortcut reference available while you work.',
    summaryTitle: 'Keyboard shortcuts',
    summaryGuidance: 'This takeover keeps the shell in place while you review the current shortcut reference instead of relying on a small transient modal.',
    transition: secondaryTakeoverTransition('Reference surface for longer-lived shortcut review that can stay open beside the shell state.'),
  },
  {
    id: 'settings',
    label: 'Settings',
    description: 'Full-height secondary surface for preferences, recovery controls, and advanced maintenance settings.',
    summaryTitle: 'Settings',
    summaryGuidance: 'This takeover replaces the main body while you adjust day-to-day defaults or open advanced setup, diagnostics, backup, and recovery controls.',
    transition: secondaryTakeoverTransition('Longer settings and maintenance workflow that should not compete with the main workspace body.'),
  },
];

export const UTILITY_MENU: UtilityMenu = {
  id: 'tools',
  triggerLabel: 'Tools',
  label: 'Tools',
  description: 'Transient overlays and app-wide actions you can run from any workspace or secondary surface.',
  sections: [
    {
      id: 'actions',
      label: 'Actions',
      description: 'Short-lived tools that overlay the current surface and dismiss back to it when closed.',
      actions: [
        {
          id: 'command-palette',
          label: 'Command palette',
          description: 'Search expert commands in a transient overlay without replacing the current surface.',
          transition: transientOverlayTransition('centered-dialog', 'Power-user command overlay that dismisses back to the current surface.'),
        },
        {
          id: 'paste-tokens',
          label: 'Paste tokens',
          description: 'Import tokens directly from pasted content in a transient overlay.',
          transition: transientOverlayTransition('centered-dialog', 'Short-lived paste/import overlay that dismisses back to the current surface.'),
        },
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
