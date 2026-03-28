import { useMemo } from 'react';
import type { TokenMapEntry } from '../../shared/types';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import { ValuePreview } from './ValuePreview';
import { resolveAliasChain } from './AliasPicker';
import { resolveTokenValue, isAlias } from '../../shared/resolveAlias';
import { formatDisplayPath } from './tokenListUtils';

interface TokenDetailPreviewProps {
  tokenPath: string;
  tokenName?: string;
  setName: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
  onEdit: () => void;
  onClose: () => void;
  onNavigateToAlias?: (path: string) => void;
}

export function TokenDetailPreview({
  tokenPath,
  tokenName,
  setName,
  allTokensFlat,
  pathToSet,
  onEdit,
  onClose,
  onNavigateToAlias,
}: TokenDetailPreviewProps) {
  const entry = allTokensFlat[tokenPath];
  const name = tokenName ?? tokenPath.split('.').pop() ?? tokenPath;
  const type = entry?.$type ?? 'unknown';
  const rawValue = entry?.$value;

  const aliasChain = useMemo(() => {
    if (!rawValue || !isAlias(rawValue)) return null;
    return resolveAliasChain(String(rawValue), allTokensFlat);
  }, [rawValue, allTokensFlat]);

  const resolved = useMemo(() => {
    if (!rawValue) return null;
    if (!isAlias(rawValue)) return null;
    const r = resolveTokenValue(String(rawValue), type, allTokensFlat);
    return r.error ? null : r;
  }, [rawValue, type, allTokensFlat]);

  const resolvedValue = resolved?.value ?? rawValue;

  const displayPath = useMemo(() => formatDisplayPath(tokenPath, name), [tokenPath, name]);

  const valueStr = useMemo(() => {
    if (rawValue == null) return '—';
    if (typeof rawValue === 'object') return JSON.stringify(rawValue, null, 2);
    return String(rawValue);
  }, [rawValue]);

  const resolvedValueStr = useMemo(() => {
    if (resolvedValue == null || resolvedValue === rawValue) return null;
    if (typeof resolvedValue === 'object') return JSON.stringify(resolvedValue, null, 2);
    return String(resolvedValue);
  }, [resolvedValue, rawValue]);

  const tokenSet = pathToSet?.[tokenPath] ?? setName;

  if (!entry) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-figma-border)]">
          <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">Preview</span>
          <button onClick={onClose} className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]" title="Close">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4 text-[10px] text-[var(--color-figma-text-tertiary)]">
          Token not found
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-figma-border)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--color-figma-text)] truncate mr-2">Preview</span>
        <button onClick={onClose} className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] shrink-0" title="Close">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Token name + type */}
        <div className="px-3 pt-3 pb-2">
          <div className="flex items-center gap-1.5 mb-1">
            <ValuePreview type={type} value={resolvedValue} />
            <span className="text-[12px] font-semibold text-[var(--color-figma-text)] truncate">{name}</span>
          </div>
          <div className="text-[9px] text-[var(--color-figma-text-tertiary)] font-mono truncate mb-1.5" title={tokenPath}>
            {displayPath}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`px-1 py-0.5 rounded text-[8px] font-medium ${TOKEN_TYPE_BADGE_CLASS[type] ?? 'token-type-string'}`}>{type}</span>
            <span className="text-[8px] text-[var(--color-figma-text-tertiary)]">{tokenSet}</span>
          </div>
        </div>

        {/* Value section */}
        <div className="px-3 py-2 border-t border-[var(--color-figma-border)]">
          <div className="text-[9px] font-semibold text-[var(--color-figma-text-secondary)] uppercase tracking-wider mb-1">Value</div>
          <div className="text-[10px] font-mono text-[var(--color-figma-text)] break-all whitespace-pre-wrap bg-[var(--color-figma-bg-secondary)] rounded px-2 py-1.5 max-h-24 overflow-y-auto">
            {valueStr}
          </div>
        </div>

        {/* Alias chain */}
        {aliasChain && aliasChain.length > 0 && (
          <div className="px-3 py-2 border-t border-[var(--color-figma-border)]">
            <div className="text-[9px] font-semibold text-[var(--color-figma-text-secondary)] uppercase tracking-wider mb-1">Reference chain</div>
            <div className="flex flex-col gap-0.5">
              {aliasChain.map((step, i) => (
                <div key={step.path} className="flex items-center gap-1">
                  {i > 0 && <span className="text-[8px] text-[var(--color-figma-text-tertiary)]">→</span>}
                  <button
                    className="text-[10px] font-mono text-[var(--color-figma-accent)] hover:underline truncate text-left"
                    onClick={() => onNavigateToAlias?.(step.path)}
                    title={step.path}
                  >
                    {step.path}
                  </button>
                </div>
              ))}
            </div>
            {resolvedValueStr && (
              <div className="mt-1.5">
                <div className="text-[9px] text-[var(--color-figma-text-tertiary)] mb-0.5">Resolved</div>
                <div className="flex items-center gap-1.5">
                  <ValuePreview type={type} value={resolvedValue} />
                  <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate">{resolvedValueStr}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Large visual preview for color tokens */}
        {type === 'color' && typeof resolvedValue === 'string' && (
          <div className="px-3 py-2 border-t border-[var(--color-figma-border)]">
            <div className="text-[9px] font-semibold text-[var(--color-figma-text-secondary)] uppercase tracking-wider mb-1">Preview</div>
            <div
              className="w-full h-16 rounded border border-[var(--color-figma-border)]"
              style={{ backgroundColor: resolvedValue }}
            />
          </div>
        )}

        {/* Typography preview */}
        {type === 'typography' && typeof resolvedValue === 'object' && resolvedValue !== null && (
          <div className="px-3 py-2 border-t border-[var(--color-figma-border)]">
            <div className="text-[9px] font-semibold text-[var(--color-figma-text-secondary)] uppercase tracking-wider mb-1">Preview</div>
            <div
              className="p-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] overflow-hidden"
              style={{
                fontFamily: resolvedValue.fontFamily || 'inherit',
                fontWeight: resolvedValue.fontWeight || 400,
                fontSize: typeof resolvedValue.fontSize === 'object'
                  ? `${resolvedValue.fontSize.value}${resolvedValue.fontSize.unit}`
                  : resolvedValue.fontSize ? `${resolvedValue.fontSize}px` : '14px',
                lineHeight: resolvedValue.lineHeight ? (typeof resolvedValue.lineHeight === 'object'
                  ? `${resolvedValue.lineHeight.value}${resolvedValue.lineHeight.unit}`
                  : resolvedValue.lineHeight) : undefined,
              }}
            >
              The quick brown fox
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-3 py-2 border-t border-[var(--color-figma-border)] shrink-0 flex gap-1.5">
        <button
          onClick={onEdit}
          className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity"
        >
          Edit
        </button>
        <button
          onClick={() => { navigator.clipboard.writeText(tokenPath); }}
          className="px-2 py-1.5 rounded text-[10px] font-medium bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          title="Copy path"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        </button>
        <button
          onClick={() => { navigator.clipboard.writeText(valueStr); }}
          className="px-2 py-1.5 rounded text-[10px] font-medium bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          title="Copy value"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
        </button>
      </div>
    </div>
  );
}
