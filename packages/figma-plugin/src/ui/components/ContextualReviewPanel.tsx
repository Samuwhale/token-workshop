import type { ReactNode } from "react";
import type { TokenMapEntry } from "../../shared/types";
import type { PromoteRow } from "./tokenListTypes";
import { ValuePreview } from "./ValuePreview";
import { NoticeFieldMessage } from "../shared/noticeSystem";

export type RelocateTokenReviewMode = "move" | "copy";

function ContextualReviewPanel({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex flex-col h-full bg-[var(--color-figma-bg)]">
      <div className="flex items-start justify-between gap-3 px-3 py-2 shrink-0">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">
            {title}
          </div>
          {description && (
            <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-1 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
          aria-label="Close panel"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3">{children}</div>
      {footer ? (
        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2 shrink-0">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function ReviewPanelOverlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-30 flex">
      {/* Backdrop — click to dismiss */}
      <button
        type="button"
        className="flex-1 bg-black/30 cursor-default"
        onClick={onClose}
        aria-label="Close review panel"
        tabIndex={-1}
      />
      {/* Panel */}
      <div className="w-[300px] shrink-0 border-l border-[var(--color-figma-border)] shadow-xl bg-[var(--color-figma-bg)]">
        {children}
      </div>
    </div>
  );
}

export function VariableDiffReviewPanel({
  pending,
  onApply,
  onClose,
}: {
  pending: { added: number; modified: number; unchanged: number; flat: any[] };
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <ContextualReviewPanel
      title="Apply as Figma Variables"
      description="Review sync impact before pushing to Figma."
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            className="rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-[10px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)]"
          >
            Apply
          </button>
        </>
      }
    >
      <div className="space-y-2 text-[10px] text-[var(--color-figma-text-secondary)]">
        <p>
          {pending.flat.length} token{pending.flat.length !== 1 ? "s" : ""}
        </p>
        <div className="overflow-hidden rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          {pending.added > 0 && (
            <div className="flex items-center gap-2 border-b border-[var(--color-figma-border)] px-2 py-1.5 last:border-b-0">
              <span className="font-medium text-[var(--color-figma-success)]">
                +{pending.added}
              </span>
              <span>
                new
              </span>
            </div>
          )}
          {pending.modified > 0 && (
            <div className="flex items-center gap-2 border-b border-[var(--color-figma-border)] px-2 py-1.5 last:border-b-0">
              <span className="font-medium text-yellow-600">
                ~{pending.modified}
              </span>
              <span>
                updated
              </span>
            </div>
          )}
          {pending.unchanged > 0 && (
            <div className="flex items-center gap-2 px-2 py-1.5 text-[var(--color-figma-text-tertiary)]">
              <span>{pending.unchanged} unchanged</span>
            </div>
          )}
        </div>
      </div>
    </ContextualReviewPanel>
  );
}

export function PromoteReviewPanel({
  rows,
  busy,
  onRowsChange,
  onConfirm,
  onClose,
}: {
  rows: PromoteRow[];
  busy: boolean;
  onRowsChange: (rows: PromoteRow[] | null) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const acceptedCount = rows.filter(
    (row) => row.accepted && row.proposedAlias,
  ).length;

  return (
    <ContextualReviewPanel
      title="Link to tokens"
      description="Replace raw values with aliases?"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || acceptedCount === 0}
            className="rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-[10px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
          >
            {busy ? "Converting…" : `Convert ${acceptedCount}`}
          </button>
        </>
      }
    >
      {rows.length === 0 ? (
        <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-[10px] italic text-[var(--color-figma-text-secondary)]">
          No raw-value tokens were available for alias promotion.
        </div>
      ) : (
        <div className="max-h-[300px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          {rows.map((row, index) => (
            <div
              key={row.path}
              className={`flex items-start gap-2 border-b border-[var(--color-figma-border)] px-3 py-2 last:border-b-0 ${row.proposedAlias ? "" : "opacity-50"}`}
            >
              <input
                type="checkbox"
                checked={row.accepted && row.proposedAlias !== null}
                disabled={row.proposedAlias === null}
                onChange={(event) => {
                  onRowsChange(
                    rows.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? { ...candidate, accepted: event.target.checked }
                        : candidate,
                    ),
                  );
                }}
                aria-label={`Promote ${row.path} to alias`}
                className="mt-0.5 shrink-0 accent-[var(--color-figma-accent)]"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <ValuePreview type={row.$type} value={row.$value} />
                  <span className="truncate font-mono text-[10px] text-[var(--color-figma-text)]">
                    {row.path}
                  </span>
                </div>
                {row.proposedAlias ? (
                  <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                    →{" "}
                    <span className="font-mono text-[var(--color-figma-accent)]">{`{${row.proposedAlias}}`}</span>
                    {row.$type === "color" && row.deltaE !== undefined && (
                      <span
                        className="ml-1 opacity-60"
                        title={`ΔE=${row.deltaE.toFixed(2)} — lower is a closer color match`}
                      >
                        {row.deltaE < 1
                          ? "Exact"
                          : row.deltaE < 5
                            ? "Close"
                            : "Approximate"}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 text-[10px] italic text-[var(--color-figma-text-secondary)]">
                    No matching primitive found
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </ContextualReviewPanel>
  );
}

export function RelocateTokenReviewPanel({
  mode,
  tokenPath,
  setName,
  sets,
  targetSet,
  onTargetSetChange,
  conflict,
  conflictAction,
  onConflictActionChange,
  conflictNewPath,
  onConflictNewPathChange,
  sourceToken,
  onConfirm,
  onClose,
}: {
  mode: RelocateTokenReviewMode;
  tokenPath: string;
  setName: string;
  sets: string[];
  targetSet: string;
  onTargetSetChange: (value: string) => void;
  conflict: TokenMapEntry | null;
  conflictAction: "overwrite" | "skip" | "rename";
  onConflictActionChange: (value: "overwrite" | "skip" | "rename") => void;
  conflictNewPath: string;
  onConflictNewPathChange: (value: string) => void;
  sourceToken: TokenMapEntry | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const isMove = mode === "move";
  const confirmLabel =
    conflict && conflictAction === "skip" ? "Skip" : isMove ? "Move" : "Copy";

  return (
    <ContextualReviewPanel
      title={`${isMove ? "Move" : "Copy"} token to set`}
      description={`${tokenPath} \u2192 ${targetSet || '...'}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={
              !targetSet ||
              (conflictAction === "rename" && !conflictNewPath.trim())
            }
            className="rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-[10px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-2">
          <div className="text-[9px] uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
            Token
          </div>
          <div
            className="mt-1 truncate font-mono text-[10px] text-[var(--color-figma-text)]"
            title={tokenPath}
          >
            {tokenPath}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-[var(--color-figma-text-secondary)]">
            Destination set
          </label>
          <select
            value={targetSet}
            onChange={(event) => onTargetSetChange(event.target.value)}
            className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
          >
            {sets
              .filter((candidateSet) => candidateSet !== setName)
              .map((candidateSet) => (
                <option key={candidateSet} value={candidateSet}>
                  {candidateSet}
                </option>
              ))}
          </select>
        </div>

        {conflict ? (
          <div className="space-y-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2">
            <NoticeFieldMessage severity="warning" className="font-medium">
              Conflict: a token already exists at this path in {targetSet}
            </NoticeFieldMessage>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <div className="text-[var(--color-figma-text-secondary)]">
                  Existing
                </div>
                <div className="mt-1">
                  <ValuePreview value={conflict.$value} type={conflict.$type} />
                </div>
              </div>
              <div>
                <div className="text-[var(--color-figma-text-secondary)]">
                  Incoming
                </div>
                <div className="mt-1">
                  {sourceToken ? (
                    <ValuePreview
                      value={sourceToken.$value}
                      type={sourceToken.$type}
                    />
                  ) : (
                    <span className="text-[var(--color-figma-text-secondary)]">
                      —
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-1">
              {(["overwrite", "skip", "rename"] as const).map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => onConflictActionChange(action)}
                  className={`flex-1 rounded border px-2 py-1 text-[10px] font-medium transition-colors ${
                    conflictAction === action
                      ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)] text-white"
                      : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                  }`}
                >
                  {action.charAt(0).toUpperCase() + action.slice(1)}
                </button>
              ))}
            </div>
            {conflictAction === "rename" ? (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  New path in target set
                </label>
                <input
                  type="text"
                  value={conflictNewPath}
                  onChange={(event) =>
                    onConflictNewPathChange(event.target.value)
                  }
                  placeholder="e.g. color.primary.new"
                  className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </ContextualReviewPanel>
  );
}
