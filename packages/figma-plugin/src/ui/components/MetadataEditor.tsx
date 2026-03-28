import { useState } from 'react';
import type { ThemeDimension } from '@tokenmanager/core';

const FIGMA_SCOPES: Record<string, { label: string; value: string }[]> = {
  color: [
    { label: 'Fill Color', value: 'FILL_COLOR' },
    { label: 'Stroke Color', value: 'STROKE_COLOR' },
    { label: 'Text Fill', value: 'TEXT_FILL' },
    { label: 'Effect Color', value: 'EFFECT_COLOR' },
  ],
  number: [
    { label: 'Width & Height', value: 'WIDTH_HEIGHT' },
    { label: 'Gap / Spacing', value: 'GAP' },
    { label: 'Corner Radius', value: 'CORNER_RADIUS' },
    { label: 'Opacity', value: 'OPACITY' },
    { label: 'Font Size', value: 'FONT_SIZE' },
    { label: 'Line Height', value: 'LINE_HEIGHT' },
    { label: 'Letter Spacing', value: 'LETTER_SPACING' },
    { label: 'Stroke Width', value: 'STROKE_FLOAT' },
  ],
  dimension: [
    { label: 'Width & Height', value: 'WIDTH_HEIGHT' },
    { label: 'Gap / Spacing', value: 'GAP' },
    { label: 'Corner Radius', value: 'CORNER_RADIUS' },
    { label: 'Stroke Width', value: 'STROKE_FLOAT' },
  ],
  string: [
    { label: 'Font Family', value: 'FONT_FAMILY' },
    { label: 'Font Style', value: 'FONT_STYLE' },
    { label: 'Text Content', value: 'TEXT_CONTENT' },
  ],
  boolean: [
    { label: 'Visibility (Show/Hide)', value: 'SHOW_HIDE' },
  ],
};

interface MetadataEditorProps {
  description: string;
  onDescriptionChange: (desc: string) => void;
  tokenType: string;
  scopes: string[];
  onScopesChange: (scopes: string[]) => void;
  dimensions: ThemeDimension[];
  modeValues: Record<string, any>;
  onModeValuesChange: (modes: Record<string, any>) => void;
  aliasMode: boolean;
  reference: string;
  value: any;
  extensionsJsonText: string;
  onExtensionsJsonTextChange: (text: string) => void;
  extensionsJsonError: string | null;
  onExtensionsJsonErrorChange: (err: string | null) => void;
  isCreateMode: boolean;
}

