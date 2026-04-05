import { useState, useMemo, type Ref } from 'react';
import type { TokenMapEntry } from '../../../shared/types';
import { inputClass, labelClass, fieldBorderClass } from '../../shared/editorClasses';
import { FieldMessage } from '../../shared/FieldMessage';
import {
  InheritedBadge,
  RevertBadge,
  SubPropInput,
  DimensionSubProp,
  FontFamilySubProp,
  resolveTypographyValue,
  FONT_WEIGHTS,
} from './valueEditorShared';

export function TypographyEditor({ value, onChange, allTokensFlat, pathToSet, fontFamilyRef, fontSizeRef, baseValue, availableFonts, fontWeightsByFamily }: { value: any; onChange: (v: any) => void; allTokensFlat: Record<string, TokenMapEntry>; pathToSet: Record<string, string>; fontFamilyRef?: Ref<HTMLInputElement>; fontSizeRef?: Ref<HTMLInputElement>; baseValue?: any; availableFonts?: string[]; fontWeightsByFamily?: Record<string, number[]> }) {
  const rawVal = typeof value === 'object' ? value : {};
  // When extending, merge base + overrides for display, but only emit overrides on change
  const base = typeof baseValue === 'object' && baseValue !== null ? baseValue : undefined;
  const val = base ? { ...base, ...rawVal } : rawVal;
  const isInherited = (key: string) => base && !(key in rawVal) && key in base;
  const update = (key: string, v: any) => {
    if (base) {
      // When extending, store only overridden properties
      onChange({ ...rawVal, [key]: v });
    } else {
      onChange({ ...val, [key]: v });
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

  const currentWeight = typeof val.fontWeight === 'number' ? val.fontWeight : (parseInt(String(val.fontWeight)) || 400);
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

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className={labelClass}>
          Font Family
          {base && isInherited('fontFamily') && <InheritedBadge propKey="fontFamily" onOverride={() => update('fontFamily', val.fontFamily)} />}
          {base && !isInherited('fontFamily') && <RevertBadge propKey="fontFamily" onRevert={() => revertToInherited('fontFamily')} />}
        </div>
        <FontFamilySubProp
          value={Array.isArray(val.fontFamily) ? val.fontFamily[0] : (val.fontFamily || '')}
          onChange={v => update('fontFamily', v)}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          availableFonts={availableFonts || []}
          inputRef={fontFamilyRef}
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className={labelClass}>
            Font Size
            {base && isInherited('fontSize') && <InheritedBadge propKey="fontSize" onOverride={() => update('fontSize', val.fontSize)} />}
            {base && !isInherited('fontSize') && <RevertBadge propKey="fontSize" onRevert={() => revertToInherited('fontSize')} />}
          </div>
          <DimensionSubProp
            value={val.fontSize ?? { value: 16, unit: 'px' }}
            onChange={v => update('fontSize', v)}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            units={['px', 'rem']}
            inputRef={fontSizeRef}
          />
        </div>
        <div className="w-20">
          <div className={labelClass}>
            Weight
            {base && isInherited('fontWeight') && <InheritedBadge propKey="fontWeight" onOverride={() => update('fontWeight', val.fontWeight)} />}
            {base && !isInherited('fontWeight') && <RevertBadge propKey="fontWeight" onRevert={() => revertToInherited('fontWeight')} />}
          </div>
          {isFontWeightAlias ? (
            <SubPropInput
              value={val.fontWeight}
              onChange={v => update('fontWeight', v)}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
              autoFocus={val.fontWeight === '{'}
            />
          ) : (
            <div>
              <div className="flex gap-1 items-center">
                <select
                  value={val.fontWeight ?? 400}
                  onChange={e => update('fontWeight', parseInt(e.target.value))}
                  className={`${inputClass} flex-1 ${fieldBorderClass(false, weightUnavailable)}`}
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
                  className="p-0.5 rounded shrink-0 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                  </svg>
                </button>
              </div>
              <FieldMessage warning={weightUnavailable ? `Weight ${currentWeight} not available in this font family` : undefined} />
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className={labelClass}>
            Line Height
            {base && isInherited('lineHeight') && <InheritedBadge propKey="lineHeight" onOverride={() => update('lineHeight', val.lineHeight)} />}
            {base && !isInherited('lineHeight') && <RevertBadge propKey="lineHeight" onRevert={() => revertToInherited('lineHeight')} />}
          </div>
          <SubPropInput
            value={typeof val.lineHeight === 'object' ? val.lineHeight.value : (val.lineHeight ?? 1.5)}
            onChange={v => update('lineHeight', v)}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            placeholder="1.5"
          />
        </div>
        <div className="flex-1">
          <div className={labelClass}>
            Letter Spacing
            {base && isInherited('letterSpacing') && <InheritedBadge propKey="letterSpacing" onOverride={() => update('letterSpacing', val.letterSpacing)} />}
            {base && !isInherited('letterSpacing') && <RevertBadge propKey="letterSpacing" onRevert={() => revertToInherited('letterSpacing')} />}
          </div>
          <SubPropInput
            value={typeof val.letterSpacing === 'object' ? val.letterSpacing.value : (val.letterSpacing ?? 0)}
            onChange={v => update('letterSpacing', typeof v === 'string' && v.startsWith('{') ? v : { value: typeof v === 'number' ? v : parseFloat(String(v)) || 0, unit: 'px' })}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            placeholder="0"
          />
        </div>
      </div>
      {/* Live typography preview */}
      <div className="mt-1">
        <div className={labelClass}>Preview</div>
        <div
          className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-3 overflow-hidden"
          style={previewStyle}
        >
          <div
            className="text-[var(--color-figma-text)] break-words"
            style={previewStyle}
          >
            {sampleText}
          </div>
        </div>
        <input
          type="text"
          value={sampleText}
          onChange={e => setSampleText(e.target.value)}
          className={inputClass + ' mt-1'}
          placeholder="Sample text…"
        />
      </div>
    </div>
  );
}
