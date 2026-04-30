import { useEffect, useState, memo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { isFormula } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../../shared/types';
import { FormulaInput } from '../FormulaInput';
import { AUTHORING } from '../../shared/editorClasses';
import { isValueRecord, resolveFormulaPreview, type BasicValueEditorProps } from './valueEditorShared';

export const StepperInput = memo(function StepperInput({
  value,
  onChange,
  className = '',
  autoFocus,
  ariaLabel = 'Numeric value',
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const [draftValue, setDraftValue] = useState(() => String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraftValue(String(value));
    }
  }, [focused, value]);

  const parseDraft = (raw: string, allowTrailingDecimal = false): number | null => {
    if (
      raw.trim() === '' ||
      raw === '-' ||
      raw === '+' ||
      (!allowTrailingDecimal && raw.endsWith('.'))
    ) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const commitDraft = () => {
    const parsed = parseDraft(draftValue, true);
    const committed = parsed ?? value;
    setDraftValue(String(committed));
    if (committed !== value) {
      onChange(committed);
    }
  };

  const step = (delta: number) => {
    const current = parseDraft(draftValue, true) ?? value;
    const next = Math.round((current + delta) * 1000) / 1000;
    setDraftValue(String(next));
    onChange(next);
  };

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
        aria-label={ariaLabel}
        value={draftValue}
        onChange={e => {
          const nextDraft = e.target.value;
          setDraftValue(nextDraft);
          const parsed = parseDraft(nextDraft);
          if (parsed !== null) {
            onChange(parsed);
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commitDraft();
        }}
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
          className="flex-1 px-0.5 flex items-center justify-center text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] leading-none"
        >
          <ChevronUp size={8} strokeWidth={2} aria-hidden />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Decrement"
          onMouseDown={e => { e.preventDefault(); step(-1); }}
          className="flex-1 px-0.5 flex items-center justify-center text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] border-t border-[var(--color-figma-border)] leading-none"
        >
          <ChevronDown size={8} strokeWidth={2} aria-hidden />
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

interface DimensionEditorValue {
  value: number | string;
  unit: string;
}

interface DimensionEditorProps extends BasicValueEditorProps<DimensionEditorValue> {
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  allowFormula?: boolean;
}

function normalizeDimensionEditorValue(value: unknown): DimensionEditorValue {
  if (!isValueRecord(value)) {
    return {
      value: typeof value === 'number' || typeof value === 'string' ? value : 0,
      unit: 'px',
    };
  }

  return {
    value: typeof value.value === 'number' || typeof value.value === 'string' ? value.value : 0,
    unit: typeof value.unit === 'string' ? value.unit : 'px',
  };
}

export const DimensionEditor = memo(function DimensionEditor({
  value,
  onChange,
  allTokensFlat = {},
  pathToCollectionId = {},
  autoFocus,
  allowFormula = true,
}: DimensionEditorProps) {
  const val = normalizeDimensionEditorValue(value);
  const isFormulaValue = allowFormula && typeof val.value === 'string' && isFormula(val.value);
  const [formulaMode, setFormulaMode] = useState(isFormulaValue);
  useEffect(() => {
    if (isFormulaValue) {
      setFormulaMode(true);
      return;
    }
    if (!allowFormula || typeof val.value !== 'string') {
      setFormulaMode(false);
    }
  }, [allowFormula, isFormulaValue, val.value]);
  const [conversionWarning, setConversionWarning] = useState<string | null>(null);
  const numVal = formulaMode ? 0 : (parseFloat(String(val.value)) || 0);
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
      setFormulaMode(true);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-start gap-2">
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
            className="min-w-0 flex-[1_1_140px]"
            autoFocus={autoFocus}
          />
        )}
        <select
          value={val.unit}
          onChange={e => handleUnitChange(e.target.value)}
          className={AUTHORING.input + ' min-h-[28px] w-[72px] shrink-0'}
          aria-label="Dimension unit"
        >
          <option value="px">px</option>
          <option value="rem">rem</option>
          <option value="em">em</option>
          <option value="%">%</option>
        </select>
        {allowFormula ? (
          <button
            type="button"
            onClick={toggleFormulaMode}
            title={formulaMode ? 'Switch to literal value' : 'Enter expression'}
            aria-label={formulaMode ? 'Switch to literal value' : 'Enter expression'}
            className={`min-h-[28px] shrink-0 rounded border px-2 py-1 text-secondary font-mono transition-colors ${formulaMode ? 'border-[var(--color-figma-accent)] text-[color:var(--color-figma-text-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[color:var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[color:var(--color-figma-text-accent)]'}`}
          >
            fx
          </button>
        ) : null}
      </div>
      {formulaMode && formulaStr && (
        <div className={`px-2 py-1 rounded text-secondary font-mono ${preview?.error ? 'text-[color:var(--color-figma-text-error)] bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-error)]/30' : 'text-[color:var(--color-figma-text-secondary)] bg-[var(--color-figma-accent)]/5 border border-[var(--color-figma-accent)]/20'}`}>
          {preview?.error ? preview.error : `= ${preview?.result} ${val.unit}`}
        </div>
      )}
      {conversionWarning && (
        <div className="px-2 py-1.5 rounded text-secondary text-[color:var(--color-figma-text-warning)] bg-[var(--color-figma-warning)]/10 border border-[var(--color-figma-warning)]/30">
          {conversionWarning}
        </div>
      )}
    </div>
  );
});
