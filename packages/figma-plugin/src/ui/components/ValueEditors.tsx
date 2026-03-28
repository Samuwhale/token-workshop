import { useState, useRef, useMemo, type Ref } from 'react';
import { evalExpr, isFormula } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import { AliasAutocomplete } from './AliasAutocomplete';
import { FormulaInput } from './FormulaInput';
import { ColorPicker } from './ColorPicker';
import { formatHexAs, parseColorInput, swatchBgColor, isWideGamutColor, type ColorFormat } from '../shared/colorUtils';
import { GamutIndicator } from './GamutIndicator';
import { STORAGE_KEYS, lsGet, lsSet } from '../shared/storage';

export const inputClass = 'w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]';
export const labelClass = 'text-[10px] text-[var(--color-figma-text-secondary)] mb-0.5';

function resolveFormulaPreview(
  formula: string,
  allTokensFlat: Record<string, TokenMapEntry>,
): { result: number | null; error: string | null } {
  try {
    const substituted = formula.replace(/{([^}]+)}/g, (_, refPath: string) => {
      const entry = allTokensFlat[refPath];
      if (!entry) return '0';
      const v = entry.$value;
      if (typeof v === 'number') return String(v);
      if (typeof v === 'object' && v !== null && 'value' in v && typeof (v as { value: unknown }).value === 'number') {
        return String((v as { value: number }).value);
      }
      return '0';
    });
    return { result: evalExpr(substituted), error: null };
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : 'Invalid expression' };
  }
}

export function ColorSwatchButton({ color, onChange, className = 'w-8 h-8' }: { color: string; onChange: (hex: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`${className} rounded border border-[var(--color-figma-border)] cursor-pointer`}
        style={{ backgroundColor: swatchBgColor(color) }}
        title="Pick color"
        aria-label="Pick color"
      />
      {open && (
        <ColorPicker value={color} onChange={onChange} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

const FORMAT_CYCLE: ColorFormat[] = ['hex', 'rgb', 'hsl', 'oklch', 'p3'];

export function ColorEditor({ value, onChange, autoFocus, allTokensFlat }: { value: any; onChange: (v: any) => void; autoFocus?: boolean; allTokensFlat?: Record<string, TokenMapEntry> }) {
  const colorStr = typeof value === 'string' ? value : '#000000';
  const [pickerOpen, setPickerOpen] = useState(false);
  const [format, setFormat] = useState<ColorFormat>(() => {
    const saved = lsGet(STORAGE_KEYS.COLOR_FORMAT);
    if (saved === 'rgb' || saved === 'hsl' || saved === 'oklch' || saved === 'p3') return saved;
    return 'hex';
  });
  const [editingText, setEditingText] = useState<string | null>(null);
  const wideGamut = isWideGamutColor(colorStr);

  const displayValue = editingText ?? formatHexAs(colorStr, format);

  const cycleFormat = () => {
    const next = FORMAT_CYCLE[(FORMAT_CYCLE.indexOf(format) + 1) % FORMAT_CYCLE.length];
    setFormat(next);
    lsSet(STORAGE_KEYS.COLOR_FORMAT, next);
    setEditingText(null);
  };

  const commitText = (text: string) => {
    const parsed = parseColorInput(text);
    if (parsed) {
      onChange(parsed);
    }
    setEditingText(null);
  };

  return (
    <div className="relative flex gap-2 items-center">
      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => setPickerOpen(!pickerOpen)}
          className="w-10 h-10 rounded border border-[var(--color-figma-border)] cursor-pointer shrink-0 overflow-hidden hover:ring-2 hover:ring-[var(--color-figma-accent)]/50 transition-shadow"
          style={{ backgroundColor: swatchBgColor(colorStr) }}
          title="Pick color"
          aria-label="Pick color"
        />
        {wideGamut && <GamutIndicator color={colorStr} />}
      </div>
      <div className="flex-1 flex gap-1 items-center min-w-0">
        <input
          type="text"
          aria-label="Color hex value"
          value={displayValue}
          onChange={e => {
            setEditingText(e.target.value);
            // live-parse for hex format
            if (format === 'hex') {
              const parsed = parseColorInput(e.target.value);
              if (parsed) onChange(parsed);
            }
          }}
          onBlur={e => commitText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commitText((e.target as HTMLInputElement).value); }}
          placeholder={format === 'hex' ? '#000000' : format === 'rgb' ? 'rgb(0, 0, 0)' : format === 'oklch' ? 'oklch(0.7 0.15 180)' : format === 'p3' ? 'color(display-p3 1 0 0)' : 'hsl(0, 0%, 0%)'}
          autoFocus={autoFocus}
          className={inputClass}
        />
        <button
          type="button"
          onClick={cycleFormat}
          title={`Format: ${format.toUpperCase()} (click to cycle)`}
          className="shrink-0 px-1.5 py-1 rounded text-[10px] font-medium uppercase text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] border border-[var(--color-figma-border)] transition-colors"
        >
          {format}
        </button>
      </div>
      {pickerOpen && (
        <ColorPicker
          value={colorStr}
          onChange={onChange}
          onClose={() => setPickerOpen(false)}
          allTokensFlat={allTokensFlat}
        />
      )}
    </div>
  );
}

export function StepperInput({
  value,
  onChange,
  className = '',
  autoFocus,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  autoFocus?: boolean;
}) {
  const step = (delta: number) => onChange(Math.round((value + delta) * 1000) / 1000);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); step(e.shiftKey ? 10 : 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); step(e.shiftKey ? -10 : -1); }
  };

  const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    e.preventDefault();
    step(e.deltaY < 0 ? 1 : -1);
  };

  return (
    <div className={`relative flex items-center ${className}`}>
      <input
        type="number"
        aria-label="Numeric value"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
        autoFocus={autoFocus}
        className={inputClass + ' w-full pr-5 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'}
      />
      <div className="absolute right-0 top-0 bottom-0 flex flex-col border-l border-[var(--color-figma-border)]">
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={e => { e.preventDefault(); step(1); }}
          className="flex-1 px-0.5 flex items-center justify-center text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] leading-none"
        >
          <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor" aria-hidden="true"><path d="M0 5l3-4 3 4H0z"/></svg>
        </button>
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={e => { e.preventDefault(); step(-1); }}
          className="flex-1 px-0.5 flex items-center justify-center text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] border-t border-[var(--color-figma-border)] leading-none"
        >
          <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor" aria-hidden="true"><path d="M0 1l3 4 3-4H0z"/></svg>
        </button>
      </div>
    </div>
  );
}