export function MetadataEditor({
  description, onDescriptionChange,
  tokenType, scopes, onScopesChange,
  dimensions, modeValues, onModeValuesChange,
  aliasMode, reference, value,
  extensionsJsonText, onExtensionsJsonTextChange,
  extensionsJsonError, onExtensionsJsonErrorChange,
  isCreateMode,
}: MetadataEditorProps) {
  const [showScopes, setShowScopes] = useState(false);
  const [showModeValues, setShowModeValues] = useState(false);
  const [showExtensions, setShowExtensions] = useState(false);

  return (
    <>
      {/* Description */}
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Description</label>
        <textarea
          value={description}
          onChange={e => onDescriptionChange(e.target.value)}
          placeholder="Optional description"
          rows={2}
          className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] resize-none min-h-[48px] placeholder:text-[var(--color-figma-text-secondary)]/50"
        />
      </div>

      {/* Figma Variable Scopes */}
    {FIGMA_SCOPES[tokenType] && (
      <div className="border-t border-[var(--color-figma-border)]">
        <button
          type="button"
          onClick={() => setShowScopes(v => !v)}
          title="Scopes control which Figma properties this variable is offered for"
          className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium"
        >
          <span>Figma variable scopes {scopes.length > 0 ? `(${scopes.length} selected)` : ''}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${showScopes ? 'rotate-180' : ''}`}>
            <path d="M2 3.5l3 3 3-3"/>
          </svg>
        </button>
        {showScopes && (
          <div className="px-3 py-2 flex flex-col gap-1.5">
            <p className="text-[9px] text-[var(--color-figma-text-secondary)] mb-1">
              Controls where this variable appears in Figma's variable picker. Empty = All scopes.
            </p>
            {FIGMA_SCOPES[tokenType].map(scope => (
              <label key={scope.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope.value)}
                  onChange={e => onScopesChange(
                    e.target.checked ? [...scopes, scope.value] : scopes.filter(s => s !== scope.value)
                  )}
                  className="w-3 h-3 rounded"
                />
                <span className="text-[11px] text-[var(--color-figma-text)]">{scope.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    )}

    {/* Mode Values */}
    {dimensions.length > 0 && (
      <div className="border-t border-[var(--color-figma-border)]">
        <button
          type="button"
          onClick={() => setShowModeValues(v => !v)}
          className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium"
        >
          <span>
            Mode values
            {Object.values(modeValues).filter(v => v !== '' && v !== undefined && v !== null).length > 0
              ? ` (${Object.values(modeValues).filter(v => v !== '' && v !== undefined && v !== null).length} set)`
              : ''}
          </span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${showModeValues ? 'rotate-180' : ''}`}>
            <path d="M2 3.5l3 3 3-3"/>
          </svg>
        </button>
        {showModeValues && (
          <div className="px-3 py-2 flex flex-col gap-3">
            <p className="text-[9px] text-[var(--color-figma-text-secondary)]">
              Override the default value per mode. Leave empty to inherit the default value.
            </p>
            {dimensions.map(dim => (
              <div key={dim.id}>
                <div className="text-[9px] font-medium text-[var(--color-figma-text-secondary)] uppercase tracking-wide mb-1.5">{dim.name}</div>
                {dim.options.map(option => {
                  const modeVal = modeValues[option.name] ?? '';
                  const isColorVal = tokenType === 'color' && typeof modeVal === 'string' && modeVal.startsWith('#') && !modeVal.startsWith('{');
                  return (
                    <div key={option.name} className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] text-[var(--color-figma-text)] w-16 shrink-0 truncate" title={option.name}>{option.name}</span>
                      {isColorVal && (
                        <div
                          className="w-4 h-4 rounded-sm border border-white/40 ring-1 ring-[var(--color-figma-border)] shrink-0"
                          style={{ backgroundColor: modeVal }}
                          aria-hidden="true"
                        />
                      )}
                      <input
                        type="text"
                        value={modeVal}
                        onChange={e => onModeValuesChange({ ...modeValues, [option.name]: e.target.value })}
                        placeholder={aliasMode ? (reference || 'value or {alias}') : String(value !== '' && value !== undefined ? value : 'value or {alias}')}
                        className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-secondary)]/40"
                      />
                      {modeVal !== '' && (
                        <button
                          type="button"
                          onClick={() => { const next = { ...modeValues }; delete next[option.name]; onModeValuesChange(next); }}
                          title={`Clear ${option.name} override`}
                          className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 shrink-0"
                        >
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M18 6L6 18M6 6l12 12"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    )}

    {/* Other extensions */}
    {!isCreateMode && (
      <div className="border-t border-[var(--color-figma-border)]">
        <button
          type="button"
          onClick={() => setShowExtensions(v => !v)}
          className="w-full px-3 py-2 flex items-center justify-between bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium"
        >
          <span className="flex items-center gap-1.5">
            Extensions
            {extensionsJsonText.trim() && extensionsJsonText.trim() !== '{}' && (
              <span className="px-1 py-0.5 rounded bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] text-[8px] font-medium">custom</span>
            )}
            {extensionsJsonError && (
              <span className="px-1 py-0.5 rounded bg-[var(--color-figma-error)]/15 text-[var(--color-figma-error)] text-[8px] font-medium">invalid JSON</span>
            )}
          </span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${showExtensions ? 'rotate-180' : ''}`}>
            <path d="M2 3.5l3 3 3-3"/>
          </svg>
        </button>
        {showExtensions && (
          <div className="px-3 py-2 flex flex-col gap-2 border-t border-[var(--color-figma-border)]">
            <p className="text-[9px] text-[var(--color-figma-text-secondary)]">
              Custom <code className="font-mono px-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">$extensions</code> data as JSON object. The <code className="font-mono px-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">tokenmanager</code> and <code className="font-mono px-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">com.figma.scopes</code> keys are managed above and will not be overwritten here.
            </p>
            <textarea
              value={extensionsJsonText}
              onChange={e => {
                const text = e.target.value;
                onExtensionsJsonTextChange(text);
                const trimmed = text.trim();
                if (!trimmed || trimmed === '{}') {
                  onExtensionsJsonErrorChange(null);
                } else {
                  try {
                    const parsed = JSON.parse(trimmed);
                    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
                      onExtensionsJsonErrorChange('Must be a JSON object');
                    } else {
                      onExtensionsJsonErrorChange(null);
                    }
                  } catch {
                    onExtensionsJsonErrorChange('Invalid JSON');
                  }
                }
              }}
              placeholder={'{\n  "my.tool": { "category": "brand" }\n}'}
              rows={5}
              spellCheck={false}
              className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[10px] font-mono outline-none resize-y min-h-[72px] placeholder:text-[var(--color-figma-text-secondary)]/40 ${extensionsJsonError ? 'border-[var(--color-figma-error)] focus:border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)] focus:border-[var(--color-figma-accent)]'}`}
            />
            {extensionsJsonError && (
              <p className="text-[9px] text-[var(--color-figma-error)]">{extensionsJsonError}</p>
            )}
          </div>
        )}
      </div>
    )}
    </>
  );
}
