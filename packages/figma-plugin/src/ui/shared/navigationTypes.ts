/**
 * Shared navigation types and constants — extracted from App.tsx so that
 * NavigationContext.tsx can import them without creating a circular dependency.
 * PanelRouter.tsx and other consumers import from here instead of from App.
 */

import { STORAGE_KEYS } from "./storage";
import type { GeneratorDialogInitialDraft } from "../hooks/useGeneratorDialog";
import type { GeneratorTemplate } from "../hooks/useGenerators";

export type TopTab = "define" | "apply" | "sync";
type DefineSubTab = "tokens" | "themes" | "generators";
type ApplySubTab = "inspect" | "canvas-analysis" | "dependencies";
type SyncSubTab = "publish" | "export" | "history" | "health";
export type SubTab = DefineSubTab | ApplySubTab | SyncSubTab;
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
      { id: "themes", label: "Modes" },
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
    id: "sync",
    label: "Sync",
    subTabs: [
      { id: "publish", label: "Figma Sync" },
      { id: "export", label: "Export" },
      { id: "history", label: "History" },
      { id: "health", label: "Audit" },
    ],
  },
];

export const DEFAULT_SUB_TABS: Record<TopTab, SubTab> = {
  define: "tokens",
  apply: "inspect",
  sync: "publish",
};

export const SUB_TAB_STORAGE: Record<TopTab, string> = {
  define: STORAGE_KEYS.ACTIVE_SUB_TAB_DEFINE,
  apply: STORAGE_KEYS.ACTIVE_SUB_TAB_APPLY,
  sync: STORAGE_KEYS.ACTIVE_SUB_TAB_SYNC,
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
  | "shell-shortcut"
  | "workspace-context"
  | "set-switcher"
  | "attention-bell"
  | "shell-menu"
  | "settings-help";

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

export interface WorkspaceWorkflowGuide {
  id: WorkspaceId;
  label: string;
  stepNumber: number | null;
  role: string;
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

export interface ResolvedWorkspaceSummary {
  workspace: WorkspaceTab;
  section: WorkspaceSection | null;
  workspaceLabel: string;
  workspaceTitle: string;
  currentLabel: string;
  currentTitle: string;
  currentDepthLabel: string;
}

export const PRIMARY_WORKSPACE_SEQUENCE: WorkspaceWorkflowGuide[] = [
  {
    id: "tokens",
    label: "Tokens",
    stepNumber: 1,
    role: "Build and organize the token library, naming, and generators.",
  },
  {
    id: "themes",
    label: "Modes",
    stepNumber: 2,
    role: "Define modes, assign shared and override token sets, review coverage.",
  },
  {
    id: "apply",
    label: "Apply",
    stepNumber: 3,
    role: "Test token decisions on selections and inspect the canvas.",
  },
  {
    id: "sync",
    label: "Sync",
    stepNumber: 4,
    role: "Run preflight, publish to Figma, and export platform files.",
  },
];

export const AUDIT_WORKSPACE_GUIDE: WorkspaceWorkflowGuide = {
  id: "audit",
  label: "Audit",
  stepNumber: null,
  role: "Review issues, history, and dependencies across every stage.",
};

const WORKSPACE_WORKFLOW_GUIDES: Record<WorkspaceId, WorkspaceWorkflowGuide> = {
  tokens: PRIMARY_WORKSPACE_SEQUENCE[0],
  themes: PRIMARY_WORKSPACE_SEQUENCE[1],
  apply: PRIMARY_WORKSPACE_SEQUENCE[2],
  sync: PRIMARY_WORKSPACE_SEQUENCE[3],
  audit: AUDIT_WORKSPACE_GUIDE,
};

export const PRIMARY_WORKSPACE_SEQUENCE_LABEL = PRIMARY_WORKSPACE_SEQUENCE.map(
  (workspace) => workspace.label,
).join(" -> ");

export type ImportResultSourceType =
  | "variables"
  | "styles"
  | "json"
  | "css"
  | "tailwind"
  | "tokens-studio";
export type ImportResultSourceFamily =
  | "figma"
  | "token-files"
  | "code"
  | "migration";

export interface ImportResultSummary {
  sourceType: ImportResultSourceType;
  sourceFamily: ImportResultSourceFamily;
  destinationSets: string[];
  newCount: number;
  overwriteCount: number;
  mergeCount: number;
  keepExistingCount: number;
  totalImportedCount: number;
  hadFailures: boolean;
  sourceCollectionCount?: number;
}

export type ImportNextStepTarget =
  | {
      kind: "workspace";
      workspaceId: WorkspaceId;
      topTab: TopTab;
      subTab: SubTab;
    }
  | {
      kind: "secondary-surface";
      secondarySurfaceId: SecondarySurfaceId;
    };

export interface ImportNextStepRecommendation {
  target: ImportNextStepTarget;
  label: string;
  rationale: string;
}

const PRIMARY_IMPORT_SET_SEGMENTS = new Set([
  "base",
  "default",
  "core",
  "global",
  "primitives",
  "primitive",
  "tokens",
]);

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
        usage: "Compare tokens or modes without leaving the library.",
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
    label: "Modes",
    summaryTitle: "Mode configuration",
    topTab: "define",
    subTab: "themes",
    transition: workspaceTransition(
      "Define modes, assign token sets, and review coverage.",
    ),
  },
  {
    id: "apply",
    label: "Apply",
    summaryTitle: "Apply to selection",
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
    summaryTitle: "Sync delivery",
    topTab: "sync",
    subTab: "publish",
    transition: workspaceTransition("Sync to Figma and export platform files."),
    sections: [
      {
        id: "publish",
        label: "Figma Sync",
        summaryTitle: "Figma Sync",
        topTab: "sync",
        subTab: "publish",
        transition: workspaceTransition("Review and run your next Figma sync."),
      },
      {
        id: "export",
        label: "Export",
        summaryTitle: "Export",
        topTab: "sync",
        subTab: "export",
        transition: workspaceTransition(
          "Configure and export platform-specific token files.",
        ),
      },
    ],
    matchRoutes: [route("sync", "publish"), route("sync", "export")],
  },
  {
    id: "audit",
    label: "Audit",
    summaryTitle: "Quality review",
    topTab: "sync",
    subTab: "health",
    transition: workspaceTransition(
      "Review quality checks, history, and dependencies.",
    ),
    sections: [
      {
        id: "health",
        label: "Issues",
        summaryTitle: "Issues",
        topTab: "sync",
        subTab: "health",
        transition: workspaceTransition("Review quality checks and blockers."),
      },
      {
        id: "history",
        label: "History",
        summaryTitle: "Change history",
        topTab: "sync",
        subTab: "history",
        transition: workspaceTransition(
          "Review recent changes and restore points.",
        ),
      },
      {
        id: "dependencies",
        label: "Dependencies",
        summaryTitle: "Dependency tracing",
        topTab: "apply",
        subTab: "dependencies",
        transition: contextualSubScreenTransition(
          "Trace token relationships and alias chains.",
        ),
      },
    ],
    matchRoutes: [
      route("sync", "health"),
      route("sync", "history"),
      route("apply", "dependencies"),
    ],
  },
];

