import { adaptShortcut } from '../shared/utils';

interface ShortcutSection {
  header: string;
  shortcuts: { keys: string[]; label: string }[];
}

const SECTIONS: ShortcutSection[] = [
  {
    header: 'Global',
    shortcuts: [
      { keys: ['⌘K'], label: 'Open command palette' },
      { keys: ['⌘⇧V'], label: 'Paste tokens' },
      { keys: ['⌘,'], label: 'Open settings' },
      { keys: ['⌘Z'], label: 'Undo' },
      { keys: ['⌘⇧Z', '⌘Y'], label: 'Redo' },
    ],
  },
  {
    header: 'Navigation',
    shortcuts: [
      { keys: ['⌘1'], label: 'Go to Define' },
      { keys: ['⌘2'], label: 'Go to Apply' },
      { keys: ['⌘3'], label: 'Go to Ship' },
      { keys: ['⌘⇧S'], label: 'Quick-switch token set' },
    ],
  },
  {
    header: 'Command Palette',
    shortcuts: [
      { keys: ['↑↓'], label: 'Navigate results' },
      { keys: ['↵'], label: 'Run selected command' },
      { keys: ['>'], label: 'Switch to token search' },
      { keys: ['Esc'], label: 'Close palette' },
    ],
  },
  {
    header: 'Inspect',
    shortcuts: [
      { keys: ['⌘⇧A'], label: 'Quick apply token to selection' },
      { keys: ['⌘T'], label: 'Create token from selection' },
      { keys: ['⌘⇧D'], label: 'Toggle deep inspect' },
    ],
  },
  {
    header: 'Token List',
    shortcuts: [
      { keys: ['N'], label: 'New token' },
      { keys: ['Double-click'], label: 'Edit token' },
      { keys: ['/'], label: 'Focus search' },
      { keys: ['M'], label: 'Toggle multi-select mode' },
      { keys: ['↑↓'], label: 'Navigate rows' },
      { keys: ['←→'], label: 'Collapse / expand group' },
      { keys: ['Esc'], label: 'Exit multi-select / close form' },
      { keys: ['⌘C'], label: 'Copy selected tokens as JSON' },
      { keys: ['⌘→'], label: 'Expand all groups' },
      { keys: ['⌘←'], label: 'Collapse all groups' },
    ],
  },
  {
    header: 'Token Editor',
    shortcuts: [
      { keys: ['⌘L'], label: 'Toggle reference mode' },
      { keys: ['⌘↵'], label: 'Save token' },
      { keys: ['⌘⇧↵'], label: 'Save and create another' },
      { keys: ['Esc'], label: 'Back / discard' },
    ],
  },
  {
    header: 'Paste Modal',
    shortcuts: [
      { keys: ['⌘↵'], label: 'Confirm paste' },
    ],
  },
];

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

export function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 pt-16"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-2xl w-full mx-3 flex flex-col"
        style={{ maxHeight: '60vh' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--color-figma-border)]">
          <span className="text-[12px] font-medium text-[var(--color-figma-text)]">Keyboard Shortcuts</span>
          <button
            onClick={onClose}
            className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Shortcut list */}
        <div className="overflow-y-auto flex-1 py-1">
          {SECTIONS.map(section => (
            <div key={section.header}>
              <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-figma-text-secondary)]">
                {section.header}
              </div>
              {section.shortcuts.map(({ keys, label }) => (
                <div key={label} className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-[11px] text-[var(--color-figma-text)]">{label}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {keys.map((key, i) => (
                      <>
                        {i > 0 && (
                          <span key={`sep-${i}`} className="text-[10px] text-[var(--color-figma-text-secondary)]">/</span>
                        )}
                        <kbd
                          key={key}
                          className="text-[10px] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] rounded px-1 py-0.5 font-sans"
                        >
                          {adaptShortcut(key)}
                        </kbd>
                      </>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)]">
          Press <kbd className="border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] rounded px-1 py-0.5 font-sans">Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}
