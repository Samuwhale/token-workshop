import { useState } from 'react';
import type { DimensionValue } from '@tokenmanager/core';
import type { GeneratedTokenResult } from '../../hooks/useGenerators';
import { formatTokenValueForDisplay } from '../../shared/tokenFormatting';

// ---------------------------------------------------------------------------
// Shared input primitives for generator config editors
// ---------------------------------------------------------------------------

/**
 * A compact hex color input: a native color swatch + a hex text field.
 * Used in generator config editors that don't need the full ColorEditor
 * (format cycling, wide-gamut detection, etc.).
 */
export function CompactColorInput({
  value,
  onChange,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (hex: string) => void;
  'aria-label'?: string;
}) {
  const hex6 = value.slice(0, 7);
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(hex6) ? hex6 : '#808080'}
        onChange={e => onChange(e.target.value)}
        className="w-7 h-7 rounded cursor-pointer border border-[var(--color-figma-border)]"
        aria-label={ariaLabel ?? 'Pick color'}
      />
      <input
        value={hex6}
        onChange={e => {
          const val = e.target.value;
          if (/^#[0-9a-fA-F]{0,6}$/.test(val)) onChange(val);
        }}
        className="w-20 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-secondary font-mono focus-visible:border-[var(--color-figma-accent)]"
        aria-label={`${ariaLabel ?? 'Color'} hex value`}
      />
    </div>
  );
}

/**
 * A row of pill buttons for selecting a unit (px, rem, etc.).
 * Renders consistently across all generator config editors.
 */
export function UnitToggle<T extends string>({
  units,
  value,
  onChange,
}: {
  units: readonly T[];
  value: T;
  onChange: (unit: T) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {units.map(u => (
        <button
          key={u}
          type="button"
          onClick={() => onChange(u)}
          className={`px-2 py-1 rounded text-secondary font-medium border transition-colors ${
            value === u
              ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
              : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
          }`}
        >
          {u}
        </button>
      ))}
    </div>
  );
}

const DIM_UNITS = ['px', 'rem'] as const;

/**
 * A number input combined with a UnitToggle (px / rem by default).
 * Used in generator config editors for dimension values.
 */
