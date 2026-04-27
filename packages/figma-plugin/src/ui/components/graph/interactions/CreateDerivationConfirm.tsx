import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyDerivation,
  DIMENSION_UNITS,
  type DerivationOp,
  type DimensionUnit,
  type DimensionValue,
  type DurationValue,
  type TokenType,
} from "@tokenmanager/core";
import type { TokenMapEntry } from "../../../../shared/types";
import { resolveTokenValue } from "../../../../shared/resolveAlias";
import { ContextDialog, DialogActions, DialogError } from "./ContextDialog";

interface CreateDerivationConfirmProps {
  x: number;
  y: number;
  sourcePath: string;
  sourceType: string | undefined;
  collectionLabel: string;
  initialPath: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  isPathTaken: (path: string) => boolean;
  busy?: boolean;
  errorMessage?: string;
  onConfirm: (path: string, ops: DerivationOp[]) => void;
  onCancel: () => void;
}

type OpKind = DerivationOp["kind"];

const COLOR_KINDS: OpKind[] = ["alpha", "lighten", "darken", "mix", "invertLightness"];
const NUMERIC_KINDS: OpKind[] = ["scaleBy", "add"];

const LABELS: Record<OpKind, string> = {
  alpha: "Alpha",
  lighten: "Lighten",
  darken: "Darken",
  mix: "Mix",
  invertLightness: "Invert lightness",
  scaleBy: "Scale by",
  add: "Add",
};

export function CreateDerivationConfirm({
  x,
  y,
  sourcePath,
  sourceType,
  collectionLabel,
  initialPath,
  allTokensFlat,
  isPathTaken,
  busy,
  errorMessage,
  onConfirm,
  onCancel,
}: CreateDerivationConfirmProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [path, setPath] = useState(initialPath);
  const effectiveType = sourceType as TokenType | undefined;
  const sourceValue = useMemo(
    () => resolveFlatTokenValue(sourcePath, allTokensFlat),
    [allTokensFlat, sourcePath],
  );
  const kinds = useMemo(() => availableKindsFor(effectiveType), [effectiveType]);
  const [op, setOp] = useState<DerivationOp>(() =>
    defaultOpFor(kinds[0] ?? "alpha", effectiveType, sourceValue),
  );

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    if (kinds.length > 0 && !kinds.includes(op.kind)) {
      setOp(defaultOpFor(kinds[0], effectiveType, sourceValue));
    }
  }, [effectiveType, kinds, op.kind, sourceValue]);

  const trimmed = path.trim();
  const taken = trimmed.length > 0 && isPathTaken(trimmed);
  const unsupported = kinds.length === 0;
  const invalid = trimmed.length === 0 || taken || unsupported;
  const validationMessage = unsupported
    ? "Modified tokens are available for color, dimension, number, and duration tokens."
    : taken
      ? `A token at "${trimmed}" already exists in ${collectionLabel}.`
      : null;

  const preview = useMemo(
    () => previewValue(sourceValue, effectiveType, op, allTokensFlat),
    [allTokensFlat, effectiveType, op, sourceValue],
  );

  return (
    <ContextDialog
      x={x}
      y={y}
      ariaLabel="Create modified token"
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-1">
        <div className="font-medium text-[var(--color-figma-text)]">
          New modified token
        </div>
        <div className="text-secondary text-[var(--color-figma-text-secondary)]">
          In{" "}
          <span className="font-medium text-[var(--color-figma-text)]">
            {collectionLabel}
          </span>
          , linked to{" "}
          <span className="font-mono text-[var(--color-figma-text)]">
            {sourcePath}
          </span>
          .
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-secondary">
        <span className="text-[var(--color-figma-text-tertiary)]">Source</span>
        <span className="truncate font-mono text-[var(--color-figma-text)]" title={sourcePath}>
          {sourcePath}
        </span>
        <span className="text-[var(--color-figma-text-tertiary)]">Creates</span>
        <span className="truncate font-mono text-[var(--color-figma-text)]" title={trimmed}>
          {trimmed || "token.path"}
        </span>
      </div>
      <label className="mt-3 flex flex-col gap-1 text-secondary text-[var(--color-figma-text-tertiary)]">
        New token path
      <input
        ref={inputRef}
        type="text"
        value={path}
        onChange={(event) => setPath(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !invalid && !busy) {
            event.preventDefault();
            onConfirm(trimmed, [op]);
          }
        }}
        placeholder="token.path"
        spellCheck={false}
          className="h-7 w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-input-bg)] px-2 font-mono text-secondary text-[var(--color-figma-text)] focus:border-[var(--color-figma-accent)] focus:outline-none"
      />
      </label>

      <div className="mt-2 flex flex-col gap-2">
        <select
          value={op.kind}
          disabled={unsupported}
          onChange={(event) => {
            const nextKind = event.target.value as OpKind;
            setOp(defaultOpFor(nextKind, effectiveType, sourceValue));
          }}
          className="h-7 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-input-bg)] px-2 text-secondary text-[var(--color-figma-text)] focus:border-[var(--color-figma-accent)] focus:outline-none disabled:text-[var(--color-figma-text-tertiary)]"
        >
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {LABELS[kind]}
            </option>
          ))}
        </select>
        <OpParams op={op} sourceType={effectiveType} onChange={setOp} />
        {preview ? (
          <div className="flex items-center gap-2 text-secondary text-[var(--color-figma-text-secondary)]">
            {preview.color ? (
              <span
                className="h-4 w-4 rounded-sm ring-1 ring-[var(--color-figma-border)]"
                style={{ backgroundColor: preview.color }}
                aria-hidden
              />
            ) : null}
            <span className="min-w-0 truncate font-mono">{preview.label}</span>
          </div>
        ) : null}
      </div>

      {validationMessage || errorMessage ? (
        <DialogError message={validationMessage ?? errorMessage ?? ""} />
      ) : null}
      <DialogActions
        busy={busy}
        disabled={invalid}
        confirmLabel="Create modified token"
        busyLabel="Creating..."
        onCancel={onCancel}
        onConfirm={() => onConfirm(trimmed, [op])}
      />
    </ContextDialog>
  );
}

