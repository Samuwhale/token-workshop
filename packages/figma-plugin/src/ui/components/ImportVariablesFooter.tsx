import { useImportPanel } from './ImportPanelContext';
import { renderConflictValue } from './importPanelHelpers';
import { modeKey, defaultSetName } from './importPanelTypes';
import { SET_NAME_RE } from '../shared/utils';

const MAX_VISIBLE_CONFLICTS = 60;

export function ImportVariablesFooter() {
  const {
    varConflictPreview,
    varConflictDetails,
    varConflictDetailsExpanded,
    setVarConflictDetailsExpanded,
    checkingVarConflicts,
    totalEnabledSets,
    totalEnabledTokens,
    importing,
    importProgress,
    handleImportVariables,
    collectionData,
    modeEnabled,
    modeSetNames,
  } = useImportPanel();

  const hasInvalidSetNames = collectionData.some(col =>
    col.modes.some(mode => {
      const key = modeKey(col.name, mode.modeId);
      if (!(modeEnabled[key] ?? true)) return false;
      const name = (modeSetNames[key] ?? defaultSetName(col.name, mode.modeName, col.modes.length)).trim();
      return !name || !SET_NAME_RE.test(name);
    })
  );

  const hasConflicts = varConflictPreview !== null && varConflictPreview.overwriteCount > 0;
  const visibleDetails = varConflictDetails
    ? varConflictDetails.slice(0, MAX_VISIBLE_CONFLICTS)
    : null;
  const hiddenCount = varConflictDetails
    ? Math.max(0, varConflictDetails.length - MAX_VISIBLE_CONFLICTS)
    : 0;

  return (
    <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col gap-2">
      {/* Conflict preview summary */}
      {(checkingVarConflicts || varConflictPreview !== null) && (
        <div className="flex items-center gap-2 text-[10px] py-0.5">
          {checkingVarConflicts ? (
            <span className="text-[var(--color-figma-text-secondary)]">Checking existing tokens…</span>
          ) : varConflictPreview && (
            <>
              {varConflictPreview.newCount > 0 && (
                <span className="flex items-center gap-1 text-[var(--color-figma-success,#16a34a)]">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M4 1v6M1 4h6" />
                  </svg>
                  {varConflictPreview.newCount} new
                </span>
              )}
              {varConflictPreview.newCount > 0 && varConflictPreview.overwriteCount > 0 && (
                <span className="text-[var(--color-figma-border)]">·</span>
              )}
              {varConflictPreview.overwriteCount > 0 && (
                <span className="flex items-center gap-1 text-[var(--color-figma-warning,#e8a100)]">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M4 1v4M4 6.5v.5" />
                  </svg>
                  {varConflictPreview.overwriteCount} will update
                </span>
              )}
              {varConflictPreview.newCount === 0 && varConflictPreview.overwriteCount === 0 && totalEnabledSets > 0 && (
                <span className="text-[var(--color-figma-text-secondary)]">No tokens selected</span>
              )}
            </>
          )}
        </div>
      )}

      {/* Per-token conflict diff preview */}
      {hasConflicts && varConflictDetails !== null && varConflictDetails.length > 0 && !importing && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setVarConflictDetailsExpanded(v => !v)}
            className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
          >
            <svg
              width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
              className={varConflictDetailsExpanded ? 'rotate-90' : ''}
              style={{ transition: 'transform 150ms' }}
            >
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
            {varConflictDetailsExpanded ? 'Hide' : 'Show'} {varConflictDetails.length} conflicting token{varConflictDetails.length !== 1 ? 's' : ''}
          </button>

          {varConflictDetailsExpanded && (
            <div className="max-h-[200px] overflow-y-auto rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
              {visibleDetails!.map(({ path, setName, existing, incoming }) => (
                <div key={`${setName}:${path}`} className="px-2 py-1.5 bg-[var(--color-figma-bg)]">
                  <div className="flex items-start justify-between gap-1 mb-0.5">
                    <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate flex-1 min-w-0" title={path}>
                      {path}
                    </span>
                    {varConflictDetails.length > 1 && (
                      <span className="shrink-0 text-[9px] text-[var(--color-figma-text-tertiary)] ml-1">{setName}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 ml-1 text-[10px] font-mono">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[var(--color-figma-error,#e53935)] shrink-0 w-3">&minus;</span>
                      <span className="text-[var(--color-figma-text-secondary)] truncate flex items-center gap-1">
                        {renderConflictValue(existing.$type, existing.$value)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-[var(--color-figma-success,#16a34a)] shrink-0 w-3">+</span>
                      <span className="text-[var(--color-figma-text)] truncate flex items-center gap-1">
                        {renderConflictValue(incoming.$type, incoming.$value)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {hiddenCount > 0 && (
                <div className="px-2 py-1.5 text-[10px] text-[var(--color-figma-text-tertiary)] text-center bg-[var(--color-figma-bg)]">
                  and {hiddenCount} more…
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Import button(s) */}
      {varConflictPreview !== null && varConflictPreview.overwriteCount > 0 && !importing ? (
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => handleImportVariables('overwrite')}
            disabled={totalEnabledSets === 0 || hasInvalidSetNames}
            title={hasInvalidSetNames ? 'Fix invalid set names above before importing' : totalEnabledSets === 0 ? 'Enable at least one mode to import' : undefined}
            className="w-full px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            Import & overwrite ({totalEnabledTokens} token{totalEnabledTokens !== 1 ? 's' : ''})
          </button>
          <button
            onClick={() => handleImportVariables('merge')}
            disabled={totalEnabledSets === 0 || hasInvalidSetNames}
            title={hasInvalidSetNames ? 'Fix invalid set names above before importing' : totalEnabledSets === 0 ? 'Enable at least one mode to import' : undefined}
            className="w-full px-3 py-1.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-medium hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
          >
            Import & merge ({varConflictPreview.newCount} new + {varConflictPreview.overwriteCount} value updates)
          </button>
          <button
            onClick={() => handleImportVariables('skip')}
            disabled={totalEnabledSets === 0 || hasInvalidSetNames}
            title={hasInvalidSetNames ? 'Fix invalid set names above before importing' : totalEnabledSets === 0 ? 'Enable at least one mode to import' : undefined}
            className="w-full px-3 py-1.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-medium hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
          >
            Import & keep existing ({varConflictPreview.newCount} new only)
          </button>
          {hasInvalidSetNames && (
            <p className="text-[10px] text-[var(--color-figma-error,#e53935)] text-center">Fix invalid set names above before importing</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <button
            onClick={() => handleImportVariables('overwrite')}
            disabled={totalEnabledSets === 0 || importing || hasInvalidSetNames}
            title={hasInvalidSetNames ? 'Fix invalid set names above before importing' : totalEnabledSets === 0 ? 'Enable at least one mode to import' : undefined}
            className="w-full px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {importing
              ? importProgress
                ? `Importing set ${importProgress.done}/${importProgress.total}…`
                : 'Importing…'
              : `Import ${totalEnabledTokens} token${totalEnabledTokens !== 1 ? 's' : ''} into ${totalEnabledSets} set${totalEnabledSets !== 1 ? 's' : ''}`}
          </button>
          {!importing && totalEnabledSets === 0 && !hasInvalidSetNames && (
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] text-center">Enable at least one mode above to import</p>
          )}
          {!importing && hasInvalidSetNames && (
            <p className="text-[10px] text-[var(--color-figma-error,#e53935)] text-center">Fix invalid set names above before importing</p>
          )}
        </div>
      )}
      {importing && importProgress && importProgress.total > 0 && (
        <div className="w-full h-1.5 rounded-full bg-[var(--color-figma-border)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-figma-accent)] transition-all duration-300"
            style={{ width: `${Math.round((importProgress.done / importProgress.total) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
