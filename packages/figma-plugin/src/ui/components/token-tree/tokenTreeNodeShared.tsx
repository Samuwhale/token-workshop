import type { MouseEvent } from "react";
import { getGeneratorManagedOutputs } from "@tokenmanager/core";
import type { TokenMapEntry } from "../../../shared/types";
import { extractAliasPath } from "../../../shared/resolveAlias";
import type { GeneratorType, TokenGenerator } from "../../hooks/useGenerators";
import { getGeneratorTypeLabel } from "../GeneratorPipelineCard";
import { detectGeneratorType } from "../generators/generatorUtils";
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
      style={{ left: 4, width: 2, background: color, borderRadius: 1 }}
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

const GENERATOR_RUN_AT_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function GeneratorGlyph({
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

function formatGeneratorRunAt(lastRunAt?: string): string {
  if (!lastRunAt) return "Never run";
  const date = new Date(lastRunAt);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return GENERATOR_RUN_AT_FORMATTER.format(date);
}

function getGeneratorManagedPaths(generator: TokenGenerator): Set<string> {
  return new Set(
    getGeneratorManagedOutputs(generator).map((output) => output.path),
  );
}

function countManagedGeneratorLeaves(
  node: TokenTreeNodeProps["node"],
  managedPaths: Set<string>,
): number {
  if (!node.children?.length) {
    return managedPaths.has(node.path) ? 1 : 0;
  }
  return node.children.reduce(
    (count, child) => count + countManagedGeneratorLeaves(child, managedPaths),
    0,
  );
}

export function GeneratorSummaryRow({
  depth,
  condensedView,
  generator,
  managedTokenCount,
  running,
  detaching,
  onRun,
  onEdit,
  onDetach,
}: {
  depth: number;
  condensedView: boolean;
  generator: TokenGenerator;
  managedTokenCount: number;
  running: boolean;
  detaching: boolean;
  onRun?: () => Promise<void> | void;
  onEdit?: () => void;
  onDetach?: () => Promise<void> | void;
}) {
  const sourceLabel = generator.sourceToken || "standalone";
  const typeLabel = getGeneratorTypeLabel(generator.type);
  const lastRunLabel = formatGeneratorRunAt(generator.lastRunAt);

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
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-figma-bg)] px-1.5 py-0.5 font-medium text-[var(--color-figma-text)]">
              <GeneratorGlyph />
              Generator
            </span>
            {generator.isStale && (
              <span className="rounded-full border border-amber-500/60 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-600">
                Source changed
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            <span>
              Source{" "}
              <span className="font-mono text-[var(--color-figma-text)]">
                {sourceLabel}
              </span>
            </span>
            <span>
              Type{" "}
              <span className="text-[var(--color-figma-text)]">
                {typeLabel}
              </span>
            </span>
            <span>
              Last run{" "}
              <span className="text-[var(--color-figma-text)]">
                {lastRunLabel}
              </span>
            </span>
          </div>
          <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
            These {managedTokenCount} token
            {managedTokenCount === 1 ? "" : "s"} are managed by this
            generator. Edit the generator to change them, or detach them first
            to make manual edits stick.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              void onRun?.();
            }}
            disabled={running || !onRun}
            className="px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? "Running…" : "Re-run"}
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={!onEdit}
            className="px-2 py-1 rounded border border-[var(--color-figma-border)] text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              void onDetach?.();
            }}
            disabled={detaching || !onDetach}
            className="px-2 py-1 rounded border border-[var(--color-figma-border)] text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {detaching ? "Detaching…" : "Detach group"}
          </button>
        </div>
      </div>
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

export function getQuickGeneratorTypeForToken(
  path: string,
  name: string,
  tokenType: string | undefined,
  tokenValue: unknown,
): GeneratorType | null {
  if (!tokenType) return null;
  if (tokenType === "color") return "colorRamp";
  if (tokenType === "fontSize") return "typeScale";
  if (tokenType === "dimension") {
    const label = `${path}.${name}`.toLowerCase();
    if (/(font|type|text|heading|body|display|title)/.test(label))
      return "typeScale";
    if (/(space|spacing|gap|padding|margin|inset|offset)/.test(label))
      return "spacingScale";
  }
  if (tokenType === "dimension" || tokenType === "number") {
    return detectGeneratorType(tokenType, tokenValue);
  }
  return null;
}

export function getQuickGeneratorActionLabel(type: GeneratorType): string {
  switch (type) {
    case "colorRamp":
      return "Create color palette…";
    case "typeScale":
      return "Create type scale…";
    case "spacingScale":
      return "Create spacing scale…";
    case "opacityScale":
      return "Create opacity scale…";
    case "borderRadiusScale":
      return "Create radius scale…";
    default:
      return `Create ${getGeneratorTypeLabel(type).toLowerCase()}…`;
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
      kind: "generator";
      compactLabel: string;
      expandedLabel: string;
      title: string;
      toneClass: string;
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
        <GeneratorGlyph size={8} className="shrink-0" />
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

export function getBrowseMetaForGenerator(sourceToken: string, expanded: boolean) {
  return {
    kind: "generator" as const,
    compactLabel: getCompactPathLabel(sourceToken),
    expandedLabel: sourceToken,
    title: `Generated from ${sourceToken}`,
    toneClass: expanded
      ? "text-[var(--color-figma-accent)]"
      : "text-[var(--color-figma-text-secondary)]",
  };
}

export function getManagedGeneratorLeafCount(
  node: TokenTreeNodeProps["node"],
  generator: TokenGenerator,
) {
  return countManagedGeneratorLeaves(node, getGeneratorManagedPaths(generator));
}
