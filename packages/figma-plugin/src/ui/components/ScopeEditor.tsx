import { useMemo } from 'react';
import { FIGMA_SCOPE_OPTIONS } from '../shared/tokenMetadata';

export interface ScopeOption {
  label: string;
  value: string;
  description: string;
}

interface ScopeEditorProps {
  /**
   * Token type(s) this editor applies to. When multiple types are passed,
   * only scopes valid for every type are offered (intersection).
   */
  tokenTypes: string[];
  selectedScopes: string[];
  onChange: (next: string[]) => void;
  /** When true, hides the helper text row. */
  compact?: boolean;
  showDescriptions?: boolean;
  disabled?: boolean;
}

function computeAvailableScopes(tokenTypes: string[]): ScopeOption[] {
  if (tokenTypes.length === 0) return [];
  let intersection: ScopeOption[] | null = null;
  for (const type of tokenTypes) {
    const opts = FIGMA_SCOPE_OPTIONS[type];
    if (!opts) return [];
    if (!intersection) {
      intersection = [...opts];
    } else {
      const values = new Set(opts.map(o => o.value));
      intersection = intersection.filter(s => values.has(s.value));
    }
  }
  return intersection ?? [];
}

export function ScopeEditor({
  tokenTypes,
  selectedScopes,
  onChange,
  compact = false,
  showDescriptions = true,
  disabled = false,
}: ScopeEditorProps) {
  const available = useMemo(() => computeAvailableScopes(tokenTypes), [tokenTypes]);

  if (available.length === 0) {
    return (
      <p className="text-secondary text-[color:var(--color-figma-text-secondary)]">
        This type doesn't map to any Figma field
      </p>
    );
  }

  const toggle = (value: string) => {
    if (selectedScopes.includes(value)) {
      onChange(selectedScopes.filter(s => s !== value));
    } else {
      onChange([...selectedScopes, value]);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {(!compact || selectedScopes.length > 0) && (
        <div className="flex items-center justify-between">
          {!compact && (
            <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
              Empty = any compatible field
            </span>
          )}
          {selectedScopes.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={disabled}
              className="text-secondary text-[color:var(--color-figma-text-accent)] ml-auto hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      )}
      <div
        className={
          compact ? "tm-scope-editor__compact-list" : "flex flex-col gap-1"
        }
      >
        {available.map(scope => (
          <label
            key={scope.value}
            className={`flex items-start gap-2 py-1 ${
              compact ? "tm-scope-editor__compact-option" : ""
            } ${disabled ? "cursor-default opacity-60" : "cursor-pointer"}`}
          >
            <input
              type="checkbox"
              checked={selectedScopes.includes(scope.value)}
              onChange={() => toggle(scope.value)}
              disabled={disabled}
              className="mt-0.5 accent-[var(--color-figma-accent)]"
            />
            <div className="min-w-0">
              <div className="text-body text-[color:var(--color-figma-text)]">
                {scope.label}
              </div>
              {showDescriptions ? (
                <div className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
                  {scope.description}
                </div>
              ) : null}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
