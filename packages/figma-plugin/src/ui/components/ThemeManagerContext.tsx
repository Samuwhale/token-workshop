import { createContext, useContext, useMemo, useState, useRef, useEffect, useCallback } from 'react';
import type { ThemeDimension } from '@tokenmanager/core';
import { ConfirmModal } from './ConfirmModal';
import { FieldMessage } from '../shared/FieldMessage';
import type { AutoFillPreview } from './themeManagerTypes';

export interface ThemeManagerFeedbackState {
  error: string | null;
  setError: (message: string | null) => void;
  clearError: () => void;
  reportSuccess: (message: string) => void;
  reportError: (message: string) => void;
}

export function useThemeManagerFeedback(
  onSuccess?: (message: string) => void,
): ThemeManagerFeedbackState {
  const [error, setErrorState] = useState<string | null>(null);

  const setError = useCallback((message: string | null) => {
    setErrorState(message);
  }, []);

  const clearError = useCallback(() => {
    setErrorState(null);
  }, []);

  const reportSuccess = useCallback(
    (message: string) => {
      clearError();
      onSuccess?.(message);
    },
    [clearError, onSuccess],
  );

  const reportError = useCallback((message: string) => {
    setErrorState(message);
  }, []);

  return useMemo(
    () => ({
      error,
      setError,
      clearError,
      reportSuccess,
      reportError,
    }),
    [clearError, error, reportError, reportSuccess, setError],
  );
}

export interface ThemeManagerModalsState {
  dimensions: ThemeDimension[];
  // Auto-fill
  autoFillPreview: AutoFillPreview | null;
  setAutoFillPreview: (v: AutoFillPreview | null) => void;
  autoFillStrategy: 'skip' | 'overwrite';
  setAutoFillStrategy: (v: 'skip' | 'overwrite') => void;
  executeAutoFillAll: (preview: AutoFillPreview & { mode: 'single-option' }, strategy: 'skip' | 'overwrite') => void;
  executeAutoFillAllOptions: (preview: AutoFillPreview & { mode: 'all-options' }, strategy: 'skip' | 'overwrite') => void;
  // Delete dimension
  dimensionDeleteConfirm: string | null;
  /** Open the delete-confirmation modal for the given dimension id. */
  setDimensionDeleteConfirm: (id: string) => void;
  /** Close the delete-confirmation modal without deleting. */
  closeDeleteConfirm: () => void;
  executeDeleteDimension: (id: string) => Promise<void>;
  // Delete option
  optionDeleteConfirm: { dimId: string; optionName: string } | null;
  setOptionDeleteConfirm: (v: { dimId: string; optionName: string } | null) => void;
  executeDeleteOption: (dimId: string, optionName: string) => Promise<void>;
  // Create override set
  createOverrideSet: { dimId: string; setName: string; optName?: string } | null;
  setCreateOverrideSet: (v: { dimId: string; setName: string; optName?: string } | null) => void;
  executeCreateOverrideSet: (params: { newName: string; optionName: string; startEmpty: boolean }) => Promise<void>;
  isCreatingOverrideSet: boolean;
}

const ThemeManagerModalsContext = createContext<ThemeManagerModalsState | null>(null);

export function useThemeManagerModals(): ThemeManagerModalsState {
  const ctx = useContext(ThemeManagerModalsContext);
  if (!ctx) throw new Error('useThemeManagerModals must be used inside ThemeManagerModalsProvider');
  return ctx;
}

interface ThemeManagerModalsProviderProps {
  value: ThemeManagerModalsState;
  children: React.ReactNode;
}

