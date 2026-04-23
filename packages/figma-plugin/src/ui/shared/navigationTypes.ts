/**
 * Shared navigation types and constants — extracted from App.tsx so that
 * NavigationContext.tsx can import them without creating a circular dependency.
 * PanelRouter.tsx and other consumers import from here instead of from App.
 */

import { STORAGE_KEYS } from "./storage";
import type { GeneratorDialogInitialDraft } from "../hooks/useGeneratedGroupEditor";
import type { GeneratorTemplate } from "../hooks/useGenerators";

// User-facing workspace names live on WORKSPACE_TABS[].label / SIDEBAR_GROUPS[].items[].label — guidance copy should reference those, not re-spell them.
export type TopTab =
  | "library"
  | "canvas"
  | "sync"
  | "export";
export type LibrarySubTab = "tokens" | "health" | "history";
export type SubTab =
  | LibrarySubTab
  | "inspect"
  | "coverage"
  | "repair"
  | "figma-sync"
  | "export";
export type SecondarySurfaceId =
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
  | "token-details"
  | "generated-group-editor"
  | "color-analysis"
  | "import";
export type TokensLibrarySurfaceSlot =
  | "library-body"
  | "contextual-panel";
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

export interface TokenContextNavigationHistoryEntry {
  path: string;
  collectionId: string;
  mode: "inspect" | "edit";
  name?: string;
}

export interface TokenContextNavigationRequest {
  path: string;
  collectionId: string;
  mode: "inspect" | "edit";
  origin: string;
  name?: string;
  returnLabel?: string;
  onReturn?: (() => void) | null;
  navigationHistory?: TokenContextNavigationHistoryEntry[];
}

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
    id: "library",
    label: "Library",
    subTabs: [
      { id: "tokens", label: "Tokens" },
      { id: "health", label: "Review" },
      { id: "history", label: "History" },
    ],
  },
  {
    id: "canvas",
    label: "Canvas",
    subTabs: [
      { id: "inspect", label: "Selection" },
      { id: "coverage", label: "Coverage" },
      { id: "repair", label: "Repair" },
    ],
  },
  {
    id: "sync",
    label: "Sync",
    subTabs: [{ id: "figma-sync", label: "Figma Sync" }],
  },
  {
    id: "export",
    label: "Export",
    subTabs: [{ id: "export", label: "Export" }],
  },
];

export const DEFAULT_SUB_TABS: Record<TopTab, SubTab> = {
  library: "tokens",
  canvas: "inspect",
  sync: "figma-sync",
  export: "export",
};

export const SUB_TAB_STORAGE: Record<TopTab, string> = {
  library: STORAGE_KEYS.ACTIVE_SUB_TAB_LIBRARY,
  canvas: STORAGE_KEYS.ACTIVE_SUB_TAB_CANVAS,
  sync: STORAGE_KEYS.ACTIVE_SUB_TAB_SYNC,
  export: STORAGE_KEYS.ACTIVE_SUB_TAB_EXPORT,
};

// ---------------------------------------------------------------------------
// Workspace navigation — the primary visual structure
// ---------------------------------------------------------------------------

export type WorkspaceId =
  | "library"
  | "canvas"
  | "sync"
  | "export";
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
} satisfies Record<"fullTakeover", SurfaceTransition>;

export const TOKENS_LIBRARY_SURFACE_CONTRACT = {
  body: {
    id: "library-body",
    label: "Library",
    usage:
      "Browse, search, and filter tokens.",
  },
  contextualPanel: {
    id: "contextual-panel",
    label: "Library tools",
    usage: "Compare, edit, and preview tools.",
    presentation: CONTEXTUAL_PANEL_TRANSITIONS.fullTakeover,
    surfaces: {
      compare: {
        label: "Compare",
        usage: "Compare tokens or mode options.",
      },
      "collection-details": {
        label: "Collection details",
        usage: "Review collection structure, metadata, and modes.",
      },
      "token-details": {
        label: "Token details",
        usage: "Inspect, edit, or create a token.",
      },
      "generated-group-editor": {
        label: "Generated group editor",
        usage: "Configure a generated group.",
      },
      "color-analysis": {
        label: "Color analysis",
        usage: "Contrast matrix and lightness scale inspector.",
      },
      import: {
        label: "Import",
        usage: "Import tokens from Figma or files.",
      },
    } satisfies Record<
      TokensLibraryContextualSurface,
      { label: string; usage: string }
    >,
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
    id: "work",
    label: "Work",
    items: [
      { id: "library", label: "Library", railCode: "Li", topTab: "library", subTab: "tokens", workspaceId: "library" },
      { id: "canvas", label: "Canvas", railCode: "Ca", topTab: "canvas", subTab: "inspect", workspaceId: "canvas" },
    ],
  },
  {
    id: "delivery",
    label: "Delivery",
    items: [
      { id: "sync", label: "Sync", railCode: "Sy", topTab: "sync", subTab: "figma-sync", workspaceId: "sync" },
      { id: "export", label: "Export", railCode: "Ex", topTab: "export", subTab: "export", workspaceId: "export" },
    ],
  },
];

