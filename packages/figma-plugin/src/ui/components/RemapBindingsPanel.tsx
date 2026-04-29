import { useEffect, useMemo, useState } from "react";
import type { TokenMapEntry } from "../../shared/types";
import { InlineBanner } from "./InlineBanner";
import { RemapAutocompleteInput } from "./RemapAutocompleteInput";

export interface RemapBindingsRow {
  id: string;
  from: string;
  to: string;
  suggested?: boolean;
}

function newRemapRowId(): string {
  return Math.random().toString(36).slice(2);
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

  const handleRemap = () => {
    const normalizedRows = remapRows.map((row) => ({
      from: row.from.trim(),
      to: row.to.trim(),
    }));
    const hasAnyInput = normalizedRows.some((row) => row.from || row.to);
    const validEntries = normalizedRows.filter(
      (row) => row.from && row.to && row.from !== row.to,
    );

    if (validEntries.length === 0) {
      if (hasAnyInput) {
        setRemapValidationMessage(
          "Add at least one row with both paths filled and different values.",
        );
      }
      return;
    }

    const remapMap = Object.fromEntries(
      validEntries.map((row) => [row.from, row.to]),
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
          scope: remapScope,
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
            onClick={onClose}
            className="rounded p-0.5 text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            title="Close"
            aria-label="Close"
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <p className="mb-1.5 text-secondary leading-relaxed text-[color:var(--color-figma-text-secondary)]">
        Find and replace token paths. The left side can search both live tokens
        and stale paths seen in the current bindings or the latest sync result.
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
              placeholder="old.token.path"
              tokenMap={tokenMap}
              additionalPaths={fromAutocompletePaths}
            />
            <svg
              width="8"
              height="8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-[color:var(--color-figma-text-secondary)]"
              aria-hidden="true"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
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
              placeholder="new.token.path"
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
                onClick={() =>
                  updateRows(remapRows.filter((_, rowIdx) => rowIdx !== idx))
                }
                className="shrink-0 rounded p-0.5 text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-error)]"
                title="Remove row"
                aria-label="Remove row"
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden="true"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      {statusBanner ? <div className="mb-1.5">{statusBanner}</div> : null}

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => updateRows([...remapRows, createEmptyRemapRow()])}
          className="text-secondary text-[color:var(--color-figma-accent)] hover:underline"
        >
          + Add row
        </button>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() =>
              setRemapScope((currentScope) => {
                setRemapResult(null);
                return currentScope === "selection" ? "page" : "selection";
              })
            }
            className="rounded bg-[var(--color-figma-bg-hover)] px-1.5 py-0.5 text-[var(--font-size-xs)] text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg)]"
            title="Toggle scope between selection and entire page"
          >
            {remapScope === "selection" ? "Selection" : "Page"}
          </button>
          <button
            onClick={handleRemap}
            disabled={remapDisabled}
            className="rounded bg-[var(--color-figma-action-bg)] px-2 py-0.5 text-secondary text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-50"
          >
            {remapRunning ? "Remapping…" : "Remap"}
          </button>
        </div>
      </div>
    </div>
  );
}
