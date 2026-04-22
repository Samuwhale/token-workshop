import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Link2, Rows3 } from "lucide-react";
import { resolveRefValue } from "@tokenmanager/core";
import type { TokenMapEntry } from "../../../shared/types";
import { extractAliasPath, isAlias } from "../../../shared/resolveAlias";
import { AliasAutocomplete } from "../AliasAutocomplete";
import { ValuePreview } from "../ValuePreview";
import { ModeValueEditor } from "../token-editor/ModeValueEditor";
import { formatTokenValueForDisplay } from "../../shared/tokenFormatting";
import {
  buildTypographyPreviewStyle,
  getTypographyPreviewValue,
} from "../token-editor/tokenEditorHelpers";

export interface TokenDetailsModeRowProps {
  modeName: string;
  tokenType: string;
  value: unknown;
  editable: boolean;
  onChange?: (value: unknown) => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  showModeLabel?: boolean;
  autoFocus?: boolean;
  baseValue?: unknown;
  availableFonts?: string[];
  fontWeightsByFamily?: Record<string, number[]>;
  fontFamilyRef?: React.RefObject<HTMLInputElement>;
  fontSizeRef?: React.RefObject<HTMLInputElement>;
  modified?: boolean;
  onNavigateToToken?: (path: string) => void;
  allowCopyFromPrevious?: boolean;
  onCopyFromPrevious?: () => void;
  allowCopyToAll?: boolean;
  onCopyToAll?: () => void;
}

function resolveReadOnlyPresentation(
  rawValue: unknown,
  tokenType: string,
  allTokensFlat: Record<string, TokenMapEntry>,
) {
  const aliasTargetPath =
    typeof rawValue === "string" && isAlias(rawValue)
      ? extractAliasPath(rawValue)
      : null;
  const resolvedEntry = aliasTargetPath ? allTokensFlat[aliasTargetPath] : null;
  const resolvedType = resolvedEntry?.$type ?? tokenType;
  const resolvedValue = resolvedEntry?.$value ?? rawValue;
  const isUnresolvedAlias = aliasTargetPath !== null && !resolvedEntry;
  const displayValue =
    rawValue == null || rawValue === ""
      ? ""
      : formatTokenValueForDisplay(resolvedType, resolvedValue, {
          emptyPlaceholder: "",
        });

  return {
    aliasTargetPath,
    resolvedType,
    resolvedValue,
    isUnresolvedAlias,
    displayValue,
  };
}

