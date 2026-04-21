import { useState, useRef } from 'react';
import { X } from 'lucide-react';
import { resolveRefValue } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import { AliasAutocomplete } from './AliasAutocomplete';
import { Collapsible } from './Collapsible';
import { wcagContrast } from '../shared/colorUtils';

interface ContrastCheckerProps {
  tokenPath: string;
  value: any;
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
    <Collapsible open={open} onToggle={() => setOpen(v => !v)} label="Check contrast">
      <div className="mt-2 flex flex-col gap-3 pl-3">
        <div className="relative">
          <input
            ref={bgInputRef}
            type="text"
            value={bgSearchOpen ? bgQuery : bgTokenPath}
            onChange={e => { setBgQuery(e.target.value); setBgSearchOpen(true); }}
            onFocus={() => { setBgQuery(''); setBgSearchOpen(true); }}
            onBlur={() => setTimeout(() => setBgSearchOpen(false), 150)}
            placeholder="Background color token…"
            className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-secondary focus-visible:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-tertiary)]"
          />
          {bgTokenPath && !bgSearchOpen && (
            <button
              type="button"
              onClick={() => { setBgTokenPath(''); setBgQuery(''); }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)]"
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
                  className="w-10 h-10 rounded border border-[var(--color-figma-border)] shrink-0 flex items-center justify-center text-subheading font-bold"
                  style={{ color: fgHex, background: bgHex }}
                >
                  Aa
                </div>
              )}
              <div>
                <div className="text-title font-semibold tabular-nums text-[var(--color-figma-text)]">{ratio.toFixed(2)}:1</div>
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
                <div
                  key={label}
                  className={`rounded px-1 py-1 ring-1 ${pass(ratio, min) ? 'ring-[var(--color-figma-success)]/60 text-[var(--color-figma-success)]' : 'ring-[var(--color-figma-error)]/50 text-[var(--color-figma-error)]'}`}
                >
                  <div aria-hidden>{pass(ratio, min) ? '✓' : '✕'}</div>
                  <div>{label}</div>
                </div>
              ))}
            </div>
          </div>
        ) : bgTokenPath ? (
          <div className="text-secondary text-[var(--color-figma-text-tertiary)]">Could not resolve color values.</div>
        ) : null}
      </div>
    </Collapsible>
  );
}
