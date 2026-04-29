/**
 * ValueCell — per-mode value display for the token list.
 *
 * Display-only: renders a type-aware preview (swatch, text, alias/derivation marker) and
 * emits a request upward when the user clicks to edit, or clicks "+" on a
 * missing mode value. The quick editor popover is mounted by the parent row,
 * not by the cell itself, so every token type shares one editing surface.
 */
import { useRef } from "react";
import type { CSSProperties } from "react";
import { AlertTriangle, Link2 } from "lucide-react";
import type { TokenMapEntry } from "../../../shared/types";
import { extractAliasPath, isAlias } from "../../../shared/resolveAlias";
import { formatValue } from "../tokenListUtils";
import { ValuePreview, previewIsValueBearing } from "../ValuePreview";
import { QUICK_EDITABLE_TYPES } from "../tokenListTypes";
import { DerivationGlyph } from "./tokenTreeNodeShared";
import { getValueCellPresentation } from "./valueCellPresentation";

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
  /** Path of the token whose row this cell belongs to — used by the alias glyph to pass `fromPath`. */
  sourceTokenPath: string;
  /** Called when the user clicks the cell to edit — parent opens the quick editor popover. */
  onRequestQuickEdit?: (req: QuickEditRequest) => void;
  /** Fallback when quick editing isn't supported for this type. */
  onEdit?: () => void;
  /** When provided, the alias link glyph becomes a button that navigates to the alias target. */
  onNavigateToAlias?: (target: string, from?: string) => void;
}

function hasDerivationExtension(entry: TokenMapEntry | undefined): boolean {
  const tokenManager = entry?.$extensions?.tokenmanager;
  if (
    !tokenManager ||
    typeof tokenManager !== "object" ||
    Array.isArray(tokenManager)
  ) {
    return false;
  }
  return (tokenManager as { derivation?: unknown }).derivation !== undefined;
}

