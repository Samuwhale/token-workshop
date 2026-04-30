import { useState, useMemo, memo, type Ref } from 'react';
import { Link2 } from 'lucide-react';
import type { TokenMapEntry } from '../../../shared/types';
import { AUTHORING, fieldBorderClass } from '../../shared/editorClasses';
import { FieldMessage } from '../../shared/FieldMessage';
import { Field, Stack } from '../../primitives';
import {
  InheritedBadge,
  RevertBadge,
  SubPropInput,
  DimensionSubProp,
  FontFamilySubProp,
  resolveTypographyValue,
  FONT_WEIGHTS,
  isValueRecord,
  type TokenValueRecord,
  type ValueChangeHandler,
} from './valueEditorShared';

interface TypographyEditorProps {
  value: unknown;
  onChange: ValueChangeHandler<TokenValueRecord>;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  fontFamilyRef?: Ref<HTMLInputElement>;
  fontSizeRef?: Ref<HTMLInputElement>;
  inheritedValue?: unknown;
  availableFonts?: string[];
  fontWeightsByFamily?: Record<string, number[]>;
}

export const TypographyEditor = memo(function TypographyEditor({
  value,
  onChange,
  allTokensFlat,
  pathToCollectionId,
  fontFamilyRef,
  fontSizeRef,
  inheritedValue,
  availableFonts,
  fontWeightsByFamily,
}: TypographyEditorProps) {
  const rawVal = isValueRecord(value) ? value : {};
  const inherited = isValueRecord(inheritedValue) ? inheritedValue : undefined;
  const val = inherited ? { ...inherited, ...rawVal } : rawVal;
  const isInherited = (key: string) => inherited && !(key in rawVal) && key in inherited;
  const update = (key: string, nextValue: unknown) => {
    if (inherited) {
      onChange({ ...rawVal, [key]: nextValue });
    } else {
      onChange({ ...val, [key]: nextValue });
    }
  };
  const revertToInherited = (key: string) => {
    const next = { ...rawVal };
    delete next[key];
    onChange(next);
  };
  const isFontWeightAlias = typeof val.fontWeight === 'string' && val.fontWeight.startsWith('{');

  // Determine available weights for the selected font family (if font data is available)
  const availableWeights: number[] | null = useMemo(() => {
    if (!fontWeightsByFamily) return null;
    const rawFamily = val.fontFamily;
    const family = Array.isArray(rawFamily) ? rawFamily[0] : (typeof rawFamily === 'string' ? rawFamily : null);
    if (!family || typeof family !== 'string' || family.startsWith('{')) return null;
    return fontWeightsByFamily[family] ?? null;
  }, [fontWeightsByFamily, val.fontFamily]);

  const currentWeight = typeof val.fontWeight === 'number' ? val.fontWeight : (parseInt(String(val.fontWeight), 10) || 400);
  const weightUnavailable = !isFontWeightAlias && availableWeights !== null && !availableWeights.includes(currentWeight);

  const [sampleText, setSampleText] = useState('The quick brown fox jumps over the lazy dog');

  const previewStyle = useMemo(() => {
    const resolvedFamily = resolveTypographyValue(val.fontFamily, allTokensFlat);
    const family = Array.isArray(resolvedFamily) ? resolvedFamily[0] : (resolvedFamily || 'sans-serif');

    const resolvedSize = resolveTypographyValue(val.fontSize, allTokensFlat);
    let sizeStr = '16px';
    if (typeof resolvedSize === 'object' && resolvedSize !== null && 'value' in resolvedSize) {
      const s = resolvedSize as { value: number; unit?: string };
      sizeStr = `${s.value}${s.unit || 'px'}`;
    } else if (typeof resolvedSize === 'number') {
      sizeStr = `${resolvedSize}px`;
    } else if (typeof resolvedSize === 'string' && !resolvedSize.startsWith('{')) {
      sizeStr = resolvedSize;
    }

    const resolvedWeight = resolveTypographyValue(val.fontWeight, allTokensFlat);
    const weight = typeof resolvedWeight === 'number' ? resolvedWeight : (parseInt(String(resolvedWeight)) || 400);

    const resolvedLH = resolveTypographyValue(val.lineHeight, allTokensFlat);
    let lineHeight: string | number = 1.5;
    if (typeof resolvedLH === 'object' && resolvedLH !== null && 'value' in resolvedLH) {
      lineHeight = (resolvedLH as { value: number }).value;
    } else if (typeof resolvedLH === 'number') {
      lineHeight = resolvedLH;
    } else if (typeof resolvedLH === 'string' && !resolvedLH.startsWith('{')) {
      lineHeight = resolvedLH;
    }

    const resolvedLS = resolveTypographyValue(val.letterSpacing, allTokensFlat);
    let letterSpacing = '0px';
    if (typeof resolvedLS === 'object' && resolvedLS !== null && 'value' in resolvedLS) {
      const ls = resolvedLS as { value: number; unit?: string };
      letterSpacing = `${ls.value}${ls.unit || 'px'}`;
    } else if (typeof resolvedLS === 'number') {
      letterSpacing = `${resolvedLS}px`;
    } else if (typeof resolvedLS === 'string' && !resolvedLS.startsWith('{')) {
      letterSpacing = resolvedLS;
    }

    return {
      fontFamily: String(family),
      fontSize: sizeStr,
      fontWeight: weight,
      lineHeight,
      letterSpacing,
    } as React.CSSProperties;
  }, [val.fontFamily, val.fontSize, val.fontWeight, val.lineHeight, val.letterSpacing, allTokensFlat]);

  const labelWithBadge = (text: string, key: string) => (
    <>
      {text}
      {inherited && isInherited(key) && <InheritedBadge propKey={key} onOverride={() => update(key, val[key])} />}
      {inherited && !isInherited(key) && <RevertBadge propKey={key} onRevert={() => revertToInherited(key)} />}
    </>
  );

  return (
    <Stack gap={3}>
      <Field label={labelWithBadge('Font Family', 'fontFamily')}>
        <FontFamilySubProp
          value={Array.isArray(val.fontFamily) ? val.fontFamily[0] : (val.fontFamily || '')}
          onChange={v => update('fontFamily', v)}
          allTokensFlat={allTokensFlat}
          pathToCollectionId={pathToCollectionId}
          availableFonts={availableFonts || []}
          inputRef={fontFamilyRef}
        />
      </Field>
      <Stack direction="row" gap={3} wrap>
        <Field label={labelWithBadge('Font Size', 'fontSize')} className="flex-1">
          <DimensionSubProp
            value={val.fontSize ?? { value: 16, unit: 'px' }}
            onChange={v => update('fontSize', v)}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            units={['px', 'rem']}
            inputRef={fontSizeRef}
          />
        </Field>
        <Field label={labelWithBadge('Weight', 'fontWeight')} className="min-w-[120px] flex-1">
          {isFontWeightAlias ? (
            <SubPropInput
              value={val.fontWeight}
              onChange={v => update('fontWeight', v)}
              allTokensFlat={allTokensFlat}
              pathToCollectionId={pathToCollectionId}
              autoFocus={val.fontWeight === '{'}
            />
          ) : (
            <>
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <select
                  value={currentWeight}
                  onChange={e => update('fontWeight', parseInt(e.target.value, 10))}
                  className={`${AUTHORING.input} min-w-[120px] flex-1 ${fieldBorderClass(false, weightUnavailable)}`}
                >
                  {FONT_WEIGHTS.map(fw => {
                    const unavailable = availableWeights !== null && !availableWeights.includes(fw.value);
                    return (
                      <option key={fw.value} value={fw.value} disabled={unavailable}>
                        {fw.label}{unavailable ? ' ✕' : ''}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  onClick={() => update('fontWeight', '{')}
                  title="Reference a token"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[color:var(--color-figma-text-tertiary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
                >
                  <Link2 size={12} strokeWidth={1.8} aria-hidden />
                </button>
              </div>
              <FieldMessage warning={weightUnavailable ? `Weight ${currentWeight} not available in this font family` : undefined} />
            </>
          )}
        </Field>
      </Stack>
      <Stack direction="row" gap={3} wrap>
        <Field label={labelWithBadge('Line Height', 'lineHeight')} className="flex-1">
          <SubPropInput
            value={isValueRecord(val.lineHeight) ? val.lineHeight.value : (val.lineHeight ?? 1.5)}
            onChange={v => update('lineHeight', v)}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            placeholder="1.5"
          />
        </Field>
        <Field label={labelWithBadge('Letter Spacing', 'letterSpacing')} className="flex-1">
          <SubPropInput
            value={isValueRecord(val.letterSpacing) ? val.letterSpacing.value : (val.letterSpacing ?? 0)}
            onChange={v => update('letterSpacing', typeof v === 'string' && v.startsWith('{') ? v : { value: typeof v === 'number' ? v : parseFloat(String(v)) || 0, unit: 'px' })}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            placeholder="0"
          />
        </Field>
      </Stack>
      <Stack gap={1}>
        <span className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)]">Preview</span>
        <div
          className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-3 overflow-hidden"
          style={previewStyle}
        >
          <div
            className="text-[color:var(--color-figma-text)] break-words"
            style={previewStyle}
          >
            {sampleText}
          </div>
        </div>
        <input
          type="text"
          value={sampleText}
          onChange={e => setSampleText(e.target.value)}
          className={AUTHORING.input}
          placeholder="Sample text…"
          aria-label="Sample text"
        />
      </Stack>
    </Stack>
  );
});
