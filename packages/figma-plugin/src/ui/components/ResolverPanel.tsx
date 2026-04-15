/**
 * ResolverPanel — UI for managing token outputs.
 *
 * `ResolverContent` is the embeddable version (no outer header) used
 * inside ThemeManager. `ResolverPanel` adds a standalone header.
 */

import { useState, useCallback, useMemo } from 'react';
import type {
  ResolverMeta,
  ResolverModifierMeta,
  ResolverSelectionOrigin,
} from '../hooks/useResolvers';
import { ConfirmModal } from './ConfirmModal';
import { Spinner } from './Spinner';
import { useTokenFlatMapContext } from '../contexts/TokenDataContext';
import { formatTokenValueForDisplay } from '../shared/tokenFormatting';
import { swatchBgColor } from '../shared/colorUtils';


export interface ResolverContentProps {
  connected: boolean;
  resolvers: ResolverMeta[];
  resolverLoadErrors?: Record<string, { message: string; at: string }>;
  activeResolver: string | null;
  selectionOrigin?: ResolverSelectionOrigin;
  setActiveResolver: (name: string | null) => void;
  resolverInput: Record<string, string>;
  setResolverInput: (input: Record<string, string>) => void;
  activeModifiers: Record<string, ResolverModifierMeta>;
  resolvedTokens: Record<string, { $value: unknown; $type: string }> | null;
  resolverError: string | null;
  loading: boolean;
  resolversLoading?: boolean;
  fetchResolvers: () => void;
  convertFromThemes: (name?: string) => Promise<unknown>;
  deleteResolver: (name: string) => Promise<void>;
  onSuccess?: (msg: string) => void;
}

export function ResolverContent(props: ResolverContentProps) {
  return <ResolverInner {...props} showHeader={false} />;
}

export function ResolverPanel(props: ResolverContentProps) {
  return <ResolverInner {...props} showHeader />;
}

function formatCountLabel(count: number, label: string) {
  return `${count} ${label}${count === 1 ? '' : 's'}`;
}

