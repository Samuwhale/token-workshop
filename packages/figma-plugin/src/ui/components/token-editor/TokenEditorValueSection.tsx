import type { TokenMapEntry } from "../../../shared/types";
import { ValueDiff, OriginalValuePreview } from "../ValueDiff";
import { TokenNudge } from "../TokenNudge";
import type { NearbyMatch } from "../../hooks/useNearbyTokenMatch";
import type { TokenEditorValue } from "../../shared/tokenEditorTypes";
import {
  ColorEditor,
  DimensionEditor,
  TypographyEditor,
  ShadowEditor,
  BorderEditor,
  GradientEditor,
  NumberEditor,
  DurationEditor,
  FontFamilyEditor,
  FontWeightEditor,
  StrokeStyleEditor,
  StringEditor,
  BooleanEditor,
  CompositionEditor,
  AssetEditor,
  FontStyleEditor,
  TextDecorationEditor,
  TextTransformEditor,
  PercentageEditor,
  LinkEditor,
  LetterSpacingEditor,
  LineHeightEditor,
  CubicBezierEditor,
  TransitionEditor,
  CustomEditor,
  VALUE_FORMAT_HINTS,
} from "../ValueEditors";

function buildTypographyPreviewStyle(value: Record<string, unknown>): React.CSSProperties {
  const style: React.CSSProperties = {};
  if (typeof value.fontFamily === "string" && value.fontFamily) {
    style.fontFamily = value.fontFamily;
  }
  if (value.fontSize != null) {
    const fs = value.fontSize;
    if (typeof fs === "object" && fs !== null && "value" in fs) {
      const { value: v, unit } = fs as { value: number; unit?: string };
      style.fontSize = `${Math.min(v, 48)}${unit || "px"}`;
    } else if (typeof fs === "number") {
      style.fontSize = `${Math.min(fs, 48)}px`;
    }
  }
  if (typeof value.fontWeight === "number" || typeof value.fontWeight === "string") {
    style.fontWeight = value.fontWeight as React.CSSProperties["fontWeight"];
  }
  if (typeof value.lineHeight === "number") {
    style.lineHeight = value.lineHeight;
  }
  if (value.letterSpacing != null) {
    const ls = value.letterSpacing;
    if (typeof ls === "object" && ls !== null && "value" in ls) {
      const { value: v, unit } = ls as { value: number; unit?: string };
      style.letterSpacing = `${v}${unit || "px"}`;
    }
  }
  return style;
}

function getTypographyPreviewValue(
  value: TokenEditorValue,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const previewValue = value as Record<string, unknown>;
  const hasPreviewContent =
    typeof previewValue.fontFamily === "string" || previewValue.fontSize != null;

  return hasPreviewContent ? previewValue : null;
}

export interface TokenEditorValueSectionProps {
  tokenPath: string;
  tokenType: string;
  value: TokenEditorValue;
  setValue: (v: TokenEditorValue) => void;
  isCreateMode: boolean;
  extendsPath: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  /** The initial server value (for showing diffs). Null when creating. */
  initialValue: TokenEditorValue | null;
  // Typography-specific
  fontFamilyRef: React.RefObject<HTMLInputElement>;
  fontSizeRef: React.RefObject<HTMLInputElement>;
  availableFonts: string[];
  fontWeightsByFamily: Record<string, number[]>;
  // Validation
  canSave: boolean;
  saveBlockReason: string | null;
  focusBlockedField: () => void;
  // Paste
  pasteFlash: boolean;
  onPaste: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  // Nudge
  nearbyMatches: NearbyMatch[];
  onAcceptNudge: (path: string) => void;
  // Ref for container
  valueEditorContainerRef: React.RefObject<HTMLDivElement>;
}

