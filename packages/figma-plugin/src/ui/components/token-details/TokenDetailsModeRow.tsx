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

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

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
      className={joinClasses("group/mode tm-token-mode-row", isEmpty && "tm-token-mode-row--empty")}
    >
      {(showModeLabel || editable) && (
        <div className="tm-token-mode-row__header">
          <div className="tm-token-mode-row__label">
            {modified && (
              <span
                className="shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--color-figma-accent)]"
                title="Modified"
                aria-label="Modified"
              />
            )}
            {showModeLabel ? (
              <span className="tm-token-mode-row__name" title={modeName}>
                {modeName}
              </span>
            ) : null}
          </div>

          {editable ? (
            <div className="tm-token-mode-row__controls">
              <button
                type="button"
                onClick={handleAliasToggle}
                className={joinClasses(
                  "tm-token-mode-row__icon-button",
                  aliasMode
                    ? "tm-token-mode-row__icon-button--active"
                    : "opacity-30 group-hover/mode:opacity-100",
                )}
                title={aliasMode ? "Switch to direct value" : "Switch to reference"}
                aria-label={
                  aliasMode ? "Switch to direct value" : "Switch to reference"
                }
              >
                <Link2 size={12} strokeWidth={1.5} aria-hidden />
              </button>
              {allowCopyFromPrevious && onCopyFromPrevious ? (
                <button
                  type="button"
                  onClick={onCopyFromPrevious}
                  className="tm-token-mode-row__icon-button opacity-30 group-hover/mode:opacity-100"
                  title="Copy from previous mode"
                  aria-label="Copy from previous mode"
                >
                  <Copy size={12} strokeWidth={1.5} aria-hidden />
                </button>
              ) : null}
              {allowCopyToAll && onCopyToAll ? (
                <button
                  type="button"
                  onClick={onCopyToAll}
                  className="tm-token-mode-row__icon-button opacity-30 group-hover/mode:opacity-100"
                  title="Copy to all other modes"
                  aria-label="Copy to all other modes"
                >
                  <Rows3 size={12} strokeWidth={1.5} aria-hidden />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <div className="tm-token-mode-row__body">
        <div className="tm-token-mode-row__value">
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
                className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 font-mono text-body text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-tertiary)]"
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
            className="tm-token-mode-row__swatch"
            style={{ backgroundColor: resolvedColorSwatch }}
            aria-label={`Color: ${resolvedColorSwatch}`}
          />
        )}
      </div>

      {typographyPreview && (
        <span
          className="tm-token-mode-row__typography"
          style={buildTypographyPreviewStyle(typographyPreview)}
        >
          Aa Bb Cc
        </span>
      )}
    </div>
  );
}
