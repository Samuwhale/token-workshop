/**
 * ResolverPanel — UI for managing DTCG v2025.10 resolver configs.
 *
 * Shows a list of resolvers, lets users create/delete them, migrate
 * from themes, select modifier contexts, and preview resolved tokens.
 *
 * `ResolverContent` is the embeddable version (no outer header) used
 * inside ThemeManager's advanced mode. `ResolverPanel` adds a standalone
 * header and is kept for backward compatibility.
 */

import { useState, useCallback, useMemo } from 'react';
import type { ResolverFile } from '@tokenmanager/core';
import type { ResolverMeta, ResolverModifierMeta } from '../hooks/useResolvers';
import { ConfirmModal } from './ConfirmModal';
import { usePanelHelp, PanelHelpIcon } from './PanelHelpHint';
import { apiFetch } from '../shared/apiFetch';
import { Spinner } from './Spinner';
import { useTokenFlatMapContext } from '../contexts/TokenDataContext';
import { formatTokenValueForDisplay } from '../shared/tokenFormatting';
import { swatchBgColor } from '../shared/colorUtils';

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
  /** Called with a success message after a mutation completes (e.g. resolver save). */
  onSuccess?: (msg: string) => void;
}

/**
 * Embeddable resolver UI — no standalone header.
 * Used inside ThemeManager advanced mode.
 */
export function ResolverContent(props: ResolverContentProps) {
  return <ResolverInner {...props} showHeader={false} />;
}

/**
 * Standalone resolver panel with full header chrome.
 */
export function ResolverPanel(props: ResolverContentProps) {
  return <ResolverInner {...props} showHeader />;
}

// Edit form state for a single resolver
interface EditFormState {
  description: string;
  modifiers: Record<string, { description: string; defaultContext: string }>;
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
  const help = usePanelHelp('resolvers');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [, setMigrateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creatingFromTemplate, setCreatingFromTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateStep, setTemplateStep] = useState<'name' | 'confirm'>('name');
  const [templateAssignments, setTemplateAssignments] = useState<{
    foundation: string;
    light: string;
    dark: string;
  }>({ foundation: '', light: '', dark: '' });

