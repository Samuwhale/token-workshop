import { useMemo, useState } from "react";
import type { SyncCompleteMessage, TokenMapEntry } from "../../shared/types";
import {
  RemapBindingsPanel,
  buildRemapRowsFromEntries,
  type RemapBindingsPrefillEntry,
  type RemapBindingsRow,
} from "./RemapBindingsPanel";

interface CanvasRepairPanelProps {
  tokenMap: Record<string, TokenMapEntry>;
  syncResult: SyncCompleteMessage | null;
  prefillEntries: readonly RemapBindingsPrefillEntry[] | null;
}

export function CanvasRepairPanel({
  tokenMap,
  syncResult,
  prefillEntries,
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

  const suggestedCount = staleEntries.filter(
    (entry) => entry.to && entry.to.trim().length > 0,
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2">
        <div className="text-secondary font-medium text-[var(--color-figma-text)]">
          Repair broken bindings
        </div>
        {staleEntries.length > 0 && (
          <div className="text-secondary text-[var(--color-figma-text-secondary)]">
            {staleEntries.length} stale path{staleEntries.length === 1 ? "" : "s"} detected
            {suggestedCount > 0 && ` · ${suggestedCount} suggested`}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <RemapBindingsPanel
          tokenMap={tokenMap}
          rows={rows}
          onRowsChange={setRows}
          fromSuggestions={staleEntries.map((entry) => entry.from)}
          onClose={() => {}}
          embedded
        />
      </div>
    </div>
  );
}
