import { useMemo, useState, useEffect, useCallback } from 'react';
import { swatchBgColor } from '../../shared/colorUtils';
import { getDiffRowId } from '../../shared/syncWorkflow';

// Display row shape used by VarDiffRowItem — compatible with both VarDiffRow and StyleDiffRow.
interface VarDiffRow {
  id?: string;
  path: string;
  cat: 'local-only' | 'figma-only' | 'conflict';
  localValue?: string;
  figmaValue?: string;
  localType?: string;
  figmaType?: string;
  localScopes?: string[];
  figmaScopes?: string[];
  targetLabel?: string;
}

/* ── Shared types ───────────────────────────────────────────────────────── */

export interface PreviewRow {
  id?: string;
  path: string;
  localValue?: string;
  figmaValue?: string;
  localType?: string;
  figmaType?: string;
  cat: 'local-only' | 'figma-only' | 'conflict';
  targetLabel?: string;
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

export function truncateValue(v: string, max = 24): string {
  return v.length > max ? v.slice(0, max) + '\u2026' : v;
}

export function isHexColor(v: string | undefined): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v);
}

/* ── DiffSwatch ─────────────────────────────────────────────────────────── */

export function DiffSwatch({ hex }: { hex: string }) {
  return (
    <span
      className="inline-block w-3 h-3 rounded-sm border border-white/20 ring-1 ring-[var(--color-figma-border)] shrink-0 align-middle"
      style={{ backgroundColor: swatchBgColor(hex) }}
      aria-hidden="true"
    />
  );
}

/* ── ValueCell ──────────────────────────────────────────────────────────── */

export function ValueCell({ label, value, type }: { label: string; value: string | undefined; type: string | undefined }) {
  const v = value ?? '';
  const showSwatch = (type === 'color' || isHexColor(v)) && isHexColor(v);
  return (
    <div className="flex items-center gap-1 min-w-0 flex-1">
      <span className="text-[10px] text-[var(--color-figma-text-tertiary)] shrink-0">{label}</span>
      {showSwatch && <DiffSwatch hex={v} />}
      <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={v}>{truncateValue(v)}</span>
    </div>
  );
}

/* ── TokenChangeRow ─────────────────────────────────────────────────────── */

export function TokenChangeRow({ change }: { change: import('../../hooks/useGitDiff').TokenChange }) {
  const statusColor =
    change.status === 'added' ? 'text-[var(--color-figma-success)]' :
    change.status === 'removed' ? 'text-[var(--color-figma-error)]' :
    'text-[var(--color-figma-warning)]';
  const statusChar = change.status === 'added' ? '+' : change.status === 'removed' ? '\u2212' : '~';
  const valStr = (v: any) => typeof v === 'string' ? v : JSON.stringify(v);
  const isColor = change.type === 'color';
  const beforeStr = change.before != null ? valStr(change.before) : undefined;
  const afterStr = change.after != null ? valStr(change.after) : undefined;

  return (
    <div className="px-3 py-1">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`text-[10px] font-mono font-bold w-3 shrink-0 ${statusColor}`}>{statusChar}</span>
        <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={change.path}>{change.path}</span>
      </div>
      {change.status === 'modified' && (
        <div className="ml-4 mt-0.5 flex flex-col gap-0.5 text-[10px] font-mono">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[var(--color-figma-error)] shrink-0 w-3">&minus;</span>
            {isColor && isHexColor(beforeStr) && <DiffSwatch hex={beforeStr} />}
            <span className="text-[var(--color-figma-text-secondary)] truncate" title={beforeStr}>{truncateValue(beforeStr ?? '', 40)}</span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[var(--color-figma-success)] shrink-0 w-3">+</span>
            {isColor && isHexColor(afterStr) && <DiffSwatch hex={afterStr} />}
            <span className="text-[var(--color-figma-text)] truncate" title={afterStr}>{truncateValue(afterStr ?? '', 40)}</span>
          </div>
        </div>
      )}
      {change.status === 'added' && afterStr !== undefined && (
        <div className="ml-4 mt-0.5 flex items-center gap-1 text-[10px] font-mono min-w-0">
          {isColor && isHexColor(afterStr) && <DiffSwatch hex={afterStr} />}
          <span className="text-[var(--color-figma-text-secondary)] truncate" title={afterStr}>{truncateValue(afterStr, 40)}</span>
        </div>
      )}
      {change.status === 'removed' && beforeStr !== undefined && (
        <div className="ml-4 mt-0.5 flex items-center gap-1 text-[10px] font-mono min-w-0">
          {isColor && isHexColor(beforeStr) && <DiffSwatch hex={beforeStr} />}
          <span className="text-[var(--color-figma-text-secondary)] line-through truncate" title={beforeStr}>{truncateValue(beforeStr, 40)}</span>
        </div>
      )}
    </div>
  );
}

