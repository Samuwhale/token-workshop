import type {
  DerivationOp,
  DimensionValue,
  DurationValue,
} from "@tokenmanager/core";

export function summarizeVisibleDerivationOps(
  ops: readonly DerivationOp[],
): string[] {
  if (ops.length === 0) return ["No ops"];
  const visible = ops.slice(0, 2).map(summarizeDerivationOp);
  const overflow = ops.length - visible.length;
  return overflow > 0 ? [...visible, `+${overflow} more`] : visible;
}

export function summarizeDerivationOp(op: DerivationOp): string {
  switch (op.kind) {
    case "alpha":
      return `alpha ${Math.round(op.amount * 100)}%`;
    case "lighten":
      return `lighten ${formatNumber(op.amount)}`;
    case "darken":
      return `darken ${formatNumber(op.amount)}`;
    case "mix":
      return `mix ${formatRefOrValue(op.with)} ${Math.round(op.ratio * 100)}%`;
    case "invertLightness":
      return `invert L ${formatNumber(op.chromaBoost ?? 1)}x`;
    case "scaleBy":
      return `x${formatNumber(op.factor)}`;
    case "add":
      return `+${formatDelta(op.delta)}`;
  }
}

function formatDelta(delta: number | DimensionValue | DurationValue): string {
  if (typeof delta === "number") return formatNumber(delta);
  return `${formatNumber(delta.value)}${delta.unit}`;
}

function formatRefOrValue(value: string): string {
  return value.length > 18 ? `${value.slice(0, 15)}...` : value;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
