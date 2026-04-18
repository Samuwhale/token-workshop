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
      {/* Smart alias suggestion — exact & near matches */}
      <TokenNudge
        matches={nearbyMatches}
        tokenType={tokenType}
        onAccept={onAcceptNudge}
      />
    </div>
  );
}
