import { useState, useRef } from 'react';
import { resolveRefValue } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import { AliasAutocomplete } from './AliasAutocomplete';
import { wcagContrast } from '../shared/colorUtils';

interface ContrastCheckerProps {
  tokenPath: string;
  value: any;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  colorFlatMap: Record<string, unknown>;
}

export function ContrastChecker({ tokenPath, value, allTokensFlat, pathToCollectionId, colorFlatMap }: ContrastCheckerProps) {
  const [showContrast, setShowContrast] = useState(false);
  const [bgTokenPath, setBgTokenPath] = useState<string>('');
  const [bgQuery, setBgQuery] = useState('');
  const [bgSearchOpen, setBgSearchOpen] = useState(false);
  const bgInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
      <button
        onClick={() => setShowContrast(v => !v)}
        className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-secondary text-[var(--color-figma-text-secondary)] font-medium"
      >
        <span>Check contrast</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${showContrast ? 'rotate-180' : ''}`}>
          <path d="M2 3.5l3 3 3-3"/>
        </svg>
      </button>
      {showContrast && (() => {
        const fgHex = resolveRefValue(tokenPath, colorFlatMap) ?? (typeof value === 'string' && !value.startsWith('{') ? value : null);
        const bgHex = bgTokenPath ? resolveRefValue(bgTokenPath, colorFlatMap) : null;
        const ratio = fgHex && bgHex ? wcagContrast(fgHex, bgHex) : null;
        const pass = (r: number, min: number) => r >= min;
        return (
          <div className="p-3 flex flex-col gap-3">
            <div>
              <label className="block text-secondary text-[var(--color-figma-text-secondary)] mb-1">Background color token</label>
              <div className="relative">
                <input
                  ref={bgInputRef}
                  type="text"
                  value={bgSearchOpen ? bgQuery : bgTokenPath}
                  onChange={e => { setBgQuery(e.target.value); setBgSearchOpen(true); }}
                  onFocus={() => { setBgQuery(''); setBgSearchOpen(true); }}
                  onBlur={() => setTimeout(() => setBgSearchOpen(false), 150)}
                  placeholder="Search color tokens…"
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-secondary focus-visible:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-secondary)]/50"
                />
                {bgTokenPath && !bgSearchOpen && (
                  <button
                    onClick={() => { setBgTokenPath(''); setBgQuery(''); }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
                    aria-label="Clear background token"
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                )}
                {bgSearchOpen && (
                  <AliasAutocomplete
                    query={bgQuery}
                    allTokensFlat={allTokensFlat}
                    pathToCollectionId={pathToCollectionId}
                    filterType="color"
                    onSelect={path => { setBgTokenPath(path); setBgQuery(''); setBgSearchOpen(false); }}
                    onClose={() => setBgSearchOpen(false)}
                  />
                )}
              </div>
            </div>
            {ratio !== null ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  {fgHex && bgHex && (
                    <div className="w-10 h-10 rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center text-subheading font-bold" style={{ color: fgHex, background: bgHex }}>Aa</div>
                  )}
                  <div>
                    <div className="text-title font-semibold text-[var(--color-figma-text)]">{ratio.toFixed(2)}:1</div>
                    <div className="text-secondary text-[var(--color-figma-text-secondary)]">Contrast ratio</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1 text-secondary text-center">
                  {[
                    { label: 'Normal AA', min: 4.5 },
                    { label: 'Large AA', min: 3 },
                    { label: 'Normal AAA', min: 7 },
                    { label: 'Large AAA', min: 4.5 },
                    { label: 'UI (AA)', min: 3 },
                  ].map(({ label, min }) => (
                    <div key={label} className={`rounded px-1 py-1 border ${pass(ratio, min) ? 'border-[var(--color-figma-success)] text-[var(--color-figma-success)]' : 'border-[var(--color-figma-error)] text-[var(--color-figma-error)]'}`}>
                      <div>{pass(ratio, min) ? '✓' : '✕'}</div>
                      <div>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (bgTokenPath ? (
              <div className="text-secondary text-[var(--color-figma-text-secondary)]">Could not resolve color values.</div>
            ) : null)}
          </div>
        );
      })()}
    </div>
  );
}
