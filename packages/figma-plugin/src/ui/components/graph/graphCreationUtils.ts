import type { TokenMapEntry } from "../../../shared/types";

export function canCreateDerivationFromType(type: string | undefined): boolean {
  return (
    type === "color" ||
    type === "dimension" ||
    type === "number" ||
    type === "duration"
  );
}

export function pickAvailableAliasPath(
  sourcePath: string,
  flat: Record<string, TokenMapEntry>,
): string {
  return pickAvailablePath(`${sourcePath}-alias`, flat);
}

export function pickAvailableDerivationPath(
  sourcePath: string,
  sourceType: string | undefined,
  flat: Record<string, TokenMapEntry>,
): string {
  const suffix =
    sourceType === "color"
      ? "alpha-50"
      : canCreateDerivationFromType(sourceType)
        ? "x2"
        : "modified";
  return pickAvailablePath(`${sourcePath}-${suffix}`, flat);
}

function pickAvailablePath(
  base: string,
  flat: Record<string, TokenMapEntry>,
): string {
  if (!flat[base]) {
    return base;
  }

  let index = 2;
  while (flat[`${base}-${index}`]) {
    index += 1;
  }
  return `${base}-${index}`;
}
