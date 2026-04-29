import { useEffect, useState, memo } from 'react';
import { isFormula } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../../shared/types';
import { FormulaInput } from '../FormulaInput';
import { resolveFormulaPreview } from './valueEditorShared';
import { StepperInput } from './DimensionEditor';

export const NumberEditor = memo(function NumberEditor({ value, onChange, allTokensFlat = {}, pathToCollectionId = {}, autoFocus }: { value: any; onChange: (v: any) => void; allTokensFlat?: Record<string, TokenMapEntry>; pathToCollectionId?: Record<string, string>; autoFocus?: boolean }) {
  const isFormulaValue = typeof value === 'string' && isFormula(value);
  const [formulaMode, setFormulaMode] = useState(isFormulaValue);
  useEffect(() => {
    if (isFormulaValue) {
      setFormulaMode(true);
      return;
    }
    if (typeof value !== 'string') {
      setFormulaMode(false);
    }
  }, [isFormulaValue, value]);
  const numVal = formulaMode ? 0 : (parseFloat(value) || 0);
  const formulaStr = formulaMode ? (typeof value === 'string' ? value : '') : '';
  const preview = formulaMode && formulaStr ? resolveFormulaPreview(formulaStr, allTokensFlat) : null;

  const toggleFormulaMode = () => {
    if (formulaMode) {
      onChange(preview?.result ?? 0);
      setFormulaMode(false);
    } else {
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
            pathToCollectionId={pathToCollectionId}
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
          className={`shrink-0 px-1.5 py-1 rounded text-secondary font-mono border transition-colors ${formulaMode ? 'border-[var(--color-figma-accent)] text-[color:var(--color-figma-text-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[color:var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[color:var(--color-figma-text-accent)]'}`}
        >
          fx
        </button>
      </div>
      {formulaMode && formulaStr && (
        <div className={`px-2 py-1 rounded text-secondary font-mono ${preview?.error ? 'text-[color:var(--color-figma-text-error)] bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-error)]/30' : 'text-[color:var(--color-figma-text-secondary)] bg-[var(--color-figma-accent)]/5 border border-[var(--color-figma-accent)]/20'}`}>
          {preview?.error ? preview.error : `= ${preview?.result}`}
        </div>
      )}
    </div>
  );
});
