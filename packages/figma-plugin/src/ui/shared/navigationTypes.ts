/**
 * Shared navigation types and constants — extracted from App.tsx so that
 * NavigationContext.tsx can import them without creating a circular dependency.
 * PanelRouter.tsx and other consumers import from here instead of from App.
 */

import { STORAGE_KEYS } from "./storage";
import type { GeneratorDialogInitialDraft } from "../hooks/useGeneratedGroupEditor";
import type { GeneratorTemplate } from "../hooks/useGenerators";

export type TopTab = "tokens" | "canvas" | "publish";
type TokensSubTab = "tokens" | "history" | "health";
type CanvasSubTab = "inspect" | "canvas-analysis";
type PublishSubTab = "sync" | "export" | "versions";
export type SubTab = TokensSubTab | CanvasSubTab | PublishSubTab;
export type SecondarySurfaceId =
  | "import"
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
  | "full-takeover"
  | "split-pane"
  | "centered-dialog"
  | "bottom-sheet";
export type SurfaceCloseBehavior =
  | "none"
  | "restore-underlying-surface"
  | "dismiss-in-place";
export type TokensLibraryContextualSurface =
  | "compare"
  | "collection-details"
  | "token-editor"
  | "generated-group-editor"
  | "token-preview"
  | "color-analysis";
export type TokensLibrarySurfaceSlot =
  | "library-body"
  | "contextual-panel"
  | "split-preview";
export type TokensLibraryGeneratedGroupEditorTarget =
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
      intentPreset?: "semantic-aliases";
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
    id: "tokens",
    label: "Tokens",
    subTabs: [
      { id: "tokens", label: "Library" },
      { id: "health", label: "Health" },
      { id: "history", label: "Changes" },
    ],
  },
  {
    id: "canvas",
    label: "Canvas",
    subTabs: [
      { id: "inspect", label: "Selection" },
      { id: "canvas-analysis", label: "Scan" },
    ],
  },
  {
    id: "publish",
    label: "Publish",
    subTabs: [
      { id: "sync", label: "Sync" },
      { id: "export", label: "Export" },
      { id: "versions", label: "Versions" },
    ],
  },
];

export const DEFAULT_SUB_TABS: Record<TopTab, SubTab> = {
  tokens: "tokens",
  canvas: "inspect",
  publish: "sync",
};

export const SUB_TAB_STORAGE: Record<TopTab, string> = {
  tokens: STORAGE_KEYS.ACTIVE_SUB_TAB_TOKENS,
  canvas: STORAGE_KEYS.ACTIVE_SUB_TAB_CANVAS,
  publish: STORAGE_KEYS.ACTIVE_SUB_TAB_PUBLISH,
};

// ---------------------------------------------------------------------------
// Workspace navigation — the primary visual structure
// ---------------------------------------------------------------------------

export type WorkspaceId = "tokens" | "canvas" | "publish";
export type UtilityMenuId = "tools";
export type UtilitySectionId = "actions";
export type UtilityActionId =
  | "command-palette"
  | "paste-tokens"
  | "window-size";
export type SecondarySurfaceAccess =
  | "shell-shortcut"
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
  destinationCollectionIds: string[];
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