function availableKindsFor(sourceType: TokenType | undefined): OpKind[] {
  if (sourceType === "color") return COLOR_KINDS;
  if (sourceType === "dimension" || sourceType === "number" || sourceType === "duration") {
    return NUMERIC_KINDS;
  }
  return [];
}

function defaultOpFor(kind: OpKind, sourceType: TokenType | undefined, sourceValue: unknown): DerivationOp {
  switch (kind) {
    case "alpha": return { kind: "alpha", amount: 0.5 };
    case "lighten": return { kind: "lighten", amount: 20 };
    case "darken": return { kind: "darken", amount: 20 };
    case "mix": return { kind: "mix", with: "#ffffff", ratio: 0.5 };
    case "invertLightness": return { kind: "invertLightness" };
    case "scaleBy": return { kind: "scaleBy", factor: 2 };
    case "add": {
      if (sourceType === "dimension") {
        const unit =
          isUnitValue(sourceValue) && isDimensionUnit(sourceValue.unit)
            ? sourceValue.unit
            : "px";
        return { kind: "add", delta: { value: 0, unit } };
      }
      if (sourceType === "duration") {
        const unit = isUnitValue(sourceValue) && (sourceValue.unit === "ms" || sourceValue.unit === "s")
          ? sourceValue.unit
          : "ms";
        return { kind: "add", delta: { value: 0, unit } };
      }
      return { kind: "add", delta: 0 };
    }
  }
}

