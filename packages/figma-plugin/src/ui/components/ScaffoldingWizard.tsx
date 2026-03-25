import React, { useState, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

interface PresetToken {
  path: string; // relative to group prefix
  $type: string;
  $value: unknown;
}

interface Preset {
  id: string;
  label: string;
  description: string;
  defaultPrefix: string;
  tokens: PresetToken[];
}

const PRESETS: Preset[] = [
  {
    id: 'spacing',
    label: 'Spacing scale',
    description: 'Standard 4pt spacing scale (xs–3xl)',
    defaultPrefix: 'spacing',
    tokens: [
      { path: 'xs', $type: 'dimension', $value: { value: 4, unit: 'px' } },
      { path: 'sm', $type: 'dimension', $value: { value: 8, unit: 'px' } },
      { path: 'md', $type: 'dimension', $value: { value: 16, unit: 'px' } },
      { path: 'lg', $type: 'dimension', $value: { value: 24, unit: 'px' } },
      { path: 'xl', $type: 'dimension', $value: { value: 32, unit: 'px' } },
      { path: '2xl', $type: 'dimension', $value: { value: 48, unit: 'px' } },
      { path: '3xl', $type: 'dimension', $value: { value: 64, unit: 'px' } },
    ],
  },
  {
    id: 'border-radius',
    label: 'Border radius scale',
    description: 'Rounded corner tokens (none → full)',
    defaultPrefix: 'borderRadius',
    tokens: [
      { path: 'none', $type: 'dimension', $value: { value: 0, unit: 'px' } },
      { path: 'sm', $type: 'dimension', $value: { value: 2, unit: 'px' } },
      { path: 'md', $type: 'dimension', $value: { value: 4, unit: 'px' } },
      { path: 'lg', $type: 'dimension', $value: { value: 8, unit: 'px' } },
      { path: 'xl', $type: 'dimension', $value: { value: 12, unit: 'px' } },
      { path: '2xl', $type: 'dimension', $value: { value: 16, unit: 'px' } },
      { path: 'full', $type: 'dimension', $value: { value: 9999, unit: 'px' } },
    ],
  },
  {
    id: 'typography',
    label: 'Typography scale',
    description: 'Font size scale (xs–4xl)',
    defaultPrefix: 'fontSize',
    tokens: [
      { path: 'xs', $type: 'dimension', $value: { value: 10, unit: 'px' } },
      { path: 'sm', $type: 'dimension', $value: { value: 12, unit: 'px' } },
      { path: 'md', $type: 'dimension', $value: { value: 14, unit: 'px' } },
      { path: 'lg', $type: 'dimension', $value: { value: 16, unit: 'px' } },
      { path: 'xl', $type: 'dimension', $value: { value: 20, unit: 'px' } },
      { path: '2xl', $type: 'dimension', $value: { value: 24, unit: 'px' } },
      { path: '3xl', $type: 'dimension', $value: { value: 32, unit: 'px' } },
      { path: '4xl', $type: 'dimension', $value: { value: 48, unit: 'px' } },
    ],
  },
  {
    id: 'z-index',
    label: 'Z-index layers',
    description: 'Z-index semantic layers',
    defaultPrefix: 'zIndex',
    tokens: [
      { path: 'below', $type: 'number', $value: -1 },
      { path: 'base', $type: 'number', $value: 0 },
      { path: 'raised', $type: 'number', $value: 10 },
      { path: 'dropdown', $type: 'number', $value: 100 },
      { path: 'sticky', $type: 'number', $value: 200 },
      { path: 'overlay', $type: 'number', $value: 300 },
      { path: 'modal', $type: 'number', $value: 400 },
      { path: 'toast', $type: 'number', $value: 500 },
    ],
  },
  {
    id: 'opacity',
    label: 'Opacity scale',
    description: 'Semantic opacity tokens (disabled → full)',
    defaultPrefix: 'opacity',
    tokens: [
      { path: 'disabled', $type: 'number', $value: 0.4 },
      { path: 'subtle', $type: 'number', $value: 0.6 },
      { path: 'medium', $type: 'number', $value: 0.8 },
      { path: 'full', $type: 'number', $value: 1 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ScaffoldingWizardProps {
  serverUrl: string;
  activeSet: string;
  onClose: () => void;
  onConfirm: () => void;
  onGenerateSemanticTokens?: () => void;
  onGenerateDarkTheme?: () => void;
}

function formatPresetValue(v: unknown): string {
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && v !== null && 'value' in v && 'unit' in v) {
    return `${(v as { value: number; unit: string }).value}${(v as { value: number; unit: string }).unit}`;
  }
  return JSON.stringify(v);
}

export function ScaffoldingWizard({ serverUrl, activeSet, onClose, onConfirm, onGenerateSemanticTokens, onGenerateDarkTheme }: ScaffoldingWizardProps) {
  const [step, setStep] = useState<'pick' | 'configure' | 'complete'>('pick');
  const [createdCount, setCreatedCount] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
  const [prefix, setPrefix] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tokensToCreate = useMemo(() => {
    if (!selectedPreset) return [];
    const base = prefix.trim() || selectedPreset.defaultPrefix;
    return selectedPreset.tokens.map(t => ({
      path: `${base}.${t.path}`,
      $type: t.$type,
      $value: t.$value,
    }));
  }, [selectedPreset, prefix]);

  const handlePickPreset = (preset: Preset) => {
    setSelectedPreset(preset);
    setPrefix(preset.defaultPrefix);
    setStep('configure');
  };

  const handleConfirm = async () => {
    if (busy || tokensToCreate.length === 0) return;
    setBusy(true);
    setError('');
    try {
      for (const token of tokensToCreate) {
        const pathEncoded = token.path.split('.').map(encodeURIComponent).join('/');
        const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${pathEncoded}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ $value: token.$value, $type: token.$type }),
        });
        if (!res.ok && res.status !== 409) {
          const data = await res.json() as { error?: string };
          throw new Error(data.error ?? res.statusText);
        }
      }
      setCreatedCount(tokensToCreate.length);
      setStep('complete');
      onConfirm();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div
        className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-xl w-80 flex flex-col"
        style={{ maxHeight: '85vh' }}
      >
        <div className="p-4 border-b border-[var(--color-figma-border)]">
          <div className="text-[12px] font-medium text-[var(--color-figma-text)]">
            {step === 'pick' ? 'Use a preset' : step === 'configure' ? `Configure: ${selectedPreset?.label}` : 'Tokens added!'}
          </div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">
            Tokens will be added to <span className="font-mono text-[var(--color-figma-text)]">{activeSet}</span>
          </div>
        </div>

        {step === 'pick' && (
          <div className="flex flex-col overflow-y-auto flex-1">
            {PRESETS.map(preset => (
              <button
                key={preset.id}
                onClick={() => handlePickPreset(preset)}
                className="w-full text-left px-4 py-3 border-b border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                <div className="text-[11px] font-medium text-[var(--color-figma-text)]">{preset.label}</div>
                <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {preset.description} · {preset.tokens.length} tokens
                </div>
              </button>
            ))}
          </div>
        )}

        {step === 'complete' && (
          <div className="flex flex-col items-center gap-4 p-6 text-center">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 10l4.5 4.5L16 6" />
              </svg>
            </div>
            <div>
              <p className="text-[12px] font-medium text-[var(--color-figma-text)]">
                {createdCount} tokens added to <span className="font-mono">{activeSet}</span>
              </p>
              <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-1 leading-relaxed">
                Now that you have primitives, you can generate a semantic layer or a dark theme automatically.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={() => { onGenerateSemanticTokens?.(); onClose(); }}
                className="flex items-center gap-2 px-3 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 10V7l4-6 4 6v3H8V8H4v2H2z" />
                </svg>
                <span className="flex-1 text-left">Generate Semantic Tokens</span>
              </button>
              <button
                onClick={() => { onGenerateDarkTheme?.(); onClose(); }}
                className="flex items-center gap-2 px-3 py-2 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 6.5A4.5 4.5 0 0 1 4.5 1a4.5 4.5 0 1 0 5.5 5.5z" />
                </svg>
                <span className="flex-1 text-left">Generate Dark Theme</span>
              </button>
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {step === 'configure' && selectedPreset && (
          <>
            <div className="p-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Group prefix</label>
                <input
                  type="text"
                  value={prefix}
                  onChange={e => { setPrefix(e.target.value); setError(''); }}
                  autoFocus
                  placeholder={selectedPreset.defaultPrefix}
                  className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono outline-none focus:border-[var(--color-figma-accent)]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border-t border-[var(--color-figma-border)]">
              <div className="px-3 py-1.5 text-[9px] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] font-medium uppercase tracking-wide">
                Preview — {tokensToCreate.length} tokens
              </div>
              {tokensToCreate.map(t => (
                <div key={t.path} className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-figma-border)]">
                  <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate">{t.path}</span>
                  <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] shrink-0 ml-2">{formatPresetValue(t.$value)}</span>
                </div>
              ))}
            </div>

            {error && <div className="px-4 py-2 text-[10px] text-[var(--color-figma-error)]">{error}</div>}
          </>
        )}

        {step !== 'complete' && <div className="flex gap-2 justify-between p-4 border-t border-[var(--color-figma-border)]">
          {step === 'configure' ? (
            <button
              onClick={() => setStep('pick')}
              className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              ← Back
            </button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              Cancel
            </button>
            {step === 'configure' && (
              <button
                onClick={handleConfirm}
                disabled={busy || tokensToCreate.length === 0}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50"
              >
                {busy ? 'Creating…' : `Add ${tokensToCreate.length} tokens`}
              </button>
            )}
          </div>
        </div>}
      </div>
    </div>
  );
}
