import type { ChangeStatus, TokenChange } from '../../shared/changeHelpers';

export type { ChangeStatus, TokenChange };

export interface CommitEntry {
  hash: string;
  date: string;
  message: string;
  author: string;
}

export interface CommitDetail {
  hash: string;
  changes: TokenChange[];
  fileCount: number;
}

export interface SnapshotSummary {
  id: string;
  label: string;
  timestamp: string;
  tokenCount: number;
  collectionStorageCount: number;
  collectionCount: number;
  resolverCount: number;
  generatorCount: number;
}

export interface SnapshotDiff {
  path: string;
  collectionId: string;
  status: ChangeStatus;
  changedFields?: string[];
  before?: { $value: unknown; $type?: string; $description?: string };
  after?: { $value: unknown; $type?: string; $description?: string };
}

export interface WorkspaceDiff {
  kind: 'collections' | 'resolver' | 'generator';
  id: string;
  label: string;
  status: ChangeStatus;
}

export interface SnapshotCompareResponse {
  diffs: SnapshotDiff[];
  workspaceDiffs: WorkspaceDiff[];
}

export interface UndoSlot {
  description: string;
  restore: () => Promise<void>;
}

export interface OperationEntry {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  resourceId: string;
  affectedPaths: string[];
  rolledBack: boolean;
	  metadata?: {
	    kind?: string;
	    name?: string;
	    generatorName?: string;
	    targetCollectionId?: string;
	    collectionId?: string;
	    changes?: Array<{
      field: string;
      label: string;
      before?: string;
      after?: string;
    }>;
  };
}

export type HistoryView = 'recent' | 'saved';
export type HistoryScopeMode = 'all' | 'current';

export interface HistoryScope {
  mode: HistoryScopeMode;
  collectionId: string | null;
  tokenPath: string | null;
  view: HistoryView;
}

export interface HistoryPanelProps {
  serverUrl: string;
  connected: boolean;
  collectionIds?: string[];
  workingCollectionId: string;
  scope: HistoryScope;
  onScopeChange: (scope: HistoryScope) => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onRefreshTokens?: () => void;
  /** Server operation log entries */
  recentOperations?: OperationEntry[];
  /** Total number of server operations (may exceed loaded count) */
  totalOperations?: number;
  /** Whether more server operations can be loaded */
  hasMoreOperations?: boolean;
  /** Load the next batch of server operations */
  onLoadMoreOperations?: () => void;
  /** Rollback a server operation by ID */
  onRollback?: (opId: string) => void;
  /** Descriptions of local undo stack entries (most recent last) */
  undoDescriptions?: string[];
  /** Set of original op IDs that currently have a server redo available */
  redoableOpIds?: Set<string>;
  /** Redo a previously rolled-back server operation by its original op ID */
  onServerRedo?: (opId: string) => void;
  /** Execute the topmost local undo (Cmd+Z equivalent) */
  executeUndo?: () => Promise<void>;
}

/** Convert snapshot diff entry to unified TokenChange */
export function snapshotDiffToChange(d: SnapshotDiff): TokenChange {
  const type = d.before?.$type ?? d.after?.$type ?? '';
  return {
    path: d.path,
    collectionId: d.collectionId,
    type,
    status: d.status,
    before: d.before?.$value,
    after: d.after?.$value,
    changedFields: d.changedFields,
  };
}

export function defaultSnapshotLabel(lastOpDescription?: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  if (lastOpDescription) return `Before ${lastOpDescription}`;
  return `Checkpoint ${yyyy}-${mm}-${dd} ${hh}:${min}`;
}
