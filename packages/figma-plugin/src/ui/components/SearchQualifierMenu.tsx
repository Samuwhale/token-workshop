import { ListFilter } from "lucide-react";
import { useDropdownMenu } from "../hooks/useDropdownMenu";

interface QualifierEntry {
  qualifier: string;
  description: string;
}

const QUALIFIERS: QualifierEntry[] = [
  { qualifier: "type:", description: "Filter by token type" },
  { qualifier: "scope:", description: "Filter by Figma field" },
  { qualifier: "has:", description: "Filter by property" },
  { qualifier: "value:", description: "Filter by value content" },
  { qualifier: "path:", description: "Filter by token path" },
  { qualifier: "name:", description: "Filter by token name" },
  { qualifier: "generated:", description: "Filter by generator" },
];

interface SearchQualifierMenuProps {
  onSelect: (qualifier: string) => void;
}

export function SearchQualifierMenu({ onSelect }: SearchQualifierMenuProps) {
  const { open, menuRef, triggerRef, toggle, close } = useDropdownMenu();

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Search filters"
        className={`mr-0.5 flex h-[18px] w-[18px] items-center justify-center rounded transition-colors ${
          open
            ? "bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
            : "text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
        }`}
        title="Search filters"
      >
        <ListFilter size={10} strokeWidth={2} aria-hidden />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full z-50 mt-1 w-[200px] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-xl"
          role="menu"
        >
          {QUALIFIERS.map((entry) => (
            <button
              key={entry.qualifier}
              type="button"
              role="menuitem"
              onClick={() => {
                onSelect(entry.qualifier);
                close({ restoreFocus: false });
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
            >
              <span className="shrink-0 font-mono font-semibold text-[var(--color-figma-accent)]">
                {entry.qualifier}
              </span>
              <span className="truncate text-[var(--color-figma-text-secondary)]">
                {entry.description}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
