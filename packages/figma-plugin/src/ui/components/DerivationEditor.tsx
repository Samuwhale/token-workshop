import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import {
  applyDerivation,
  DIMENSION_UNITS,
  isParamReference,
  paramReferencePath,
} from '@token-workshop/core';
import type {
  DerivationOp,
  DimensionUnit,
  DimensionValue,
  DurationValue,
  TokenType,
} from '@token-workshop/core';
import { Collapsible } from './Collapsible';
import type { TokenMapEntry } from '../../shared/types';
import { extractAliasPath, isAlias, resolveAliasEntry } from '../../shared/resolveAlias';

interface DerivationEditorProps {
  /** Fallback type when the referenced source token cannot be resolved from the flat map. */
  sourceType: TokenType | undefined;
  /** Alias reference like `{colors.base}` — required (derivation is only valid on aliased tokens). */
  reference: string;
  /** Flat token map used to resolve the aliased source value and preview op-param references. */
  allTokensFlat?: Record<string, TokenMapEntry>;
  derivationOps: DerivationOp[];
  onDerivationOpsChange: (ops: DerivationOp[]) => void;
}

type OpKind = DerivationOp['kind'];

const COLOR_OP_KINDS: OpKind[] = ['alpha', 'lighten', 'darken', 'mix', 'invertLightness'];
const NUMERIC_OP_KINDS: OpKind[] = ['scaleBy', 'add'];

function newRowId(): string {
  return Math.random().toString(36).slice(2);
}

function isDimensionValue(value: unknown): value is DimensionValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { value?: unknown }).value === 'number' &&
    typeof (value as { unit?: unknown }).unit === 'string' &&
    DIMENSION_UNITS.includes((value as { unit: DimensionUnit }).unit)
  );
}

function isDurationValue(value: unknown): value is DurationValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { value?: unknown }).value === 'number' &&
    ((value as { unit?: unknown }).unit === 'ms' ||
      (value as { unit?: unknown }).unit === 's')
  );
}

function defaultAddDelta(
  sourceType: TokenType | undefined,
  sourceValue: unknown,
): DerivationOp & { kind: 'add' } {
  if (sourceType === 'dimension') {
    const unit: DimensionUnit = isDimensionValue(sourceValue) ? sourceValue.unit : 'px';
    return { kind: 'add', delta: { value: 0, unit } };
  }
  if (sourceType === 'duration') {
    const unit: DurationValue['unit'] = isDurationValue(sourceValue) ? sourceValue.unit : 'ms';
    return { kind: 'add', delta: { value: 0, unit } };
  }
  return { kind: 'add', delta: 0 };
}

