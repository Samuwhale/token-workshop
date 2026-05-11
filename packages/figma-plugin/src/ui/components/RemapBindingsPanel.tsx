import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import type { TokenMapEntry } from "../../shared/types";
import { ConfirmModal } from "./ConfirmModal";
import { InlineBanner } from "./InlineBanner";
import { RemapAutocompleteInput } from "./RemapAutocompleteInput";
import { SegmentedControl } from "../primitives";
import { createUiId } from "../shared/ids";

export interface RemapBindingsRow {
  id: string;
  from: string;
  to: string;
  suggested?: boolean;
}

function newRemapRowId(): string {
  return createUiId("remap-row");
}

function createEmptyRemapRow(): RemapBindingsRow {
  return { id: newRemapRowId(), from: "", to: "" };
}

export interface RemapBindingsPrefillEntry {
  from: string;
  to?: string;
}

interface RemapBindingsPanelProps {
  tokenMap: Record<string, TokenMapEntry>;
  rows: RemapBindingsRow[];
  onRowsChange: (rows: RemapBindingsRow[]) => void;
  fromSuggestions?: string[];
  onClose: () => void;
  defaultScope?: "selection" | "page";
  embedded?: boolean;
}

interface RemapResultState {
  updatedBindings: number;
  updatedNodes: number;
  scannedNodes: number;
  nodesWithBindings: number;
}

interface RemapPlanEntry {
  from: string;
  to: string;
}

const REMAP_SCOPE_OPTIONS = [
  { value: "selection", label: "Selected layers" },
  { value: "page", label: "Current page" },
] as const;

export function buildRemapRowsFromEntries(
  entries?: readonly RemapBindingsPrefillEntry[],
): RemapBindingsRow[] {
  const seen = new Set<string>();
  const rows: RemapBindingsRow[] = [];
  for (const entry of entries ?? []) {
    const from = entry.from.trim();
    if (!from || seen.has(from)) continue;
    seen.add(from);
    const to = entry.to?.trim() ?? "";
    rows.push({ id: newRemapRowId(), from, to, suggested: to.length > 0 });
  }
  return rows.length > 0 ? rows : [createEmptyRemapRow()];
}

function describeRemapResult(
  result: RemapResultState,
  scope: "selection" | "page",
): string {
  if (result.updatedBindings > 0) {
    return `Remapped ${result.updatedBindings} binding${result.updatedBindings !== 1 ? "s" : ""} across ${result.updatedNodes} layer${result.updatedNodes !== 1 ? "s" : ""}.`;
  }

  if (result.scannedNodes === 0) {
    return scope === "selection"
      ? "Select at least one layer before remapping bindings."
      : "No layers were available on this page to scan.";
  }

  if (result.nodesWithBindings === 0) {
    return scope === "selection"
      ? "No selected layers had token bindings to remap."
      : "No layers on this page had token bindings to remap.";
  }

  return `Scanned ${result.nodesWithBindings} bound layer${result.nodesWithBindings !== 1 ? "s" : ""}, but none used the selected source paths.`;
}

