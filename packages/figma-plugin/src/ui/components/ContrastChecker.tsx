import { useState, useRef } from 'react';
import { X } from 'lucide-react';
import { resolveRefValue } from '@token-workshop/core';
import type { TokenMapEntry } from '../../shared/types';
import { AliasAutocomplete } from './AliasAutocomplete';
import { Collapsible } from './Collapsible';
import { wcagContrast } from '../shared/colorUtils';

interface ContrastCheckerProps {
  tokenPath: string;
  value: unknown;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  colorFlatMap: Record<string, unknown>;
}

export function ContrastChecker({ tokenPath, value, allTokensFlat, pathToCollectionId, colorFlatMap }: ContrastCheckerProps) {
  const [open, setOpen] = useState(false);
  const [bgTokenPath, setBgTokenPath] = useState<string>('');
  const [bgQuery, setBgQuery] = useState('');
  const [bgSearchOpen, setBgSearchOpen] = useState(false);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const fgHex = open
    ? (resolveRefValue(tokenPath, colorFlatMap) ?? (typeof value === 'string' && !value.startsWith('{') ? value : null))
    : null;
  const bgHex = open && bgTokenPath ? resolveRefValue(bgTokenPath, colorFlatMap) : null;
  const ratio = fgHex && bgHex ? wcagContrast(fgHex, bgHex) : null;
  const pass = (r: number, min: number) => r >= min;

  return (
    <Collapsible
      open={open}
      onToggle={() => setOpen(v => !v)}
      label="Check contrast"
      className="tm-token-details__collapsible"
    >
      <div className="tm-token-details__collapsible-body tm-token-details__support-panel">
        <div className="relative">
          <input
            ref={bgInputRef}
            type="text"
            value={bgSearchOpen ? bgQuery : bgTokenPath}
            onChange={e => { setBgQuery(e.target.value); setBgSearchOpen(true); }}
            onFocus={() => { setBgQuery(''); setBgSearchOpen(true); }}
            onBlur={() => setTimeout(() => setBgSearchOpen(false), 150)}
            placeholder="Background color token…"
            className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-secondary text-[color:var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] placeholder:text-[color:var(--color-figma-text-tertiary)]"
          />
          {bgTokenPath && !bgSearchOpen && (
            <button
              type="button"
              onClick={() => { setBgTokenPath(''); setBgQuery(''); }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text)]"
              aria-label="Clear background token"
            >
              <X size={8} strokeWidth={2.5} aria-hidden />
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
        {ratio !== null ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              {fgHex && bgHex && (
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-[var(--color-figma-border)] text-subheading font-bold"
                  style={{ color: fgHex, background: bgHex }}
                >
                  Aa
                </div>
              )}
              <div>
                <div className="text-title font-semibold tabular-nums text-[color:var(--color-figma-text)]">{ratio.toFixed(2)}:1</div>
                <div className="text-secondary text-[color:var(--color-figma-text-secondary)]">Contrast ratio</div>
              </div>
            </div>
            <div className="tm-token-details__contrast-grid">
              {[
                { label: 'Normal AA', min: 4.5 },
                { label: 'Large AA', min: 3 },
                { label: 'Normal AAA', min: 7 },
                { label: 'Large AAA', min: 4.5 },
                { label: 'UI (AA)', min: 3 },
              ].map(({ label, min }) => (
                <div
                  key={label}
                  className={`tm-token-details__contrast-check ${
                    pass(ratio, min)
                      ? 'tm-token-details__contrast-check--pass'
                      : 'tm-token-details__contrast-check--fail'
                  }`}
                >
                  <div aria-hidden>{pass(ratio, min) ? '✓' : '✕'}</div>
                  <div>{label}</div>
                </div>
              ))}
            </div>
          </div>
        ) : bgTokenPath ? (
          <div className="text-secondary text-[color:var(--color-figma-text-tertiary)]">Could not resolve color values.</div>
        ) : null}
      </div>
    </Collapsible>
  );
}
