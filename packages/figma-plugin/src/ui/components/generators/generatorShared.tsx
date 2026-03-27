import { useState } from 'react';
import type { GeneratedTokenResult } from '../../hooks/useGenerators';

// ---------------------------------------------------------------------------
// Shared value formatter
// ---------------------------------------------------------------------------

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'value' in (value as any) && 'unit' in (value as any)) {
    return `${(value as any).value}${(value as any).unit}`;
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
    <div className={`flex items-center gap-1.5 px-1 py-0.5 rounded ${isOverridden ? 'bg-[var(--color-figma-accent)]/8' : ''}`}>
      <span className="w-8 text-[9px] text-[var(--color-figma-text-secondary)] shrink-0 text-right font-mono">{token.stepName}</span>
      {children}
      {editing ? (
        <input
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={e => { if (e.key === 'Enter') handleCommit(); if (e.key === 'Escape') setEditing(false); }}
          className="w-20 px-1.5 py-0.5 rounded border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] text-[9px] font-mono outline-none shrink-0"
        />
      ) : (
        <button
          onClick={isOverridden ? () => onOverrideClear(token.stepName) : handleStartEdit}
          title={isOverridden ? 'Click to clear override' : 'Click to pin a custom value'}
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
          <span className="flex-1 text-[9px] font-mono text-[var(--color-figma-text-secondary)] truncate">{formatValue(t.value)}</span>
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
  return (
    <div className="flex flex-col gap-1">
      {tokens.map((t) => (
        <OverrideRow key={t.stepName} token={t} override={overrides[t.stepName]} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear}>
          <span className="flex-1 text-[9px] font-mono text-[var(--color-figma-text-secondary)] truncate text-right">
            {formatValue(t.value)}
          </span>
        </OverrideRow>
      ))}
    </div>
  );
}
