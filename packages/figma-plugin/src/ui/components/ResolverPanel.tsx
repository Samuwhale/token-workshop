/**
 * ResolverPanel — UI for managing DTCG v2025.10 output configs.
 *
 * Shows a list of configs, lets users create/delete them, migrate
 * from modes, select options, and preview resolved tokens.
 *
 * `ResolverContent` is the embeddable version (no outer header) used
 * inside ThemeManager's advanced mode. `ResolverPanel` adds a standalone
 * header.
 */

import { useState, useCallback, useMemo } from 'react';
import type { ResolverFile } from '@tokenmanager/core';
import type { ResolverMeta, ResolverModifierMeta } from '../hooks/useResolvers';
import { ConfirmModal } from './ConfirmModal';
import { apiFetch } from '../shared/apiFetch';
import { Spinner } from './Spinner';
import { useTokenFlatMapContext } from '../contexts/TokenDataContext';
import { formatTokenValueForDisplay } from '../shared/tokenFormatting';
import { swatchBgColor } from '../shared/colorUtils';
import { InlineBanner } from './InlineBanner';

export interface ResolverContentProps {
  serverUrl: string;
  connected: boolean;
  sets: string[];
  resolvers: ResolverMeta[];
  resolverLoadErrors?: Record<string, { message: string; at: string }>;
  activeResolver: string | null;
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
  getResolverFile?: (name: string) => Promise<ResolverFile>;
  updateResolver?: (name: string, file: ResolverFile) => Promise<void>;
  onSuccess?: (msg: string) => void;
}

export function ResolverContent(props: ResolverContentProps) {
  return <ResolverInner {...props} showHeader={false} />;
}

export function ResolverPanel(props: ResolverContentProps) {
  return <ResolverInner {...props} showHeader />;
}

interface EditFormState {
  description: string;
  modifiers: Record<string, { defaultContext: string }>;
}

