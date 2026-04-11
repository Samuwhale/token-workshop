/**
 * Shared navigation types and constants — extracted from App.tsx so that
 * NavigationContext.tsx can import them without creating a circular dependency.
 * PanelRouter.tsx and other consumers import from here instead of from App.
 */

import { STORAGE_KEYS } from "./storage";
import type { GeneratorDialogInitialDraft } from "../hooks/useGeneratorDialog";
import type { GeneratorTemplate } from "../hooks/useGenerators";

export type TopTab = "define" | "apply" | "ship";
type DefineSubTab = "tokens" | "themes" | "generators";
type ApplySubTab = "inspect" | "canvas-analysis" | "dependencies";
type ShipSubTab = "publish" | "export" | "history" | "health";
export type SubTab = DefineSubTab | ApplySubTab | ShipSubTab;
export type SecondarySurfaceId =
  | "import"
  | "sets"
  | "notifications"
  | "shortcuts"
  | "settings";
export type SurfaceKind =
  | "workspace-screen"
  | "contextual-sub-screen"
  | "secondary-takeover"
  | "contextual-panel"
  | "transient-overlay";
export type SurfacePresentation =
  | "route"
  | "full-height-body"
  | "side-panel"
  | "bottom-drawer"
  | "split-pane"
  | "centered-dialog"
  | "bottom-sheet";
export type SurfaceCloseBehavior =
  | "none"
  | "restore-underlying-surface"
  | "dismiss-in-place";
export type TokensLibraryContextualSurface =
  | "compare"
  | "token-editor"
  | "generator-editor"
  | "token-preview";
export type TokensLibrarySurfaceSlot =
  | "library-body"
  | "contextual-panel"
  | "split-preview";
