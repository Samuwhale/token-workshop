import { useState, useRef, useMemo, useEffect, useCallback, type Ref } from 'react';
import { evalExpr, isFormula } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import { AliasAutocomplete } from './AliasAutocomplete';
import { isAlias, extractAliasPath } from '../../shared/resolveAlias';
import { FormulaInput } from './FormulaInput';
import { ColorPicker } from './ColorPicker';
import { FontFamilyPicker } from './FontFamilyPicker';
import { formatHexAs, parseColorInput, swatchBgColor, isWideGamutColor, type ColorFormat } from '../shared/colorUtils';
import { GamutIndicator } from './GamutIndicator';
import { STORAGE_KEYS, lsGet, lsSet } from '../shared/storage';
import { useSettingsListener } from './SettingsPanel';

import { inputClass, labelClass, fieldBorderClass } from '../shared/editorClasses';
export { inputClass, labelClass } from '../shared/editorClasses';
import { FieldMessage } from '../shared/FieldMessage';

/** Per-type format hints shown below the "Value" label in the token editor. */
export const VALUE_FORMAT_HINTS: Record<string, string> = {
  color: '#hex, rgb(), oklch(), color(display-p3 …)',
  dimension: 'Number + unit (px, rem, em, %)',
  number: 'Numeric value or fx expression',
  string: 'Any text value',
  boolean: 'true / false',
  fontFamily: 'Font name(s), comma-separated',
  fontWeight: '100–900 (Thin → Black)',
  duration: 'Time value in ms or s',
  shadow: 'Color, offset X/Y, blur, spread',
  border: 'Color, width, style',
  gradient: 'Color stops with positions',
  typography: 'Font family, size, weight, line height, letter spacing',
  composition: 'Key–value pairs of design properties',
  asset: 'URL to an image or file',
  strokeStyle: 'solid, dashed, dotted, double, …',
  cubicBezier: '[x1, y1, x2, y2] — easing curve',
  transition: 'Duration, delay, and timing function',
  fontStyle: 'normal, italic, or oblique',
  lineHeight: 'Unitless multiplier (1.5) or dimension (24px)',
  letterSpacing: 'Dimension value (e.g. 0.5px, 0.02em)',
  percentage: 'Numeric percentage value',
  link: 'URL (https://…)',
  textDecoration: 'none, underline, overline, line-through',
  textTransform: 'none, uppercase, lowercase, capitalize',
  custom: 'Any value — JSON object, string, or number',
};

function InheritedBadge({ propKey, onOverride }: { propKey: string; onOverride: () => void }) {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      <span className="text-[9px] text-[var(--color-figma-text-tertiary)] italic">inherited</span>
      <button
        type="button"
        onClick={onOverride}
        className="text-[9px] text-[var(--color-figma-accent)] hover:underline bg-transparent border-none p-0 cursor-pointer"
        title={`Override ${propKey}`}
      >override</button>
    </span>
  );
}

