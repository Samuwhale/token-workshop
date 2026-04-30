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
  const canActivateValue = canQuickEdit || !!onEdit;
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
      className="tm-value-cell__prefix text-[color:var(--color-figma-text-secondary)]"
      title={derivationLabel}
      aria-label={derivationLabel}
    >
      <DerivationGlyph size={10} />
    </span>
  ) : null;
  const interactiveTextClass = canActivateValue
    ? "cursor-pointer hover:text-[color:var(--color-figma-text)]"
    : "";
  const activateValue = () => {
    if (canQuickEdit) {
      openQuickEdit();
      return;
    }
    onEdit?.();
  };

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
  ) => {
    const content = (
      <>
        <div
          className={`tm-value-cell__line text-[11px] leading-[1.08] ${
            options?.primaryMonospace ? "font-mono" : ""
          } ${options?.primaryClassName ?? "text-[color:var(--color-figma-text)]"}`}
          style={options?.primaryStyle}
        >
          {primary}
        </div>
        {secondary ? (
          <div
            className={`tm-value-cell__line text-[var(--font-size-xs)] leading-[1.08] ${
              options?.secondaryMonospace ? "font-mono" : ""
            } ${
              options?.secondaryClassName ??
              "text-[color:var(--color-figma-text-tertiary)]"
            }`}
            style={options?.secondaryStyle}
          >
            {secondary}
          </div>
        ) : null}
      </>
    );

    if (!canActivateValue) {
      return <div className={`tm-value-cell__text ${interactiveTextClass}`}>{content}</div>;
    }

    return (
      <button
        type="button"
        className={`tm-value-cell__text tm-value-cell__text--button border-0 bg-transparent p-0 text-left outline-none focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-accent)] ${interactiveTextClass}`}
        onClick={(event) => {
          event.stopPropagation();
          activateValue();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
        }}
        aria-label={`Edit ${optionName} value`}
        title={`${optionName}: ${primary}`}
      >
        {content}
      </button>
    );
  };

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
            className="tm-value-cell__create-button"
            onClick={(e) => {
              e.stopPropagation();
              openQuickEdit();
            }}
            aria-label={`Add ${optionName} value`}
          >
            Add
          </button>
        ) : onEdit ? (
          <button
            type="button"
            className="tm-value-cell__create-button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label={`Add ${optionName} value`}
          >
            Add
          </button>
        ) : (
          <span className="text-body text-[color:var(--color-figma-text-tertiary)]">
            —
          </span>
        )
      ) : isBrokenAlias ? (
        <>
          {derivationMarker}
          <span
            className="tm-value-cell__status text-[color:var(--color-figma-text-warning)]"
            aria-label="Broken reference"
          >
            <AlertTriangle size={10} strokeWidth={2} aria-hidden />
          </span>
          {renderValueText(displayVal, "Reference not found", {
            primaryMonospace: true,
            primaryClassName:
              "font-mono italic text-[color:var(--color-figma-text-warning)]",
            secondaryClassName: "text-[color:var(--color-figma-text-warning)]/80",
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
                className="tm-value-cell__nav text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text-accent)] cursor-pointer rounded"
                aria-label={`Go to alias target ${resolvedAliasPath}`}
                title={`Go to ${resolvedAliasPath}`}
              >
                <Link2 size={10} strokeWidth={2} aria-hidden />
              </button>
            ) : (
              <span
                className="tm-value-cell__nav text-[color:var(--color-figma-text-tertiary)]"
                aria-label="Aliased value"
              >
                <Link2 size={10} strokeWidth={2} aria-hidden />
              </span>
            )
          )}
          {previewIsValueBearing(value.$type) && (
            <span className="tm-value-cell__preview">
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
                : "text-[color:var(--color-figma-text-secondary)]",
              primaryStyle: presentation?.primaryStyle,
              secondaryStyle: presentation?.secondaryStyle,
            },
          )}
        </>
      ) : (
        <>
          {derivationMarker}
          {previewIsValueBearing(value.$type) && (
            <span className="tm-value-cell__preview">
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
