import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type {
  GraphModel,
  GraphNodeId,
  TokenGraphNode,
  GeneratorGraphNode,
} from "@tokenmanager/core";
import { fuzzyScore } from "../../shared/fuzzyMatch";

interface PickerOption {
  id: GraphNodeId;
  primary: string;
  secondary: string;
  kind: "token" | "generator";
  score: number;
}

interface GraphFocusPickerProps {
  fullGraph: GraphModel;
  scopeCollectionIds: string[];
  placeholder?: string;
  autoFocus?: boolean;
  size?: "compact" | "comfortable";
  onSelect: (nodeId: GraphNodeId) => void;
}

const MAX_RESULTS = 24;

export function GraphFocusPicker({
  fullGraph,
  scopeCollectionIds,
  placeholder = "Search tokens…",
  autoFocus = false,
  size = "compact",
  onSelect,
}: GraphFocusPickerProps) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [open, setOpen] = useState(autoFocus);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo<PickerOption[]>(() => {
    const q = query.trim();
    const inScope = (collectionId: string) =>
      scopeCollectionIds.length === 0 ||
      scopeCollectionIds.includes(collectionId);

    const all: PickerOption[] = [];
    for (const node of fullGraph.nodes.values()) {
      if (node.kind === "token") {
        if (!inScope(node.collectionId)) continue;
        all.push(toTokenOption(node, q));
      } else if (node.kind === "generator") {
        if (!inScope(node.targetCollection)) continue;
        all.push(toGeneratorOption(node, q));
      }
    }

    if (q.length === 0) {
      all.sort((a, b) => a.primary.localeCompare(b.primary));
      return all.slice(0, MAX_RESULTS);
    }

    return all
      .filter((opt) => opt.score >= 0)
      .sort((a, b) => b.score - a.score || a.primary.localeCompare(b.primary))
      .slice(0, MAX_RESULTS);
  }, [fullGraph, scopeCollectionIds, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const commitSelection = (option: PickerOption | undefined) => {
    if (!option) return;
    setQuery("");
    setOpen(false);
    onSelect(option.id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      commitSelection(results[activeIdx]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (query) setQuery("");
      else setOpen(false);
      inputRef.current?.blur();
    }
  };

  const inputHeight = size === "comfortable" ? "h-9" : "h-7";

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so click on a result row is registered first.
          window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={handleKeyDown}
        className={`w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 ${inputHeight} text-secondary text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:border-[var(--color-figma-accent)] focus:outline-none`}
      />
      {open && results.length > 0 ? (
        <div
          ref={listRef}
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-72 overflow-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg"
        >
          {results.map((option, idx) => (
            <button
              key={option.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commitSelection(option);
              }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`flex w-full items-baseline gap-2 px-2 py-1 text-left text-secondary ${
                idx === activeIdx
                  ? "bg-[var(--color-figma-bg-hover)]"
                  : "bg-transparent"
              }`}
            >
              <span className="min-w-0 flex-1 truncate font-medium text-[var(--color-figma-text)]">
                {option.primary}
              </span>
              <span className="shrink-0 truncate max-w-[45%] text-[10px] text-[var(--color-figma-text-tertiary)]">
                {option.secondary}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function toTokenOption(node: TokenGraphNode, query: string): PickerOption {
  const score =
    query.length === 0
      ? 0
      : Math.max(fuzzyScore(query, node.path), fuzzyScore(query, node.displayName));
  return {
    id: node.id,
    primary: node.displayName,
    secondary: node.path,
    kind: "token",
    score,
  };
}

function toGeneratorOption(node: GeneratorGraphNode, query: string): PickerOption {
  const score =
    query.length === 0
      ? 0
      : Math.max(fuzzyScore(query, node.name), fuzzyScore(query, node.targetGroup));
  return {
    id: node.id,
    primary: node.name,
    secondary: `generator · ${node.targetGroup || node.targetCollection}`,
    kind: "generator",
    score,
  };
}
