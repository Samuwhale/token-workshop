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
import { AlertTriangle, Link2, Plus } from "lucide-react";
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
  const tokenWorkshopExtension = entry?.$extensions?.tokenworkshop;
  if (
    !tokenWorkshopExtension ||
    typeof tokenWorkshopExtension !== "object" ||
    Array.isArray(tokenWorkshopExtension)
  ) {
    return false;
  }
  return (tokenWorkshopExtension as { derivation?: unknown }).derivation !== undefined;
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
  const hasAliasNavigationAction = Boolean(
    value && isResolvedAlias && !isDerivation && onNavigateToAlias,
  );
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
  const canActivateWrapper = Boolean(
    value && canActivateValue && !hasAliasNavigationAction,
  );
  const canActivateText = Boolean(
    value && canActivateValue && hasAliasNavigationAction,
  );
  const canCreate =
    !value && !!tokenType && !!targetCollectionId && !!onRequestQuickEdit;
  const canAddValue = !value && (canCreate || !!onEdit);
  const valueState =
    !value
      ? canAddValue
        ? "empty"
        : "unavailable"
      : isBrokenAlias
        ? "broken-alias"
        : isResolvedAlias
          ? isDerivation
            ? "derived-alias"
            : "resolved-alias"
          : isDerivation
            ? "derived-literal"
            : "literal";

  const displayVal = value ? formatValue(value.$type, value.$value) : "—";
  const presentation = value
    ? getValueCellPresentation(value)
    : null;
  const titleLines = [`${optionName}: ${displayVal}`];
  if (isResolvedAlias && resolvedAliasPath) {
    titleLines.push(`Reference: ${resolvedAliasPath}`);
  }
  if (derivationSourcePath) {
    titleLines.push(`Modified from: ${derivationSourcePath}`);
  }
  if (targetCollectionId) titleLines.push(`Collection: ${targetCollectionId}`);
  if (canActivateValue) {
    titleLines.push("Click to edit");
  }
  if (canAddValue) {
    titleLines.push("Click to add a value");
  }

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
  const emptyUneditableTint = !value && !canAddValue
    ? "bg-[var(--color-figma-warning)]/5"
    : "";
  const wrapperClass = [
    "tm-value-cell__wrapper",
    "flex h-full min-w-0 items-center gap-1.5 overflow-hidden px-1.5",
    canActivateValue || canAddValue
      ? "tm-value-cell__wrapper--interactive"
      : null,
    brokenAliasTint,
    emptyUneditableTint,
  ]
    .filter(Boolean)
    .join(" ");

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
  const handleAddValue = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (canCreate) {
      openQuickEdit();
      return;
    }
    onEdit?.();
  };
  const handleWrapperClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!canActivateWrapper) {
      return;
    }
    event.stopPropagation();
    activateValue();
  };
  const handleWrapperKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canActivateWrapper) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      activateValue();
    }
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
    const buttonLabel = secondary
      ? `${optionName}: ${primary}. ${secondary}`
      : `${optionName}: ${primary}`;
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

    if (canActivateText) {
      return (
        <button
          type="button"
          className={`tm-value-cell__text tm-value-cell__text--buttonlike tm-value-cell__text--button border-0 bg-transparent p-0 text-left ${interactiveTextClass}`}
          onClick={(event) => {
            event.stopPropagation();
            activateValue();
          }}
          aria-label={`Edit ${buttonLabel}`}
          title={buttonLabel}
        >
          {content}
        </button>
      );
    }

    return (
      <div
        className={`tm-value-cell__text ${
          canActivateWrapper ? "tm-value-cell__text--buttonlike" : ""
        } ${interactiveTextClass}`}
        aria-label={canActivateWrapper ? `Edit ${buttonLabel}` : undefined}
        title={buttonLabel}
      >
        {content}
      </div>
    );
  };

  return (
    <div
      ref={cellRef}
      data-token-mode-cell={optionName}
      data-interactive={canActivateValue || canAddValue ? "true" : undefined}
      data-empty={!value ? "true" : undefined}
      data-broken={isBrokenAlias ? "true" : undefined}
      data-unavailable={!value && !canAddValue ? "true" : undefined}
      data-value-state={valueState}
      className={`tm-value-cell ${wrapperClass}`}
      title={titleLines.join("\n")}
      role={canActivateWrapper ? "button" : undefined}
      tabIndex={canActivateWrapper ? 0 : undefined}
      aria-label={
        canActivateWrapper ? `Edit ${titleLines.join(". ")}` : undefined
      }
      onClick={handleWrapperClick}
      onKeyDown={handleWrapperKeyDown}
    >
      {!value ? (
        canAddValue ? (
          <div className="tm-value-cell__empty-action">
            <button
              type="button"
              className="tm-value-cell__create-button tm-value-cell__interactive-control"
              onClick={handleAddValue}
              aria-label={`Add ${optionName} value`}
              title={`Add ${optionName} value`}
            >
              <Plus size={10} strokeWidth={2} aria-hidden />
              <span className="tm-value-cell__create-button-label">Add value</span>
            </button>
          </div>
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
          {renderValueText(displayVal, "Broken reference", {
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
                className="tm-value-cell__nav tm-value-cell__interactive-control cursor-pointer rounded text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text-accent)]"
                aria-label={`Go to referenced token ${resolvedAliasPath}`}
                title={`Go to ${resolvedAliasPath}`}
              >
                <Link2 size={10} strokeWidth={2} aria-hidden />
              </button>
            ) : (
              <span
                className="tm-value-cell__nav text-[color:var(--color-figma-text-tertiary)]"
                aria-label="Referenced value"
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
                : "tm-value-cell__line--wrap text-[color:var(--color-figma-text-secondary)]",
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
