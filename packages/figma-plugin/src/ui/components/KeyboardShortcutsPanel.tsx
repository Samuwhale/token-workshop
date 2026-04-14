import { adaptShortcut } from "../shared/utils";
import { SHORTCUT_SECTIONS } from "../shared/shortcutRegistry";

export function KeyboardShortcutsPanel() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2.5">
        <h2 className="text-[11px] font-medium text-[var(--color-figma-text)]">
          Keyboard shortcuts
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {SHORTCUT_SECTIONS.map((section) => (
          <div key={section.header}>
            <div className="px-3 pt-2 pb-0.5 text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
              {section.header}
            </div>
            {section.shortcuts.map(
              ({ mac, altMac, description, qualifier }) => (
                <div
                  key={description}
                  className="flex items-center justify-between px-3 py-1"
                >
                  <span className="pr-3 text-[11px] text-[var(--color-figma-text)]">
                    {description}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {qualifier ? (
                      <code className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1 py-0.5 font-mono text-[10px] text-[var(--color-figma-text-secondary)]">
                        {mac}
                      </code>
                    ) : (
                      <kbd className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1 py-0.5 font-sans text-[10px] text-[var(--color-figma-text-secondary)]">
                        {adaptShortcut(mac)}
                      </kbd>
                    )}
                    {altMac && (
                      <>
                        <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                          /
                        </span>
                        <kbd className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1 py-0.5 font-sans text-[10px] text-[var(--color-figma-text-secondary)]">
                          {adaptShortcut(altMac)}
                        </kbd>
                      </>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
