import { useMemo, useState } from 'react';
import type { TokenMapEntry } from '../shared/types';

interface PreviewPanelProps {
  allTokensFlat: Record<string, TokenMapEntry>;
}

type Template = 'colors' | 'type-scale' | 'buttons' | 'forms' | 'card';

const TEMPLATES: { id: Template; label: string }[] = [
  { id: 'colors', label: 'Colors' },
  { id: 'type-scale', label: 'Type Scale' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'forms', label: 'Forms' },
  { id: 'card', label: 'Card' },
];

/** Convert a token path to a CSS custom property name */
function toCssVar(path: string): string {
  return `--${path.replace(/\./g, '-')}`;
}

/** Resolve a token value for use in CSS */
function resolveValue(value: unknown, type: string): string {
  const raw = String(value ?? '');
  // Alias: {path.here} → var(--path-here)
  const resolved = raw.replace(/\{([^}]+)\}/g, (_, p) => `var(--${p.replace(/\./g, '-')})`);
  // Bare number for dimension tokens → add px
  if (type === 'dimension' && /^\d+(\.\d+)?$/.test(resolved)) {
    return resolved + 'px';
  }
  return resolved;
}

export function PreviewPanel({ allTokensFlat }: PreviewPanelProps) {
  const [template, setTemplate] = useState<Template>('colors');
  const [darkMode, setDarkMode] = useState(false);

  // Build CSS vars object from all tokens
  const cssVars = useMemo(() => {
    const vars: Record<string, string> = {};
    for (const [path, entry] of Object.entries(allTokensFlat)) {
      const name = toCssVar(path);
      vars[name] = resolveValue(entry.$value, entry.$type ?? '');
    }
    return vars;
  }, [allTokensFlat]);

  // Collect color tokens grouped by top-level prefix
  const colorGroups = useMemo(() => {
    const groups: Record<string, { path: string; value: string }[]> = {};
    for (const [path, entry] of Object.entries(allTokensFlat)) {
      if (entry.$type !== 'color') continue;
      const raw = String(entry.$value ?? '');
      // Skip pure aliases for the palette (would just show a reference)
      if (/^\{[^}]+\}$/.test(raw)) continue;
      const prefix = path.split('.')[0];
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push({ path, value: raw });
    }
    return groups;
  }, [allTokensFlat]);

  // Collect typography tokens grouped by prefix
  const typeTokens = useMemo(() => {
    return Object.entries(allTokensFlat)
      .filter(([, e]) => e.$type === 'fontSizes' || e.$type === 'fontSize' || e.$type === 'fontsize')
      .sort(([a], [b]) => {
        // Sort by numeric value if present in path name
        const numA = parseFloat(a.split('.').pop() ?? '0');
        const numB = parseFloat(b.split('.').pop() ?? '0');
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b);
      });
  }, [allTokensFlat]);

  const isEmpty = Object.keys(allTokensFlat).length === 0;

  return (
    <div className="flex flex-col h-full bg-[var(--color-figma-bg)] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
        <div className="flex items-center gap-0.5 overflow-x-auto flex-1">
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => setTemplate(t.id)}
              className={`shrink-0 px-2.5 py-1 text-[10px] font-medium rounded transition-colors ${
                template === t.id
                  ? 'bg-[var(--color-figma-accent)] text-white'
                  : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setDarkMode(v => !v)}
          title={darkMode ? 'Switch to light' : 'Switch to dark'}
          className={`shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ${
            darkMode
              ? 'bg-[var(--color-figma-accent)] text-white'
              : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
          }`}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {darkMode
              ? <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>
              : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            }
          </svg>
          {darkMode ? 'Light' : 'Dark'}
        </button>
      </div>

      {/* Preview surface */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--color-figma-text-secondary)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="3" width="20" height="14" rx="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            <p className="text-[11px] text-center">No tokens loaded.<br />Connect to a server with tokens to preview them.</p>
          </div>
        ) : (
          <div
            style={cssVars as React.CSSProperties}
            className={`rounded-lg overflow-hidden ${darkMode ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900'}`}
          >
            {template === 'colors' && <ColorsTemplate groups={colorGroups} darkMode={darkMode} />}
            {template === 'type-scale' && <TypeScaleTemplate typeTokens={typeTokens} cssVars={cssVars} darkMode={darkMode} />}
            {template === 'buttons' && <ButtonsTemplate darkMode={darkMode} />}
            {template === 'forms' && <FormsTemplate darkMode={darkMode} />}
            {template === 'card' && <CardTemplate darkMode={darkMode} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Color Palette ────────────────────────────────────────────────────────────

function ColorsTemplate({ groups, darkMode }: { groups: Record<string, { path: string; value: string }[]>; darkMode: boolean }) {
  const groupEntries = Object.entries(groups);
  if (groupEntries.length === 0) {
    return (
      <div className={`p-4 text-[11px] ${darkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
        No color tokens found. Add tokens with <code className="font-mono">$type: "color"</code>.
      </div>
    );
  }
  return (
    <div className="p-3 flex flex-col gap-4">
      {groupEntries.map(([group, tokens]) => (
        <div key={group}>
          <div className={`text-[10px] font-semibold uppercase tracking-wide mb-2 ${darkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>{group}</div>
          <div className="flex flex-wrap gap-1.5">
            {tokens.map(({ path, value }) => (
              <SwatchCell key={path} path={path} value={value} darkMode={darkMode} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SwatchCell({ path, value, darkMode }: { path: string; value: string; darkMode: boolean }) {
  const leafName = path.split('.').pop() ?? path;
  return (
    <div className="flex flex-col items-center gap-1 w-10">
      <div
        className="w-10 h-10 rounded-md border border-black/10 shadow-sm"
        style={{ backgroundColor: `var(${toCssVar(path)}, ${value})` }}
        title={`${path}: ${value}`}
      />
      <span className={`text-[9px] text-center leading-tight truncate w-full text-center ${darkMode ? 'text-neutral-400' : 'text-neutral-500'}`} title={path}>
        {leafName}
      </span>
    </div>
  );
}

// ─── Type Scale ───────────────────────────────────────────────────────────────

function TypeScaleTemplate({ typeTokens, cssVars, darkMode }: {
  typeTokens: [string, TokenMapEntry][];
  cssVars: Record<string, string>;
  darkMode: boolean;
}) {
  if (typeTokens.length === 0) {
    return (
      <div className={`p-4 text-[11px] ${darkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
        No fontSize tokens found. Add tokens with <code className="font-mono">$type: "fontSize"</code>.
      </div>
    );
  }
  return (
    <div className="p-3 flex flex-col gap-3">
      {typeTokens.map(([path]) => {
        const cssVarName = toCssVar(path);
        const resolvedSize = cssVars[cssVarName] ?? '16px';
        const leafName = path.split('.').pop() ?? path;
        return (
          <div key={path} className="flex items-baseline gap-3 overflow-hidden">
            <span className={`text-[9px] w-16 shrink-0 text-right ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>{resolvedSize}</span>
            <span
              className="overflow-hidden text-ellipsis whitespace-nowrap flex-1"
              style={{ fontSize: `var(${cssVarName}, 16px)` }}
            >
              {leafName} — The quick brown fox
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

function ButtonsTemplate({ darkMode }: { darkMode: boolean }) {
  const base = {
    padding: 'var(--spacing-2, var(--spacing-8, 8px)) var(--spacing-4, var(--spacing-16, 16px))',
    borderRadius: 'var(--border-radius-md, var(--radius-md, var(--radius-2, 6px)))',
    fontSize: 'var(--font-size-sm, var(--font-size-14, var(--typography-size-sm, 13px)))',
    fontWeight: 'var(--font-weight-medium, 500)',
    cursor: 'default',
    border: '1px solid transparent',
    display: 'inline-block' as const,
  };

  return (
    <div className="p-4 flex flex-col gap-4">
      <PreviewSection label="Primary" darkMode={darkMode}>
        <button style={{ ...base, background: 'var(--color-primary, var(--color-brand-500, var(--color-accent, #0066ff)))', color: 'var(--color-on-primary, var(--color-white, #ffffff))' }}>
          Button
        </button>
        <button style={{ ...base, background: 'var(--color-primary, var(--color-brand-500, var(--color-accent, #0066ff)))', color: 'var(--color-on-primary, #ffffff)', opacity: 0.7 }}>
          Hover
        </button>
        <button style={{ ...base, background: 'var(--color-primary, var(--color-brand-500, var(--color-accent, #0066ff)))', color: 'var(--color-on-primary, #ffffff)', opacity: 0.5 }}>
          Disabled
        </button>
      </PreviewSection>
      <PreviewSection label="Secondary" darkMode={darkMode}>
        <button style={{ ...base, background: 'transparent', color: 'var(--color-primary, var(--color-brand-500, #0066ff))', border: '1px solid var(--color-primary, var(--color-brand-500, #0066ff))' }}>
          Outlined
        </button>
        <button style={{ ...base, background: 'var(--color-surface-2, var(--color-neutral-100, var(--color-grey-100, #f0f0f0)))', color: 'var(--color-text, var(--color-neutral-900, #111111))' }}>
          Secondary
        </button>
        <button style={{ ...base, background: 'transparent', color: 'var(--color-text, var(--color-neutral-900, #111111))' }}>
          Ghost
        </button>
      </PreviewSection>
      <PreviewSection label="Destructive" darkMode={darkMode}>
        <button style={{ ...base, background: 'var(--color-error, var(--color-danger, var(--color-red-500, #ef4444)))', color: '#ffffff' }}>
          Delete
        </button>
        <button style={{ ...base, background: 'transparent', color: 'var(--color-error, var(--color-danger, #ef4444))', border: '1px solid var(--color-error, var(--color-danger, #ef4444))' }}>
          Cancel
        </button>
      </PreviewSection>
    </div>
  );
}

// ─── Forms ────────────────────────────────────────────────────────────────────

function FormsTemplate({ darkMode }: { darkMode: boolean }) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: 'var(--spacing-2, 8px) var(--spacing-3, 12px)',
    borderRadius: 'var(--border-radius-sm, var(--radius-sm, 4px))',
    fontSize: 'var(--font-size-sm, 13px)',
    border: '1px solid var(--color-border, var(--color-neutral-200, var(--color-grey-300, #d1d5db)))',
    background: 'var(--color-surface, var(--color-white, var(--color-bg, transparent)))',
    color: 'var(--color-text, var(--color-neutral-900, inherit))',
    outline: 'none',
    pointerEvents: 'none' as const,
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 'var(--font-size-xs, 11px)',
    fontWeight: 'var(--font-weight-medium, 500)',
    color: 'var(--color-text-secondary, var(--color-neutral-600, var(--color-grey-600, #4b5563)))',
    marginBottom: '4px',
  };

  return (
    <div className="p-4 flex flex-col gap-3" style={{ maxWidth: '260px' }}>
      <div>
        <label style={labelStyle}>Email address</label>
        <input readOnly value="name@example.com" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Password</label>
        <input readOnly type="password" value="••••••••" style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>With error</label>
        <input readOnly value="invalid input" style={{ ...inputStyle, borderColor: 'var(--color-error, var(--color-danger, #ef4444))' }} />
        <span style={{ fontSize: 'var(--font-size-xs, 11px)', color: 'var(--color-error, var(--color-danger, #ef4444))', marginTop: '3px', display: 'block' }}>
          This field is required
        </span>
      </div>
      <div>
        <label style={labelStyle}>Disabled</label>
        <input readOnly value="Disabled input" style={{ ...inputStyle, opacity: 0.5 }} />
      </div>
      <button
        style={{
          marginTop: '4px',
          padding: 'var(--spacing-2, 8px) var(--spacing-4, 16px)',
          borderRadius: 'var(--border-radius-md, var(--radius-md, 6px))',
          background: 'var(--color-primary, var(--color-brand-500, #0066ff))',
          color: 'var(--color-on-primary, #ffffff)',
          fontSize: 'var(--font-size-sm, 13px)',
          fontWeight: 'var(--font-weight-medium, 500)',
          border: 'none',
          cursor: 'default',
          width: '100%',
        }}
      >
        Sign in
      </button>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function CardTemplate({ darkMode }: { darkMode: boolean }) {
  const cardBg = darkMode
    ? 'var(--color-surface, var(--color-neutral-800, var(--color-grey-800, #1f2937)))'
    : 'var(--color-surface, var(--color-white, var(--color-bg-card, #ffffff)))';
  const cardBorder = darkMode
    ? 'var(--color-border, var(--color-neutral-700, #374151))'
    : 'var(--color-border, var(--color-neutral-200, var(--color-grey-200, #e5e7eb)))';

  return (
    <div className="p-4">
      <div style={{
        background: cardBg,
        border: `1px solid ${cardBorder}`,
        borderRadius: 'var(--border-radius-lg, var(--radius-lg, var(--radius-4, 12px)))',
        overflow: 'hidden',
        maxWidth: '260px',
        boxShadow: 'var(--shadow-md, 0 2px 8px rgba(0,0,0,0.08))',
      }}>
        {/* Card image placeholder */}
        <div style={{
          height: '100px',
          background: 'var(--color-primary, var(--color-brand-500, var(--color-accent, #0066ff)))',
          opacity: 0.2,
        }} />
        <div style={{ padding: 'var(--spacing-4, 16px)' }}>
          <h3 style={{
            fontSize: 'var(--font-size-base, var(--font-size-16, 15px))',
            fontWeight: 'var(--font-weight-semibold, 600)',
            color: 'var(--color-text, var(--color-neutral-900, inherit))',
            marginBottom: '6px',
          }}>
            Card Title
          </h3>
          <p style={{
            fontSize: 'var(--font-size-sm, 12px)',
            color: 'var(--color-text-secondary, var(--color-neutral-600, var(--color-grey-500, #6b7280)))',
            marginBottom: '14px',
            lineHeight: 1.5,
          }}>
            A sample card component rendered using your design tokens as CSS custom properties.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={{
              flex: 1,
              padding: '7px 12px',
              borderRadius: 'var(--border-radius-md, var(--radius-md, 6px))',
              background: 'var(--color-primary, var(--color-brand-500, #0066ff))',
              color: 'var(--color-on-primary, #ffffff)',
              fontSize: 'var(--font-size-xs, 11px)',
              fontWeight: 'var(--font-weight-medium, 500)',
              border: 'none',
              cursor: 'default',
            }}>
              Primary
            </button>
            <button style={{
              flex: 1,
              padding: '7px 12px',
              borderRadius: 'var(--border-radius-md, var(--radius-md, 6px))',
              background: 'transparent',
              color: 'var(--color-text, var(--color-neutral-900, inherit))',
              fontSize: 'var(--font-size-xs, 11px)',
              fontWeight: 'var(--font-weight-medium, 500)',
              border: `1px solid ${cardBorder}`,
              cursor: 'default',
            }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function PreviewSection({ label, darkMode, children }: { label: string; darkMode: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className={`text-[9px] font-semibold uppercase tracking-wide mb-2 ${darkMode ? 'text-neutral-500' : 'text-neutral-400'}`}>{label}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
