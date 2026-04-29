import { ValueDiff } from '../ValueDiff';
import {
  type ChangeStatus,
  type TokenChange,
  statusColor,
  statusLabel,
  summarizeChanges,
  formatTokenValue,
  ColorSwatch,
  CollapsibleChangeSection,
  ChangeSummaryBadges,
} from '../../shared/changeHelpers';
import { stableStringify } from '../../shared/utils';

export function StatusBadge({ status }: { status: ChangeStatus }) {
  return (
    <span
      className="text-secondary font-medium uppercase tracking-wide shrink-0 px-1 py-0.5 rounded"
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
  const hasValueDiff = stableStringify(change.before) !== stableStringify(change.after);
  const nonValueChangedFields = (change.changedFields ?? []).filter(field => field !== '$value');
  const changedFieldSummary = nonValueChangedFields
    .map(field => field.replace(/^\$/, ''))
    .join(', ');

  return (
    <div className="px-3 py-2 space-y-1 group/row relative">
      <div className="flex items-center gap-2">
        <StatusBadge status={change.status} />
        <span className="text-secondary font-mono text-[color:var(--color-figma-text)] truncate" title={change.path}>
          {change.path}
        </span>
        <span className="text-secondary text-[color:var(--color-figma-text-tertiary)] shrink-0">{change.type}</span>
        {restoreButton}
      </div>

      {change.status === 'modified' && hasValueDiff && (
        <ValueDiff type={change.type} before={change.before} after={change.after} />
      )}
      {change.status === 'modified' && changedFieldSummary.length > 0 && (
        <div className="pl-1 text-secondary text-[color:var(--color-figma-text-secondary)]">
          Updated {changedFieldSummary}
        </div>
      )}
      {change.status === 'added' && (
        <div className="flex items-center gap-1.5 pl-1">
          {change.type === 'color' && typeof change.after === 'string' && (
            <ColorSwatch color={change.after} />
          )}
          <span className="text-secondary font-mono text-[color:var(--color-figma-text-secondary)]">
            {formatTokenValue(change.type, change.after)}
          </span>
        </div>
      )}
      {change.status === 'removed' && (
        <div className="flex items-center gap-1.5 pl-1">
          {change.type === 'color' && typeof change.before === 'string' && (
            <ColorSwatch color={change.before} />
          )}
          <span className="text-secondary font-mono text-[color:var(--color-figma-text-tertiary)] line-through">
            {formatTokenValue(change.type, change.before)}
          </span>
        </div>
      )}
    </div>
  );
}

interface ChangesByCollectionListProps {
  changes: TokenChange[];
  /** Collapse state for each collection section — callers own this state and initialize it on data arrival */
  openSections: Record<string, boolean>;
  onToggleSection: (key: string) => void;
  /** Optional per-row action button (e.g. restore button in GitCommitsSource) */
  renderRowActions?: (change: TokenChange) => React.ReactNode;
  /** Show a "N changes across M collections" summary bar above the list */
  showSummaryBar?: boolean;
}

/**
 * Renders token changes grouped by collection id. Each group is a collapsible
 * Section with a ChangeSummaryBadges badge. Callers own the openSections state
 * and must initialize it (set all keys to true) when data arrives.
 */
export function ChangesByCollectionList({
  changes,
  openSections,
  onToggleSection,
  renderRowActions,
  showSummaryBar,
}: ChangesByCollectionListProps) {
  const changesByCollection = new Map<string, TokenChange[]>();
  for (const change of changes) {
    if (!changesByCollection.has(change.collectionId)) {
      changesByCollection.set(change.collectionId, []);
    }
    changesByCollection.get(change.collectionId)!.push(change);
  }

  return (
    <>
      {showSummaryBar && (
        <div className="flex items-center gap-2 px-1 py-1">
          <ChangeSummaryBadges {...summarizeChanges(changes)} />
          <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
            across {changesByCollection.size} collection{changesByCollection.size !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      {Array.from(changesByCollection.entries()).map(([collectionId, collectionChanges]) => {
        const collectionSummary = summarizeChanges(collectionChanges);
        return (
          <CollapsibleChangeSection
            key={collectionId}
            title={collectionId}
            open={openSections[collectionId] ?? true}
            onToggle={() => onToggleSection(collectionId)}
            badge={<ChangeSummaryBadges {...collectionSummary} />}
          >
            <div className="divide-y divide-[var(--color-figma-border)]">
              {collectionChanges.map((change, i) => (
                <ChangeRow
                  key={`${change.path}-${i}`}
                  change={change}
                  restoreButton={renderRowActions?.(change)}
                />
              ))}
            </div>
          </CollapsibleChangeSection>
        );
      })}
    </>
  );
}
