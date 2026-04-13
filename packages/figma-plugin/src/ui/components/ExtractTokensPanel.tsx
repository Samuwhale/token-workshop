import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type {
  ExtractedTokenEntry,
  TokenMapEntry,
  DimensionValue,
  BorderValue,
  TypographyValue,
  ShadowTokenValue,
  BindableProperty,
} from "../../shared/types";
import { TOKEN_TYPE_BADGE_CLASS } from "../../shared/types";
import { getErrorMessage } from "../shared/utils";
import {
  createTokenValueBody,
  updateToken,
  upsertToken,
} from "../shared/tokenMutations";

interface ExtractTokensPanelProps {
  connected: boolean;
  activeSet: string;
  serverUrl: string;
  tokenMap: Record<string, TokenMapEntry>;
  onTokenCreated: () => void;
  onClose: () => void;
  embedded?: boolean;
  propertyFilter?: BindableProperty[];
  propertyFilterLabel?: string;
}

function formatValuePreview(entry: ExtractedTokenEntry): string {
  const v = entry.value;
  if (entry.tokenType === "color" && typeof v === "string") return v;
  if (entry.tokenType === "dimension" && typeof v === "object" && v !== null) {
    const dim = v as DimensionValue;
    if (dim.value != null) return `${dim.value}${dim.unit}`;
  }
  if (entry.tokenType === "number") return String(v);
  if (entry.tokenType === "border" && typeof v === "object" && v !== null) {
    const border = v as BorderValue;
    const w =
      typeof border.width === "object"
        ? (border.width as DimensionValue)
        : null;
    return `${border.color} ${w?.value}${w?.unit} ${border.style}`;
  }
  if (entry.tokenType === "typography" && typeof v === "object" && v !== null) {
    const typo = v as TypographyValue;
    const parts: string[] = [];
    if (typo.fontFamily)
      parts.push(
        Array.isArray(typo.fontFamily) ? typo.fontFamily[0] : typo.fontFamily,
      );
    if (typo.fontWeight) parts.push(String(typo.fontWeight));
    if (typo.fontSize) {
      const fs =
        typeof typo.fontSize === "object"
          ? (typo.fontSize as DimensionValue)
          : null;
      if (fs) parts.push(`${fs.value}${fs.unit}`);
    }
    return parts.join(" ");
  }
  if (entry.tokenType === "shadow" && typeof v === "object" && v !== null) {
    const shadows = Array.isArray(v)
      ? (v as ShadowTokenValue[])
      : [v as ShadowTokenValue];
    const s = shadows[0];
    if (s) {
      const ox =
        typeof s.offsetX === "object"
          ? (s.offsetX as DimensionValue).value
          : (s.offsetX ?? 0);
      const oy =
        typeof s.offsetY === "object"
          ? (s.offsetY as DimensionValue).value
          : (s.offsetY ?? 0);
      const bl =
        typeof s.blur === "object"
          ? (s.blur as DimensionValue).value
          : (s.blur ?? 0);
      return `${s.color} ${ox}/${oy} blur:${bl}`;
    }
  }
  return JSON.stringify(v).slice(0, 40);
}

