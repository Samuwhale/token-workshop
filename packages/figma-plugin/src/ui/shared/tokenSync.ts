import { resolveAllAliases } from "../../shared/resolveAlias";
import type { TokenMapEntry } from "../../shared/types";
import { stableStringify } from "./utils";

interface ResolveSyncComparableValueParams {
  tokenPath: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  currentValue?: unknown;
  currentType?: string;
}

export function resolveSyncComparableValue({
  tokenPath,
  allTokensFlat,
  currentValue,
  currentType,
}: ResolveSyncComparableValueParams): unknown {
  const currentEntry = allTokensFlat[tokenPath];

  if (currentValue === undefined) {
    return currentEntry?.$value;
  }

  if (!currentEntry) {
    return currentValue;
  }

  const nextType = currentType ?? currentEntry.$type ?? "unknown";
  if (currentEntry.$value === currentValue && currentEntry.$type === nextType) {
    return currentEntry.$value;
  }

  return (
    resolveAllAliases({
      ...allTokensFlat,
      [tokenPath]: {
        ...currentEntry,
        $value: currentValue as TokenMapEntry["$value"],
        $type: nextType,
      },
    })[tokenPath]?.$value ?? currentValue
  );
}

export function hasSyncSnapshotChange(
  syncSnapshot: Record<string, string> | undefined,
  tokenPath: string,
  comparableValue: unknown,
): boolean {
  if (!syncSnapshot || !(tokenPath in syncSnapshot)) {
    return false;
  }

  return syncSnapshot[tokenPath] !== stableStringify(comparableValue);
}