export const WORKSPACE_TABS: WorkspaceTab[] = [
  {
    id: "library",
    label: "Library",
    summaryTitle: "Library",
    topTab: "library",
    subTab: "tokens",
    transition: workspaceTransition("Browse and edit tokens."),
    sections: [
      {
        id: "tokens",
        label: "Tokens",
        topTab: "library",
        subTab: "tokens",
        transition: contextualSubScreenTransition(
          "full-height-body",
          "Browse, search, and edit tokens.",
        ),
      },
      {
        id: "health",
        label: "Review",
        topTab: "library",
        subTab: "health",
        transition: contextualSubScreenTransition(
          "full-height-body",
          "Review issues, cleanup opportunities, and token quality.",
        ),
      },
      {
        id: "history",
        label: "History",
        topTab: "library",
        subTab: "history",
        transition: contextualSubScreenTransition(
          "full-height-body",
          "Review recent edits, checkpoints, and versions.",
        ),
      },
    ],
    matchRoutes: [
      route("library", "tokens"),
      route("library", "health"),
      route("library", "history"),
    ],
  },
  {
    id: "canvas",
    label: "Canvas",
    summaryTitle: "Canvas",
    topTab: "canvas",
    subTab: "inspect",
    transition: workspaceTransition(
      "Inspect, match, create, bind, and repair tokens on the current selection.",
    ),
    sections: [
      {
        id: "inspect",
        label: "Selection",
        topTab: "canvas",
        subTab: "inspect",
        transition: contextualSubScreenTransition(
          "full-height-body",
          "Inspect, match, create, and bind tokens for the current selection.",
        ),
      },
      {
        id: "coverage",
        label: "Coverage",
        topTab: "canvas",
        subTab: "coverage",
        transition: contextualSubScreenTransition(
          "full-height-body",
          "See where tokens are and aren't used across the canvas.",
        ),
      },
      {
        id: "repair",
        label: "Repair",
        topTab: "canvas",
        subTab: "repair",
        transition: contextualSubScreenTransition(
          "full-height-body",
          "Fix broken or stale token bindings.",
        ),
      },
    ],
    matchRoutes: [
      route("canvas", "inspect"),
      route("canvas", "coverage"),
      route("canvas", "repair"),
    ],
  },
  {
    id: "sync",
    label: "Sync",
    summaryTitle: "Sync",
    topTab: "sync",
    subTab: "figma-sync",
    transition: workspaceTransition(
      "Publish tokens to Figma.",
    ),
    matchRoutes: [route("sync", "figma-sync")],
  },
  {
    id: "export",
    label: "Export",
    summaryTitle: "Export",
    topTab: "export",
    subTab: "export",
    transition: workspaceTransition("Generate platform token files."),
    matchRoutes: [route("export", "export")],
  },
];


export const SECONDARY_SURFACES: SecondarySurface[] = [
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
      createWorkspaceRecommendation(
        "library",
        "tokens",
        "Retry failed batches.",
      ),
    );
  }

  if (importedMultipleVariableCollections(summary)) {
    addRecommendation(
      createWorkspaceRecommendation(
        "library",
        "tokens",
        "Multiple collections imported — review the new collections.",
      ),
    );
  }

  if (isLargeInitialImport(summary)) {
    addRecommendation(
      createWorkspaceRecommendation(
        "sync",
        "figma-sync",
        "Large import — confirm sync mapping.",
      ),
    );
  }

  if (summary.sourceFamily === "code" || summary.sourceFamily === "migration") {
    addRecommendation(
      createWorkspaceRecommendation(
        "library",
        "tokens",
        "Review naming and grouping in the library.",
      ),
    );
  }

  if (recommendations.length === 0) {
    addRecommendation(
      createWorkspaceRecommendation(
        "library",
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
