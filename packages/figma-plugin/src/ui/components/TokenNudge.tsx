import type { NearbyMatch } from '../hooks/useNearbyTokenMatch';
import { swatchBgColor } from '../shared/colorUtils';
import { formatValue } from './tokenListUtils';
import { formatDisplayPath } from './tokenListUtils';

interface TokenNudgeProps {
  matches: NearbyMatch[];
  tokenType: string;
  onAccept: (tokenPath: string) => void;
  onDismiss?: () => void;
}

/** Link icon (chain) SVG */
function LinkIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function MatchLabel({ label }: { label: 'Exact' | 'Close' }) {
  if (label === 'Exact') {
    return (
      <span className="px-1 py-0.5 rounded text-secondary font-medium bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)]">
        Exact
      </span>
    );
  }
  return (
    <span className="px-1 py-0.5 rounded text-secondary font-medium bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)]">
      Close
    </span>
  );
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-3 h-3 rounded-sm border border-white/10 flex-shrink-0"
      style={{ backgroundColor: swatchBgColor(color) }}
    />
  );
}

function getMatchColor(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function TokenNudge({ matches, tokenType, onAccept, onDismiss }: TokenNudgeProps) {
  if (matches.length === 0) return null;

  const isColor = tokenType === 'color';

  if (matches.length === 1) {
    const m = matches[0];
    const matchColor = isColor ? getMatchColor(m.resolvedValue) : null;
    const pathParts = m.path.split('.');
    const leafName = pathParts[pathParts.length - 1];
    return (
      <div className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded bg-[var(--color-figma-accent)]/8 border border-dashed border-[var(--color-figma-accent)]/30 text-secondary text-[var(--color-figma-accent)]">
        <LinkIcon />
        <span className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className="opacity-60">Did you mean</span>
          <button
            type="button"
            onClick={() => onAccept(m.path)}
            className="inline-flex items-center gap-1 font-medium hover:underline cursor-pointer bg-transparent border-none p-0 text-[var(--color-figma-accent)] text-secondary"
          >
            {matchColor ? <ColorSwatch color={matchColor} /> : null}
            <strong>{`{${formatDisplayPath(m.path, leafName)}}`}</strong>
          </button>
          <MatchLabel label={m.label} />
          {m.label === 'Close' && (
            <span className="opacity-40 text-secondary">
              {isColor ? `ΔE ${m.distance.toFixed(1)}` : formatValue(tokenType, m.resolvedValue)}
            </span>
          )}
        </span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="opacity-40 hover:opacity-100 cursor-pointer bg-transparent border-none p-0 text-[var(--color-figma-accent)] text-secondary leading-none"
            aria-label="Dismiss suggestion"
          >
            &times;
          </button>
        )}
      </div>
    );
  }

  // Multiple matches
  return (
    <div className="w-full rounded bg-[var(--color-figma-accent)]/8 border border-dashed border-[var(--color-figma-accent)]/30 text-secondary text-[var(--color-figma-accent)] overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 opacity-60">
        <span className="flex items-center gap-1">
          <LinkIcon />
          Did you mean one of these tokens?
        </span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="opacity-40 hover:opacity-100 cursor-pointer bg-transparent border-none p-0 text-[var(--color-figma-accent)] text-secondary leading-none"
            aria-label="Dismiss suggestions"
          >
            &times;
          </button>
        )}
      </div>
      {matches.map((m) => {
        const matchColor = isColor ? getMatchColor(m.resolvedValue) : null;
        const pathParts = m.path.split('.');
        const leafName = pathParts[pathParts.length - 1];
        return (
          <button
            key={m.path}
            type="button"
            onClick={() => onAccept(m.path)}
            className="flex items-center gap-1.5 w-full px-2 py-1 hover:bg-[var(--color-figma-accent)]/15 cursor-pointer bg-transparent border-none text-left text-[var(--color-figma-accent)] text-secondary transition-colors"
          >
            {matchColor ? <ColorSwatch color={matchColor} /> : null}
            <strong className="flex-1 min-w-0 truncate">{`{${formatDisplayPath(m.path, leafName)}}`}</strong>
            <MatchLabel label={m.label} />
            {m.label === 'Close' && isColor && (
              <span className="opacity-40 text-secondary">ΔE {m.distance.toFixed(1)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
