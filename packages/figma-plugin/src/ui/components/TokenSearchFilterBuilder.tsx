import { useEffect, useMemo, useRef, useState } from 'react';
import { QUERY_QUALIFIERS } from './tokenListUtils';
import type { HasQualifierValue, ParsedQuery } from './tokenListUtils';

export type FilterBuilderSection = 'type' | 'has' | 'path' | 'name' | 'value' | 'desc' | 'generator';

interface TokenSearchFilterBuilderProps {
  isOpen: boolean;
  selectedSection: FilterBuilderSection | null;
  onSelectSection: (section: FilterBuilderSection) => void;
  onToggleOpen: () => void;
  parsedSearchQuery: ParsedQuery;
  selectedTypeQualifiers: string[];
  selectedHasQualifiers: HasQualifierValue[];
  qualifierTypeOptions: string[];
  generatorNames: string[];
  onToggleQualifierValue: (qualifier: 'type' | 'has', value: string) => void;
  onAddQualifierValue: (qualifier: 'path' | 'name' | 'value' | 'desc' | 'generator', value: string) => void;
  onRemoveQualifierValue: (qualifier: FilterBuilderSection, value: string) => void;
  onClearQualifier: (qualifier: FilterBuilderSection) => void;
}

type TextFilterSection = Extract<FilterBuilderSection, 'path' | 'name' | 'value' | 'desc' | 'generator'>;

const FILTER_SECTIONS: Array<{ key: FilterBuilderSection; label: string; helper: string }> = [
  { key: 'type', label: 'Type', helper: 'Filter by DTCG token type.' },
  { key: 'has', label: 'Token state', helper: 'Find aliases, duplicates, generated tokens, and more.' },
  { key: 'path', label: 'Path', helper: 'Match full token paths such as colors.brand or spacing.' },
  { key: 'name', label: 'Leaf name', helper: 'Match only the final segment such as primary or 500.' },
  { key: 'value', label: 'Value', helper: 'Search serialized token values such as #ff0000 or 16px.' },
  { key: 'desc', label: 'Description', helper: 'Search token descriptions.' },
  { key: 'generator', label: 'Generator', helper: 'Match tokens produced by a generator name.' },
];

const TEXT_SECTION_CONFIG: Record<TextFilterSection, { label: string; placeholder: string; hint: string }> = {
  path: {
    label: 'Path filters',
    placeholder: 'colors.brand',
    hint: 'Add one or more path fragments. Each one becomes a path: clause.',
  },
  name: {
    label: 'Leaf name filters',
    placeholder: 'primary',
    hint: 'Match only the last segment of the token path.',
  },
  value: {
    label: 'Value filters',
    placeholder: '#ff0000',
    hint: 'Useful for colors, dimensions, and other exact value fragments.',
  },
  desc: {
    label: 'Description filters',
    placeholder: 'marketing',
    hint: 'Match description text without typing desc: yourself.',
  },
  generator: {
    label: 'Generator filters',
    placeholder: 'color-ramp',
    hint: 'Filter tokens by the generator that created them.',
  },
};

const HAS_OPTION_ORDER: HasQualifierValue[] = [
  'alias',
  'direct',
  'duplicate',
  'description',
  'extension',
  'generated',
  'unused',
];

function getHasOptionDescription(value: HasQualifierValue): string {
  return QUERY_QUALIFIERS.find(def => def.qualifier === `has:${value}`)?.desc ?? 'Filter by token state.';
}

function buildActiveCounts(parsedSearchQuery: ParsedQuery, selectedHasQualifiers: HasQualifierValue[]): Record<FilterBuilderSection, number> {
  return {
    type: parsedSearchQuery.types.length,
    has: selectedHasQualifiers.length,
    path: parsedSearchQuery.paths.length,
    name: parsedSearchQuery.names.length,
    value: parsedSearchQuery.values.length,
    desc: parsedSearchQuery.descs.length,
    generator: parsedSearchQuery.generators.length,
  };
}

