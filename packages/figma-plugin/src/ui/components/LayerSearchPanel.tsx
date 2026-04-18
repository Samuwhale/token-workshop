import { useState, useEffect, useRef, useCallback } from "react";
import type { LayerSearchResult, LayerSearchResultMessage } from "../../shared/types";
import { getPluginMessageFromEvent, postPluginMessage } from "../../shared/utils";

const nodeTypeIcons: Record<string, string> = {
  FRAME: "▢",
  TEXT: "T",
  RECTANGLE: "□",
  ELLIPSE: "○",
  COMPONENT: "◆",
  INSTANCE: "◇",
  GROUP: "⊞",
  VECTOR: "✦",
  LINE: "─",
  STAR: "★",
  POLYGON: "⬠",
  BOOLEAN_OPERATION: "⊕",
  SECTION: "§",
};

export function LayerSearchPanel({
  onSelect,
}: {
  onSelect: (nodeId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LayerSearchResult[]>([]);
  const [totalSearched, setTotalSearched] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = getPluginMessageFromEvent<LayerSearchResultMessage>(event);
      if (msg?.type !== "search-layers-result") return;
      if (msg.correlationId !== requestIdRef.current) return;
      setResults(msg.results);
      setTotalSearched(msg.totalSearched ?? null);
      setSearching(false);
    };
    window.addEventListener("message", handler);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      requestIdRef.current = null;
      window.removeEventListener("message", handler);
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      requestIdRef.current = null;
      setResults([]);
      setTotalSearched(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      const correlationId = `search-layers-${Date.now()}-${Math.random()}`;
      requestIdRef.current = correlationId;
      postPluginMessage({ type: "search-layers", query: value, correlationId });
    }, 200);
  }, []);

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-secondary)]"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="Search layers by name, type, or component…"
          aria-label="Search layers"
          className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1.5 pl-7 pr-2 text-[10px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-secondary)] focus:focus-visible:border-[var(--color-figma-accent)]"
        />
        {query && (
          <button
            onClick={() => handleQueryChange("")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            aria-label="Clear search"
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
        )}
      </div>

      {searching && results.length === 0 && (
        <p className="px-1 py-2 text-[10px] text-[var(--color-figma-text-secondary)]">
          Searching…
        </p>
      )}

      {!searching && query && results.length === 0 && (
        <p className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-2 text-[10px] text-[var(--color-figma-text-secondary)]">
          Nothing matched "{query}". Try a broader layer name, type, or
          component query.
        </p>
      )}

      {results.length > 0 && (
        <div className="max-h-[200px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
          {totalSearched !== null && (
            <div className="border-b border-[var(--color-figma-border)]/50 bg-[var(--color-figma-bg-secondary)] px-2 py-1 text-[9px] text-[var(--color-figma-text-secondary)]">
              {results.length < 50
                ? `${results.length} result${results.length !== 1 ? "s" : ""} · searched ${totalSearched} layer${totalSearched !== 1 ? "s" : ""}`
                : `Top 50 results · searched ${totalSearched} layer${totalSearched !== 1 ? "s" : ""}`}
            </div>
          )}
          {results.map((layer) => (
            <button
              key={layer.id}
              onClick={() => onSelect(layer.id)}
              className="group flex w-full items-center gap-1.5 border-b border-[var(--color-figma-border)]/30 px-2 py-1 text-left transition-colors last:border-b-0 hover:bg-[var(--color-figma-bg-hover)]"
            >
              <span
                className="w-3 shrink-0 text-center text-[10px] text-[var(--color-figma-text-secondary)]"
                title={layer.type}
              >
                {nodeTypeIcons[layer.type] || "·"}
              </span>
              <span className="flex-1 truncate text-[10px] text-[var(--color-figma-text)]">
                {layer.name}
              </span>
              {layer.parentName && (
                <span
                  className="max-w-[80px] truncate text-[8px] text-[var(--color-figma-text-secondary)]"
                  title={`in ${layer.parentName}`}
                >
                  in {layer.parentName}
                </span>
              )}
              {layer.boundCount > 0 && (
                <span className="shrink-0 rounded-full bg-[var(--color-figma-accent)]/15 px-1 py-0.5 text-[8px] text-[var(--color-figma-accent)]">
                  {layer.boundCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
