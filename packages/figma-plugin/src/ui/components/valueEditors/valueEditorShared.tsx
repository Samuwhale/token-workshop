/**
 * Shared utilities and sub-components used across multiple value editors.
 */
import { useState, useRef, memo, type Ref } from 'react';
import { Link2 } from 'lucide-react';
import { evalExpr } from '@token-workshop/core';
import type { CubicBezierValue, DimensionValue, TokenValue } from '@token-workshop/core';
import type { TokenMapEntry } from '../../../shared/types';
import { AliasAutocomplete } from '../AliasAutocomplete';
import { isAlias, extractAliasPath } from '../../../shared/resolveAlias';
import { FontFamilyPicker } from '../FontFamilyPicker';
import { AUTHORING } from '../../shared/editorClasses';

const REFERENCE_BUTTON_CLASS =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded border border-transparent transition-colors focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-accent)]';
const REFERENCE_FIELD_ROW_CLASS =
  'relative grid min-w-0 items-center gap-1 [grid-template-columns:minmax(0,1fr)_auto]';
const REFERENCE_FIELD_WITH_UNIT_ROW_CLASS =
  'grid min-w-0 items-center gap-1 [grid-template-columns:minmax(0,1fr)_auto_auto]';

export type TokenValueRecord = Record<string, unknown>;
export type ValueChangeHandler<T = unknown> = (value: T) => void;

export interface BasicValueEditorProps<TChange = unknown> {
  value: unknown;
  onChange: ValueChangeHandler<TChange>;
  autoFocus?: boolean;
}

export function isValueRecord(value: unknown): value is TokenValueRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toValueRecord(value: unknown): TokenValueRecord {
  return isValueRecord(value) ? value : {};
}

export function mergeInheritedValue(
  value: unknown,
  inheritedValue: unknown,
): {
  ownValue: TokenValueRecord;
  effectiveValue: TokenValueRecord;
  hasInheritedValue: boolean;
} {
  const ownValue = toValueRecord(value);
  const inheritedRecord = isValueRecord(inheritedValue) ? inheritedValue : undefined;

  return {
    ownValue,
    effectiveValue: inheritedRecord ? { ...inheritedRecord, ...ownValue } : ownValue,
    hasInheritedValue: inheritedRecord !== undefined,
  };
}

export function isReferenceDraft(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('{');
}

export function getStringProp(record: TokenValueRecord, key: string, fallback: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : fallback;
}

export function getDimensionNumber(value: unknown): string | number {
  if (isReferenceDraft(value)) return value;
  if (isValueRecord(value)) {
    return typeof value.value === 'number' ? value.value : 0;
  }
  return typeof value === 'number' ? value : 0;
}

export function toPxDimensionValue(value: unknown): DimensionValue | string {
  if (isReferenceDraft(value)) return value;
  const numberValue = typeof value === 'number' ? value : parseFloat(String(value));
  return { value: Number.isFinite(numberValue) ? numberValue : 0, unit: 'px' };
}

function normalizeDimensionDraft(value: unknown, fallbackUnit: string): { value: number; unit: string } {
  if (!isValueRecord(value)) {
    return { value: typeof value === 'number' ? value : 0, unit: fallbackUnit };
  }

  return {
    value: typeof value.value === 'number' ? value.value : 0,
    unit: typeof value.unit === 'string' ? value.unit : fallbackUnit,
  };
}

export function normalizeCubicBezierValue(
  value: unknown,
  fallback: CubicBezierValue = [0, 0, 1, 1],
): CubicBezierValue {
  if (!Array.isArray(value) || value.length !== 4) return fallback;

  const [x1, y1, x2, y2] = value;
  return [x1, y1, x2, y2].every(point => typeof point === 'number' && Number.isFinite(point))
    ? [x1, y1, x2, y2]
    : fallback;
}

export const InheritedBadge = memo(function InheritedBadge({ propKey, onOverride }: { propKey: string; onOverride: () => void }) {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      <span className="text-secondary text-[color:var(--color-figma-text-tertiary)] italic">inherited</span>
      <button
        type="button"
        onClick={onOverride}
        className="text-secondary text-[color:var(--color-figma-text-accent)] hover:underline bg-transparent border-none p-0 cursor-pointer"
        title={`Override ${propKey}`}
      >override</button>
    </span>
  );
});

export const RevertBadge = memo(function RevertBadge({ propKey, onRevert }: { propKey: string; onRevert: () => void }) {
  return (
    <button
      type="button"
      onClick={onRevert}
      className="ml-1 text-secondary text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text-accent)] hover:underline bg-transparent border-none p-0 cursor-pointer"
      title={`Revert ${propKey} to inherited value`}
    >revert</button>
  );
});

