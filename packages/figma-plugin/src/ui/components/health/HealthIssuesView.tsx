import { useEffect, useMemo, useState } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import type { ValidationIssue } from "../../hooks/useValidationCache";
import { severityStyles } from "../../shared/noticeSystem";
import type { NoticeSeverity } from "../../shared/noticeSystem";
import { useDropdownMenu } from "../../hooks/useDropdownMenu";
import { dispatchToast } from "../../shared/toastBus";
import { downloadBlob } from "../../shared/utils";
import { FLOATING_MENU_CLASS } from "../../shared/menuClasses";
import { Spinner } from "../Spinner";
import { getRuleLabel, hasFix, fixLabel, suppressKey } from "../../shared/ruleLabels";
import { getCollectionDisplayName } from "../../shared/libraryCollections";
import { HealthSubViewHeader } from "./HealthSubViewHeader";
import {
  FeedbackPlaceholder,
  type FeedbackPlaceholderAction,
} from "../FeedbackPlaceholder";
import { MenuRadioGroup } from "../../primitives";

const ISSUES_PER_PAGE = 20;

export interface HealthIssuesViewProps {
  validationIssues: ValidationIssue[];
  validationLastRefreshed: Date | null;
  collectionDisplayNames?: Record<string, string>;
  suppressedKeys: Set<string>;
  fixingKeys: Set<string>;
  onFix: (issue: ValidationIssue) => void;
  onIgnore: (issue: ValidationIssue) => void;
  onNavigateToToken?: (path: string, collectionId: string) => void;
  onViewIssueInGenerator?: (issue: ValidationIssue) => void;
  initialTokenPath?: string | null;
  selectedIssueKey?: string | null;
  selectedTokenPath?: string | null;
  requestNonce?: number;
  onSelectIssue?: (issue: ValidationIssue) => void;
  onBack: () => void;
}

