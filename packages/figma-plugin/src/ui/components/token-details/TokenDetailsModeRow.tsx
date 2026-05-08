import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Link2, Rows3 } from "lucide-react";
import { resolveCollectionIdForPath } from "@token-workshop/core";
import type { TokenMapEntry } from "../../../shared/types";
import {
  extractAliasPath,
  isAlias,
  resolveAliasEntry,
} from "../../../shared/resolveAlias";
import { AliasAutocomplete } from "../AliasAutocomplete";
import { ValuePreview } from "../ValuePreview";
import { ModeValueEditor } from "../token-editor/ModeValueEditor";
import { formatTokenValueForDisplay } from "../../shared/tokenFormatting";
import { getDefaultValue } from "../tokenListUtils";
import {
  buildTypographyPreviewStyle,
  getTypographyPreviewValue,
} from "../token-editor/tokenEditorHelpers";
import { formatCollectionDisplayNameList } from "../../shared/libraryCollections";

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
  collectionIdsByPath?: Record<string, string[]>;
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>;
  preferredCollectionId?: string;
  collectionDisplayNames?: Record<string, string>;
  showModeLabel?: boolean;
  autoFocus?: boolean;
  inheritedValue?: unknown;
  availableFonts?: string[];
  fontWeightsByFamily?: Record<string, number[]>;
  fontFamilyRef?: React.RefObject<HTMLInputElement>;
  fontSizeRef?: React.RefObject<HTMLInputElement>;
  modified?: boolean;
  onNavigateToToken?: (path: string, collectionId?: string) => void;
  allowCopyFromPrevious?: boolean;
  previousModeName?: string;
  onCopyFromPrevious?: () => void;
  allowCopyToAll?: boolean;
  onCopyToAll?: () => void;
}

function resolveReadOnlyPresentation(
  rawValue: unknown,
  tokenType: string,
  allTokensFlat: Record<string, TokenMapEntry>,
  pathToCollectionId: Record<string, string>,
  collectionIdsByPath: Record<string, string[]>,
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
  preferredCollectionId?: string,
) {
  const aliasTargetPath =
    typeof rawValue === "string" && isAlias(rawValue)
      ? extractAliasPath(rawValue)
      : null;
  const aliasResolution = aliasTargetPath
    ? resolveCollectionIdForPath({
        path: aliasTargetPath,
        pathToCollectionId,
        collectionIdsByPath,
        preferredCollectionId,
      })
    : null;
  const aliasTargetCollectionId = aliasResolution?.collectionId;
  const aliasTokenMap =
    aliasTargetCollectionId
      ? perCollectionFlat[aliasTargetCollectionId] ?? allTokensFlat
      : allTokensFlat;
  const aliasDirectEntry =
    aliasTargetPath && aliasResolution?.reason !== "ambiguous"
      ? aliasTokenMap[aliasTargetPath]
      : null;
  const resolvedEntry =
    aliasTargetPath && aliasDirectEntry
      ? resolveAliasEntry(aliasTargetPath, aliasTokenMap) ?? aliasDirectEntry
      : null;
  const resolvedType = resolvedEntry?.$type ?? tokenType;
  const resolvedValue = resolvedEntry?.$value ?? rawValue;
  const isAmbiguousAlias = aliasResolution?.reason === "ambiguous";
  const isUnresolvedAlias =
    aliasTargetPath !== null && (!resolvedEntry || isAmbiguousAlias);
  const displayValue =
    rawValue == null || rawValue === ""
      ? ""
      : formatTokenValueForDisplay(resolvedType, resolvedValue, {
          emptyPlaceholder: "",
        });

  return {
    aliasTargetPath,
    aliasTargetCollectionId,
    resolvedType,
    resolvedValue,
    isAmbiguousAlias,
    isUnresolvedAlias,
    displayValue,
  };
}

function getInitialModeValue(tokenType: string): unknown {
  if (tokenType === "string") return "Text";
  if (tokenType === "asset") return "https://example.com/asset.png";
  return getDefaultValue(tokenType);
}

