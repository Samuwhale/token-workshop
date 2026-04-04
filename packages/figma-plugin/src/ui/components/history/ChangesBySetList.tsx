import { ValueDiff } from '../ValueDiff';
import {
  type ChangeStatus,
  type TokenChange,
  statusColor,
  statusLabel,
  summarizeChanges,
  formatTokenValue,
  ColorSwatch,
  Section,
  ChangeSummaryBadges,
} from '../../shared/changeHelpers';

export function StatusBadge({ status }: { status: ChangeStatus }) {
  return (
    <span
      className="text-[10px] font-medium uppercase tracking-wide shrink-0 px-1 py-0.5 rounded"
      style={{
        color: statusColor(status),
        backgroundColor: `color-mix(in srgb, ${statusColor(status)} 12%, transparent)`,
      }}
    >
      {statusLabel(status)}
    </span>
  );
}

/** Shared change row with inline diff — used by GitCommitsSource and snapshot compare views */
export function ChangeRow({ change, restoreButton }: { change: TokenChange; restoreButton?: React.ReactNode }) {
  return (
    <div className="px-3 py-2 space-y-1 group/row relative">
      <div className="flex items-center gap-2">
        <StatusBadge status={change.status} />
        <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={change.path}>
          {change.path}
        </span>
        <span className="text-[10px] text-[var(--color-figma-text-tertiary)] shrink-0">{change.type}</span>
        {restoreButton}
      </div>

      {change.status === 'modified' && (
        <ValueDiff type={change.type} before={change.before} after={change.after} />
      )}
      {change.status === 'added' && (
        <div className="flex items-center gap-1.5 pl-1">
          {change.type === 'color' && typeof change.after === 'string' && (
            <ColorSwatch color={change.after} />
          )}
          <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)]">
            {formatTokenValue(change.type, change.after)}
          </span>
        </div>
      )}
      {change.status === 'removed' && (
        <div className="flex items-center gap-1.5 pl-1">
          {change.type === 'color' && typeof change.before === 'string' && (
            <ColorSwatch color={change.before} />
          )}
          <span className="text-[10px] font-mono text-[var(--color-figma-text-tertiary)] line-through">
            {formatTokenValue(change.type, change.before)}
          </span>
        </div>
      )}
    </div>
  );
}

interface ChangesBySetListProps {
  changes: TokenChange[];
  /** Collapse state for each set section — callers own this state and initialize it on data arrival */
  openSections: Record<string, boolean>;
  onToggleSection: (key: string) => void;
  /** Optional per-row action button (e.g. restore button in GitCommitsSource) */
  renderRowActions?: (change: TokenChange) => React.ReactNode;
  /** Show a "N changes across M sets" summary bar above the list */
  showSummaryBar?: boolean;
}

/**
 * Renders token changes grouped by set name. Each group is a collapsible
 * Section with a ChangeSummaryBadges badge. Callers own the openSections state
 * and must initialize it (set all keys to true) when data arrives.
 */
export function ChangesBySetList({
  changes,
  openSections,
  onToggleSection,
  renderRowActions,
  showSummaryBar,
}: ChangesBySetListProps) {
  const bySet = new Map<string, TokenChange[]>();
  for (const change of changes) {
    if (!bySet.has(change.set)) bySet.set(change.set, []);
    bySet.get(change.set)!.push(change);
  }

  return (
    <>
      {showSummaryBar && (
        <div className="flex items-center gap-2 px-1 py-1">
          <ChangeSummaryBadges {...summarizeChanges(changes)} />
          <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
            across {bySet.size} set{bySet.size !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      {Array.from(bySet.entries()).map(([setName, setChanges]) => {
        const setSummary = summarizeChanges(setChanges);
        return (
          <Section
            key={setName}
            title={setName}
            open={openSections[setName] ?? true}
            onToggle={() => onToggleSection(setName)}
            badge={<ChangeSummaryBadges {...setSummary} />}
          >
            <div className="divide-y divide-[var(--color-figma-border)]">
              {setChanges.map((change, i) => (
                <ChangeRow
                  key={`${change.path}-${i}`}
                  change={change}
                  restoreButton={renderRowActions?.(change)}
                />
              ))}
            </div>
          </Section>
        );
      })}
    </>
  );
}
