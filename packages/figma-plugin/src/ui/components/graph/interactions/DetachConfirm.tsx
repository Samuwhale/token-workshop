import { useEffect, useMemo, useState } from "react";
import type {
  AncestorChainByMode,
  TokenCollection,
} from "@tokenmanager/core";
import { resolveTokenAncestors } from "@tokenmanager/core";
import type { TokenMapEntry } from "../../../../shared/types";
import { formatTokenValueForDisplay } from "../../../shared/tokenFormatting";
import { projectTokenEntriesToGraphTokens } from "../../../shared/graphTokens";
import { ContextDialog, DialogActions, DialogError } from "./ContextDialog";

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
  const [selectedModes, setSelectedModes] = useState<Set<string>>(
    () => new Set(edgeModeNames),
  );

  useEffect(() => {
    setSelectedModes(new Set(edgeModeNames));
  }, [edgeModeNames]);

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

  const isMultiMode = edgeModeNames.length > 1;

  return (
    <ContextDialog
      x={x}
      y={y}
      ariaLabel="Detach alias"
      width={320}
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-1">
        <div className="font-medium text-[var(--color-figma-text)]">
          Detach alias
        </div>
        <div className="text-secondary text-[var(--color-figma-text-secondary)]">
          Replace alias with the resolved literal on{" "}
          <span className="font-mono text-[var(--color-figma-text)]">
            {tokenPath}
          </span>
          .
        </div>
        {formula ? (
          <div className="text-secondary text-[var(--color-figma-text-tertiary)]">
            Formula{" "}
            <span className="font-mono text-[var(--color-figma-text-secondary)]">
              {formula}
            </span>{" "}
            will be replaced.
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {isMultiMode ? (
          <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
            Modes
          </span>
        ) : null}
        <ul className="flex flex-col">
          {edgeModeNames.map((mode) => {
            const chain = chainsByMode.get(mode);
            const literal =
              chain && chain.terminalKind === "literal"
                ? formatTokenValueForDisplay(
                    chain.terminalType,
                    chain.terminalValue,
                  )
                : chain
                  ? `Cannot resolve (${chain.terminalKind})`
                  : "—";
            const disabled = !chain || chain.terminalKind !== "literal";
            return (
              <li key={mode}>
                <label
                  className={`flex h-7 items-center gap-2 rounded px-1 text-secondary ${
                    disabled
                      ? "text-[var(--color-figma-text-tertiary)]"
                      : "cursor-pointer text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
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
                  {isMultiMode ? (
                    <span
                      className="min-w-0 max-w-[40%] shrink-0 truncate text-[var(--color-figma-text-secondary)]"
                      title={mode}
                    >
                      {mode}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate font-mono">
                    {literal}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
      {errorMessage ? <DialogError message={errorMessage} /> : null}
      <DialogActions
        busy={busy}
        disabled={noneSelected || !everyModeResolves}
        confirmLabel="Detach"
        busyLabel="Detaching…"
        onCancel={onCancel}
        onConfirm={handleConfirm}
      />
    </ContextDialog>
  );
}
