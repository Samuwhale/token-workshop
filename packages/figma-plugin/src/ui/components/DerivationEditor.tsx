import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  resolveRefValue,
  applyDerivation,
  isParamReference,
  paramReferencePath,
} from '@tokenmanager/core';
import type { DerivationOp, TokenType } from '@tokenmanager/core';
import { Collapsible } from './Collapsible';
import { isAlias, extractAliasPath } from '../../shared/resolveAlias';

interface DerivationEditorProps {
  /** Resolved $type of the source (after following aliases). Filters available op kinds. */
  sourceType: TokenType | undefined;
  /** Alias reference like `{colors.base}` — required (derivation is only valid on aliased tokens). */
  reference: string;
  /** Map of token path → resolved $value, used to resolve aliases (color tokens) for preview. */
  colorFlatMap?: Record<string, unknown>;
  derivationOps: DerivationOp[];
  onDerivationOpsChange: (ops: DerivationOp[]) => void;
}

type OpKind = DerivationOp['kind'];

const COLOR_OP_KINDS: OpKind[] = ['alpha', 'lighten', 'darken', 'mix', 'invertLightness'];
const NUMERIC_OP_KINDS: OpKind[] = ['scaleBy', 'add'];

function newRowId(): string {
  return Math.random().toString(36).slice(2);
}

/**
 * Default delta shape for `add` based on the source kind. Dimension/duration
 * sources get a `{value, unit}` delta seeded with the kind's default unit;
 * bare-number sources get a bare-number delta. Unit mismatches against the
 * actual source unit surface as a resolver-time validation error.
 */
function defaultAddDelta(sourceType: TokenType | undefined): DerivationOp & { kind: 'add' } {
  if (sourceType === 'dimension') return { kind: 'add', delta: { value: 0, unit: 'px' } };
  if (sourceType === 'duration') return { kind: 'add', delta: { value: 0, unit: 'ms' } };
  return { kind: 'add', delta: 0 };
}

function defaultOpForKind(kind: OpKind, sourceType: TokenType | undefined): DerivationOp {
  switch (kind) {
    case 'alpha': return { kind: 'alpha', amount: 0.5 };
    case 'lighten': return { kind: 'lighten', amount: 20 };
    case 'darken': return { kind: 'darken', amount: 20 };
    case 'mix': return { kind: 'mix', with: '#ffffff', ratio: 0.5 };
    case 'invertLightness': return { kind: 'invertLightness' };
    case 'scaleBy': return { kind: 'scaleBy', factor: 2 };
    case 'add': return defaultAddDelta(sourceType);
  }
}

/** Returns true when the string parses as a `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa` hex. */
function isHexColor(s: string): boolean {
  return /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s);
}

const KIND_LABELS: Record<OpKind, string> = {
  alpha: 'Alpha',
  lighten: 'Lighten',
  darken: 'Darken',
  mix: 'Mix',
  invertLightness: 'Invert lightness',
  scaleBy: 'Scale by',
  add: 'Add',
};

function availableKindsFor(sourceType: TokenType | undefined): OpKind[] {
  if (sourceType === 'color') return COLOR_OP_KINDS;
  if (sourceType === 'dimension' || sourceType === 'number' || sourceType === 'duration') {
    return NUMERIC_OP_KINDS;
  }
  return [];
}

