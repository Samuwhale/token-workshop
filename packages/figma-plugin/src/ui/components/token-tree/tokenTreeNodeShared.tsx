import type { MouseEvent } from "react";
import type { TokenMapEntry } from "../../../shared/types";
import { extractAliasPath } from "../../../shared/resolveAlias";
import type { TokenTreeNodeProps } from "../tokenListTypes";
import {
  DEPTH_GUIDE_COLOR,
  INDENT_PER_LEVEL,
} from "../tokenListTypes";

export const EMPTY_LINT_VIOLATIONS: NonNullable<
  TokenTreeNodeProps["lintViolations"]
> = [];

export const BADGE_TEXT_CLASS = "text-secondary";
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

export function computePaddingLeft(depth: number, base: number): number {
  return depth * INDENT_PER_LEVEL + base;
}

export function DepthBar({ depth }: { depth: number }) {
  if (depth === 0) return null;
  return (
    <span
      aria-hidden="true"
      className="absolute top-0 bottom-0 pointer-events-none"
      style={{ left: 0, width: 1, background: DEPTH_GUIDE_COLOR }}
    />
  );
}

/** Glyph for tokens that carry a `derivation` extension. */
export function DerivationGlyph({
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
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M5 1.5L8.5 5L5 8.5L1.5 5Z" />
      <path d="M3 5h4" />
    </svg>
  );
}

export type MenuPosition = { x: number; y: number };

export const MENU_SURFACE_CLASS =
  "fixed z-50 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg py-1";
export const MENU_ITEM_CLASS =
  "w-full flex items-center gap-2 px-2.5 py-1.5 text-body text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors";
export const MENU_DANGER_ITEM_CLASS =
  "w-full flex items-center gap-2 px-2.5 py-1.5 text-body text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 transition-colors";
export const MENU_SEPARATOR_CLASS =
  "h-px mx-2 my-1 bg-[var(--color-figma-border)]";
export const MENU_SHORTCUT_CLASS =
  "ml-auto text-secondary text-[var(--color-figma-text-tertiary)]";

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

type TokenRowStatus =
  | { kind: "lint"; label: string; title: string; toneClass: string; lintSeverity: "error" | "warning" | "info" }
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
      kind: "derivation";
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
  const glyph =
    meta.kind === "alias" ? (
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
      </svg>
    ) : (
      <DerivationGlyph size={10} className="shrink-0" />
    );
  const content = (
    <>
      {glyph}
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
        className={`${className} ${meta.interactive ? "transition-colors hover:text-[var(--color-figma-accent)]" : "cursor-default"}`}
      >
        {content}
      </button>
    );
  }

  if (meta.kind === "derivation" && meta.interactive && meta.onClick) {
    return (
      <button
        type="button"
        onClick={meta.onClick}
        title={meta.title}
        className={`${className} transition-colors hover:text-[var(--color-figma-accent)]`}
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
      lintSeverity: worst,
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
      label: "Unpublished",
      title: "Changed since last publish",
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

/**
 * Browse-meta factory for tokens that carry a `derivation` extension.
 * Per the design brief: a derivation row reads as a derivation, NOT as an alias —
 * callers should prefer this over `getBrowseMetaForReference` whenever the token
 * has a `$extensions.tokenmanager.derivation` field, even though the underlying
 * `$value` is also an alias.
 */
export function getBrowseMetaForDerivation(
  sourceToken: string,
  expanded: boolean,
  interactive: boolean = false,
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void,
) {
  return {
    kind: "derivation" as const,
    compactLabel: getCompactPathLabel(sourceToken),
    expandedLabel: sourceToken,
    title: `Modified from ${sourceToken}`,
    toneClass: expanded
      ? "text-[var(--color-figma-accent)]"
      : "text-[var(--color-figma-text-secondary)]",
    interactive,
    onClick,
  };
}
