import { useState, memo } from 'react';
import { isFormula } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../../shared/types';
import { FormulaInput } from '../FormulaInput';
import { AUTHORING } from '../../shared/editorClasses';
import { resolveFormulaPreview } from './valueEditorShared';

export const StepperInput = memo(function StepperInput({
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
        className={AUTHORING.input + ' w-full pr-5 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'}
      />
      <div className="absolute right-0 top-0 bottom-0 flex flex-col border-l border-[var(--color-figma-border)]">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Increment"
          onMouseDown={e => { e.preventDefault(); step(1); }}
          className="flex-1 px-0.5 flex items-center justify-center text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] leading-none"
        >
          <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor" aria-hidden="true"><path d="M0 5l3-4 3 4H0z"/></svg>
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Decrement"
          onMouseDown={e => { e.preventDefault(); step(-1); }}
          className="flex-1 px-0.5 flex items-center justify-center text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] border-t border-[var(--color-figma-border)] leading-none"
        >
          <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor" aria-hidden="true"><path d="M0 1l3 4 3-4H0z"/></svg>
        </button>
      </div>
    </div>
  );
});

const UNIT_CONVERSIONS: Record<string, Record<string, ((v: number) => number) | null>> = {
  px: { rem: v => Math.round((v / 16) * 1000) / 1000, em: v => Math.round((v / 16) * 1000) / 1000, '%': null },
  rem: { px: v => Math.round(v * 16 * 1000) / 1000, em: v => v, '%': null },
  em: { px: v => Math.round(v * 16 * 1000) / 1000, rem: v => v, '%': null },
  '%': { px: null, rem: null, em: null },
};

export const DimensionEditor = memo(function DimensionEditor({ value, onChange, allTokensFlat = {}, pathToCollectionId = {}, autoFocus }: { value: any; onChange: (v: any) => void; allTokensFlat?: Record<string, TokenMapEntry>; pathToCollectionId?: Record<string, string>; autoFocus?: boolean }) {
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
            pathToCollectionId={pathToCollectionId}
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
          className={AUTHORING.input + ' w-16'}
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
          className={`shrink-0 px-1.5 py-1 rounded text-secondary font-mono border transition-colors ${formulaMode ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]'}`}
        >
          fx
        </button>
      </div>
      {formulaMode && formulaStr && (
        <div className={`px-2 py-1 rounded text-secondary font-mono ${preview?.error ? 'text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-error)]/30' : 'text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-accent)]/5 border border-[var(--color-figma-accent)]/20'}`}>
          {preview?.error ? preview.error : `= ${preview?.result} ${val.unit}`}
        </div>
      )}
      {conversionWarning && (
        <div className="px-2 py-1.5 rounded text-secondary text-[var(--color-figma-warning)] bg-[var(--color-figma-warning)]/10 border border-[var(--color-figma-warning)]/30">
          {conversionWarning}
        </div>
      )}
    </div>
  );
});
