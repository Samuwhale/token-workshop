import { useMemo, useState, useEffect } from "react";
import { swatchBgColor } from "../../shared/colorUtils";
import { getDiffRowId } from "../../shared/syncWorkflow";
import { LONG_TEXT_CLASSES } from "../../shared/longTextStyles";
import { stringifyValueForDisplay } from "../../shared/utils";

type TokenChange = import("../../hooks/useGitDiff").TokenChange;

// Display row shape used by VarDiffRowItem — compatible with both VarDiffRow and StyleDiffRow.
interface VarDiffRow {
  id?: string;
  path: string;
  cat: "local-only" | "figma-only" | "conflict";
  localValue?: string;
  figmaValue?: string;
  localType?: string;
  figmaType?: string;
  localScopes?: string[];
  figmaScopes?: string[];
  targetLabel?: string;
}

/* ── Shared types ───────────────────────────────────────────────────────── */

export interface PreviewRow {
  id?: string;
  path: string;
  localValue?: string;
  figmaValue?: string;
  localType?: string;
  figmaType?: string;
  cat: "local-only" | "figma-only" | "conflict";
  targetLabel?: string;
}

export function isHexColor(v: string | undefined): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v);
}

interface TokenChangeCounts {
  added: number;
  modified: number;
  removed: number;
}

const EMPTY_TOKEN_CHANGE_COUNTS: TokenChangeCounts = {
  added: 0,
  modified: 0,
  removed: 0,
};

function countTokenChanges(changes: TokenChange[]): TokenChangeCounts {
  const counts = { ...EMPTY_TOKEN_CHANGE_COUNTS };
  for (const change of changes) {
    counts[change.status] += 1;
  }
  return counts;
}

function stringifyTokenValue(value: unknown): string {
  return stringifyValueForDisplay(value);
}

/* ── DiffSwatch ─────────────────────────────────────────────────────────── */

export function DiffSwatch({ hex }: { hex: string }) {
  return (
    <span
      className="inline-block w-3 h-3 rounded-sm border border-white/20 ring-1 ring-[var(--color-figma-border)] shrink-0 align-middle"
      style={{ backgroundColor: swatchBgColor(hex) }}
      aria-hidden="true"
    />
  );
}

/* ── ValueCell ──────────────────────────────────────────────────────────── */

export function ValueCell({
  label,
  value,
  type,
}: {
  label: string;
  value: string | undefined;
  type: string | undefined;
}) {
  const v = value ?? "";
  const showSwatch = (type === "color" || isHexColor(v)) && isHexColor(v);
  return (
    <div className="flex min-w-[140px] flex-1 flex-col gap-0.5">
      <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
        {label}
      </span>
      <div className="flex min-w-0 items-start gap-1">
        {showSwatch && <DiffSwatch hex={v} />}
        <span
          className={`${LONG_TEXT_CLASSES.monoPrimary} text-secondary`}
          title={v}
        >
          {v || "—"}
        </span>
      </div>
    </div>
  );
}

/* ── TokenChangeRow ─────────────────────────────────────────────────────── */

