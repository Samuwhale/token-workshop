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
          onSuccess?.("Generated handoff from modes");
        }
      } catch (error) {
        setSyncError(
          error instanceof Error ? error.message : "Failed to generate handoff",
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
            Back to review
          </button>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-[var(--color-figma-text)]">
                Handoff output
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                Generate output for the current theme state.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void syncGeneratedOutput(true)}
              disabled={syncing || !connected}
              className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {syncing
                ? "Generating..."
                : currentResolver
                  ? "Refresh handoff"
                  : "Generate handoff"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="space-y-3 px-3 py-3">
          <section className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
            <div className="border-b border-[var(--color-figma-border)] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-medium text-[var(--color-figma-text)]">
                    Handoff resolver
                  </div>
                  <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                    One generated resolver is used for the handoff.
                  </p>
                </div>
                {loading ? (
                  <div className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                    <Spinner size="sm" />
                    Generating...
                  </div>
                ) : null}
              </div>
            </div>
            <div className="px-3 py-3">
              {currentResolver ? (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-[var(--color-figma-text)]">
                      {currentResolver.name}
                    </div>
                    <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                      {Object.keys(currentResolver.modifiers).length} mode
                      {Object.keys(currentResolver.modifiers).length === 1 ? "" : "s"}
                      {resolvedTokens ? ` · ${resolvedCount} tokens resolved` : ""}
                    </div>
                  </div>
                  {currentResolver.description ? (
                    <div className="max-w-[160px] text-right text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                      {currentResolver.description}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  Generate the handoff resolver to inspect the current state.
                </div>
              )}
              {syncError ? (
                <div className="mt-2 text-[10px] text-[var(--color-figma-error)]">
                  {syncError}
                </div>
              ) : null}
            </div>
          </section>

          <details className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
            <summary className="[&::-webkit-details-marker]:hidden flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
              <div>
                <div className="text-[11px] font-medium text-[var(--color-figma-text)]">
                  Resolver details
                </div>
                <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                  Inspect the generated handoff resolver metadata.
                </p>
              </div>
              <div className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                {currentResolver
                  ? `${Object.keys(currentResolver.modifiers).length} mode${
                      Object.keys(currentResolver.modifiers).length === 1
                        ? ""
                        : "s"
                    }`
                  : "Collapsed"}
              </div>
            </summary>
            <div className="border-t border-[var(--color-figma-border)] px-3 py-3">
              {currentResolver ? (
                <div className="space-y-2 text-[10px] text-[var(--color-figma-text-secondary)]">
                  {currentResolver.description ? (
                    <p className="leading-snug">{currentResolver.description}</p>
                  ) : null}
                  {!currentResolverIsActive && !syncing ? (
                    <p className="leading-snug">
                      Refresh the handoff to align it with the current theme state.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  Generate the handoff resolver to inspect the current state.
                </div>
              )}
            </div>
          </details>

          {currentResolver ? (
            <details className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
              <summary className="[&::-webkit-details-marker]:hidden flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
                <div>
                  <div className="text-[11px] font-medium text-[var(--color-figma-text)]">
                    Current selections
                  </div>
                  <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                    View the selections that feed the generated output.
                  </p>
                </div>
                <div className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                  {selectedContexts.length} active
                </div>
              </summary>
              <div className="border-t border-[var(--color-figma-border)] px-3 py-3">
                {selectedContexts.length > 0 ? (
                  <div className="space-y-2">
                    {selectedContexts.map(({ modifierName, selected }) => (
                      <div
                        key={modifierName}
                        className="rounded border border-[var(--color-figma-border)] px-2.5 py-2 text-[10px]"
                      >
                        <div className="truncate text-[var(--color-figma-text-secondary)]">
                          {modifierName}
                        </div>
                        <div className="truncate font-medium text-[var(--color-figma-text)]">
                          {selected || "No selection"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    This output has no modes. It resolves against base token values only.
                  </div>
                )}
              </div>
            </details>
          ) : null}

          <details className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
            <summary className="[&::-webkit-details-marker]:hidden flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
              <div>
                <div className="text-[11px] font-medium text-[var(--color-figma-text)]">
                  Resolved samples
                </div>
                <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                  Inspect a small sample of resolved token output.
                </p>
              </div>
              <div className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                {resolvedTokens
                  ? previewEntries.length < resolvedCount
                    ? `Showing ${previewEntries.length} of ${resolvedCount}`
                    : `${resolvedCount} total`
                  : "No preview yet"}
              </div>
            </summary>
            <div className="border-t border-[var(--color-figma-border)] px-3 py-3">
              {loading ? (
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                  <Spinner size="sm" />
                  Resolving handoff...
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
                  Generate the handoff to inspect the resolved token result.
                </div>
              )}
            </div>
          </details>
        </div>
      </div>
    </>
  );
}