export function TokenSearchFilterBuilder({
  isOpen,
  selectedSection,
  onSelectSection,
  onToggleOpen,
  parsedSearchQuery,
  selectedTypeQualifiers,
  selectedHasQualifiers,
  qualifierTypeOptions,
  generatorNames,
  onToggleQualifierValue,
  onAddQualifierValue,
  onRemoveQualifierValue,
  onClearQualifier,
}: TokenSearchFilterBuilderProps) {
  const [drafts, setDrafts] = useState<Record<TextFilterSection, string>>({
    path: '',
    name: '',
    value: '',
    desc: '',
    generator: '',
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const activeCounts = useMemo(
    () => buildActiveCounts(parsedSearchQuery, selectedHasQualifiers),
    [parsedSearchQuery, selectedHasQualifiers],
  );

  const activeChips = useMemo(() => {
    const chips: Array<{ qualifier: FilterBuilderSection; label: string; value: string }> = [];
    for (const value of parsedSearchQuery.types) chips.push({ qualifier: 'type', label: `Type · ${value}`, value });
    for (const value of selectedHasQualifiers) chips.push({ qualifier: 'has', label: `State · ${value}`, value });
    for (const value of parsedSearchQuery.paths) chips.push({ qualifier: 'path', label: `Path · ${value}`, value });
    for (const value of parsedSearchQuery.names) chips.push({ qualifier: 'name', label: `Name · ${value}`, value });
    for (const value of parsedSearchQuery.values) chips.push({ qualifier: 'value', label: `Value · ${value}`, value });
    for (const value of parsedSearchQuery.descs) chips.push({ qualifier: 'desc', label: `Description · ${value}`, value });
    for (const value of parsedSearchQuery.generators) chips.push({ qualifier: 'generator', label: `Generator · ${value}`, value });
    return chips;
  }, [parsedSearchQuery, selectedHasQualifiers]);

  useEffect(() => {
    if (!isOpen || !selectedSection || selectedSection === 'type' || selectedSection === 'has') return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isOpen, selectedSection]);

  const selectedTextValues = useMemo(() => {
    switch (selectedSection) {
      case 'path': return parsedSearchQuery.paths;
      case 'name': return parsedSearchQuery.names;
      case 'value': return parsedSearchQuery.values;
      case 'desc': return parsedSearchQuery.descs;
      case 'generator': return parsedSearchQuery.generators;
      default: return [];
    }
  }, [parsedSearchQuery, selectedSection]);

  const handleTextSubmit = (qualifier: TextFilterSection) => {
    const nextValue = drafts[qualifier].trim();
    if (!nextValue) return;
    onAddQualifierValue(qualifier, nextValue);
    setDrafts(prev => ({ ...prev, [qualifier]: '' }));
  };

  return (
    <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--color-figma-border)] px-3 py-2">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold text-[var(--color-figma-text)]">Filter builder</div>
          <div className="mt-0.5 text-[9px] leading-snug text-[var(--color-figma-text-secondary)]">
            Pick filters directly instead of memorizing <code className="font-mono text-[var(--color-figma-text)]">type:</code> or <code className="font-mono text-[var(--color-figma-text)]">has:</code>. Power-user clauses still work in search.
          </div>
        </div>
        <button
          onClick={onToggleOpen}
          className="shrink-0 rounded border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
        >
          {isOpen ? 'Hide editor' : 'Edit filters'}
        </button>
      </div>

      {activeChips.length > 0 && (
        <div className="border-b border-[var(--color-figma-border)] px-3 py-2">
          <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-figma-text-tertiary)]">Active clauses</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {activeChips.map(chip => (
              <button
                key={`${chip.qualifier}:${chip.value}`}
                onClick={() => onRemoveQualifierValue(chip.qualifier, chip.value)}
                className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[9px] text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]"
                title={`Remove ${chip.label}`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isOpen && (
        <div className="space-y-3 px-3 py-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTER_SECTIONS.map(section => (
              <button
                key={section.key}
                onClick={() => onSelectSection(section.key)}
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-medium transition-colors ${
                  selectedSection === section.key
                    ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                    : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)]/40 hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]'
                }`}
                title={section.helper}
              >
                <span>{section.label}</span>
                {activeCounts[section.key] > 0 && (
                  <span className="rounded-full bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[9px] leading-none text-[var(--color-figma-text)]">
                    {activeCounts[section.key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {selectedSection === null && (
            <div className="rounded border border-dashed border-[var(--color-figma-border)] px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
              Choose a filter family to add or edit its clauses.
            </div>
          )}

          {selectedSection === 'type' && (
            <section className="space-y-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-medium text-[var(--color-figma-text)]">Type filters</div>
                  <div className="mt-0.5 text-[9px] text-[var(--color-figma-text-tertiary)]">Pick one or more token types.</div>
                </div>
                {selectedTypeQualifiers.length > 0 && (
                  <button
                    onClick={() => onClearQualifier('type')}
                    className="rounded px-2 py-1 text-[9px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg)] hover:text-[var(--color-figma-text)]"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {qualifierTypeOptions.map(type => {
                  const normalizedType = type.toLowerCase();
                  const selected = selectedTypeQualifiers.includes(normalizedType);
                  return (
                    <button
                      key={type}
                      onClick={() => onToggleQualifierValue('type', type)}
                      className={`rounded border px-2 py-1 text-left text-[10px] transition-colors ${
                        selected
                          ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                          : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]'
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {selectedSection === 'has' && (
            <section className="space-y-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-medium text-[var(--color-figma-text)]">Token state filters</div>
                  <div className="mt-0.5 text-[9px] text-[var(--color-figma-text-tertiary)]">Pick the token states you want to keep visible.</div>
                </div>
                {selectedHasQualifiers.length > 0 && (
                  <button
                    onClick={() => onClearQualifier('has')}
                    className="rounded px-2 py-1 text-[9px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg)] hover:text-[var(--color-figma-text)]"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {HAS_OPTION_ORDER.map(option => {
                  const selected = selectedHasQualifiers.includes(option);
                  return (
                    <button
                      key={option}
                      onClick={() => onToggleQualifierValue('has', option)}
                      className={`rounded border px-2 py-1.5 text-left transition-colors ${
                        selected
                          ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                          : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]'
                      }`}
                    >
                      <div className="text-[10px] font-medium">{option}</div>
                      <div className="mt-0.5 text-[9px] leading-snug text-[var(--color-figma-text-tertiary)]">{getHasOptionDescription(option)}</div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {selectedSection && TEXT_SECTION_CONFIG[selectedSection as TextFilterSection] && (
            <section className="space-y-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-medium text-[var(--color-figma-text)]">{TEXT_SECTION_CONFIG[selectedSection as TextFilterSection].label}</div>
                  <div className="mt-0.5 text-[9px] text-[var(--color-figma-text-tertiary)]">{TEXT_SECTION_CONFIG[selectedSection as TextFilterSection].hint}</div>
                </div>
                {selectedTextValues.length > 0 && (
                  <button
                    onClick={() => onClearQualifier(selectedSection)}
                    className="rounded px-2 py-1 text-[9px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg)] hover:text-[var(--color-figma-text)]"
                  >
                    Clear
                  </button>
                )}
              </div>

              {selectedTextValues.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedTextValues.map(value => (
                    <button
                      key={value}
                      onClick={() => onRemoveQualifierValue(selectedSection, value)}
                      className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[9px] text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]"
                    >
                      {value}
                    </button>
                  ))}
                </div>
              )}

              <form
                onSubmit={event => {
                  event.preventDefault();
                  handleTextSubmit(selectedSection as TextFilterSection);
                }}
                className="flex gap-2"
              >
                <input
                  ref={inputRef}
                  list={selectedSection === 'generator' && generatorNames.length > 0 ? 'token-generator-filter-options' : undefined}
                  value={drafts[selectedSection as TextFilterSection]}
                  onChange={event => {
                    const nextValue = event.target.value;
                    setDrafts(prev => ({ ...prev, [selectedSection as TextFilterSection]: nextValue }));
                  }}
                  placeholder={TEXT_SECTION_CONFIG[selectedSection as TextFilterSection].placeholder}
                  className="min-w-0 flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[10px] text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
                />
                <button
                  type="submit"
                  disabled={!drafts[selectedSection as TextFilterSection].trim()}
                  className="rounded bg-[var(--color-figma-accent)] px-2.5 py-1.5 text-[10px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Add
                </button>
              </form>

              {selectedSection === 'generator' && generatorNames.length > 0 && (
                <datalist id="token-generator-filter-options">
                  {generatorNames.map(name => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