export function resolveFormulaPreview(
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

export const SubPropInput = memo(function SubPropInput({
  value,
  onChange,
  allTokensFlat,
  pathToCollectionId,
  filterType,
  placeholder,
  className,
  inputType = 'number',
  inputRef,
  autoFocus,
}: {
  value: unknown;
  onChange: ValueChangeHandler;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  filterType?: string;
  placeholder?: string;
  className?: string;
  inputType?: 'number' | 'string';
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
}) {
  const isAliasVal = isReferenceDraft(value);
  const displayValue = isAliasVal ? value : String(value ?? '');
  // Auto-show autocomplete when mounted mid-typing an alias (e.g. value === '{')
  const [showAC, setShowAC] = useState(() => typeof value === 'string' && value.includes('{') && !value.endsWith('}'));
  const localRef = useRef<HTMLInputElement>(null);
  const effectiveRef = inputRef || localRef;

  // Open reference picker directly
  const openRefPicker = () => {
    if (isAliasVal) {
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
    <div className={REFERENCE_FIELD_ROW_CLASS}>
      <input
        ref={effectiveRef}
        type="text"
        autoFocus={autoFocus}
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
        className={`${AUTHORING.input} min-w-[72px] flex-1${isAliasVal ? ' !border-[var(--color-figma-accent)]' : ''}${className ? ` ${className}` : ''}`}
      />
      <button
        type="button"
        onClick={openRefPicker}
        title={isAliasVal ? 'Clear reference — use direct value' : 'Reference a token'}
        aria-label={isAliasVal ? 'Clear reference' : 'Reference a token'}
        className={`${REFERENCE_BUTTON_CLASS} ${
          isAliasVal
            ? 'text-[color:var(--color-figma-text-accent)] hover:text-[color:var(--color-figma-text-error)]'
            : 'text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
        }`}
      >
        <Link2 size={12} strokeWidth={1.8} aria-hidden />
      </button>
      {showAC && (
        <AliasAutocomplete
          query={displayValue.includes('{') ? displayValue.slice(displayValue.lastIndexOf('{') + 1).replace(/\}.*$/, '') : ''}
          allTokensFlat={allTokensFlat}
          pathToCollectionId={pathToCollectionId}
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
});

/**
 * Dimension sub-property input: number + unit select for literal values,
 * SubPropInput with autocomplete for alias values. Includes a link button to switch modes.
 */
export const DimensionSubProp = memo(function DimensionSubProp({
  value,
  onChange,
  allTokensFlat,
  pathToCollectionId,
  units = ['px', 'rem'],
  placeholder = '0',
  inputRef,
}: {
  value: unknown;
  onChange: ValueChangeHandler;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  units?: string[];
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const isAliasVal = isReferenceDraft(value);
  const dim = normalizeDimensionDraft(value, units[0]);

  if (isAliasVal) {
    return (
      <SubPropInput
        value={value}
        onChange={onChange}
        allTokensFlat={allTokensFlat}
        pathToCollectionId={pathToCollectionId}
        filterType="dimension"
        inputType="string"
        autoFocus={value === '{'}
        inputRef={inputRef}
      />
    );
  }

  return (
    <div className={REFERENCE_FIELD_WITH_UNIT_ROW_CLASS}>
      <input
        ref={inputRef}
        type="number"
        value={dim.value ?? 0}
        onChange={e => onChange({ ...dim, value: parseFloat(e.target.value) || 0 })}
        className={`${AUTHORING.input} min-w-[72px] flex-1`}
        placeholder={placeholder}
        onKeyDown={e => {
          if (e.key === '{') {
            e.preventDefault();
            onChange('{');
          }
        }}
      />
      <select
        value={dim.unit ?? units[0]}
        onChange={e => onChange({ ...dim, unit: e.target.value })}
        className={`${AUTHORING.input} w-[64px] shrink-0`}
      >
        {units.map(u => <option key={u} value={u}>{u}</option>)}
      </select>
      <button
        type="button"
        onClick={() => onChange('{')}
        title="Reference a token"
        className={`${REFERENCE_BUTTON_CLASS} text-[color:var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]`}
      >
        <Link2 size={12} strokeWidth={1.8} aria-hidden />
      </button>
    </div>
  );
});

/**
 * Font family sub-property input for typography editor.
 * Uses FontFamilyPicker for literal values, falls back to alias input when typing `{`.
 */
export const FontFamilySubProp = memo(function FontFamilySubProp({
  value,
  onChange,
  allTokensFlat,
  pathToCollectionId,
  availableFonts,
  inputRef,
}: {
  value: unknown;
  onChange: ValueChangeHandler;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  availableFonts: string[];
  inputRef?: Ref<HTMLInputElement>;
}) {
  const isAliasVal = typeof value === 'string' && value.startsWith('{');
  const [showAC, setShowAC] = useState(false);

  if (isAliasVal || showAC) {
    // Show alias autocomplete input
    return (
      <div className={REFERENCE_FIELD_ROW_CLASS}>
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
          className={`${AUTHORING.input} min-w-[72px] flex-1${isAliasVal ? ' !border-[var(--color-figma-accent)]' : ''}`}
        />
        {isAliasVal && (
          <button
            type="button"
            onClick={() => { onChange(''); setShowAC(false); }}
            title="Clear reference — use direct value"
            aria-label="Clear reference"
            className={`${REFERENCE_BUTTON_CLASS} text-[color:var(--color-figma-text-accent)] hover:text-[color:var(--color-figma-text-error)]`}
          >
            <Link2 size={12} strokeWidth={1.8} aria-hidden />
          </button>
        )}
        {showAC && (
          <AliasAutocomplete
            query={String(value ?? '').includes('{') ? String(value ?? '').slice(String(value ?? '').lastIndexOf('{') + 1).replace(/\}.*$/, '') : ''}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
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
    <div className={REFERENCE_FIELD_ROW_CLASS}>
      <div className="min-w-0">
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
        className={`${REFERENCE_BUTTON_CLASS} text-[color:var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]`}
      >
        <Link2 size={12} strokeWidth={1.8} aria-hidden />
      </button>
    </div>
  );
});

export function resolveTypographyValue(raw: unknown, allTokensFlat: Record<string, TokenMapEntry>): unknown {
  if (isAlias(raw as TokenValue | undefined)) {
    const entry = allTokensFlat[extractAliasPath(raw as TokenValue)!];
    if (entry) return entry.$value;
  }
  return raw;
}

export const FONT_WEIGHTS = [
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
