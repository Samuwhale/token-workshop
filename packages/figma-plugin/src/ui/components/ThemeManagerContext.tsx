import { createContext, useContext, useMemo } from 'react';
import type { ThemeDimension } from '@tokenmanager/core';
import { ConfirmModal } from './ConfirmModal';
import type { AutoFillPreview } from './themeManagerTypes';
import { STATE_LABELS, STATE_DESCRIPTIONS } from './themeManagerTypes';

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
  // Bulk context menu
  bulkMenu: { x: number; y: number; dimId: string; setName: string } | null;
  setBulkMenu: (v: { x: number; y: number; dimId: string; setName: string } | null) => void;
  bulkMenuRef: React.RefObject<HTMLDivElement | null>;
  handleBulkSetState: (dimId: string, setName: string, state: 'disabled' | 'source' | 'enabled') => void;
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

/** Renders all modal dialogs and the bulk context menu. Place once at the end of ThemeManager JSX. */
export function ThemeManagerModals() {
  const {
    dimensions,
    autoFillPreview, setAutoFillPreview, autoFillStrategy, setAutoFillStrategy,
    executeAutoFillAll, executeAutoFillAllOptions,
    dimensionDeleteConfirm, closeDeleteConfirm, executeDeleteDimension,
    optionDeleteConfirm, setOptionDeleteConfirm, executeDeleteOption,
    bulkMenu, setBulkMenu, bulkMenuRef, handleBulkSetState,
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
            title={`Delete layer "${dim.name}"?`}
            description={`This will permanently delete the layer and all ${dim.options.length} option${dim.options.length !== 1 ? 's' : ''} it contains. Token resolution across all sets that use this layer will be affected.`}
            confirmLabel="Delete layer"
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
            description={`This will permanently delete the option from layer "${dim.name}". Any token assignments specific to this option will be lost.`}
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

      {/* Bulk set-status context menu */}
      {bulkMenu && (
        <div
          ref={bulkMenuRef}
          role="menu"
          aria-label={`Set "${bulkMenu.setName}" in all options`}
          className="fixed z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg py-1 min-w-[180px]"
          style={{ top: bulkMenu.y, left: bulkMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] font-medium uppercase tracking-wider" aria-hidden="true">
            Set &ldquo;{bulkMenu.setName}&rdquo; in all options
          </div>
          {(['disabled', 'source', 'enabled'] as const).map(s => (
            <button
              key={s}
              role="menuitem"
              tabIndex={-1}
              onClick={() => handleBulkSetState(bulkMenu.dimId, bulkMenu.setName, s)}
              className="w-full text-left px-3 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] flex items-center gap-2"
            >
              <span className={`inline-block w-2 h-2 rounded-full ${
                s === 'source'
                  ? 'bg-[var(--color-figma-accent)]'
                  : s === 'enabled'
                  ? 'bg-[var(--color-figma-success)]'
                  : 'bg-[var(--color-figma-text-tertiary)]'
              }`} />
              {STATE_LABELS[s]} — {STATE_DESCRIPTIONS[s]}
            </button>
          ))}
        </div>
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
