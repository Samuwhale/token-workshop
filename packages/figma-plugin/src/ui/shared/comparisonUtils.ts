import type { ThemeDimension } from "@tokenmanager/core";
import type { TokenMapEntry } from "../../shared/types";
import { applyThemeSelectionsToTokens } from "./themeModeUtils";

export interface ThemeComparisonOption {
  dimensionId: string;
  optionName: string;
}

export function resolveThemeOption(
  option: ThemeComparisonOption | null,
  dimensions: ThemeDimension[],
  allTokensFlat: Record<string, TokenMapEntry>,
  pathToSet: Record<string, string>,
): Record<string, TokenMapEntry> {
  if (!option) {
    return applyThemeSelectionsToTokens(allTokensFlat, dimensions, {}, pathToSet);
  }
  return applyThemeSelectionsToTokens(allTokensFlat, dimensions, {
    [option.dimensionId]: option.optionName,
  }, pathToSet);
}

export function exportCsvFile(filename: string, rows: string[][]): void {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = rows.map((row) => row.map(esc).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(
  text: string,
  onSuccess?: () => void,
  onError?: (err: unknown) => void,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    onSuccess?.();
  } catch (err) {
    console.warn("[clipboard] write failed:", err);
    onError?.(err);
  }
}