function RevertBadge({ propKey, onRevert }: { propKey: string; onRevert: () => void }) {
  return (
    <button
      type="button"
      onClick={onRevert}
      className="ml-1 text-[9px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-accent)] hover:underline bg-transparent border-none p-0 cursor-pointer"
      title={`Revert ${propKey} to inherited value`}
    >revert</button>
  );
}

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
  // Sync format when changed from Settings panel
  const formatRev = useSettingsListener(STORAGE_KEYS.COLOR_FORMAT);
  useEffect(() => {
    if (formatRev === 0) return;
    const saved = lsGet(STORAGE_KEYS.COLOR_FORMAT);
    if (saved === 'rgb' || saved === 'hsl' || saved === 'oklch' || saved === 'p3') setFormat(saved);
    else setFormat('hex');
  }, [formatRev]);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const wideGamut = isWideGamutColor(colorStr);

  const displayValue = editingText ?? formatHexAs(colorStr, format);

  const selectFormat = useCallback((f: ColorFormat) => {
    setFormat(f);
    lsSet(STORAGE_KEYS.COLOR_FORMAT, f);
    setEditingText(null);
    setFormatMenuOpen(false);
  }, []);

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
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setFormatMenuOpen(v => !v)}
            title={`Format: ${format.toUpperCase()} — click to change`}
            className="px-1.5 py-1 rounded text-[10px] font-medium uppercase text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] border border-[var(--color-figma-border)] transition-colors"
          >
            {format}
          </button>
          {formatMenuOpen && (
            <div
              className="absolute right-0 bottom-full mb-1 z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg py-0.5 min-w-[56px]"
              onMouseLeave={() => setFormatMenuOpen(false)}
            >
              {FORMAT_CYCLE.map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => selectFormat(f)}
                  className={`w-full text-left px-2 py-1 text-[10px] font-medium uppercase transition-colors ${
                    f === format
                      ? 'text-[var(--color-figma-accent)] bg-[var(--color-figma-bg-hover)]'
                      : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
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

const UNIT_CONVERSIONS: Record<string, Record<string, ((v: number) => number) | null>> = {
  px: { rem: v => Math.round((v / 16) * 1000) / 1000, em: v => Math.round((v / 16) * 1000) / 1000, '%': null },
  rem: { px: v => Math.round(v * 16 * 1000) / 1000, em: v => v, '%': null },
  em: { px: v => Math.round(v * 16 * 1000) / 1000, rem: v => v, '%': null },
  '%': { px: null, rem: null, em: null },
};

export function DimensionEditor({ value, onChange, allTokensFlat = {}, pathToSet = {}, autoFocus }: { value: any; onChange: (v: any) => void; allTokensFlat?: Record<string, TokenMapEntry>; pathToSet?: Record<string, string>; autoFocus?: boolean }) {
  const val = typeof value === 'object' ? value : { value: value ?? 0, unit: 'px' };
  const isFormulaValue = typeof val.value === 'string' && isFormula(val.value);
  const [formulaMode, setFormulaMode] = useState(isFormulaValue);
  const [conversionWarning, setConversionWarning] = useState<string | null>(null);
  const numVal = formulaMode ? 0 : (parseFloat(val.value) || 0);
  const formulaStr = formulaMode ? (typeof val.value === 'string' ? val.value : '') : '';
  const preview = formulaMode && formulaStr ? resolveFormulaPreview(formulaStr, allTokensFlat) : null;

  const handleUnitChange = (newUnit: string) => {
    if (formulaMode) {
      onChange({ ...val, unit: newUnit });
      setConversionWarning(null);
      return;
    }
    const conversion = UNIT_CONVERSIONS[val.unit]?.[newUnit];
    if (conversion === null) {
      onChange({ value: numVal, unit: newUnit });
      setConversionWarning(
        `Value kept as-is — converting between % and ${val.unit === '%' ? newUnit : '%'} requires a reference value`
      );
    } else {
      const newValue = conversion ? conversion(numVal) : numVal;
      onChange({ value: newValue, unit: newUnit });
      setConversionWarning(null);
    }
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
      {conversionWarning && (
        <div className="px-2 py-1.5 rounded text-[10px] text-amber-700 bg-amber-50 border border-amber-200">
          {conversionWarning}
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
  const localRef = useRef<HTMLInputElement>(null);
  const effectiveRef = inputRef || localRef;

  // Open reference picker directly
  const openRefPicker = () => {
    if (isAlias) {
      // Already a reference — clear it to go back to direct value
      onChange(inputType === 'number' ? 0 : '');
    } else {
      // Start typing a reference
      onChange('{');
      setShowAC(true);
      setTimeout(() => {
        const el = typeof effectiveRef === 'object' && effectiveRef?.current;
        if (el) { el.focus(); el.setSelectionRange(1, 1); }
      }, 0);
    }
  };

  return (
    <div className="relative flex items-center gap-1">
      <input
        ref={effectiveRef as any}
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
        className={`${inputClass} flex-1${isAlias ? ' !border-[var(--color-figma-accent)]' : ''}${className ? ` ${className}` : ''}`}
      />
      <button
        type="button"
        onClick={openRefPicker}
        title={isAlias ? 'Clear reference — use direct value' : 'Reference a token'}
        className={`p-0.5 rounded shrink-0 transition-colors ${
          isAlias
            ? 'text-[var(--color-figma-accent)] hover:text-[var(--color-figma-error)]'
            : 'text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
        }`}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
        </svg>
      </button>
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

/**
 * Font family sub-property input for typography editor.
 * Uses FontFamilyPicker for literal values, falls back to alias input when typing `{`.
 */
function FontFamilySubProp({
  value,
  onChange,
  allTokensFlat,
  pathToSet,
  availableFonts,
  inputRef,
}: {
  value: any;
  onChange: (v: any) => void;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  availableFonts: string[];
  inputRef?: Ref<HTMLInputElement>;
}) {
  const isAlias = typeof value === 'string' && value.startsWith('{');
  const [showAC, setShowAC] = useState(false);

  if (isAlias || showAC) {
    // Show alias autocomplete input
    return (
      <div className="relative flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={String(value ?? '')}
          onChange={e => {
            const raw = e.target.value;
            setShowAC(raw.includes('{') && !raw.endsWith('}'));
            onChange(raw);
          }}
          onFocus={() => {
            const v = String(value ?? '');
            if (v.includes('{') && !v.endsWith('}')) setShowAC(true);
          }}
          onBlur={() => setTimeout(() => setShowAC(false), 150)}
          placeholder="Inter"
          className={`${inputClass} flex-1${isAlias ? ' !border-[var(--color-figma-accent)]' : ''}`}
        />
        {isAlias && (
          <button
            type="button"
            onClick={() => { onChange(''); setShowAC(false); }}
            title="Clear reference — use direct value"
            className="p-0.5 rounded shrink-0 transition-colors text-[var(--color-figma-accent)] hover:text-[var(--color-figma-error)]"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
              <line x1="4" y1="4" x2="20" y2="20"/>
            </svg>
          </button>
        )}
        {showAC && (
          <AliasAutocomplete
            query={String(value ?? '').includes('{') ? String(value ?? '').slice(String(value ?? '').lastIndexOf('{') + 1).replace(/\}.*$/, '') : ''}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            filterType="fontFamily"
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

  // Literal mode — use font picker with a way to switch to alias
  return (
    <div className="flex items-center gap-1">
      <div className="flex-1">
        <FontFamilyPicker
          value={typeof value === 'string' ? value : ''}
          onChange={v => {
            if (v.startsWith('{')) {
              setShowAC(true);
            }
            onChange(v);
          }}
          availableFonts={availableFonts}
          placeholder="Inter"
        />
      </div>
      <button
        type="button"
        onClick={() => { onChange('{'); setShowAC(true); }}
        title="Reference a token"
        className="p-0.5 rounded shrink-0 transition-colors text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
        </svg>
      </button>
    </div>
  );
}

function resolveTypographyValue(raw: unknown, allTokensFlat: Record<string, TokenMapEntry>): unknown {
  if (isAlias(raw)) {
    const entry = allTokensFlat[extractAliasPath(raw)!];
    if (entry) return entry.$value;
  }
  return raw;
}

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
  const isFontSizeAlias = typeof val.fontSize === 'string' && val.fontSize.startsWith('{');
  const fontSize = !isFontSizeAlias && typeof val.fontSize === 'object' ? val.fontSize : { value: val.fontSize ?? 16, unit: 'px' };
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
            />
          ) : (
            <div>
              <select
                value={val.fontWeight ?? 400}
                onChange={e => update('fontWeight', parseInt(e.target.value))}
                className={`${inputClass} ${fieldBorderClass(false, weightUnavailable)}`}
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

export function ShadowEditor({ value, onChange, allTokensFlat, pathToSet, baseValue }: { value: any; onChange: (v: any) => void; allTokensFlat: Record<string, TokenMapEntry>; pathToSet: Record<string, string>; baseValue?: any }) {
  const rawVal = typeof value === 'object' ? value : {};
  const base = typeof baseValue === 'object' && baseValue !== null ? baseValue : undefined;
  const val = base ? { ...base, ...rawVal } : rawVal;
  const isInherited = (key: string) => base && !(key in rawVal) && key in base;
  const update = (key: string, v: any) => {
    if (base) {
      onChange({ ...rawVal, [key]: v });
    } else {
      onChange({ ...val, [key]: v });
    }
  };
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

export function BorderEditor({ value, onChange, allTokensFlat, pathToSet, baseValue }: { value: any; onChange: (v: any) => void; allTokensFlat: Record<string, TokenMapEntry>; pathToSet: Record<string, string>; baseValue?: any }) {
  const rawVal = typeof value === 'object' ? value : {};
  const base = typeof baseValue === 'object' && baseValue !== null ? baseValue : undefined;
  const val = base ? { ...base, ...rawVal } : rawVal;
  const update = (key: string, v: any) => {
    if (base) {
      onChange({ ...rawVal, [key]: v });
    } else {
      onChange({ ...val, [key]: v });
    }
  };
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
  const [dragging, setDragging] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readFileAsDataUri = (file: File) => {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/') && file.type !== 'application/pdf') return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onChange(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFileAsDataUri(file);
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFileAsDataUri(file);
    e.target.value = '';
  };

  const isDataUri = url.startsWith('data:');
  const dataUriSize = isDataUri ? Math.round((url.length * 3) / 4 / 1024) : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        <input
          type="url"
          value={isDataUri ? '' : url}
          onChange={e => { onChange(e.target.value); setLoadError(false); }}
          placeholder={isDataUri ? `data URI (${dataUriSize}KB)` : 'https://example.com/image.png'}
          className={inputClass}
          disabled={isDataUri}
        />
        {isDataUri && (
          <button
            onClick={() => onChange('')}
            className="shrink-0 px-2 py-1 rounded text-[10px] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
            title="Clear data URI"
          >
            Clear
          </button>
        )}
      </div>

      {/* Preview */}
      {isValidUrl && (
        <div className="relative rounded border border-[var(--color-figma-border)] overflow-hidden bg-[var(--color-figma-bg-secondary)] flex items-center justify-center" style={{ minHeight: '80px', maxHeight: '160px' }}>
          {!loadError ? (
            <img
              src={url}
              alt="Asset preview"
              className="max-w-full max-h-40 object-contain"
              onLoad={() => setLoadError(false)}
              onError={() => setLoadError(true)}
            />
          ) : (
            <div className="flex flex-col items-center gap-1 p-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Unable to load image</span>
            </div>
          )}
          {isDataUri && !loadError && (
            <span className="absolute bottom-1 right-1 text-[9px] px-1 py-0.5 rounded bg-black/40 text-white/80">{dataUriSize}KB</span>
          )}
        </div>
      )}

      {/* Drop zone / upload */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-1.5 rounded border-2 border-dashed cursor-pointer transition-colors py-3 px-2 ${
          dragging
            ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10'
            : 'border-[var(--color-figma-border)] hover:border-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)]'
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
          {dragging ? 'Drop image here' : 'Drag & drop or click to upload'}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="sr-only"
        />
      </div>
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

export function FontFamilyEditor({ value, onChange, autoFocus, availableFonts }: { value: any; onChange: (v: any) => void; autoFocus?: boolean; availableFonts?: string[] }) {
  return (
    <FontFamilyPicker
      value={typeof value === 'string' ? value : ''}
      onChange={onChange}
      availableFonts={availableFonts || []}
      autoFocus={autoFocus}
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

/** Maps each composition property to its expected DTCG type for type-aware editing. */
const COMP_PROP_TYPE: Record<string, 'color' | 'dimension' | 'number' | 'boolean' | 'typography' | 'shadow'> = {
  fill: 'color',
  stroke: 'color',
  width: 'dimension',
  height: 'dimension',
  paddingTop: 'dimension',
  paddingRight: 'dimension',
  paddingBottom: 'dimension',
  paddingLeft: 'dimension',
  itemSpacing: 'dimension',
  cornerRadius: 'dimension',
  strokeWeight: 'dimension',
  opacity: 'number',
  typography: 'typography',
  shadow: 'shadow',
  visible: 'boolean',
};

const COMP_PROP_LABELS: Record<string, string> = {
  fill: 'Fill',
  stroke: 'Stroke',
  width: 'Width',
  height: 'Height',
  paddingTop: 'Padding Top',
  paddingRight: 'Padding Right',
  paddingBottom: 'Padding Bottom',
  paddingLeft: 'Padding Left',
  itemSpacing: 'Item Spacing',
  cornerRadius: 'Corner Radius',
  strokeWeight: 'Stroke Weight',
  opacity: 'Opacity',
  typography: 'Typography',
  shadow: 'Shadow',
  visible: 'Visible',
};

function CompositionPropertyEditor({
  prop,
  value,
  onChange,
  allTokensFlat,
  pathToSet,
}: {
  prop: string;
  value: any;
  onChange: (v: any) => void;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
}) {
  const propType = COMP_PROP_TYPE[prop] || 'string';
  const isAlias = typeof value === 'string' && value.startsWith('{');

  if (propType === 'color') {
    return (
      <div className="flex gap-1.5 items-center flex-1">
        {!isAlias && typeof value === 'string' && value && !value.startsWith('{') && (
          <ColorSwatchButton
            color={value}
            onChange={onChange}
            className="w-6 h-6"
          />
        )}
        <SubPropInput
          value={value || ''}
          onChange={onChange}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          filterType="color"
          inputType="string"
          placeholder="#000000 or {color.token}"
        />
      </div>
    );
  }

  if (propType === 'dimension') {
    return (
      <SubPropInput
        value={isAlias ? value : (typeof value === 'object' && value !== null ? value.value : (value ?? ''))}
        onChange={v => {
          if (typeof v === 'string' && v.startsWith('{')) {
            onChange(v);
          } else {
            const n = parseFloat(String(v));
            onChange(isNaN(n) ? v : n);
          }
        }}
        allTokensFlat={allTokensFlat}
        pathToSet={pathToSet}
        filterType="dimension"
        placeholder="16 or {spacing.token}"
        className="flex-1"
      />
    );
  }

  if (propType === 'number') {
    return (
      <div className="flex gap-1.5 items-center flex-1">
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isAlias ? 1 : (typeof value === 'number' ? value : parseFloat(String(value)) || 1)}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="flex-1 h-1.5 accent-[var(--color-figma-accent)]"
          disabled={isAlias}
        />
        <SubPropInput
          value={isAlias ? value : String(value ?? 1)}
          onChange={v => {
            if (typeof v === 'string' && v.startsWith('{')) {
              onChange(v);
            } else {
              const n = parseFloat(String(v));
              onChange(isNaN(n) ? v : Math.max(0, Math.min(1, n)));
            }
          }}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          filterType="number"
          inputType="string"
          placeholder="0.5 or {opacity.token}"
          className="!w-20"
        />
      </div>
    );
  }

  if (propType === 'boolean') {
    if (isAlias) {
      return (
        <SubPropInput
          value={value}
          onChange={onChange}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          filterType="boolean"
          inputType="string"
          placeholder="{visibility.token}"
          className="flex-1"
        />
      );
    }
    return (
      <div className="flex gap-1.5 items-center flex-1">
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`px-2 py-1 rounded text-[10px] font-medium border ${
            value
              ? 'bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)] border-[var(--color-figma-accent)]/40'
              : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] border-[var(--color-figma-border)]'
          }`}
        >
          {value ? 'true' : 'false'}
        </button>
        <button
          type="button"
          onClick={() => onChange('{')}
          className="text-[9px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-accent)]"
          title="Use token reference"
        >{'{…}'}</button>
      </div>
    );
  }

  // typography, shadow — reference-only (these are complex sub-types best referenced)
  return (
    <SubPropInput
      value={typeof value === 'string' ? value : ''}
      onChange={onChange}
      allTokensFlat={allTokensFlat}
      pathToSet={pathToSet}
      filterType={propType}
      inputType="string"
      placeholder={`{${propType}.token}`}
      className="flex-1"
    />
  );
}

/** Renders a live preview box showing the composed visual result. */
function CompositionPreview({ val }: { val: Record<string, any> }) {
  const hasVisualProps = ['fill', 'stroke', 'width', 'height', 'cornerRadius', 'opacity', 'strokeWeight',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'shadow', 'visible'].some(p => p in val);
  if (!hasVisualProps) return null;

  const isRef = (v: any) => typeof v === 'string' && v.startsWith('{');
  const numVal = (v: any, fallback: number) => {
    if (isRef(v)) return fallback;
    if (typeof v === 'number') return v;
    if (typeof v === 'object' && v !== null && 'value' in v) return v.value;
    const n = parseFloat(String(v));
    return isNaN(n) ? fallback : n;
  };
  const strVal = (v: any, fallback: string) => isRef(v) ? fallback : (typeof v === 'string' ? v : fallback);

  const fill = strVal(val.fill, '#e2e8f0');
  const stroke = strVal(val.stroke, 'transparent');
  const w = numVal(val.width, 80);
  const h = numVal(val.height, 48);
  const radius = numVal(val.cornerRadius, 0);
  const opacity = 'opacity' in val ? numVal(val.opacity, 1) : 1;
  const sw = numVal(val.strokeWeight, stroke !== 'transparent' ? 1 : 0);
  const pt = numVal(val.paddingTop, 0);
  const pr = numVal(val.paddingRight, 0);
  const pb = numVal(val.paddingBottom, 0);
  const pl = numVal(val.paddingLeft, 0);
  const visible = 'visible' in val ? (isRef(val.visible) ? true : !!val.visible) : true;

  if (!visible) return (
    <div className="mt-2 pt-2 border-t border-[var(--color-figma-border)]">
      <div className={labelClass + ' mb-1'}>Preview</div>
      <p className="text-[9px] text-[var(--color-figma-text-tertiary)] italic">Hidden (visible = false)</p>
    </div>
  );

  const shadowStr = (() => {
    if (!('shadow' in val) || isRef(val.shadow)) return 'none';
    if (typeof val.shadow === 'object' && val.shadow !== null) {
      const s = val.shadow;
      const ox = numVal(s.offsetX, 0);
      const oy = numVal(s.offsetY, 0);
      const blur = numVal(s.blur, 0);
      const spread = numVal(s.spread, 0);
      const color = strVal(s.color, '#00000040');
      return `${ox}px ${oy}px ${blur}px ${spread}px ${color}`;
    }
    return 'none';
  })();

  const hasPadding = pt > 0 || pr > 0 || pb > 0 || pl > 0;

  return (
    <div className="mt-2 pt-2 border-t border-[var(--color-figma-border)]">
      <div className={labelClass + ' mb-1'}>Preview</div>
      <div className="flex items-center justify-center p-2 rounded bg-[var(--color-figma-bg)] border border-dashed border-[var(--color-figma-border)]">
        <div
          style={{
            width: Math.min(w, 200),
            height: Math.min(h, 100),
            backgroundColor: swatchBgColor(fill),
            border: sw > 0 ? `${sw}px solid ${swatchBgColor(stroke)}` : undefined,
            borderRadius: radius,
            opacity,
            boxShadow: shadowStr,
            position: 'relative',
          }}
        >
          {hasPadding && (
            <div
              style={{
                position: 'absolute',
                top: Math.min(pt, 16),
                right: Math.min(pr, 16),
                bottom: Math.min(pb, 16),
                left: Math.min(pl, 16),
                border: '1px dashed rgba(0,0,0,0.2)',
                borderRadius: Math.max(0, radius - Math.max(pt, pr, pb, pl)),
              }}
            />
          )}
        </div>
      </div>
      {Object.keys(val).some(k => isRef(val[k])) && (
        <p className="text-[9px] text-[var(--color-figma-text-tertiary)] mt-1 italic">Token references shown with fallback values</p>
      )}
    </div>
  );
}

export function CompositionEditor({ value, onChange, baseValue, allTokensFlat = {}, pathToSet = {} }: { value: any; onChange: (v: any) => void; baseValue?: any; allTokensFlat?: Record<string, TokenMapEntry>; pathToSet?: Record<string, string> }) {
  const [newProp, setNewProp] = useState(COMPOSITION_PROPERTIES[0]);
  const rawVal = typeof value === 'object' && value !== null ? value : {};
  const base = typeof baseValue === 'object' && baseValue !== null ? baseValue : undefined;
  const val = base ? { ...base, ...rawVal } : rawVal;
  const isInherited = (key: string) => base && !(key in rawVal) && key in base;
  const usedProps = Object.keys(val);
  const unusedProps = COMPOSITION_PROPERTIES.filter(p => !usedProps.includes(p));

  const update = (key: string, v: any) => {
    if (base) {
      onChange({ ...rawVal, [key]: v });
    } else {
      onChange({ ...val, [key]: v });
    }
  };
  const remove = (key: string) => {
    if (base) {
      const next = { ...rawVal };
      delete next[key];
      onChange(next);
    } else {
      const next = { ...val };
      delete next[key];
      onChange(next);
    }
  };
  const addProp = () => {
    const prop = newProp || unusedProps[0];
    if (!prop || prop in val) return;
    const defaults: Record<string, any> = {
      color: '#000000', dimension: 0, number: 1, boolean: true,
      typography: '', shadow: '',
    };
    const defaultVal = defaults[COMP_PROP_TYPE[prop] || 'string'] ?? '';
    if (base) {
      onChange({ ...rawVal, [prop]: defaultVal });
    } else {
      onChange({ ...val, [prop]: defaultVal });
    }
    setNewProp(unusedProps.filter(p => p !== prop)[0] || '');
  };

  return (
    <div className="flex flex-col gap-2">
      {usedProps.length === 0 && (
        <p className="text-[10px] text-[var(--color-figma-text-secondary)]">No properties yet — add one below.</p>
      )}
      {usedProps.map(prop => (
        <div key={prop} className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span className={`text-[10px] shrink-0 ${isInherited(prop) ? 'text-[var(--color-figma-text-tertiary)] italic' : 'text-[var(--color-figma-text-secondary)]'}`} title={prop}>
              {COMP_PROP_LABELS[prop] || prop}
              {isInherited(prop) && <span className="text-[9px] ml-0.5">(inherited)</span>}
            </span>
            <span className="text-[8px] text-[var(--color-figma-text-tertiary)] opacity-60">{COMP_PROP_TYPE[prop] || 'string'}</span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => remove(prop)}
              title={isInherited(prop) ? `Override ${prop}` : `Remove ${prop}`}
              className="p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 shrink-0"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div className={`flex items-center${isInherited(prop) ? ' opacity-60' : ''}`}>
            <CompositionPropertyEditor
              prop={prop}
              value={val[prop]}
              onChange={v => update(prop, v)}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
            />
          </div>
        </div>
      ))}
      {unusedProps.length > 0 && (
        <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--color-figma-border)]">
          <select
            value={newProp}
            onChange={e => setNewProp(e.target.value)}
            className={inputClass + ' flex-1'}
          >
            {unusedProps.map(p => <option key={p} value={p}>{COMP_PROP_LABELS[p] || p}</option>)}
          </select>
          <button
            type="button"
            onClick={addProp}
            className="px-2 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/30 shrink-0"
          >+ Add</button>
        </div>
      )}
      <CompositionPreview val={val} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FontStyle editor
// ---------------------------------------------------------------------------

const FONT_STYLES = ['normal', 'italic', 'oblique'];

export function FontStyleEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <select
      value={typeof value === 'string' ? value : 'normal'}
      onChange={e => onChange(e.target.value)}
      className={inputClass}
    >
      {FONT_STYLES.map(s => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// TextDecoration editor
// ---------------------------------------------------------------------------

const TEXT_DECORATIONS = ['none', 'underline', 'overline', 'line-through'];

export function TextDecorationEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <select
      value={typeof value === 'string' ? value : 'none'}
      onChange={e => onChange(e.target.value)}
      className={inputClass}
    >
      {TEXT_DECORATIONS.map(s => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// TextTransform editor
// ---------------------------------------------------------------------------

const TEXT_TRANSFORMS = ['none', 'uppercase', 'lowercase', 'capitalize'];

export function TextTransformEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <select
      value={typeof value === 'string' ? value : 'none'}
      onChange={e => onChange(e.target.value)}
      className={inputClass}
    >
      {TEXT_TRANSFORMS.map(s => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Percentage editor
// ---------------------------------------------------------------------------

export function PercentageEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const num = typeof value === 'number' ? value : 0;
  return (
    <div className="flex gap-2 items-center">
      <input
        type="number"
        step={1}
        value={num}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className={inputClass + ' flex-1'}
      />
      <span className="text-[11px] text-[var(--color-figma-text-secondary)] shrink-0">%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Link editor
// ---------------------------------------------------------------------------

export function LinkEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const url = typeof value === 'string' ? value : '';
  return (
    <div className="flex gap-2 items-center">
      <input
        type="url"
        value={url}
        onChange={e => onChange(e.target.value)}
        placeholder="https://…"
        className={inputClass + ' flex-1'}
      />
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open link"
          className="shrink-0 p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
          </svg>
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LetterSpacing editor (reuses dimension pattern)
// ---------------------------------------------------------------------------

const LETTER_SPACING_UNITS = ['px', 'rem', 'em', '%'];

export function LetterSpacingEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const num = typeof value?.value === 'number' ? value.value : typeof value === 'number' ? value : 0;
  const unit: string = value?.unit || 'px';
  const update = (patch: { value?: number; unit?: string }) =>
    onChange({ value: num, unit, ...patch });
  return (
    <div className="flex gap-2">
      <input
        type="number"
        step={unit === 'px' ? 0.5 : 0.01}
        value={num}
        onChange={e => update({ value: parseFloat(e.target.value) || 0 })}
        className={inputClass + ' flex-1'}
      />
      <select
        value={unit}
        onChange={e => update({ unit: e.target.value })}
        className={inputClass + ' w-16'}
      >
        {LETTER_SPACING_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LineHeight editor (unitless number or dimension)
// ---------------------------------------------------------------------------

const LINE_HEIGHT_UNITS = ['px', 'rem', 'em', '%'];

export function LineHeightEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const isDimension = typeof value === 'object' && value !== null && 'value' in value;
  const num = isDimension ? (value.value ?? 0) : (typeof value === 'number' ? value : 1.5);
  const unit: string = isDimension ? (value.unit || 'px') : '';

  const setUnitless = (n: number) => onChange(n);
  const setDimension = (patch: { value?: number; unit?: string }) => {
    const base = isDimension ? { value: num, unit: unit || 'px' } : { value: num, unit: 'px' };
    onChange({ ...base, ...patch });
  };

  const toggleMode = () => {
    if (isDimension) {
      onChange(num);
    } else {
      onChange({ value: num, unit: 'px' });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center">
        <input
          type="number"
          step={isDimension ? 1 : 0.1}
          min={0}
          value={num}
          onChange={e => {
            const n = parseFloat(e.target.value) || 0;
            isDimension ? setDimension({ value: n }) : setUnitless(n);
          }}
          className={inputClass + ' flex-1'}
        />
        {isDimension ? (
          <select
            value={unit}
            onChange={e => setDimension({ unit: e.target.value })}
            className={inputClass + ' w-16'}
          >
            {LINE_HEIGHT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        ) : (
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0 w-16 text-center">unitless</span>
        )}
      </div>
      <button
        type="button"
        onClick={toggleMode}
        className="text-[10px] text-[var(--color-figma-accent)] hover:underline bg-transparent border-none p-0 cursor-pointer self-start"
      >
        Switch to {isDimension ? 'unitless' : 'dimension'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CubicBezier editor
// ---------------------------------------------------------------------------

const BEZIER_PRESETS: { label: string; value: [number, number, number, number] }[] = [
  { label: 'linear', value: [0, 0, 1, 1] },
  { label: 'ease', value: [0.25, 0.1, 0.25, 1] },
  { label: 'ease-in', value: [0.42, 0, 1, 1] },
  { label: 'ease-out', value: [0, 0, 0.58, 1] },
  { label: 'ease-in-out', value: [0.42, 0, 0.58, 1] },
];

export function CubicBezierEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const pts: [number, number, number, number] = Array.isArray(value) && value.length === 4
    ? value as [number, number, number, number]
    : [0, 0, 1, 1];

  const update = (idx: number, v: number) => {
    const next = [...pts] as [number, number, number, number];
    next[idx] = v;
    onChange(next);
  };

  const labels = ['x1', 'y1', 'x2', 'y2'];

  // SVG curve preview
  const w = 80, h = 80, pad = 8;
  const sx = (x: number) => pad + x * (w - 2 * pad);
  const sy = (y: number) => h - pad - y * (h - 2 * pad);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-end">
        <svg width={w} height={h} className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
          <line x1={sx(0)} y1={sy(0)} x2={sx(pts[0])} y2={sy(pts[1])} stroke="var(--color-figma-text-tertiary)" strokeWidth="1" strokeDasharray="2,2" />
          <line x1={sx(1)} y1={sy(1)} x2={sx(pts[2])} y2={sy(pts[3])} stroke="var(--color-figma-text-tertiary)" strokeWidth="1" strokeDasharray="2,2" />
          <path
            d={`M ${sx(0)},${sy(0)} C ${sx(pts[0])},${sy(pts[1])} ${sx(pts[2])},${sy(pts[3])} ${sx(1)},${sy(1)}`}
            fill="none"
            stroke="var(--color-figma-accent)"
            strokeWidth="2"
          />
          <circle cx={sx(pts[0])} cy={sy(pts[1])} r="3" fill="var(--color-figma-accent)" />
          <circle cx={sx(pts[2])} cy={sy(pts[3])} r="3" fill="var(--color-figma-accent)" />
        </svg>
        <div className="flex-1 grid grid-cols-2 gap-1">
          {labels.map((label, i) => (
            <div key={label} className="flex flex-col">
              <span className={labelClass}>{label}</span>
              <input
                type="number"
                step={0.01}
                min={i % 2 === 0 ? 0 : undefined}
                max={i % 2 === 0 ? 1 : undefined}
                value={pts[i]}
                onChange={e => update(i, parseFloat(e.target.value) || 0)}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {BEZIER_PRESETS.map(p => {
          const active = p.value.every((v, i) => v === pts[i]);
          return (
            <button
              key={p.label}
              onClick={() => onChange([...p.value])}
              className={`px-2 py-0.5 rounded border text-[10px] transition-colors ${active ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transition editor (composite: duration, delay, timingFunction)
// ---------------------------------------------------------------------------

export function TransitionEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const val = typeof value === 'object' && value !== null ? value : {};
  const duration = val.duration ?? { value: 200, unit: 'ms' };
  const delay = val.delay ?? { value: 0, unit: 'ms' };
  const timingFunction = Array.isArray(val.timingFunction) ? val.timingFunction : [0.25, 0.1, 0.25, 1];

  const update = (patch: Record<string, any>) => onChange({ duration, delay, timingFunction, ...val, ...patch });

  const durationMs = typeof duration?.value === 'number' ? duration.value : typeof duration === 'number' ? duration : 200;
  const durationUnit: 'ms' | 's' = duration?.unit === 's' ? 's' : 'ms';
  const delayMs = typeof delay?.value === 'number' ? delay.value : typeof delay === 'number' ? delay : 0;
  const delayUnit: 'ms' | 's' = delay?.unit === 's' ? 's' : 'ms';

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className={labelClass}>Duration</div>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            step={durationUnit === 'ms' ? 50 : 0.05}
            value={durationMs}
            onChange={e => update({ duration: { value: parseFloat(e.target.value) || 0, unit: durationUnit } })}
            className={inputClass + ' flex-1'}
          />
          <select
            value={durationUnit}
            onChange={e => update({ duration: { value: durationMs, unit: e.target.value } })}
            className={inputClass + ' w-16'}
          >
            <option value="ms">ms</option>
            <option value="s">s</option>
          </select>
        </div>
      </div>
      <div>
        <div className={labelClass}>Delay</div>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            step={delayUnit === 'ms' ? 50 : 0.05}
            value={delayMs}
            onChange={e => update({ delay: { value: parseFloat(e.target.value) || 0, unit: delayUnit } })}
            className={inputClass + ' flex-1'}
          />
          <select
            value={delayUnit}
            onChange={e => update({ delay: { value: delayMs, unit: e.target.value } })}
            className={inputClass + ' w-16'}
          >
            <option value="ms">ms</option>
            <option value="s">s</option>
          </select>
        </div>
      </div>
      <div>
        <div className={labelClass}>Timing Function</div>
        <CubicBezierEditor value={timingFunction} onChange={(tf: any) => update({ timingFunction: tf })} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom editor (freeform JSON/string)
// ---------------------------------------------------------------------------

export function CustomEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const isObj = typeof value === 'object' && value !== null;
  const [text, setText] = useState(() => isObj ? JSON.stringify(value, null, 2) : String(value ?? ''));
  const [parseError, setParseError] = useState<string | null>(null);

  const commit = (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      onChange(parsed);
      setParseError(null);
    } catch (e) {
      console.debug('[ValueEditors] JSON parse failed, treating as string:', e);
      onChange(raw);
      setParseError(null);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={text}
        onChange={e => {
          setText(e.target.value);
          try {
            JSON.parse(e.target.value);
            setParseError(null);
          } catch (e) {
            console.debug('[ValueEditors] live JSON validation failed:', e);
            setParseError('Not valid JSON — will be saved as string');
          }
        }}
        onBlur={e => commit(e.target.value)}
        rows={4}
        className={inputClass + ' font-mono resize-y'}
        placeholder='String, number, or JSON object'
      />
      {parseError && (
        <p className="text-[9px] text-[var(--color-figma-warning)]">{parseError}</p>
      )}
    </div>
  );
}