export function ThemeManagerModalsProvider({ value, children }: ThemeManagerModalsProviderProps) {
  return (
    <ThemeManagerModalsContext.Provider value={value}>
      {children}
    </ThemeManagerModalsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// CreateOverrideSetModal — separate component so it can use useState
// ---------------------------------------------------------------------------

interface CreateOverrideSetModalProps {
  dimId: string;
  setName: string;
  optName?: string;
  dimensions: ThemeDimension[];
  onClose: () => void;
  onExecute: (params: { newName: string; optionName: string; startEmpty: boolean }) => Promise<void>;
  isCreating: boolean;
}

function CreateOverrideSetModal({
  dimId, setName, optName: initialOptName, dimensions, onClose, onExecute, isCreating,
}: CreateOverrideSetModalProps) {
  const dim = dimensions.find(d => d.id === dimId);
  const defaultOptName = initialOptName ?? dim?.options[0]?.name ?? '';
  const [newName, setNewName] = useState(`${setName}-override`);
  const [optionName, setOptionName] = useState(defaultOptName);
  const [startEmpty, setStartEmpty] = useState(true);
  const [nameError, setNameError] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, []);

  const handleConfirm = async () => {
    const trimmed = newName.trim();
    if (!trimmed) { setNameError('Name is required'); return; }
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(trimmed)) {
      setNameError('Use only letters, numbers, dashes, underscores, or / for folders');
      return;
    }
    if (!optionName) { setNameError('Select a theme option'); return; }
    setNameError('');
    await onExecute({ newName: trimmed, optionName, startEmpty });
  };

  return (
    <ConfirmModal
      title={`Create override set from "${setName}"`}
      wide
      confirmLabel={isCreating ? 'Creating…' : 'Create override set'}
      confirmDisabled={isCreating || !newName.trim() || !optionName}
      onCancel={onClose}
      onConfirm={handleConfirm}
    >
      <div className="mt-3 flex flex-col gap-3">
        {/* Name */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
            New set name
          </label>
          <input
            ref={nameInputRef}
            type="text"
            value={newName}
            onChange={e => { setNewName(e.target.value); setNameError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); }}
            className={`w-full px-2 py-1 text-[11px] rounded border bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-figma-accent)] ${nameError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
            placeholder="e.g. colors-dark-override"
          />
          <FieldMessage error={nameError} />
        </div>

        {/* Theme option selector */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
            Link to theme option (as Override)
          </label>
          {dim ? (
            <select
              value={optionName}
              onChange={e => setOptionName(e.target.value)}
              className="w-full px-2 py-1 text-[11px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-figma-accent)]"
            >
              {dim.options.map(opt => (
                <option key={opt.name} value={opt.name}>{opt.name}</option>
              ))}
            </select>
          ) : (
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">No options found in this dimension.</p>
          )}
          <p className="text-[9px] text-[var(--color-figma-text-tertiary)] leading-snug">
            The new set will be added to <strong>{dim?.name ?? dimId}</strong> → <strong>{optionName}</strong> with Override status.
          </p>
        </div>

        {/* Content choice */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
            Starting content
          </span>
          <label className="flex items-start gap-2 cursor-pointer select-none group">
            <input
              type="radio"
              name="override-content"
              value="empty"
              checked={startEmpty}
              onChange={() => setStartEmpty(true)}
              className="mt-0.5 cursor-pointer"
            />
            <div>
              <span className="text-[11px] text-[var(--color-figma-text)]">Empty set</span>
              <p className="text-[9px] text-[var(--color-figma-text-tertiary)] leading-snug">
                Recommended — add only the tokens you intend to override.
              </p>
            </div>
          </label>
          <label className="flex items-start gap-2 cursor-pointer select-none group">
            <input
              type="radio"
              name="override-content"
              value="copy"
              checked={!startEmpty}
              onChange={() => setStartEmpty(false)}
              className="mt-0.5 cursor-pointer"
            />
            <div>
              <span className="text-[11px] text-[var(--color-figma-text)]">Copy all tokens from <span className="font-mono">{setName}</span></span>
              <p className="text-[9px] text-[var(--color-figma-text-tertiary)] leading-snug">
                Creates a full duplicate — delete unwanted tokens afterward.
              </p>
            </div>
          </label>
        </div>
      </div>
    </ConfirmModal>
  );
}

/** Renders all modal dialogs. Place once at the end of ThemeManager JSX. */
export function ThemeManagerModals() {
  const {
    dimensions,
    autoFillPreview, setAutoFillPreview, autoFillStrategy, setAutoFillStrategy,
    executeAutoFillAll, executeAutoFillAllOptions,
    dimensionDeleteConfirm, closeDeleteConfirm, executeDeleteDimension,
    optionDeleteConfirm, setOptionDeleteConfirm, executeDeleteOption,
    createOverrideSet, setCreateOverrideSet, executeCreateOverrideSet, isCreatingOverrideSet,
  } = useThemeManagerModals();

  return (
    <>
      {/* Auto-fill confirmation modal */}
      {autoFillPreview && (() => {
        const dimName = dimensions.find(d => d.id === autoFillPreview.dimId)?.name ?? autoFillPreview.dimId;
        const strategyPicker = (
          <div className="mt-2 flex flex-col gap-1">
            <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">If a token already exists in the target set:</div>
            <div className="flex gap-2">
              {(['skip', 'overwrite'] as const).map(s => (
                <label key={s} className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="autofill-strategy"
                    value={s}
                    checked={autoFillStrategy === s}
                    onChange={() => setAutoFillStrategy(s)}
                    className="cursor-pointer"
                  />
                  <span className="text-[11px] text-[var(--color-figma-text)]">
                    {s === 'skip' ? 'Skip (keep existing value)' : 'Overwrite (replace with filled value)'}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );

        if (autoFillPreview.mode === 'single-option') {
          const { optionName, targetSet, tokens } = autoFillPreview;
          return (
            <ConfirmModal
              title={`Auto-fill ${tokens.length} token${tokens.length !== 1 ? 's' : ''}?`}
              wide
              confirmLabel="Fill tokens"
              onCancel={() => setAutoFillPreview(null)}
              onConfirm={() => executeAutoFillAll(autoFillPreview, autoFillStrategy)}
            >
              <p className="mt-1 text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed">
                Writing <strong>{tokens.length}</strong> token{tokens.length !== 1 ? 's' : ''} to{' '}
                <span className="font-mono font-medium text-[var(--color-figma-text)]">{targetSet}</span>{' '}
                (override set for <strong>{optionName}</strong> in <strong>{dimName}</strong>).
              </p>
              {strategyPicker}
              <div className="mt-2 max-h-40 overflow-y-auto rounded border border-[var(--color-figma-border)]">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-left bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)] sticky top-0">
                      <th className="px-2 py-1 font-medium">Token path</th>
                      <th className="px-2 py-1 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-figma-border)]">
                    {tokens.map(t => (
                      <tr key={t.path}>
                        <td className="px-2 py-0.5 font-mono text-[var(--color-figma-text)] truncate max-w-[140px]" title={t.path}>{t.path}</td>
                        <td className="px-2 py-0.5 text-[var(--color-figma-text-secondary)] truncate max-w-[100px]" title={String(t.$value)}>
                          {t.$type && <span className="mr-1 text-[var(--color-figma-text-tertiary)]">{t.$type}</span>}
                          {typeof t.$value === 'object' ? JSON.stringify(t.$value) : String(t.$value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ConfirmModal>
          );
        } else {
          const { perSetBatch, totalCount } = autoFillPreview;
          const setEntries = Object.entries(perSetBatch);
          return (
            <ConfirmModal
              title={`Auto-fill ${totalCount} token${totalCount !== 1 ? 's' : ''} across all options?`}
              wide
              confirmLabel="Fill all options"
              onCancel={() => setAutoFillPreview(null)}
              onConfirm={() => executeAutoFillAllOptions(autoFillPreview, autoFillStrategy)}
            >
              <p className="mt-1 text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed">
                Writing <strong>{totalCount}</strong> token{totalCount !== 1 ? 's' : ''} to{' '}
                {setEntries.length} set{setEntries.length !== 1 ? 's' : ''} across all options in{' '}
                <strong>{dimName}</strong>.
              </p>
              {strategyPicker}
              <div className="mt-2 max-h-40 overflow-y-auto rounded border border-[var(--color-figma-border)]">
                {setEntries.map(([targetSet, tokens]) => (
                  <div key={targetSet}>
                    <div className="sticky top-0 bg-[var(--color-figma-bg-secondary)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-figma-text-secondary)] border-b border-[var(--color-figma-border)]">
                      <span className="font-mono text-[var(--color-figma-text)]">{targetSet}</span>
                      <span className="ml-1 text-[var(--color-figma-text-tertiary)]">({tokens.length} token{tokens.length !== 1 ? 's' : ''})</span>
                    </div>
                    <table className="w-full text-[10px]">
                      <tbody className="divide-y divide-[var(--color-figma-border)]">
                        {tokens.map(t => (
                          <tr key={t.path}>
                            <td className="px-2 py-0.5 font-mono text-[var(--color-figma-text)] truncate max-w-[140px]" title={t.path}>{t.path}</td>
                            <td className="px-2 py-0.5 text-[var(--color-figma-text-secondary)] truncate max-w-[100px]" title={String(t.$value)}>
                              {t.$type && <span className="mr-1 text-[var(--color-figma-text-tertiary)]">{t.$type}</span>}
                              {typeof t.$value === 'object' ? JSON.stringify(t.$value) : String(t.$value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </ConfirmModal>
          );
        }
      })()}

      {/* Delete dimension confirmation */}
      {dimensionDeleteConfirm && (() => {
        const dim = dimensions.find(d => d.id === dimensionDeleteConfirm);
        if (!dim) return null;
        return (
          <ConfirmModal
            title={`Delete axis "${dim.name}"?`}
            description={`This will permanently delete the axis and all ${dim.options.length} option${dim.options.length !== 1 ? 's' : ''} it contains. Token resolution across all sets that use this axis will be affected.`}
            confirmLabel="Delete axis"
            danger
            onConfirm={async () => {
              closeDeleteConfirm();
              await executeDeleteDimension(dim.id);
            }}
            onCancel={() => closeDeleteConfirm()}
          />
        );
      })()}

      {/* Delete option confirmation */}
      {optionDeleteConfirm && (() => {
        const dim = dimensions.find(d => d.id === optionDeleteConfirm.dimId);
        if (!dim) return null;
        return (
          <ConfirmModal
            title={`Delete option "${optionDeleteConfirm.optionName}"?`}
            description={`This will permanently delete the option from axis "${dim.name}". Any token assignments specific to this option will be lost.`}
            confirmLabel="Delete option"
            danger
            onConfirm={async () => {
              const { dimId, optionName } = optionDeleteConfirm;
              setOptionDeleteConfirm(null);
              await executeDeleteOption(dimId, optionName);
            }}
            onCancel={() => setOptionDeleteConfirm(null)}
          />
        );
      })()}

      {/* Create override set modal */}
      {createOverrideSet && (
        <CreateOverrideSetModal
          dimId={createOverrideSet.dimId}
          setName={createOverrideSet.setName}
          optName={createOverrideSet.optName}
          dimensions={dimensions}
          onClose={() => setCreateOverrideSet(null)}
          onExecute={executeCreateOverrideSet}
          isCreating={isCreatingOverrideSet}
        />
      )}
    </>
  );
}

/** Build the memoized context value for ThemeManagerModals from all the hook outputs. */
export function useThemeManagerModalsValue(
  deps: Omit<ThemeManagerModalsState, never>,
): ThemeManagerModalsState {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => deps, Object.values(deps));
}
