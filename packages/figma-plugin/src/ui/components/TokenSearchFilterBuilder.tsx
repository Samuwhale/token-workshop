import { useEffect, useMemo, useRef, useState } from 'react';
import { QUERY_QUALIFIERS } from './tokenListUtils';
import type { HasQualifierValue, ParsedQuery } from './tokenListUtils';

export type FilterBuilderSection = 'type' | 'has' | 'path' | 'name' | 'value' | 'desc' | 'generator';

interface TokenSearchFilterChipsProps {
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

const FILTER_SECTION_LABELS: Record<FilterBuilderSection, string> = {
  type: 'Type',
  has: 'State',
  path: 'Path',
  name: 'Name',
  value: 'Value',
  desc: 'Description',
  generator: 'Generator',
};

const TEXT_SECTION_PLACEHOLDERS: Record<TextFilterSection, string> = {
  path: 'colors.brand',
  name: 'primary',
  value: '#ff0000',
  desc: 'marketing',
  generator: 'color-ramp',
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
  return QUERY_QUALIFIERS.find(def => def.qualifier === `has:${value}`)?.desc ?? '';
}

interface ChipData {
  qualifier: FilterBuilderSection;
  value: string;
  label: string;
}

function buildChips(parsedSearchQuery: ParsedQuery, selectedHasQualifiers: HasQualifierValue[]): ChipData[] {
  const chips: ChipData[] = [];
  for (const value of parsedSearchQuery.types) chips.push({ qualifier: 'type', value, label: `${value}` });
  for (const value of selectedHasQualifiers) chips.push({ qualifier: 'has', value, label: `${value}` });
  for (const value of parsedSearchQuery.paths) chips.push({ qualifier: 'path', value, label: `${value}` });
  for (const value of parsedSearchQuery.names) chips.push({ qualifier: 'name', value, label: `${value}` });
  for (const value of parsedSearchQuery.values) chips.push({ qualifier: 'value', value, label: `${value}` });
  for (const value of parsedSearchQuery.descs) chips.push({ qualifier: 'desc', value, label: `${value}` });
  for (const value of parsedSearchQuery.generators) chips.push({ qualifier: 'generator', value, label: `${value}` });
  return chips;
}

const ADD_FILTER_SECTIONS: FilterBuilderSection[] = ['type', 'has', 'path', 'name', 'value', 'desc', 'generator'];

/**
 * Inline filter chips displayed below the search input.
 * Each chip is removable; clicking it opens an inline editor popover.
 * A "+" button opens a section picker to add new filters.
 */
export function TokenSearchFilterChips({
  parsedSearchQuery,
  selectedTypeQualifiers,
  selectedHasQualifiers,
  qualifierTypeOptions,
  generatorNames,
  onToggleQualifierValue,
  onAddQualifierValue,
  onRemoveQualifierValue,
  onClearQualifier,
}: TokenSearchFilterChipsProps) {
  const [editingSection, setEditingSection] = useState<FilterBuilderSection | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const chips = useMemo(
    () => buildChips(parsedSearchQuery, selectedHasQualifiers),
    [parsedSearchQuery, selectedHasQualifiers],
  );

  // Close popover on outside click
  useEffect(() => {
    if (!editingSection && !showAddMenu) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setEditingSection(null);
      }
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [editingSection, showAddMenu]);

  // Focus text input when opening a text section
  useEffect(() => {
    if (editingSection && editingSection !== 'type' && editingSection !== 'has') {
      textInputRef.current?.focus();
    }
  }, [editingSection]);

  // Reset draft when switching sections
  useEffect(() => {
    setTextDraft('');
  }, [editingSection]);

  if (chips.length === 0 && !editingSection && !showAddMenu) return null;

  const handleTextSubmit = (qualifier: TextFilterSection) => {
    const trimmed = textDraft.trim();
    if (!trimmed) return;
    onAddQualifierValue(qualifier, trimmed);
    setTextDraft('');
    textInputRef.current?.focus();
  };

  const openSectionForAdd = (section: FilterBuilderSection) => {
    setShowAddMenu(false);
    setEditingSection(section);
  };

  const handleChipClick = (chip: ChipData) => {
    setShowAddMenu(false);
    setEditingSection(chip.qualifier);
  };

  const selectedTextValues = (() => {
    switch (editingSection) {
      case 'path': return parsedSearchQuery.paths;
      case 'name': return parsedSearchQuery.names;
      case 'value': return parsedSearchQuery.values;
      case 'desc': return parsedSearchQuery.descs;
      case 'generator': return parsedSearchQuery.generators;
      default: return [];
    }
  })();

  return (
    <div className="flex flex-wrap items-center gap-1 pt-1.5">
      {chips.map(chip => (
        <span
          key={`${chip.qualifier}:${chip.value}`}
          className="group inline-flex items-center gap-0.5 rounded border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/5 pl-1.5 pr-0.5 py-0.5 text-[9px] leading-none"
        >
          <button
            onClick={() => handleChipClick(chip)}
            className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
            title={`Edit ${FILTER_SECTION_LABELS[chip.qualifier]} filters`}
          >
            <span className="font-medium text-[var(--color-figma-accent)]">{FILTER_SECTION_LABELS[chip.qualifier]}</span>
            <span className="mx-0.5 text-[var(--color-figma-text-tertiary)]">=</span>
            <span>{chip.label}</span>
          </button>
          <button
            onClick={() => onRemoveQualifierValue(chip.qualifier, chip.value)}
            className="ml-0.5 rounded p-0.5 text-[var(--color-figma-text-tertiary)] opacity-0 transition-all group-hover:opacity-100 hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
            title="Remove filter"
            aria-label={`Remove ${FILTER_SECTION_LABELS[chip.qualifier]} ${chip.value}`}
          >
            <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </span>
      ))}

      {/* Add filter button */}
      <div className="relative" ref={addMenuRef}>
        <button
          onClick={() => { setShowAddMenu(prev => !prev); setEditingSection(null); }}
          className="inline-flex items-center gap-0.5 rounded border border-dashed border-[var(--color-figma-border)] px-1.5 py-0.5 text-[9px] leading-none text-[var(--color-figma-text-tertiary)] transition-colors hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text-secondary)]"
          title="Add a filter"
        >
          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Filter
        </button>

        {showAddMenu && (
          <div className="absolute left-0 top-full z-50 mt-1 w-[140px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg">
            {ADD_FILTER_SECTIONS.map(section => (
              <button
                key={section}
                onClick={() => openSectionForAdd(section)}
                className="flex w-full items-center px-2 py-1.5 text-left text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
              >
                {FILTER_SECTION_LABELS[section]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Inline editing popover */}
      {editingSection && (
        <div
          ref={popoverRef}
          className="mt-1 w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-[var(--color-figma-border)]">
            <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
              {FILTER_SECTION_LABELS[editingSection]}
            </span>
            <div className="flex items-center gap-1.5">
              {(() => {
                const count =
                  editingSection === 'type' ? selectedTypeQualifiers.length
                  : editingSection === 'has' ? selectedHasQualifiers.length
                  : selectedTextValues.length;
                return count > 0 ? (
                  <button
                    onClick={() => { onClearQualifier(editingSection); }}
                    className="text-[9px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] transition-colors"
                  >
                    Clear all
                  </button>
                ) : null;
              })()}
              <button
                onClick={() => setEditingSection(null)}
                className="rounded p-0.5 text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors"
                title="Close"
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="p-2.5">
            {editingSection === 'type' && (
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
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
                          : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]'
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            )}

            {editingSection === 'has' && (
              <div className="grid gap-1 sm:grid-cols-2">
                {HAS_OPTION_ORDER.map(option => {
                  const selected = selectedHasQualifiers.includes(option);
                  return (
                    <button
                      key={option}
                      onClick={() => onToggleQualifierValue('has', option)}
                      className={`rounded border px-2 py-1.5 text-left transition-colors ${
                        selected
                          ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                          : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-text)]'
                      }`}
                    >
                      <div className="text-[10px] font-medium">{option}</div>
                      <div className="mt-0.5 text-[9px] leading-snug text-[var(--color-figma-text-tertiary)]">{getHasOptionDescription(option)}</div>
                    </button>
                  );
                })}
              </div>
            )}

            {editingSection && editingSection !== 'type' && editingSection !== 'has' && (
              <div className="space-y-2">
                {selectedTextValues.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedTextValues.map(val => (
                      <button
                        key={val}
                        onClick={() => onRemoveQualifierValue(editingSection, val)}
                        className="inline-flex items-center gap-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[9px] text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)]"
                      >
                        {val}
                        <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={e => {
                    e.preventDefault();
                    handleTextSubmit(editingSection as TextFilterSection);
                  }}
                  className="flex gap-1.5"
                >
                  <input
                    ref={textInputRef}
                    list={editingSection === 'generator' && generatorNames.length > 0 ? 'filter-chip-generator-options' : undefined}
                    value={textDraft}
                    onChange={e => setTextDraft(e.target.value)}
                    placeholder={TEXT_SECTION_PLACEHOLDERS[editingSection as TextFilterSection]}
                    className="min-w-0 flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1 text-[10px] text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
                    onKeyDown={e => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingSection(null);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!textDraft.trim()}
                    className="rounded bg-[var(--color-figma-accent)] px-2 py-1 text-[10px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Add
                  </button>
                </form>

                {editingSection === 'generator' && generatorNames.length > 0 && (
                  <datalist id="filter-chip-generator-options">
                    {generatorNames.map(name => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