const UNIT_CONVERSIONS: Record<string, Record<string, (v: number) => number>> = {
  px: { rem: v => Math.round((v / 16) * 1000) / 1000, em: v => Math.round((v / 16) * 1000) / 1000, '%': v => v },
  rem: { px: v => Math.round(v * 16 * 1000) / 1000, em: v => v, '%': v => v },
  em: { px: v => Math.round(v * 16 * 1000) / 1000, rem: v => v, '%': v => v },
  '%': { px: v => v, rem: v => v, em: v => v },
};

export function DimensionEditor({ value, onChange, allTokensFlat = {}, pathToSet = {}, autoFocus }: { value: any; onChange: (v: any) => void; allTokensFlat?: Record<string, TokenMapEntry>; pathToSet?: Record<string, string>; autoFocus?: boolean }) {
  const val = typeof value === 'object' ? value : { value: value ?? 0, unit: 'px' };
  const isFormulaValue = typeof val.value === 'string' && isFormula(val.value);
  const [formulaMode, setFormulaMode] = useState(isFormulaValue);
  const numVal = formulaMode ? 0 : (parseFloat(val.value) || 0);
  const formulaStr = formulaMode ? (typeof val.value === 'string' ? val.value : '') : '';
  const preview = formulaMode && formulaStr ? resolveFormulaPreview(formulaStr, allTokensFlat) : null;

  const handleUnitChange = (newUnit: string) => {
    if (formulaMode) {
      onChange({ ...val, unit: newUnit });
      return;
    }
    const convert = UNIT_CONVERSIONS[val.unit]?.[newUnit];
    const newValue = convert ? convert(numVal) : numVal;
    onChange({ value: newValue, unit: newUnit });
  };

  const toggleFormulaMode = () => {
    if (formulaMode) {
      onChange({ value: preview?.result ?? 0, unit: val.unit });
      setFormulaMode(false);
    } else {
      onChange({ value: String(numVal), unit: val.unit });
      setFormulaMode(true);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2 items-center">
        {formulaMode ? (
          <FormulaInput
            value={formulaStr}
            onChange={v => onChange({ ...val, value: v })}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            filterType="dimension"
            autoFocus
          />
        ) : (
          <StepperInput
            value={numVal}
            onChange={v => onChange({ ...val, value: v })}
            className="flex-1"
            autoFocus={autoFocus}
          />
        )}
        <select
          value={val.unit}
          onChange={e => handleUnitChange(e.target.value)}
          className={inputClass + ' w-16'}
        >
          <option value="px">px</option>
          <option value="rem">rem</option>
          <option value="em">em</option>
          <option value="%">%</option>
        </select>
        <button
          type="button"
          onClick={toggleFormulaMode}
          title={formulaMode ? 'Switch to literal value' : 'Enter expression'}
          className={`shrink-0 px-1.5 py-1 rounded text-[10px] font-mono border transition-colors ${formulaMode ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]'}`}
        >
          fx
        </button>
      </div>
      {formulaMode && formulaStr && (
        <div className={`px-2 py-1 rounded text-[10px] font-mono ${preview?.error ? 'text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-error)]/30' : 'text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-accent)]/5 border border-[var(--color-figma-accent)]/20'}`}>
          {preview?.error ? preview.error : `= ${preview?.result} ${val.unit}`}
        </div>
      )}
    </div>
  );
}

function SubPropInput({
  value,
  onChange,
  allTokensFlat,
  pathToSet,
  filterType,
  placeholder,
  className,
  inputType = 'number',
  inputRef,
}: {
  value: any;
  onChange: (v: any) => void;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  filterType?: string;
  placeholder?: string;
  className?: string;
  inputType?: 'number' | 'string';
  inputRef?: Ref<HTMLInputElement>;
}) {
  const isAlias = typeof value === 'string' && value.startsWith('{');
  const displayValue = isAlias ? value : String(value ?? '');
  const [showAC, setShowAC] = useState(false);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={e => {
          const raw = e.target.value;
          setShowAC(raw.includes('{') && !raw.endsWith('}'));
          if (raw.startsWith('{')) {
            onChange(raw);
          } else if (inputType === 'number') {
            const n = parseFloat(raw);
            onChange(isNaN(n) ? 0 : n);
          } else {
            onChange(raw);
          }
        }}
        onFocus={() => {
          if (displayValue.includes('{') && !displayValue.endsWith('}')) setShowAC(true);
        }}
        onBlur={() => setTimeout(() => setShowAC(false), 150)}
        placeholder={placeholder}
        className={`${inputClass}${isAlias ? ' !border-[var(--color-figma-accent)]' : ''}${className ? ` ${className}` : ''}`}
      />
      {showAC && (
        <AliasAutocomplete
          query={displayValue.includes('{') ? displayValue.slice(displayValue.lastIndexOf('{') + 1).replace(/\}.*$/, '') : ''}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          filterType={filterType}
          onSelect={path => {
            onChange(`{${path}}`);
            setShowAC(false);
          }}
          onClose={() => setShowAC(false)}
        />
      )}
    </div>
  );
}

