import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { resolveRefValue, applyColorModifiers } from '@tokenmanager/core';
import type { ColorModifierOp } from '@tokenmanager/core';
import { ColorSwatchButton } from './ValueEditors';
import { Collapsible } from './Collapsible';
import { isAlias, extractAliasPath } from '../../shared/resolveAlias';

interface ColorModifiersEditorProps {
  /** Alias reference like `{colors.base}` — used to resolve base color from colorFlatMap */
  reference?: string;
  colorFlatMap?: Record<string, unknown>;
  /** Direct hex color value — used when not in alias mode */
  directColor?: string;
  colorModifiers: ColorModifierOp[];
  onColorModifiersChange: (mods: ColorModifierOp[]) => void;
}

export function ColorModifiersEditor({ reference, colorFlatMap, directColor, colorModifiers, onColorModifiersChange: setColorModifiers }: ColorModifiersEditorProps) {
  const [open, setOpen] = useState(false);

  const isAliasRef = isAlias(reference);
  const refPath = extractAliasPath(reference) ?? '';
  const resolvedHex = isAliasRef && colorFlatMap ? resolveRefValue(refPath, colorFlatMap) : undefined;
  const baseHex = resolvedHex || directColor;
  const previewHex = baseHex && colorModifiers.length > 0 ? applyColorModifiers(baseHex, colorModifiers) : baseHex;

  const label = (
    <span className="flex items-center gap-1.5">
      <span>Color modifiers</span>
      {colorModifiers.length > 0 && (
        <span className="tabular-nums text-[var(--color-figma-text-tertiary)]">{colorModifiers.length}</span>
      )}
      {previewHex && colorModifiers.length > 0 && (
        <span
          className="inline-block w-3 h-3 rounded-sm ring-1 ring-[var(--color-figma-border)] shrink-0"
          style={{ backgroundColor: previewHex }}
          aria-hidden="true"
        />
      )}
    </span>
  );

  return (
    <Collapsible open={open} onToggle={() => setOpen(v => !v)} label={label}>
      <div className="mt-2 flex flex-col gap-2 pl-3">
        {colorModifiers.length === 0 && (
          <p className="text-secondary text-[var(--color-figma-text-tertiary)]">
            No modifiers yet.
          </p>
        )}
        {colorModifiers.map((mod, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <select
              value={mod.type}
              onChange={e => {
                const type = e.target.value as ColorModifierOp['type'];
                setColorModifiers(colorModifiers.map((m, idx) => {
                  if (idx !== i) return m;
                  if (type === 'mix') return { type, color: 'var(--color-figma-text-tertiary)', ratio: 0.5 };
                  if (type === 'alpha') return { type, amount: 0.5 };
                  return { type, amount: 20 };
                }));
              }}
              className="px-1 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-secondary focus-visible:border-[var(--color-figma-accent)]"
            >
              <option value="lighten">Lighten</option>
              <option value="darken">Darken</option>
              <option value="alpha">Alpha</option>
              <option value="mix">Mix</option>
            </select>
            {(mod.type === 'lighten' || mod.type === 'darken') && (
              <>
                <input
                  type="range"
                  min={0} max={100} step={1}
                  value={mod.amount}
                  onChange={e => setColorModifiers(colorModifiers.map((m, idx) => idx === i ? { ...m, amount: Number(e.target.value) } : m))}
                  aria-label={`${mod.type === 'lighten' ? 'Lighten' : 'Darken'} amount`}
                  className="flex-1"
                />
                <span className="text-secondary tabular-nums text-[var(--color-figma-text-secondary)] w-8 text-right shrink-0">{mod.amount}</span>
              </>
            )}
            {mod.type === 'alpha' && (
              <>
                <input
                  type="range"
                  min={0} max={1} step={0.01}
                  value={mod.amount}
                  onChange={e => setColorModifiers(colorModifiers.map((m, idx) => idx === i ? { ...m, amount: Number(e.target.value) } : m))}
                  aria-label="Alpha amount"
                  className="flex-1"
                />
                <span className="text-secondary tabular-nums text-[var(--color-figma-text-secondary)] w-8 text-right shrink-0">{Math.round(mod.amount * 100)}%</span>
              </>
            )}
            {mod.type === 'mix' && (
              <>
                <ColorSwatchButton
                  color={mod.color}
                  onChange={v => setColorModifiers(colorModifiers.map((m, idx) => idx === i ? { ...m, color: v } : m))}
                  className="w-6 h-6"
                />
                <input
                  type="range"
                  min={0} max={1} step={0.01}
                  value={mod.ratio}
                  onChange={e => setColorModifiers(colorModifiers.map((m, idx) => idx === i ? { ...m, ratio: Number(e.target.value) } : m))}
                  aria-label="Mix ratio"
                  className="flex-1"
                />
                <span className="text-secondary tabular-nums text-[var(--color-figma-text-secondary)] w-8 text-right shrink-0">{Math.round(mod.ratio * 100)}%</span>
              </>
            )}
            <button
              type="button"
              onClick={() => setColorModifiers(colorModifiers.filter((_, idx) => idx !== i))}
              className="shrink-0 p-0.5 rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)]"
              aria-label="Remove modifier"
            >
              <X size={10} strokeWidth={2} aria-hidden />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setColorModifiers([...colorModifiers, { type: 'lighten', amount: 20 }])}
          className="self-start flex items-center gap-1 text-secondary text-[var(--color-figma-accent)] hover:underline"
        >
          <Plus size={10} strokeWidth={2} aria-hidden />
          Add modifier
        </button>
        {baseHex && colorModifiers.length > 0 && previewHex && (
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-5 rounded border border-[var(--color-figma-border)]" style={{ backgroundColor: baseHex }} title={`Base: ${baseHex}`} />
            <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--color-figma-text-tertiary)] shrink-0" aria-hidden><path d="M2 6h8M7 3l3 3-3 3"/></svg>
            <div className="flex-1 h-5 rounded border border-[var(--color-figma-border)]" style={{ backgroundColor: previewHex }} title={`Modified: ${previewHex}`} />
          </div>
        )}
      </div>
    </Collapsible>
  );
}