function ResolverInner({
  connected,
  resolvers,
  resolverLoadErrors = {},
  activeResolver,
  selectionOrigin = 'none',
  setActiveResolver,
  resolverInput,
  setResolverInput,
  resolvedTokens,
  resolverError,
  loading,
  resolversLoading = false,
  fetchResolvers,
  convertFromThemes,
  deleteResolver,
  onSuccess,
  showHeader,
}: ResolverContentProps & { showHeader: boolean }) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [, setMigrateError] = useState<string | null>(null);

  const handleMigrate = useCallback(async () => {
    setMigrating(true);
    setMigrateError(null);
    try {
      await convertFromThemes(activeResolver ?? undefined);
      onSuccess?.('Generated output from modes');
    } catch (err) {
      setMigrateError(err instanceof Error ? err.message : String(err));
    } finally {
      setMigrating(false);
    }
  }, [activeResolver, convertFromThemes, onSuccess]);

  const handleDelete = useCallback(async (name: string) => {
    await deleteResolver(name);
    setConfirmDelete(null);
    onSuccess?.(`Deleted output "${name}"`);
  }, [deleteResolver, onSuccess]);

  const handleModifierChange = useCallback((modName: string, context: string) => {
    setResolverInput({ ...resolverInput, [modName]: context });
  }, [resolverInput, setResolverInput]);

  const resolvedCount = resolvedTokens ? Object.keys(resolvedTokens).length : 0;
  const currentResolver = useMemo(() => {
    if (!activeResolver) return null;
    return resolvers.find(resolver => resolver.name === activeResolver) ?? null;
  }, [activeResolver, resolvers]);
  const currentResolverStatusLabel = loading
    ? 'Resolving…'
    : resolvedTokens
      ? `${resolvedCount} tokens resolved`
      : 'Preview not loaded yet';
  const { allTokensFlat } = useTokenFlatMapContext();

  const previewEntries = useMemo(() => {
    if (!resolvedTokens) return [];
    const all = Object.entries(resolvedTokens);
    const sorted = [...all].sort(([, a], [, b]) => {
      const rank = (t: string) => t === 'color' ? 0 : t === 'unknown' ? 2 : 1;
      return rank(a.$type) - rank(b.$type);
    });
    return sorted.slice(0, 16).map(([path, entry]) => {
      const rawEntry = allTokensFlat[path];
      const rawValue = rawEntry?.$value;
      const rawStr = rawValue !== undefined ? formatTokenValueForDisplay(rawEntry.$type, rawValue) : null;
      const resolvedStr = formatTokenValueForDisplay(entry.$type, entry.$value);
      const differs = rawStr !== null && rawStr !== resolvedStr;
      return { path, entry, rawStr: differs ? rawStr : null, resolvedStr };
    });
  }, [resolvedTokens, allTokensFlat]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {showHeader ? (
        <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">
                Output setup
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                Choose an output, confirm how mode values map, and preview the resolved tokens.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={handleMigrate}
                disabled={migrating || !connected}
                className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {migrating ? 'Generating…' : 'Generate from modes'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
              {currentResolver ? 'Editing output' : 'Choose output'}
            </div>
            {currentResolver ? (
              <>
                <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[11px] font-semibold text-[var(--color-figma-text)]">
                    {currentResolver.name}
                  </span>
                  <span className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-figma-text-secondary)]">
                    {selectionOrigin === 'restored' ? 'Restored' : 'Selected'}
                  </span>
                </div>
                {currentResolver.description && (
                  <p className="mt-0.5 truncate text-[9px] leading-snug text-[var(--color-figma-text-secondary)]">
                    {currentResolver.description}
                  </p>
                )}
                <p className="mt-0.5 text-[9px] leading-snug text-[var(--color-figma-text-tertiary)]">
                  {selectionOrigin === 'restored'
                    ? 'Restored from your previous session. You can keep it or reset and choose a different output.'
                    : 'This is the output currently driving the preview below.'}
                </p>
                <div className="mt-1 text-[9px] text-[var(--color-figma-text-tertiary)]">
                  {formatCountLabel(Object.keys(currentResolver.modifiers).length, 'mode')}
                  {` · ${currentResolverStatusLabel}`}
                </div>
                {resolverError && (
                  <div className="mt-1 text-[9px] text-[var(--color-figma-error)]">
                    {resolverError}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                  Pick an output below to edit defaults and preview the resolved tokens.
                </p>
                {resolverError && (
                  <div className="mt-1 text-[9px] text-[var(--color-figma-error)]">
                    {resolverError}
                  </div>
                )}
              </>
            )}
          </div>
          {currentResolver ? (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveResolver(null)}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
              >
                {selectionOrigin === 'restored' ? 'Reset selection' : 'Clear selection'}
              </button>
            </div>
          ) : !showHeader ? (
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={handleMigrate}
                disabled={migrating || !connected}
                className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {migrating ? 'Generating…' : 'Generate from modes'}
              </button>
            </div>
          ) : null}
        </div>
        {!showHeader && currentResolver ? (
          <div className="mt-2 flex items-center gap-1">
            <button
              onClick={handleMigrate}
              disabled={migrating || !connected}
              className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {migrating ? 'Generating…' : 'Generate from modes'}
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {resolvers.length > 0 && (
          <div className="border-b border-[var(--color-figma-border)] px-3 py-1.5 text-[9px] uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
            Available outputs
          </div>
        )}
        {resolversLoading && resolvers.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--color-figma-text-secondary)]">
            <Spinner size="md" />
            <span className="text-[11px]">Loading outputs…</span>
          </div>
        )}

        {!resolversLoading && resolvers.length === 0 && Object.keys(resolverLoadErrors).length === 0 && (
          <div className="flex h-full flex-col items-center justify-center px-4 py-6 text-center">
            <p className="max-w-[220px] text-[11px] leading-snug text-[var(--color-figma-text-secondary)]">
              An output defines how modes combine into final tokens.
            </p>
          </div>
        )}

        {Object.entries(resolverLoadErrors).length > 0 && (
          <div className="border-b border-[var(--color-figma-border)] px-3 py-2">
            <div className="text-[9px] uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">
              {formatCountLabel(Object.keys(resolverLoadErrors).length, 'load error')}
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {Object.entries(resolverLoadErrors).map(([name, err]) => (
                <div
                  key={`err:${name}`}
                  className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5"
                  title={`Failed at ${err.at}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[10px] font-medium text-[var(--color-figma-text)]">
                        {name}
                      </div>
                      <div className="mt-0.5 text-[9px] leading-snug text-[var(--color-figma-text-secondary)]">
                        {err.message}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={fetchResolvers}
                      className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {resolvers.map(resolver => {
          const isActive = activeResolver === resolver.name;
          const modNames = Object.keys(resolver.modifiers);
          const selectedCountLabel = formatCountLabel(modNames.length, 'mode');

          return (
            <div
              key={resolver.name}
              className={`border-b border-[var(--color-figma-border)] ${
                isActive ? 'border-l-2 border-l-[var(--color-figma-accent)] bg-[var(--color-figma-bg-secondary)]' : ''
              }`}
            >
              <div className="px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          isActive ? 'bg-[var(--color-figma-accent)]' : 'bg-[var(--color-figma-border)]'
                        }`}
                      />
                      <span className="truncate text-[11px] font-medium text-[var(--color-figma-text)]">
                        {resolver.name}
                      </span>
                      {isActive && (
                        <span className="shrink-0 rounded border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/10 px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-figma-accent)]">
                          Selected
                        </span>
                      )}
                    </div>
                    {resolver.description && (
                      <p className="mt-0.5 truncate text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                        {resolver.description}
                      </p>
                    )}
                    <div className="mt-1 text-[9px] text-[var(--color-figma-text-tertiary)]">
                      {selectedCountLabel}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveResolver(isActive ? null : resolver.name)}
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                      isActive
                        ? 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
                        : 'bg-[var(--color-figma-accent)] text-white hover:opacity-90'
                    }`}
                  >
                    {isActive ? 'Selected' : 'Select'}
                  </button>
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(resolver.name)}
                    className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-figma-error)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {isActive && (
                <div className="border-t border-[var(--color-figma-border)] px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
                        Mode selections
                      </div>
                      <p className="mt-0.5 text-[9px] leading-snug text-[var(--color-figma-text-secondary)]">
                        Choose one value per mode to update the preview below.
                      </p>
                    </div>
                    <div className="shrink-0 text-[9px] text-[var(--color-figma-text-tertiary)]">
                      {loading
                        ? 'Resolving…'
                        : resolverError
                          ? 'Resolution error'
                          : resolvedTokens
                            ? `${resolvedCount} tokens resolved`
                            : 'Pick values to preview'}
                    </div>
                  </div>

                  {modNames.length > 0 ? (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {modNames.map(modName => {
                        const mod = resolver.modifiers[modName];
                        const selected = resolverInput[modName] ?? mod.default ?? mod.contexts[0];
                        return (
                          <div key={modName} className="flex items-center gap-2">
                            <label
                              className="w-16 truncate text-[10px] capitalize text-[var(--color-figma-text-secondary)]"
                              title={mod.description || modName}
                            >
                              {modName}
                            </label>
                            <div className="flex flex-1 flex-wrap gap-0.5">
                              {mod.contexts.map(ctx => (
                                <button
                                  key={ctx}
                                  type="button"
                                  onClick={() => handleModifierChange(modName, ctx)}
                                  className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                                    selected === ctx
                                      ? 'bg-[var(--color-figma-accent)] text-white font-medium'
                                      : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                                  }`}
                                >
                                  {ctx}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
                      This output has no modes. It resolves against the base set only.
                    </div>
                  )}

                  <div className="mt-2 border-t border-[var(--color-figma-border)] pt-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
                          Preview
                        </div>
                        <p className="mt-0.5 text-[9px] leading-snug text-[var(--color-figma-text-secondary)]">
                          First {previewEntries.length} resolved tokens, with raw values crossed out when they change.
                        </p>
                      </div>
                      <div className="shrink-0 text-[9px] text-[var(--color-figma-text-tertiary)]">
                        {resolvedTokens
                          ? previewEntries.length < resolvedCount
                            ? `Showing ${previewEntries.length} of ${resolvedCount}`
                            : `${resolvedCount} total`
                          : 'No preview yet'}
                      </div>
                    </div>

                    {loading ? (
                      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
                        <Spinner size="sm" />
                        Resolving output…
                      </div>
                    ) : resolverError ? (
                      <div className="mt-2 text-[10px] text-[var(--color-figma-error)]">
                        {resolverError}
                      </div>
                    ) : previewEntries.length > 0 ? (
                      <div className="mt-2 flex flex-col divide-y divide-[var(--color-figma-border)] overflow-hidden rounded border border-[var(--color-figma-border)]">
                        {previewEntries.map(({ path, entry, rawStr, resolvedStr }) => {
                          const isColor = entry.$type === 'color' && typeof entry.$value === 'string';
                          const leafName = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1) : path;
                          const parentPath = path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : '';
                          return (
                            <div key={path} className="flex min-w-0 items-center gap-1.5 bg-[var(--color-figma-bg)] px-2 py-0.5">
                              {isColor ? (
                                <div
                                  className="h-3 w-3 shrink-0 rounded-sm border border-[var(--color-figma-border)]"
                                  style={{ backgroundColor: swatchBgColor(entry.$value as string) }}
                                />
                              ) : (
                                <div className="h-3 w-3 shrink-0 rounded-sm border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]" />
                              )}
                              <div className="min-w-0 flex-1">
                                {parentPath && (
                                  <span className="mb-0.5 block truncate text-[8px] leading-none text-[var(--color-figma-text-tertiary)]">
                                    {parentPath}
                                  </span>
                                )}
                                <span className="block truncate text-[10px] leading-none font-medium text-[var(--color-figma-text)]">
                                  {leafName}
                                </span>
                              </div>
                              <div className="shrink-0 max-w-[92px] text-right">
                                {rawStr && (
                                  <div className="mb-0.5 truncate text-[8px] leading-none text-[var(--color-figma-text-tertiary)] line-through">
                                    {rawStr}
                                  </div>
                                )}
                                <div className="truncate font-mono text-[9px] leading-none text-[var(--color-figma-text-secondary)]">
                                  {resolvedStr}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
                        Pick mode values above to populate the preview.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {confirmDelete && (
        <ConfirmModal
          title="Delete output"
          description={`Delete "${confirmDelete}"?`}
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
