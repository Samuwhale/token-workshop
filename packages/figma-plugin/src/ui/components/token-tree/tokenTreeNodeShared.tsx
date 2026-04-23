import { useState, useEffect, useRef } from "react";
import type { MouseEvent } from "react";
import { getGeneratorManagedOutputs } from "@tokenmanager/core";
import type { TokenMapEntry } from "../../../shared/types";
import { extractAliasPath } from "../../../shared/resolveAlias";
import type {
  GeneratedTokenResult,
  GeneratorType,
  TokenGenerator,
} from "../../hooks/useGenerators";
import { getGeneratorDashboardStatus } from "../../hooks/useGenerators";
import {
  getGeneratedGroupTypeLabel,
  getStatusLabel,
} from "../../shared/generatedGroupUtils";
import {
  getSingleObviousGeneratorType,
} from "../generators/generatorUtils";
import { formatValue } from "../generators/generatorShared";
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

export function formatGeneratedGroupSummaryTitle(generator: TokenGenerator): string {
  return [
    `Generated group: ${generator.name}`,
    generator.sourceToken ? `Source token: ${generator.sourceToken}` : null,
    generator.isStale ? "Source changed" : null,
  ]
    .filter(Boolean)
    .join("\n");
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

export function GeneratedGroupSummaryRow({
  depth,
  generator,
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
  generator: TokenGenerator;
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
  const sourceLabel = generator.sourceToken || "Standalone";
  const typeLabel = getGeneratedGroupTypeLabel(generator.type);
  const keepUpdated = generator.enabled !== false;
  const dashboardStatus = getGeneratorDashboardStatus(generator);
  const statusLabel = getStatusLabel(dashboardStatus, !keepUpdated);
  const exceptionLabel =
    exceptionCount > 0
      ? `${exceptionCount} manual exception${exceptionCount === 1 ? "" : "s"}`
      : null;
  const shouldNudgeExceptionCleanup = exceptionCount >= 3;
  const compactPreviewTokens = previewTokens.slice(0, 4);

  return (
    <div
      className="mb-0.5 rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5"
      style={{
        paddingLeft: `${computePaddingLeft(depth, 24)}px`,
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 text-secondary text-[var(--color-figma-text-secondary)]">
            <span className="inline-flex items-center gap-1 font-medium text-[var(--color-figma-text)]">
              <GeneratedGlyph />
              <span>Generated</span>
            </span>
            <span aria-hidden="true" className="text-[var(--color-figma-text-tertiary)]/70">
              ·
            </span>
            <span className="truncate font-medium text-[var(--color-figma-text)]" title={generator.name}>
              {generator.name}
            </span>
            {generator.isStale && (
              <span className="font-medium text-[var(--color-figma-warning)]">
                Source changed
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-secondary text-[var(--color-figma-text-secondary)]">
            <span>
              Source{" "}
              {generator.sourceToken && onNavigateToSourceToken ? (
                <button
                  type="button"
                  onClick={() =>
                    onNavigateToSourceToken(generator.sourceToken!)
                  }
                  className="font-mono text-[var(--color-figma-accent)] hover:underline"
                  title={`Navigate to ${generator.sourceToken}`}
                >
                  {sourceLabel}
                </button>
              ) : (
                <span className="font-mono text-[var(--color-figma-text)]">
                  {sourceLabel}
                </span>
              )}
            </span>
            {statusLabel !== "Up to date" && (
              <span>
                Status{" "}
                <span className="text-[var(--color-figma-text)]">
                  {statusLabel}
                </span>
              </span>
            )}
            {exceptionCount > 0 && (
              <span>{exceptionLabel}</span>
            )}
          </div>
          {keepUpdatedDisabledReason && (
            <div className="text-secondary text-[var(--color-figma-text-tertiary)]">
              {keepUpdatedDisabledReason}
            </div>
          )}
          {shouldNudgeExceptionCleanup && (
            <div className="text-secondary text-[var(--color-figma-warning)]">
              Manual exceptions are piling up. Edit the generator or detach tokens that should stay manual.
            </div>
          )}
          {compactPreviewTokens.length > 0 && (
            <CompactGeneratedPreview
              type={generator.type}
              tokens={compactPreviewTokens}
              totalCount={previewTokens.length}
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {generator.isStale && (
            <button
              type="button"
              onClick={() => { void onRun?.(); }}
              disabled={running || !onRun}
              className="px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white text-secondary font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {running ? "Running\u2026" : "Rerun"}
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            disabled={!onEdit}
            className="px-2 py-1 rounded border border-[var(--color-figma-border)] text-secondary font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Edit {typeLabel.toLowerCase()}
          </button>
          <SummaryOverflowMenu
            typeLabel={typeLabel}
            keepUpdated={keepUpdated}
            keepUpdatedBusy={keepUpdatedBusy}
            keepUpdatedDisabledReason={keepUpdatedDisabledReason}
            onToggleKeepUpdated={onToggleKeepUpdated}
            onDuplicate={onDuplicate}
            onDetach={onDetach}
            detaching={detaching}
            onDelete={onDelete}
            deleting={deleting}
          />
        </div>
      </div>
    </div>
  );
}

function SummaryOverflowMenu({
  typeLabel,
  keepUpdated,
  keepUpdatedBusy,
  keepUpdatedDisabledReason,
  onToggleKeepUpdated,
  onDuplicate,
  onDetach,
  detaching,
  onDelete,
  deleting,
}: {
  typeLabel: string;
  keepUpdated: boolean;
  keepUpdatedBusy: boolean;
  keepUpdatedDisabledReason?: string | null;
  onToggleKeepUpdated?: (enabled: boolean) => Promise<void> | void;
  onDuplicate?: () => void;
  onDetach?: () => Promise<void> | void;
  detaching: boolean;
  onDelete?: () => Promise<void> | void;
  deleting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: globalThis.MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-[24px] w-[24px] items-center justify-center rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
        aria-label="More actions"
      >
        <svg width="12" height="12" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
          <circle cx="2" cy="5" r="1" />
          <circle cx="5" cy="5" r="1" />
          <circle cx="8" cy="5" r="1" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-0.5 shadow-lg">
          <button
            type="button"
            onClick={() => { void onToggleKeepUpdated?.(!keepUpdated); setOpen(false); }}
            disabled={keepUpdatedBusy || !onToggleKeepUpdated || Boolean(keepUpdatedDisabledReason)}
            title={keepUpdatedDisabledReason ?? undefined}
            className="flex w-full items-center px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {keepUpdatedBusy ? "Updating\u2026" : keepUpdated ? "Turn off updates" : "Keep updated"}
          </button>
          <button
            type="button"
            onClick={() => { onDuplicate?.(); setOpen(false); }}
            disabled={!onDuplicate}
            className="flex w-full items-center px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create from this generator
          </button>
          <button
            type="button"
            onClick={() => { void onDetach?.(); setOpen(false); }}
            disabled={detaching || !onDetach}
            className="flex w-full items-center px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {detaching ? "Detaching\u2026" : "Detach"}
          </button>
          <div className="h-1" aria-hidden />
          <button
            type="button"
            onClick={() => { void onDelete?.(); setOpen(false); }}
            disabled={deleting || !onDelete}
            className="flex w-full items-center px-2.5 py-1.5 text-left text-secondary text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? "Deleting\u2026" : `Delete ${typeLabel.toLowerCase()}`}
          </button>
        </div>
      )}
    </div>
  );
}

function CompactGeneratedPreview({
  type,
  tokens,
  totalCount,
}: {
  type: GeneratorType;
  tokens: GeneratedTokenResult[];
  totalCount: number;
}) {
  return (
    <div className="mt-0.5">
      <div className="mb-1 flex items-center justify-between gap-2 text-secondary text-[var(--color-figma-text-tertiary)]">
        <span>{totalCount} token{totalCount === 1 ? "" : "s"}</span>
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
                <div className="truncate text-micro text-[var(--color-figma-text-secondary)]">
                  {token.stepName}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {tokens.map((token) => (
            <div key={token.path} className="flex items-center gap-2 text-secondary">
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

export function getQuickGeneratedGroupTypeForToken(
  path: string,
  name: string,
  tokenType: string | undefined,
  tokenValue: unknown,
): GeneratorType | null {
  return getSingleObviousGeneratorType(tokenType, path, name, tokenValue) ?? null;
}

export function getQuickGeneratedGroupActionLabel(type: GeneratorType): string {
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
      kind: "generator";
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
        <GeneratedGlyph size={10} className="shrink-0" />
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

  if (meta.kind === "generator" && meta.interactive && meta.onClick) {
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

export function getBrowseMetaForGeneratedGroup(sourceToken: string, expanded: boolean) {
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
