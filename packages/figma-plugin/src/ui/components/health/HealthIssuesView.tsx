import { useState } from "react";
import type { ValidationIssue } from "../../hooks/useValidationCache";
import { NoticePill, severityStyles } from "../../shared/noticeSystem";
import type { NoticeSeverity } from "../../shared/noticeSystem";
import { LINT_RULE_BY_ID } from "../../shared/lintRules";
import { useDropdownMenu } from "../../hooks/useDropdownMenu";
import { dispatchToast } from "../../shared/toastBus";
import { Spinner } from "../Spinner";

const VALIDATION_LABELS: Record<string, { label: string; tip: string }> = {
  "missing-type": { label: "Missing type", tip: "Add a $type for spec compliance" },
  "broken-alias": { label: "Broken reference", tip: "Referenced token missing — update or remove" },
  "circular-reference": { label: "Circular reference", tip: "Break the loop so the token resolves" },
  "max-alias-depth": { label: "Deep reference chain", tip: "Shorten the chain to the source token" },
  "references-deprecated-token": { label: "Deprecated token in use", tip: "Replace with a non-deprecated token" },
  "type-mismatch": { label: "Type / value mismatch", tip: "Value doesn't match declared $type" },
};

function getRuleLabel(rule: string): { label: string; tip: string } | undefined {
  return (
    VALIDATION_LABELS[rule] ??
    (LINT_RULE_BY_ID[rule]
      ? { label: LINT_RULE_BY_ID[rule].label, tip: LINT_RULE_BY_ID[rule].tip }
      : undefined)
  );
}

const ISSUES_PER_PAGE = 20;

export interface HealthIssuesViewProps {
  validationIssues: ValidationIssue[];
  validationLastRefreshed: Date | null;
  suppressedKeys: Set<string>;
  fixingKeys: Set<string>;
  onFix: (issue: ValidationIssue) => void;
  onIgnore: (issue: ValidationIssue) => void;
  onNavigateToToken?: (path: string, collectionId: string) => void;
  onBack: () => void;
}

function suppressKey(issue: ValidationIssue): string {
  return `${issue.rule}:${issue.collectionId}:${issue.path}`;
}