export function TokenDetailsModeRow({
  modeName,
  tokenType,
  value,
  editable,
  onChange,
  allTokensFlat = {},
  pathToCollectionId = {},
  collectionIdsByPath = {},
  perCollectionFlat = {},
  preferredCollectionId,
  collectionDisplayNames,
  showModeLabel = true,
  autoFocus,
  inheritedValue,
  availableFonts,
  fontWeightsByFamily,
  fontFamilyRef,
  fontSizeRef,
  modified = false,
  onNavigateToToken,
  allowCopyFromPrevious = false,
  previousModeName,
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
    previousLiteralValueRef.current = value;
    setAliasMode(false);
  }, [value]);

  const isEmpty = value === undefined || value === null || value === "";
  const aliasStatusId = `mode-alias-status-${modeName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}`;
  const aliasQueryTrimmed = aliasQuery.trim();
  const aliasResolution =
    aliasQueryTrimmed.length > 0
      ? resolveCollectionIdForPath({
          path: aliasQueryTrimmed,
          pathToCollectionId,
          collectionIdsByPath,
          preferredCollectionId,
        })
      : null;
  const ambiguousAliasCollectionIds =
    aliasResolution?.reason === "ambiguous"
      ? collectionIdsByPath[aliasQueryTrimmed] ?? []
      : [];
  const aliasTargetAmbiguous = aliasResolution?.reason === "ambiguous";
  const aliasTargetExists =
    aliasQueryTrimmed.length === 0 || aliasResolution?.reason !== "missing";
  const showAliasMissingState =
    editable && aliasMode && aliasQueryTrimmed.length > 0 && !aliasTargetExists;
  const showAliasAmbiguousState =
    editable && aliasMode && aliasQueryTrimmed.length > 0 && aliasTargetAmbiguous;
  const typographyPreview =
    tokenType === "typography" ? getTypographyPreviewValue(value ?? "") : null;
  const hasSecondaryActions =
    (allowCopyFromPrevious && onCopyFromPrevious) ||
    (allowCopyToAll && onCopyToAll);

  const readOnly = useMemo(
    () =>
      resolveReadOnlyPresentation(
        value,
        tokenType,
        allTokensFlat,
        pathToCollectionId,
        collectionIdsByPath,
        perCollectionFlat,
        preferredCollectionId,
      ),
    [
      allTokensFlat,
      collectionIdsByPath,
      pathToCollectionId,
      perCollectionFlat,
      preferredCollectionId,
      tokenType,
      value,
    ],
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

  const commitAliasQuery = () => {
    if (!onChange) return;
    const path = aliasQuery.trim();
    const resolution = resolveCollectionIdForPath({
      path,
      pathToCollectionId,
      collectionIdsByPath,
      preferredCollectionId,
    });
    if (!path || !resolution.collectionId || resolution.reason === "ambiguous") {
      return;
    }
    onChange(`{${path}}`);
    setAliasQuery(path);
    setAutocompleteOpen(false);
  };

  const showHeader = showModeLabel;
  const controls = editable ? (
    <div className="tm-token-mode-row__controls">
      <button
        type="button"
        onClick={handleAliasToggle}
        aria-pressed={aliasMode}
        className={joinClasses(
          "tm-token-mode-row__action-button",
          aliasMode && "tm-token-mode-row__action-button--active",
        )}
        title={
          aliasMode
            ? `Use a direct value for ${modeName}`
            : `Alias another token for ${modeName}`
        }
        aria-label={
          aliasMode
            ? `Use a direct value for ${modeName}`
            : `Alias another token for ${modeName}`
        }
      >
        <Link2 size={12} strokeWidth={1.5} aria-hidden />
        <span className="tm-token-mode-row__action-button-label">
          {aliasMode ? "Aliased" : "Alias"}
        </span>
      </button>
    </div>
  ) : null;

  return (
    <div
      data-token-editor-mode={modeName}
      data-token-editor-alias={editable && aliasMode ? "1" : "0"}
      className={joinClasses(
        "group/mode tm-token-mode-row",
        isEmpty && "tm-token-mode-row--empty",
      )}
    >
      {showHeader && (
        <div className="tm-token-mode-row__header">
          <div className="tm-token-mode-row__header-main">
            {modified && (
              <span
                className="shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--color-figma-accent)]"
                title="Modified"
                aria-label="Modified"
              />
            )}
            <div className="tm-token-mode-row__label">
              {showModeLabel ? (
                <div className="tm-token-mode-row__label-line">
                  <span className="tm-token-mode-row__name" title={modeName}>
                    {modeName}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {controls}
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
                onBlur={() => {
                  window.setTimeout(commitAliasQuery, 120);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setAutocompleteOpen(false);
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitAliasQuery();
                  }
                }}
                autoFocus={autoFocus}
                placeholder="Choose a token to alias"
                aria-label={`${modeName} alias`}
                aria-invalid={showAliasMissingState || showAliasAmbiguousState}
                aria-describedby={
                  showAliasMissingState || showAliasAmbiguousState
                    ? aliasStatusId
                    : undefined
                }
                className={joinClasses(
                  "tm-token-mode-row__alias-input min-h-8 w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 font-mono text-body text-[color:var(--color-figma-text)] outline-none transition-colors hover:border-[color:var(--color-figma-text-tertiary)] focus-visible:border-[var(--color-figma-accent)] placeholder:text-[color:var(--color-figma-text-tertiary)]",
                  showAliasMissingState && "tm-token-mode-row__alias-input--invalid",
                  showAliasAmbiguousState && "tm-token-mode-row__alias-input--invalid",
                )}
              />
              {autocompleteOpen && (
                <AliasAutocomplete
                  query={aliasQuery}
                  allTokensFlat={allTokensFlat}
                  pathToCollectionId={pathToCollectionId}
                  preferredCollectionId={preferredCollectionId}
                  collectionDisplayNames={collectionDisplayNames}
                  filterType={tokenType}
                  onSelect={handleAliasSelect}
                  onClose={() => setAutocompleteOpen(false)}
                />
              )}
              {showAliasMissingState ? (
                <p
                  id={aliasStatusId}
                  className="tm-token-mode-row__helper"
                >
                  No token matches this reference yet. Create the target token first, or choose another token.
                </p>
              ) : showAliasAmbiguousState ? (
                <p
                  id={aliasStatusId}
                  className="tm-token-mode-row__helper"
                >
                  This path exists in {formatCollectionDisplayNameList(ambiguousAliasCollectionIds, collectionDisplayNames)}. References need one unique target path.
                </p>
              ) : null}
            </div>
          ) : editable && isEmpty ? (
            <div className="tm-token-mode-row__empty-actions">
              <button
                type="button"
                onClick={() => onChange?.(getInitialModeValue(tokenType))}
                aria-label={`Add direct value for ${modeName}`}
                title={`Add direct value for ${modeName}`}
                className="min-h-8 rounded border border-dashed border-[var(--color-figma-border)] px-2 py-1.5 text-left text-secondary font-medium text-[color:var(--color-figma-text-accent)] transition-colors hover:border-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/5"
              >
                Add value
              </button>
            </div>
          ) : editable ? (
            <ModeValueEditor
              tokenType={tokenType}
              value={value}
              onChange={onChange ?? (() => {})}
              allTokensFlat={allTokensFlat}
              pathToCollectionId={pathToCollectionId}
              autoFocus={autoFocus}
              inheritedValue={inheritedValue}
              availableFonts={availableFonts}
              fontWeightsByFamily={fontWeightsByFamily}
              fontFamilyRef={fontFamilyRef}
              fontSizeRef={fontSizeRef}
            />
          ) : isEmpty ? (
            <span className="tm-token-mode-row__empty-value">
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
                      onClick={() =>
                        onNavigateToToken(
                          readOnly.aliasTargetPath!,
                          readOnly.aliasTargetCollectionId,
                        )
                      }
                      className="inline-flex max-w-full items-center gap-1 text-left font-mono text-body text-[color:var(--color-figma-text-accent)] hover:underline"
                      aria-label={`Open aliased token ${readOnly.aliasTargetPath}`}
                      title={`Open ${readOnly.aliasTargetPath}`}
                    >
                      <Link2 size={10} strokeWidth={1.5} aria-hidden />
                      <span className="min-w-0 break-all">{readOnly.aliasTargetPath}</span>
                    </button>
                  ) : (
                    <span className="break-all font-mono text-body text-[color:var(--color-figma-text-accent)]">
                      {readOnly.aliasTargetPath}
                    </span>
                  )}
                  <div className="whitespace-pre-wrap break-words text-secondary text-[color:var(--color-figma-text-secondary)]">
                    {readOnly.isUnresolvedAlias
                      ? readOnly.isAmbiguousAlias
                        ? "Reference matches multiple collections"
                        : "Reference not found"
                      : readOnly.displayValue}
                  </div>
                </div>
              ) : (
                <span
                  className="whitespace-pre-wrap break-words font-mono text-body text-[color:var(--color-figma-text)]"
                  title={readOnly.displayValue}
                >
                  {readOnly.displayValue}
                </span>
              )}
            </div>
          )}
        </div>

        {!showHeader && (controls || modified) ? (
          <div className="tm-token-mode-row__inline-controls">
            {modified ? (
              <span
                className="tm-token-mode-row__inline-status"
                title="Modified"
                aria-label="Modified"
              />
            ) : null}
            {controls}
          </div>
        ) : null}
      </div>

      {editable && hasSecondaryActions ? (
        <div className="tm-token-mode-row__secondary-actions">
          {allowCopyFromPrevious && onCopyFromPrevious ? (
            <button
              type="button"
              onClick={onCopyFromPrevious}
              className="tm-token-mode-row__secondary-action"
            >
              <Copy size={12} strokeWidth={1.5} aria-hidden />
              {previousModeName
                ? `Use ${previousModeName} value`
                : "Use previous mode value"}
            </button>
          ) : null}
          {allowCopyToAll && onCopyToAll ? (
            <button
              type="button"
              onClick={onCopyToAll}
              className="tm-token-mode-row__secondary-action"
            >
              <Rows3 size={12} strokeWidth={1.5} aria-hidden />
              Copy to all modes
            </button>
          ) : null}
        </div>
      ) : null}

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