export function TokenChangeRow({
  change,
}: {
  change: TokenChange;
}) {
  const statusColor =
    change.status === "added"
      ? "text-[color:var(--color-figma-text-success)]"
      : change.status === "removed"
        ? "text-[color:var(--color-figma-text-error)]"
        : "text-[color:var(--color-figma-text-warning)]";
  const statusChar =
    change.status === "added"
      ? "+"
      : change.status === "removed"
        ? "\u2212"
        : "~";
  const isColor = change.type === "color";
  const beforeStr =
    change.before != null ? stringifyTokenValue(change.before) : undefined;
  const afterStr =
    change.after != null ? stringifyTokenValue(change.after) : undefined;

  return (
    <div className="px-3 py-1">
      <div className="flex min-w-0 items-start gap-1.5">
        <span
          className={`text-secondary font-mono font-bold w-3 shrink-0 ${statusColor}`}
        >
          {statusChar}
        </span>
        <span
          className={`${LONG_TEXT_CLASSES.monoPrimary} text-secondary`}
          title={change.path}
        >
          {change.path}
        </span>
      </div>
      {change.status === "modified" && (
        <div className="ml-4 mt-0.5 flex flex-col gap-0.5 text-secondary font-mono">
          <div className="flex min-w-0 items-start gap-1">
            <span className="text-[color:var(--color-figma-text-error)] shrink-0 w-3">
              &minus;
            </span>
            {isColor && isHexColor(beforeStr) && <DiffSwatch hex={beforeStr} />}
            <span
              className={`${LONG_TEXT_CLASSES.monoSecondary} text-secondary`}
              title={beforeStr}
            >
              {beforeStr ?? ""}
            </span>
          </div>
          <div className="flex min-w-0 items-start gap-1">
            <span className="text-[color:var(--color-figma-text-success)] shrink-0 w-3">
              +
            </span>
            {isColor && isHexColor(afterStr) && <DiffSwatch hex={afterStr} />}
            <span
              className={`${LONG_TEXT_CLASSES.monoPrimary} text-secondary`}
              title={afterStr}
            >
              {afterStr ?? ""}
            </span>
          </div>
        </div>
      )}
      {change.status === "added" && afterStr !== undefined && (
        <div className="ml-4 mt-0.5 flex min-w-0 items-start gap-1 text-secondary font-mono">
          {isColor && isHexColor(afterStr) && <DiffSwatch hex={afterStr} />}
          <span
            className={`${LONG_TEXT_CLASSES.monoSecondary} text-secondary`}
            title={afterStr}
          >
            {afterStr}
          </span>
        </div>
      )}
      {change.status === "removed" && beforeStr !== undefined && (
        <div className="ml-4 mt-0.5 flex min-w-0 items-start gap-1 text-secondary font-mono">
          {isColor && isHexColor(beforeStr) && <DiffSwatch hex={beforeStr} />}
          <span
            className={`${LONG_TEXT_CLASSES.monoSecondary} text-secondary line-through`}
            title={beforeStr}
          >
            {beforeStr}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── FileTokenDiffList ──────────────────────────────────────────────────── */

export function FileTokenDiffList({
  allChanges,
  selectedFiles,
  setSelectedFiles,
  tokenPreview,
  tokenPreviewLoading,
  fetchTokenPreview,
}: {
  allChanges: Array<{ file: string; status: string }>;
  selectedFiles: Set<string>;
  setSelectedFiles: React.Dispatch<React.SetStateAction<Set<string>>>;
  tokenPreview: TokenChange[] | null;
  tokenPreviewLoading: boolean;
  fetchTokenPreview: () => Promise<void>;
}) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (
      tokenPreview === null &&
      !tokenPreviewLoading &&
      allChanges.length > 0
    ) {
      fetchTokenPreview();
    }
  }, [allChanges.length, tokenPreview, tokenPreviewLoading, fetchTokenPreview]);

  const changesByFile = useMemo(() => {
    const map = new Map<
      string,
      { changes: TokenChange[]; counts: TokenChangeCounts }
    >();
    if (!tokenPreview) return map;
    for (const tc of tokenPreview) {
      const fileName = tc.collectionId + ".tokens.json";
      const existing = map.get(fileName);
      if (existing) {
        existing.changes.push(tc);
        existing.counts[tc.status] += 1;
        continue;
      }
      map.set(fileName, {
        changes: [tc],
        counts: countTokenChanges([tc]),
      });
    }
    return map;
  }, [tokenPreview]);
  const previewCounts = useMemo(
    () => countTokenChanges(tokenPreview ?? []),
    [tokenPreview],
  );

  const toggleExpand = (file: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  return (
    <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
      <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-secondary text-[color:var(--color-figma-text-secondary)] font-medium flex items-center justify-between">
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={
              allChanges.length > 0 && selectedFiles.size === allChanges.length
            }
            ref={(el) => {
              if (el)
                el.indeterminate =
                  selectedFiles.size > 0 &&
                  selectedFiles.size < allChanges.length;
            }}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedFiles(new Set(allChanges.map((c) => c.file)));
              } else {
                setSelectedFiles(new Set());
              }
            }}
            className="w-3 h-3"
          />
          Working changes
        </label>
        <span className="text-secondary opacity-60">
          {selectedFiles.size}/{allChanges.length} included
          {tokenPreviewLoading && (
            <span className="ml-1.5 inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full border border-[var(--color-figma-text-secondary)]/30 border-t-[var(--color-figma-text-secondary)] animate-spin inline-block" />
            </span>
          )}
        </span>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-[var(--color-figma-border)]">
        {allChanges.map((change) => {
          const fileTokenSummary = changesByFile.get(change.file);
          const fileTokenChanges = fileTokenSummary?.changes ?? [];
          const isTokenFile = change.file.endsWith(".tokens.json");
          const hasTokenChanges = fileTokenChanges.length > 0;
          const isExpanded = expandedFiles.has(change.file);
          const fileCounts =
            fileTokenSummary?.counts ?? EMPTY_TOKEN_CHANGE_COUNTS;

          return (
            <div key={change.file}>
              <div className="flex items-center gap-2 px-3 py-1 hover:bg-[var(--color-figma-bg-hover)] group">
                <button
                  type="button"
                  onClick={() => hasTokenChanges && toggleExpand(change.file)}
                  disabled={!hasTokenChanges}
                  className="w-3 h-3 flex items-center justify-center shrink-0 disabled:opacity-0"
                  aria-label={isExpanded ? "Collapse" : "Expand"}
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 8 8"
                    fill="currentColor"
                    className={`transition-transform ${isExpanded ? "rotate-90" : ""} text-[color:var(--color-figma-text-tertiary)]`}
                  >
                    <path d="M2 1l4 3-4 3V1z" />
                  </svg>
                </button>
                <label
                  className="flex items-center cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(change.file)}
                    onChange={(e) => {
                      setSelectedFiles((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(change.file);
                        else next.delete(change.file);
                        return next;
                      });
                    }}
                    className="w-3 h-3"
                  />
                </label>
                <span
                  className={`text-secondary font-mono font-bold w-3 flex-shrink-0 ${
                    change.status === "M"
                      ? "text-[color:var(--color-figma-text-warning)]"
                      : change.status === "A"
                        ? "text-[color:var(--color-figma-text-success)]"
                        : change.status === "D"
                          ? "text-[color:var(--color-figma-text-error)]"
                          : "text-[color:var(--color-figma-text-secondary)]"
                  }`}
                >
                  {change.status}
                </span>
                <button
                  type="button"
                  onClick={() => hasTokenChanges && toggleExpand(change.file)}
                  className="min-w-0 flex-1 text-left text-secondary text-[color:var(--color-figma-text)] [overflow-wrap:anywhere]"
                  disabled={!hasTokenChanges}
                >
                  {change.file}
                </button>
                {isTokenFile &&
                  tokenPreview !== null &&
                  !tokenPreviewLoading &&
                  hasTokenChanges && (
                    <span className="flex gap-1.5 text-secondary font-mono shrink-0 ml-auto">
                      {fileCounts.added > 0 && (
                        <span className="text-[color:var(--color-figma-text-success)]">
                          +{fileCounts.added}
                        </span>
                      )}
                      {fileCounts.modified > 0 && (
                        <span className="text-[color:var(--color-figma-text-warning)]">
                          ~{fileCounts.modified}
                        </span>
                      )}
                      {fileCounts.removed > 0 && (
                        <span className="text-[color:var(--color-figma-text-error)]">
                          &minus;{fileCounts.removed}
                        </span>
                      )}
                    </span>
                  )}
                {isTokenFile &&
                  tokenPreview !== null &&
                  !tokenPreviewLoading &&
                  !hasTokenChanges &&
                  change.status !== "D" && (
                    <span className="flex items-center gap-1 text-secondary text-[color:var(--color-figma-text-tertiary)] shrink-0 ml-auto">
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-[color:var(--color-figma-text-success)]"
                        aria-hidden="true"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      no value changes
                    </span>
                  )}
              </div>
              {isExpanded && hasTokenChanges && (
                <div className="bg-[var(--color-figma-bg-secondary)] border-t border-[var(--color-figma-border)]">
                  {fileTokenChanges.map((tc) => (
                    <TokenChangeRow
                      key={`${tc.collectionId}:${tc.path}:${tc.status}`}
                      change={tc}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {tokenPreview !== null &&
        !tokenPreviewLoading &&
        (previewCounts.added > 0 ||
          previewCounts.modified > 0 ||
          previewCounts.removed > 0) && (
          <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] flex gap-3 text-secondary text-[color:var(--color-figma-text-secondary)]">
            {previewCounts.added > 0 && (
              <span className="text-[color:var(--color-figma-text-success)]">
                +{previewCounts.added} added
              </span>
            )}
            {previewCounts.modified > 0 && (
              <span className="text-[color:var(--color-figma-text-warning)]">
                ~{previewCounts.modified} modified
              </span>
            )}
            {previewCounts.removed > 0 && (
              <span className="text-[color:var(--color-figma-text-error)]">
                &minus;{previewCounts.removed} removed
              </span>
            )}
          </div>
        )}
    </div>
  );
}

/* ── SyncDiffSummary ────────────────────────────────────────────────────── */

export function SyncDiffSummary({
  rows,
  dirs,
}: {
  rows: PreviewRow[];
  dirs: Record<string, "push" | "pull" | "skip">;
}) {
  const pushRows = rows.filter((r) => dirs[getDiffRowId(r)] === "push");
  const pullRows = rows.filter((r) => dirs[getDiffRowId(r)] === "pull");
  const skipCount = rows.filter((r) => dirs[getDiffRowId(r)] === "skip").length;

  const sections: {
    label: string;
    arrow: string;
    items: PreviewRow[];
    direction: "push" | "pull";
  }[] = [];
  if (pushRows.length > 0)
    sections.push({
      label: "Update Figma",
      arrow: "\u2191",
      items: pushRows,
      direction: "push",
    });
  if (pullRows.length > 0)
    sections.push({
      label: "Update local",
      arrow: "\u2193",
      items: pullRows,
      direction: "pull",
    });

  if (sections.length === 0) {
    return (
      <p className="mt-1.5 text-body text-[color:var(--color-figma-text-secondary)]">
        No changes to apply (all skipped).
      </p>
    );
  }

  return (
    <div className="mt-2">
      {sections.map((section) => (
        <div key={section.label} className="mb-2">
          <div className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)] mb-1">
            {section.arrow} {section.label} ({section.items.length})
          </div>
          <div className="max-h-36 overflow-y-auto rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
            {section.items.map((r) => {
              const isColor =
                r.localType === "color" || r.figmaType === "color";
              const beforeVal =
                section.direction === "push" ? r.figmaValue : r.localValue;
              const afterVal =
                section.direction === "push" ? r.localValue : r.figmaValue;
              return (
                <div key={getDiffRowId(r)} className="px-2 py-1">
                  <div
                    className={`${LONG_TEXT_CLASSES.monoPrimary} text-secondary`}
                    title={r.path}
                  >
                    {r.path}
                  </div>
                  {r.targetLabel ? (
                    <div
                      className={`${LONG_TEXT_CLASSES.textTertiary} mt-0.5 text-secondary`}
                      title={r.targetLabel}
                    >
                      {r.targetLabel}
                    </div>
                  ) : null}
                  {r.cat === "conflict" && (
                    <div className="flex flex-col gap-0.5 mt-0.5 ml-1 text-secondary font-mono">
                      <div className="flex min-w-0 items-start gap-1">
                        <span className="text-[color:var(--color-figma-text-error)] shrink-0 w-3">
                          &minus;
                        </span>
                        {isColor && isHexColor(beforeVal) && (
                          <DiffSwatch hex={beforeVal} />
                        )}
                        <span
                          className={`${LONG_TEXT_CLASSES.monoSecondary} text-secondary`}
                          title={beforeVal ?? ""}
                        >
                          {beforeVal ?? ""}
                        </span>
                      </div>
                      <div className="flex min-w-0 items-start gap-1">
                        <span className="text-[color:var(--color-figma-text-success)] shrink-0 w-3">
                          +
                        </span>
                        {isColor && isHexColor(afterVal) && (
                          <DiffSwatch hex={afterVal} />
                        )}
                        <span
                          className={`${LONG_TEXT_CLASSES.monoPrimary} text-secondary`}
                          title={afterVal ?? ""}
                        >
                          {afterVal ?? ""}
                        </span>
                      </div>
                    </div>
                  )}
                  {r.cat !== "conflict" &&
                    (r.localValue ?? r.figmaValue) !== undefined && (
                      <div className="mt-0.5 ml-1 flex min-w-0 items-start gap-1 text-secondary font-mono">
                        {isColor &&
                          isHexColor(r.localValue ?? r.figmaValue) && (
                            <DiffSwatch hex={(r.localValue ?? r.figmaValue)!} />
                          )}
                        <span
                          className={`${LONG_TEXT_CLASSES.monoSecondary} text-secondary`}
                          title={r.localValue ?? r.figmaValue}
                        >
                          {r.localValue ?? r.figmaValue ?? ""}
                        </span>
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {skipCount > 0 && (
        <p className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
          {skipCount} item{skipCount !== 1 ? "s" : ""} skipped.
        </p>
      )}
    </div>
  );
}

/* ── VarDiffRowItem ─────────────────────────────────────────────────────── */

export function VarDiffRowItem({
  row,
  dir,
  onChange,
  reviewOnly = false,
}: {
  row: VarDiffRow;
  dir: "push" | "pull" | "skip";
  onChange: (dir: "push" | "pull" | "skip") => void;
  reviewOnly?: boolean;
}) {
  return (
    <div className="px-3 py-1.5 flex flex-col gap-1">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div
            className={`${LONG_TEXT_CLASSES.monoPrimary} text-secondary`}
            title={row.path}
          >
            {row.path}
          </div>
          {row.targetLabel ? (
            <div
              className={`${LONG_TEXT_CLASSES.textTertiary} mt-0.5 text-secondary`}
              title={row.targetLabel}
            >
              {row.targetLabel}
            </div>
          ) : null}
        </div>
        {reviewOnly ? (
          <span className="shrink-0 rounded border border-[var(--color-figma-border)] px-1.5 py-0.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
            Review only
          </span>
        ) : (
          <select
            value={dir}
            onChange={(e) =>
              onChange(e.target.value as "push" | "pull" | "skip")
            }
            className="text-secondary border border-[var(--color-figma-border)] rounded bg-[var(--color-figma-bg)] text-[color:var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)] px-1 py-0.5 shrink-0"
          >
            <option value="push">{"\u2191"} Update Figma</option>
            <option value="pull">{"\u2193"} Update local</option>
            <option value="skip">Skip</option>
          </select>
        )}
      </div>
      {row.cat === "conflict" && (
        <div className="flex flex-wrap items-start gap-1.5 pl-0.5">
          <ValueCell
            label="Local"
            value={row.localValue}
            type={row.localType}
          />
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="none"
            className="shrink-0 text-[color:var(--color-figma-text-tertiary)]"
            aria-hidden="true"
          >
            <path
              d="M1 4h6M5 2l2 2-2 2"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <ValueCell
            label="Figma"
            value={row.figmaValue}
            type={row.figmaType}
          />
        </div>
      )}
      {row.cat === "local-only" && row.localValue !== undefined && (
        <div className="flex min-w-0 items-start gap-1 pl-0.5">
          {(row.localType === "color" || isHexColor(row.localValue)) &&
            isHexColor(row.localValue) && <DiffSwatch hex={row.localValue} />}
          <span className={`${LONG_TEXT_CLASSES.monoSecondary} text-secondary`}>
            {row.localValue}
          </span>
        </div>
      )}
      {row.cat === "figma-only" && row.figmaValue !== undefined && (
        <div className="flex min-w-0 items-start gap-1 pl-0.5">
          {(row.figmaType === "color" || isHexColor(row.figmaValue)) &&
            isHexColor(row.figmaValue) && <DiffSwatch hex={row.figmaValue} />}
          <span className={`${LONG_TEXT_CLASSES.monoSecondary} text-secondary`}>
            {row.figmaValue}
          </span>
        </div>
      )}
    </div>
  );
}