export function ExtractTokensPanel({
  connected,
  activeSet,
  serverUrl,
  tokenMap,
  onTokenCreated,
  onClose,
  embedded = false,
  propertyFilter,
  propertyFilterLabel,
}: ExtractTokensPanelProps) {
  const [tokens, setTokens] = useState<ExtractedTokenEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [names, setNames] = useState<Record<number, string>>({});
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [failures, setFailures] = useState<{ name: string; error: string }[]>(
    [],
  );
  const [createdCount, setCreatedCount] = useState(0);
  const listenerRef = useRef(false);

  const EXTRACT_TIMEOUT_MS = 8000;
  const filteredPropertySet = useMemo(
    () => (propertyFilter?.length ? new Set(propertyFilter) : null),
    [propertyFilter],
  );

  const filterExtractedTokens = useCallback(
    (entries: ExtractedTokenEntry[]) => {
      if (!propertyFilter?.length) return entries;
      if (!filteredPropertySet || filteredPropertySet.size === 0) return [];
      return entries.filter((entry) => {
        const property =
          entry.property === "border" ? "stroke" : entry.property;
        return filteredPropertySet.has(property);
      });
    },
    [filteredPropertySet, propertyFilter],
  );

  // Request extraction on mount; cancel loading after timeout if no response
  useEffect(() => {
    setLoading(true);
    parent.postMessage(
      { pluginMessage: { type: "extract-tokens-from-selection" } },
      "*",
    );

    const timer = setTimeout(() => {
      setLoading(false);
      setError(
        "No response from Figma — make sure a layer is selected and try again.",
      );
    }, EXTRACT_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, []);

  // Listen for extraction results
  useEffect(() => {
    if (listenerRef.current) return;
    listenerRef.current = true;

    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg?.type === "extracted-tokens") {
        const extracted = filterExtractedTokens(
          msg.tokens as ExtractedTokenEntry[],
        );
        setTokens(extracted);
        setLoading(false);
        setError("");
        // Select all by default
        setSelected(new Set(extracted.map((_, i) => i)));
        // Init names
        const nameMap: Record<number, string> = {};
        extracted.forEach((t, i) => {
          nameMap[i] = t.suggestedName;
        });
        setNames(nameMap);
      }
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      listenerRef.current = false;
    };
  }, [filterExtractedTokens]);

  const [prefix, setPrefix] = useState("");
  const [bindToLayers, setBindToLayers] = useState(true);
  const [boundCount, setBoundCount] = useState(0);

  const applyPrefix = useCallback(() => {
    if (!tokens) return;
    setNames((prev) => {
      const next = { ...prev };
      tokens.forEach((t, i) => {
        if (!selected.has(i)) return;
        next[i] = prefix.trim()
          ? `${prefix.trim()}.${t.suggestedName}`
          : t.suggestedName;
      });
      return next;
    });
  }, [tokens, selected, prefix]);

  const resetNames = useCallback(() => {
    if (!tokens) return;
    const nameMap: Record<number, string> = {};
    tokens.forEach((t, i) => {
      nameMap[i] = t.suggestedName;
    });
    setNames(nameMap);
    setPrefix("");
  }, [tokens]);

  const toggleSelect = useCallback((idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (!tokens) return;
    setSelected((prev) =>
      prev.size === tokens.length
        ? new Set()
        : new Set(tokens.map((_, i) => i)),
    );
  }, [tokens]);

  const updateName = useCallback((idx: number, name: string) => {
    setNames((prev) => ({ ...prev, [idx]: name }));
  }, []);

  const handleCreate = async () => {
    if (!tokens || creating || !connected || !activeSet) return;
    const toCreate = tokens
      .map((t, i) => ({ ...t, name: names[i] ?? t.suggestedName, idx: i }))
      .filter((_, i) => selected.has(i));

    if (toCreate.length === 0) return;

    // Validate names
    for (const item of toCreate) {
      if (!/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/.test(item.name)) {
        setError(
          `Invalid name "${item.name}" — use dot-separated segments of letters, numbers, - and _`,
        );
        return;
      }
    }

    setCreating(true);
    setError("");
    setFailures([]);
    setProgress({ current: 0, total: toCreate.length });
    let created = 0;
    const itemFailures: { name: string; error: string }[] = [];
    const succeededItems: typeof toCreate = [];

    for (const item of toCreate) {
      try {
        const body = createTokenValueBody({ type: item.tokenType, value: item.value });
        if (tokenMap[item.name]) {
          await updateToken(serverUrl, activeSet, item.name, body);
        } else {
          await upsertToken(serverUrl, activeSet, item.name, body);
        }
        created++;
        succeededItems.push(item);
      } catch (err) {
        itemFailures.push({ name: item.name, error: getErrorMessage(err) });
      }
      setProgress({
        current: created + itemFailures.length,
        total: toCreate.length,
      });
    }

    setCreating(false);
    setProgress(null);
    setCreatedCount(created);
    setFailures(itemFailures);

    if (created === 0 && itemFailures.length > 0) {
      // All failed — stay on the form so the user can retry
      setError(
        `All ${itemFailures.length} token${itemFailures.length !== 1 ? "s" : ""} failed to create.`,
      );
      return;
    }

    // At least some succeeded
    if (created > 0) {
      onTokenCreated();
    }

    // Bind the successfully created tokens to their originating layers
    if (bindToLayers && succeededItems.length > 0) {
      let totalBound = 0;
      for (const item of succeededItems) {
        // 'border' tokens bind as 'stroke' (applyTokenValue handles border type in the stroke case)
        const targetProperty =
          item.property === "border" ? "stroke" : item.property;
        const nodeIds = item.layerIds ?? [item.layerId];
        parent.postMessage(
          {
            pluginMessage: {
              type: "apply-to-nodes",
              nodeIds,
              tokenPath: item.name,
              tokenType: item.tokenType,
              targetProperty,
              resolvedValue: item.value,
            },
          },
          "*",
        );
        totalBound += nodeIds.length;
      }
      setBoundCount(totalBound);
    }

    setDone(true);
  };

  const selectedCount = selected.size;
  const conflictCount = tokens
    ? tokens.filter(
        (_, i) =>
          selected.has(i) && tokenMap[names[i] ?? tokens[i].suggestedName],
      ).length
    : 0;

  if (done) {
    const hasFailures = failures.length > 0;
    return (
      <div
        className={`${embedded ? "" : "border-t border-[var(--color-figma-border)]"} bg-[var(--color-figma-bg)] px-3 py-4`}
      >
        <div className="flex items-center gap-2 mb-1">
          {hasFailures ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[var(--color-figma-warning,#f5a623)] shrink-0"
              aria-hidden="true"
            >
              <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[var(--color-figma-success,#18a058)] shrink-0"
              aria-hidden="true"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
          <span className="text-[11px] font-medium text-[var(--color-figma-text)]">
            {hasFailures
              ? `Created ${createdCount} of ${createdCount + failures.length} token${createdCount + failures.length !== 1 ? "s" : ""}`
              : `Created ${createdCount} token${createdCount !== 1 ? "s" : ""} from selection`}
          </span>
        </div>
        {bindToLayers && boundCount > 0 && (
          <p className="text-[10px] text-[var(--color-figma-text-secondary)] mb-2 ml-5">
            Bound to {boundCount} layer{boundCount !== 1 ? "s" : ""}
          </p>
        )}
        {hasFailures && (
          <div className="ml-5 mt-2 mb-2">
            <p className="text-[10px] text-[var(--color-figma-error)] font-medium mb-1">
              {failures.length} failed:
            </p>
            <ul className="space-y-0.5">
              {failures.map((f, i) => (
                <li
                  key={i}
                  className="text-[10px] text-[var(--color-figma-text-secondary)]"
                >
                  <span className="font-mono text-[var(--color-figma-text)]">
                    {f.name}
                  </span>
                  {" — "}
                  <span className="text-[var(--color-figma-error)]">
                    {f.error}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          onClick={onClose}
          className="text-[10px] text-[var(--color-figma-accent)] hover:underline ml-5"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div
      className={`${embedded ? "" : "border-t border-[var(--color-figma-border)]"} flex flex-col bg-[var(--color-figma-bg)]`}
      style={{ maxHeight: "60vh" }}
    >
      {!embedded && (
        <div className="flex items-center gap-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2 shrink-0">
          <span className="flex-1 text-[10px] font-medium text-[var(--color-figma-text)]">
            Extract Tokens from Selection
          </span>
          <button
            onClick={onClose}
            className="rounded p-0.5 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            title="Close"
            aria-label="Close"
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="px-3 py-6 text-center">
          <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
            Reading selection...
          </span>
        </div>
      )}

      {/* Timeout / error state (no response from plugin) */}
      {!loading && tokens === null && error && (
        <div className="px-3 py-6 text-center">
          <p className="text-[10px] text-[var(--color-figma-error)] mb-2">
            {error}
          </p>
          <button
            onClick={onClose}
            className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
          >
            Close
          </button>
        </div>
      )}

      {/* Empty state */}
      {tokens && tokens.length === 0 && (
        <div className="px-3 py-6 text-center">
          <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
            {propertyFilter?.length
              ? `No ${propertyFilterLabel ?? "matching"} properties are ready to extract from this selection.`
              : "No extractable properties found in the selection."}
          </p>
          <button
            onClick={onClose}
            className="mt-2 text-[10px] text-[var(--color-figma-accent)] hover:underline"
          >
            Close
          </button>
        </div>
      )}

      {/* Token list */}
      {tokens && tokens.length > 0 && (
        <>
          {propertyFilter?.length ? (
            <div className="px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/50 shrink-0">
              <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                Review these {propertyFilterLabel ?? "filtered"} properties before
                creating or overwriting any tokens.
              </p>
            </div>
          ) : null}
          {/* Select all */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-figma-border)] shrink-0">
            <label className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={selectedCount === tokens.length}
                onChange={toggleAll}
                className="accent-[var(--color-figma-accent)]"
              />
              {selectedCount}/{tokens.length} selected
            </label>
            {conflictCount > 0 && (
              <span className="text-[10px] text-[var(--color-figma-warning,#f5a623)]">
                {conflictCount} will overwrite
              </span>
            )}
          </div>

          {/* Batch prefix bar */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/50 shrink-0">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">
              Prefix:
            </span>
            <input
              type="text"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyPrefix();
              }}
              placeholder="e.g. color.brand"
              className="flex-1 min-w-0 text-[10px] font-mono bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-1 py-0.5 text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
            />
            <button
              onClick={applyPrefix}
              disabled={selectedCount === 0}
              className="text-[10px] px-2 py-0.5 rounded bg-[var(--color-figma-accent)] text-white hover:opacity-90 disabled:opacity-40 transition-opacity shrink-0"
            >
              Apply
            </button>
            <button
              onClick={resetNames}
              className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] shrink-0"
              title="Reset all names to suggested"
            >
              Reset
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {tokens.map((token, idx) => {
              const isSelected = selected.has(idx);
              const name = names[idx] ?? token.suggestedName;
              const isConflict = !!tokenMap[name];
              const badgeClass = TOKEN_TYPE_BADGE_CLASS[token.tokenType] || "";

              return (
                <div
                  key={idx}
                  className={`flex items-start gap-1.5 px-3 py-1.5 border-b border-[var(--color-figma-border)]/30 ${
                    isSelected ? "" : "opacity-40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(idx)}
                    className="accent-[var(--color-figma-accent)] mt-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    {/* Name input */}
                    <div className="flex items-center gap-1 mb-0.5">
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => updateName(idx, e.target.value)}
                        className="flex-1 min-w-0 text-[10px] font-mono bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-1 py-0.5 text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                        disabled={!isSelected}
                      />
                      {isConflict && isSelected && (
                        <span
                          className="text-[8px] text-[var(--color-figma-warning,#f5a623)] shrink-0"
                          title="Token already exists — will overwrite"
                        >
                          overwrite
                        </span>
                      )}
                    </div>
                    {/* Value + type badge + layer info */}
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className={`${badgeClass} token-type-badge`}>
                        {token.tokenType}
                      </span>
                      {/* Color swatch */}
                      {token.tokenType === "color" &&
                        typeof token.value === "string" && (
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                            style={{ backgroundColor: token.value }}
                          />
                        )}
                      <span className="text-[var(--color-figma-text-secondary)] truncate">
                        {formatValuePreview(token)}
                      </span>
                      <span className="text-[var(--color-figma-text-secondary)] opacity-60 truncate ml-auto shrink-0">
                        {token.layerName}
                        {(token.layerCount ?? 1) > 1 &&
                          ` +${(token.layerCount ?? 1) - 1}`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-1.5 text-[10px] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/5 border-t border-[var(--color-figma-border)] shrink-0">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex flex-col gap-1.5 px-3 py-2 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
            <label className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={bindToLayers}
                onChange={(e) => setBindToLayers(e.target.checked)}
                className="accent-[var(--color-figma-accent)]"
                disabled={creating}
              />
              Bind tokens to source layers
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="text-[10px] px-2 py-1 rounded bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg)] transition-colors"
                disabled={creating}
              >
                Cancel
              </button>
              <div className="flex-1" />
              {progress && (
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {progress.current}/{progress.total}
                </span>
              )}
              <button
                onClick={handleCreate}
                disabled={selectedCount === 0 || creating || !connected}
                className="text-[10px] px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {creating
                  ? "Creating..."
                  : `Create ${selectedCount} Token${selectedCount !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