function OpParams({
  op,
  sourceType,
  onChange,
}: {
  op: DerivationOp;
  sourceType: TokenType | undefined;
  onChange: (op: DerivationOp) => void;
}) {
  if (op.kind === "alpha") {
    return (
      <Range
        value={op.amount}
        min={0}
        max={1}
        step={0.01}
        label={`${Math.round(op.amount * 100)}%`}
        onChange={(amount) => onChange({ ...op, amount })}
      />
    );
  }
  if (op.kind === "lighten" || op.kind === "darken") {
    return (
      <Range
        value={op.amount}
        min={0}
        max={100}
        step={1}
        label={String(op.amount)}
        onChange={(amount) => onChange({ ...op, amount })}
      />
    );
  }
  if (op.kind === "mix") {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={op.with}
          onChange={(event) => onChange({ ...op, with: event.target.value })}
          placeholder="#hex or {token.path}"
          className="h-7 min-w-0 flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-input-bg)] px-2 font-mono text-secondary text-[var(--color-figma-text)] focus:border-[var(--color-figma-accent)] focus:outline-none"
        />
        <Range
          value={op.ratio}
          min={0}
          max={1}
          step={0.01}
          label={`${Math.round(op.ratio * 100)}%`}
          onChange={(ratio) => onChange({ ...op, ratio })}
        />
      </div>
    );
  }
  if (op.kind === "invertLightness") {
    return (
      <Range
        value={op.chromaBoost ?? 1}
        min={0}
        max={2}
        step={0.05}
        label={`${(op.chromaBoost ?? 1).toFixed(2)}x`}
        onChange={(chromaBoost) => onChange({ kind: "invertLightness", chromaBoost })}
      />
    );
  }
  if (op.kind === "scaleBy") {
    return (
      <NumberInput
        value={op.factor}
        label="Factor"
        onChange={(factor) => onChange({ kind: "scaleBy", factor })}
      />
    );
  }
  const unitDelta = isAddUnitDelta(op.delta) ? op.delta : null;
  const deltaValue = unitDelta
    ? unitDelta.value
    : typeof op.delta === "number"
      ? op.delta
      : 0;
  return (
    <div className="flex items-center gap-1.5">
      <NumberInput
        value={deltaValue}
        label="Delta"
        onChange={(value) =>
          onChange({
            kind: "add",
            delta: unitDelta ? { ...unitDelta, value } : value,
          })
        }
      />
      {unitDelta ? (
        <select
          value={unitDelta.unit}
          onChange={(event) => {
            const unit = event.target.value;
            onChange({
              kind: "add",
              delta:
                sourceType === "duration"
                  ? { ...unitDelta, unit: unit as DurationValue["unit"] }
                  : { ...unitDelta, unit: unit as DimensionUnit },
            });
          }}
          className="h-7 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-input-bg)] px-1.5 text-secondary text-[var(--color-figma-text)] focus:border-[var(--color-figma-accent)] focus:outline-none"
        >
          {(sourceType === "duration" ? ["ms", "s"] : [...DIMENSION_UNITS]).map((unit) => (
            <option key={unit} value={unit}>{unit}</option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

function Range({
  value,
  min,
  max,
  step,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-w-0 flex-1"
      />
      <span className="w-10 shrink-0 text-right text-secondary tabular-nums text-[var(--color-figma-text-secondary)]">
        {label}
      </span>
    </div>
  );
}

function NumberInput({
  value,
  label,
  onChange,
}: {
  value: number;
  label: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="text-secondary text-[var(--color-figma-text-tertiary)]">{label}</span>
      <input
        type="number"
        value={value}
        step={0.1}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-7 min-w-0 flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-input-bg)] px-2 text-secondary text-[var(--color-figma-text)] focus:border-[var(--color-figma-accent)] focus:outline-none"
      />
    </label>
  );
}

function resolveFlatTokenValue(path: string, allTokensFlat: Record<string, TokenMapEntry>): unknown {
  const entry = allTokensFlat[path];
  if (!entry) return undefined;
  const resolved = resolveTokenValue(entry.$value, entry.$type, allTokensFlat);
  return resolved.value ?? entry.$value;
}

function previewValue(
  sourceValue: unknown,
  sourceType: TokenType | undefined,
  op: DerivationOp,
  allTokensFlat: Record<string, TokenMapEntry>,
): { label: string; color?: string } | null {
  if (!sourceType || sourceValue === undefined) return null;
  try {
    const result = applyDerivation(sourceValue, sourceType, [op], (path) =>
      resolveFlatTokenValue(path, allTokensFlat),
    );
    if (typeof result === "string") {
      return { label: result, color: isColorPreview(result) ? result : undefined };
    }
    if (typeof result === "number") return { label: formatNumber(result) };
    if (isUnitValue(result)) return { label: `${formatNumber(result.value)}${result.unit}` };
  } catch {
    return null;
  }
  return null;
}

function isUnitValue(value: unknown): value is { value: number; unit: string } {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { value?: unknown }).value === "number" &&
    typeof (value as { unit?: unknown }).unit === "string",
  );
}

function isAddUnitDelta(delta: Extract<DerivationOp, { kind: "add" }>["delta"]): delta is DimensionValue | DurationValue {
  return isUnitValue(delta);
}

function isDimensionUnit(unit: string): unit is DimensionUnit {
  return (DIMENSION_UNITS as readonly string[]).includes(unit);
}

function isColorPreview(value: string): boolean {
  return /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}
