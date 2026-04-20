import { useMemo, useState } from "react";
import type { TokenCollection } from "@tokenmanager/core";
import type { TokenMapEntry } from "../../../shared/types";
import { AliasAutocomplete } from "../AliasAutocomplete";
import { ModeValueEditor } from "./ModeValueEditor";
import { summarizeModeCoverage } from "./modeCoverage";
import { getTokenCollection } from "../../shared/collectionModeUtils";

const RICH_EDITOR_TYPES = new Set([
  "color",
  "dimension",
  "number",
  "boolean",
  "duration",
]);

export interface ModeValuesEditorProps {
  collectionId: string;
  collections: TokenCollection[];
  modeValues: Record<string, Record<string, unknown>>;
  onModeValuesChange: (modes: Record<string, Record<string, unknown>>) => void;
  tokenType: string;
  aliasMode: boolean;
  reference: string;
  value: unknown;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  selectedModes?: Record<string, string>;
}

function updateCollectionMode(
  modeValues: Record<string, Record<string, unknown>>,
  collectionId: string,
  modeName: string,
  value: unknown,
): Record<string, Record<string, unknown>> {
  return {
    ...modeValues,
    [collectionId]: {
      ...(modeValues[collectionId] ?? {}),
      [modeName]: value,
    },
  };
}

function clearCollectionMode(
  modeValues: Record<string, Record<string, unknown>>,
  collectionId: string,
  modeName: string,
): Record<string, Record<string, unknown>> {
  const currentCollection = { ...(modeValues[collectionId] ?? {}) };
  delete currentCollection[modeName];
  const next = { ...modeValues };
  if (Object.keys(currentCollection).length === 0) {
    delete next[collectionId];
  } else {
    next[collectionId] = currentCollection;
  }
  return next;
}

function isAliasValue(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("{");
}

