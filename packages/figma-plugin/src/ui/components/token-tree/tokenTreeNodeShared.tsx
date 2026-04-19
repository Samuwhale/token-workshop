import type { MouseEvent } from "react";
import { getRecipeManagedOutputs } from "@tokenmanager/core";
import type { TokenMapEntry } from "../../../shared/types";
import { extractAliasPath } from "../../../shared/resolveAlias";
import type {
  GeneratedTokenResult,
  RecipeType,
  TokenRecipe,
} from "../../hooks/useRecipes";
import { getRecipeDashboardStatus } from "../../hooks/useRecipes";
import {
  formatRelativeTimestamp,
  getGeneratedGroupTypeLabel,
  getStatusLabel,
} from "../../shared/generatedGroupUtils";
import {
  getSingleObviousRecipeType,
} from "../recipes/recipeUtils";
import { formatValue } from "../recipes/recipeShared";
import type { TokenTreeNodeProps } from "../tokenListTypes";
import {
  CONDENSED_MAX_DEPTH,
  DEPTH_COLORS,
  INDENT_PER_LEVEL,
} from "../tokenListTypes";

export const EMPTY_LINT_VIOLATIONS: NonNullable<
  TokenTreeNodeProps["lintViolations"]
> = [];

export const BADGE_TEXT_CLASS = "text-[10px]";
export const INTERACTIVE_BADGE_HIT_AREA_CLASS = "min-h-[24px] min-w-[24px]";

