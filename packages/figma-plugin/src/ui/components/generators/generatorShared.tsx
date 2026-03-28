import { useState } from 'react';
import type { DimensionValue } from '@tokenmanager/core';
import type { GeneratedTokenResult } from '../../hooks/useGenerators';

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
  if (value === null || value === undefined) return '';
  if (isDimensionLike(value)) {
    return `${value.value}${value.unit}`;
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// Override row + table
// ---------------------------------------------------------------------------

export function OverrideRow({ token, override, onOverrideChange, onOverrideClear, children }: {
  token: GeneratedTokenResult;
  override?: { value: unknown; locked: boolean };
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
  children?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const isLocked = override?.locked ?? false;
  const isOverridden = Boolean(override);

  const handleStartEdit = () => {
    setEditValue(formatValue(token.value));
    setEditing(true);
  };

  const handleCommit = () => {
    if (editValue.trim()) {
      onOverrideChange(token.stepName, editValue.trim(), true);
    }
    setEditing(false);
  };

  return (
    <div className={`flex items-center gap-1.5 px-1 py-0.5 rounded ${token.warning ? 'bg-[var(--color-figma-error)]/8' : isOverridden ? 'bg-[var(--color-figma-accent)]/8' : ''}`}>
      <span className="w-8 text-[10px] text-[var(--color-figma-text-secondary)] shrink-0 text-right font-mono">{token.stepName}</span>
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
      {editing ? (
        <input
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={e => { if (e.key === 'Enter') handleCommit(); if (e.key === 'Escape') setEditing(false); }}
          className="w-20 px-1.5 py-0.5 rounded border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] text-[10px] font-mono outline-none shrink-0"
        />
      ) : (
        <button
          onClick={isOverridden ? () => onOverrideClear(token.stepName) : handleStartEdit}
          title={isOverridden ? 'Click to clear override' : 'Click to pin a custom value'}
          aria-label={isOverridden ? 'Clear override' : 'Pin custom value'}
          className={`shrink-0 p-0.5 rounded transition-colors ${
            isLocked
              ? 'text-[var(--color-figma-accent)] hover:text-[var(--color-figma-error)]'
              : 'text-[var(--color-figma-text-secondary)] opacity-30 hover:opacity-100 hover:text-[var(--color-figma-accent)]'
          }`}
        >
          {isLocked ? (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="5" width="8" height="6" rx="1" />
              <path d="M4 5V3.5a2 2 0 0 1 4 0V5" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="5" width="8" height="6" rx="1" />
              <path d="M4 5V3.5a2 2 0 0 1 4 0" strokeDasharray="2 1" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}

export function OverrideTable({ tokens, overrides, onOverrideChange, onOverrideClear }: {
  tokens: GeneratedTokenResult[];
  overrides: Record<string, { value: unknown; locked: boolean }>;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5 mt-1 border-t border-[var(--color-figma-border)] pt-1.5">
      {tokens.map(t => (
        <OverrideRow key={t.stepName} token={t} override={overrides[t.stepName]} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear}>
          <span className="flex-1 text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate">{formatValue(t.value)}</span>
        </OverrideRow>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic preview (used by zIndexScale and customScale)
// ---------------------------------------------------------------------------

export function GenericPreview({ tokens, overrides, onOverrideChange, onOverrideClear }: {
  tokens: GeneratedTokenResult[];
  overrides: Record<string, { value: unknown; locked: boolean }>;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
}) {
  const warningCount = tokens.filter(t => t.warning).length;
  return (
    <div className="flex flex-col gap-1">
      {warningCount > 0 && (
        <div className="flex items-center gap-1 px-1.5 py-1 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px]">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>Formula error in {warningCount} step{warningCount > 1 ? 's' : ''} — values fell back to base. Hover rows for details.</span>
        </div>
      )}
      {tokens.map((t) => (
        <OverrideRow key={t.stepName} token={t} override={overrides[t.stepName]} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear}>
          <span className="flex-1 text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate text-right">
            {formatValue(t.value)}
          </span>
        </OverrideRow>
      ))}
    </div>
  );
}
