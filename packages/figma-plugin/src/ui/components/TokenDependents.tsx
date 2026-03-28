import { useState } from 'react';
import { resolveRefValue } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';

interface TokenDependentsProps {
  dependents: Array<{ path: string; setName: string }>;
  dependentsLoading: boolean;
  setName: string;
  tokenType: string;
  value: any;
  isDirty: boolean;
  aliasMode: boolean;
  allTokensFlat: Record<string, TokenMapEntry>;
  colorFlatMap: Record<string, unknown>;
  initialValue: any;
}

export function TokenDependents({ dependents, dependentsLoading, setName, tokenType, value, isDirty, aliasMode, allTokensFlat, colorFlatMap, initialValue }: TokenDependentsProps) {
  const [showDependents, setShowDependents] = useState(false);

  return (
    <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
      <button
        type="button"
        onClick={() => setShowDependents(v => !v)}
        className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium hover:bg-[var(--color-figma-bg-hover)] transition-colors"
      >
        <span className="flex items-center gap-1.5">
          Used by
          {dependentsLoading
            ? <svg className="animate-spin shrink-0 opacity-50" width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="22 10" /></svg>
            : dependents.length > 0 ? ` (${dependents.length})` : ''}
        </span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showDependents ? 'rotate-90' : ''}`} aria-hidden="true">
          <path d="M2 1l4 3-4 3V1z"/>
        </svg>
      </button>
      {showDependents && (
        <div className="border-t border-[var(--color-figma-border)]">
          {dependentsLoading ? (
            <div className="flex items-center gap-1.5 px-3 py-2.5 text-[10px] text-[var(--color-figma-text-secondary)]">
              <svg className="animate-spin shrink-0" width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="22 10" /></svg>
              Finding references…
            </div>
          ) : dependents.length === 0 ? (
            <p className="px-3 py-2.5 text-[10px] text-[var(--color-figma-text-secondary)]">Not referenced by any other token.</p>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--color-figma-border)]">
              {dependents.map(dep => {
                const entry = allTokensFlat[dep.path];
                const resolvedColor = entry?.$type === 'color' ? resolveRefValue(dep.path, colorFlatMap) : null;
                const isAliasDependent = entry?.$type === 'color' && typeof entry.$value === 'string' && entry.$value.startsWith('{');
                const oldColorHex = typeof initialValue === 'string' ? initialValue.slice(0, 7) : null;
                const newColorHex = typeof value === 'string' ? value.slice(0, 7) : null;
                const showBeforeAfter = isAliasDependent && tokenType === 'color' && isDirty && !aliasMode && oldColorHex && newColorHex;

                return (
                  <div key={dep.path} className="px-3 py-1.5 flex items-center gap-2">
                    {showBeforeAfter ? (
                      <span className="flex items-center gap-1 shrink-0">
                        <span
                          className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)]"
                          style={{ background: oldColorHex! }}
                          title="Before"
                        />
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
                          <path d="M1 3h5M4 1l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span
                          className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)]"
                          style={{ background: newColorHex! }}
                          title="After"
                        />
                      </span>
                    ) : resolvedColor ? (
                      <span
                        className="shrink-0 w-3 h-3 rounded-sm border border-[var(--color-figma-border)]"
                        style={{ background: resolvedColor }}
                      />
                    ) : null}
                    <span
                      className="flex-1 font-mono text-[10px] text-[var(--color-figma-text)] truncate"
                      title={dep.path}
                    >
                      {dep.path}
                    </span>
                    {dep.setName !== setName && (
                      <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
                        {dep.setName}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
