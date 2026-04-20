import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { evalExpr } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import { fuzzyScore } from '../shared/fuzzyMatch';
import { inputClass } from '../shared/editorClasses';

interface FormulaInputProps {
  value: string;
  onChange: (value: string) => void;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  filterType?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

const MAX_AC_RESULTS = 16;

const OPERATORS = [
  { op: '+', label: 'Add' },
  { op: '-', label: 'Subtract' },
  { op: '*', label: 'Multiply' },
  { op: '/', label: 'Divide' },
  { op: '**', label: 'Power' },
  { op: '(', label: 'Group open' },
  { op: ')', label: 'Group close' },
];

/** Extract the token reference query at the cursor position if inside braces. */
function getRefQueryAtCursor(value: string, cursor: number): { query: string; start: number; end: number } | null {
  // Walk backwards from cursor to find opening brace
  let braceStart = -1;
  for (let i = cursor - 1; i >= 0; i--) {
    if (value[i] === '}') return null; // closed brace before open
    if (value[i] === '{') {
      braceStart = i;
      break;
    }
  }
  if (braceStart === -1) return null;

  // Find end of this reference (closing brace or end of string)
  let braceEnd = value.indexOf('}', braceStart);
  if (braceEnd === -1) braceEnd = value.length;

  const query = value.slice(braceStart + 1, cursor);
  return { query, start: braceStart, end: braceEnd };
}

/** Validate formula and return per-reference diagnostics. */
function validateFormula(
  formula: string,
  allTokensFlat: Record<string, TokenMapEntry>,
): { refs: { path: string; start: number; end: number; valid: boolean }[]; result: number | null; error: string | null } {
  const refs: { path: string; start: number; end: number; valid: boolean }[] = [];
  const refRegex = /\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = refRegex.exec(formula)) !== null) {
    const path = match[1];
    refs.push({
      path,
      start: match.index,
      end: match.index + match[0].length,
      valid: path in allTokensFlat,
    });
  }

  // Check for unclosed braces
  const openCount = (formula.match(/\{/g) || []).length;
  const closeCount = (formula.match(/\}/g) || []).length;
  if (openCount !== closeCount) {
    return { refs, result: null, error: 'Unclosed brace in expression' };
  }

  if (refs.length === 0 && formula.trim().length > 0) {
    // No references — try to eval as plain math
    try {
      return { refs, result: evalExpr(formula), error: null };
    } catch (e) {
      return { refs, result: null, error: e instanceof Error ? e.message : 'Invalid expression' };
    }
  }

  const invalidRefs = refs.filter(r => !r.valid);
  if (invalidRefs.length > 0) {
    return { refs, result: null, error: `Unknown token${invalidRefs.length > 1 ? 's' : ''}: ${invalidRefs.map(r => r.path).join(', ')}` };
  }

  // Substitute and evaluate
  try {
    const substituted = formula.replace(/\{([^}]+)\}/g, (_, refPath: string) => {
      const entry = allTokensFlat[refPath];
      if (!entry) return '0';
      const v = entry.$value;
      if (typeof v === 'number') return String(v);
      if (typeof v === 'object' && v !== null && 'value' in v && typeof (v as { value: unknown }).value === 'number') {
        return String((v as { value: number }).value);
      }
      return '0';
    });
    return { refs, result: evalExpr(substituted), error: null };
  } catch (e) {
    return { refs, result: null, error: e instanceof Error ? e.message : 'Invalid expression' };
  }
}

/** Format a token value as a compact preview string. */
function formatValueShort(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('value' in obj && 'unit' in obj) return `${obj.value}${obj.unit}`;
    const parts: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('$')) continue;
      if (typeof v === 'string' || typeof v === 'number') parts.push(String(v));
      if (parts.length >= 2) break;
    }
    return parts.join(' ') || '';
  }
  return String(value);
}