export type TokensLibraryGeneratorEditorTarget =
  | {
      mode: "edit";
      id: string;
    }
  | {
      mode: "create";
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
export const TOP_TABS: {
  id: TopTab;
  label: string;
  subTabs: { id: SubTab; label: string }[];
}[] = [
  {
    id: "define",
    label: "Define",
    subTabs: [
      { id: "tokens", label: "Tokens" },
      { id: "themes", label: "Themes" },
      { id: "generators", label: "Generators" },
    ],
  },
  {
    id: "apply",
    label: "Apply",
    subTabs: [
      { id: "inspect", label: "Inspect" },
      { id: "canvas-analysis", label: "Canvas Analysis" },
      { id: "dependencies", label: "Dependencies" },
    ],
  },
  {
    id: "ship",
    label: "Sync",
    subTabs: [
      { id: "publish", label: "Figma Sync" },
      { id: "export", label: "Handoff files" },
      { id: "history", label: "History" },
      { id: "health", label: "Audit" },
    ],
  },
];

export const DEFAULT_SUB_TABS: Record<TopTab, SubTab> = {
  define: "tokens",
  apply: "inspect",
  ship: "publish",
};

export const SUB_TAB_STORAGE: Record<TopTab, string> = {
  define: STORAGE_KEYS.ACTIVE_SUB_TAB_DEFINE,
  apply: STORAGE_KEYS.ACTIVE_SUB_TAB_APPLY,
  ship: STORAGE_KEYS.ACTIVE_SUB_TAB_SHIP,
};

// ---------------------------------------------------------------------------
// Workspace navigation — the primary visual structure
// ---------------------------------------------------------------------------

export type WorkspaceId = "tokens" | "themes" | "apply" | "sync" | "audit";
export type UtilityMenuId = "tools";
export type UtilitySectionId = "actions";
export type UtilityActionId =
  | "command-palette"
  | "paste-tokens"
  | "window-size";
export type SecondarySurfaceAccess =
  | "workspace-context"
  | "set-switcher"
  | "attention-bell"
  | "shell-menu";

export interface WorkspaceRoute {
  topTab: TopTab;
  subTab: SubTab;
}

export interface WorkspaceSection extends WorkspaceRoute {
  id: SubTab;
  label: string;
  summaryTitle?: string;
  transition?: SurfaceTransition;
}

export interface WorkspaceTab extends WorkspaceRoute {
  id: WorkspaceId;
  label: string;
  summaryTitle?: string;
  transition: SurfaceTransition;
  sections?: WorkspaceSection[];
  /** Additional routes that should keep this workspace selected. */
  matchRoutes?: WorkspaceRoute[];
}

export interface SecondarySurface {
  id: SecondarySurfaceId;
  label: string;
  summaryTitle: string;
  access: SecondarySurfaceAccess;
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

const route = (topTab: TopTab, subTab: SubTab): WorkspaceRoute => ({
  topTab,
  subTab,
});
const workspaceTransition = (usage: string): SurfaceTransition => ({
  kind: "workspace-screen",
  presentation: "route",
  closeBehavior: "none",
  usage,
});

const contextualSubScreenTransition = (usage: string): SurfaceTransition => ({
  kind: "contextual-sub-screen",
  presentation: "route",
  closeBehavior: "restore-underlying-surface",
  usage,
});

const secondaryTakeoverTransition = (usage: string): SurfaceTransition => ({
  kind: "secondary-takeover",
  presentation: "full-height-body",
  closeBehavior: "restore-underlying-surface",
  usage,
});

const transientOverlayTransition = (
  presentation: Extract<
    SurfacePresentation,
    "centered-dialog" | "bottom-sheet"
  >,
  usage: string,
): SurfaceTransition => ({
  kind: "transient-overlay",
  presentation,
  closeBehavior: "dismiss-in-place",
  usage,
});

export const CONTEXTUAL_PANEL_MIN_WIDTH = 401;
export const CONTEXTUAL_PANEL_TRANSITIONS = {
  sidePanel: {
    kind: "contextual-panel",
    presentation: "side-panel",
    closeBehavior: "restore-underlying-surface",
    usage: "Keep editing the current item beside your list when there is room.",
  },
  bottomDrawer: {
    kind: "contextual-panel",
    presentation: "bottom-drawer",
    closeBehavior: "restore-underlying-surface",
    usage: "Keep editing the current item in a drawer when space is tight.",
  },
  splitPreview: {
    kind: "contextual-panel",
    presentation: "split-pane",
    closeBehavior: "restore-underlying-surface",
    usage: "Open a live preview next to the library without losing your place.",
  },
} satisfies Record<
  "sidePanel" | "bottomDrawer" | "splitPreview",
  SurfaceTransition
>;

export const TOKENS_LIBRARY_SURFACE_CONTRACT = {
  body: {
    id: "library-body",
    label: "Tokens > Library",
    usage:
      "Browse tokens, search, filter, and switch sets in the main library.",
  },
  contextualPanel: {
    id: "contextual-panel",
    label: "Tokens > Library tools",
    usage: "Open compare, editing, and preview tools next to the library.",
    presentations: {
      wide: CONTEXTUAL_PANEL_TRANSITIONS.sidePanel,
      narrow: CONTEXTUAL_PANEL_TRANSITIONS.bottomDrawer,
    },
    surfaces: {
      compare: {
        label: "Compare",
        usage: "Compare tokens or themes without leaving the library.",
      },
      "token-editor": {
        label: "Token editor",
        usage: "Edit or create a token while keeping the library in view.",
      },
      "generator-editor": {
        label: "Generator editor",
        usage: "Adjust a generator without leaving the current list.",
      },
      "token-preview": {
        label: "Token preview",
        usage: "Inspect one token in detail while keeping the library in view.",
      },
    } satisfies Record<
      TokensLibraryContextualSurface,
      { label: string; usage: string }
    >,
  },
  splitPreview: {
    id: "split-preview",
    label: "Tokens > Live preview",
    usage:
      "Keep the library visible while a live preview focuses a token beside it.",
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
    surfaces: Record<
      TokensLibraryContextualSurface,
      { label: string; usage: string }
    >;
  };
  splitPreview: {
    id: TokensLibrarySurfaceSlot;
    label: string;
    usage: string;
    transition: SurfaceTransition;
  };
};

export const WORKSPACE_TABS: WorkspaceTab[] = [
  {
    id: "tokens",
    label: "Tokens",
    summaryTitle: "Token library",
    topTab: "define",
    subTab: "tokens",
    transition: workspaceTransition(
      "Browse, edit, and organize tokens and generators.",
    ),
    sections: [
      {
        id: "tokens",
        label: "Library",
        summaryTitle: "Token library",
        topTab: "define",
        subTab: "tokens",
        transition: workspaceTransition("Browse and edit the token library."),
      },
      {
        id: "generators",
        label: "Generators",
        summaryTitle: "Token generators",
        topTab: "define",
        subTab: "generators",
        transition: workspaceTransition("Create and adjust token generators."),
      },
    ],
    matchRoutes: [route("define", "tokens"), route("define", "generators")],
  },
  {
    id: "themes",
    label: "Themes",
    summaryTitle: "Theme authoring",
    topTab: "define",
    subTab: "themes",
    transition: workspaceTransition(
      "Build and manage theme structure and values.",
    ),
  },
  {
    id: "apply",
    label: "Apply",
    topTab: "apply",
    subTab: "inspect",
    transition: workspaceTransition(
      "Apply tokens to the current selection and review the canvas.",
    ),
    sections: [
      {
        id: "inspect",
        label: "Selection",
        summaryTitle: "Bind tokens to selection",
        topTab: "apply",
        subTab: "inspect",
        transition: workspaceTransition(
          "Apply tokens to the current selection.",
        ),
      },
      {
        id: "canvas-analysis",
        label: "Canvas",
        summaryTitle: "Canvas analysis",
        topTab: "apply",
        subTab: "canvas-analysis",
        transition: workspaceTransition(
          "Review token usage and issues across the canvas.",
        ),
      },
    ],
    matchRoutes: [route("apply", "inspect"), route("apply", "canvas-analysis")],
  },
  {
    id: "sync",
    label: "Sync",
    topTab: "ship",
    subTab: "publish",
    transition: workspaceTransition("Sync to Figma and prepare handoff files."),
    sections: [
      {
        id: "publish",
        label: "Figma Sync",
        summaryTitle: "Figma Sync",
        topTab: "ship",
        subTab: "publish",
        transition: workspaceTransition("Review and run your next Figma sync."),
      },
      {
        id: "export",
        label: "Handoff files",
        summaryTitle: "Handoff files",
        topTab: "ship",
        subTab: "export",
        transition: workspaceTransition(
          "Set up and export the files your team hands off.",
        ),
      },
    ],
    matchRoutes: [route("ship", "publish"), route("ship", "export")],
  },
  {
    id: "audit",
    label: "Audit",
    topTab: "ship",
    subTab: "health",
    transition: workspaceTransition(
      "Review quality checks, history, and dependencies.",
    ),
    sections: [
      {
        id: "health",
        label: "Audit",
        topTab: "ship",
        subTab: "health",
        transition: workspaceTransition("Review quality checks and blockers."),
      },
      {
        id: "history",
        label: "History",
        topTab: "ship",
        subTab: "history",
        transition: workspaceTransition(
          "Review recent changes and restore points.",
        ),
      },
      {
        id: "dependencies",
        label: "Dependencies",
        topTab: "apply",
        subTab: "dependencies",
        transition: contextualSubScreenTransition(
          "Trace token relationships and alias chains.",
        ),
      },
    ],
    matchRoutes: [
      route("ship", "health"),
      route("ship", "history"),
      route("apply", "dependencies"),
    ],
  },
];

export const SECONDARY_SURFACES: SecondarySurface[] = [
  {
    id: "import",
    label: "Import",
    summaryTitle: "Import tokens",
    access: "workspace-context",
    transition: secondaryTakeoverTransition(
      "Bring external tokens into the library.",
    ),
  },
  {
    id: "sets",
    label: "Sets",
    summaryTitle: "Token set manager",
    access: "set-switcher",
    transition: secondaryTakeoverTransition(
      "Rename, merge, split, reorder, and label sets.",
    ),
  },
  {
    id: "notifications",
    label: "Notifications",
    summaryTitle: "Notification history",
    access: "attention-bell",
    transition: secondaryTakeoverTransition(
      "Review recent confirmations, warnings, and errors.",
    ),
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    summaryTitle: "Keyboard shortcuts",
    access: "shell-menu",
    transition: secondaryTakeoverTransition(
      "Keep the keyboard shortcut list close while you work.",
    ),
  },
  {
    id: "settings",
    label: "Settings",
    summaryTitle: "Settings",
    access: "shell-menu",
    transition: secondaryTakeoverTransition(
      "Adjust preferences, backups, and recovery options.",
    ),
  },
];

export const UTILITY_MENU: UtilityMenu = {
  id: "tools",
  triggerLabel: "Tools",
  label: "Tools",
  description: "Quick actions you can open from anywhere in the app.",
  sections: [
    {
      id: "actions",
      label: "Actions",
      description:
        "Open a tool, finish the task, and return to what you were doing.",
      actions: [
        {
          id: "command-palette",
          label: "Command palette",
          description: "Search commands and jump to the next task fast.",
          transition: transientOverlayTransition(
            "centered-dialog",
            "Browse commands without losing your place.",
          ),
        },
        {
          id: "paste-tokens",
          label: "Paste tokens",
          description: "Paste token data to start an import.",
          transition: transientOverlayTransition(
            "centered-dialog",
            "Paste token data and return to your current work when you're done.",
          ),
        },
        {
          id: "window-size",
          label: "Window size",
          description: "Switch between compact and expanded plugin layouts.",
        },
      ],
    },
  ],
};

export const APP_SHELL_NAVIGATION: AppShellNavigation = {
  workspaces: WORKSPACE_TABS,
  secondarySurfaces: SECONDARY_SURFACES,
  utilityMenu: UTILITY_MENU,
};

function matchesRoute(
  routeDef: WorkspaceRoute,
  topTab: TopTab,
  subTab: SubTab,
): boolean {
  return routeDef.topTab === topTab && routeDef.subTab === subTab;
}

export function resolveWorkspace(topTab: TopTab, subTab: SubTab): WorkspaceTab {
  return (
    WORKSPACE_TABS.find(
      (workspace) =>
        matchesRoute(workspace, topTab, subTab) ||
        workspace.sections?.some((section) =>
          matchesRoute(section, topTab, subTab),
        ) ||
        workspace.matchRoutes?.some((routeDef) =>
          matchesRoute(routeDef, topTab, subTab),
        ),
    ) ?? WORKSPACE_TABS[0]
  );
}

export function resolveWorkspaceSection(
  workspace: WorkspaceTab,
  topTab: TopTab,
  subTab: SubTab,
): WorkspaceSection | null {
  return (
    workspace.sections?.find((section) =>
      matchesRoute(section, topTab, subTab),
    ) ?? null
  );
}

/** Map an internal route to the primary workspace shown in the shell. */
export function toWorkspaceId(topTab: TopTab, subTab: SubTab): WorkspaceId {
  return resolveWorkspace(topTab, subTab).id;
}

export function resolveSecondarySurface(
  id: SecondarySurfaceId | null,
): SecondarySurface | null {
  if (id === null) return null;
  return SECONDARY_SURFACES.find((surface) => surface.id === id) ?? null;
}
