/**
 * ResolverPanel — UI for managing DTCG v2025.10 resolver configs.
 *
 * Shows a list of resolvers, lets users create/delete them, migrate
 * from themes, select modifier contexts, and preview resolved tokens.
 */

import { useState, useCallback } from 'react';
import type { ResolverMeta, ResolverModifierMeta } from '../hooks/useResolvers';
import { ConfirmModal } from './ConfirmModal';

interface ResolverPanelProps {
  serverUrl: string;
  connected: boolean;
  sets: string[];
  resolvers: ResolverMeta[];
  activeResolver: string | null;
  setActiveResolver: (name: string | null) => void;
  resolverInput: Record<string, string>;
  setResolverInput: (input: Record<string, string>) => void;
  activeModifiers: Record<string, ResolverModifierMeta>;
  resolvedTokens: Record<string, { $value: unknown; $type: string }> | null;
  resolverError: string | null;
  loading: boolean;
  fetchResolvers: () => void;
  convertFromThemes: (name?: string) => Promise<unknown>;
  deleteResolver: (name: string) => Promise<void>;
}

export function ResolverPanel({
  serverUrl,
  connected,
  sets,
  resolvers,
  activeResolver,
  setActiveResolver,
  resolverInput,
  setResolverInput,
  activeModifiers,
  resolvedTokens,
  resolverError,
  loading,
  fetchResolvers,
  convertFromThemes,
  deleteResolver,
}: ResolverPanelProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateError, setMigrateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const handleMigrate = useCallback(async () => {
    setMigrating(true);
    setMigrateError(null);
    try {
      await convertFromThemes();
    } catch (err) {
      setMigrateError(err instanceof Error ? err.message : String(err));
    } finally {
      setMigrating(false);
    }
  }, [convertFromThemes]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    setCreateError(null);
    try {
      const body = {
        name: newName.trim(),
        version: '2025.10' as const,
        sets: {
          foundation: {
            description: 'Base token sets',
            sources: sets.slice(0, 1).map(s => ({ $ref: `${s}.tokens.json` })),
          },
        },
        modifiers: {},
        resolutionOrder: [{ $ref: '#/sets/foundation' }],
      };
      const resp = await fetch(`${serverUrl}/api/resolvers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `Server returned ${resp.status}`);
      }
      setNewName('');
      setCreating(false);
      fetchResolvers();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    }
  }, [newName, sets, serverUrl, fetchResolvers]);

  const handleDelete = useCallback(async (name: string) => {
    try {
      await deleteResolver(name);
    } catch {
      // Error handled by hook
    }
    setConfirmDelete(null);
  }, [deleteResolver]);

  const handleModifierChange = useCallback((modName: string, context: string) => {
    setResolverInput({ ...resolverInput, [modName]: context });
  }, [resolverInput, setResolverInput]);

  const resolvedCount = resolvedTokens ? Object.keys(resolvedTokens).length : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-3 py-2 border-b border-[var(--color-figma-border)]">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">
              DTCG Resolvers
            </span>
            <span className="ml-1.5 text-[10px] text-[var(--color-figma-text-tertiary)]">v2025.10</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleMigrate}
              disabled={migrating || !connected}
              className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50 transition-colors"
              title="Convert existing $themes.json to a resolver"
            >
              {migrating ? 'Converting…' : 'From Themes'}
            </button>
            <button
              onClick={() => setCreating(true)}
              className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity"
            >
              + New
            </button>
          </div>
        </div>
        {migrateError && (
          <div className="mt-1 text-[10px] text-red-500">{migrateError}</div>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <div className="shrink-0 px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
              placeholder="Resolver name…"
              autoFocus
              className="flex-1 px-1.5 py-0.5 rounded text-[11px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] outline-none focus:border-[var(--color-figma-accent)]"
            />
            <button onClick={handleCreate} className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white">Create</button>
            <button onClick={() => { setCreating(false); setCreateError(null); }} className="px-2 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)]">Cancel</button>
          </div>
          {createError && <div className="mt-1 text-[10px] text-red-500">{createError}</div>}
        </div>
      )}

      {/* Resolver list */}
      <div className="flex-1 overflow-y-auto">
        {resolvers.length === 0 && !creating && (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)] opacity-40">
              <path d="M8 6L4 12l4 6M16 6l4 6-4 6M13 4l-2 16"/>
            </svg>
            <p className="text-[11px] text-[var(--color-figma-text-secondary)]">
              No resolver configs yet.
            </p>
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)] max-w-[220px]">
              Resolvers let you define how token sets merge based on contextual dimensions
              (brand, mode, density) — replacing per-combination token files with a single config.
            </p>
            <div className="flex gap-1 mt-1">
              <button
                onClick={handleMigrate}
                disabled={migrating || !connected}
                className="px-2 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50"
              >
                Convert from Themes
              </button>
              <button
                onClick={() => setCreating(true)}
                className="px-2 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90"
              >
                Create Resolver
              </button>
            </div>
          </div>
        )}

        {resolvers.map(resolver => {
          const isActive = activeResolver === resolver.name;
          const modNames = Object.keys(resolver.modifiers);

          return (
            <div
              key={resolver.name}
              className={`border-b border-[var(--color-figma-border)] ${
                isActive ? 'bg-[var(--color-figma-bg-secondary)]' : ''
              }`}
            >
              {/* Resolver row */}
              <div
                className="group flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                onClick={() => setActiveResolver(isActive ? null : resolver.name)}
              >
                <svg
                  width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                  className={`shrink-0 text-[var(--color-figma-text-tertiary)] transition-transform ${isActive ? 'rotate-90' : ''}`}
                >
                  <path d="M2 1l4 3-4 3V1z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-[var(--color-figma-text)] truncate">
                    {resolver.name}
                  </div>
                  {resolver.description && (
                    <div className="text-[10px] text-[var(--color-figma-text-tertiary)] truncate">
                      {resolver.description}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {modNames.length > 0 && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-tertiary)]">
                      {modNames.length} modifier{modNames.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(resolver.name); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 text-[var(--color-figma-text-tertiary)] hover:text-red-500 transition-all"
                    title="Delete resolver"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Expanded: modifier controls + preview */}
              {isActive && (
                <div className="px-3 pb-2">
                  {/* Modifier selectors */}
                  {modNames.length > 0 ? (
                    <div className="flex flex-col gap-1.5 mb-2">
                      <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] uppercase tracking-wider">
                        Modifier Inputs
                      </div>
                      {modNames.map(modName => {
                        const mod = resolver.modifiers[modName];
                        const selected = resolverInput[modName] ?? mod.default ?? mod.contexts[0];
                        return (
                          <div key={modName} className="flex items-center gap-2">
                            <label className="text-[10px] text-[var(--color-figma-text-secondary)] w-20 truncate capitalize" title={mod.description || modName}>
                              {modName}
                            </label>
                            <div className="flex-1 flex gap-0.5 flex-wrap">
                              {mod.contexts.map(ctx => (
                                <button
                                  key={ctx}
                                  onClick={() => handleModifierChange(modName, ctx)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
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
                    <div className="text-[10px] text-[var(--color-figma-text-tertiary)] mb-2">
                      No modifiers defined — only base sets will be merged.
                    </div>
                  )}

                  {/* Resolution status */}
                  <div className="rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] px-2 py-1.5">
                    {loading ? (
                      <div className="text-[10px] text-[var(--color-figma-text-tertiary)] animate-pulse">
                        Resolving tokens…
                      </div>
                    ) : resolverError ? (
                      <div className="text-[10px] text-red-500">{resolverError}</div>
                    ) : resolvedTokens ? (
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                          <span className="font-medium text-[var(--color-figma-text)]">{resolvedCount}</span> tokens resolved
                        </div>
                        <div className="text-[9px] text-green-600 flex items-center gap-1">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                          Active
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                        Select modifier contexts to resolve tokens
                      </div>
                    )}
                  </div>

                  {/* Sets info */}
                  {resolver.modifiers && Object.keys(resolver.modifiers).length > 0 && (
                    <div className="mt-2 text-[9px] text-[var(--color-figma-text-tertiary)]">
                      Resolution order merges sets and applies modifier overrides in sequence.
                      Tokens from later entries override earlier ones.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Resolver error banner */}
      {resolverError && !activeResolver && (
        <div className="shrink-0 px-3 py-1.5 bg-red-50 border-t border-red-200">
          <div className="text-[10px] text-red-600">{resolverError}</div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <ConfirmModal
          title="Delete Resolver"
          description={`Delete "${confirmDelete}"? This will remove the .resolver.json file.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
