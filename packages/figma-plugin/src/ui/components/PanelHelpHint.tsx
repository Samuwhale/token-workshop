/**
 * PanelHelpHint — contextual "what is this?" affordance for advanced panels.
 *
 * Renders a small (i) icon button that toggles an inline description banner.
 * Help starts collapsed. Users can open it from the header icon.
 */

import { HelpCircle, X } from 'lucide-react';
import { useState, useCallback } from 'react';
import { IconButton, StatusBanner } from '../primitives';

/** Icon-only version for tight headers — just the (?) button, renders banner via a sibling slot */
export function PanelHelpIcon({ title, expanded, onToggle }: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <IconButton
      size="sm"
      onClick={onToggle}
      className={expanded ? 'text-[var(--color-figma-accent)]' : ''}
      title={expanded ? 'Hide help' : `What is ${title}?`}
      aria-label={expanded ? 'Hide help' : `What is ${title}?`}
      aria-expanded={expanded}
    >
      <HelpCircle size={12} strokeWidth={2} aria-hidden />
    </IconButton>
  );
}

export function PanelHelpBanner({ title, description, onDismiss }: {
  title: string;
  description: string;
  onDismiss: () => void;
}) {
  return (
    <StatusBanner
      tone="info"
      title={title}
      className="shrink-0 px-3"
      actions={
        <IconButton
          size="sm"
          onClick={onDismiss}
          title="Dismiss hint"
          aria-label="Dismiss hint"
        >
          <X size={10} strokeWidth={2.25} aria-hidden />
        </IconButton>
      }
    >
      {description}
    </StatusBanner>
  );
}

/** Hook for panels that need the icon in one place and the banner in another */
export function usePanelHelp(options?: { defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(options?.defaultExpanded ?? false);

  const toggle = useCallback(() => setExpanded(prev => !prev), []);
  const dismiss = useCallback(() => {
    setExpanded(false);
  }, []);

  return { expanded, toggle, dismiss };
}