function resolveTypographyValue(raw: unknown, allTokensFlat: Record<string, TokenMapEntry>): unknown {
  if (typeof raw === 'string' && raw.startsWith('{') && raw.endsWith('}')) {
    const refPath = raw.slice(1, -1);
    const entry = allTokensFlat[refPath];
    if (entry) return entry.$value;
  }
  return raw;
}

export function TypographyEditor({ value, onChange, allTokensFlat, pathToSet, fontFamilyRef, fontSizeRef }: { value: any; onChange: (v: any) => void; allTokensFlat: Record<string, TokenMapEntry>; pathToSet: Record<string, string>; fontFamilyRef?: Ref<HTMLInputElement>; fontSizeRef?: Ref<HTMLInputElement> }) {
  const val = typeof value === 'object' ? value : {};
  const update = (key: string, v: any) => onChange({ ...val, [key]: v });
  const isFontSizeAlias = typeof val.fontSize === 'string' && val.fontSize.startsWith('{');
  const fontSize = !isFontSizeAlias && typeof val.fontSize === 'object' ? val.fontSize : { value: val.fontSize ?? 16, unit: 'px' };
  const isFontWeightAlias = typeof val.fontWeight === 'string' && val.fontWeight.startsWith('{');

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
        <div className={labelClass}>Font Family</div>
        <SubPropInput
          value={Array.isArray(val.fontFamily) ? val.fontFamily[0] : (val.fontFamily || '')}
          onChange={v => update('fontFamily', v)}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          inputType="string"
          placeholder="Inter"
          inputRef={fontFamilyRef}
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className={labelClass}>Font Size</div>
          {isFontSizeAlias ? (
            <SubPropInput
              value={val.fontSize}
              onChange={v => update('fontSize', v)}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
              inputRef={fontSizeRef}
            />
          ) : (
            <div className="flex gap-1">
              <input
                ref={fontSizeRef}
                type="number"
                value={fontSize.value}
                onChange={e => update('fontSize', { ...fontSize, value: parseFloat(e.target.value) || 0 })}
                className={inputClass + ' flex-1'}
                placeholder="{token}"
                onKeyDown={e => {
                  if (e.key === '{') {
                    e.preventDefault();
                    update('fontSize', '{');
                  }
                }}
              />
              <select
                value={fontSize.unit}
                onChange={e => update('fontSize', { ...fontSize, unit: e.target.value })}
                className={inputClass + ' w-14'}
              >
                <option value="px">px</option>
                <option value="rem">rem</option>
              </select>
            </div>
          )}
        </div>
        <div className="w-20">
          <div className={labelClass}>Weight</div>
          {isFontWeightAlias ? (
            <SubPropInput
              value={val.fontWeight}
              onChange={v => update('fontWeight', v)}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
            />
          ) : (
            <select
              value={val.fontWeight ?? 400}
              onChange={e => update('fontWeight', parseInt(e.target.value))}
              className={inputClass}
            >
              <option value={100}>100 Thin</option>
              <option value={200}>200 ExtraLight</option>
              <option value={300}>300 Light</option>
              <option value={400}>400 Regular</option>
              <option value={500}>500 Medium</option>
              <option value={600}>600 SemiBold</option>
              <option value={700}>700 Bold</option>
              <option value={800}>800 ExtraBold</option>
              <option value={900}>900 Black</option>
            </select>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className={labelClass}>Line Height</div>
          <SubPropInput
            value={typeof val.lineHeight === 'object' ? val.lineHeight.value : (val.lineHeight ?? 1.5)}
            onChange={v => update('lineHeight', v)}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            placeholder="1.5"
          />
        </div>
        <div className="flex-1">
          <div className={labelClass}>Letter Spacing</div>
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

export function ShadowEditor({ value, onChange, allTokensFlat, pathToSet }: { value: any; onChange: (v: any) => void; allTokensFlat: Record<string, TokenMapEntry>; pathToSet: Record<string, string> }) {
  const val = typeof value === 'object' ? value : {};
  const update = (key: string, v: any) => onChange({ ...val, [key]: v });
  const getDim = (v: any) => (typeof v === 'string' && v.startsWith('{') ? v : (typeof v === 'object' ? v.value : (v ?? 0)));
  const setDim = (key: string, v: any) => update(key, typeof v === 'string' && v.startsWith('{') ? v : { value: typeof v === 'number' ? v : parseFloat(String(v)) || 0, unit: 'px' });
  const isColorAlias = typeof val.color === 'string' && val.color.startsWith('{');

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className={labelClass}>Color</div>
        <div className="flex gap-2 items-center">
          {!isColorAlias && (
            <ColorSwatchButton
              color={val.color || '#000000'}
              onChange={v => update('color', v)}
            />
          )}
          <SubPropInput
            value={val.color || '#00000040'}
            onChange={v => update('color', v)}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            filterType="color"
            inputType="string"
            placeholder="#00000040 or {token}"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className={labelClass}>Offset X</div>
          <SubPropInput value={getDim(val.offsetX)} onChange={v => setDim('offsetX', v)} allTokensFlat={allTokensFlat} pathToSet={pathToSet} placeholder="0" />
        </div>
        <div>
          <div className={labelClass}>Offset Y</div>
          <SubPropInput value={getDim(val.offsetY)} onChange={v => setDim('offsetY', v)} allTokensFlat={allTokensFlat} pathToSet={pathToSet} placeholder="0" />
        </div>
        <div>
          <div className={labelClass}>Blur</div>
          <SubPropInput value={getDim(val.blur)} onChange={v => setDim('blur', v)} allTokensFlat={allTokensFlat} pathToSet={pathToSet} placeholder="0" />
        </div>
        <div>
          <div className={labelClass}>Spread</div>
          <SubPropInput value={getDim(val.spread)} onChange={v => setDim('spread', v)} allTokensFlat={allTokensFlat} pathToSet={pathToSet} placeholder="0" />
        </div>
      </div>
      <div>
        <div className={labelClass}>Type</div>
        <select
          value={val.type || 'dropShadow'}
          onChange={e => update('type', e.target.value)}
          className={inputClass}
        >
          <option value="dropShadow">Drop Shadow</option>
          <option value="innerShadow">Inner Shadow</option>
        </select>
      </div>
    </div>
  );
}

export function BorderEditor({ value, onChange, allTokensFlat, pathToSet }: { value: any; onChange: (v: any) => void; allTokensFlat: Record<string, TokenMapEntry>; pathToSet: Record<string, string> }) {
  const val = typeof value === 'object' ? value : {};
  const update = (key: string, v: any) => onChange({ ...val, [key]: v });
  const isWidthAlias = typeof val.width === 'string' && val.width.startsWith('{');
  const width = !isWidthAlias && typeof val.width === 'object' ? val.width : { value: val.width ?? 1, unit: 'px' };
  const isColorAlias = typeof val.color === 'string' && val.color.startsWith('{');

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className={labelClass}>Color</div>
        <div className="flex gap-2 items-center">
          {!isColorAlias && (
            <ColorSwatchButton
              color={val.color || '#000000'}
              onChange={v => update('color', v)}
            />
          )}
          <SubPropInput
            value={val.color || '#000000'}
            onChange={v => update('color', v)}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            filterType="color"
            inputType="string"
            placeholder="#000000 or {token}"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className={labelClass}>Width</div>
          {isWidthAlias ? (
            <SubPropInput
              value={val.width}
              onChange={v => update('width', v)}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
            />
          ) : (
            <div className="flex gap-1">
              <input
                type="number"
                value={width.value}
                onChange={e => update('width', { ...width, value: parseFloat(e.target.value) || 0 })}
                className={inputClass + ' flex-1'}
                onKeyDown={e => {
                  if (e.key === '{') {
                    e.preventDefault();
                    update('width', '{');
                  }
                }}
              />
              <select
                value={width.unit}
                onChange={e => update('width', { ...width, unit: e.target.value })}
                className={inputClass + ' w-14'}
              >
                <option value="px">px</option>
                <option value="rem">rem</option>
              </select>
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className={labelClass}>Style</div>
          <select
            value={val.style || 'solid'}
            onChange={e => update('style', e.target.value)}
            className={inputClass}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
            <option value="double">Double</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export function NumberEditor({ value, onChange, allTokensFlat = {}, pathToSet = {}, autoFocus }: { value: any; onChange: (v: any) => void; allTokensFlat?: Record<string, TokenMapEntry>; pathToSet?: Record<string, string>; autoFocus?: boolean }) {
  const isFormulaValue = typeof value === 'string' && isFormula(value);
  const [formulaMode, setFormulaMode] = useState(isFormulaValue);
  const numVal = formulaMode ? 0 : (parseFloat(value) || 0);
  const formulaStr = formulaMode ? (typeof value === 'string' ? value : '') : '';
  const preview = formulaMode && formulaStr ? resolveFormulaPreview(formulaStr, allTokensFlat) : null;

  const toggleFormulaMode = () => {
    if (formulaMode) {
      onChange(preview?.result ?? 0);
      setFormulaMode(false);
    } else {
      onChange(String(numVal));
      setFormulaMode(true);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2 items-center">
        {formulaMode ? (
          <FormulaInput
            value={formulaStr}
            onChange={onChange}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            filterType="number"
            autoFocus
          />
        ) : (
          <StepperInput
            value={numVal}
            onChange={onChange}
            className="flex-1"
            autoFocus={autoFocus}
          />
        )}
        <button
          type="button"
          onClick={toggleFormulaMode}
          title={formulaMode ? 'Switch to literal value' : 'Enter expression'}
          className={`shrink-0 px-1.5 py-1 rounded text-[10px] font-mono border transition-colors ${formulaMode ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]'}`}
        >
          fx
        </button>
      </div>
      {formulaMode && formulaStr && (
        <div className={`px-2 py-1 rounded text-[10px] font-mono ${preview?.error ? 'text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-error)]/30' : 'text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-accent)]/5 border border-[var(--color-figma-accent)]/20'}`}>
          {preview?.error ? preview.error : `= ${preview?.result}`}
        </div>
      )}
    </div>
  );
}

export function StringEditor({ value, onChange, autoFocus }: { value: any; onChange: (v: any) => void; autoFocus?: boolean }) {
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder="Enter value"
      autoFocus={autoFocus}
      className={inputClass}
    />
  );
}

export function AssetEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const url = typeof value === 'string' ? value : '';
  const isValidUrl = url.length > 0 && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:'));
  return (
    <div className="flex flex-col gap-2">
      <input
        type="url"
        value={url}
        onChange={e => onChange(e.target.value)}
        placeholder="https://example.com/image.png"
        className={inputClass}
      />
      {isValidUrl && (
        <div className="rounded border border-[var(--color-figma-border)] overflow-hidden bg-[var(--color-figma-bg-secondary)] flex items-center justify-center" style={{ minHeight: '80px', maxHeight: '160px' }}>
          <img
            src={url}
            alt="Asset preview"
            className="max-w-full max-h-40 object-contain"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.nextSibling as HTMLElement | null)?.removeAttribute('hidden'); }}
          />
          <span hidden className="text-[10px] text-[var(--color-figma-text-secondary)] p-2">Unable to load image</span>
        </div>
      )}
    </div>
  );
}

export function BooleanEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(!value)}
        className={`relative w-8 h-4 rounded-full transition-colors ${value ? 'bg-[var(--color-figma-accent)]' : 'bg-[var(--color-figma-border)]'}`}
      >
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${value ? 'left-4' : 'left-0.5'}`} />
      </button>
      <span className="text-[11px] text-[var(--color-figma-text)]">{value ? 'true' : 'false'}</span>
    </div>
  );
}

export function FontFamilyEditor({ value, onChange, autoFocus }: { value: any; onChange: (v: any) => void; autoFocus?: boolean }) {
  return (
    <input
      type="text"
      value={typeof value === 'string' ? value : ''}
      onChange={e => onChange(e.target.value)}
      placeholder="Inter, system-ui, sans-serif"
      autoFocus={autoFocus}
      className={inputClass}
    />
  );
}

const FONT_WEIGHTS = [
  { value: 100, label: '100 Thin' },
  { value: 200, label: '200 ExtraLight' },
  { value: 300, label: '300 Light' },
  { value: 400, label: '400 Regular' },
  { value: 500, label: '500 Medium' },
  { value: 600, label: '600 SemiBold' },
  { value: 700, label: '700 Bold' },
  { value: 800, label: '800 ExtraBold' },
  { value: 900, label: '900 Black' },
];

export function FontWeightEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const w = typeof value === 'number' ? value : 400;
  return (
    <select
      value={w}
      onChange={e => onChange(parseInt(e.target.value))}
      className={inputClass}
    >
      {FONT_WEIGHTS.map(fw => (
        <option key={fw.value} value={fw.value}>{fw.label}</option>
      ))}
    </select>
  );
}

const STROKE_STYLES = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'outset', 'inset'];

export function StrokeStyleEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <select
      value={typeof value === 'string' ? value : 'solid'}
      onChange={e => onChange(e.target.value)}
      className={inputClass}
    >
      {STROKE_STYLES.map(s => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

const DURATION_PRESETS = [100, 150, 200, 300, 500];

export function DurationEditor({ value, onChange, autoFocus }: { value: any; onChange: (v: any) => void; autoFocus?: boolean }) {
  const ms = typeof value?.value === 'number' ? value.value : typeof value === 'number' ? value : 200;
  const unit: 'ms' | 's' = value?.unit === 's' ? 's' : 'ms';
  const update = (patch: { value?: number; unit?: 'ms' | 's' }) =>
    onChange({ value: ms, unit, ...patch });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="number"
          min={0}
          step={unit === 'ms' ? 50 : 0.05}
          value={ms}
          onChange={e => update({ value: parseFloat(e.target.value) || 0 })}
          autoFocus={autoFocus}
          className={inputClass + ' flex-1'}
        />
        <select
          value={unit}
          onChange={e => update({ unit: e.target.value as 'ms' | 's' })}
          className={inputClass + ' w-16'}
        >
          <option value="ms">ms</option>
          <option value="s">s</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-1">
        {DURATION_PRESETS.map(p => (
          <button
            key={p}
            onClick={() => onChange({ value: p, unit: 'ms' })}
            className={`px-2 py-0.5 rounded border text-[10px] transition-colors ${ms === p && unit === 'ms' ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
          >
            {p}ms
          </button>
        ))}
      </div>
    </div>
  );
}