/* ── FileTokenDiffList ──────────────────────────────────────────────────── */

export function FileTokenDiffList({
  allChanges,
  selectedFiles,
  setSelectedFiles,
  tokenPreview,
  tokenPreviewLoading,
  fetchTokenPreview,
}: {
  allChanges: Array<{ file: string; status: string }>;
  selectedFiles: Set<string>;
  setSelectedFiles: React.Dispatch<React.SetStateAction<Set<string>>>;
  tokenPreview: import('../../hooks/useGitDiff').TokenChange[] | null;
  tokenPreviewLoading: boolean;
  fetchTokenPreview: () => Promise<void>;
}) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (tokenPreview === null && !tokenPreviewLoading && allChanges.length > 0) {
      fetchTokenPreview();
    }
  }, [allChanges.length, tokenPreview, tokenPreviewLoading, fetchTokenPreview]);

  const changesByFile = useMemo(() => {
    const map = new Map<string, import('../../hooks/useGitDiff').TokenChange[]>();
    if (!tokenPreview) return map;
    for (const tc of tokenPreview) {
      const fileName = tc.set + '.tokens.json';
      const arr = map.get(fileName);
      if (arr) arr.push(tc);
      else map.set(fileName, [tc]);
    }
    return map;
  }, [tokenPreview]);

  const toggleExpand = (file: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file); else next.add(file);
      return next;
    });
  };

  return (
    <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
      <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium flex items-center justify-between">
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allChanges.length > 0 && selectedFiles.size === allChanges.length}
            ref={el => { if (el) el.indeterminate = selectedFiles.size > 0 && selectedFiles.size < allChanges.length; }}
            onChange={e => {
              if (e.target.checked) {
                setSelectedFiles(new Set(allChanges.map(c => c.file)));
              } else {
                setSelectedFiles(new Set());
              }
            }}
            className="w-3 h-3"
          />
          Uncommitted changes
        </label>
        <span className="text-[10px] opacity-60">
          {selectedFiles.size}/{allChanges.length} selected
          {tokenPreviewLoading && (
            <span className="ml-1.5 inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full border border-[var(--color-figma-text-secondary)]/30 border-t-[var(--color-figma-text-secondary)] animate-spin inline-block" />
            </span>
          )}
        </span>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-[var(--color-figma-border)]">
        {allChanges.map((change, i) => {
          const fileTokenChanges = changesByFile.get(change.file) ?? [];
          const isTokenFile = change.file.endsWith('.tokens.json');
          const hasTokenChanges = fileTokenChanges.length > 0;
          const isExpanded = expandedFiles.has(change.file);
          const addedCount = fileTokenChanges.filter(c => c.status === 'added').length;
          const modifiedCount = fileTokenChanges.filter(c => c.status === 'modified').length;
          const removedCount = fileTokenChanges.filter(c => c.status === 'removed').length;

          return (
            <div key={i}>
              <div className="flex items-center gap-2 px-3 py-1 hover:bg-[var(--color-figma-bg-hover)] group">
                <button
                  onClick={() => hasTokenChanges && toggleExpand(change.file)}
                  disabled={!hasTokenChanges}
                  className="w-3 h-3 flex items-center justify-center shrink-0 disabled:opacity-0"
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${isExpanded ? 'rotate-90' : ''} text-[var(--color-figma-text-tertiary)]`}>
                    <path d="M2 1l4 3-4 3V1z" />
                  </svg>
                </button>
                <label className="flex items-center cursor-pointer" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(change.file)}
                    onChange={e => {
                      setSelectedFiles(prev => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(change.file); else next.delete(change.file);
                        return next;
                      });
                    }}
                    className="w-3 h-3"
                  />
                </label>
                <span className={`text-[10px] font-mono font-bold w-3 flex-shrink-0 ${
                  change.status === 'M' ? 'text-[var(--color-figma-warning)]' :
                  change.status === 'A' ? 'text-[var(--color-figma-success)]' :
                  change.status === 'D' ? 'text-[var(--color-figma-error)]' :
                  'text-[var(--color-figma-text-secondary)]'
                }`}>
                  {change.status}
                </span>
                <button
                  onClick={() => hasTokenChanges && toggleExpand(change.file)}
                  className="text-[10px] text-[var(--color-figma-text)] truncate text-left flex-1 min-w-0"
                  disabled={!hasTokenChanges}
                >
                  {change.file}
                </button>
                {isTokenFile && tokenPreview !== null && !tokenPreviewLoading && hasTokenChanges && (
                  <span className="flex gap-1.5 text-[9px] font-mono shrink-0 ml-auto">
                    {addedCount > 0 && <span className="text-[var(--color-figma-success)]">+{addedCount}</span>}
                    {modifiedCount > 0 && <span className="text-[var(--color-figma-warning)]">~{modifiedCount}</span>}
                    {removedCount > 0 && <span className="text-[var(--color-figma-error)]">&minus;{removedCount}</span>}
                  </span>
                )}
                {isTokenFile && tokenPreview !== null && !tokenPreviewLoading && !hasTokenChanges && change.status !== 'D' && (
                  <span className="flex items-center gap-1 text-[9px] text-[var(--color-figma-text-tertiary)] shrink-0 ml-auto">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)]" aria-hidden="true">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    no value changes
                  </span>
                )}
              </div>
              {isExpanded && hasTokenChanges && (
                <div className="bg-[var(--color-figma-bg-secondary)] border-t border-[var(--color-figma-border)]">
                  {fileTokenChanges.map((tc, j) => (
                    <TokenChangeRow key={j} change={tc} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {tokenPreview !== null && !tokenPreviewLoading && tokenPreview.length > 0 && (
        <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] flex gap-3 text-[10px] text-[var(--color-figma-text-secondary)]">
          {tokenPreview.filter(c => c.status === 'added').length > 0 && <span className="text-[var(--color-figma-success)]">+{tokenPreview.filter(c => c.status === 'added').length} added</span>}
          {tokenPreview.filter(c => c.status === 'modified').length > 0 && <span className="text-[var(--color-figma-warning)]">~{tokenPreview.filter(c => c.status === 'modified').length} modified</span>}
          {tokenPreview.filter(c => c.status === 'removed').length > 0 && <span className="text-[var(--color-figma-error)]">&minus;{tokenPreview.filter(c => c.status === 'removed').length} removed</span>}
        </div>
      )}
    </div>
  );
}

/* ── SyncDiffSummary ────────────────────────────────────────────────────── */

export function SyncDiffSummary({ rows, dirs }: {
  rows: PreviewRow[];
  dirs: Record<string, 'push' | 'pull' | 'skip'>;
}) {
  const pushRows = rows.filter(r => dirs[getDiffRowId(r)] === 'push');
  const pullRows = rows.filter(r => dirs[getDiffRowId(r)] === 'pull');
  const skipCount = rows.filter(r => dirs[getDiffRowId(r)] === 'skip').length;

  const sections: { label: string; arrow: string; items: PreviewRow[]; direction: 'push' | 'pull' }[] = [];
  if (pushRows.length > 0) sections.push({ label: 'Push to Figma', arrow: '\u2191', items: pushRows, direction: 'push' });
  if (pullRows.length > 0) sections.push({ label: 'Pull to local', arrow: '\u2193', items: pullRows, direction: 'pull' });

  if (sections.length === 0) {
    return <p className="mt-1.5 text-[11px] text-[var(--color-figma-text-secondary)]">No changes to apply (all skipped).</p>;
  }

  return (
    <div className="mt-2">
      {sections.map(section => (
        <div key={section.label} className="mb-2">
          <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] mb-1">
            {section.arrow} {section.label} ({section.items.length})
          </div>
          <div className="max-h-36 overflow-y-auto rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
            {section.items.map(r => {
              const isColor = r.localType === 'color' || r.figmaType === 'color';
              const beforeVal = section.direction === 'push' ? r.figmaValue : r.localValue;
              const afterVal = section.direction === 'push' ? r.localValue : r.figmaValue;
              return (
                <div key={getDiffRowId(r)} className="px-2 py-1">
                  <div className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={r.path}>{r.path}</div>
                  {r.targetLabel ? (
                    <div className="mt-0.5 text-[9px] text-[var(--color-figma-text-tertiary)] truncate" title={r.targetLabel}>
                      {r.targetLabel}
                    </div>
                  ) : null}
                  {r.cat === 'conflict' && (
                    <div className="flex flex-col gap-0.5 mt-0.5 ml-1 text-[10px] font-mono">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-[var(--color-figma-error)] shrink-0 w-3">&minus;</span>
                        {isColor && isHexColor(beforeVal) && <DiffSwatch hex={beforeVal} />}
                        <span className="text-[var(--color-figma-text-secondary)] truncate" title={beforeVal ?? ''}>{truncateValue(beforeVal ?? '', 36)}</span>
                      </div>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-[var(--color-figma-success)] shrink-0 w-3">+</span>
                        {isColor && isHexColor(afterVal) && <DiffSwatch hex={afterVal} />}
                        <span className="text-[var(--color-figma-text)] truncate" title={afterVal ?? ''}>{truncateValue(afterVal ?? '', 36)}</span>
                      </div>
                    </div>
                  )}
                  {r.cat !== 'conflict' && (r.localValue ?? r.figmaValue) !== undefined && (
                    <div className="flex items-center gap-1 mt-0.5 ml-1 text-[10px] font-mono min-w-0">
                      {isColor && isHexColor(r.localValue ?? r.figmaValue) && <DiffSwatch hex={(r.localValue ?? r.figmaValue)!} />}
                      <span className="text-[var(--color-figma-text-secondary)] truncate" title={r.localValue ?? r.figmaValue}>{truncateValue((r.localValue ?? r.figmaValue) ?? '', 36)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {skipCount > 0 && (
        <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">{skipCount} item{skipCount !== 1 ? 's' : ''} skipped.</p>
      )}
    </div>
  );
}

/* ── ScopesPill ─────────────────────────────────────────────────────────── */

function ScopesPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-1 py-0 rounded text-[9px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] leading-4">
      {label}
    </span>
  );
}

/* ── ScopesEditor ───────────────────────────────────────────────────────── */

function ScopesEditor({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string }[];
  value: string[];
  onChange: (scopes: string[]) => void;
}) {
  const toggle = useCallback((scope: string) => {
    onChange(
      value.includes(scope)
        ? value.filter(s => s !== scope)
        : [...value, scope],
    );
  }, [value, onChange]);

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-0.5">
      {options.map(opt => (
        <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer group" title={opt.value}>
          <input
            type="checkbox"
            checked={value.includes(opt.value)}
            onChange={() => toggle(opt.value)}
            className="w-3 h-3 rounded"
          />
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] group-hover:text-[var(--color-figma-text)] leading-4 truncate">
            {opt.label}
          </span>
        </label>
      ))}
    </div>
  );
}

/* ── VarDiffRowItem ─────────────────────────────────────────────────────── */

export function VarDiffRowItem({ row, dir, onChange, scopeOptions, scopeValue, onScopesChange, figmaScopeValue, reviewOnly = false }: {
  row: VarDiffRow;
  dir: 'push' | 'pull' | 'skip';
  onChange: (dir: 'push' | 'pull' | 'skip') => void;
  /** Available scope options for this token type */
  scopeOptions?: { label: string; value: string }[];
  /** Current scopes (overridden or from local token) */
  scopeValue?: string[];
  /** Callback when user edits scopes (only provided when editing is allowed) */
  onScopesChange?: (scopes: string[]) => void;
  /** Scopes currently on the Figma variable — shown for figma-only and conflict rows */
  figmaScopeValue?: string[];
  reviewOnly?: boolean;
}) {
  const [scopesExpanded, setScopesExpanded] = useState(false);

  // Determine whether to show scope editing section
  const canEditScopes = !reviewOnly && !!onScopesChange && !!scopeOptions?.length && dir === 'push';
  // For figma-only rows, show figma scopes as info (read-only)
  const showFigmaScopes = row.cat === 'figma-only' && !!figmaScopeValue?.length && !!scopeOptions?.length;

  // Scope conflict: local and figma scopes differ (for conflict rows)
  const scopesDiffer = row.cat === 'conflict' && !scopesAreEqual(scopeValue, figmaScopeValue);

  return (
    <div className="px-3 py-1.5 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] text-[var(--color-figma-text)] truncate font-mono" title={row.path}>{row.path}</div>
          {row.targetLabel ? (
            <div className="mt-0.5 text-[9px] text-[var(--color-figma-text-tertiary)] truncate" title={row.targetLabel}>
              {row.targetLabel}
            </div>
          ) : null}
        </div>
        {reviewOnly ? (
          <span className="shrink-0 rounded border border-[var(--color-figma-border)] px-1.5 py-0.5 text-[9px] text-[var(--color-figma-text-secondary)]">
            Review only
          </span>
        ) : (
          <select
            value={dir}
            onChange={e => onChange(e.target.value as 'push' | 'pull' | 'skip')}
            className="text-[10px] border border-[var(--color-figma-border)] rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] outline-none px-1 py-0.5 shrink-0"
          >
            <option value="push">{'\u2191'} Push to Figma</option>
            <option value="pull">{'\u2193'} Pull to local</option>
            <option value="skip">Skip</option>
          </select>
        )}
      </div>
      {row.cat === 'conflict' && (
        <div className="flex items-center gap-1.5 pl-0.5">
          <ValueCell label="Local" value={row.localValue} type={row.localType} />
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="shrink-0 text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
            <path d="M1 4h6M5 2l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <ValueCell label="Figma" value={row.figmaValue} type={row.figmaType} />
        </div>
      )}
      {row.cat === 'local-only' && row.localValue !== undefined && (
        <div className="flex items-center gap-1 pl-0.5">
          {(row.localType === 'color' || isHexColor(row.localValue)) && isHexColor(row.localValue) && <DiffSwatch hex={row.localValue} />}
          <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)]">{truncateValue(row.localValue)}</span>
        </div>
      )}
      {row.cat === 'figma-only' && row.figmaValue !== undefined && (
        <div className="flex items-center gap-1 pl-0.5">
          {(row.figmaType === 'color' || isHexColor(row.figmaValue)) && isHexColor(row.figmaValue) && <DiffSwatch hex={row.figmaValue} />}
          <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)]">{truncateValue(row.figmaValue)}</span>
        </div>
      )}

      {/* ── Scope section ─────────────────────────────────────────────── */}
      {(canEditScopes || showFigmaScopes) && (
        <div className="pl-0.5">
          {/* Scope summary row */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[9px] text-[var(--color-figma-text-tertiary)] shrink-0">Scopes:</span>
            {(canEditScopes ? (scopeValue?.length ? scopeValue : null) : (figmaScopeValue ?? null))
              ? (canEditScopes ? scopeValue! : figmaScopeValue!).map(s => {
                  const opt = scopeOptions!.find(o => o.value === s);
                  return <ScopesPill key={s} label={opt?.label ?? s} />;
                })
              : <span className="text-[9px] text-[var(--color-figma-text-tertiary)] italic">All scopes</span>
            }
            {scopesDiffer && (
              <span className="text-[9px] text-yellow-600 font-medium shrink-0" title="Local and Figma scopes differ">scope conflict</span>
            )}
            {canEditScopes && (
              <button
                onClick={() => setScopesExpanded(v => !v)}
                className="ml-auto text-[9px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] flex items-center gap-0.5 shrink-0"
                aria-expanded={scopesExpanded}
                aria-label="Edit scopes"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${scopesExpanded ? 'rotate-90' : ''}`} aria-hidden="true">
                  <path d="M2 1l4 3-4 3V1z" />
                </svg>
                Edit
              </button>
            )}
          </div>

          {/* Scope editor (expanded) */}
          {canEditScopes && scopesExpanded && (
            <div className="mt-1 pl-1 border-l-2 border-[var(--color-figma-accent)]/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">Select which Figma properties can use this variable</span>
                {scopeValue?.length ? (
                  <button
                    onClick={() => onScopesChange!([])}
                    className="text-[9px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)]"
                  >
                    Clear (all)
                  </button>
                ) : (
                  <button
                    onClick={() => onScopesChange!(scopeOptions!.map(o => o.value))}
                    className="text-[9px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)]"
                  >
                    Select all
                  </button>
                )}
              </div>
              <ScopesEditor
                options={scopeOptions!}
                value={scopeValue ?? []}
                onChange={onScopesChange!}
              />
            </div>
          )}

          {/* Figma-only: show figma scopes conflict hint for conflict rows */}
          {row.cat === 'conflict' && scopesDiffer && figmaScopeValue !== undefined && scopeOptions && (
            <div className="mt-0.5 flex items-start gap-1 flex-wrap">
              <span className="text-[9px] text-[var(--color-figma-text-tertiary)] shrink-0">Figma:</span>
              {figmaScopeValue.length
                ? figmaScopeValue.map(s => {
                    const opt = scopeOptions.find(o => o.value === s);
                    return <ScopesPill key={s} label={opt?.label ?? s} />;
                  })
                : <span className="text-[9px] text-[var(--color-figma-text-tertiary)] italic">All scopes</span>
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function scopesAreEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const aArr = a?.length ? [...a].sort() : [];
  const bArr = b?.length ? [...b].sort() : [];
  return aArr.length === bArr.length && aArr.every((s, i) => s === bArr[i]);
}