export function FormulaInput({
  value,
  onChange,
  allTokensFlat,
  pathToCollectionId = {},
  filterType,
  placeholder = '{spacing.base} * 2',
  autoFocus,
}: FormulaInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [cursorPos, setCursorPos] = useState(value.length);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showOperatorHints, setShowOperatorHints] = useState(false);

  // Determine if cursor is inside a {ref} and extract the query
  const refQuery = useMemo(() => getRefQueryAtCursor(value, cursorPos), [value, cursorPos]);
  const showAutocomplete = refQuery !== null;

  // Autocomplete entries
  const acEntries = useMemo(() => {
    if (!refQuery) return [];
    const q = refQuery.query.trim();
    if (!q) {
      // Show numeric tokens first when no query
      return Object.entries(allTokensFlat)
        .filter(([, entry]) => {
          if (filterType && entry.$type !== filterType) return false;
          const t = entry.$type;
          return t === 'number' || t === 'dimension' || t === 'fontWeight' || t === 'duration';
        })
        .slice(0, MAX_AC_RESULTS);
    }
    const scored: [string, TokenMapEntry, number][] = [];
    for (const [path, entry] of Object.entries(allTokensFlat)) {
      if (filterType && entry.$type !== filterType) continue;
      const score = fuzzyScore(q, path);
      if (score >= 0) scored.push([path, entry, score]);
    }
    scored.sort((a, b) => b[2] - a[2]);
    return scored.slice(0, MAX_AC_RESULTS).map(([p, e]) => [p, e] as [string, TokenMapEntry]);
  }, [allTokensFlat, refQuery, filterType]);

  // Reset active index on query change
  useEffect(() => {
    setActiveIdx(0);
  }, [refQuery?.query]);

  // Validate formula
  const validation = useMemo(
    () => (value.trim() ? validateFormula(value, allTokensFlat) : null),
    [value, allTokensFlat],
  );

  const selectEntry = useCallback((path: string) => {
    if (!refQuery) return;
    // Replace the text from { to } (or end) with {path}
    const before = value.slice(0, refQuery.start);
    const after = value.slice(refQuery.end < value.length ? refQuery.end + 1 : refQuery.end);
    const newValue = `${before}{${path}}${after}`;
    onChange(newValue);
    // Position cursor after the closing brace
    const newCursor = before.length + path.length + 2;
    setCursorPos(newCursor);
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(newCursor, newCursor);
        inputRef.current.focus();
      }
    });
  }, [refQuery, value, onChange]);

  // Keyboard navigation for autocomplete
  useEffect(() => {
    if (!showAutocomplete || acEntries.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIdx(i => Math.min(i + 1, acEntries.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (acEntries[activeIdx]) {
          e.preventDefault();
          e.stopPropagation();
          selectEntry(acEntries[activeIdx][0]);
        }
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        // Remove the opening { to dismiss
        if (refQuery) {
          const before = value.slice(0, refQuery.start);
          const after = value.slice(refQuery.start + 1);
          onChange(before + after);
          setCursorPos(refQuery.start);
        }
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [showAutocomplete, acEntries, activeIdx, selectEntry, refQuery, value, onChange]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setCursorPos(e.target.selectionStart ?? e.target.value.length);
  };

  const handleSelect = (e: React.SyntheticEvent<HTMLInputElement>) => {
    const target = e.target as HTMLInputElement;
    setCursorPos(target.selectionStart ?? target.value.length);
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const target = e.target as HTMLInputElement;
    setCursorPos(target.selectionStart ?? target.value.length);
  };

  // Show operator hints when cursor is outside braces and there's content
  useEffect(() => {
    if (!refQuery && value.trim().length > 0 && document.activeElement === inputRef.current) {
      setShowOperatorHints(true);
    } else {
      setShowOperatorHints(false);
    }
  }, [refQuery, value]);

  const insertOperator = (op: string) => {
    const pos = cursorPos;
    const before = value.slice(0, pos);
    const after = value.slice(pos);
    // Add spaces around operator
    const needSpaceBefore = before.length > 0 && !before.endsWith(' ') && op !== '(' && op !== ')';
    const needSpaceAfter = after.length > 0 && !after.startsWith(' ') && op !== '(' && op !== ')';
    const insertion = `${needSpaceBefore ? ' ' : ''}${op}${needSpaceAfter ? ' ' : ''}`;
    const newValue = before + insertion + after;
    onChange(newValue);
    const newCursor = pos + insertion.length;
    setCursorPos(newCursor);
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(newCursor, newCursor);
        inputRef.current.focus();
      }
    });
  };

  // Build highlighted segments for the input overlay
  const segments = useMemo(() => {
    if (!value) return [];
    const result: { text: string; type: 'text' | 'ref-valid' | 'ref-invalid' | 'operator' }[] = [];
    let lastEnd = 0;
    const refRegex = /\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = refRegex.exec(value)) !== null) {
      if (m.index > lastEnd) {
        result.push({ text: value.slice(lastEnd, m.index), type: 'text' });
      }
      const path = m[1];
      const valid = path in allTokensFlat;
      result.push({ text: m[0], type: valid ? 'ref-valid' : 'ref-invalid' });
      lastEnd = m.index + m[0].length;
    }
    if (lastEnd < value.length) {
      result.push({ text: value.slice(lastEnd), type: 'text' });
    }
    return result;
  }, [value, allTokensFlat]);

  return (
    <div className="relative flex-1">
      {/* Highlighted overlay */}
      <div
        className="absolute inset-0 pointer-events-none px-2 py-1.5 text-body font-mono whitespace-pre overflow-hidden"
        aria-hidden="true"
      >
        {segments.map((seg, i) => {
          if (seg.type === 'ref-valid') {
            return <span key={i} className="text-[var(--color-figma-accent)]">{seg.text}</span>;
          }
          if (seg.type === 'ref-invalid') {
            return <span key={i} className="text-[var(--color-figma-error)] underline decoration-wavy decoration-[var(--color-figma-error)]">{seg.text}</span>;
          }
          return <span key={i} className="text-transparent">{seg.text}</span>;
        })}
      </div>

      {/* Actual input */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onSelect={handleSelect}
        onKeyUp={handleKeyUp}
        onClick={handleSelect}
        onFocus={() => {
          if (!refQuery && value.trim().length > 0) setShowOperatorHints(true);
        }}
        onBlur={() => {
          // Delay to allow dropdown clicks
          setTimeout(() => setShowOperatorHints(false), 150);
        }}
        placeholder={placeholder}
        className={inputClass + ' flex-1 font-mono caret-[var(--color-figma-text)]'}
        style={{ color: validation?.refs?.length ? 'transparent' : undefined, caretColor: 'var(--color-figma-text)' }}
        autoFocus={autoFocus}
      />

      {/* Token autocomplete dropdown */}
      {showAutocomplete && acEntries.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 left-0 right-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg overflow-y-auto max-h-48"
        >
          <div className="px-2 py-1 text-secondary text-[var(--color-figma-text-tertiary)] border-b border-[var(--color-figma-border)] uppercase tracking-wider">
            Token references
          </div>
          {acEntries.map(([path, entry], idx) => (
            <button
              key={path}
              data-idx={idx}
              onMouseDown={e => { e.preventDefault(); selectEntry(path); }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors ${
                idx === activeIdx ? 'bg-[var(--color-figma-bg-hover)]' : ''
              }`}
            >
              {/* Color swatch */}
              {entry.$type === 'color' && typeof entry.$value === 'string' ? (
                <div
                  className="w-3 h-3 rounded-sm border border-[var(--color-figma-border)] shrink-0"
                  style={{ backgroundColor: entry.$value }}
                />
              ) : (
                <div className="w-3 shrink-0" />
              )}

              {/* Path */}
              <span className="flex-1 text-secondary text-[var(--color-figma-text)] truncate font-mono">{path}</span>

              {/* Value preview */}
              {formatValueShort(entry.$value) && (
                <span className="text-secondary text-[var(--color-figma-text-secondary)] truncate max-w-[80px] shrink-0">
                  {formatValueShort(entry.$value)}
                </span>
              )}

              {/* Type badge */}
              <span className={`text-[8px] px-1 py-0.5 rounded font-medium shrink-0 ${TOKEN_TYPE_BADGE_CLASS[entry.$type ?? ''] ?? 'token-type-string'}`}>
                {entry.$type}
              </span>

              {/* Set name */}
              {pathToCollectionId[path] && (
                <span className="text-[8px] text-[var(--color-figma-text-secondary)] shrink-0">
                  {pathToCollectionId[path]}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Operator hints bar */}
      {showOperatorHints && !showAutocomplete && (
        <div className="absolute z-40 mt-1 left-0 right-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg px-1 py-1 flex items-center gap-0.5 flex-wrap">
          <span className="text-secondary text-[var(--color-figma-text-tertiary)] mr-1">Operators:</span>
          {OPERATORS.map(({ op, label }) => (
            <button
              key={op}
              onMouseDown={e => { e.preventDefault(); insertOperator(op); }}
              title={label}
              className="px-1.5 py-0.5 rounded text-secondary font-mono bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors"
            >
              {op}
            </button>
          ))}
          <span className="text-secondary text-[var(--color-figma-text-tertiary)] ml-1">Type <kbd className="px-0.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">{'{'}</kbd> for token ref</span>
        </div>
      )}
    </div>
  );
}