/** Returns true if `value` contains a direct alias reference to `target`. */
function hasDirectRef(value: unknown, target: string): boolean {
  if (typeof value === "string") {
    return extractAliasPath(value) === target;
  }
  if (value && typeof value === "object") {
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) {
      if (item && typeof item === "object") {
        for (const nestedValue of Object.values(
          item as Record<string, unknown>,
        )) {
          if (
            typeof nestedValue === "string" &&
            extractAliasPath(nestedValue) === target
          ) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

export function getIncomingRefs(
  targetPath: string,
  allTokensFlat: Record<string, TokenMapEntry>,
): string[] {
  const results: string[] = [];
  for (const [path, entry] of Object.entries(allTokensFlat)) {
    if (hasDirectRef(entry.$value, targetPath)) results.push(path);
  }
  return results.sort();
}

export function computePaddingLeft(
  depth: number,
  condensedView: boolean,
  base: number,
): number {
  const effectiveDepth = condensedView
    ? Math.min(depth, CONDENSED_MAX_DEPTH)
    : depth;
  return effectiveDepth * INDENT_PER_LEVEL + base;
}

export function DepthBar({ depth }: { depth: number }) {
  if (depth === 0) return null;
  const color = DEPTH_COLORS[depth % DEPTH_COLORS.length] ?? DEPTH_COLORS[1];
  return (
    <span
      aria-hidden="true"
      className="absolute top-0 bottom-0 pointer-events-none"
      style={{ left: 0, width: 2, background: color, borderRadius: 1 }}
    />
  );
}

export function CondensedAncestorBreadcrumb({
  nodePath,
  nodeName,
  depth,
  condensedView,
}: {
  nodePath: string;
  nodeName: string;
  depth: number;
  condensedView: boolean;
}) {
  if (!condensedView || depth <= CONDENSED_MAX_DEPTH) return null;
  const parts = nodePath.split(".");
  const hiddenSegments = parts.slice(
    CONDENSED_MAX_DEPTH,
    parts.length - nodeName.split(".").length,
  );
  if (hiddenSegments.length === 0) return null;
  const label =
    hiddenSegments.length === 1
      ? hiddenSegments[0]
      : `…${hiddenSegments[hiddenSegments.length - 1]}`;
  const tooltip = `Hidden ancestors: ${hiddenSegments.join(" › ")}`;
  return (
    <span
      className={`shrink-0 ${BADGE_TEXT_CLASS} font-medium px-1 py-0.5 rounded bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-tertiary)] border border-[var(--color-figma-border)] leading-none`}
      title={tooltip}
      aria-label={`In: ${hiddenSegments.join(" › ")}`}
    >
      {label}
    </span>
  );
}

const RECIPE_RUN_AT_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function GeneratedGlyph({
  size = 8,
  strokeWidth = 1.5,
  className,
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="5" cy="2" r="1.5" />
      <circle cx="2" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <path d="M5 3.5V6M5 6L2 6.5M5 6L8 6.5" />
    </svg>
  );
}

function formatRecipeRunAt(lastRunAt?: string): string {
  if (!lastRunAt) return "Never run";
  const date = new Date(lastRunAt);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return RECIPE_RUN_AT_FORMATTER.format(date);
}

export function formatGeneratedGroupSummaryTitle(recipe: TokenRecipe): string {
  return [
    `Generated group: ${recipe.name}`,
    recipe.sourceToken ? `Source token: ${recipe.sourceToken}` : null,
    recipe.isStale ? "Source changed" : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function getRecipeManagedPaths(recipe: TokenRecipe): Set<string> {
  return new Set(
    getRecipeManagedOutputs(recipe).map((output) => output.path),
  );
}

function countManagedRecipeLeaves(
  node: TokenTreeNodeProps["node"],
  managedPaths: Set<string>,
): number {
  if (!node.children?.length) {
    return managedPaths.has(node.path) ? 1 : 0;
  }
  return node.children.reduce(
    (count, child) => count + countManagedRecipeLeaves(child, managedPaths),
    0,
  );
}

export function GeneratedGroupSummaryRow({
  depth,
  condensedView,
  recipe,
  collectionId,
  activeModeLabel,
  managedTokenCount,
  exceptionCount,
  previewTokens,
  running,
  keepUpdatedBusy,
  keepUpdatedDisabledReason,
  detaching,
  deleting = false,
  onRun,
  onEdit,
  onToggleKeepUpdated,
  onDuplicate,
  onDelete,
  onDetach,
  onNavigateToSourceToken,
}: {
  depth: number;
  condensedView: boolean;
  recipe: TokenRecipe;
  collectionId: string;
  activeModeLabel?: string | null;
  managedTokenCount: number;
  exceptionCount: number;
  previewTokens: GeneratedTokenResult[];
  running: boolean;
  keepUpdatedBusy: boolean;
  keepUpdatedDisabledReason?: string | null;
  detaching: boolean;
  deleting?: boolean;
  onRun?: () => Promise<void> | void;
  onEdit?: () => void;
  onToggleKeepUpdated?: (enabled: boolean) => Promise<void> | void;
  onDuplicate?: () => void;
  onDelete?: () => Promise<void> | void;
  onDetach?: () => Promise<void> | void;
  onNavigateToSourceToken?: (path: string) => void;
}) {
  const sourceLabel = recipe.sourceToken || "Standalone";
  const typeLabel = getGeneratedGroupTypeLabel(recipe.type);
  const keepUpdated = recipe.enabled !== false;
  const dashboardStatus = getRecipeDashboardStatus(recipe);
  const statusLabel = getStatusLabel(dashboardStatus, !keepUpdated);
  const lastRunLabel = formatRecipeRunAt(recipe.lastRunAt);
  const lastRunRelativeLabel = formatRelativeTimestamp(recipe.lastRunAt);
  const exceptionLabel =
    exceptionCount > 0
      ? `${exceptionCount} manual exception${exceptionCount === 1 ? "" : "s"}`
      : "No manual exceptions";
  const shouldNudgeExceptionCleanup = exceptionCount >= 3;
  const compactPreviewTokens = previewTokens.slice(0, 4);

  return (
    <div
      className="mx-2 mb-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-2"
      style={{
        marginLeft: `${computePaddingLeft(depth, condensedView, 24)}px`,
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)]">
            <span className="inline-flex items-center gap-1 font-medium text-[var(--color-figma-text)]">
              <GeneratedGlyph />
              <span>Generated</span>
            </span>
            <span aria-hidden="true" className="text-[var(--color-figma-text-tertiary)]/70">
              ·
            </span>
            <span className="truncate font-medium text-[var(--color-figma-text)]" title={recipe.name}>
              {recipe.name}
            </span>
            {recipe.isStale && (
              <span className="font-medium text-[var(--color-figma-warning)]">
                Source changed
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            <span>
              Collection{" "}
              <span className="font-mono text-[var(--color-figma-text)]">
                {collectionId}
              </span>
            </span>
            {activeModeLabel && (
              <span>
                Mode{" "}
                <span className="text-[var(--color-figma-text)]">
                  {activeModeLabel}
                </span>
              </span>
            )}
            <span>
              Source token{" "}
              {recipe.sourceToken && onNavigateToSourceToken ? (
                <button
                  type="button"
                  onClick={() =>
                    onNavigateToSourceToken(recipe.sourceToken!)
                  }
                  className="font-mono text-[var(--color-figma-accent)] hover:underline"
                  title={`Navigate to ${recipe.sourceToken}`}
                >
                  {sourceLabel}
                </button>
              ) : (
                <span className="font-mono text-[var(--color-figma-text)]">
                  {sourceLabel}
                </span>
              )}
            </span>
            <span>
              Status{" "}
              <span className="text-[var(--color-figma-text)]">
                {statusLabel}
              </span>
            </span>
            <span>
              Type{" "}
              <span className="text-[var(--color-figma-text)]">
                {typeLabel}
              </span>
            </span>
            <span>
              Keep updated{" "}
              <span className="text-[var(--color-figma-text)]">
                {keepUpdated ? "On" : "Off"}
              </span>
            </span>
            <span>
              {exceptionLabel}
            </span>
            <span>
              Last run{" "}
              <span className="text-[var(--color-figma-text)]">
                {lastRunRelativeLabel ? `${lastRunRelativeLabel} · ${lastRunLabel}` : lastRunLabel}
              </span>
            </span>
          </div>
          <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
            This generated group manages {managedTokenCount} token
            {managedTokenCount === 1 ? "" : "s"}. Edit the generator to change
            them, keep explicit exceptions when a few steps need to diverge, or
            detach the group if it should become fully manual.
          </p>
          {keepUpdatedDisabledReason && (
            <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[10px] text-[var(--color-figma-text-secondary)]">
              {keepUpdatedDisabledReason}
            </div>
          )}
          {shouldNudgeExceptionCleanup && (
            <div className="rounded border border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/10 px-2 py-1.5 text-[10px] text-[var(--color-figma-text)]">
              Manual exceptions are starting to pile up in this group. Edit the generator or detach tokens that should stay manual.
            </div>
          )}
          {compactPreviewTokens.length > 0 && (
            <CompactGeneratedPreview
              type={recipe.type}
              tokens={compactPreviewTokens}
              totalCount={previewTokens.length}
            />
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <button
            type="button"
            onClick={() => {
              void onRun?.();
            }}
            disabled={running || !onRun}
            className="px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? "Running…" : "Rerun now"}
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={!onEdit}
            className="px-2 py-1 rounded border border-[var(--color-figma-border)] text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Edit generator
          </button>
          <button
            type="button"
            onClick={() => {
              void onToggleKeepUpdated?.(!keepUpdated);
            }}
            disabled={keepUpdatedBusy || !onToggleKeepUpdated || Boolean(keepUpdatedDisabledReason)}
            title={keepUpdatedDisabledReason ?? undefined}
            className="px-2 py-1 rounded border border-[var(--color-figma-border)] text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {keepUpdatedBusy
              ? "Updating…"
              : keepUpdatedDisabledReason
                ? "Updates unavailable"
              : keepUpdated
                ? "Turn off updates"
                : "Keep updated"}
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            disabled={!onDuplicate}
            className="px-2 py-1 rounded border border-[var(--color-figma-border)] text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => {
              void onDelete?.();
            }}
            disabled={deleting || !onDelete}
            className="px-2 py-1 rounded border border-[var(--color-figma-error)]/30 text-[10px] font-medium text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <button
            type="button"
            onClick={() => {
              void onDetach?.();
            }}
            disabled={detaching || !onDetach}
            className="px-2 py-1 rounded border border-[var(--color-figma-border)] text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {detaching ? "Detaching…" : "Detach from generator"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompactGeneratedPreview({
  type,
  tokens,
  totalCount,
}: {
  type: RecipeType;
  tokens: GeneratedTokenResult[];
  totalCount: number;
}) {
  return (
    <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-[var(--color-figma-text-secondary)]">
        <span>Preview</span>
        <span>
          {totalCount} token{totalCount === 1 ? "" : "s"}
        </span>
      </div>
      {type === "colorRamp" ? (
        <div className="flex items-center gap-1">
          {tokens.map((token) => {
            const value = typeof token.value === "string" ? token.value : null;
            return (
              <div
                key={token.path}
                className="flex min-w-0 flex-1 flex-col gap-1"
              >
                <div
                  className="h-4 rounded border border-[var(--color-figma-border)]"
                  style={{ background: value ?? "var(--color-figma-bg-secondary)" }}
                  title={`${token.stepName}: ${formatValue(token.value)}`}
                />
                <div className="truncate text-[9px] text-[var(--color-figma-text-secondary)]">
                  {token.stepName}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {tokens.map((token) => (
            <div key={token.path} className="flex items-center gap-2 text-[10px]">
              <span className="min-w-0 flex-1 truncate font-mono text-[var(--color-figma-text)]">
                {token.path}
              </span>
              <span className="truncate text-[var(--color-figma-text-secondary)]">
                {formatValue(token.value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type MenuPosition = { x: number; y: number };

export const MENU_SURFACE_CLASS =
  "fixed z-50 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg py-1";
export const MENU_ITEM_CLASS =
  "w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors";
export const MENU_DANGER_ITEM_CLASS =
  "w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 transition-colors";
export const MENU_SEPARATOR_CLASS =
  "h-px mx-2 my-1 bg-[var(--color-figma-border)]";
export const MENU_SHORTCUT_CLASS =
  "ml-auto text-[10px] text-[var(--color-figma-text-tertiary)]";

export function clampMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): MenuPosition {
  return {
    x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
  };
}

export function getQuickGeneratedGroupTypeForToken(
  path: string,
  name: string,
  tokenType: string | undefined,
  tokenValue: unknown,
): RecipeType | null {
  return getSingleObviousRecipeType(tokenType, path, name, tokenValue) ?? null;
}

export function getQuickGeneratedGroupActionLabel(type: RecipeType): string {
  switch (type) {
    case "colorRamp":
      return "Generate palette…";
    case "typeScale":
      return "Generate type scale…";
    case "spacingScale":
      return "Generate spacing scale…";
    case "opacityScale":
      return "Generate opacity scale…";
    case "borderRadiusScale":
      return "Generate radius scale…";
    default:
      return `Generate ${getGeneratedGroupTypeLabel(type).toLowerCase()}…`;
  }
}

type TokenRowStatus =
  | { kind: "lint"; label: string; title: string; toneClass: string }
  | { kind: "applied"; label: string; title: string; toneClass: string }
  | { kind: "sync"; label: string; title: string; toneClass: string }
  | { kind: "duplicate"; label: string; title: string; toneClass: string }
  | null;

export type TokenRowBrowseMeta =
  | {
      kind: "alias";
      compactLabel: string;
      expandedLabel: string;
      title: string;
      toneClass: string;
      interactive: boolean;
      onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
    }
  | {
      kind: "recipe";
      compactLabel: string;
      expandedLabel: string;
      title: string;
      toneClass: string;
      interactive?: boolean;
      onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
    };

function getCompactPathLabel(path: string): string {
  const segments = path.split(".");
  if (segments.length <= 2) return path;
  return `${segments[segments.length - 2]}.${segments[segments.length - 1]}`;
}

export function TokenRowBrowseMetaBadge({
  meta,
  expanded,
}: {
  meta: TokenRowBrowseMeta;
  expanded: boolean;
}) {
  const label = expanded ? meta.expandedLabel : meta.compactLabel;
  const content = (
    <>
      {meta.kind === "alias" ? (
        <svg
          width="8"
          height="8"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0"
        >
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
        </svg>
      ) : (
        <GeneratedGlyph size={8} className="shrink-0" />
      )}
      <span
        className={`truncate ${expanded ? "max-w-[140px]" : "max-w-[88px]"}`}
      >
        {label}
      </span>
    </>
  );

  const className = [
    "inline-flex",
    "min-w-0",
    "shrink",
    "items-center",
    "gap-1",
    "rounded",
    "border",
    "border-[var(--color-figma-border)]",
    "bg-[var(--color-figma-bg-secondary)]",
    "px-1.5",
    "py-0.5",
    BADGE_TEXT_CLASS,
    meta.toneClass,
  ].join(" ");

  if (meta.kind === "alias") {
    return (
      <button
        type="button"
        onClick={meta.onClick}
        disabled={!meta.interactive}
        title={meta.title}
        className={`${className} ${meta.interactive ? "transition-colors hover:border-current/40 hover:bg-[var(--color-figma-bg-hover)]" : "cursor-default"}`}
      >
        {content}
      </button>
    );
  }

  if (meta.kind === "recipe" && meta.interactive && meta.onClick) {
    return (
      <button
        type="button"
        onClick={meta.onClick}
        title={meta.title}
        className={`${className} transition-colors hover:border-current/40 hover:bg-[var(--color-figma-bg-hover)]`}
      >
        {content}
      </button>
    );
  }

  return (
    <span title={meta.title} className={className}>
      {content}
    </span>
  );
}

function getLintSeverityRank(severity: "error" | "warning" | "info"): number {
  if (severity === "error") return 3;
  if (severity === "warning") return 2;
  return 1;
}

export function getTokenRowStatus(props: {
  lintViolations: NonNullable<TokenTreeNodeProps["lintViolations"]>;
  quickBound: string | null;
  syncChanged: boolean;
  duplicateCount: number;
}): TokenRowStatus {
  const { lintViolations, quickBound, syncChanged, duplicateCount } = props;
  if (lintViolations.length > 0) {
    const worst = lintViolations.reduce<"error" | "warning" | "info">(
      (currentWorst, violation) =>
        getLintSeverityRank(violation.severity) >
        getLintSeverityRank(currentWorst)
          ? violation.severity
          : currentWorst,
      "info",
    );
    const issueCount = lintViolations.length;
    return {
      kind: "lint",
      label: issueCount === 1 ? "Issue" : `${issueCount} issues`,
      title: lintViolations
        .map(
          (violation) =>
            `${violation.severity}: ${violation.message}${violation.suggestion ? `\nSuggestion: ${violation.suggestion}` : ""}`,
        )
        .join("\n"),
      toneClass:
        worst === "error"
          ? "text-[var(--color-figma-error)]"
          : worst === "warning"
            ? "text-[var(--color-figma-warning)]"
            : "text-[var(--color-figma-text-tertiary)]",
    };
  }
  if (quickBound) {
    return {
      kind: "applied",
      label: quickBound,
      title: `Bound to ${quickBound}`,
      toneClass: "text-[var(--color-figma-success)]",
    };
  }
  if (syncChanged) {
    return {
      kind: "sync",
      label: "Unsynced",
      title: "Changed locally since last sync",
      toneClass: "text-[var(--color-figma-warning)]",
    };
  }
  if (duplicateCount > 1) {
    return {
      kind: "duplicate",
      label: `${duplicateCount} same`,
      title: `${duplicateCount} tokens share this value`,
      toneClass: "text-[var(--color-figma-accent)]",
    };
  }
  return null;
}

export function getBrowseMetaForReference(
  aliasPath: string,
  expanded: boolean,
  interactive: boolean,
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void,
) {
  return {
    kind: "alias" as const,
    compactLabel: getCompactPathLabel(aliasPath),
    expandedLabel: aliasPath,
    title: `Alias reference: ${aliasPath}`,
    toneClass: expanded
      ? "text-[var(--color-figma-accent)]"
      : "text-[var(--color-figma-text-secondary)]",
    interactive,
    onClick,
  };
}

export function getBrowseMetaForGeneratedGroup(sourceToken: string, expanded: boolean) {
  return {
    kind: "recipe" as const,
    compactLabel: getCompactPathLabel(sourceToken),
    expandedLabel: sourceToken,
    title: `Generated from ${sourceToken}`,
    toneClass: expanded
      ? "text-[var(--color-figma-accent)]"
      : "text-[var(--color-figma-text-secondary)]",
  };
}

export function getManagedRecipeLeafCount(
  node: TokenTreeNodeProps["node"],
  recipe: TokenRecipe,
) {
  return countManagedRecipeLeaves(node, getRecipeManagedPaths(recipe));
}
