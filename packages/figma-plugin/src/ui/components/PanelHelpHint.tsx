/**
 * PanelHelpHint — contextual "what is this?" affordance for advanced panels.
 *
 * Renders a small (i) icon button that toggles an inline description banner.
 * Dismissed state is persisted per-panel in localStorage so the hint only
 * shows once (users can re-open it via the icon).
 */

import { useState, useCallback } from 'react';
import { lsGet, lsSet } from '../shared/storage';

interface PanelHelpHintProps {
  /** Unique key for localStorage persistence, e.g. "resolvers" */
  panelKey: string;
  /** Short one-line label shown in the banner header */
  title: string;
  /** Description paragraph(s) */
  description: string;
}

const STORAGE_PREFIX = 'tm-panel-hint-dismissed-';

export function PanelHelpHint({ panelKey, title, description }: PanelHelpHintProps) {
  const storageKey = STORAGE_PREFIX + panelKey;
  const [dismissed, setDismissed] = useState(() => lsGet(storageKey) === '1');
  const [expanded, setExpanded] = useState(!dismissed);

  const toggle = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  const dismiss = useCallback(() => {
    setExpanded(false);
    setDismissed(true);
    lsSet(storageKey, '1');
  }, [storageKey]);

  return (
    <>
      {/* Toggle button — always visible in the header area */}
      <button
        onClick={toggle}
        className={`p-1 rounded transition-colors ${
          expanded
            ? 'text-[var(--color-figma-accent)]'
            : 'text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]'
        }`}
        title={expanded ? 'Hide help' : `What is ${title}?`}
        aria-label={expanded ? 'Hide help' : `What is ${title}?`}
        aria-expanded={expanded}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>

      {/* Expandable description banner */}
      {expanded && (
        <div className="px-3 py-2 bg-[var(--color-figma-accent)]/5 border-b border-[var(--color-figma-accent)]/10 text-secondary text-[var(--color-figma-text-secondary)] leading-relaxed flex items-start gap-2">
          <div className="flex-1">
            <span className="font-semibold text-[var(--color-figma-text)]">{title}</span>
            {' — '}
            {description}
          </div>
          <button
            onClick={dismiss}
            className="shrink-0 mt-0.5 p-1 rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] transition-colors"
            title="Dismiss hint"
            aria-label="Dismiss hint"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}

/** Icon-only version for tight headers — just the (?) button, renders banner via a sibling slot */
export function PanelHelpIcon({ panelKey: _panelKey, title, expanded, onToggle }: {
  panelKey: string;
  title: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`p-1 rounded transition-colors ${
        expanded
          ? 'text-[var(--color-figma-accent)]'
          : 'text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]'
      }`}
      title={expanded ? 'Hide help' : `What is ${title}?`}
      aria-label={expanded ? 'Hide help' : `What is ${title}?`}
      aria-expanded={expanded}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </button>
  );
}

export function PanelHelpBanner({ title, description, onDismiss }: {
  title: string;
  description: string;
  onDismiss: () => void;
}) {
  return (
    <div className="px-3 py-2 bg-[var(--color-figma-accent)]/5 border-b border-[var(--color-figma-accent)]/10 text-secondary text-[var(--color-figma-text-secondary)] leading-relaxed flex items-start gap-2 shrink-0">
      <div className="flex-1">
        <span className="font-semibold text-[var(--color-figma-text)]">{title}</span>
        {' — '}
        {description}
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 mt-0.5 p-1 rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] transition-colors"
        title="Dismiss hint"
        aria-label="Dismiss hint"
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

/** Hook for panels that need the icon in one place and the banner in another */
export function usePanelHelp(
  panelKey: string,
  options?: { defaultExpanded?: boolean },
) {
  const storageKey = STORAGE_PREFIX + panelKey;
  const defaultExpanded = options?.defaultExpanded ?? true;
  const [dismissed, setDismissed] = useState(() => lsGet(storageKey) === '1');
  const [expanded, setExpanded] = useState(defaultExpanded && !dismissed);

  const toggle = useCallback(() => setExpanded(prev => !prev), []);
  const dismiss = useCallback(() => {
    setExpanded(false);
    setDismissed(true);
    lsSet(storageKey, '1');
  }, [storageKey]);

  return { expanded, dismissed, toggle, dismiss };
}
