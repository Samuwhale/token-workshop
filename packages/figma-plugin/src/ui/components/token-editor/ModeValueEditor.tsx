import type { TokenMapEntry } from '../../../shared/types';
import { AssetEditor } from '../valueEditors/AssetEditor';
import { BooleanEditor } from '../valueEditors/BooleanEditor';
import { BorderEditor } from '../valueEditors/BorderEditor';
import { ColorEditor } from '../valueEditors/ColorEditor';
import { CompositionEditor } from '../valueEditors/CompositionEditor';
import { CubicBezierEditor } from '../valueEditors/CubicBezierEditor';
import { CustomEditor } from '../valueEditors/CustomEditor';
import { DimensionEditor } from '../valueEditors/DimensionEditor';
import { DurationEditor } from '../valueEditors/DurationEditor';
import { FontFamilyEditor, FontWeightEditor } from '../valueEditors/FontEditors';
import { GradientEditor } from '../valueEditors/GradientEditor';
import { LetterSpacingEditor } from '../valueEditors/LetterSpacingEditor';
import { LineHeightEditor } from '../valueEditors/LineHeightEditor';
import { LinkEditor } from '../valueEditors/LinkEditor';
import { NumberEditor } from '../valueEditors/NumberEditor';
import { PercentageEditor } from '../valueEditors/PercentageEditor';
import { ShadowEditor } from '../valueEditors/ShadowEditor';
import { StringEditor } from '../valueEditors/StringEditor';
import { StrokeStyleEditor } from '../valueEditors/StrokeStyleEditor';
import { TextDecorationEditor, TextTransformEditor, FontStyleEditor } from '../valueEditors/TextStyleEditors';
import { TransitionEditor } from '../valueEditors/TransitionEditor';
import { TypographyEditor } from '../valueEditors/TypographyEditor';
import { DEFAULT_DURATION_TOKEN_VALUE } from '../../shared/tokenValueParsing';

interface ModeValueEditorProps {
  tokenType: string;
  value: unknown;
  onChange: (v: unknown) => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  autoFocus?: boolean;
  inheritedValue?: unknown;
  availableFonts?: string[];
  fontWeightsByFamily?: Record<string, number[]>;
  fontFamilyRef?: React.RefObject<HTMLInputElement>;
  fontSizeRef?: React.RefObject<HTMLInputElement>;
}

export function ModeValueEditor({
  tokenType,
  value,
  onChange,
  allTokensFlat,
  pathToCollectionId,
  autoFocus,
  inheritedValue,
  availableFonts,
  fontWeightsByFamily,
  fontFamilyRef,
  fontSizeRef,
}: ModeValueEditorProps) {
  switch (tokenType) {
    case 'color':
      return (
        <ColorEditor
          value={value || '#000000'}
          onChange={onChange}
          autoFocus={autoFocus}
          allTokensFlat={allTokensFlat}
        />
      );
    case 'dimension':
      return (
        <DimensionEditor
          value={value ?? { value: 0, unit: 'px' }}
          onChange={onChange}
          allTokensFlat={allTokensFlat}
          pathToCollectionId={pathToCollectionId}
          autoFocus={autoFocus}
        />
      );
    case 'number':
      return (
        <NumberEditor
          value={value ?? 0}
          onChange={onChange}
          allTokensFlat={allTokensFlat}
          pathToCollectionId={pathToCollectionId}
          autoFocus={autoFocus}
        />
      );
    case 'boolean':
      return <BooleanEditor value={value ?? false} onChange={onChange} />;
    case 'duration':
      return (
        <DurationEditor
          value={value ?? { ...DEFAULT_DURATION_TOKEN_VALUE }}
          onChange={onChange}
          autoFocus={autoFocus}
        />
      );
    case 'typography':
      return (
        <TypographyEditor
          value={value ?? {}}
          onChange={onChange}
          allTokensFlat={allTokensFlat ?? {}}
          pathToCollectionId={pathToCollectionId ?? {}}
          inheritedValue={inheritedValue}
          availableFonts={availableFonts}
          fontWeightsByFamily={fontWeightsByFamily}
          fontFamilyRef={fontFamilyRef}
          fontSizeRef={fontSizeRef}
        />
      );
    case 'shadow':
      return (
        <ShadowEditor
          value={value ?? []}
          onChange={onChange}
          allTokensFlat={allTokensFlat ?? {}}
          pathToCollectionId={pathToCollectionId ?? {}}
          inheritedValue={inheritedValue}
        />
      );
    case 'border':
      return (
        <BorderEditor
          value={value ?? {}}
          onChange={onChange}
          allTokensFlat={allTokensFlat ?? {}}
          pathToCollectionId={pathToCollectionId ?? {}}
          inheritedValue={inheritedValue}
        />
      );
    case 'gradient':
      return (
        <GradientEditor
          value={value ?? {}}
          onChange={onChange}
          allTokensFlat={allTokensFlat ?? {}}
          pathToCollectionId={pathToCollectionId ?? {}}
        />
      );
    case 'fontFamily':
      return <FontFamilyEditor value={value ?? ''} onChange={onChange} autoFocus={autoFocus} availableFonts={availableFonts} />;
    case 'fontWeight':
      return <FontWeightEditor value={value ?? 400} onChange={onChange} />;
    case 'strokeStyle':
      return <StrokeStyleEditor value={value ?? 'solid'} onChange={onChange} />;
    case 'composition':
      return (
        <CompositionEditor
          value={value ?? {}}
          onChange={onChange}
          inheritedValue={inheritedValue}
          allTokensFlat={allTokensFlat ?? {}}
          pathToCollectionId={pathToCollectionId ?? {}}
        />
      );
    case 'cubicBezier':
      return <CubicBezierEditor value={value ?? [0, 0, 1, 1]} onChange={onChange} />;
    case 'transition':
      return (
        <TransitionEditor
          value={value ?? {}}
          onChange={onChange}
          allTokensFlat={allTokensFlat ?? {}}
          pathToCollectionId={pathToCollectionId ?? {}}
        />
      );
    case 'fontStyle':
      return <FontStyleEditor value={value ?? 'normal'} onChange={onChange} />;
    case 'lineHeight':
      return <LineHeightEditor value={value ?? 1.5} onChange={onChange} />;
    case 'letterSpacing':
      return <LetterSpacingEditor value={value ?? { value: 0, unit: 'px' }} onChange={onChange} />;
    case 'percentage':
      return <PercentageEditor value={value ?? 0} onChange={onChange} />;
    case 'link':
      return <LinkEditor value={value ?? ''} onChange={onChange} />;
    case 'textDecoration':
      return <TextDecorationEditor value={value ?? 'none'} onChange={onChange} />;
    case 'textTransform':
      return <TextTransformEditor value={value ?? 'none'} onChange={onChange} />;
    case 'custom':
      return <CustomEditor value={value ?? ''} onChange={onChange} />;
    case 'asset':
      return <AssetEditor value={value ?? ''} onChange={onChange} />;
    default:
      return <StringEditor value={value ?? ''} onChange={onChange} autoFocus={autoFocus} />;
  }
}
