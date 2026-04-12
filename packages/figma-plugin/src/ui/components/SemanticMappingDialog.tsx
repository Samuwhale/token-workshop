import { getErrorMessage } from '../shared/utils';
import { useState, useRef, useEffect } from 'react';
import type { GeneratedTokenResult } from '../hooks/useGenerators';
import { ApiError } from '../shared/apiFetch';
import { SEMANTIC_PATTERNS } from '../shared/semanticPatterns';
import { createTokenBody, upsertToken } from '../shared/tokenMutations';
import { useFocusTrap } from '../hooks/useFocusTrap';

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

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
        const tokenType = generatedTokens.find(t => String(t.stepName) === mapping.step)?.type ?? 'string';
        const body = createTokenBody({
          $type: tokenType,
          $value: `{${targetGroup}.${mapping.step}}`,
          $description: `Semantic reference for ${targetGroup}.${mapping.step}`,
        });
        await upsertToken(serverUrl, targetSet, fullPath, body, (err): err is ApiError => err instanceof ApiError && err.status === 409);
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
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        className="bg-[var(--color-figma-bg)] rounded-t border border-[var(--color-figma-border)] shadow-xl w-full max-w-sm flex flex-col max-h-[85vh]"
        role="dialog"
        aria-modal="true"
        aria-label="Create Semantic Tokens"
      >

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
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono focus-visible:border-[var(--color-figma-accent)]"
            />
          </div>

          {/* Mapping rows */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">Mappings ({mappings.length})</label>
              <button
                onClick={handleAddRow}
                className="text-[10px] text-[var(--color-figma-accent)] hover:underline flex items-center gap-0.5"
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
                    className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono focus-visible:border-[var(--color-figma-accent)] min-w-0"
                  />
                  <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-[var(--color-figma-text-secondary)]">
                    <path d="M2 6h8M7 3l3 3-3 3" />
                  </svg>
                  <select
                    value={mapping.step}
                    onChange={e => setMappings(prev => prev.map((m, idx) => idx === i ? { ...m, step: e.target.value } : m))}
                    className="w-16 px-1 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)]"
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