  // Edit mode state
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
      onSuccess?.('Migrated themes to resolver format');
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
      onSuccess?.(`Created resolver "${created}"`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    }
  }, [newName, sets, serverUrl, fetchResolvers, onSuccess]);

  const handleTemplateNameNext = useCallback(() => {
    if (!templateName.trim()) return;
    const lightSet = sets.find(s => s.toLowerCase().includes('light')) ?? '';
    const darkSet = sets.find(s => s.toLowerCase().includes('dark')) ?? '';
    const foundationSet = sets.find(s =>
      s.toLowerCase().includes('foundation') || s.toLowerCase().includes('base') || s.toLowerCase().includes('global')
    ) ?? sets[0] ?? '';
    setTemplateAssignments({ foundation: foundationSet, light: lightSet, dark: darkSet });
    setTemplateStep('confirm');
    setTemplateError(null);
  }, [templateName, sets]);

  const handleCreateFromTemplate = useCallback(async () => {
    setTemplateError(null);
    try {
      const { foundation: foundationSet, light: lightSet, dark: darkSet } = templateAssignments;
      const body = {
        name: templateName.trim(),
        version: '2025.10' as const,
        description: 'Light / dark mode resolver',
        sets: {
          foundation: {
            description: 'Base tokens shared across all modes',
            sources: foundationSet ? [{ $ref: `${foundationSet}.tokens.json` }] : [],
          },
          light: {
            description: 'Light mode overrides',
            sources: lightSet ? [{ $ref: `${lightSet}.tokens.json` }] : [],
          },
          dark: {
            description: 'Dark mode overrides',
            sources: darkSet ? [{ $ref: `${darkSet}.tokens.json` }] : [],
          },
        },
        modifiers: {
          mode: {
            description: 'Color scheme',
            contexts: {
              light: [{ $ref: '#/sets/light' }],
              dark: [{ $ref: '#/sets/dark' }],
            },
            default: 'light',
          },
        },
        resolutionOrder: [
          { $ref: '#/sets/foundation' },
          { $ref: '#/modifiers/mode' },
        ],
      };
      await apiFetch(`${serverUrl}/api/resolvers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const created = templateName.trim();
      setTemplateName('');
      setTemplateStep('name');
      setCreatingFromTemplate(false);
      fetchResolvers();
      onSuccess?.(`Created resolver "${created}"`);
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : String(err));
    }
  }, [templateName, templateAssignments, serverUrl, fetchResolvers, onSuccess]);

  const handleDelete = useCallback(async (name: string) => {
    await deleteResolver(name);
    setConfirmDelete(null);
    onSuccess?.(`Deleted resolver "${name}"`);
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
      // Build form state from file
      const modifiers: EditFormState['modifiers'] = {};
      if (file.modifiers) {
        for (const [modName, mod] of Object.entries(file.modifiers)) {
          const contexts = Object.keys(mod.contexts);
          modifiers[modName] = {
            description: mod.description ?? '',
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
      // Apply form values onto the full file
      const updatedModifiers: ResolverFile['modifiers'] = editFile.modifiers
        ? Object.fromEntries(
            Object.entries(editFile.modifiers).map(([modName, mod]) => {
              const formMod = editForm.modifiers[modName];
              const updatedMod = { ...mod };
              if (formMod?.description) {
                updatedMod.description = formMod.description;
              } else {
                delete updatedMod.description;
              }
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
      onSuccess?.(`Saved resolver "${editingResolver}"`);
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

  /** Up to 8 sample tokens from the resolved output for live preview. Colors first. */
  const previewEntries = useMemo(() => {
    if (!resolvedTokens) return [];
    const all = Object.entries(resolvedTokens);
    // Sort: color tokens first, then others with a known type, then unknown
    const sorted = [...all].sort(([, a], [, b]) => {
      const rank = (t: string) => t === 'color' ? 0 : t === 'unknown' ? 2 : 1;
      return rank(a.$type) - rank(b.$type);
    });
    return sorted.slice(0, 8).map(([path, entry]) => {
      const rawEntry = allTokensFlat[path];
      const rawValue = rawEntry?.$value;
      // Detect if the resolved value differs from the raw value in allTokensFlat
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
          <div>
            <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">
              Resolver Composition
            </span>
            <span className="ml-1.5 text-[10px] text-[var(--color-figma-text-tertiary)]">DTCG v2025.10</span>
            <PanelHelpIcon panelKey="resolvers" title="Resolvers" expanded={help.expanded} onToggle={help.toggle} />
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
              className="flex-1 px-1.5 py-0.5 rounded text-[11px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
            />
            <button onClick={handleCreate} className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white">Create</button>
            <button onClick={() => { setCreating(false); setCreateError(null); }} className="px-2 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)]">Cancel</button>
          </div>
          {createError && <div className="mt-1 text-[10px] text-red-500">{createError}</div>}
        </div>
      )}

      {/* Template creation form */}
      {creatingFromTemplate && (
        <div className="shrink-0 px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <div className="text-[10px] text-[var(--color-figma-text-secondary)] mb-1.5 flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
            <span className="font-medium text-[var(--color-figma-text)]">Light / Dark preset</span>
            <span className="ml-auto text-[var(--color-figma-text-tertiary)]">
              {templateStep === 'name' ? 'foundation + mode modifier' : 'confirm set assignments'}
            </span>
          </div>

          {templateStep === 'name' ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleTemplateNameNext(); if (e.key === 'Escape') { setCreatingFromTemplate(false); setTemplateError(null); setTemplateStep('name'); } }}
                placeholder="Resolver name…"
                autoFocus
                className="flex-1 px-1.5 py-0.5 rounded text-[11px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
              />
              <button onClick={handleTemplateNameNext} disabled={!templateName.trim()} className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white disabled:opacity-50">Next →</button>
              <button onClick={() => { setCreatingFromTemplate(false); setTemplateError(null); setTemplateStep('name'); }} className="px-2 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)]">Cancel</button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-snug">
                Assign your token sets to each resolver role. Change any that were detected incorrectly.
              </p>
              {(['foundation', 'light', 'dark'] as const).map(role => (
                <div key={role} className="flex items-center gap-2">
                  <span className="w-[64px] shrink-0 text-[10px] font-medium text-[var(--color-figma-text-secondary)] capitalize">{role}</span>
                  <select
                    value={templateAssignments[role]}
                    onChange={e => setTemplateAssignments(prev => ({ ...prev, [role]: e.target.value }))}
                    className="flex-1 px-1.5 py-0.5 rounded text-[11px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                  >
                    <option value="">(none)</option>
                    {sets.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  {templateAssignments[role] && (
                    <span className="shrink-0 text-[9px] text-[var(--color-figma-text-tertiary)]" title="Auto-detected">
                      {sets.some(s => s === templateAssignments[role] &&
                        (role === 'light' ? s.toLowerCase().includes('light') :
                         role === 'dark' ? s.toLowerCase().includes('dark') :
                         s.toLowerCase().includes('foundation') || s.toLowerCase().includes('base') || s.toLowerCase().includes('global')))
                        ? 'detected' : ''}
                    </span>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-1 mt-0.5">
                <button onClick={handleCreateFromTemplate} className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white">Create</button>
                <button onClick={() => setTemplateStep('name')} className="px-2 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)]">← Back</button>
                <button onClick={() => { setCreatingFromTemplate(false); setTemplateError(null); setTemplateStep('name'); }} className="px-2 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)]">Cancel</button>
              </div>
            </div>
          )}

          {templateError && <div className="mt-1 text-[10px] text-red-500">{templateError}</div>}
        </div>
      )}

      {/* Resolver list */}
      <div className="flex-1 overflow-y-auto">
        {resolversLoading && resolvers.length === 0 && !creating && !creatingFromTemplate && (
          <div className="flex flex-col h-full items-center justify-center gap-2 text-[var(--color-figma-text-secondary)]">
            <Spinner size="md" />
            <span className="text-[11px]">Loading resolvers…</span>
          </div>
        )}
        {!resolversLoading && resolvers.length === 0 && Object.keys(resolverLoadErrors).length === 0 && !creating && !creatingFromTemplate && (
          <div className="flex flex-col items-center justify-center h-full px-5 py-8 text-center gap-4">
            {/* Icon */}
            <div className="w-10 h-10 rounded-xl bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
                <path d="M8 6L4 12l4 6M16 6l4 6-4 6M13 4l-2 16"/>
              </svg>
            </div>

            {/* Heading + description */}
            <div className="flex flex-col gap-1">
              <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">No resolver configs yet</p>
              <p className="text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed max-w-[240px]">
                Resolvers define how token sets merge based on contextual dimensions — replacing per-combination files with a single config.
              </p>
            </div>

            {/* How it works */}
            <div className="w-full max-w-[260px]">
              <p className="text-[10px] text-[var(--color-figma-text-tertiary)] uppercase tracking-wide font-medium text-left mb-2">How resolvers work</p>
              <div className="flex items-start gap-0 w-full">
                <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-[var(--color-figma-bg-secondary)] flex items-center justify-center text-[var(--color-figma-text-secondary)]">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M3 9h18M9 21V9" />
                    </svg>
                  </div>
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium leading-tight text-center">Dimensions</p>
                  <p className="text-[8px] text-[var(--color-figma-text-tertiary)] leading-tight text-center">Brand, Mode</p>
                </div>
                <svg width="10" height="10" viewBox="0 0 8 8" fill="var(--color-figma-text-tertiary)" className="mt-2 shrink-0"><path d="M2 1l4 3-4 3V1z" /></svg>
                <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-[var(--color-figma-bg-secondary)] flex items-center justify-center text-[var(--color-figma-text-secondary)]">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 6L4 12l4 6M16 6l4 6-4 6" />
                    </svg>
                  </div>
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium leading-tight text-center">Resolve</p>
                  <p className="text-[8px] text-[var(--color-figma-text-tertiary)] leading-tight text-center">Merge sets</p>
                </div>
                <svg width="10" height="10" viewBox="0 0 8 8" fill="var(--color-figma-text-tertiary)" className="mt-2 shrink-0"><path d="M2 1l4 3-4 3V1z" /></svg>
                <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-[var(--color-figma-bg-secondary)] flex items-center justify-center text-[var(--color-figma-text-secondary)]">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3" />
                    </svg>
                  </div>
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium leading-tight text-center">Tokens</p>
                  <p className="text-[8px] text-[var(--color-figma-text-tertiary)] leading-tight text-center">Final output</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 w-full max-w-[260px]">
              <p className="text-[10px] text-[var(--color-figma-text-tertiary)] uppercase tracking-wide font-medium text-left">Get started</p>
              <button
                onClick={handleMigrate}
                disabled={migrating || !connected}
                className="flex flex-col items-start gap-0.5 px-3 py-2 rounded border border-[var(--color-figma-border)] text-left text-[var(--color-figma-text)] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18M9 21V9" />
                  </svg>
                  <span className="text-[11px] font-medium">Convert from Themes</span>
                </div>
                <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug pl-[20px]">
                  Migrate your existing theme layers into a resolver config
                </p>
              </button>
              <button
                onClick={() => setCreating(true)}
                className="flex flex-col items-start gap-0.5 px-3 py-2 rounded border border-[var(--color-figma-border)] text-left text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M6 1v10M1 6h10" />
                  </svg>
                  <span className="text-[11px] font-medium">Create from scratch</span>
                </div>
                <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug pl-[20px]">
                  Define dimensions and set mappings manually
                </p>
              </button>
              <button
                onClick={() => { setCreatingFromTemplate(true); setTemplateError(null); setTemplateStep('name'); }}
                className="flex flex-col items-start gap-0.5 px-3 py-2 rounded border border-[var(--color-figma-border)] border-dashed text-left text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                  </svg>
                  <span className="text-[11px] font-medium">Light / Dark preset</span>
                </div>
                <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-snug pl-[20px]">
                  Pre-built resolver with a <code className="font-mono">mode</code> modifier (light / dark)
                </p>
              </button>
            </div>

            {/* When to use resolvers note */}
            <div className="w-full max-w-[260px] pt-1 border-t border-[var(--color-figma-border)]">
              <p className="text-[10px] text-[var(--color-figma-text-tertiary)] uppercase tracking-wide font-medium mb-1.5">When to use resolvers</p>
              <p className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-relaxed text-left">
                Use <span className="text-[var(--color-figma-text-secondary)] font-medium">resolvers</span> when token sets combine along multiple independent dimensions (e.g. brand × mode × density). A single resolver replaces an exponential number of per-combination files.
              </p>
              <p className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-relaxed text-left mt-1">
                For simpler scenarios, switch back to the <span className="text-[var(--color-figma-text-secondary)] font-medium">Manage</span> tab to use theme dimensions directly.
              </p>
            </div>
          </div>
        )}

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
                <div className="text-[9px] text-[var(--color-figma-text-tertiary)] mt-0.5">Failed to load — fix the file to use this resolver</div>
              </div>
            </div>
          </div>
        ))}

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
                  {getResolverFile && updateResolver && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditClick(resolver.name); }}
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 p-0.5 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-all"
                      title="Edit resolver"
                      aria-label="Edit resolver"
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
                    title="Delete resolver"
                    aria-label="Delete resolver"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Edit mode form */}
              {editingResolver === resolver.name && (
                <div className="px-3 pb-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
                  {editLoading ? (
                    <div className="py-3 text-[10px] text-[var(--color-figma-text-tertiary)] animate-pulse">Loading…</div>
                  ) : editForm ? (
                    <div className="flex flex-col gap-2 pt-2">
                      {/* Description */}
                      <div className="flex flex-col gap-0.5">
                        <label className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] uppercase tracking-wider">Description</label>
                        <input
                          type="text"
                          value={editForm.description}
                          onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                          placeholder="Optional description…"
                          className="px-1.5 py-0.5 rounded text-[11px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                        />
                      </div>

                      {/* Modifiers */}
                      {Object.keys(editForm.modifiers).length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] uppercase tracking-wider">Modifiers</div>
                          {Object.entries(editForm.modifiers).map(([modName, modEdit]) => {
                            const resolverMeta = resolvers.find(r => r.name === resolver.name);
                            const contexts = resolverMeta?.modifiers[modName]?.contexts ?? [];
                            return (
                              <div key={modName} className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 flex flex-col gap-1.5">
                                <div className="text-[10px] font-medium text-[var(--color-figma-text)] capitalize">{modName}</div>
                                <div className="flex flex-col gap-0.5">
                                  <label className="text-[9px] text-[var(--color-figma-text-tertiary)] uppercase tracking-wide">Description</label>
                                  <input
                                    type="text"
                                    value={modEdit.description}
                                    onChange={e => setEditForm({
                                      ...editForm,
                                      modifiers: { ...editForm.modifiers, [modName]: { ...modEdit, description: e.target.value } },
                                    })}
                                    placeholder="Optional modifier description…"
                                    className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
                                  />
                                </div>
                                {contexts.length > 0 && (
                                  <div className="flex flex-col gap-0.5">
                                    <label className="text-[9px] text-[var(--color-figma-text-tertiary)] uppercase tracking-wide">Default context</label>
                                    <div className="flex flex-wrap gap-0.5">
                                      {contexts.map(ctx => (
                                        <button
                                          key={ctx}
                                          onClick={() => setEditForm({
                                            ...editForm,
                                            modifiers: { ...editForm.modifiers, [modName]: { ...modEdit, defaultContext: ctx } },
                                          })}
                                          className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                                            modEdit.defaultContext === ctx
                                              ? 'bg-[var(--color-figma-accent)] text-white font-medium'
                                              : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                                          }`}
                                        >
                                          {ctx}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {editError && <div className="text-[10px] text-red-500">{editError}</div>}

                      {/* Actions */}
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

              {/* Expanded: modifier controls + preview */}
              {isActive && editingResolver !== resolver.name && (
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
                      <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
                        <Spinner size="sm" />
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

                  {/* Resolved preview */}
                  {previewEntries.length > 0 && !loading && (
                    <div className="mt-2">
                      <div className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)] uppercase tracking-wide mb-1">
                        Resolved preview
                      </div>
                      <div className="flex flex-col divide-y divide-[var(--color-figma-border)] rounded border border-[var(--color-figma-border)] overflow-hidden">
                        {previewEntries.map(({ path, entry, rawStr, resolvedStr }) => {
                          const isColor = entry.$type === 'color' && typeof entry.$value === 'string';
                          const leafName = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1) : path;
                          const parentPath = path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : '';
                          return (
                            <div key={path} className="flex items-center gap-1.5 px-2 py-1 bg-[var(--color-figma-bg)] min-w-0">
                              {/* Color swatch */}
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
                              {/* Path */}
                              <div className="flex-1 min-w-0">
                                {parentPath && (
                                  <span className="text-[8px] text-[var(--color-figma-text-tertiary)] truncate block leading-none mb-0.5">{parentPath}</span>
                                )}
                                <span className="text-[10px] text-[var(--color-figma-text)] font-medium truncate block leading-none">{leafName}</span>
                              </div>
                              {/* Value */}
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
