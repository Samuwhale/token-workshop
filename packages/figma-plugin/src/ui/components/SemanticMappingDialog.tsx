import { getErrorMessage } from '../shared/utils';
import { useState } from 'react';
import type { GeneratedTokenResult } from '../hooks/useGenerators';
import type { ApiErrorBody } from '../../shared/types';

// ---------------------------------------------------------------------------
// Built-in semantic patterns
// ---------------------------------------------------------------------------

interface SemanticPattern {
  id: string;
  label: string;
  applicableTo: string[]; // generator types
  mappings: Array<{ semantic: string; step: string }>;
}

const SEMANTIC_PATTERNS: SemanticPattern[] = [
  {
    id: 'action',
    label: 'Action states',
    applicableTo: ['colorRamp'],
    mappings: [
      { semantic: 'action.default', step: '500' },
      { semantic: 'action.hover', step: '600' },
      { semantic: 'action.active', step: '700' },
      { semantic: 'action.disabled', step: '300' },
    ],
  },
  {
    id: 'surface',
    label: 'Surface levels',
    applicableTo: ['colorRamp'],
    mappings: [
      { semantic: 'surface.default', step: '50' },
      { semantic: 'surface.subtle', step: '100' },
      { semantic: 'surface.strong', step: '200' },
    ],
  },
  {
    id: 'text',
    label: 'Text colors',
    applicableTo: ['colorRamp'],
    mappings: [
      { semantic: 'text.default', step: '900' },
      { semantic: 'text.subtle', step: '600' },
      { semantic: 'text.disabled', step: '400' },
      { semantic: 'text.inverse', step: '50' },
    ],
  },
  {
    id: 'border',
    label: 'Border colors',
    applicableTo: ['colorRamp'],
    mappings: [
      { semantic: 'border.default', step: '300' },
      { semantic: 'border.strong', step: '500' },
      { semantic: 'border.subtle', step: '200' },
    ],
  },
  {
    id: 'spacing-components',
    label: 'Component spacing',
    applicableTo: ['spacingScale'],
    mappings: [
      { semantic: 'component.padding.sm', step: '2' },
      { semantic: 'component.padding.md', step: '4' },
      { semantic: 'component.padding.lg', step: '6' },
      { semantic: 'component.gap.sm', step: '2' },
      { semantic: 'component.gap.md', step: '4' },
    ],
  },
  {
    id: 'radius-components',
    label: 'Component radii',
    applicableTo: ['borderRadiusScale'],
    mappings: [
      { semantic: 'component.radius.sm', step: 'sm' },
      { semantic: 'component.radius.md', step: 'md' },
      { semantic: 'component.radius.lg', step: 'lg' },
      { semantic: 'component.radius.pill', step: 'full' },
    ],
  },
  {
    id: 'type-size',
    label: 'Text sizes',
    applicableTo: ['typeScale'],
    mappings: [
      { semantic: 'text.size.caption', step: 'xs' },
      { semantic: 'text.size.body', step: 'base' },
      { semantic: 'text.size.heading', step: '2xl' },
      { semantic: 'text.size.display', step: '3xl' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SemanticMappingDialogProps {
  serverUrl: string;
  generatedTokens: GeneratedTokenResult[];
  generatorType: string;
  targetGroup: string;
  targetSet: string;
  onClose: () => void;
  onCreated: (count: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SemanticMappingDialog({
  serverUrl,
  generatedTokens,
  generatorType,
  targetGroup,
  targetSet,
  onClose,
  onCreated,
}: SemanticMappingDialogProps) {
  const availableSteps = generatedTokens.map(t => String(t.stepName));

  const suggestedPatterns = SEMANTIC_PATTERNS.filter(p =>
    p.applicableTo.includes(generatorType),
  );

  // Start with no patterns selected (user must opt in)
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(
    suggestedPatterns[0]?.id ?? null,
  );
  const [semanticPrefix, setSemanticPrefix] = useState('semantic');
  const [mappings, setMappings] = useState<Array<{ semantic: string; step: string }>>(() => {
    const pattern = suggestedPatterns[0];
    if (!pattern) return [];
    return pattern.mappings.map(m => ({
      semantic: m.semantic,
      step: availableSteps.includes(m.step) ? m.step : (availableSteps[Math.floor(availableSteps.length / 2)] ?? ''),
    }));
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handlePatternSelect = (patternId: string) => {
    const pattern = SEMANTIC_PATTERNS.find(p => p.id === patternId);
    if (!pattern) return;
    setSelectedPatternId(patternId);
    setMappings(pattern.mappings.map(m => ({
      semantic: m.semantic,
      step: availableSteps.includes(m.step) ? m.step : (availableSteps[Math.floor(availableSteps.length / 2)] ?? ''),
    })));
  };

  const handleAddRow = () => {
    setMappings(prev => [...prev, { semantic: '', step: availableSteps[0] ?? '' }]);
  };

  const handleRemoveRow = (i: number) => {
    setMappings(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleCreate = async () => {
    const validMappings = mappings.filter(m => m.semantic.trim() && m.step);
    if (validMappings.length === 0) {
      setError('Add at least one mapping.');
      return;
    }
    setSaving(true);
    setError('');
    let created = 0;
    try {
      for (const mapping of validMappings) {
        const fullPath = `${semanticPrefix.trim()}.${mapping.semantic}`;
        const encodedFullPath = fullPath.split('.').map(encodeURIComponent).join('/');
        const tokenType = generatedTokens.find(t => String(t.stepName) === mapping.step)?.type ?? 'string';
        const body = {
          $type: tokenType,
          $value: `{${targetGroup}.${mapping.step}}`,
          $description: `Semantic reference for ${targetGroup}.${mapping.step}`,
        };
        // POST /api/tokens/:set/* creates the token; PATCH if it already exists (409)
        const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/${encodedFullPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          if (res.status === 409) {
            // Token already exists — overwrite via PATCH
            const patchRes = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}/${encodedFullPath}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            if (!patchRes.ok) {
              const data: ApiErrorBody = await patchRes.json().catch(() => ({}));
              throw new Error(data.error || `Failed to update ${fullPath}`);
            }
          } else {
            const data: ApiErrorBody = await res.json().catch(() => ({}));
            throw new Error(data.error || `Failed to create ${fullPath}`);
          }
        }
        created++;
      }
      setSaving(false);
      onCreated(created);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create tokens'));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
      <div className="bg-[var(--color-figma-bg)] rounded-t border border-[var(--color-figma-border)] shadow-xl w-full max-w-sm flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-figma-border)] shrink-0">
          <div>
            <span className="text-[12px] font-semibold text-[var(--color-figma-text)]">Create Semantic Tokens</span>
            <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">
              Reference tokens that point to <span className="font-mono">{targetGroup}</span>
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

          {/* Pattern picker */}
          {suggestedPatterns.length > 0 && (
            <div>
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1.5">Suggested patterns</label>
              <div className="flex flex-wrap gap-1">
                {suggestedPatterns.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handlePatternSelect(p.id)}
                    className={`px-2 py-1 rounded text-[10px] border transition-colors ${
                      selectedPatternId === p.id
                        ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                        : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Semantic prefix */}
          <div>
            <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Semantic group prefix</label>
            <input
              type="text"
              value={semanticPrefix}
              onChange={e => setSemanticPrefix(e.target.value)}
              placeholder="semantic"
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono outline-none focus:border-[var(--color-figma-accent)]"
            />
          </div>

          {/* Mapping rows */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Mappings ({mappings.length})</label>
              <button
                onClick={handleAddRow}
                className="text-[9px] text-[var(--color-figma-accent)] hover:underline flex items-center gap-0.5"
              >
                + Add row
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {mappings.map((mapping, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={mapping.semantic}
                    onChange={e => setMappings(prev => prev.map((m, idx) => idx === i ? { ...m, semantic: e.target.value } : m))}
                    placeholder="action.default"
                    className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono outline-none focus:border-[var(--color-figma-accent)] min-w-0"
                  />
                  <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-[var(--color-figma-text-secondary)]">
                    <path d="M2 6h8M7 3l3 3-3 3" />
                  </svg>
                  <select
                    value={mapping.step}
                    onChange={e => setMappings(prev => prev.map((m, idx) => idx === i ? { ...m, step: e.target.value } : m))}
                    className="w-16 px-1 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)]"
                  >
                    {availableSteps.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleRemoveRow(i)}
                    aria-label="Remove mapping"
                    className="shrink-0 p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3l6 6M9 3l-6 6" /></svg>
                  </button>
                </div>
              ))}
              {mappings.length === 0 && (
                <div className="text-[10px] text-[var(--color-figma-text-secondary)] py-2 text-center">No mappings — click "Add row" to start</div>
              )}
            </div>
          </div>

          {/* Preview of what will be created */}
          {mappings.filter(m => m.semantic.trim()).length > 0 && (
            <div>
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Will create</label>
              <div className="border border-[var(--color-figma-border)] rounded p-2 bg-[var(--color-figma-bg-secondary)] flex flex-col gap-0.5">
                {mappings.filter(m => m.semantic.trim()).map((m, i) => (
                  <div key={i} className="text-[10px] font-mono text-[var(--color-figma-text-secondary)]">
                    <span className="text-[var(--color-figma-text)]">{semanticPrefix}.{m.semantic}</span>
                    {' → '}
                    <span className="text-[var(--color-figma-accent)]">{'{' + targetGroup + '.' + m.step + '}'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div className="text-[10px] text-[var(--color-figma-error)]">{error}</div>}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
          <button onClick={onClose} className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]">
            Skip
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || mappings.filter(m => m.semantic.trim()).length === 0}
            className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
          >
            {saving
              ? 'Creating…'
              : `Create ${mappings.filter(m => m.semantic.trim()).length} reference${mappings.filter(m => m.semantic.trim()).length !== 1 ? 's' : ''}`
            }
          </button>
        </div>
      </div>
    </div>
  );
}