const PRIMARY_IMPORT_COLLECTION_SEGMENTS = new Set([
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

const contextualSubScreenTransition = (
  presentation: Extract<SurfacePresentation, "route" | "full-height-body">,
  usage: string,
): SurfaceTransition => ({
  kind: "contextual-sub-screen",
  presentation,
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

export const CONTEXTUAL_PANEL_TRANSITIONS = {
  fullTakeover: {
    kind: "contextual-panel",
    presentation: "full-takeover",
    closeBehavior: "restore-underlying-surface",
    usage: "Edit in place.",
  },
  splitPreview: {
    kind: "contextual-panel",
    presentation: "split-pane",
    closeBehavior: "restore-underlying-surface",
    usage: "Live preview beside library.",
  },
} satisfies Record<
  "fullTakeover" | "splitPreview",
  SurfaceTransition
>;

export const TOKENS_LIBRARY_SURFACE_CONTRACT = {
  body: {
    id: "library-body",
    label: "Tokens > Library",
    usage:
      "Browse, search, and filter tokens.",
  },
  contextualPanel: {
    id: "contextual-panel",
    label: "Tokens > Library tools",
    usage: "Compare, edit, and preview tools.",
    presentation: CONTEXTUAL_PANEL_TRANSITIONS.fullTakeover,
    surfaces: {
      compare: {
        label: "Compare",
        usage: "Compare tokens or mode options.",
      },
      "collection-details": {
        label: "Collection setup",
        usage: "Review collection structure, metadata, and modes.",
      },
      "token-editor": {
        label: "Token editor",
        usage: "Edit or create a token.",
      },
      "generated-group-editor": {
        label: "Generated group editor",
        usage: "Configure a generated group.",
      },
      "token-preview": {
        label: "Token preview",
        usage: "Inspect token details.",
      },
      "color-analysis": {
        label: "Color analysis",
        usage: "Contrast matrix and lightness scale inspector.",
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
      "Live preview beside library.",
    transition: CONTEXTUAL_PANEL_TRANSITIONS.splitPreview,
  },
} satisfies {
  body: { id: TokensLibrarySurfaceSlot; label: string; usage: string };
  contextualPanel: {
    id: TokensLibrarySurfaceSlot;
    label: string;
    usage: string;
    presentation: SurfaceTransition;
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

// ---------------------------------------------------------------------------
// Sidebar groups — sections that organize workspace items
// ---------------------------------------------------------------------------

export interface SidebarItem {
  id: string;
  label: string;
  /** Two-letter abbreviation shown in collapsed rail mode */
  railCode: string;
  topTab: TopTab;
  subTab: SubTab;
  /** Which WorkspaceId this item belongs to (for highlight matching) */
  workspaceId: WorkspaceId;
}

export interface SidebarGroup {
  id: string;
  label: string;
  items: SidebarItem[];
}

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    id: "primary",
    label: "Primary",
    items: [
      { id: "tokens", label: "Tokens", railCode: "To", topTab: "tokens", subTab: "tokens", workspaceId: "tokens" },
      { id: "canvas", label: "Canvas", railCode: "Ca", topTab: "canvas", subTab: "inspect", workspaceId: "canvas" },
      { id: "publish", label: "Publish", railCode: "Pu", topTab: "publish", subTab: "sync", workspaceId: "publish" },
    ],
  },
];

export const WORKSPACE_TABS: WorkspaceTab[] = [
  {
    id: "tokens",
    label: "Tokens",
    summaryTitle: "Tokens",
    topTab: "tokens",
    subTab: "tokens",
    transition: workspaceTransition("Browse and edit tokens."),
    sections: [
      {
        id: "tokens",
        label: "Library",
        topTab: "tokens",
        subTab: "tokens",
        transition: contextualSubScreenTransition(
          "full-height-body",
          "Browse, search, and edit tokens.",
        ),
      },
      {
        id: "health",
        label: "Health",
        topTab: "tokens",
        subTab: "health",
        transition: contextualSubScreenTransition(
          "full-height-body",
          "Audit issues, dependencies, and token quality.",
        ),
      },
      {
        id: "history",
        label: "Changes",
        topTab: "tokens",
        subTab: "history",
        transition: contextualSubScreenTransition(
          "full-height-body",
          "Review recent edits and restore checkpoints.",
        ),
      },
    ],
    matchRoutes: [
      route("tokens", "tokens"),
      route("tokens", "health"),
      route("tokens", "history"),
    ],
  },
  {
    id: "canvas",
    label: "Canvas",
    summaryTitle: "Canvas",
    topTab: "canvas",
    subTab: "inspect",
    transition: workspaceTransition(
      "Inspect the current selection and analyze token usage on the canvas.",
    ),
    sections: [
      {
        id: "inspect",
        label: "Selection",
        topTab: "canvas",
        subTab: "inspect",
        transition: contextualSubScreenTransition(
          "full-height-body",
          "Inspect current selection.",
        ),
      },
      {
        id: "canvas-analysis",
        label: "Scan",
        topTab: "canvas",
        subTab: "canvas-analysis",
        transition: contextualSubScreenTransition(
          "full-height-body",
          "Scan canvas for token coverage.",
        ),
      },
    ],
    matchRoutes: [route("canvas", "inspect"), route("canvas", "canvas-analysis")],
  },
  {
    id: "publish",
    label: "Publish",
    summaryTitle: "Publish",
    topTab: "publish",
    subTab: "sync",
    transition: workspaceTransition("Publish and export."),
    sections: [
      {
        id: "sync",
        label: "Sync",
        topTab: "publish",
        subTab: "sync",
        transition: contextualSubScreenTransition(
          "full-height-body",
          "Publish tokens to Figma variables and styles.",
        ),
      },
      {
        id: "export",
        label: "Export",
        topTab: "publish",
        subTab: "export",
        transition: contextualSubScreenTransition(
          "full-height-body",
          "Export platform token files.",
        ),
      },
      {
        id: "versions",
        label: "Versions",
        topTab: "publish",
        subTab: "versions",
        transition: contextualSubScreenTransition(
          "full-height-body",
          "Save, share, and view version history.",
        ),
      },
    ],
    matchRoutes: [
      route("publish", "sync"),
      route("publish", "export"),
      route("publish", "versions"),
    ],
  },
];


export const SECONDARY_SURFACES: SecondarySurface[] = [
  {
    id: "import",
    label: "Import",
    summaryTitle: "Import",
    access: "shell-shortcut",
    transition: secondaryTakeoverTransition("Import external tokens."),
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    summaryTitle: "Shortcuts",
    access: "settings-help",
    transition: secondaryTakeoverTransition("Keyboard shortcut reference."),
  },
  {
    id: "settings",
    label: "Settings",
    summaryTitle: "Settings",
    access: "shell-menu",
    transition: secondaryTakeoverTransition("Preferences and recovery."),
  },
];

export const UTILITY_MENU: UtilityMenu = {
  id: "tools",
  triggerLabel: "Tools",
  label: "Tools",
  description: "Quick actions available anywhere.",
  sections: [
    {
      id: "actions",
      label: "Actions",
      description: "",
      actions: [
        {
          id: "command-palette",
          label: "Commands",
          description: "Search commands and jump to tasks.",
          transition: transientOverlayTransition(
            "centered-dialog",
            "Search and run commands.",
          ),
        },
        {
          id: "paste-tokens",
          label: "Paste tokens",
          description: "Paste token data to import.",
          transition: transientOverlayTransition(
            "centered-dialog",
            "Paste token data to import.",
          ),
        },
        {
          id: "window-size",
          label: "Window size",
          description: "Toggle compact or expanded layout.",
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
export const LARGE_INITIAL_IMPORT_COLLECTION_THRESHOLD = 4;

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
      summary.destinationCollectionIds.length >= LARGE_INITIAL_IMPORT_COLLECTION_THRESHOLD)
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

  return summary.destinationCollectionIds.length > 1;
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
        "Retry failed batches.",
      ),
    );
  }

  if (importedMultipleVariableCollections(summary)) {
    addRecommendation(
      createWorkspaceRecommendation(
        "tokens",
        "tokens",
        "Multiple collections imported — review the new collections in Tokens.",
      ),
    );
  }

  if (isLargeInitialImport(summary)) {
    addRecommendation(
      createWorkspaceRecommendation(
        "publish",
        "sync",
        "Large import — confirm sync mapping.",
      ),
    );
  }

  if (summary.sourceFamily === "code" || summary.sourceFamily === "migration") {
    addRecommendation(
      createWorkspaceRecommendation(
        "tokens",
        "tokens",
        "Review naming and grouping in the library.",
      ),
    );
  }

  if (recommendations.length === 0) {
    addRecommendation(
      createWorkspaceRecommendation(
        "tokens",
        "tokens",
        "Review imported tokens.",
      ),
    );
  }

  return recommendations;
}

function getImportCollectionSortKey(
  collectionId: string,
): [number, number, number] {
  const segments = collectionId
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
  const lastSegment = segments.at(-1) ?? "";
  const hasPrimarySegment = segments.some((segment) =>
    PRIMARY_IMPORT_COLLECTION_SEGMENTS.has(segment),
  );
  const primaryRank = PRIMARY_IMPORT_COLLECTION_SEGMENTS.has(lastSegment)
    ? 0
    : hasPrimarySegment
      ? 1
      : 2;

  return [primaryRank, segments.length || 1, collectionId.length];
}

export function getMostRelevantImportDestinationCollection(
  summary: Pick<ImportResultSummary, "destinationCollectionIds">,
): string | null {
  const uniqueCollectionIds = [
    ...new Set(summary.destinationCollectionIds.filter(Boolean)),
  ];
  if (uniqueCollectionIds.length === 0) {
    return null;
  }

  const rankedCollections = uniqueCollectionIds.map((collectionId, index) => ({
    collectionId,
    index,
    sortKey: getImportCollectionSortKey(collectionId),
  }));

  rankedCollections.sort((a, b) => {
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

  return rankedCollections[0]?.collectionId ?? null;
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
