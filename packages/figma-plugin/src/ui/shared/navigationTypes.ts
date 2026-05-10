/**
 * Shared navigation types and constants — extracted from App.tsx so that
 * NavigationContext.tsx can import them without creating a circular dependency.
 * PanelRouter.tsx and other consumers import from here instead of from App.
 */

import { STORAGE_KEYS } from "./storage";

// User-facing workspace names live on WORKSPACE_TABS[].label / SIDEBAR_GROUPS[].items[].label — guidance copy should reference those, not re-spell them.
export type TopTab =
  | "library"
  | "canvas"
  | "publish";
export type LibrarySubTab = "tokens" | "generators" | "health" | "history";
export type PublishSubTab =
  | "publish-figma"
  | "publish-code"
  | "publish-repository";
export type SubTab =
  | LibrarySubTab
  | "inspect"
  | "repair"
  | PublishSubTab;
export type SecondarySurfaceId =
  | "shortcuts"
  | "settings";
export type TokensLibraryContextualSurface =
  | "compare"
  | "collection-details"
  | "token-details"
  | "color-analysis"
  | "import";

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

/**
 * Internal routing structure.
 * The app shell remaps these route buckets into user-facing workspaces below,
 * and this table is the source of truth for which panels exist.
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
      { id: "generators", label: "Generators" },
      { id: "health", label: "Review" },
      { id: "history", label: "Local history" },
    ],
  },
  {
    id: "canvas",
    label: "Canvas",
    subTabs: [
      { id: "inspect", label: "Selection" },
      { id: "repair", label: "Repair" },
    ],
  },
  {
    id: "publish",
    label: "Publish",
    subTabs: [
      { id: "publish-figma", label: "Figma" },
      { id: "publish-code", label: "Export files" },
      { id: "publish-repository", label: "Team versions" },
    ],
  },
];

export const DEFAULT_SUB_TABS: Record<TopTab, SubTab> = {
  library: "tokens",
  canvas: "inspect",
  publish: "publish-figma",
};

export const SUB_TAB_STORAGE: Record<TopTab, string> = {
  library: STORAGE_KEYS.ACTIVE_SUB_TAB_LIBRARY,
  canvas: STORAGE_KEYS.ACTIVE_SUB_TAB_CANVAS,
  publish: STORAGE_KEYS.ACTIVE_SUB_TAB_PUBLISH,
};

// ---------------------------------------------------------------------------
// Workspace navigation — the primary visual structure
// ---------------------------------------------------------------------------

export type WorkspaceId =
  | "library"
  | "canvas"
  | "publish";
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
}

export interface WorkspaceTab extends WorkspaceRoute {
  id: WorkspaceId;
  label: string;
  summaryTitle?: string;
  sections?: WorkspaceSection[];
  /** Additional routes that should keep this workspace selected. */
  matchRoutes?: WorkspaceRoute[];
}

export interface SecondarySurface {
  id: SecondarySurfaceId;
  label: string;
  summaryTitle: string;
  access: SecondarySurfaceAccess;
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

export type WorkspaceImportNextStepTarget = Extract<
  ImportNextStepTarget,
  { kind: "workspace" }
>;

export interface ImportNextStepRecommendation {
  target: ImportNextStepTarget;
  label: string;
  rationale: string;
}

export interface WorkspaceImportNextStepRecommendation
  extends ImportNextStepRecommendation {
  target: WorkspaceImportNextStepTarget;
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
    id: "workspaces",
    label: "",
    items: [
      { id: "library", label: "Library", railCode: "Li", topTab: "library", subTab: "tokens", workspaceId: "library" },
      { id: "canvas", label: "Canvas", railCode: "Ca", topTab: "canvas", subTab: "inspect", workspaceId: "canvas" },
      { id: "publish", label: "Publish", railCode: "Pu", topTab: "publish", subTab: "publish-figma", workspaceId: "publish" },
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
    sections: [
      { id: "tokens",  label: "Tokens",  topTab: "library", subTab: "tokens" },
      { id: "generators", label: "Generators", topTab: "library", subTab: "generators" },
      { id: "health",  label: "Review",  topTab: "library", subTab: "health" },
      { id: "history", label: "Local history", topTab: "library", subTab: "history" },
    ],
    matchRoutes: [
      route("library", "tokens"),
      route("library", "health"),
      route("library", "history"),
      route("library", "generators"),
    ],
  },
  {
    id: "canvas",
    label: "Canvas",
    summaryTitle: "Canvas",
    topTab: "canvas",
    subTab: "inspect",
    sections: [
      { id: "inspect", label: "Selection", topTab: "canvas", subTab: "inspect" },
      { id: "repair",  label: "Repair",    topTab: "canvas", subTab: "repair" },
    ],
    matchRoutes: [
      route("canvas", "inspect"),
      route("canvas", "repair"),
    ],
  },
  {
    id: "publish",
    label: "Publish",
    summaryTitle: "Publish",
    topTab: "publish",
    subTab: "publish-figma",
    sections: [
      { id: "publish-figma", label: "Figma", topTab: "publish", subTab: "publish-figma" },
      { id: "publish-code",  label: "Export files",  topTab: "publish", subTab: "publish-code" },
      { id: "publish-repository",  label: "Team versions",  topTab: "publish", subTab: "publish-repository" },
    ],
    matchRoutes: [
      route("publish", "publish-figma"),
      route("publish", "publish-code"),
      route("publish", "publish-repository"),
    ],
  },
];


export const SECONDARY_SURFACES: SecondarySurface[] = [
  { id: "shortcuts", label: "Shortcuts", summaryTitle: "Shortcuts", access: "settings-help" },
  { id: "settings",  label: "Settings",  summaryTitle: "Settings",  access: "shell-menu" },
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
        { id: "command-palette", label: "Commands",     description: "Search commands and jump to tasks." },
        { id: "paste-tokens",    label: "Paste tokens",  description: "Paste token data to import." },
        { id: "window-size",     label: "Window size",   description: "Toggle compact or expanded layout." },
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
): WorkspaceImportNextStepRecommendation {
  const workspace = resolveWorkspace(topTab, subTab);
  const section = resolveWorkspaceSection(workspace, topTab, subTab);
  const label =
    section?.id === "tokens"
      ? "Review imported tokens"
      : section
        ? `Open ${section.label}`
        : workspace.label;
  return {
    target: {
      kind: "workspace",
      workspaceId: workspace.id,
      topTab,
      subTab,
    },
    label,
    rationale,
  };
}

export function isWorkspaceImportNextStepRecommendation(
  recommendation: ImportNextStepRecommendation,
): recommendation is WorkspaceImportNextStepRecommendation {
  return recommendation.target.kind === "workspace";
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
        "library",
        "health",
        "Large import — review library health before publishing.",
      ),
    );
  }

  if (summary.sourceFamily === "code" || summary.sourceFamily === "migration") {
    addRecommendation(
      createWorkspaceRecommendation(
        "library",
        "health",
        "Review naming, aliases, and unused tokens before publishing.",
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
  return section ? "Section" : "Workspace";
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