export function CompactDimensionInput({
  value,
  unit,
  units = DIM_UNITS,
  onValueChange,
  onUnitChange,
  placeholder,
  className,
}: {
  value: number | undefined;
  unit: string;
  units?: readonly string[];
  onValueChange: (v: number | undefined) => void;
  onUnitChange: (u: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <input
        type="number"
        value={value ?? ''}
        onChange={e => {
          const num = parseFloat(e.target.value);
          onValueChange(isNaN(num) ? undefined : num);
        }}
        placeholder={placeholder}
        className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-body font-mono focus-visible:border-[var(--color-figma-accent)]"
      />
      <UnitToggle units={units} value={unit} onChange={onUnitChange} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Type guard for DTCG dimension values ({ value: number; unit: string })
// ---------------------------------------------------------------------------

export function isDimensionLike(v: unknown): v is DimensionValue {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.value === 'number' && typeof obj.unit === 'string';
}

// ---------------------------------------------------------------------------
// Shared value formatter
// ---------------------------------------------------------------------------

export function formatValue(value: unknown): string {
  return formatTokenValueForDisplay(undefined, value, { emptyPlaceholder: '' });
}

// ---------------------------------------------------------------------------
// Manual exception row + table
// ---------------------------------------------------------------------------

export function OverrideRow({ token, override, onOverrideChange, onOverrideClear, isOverwrite, children }: {
  token: GeneratedTokenResult;
  override?: { value: unknown; locked: boolean };
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
  isOverwrite?: boolean;
  children?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const isOverridden = Boolean(override);

  const handleStartEdit = () => {
    setEditValue(formatValue(override?.value ?? token.value));
    setEditing(true);
  };

  const handleCommit = () => {
    if (editValue.trim()) {
      onOverrideChange(token.stepName, editValue.trim(), true);
    }
    setEditing(false);
  };

  return (
    <div className={`group flex items-center gap-1.5 px-1.5 py-1 rounded transition-colors cursor-pointer ${
      token.warning ? 'bg-[var(--color-figma-error)]/8' : isOverridden ? 'bg-[var(--color-figma-accent)]/8' : 'hover:bg-[var(--color-figma-bg-hover)]'
    }`}
      onClick={!editing ? handleStartEdit : undefined}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (!editing && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleStartEdit(); } }}
    >
      {/* Step name */}
      <span className="w-8 text-secondary text-[var(--color-figma-text-secondary)] shrink-0 text-right font-mono">{token.stepName}</span>

      {/* Badge for manual exceptions */}
      {isOverridden && (
        <span className="shrink-0 flex items-center gap-0.5 px-1 py-0.5 rounded bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]" title="Manual exception — stays when the group updates">
          <svg width="7" height="7" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <path d="M9 5V4a3 3 0 0 0-6 0v1a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1ZM4 4a2 2 0 1 1 4 0v1H4V4Z" />
          </svg>
          <span className="text-[8px] font-medium">exception</span>
        </span>
      )}

      {isOverwrite && !isOverridden && (
        <span className="shrink-0 px-1 py-0.5 leading-none rounded text-[8px] font-medium bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)]">update</span>
      )}

      {token.warning && (
        <span title={token.warning} className="shrink-0 text-[var(--color-figma-error)]" aria-label="Formula error">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
      )}
      {children}

      {/* Inline edit / clear controls */}
      {editing ? (
        <input
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onClick={e => e.stopPropagation()}
          onBlur={handleCommit}
          onKeyDown={e => { if (e.key === 'Enter') handleCommit(); if (e.key === 'Escape') setEditing(false); }}
          className="w-24 px-1.5 py-0.5 rounded border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] text-secondary font-mono outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)] shrink-0"
        />
      ) : (
        <div className="flex items-center gap-1 shrink-0">
          {/* Click hint — appears on hover */}
          <span className="text-[8px] text-[var(--color-figma-text-secondary)] opacity-0 group-hover:opacity-60 transition-opacity select-none">
            click to edit
          </span>
          {isOverridden && (
            <button
              onClick={e => { e.stopPropagation(); onOverrideClear(token.stepName); }}
              title="Clear manual exception"
              aria-label="Clear manual exception"
              className="p-0.5 rounded transition-colors text-[var(--color-figma-text-secondary)] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="2" y1="2" x2="10" y2="10" />
                <line x1="10" y1="2" x2="2" y2="10" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function OverrideTable({ tokens, overrides, onOverrideChange, onOverrideClear, overwritePaths }: {
  tokens: GeneratedTokenResult[];
  overrides: Record<string, { value: unknown; locked: boolean }>;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
  overwritePaths?: Set<string>;
}) {
  return (
    <div className="flex flex-col gap-0.5 mt-1 border-t border-[var(--color-figma-border)] pt-1.5">
      {tokens.map(t => (
        <OverrideRow key={t.stepName} token={t} override={overrides[t.stepName]} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} isOverwrite={overwritePaths?.has(t.path)}>
          <span className="flex-1 text-secondary font-mono text-[var(--color-figma-text-secondary)] truncate">{formatValue(t.value)}</span>
        </OverrideRow>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic preview (used by zIndexScale and customScale)
// ---------------------------------------------------------------------------

export function GenericPreview({ tokens, overrides, onOverrideChange, onOverrideClear, overwritePaths }: {
  tokens: GeneratedTokenResult[];
  overrides: Record<string, { value: unknown; locked: boolean }>;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
  overwritePaths?: Set<string>;
}) {
  const warningCount = tokens.filter(t => t.warning).length;
  return (
    <div className="flex flex-col gap-1">
      {warningCount > 0 && (
        <div className="flex items-center gap-1 px-1.5 py-1 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-secondary">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>Formula error in {warningCount} step{warningCount > 1 ? 's' : ''} — values fell back to base. Hover rows for details.</span>
        </div>
      )}
      {tokens.map((t) => (
        <OverrideRow key={t.stepName} token={t} override={overrides[t.stepName]} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} isOverwrite={overwritePaths?.has(t.path)}>
          <span className="flex-1 text-secondary font-mono text-[var(--color-figma-text-secondary)] truncate text-right">
            {formatValue(t.value)}
          </span>
        </OverrideRow>
      ))}
    </div>
  );
}
