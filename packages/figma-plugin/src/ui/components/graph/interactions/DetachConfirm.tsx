import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AncestorChainByMode,
  TokenCollection,
} from "@tokenmanager/core";
import { resolveTokenAncestors } from "@tokenmanager/core";
import type { TokenMapEntry } from "../../../../shared/types";
import { formatTokenValueForDisplay } from "../../../shared/tokenFormatting";
import { projectTokenEntriesToGraphTokens } from "../../../shared/graphTokens";

interface DetachConfirmProps {
  x: number;
  y: number;
  tokenPath: string;
  tokenCollectionId: string;
  edgeModeNames: string[];
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
  busy?: boolean;
  errorMessage?: string;
  onConfirm: (modeLiterals: Record<string, unknown>) => void;
  onCancel: () => void;
}

export function DetachConfirm({
  x,
  y,
  tokenPath,
  tokenCollectionId,
  edgeModeNames,
  collections,
  perCollectionFlat,
  pathToCollectionId,
  collectionIdsByPath,
  busy,
  errorMessage,
  onConfirm,
  onCancel,
}: DetachConfirmProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedModes, setSelectedModes] = useState<Set<string>>(
    () => new Set(edgeModeNames),
  );

  useEffect(() => {
    setSelectedModes(new Set(edgeModeNames));
  }, [edgeModeNames]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  useEffect(() => {
    const handlePointer = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      onCancel();
    };
    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, [onCancel]);

  const tokensByCollection = useMemo(
    () => projectTokenEntriesToGraphTokens(perCollectionFlat),
    [perCollectionFlat],
  );

  const ancestors = useMemo(() => {
    return resolveTokenAncestors({
      tokenPath,
      collectionId: tokenCollectionId,
      collections,
      tokensByCollection,
      pathToCollectionId,
      collectionIdsByPath,
    });
  }, [
    tokenPath,
    tokenCollectionId,
    collections,
    tokensByCollection,
    pathToCollectionId,
    collectionIdsByPath,
  ]);

  const chainsByMode = useMemo(() => {
    const map = new Map<string, AncestorChainByMode>();
    for (const chain of ancestors.chains) {
      map.set(chain.modeName, chain);
    }
    return map;
  }, [ancestors]);

  const formula = useMemo(() => {
    const formulaSources = ancestors.chains
      .map((c) => c.rows.find((r) => r.formulaSource)?.formulaSource)
      .filter((f): f is string => Boolean(f));
    return formulaSources[0];
  }, [ancestors]);

  const noneSelected = selectedModes.size === 0;

  const handleConfirm = () => {
    const modeLiterals: Record<string, unknown> = {};
    for (const modeName of selectedModes) {
      const chain = chainsByMode.get(modeName);
      if (!chain || chain.terminalKind !== "literal") continue;
      modeLiterals[modeName] = chain.terminalValue;
    }
    onConfirm(modeLiterals);
  };

  const everyModeResolves = [...selectedModes].every((mode) => {
    const chain = chainsByMode.get(mode);
    return chain && chain.terminalKind === "literal";
  });

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Detach alias"
      style={{ left: x, top: y }}
      className="fixed z-50 w-[320px] rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-3 shadow-lg"
    >
      <div className="text-secondary text-[var(--color-figma-text)]">
        Detach <span className="font-mono">{tokenPath}</span>?
      </div>
      {formula ? (
        <div className="mt-2 text-secondary text-[var(--color-figma-text-secondary)]">
          Replaces formula{" "}
          <span className="font-mono text-[var(--color-figma-text)]">{formula}</span>{" "}
          with the resolved literal value.
        </div>
      ) : null}
      <div className="mt-2 flex flex-col gap-1">
        {edgeModeNames.map((mode) => {
          const chain = chainsByMode.get(mode);
          const literal =
            chain && chain.terminalKind === "literal"
              ? formatTokenValueForDisplay(chain.terminalType, chain.terminalValue)
              : chain
                ? `Cannot detach (${chain.terminalKind})`
                : "—";
          const disabled = !chain || chain.terminalKind !== "literal";
          return (
            <label
              key={mode}
              className={`flex items-center gap-2 text-secondary ${
                disabled
                  ? "text-[var(--color-figma-text-tertiary)]"
                  : "cursor-pointer text-[var(--color-figma-text)]"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedModes.has(mode)}
                disabled={disabled}
                onChange={() => {
                  setSelectedModes((prev) => {
                    const next = new Set(prev);
                    if (next.has(mode)) next.delete(mode);
                    else next.add(mode);
                    return next;
                  });
                }}
              />
              {edgeModeNames.length > 1 ? (
                <span className="shrink-0 font-mono text-[10px] text-[var(--color-figma-text-tertiary)]">
                  {mode}
                </span>
              ) : null}
              <span className="truncate font-mono">{literal}</span>
            </label>
          );
        })}
      </div>
      {errorMessage ? (
        <div className="mt-2 text-secondary text-[var(--color-figma-error)]">
          {errorMessage}
        </div>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-[var(--color-figma-border)] bg-transparent px-2 py-1 text-secondary text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || noneSelected || !everyModeResolves}
          onClick={handleConfirm}
          className="rounded-md bg-[var(--color-figma-accent)] px-2 py-1 text-secondary font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
        >
          {busy ? "Detaching…" : "Detach"}
        </button>
      </div>
    </div>
  );
}