export function TokenEditorValueSection({
  tokenPath,
  tokenType,
  value,
  setValue,
  isCreateMode,
  extendsPath,
  allTokensFlat,
  pathToCollectionId,
  initialValue,
  fontFamilyRef,
  fontSizeRef,
  availableFonts,
  fontWeightsByFamily,
  canSave,
  saveBlockReason,
  focusBlockedField,
  pasteFlash,
  onPaste,
  nearbyMatches,
  onAcceptNudge,
  valueEditorContainerRef,
}: TokenEditorValueSectionProps) {
  const baseValue: TokenMapEntry["$value"] | undefined = extendsPath
    ? allTokensFlat[extendsPath]?.$value
    : undefined;
  const typographyPreviewValue =
    tokenType === "typography" ? getTypographyPreviewValue(value) : null;

  return (
    <div
      className="flex flex-col gap-2"
      ref={valueEditorContainerRef}
      onPaste={onPaste}
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <label className="block text-[10px] text-[var(--color-figma-text-secondary)]">
            {extendsPath ? "Overrides" : "Value"}
          </label>
          <div className="flex items-center gap-1.5">
            {pasteFlash && (
              <span className="text-[10px] text-[var(--color-figma-accent)] font-medium animate-pulse">
                Pasted
              </span>
            )}
            {!canSave &&
              tokenType === "typography" &&
              saveBlockReason && (
                <button
                  type="button"
                  onClick={focusBlockedField}
                  className="text-[10px] text-[var(--color-figma-error)] hover:underline cursor-pointer bg-transparent border-none p-0"
                >
                  {saveBlockReason}
                </button>
              )}
          </div>
        </div>
        {VALUE_FORMAT_HINTS[tokenType] && (
          <span className="text-[10px] text-[var(--color-figma-text-tertiary)] italic">
            {VALUE_FORMAT_HINTS[tokenType]}
          </span>
        )}
      </div>
      {initialValue !== null &&
        !isCreateMode &&
        (JSON.stringify(value) !== JSON.stringify(initialValue) ? (
          <ValueDiff type={tokenType} before={initialValue} after={value} />
        ) : (
          <OriginalValuePreview type={tokenType} value={initialValue} />
        ))}
      <>
        {tokenType === "color" && (
          <ColorEditor
            value={value}
            onChange={setValue}
            autoFocus={!isCreateMode}
            allTokensFlat={allTokensFlat}
          />
        )}
        {tokenType === "dimension" && (
          <DimensionEditor
            key={tokenPath}
            value={value}
            onChange={setValue}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            autoFocus={!isCreateMode}
          />
        )}
        {tokenType === "typography" && (
          <TypographyEditor
            value={value}
            onChange={setValue}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            fontFamilyRef={fontFamilyRef}
            fontSizeRef={fontSizeRef}
            baseValue={baseValue}
            availableFonts={availableFonts}
            fontWeightsByFamily={fontWeightsByFamily}
          />
        )}
        {tokenType === "shadow" && (
          <ShadowEditor
            value={value}
            onChange={setValue}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            baseValue={baseValue}
          />
        )}
        {tokenType === "border" && (
          <BorderEditor
            value={value}
            onChange={setValue}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            baseValue={baseValue}
          />
        )}
        {tokenType === "gradient" && (
          <GradientEditor
            value={value}
            onChange={setValue}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
          />
        )}
        {tokenType === "number" && (
          <NumberEditor
            key={tokenPath}
            value={value}
            onChange={setValue}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            autoFocus={!isCreateMode}
          />
        )}
        {tokenType === "duration" && (
          <DurationEditor
            value={value}
            onChange={setValue}
            autoFocus={!isCreateMode}
          />
        )}
        {tokenType === "fontFamily" && (
          <FontFamilyEditor
            value={value}
            onChange={setValue}
            autoFocus={!isCreateMode}
            availableFonts={availableFonts}
          />
        )}
        {tokenType === "fontWeight" && (
          <FontWeightEditor value={value} onChange={setValue} />
        )}
        {tokenType === "strokeStyle" && (
          <StrokeStyleEditor value={value} onChange={setValue} />
        )}
        {tokenType === "string" && (
          <StringEditor
            value={value}
            onChange={setValue}
            autoFocus={!isCreateMode}
          />
        )}
        {tokenType === "boolean" && (
          <BooleanEditor value={value} onChange={setValue} />
        )}
        {tokenType === "composition" && (
          <CompositionEditor
            value={value}
            onChange={setValue}
            baseValue={baseValue}
          />
        )}
        {tokenType === "cubicBezier" && (
          <CubicBezierEditor value={value} onChange={setValue} />
        )}
        {tokenType === "transition" && (
          <TransitionEditor
            value={value}
            onChange={setValue}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
          />
        )}
        {tokenType === "fontStyle" && (
          <FontStyleEditor value={value} onChange={setValue} />
        )}
        {tokenType === "lineHeight" && (
          <LineHeightEditor value={value} onChange={setValue} />
        )}
        {tokenType === "letterSpacing" && (
          <LetterSpacingEditor value={value} onChange={setValue} />
        )}
        {tokenType === "percentage" && (
          <PercentageEditor value={value} onChange={setValue} />
        )}
        {tokenType === "link" && (
          <LinkEditor value={value} onChange={setValue} />
        )}
        {tokenType === "textDecoration" && (
          <TextDecorationEditor value={value} onChange={setValue} />
        )}
        {tokenType === "textTransform" && (
          <TextTransformEditor value={value} onChange={setValue} />
        )}
        {tokenType === "custom" && (
          <CustomEditor value={value} onChange={setValue} />
        )}
      </>
      {tokenType === "asset" && (
        <AssetEditor value={value} onChange={setValue} />
      )}
      {typographyPreviewValue && (
        <div
          className="overflow-hidden rounded border border-[var(--color-figma-border)]/50 bg-[var(--color-figma-bg-secondary)]/25 px-3 py-2"
          aria-label="Typography preview"
        >
          <span
            className="block text-[var(--color-figma-text)] leading-normal"
            style={buildTypographyPreviewStyle(typographyPreviewValue)}
          >
            Aa Bb Cc 123
          </span>
        </div>
      )}
      {/* Smart alias suggestion — exact & near matches */}
      <TokenNudge
        matches={nearbyMatches}
        tokenType={tokenType}
        onAccept={onAcceptNudge}
      />
    </div>
  );
}
