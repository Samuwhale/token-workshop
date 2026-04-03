import { adaptShortcut } from '../shared/utils';
import { SHORTCUT_SECTIONS } from '../shared/shortcutRegistry';

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
          {SHORTCUT_SECTIONS.map(section => (
            <div key={section.header}>
              <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-figma-text-secondary)]">
                {section.header}
              </div>
              {section.shortcuts.map(({ mac, altMac, description }) => (
                <div key={description} className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-[11px] text-[var(--color-figma-text)]">{description}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <kbd className="text-[10px] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] rounded px-1 py-0.5 font-sans">
                      {adaptShortcut(mac)}
                    </kbd>
                    {altMac && (
                      <>
                        <span className="text-[10px] text-[var(--color-figma-text-secondary)]">/</span>
                        <kbd className="text-[10px] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] rounded px-1 py-0.5 font-sans">
                          {adaptShortcut(altMac)}
                        </kbd>
                      </>
                    )}
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
