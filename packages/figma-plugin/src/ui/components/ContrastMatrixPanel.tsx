import { useState, useMemo } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import type { ThemeDimension } from '@tokenmanager/core';
import { hexToLuminance, wcagContrast } from '../shared/colorUtils';
import { normalizeHex } from '@tokenmanager/core';
import { resolveThemeOption } from '../shared/comparisonUtils';

export interface ContrastMatrixPanelProps {
  /** Non-alias color tokens sorted by luminance */
  colorTokens: { path: string; hex: string }[];
  dimensions: ThemeDimension[];
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
}

export function ContrastMatrixPanel({
  colorTokens,
  dimensions,
  allTokensFlat,
  pathToSet,
}: ContrastMatrixPanelProps) {
  const [showContrastMatrix, setShowContrastMatrix] = useState(false);
  const [contrastPage, setContrastPage] = useState(0);
  const [contrastFailuresOnly, setContrastFailuresOnly] = useState(false);
  const [contrastCopied, setContrastCopied] = useState(false);
  const [contrastGroupFilter, setContrastGroupFilter] = useState<string>('all');
  const [contrastSortMode, setContrastSortMode] = useState<'luminance' | 'failures'>('luminance');
  const [contrastMultiTheme, setContrastMultiTheme] = useState(false);
  const [contrastThemeFilter, setContrastThemeFilter] = useState<Set<string> | null>(null);

  // All sets referenced in any theme option
  const themedSetsForContrast = useMemo(() => {
    if (dimensions.length === 0) return undefined;
    const sets = new Set<string>();
    for (const dim of dimensions) {
      for (const opt of dim.options) {
        for (const setName of Object.keys(opt.sets)) sets.add(setName);
      }
    }
    return sets.size > 0 ? sets : undefined;
  }, [dimensions]);

  const allThemeOptionKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const dim of dimensions) {
      for (const opt of dim.options) keys.add(`${dim.id}:${opt.name}`);
    }
    return keys;
  }, [dimensions]);

  const activeContrastThemeKeys = contrastThemeFilter ?? allThemeOptionKeys;

  const perThemeResolved = useMemo(() => {
    if (!contrastMultiTheme || dimensions.length === 0) return null;
    const result = new Map<string, Record<string, TokenMapEntry>>();
    for (const dim of dimensions) {
      for (const opt of dim.options) {
        const key = `${dim.id}:${opt.name}`;
        if (!activeContrastThemeKeys.has(key)) continue;
        result.set(key, resolveThemeOption(opt, allTokensFlat, pathToSet, themedSetsForContrast));
      }
    }
    return result.size > 0 ? result : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contrastMultiTheme, dimensions, allTokensFlat, pathToSet, themedSetsForContrast, contrastThemeFilter, allThemeOptionKeys]);

  const multiThemeColorTokens = useMemo((): { path: string; hexByTheme: Map<string, string> }[] | null => {
    if (!perThemeResolved) return null;
    const hexByThemePerPath = new Map<string, Map<string, string>>();
    const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
    for (const [themeKey, resolved] of perThemeResolved) {
      for (const [path, entry] of Object.entries(resolved)) {
        if (entry.$type !== 'color') continue;
        const v = entry.$value;
        if (typeof v !== 'string' || !HEX_RE.test(v)) continue;
        let themeMap = hexByThemePerPath.get(path);
        if (!themeMap) { themeMap = new Map(); hexByThemePerPath.set(path, themeMap); }
        themeMap.set(themeKey, normalizeHex(v));
      }
    }
    const result = [...hexByThemePerPath.entries()].map(([path, hexByTheme]) => ({ path, hexByTheme }));
    result.sort((a, b) => {
      const avgLum = (t: typeof a) => {
        let sum = 0; let cnt = 0;
        for (const hex of t.hexByTheme.values()) { const l = hexToLuminance(hex); if (l !== null) { sum += l; cnt++; } }
        return cnt > 0 ? sum / cnt : 0;
      };
      return avgLum(a) - avgLum(b);
    });
    return result;
  }, [perThemeResolved]);

  const CONTRAST_PAGE_SIZE = 16;
  const hasMultiThemeOptions = dimensions.some(d => d.options.length >= 2);
  const isMultiMode = contrastMultiTheme && multiThemeColorTokens !== null && multiThemeColorTokens.length >= 2;

  const themeKeyLabel = (key: string): string => {
    const [dimId, optName] = key.split(':');
    const dim = dimensions.find(d => d.id === dimId);
    return dimensions.length > 1 && dim ? `${dim.name}: ${optName}` : (optName ?? key);
  };

  type MatrixToken = { path: string; hex: string; hexByTheme?: Map<string, string> };
  const sourceTokens: MatrixToken[] = isMultiMode
    ? multiThemeColorTokens!.map(t => {
        const firstHex = t.hexByTheme.values().next().value as string ?? '#000000';
        return { path: t.path, hex: firstHex, hexByTheme: t.hexByTheme };
      })
    : colorTokens;

  const availableGroups = Array.from(new Set(sourceTokens.map(t => t.path.split('.')[0]))).sort();
  const filteredTokens = contrastGroupFilter === 'all' ? sourceTokens : sourceTokens.filter(t => t.path.split('.')[0] === contrastGroupFilter);

  const getCellContrast = (fg: MatrixToken, bg: MatrixToken): {
    ratio: number | null;
    tooltip: string;
    failingThemeCount: number;
    totalThemeCount: number;
  } => {
    if (isMultiMode && fg.hexByTheme && bg.hexByTheme && perThemeResolved) {
      const perTheme: { label: string; ratio: number | null }[] = [];
      for (const themeKey of perThemeResolved.keys()) {
        const fgHex = fg.hexByTheme.get(themeKey);
        const bgHex = bg.hexByTheme.get(themeKey);
        perTheme.push({ label: themeKeyLabel(themeKey), ratio: fgHex && bgHex ? wcagContrast(fgHex, bgHex) : null });
      }
      const valid = perTheme.filter((t): t is { label: string; ratio: number } => t.ratio !== null);
      const minRatio = valid.length > 0 ? Math.min(...valid.map(t => t.ratio)) : null;
      const failCount = valid.filter(t => t.ratio < 4.5).length;
      const tooltip = perTheme.map(t => `${t.label}: ${t.ratio !== null ? t.ratio.toFixed(1) + ':1' : 'N/A'}`).join(' | ');
      return { ratio: minRatio, tooltip, failingThemeCount: failCount, totalThemeCount: valid.length };
    }
    const r = wcagContrast(fg.hex, bg.hex);
    return { ratio: r, tooltip: `${fg.path} on ${bg.path}: ${r?.toFixed(2)}:1`, failingThemeCount: 0, totalThemeCount: 0 };
  };

  let displayTokens: MatrixToken[];
  if (contrastSortMode === 'failures') {
    const failureCounts = new Map<string, number>();
    for (const t of filteredTokens) {
      let cnt = 0;
      for (const other of filteredTokens) {
        if (other.path === t.path) continue;
        const { ratio } = getCellContrast(t, other);
        if (ratio !== null && ratio < 4.5) cnt++;
      }
      failureCounts.set(t.path, cnt);
    }
    displayTokens = [...filteredTokens].sort((a, b) => (failureCounts.get(b.path) ?? 0) - (failureCounts.get(a.path) ?? 0));
  } else {
    displayTokens = filteredTokens;
  }

  type FailPair = { fg: MatrixToken; bg: MatrixToken; ratio: number; failingThemeCount: number; totalThemeCount: number };
  const allFailingPairs: FailPair[] = [];
  for (let i = 0; i < displayTokens.length; i++) {
    for (let j = 0; j < displayTokens.length; j++) {
      if (i === j) continue;
      const { ratio, failingThemeCount, totalThemeCount } = getCellContrast(displayTokens[i], displayTokens[j]);
      if (ratio !== null && ratio < 4.5) allFailingPairs.push({ fg: displayTokens[i], bg: displayTokens[j], ratio, failingThemeCount, totalThemeCount });
    }
  }
  allFailingPairs.sort((a, b) => a.ratio - b.ratio);
  const totalPages = Math.ceil(displayTokens.length / CONTRAST_PAGE_SIZE);
  const pageStart = contrastPage * CONTRAST_PAGE_SIZE;
  const pagedTokens = displayTokens.slice(pageStart, pageStart + CONTRAST_PAGE_SIZE);

  if (colorTokens.length < 2) return null;

  return (
    <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
      <button onClick={() => setShowContrastMatrix(v => !v)} className="w-full px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
        <span>Color Contrast Matrix ({contrastGroupFilter === 'all' ? sourceTokens.length : displayTokens.length} tokens{isMultiMode ? ` · ${activeContrastThemeKeys.size} theme${activeContrastThemeKeys.size !== 1 ? 's' : ''}` : ''})</span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showContrastMatrix ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
      </button>
      {showContrastMatrix && (
        <div className="overflow-auto max-h-96 p-2">
          {/* Cross-theme toggle */}
          {hasMultiThemeOptions && (
            <div className="flex items-center gap-2 mb-2 px-1 pb-2 border-b border-[var(--color-figma-border)]">
              <button
                onClick={() => { setContrastMultiTheme(v => !v); setContrastPage(0); setContrastThemeFilter(null); }}
                className={`flex items-center gap-1.5 px-2 py-0.5 text-[9px] rounded border transition-colors ${contrastMultiTheme ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                title="Check contrast across multiple theme options simultaneously — shows worst-case ratio"
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="12" r="7"/><circle cx="15" cy="12" r="7"/></svg>
                Cross-theme
              </button>
              {contrastMultiTheme && (
                <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
                  {dimensions.map(dim => dim.options.length >= 2 ? (
                    <div key={dim.id} className="flex items-center gap-1 flex-wrap">
                      {dimensions.length > 1 && <span className="text-[8px] text-[var(--color-figma-text-secondary)]">{dim.name}:</span>}
                      {dim.options.map(opt => {
                        const key = `${dim.id}:${opt.name}`;
                        const isActive = activeContrastThemeKeys.has(key);
                        return (
                          <button
                            key={key}
                            onClick={() => {
                              setContrastPage(0);
                              setContrastThemeFilter(prev => {
                                const current = prev ?? allThemeOptionKeys;
                                const next = new Set(current);
                                if (next.has(key)) {
                                  if (next.size > 1) next.delete(key);
                                } else {
                                  next.add(key);
                                }
                                return next;
                              });
                            }}
                            className={`px-1.5 py-0.5 text-[8px] rounded border transition-colors ${isActive ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                          >
                            {opt.name}
                          </button>
                        );
                      })}
                    </div>
                  ) : null)}
                </div>
              )}
            </div>
          )}
          {contrastMultiTheme && multiThemeColorTokens === null && (
            <div className="text-[9px] text-[var(--color-figma-text-secondary)] px-1 mb-2">Resolving theme tokens…</div>
          )}
          <div className="flex items-center justify-between mb-2 px-1">
            <button onClick={() => { setContrastFailuresOnly(v => !v); setContrastPage(0); }} className={`flex items-center gap-1 px-2 py-0.5 text-[9px] rounded border transition-colors ${contrastFailuresOnly ? 'border-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}>
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              Failures only{contrastFailuresOnly && allFailingPairs.length > 0 ? ` (${allFailingPairs.length})` : ''}
            </button>
            <button onClick={() => {
              const rows: string[] = isMultiMode
                ? ['fg_token,bg_token,theme,contrast_ratio,level']
                : ['fg_token,bg_token,contrast_ratio,level'];
              for (const fg of displayTokens) {
                for (const bg of displayTokens) {
                  if (fg.path === bg.path) continue;
                  if (isMultiMode && fg.hexByTheme && bg.hexByTheme && perThemeResolved) {
                    for (const themeKey of perThemeResolved.keys()) {
                      const fgHex = fg.hexByTheme.get(themeKey);
                      const bgHex = bg.hexByTheme.get(themeKey);
                      const r = fgHex && bgHex ? wcagContrast(fgHex, bgHex) : null;
                      const level = r === null ? 'N/A' : r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : 'Fail';
                      rows.push(`"${fg.path}","${bg.path}","${themeKeyLabel(themeKey)}",${r !== null ? r.toFixed(2) : ''},"${level}"`);
                    }
                  } else {
                    const r = wcagContrast(fg.hex, bg.hex);
                    const level = r === null ? 'N/A' : r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : 'Fail';
                    rows.push(`"${fg.path}","${bg.path}",${r !== null ? r.toFixed(2) : ''},"${level}"`);
                  }
                }
              }
              navigator.clipboard.writeText(rows.join('\n')).then(() => { setContrastCopied(true); setTimeout(() => setContrastCopied(false), 2000); });
            }} className="flex items-center gap-1 px-2 py-0.5 text-[9px] rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              {contrastCopied ? 'Copied!' : 'Copy as CSV'}
            </button>
          </div>
          {availableGroups.length > 1 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 px-1">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[8px] text-[var(--color-figma-text-secondary)]">Group:</span>
                <button onClick={() => { setContrastGroupFilter('all'); setContrastPage(0); }} className={`px-1.5 py-0.5 text-[8px] rounded border transition-colors ${contrastGroupFilter === 'all' ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}>All</button>
                {availableGroups.map(g => (
                  <button key={g} onClick={() => { setContrastGroupFilter(g); setContrastPage(0); }} className={`px-1.5 py-0.5 text-[8px] rounded border transition-colors ${contrastGroupFilter === g ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}>{g}</button>
                ))}
              </div>
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-[8px] text-[var(--color-figma-text-secondary)]">Sort:</span>
                <button onClick={() => { setContrastSortMode('luminance'); setContrastPage(0); }} className={`px-1.5 py-0.5 text-[8px] rounded border transition-colors ${contrastSortMode === 'luminance' ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}>Luminance</button>
                <button onClick={() => { setContrastSortMode('failures'); setContrastPage(0); }} className={`px-1.5 py-0.5 text-[8px] rounded border transition-colors ${contrastSortMode === 'failures' ? 'border-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}>Most failures</button>
              </div>
            </div>
          )}
          {contrastFailuresOnly ? (
            allFailingPairs.length === 0 ? (
              <div className="text-[9px] text-[var(--color-figma-text-secondary)] text-center py-4">No failing pairs — all combinations pass AA (≥4.5:1)</div>
            ) : (
              <table className="text-[8px] border-collapse w-full" aria-label="Failing color contrast pairs">
                <thead>
                  <tr className="text-[var(--color-figma-text-secondary)]">
                    <th scope="col" className="px-1 py-0.5 text-left font-normal">Foreground</th>
                    <th scope="col" className="px-1 py-0.5 text-left font-normal">Background</th>
                    <th scope="col" className="px-1 py-0.5 text-right font-normal">Worst ratio</th>
                    {isMultiMode && <th scope="col" className="px-1 py-0.5 text-right font-normal">Fails in</th>}
                  </tr>
                </thead>
                <tbody>
                  {allFailingPairs.map(({ fg, bg, ratio, failingThemeCount, totalThemeCount }) => (
                    <tr key={`${fg.path}|${bg.path}`} className="border-t border-[var(--color-figma-border)]">
                      <td className="px-1 py-0.5"><div className="flex items-center gap-1"><div className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: fg.hex }} /><span className="text-[var(--color-figma-text-secondary)] truncate max-w-[80px]">{fg.path.split('.').pop()}</span></div></td>
                      <td className="px-1 py-0.5"><div className="flex items-center gap-1"><div className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: bg.hex }} /><span className="text-[var(--color-figma-text-secondary)] truncate max-w-[80px]">{bg.path.split('.').pop()}</span></div></td>
                      <td className="px-1 py-0.5 text-right"><span className="text-[var(--color-figma-error)]">{ratio.toFixed(1)}:1</span></td>
                      {isMultiMode && <td className="px-1 py-0.5 text-right text-[var(--color-figma-text-secondary)]">{failingThemeCount}/{totalThemeCount}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            <>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)]">Tokens {pageStart + 1}–{Math.min(pageStart + CONTRAST_PAGE_SIZE, displayTokens.length)} of {displayTokens.length}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setContrastPage(p => Math.max(0, p - 1))} disabled={contrastPage === 0} className="px-1.5 py-0.5 text-[9px] rounded border border-[var(--color-figma-border)] disabled:opacity-30 hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed" aria-label="Previous page">‹</button>
                    {Array.from({ length: totalPages }, (_, i) => (
                      <button key={i} onClick={() => setContrastPage(i)} className={`px-1.5 py-0.5 text-[9px] rounded border ${i === contrastPage ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)]'}`} aria-label={`Page ${i + 1}`}>{i + 1}</button>
                    ))}
                    <button onClick={() => setContrastPage(p => Math.min(totalPages - 1, p + 1))} disabled={contrastPage === totalPages - 1} className="px-1.5 py-0.5 text-[9px] rounded border border-[var(--color-figma-border)] disabled:opacity-30 hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed" aria-label="Next page">›</button>
                  </div>
                </div>
              )}
              <table className="text-[8px] border-collapse" aria-label="Color contrast matrix">
                <thead>
                  <tr>
                    <th scope="col" className="px-1 py-0.5 text-left text-[var(--color-figma-text-secondary)] font-normal sticky left-0 bg-[var(--color-figma-bg)]">FG \ BG</th>
                    {pagedTokens.map(bg => (
                      <th key={bg.path} scope="col" title={bg.path} className="px-1 py-0.5 text-center font-normal max-w-[40px]">
                        <div className="w-4 h-4 rounded border border-[var(--color-figma-border)] mx-auto" style={{ background: bg.hex }} aria-hidden="true" />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedTokens.map(fg => (
                    <tr key={fg.path}>
                      <th scope="row" className="px-1 py-0.5 sticky left-0 bg-[var(--color-figma-bg)] font-normal">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: fg.hex }} aria-hidden="true" />
                          <span className="text-[var(--color-figma-text-secondary)] truncate max-w-[60px]">{fg.path.split('.').pop()}</span>
                        </div>
                      </th>
                      {pagedTokens.map(bg => {
                        if (fg.path === bg.path) return <td key={bg.path} className="px-1 py-0.5 text-center bg-[var(--color-figma-bg-hover)]" aria-label="same token">—</td>;
                        const { ratio: r, tooltip, failingThemeCount, totalThemeCount } = getCellContrast(fg, bg);
                        const aa = r !== null && r >= 4.5;
                        const aaa = r !== null && r >= 7;
                        const partialFail = isMultiMode && aa && failingThemeCount > 0;
                        return (
                          <td key={bg.path} title={tooltip} className={`px-1 py-0.5 text-center ${aaa ? 'bg-[var(--color-figma-success)]/20' : aa ? (partialFail ? 'bg-amber-500/20' : 'bg-[var(--color-figma-warning)]/10') : 'bg-[var(--color-figma-error)]/10'}`}>
                            <span className={aaa ? 'text-[var(--color-figma-success)]' : aa ? (partialFail ? 'text-amber-500' : 'text-[var(--color-figma-warning)]') : 'text-[var(--color-figma-error)]'} aria-hidden="true">
                              {r !== null ? r.toFixed(1) : '—'}
                            </span>
                            {isMultiMode && !aaa && failingThemeCount > 0 && totalThemeCount > 0 && (
                              <span className="block text-[6px] leading-none mt-0.5 text-[var(--color-figma-text-secondary)]">{failingThemeCount}/{totalThemeCount}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex gap-3 mt-2 px-1 text-[8px] text-[var(--color-figma-text-secondary)]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[var(--color-figma-success)]/20 border border-[var(--color-figma-success)]/40" />AAA (≥7:1)</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[var(--color-figma-warning)]/10 border border-[var(--color-figma-warning)]/40" />AA (≥4.5:1)</span>
                {isMultiMode && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500/20 border border-amber-500/40" />AA in some themes</span>}
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-error)]/30" />Fail</span>
              </div>
              {isMultiMode && (
                <p className="mt-1 px-1 text-[8px] text-[var(--color-figma-text-secondary)]">Ratio shown is the worst case across selected themes. Hover a cell to see per-theme breakdown.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