export function ModeValuesEditor({
  collectionId,
  collections,
  modeValues,
  onModeValuesChange,
  tokenType,
  aliasMode,
  reference,
  value,
  allTokensFlat = {},
  pathToCollectionId = {},
  selectedModes = {},
}: ModeValuesEditorProps) {
  const [autocompleteModeKey, setAutocompleteModeKey] = useState<string | null>(
    null,
  );
  const [aliasInputKeys, setAliasInputKeys] = useState<Set<string>>(new Set());

  const collectionDefinition = useMemo(
    () => getTokenCollection(collections, collectionId),
    [collections, collectionId],
  );
  const collectionDimensions = collectionDefinition ? [collectionDefinition] : [];
  const coverage = summarizeModeCoverage(collectionDimensions, modeValues);
  const collectionCoverage = coverage.collections[0] ?? null;
  const hasTokens = Object.keys(allTokensFlat).length > 0;
  const useRichEditor = RICH_EDITOR_TYPES.has(tokenType);

  if (!collectionDefinition || collectionDefinition.modes.length <= 1) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-[var(--color-figma-text)]">
            Mode values
          </p>
          <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
            Set a different value for each of this collection&apos;s modes.
          </p>
        </div>
        {collectionCoverage ? (
          <div className="flex shrink-0 flex-col items-end gap-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
            <span>
              {collectionCoverage.filledCount}/{collectionCoverage.optionCount} filled
            </span>
            {collectionCoverage.missingCount > 0 ? (
              <span>{collectionCoverage.missingCount} missing</span>
            ) : null}
          </div>
        ) : null}
      </div>

      {collectionCoverage && collectionCoverage.missingCount > 0 ? (
        <div className="rounded border border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/10 px-2 py-1 text-[10px] text-[var(--color-figma-text)]">
          {collectionCoverage.missingCount} mode value
          {collectionCoverage.missingCount === 1 ? "" : "s"} not yet defined
          in {collectionDefinition.id}.
        </div>
      ) : null}

      <div className="divide-y divide-[var(--color-figma-border)]/50 overflow-hidden rounded-md border border-[var(--color-figma-border)]/65">
        {collectionDefinition.modes.map((option) => {
          const modeValue = modeValues[collectionId]?.[option.name] ?? "";
          const modeValueString =
            typeof modeValue === "string" ? modeValue : "";
          const autocompleteKey = `${collectionId}:${option.name}`;
          const showingAutocomplete = autocompleteModeKey === autocompleteKey;
          const baseValueString = aliasMode
            ? reference
            : String(value ?? "");
          const isOverridden =
            modeValue !== "" && modeValueString !== baseValueString;
          const isAlias = isAliasValue(modeValue);
          const forceAliasInput = aliasInputKeys.has(autocompleteKey);
          const showRichEditor =
            useRichEditor &&
            !isAlias &&
            !forceAliasInput &&
            !showingAutocomplete;
          const isSelectedMode = selectedModes[collectionId] === option.name;

          return (
            <div
              key={option.name}
              className={`group flex items-center gap-2 px-2.5 py-1.5 ${
                isOverridden && isSelectedMode
                  ? "bg-[var(--color-figma-accent)]/12"
                  : isOverridden
                    ? "bg-[var(--color-figma-accent)]/8"
                    : isSelectedMode
                      ? "bg-[var(--color-figma-accent)]/5"
                      : ""
              }`}
            >
              <span
                className="w-[92px] shrink-0 truncate text-[10px] font-medium text-[var(--color-figma-text)]"
                title={option.name}
              >
                {option.name}
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-1">
                {showRichEditor ? (
                  <div className="min-w-0 flex-1">
                    <ModeValueEditor
                      tokenType={tokenType}
                      value={modeValue === "" ? undefined : modeValue}
                      onChange={(nextValue) =>
                        onModeValuesChange(
                          updateCollectionMode(
                            modeValues,
                            collectionId,
                            option.name,
                            nextValue,
                          ),
                        )
                      }
                      allTokensFlat={allTokensFlat}
                      pathToCollectionId={pathToCollectionId}
                    />
                  </div>
                ) : (
                  <div className="relative min-w-0 flex-1">
                    <input
                      type="text"
                      value={modeValueString}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        onModeValuesChange(
                          updateCollectionMode(
                            modeValues,
                            collectionId,
                            option.name,
                            nextValue,
                          ),
                        );
                        if (hasTokens) {
                          const hasOpenAlias =
                            nextValue.includes("{") && !nextValue.endsWith("}");
                          setAutocompleteModeKey(
                            hasOpenAlias ? autocompleteKey : null,
                          );
                        }
                      }}
                      onFocus={() => {
                        if (
                          hasTokens &&
                          modeValueString.includes("{") &&
                          !modeValueString.endsWith("}")
                        ) {
                          setAutocompleteModeKey(autocompleteKey);
                        }
                      }}
                      onBlur={() =>
                        setTimeout(
                          () =>
                            setAutocompleteModeKey((current) =>
                              current === autocompleteKey ? null : current,
                            ),
                          150,
                        )
                      }
                      onKeyDown={(event) => {
                        if (hasTokens && event.key === "{") {
                          setAutocompleteModeKey(autocompleteKey);
                        }
                      }}
                      placeholder={
                        aliasMode
                          ? reference || "value or {alias}"
                          : String(
                              value !== "" && value !== undefined
                                ? value
                                : "value or {alias}",
                            )
                      }
                      className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-secondary)]/40 focus-visible:border-[var(--color-figma-accent)]"
                    />
                    {showingAutocomplete ? (
                      <AliasAutocomplete
                        query={
                          modeValueString.includes("{")
                            ? modeValueString
                                .slice(modeValueString.lastIndexOf("{") + 1)
                                .replace(/\}.*$/, "")
                            : ""
                        }
                        allTokensFlat={allTokensFlat}
                        pathToCollectionId={pathToCollectionId}
                        filterType={tokenType}
                        onSelect={(path) => {
                          onModeValuesChange(
                            updateCollectionMode(
                              modeValues,
                              collectionId,
                              option.name,
                              `{${path}}`,
                            ),
                          );
                          setAutocompleteModeKey(null);
                        }}
                        onClose={() => setAutocompleteModeKey(null)}
                      />
                    ) : null}
                  </div>
                )}

                <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  {useRichEditor && hasTokens ? (
                    <button
                      type="button"
                      onClick={() =>
                        setAliasInputKeys((previous) => {
                          const next = new Set(previous);
                          if (next.has(autocompleteKey)) {
                            next.delete(autocompleteKey);
                          } else {
                            next.add(autocompleteKey);
                          }
                          return next;
                        })
                      }
                      title={
                        forceAliasInput || isAlias
                          ? "Switch to value editor"
                          : "Switch to alias reference"
                      }
                      className="rounded p-0.5 text-[var(--color-figma-text-tertiary)] transition-colors hover:text-[var(--color-figma-accent)]"
                    >
                      <svg
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
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    </button>
                  ) : null}
                  {modeValue !== "" ? (
                    <button
                      type="button"
                      onClick={() =>
                        onModeValuesChange(
                          clearCollectionMode(modeValues, collectionId, option.name),
                        )
                      }
                      title={`Clear ${option.name} override`}
                      aria-label={`Clear ${option.name} override`}
                      className="shrink-0 rounded p-0.5 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-error)]/10 hover:text-[var(--color-figma-error)]"
                    >
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  ) : null}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