export const SECONDARY_SURFACES: SecondarySurface[] = [
  {
    id: "import",
    label: "Import",
    summaryTitle: "Import tokens",
    access: "shell-shortcut",
    transition: secondaryTakeoverTransition(
      "Bring external tokens into the library.",
    ),
  },
  {
    id: "sets",
    label: "Set structure",
    summaryTitle: "Set structure manager",
    access: "set-switcher",
    transition: secondaryTakeoverTransition(
      "Own token authoring structure here: rename, merge, split, reorder, and label sets.",
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
    access: "settings-help",
    transition: secondaryTakeoverTransition(
      "Open the keyboard reference when you need a quick reminder.",
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

export function getSurfaceKindLabel(kind: SurfaceKind): string {
  switch (kind) {
    case "workspace-screen":
      return "Workspace";
    case "contextual-sub-screen":
      return "Contextual screen";
    case "secondary-takeover":
      return "Secondary surface";
    case "contextual-panel":
      return "Contextual panel";
    case "transient-overlay":
      return "Overlay";
  }
}

export const LARGE_INITIAL_IMPORT_TOKEN_THRESHOLD = 150;
export const LARGE_INITIAL_IMPORT_SET_THRESHOLD = 4;

function createWorkspaceRecommendation(
  topTab: TopTab,
  subTab: SubTab,
  rationale: string,
): ImportNextStepRecommendation {
  const workspace = resolveWorkspace(topTab, subTab);
  return {
    target: {
      kind: "workspace",
      workspaceId: workspace.id,
      topTab,
      subTab,
    },
    label: workspace.label,
    rationale,
  };
}

function createSecondarySurfaceRecommendation(
  secondarySurfaceId: SecondarySurfaceId,
  rationale: string,
): ImportNextStepRecommendation {
  const surface = resolveSecondarySurface(secondarySurfaceId);
  return {
    target: {
      kind: "secondary-surface",
      secondarySurfaceId,
    },
    label: surface?.label ?? secondarySurfaceId,
    rationale,
  };
}

function isLargeInitialImport(summary: ImportResultSummary): boolean {
  const reviewedExistingCount =
    summary.overwriteCount + summary.mergeCount + summary.keepExistingCount;
  return (
    reviewedExistingCount === 0 &&
    (summary.totalImportedCount >= LARGE_INITIAL_IMPORT_TOKEN_THRESHOLD ||
      summary.destinationSets.length >= LARGE_INITIAL_IMPORT_SET_THRESHOLD)
  );
}

function importedMultipleVariableCollections(
  summary: ImportResultSummary,
): boolean {
  if (summary.sourceType !== "variables") {
    return false;
  }

  if (summary.sourceCollectionCount !== undefined) {
    return summary.sourceCollectionCount > 1;
  }

  return summary.destinationSets.length > 1;
}

export function getImportResultNextStepRecommendations(
  summary: ImportResultSummary,
): ImportNextStepRecommendation[] {
  const recommendations: ImportNextStepRecommendation[] = [];
  const seenTargets = new Set<string>();

  const addRecommendation = (recommendation: ImportNextStepRecommendation) => {
    const targetKey =
      recommendation.target.kind === "workspace"
        ? `${recommendation.target.topTab}:${recommendation.target.subTab}`
        : `secondary:${recommendation.target.secondarySurfaceId}`;
    if (seenTargets.has(targetKey)) {
      return;
    }
    seenTargets.add(targetKey);
    recommendations.push(recommendation);
  };

  if (summary.hadFailures) {
    addRecommendation(
      createSecondarySurfaceRecommendation(
        "import",
        "Stay here to retry failed batches and review anything that did not save cleanly.",
      ),
    );
  }

  if (importedMultipleVariableCollections(summary)) {
    addRecommendation(
      createWorkspaceRecommendation(
        "define",
        "themes",
        "Open Modes next. Multiple imported variable collections usually need mode structure before you fine-tune individual tokens.",
      ),
    );
  }

  if (isLargeInitialImport(summary)) {
    addRecommendation(
      createWorkspaceRecommendation(
        "sync",
        "publish",
        "Open Sync next. A large first import is the right time to confirm sync mapping before more edits pile on.",
      ),
    );
  }

  if (summary.sourceFamily === "code" || summary.sourceFamily === "migration") {
    addRecommendation(
      createWorkspaceRecommendation(
        "define",
        "tokens",
        "Open Tokens next. Code and migration imports usually need a pass in the token library to verify naming, grouping, and cleanup.",
      ),
    );
  }

  if (recommendations.length === 0) {
    addRecommendation(
      createWorkspaceRecommendation(
        "define",
        "tokens",
        "Open Tokens next to review the imported library before moving into Modes, Apply, or Sync.",
      ),
    );
  }

  return recommendations;
}

function getImportSetSortKey(setName: string): [number, number, number] {
  const segments = setName
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
  const lastSegment = segments.at(-1) ?? "";
  const hasPrimarySegment = segments.some((segment) =>
    PRIMARY_IMPORT_SET_SEGMENTS.has(segment),
  );
  const primaryRank = PRIMARY_IMPORT_SET_SEGMENTS.has(lastSegment)
    ? 0
    : hasPrimarySegment
      ? 1
      : 2;

  return [primaryRank, segments.length || 1, setName.length];
}

export function getMostRelevantImportDestinationSet(
  summary: Pick<ImportResultSummary, "destinationSets">,
): string | null {
  const uniqueSets = [...new Set(summary.destinationSets.filter(Boolean))];
  if (uniqueSets.length === 0) {
    return null;
  }

  const rankedSets = uniqueSets.map((setName, index) => ({
    setName,
    index,
    sortKey: getImportSetSortKey(setName),
  }));

  rankedSets.sort((a, b) => {
    if (a.sortKey[0] !== b.sortKey[0]) {
      return a.sortKey[0] - b.sortKey[0];
    }
    if (a.sortKey[1] !== b.sortKey[1]) {
      return a.sortKey[1] - b.sortKey[1];
    }
    if (a.sortKey[2] !== b.sortKey[2]) {
      return a.sortKey[2] - b.sortKey[2];
    }
    return a.index - b.index;
  });

  return rankedSets[0]?.setName ?? null;
}

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

function resolveWorkspaceCurrentDepthLabel(
  section: WorkspaceSection | null,
): string {
  if (!section) {
    return "Workspace";
  }

  return section.transition?.kind === "contextual-sub-screen"
    ? "Contextual screen"
    : "Section";
}

export function resolveWorkspaceSummary(
  topTab: TopTab,
  subTab: SubTab,
): ResolvedWorkspaceSummary {
  const workspace = resolveWorkspace(topTab, subTab);
  const section = resolveWorkspaceSection(workspace, topTab, subTab);
  const workspaceTitle = workspace.summaryTitle ?? workspace.label;
  const currentLabel = section?.label ?? workspace.label;

  return {
    workspace,
    section,
    workspaceLabel: workspace.label,
    workspaceTitle,
    currentLabel,
    currentTitle: section?.summaryTitle ?? section?.label ?? workspaceTitle,
    currentDepthLabel: resolveWorkspaceCurrentDepthLabel(section),
  };
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

export function getWorkspaceWorkflowGuide(
  workspaceId: WorkspaceId,
): WorkspaceWorkflowGuide {
  return WORKSPACE_WORKFLOW_GUIDES[workspaceId];
}
