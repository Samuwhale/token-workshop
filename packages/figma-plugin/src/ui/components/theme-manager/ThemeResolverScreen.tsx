import { useCallback, useEffect, useMemo, useState } from "react";
import type { ResolverContentProps } from "../resolverTypes";
import { Spinner } from "../Spinner";
import { useTokenFlatMapContext } from "../../contexts/TokenDataContext";
import { formatTokenValueForDisplay } from "../../shared/tokenFormatting";
import { swatchBgColor } from "../../shared/colorUtils";

const THEME_OUTPUT_RESOLVER_NAME = "theme-resolver";

interface ThemeResolverScreenProps {
  resolverState: ResolverContentProps;
  onBack: () => void;
  onSuccess?: (message: string) => void;
}

export function ThemeResolverScreen({
  resolverState,
  onBack,
  onSuccess,
}: ThemeResolverScreenProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const { allTokensFlat } = useTokenFlatMapContext();
  const { connected, convertFromThemes, resolverInput } = resolverState;

  const currentResolver = useMemo(
    () =>
      resolverState.resolvers.find(
        (resolver) => resolver.name === THEME_OUTPUT_RESOLVER_NAME,
      ) ?? null,
    [resolverState.resolvers],
  );
  const currentResolverIsActive =
    resolverState.activeResolver === THEME_OUTPUT_RESOLVER_NAME;
  const resolvedTokens = currentResolverIsActive
    ? resolverState.resolvedTokens
    : null;
  const resolverError = currentResolverIsActive
    ? resolverState.resolverError
    : null;
  const loading = syncing || (currentResolverIsActive && resolverState.loading);
  const resolvedCount = resolvedTokens ? Object.keys(resolvedTokens).length : 0;
  const selectedContexts = useMemo(() => {
    if (!currentResolver) return [];
    return Object.entries(currentResolver.modifiers).map(
      ([modifierName, modifier]) => ({
        modifierName,
        description: modifier.description,
        selected:
          resolverInput[modifierName] ??
          modifier.default ??
          modifier.contexts[0] ??
          "",
      }),
    );
  }, [currentResolver, resolverInput]);

  const previewEntries = useMemo(() => {
    if (!resolvedTokens) return [];
    const all = Object.entries(resolvedTokens);
    const sorted = [...all].sort(([, left], [, right]) => {
      const rank = (type: string) =>
        type === "color" ? 0 : type === "unknown" ? 2 : 1;
      return rank(left.$type) - rank(right.$type);
    });
    return sorted.slice(0, 16).map(([path, entry]) => {
      const rawEntry = allTokensFlat[path];
      const rawValue = rawEntry?.$value;
      const rawStr =
        rawValue !== undefined
          ? formatTokenValueForDisplay(rawEntry.$type, rawValue)
          : null;
      const resolvedStr = formatTokenValueForDisplay(entry.$type, entry.$value);
      return {
        path,
        entry,
        rawStr: rawStr !== resolvedStr ? rawStr : null,
        resolvedStr,
      };
    });
  }, [allTokensFlat, resolvedTokens]);

  const syncGeneratedOutput = useCallback(
    async (showSuccessToast: boolean) => {
      setSyncing(true);
      setSyncError(null);
      try {
        await convertFromThemes(THEME_OUTPUT_RESOLVER_NAME);
        if (showSuccessToast) {
          onSuccess?.("Generated output from modes");
        }
      } catch (error) {
        setSyncError(
          error instanceof Error ? error.message : "Failed to generate output",
        );
      } finally {
        setSyncing(false);
      }
    },
    [convertFromThemes, onSuccess],
  );

  useEffect(() => {
    void syncGeneratedOutput(false);
  }, [syncGeneratedOutput]);

  return (
    <>
      <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <div className="px-3 py-2.5">
          <button
            onClick={onBack}
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
            Back to theme setup
          </button>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
                Theme setup / Output setup
              </div>
              <div className="mt-0.5 text-[12px] font-semibold text-[var(--color-figma-text)]">
                Review generated output
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                This preview is generated directly from canonical inline mode data. Regenerate it after changing axes or token mode values.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void syncGeneratedOutput(true)}
              disabled={syncing || !connected}
              className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {syncing ? "Generating..." : currentResolver ? "Regenerate" : "Generate output"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="space-y-3 px-3 py-3">
          <section className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
            <div className="border-b border-[var(--color-figma-border)] px-3 py-2">
              <div className="text-[11px] font-medium text-[var(--color-figma-text)]">
                Generated resolver
              </div>
              <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                Theme output uses a single generated resolver. Arbitrary resolver files are not part of this workflow.
              </p>
            </div>
            <div className="px-3 py-3">
              {currentResolver ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-medium text-[var(--color-figma-text)]">
                        {currentResolver.name}
                      </div>
                      <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                        {Object.keys(currentResolver.modifiers).length} mode
                        {Object.keys(currentResolver.modifiers).length === 1 ? "" : "s"}
                        {resolvedTokens ? ` · ${resolvedCount} tokens resolved` : ""}
                      </div>
                    </div>
                    {loading ? (
                      <div className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                        <Spinner size="sm" />
                        Generating...
                      </div>
                    ) : null}
                  </div>
                  {currentResolver.description ? (
                    <p className="mt-2 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                      {currentResolver.description}
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  Generate the output resolver to preview theme output.
                </div>
              )}
              {syncError ? (
                <div className="mt-2 text-[10px] text-[var(--color-figma-error)]">
                  {syncError}
                </div>
              ) : null}
            </div>
          </section>

          {currentResolver ? (
            <section className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
              <div className="border-b border-[var(--color-figma-border)] px-3 py-2">
                <div className="text-[11px] font-medium text-[var(--color-figma-text)]">
                  Current theme selection
                </div>
                <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                  Generated output follows the current theme state. Change selections in Themes or Inspect, then regenerate output.
                </p>
              </div>
              <div className="space-y-2 px-3 py-3">
                {selectedContexts.length > 0 ? (
                  selectedContexts.map(({ modifierName, description, selected }) => (
                    <div
                      key={modifierName}
                      className="flex items-center justify-between gap-3 rounded border border-[var(--color-figma-border)] px-2.5 py-2"
                    >
                      <div className="min-w-0">
                        <div
                          className="truncate text-[10px] text-[var(--color-figma-text-secondary)]"
                          title={description || modifierName}
                        >
                          {modifierName}
                        </div>
                        <div className="truncate text-[11px] font-medium text-[var(--color-figma-text)]">
                          {selected || "No selection"}
                        </div>
                      </div>
                      <div className="shrink-0 text-[9px] text-[var(--color-figma-text-tertiary)]">
                        Generated
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    This output has no modes. It resolves against base token values only.
                  </div>
                )}
                {!currentResolverIsActive && !syncing ? (
                  <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    Generate output to refresh the generated preview for the current theme state.
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
            <div className="border-b border-[var(--color-figma-border)] px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="text-[11px] font-medium text-[var(--color-figma-text)]">
                    Preview
                  </div>
                  <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                    Generated token output for the selected mode combination.
                  </p>
                </div>
                <div className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                  {resolvedTokens
                    ? previewEntries.length < resolvedCount
                      ? `Showing ${previewEntries.length} of ${resolvedCount}`
                      : `${resolvedCount} total`
                    : "No preview yet"}
                </div>
              </div>
            </div>
            <div className="px-3 py-3">
              {loading ? (
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                  <Spinner size="sm" />
                  Resolving generated output...
                </div>
              ) : resolverError ? (
                <div className="text-[10px] text-[var(--color-figma-error)]">
                  {resolverError}
                </div>
              ) : previewEntries.length > 0 ? (
                <div className="flex flex-col divide-y divide-[var(--color-figma-border)] overflow-hidden rounded border border-[var(--color-figma-border)]">
                  {previewEntries.map(({ path, entry, rawStr, resolvedStr }) => {
                    const isColor =
                      entry.$type === "color" && typeof entry.$value === "string";
                    const leafName = path.includes(".")
                      ? path.slice(path.lastIndexOf(".") + 1)
                      : path;
                    const parentPath = path.includes(".")
                      ? path.slice(0, path.lastIndexOf("."))
                      : "";
                    return (
                      <div
                        key={path}
                        className="flex min-w-0 items-center gap-1.5 bg-[var(--color-figma-bg)] px-2 py-0.5"
                      >
                        {isColor ? (
                          <div
                            className="h-3 w-3 shrink-0 rounded-sm border border-[var(--color-figma-border)]"
                            style={{
                              backgroundColor: swatchBgColor(
                                entry.$value as string,
                              ),
                            }}
                          />
                        ) : (
                          <div className="h-3 w-3 shrink-0 rounded-sm border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]" />
                        )}
                        <div className="min-w-0 flex-1">
                          {parentPath ? (
                            <span className="mb-0.5 block truncate text-[8px] leading-none text-[var(--color-figma-text-tertiary)]">
                              {parentPath}
                            </span>
                          ) : null}
                          <span className="block truncate text-[10px] font-medium leading-none text-[var(--color-figma-text)]">
                            {leafName}
                          </span>
                        </div>
                        <div className="max-w-[92px] shrink-0 text-right">
                          {rawStr ? (
                            <div className="mb-0.5 truncate text-[8px] leading-none text-[var(--color-figma-text-tertiary)] line-through">
                              {rawStr}
                            </div>
                          ) : null}
                          <div className="truncate font-mono text-[9px] leading-none text-[var(--color-figma-text-secondary)]">
                            {resolvedStr}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  Generate output to inspect the resolved token result.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