export function HealthIssuesView({
  validationIssues,
  validationLastRefreshed,
  suppressedKeys,
  fixingKeys,
  onFix,
  onIgnore,
  onNavigateToToken,
  onBack,
}: HealthIssuesViewProps) {
  const [severityFilter, setSeverityFilter] = useState<"all" | "error" | "warning" | "info">("all");
  const [collapsedRules, setCollapsedRules] = useState<Set<string>>(new Set());
  const [issueGroupVisibleCounts, setIssueGroupVisibleCounts] = useState<Record<string, number>>({});
  const exportMenu = useDropdownMenu();

  const activeIssues = validationIssues.filter(
    (i) =>
      i.rule !== "no-duplicate-values" &&
      i.rule !== "alias-opportunity" &&
      !suppressedKeys.has(suppressKey(i)),
  );

  const filteredIssues =
    severityFilter === "all"
      ? [...activeIssues].sort((a, b) => {
          const order = { error: 0, warning: 1, info: 2 } as const;
          return order[a.severity] - order[b.severity];
        })
      : activeIssues.filter((i) => i.severity === severityFilter);

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
        const meta = getRuleLabel(rule) ?? { label: rule, tip: "" };
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

  const formatValidatedAt = (date: Date): string => {
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin === 1) return "1 min ago";
    if (diffMin < 60) return `${diffMin} min ago`;
    return `at ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  };

  const copyMarkdown = () => {
    const lines: string[] = [
      `# Audit Report — ${validationIssues.length} issue${validationIssues.length !== 1 ? "s" : ""}\n`,
    ];
    for (const sev of ["error", "warning", "info"] as const) {
      const group = validationIssues.filter((i) => i.severity === sev);
      if (group.length === 0) continue;
      lines.push(`## ${sev.charAt(0).toUpperCase() + sev.slice(1)}s (${group.length})`);
      for (const issue of group) {
        lines.push(`- **${issue.path}** (collection: ${issue.collectionId}): ${issue.message}${issue.suggestedFix ? ` — Fix: ${issue.suggestedFix}` : ""}`);
      }
      lines.push("");
    }
    navigator.clipboard.writeText(lines.join("\n")).then(() => dispatchToast("Copied as Markdown", "success"));
    exportMenu.close();
  };

  const exportJson = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      total: validationIssues.length,
      issues: validationIssues.map((i) => ({
        severity: i.severity,
        rule: i.rule,
        collectionId: i.collectionId,
        path: i.path,
        message: i.message,
        ...(i.suggestedFix ? { suggestedFix: i.suggestedFix } : {}),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-report.json";
    a.click();
    URL.revokeObjectURL(url);
    dispatchToast("Exported JSON", "success");
    exportMenu.close();
  };

  const exportCsv = () => {
    const header = "severity,rule,collectionId,path,message,suggestedFix";
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = validationIssues.map((i) =>
      [i.severity, i.rule, i.collectionId, i.path, i.message, i.suggestedFix ?? ""].map(escape).join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-report.csv";
    a.click();
    URL.revokeObjectURL(url);
    dispatchToast("Exported CSV", "success");
    exportMenu.close();
  };

  const hasFix = (issue: ValidationIssue): boolean =>
    issue.suggestedFix === "add-description" ||
    ((issue.suggestedFix === "flatten-alias-chain" || issue.suggestedFix === "extract-to-alias") && !!issue.suggestion) ||
    issue.suggestedFix === "delete-token" ||
    (issue.suggestedFix === "rename-token" && !!issue.suggestion) ||
    (issue.suggestedFix === "fix-type" && !!issue.suggestion);

  const fixLabel = (fix: string | undefined): string => {
    switch (fix) {
      case "add-description": return "Add desc";
      case "flatten-alias-chain": return "Flatten";
      case "extract-to-alias": return "Make alias";
      case "delete-token": return "Delete";
      case "rename-token": return "Rename";
      case "fix-type": return "Fix type";
      default: return "Fix";
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-1.5">
        <button
          onClick={onBack}
          className="flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">Issues</span>
        <div className="ml-auto flex items-center gap-1.5">
          {lastRefreshedLabel(validationLastRefreshed)}
          {(["all", "error", "warning", "info"] as const).map((f) => {
            const filterSeverity: NoticeSeverity = f === "all" ? "info" : f;
            const isActive = severityFilter === f;
            return (
              <button
                key={f}
                onClick={() => setSeverityFilter(f)}
                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                  isActive
                    ? `${severityStyles(filterSeverity).pill} font-medium`
                    : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                }`}
              >
                {f}
              </button>
            );
          })}
          <div className="relative">
            <button
              ref={exportMenu.triggerRef}
              onClick={exportMenu.toggle}
              className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              aria-haspopup="true"
              aria-expanded={exportMenu.open}
            >
              &hellip;
            </button>
            {exportMenu.open && (
              <div
                ref={exportMenu.menuRef}
                className="absolute right-0 top-full mt-1 z-10 min-w-[140px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg py-0.5"
                role="menu"
              >
                <button role="menuitem" onClick={copyMarkdown} className="w-full text-left px-3 py-1.5 text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                  Copy as Markdown
                </button>
                <button role="menuitem" onClick={exportJson} className="w-full text-left px-3 py-1.5 text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                  Export JSON
                </button>
                <button role="menuitem" onClick={exportCsv} className="w-full text-left px-3 py-1.5 text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                  Export CSV
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {filteredIssues.length === 0 ? (
          <div className="px-3 py-12 text-center">
            <p className="text-[11px] text-[var(--color-figma-text-secondary)]">
              {activeIssues.length === 0 ? "No issues found" : "No issues match this filter"}
            </p>
          </div>
        ) : (
          issueGroups.map((group) => {
            const isCollapsed = collapsedRules.has(group.rule);
            const visibleLimit = issueGroupVisibleCounts[group.rule] ?? ISSUES_PER_PAGE;
            const visibleIssues = group.issues.slice(0, visibleLimit);
            const remainingCount = group.issues.length - visibleLimit;

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
                  className="w-full flex items-center gap-2 px-3 py-1.5 bg-[var(--color-figma-bg-secondary)]/50 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  <svg
                    width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                    className={`transition-transform shrink-0 ${isCollapsed ? "" : "rotate-90"}`}
                    aria-hidden="true"
                  >
                    <path d="M2 1l4 3-4 3V1z" />
                  </svg>
                  <NoticePill severity={group.severity as NoticeSeverity}>
                    {group.severity === "error" ? "Error" : group.severity === "warning" ? "Warn" : "Info"}
                  </NoticePill>
                  <span className="text-[10px] font-medium text-[var(--color-figma-text)] flex-1 text-left">
                    {group.label}
                  </span>
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">
                    {group.issues.length}
                  </span>
                </button>

                {!isCollapsed && group.tip && (
                  <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)]/30 border-b border-[var(--color-figma-border)] flex items-center gap-1">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 opacity-50">
                      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
                    </svg>
                    {group.tip}
                  </div>
                )}

                {!isCollapsed && (
                  <>
                    {visibleIssues.map((issue, i) => (
                      <IssueRow
                        key={i}
                        issue={issue}
                        fixing={fixingKeys.has(suppressKey(issue))}
                        hasFix={hasFix(issue)}
                        fixLabel={fixLabel(issue.suggestedFix)}
                        onFix={() => onFix(issue)}
                        onIgnore={() => onIgnore(issue)}
                        onOpen={onNavigateToToken ? () => onNavigateToToken(issue.path, issue.collectionId) : undefined}
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
                        className="w-full px-3 py-1.5 text-[10px] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)] transition-colors text-center border-b border-[var(--color-figma-border)]"
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
  return <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">Updated {text}</span>;
}

function IssueRow({
  issue,
  fixing,
  hasFix: hasFixAction,
  fixLabel: fixLabelText,
  onFix,
  onIgnore,
  onOpen,
}: {
  issue: ValidationIssue;
  fixing: boolean;
  hasFix: boolean;
  fixLabel: string;
  onFix: () => void;
  onIgnore: () => void;
  onOpen?: () => void;
}) {
  const overflowMenu = useDropdownMenu();

  return (
    <div className="group px-3 py-1.5 flex items-center gap-2 border-b border-[var(--color-figma-border)] last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-[10px] text-[var(--color-figma-text)] font-medium font-mono truncate">
            {issue.path}
          </span>
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] opacity-60 shrink-0">
            {issue.collectionId}
          </span>
        </div>
        <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">
          {issue.message}
        </div>
      </div>

      {hasFixAction && (
        <button
          onClick={onFix}
          disabled={fixing}
          className={`text-[10px] px-2 py-0.5 rounded border shrink-0 disabled:opacity-40 disabled:cursor-wait ${
            issue.suggestedFix === "delete-token"
              ? "border-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/15"
              : "border-[var(--color-figma-success,#34a853)] bg-[var(--color-figma-success,#34a853)]/10 text-[var(--color-figma-success,#34a853)] hover:bg-[var(--color-figma-success,#34a853)]/15"
          }`}
        >
          {fixing ? <Spinner size="xs" /> : fixLabelText}
        </button>
      )}

      {onOpen && (
        <button
          onClick={onOpen}
          className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors shrink-0"
        >
          Open
        </button>
      )}

      <div className="relative shrink-0">
        <button
          ref={overflowMenu.triggerRef}
          onClick={overflowMenu.toggle}
          className="text-[10px] px-1 py-0.5 rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors opacity-0 group-hover:opacity-100"
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
            className="absolute right-0 top-full mt-1 z-10 min-w-[140px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg py-0.5"
            role="menu"
          >
            <button
              role="menuitem"
              onClick={() => { onIgnore(); overflowMenu.close(); }}
              className="w-full text-left px-3 py-1.5 text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              Ignore this issue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