interface GradientStop {
  color: string;
  position: number;
}

export function GradientEditor({ value, onChange, allTokensFlat, pathToSet }: { value: any; onChange: (v: any) => void; allTokensFlat: Record<string, TokenMapEntry>; pathToSet: Record<string, string> }) {
  const stops: GradientStop[] = Array.isArray(value?.stops) && value.stops.length >= 2
    ? value.stops
    : [{ color: '#000000', position: 0 }, { color: '#ffffff', position: 1 }];
  const gradientType: string = value?.type || 'linear';

  const updateStop = (idx: number, patch: Partial<GradientStop>) => {
    const next = stops.map((s, i) => i === idx ? { ...s, ...patch } : s);
    onChange({ ...value, stops: next });
  };

  const addStop = () => {
    onChange({ ...value, stops: [...stops, { color: '#808080', position: 0.5 }] });
  };

  const removeStop = (idx: number) => {
    if (stops.length <= 2) return;
    onChange({ ...value, stops: stops.filter((_, i) => i !== idx) });
  };

  const previewParts = stops
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(s => {
      const color = typeof s.color === 'string' && !s.color.startsWith('{') ? s.color : '#aaaaaa';
      return `${color} ${Math.round(s.position * 100)}%`;
    })
    .join(', ');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center">
        <div className={labelClass}>Type</div>
        <select
          value={gradientType}
          onChange={e => onChange({ ...value, type: e.target.value })}
          className={inputClass + ' flex-1'}
        >
          <option value="linear">Linear</option>
          <option value="radial">Radial</option>
        </select>
      </div>
      <div
        className="w-full h-6 rounded border border-[var(--color-figma-border)]"
        style={{ background: `${gradientType}-gradient(to right, ${previewParts})` }}
      />
      <div className={labelClass}>Stops</div>
      {stops.map((stop, idx) => (
        <GradientStopRow
          key={idx}
          stop={stop}
          canRemove={stops.length > 2}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          onChange={patch => updateStop(idx, patch)}
          onRemove={() => removeStop(idx)}
        />
      ))}
      <button
        type="button"
        onClick={addStop}
        className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left"
      >
        + Add stop
      </button>
    </div>
  );
}

