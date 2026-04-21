/**
 * ValueCell — per-mode value display for the token list.
 *
 * Display-only: renders a type-aware preview (swatch, text, alias arrow) and
 * emits a request upward when the user clicks to edit, or clicks "+" on a
 * missing mode value. The quick editor popover is mounted by the parent row,
 * not by the cell itself, so every token type shares one editing surface.
 */
import { useRef } from "react";
import type { TokenMapEntry } from "../../../shared/types";
import { isAlias } from "../../../shared/resolveAlias";
import { formatValue } from "../tokenListUtils";
import { ValuePreview } from "../ValuePreview";
import { QUICK_EDITABLE_TYPES } from "../tokenListTypes";

export interface QuickEditRequest {
  anchor: DOMRect;
  optionName: string;
  collectionId: string;
  targetCollectionId: string | null;
  currentValue: TokenMapEntry | undefined;
}

interface ValueCellProps {
  tokenType: string | undefined;
  currentValue: TokenMapEntry | undefined;
  targetCollectionId: string | null;
  collectionId: string;
  optionName: string;
  /** Called when the user clicks the cell to edit — parent opens the quick editor popover. */
  onRequestQuickEdit?: (req: QuickEditRequest) => void;
  /** Fallback when quick editing isn't supported for this type. */
  onEdit?: () => void;
}

export function ValueCell({
  tokenType,
  currentValue: value,
  targetCollectionId,
  collectionId,
  optionName,
  onRequestQuickEdit,
  onEdit,
}: ValueCellProps) {
  const cellRef = useRef<HTMLDivElement>(null);

  const isAliasValue = isAlias(value?.$value);
  const canQuickEdit =
    !!tokenType &&
    (QUICK_EDITABLE_TYPES.has(tokenType) || isAliasValue) &&
    !!targetCollectionId &&
    !!onRequestQuickEdit;
  const canCreate = !value && !!tokenType && !!targetCollectionId && !!onRequestQuickEdit;

  const displayVal = value ? formatValue(value.$type, value.$value) : "—";

  const openQuickEdit = () => {
    if (!onRequestQuickEdit) return;
    const rect = cellRef.current?.getBoundingClientRect();
    if (!rect) return;
    onRequestQuickEdit({
      anchor: rect,
      optionName,
      collectionId,
      targetCollectionId,
      currentValue: value,
    });
  };

  const wrapperClass = `min-w-0 shrink-0 px-1 flex items-center gap-1 border-l border-[var(--color-figma-border)] h-full ${!value && !canCreate ? "bg-[var(--color-figma-warning,#f59e0b)]/5" : ""}`;

  return (
    <div
      ref={cellRef}
      className={wrapperClass}
      title={`${optionName}: ${displayVal}${targetCollectionId ? `\nSet: ${targetCollectionId}` : ""}`}
    >
      {!value ? (
        canCreate ? (
          <button
            type="button"
            className="text-body text-[var(--color-figma-text-tertiary)] cursor-pointer hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 rounded px-1 py-px transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              openQuickEdit();
            }}
            aria-label="Add mode value"
          >
            +
          </button>
        ) : onEdit ? (
          <button
            type="button"
            className="text-body text-[var(--color-figma-text-tertiary)] cursor-pointer hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 rounded px-1 py-px transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label="Add mode value"
          >
            +
          </button>
        ) : (
          <span className="text-body text-[var(--color-figma-text-tertiary)]">
            —
          </span>
        )
      ) : isAliasValue ? (
        <>
          <span
            className="shrink-0 text-[var(--color-figma-text-tertiary)]"
            aria-hidden="true"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
          </span>
          <span
            className={`text-body truncate min-w-0 font-mono ${canQuickEdit ? "cursor-pointer hover:underline hover:decoration-dotted text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]" : "text-[var(--color-figma-text-secondary)]"}`}
            onClick={canQuickEdit ? (e) => { e.stopPropagation(); openQuickEdit(); } : undefined}
          >
            {displayVal}
          </span>
        </>
      ) : (
        <>
          <span className="shrink-0">
            <ValuePreview type={value.$type} value={value.$value} size={16} />
          </span>
          <span
            className={`text-body truncate min-w-0 ${canQuickEdit ? "cursor-pointer hover:underline hover:decoration-dotted text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]" : "text-[var(--color-figma-text-secondary)]"}`}
            onClick={canQuickEdit ? (e) => { e.stopPropagation(); openQuickEdit(); } : undefined}
          >
            {displayVal}
          </span>
        </>
      )}
    </div>
  );
}