export function HealthIssuesView({
  validationIssues,
  validationLastRefreshed,
  collectionDisplayNames,
  suppressedKeys,
  fixingKeys,
  onFix,
  onIgnore,
  onNavigateToToken,
  onViewIssueInGenerator,
  initialTokenPath = null,
  selectedIssueKey = null,
  selectedTokenPath = null,
  requestNonce,
  onSelectIssue,
  onBack,
}: HealthIssuesViewProps) {
  const [severityFilter, setSeverityFilter] = useState<"all" | "error" | "warning" | "info">("all");
  const [tokenPathFilter, setTokenPathFilter] = useState<string | null>(initialTokenPath);
  const [collapsedRules, setCollapsedRules] = useState<Set<string>>(new Set());
  const [issueGroupVisibleCounts, setIssueGroupVisibleCounts] = useState<Record<string, number>>({});
  const severityMenu = useDropdownMenu();
  const exportMenu = useDropdownMenu();

  useEffect(() => {
    setTokenPathFilter(initialTokenPath);
    setSeverityFilter("all");
    setCollapsedRules(new Set());
    setIssueGroupVisibleCounts({});
  }, [initialTokenPath, requestNonce]);

  const activeIssues = validationIssues.filter(
    (i) =>
      i.rule !== "no-duplicate-values" &&
      i.rule !== "alias-opportunity" &&
      !suppressedKeys.has(suppressKey(i)),
  );

  const scopedIssues = tokenPathFilter
    ? activeIssues.filter((issue) => issue.path === tokenPathFilter)
    : activeIssues;
  const filteredIssues =
    severityFilter === "all"
      ? [...scopedIssues].sort((a, b) => {
          const order = { error: 0, warning: 1, info: 2 } as const;
          return order[a.severity] - order[b.severity];
        })
      : scopedIssues.filter((i) => i.severity === severityFilter);
  const exportIssues = filteredIssues;
  const severityCounts = useMemo(
    () => ({
      all: scopedIssues.length,
      error: scopedIssues.filter((issue) => issue.severity === "error").length,
      warning: scopedIssues.filter((issue) => issue.severity === "warning").length,
      info: scopedIssues.filter((issue) => issue.severity === "info").length,
    }),
    [scopedIssues],
  );
  const severityLabel =
    severityFilter === "all"
      ? "All severities"
      : severityFilter === "error"
        ? "Errors"
        : severityFilter === "warning"
          ? "Warnings"
          : "Info";
  const filterSummary = tokenPathFilter
    ? `Showing issues for ${tokenPathFilter}.`
    : severityFilter === "all"
      ? "Showing all visible review issues."
      : `Showing ${severityLabel.toLowerCase()} only.`;

  const issueGroups = (() => {
    if (filteredIssues.length === 0) return [];
    const map = new Map<string, ValidationIssue[]>();
    for (const issue of filteredIssues) {
      const list = map.get(issue.rule) ?? [];
      list.push(issue);
      map.set(issue.rule, list);
    }
    const severityOrder = { error: 0, warning: 1, info: 2 } as const;
    return [...map.entries()]
      .map(([rule, issues]) => {
        const meta = getRuleLabel(rule);
        const worst = issues.reduce((a, b) =>
          severityOrder[a.severity] <= severityOrder[b.severity] ? a : b,
        );
        return { rule, label: meta.label, tip: meta.tip, severity: worst.severity, issues };
      })
      .sort(
        (a, b) =>
          severityOrder[a.severity] - severityOrder[b.severity] ||
          b.issues.length - a.issues.length,
      );
  })();

  const copyMarkdown = () => {
    const lines: string[] = [
      `# Review Report — ${exportIssues.length} issue${exportIssues.length !== 1 ? "s" : ""}\n`,
    ];
    for (const sev of ["error", "warning", "info"] as const) {
      const group = exportIssues.filter((i) => i.severity === sev);
      if (group.length === 0) continue;
      lines.push(`## ${sev.charAt(0).toUpperCase() + sev.slice(1)}s (${group.length})`);
      for (const issue of group) {
        lines.push(`- **${issue.path}** (${getCollectionDisplayName(issue.collectionId, collectionDisplayNames)}): ${issue.message}${issue.suggestedFix ? ` — Fix: ${issue.suggestedFix}` : ""}`);
      }
      lines.push("");
    }
    navigator.clipboard.writeText(lines.join("\n")).then(() => dispatchToast("Copied as Markdown", "success"));
    exportMenu.close();
  };

  const exportJson = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      total: exportIssues.length,
      issues: exportIssues.map((i) => ({
        severity: i.severity,
        rule: i.rule,
        collectionId: i.collectionId,
        path: i.path,
        message: i.message,
        ...(i.suggestedFix ? { suggestedFix: i.suggestedFix } : {}),
      })),
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      "review-report.json",
    );
    dispatchToast("Exported JSON", "success");
    exportMenu.close();
  };

  const exportCsv = () => {
    const header = "severity,rule,collectionId,path,message,suggestedFix";
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = exportIssues.map((i) =>
      [i.severity, i.rule, i.collectionId, i.path, i.message, i.suggestedFix ?? ""].map(escape).join(","),
    );
    downloadBlob(
      new Blob([[header, ...rows].join("\n")], { type: "text/csv" }),
      "review-report.csv",
    );
    dispatchToast("Exported CSV", "success");
    exportMenu.close();
  };

  const emptyStateActions: FeedbackPlaceholderAction[] = [
    ...(tokenPathFilter
      ? [{
          label: "Clear token filter",
          onClick: () => setTokenPathFilter(null),
        } satisfies FeedbackPlaceholderAction]
      : []),
    ...(severityFilter !== "all"
      ? [{
          label: "Show all severities",
          onClick: () => setSeverityFilter("all"),
          tone: tokenPathFilter ? "secondary" : "primary",
        } satisfies FeedbackPlaceholderAction]
      : []),
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <HealthSubViewHeader
        title="Issues"
        onBack={onBack}
        count={tokenPathFilter ? null : lastRefreshedLabel(validationLastRefreshed)}
      />
      <div className="shrink-0 border-b border-[var(--border-muted)] px-3 py-2">
        <div className="tm-responsive-toolbar">
          <div className="tm-responsive-toolbar__row">
            <div className="tm-responsive-toolbar__leading">
              <p className="min-w-0 break-words [overflow-wrap:anywhere] text-secondary text-[color:var(--color-figma-text-secondary)]">
                {filterSummary}
              </p>
            </div>
            <div className="tm-responsive-toolbar__actions">
              {tokenPathFilter ? (
                <button
                  type="button"
                  onClick={() => setTokenPathFilter(null)}
                  className="rounded px-2 py-1 text-secondary font-medium text-[color:var(--color-figma-text-accent)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                >
                  Clear token filter
                </button>
              ) : null}
              <div className="relative">
                <button
                  type="button"
                  ref={severityMenu.triggerRef}
                  onClick={severityMenu.toggle}
                  className={`inline-flex min-h-7 items-center gap-1 rounded px-2 text-secondary transition-colors ${
                    severityFilter === "all"
                      ? "text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                      : `${severityStyles((severityFilter as NoticeSeverity)).pill} font-medium`
                  }`}
                  aria-haspopup="menu"
                  aria-expanded={severityMenu.open}
                >
                  <span className="truncate">Severity: {severityLabel}</span>
                  <ChevronDown size={12} strokeWidth={1.5} aria-hidden />
                </button>
                {severityMenu.open ? (
                  <div
                    ref={severityMenu.menuRef}
                    className={FLOATING_MENU_CLASS}
                    role="menu"
                  >
                    <MenuRadioGroup
                      label="Severity"
                      value={severityFilter}
                      onChange={(value) =>
                        setSeverityFilter(
                          value as "all" | "error" | "warning" | "info",
                        )
                      }
                      onSelect={() => severityMenu.close({ restoreFocus: false })}
                      options={[
                        { value: "all", label: `All (${severityCounts.all})` },
                        { value: "error", label: `Errors (${severityCounts.error})` },
                        { value: "warning", label: `Warnings (${severityCounts.warning})` },
                        { value: "info", label: `Info (${severityCounts.info})` },
                      ]}
                    />
                  </div>
                ) : null}
              </div>
              <div className="relative">
                <button
                  type="button"
                  ref={exportMenu.triggerRef}
                  onClick={exportMenu.toggle}
                  className="inline-flex min-h-7 items-center gap-1 rounded px-2 text-secondary text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                  aria-haspopup="menu"
                  aria-expanded={exportMenu.open}
                >
                  <MoreHorizontal size={12} strokeWidth={1.5} aria-hidden />
                  <span>Report</span>
                </button>
                {exportMenu.open ? (
                  <div
                    ref={exportMenu.menuRef}
                    className={FLOATING_MENU_CLASS}
                    role="menu"
                  >
                    <button role="menuitem" onClick={copyMarkdown} className="w-full text-left px-3 py-1.5 text-secondary text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                      Copy as Markdown
                    </button>
                    <button role="menuitem" onClick={exportJson} className="w-full text-left px-3 py-1.5 text-secondary text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                      Export JSON
                    </button>
                    <button role="menuitem" onClick={exportCsv} className="w-full text-left px-3 py-1.5 text-secondary text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                      Export CSV
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {filteredIssues.length === 0 ? (
          <FeedbackPlaceholder
            variant={activeIssues.length === 0 ? "empty" : "no-results"}
            size="section"
            title={
              activeIssues.length === 0
                ? "No issues found"
                : tokenPathFilter
                  ? "No issues found for this token"
                  : "No issues match this filter"
            }
            description={
              activeIssues.length === 0
                ? "This scope is clear right now."
                : tokenPathFilter && severityFilter !== "all"
                  ? "Clear the token filter or show all severities."
                  : tokenPathFilter
                    ? "Clear the token filter to keep reviewing the rest of the collection."
                    : "Show a different severity or reopen the full issue list."
            }
            actions={emptyStateActions}
            align="start"
            className="px-3 py-10"
          />
        ) : (
          issueGroups.map((group) => {
            const isCollapsed = collapsedRules.has(group.rule);
            const visibleLimit = issueGroupVisibleCounts[group.rule] ?? ISSUES_PER_PAGE;
            const visibleIssues = group.issues.slice(0, visibleLimit);
            const remainingCount = group.issues.length - visibleLimit;

            const severityColor =
              group.severity === "error"
                ? "text-[color:var(--color-figma-text-error)]"
                : group.severity === "warning"
                  ? "text-[color:var(--color-figma-text-warning)]"
                  : "text-[color:var(--color-figma-text-secondary)]";

            return (
              <div key={group.rule}>
                <button
                  onClick={() =>
                    setCollapsedRules((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.rule)) next.delete(group.rule);
                      else next.add(group.rule);
                      return next;
                    })
                  }
                  className="w-full flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                  title={group.tip || undefined}
                >
                  <svg
                    width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                    className={`transition-transform shrink-0 opacity-60 ${isCollapsed ? "" : "rotate-90"}`}
                    aria-hidden="true"
                  >
                    <path d="M2 1l4 3-4 3V1z" />
                  </svg>
                  <span className={`text-secondary font-medium flex-1 text-left truncate ${severityColor}`}>
                    {group.label}
                  </span>
                  <span className="text-secondary text-[color:var(--color-figma-text-tertiary)] tabular-nums shrink-0">
                    {group.issues.length}
                  </span>
                </button>

                {!isCollapsed && (
                  <>
                    {visibleIssues.map((issue, i) => (
                      <IssueRow
                        key={i}
                        issue={issue}
                        collectionDisplayNames={collectionDisplayNames}
                        selected={
                          selectedIssueKey
                            ? selectedIssueKey === suppressKey(issue)
                            : selectedTokenPath === issue.path
                        }
                        fixing={fixingKeys.has(suppressKey(issue))}
                        hasFix={hasFix(issue)}
                        fixLabel={fixLabel(issue.suggestedFix)}
                        onFix={() => onFix(issue)}
                        onIgnore={() => onIgnore(issue)}
                        onSelect={
                          onSelectIssue
                            ? () => onSelectIssue(issue)
                            : undefined
                        }
                        onOpen={
                          onNavigateToToken && issue.rule !== "generator-diagnostic"
                            ? () => onNavigateToToken(issue.path, issue.collectionId)
                            : undefined
                        }
                        onViewInGenerator={
                          onViewIssueInGenerator &&
                          issue.generatorId
                            ? () => onViewIssueInGenerator(issue)
                            : undefined
                        }
                      />
                    ))}
                    {remainingCount > 0 && (
                      <button
                        onClick={() =>
                          setIssueGroupVisibleCounts((prev) => ({
                            ...prev,
                            [group.rule]: visibleLimit + Math.min(remainingCount, ISSUES_PER_PAGE),
                          }))
                        }
                        className="w-full px-3 py-1.5 text-secondary text-[color:var(--color-figma-text-accent)] hover:bg-[var(--color-figma-bg-hover)] transition-colors text-center border-b border-[var(--color-figma-border)]"
                      >
                        Show {Math.min(remainingCount, ISSUES_PER_PAGE)} more
                        {remainingCount > ISSUES_PER_PAGE ? ` of ${remainingCount} remaining` : ""}
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function lastRefreshedLabel(date: Date | null) {
  if (!date) return null;
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  let text: string;
  if (diffMin < 1) text = "just now";
  else if (diffMin === 1) text = "1 min ago";
  else if (diffMin < 60) text = `${diffMin} min ago`;
  else text = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">Updated {text}</span>;
}

function IssueRow({
  issue,
  collectionDisplayNames,
  selected,
  fixing,
  hasFix: hasFixAction,
  fixLabel: fixLabelText,
  onFix,
  onIgnore,
  onSelect,
  onOpen,
  onViewInGenerator,
}: {
  issue: ValidationIssue;
  collectionDisplayNames?: Record<string, string>;
  selected: boolean;
  fixing: boolean;
  hasFix: boolean;
  fixLabel: string;
  onFix: () => void;
  onIgnore: () => void;
  onSelect?: () => void;
  onOpen?: () => void;
  onViewInGenerator?: () => void;
}) {
  const overflowMenu = useDropdownMenu();
  const collectionLabel = getCollectionDisplayName(
    issue.collectionId,
    collectionDisplayNames,
  );

  return (
    <div
      className={`group flex flex-col gap-2 border-b border-[var(--color-figma-border)] px-3 py-2 last:border-b-0 ${
        onSelect
          ? selected
            ? "cursor-pointer bg-[var(--color-figma-bg-selected)]"
            : "cursor-pointer hover:bg-[var(--color-figma-bg-hover)]"
          : ""
      }`}
      onClick={onSelect}
    >
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="min-w-0 break-all text-secondary font-mono font-medium text-[color:var(--color-figma-text)]">
            {issue.path}
          </span>
          <span className="text-secondary text-[color:var(--color-figma-text-secondary)] opacity-60 shrink-0">
            {collectionLabel}
          </span>
        </div>
        <div className="mt-0.5 break-words text-secondary text-[color:var(--color-figma-text-secondary)]">
          {issue.message}
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {hasFixAction && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onFix();
            }}
            disabled={fixing}
            className={`text-secondary shrink-0 disabled:opacity-40 disabled:cursor-wait hover:underline ${
              issue.suggestedFix === "delete-token"
                ? "text-[color:var(--color-figma-text-error)]"
                : "text-[color:var(--color-figma-text-accent)]"
            }`}
          >
            {fixing ? <Spinner size="xs" /> : fixLabelText}
          </button>
        )}

        {onViewInGenerator && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onViewInGenerator();
            }}
            className="text-secondary shrink-0 text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] hover:underline"
          >
            Open generator
          </button>
        )}

        {onOpen && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
            className="text-secondary shrink-0 text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] hover:underline"
          >
            Open
          </button>
        )}

        <div className="relative shrink-0">
          <button
            ref={overflowMenu.triggerRef}
            onClick={(event) => {
              event.stopPropagation();
              overflowMenu.toggle();
            }}
            className="text-secondary rounded px-1 py-0.5 text-[color:var(--color-figma-text-tertiary)] opacity-0 transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text-secondary)] group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
            aria-haspopup="true"
            aria-expanded={overflowMenu.open}
            aria-label="More actions"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
          {overflowMenu.open && (
            <div
              ref={overflowMenu.menuRef}
              className={`absolute right-0 top-full mt-1 ${FLOATING_MENU_CLASS}`}
              role="menu"
            >
              <button
                role="menuitem"
                onClick={() => { onIgnore(); overflowMenu.close(); }}
                className="w-full text-left px-3 py-1.5 text-secondary text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Hide this issue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
