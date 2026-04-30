import { useEffect, useMemo, useState } from "react";
import { Crosshair, Home, Link2, MoveRight, Pencil, Square, Trash2, X } from "lucide-react";
import type {
  BindableProperty,
  SelectionNodeInfo,
  TokenMapEntry,
} from "../../shared/types";
import { ALL_BINDABLE_PROPERTIES, PROPERTY_LABELS } from "../../shared/types";
import { resolveTokenValue } from "../../shared/resolveAlias";
import {
  getCompatibleTokenTypes,
  isTokenScopeCompatible,
} from "./selectionInspectorUtils";

interface DeepInspectSectionProps {
  deepChildNodes: SelectionNodeInfo[];
  tokenMap: Record<string, TokenMapEntry>;
  onNavigateToToken?: (tokenPath: string) => void;
  onRemoveBinding?: (
    nodeId: string,
    property: BindableProperty,
    tokenPath: string,
  ) => void;
  onBindToken?: (
    nodeId: string,
    property: BindableProperty,
    tokenPath: string,
  ) => void;
  onSelectNode?: (nodeId: string) => void;
  showHeader?: boolean;
}

function DeepBindPanel({
  childNode,
  prop,
  tokenMap,
  currentBinding,
  onBind,
  onClose,
}: {
  childNode: SelectionNodeInfo;
  prop: BindableProperty;
  tokenMap: Record<string, TokenMapEntry>;
  currentBinding: string;
  onBind: (nodeId: string, prop: BindableProperty, tokenPath: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [ignoreScope, setIgnoreScope] = useState(false);

  const { candidates, compatibleTypes, hiddenByScope } = useMemo(() => {
    const compatibleTypes = getCompatibleTokenTypes(prop);
    const typeCompatible = Object.entries(tokenMap).filter(([, entry]) =>
      compatibleTypes.includes(entry.$type),
    );
    const scopeCompatible = typeCompatible.filter(([, entry]) =>
      isTokenScopeCompatible(entry, prop),
    );
    const filtered = (ignoreScope ? typeCompatible : scopeCompatible).filter(
      ([path]) => !query || path.toLowerCase().includes(query.toLowerCase()),
    );
    return {
      candidates: filtered.slice(0, 12),
      compatibleTypes,
      hiddenByScope: Math.max(0, typeCompatible.length - scopeCompatible.length),
    };
  }, [ignoreScope, prop, query, tokenMap]);

  useEffect(() => {
    setSelectedIndex((index) => {
      if (candidates.length === 0) return -1;
      return Math.min(index, candidates.length - 1);
    });
  }, [candidates.length]);

  return (
    <div className="ml-2 mr-1 mb-1 rounded border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-bg)] overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--color-figma-border)]/50 bg-[var(--color-figma-accent)]/5">
        <Link2
          size={8}
          strokeWidth={2}
          className="text-[color:var(--color-figma-text-accent)] shrink-0"
          aria-hidden
        />
        <span className="text-secondary text-[color:var(--color-figma-text-accent)] font-medium flex-1 truncate">
          {currentBinding ? 'Remap' : 'Bind'} on {childNode.name}
        </span>
        <button
          onClick={onClose}
          className="p-0.5 rounded text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          title="Cancel"
          aria-label="Cancel"
        >
          <X size={7} strokeWidth={2.5} aria-hidden />
        </button>
      </div>
      <div className="px-2 py-1.5 flex flex-col gap-1">
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(-1);
            setIgnoreScope(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onClose();
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelectedIndex((i) => Math.min(i + 1, candidates.length - 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelectedIndex((i) => Math.max(i - 1, 0));
              return;
            }
            if (e.key === "Enter" && candidates.length > 0) {
              const target =
                selectedIndex >= 0 ? candidates[selectedIndex] : candidates[0];
              if (target) onBind(childNode.id, prop, target[0]);
            }
          }}
          placeholder="Search tokens\u2026"
          aria-autocomplete="list"
          aria-label="Search token candidates"
          className="w-full px-2 py-1 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-secondary text-[color:var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
        />
        {candidates.length === 0 ? (
          <div className="text-secondary text-[color:var(--color-figma-text-secondary)] py-1 text-center">
            {query
              ? "No matching tokens"
              : `No ${compatibleTypes.join(" or ")} tokens`}
          </div>
        ) : (
          <div
            role="listbox"
            aria-label="Token candidates"
            className="max-h-[120px] overflow-y-auto flex flex-col gap-px"
          >
            {candidates.map(([path, entry], idx) => {
              let swatchColor: string | null = null;
              if (entry.$type === "color") {
                const r = resolveTokenValue(
                  entry.$value,
                  entry.$type,
                  tokenMap,
                );
                if (typeof r.value === "string" && r.value.startsWith("#"))
                  swatchColor = r.value;
              }
              const isSelected = idx === selectedIndex;
              const isCurrent = path === currentBinding;
              return (
                <button
                  key={path}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => onBind(childNode.id, prop, path)}
                  className={`w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-left transition-colors ${isSelected ? "bg-[var(--color-figma-accent)]/15" : "hover:bg-[var(--color-figma-accent)]/10"} ${isCurrent ? "opacity-50" : ""}`}
                >
                  {swatchColor ? (
                    <div
                      className="w-2.5 h-2.5 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                      style={{ backgroundColor: swatchColor }}
                    />
                  ) : (
                    <div className="w-2.5 h-2.5 shrink-0 flex items-center justify-center">
                      <div className="w-1 h-1 rounded-full bg-[var(--color-figma-text-secondary)]/40" />
                    </div>
                  )}
                  <span
                    className={`text-secondary font-mono truncate flex-1 ${isSelected ? "text-[color:var(--color-figma-text-accent)]" : "text-[color:var(--color-figma-text)]"}`}
                  >
                    {path}
                  </span>
                  {isCurrent && (
                    <span className="text-[var(--font-size-xs)] bg-[var(--color-figma-bg-secondary)] text-[color:var(--color-figma-text-secondary)] px-1 py-0.5 rounded shrink-0">
                      current
                    </span>
                  )}
                  <span className="text-[var(--font-size-xs)] text-[color:var(--color-figma-text-secondary)] shrink-0">
                    {entry.$type}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {hiddenByScope > 0 && (
          <div className="text-secondary text-[color:var(--color-figma-text-secondary)]">
            {ignoreScope ? (
              <>
                Showing compatible and incompatible tokens{" "}
                <button
                  type="button"
                  onClick={() => setIgnoreScope(false)}
                  className="text-[color:var(--color-figma-text-accent)] hover:underline"
                >
                  Hide incompatible
                </button>
              </>
            ) : (
              <>
                {hiddenByScope} incompatible with this selection{" "}
                <button
                  type="button"
                  onClick={() => setIgnoreScope(true)}
                  className="text-[color:var(--color-figma-text-accent)] hover:underline"
                >
                  Show anyway
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getBoundProperties(child: SelectionNodeInfo): BindableProperty[] {
  return ALL_BINDABLE_PROPERTIES.filter(
    (property) => child.bindings[property],
  ) as BindableProperty[];
}

export function DeepInspectSection({
  deepChildNodes,
  tokenMap,
  onNavigateToToken,
  onRemoveBinding,
  onBindToken,
  onSelectNode,
  showHeader = true,
}: DeepInspectSectionProps) {
  // Track which property on which node has an open bind panel: "nodeId:prop"
  const [activeBindKey, setActiveBindKey] = useState<string | null>(null);
  const availableBindKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const child of deepChildNodes) {
      for (const property of getBoundProperties(child)) {
        keys.add(`${child.id}:${property}`);
      }
    }
    return keys;
  }, [deepChildNodes]);

  useEffect(() => {
    if (activeBindKey && !availableBindKeys.has(activeBindKey)) {
      setActiveBindKey(null);
    }
  }, [activeBindKey, availableBindKeys]);

  if (deepChildNodes.length === 0) {
    return (
      <div
        className={`${showHeader ? "mt-1 border-t border-[var(--color-figma-border)]/50 pt-1" : ""} px-3 py-2 text-center`}
      >
        <p className="text-secondary text-[color:var(--color-figma-text-secondary)]">
          No nested bindings.
        </p>
      </div>
    );
  }

  const handleBind = (
    nodeId: string,
    prop: BindableProperty,
    tokenPath: string,
  ) => {
    onBindToken?.(nodeId, prop, tokenPath);
    setActiveBindKey(null);
  };

  return (
    <div
      className={
        showHeader
          ? "mt-1 border-t border-[var(--color-figma-border)]/50 pt-1"
          : ""
      }
    >
      {showHeader && (
        <div className="flex items-center gap-1 px-2 py-1 text-secondary font-semibold uppercase tracking-wide text-[color:var(--color-figma-text-secondary)]">
          <Home size={9} strokeWidth={2} aria-hidden />
          Nested ({deepChildNodes.length})
        </div>
      )}
      {deepChildNodes.map((child) => {
        const boundProps = getBoundProperties(child);
        if (boundProps.length === 0) return null;
        const indent = Math.min((child.depth ?? 1) - 1, 3);
        return (
          <div
            key={child.id}
            className="px-2 py-1.5 rounded"
            style={{ paddingLeft: `${8 + indent * 10}px` }}
          >
            <div className="flex items-center gap-1 mb-0.5 group/layer">
              <Square
                size={8}
                strokeWidth={2}
                className="text-[color:var(--color-figma-text-secondary)] shrink-0"
                aria-hidden
              />
              <span
                className="text-secondary font-medium text-[color:var(--color-figma-text)] truncate flex-1"
                title={child.name}
              >
                {child.name}
              </span>
              <span className="text-[var(--font-size-xs)] text-[color:var(--color-figma-text-secondary)] shrink-0 uppercase tracking-wide">
                {child.type}
              </span>
              {onSelectNode && (
                <button
                  onClick={() => onSelectNode(child.id)}
                  title="Select layer in Figma"
                  aria-label={`Select ${child.name} in Figma`}
                  className="opacity-40 group-hover/layer:opacity-100 pointer-events-none group-hover/layer:pointer-events-auto transition-opacity p-0.5 rounded text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text-accent)] hover:bg-[var(--color-figma-accent)]/10 shrink-0"
                >
                  <Crosshair size={8} strokeWidth={2} aria-hidden />
                </button>
              )}
            </div>
            <div className="flex flex-col gap-0.5 pl-3">
              {boundProps.map((prop) => {
                const tokenPath = child.bindings[prop];
                const entry = tokenMap[tokenPath];
                let swatchColor: string | null = null;
                if (entry?.$type === "color") {
                  const r = resolveTokenValue(
                    entry.$value,
                    entry.$type,
                    tokenMap,
                  );
                  if (typeof r.value === "string" && r.value.startsWith("#"))
                    swatchColor = r.value;
                }
                const bindKey = `${child.id}:${prop}`;
                const isBindOpen = activeBindKey === bindKey;
                return (
                  <div key={prop}>
                    <div className="flex items-center gap-1 group/row">
                      {swatchColor ? (
                        <div
                          className="w-2.5 h-2.5 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                          style={{ backgroundColor: swatchColor }}
                        />
                      ) : (
                        <div className="w-2.5 h-2.5 shrink-0" />
                      )}
                      <span className="text-[var(--font-size-xs)] text-[color:var(--color-figma-text-secondary)] w-[60px] shrink-0 truncate">
                        {PROPERTY_LABELS[prop]}
                      </span>
                      <Link2
                        size={8}
                        strokeWidth={2}
                        className="text-[color:var(--color-figma-text-accent)] shrink-0"
                        aria-hidden
                      />
                      <span
                        className="text-[var(--font-size-xs)] text-[color:var(--color-figma-text-accent)] font-mono truncate flex-1"
                        title={tokenPath}
                      >
                        {tokenPath}
                      </span>
                      {/* Action buttons — appear on hover */}
                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity">
                        {onNavigateToToken && (
                          <button
                            onClick={() => onNavigateToToken(tokenPath)}
                            title="Go to token"
                            aria-label="Go to token"
                            className="p-0.5 rounded text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors"
                          >
                            <MoveRight size={8} strokeWidth={2} aria-hidden />
                          </button>
                        )}
                        {onBindToken && (
                          <button
                            onClick={() =>
                              setActiveBindKey(isBindOpen ? null : bindKey)
                            }
                            title="Remap"
                            aria-label="Remap binding"
                            className="p-0.5 rounded text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors"
                          >
                            <Pencil size={8} strokeWidth={2} aria-hidden />
                          </button>
                        )}
                        {onRemoveBinding && (
                          <button
                            onClick={() =>
                              onRemoveBinding(child.id, prop, tokenPath)
                            }
                            title="Remove binding"
                            aria-label="Remove binding"
                            className="p-0.5 rounded hover:bg-[var(--color-figma-error)]/20 text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text-error)] transition-colors"
                          >
                            <Trash2 size={8} strokeWidth={2} aria-hidden />
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Inline bind panel */}
                    {isBindOpen && onBindToken && (
                      <DeepBindPanel
                        childNode={child}
                        prop={prop}
                        tokenMap={tokenMap}
                        currentBinding={tokenPath}
                        onBind={handleBind}
                        onClose={() => setActiveBindKey(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
