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
  setCount: number;
}

export interface SnapshotDiff {
  path: string;
  set: string;
  status: ChangeStatus;
  before?: { $value: unknown; $type?: string };
  after?: { $value: unknown; $type?: string };
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
  setName: string;
  affectedPaths: string[];
  rolledBack: boolean;
}

export interface HistoryPanelProps {
  serverUrl: string;
  connected: boolean;
  onPushUndo?: (slot: UndoSlot) => void;
  onRefreshTokens?: () => void;
  /** When set, filter history to only entries that touched this token path */
  filterTokenPath?: string | null;
  onClearFilter?: () => void;
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
}

/** Convert snapshot diff entry to unified TokenChange */
export function snapshotDiffToChange(d: SnapshotDiff): TokenChange {
  const type = (d.before as any)?.$type ?? (d.after as any)?.$type ?? '';
  return {
    path: d.path,
    set: d.set,
    type,
    status: d.status,
    before: (d.before as any)?.$value,
    after: (d.after as any)?.$value,
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
  return `Snapshot ${yyyy}-${mm}-${dd} ${hh}:${min}`;
}
