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
            layer: `${dimension.name} / Shared`,
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
            layer: `${dimension.name} / Variant-specific`,
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
      let arr = map.get(prefix);
      if (!arr) {
        arr = [];
        map.set(prefix, arr);
      }
      arr.push(token);
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
    .join(" + ");

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
        <td className="max-w-[140px] truncate px-3 py-1 font-mono text-[var(--color-figma-text)]">
          {token.path}
        </td>
        <td className="px-2 py-1">
          <span className="flex items-center gap-1.5">
            <ValuePreview type={token.type} value={token.resolvedValue} size={14} />
            <span className="truncate font-mono text-[var(--color-figma-text-secondary)]">
              {formatValue(token.resolvedValue)}
            </span>
          </span>
        </td>
        <td
          className="max-w-[90px] truncate px-2 py-1 text-right text-[var(--color-figma-text-tertiary)]"
          title={token.layer}
        >
          {token.set}
        </td>
      </tr>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <div className="flex items-start justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
              Preview
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
            Back to themes
          </button>
        </div>
        <div className="flex items-center justify-between border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-1.5">
          <div className="text-[10px] text-[var(--color-figma-text-tertiary)]">
            {activeSelectionLabel || "No active theme variant selection"}
          </div>
          <button
            type="button"
            onClick={() => setGroupByPrefix((v) => !v)}
            className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
              groupByPrefix
                ? "bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                : "text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
            }`}
            title="Group tokens by prefix"
          >
            Group by prefix
          </button>
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
            {previewSearch
              ? `No matches for "${previewSearch}"`
              : "No token sources connected"}
          </div>
        ) : groups ? (
          <table className="w-full text-[10px]">
            <thead>
              <tr className="bg-[var(--color-figma-bg-secondary)] text-left text-[var(--color-figma-text-tertiary)]">
                <th className="px-3 py-1 font-medium">Token</th>
                <th className="px-2 py-1 font-medium">Value</th>
                <th className="px-2 py-1 text-right font-medium">Source</th>
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
                <th className="px-3 py-1 font-medium">Token</th>
                <th className="px-2 py-1 font-medium">Value</th>
                <th className="px-2 py-1 text-right font-medium">Source</th>
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
          <div className="border-t border-[var(--color-figma-border)] px-3 py-1 text-center text-[10px] text-[var(--color-figma-text-tertiary)]">
            Showing first 200 tokens. Use search to filter.
          </div>
        )}
      </div>
    </div>
  );
}