function GradientStopRow({ stop, canRemove, allTokensFlat, pathToSet, onChange, onRemove }: {
  stop: GradientStop;
  canRemove: boolean;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  onChange: (patch: Partial<GradientStop>) => void;
  onRemove: () => void;
}) {
  const colorIsAlias = typeof stop.color === 'string' && stop.color.startsWith('{');
  const [aliasMode, setAliasMode] = useState(colorIsAlias);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const aliasInputRef = useRef<HTMLInputElement>(null);

  const toggleAliasMode = () => {
    const next = !aliasMode;
    setAliasMode(next);
    if (next) {
      onChange({ color: colorIsAlias ? stop.color : '{' });
      setTimeout(() => aliasInputRef.current?.focus(), 0);
    } else {
      onChange({ color: '#000000' });
      setShowAutocomplete(false);
    }
  };

  const aliasQuery = (() => {
    const c = stop.color || '';
    const openIdx = c.lastIndexOf('{');
    if (openIdx === -1) return '';
    return c.slice(openIdx + 1).replace(/\}.*$/, '');
  })();

  return (
    <div className="flex items-start gap-1.5">
      <div className="w-16 shrink-0">
        <StepperInput
          value={Math.round(stop.position * 100)}
          onChange={v => onChange({ position: Math.max(0, Math.min(100, v)) / 100 })}
          className="w-full"
        />
      </div>
      <div className="flex-1 relative min-w-0">
        {aliasMode ? (
          <>
            <input
              ref={aliasInputRef}
              type="text"
              aria-label="Token value"
              value={stop.color || '{'}
              onChange={e => {
                const v = e.target.value;
                onChange({ color: v });
                setShowAutocomplete(v.includes('{') && !v.endsWith('}'));
              }}
              onFocus={() => {
                if ((stop.color || '').includes('{') && !(stop.color || '').endsWith('}')) {
                  setShowAutocomplete(true);
                }
              }}
              onBlur={() => setTimeout(() => setShowAutocomplete(false), 150)}
              placeholder="{color.primary}"
              className={inputClass}
            />
            {showAutocomplete && (
              <AliasAutocomplete
                query={aliasQuery}
                allTokensFlat={allTokensFlat}
                pathToSet={pathToSet}
                filterType="color"
                onSelect={path => {
                  onChange({ color: `{${path}}` });
                  setShowAutocomplete(false);
                }}
                onClose={() => setShowAutocomplete(false)}
              />
            )}
          </>
        ) : (
          <div className="flex gap-1.5 items-center">
            <ColorSwatchButton
              color={stop.color || '#000000'}
              onChange={v => onChange({ color: v })}
            />
            <input
              type="text"
              value={stop.color || '#000000'}
              onChange={e => onChange({ color: e.target.value })}
              placeholder="#000000"
              className={inputClass + ' flex-1'}
            />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={toggleAliasMode}
        title={aliasMode ? 'Switch to raw color' : 'Switch to reference mode'}
        className={`p-1.5 rounded border transition-colors shrink-0 ${aliasMode ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M1 4h2.5M4.5 4H7M5.5 2L7 4L5.5 6M2.5 2L1 4L2.5 6"/>
        </svg>
      </button>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove color stop"
          aria-label="Remove color stop"
          className="p-1.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)] shrink-0"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      )}
    </div>
  );
}

const COMPOSITION_PROPERTIES = [
  'fill', 'stroke', 'width', 'height',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'itemSpacing', 'cornerRadius', 'strokeWeight', 'opacity',
  'typography', 'shadow', 'visible',
];

export function CompositionEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const [newProp, setNewProp] = useState(COMPOSITION_PROPERTIES[0]);
  const val = typeof value === 'object' && value !== null ? value : {};
  const usedProps = Object.keys(val);
  const unusedProps = COMPOSITION_PROPERTIES.filter(p => !usedProps.includes(p));

  const update = (key: string, v: string) => onChange({ ...val, [key]: v });
  const remove = (key: string) => {
    const next = { ...val };
    delete next[key];
    onChange(next);
  };
  const addProp = () => {
    const prop = newProp || unusedProps[0];
    if (!prop || prop in val) return;
    onChange({ ...val, [prop]: '' });
    setNewProp(unusedProps.filter(p => p !== prop)[0] || '');
  };

  return (
    <div className="flex flex-col gap-2">
      {usedProps.length === 0 && (
        <p className="text-[10px] text-[var(--color-figma-text-secondary)]">No properties yet — add one below.</p>
      )}
      {usedProps.map(prop => (
        <div key={prop} className="flex items-center gap-1.5">
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0 w-24 truncate" title={prop}>{prop}</span>
          <input
            type="text"
            value={typeof val[prop] === 'string' ? val[prop] : JSON.stringify(val[prop])}
            onChange={e => update(prop, e.target.value)}
            placeholder="{token.path} or value"
            className={inputClass + ' flex-1'}
          />
          <button
            type="button"
            onClick={() => remove(prop)}
            title={`Remove ${prop}`}
            className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 shrink-0"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      ))}
      {unusedProps.length > 0 && (
        <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--color-figma-border)]">
          <select
            value={newProp}
            onChange={e => setNewProp(e.target.value)}
            className={inputClass + ' flex-1'}
          >
            {unusedProps.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button
            type="button"
            onClick={addProp}
            className="px-2 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/30 shrink-0"
          >+ Add</button>
        </div>
      )}
    </div>
  );
}
