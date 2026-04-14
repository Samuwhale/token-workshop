import type { ThemeDimension, ThemeOption } from "@tokenmanager/core";
import { Fragment, useMemo, useRef, useState } from "react";
import { ValuePreview } from "../ValuePreview";

interface PreviewTokenEntry {
  path: string;
  rawValue: unknown;
  resolvedValue: unknown;
  type: string;
  set: string;
  layer: string;
}

interface ThemePreviewScreenProps {
  dimensions: ThemeDimension[];
  selectedOptions: Record<string, string>;
  setTokenValues: Record<string, Record<string, any>>;
  setTokenTypes?: Record<string, Record<string, string>>;
  onNavigateToToken?: (path: string, set: string) => void;
  onBack: () => void;
}

export function ThemePreviewScreen({
  dimensions,
  selectedOptions,
  setTokenValues,
  setTokenTypes = {},
  onNavigateToToken,
  onBack,
}: ThemePreviewScreenProps) {
  const [previewSearch, setPreviewSearch] = useState("");
  const [groupByPrefix, setGroupByPrefix] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const previewSearchRef = useRef<HTMLInputElement | null>(null);

  const previewTokens = useMemo<PreviewTokenEntry[]>(() => {
    if (dimensions.length === 0) return [];

    const merged: Record<
      string,
      { value: unknown; set: string; layer: string; type: string }
    > = {};

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
        const types = setTokenTypes[setName] ?? {};
        if (!tokens) continue;
        for (const [path, value] of Object.entries(tokens)) {
          merged[path] = {
            value,
            set: setName,
            layer: `${dimension.name} / Base`,
            type: types[path] ?? "",
          };
        }
      }

      for (const [setName, status] of Object.entries(option.sets)) {
        if (status !== "enabled") continue;
        const tokens = setTokenValues[setName];
        const types = setTokenTypes[setName] ?? {};
        if (!tokens) continue;
        for (const [path, value] of Object.entries(tokens)) {
          merged[path] = {
            value,
            set: setName,
            layer: `${dimension.name} / Override`,
            type: types[path] ?? merged[path]?.type ?? "",
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
      type: info.type,
      set: info.set,
      layer: info.layer,
    }));

    entries.sort((a, b) => a.path.localeCompare(b.path));

    if (previewSearch.trim()) {
      const query = previewSearch.toLowerCase();
      entries = entries.filter(
        (entry) =>
          entry.path.toLowerCase().includes(query) ||
          entry.set.toLowerCase().includes(query) ||
          String(entry.resolvedValue).toLowerCase().includes(query),
      );
    }

    return entries.slice(0, 200);
  }, [dimensions, previewSearch, selectedOptions, setTokenValues, setTokenTypes]);

  const groups = useMemo(() => {
    if (!groupByPrefix) return null;
    const map = new Map<string, PreviewTokenEntry[]>();
    for (const token of previewTokens) {
      const dotIdx = token.path.indexOf(".");
      const prefix = dotIdx > 0 ? token.path.slice(0, dotIdx) : "(root)";
      const group = map.get(prefix);
      if (group) group.push(token);
      else map.set(prefix, [token]);
    }
    return map;
  }, [groupByPrefix, previewTokens]);

  const toggleGroup = (prefix: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(prefix)) next.delete(prefix);
      else next.add(prefix);
      return next;
    });
  };

  const activeSelectionLabel = dimensions
    .map((dimension) => {
      const optionName = selectedOptions[dimension.id];
      return optionName ? `${dimension.name}: ${optionName}` : null;
    })
    .filter(Boolean)
    .join(" · ");

  function formatValue(value: unknown): string {
    if (typeof value === "object" && value !== null) return JSON.stringify(value);
    return String(value ?? "");
  }

  function TokenRow({ token }: { token: PreviewTokenEntry }) {
    return (
      <tr
        className="cursor-default hover:bg-[var(--color-figma-bg-hover)]"
        onClick={() => onNavigateToToken?.(token.path, token.set)}
        title={`${token.path}\nRaw: ${formatValue(token.rawValue)}\nFrom: ${token.set} (${token.layer})`}
      >
        <td className="max-w-[140px] truncate px-2.5 py-[3px] font-mono text-[var(--color-figma-text)]">
          {token.path}
        </td>
        <td className="px-2.5 py-[3px]">
          <span className="flex items-center gap-1.5">
            <ValuePreview type={token.type} value={token.resolvedValue} size={14} />
            <span className="truncate font-mono text-[var(--color-figma-text-secondary)]">
              {formatValue(token.resolvedValue)}
            </span>
          </span>
        </td>
        <td
          className="max-w-[90px] truncate px-2.5 py-[3px] text-right text-[var(--color-figma-text-tertiary)]"
          title={token.layer}
        >
          {token.set}
        </td>
      </tr>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/40 px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to modes"
            className="inline-flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
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
            Theme setup
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-[12px] font-semibold text-[var(--color-figma-text)]">
                Resolved tokens
              </h2>
              {activeSelectionLabel && (
                <span className="truncate text-[10px] text-[var(--color-figma-text-tertiary)]">
                  {activeSelectionLabel}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
              Inspect the token output for the current mode selection.
            </p>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <svg
              className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)]"
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={previewSearchRef}
              type="text"
              placeholder="Search paths, values, or source sets"
              value={previewSearch}
              onChange={(event) => setPreviewSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  if (previewSearch) setPreviewSearch("");
                  previewSearchRef.current?.blur();
                }
              }}
              className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 pl-6 text-[10px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus-visible:border-[var(--color-figma-accent)]"
            />
          </div>
          <div className="shrink-0 flex items-center rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
            <button
              type="button"
              onClick={() => setGroupByPrefix(false)}
              className={`rounded-l px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
                !groupByPrefix
                  ? "bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                  : "text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
              }`}
            >
              Flat
            </button>
            <button
              type="button"
              onClick={() => setGroupByPrefix(true)}
              className={`rounded-r px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
                groupByPrefix
                  ? "bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                  : "text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
              }`}
            >
              By path
            </button>
          </div>
        </div>

        <div className="mt-1 text-[10px] text-[var(--color-figma-text-tertiary)]">
          {previewTokens.length} token{previewTokens.length === 1 ? "" : "s"} shown
          {previewSearch ? ` · filtered by "${previewSearch}"` : ""}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {previewTokens.length === 0 ? (
          <div className="px-3 py-6 text-center text-[10px] text-[var(--color-figma-text-tertiary)]">
            {previewSearch ? `No matches for "${previewSearch}"` : "No resolved tokens"}
          </div>
        ) : groups ? (
          <table className="w-full text-[10px]">
            <thead>
              <tr className="bg-[var(--color-figma-bg-secondary)] text-left text-[var(--color-figma-text-tertiary)]">
                <th className="px-2.5 py-0.5 font-medium">Token</th>
                <th className="px-2.5 py-0.5 font-medium">Value</th>
                <th className="px-2.5 py-0.5 text-right font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(groups.entries()).map(([prefix, tokens]) => {
                const isCollapsed = collapsedGroups.has(prefix);
                return (
                  <Fragment key={`group-${prefix}`}>
                    <tr
                      className="cursor-pointer hover:bg-[var(--color-figma-bg-hover)]"
                      onClick={() => toggleGroup(prefix)}
                    >
                      <td
                        colSpan={3}
                        className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/50 px-3 py-1"
                      >
                        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--color-figma-text-secondary)]">
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                            className={`transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                          >
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                          {prefix}
                          <span className="font-normal text-[var(--color-figma-text-tertiary)]">
                            {tokens.length}
                          </span>
                        </span>
                      </td>
                    </tr>
                    {!isCollapsed &&
                      tokens.map((token) => (
                        <TokenRow key={token.path} token={token} />
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-[10px]">
            <thead>
              <tr className="bg-[var(--color-figma-bg-secondary)] text-left text-[var(--color-figma-text-tertiary)]">
                <th className="px-2.5 py-0.5 font-medium">Token</th>
                <th className="px-2.5 py-0.5 font-medium">Value</th>
                <th className="px-2.5 py-0.5 text-right font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-figma-border)]">
              {previewTokens.map((token) => (
                <TokenRow key={token.path} token={token} />
              ))}
            </tbody>
          </table>
        )}

        {previewTokens.length >= 200 && (
          <div className="border-t border-[var(--color-figma-border)] px-3 py-1 text-center text-[9px] text-[var(--color-figma-text-tertiary)]">
            Showing first 200. Search to narrow the result set.
          </div>
        )}
      </div>
    </div>
  );
}
