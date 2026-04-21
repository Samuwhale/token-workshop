/**
 * ValueCell — compact inline-editable value cell for a single collection mode.
 * Used for every value column in the token table; single-mode collections
 * render one ValueCell, multi-mode collections render one per mode.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import type { TokenMapEntry } from "../../../shared/types";
import { isAlias, extractAliasPath } from "../../../shared/resolveAlias";
import { formatValue } from "../tokenListUtils";
import { ValuePreview } from "../ValuePreview";
import {
  getEditableString,
  parseInlineValue,
} from "../tokenListHelpers";
import { INLINE_SIMPLE_TYPES } from "../tokenListTypes";
import { AliasAutocomplete } from "../AliasAutocomplete";
import { useTokenTreeSharedData } from "../TokenTreeContext";

interface ValueCellProps {
  tokenPath: string;
  tokenType: string | undefined;
  value: TokenMapEntry | undefined;
  targetCollectionId: string | null;
  collectionId: string;
  optionName: string;
  onSave?: (
    path: string,
    type: string,
    newValue: any,
    targetCollectionId: string,
    collectionId: string,
    optionName: string,
    previousState?: { type?: string; value: unknown },
    options?: { allowGeneratedEdit?: boolean },
  ) => void;
  isTabPending?: boolean;
  onTabActivated?: () => void;
  onTab?: (direction: 1 | -1) => void;
  onEdit?: () => void;
}

export function ValueCell({
  tokenPath,
  tokenType,
  value,
  targetCollectionId,
  collectionId,
  optionName,
  onSave,
  isTabPending,
  onTabActivated,
  onTab,
  onEdit,
}: ValueCellProps) {
  const { allTokensFlat, pathToCollectionId } = useTokenTreeSharedData();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const escapedRef = useRef(false);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const cellRef = useRef<HTMLDivElement>(null);

  const [aliasEditing, setAliasEditing] = useState(false);
  const [aliasQuery, setAliasQuery] = useState("");
  const [aliasPopoverPos, setAliasPopoverPos] = useState({ x: 0, y: 0 });

  const isAliasValue = isAlias(value?.$value);
  const canEdit =
    !!tokenType &&
    INLINE_SIMPLE_TYPES.has(tokenType) &&
    !!targetCollectionId &&
    !!onSave &&
    !isAliasValue;
  const canEditAlias = isAliasValue && !!targetCollectionId && !!onSave;
  const canCreate =
    !value && !!tokenType && !!targetCollectionId && !!onSave;

  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  const canCreateRef = useRef(canCreate);
  canCreateRef.current = canCreate;
  const valueRef = useRef(value);
  valueRef.current = value;
  const tokenTypeRef = useRef(tokenType);
  tokenTypeRef.current = tokenType;
  const onTabActivatedRef = useRef(onTabActivated);
  onTabActivatedRef.current = onTabActivated;

  useEffect(() => {
    if (!isTabPending) return;
    if (tokenTypeRef.current === "color") {
      // Open the native color input for colors.
      if (canEditRef.current || canCreateRef.current) {
        colorInputRef.current?.click();
        onTabActivatedRef.current?.();
      }
      return;
    }
    if (canCreateRef.current) {
      setEditValue("");
      setEditing(true);
      onTabActivatedRef.current?.();
      return;
    }
    if (!canEditRef.current || !valueRef.current) return;
    setEditValue(
      getEditableString(tokenTypeRef.current!, valueRef.current.$value),
    );
    setEditing(true);
    onTabActivatedRef.current?.();
  }, [isTabPending]);

  const handleSubmit = useCallback(() => {
    if (!editing || !tokenType || !targetCollectionId || !onSave) return;
    const raw = editValue.trim();
    if (!raw) {
      setEditing(false);
      return;
    }
    const parsed = parseInlineValue(tokenType, raw);
    if (parsed === null) return;
    setEditing(false);
    onSave(tokenPath, tokenType, parsed, targetCollectionId, collectionId, optionName, {
      type: value?.$type ?? tokenType,
      value: value?.$value,
    });
  }, [editing, editValue, tokenType, targetCollectionId, collectionId, optionName, tokenPath, onSave, value]);

  const openAliasEditor = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = cellRef.current?.getBoundingClientRect();
      if (!rect) return;
      const currentPath = extractAliasPath(value?.$value) ?? "";
      setAliasQuery(currentPath);
      setAliasPopoverPos({ x: rect.left, y: rect.bottom + 4 });
      setAliasEditing(true);
    },
    [value],
  );

  const closeAliasEditor = useCallback(() => {
    setAliasEditing(false);
    setAliasQuery("");
  }, []);

  const displayVal = value ? formatValue(value.$type, value.$value) : "—";
  const isColor =
    tokenType === "color" &&
    value &&
    typeof value.$value === "string" &&
    !isAliasValue;

  const colorHex = isColor ? (value!.$value as string) : "";
  const colorHexBase = colorHex.startsWith("#")
    ? colorHex.slice(0, 7)
    : "#000000";
  const colorAlphaSuffix =
    colorHex.startsWith("#") && colorHex.length === 9 ? colorHex.slice(7) : "";

  const wrapperClass = `min-w-0 shrink-0 px-1.5 flex items-center gap-1.5 border-l border-[var(--color-figma-border)] h-full ${!value && !canCreate ? "bg-[var(--color-figma-warning,#f59e0b)]/5" : ""}`;

  return (
    <div
      ref={cellRef}
      className={wrapperClass}
      title={`${optionName}: ${displayVal}${targetCollectionId ? `\nSet: ${targetCollectionId}` : ""}`}
    >
      {(canEdit || canCreate) && tokenType === "color" && (
        <input
          type="color"
          ref={colorInputRef}
          key={colorHexBase}
          defaultValue={colorHexBase}
          className="sr-only"
          onBlur={(e) => {
            const newHex = e.target.value + colorAlphaSuffix;
            if (newHex !== colorHex) {
              onSave!(
                tokenPath,
                "color",
                newHex,
                targetCollectionId!,
                collectionId,
                optionName,
                {
                  type: value?.$type ?? "color",
                  value: value?.$value,
                },
              );
            }
          }}
        />
      )}
      {!value ? (
        canCreate ? (
          <button
            type="button"
            className={`text-body text-[var(--color-figma-text-tertiary)] ${tokenType === "color" ? "cursor-pointer" : "cursor-text"} hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 rounded px-1 py-px transition-colors`}
            onClick={(e) => {
              e.stopPropagation();
              if (tokenType === "color") {
                colorInputRef.current?.click();
              } else {
                setEditValue("");
                setEditing(true);
              }
            }}
            aria-label="Add mode value"
          >
            +
          </button>
        ) : onEdit ? (
          <button
            type="button"
            className="text-body text-[var(--color-figma-text-tertiary)] cursor-pointer hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 rounded px-1 py-px transition-colors"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            aria-label="Add mode value"
          >
            +
          </button>
        ) : (
          <span className="text-body text-[var(--color-figma-text-tertiary)]">
            —
          </span>
        )
      ) : editing ? (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => {
            if (escapedRef.current) {
              escapedRef.current = false;
              return;
            }
            handleSubmit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              escapedRef.current = true;
              setEditing(false);
            }
            if (e.key === "Tab") {
              e.preventDefault();
              e.stopPropagation();
              escapedRef.current = true;
              if (tokenType && targetCollectionId && onSave) {
                const raw = editValue.trim();
                if (raw) {
                  const parsed = parseInlineValue(tokenType, raw);
                  if (parsed !== null) {
                    onSave(
                      tokenPath,
                      tokenType,
                      parsed,
                      targetCollectionId,
                      collectionId,
                      optionName,
                      {
                        type: value?.$type ?? tokenType,
                        value: value?.$value,
                      },
                    );
                  }
                }
              }
              setEditing(false);
              onTab?.(e.shiftKey ? -1 : 1);
              return;
            }
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label="Edit token value"
          autoFocus
          className="text-body w-full text-[var(--color-figma-text)] bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] rounded px-1 outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)]"
        />
      ) : isAliasValue ? (
        <>
          <span
            className="shrink-0 text-[var(--color-figma-text-tertiary)]"
            aria-hidden="true"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7" /><path d="M8 7h9v9" /></svg>
          </span>
          <span
            className={`text-body truncate min-w-0 font-mono ${canEditAlias ? "cursor-pointer hover:underline hover:decoration-dotted text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]" : "text-[var(--color-figma-text-secondary)]"}`}
            onClick={canEditAlias ? openAliasEditor : undefined}
            title={`${optionName}: ${displayVal}${targetCollectionId ? `\nSet: ${targetCollectionId}` : ""}\nClick to redirect alias`}
          >
            {displayVal}
          </span>
          {aliasEditing && (
            <div
              className="fixed z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg p-2 w-64"
              style={{ top: aliasPopoverPos.y, left: aliasPopoverPos.x }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-1.5 text-secondary text-[var(--color-figma-text-tertiary)]">
                Redirect alias ·{" "}
                <span className="font-mono normal-case text-[var(--color-figma-text)]">
                  {optionName}
                </span>
              </div>
              <div className="relative">
                <input
                  autoFocus
                  type="text"
                  value={aliasQuery}
                  onChange={(e) => setAliasQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      closeAliasEditor();
                    }
                  }}
                  className="w-full border border-[var(--color-figma-border)] rounded px-2 py-1 text-body bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-tertiary)]"
                  placeholder="Search tokens…"
                />
                <AliasAutocomplete
                  query={aliasQuery}
                  allTokensFlat={allTokensFlat}
                  pathToCollectionId={pathToCollectionId}
                  filterType={tokenType}
                  onSelect={(path) => {
                    onSave!(
                      tokenPath,
                      tokenType || value.$type || "color",
                      `{${path}}`,
                      targetCollectionId!,
                      collectionId,
                      optionName,
                      { type: value.$type, value: value.$value },
                    );
                    closeAliasEditor();
                  }}
                  onClose={closeAliasEditor}
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <span
            className={`shrink-0 ${canEdit && isColor ? "cursor-pointer hover:ring-1 hover:ring-[var(--color-figma-accent)] rounded" : ""}`}
            onClick={
              canEdit && isColor
                ? (e) => {
                    e.stopPropagation();
                    colorInputRef.current?.click();
                  }
                : undefined
            }
          >
            <ValuePreview type={value.$type} value={value.$value} size={16} />
          </span>
          <span
            className={`text-body truncate min-w-0 ${canEdit ? "cursor-text hover:underline hover:decoration-dotted text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]" : "text-[var(--color-figma-text-secondary)]"}`}
            onClick={
              canEdit && !isColor
                ? (e) => {
                    e.stopPropagation();
                    setEditValue(getEditableString(value.$type, value.$value));
                    setEditing(true);
                  }
                : canEdit && isColor
                  ? (e) => {
                      e.stopPropagation();
                      colorInputRef.current?.click();
                    }
                  : undefined
            }
          >
            {displayVal}
          </span>
        </>
      )}
    </div>
  );
}
