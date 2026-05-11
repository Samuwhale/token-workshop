import { useEffect, useMemo, useState } from "react";
import type { SyncCompleteMessage, TokenMapEntry } from "../../shared/types";
import {
  RemapBindingsPanel,
  buildRemapRowsFromEntries,
  type RemapBindingsPrefillEntry,
  type RemapBindingsRow,
} from "./RemapBindingsPanel";
import { Button } from "../primitives";

interface CanvasRepairPanelProps {
  tokenMap: Record<string, TokenMapEntry>;
  syncResult: SyncCompleteMessage | null;
  prefillEntries: readonly RemapBindingsPrefillEntry[] | null;
  defaultScope?: "selection" | "page";
  onClose: () => void;
}

export function CanvasRepairPanel({
  tokenMap,
  syncResult,
  prefillEntries,
  defaultScope = "page",
  onClose,
}: CanvasRepairPanelProps) {
  const staleEntries = useMemo(() => {
    const byFrom = new Map<string, RemapBindingsPrefillEntry>();
    const add = (entry: RemapBindingsPrefillEntry) => {
      const from = entry.from.trim();
      if (!from || tokenMap[from]) return;
      const existing = byFrom.get(from);
      if (!existing || (!existing.to && entry.to)) byFrom.set(from, entry);
    };
    for (const entry of prefillEntries ?? []) add(entry);
    for (const path of syncResult?.missingTokens ?? []) add({ from: path });
    return Array.from(byFrom.values());
  }, [prefillEntries, syncResult, tokenMap]);

  const [rows, setRows] = useState<RemapBindingsRow[]>(() =>
    buildRemapRowsFromEntries(staleEntries),
  );

  useEffect(() => {
    setRows(buildRemapRowsFromEntries(staleEntries));
  }, [staleEntries]);

  const suggestedCount = staleEntries.filter(
    (entry) => entry.to && entry.to.trim().length > 0,
  ).length;
  const hasRepairWork = staleEntries.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2">
        <div className="text-secondary font-medium text-[color:var(--color-figma-text)]">
          Repair broken bindings
        </div>
        {hasRepairWork ? (
          <div className="text-secondary text-[color:var(--color-figma-text-secondary)]">
            {staleEntries.length} broken binding{staleEntries.length === 1 ? "" : "s"}
            {suggestedCount > 0 && ` · ${suggestedCount} suggested`}
          </div>
        ) : (
          <div className="text-secondary text-[color:var(--color-figma-text-secondary)]">
            Broken layer bindings appear here after selection inspection or sync.
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {hasRepairWork ? (
          <RemapBindingsPanel
            tokenMap={tokenMap}
            rows={rows}
            onRowsChange={setRows}
            fromSuggestions={staleEntries.map((entry) => entry.from)}
            onClose={onClose}
            defaultScope={defaultScope}
            embedded
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-[240px]">
              <div className="text-body font-medium text-[color:var(--color-figma-text)]">
                Nothing to repair right now
              </div>
              <p className="mt-1 text-secondary text-[color:var(--color-figma-text-secondary)]">
                When a layer points to a missing token, choose its replacement here.
              </p>
              <Button
                type="button"
                onClick={onClose}
                variant="secondary"
                size="sm"
                className="mt-3"
              >
                Back to Selection
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