export function RemapBindingsPanel({
  tokenMap,
  rows,
  onRowsChange,
  fromSuggestions,
  onClose,
  defaultScope = "page",
  embedded = false,
}: RemapBindingsPanelProps) {
  const remapRows =
    rows.length > 0 ? rows : buildRemapRowsFromEntries();
  const [remapScope, setRemapScope] = useState<"selection" | "page">(
    defaultScope,
  );
  const [remapRunning, setRemapRunning] = useState(false);
  const [remapProgress, setRemapProgress] = useState<{
    processed: number;
    total: number;
  } | null>(null);
  const [remapResult, setRemapResult] = useState<RemapResultState | null>(null);
  const [remapError, setRemapError] = useState<string | null>(null);
  const [remapValidationMessage, setRemapValidationMessage] = useState<
    string | null
  >(null);
  const [pendingPlan, setPendingPlan] = useState<{
    entries: RemapPlanEntry[];
    scope: "selection" | "page";
  } | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg?.type === "remap-progress") {
        setRemapProgress({ processed: msg.processed, total: msg.total });
      } else if (msg?.type === "remap-complete") {
        setRemapRunning(false);
        setRemapProgress(null);
        if (msg.error) {
          setRemapError(msg.error);
          setRemapResult(null);
        } else {
          const nextResult: RemapResultState = {
            updatedBindings: msg.updatedBindings,
            updatedNodes: msg.updatedNodes,
            scannedNodes: msg.scannedNodes ?? 0,
            nodesWithBindings: msg.nodesWithBindings ?? 0,
          };
          setRemapResult(nextResult);
          setRemapError(null);
          if (nextResult.updatedBindings > 0) {
            onRowsChange(buildRemapRowsFromEntries());
          }
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onRowsChange]);

  useEffect(() => {
    setRemapValidationMessage(null);
    setRemapError(null);
  }, [remapRows, remapScope]);

  useEffect(() => {
    setRemapScope(defaultScope);
  }, [defaultScope]);

  const fromAutocompletePaths = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...Object.keys(tokenMap),
            ...(fromSuggestions ?? []),
            ...remapRows.map((row) => row.from.trim()).filter(Boolean),
          ].filter(Boolean),
        ),
      ),
    [fromSuggestions, remapRows, tokenMap],
  );

  const updateRows = (nextRows: RemapBindingsRow[]) => {
    setRemapResult(null);
    onRowsChange(nextRows);
  };

  const plannedEntries = useMemo(
    () =>
      remapRows
        .map((row) => ({
          from: row.from.trim(),
          to: row.to.trim(),
        }))
        .filter((row) => row.from && row.to && row.from !== row.to),
    [remapRows],
  );

  const handleRemap = () => {
    const normalizedRows = remapRows.map((row) => ({
      from: row.from.trim(),
      to: row.to.trim(),
    }));
    const hasAnyInput = normalizedRows.some((row) => row.from || row.to);

    if (plannedEntries.length === 0) {
      if (hasAnyInput) {
        setRemapValidationMessage(
          "Add at least one row with both paths filled and different values.",
        );
      }
      return;
    }

    setPendingPlan({ entries: plannedEntries, scope: remapScope });
  };

  const executeRemap = (entries: RemapPlanEntry[], scope: "selection" | "page") => {
    const remapMap = Object.fromEntries(
      entries.map((row) => [row.from, row.to]),
    );

    setRemapRunning(true);
    setRemapProgress(null);
    setRemapResult(null);
    setRemapError(null);
    setRemapValidationMessage(null);

    parent.postMessage(
      {
        pluginMessage: {
          type: "remap-bindings",
          remapMap,
          scope,
        },
      },
      "*",
    );
  };

  const statusBanner = remapRunning ? (
    <InlineBanner variant="loading" size="sm">
      Remapping {remapProgress ? `${remapProgress.processed}/${remapProgress.total}` : "bindings"}…
    </InlineBanner>
  ) : remapError ? (
    <InlineBanner variant="error" size="sm">
      <span title={remapError}>{remapError}</span>
    </InlineBanner>
  ) : remapValidationMessage ? (
    <InlineBanner variant="warning" size="sm">
      {remapValidationMessage}
    </InlineBanner>
  ) : remapResult ? (
    <InlineBanner
      variant={remapResult.updatedBindings > 0 ? "success" : "info"}
      size="sm"
      action={
        remapResult.updatedBindings > 0
          ? {
              label: embedded ? "Done" : "Close",
              onClick: onClose,
            }
          : undefined
      }
    >
      {describeRemapResult(remapResult, remapScope)}
    </InlineBanner>
  ) : null;

  const remapDisabled =
    remapRunning ||
    remapRows.every((row) => !row.from.trim() && !row.to.trim());

  return (
    <div
      className={`${embedded ? "" : "border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]"} shrink-0 px-3 py-2`}
    >
      {!embedded && (
        <div className="mb-1 flex items-center justify-between">
          <span className="text-body font-semibold text-[color:var(--color-figma-text)]">
            Remap Bindings
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-0.5 text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            title="Close"
            aria-label="Close"
          >
            <X size={10} strokeWidth={2} aria-hidden />
          </button>
        </div>
      )}

      <p className="mb-1.5 text-secondary leading-relaxed text-[color:var(--color-figma-text-secondary)]">
        Replace broken bindings with the token that should drive those layers now.
      </p>

      <div className="mb-1.5 flex flex-col gap-1">
        {remapRows.map((row, idx) => (
          <div key={row.id} className="flex items-center gap-1">
            <RemapAutocompleteInput
              value={row.from}
              onChange={(nextValue) =>
                updateRows(
                  remapRows.map((existingRow, rowIdx) =>
                    rowIdx === idx ? { ...existingRow, from: nextValue } : existingRow,
                  ),
                )
              }
              placeholder="Broken binding"
              tokenMap={tokenMap}
              additionalPaths={fromAutocompletePaths}
            />
            <ArrowRight
              size={10}
              strokeWidth={1.8}
              className="shrink-0 text-[color:var(--color-figma-text-secondary)]"
              aria-hidden
            />
            <RemapAutocompleteInput
              value={row.to}
              onChange={(nextValue) =>
                updateRows(
                  remapRows.map((existingRow, rowIdx) =>
                    rowIdx === idx
                      ? { ...existingRow, to: nextValue, suggested: false }
                      : existingRow,
                  ),
                )
              }
              placeholder="Replacement token"
              tokenMap={tokenMap}
            />
            {row.suggested && row.to.trim().length > 0 && (
              <span
                className="shrink-0 text-secondary text-[color:var(--color-figma-text-secondary)]"
                title="Suggested by value match — review before remapping"
              >
                Suggested
              </span>
            )}
            {remapRows.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  updateRows(remapRows.filter((_, rowIdx) => rowIdx !== idx))
                }
                className="shrink-0 rounded p-0.5 text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text-error)]"
                title="Remove row"
                aria-label="Remove row"
              >
                <X size={10} strokeWidth={2} aria-hidden />
              </button>
            )}
          </div>
        ))}
      </div>

      {statusBanner ? <div className="mb-1.5">{statusBanner}</div> : null}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => updateRows([...remapRows, createEmptyRemapRow()])}
          className="inline-flex items-center gap-1 text-secondary text-[color:var(--color-figma-text-accent)] hover:underline"
        >
          <Plus size={10} strokeWidth={1.8} aria-hidden />
          Add row
        </button>

        <div className="flex items-center gap-1.5">
          <SegmentedControl
            value={remapScope}
            options={[...REMAP_SCOPE_OPTIONS]}
            onChange={(scope) => {
              setRemapResult(null);
              setRemapScope(scope);
            }}
            ariaLabel="Repair scope"
            allowWrap
            size="compact"
          />
          <button
            type="button"
            onClick={handleRemap}
            disabled={remapDisabled}
            className="rounded bg-[var(--color-figma-action-bg)] px-2 py-0.5 text-secondary text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-50"
          >
            {remapRunning
              ? "Remapping…"
              : remapScope === "selection"
                ? "Repair selected layers"
                : "Repair page"}
          </button>
        </div>
      </div>
      {pendingPlan ? (
        <ConfirmModal
          title={`Remap ${pendingPlan.entries.length} token path${pendingPlan.entries.length === 1 ? "" : "s"}?`}
          description={
            pendingPlan.scope === "selection"
              ? "Token Workshop will replace matching bindings on the selected layers."
              : "Token Workshop will replace matching bindings on every layer on this page."
          }
          confirmLabel={
            pendingPlan.scope === "selection" ? "Remap selection" : "Remap page"
          }
          wide
          onCancel={() => setPendingPlan(null)}
          onConfirm={() => {
            const plan = pendingPlan;
            setPendingPlan(null);
            executeRemap(plan.entries, plan.scope);
          }}
        >
          <div className="mt-2 max-h-[180px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
            {pendingPlan.entries.slice(0, 8).map((entry) => (
              <div
                key={`${entry.from}->${entry.to}`}
                className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-[var(--color-figma-border)] px-3 py-1 text-secondary last:border-b-0"
              >
                <span className="truncate font-mono text-[color:var(--color-figma-text-secondary)]" title={entry.from}>
                  {entry.from}
                </span>
                <ArrowRight
                  size={10}
                  strokeWidth={1.8}
                  className="text-[color:var(--color-figma-text-tertiary)]"
                  aria-hidden
                />
                <span className="truncate font-mono text-[color:var(--color-figma-text)]" title={entry.to}>
                  {entry.to}
                </span>
              </div>
            ))}
            {pendingPlan.entries.length > 8 ? (
              <div className="px-3 py-1 text-secondary text-[color:var(--color-figma-text-tertiary)]">
                {pendingPlan.entries.length - 8} more replacement{pendingPlan.entries.length - 8 === 1 ? "" : "s"}
              </div>
            ) : null}
          </div>
        </ConfirmModal>
      ) : null}
    </div>
  );
}