export function TokenDetailsModeRow({
  modeName,
  tokenType,
  value,
  editable,
  onChange,
  allTokensFlat = {},
  pathToCollectionId = {},
  showModeLabel = true,
  autoFocus,
  baseValue,
  availableFonts,
  fontWeightsByFamily,
  fontFamilyRef,
  fontSizeRef,
  modified = false,
  onNavigateToToken,
  allowCopyFromPrevious = false,
  onCopyFromPrevious,
  allowCopyToAll = false,
  onCopyToAll,
}: TokenDetailsModeRowProps) {
  const previousLiteralValueRef = useRef<unknown>(value);
  const [aliasMode, setAliasMode] = useState(
    typeof value === "string" && isAlias(value),
  );
  const [aliasQuery, setAliasQuery] = useState(() =>
    typeof value === "string" && isAlias(value)
      ? extractAliasPath(value) ?? ""
      : "",
  );
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);

  useEffect(() => {
    if (typeof value === "string" && isAlias(value)) {
      setAliasMode(true);
      setAliasQuery(extractAliasPath(value) ?? "");
      return;
    }
    setAliasMode(false);
  }, [value]);

  const isEmpty = value === undefined || value === null || value === "";
  const resolvedColorSwatch =
    tokenType === "color" && typeof value === "string"
      ? isAlias(value)
        ? resolveRefValue(extractAliasPath(value) ?? "", allTokensFlat) ?? null
        : value
      : null;
  const typographyPreview =
    tokenType === "typography" ? getTypographyPreviewValue(value ?? "") : null;

  const readOnly = useMemo(
    () => resolveReadOnlyPresentation(value, tokenType, allTokensFlat),
    [allTokensFlat, tokenType, value],
  );

  const handleAliasToggle = () => {
    if (!editable || !onChange) return;

    if (aliasMode) {
      setAliasMode(false);
      setAutocompleteOpen(false);
      if (typeof value === "string" && isAlias(value)) {
        onChange(previousLiteralValueRef.current ?? "");
      }
      return;
    }

    previousLiteralValueRef.current = value;
    setAliasMode(true);
    setAliasQuery(
      typeof value === "string" && isAlias(value)
        ? extractAliasPath(value) ?? ""
        : "",
    );
    setAutocompleteOpen(true);
  };

  const handleAliasSelect = (path: string) => {
    if (!onChange) return;
    onChange(`{${path}}`);
    setAliasQuery(path);
    setAutocompleteOpen(false);
  };

  return (
    <div
      data-token-editor-mode={modeName}
      data-token-editor-alias={editable && aliasMode ? "1" : "0"}
      className={`group/mode flex flex-col${
        isEmpty ? " bg-[var(--color-figma-warning)]/5" : ""
      }`}
    >
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <div
          className={`${
            showModeLabel ? "w-[92px]" : ""
          } shrink-0 flex items-center gap-1`}
        >
          {modified && (
            <span
              className="shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--color-figma-accent)]"
              title="Modified"
              aria-label="Modified"
            />
          )}
          {showModeLabel && (
            <span
              className="truncate text-body font-medium text-[var(--color-figma-text)]"
              title={modeName}
            >
              {modeName}
            </span>
          )}
          {editable && (
            <button
              type="button"
              onClick={handleAliasToggle}
              className={`shrink-0 rounded p-0.5 transition-all ${
                aliasMode
                  ? "text-[var(--color-figma-accent)]"
                  : "opacity-30 group-hover/mode:opacity-100 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
              } hover:bg-[var(--color-figma-bg-hover)]`}
              title={aliasMode ? "Switch to direct value" : "Switch to reference"}
              aria-label={
                aliasMode ? "Switch to direct value" : "Switch to reference"
              }
            >
              <Link2 size={12} strokeWidth={1.5} aria-hidden />
            </button>
          )}
          {editable && allowCopyFromPrevious && onCopyFromPrevious && (
            <button
              type="button"
              onClick={onCopyFromPrevious}
              className="opacity-60 group-hover/mode:opacity-100 shrink-0 rounded p-0.5 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-all"
              title="Copy from previous mode"
              aria-label="Copy from previous mode"
            >
              <Copy size={12} strokeWidth={1.5} aria-hidden />
            </button>
          )}
          {editable && allowCopyToAll && onCopyToAll && (
            <button
              type="button"
              onClick={onCopyToAll}
              className="opacity-60 group-hover/mode:opacity-100 shrink-0 rounded p-0.5 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-all"
              title="Copy to all other modes"
              aria-label="Copy to all other modes"
            >
              <Rows3 size={12} strokeWidth={1.5} aria-hidden />
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {editable && aliasMode ? (
            <div className="relative">
              <input
                type="text"
                value={aliasQuery}
                onChange={(event) => {
                  setAliasQuery(event.target.value);
                  setAutocompleteOpen(true);
                }}
                onFocus={() => setAutocompleteOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setAutocompleteOpen(false);
                  }
                }}
                autoFocus={autoFocus}
                placeholder="Search tokens…"
                className="w-full font-mono border border-[var(--color-figma-border)] rounded px-2 py-0.5 text-body bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] outline-none placeholder:text-[var(--color-figma-text-tertiary)]"
              />
              {autocompleteOpen && (
                <AliasAutocomplete
                  query={aliasQuery}
                  allTokensFlat={allTokensFlat}
                  pathToCollectionId={pathToCollectionId}
                  filterType={tokenType}
                  onSelect={handleAliasSelect}
                  onClose={() => setAutocompleteOpen(false)}
                />
              )}
            </div>
          ) : editable ? (
            <ModeValueEditor
              tokenType={tokenType}
              value={value}
              onChange={onChange ?? (() => {})}
              allTokensFlat={allTokensFlat}
              pathToCollectionId={pathToCollectionId}
              autoFocus={autoFocus}
              baseValue={baseValue}
              availableFonts={availableFonts}
              fontWeightsByFamily={fontWeightsByFamily}
              fontFamilyRef={fontFamilyRef}
              fontSizeRef={fontSizeRef}
            />
          ) : isEmpty ? (
            <span className="text-secondary italic text-[var(--color-figma-text-tertiary)]">
              Not set
            </span>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <ValuePreview
                type={readOnly.resolvedType}
                value={readOnly.resolvedValue}
                size={18}
              />
              {readOnly.aliasTargetPath ? (
                <div className="min-w-0 flex-1">
                  {onNavigateToToken ? (
                    <button
                      type="button"
                      onClick={() => onNavigateToToken(readOnly.aliasTargetPath!)}
                      className="inline-flex max-w-full items-center gap-1 text-left font-mono text-body text-[var(--color-figma-accent)] hover:underline"
                      title={`Open ${readOnly.aliasTargetPath}`}
                    >
                      <Link2 size={10} strokeWidth={1.5} aria-hidden />
                      <span className="truncate">{readOnly.aliasTargetPath}</span>
                    </button>
                  ) : (
                    <span className="font-mono text-body text-[var(--color-figma-accent)]">
                      {readOnly.aliasTargetPath}
                    </span>
                  )}
                  <div className="truncate text-secondary text-[var(--color-figma-text-secondary)]">
                    {readOnly.isUnresolvedAlias
                      ? "Reference not found"
                      : readOnly.displayValue}
                  </div>
                </div>
              ) : (
                <span
                  className="truncate font-mono text-body text-[var(--color-figma-text)]"
                  title={readOnly.displayValue}
                >
                  {readOnly.displayValue}
                </span>
              )}
            </div>
          )}
        </div>

        {resolvedColorSwatch && (
          <div
            className="shrink-0 w-4 h-4 rounded-sm border border-[var(--color-figma-border)]"
            style={{ backgroundColor: resolvedColorSwatch }}
            aria-label={`Color: ${resolvedColorSwatch}`}
          />
        )}
      </div>

      {typographyPreview && (
        <div className="px-2.5 pb-1.5">
          <span
            className="block truncate text-body text-[var(--color-figma-text-secondary)] leading-normal"
            style={buildTypographyPreviewStyle(typographyPreview)}
          >
            Aa Bb Cc
          </span>
        </div>
      )}
    </div>
  );
}