function defaultOpForKind(
  kind: OpKind,
  sourceType: TokenType | undefined,
  sourceValue: unknown,
): DerivationOp {
  switch (kind) {
    case 'alpha': return { kind: 'alpha', amount: 0.5 };
    case 'lighten': return { kind: 'lighten', amount: 20 };
    case 'darken': return { kind: 'darken', amount: 20 };
    case 'mix': return { kind: 'mix', with: '#ffffff', ratio: 0.5 };
    case 'invertLightness': return { kind: 'invertLightness' };
    case 'scaleBy': return { kind: 'scaleBy', factor: 2 };
    case 'add': return defaultAddDelta(sourceType, sourceValue);
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

function resolveReferenceSource(
  reference: string,
  allTokensFlat?: Record<string, TokenMapEntry>,
): { sourceValue: unknown; sourceType: TokenType | undefined } {
  if (!allTokensFlat || !isAlias(reference)) {
    return { sourceValue: undefined, sourceType: undefined };
  }

  const refPath = extractAliasPath(reference);
  if (!refPath) {
    return { sourceValue: undefined, sourceType: undefined };
  }

  const entry = allTokensFlat[refPath];
  if (!entry) {
    return { sourceValue: undefined, sourceType: undefined };
  }

  const resolved = resolveAliasEntry(refPath, allTokensFlat);
  return {
    sourceValue: resolved?.$value ?? entry.$value,
    sourceType: (resolved?.$type ?? entry.$type) as TokenType | undefined,
  };
}

function resolveFlatTokenValue(
  path: string,
  allTokensFlat?: Record<string, TokenMapEntry>,
): unknown {
  if (!allTokensFlat) return undefined;
  return resolveAliasEntry(path, allTokensFlat)?.$value;
}

export function DerivationEditor({
  sourceType,
  reference,
  allTokensFlat,
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

  const moveAt = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= derivationOps.length) return;

    const nextOps = [...derivationOps];
    const movedOps = nextOps.splice(fromIndex, 1);
    const movedOp = movedOps[0];
    if (!movedOp) return;
    nextOps.splice(toIndex, 0, movedOp);
    setOps(nextOps);

    setRowIds((prev) => {
      const nextRowIds = [...prev];
      const movedRowIds = nextRowIds.splice(fromIndex, 1);
      const movedRowId = movedRowIds[0];
      if (movedRowId === undefined) return prev;
      nextRowIds.splice(toIndex, 0, movedRowId);
      return nextRowIds;
    });
  };

  const resolvedSource = resolveReferenceSource(reference, allTokensFlat);
  const effectiveSourceType = resolvedSource.sourceType ?? sourceType;
  const kinds = availableKindsFor(effectiveSourceType);

  const addRow = () => {
    if (kinds.length === 0) return;
    setOps([
      ...derivationOps,
      defaultOpForKind(kinds[0], effectiveSourceType, resolvedSource.sourceValue),
    ]);
    setRowIds((prev) => [...prev, newRowId()]);
  };

  const baseHex =
    effectiveSourceType === 'color' && typeof resolvedSource.sourceValue === 'string'
      ? resolvedSource.sourceValue
      : undefined;
  let previewHex: string | undefined;
  if (baseHex && derivationOps.length > 0 && effectiveSourceType === 'color') {
    try {
      const resolveOpRef = (path: string) => resolveFlatTokenValue(path, allTokensFlat);
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
          <p className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
            Modifiers are not available for this token type.
          </p>
        )}
        {kinds.length > 0 && derivationOps.length === 0 && (
          <p className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
            No modifiers yet.
          </p>
        )}
        {derivationOps.map((op, i) => (
          <DerivationOpRow
            key={rowIds[i] ?? i}
            op={op}
            kinds={kinds}
            sourceType={effectiveSourceType}
            sourceValue={resolvedSource.sourceValue}
            onChange={(updater) => updateAt(i, updater)}
            onRemove={() => removeAt(i)}
            canMoveUp={i > 0}
            canMoveDown={i < derivationOps.length - 1}
            showReorderControls={derivationOps.length > 1}
            onMoveUp={() => moveAt(i, i - 1)}
            onMoveDown={() => moveAt(i, i + 1)}
          />
        ))}
        {kinds.length > 0 && (
          <button
            type="button"
            onClick={addRow}
            className="self-start flex items-center gap-1 text-secondary text-[color:var(--color-figma-text-accent)] hover:underline"
          >
            <Plus size={10} strokeWidth={2} aria-hidden />
            Add modifier
          </button>
        )}
        {baseHex && previewHex && derivationOps.length > 0 && (
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-5 rounded border border-[var(--color-figma-border)]" style={{ backgroundColor: baseHex }} title={`Base: ${baseHex}`} />
            <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[color:var(--color-figma-text-tertiary)] shrink-0" aria-hidden><path d="M2 6h8M7 3l3 3-3 3"/></svg>
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
  sourceValue: unknown;
  onChange: (updater: (op: DerivationOp) => DerivationOp) => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  showReorderControls: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function DerivationOpRow({
  op,
  kinds,
  sourceType,
  sourceValue,
  onChange,
  onRemove,
  canMoveUp,
  canMoveDown,
  showReorderControls,
  onMoveUp,
  onMoveDown,
}: DerivationOpRowProps) {
  return (
    <div className="flex items-center gap-1.5">
      {showReorderControls && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="p-0.5 rounded text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-30 disabled:hover:text-[color:var(--color-figma-text-tertiary)] disabled:hover:bg-transparent"
            aria-label="Move modifier up"
          >
            <ArrowUp size={10} strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="p-0.5 rounded text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-30 disabled:hover:text-[color:var(--color-figma-text-tertiary)] disabled:hover:bg-transparent"
            aria-label="Move modifier down"
          >
            <ArrowDown size={10} strokeWidth={2} aria-hidden />
          </button>
        </div>
      )}
      <select
        value={op.kind}
        onChange={(e) => {
          const newKind = e.target.value as OpKind;
          // Switching kinds always resets the row to that kind's defaults — every
          // op shape is incompatible with every other op shape.
          onChange(() => defaultOpForKind(newKind, sourceType, sourceValue));
        }}
        className="px-1 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)] text-secondary focus-visible:border-[var(--color-figma-accent)]"
      >
        {kinds.map((k) => (
          <option key={k} value={k}>{KIND_LABELS[k]}</option>
        ))}
      </select>
      <DerivationOpParams op={op} sourceType={sourceType} onChange={onChange} />
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 p-0.5 rounded text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text-error)] hover:bg-[var(--color-figma-bg-hover)]"
        aria-label="Remove modifier"
      >
        <X size={10} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}

function DerivationOpParams({
  op,
  sourceType,
  onChange,
}: {
  op: DerivationOp;
  sourceType: TokenType | undefined;
  onChange: (updater: (op: DerivationOp) => DerivationOp) => void;
}) {
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
          <span className="text-secondary tabular-nums text-[color:var(--color-figma-text-secondary)] w-8 text-right shrink-0">{op.amount}</span>
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
          <span className="text-secondary tabular-nums text-[color:var(--color-figma-text-secondary)] w-8 text-right shrink-0">{Math.round(op.amount * 100)}%</span>
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
            className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)] text-secondary focus-visible:border-[var(--color-figma-accent)]"
          />
          <input
            type="range"
            min={0} max={1} step={0.01}
            value={op.ratio}
            onChange={(e) => onChange((m) => ({ ...m, ratio: Number(e.target.value) } as DerivationOp))}
            aria-label="Mix ratio"
            className="flex-1"
          />
          <span className="text-secondary tabular-nums text-[color:var(--color-figma-text-secondary)] w-8 text-right shrink-0">{Math.round(op.ratio * 100)}%</span>
        </>
      );
    }
    case 'invertLightness':
      return (
        <>
          <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">chroma</span>
          <input
            type="range"
            min={0} max={2} step={0.05}
            value={op.chromaBoost ?? 1}
            onChange={(e) => onChange(() => ({ kind: 'invertLightness', chromaBoost: Number(e.target.value) }))}
            aria-label="Chroma boost"
            className="flex-1"
          />
          <span className="text-secondary tabular-nums text-[color:var(--color-figma-text-secondary)] w-10 text-right shrink-0">{(op.chromaBoost ?? 1).toFixed(2)}×</span>
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
            className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)] text-secondary focus-visible:border-[var(--color-figma-accent)]"
          />
          <span className="text-secondary text-[color:var(--color-figma-text-tertiary)] shrink-0">×</span>
        </>
      );
    case 'add': {
      const isObject = typeof op.delta === 'object' && op.delta !== null;
      const unitOptions: readonly (DimensionUnit | DurationValue['unit'])[] =
        sourceType === 'duration' ? ['ms', 's'] : DIMENSION_UNITS;
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
            className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)] text-secondary focus-visible:border-[var(--color-figma-accent)]"
          />
          {isObject && (
            <select
              value={(op.delta as { unit: string }).unit}
              onChange={(e) => {
                onChange((m) => {
                  if (m.kind !== 'add' || typeof m.delta !== 'object') return m;
                  if (sourceType === 'duration') {
                    const unit = e.target.value as DurationValue['unit'];
                    return {
                      kind: 'add',
                      delta: { ...m.delta, unit },
                    };
                  }

                  const unit = e.target.value as DimensionUnit;
                  return {
                    kind: 'add',
                    delta: { ...m.delta, unit },
                  };
                });
              }}
              aria-label="Add delta unit"
              className="shrink-0 min-w-0 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[color:var(--color-figma-text)] text-secondary focus-visible:border-[var(--color-figma-accent)]"
            >
              {unitOptions.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
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