export function ValueCell({
  tokenType,
  currentValue: value,
  targetCollectionId,
  collectionId,
  optionName,
  sourceTokenPath,
  onRequestQuickEdit,
  onEdit,
  onNavigateToAlias,
}: ValueCellProps) {
  const cellRef = useRef<HTMLDivElement>(null);

  const isBrokenAlias = isAlias(value?.$value);
  const resolvedAliasPath = value?.reference && !isBrokenAlias
    ? extractAliasPath(value.reference)
    : null;
  const isResolvedAlias = resolvedAliasPath != null;
  const isDerivation = hasDerivationExtension(value);
  const derivationSourcePath = isDerivation
    ? extractAliasPath(value?.reference ?? value?.$value)
    : null;
  const derivationLabel = derivationSourcePath
    ? `Modified from ${derivationSourcePath}`
    : "Modified value";
  const canQuickEdit =
    !!tokenType &&
    (QUICK_EDITABLE_TYPES.has(tokenType) || isBrokenAlias) &&
    !!targetCollectionId &&
    !!onRequestQuickEdit;
  const canCreate =
    !value && !!tokenType && !!targetCollectionId && !!onRequestQuickEdit;

  const displayVal = value ? formatValue(value.$type, value.$value) : "—";
  const presentation = value
    ? getValueCellPresentation(value)
    : null;
  const titleLines = [`${optionName}: ${displayVal}`];
  if (derivationSourcePath) {
    titleLines.push(`Modified from: ${derivationSourcePath}`);
  }
  if (targetCollectionId) titleLines.push(`Collection: ${targetCollectionId}`);

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

  const brokenAliasTint = isBrokenAlias
    ? "bg-[var(--color-figma-warning)]/5"
    : "";
  const emptyUneditableTint = !value && !canCreate
    ? "bg-[var(--color-figma-warning)]/5"
    : "";
  const wrapperClass = `flex h-full min-w-0 items-center gap-1.5 overflow-hidden px-1.5 ${brokenAliasTint} ${emptyUneditableTint}`;

  const derivationMarker = isDerivation ? (
    <span
      className="shrink-0 text-[var(--color-figma-text-secondary)]"
      title={derivationLabel}
      aria-label={derivationLabel}
    >
      <DerivationGlyph size={10} />
    </span>
  ) : null;
  const interactiveTextClass = canQuickEdit
    ? "cursor-pointer hover:text-[var(--color-figma-text)]"
    : "";

  const renderValueText = (
    primary: string,
    secondary?: string,
    options?: {
      primaryMonospace?: boolean;
      secondaryMonospace?: boolean;
      primaryClassName?: string;
      secondaryClassName?: string;
      primaryStyle?: CSSProperties;
      secondaryStyle?: CSSProperties;
    },
  ) => (
    <div
      className={`tm-value-cell__text ${interactiveTextClass}`}
      onClick={
        canQuickEdit
          ? (e) => {
              e.stopPropagation();
              openQuickEdit();
            }
          : undefined
      }
    >
      <div
        className={`tm-value-cell__line text-[11px] leading-[1.08] ${
          options?.primaryMonospace ? "font-mono" : ""
        } ${options?.primaryClassName ?? "text-[var(--color-figma-text)]"}`}
        style={options?.primaryStyle}
      >
        {primary}
      </div>
      {secondary ? (
        <div
          className={`tm-value-cell__line text-[10px] leading-[1.08] ${
            options?.secondaryMonospace ? "font-mono" : ""
          } ${
            options?.secondaryClassName ??
            "text-[var(--color-figma-text-tertiary)]"
          }`}
          style={options?.secondaryStyle}
        >
          {secondary}
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      ref={cellRef}
      className={`tm-value-cell ${wrapperClass}`}
      title={titleLines.join("\n")}
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
            aria-label={`Add ${optionName} value`}
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
            aria-label={`Add ${optionName} value`}
          >
            +
          </button>
        ) : (
          <span className="text-body text-[var(--color-figma-text-tertiary)]">
            —
          </span>
        )
      ) : isBrokenAlias ? (
        <>
          {derivationMarker}
          <span
            className="shrink-0 text-[var(--color-figma-warning)]"
            aria-label="Broken reference"
          >
            <AlertTriangle size={10} strokeWidth={2} aria-hidden />
          </span>
          {renderValueText(displayVal, "Reference not found", {
            primaryMonospace: true,
            primaryClassName:
              "font-mono italic text-[var(--color-figma-warning)]",
            secondaryClassName: "text-[var(--color-figma-warning)]/80",
          })}
        </>
      ) : isResolvedAlias ? (
        <>
          {derivationMarker}
          {!isDerivation && (
            onNavigateToAlias ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigateToAlias(resolvedAliasPath, sourceTokenPath);
                }}
                className="shrink-0 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-accent)] cursor-pointer rounded"
                aria-label={`Go to alias target ${resolvedAliasPath}`}
                title={`Go to ${resolvedAliasPath}`}
              >
                <Link2 size={10} strokeWidth={2} aria-hidden />
              </button>
            ) : (
              <span
                className="shrink-0 text-[var(--color-figma-text-tertiary)]"
                aria-label="Aliased value"
              >
                <Link2 size={10} strokeWidth={2} aria-hidden />
              </span>
            )
          )}
          {previewIsValueBearing(value.$type) && (
            <span className="shrink-0">
              <ValuePreview type={value.$type} value={value.$value} size={16} />
            </span>
          )}
          {renderValueText(
            isDerivation
              ? (presentation?.primary ?? displayVal)
              : presentation?.secondary
                ? `${presentation.primary} · ${presentation.secondary}`
                : (presentation?.primary ?? displayVal),
            isDerivation
              ? presentation?.secondary
              : (resolvedAliasPath ?? undefined),
            {
              primaryMonospace:
                isDerivation
                  ? presentation?.primaryMonospace
                  : Boolean(presentation?.primaryMonospace) &&
                    !presentation?.secondary,
              secondaryMonospace: isDerivation
                ? presentation?.secondaryMonospace
                : true,
              secondaryClassName: isDerivation
                ? undefined
                : "text-[var(--color-figma-text-secondary)]",
              primaryStyle: presentation?.primaryStyle,
              secondaryStyle: presentation?.secondaryStyle,
            },
          )}
        </>
      ) : (
        <>
          {derivationMarker}
          {previewIsValueBearing(value.$type) && (
            <span className="shrink-0">
              <ValuePreview type={value.$type} value={value.$value} size={16} />
            </span>
          )}
          {renderValueText(
            presentation?.primary ?? displayVal,
            presentation?.secondary,
            {
              primaryMonospace: presentation?.primaryMonospace,
              secondaryMonospace: presentation?.secondaryMonospace,
              primaryStyle: presentation?.primaryStyle,
              secondaryStyle: presentation?.secondaryStyle,
            },
          )}
        </>
      )}
    </div>
  );
}