function ResolverInner({
  serverUrl,
  connected,
  sets,
  resolvers,
  resolverLoadErrors = {},
  activeResolver,
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
  getResolverFile,
  updateResolver,
  onSuccess,
  showHeader: _showHeader,
}: ResolverContentProps & { showHeader: boolean }) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [, setMigrateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingResolver, setEditingResolver] = useState<string | null>(null);
  const [editFile, setEditFile] = useState<ResolverFile | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  const handleMigrate = useCallback(async () => {
    setMigrating(true);
    setMigrateError(null);
    try {
      await convertFromThemes();
      onSuccess?.('Converted modes to output config');
    } catch (err) {
      setMigrateError(err instanceof Error ? err.message : String(err));
    } finally {
      setMigrating(false);
    }
  }, [convertFromThemes, onSuccess]);

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
      await apiFetch(`${serverUrl}/api/resolvers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const created = newName.trim();
      setNewName('');
      setCreating(false);
      fetchResolvers();
      onSuccess?.(`Created output config "${created}"`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    }
  }, [newName, sets, serverUrl, fetchResolvers, onSuccess]);

  const handleDelete = useCallback(async (name: string) => {
    await deleteResolver(name);
    setConfirmDelete(null);
    onSuccess?.(`Deleted output config "${name}"`);
  }, [deleteResolver, onSuccess]);

  const handleModifierChange = useCallback((modName: string, context: string) => {
    setResolverInput({ ...resolverInput, [modName]: context });
  }, [resolverInput, setResolverInput]);

  const handleEditClick = useCallback(async (name: string) => {
    if (!getResolverFile) return;
    setEditingResolver(name);
    setEditError(null);
    setEditFile(null);
    setEditForm(null);
    setEditLoading(true);
    try {
      const file = await getResolverFile(name);
      setEditFile(file);
      const modifiers: EditFormState['modifiers'] = {};
      if (file.modifiers) {
        for (const [modName, mod] of Object.entries(file.modifiers)) {
          const contexts = Object.keys(mod.contexts);
          modifiers[modName] = {
            defaultContext: mod.default ?? contexts[0] ?? '',
          };
        }
      }
      setEditForm({
        description: file.description ?? '',
        modifiers,
      });
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err));
    } finally {
      setEditLoading(false);
    }
  }, [getResolverFile]);

  const handleEditSave = useCallback(async () => {
    if (!editingResolver || !editFile || !editForm || !updateResolver) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const updatedModifiers: ResolverFile['modifiers'] = editFile.modifiers
        ? Object.fromEntries(
            Object.entries(editFile.modifiers).map(([modName, mod]) => {
              const formMod = editForm.modifiers[modName];
              const updatedMod = { ...mod };
              if (formMod?.defaultContext) {
                updatedMod.default = formMod.defaultContext;
              }
              return [modName, updatedMod];
            }),
          )
        : undefined;
      const updatedFile: ResolverFile = {
        ...editFile,
        description: editForm.description || undefined,
        modifiers: updatedModifiers,
      };
      await updateResolver(editingResolver, updatedFile);
      onSuccess?.(`Saved output config "${editingResolver}"`);
      setEditingResolver(null);
      setEditFile(null);
      setEditForm(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err));
    } finally {
      setEditSaving(false);
    }
  }, [editingResolver, editFile, editForm, updateResolver, onSuccess]);

  const handleEditCancel = useCallback(() => {
    setEditingResolver(null);
    setEditFile(null);
    setEditForm(null);
    setEditError(null);
  }, []);

  const resolvedCount = resolvedTokens ? Object.keys(resolvedTokens).length : 0;

  const { allTokensFlat } = useTokenFlatMapContext();

  const previewEntries = useMemo(() => {
    if (!resolvedTokens) return [];
    const all = Object.entries(resolvedTokens);
    const sorted = [...all].sort(([, a], [, b]) => {
      const rank = (t: string) => t === 'color' ? 0 : t === 'unknown' ? 2 : 1;
      return rank(a.$type) - rank(b.$type);
    });
    return sorted.slice(0, 8).map(([path, entry]) => {
      const rawEntry = allTokensFlat[path];
      const rawValue = rawEntry?.$value;
      const rawStr = rawValue !== undefined ? formatTokenValueForDisplay(rawEntry.$type, rawValue) : null;
      const resolvedStr = formatTokenValueForDisplay(entry.$type, entry.$value);
      const differs = rawStr !== null && rawStr !== resolvedStr;
      return { path, entry, rawStr: differs ? rawStr : null, resolvedStr };
    });
  }, [resolvedTokens, allTokensFlat]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-3 py-2 border-b border-[var(--color-figma-border)]">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">
            Output configs
          </span>
          <button
            onClick={() => setCreating(true)}
            className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity"
          >
            + New
          </button>
        </div>
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
              placeholder="Config name…"
              autoFocus
              className="flex-1 px-1.5 py-0.5 rounded text-[11px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
            />
            <button onClick={handleCreate} className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white">Create</button>
            <button onClick={() => { setCreating(false); setCreateError(null); }} className="px-2 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)]">Cancel</button>
          </div>
          {createError && <div className="mt-1 text-[10px] text-red-500">{createError}</div>}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {resolversLoading && resolvers.length === 0 && !creating && (
          <div className="flex flex-col h-full items-center justify-center gap-2 text-[var(--color-figma-text-secondary)]">
            <Spinner size="md" />
            <span className="text-[11px]">Loading output configs…</span>
          </div>
        )}

        {/* Empty state */}
        {!resolversLoading && resolvers.length === 0 && Object.keys(resolverLoadErrors).length === 0 && !creating && (
          <div className="flex flex-col items-center justify-center h-full px-3 py-3 text-center gap-3">
            <p className="text-[11px] font-medium text-[var(--color-figma-text)]">No output configs</p>
            <div className="flex flex-col gap-1.5 w-full max-w-[240px]">
              <button
                onClick={() => setCreating(true)}
                className="flex items-center justify-center gap-2 px-2.5 py-1.5 rounded border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] text-[11px] font-medium hover:bg-[var(--color-figma-accent)]/10 transition-colors"
              >
                Create output config
              </button>
              <button
                onClick={handleMigrate}
                disabled={migrating || !connected}
                className="text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] disabled:opacity-40 transition-colors"
              >
                {migrating ? 'Converting…' : 'or convert from existing modes'}
              </button>
            </div>
          </div>
        )}

        {/* Load errors */}
        {Object.entries(resolverLoadErrors).map(([name, err]) => (
          <div
            key={`err:${name}`}
            className="border-b border-[var(--color-figma-border)] px-3 py-2"
            title={`Failed at ${err.at}`}
          >
            <div className="flex items-start gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-amber-500" aria-hidden="true">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-[var(--color-figma-text)] truncate">{name}</div>
                <div className="text-[10px] text-amber-600 mt-0.5 leading-snug">{err.message}</div>
                <div className="text-[9px] text-[var(--color-figma-text-tertiary)] mt-0.5">Failed to load — fix the file to use this output config</div>
              </div>
            </div>
          </div>
        ))}

        {/* Resolver rows */}
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
                  {getResolverFile && updateResolver && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditClick(resolver.name); }}
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 p-0.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-all"
                      title="Edit output config"
                      aria-label="Edit output config"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(resolver.name); }}
                    className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 p-0.5 rounded hover:bg-red-100 text-[var(--color-figma-text-tertiary)] hover:text-red-500 transition-all"
                    title="Delete output config"
                    aria-label="Delete output config"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Edit form */}
              {editingResolver === resolver.name && (
                <div className="px-3 pb-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
                  {editLoading ? (
                    <div className="py-3 text-[10px] text-[var(--color-figma-text-tertiary)] animate-pulse">Loading…</div>
                  ) : editForm ? (
                    <div className="flex flex-col gap-2 pt-2">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Description</label>
                        <input
                          type="text"
                          value={editForm.description}
                          onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                          placeholder="Optional description…"
                          className="px-1.5 py-0.5 rounded text-[11px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                        />
                      </div>

                      {Object.keys(editForm.modifiers).length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          {Object.entries(editForm.modifiers).map(([modName, modEdit]) => {
                            const resolverMeta = resolvers.find(r => r.name === resolver.name);
                            const contexts = resolverMeta?.modifiers[modName]?.contexts ?? [];
                            if (contexts.length === 0) return null;
                            return (
                              <div key={modName} className="flex items-center gap-2">
                                <label className="text-[10px] text-[var(--color-figma-text-secondary)] w-16 truncate capitalize" title={modName}>
                                  {modName}
                                </label>
                                <div className="flex-1 flex gap-0.5 flex-wrap">
                                  {contexts.map(ctx => (
                                    <button
                                      key={ctx}
                                      onClick={() => setEditForm({
                                        ...editForm,
                                        modifiers: { ...editForm.modifiers, [modName]: { defaultContext: ctx } },
                                      })}
                                      className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                                        modEdit.defaultContext === ctx
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
                      )}

                      {editError && <div className="text-[10px] text-red-500">{editError}</div>}

                      <div className="flex items-center gap-1 justify-end pt-0.5">
                        <button
                          onClick={handleEditCancel}
                          className="px-2 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleEditSave}
                          disabled={editSaving}
                          className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                        >
                          {editSaving ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : editError ? (
                    <div className="py-2 text-[10px] text-red-500">{editError}</div>
                  ) : null}
                </div>
              )}

              {/* Expanded: mode controls + preview */}
              {isActive && editingResolver !== resolver.name && (
                <div className="px-3 pb-2">
                  {modNames.length > 0 ? (
                    <div className="flex flex-col gap-1.5 mb-2">
                      {modNames.map(modName => {
                        const mod = resolver.modifiers[modName];
                        const selected = resolverInput[modName] ?? mod.default ?? mod.contexts[0];
                        return (
                          <div key={modName} className="flex items-center gap-2">
                            <label className="text-[10px] text-[var(--color-figma-text-secondary)] w-16 truncate capitalize" title={mod.description || modName}>
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
                      No modes defined — only base sets will be merged.
                    </div>
                  )}

                  {/* Resolution status */}
                  <div className="rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] px-2 py-1.5">
                    {loading ? (
                      <InlineBanner variant="loading" icon={<Spinner size="sm" />} className="border-0 bg-transparent px-0 py-0 text-[10px]">
                        Resolving tokens…
                      </InlineBanner>
                    ) : resolverError ? (
                      <InlineBanner variant="error" className="border-0 bg-transparent px-0 py-0 text-[10px]">
                        {resolverError}
                      </InlineBanner>
                    ) : resolvedTokens ? (
                      <div className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="text-[var(--color-figma-text-secondary)]">
                          <span className="font-medium text-[var(--color-figma-text)]">{resolvedCount}</span> tokens resolved
                        </span>
                      </div>
                    ) : (
                      <InlineBanner variant="info" className="border-0 bg-transparent px-0 py-0 text-[10px]">
                        Select mode options to resolve tokens
                      </InlineBanner>
                    )}
                  </div>

                  {/* Resolved preview */}
                  {previewEntries.length > 0 && !loading && (
                    <div className="mt-2">
                      <div className="flex flex-col divide-y divide-[var(--color-figma-border)] rounded border border-[var(--color-figma-border)] overflow-hidden">
                        {previewEntries.map(({ path, entry, rawStr, resolvedStr }) => {
                          const isColor = entry.$type === 'color' && typeof entry.$value === 'string';
                          const leafName = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1) : path;
                          const parentPath = path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : '';
                          return (
                            <div key={path} className="flex items-center gap-1.5 px-2 py-1 bg-[var(--color-figma-bg)] min-w-0">
                              {isColor ? (
                                <div
                                  className="shrink-0 w-3.5 h-3.5 rounded-sm border border-[var(--color-figma-border)]"
                                  style={{ backgroundColor: swatchBgColor(entry.$value as string) }}
                                />
                              ) : (
                                <div className="shrink-0 w-3.5 h-3.5 rounded-sm border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex items-center justify-center">
                                  <span className="text-[6px] font-mono text-[var(--color-figma-text-tertiary)] leading-none">
                                    {entry.$type === 'dimension' ? 'px' : entry.$type === 'duration' ? 'ms' : entry.$type.slice(0, 2)}
                                  </span>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                {parentPath && (
                                  <span className="text-[8px] text-[var(--color-figma-text-tertiary)] truncate block leading-none mb-0.5">{parentPath}</span>
                                )}
                                <span className="text-[10px] text-[var(--color-figma-text)] font-medium truncate block leading-none">{leafName}</span>
                              </div>
                              <div className="shrink-0 text-right">
                                {rawStr && (
                                  <div className="text-[9px] text-[var(--color-figma-text-tertiary)] line-through leading-none mb-0.5 max-w-[80px] truncate">{rawStr}</div>
                                )}
                                <div className="text-[9px] text-[var(--color-figma-text-secondary)] leading-none max-w-[80px] truncate font-mono">{resolvedStr}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {resolvedCount > previewEntries.length && (
                        <div className="text-[9px] text-[var(--color-figma-text-tertiary)] mt-1 text-right">
                          + {resolvedCount - previewEntries.length} more tokens
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Error banner */}
      {resolverError && !activeResolver && (
        <InlineBanner variant="error" layout="strip" size="sm" className="border-t border-b-0">
          {resolverError}
        </InlineBanner>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <ConfirmModal
          title="Delete output config"
          description={`Delete "${confirmDelete}"? The .resolver.json file will be removed.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
