import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import { useMemo, useRef, useState } from "react";
import { ThemeValuePreview } from "./ThemeValuePreview";

interface PreviewTokenEntry {
  path: string;
  rawValue: unknown;
  resolvedValue: unknown;
  set: string;
  layer: string;
}

interface ThemePreviewScreenProps {
  dimensions: ThemeDimension[];
  selectedOptions: Record<string, string>;
  setTokenValues: Record<string, Record<string, any>>;
  onNavigateToToken?: (path: string, set: string) => void;
  onBack: () => void;
}

export function ThemePreviewScreen({
  dimensions,
  selectedOptions,
  setTokenValues,
  onNavigateToToken,
  onBack,
}: ThemePreviewScreenProps) {
  const [previewSearch, setPreviewSearch] = useState("");
  const previewSearchRef = useRef<HTMLInputElement | null>(null);

  const previewTokens = useMemo<PreviewTokenEntry[]>(() => {
    if (dimensions.length === 0) return [];

    const merged: Record<string, { value: unknown; set: string; layer: string }> =
      {};

    for (let index = dimensions.length - 1; index >= 0; index -= 1) {
      const dimension = dimensions[index];
      const optionName = selectedOptions[dimension.id];
      const option = dimension.options.find(
        (item: ThemeOption) => item.name === optionName,
      );
      if (!option) continue;

      for (const [setName, status] of Object.entries(option.sets)) {
        if (status !== "source") continue;
        const tokens = setTokenValues[setName];
        if (!tokens) continue;
        for (const [path, value] of Object.entries(tokens)) {
          merged[path] = {
            value,
            set: setName,
            layer: `${dimension.name} / Base`,
          };
        }
      }

      for (const [setName, status] of Object.entries(option.sets)) {
        if (status !== "enabled") continue;
        const tokens = setTokenValues[setName];
        if (!tokens) continue;
        for (const [path, value] of Object.entries(tokens)) {
          merged[path] = {
            value,
            set: setName,
            layer: `${dimension.name} / Override`,
          };
        }
      }
    }

    const resolveAlias = (value: unknown, depth = 0): unknown => {
      if (depth > 10 || typeof value !== "string") return value;
      const match = /^\{([^}]+)\}$/.exec(value);
      if (!match) return value;
      const target = match[1];
      if (merged[target]) return resolveAlias(merged[target].value, depth + 1);
      return value;
    };

    let entries = Object.entries(merged).map(([path, info]) => ({
      path,
      rawValue: info.value,
      resolvedValue: resolveAlias(info.value),
      set: info.set,
      layer: info.layer,
    }));

    if (previewSearch.trim()) {
      const query = previewSearch.toLowerCase();
      entries = entries.filter(
        (entry) =>
          entry.path.toLowerCase().includes(query) ||
          entry.set.toLowerCase().includes(query) ||
          String(entry.resolvedValue).toLowerCase().includes(query),
      );
    }

    return entries.slice(0, 50);
  }, [dimensions, previewSearch, selectedOptions, setTokenValues]);

  const activeSelectionLabel = dimensions
    .map((dimension) => {
      const optionName = selectedOptions[dimension.id];
      return optionName ? `${dimension.name}: ${optionName}` : null;
    })
    .filter(Boolean)
    .join(" + ");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <div className="flex items-start justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
              Theme preview
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
              Review the resolved token combination without crowding the role
              authoring surface.
            </p>
          </div>
          <button
            onClick={onBack}
            className="inline-flex shrink-0 items-center gap-1 rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]"
          >
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back to set roles
          </button>
        </div>
        <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-1.5">
          <div className="text-[10px] text-[var(--color-figma-text-tertiary)]">
            {activeSelectionLabel || "No active theme option selection"}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-b border-[var(--color-figma-border)] px-3 py-2">
        <input
          ref={previewSearchRef}
          type="text"
          placeholder="Search resolved tokens..."
          value={previewSearch}
          onChange={(event) => setPreviewSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              if (previewSearch) setPreviewSearch("");
              previewSearchRef.current?.blur();
            }
          }}
          className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-tertiary)] focus:focus-visible:border-[var(--color-figma-accent)]"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {previewTokens.length === 0 ? (
          <div className="px-3 py-6 text-center text-[10px] italic text-[var(--color-figma-text-tertiary)]">
            {Object.keys(setTokenValues).length === 0
              ? "No token data available"
              : dimensions.every((dimension) => {
                    const option = dimension.options.find(
                      (item: ThemeOption) =>
                        item.name === selectedOptions[dimension.id],
                    );
                    return (
                      !option ||
                      Object.values(option.sets).every(
                        (status) => status === "disabled",
                      )
                    );
                  })
                ? "Assign sets as Base or Override to see resolved tokens"
                : previewSearch
                  ? "No matching tokens"
                  : "No tokens resolved with current selections"}
          </div>
        ) : (
          <table className="w-full text-[10px]">
            <thead>
              <tr className="bg-[var(--color-figma-bg-secondary)] text-left text-[var(--color-figma-text-tertiary)]">
                <th className="px-3 py-1 font-medium">Token</th>
                <th className="px-2 py-1 font-medium">Value</th>
                <th className="px-2 py-1 text-right font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-figma-border)]">
              {previewTokens.map((token) => (
                <tr
                  key={token.path}
                  className="cursor-default hover:bg-[var(--color-figma-bg-hover)]"
                  onClick={() => onNavigateToToken?.(token.path, token.set)}
                  title={`${token.path}\nRaw: ${
                    typeof token.rawValue === "object"
                      ? JSON.stringify(token.rawValue)
                      : token.rawValue
                  }\nFrom: ${token.set} (${token.layer})`}
                >
                  <td className="max-w-[160px] truncate px-3 py-1 font-mono text-[var(--color-figma-text)]">
                    {token.path}
                  </td>
                  <td className="px-2 py-1 text-[var(--color-figma-text-secondary)]">
                    <ThemeValuePreview value={token.resolvedValue} />
                  </td>
                  <td
                    className="max-w-[100px] truncate px-2 py-1 text-right text-[var(--color-figma-text-tertiary)]"
                    title={token.layer}
                  >
                    {token.set}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {previewTokens.length >= 50 && (
          <div className="border-t border-[var(--color-figma-border)] px-3 py-1 text-center text-[10px] text-[var(--color-figma-text-tertiary)]">
            Showing first 50 tokens. Use search to filter.
          </div>
        )}
      </div>
    </div>
  );
}