export function DerivationEditor({
  sourceType,
  reference,
  colorFlatMap,
  derivationOps,
  onDerivationOpsChange: setOps,
}: DerivationEditorProps) {
  const [open, setOpen] = useState(false);
  const [rowIds, setRowIds] = useState<string[]>(() => derivationOps.map(() => newRowId()));
  const rowIdsRef = useRef(rowIds);
  rowIdsRef.current = rowIds;

  useEffect(() => {
    if (rowIdsRef.current.length !== derivationOps.length) {
      setRowIds((prev) => {
        if (prev.length === derivationOps.length) return prev;
        if (derivationOps.length > prev.length) {
          return [...prev, ...Array.from({ length: derivationOps.length - prev.length }, newRowId)];
        }
        return prev.slice(0, derivationOps.length);
      });
    }
  }, [derivationOps.length]);

  const updateAt = (i: number, updater: (op: DerivationOp) => DerivationOp) => {
    setOps(derivationOps.map((op, idx) => (idx === i ? updater(op) : op)));
  };

  const removeAt = (i: number) => {
    setOps(derivationOps.filter((_, idx) => idx !== i));
    setRowIds((prev) => prev.filter((_, idx) => idx !== i));
  };

  const kinds = availableKindsFor(sourceType);

  const addRow = () => {
    if (kinds.length === 0) return;
    setOps([...derivationOps, defaultOpForKind(kinds[0], sourceType)]);
    setRowIds((prev) => [...prev, newRowId()]);
  };

  // Live preview only supported for color sources today. Resolve through the
  // alias chain so a multi-hop alias `a -> b -> #hex` previews correctly, and
  // so `mix.with: "{some.alias}"` lands on the concrete color.
  const refPath = isAlias(reference) ? extractAliasPath(reference) ?? '' : '';
  const baseHex =
    sourceType === 'color' && refPath && colorFlatMap
      ? resolveRefValue(refPath, colorFlatMap) ?? undefined
      : undefined;
  let previewHex: string | undefined;
  if (baseHex && derivationOps.length > 0 && sourceType === 'color') {
    try {
      const resolveOpRef = (path: string) =>
        (colorFlatMap ? resolveRefValue(path, colorFlatMap) : undefined) ?? undefined;
      const result = applyDerivation(baseHex, 'color', derivationOps, resolveOpRef);
      if (typeof result === 'string') previewHex = result;
    } catch {
      previewHex = undefined;
    }
  }

  const label = (
    <span className="flex items-center gap-1.5">
      <span>Modifier</span>
      {previewHex && derivationOps.length > 0 && (
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
        {kinds.length === 0 && (
          <p className="text-secondary text-[var(--color-figma-text-tertiary)]">
            Modifiers are not available for this token type.
          </p>
        )}
        {kinds.length > 0 && derivationOps.length === 0 && (
          <p className="text-secondary text-[var(--color-figma-text-tertiary)]">
            No modifiers yet.
          </p>
        )}
        {derivationOps.map((op, i) => (
          <DerivationOpRow
            key={rowIds[i] ?? i}
            op={op}
            kinds={kinds}
            sourceType={sourceType}
            onChange={(updater) => updateAt(i, updater)}
            onRemove={() => removeAt(i)}
          />
        ))}
        {kinds.length > 0 && (
          <button
            type="button"
            onClick={addRow}
            className="self-start flex items-center gap-1 text-secondary text-[var(--color-figma-accent)] hover:underline"
          >
            <Plus size={10} strokeWidth={2} aria-hidden />
            Add modifier
          </button>
        )}
        {baseHex && previewHex && derivationOps.length > 0 && (
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

interface DerivationOpRowProps {
  op: DerivationOp;
  kinds: OpKind[];
  sourceType: TokenType | undefined;
  onChange: (updater: (op: DerivationOp) => DerivationOp) => void;
  onRemove: () => void;
}

function DerivationOpRow({ op, kinds, sourceType, onChange, onRemove }: DerivationOpRowProps) {
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={op.kind}
        onChange={(e) => {
          const newKind = e.target.value as OpKind;
          // Switching kinds always resets the row to that kind's defaults — every
          // op shape is incompatible with every other op shape.
          onChange(() => defaultOpForKind(newKind, sourceType));
        }}
        className="px-1 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-secondary focus-visible:border-[var(--color-figma-accent)]"
      >
        {kinds.map((k) => (
          <option key={k} value={k}>{KIND_LABELS[k]}</option>
        ))}
      </select>
      <DerivationOpParams op={op} onChange={onChange} />
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 p-0.5 rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)]"
        aria-label="Remove modifier"
      >
        <X size={10} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}

function DerivationOpParams({ op, onChange }: { op: DerivationOp; onChange: (updater: (op: DerivationOp) => DerivationOp) => void }) {
  switch (op.kind) {
    case 'lighten':
    case 'darken':
      return (
        <>
          <input
            type="range"
            min={0} max={100} step={1}
            value={op.amount}
            onChange={(e) => onChange((m) => ({ ...m, amount: Number(e.target.value) } as DerivationOp))}
            aria-label={`${KIND_LABELS[op.kind]} amount`}
            className="flex-1"
          />
          <span className="text-secondary tabular-nums text-[var(--color-figma-text-secondary)] w-8 text-right shrink-0">{op.amount}</span>
        </>
      );
    case 'alpha':
      return (
        <>
          <input
            type="range"
            min={0} max={1} step={0.01}
            value={op.amount}
            onChange={(e) => onChange((m) => ({ ...m, amount: Number(e.target.value) } as DerivationOp))}
            aria-label="Alpha amount"
            className="flex-1"
          />
          <span className="text-secondary tabular-nums text-[var(--color-figma-text-secondary)] w-8 text-right shrink-0">{Math.round(op.amount * 100)}%</span>
        </>
      );
    case 'mix': {
      // Single text input that auto-detects `{path}` vs `#hex` (matches alias
      // detection used elsewhere in the editor). A small swatch alongside
      // previews the value when it parses as a hex literal.
      const swatchColor = !isParamReference(op.with) && isHexColor(op.with) ? op.with : undefined;
      return (
        <>
          {swatchColor && (
            <span
              className="inline-block w-4 h-4 rounded-sm ring-1 ring-[var(--color-figma-border)] shrink-0"
              style={{ backgroundColor: swatchColor }}
              aria-hidden="true"
            />
          )}
          <input
            type="text"
            value={op.with}
            onChange={(e) => onChange((m) => ({ ...m, with: e.target.value } as DerivationOp))}
            placeholder="#hex or {token.path}"
            aria-label="Mix with"
            className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-secondary focus-visible:border-[var(--color-figma-accent)]"
          />
          <input
            type="range"
            min={0} max={1} step={0.01}
            value={op.ratio}
            onChange={(e) => onChange((m) => ({ ...m, ratio: Number(e.target.value) } as DerivationOp))}
            aria-label="Mix ratio"
            className="flex-1"
          />
          <span className="text-secondary tabular-nums text-[var(--color-figma-text-secondary)] w-8 text-right shrink-0">{Math.round(op.ratio * 100)}%</span>
        </>
      );
    }
    case 'invertLightness':
      return (
        <>
          <span className="text-secondary text-[var(--color-figma-text-tertiary)]">chroma</span>
          <input
            type="range"
            min={0} max={2} step={0.05}
            value={op.chromaBoost ?? 1}
            onChange={(e) => onChange(() => ({ kind: 'invertLightness', chromaBoost: Number(e.target.value) }))}
            aria-label="Chroma boost"
            className="flex-1"
          />
          <span className="text-secondary tabular-nums text-[var(--color-figma-text-secondary)] w-10 text-right shrink-0">{(op.chromaBoost ?? 1).toFixed(2)}×</span>
        </>
      );
    case 'scaleBy':
      return (
        <>
          <input
            type="number"
            value={op.factor}
            step={0.1}
            onChange={(e) => onChange(() => ({ kind: 'scaleBy', factor: Number(e.target.value) }))}
            aria-label="Scale factor"
            className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-secondary focus-visible:border-[var(--color-figma-accent)]"
          />
          <span className="text-secondary text-[var(--color-figma-text-tertiary)] shrink-0">×</span>
        </>
      );
    case 'add': {
      const isObject = typeof op.delta === 'object';
      return (
        <>
          <input
            type="number"
            value={isObject ? (op.delta as { value: number }).value : (op.delta as number)}
            step={1}
            onChange={(e) => {
              const n = Number(e.target.value);
              onChange((m) => {
                if (m.kind !== 'add') return m;
                return {
                  kind: 'add',
                  delta: typeof m.delta === 'object'
                    ? { ...m.delta, value: n }
                    : n,
                };
              });
            }}
            aria-label="Add delta"
            className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-secondary focus-visible:border-[var(--color-figma-accent)]"
          />
          {isObject && (
            <span className="text-secondary text-[var(--color-figma-text-tertiary)] shrink-0">{(op.delta as { unit: string }).unit}</span>
          )}
        </>
      );
    }
  }
}

/** Render a one-line summary of an op for inspect/read-only mode. */
export function summarizeDerivationOp(op: DerivationOp): string {
  switch (op.kind) {
    case 'alpha': return `Alpha ${Math.round(op.amount * 100)}%`;
    case 'lighten': return `Lighten ${op.amount}`;
    case 'darken': return `Darken ${op.amount}`;
    case 'mix': {
      const target = isParamReference(op.with) ? `{${paramReferencePath(op.with)}}` : op.with;
      return `Mix with ${target} at ${Math.round(op.ratio * 100)}%`;
    }
    case 'invertLightness': return `Invert lightness (chroma ${(op.chromaBoost ?? 1).toFixed(2)}×)`;
    case 'scaleBy': return `Scale by ${op.factor}×`;
    case 'add': {
      if (typeof op.delta === 'number') return `Add ${op.delta}`;
      return `Add ${op.delta.value}${op.delta.unit}`;
    }
  }
}
