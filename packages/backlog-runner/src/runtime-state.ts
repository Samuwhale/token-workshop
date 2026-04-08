import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  BacklogTaskClaim,
  BacklogTaskLease,
  BacklogTaskSpec,
  TaskBlockage,
  TaskReservationSnapshot,
} from './types.js';

const DEFAULT_LEASE_DURATION_MS = 10 * 60 * 1000;

function isoNow(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

export class RuntimeStateStore {
  private readonly db: DatabaseSync;
  readonly leaseDurationMs: number;

  constructor(
    dbPath: string,
    options: { leaseDurationMs?: number } = {},
  ) {
    this.leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS leases (
        task_id TEXT PRIMARY KEY,
        runner_id TEXT NOT NULL,
        claim_token TEXT NOT NULL,
        claimed_at TEXT NOT NULL,
        heartbeat_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reservations (
        task_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (task_id, kind, value)
      );

      CREATE TABLE IF NOT EXISTS blockers (
        task_id TEXT PRIMARY KEY,
        reason TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  static async create(dbPath: string, options: { leaseDurationMs?: number } = {}): Promise<RuntimeStateStore> {
    await mkdir(path.dirname(dbPath), { recursive: true });
    return new RuntimeStateStore(dbPath, options);
  }

  close(): void {
    this.db.close();
  }

  private pruneExpiredLeases(): void {
    const now = isoNow();
    const expiredIds = this.db.prepare('SELECT task_id FROM leases WHERE expires_at <= ?').all(now) as { task_id: string }[];
    if (expiredIds.length === 0) return;
    const deleteReservations = this.db.prepare('DELETE FROM reservations WHERE task_id = ?');
    const deleteLease = this.db.prepare('DELETE FROM leases WHERE task_id = ?');
    for (const row of expiredIds) {
      deleteReservations.run(row.task_id);
      deleteLease.run(row.task_id);
    }
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  syncBlockers(blockages: TaskBlockage[]): void {
    const now = isoNow();
    this.transaction(() => {
      this.pruneExpiredLeases();
      this.db.exec('DELETE FROM blockers');
      const insert = this.db.prepare('INSERT INTO blockers (task_id, reason, updated_at) VALUES (?, ?, ?)');
      for (const blockage of blockages) {
        insert.run(blockage.taskId, blockage.reason, now);
      }
    });
  }

  getBlockage(taskId: string): TaskBlockage | null {
    this.pruneExpiredLeases();
    const row = this.db.prepare('SELECT task_id, reason FROM blockers WHERE task_id = ?').get(taskId) as
      | { task_id: string; reason: string }
      | undefined;
    return row ? { taskId: row.task_id, reason: row.reason } : null;
  }

  listActiveTaskIds(): Set<string> {
    this.pruneExpiredLeases();
    const rows = this.db.prepare('SELECT task_id FROM leases').all() as { task_id: string }[];
    return new Set(rows.map(row => row.task_id));
  }

  listActiveReservations(taskIndex: Map<string, BacklogTaskSpec>, excludeTaskId?: string): TaskReservationSnapshot[] {
    this.pruneExpiredLeases();
    const leaseRows = this.db.prepare('SELECT task_id, runner_id, expires_at FROM leases').all() as {
      task_id: string;
      runner_id: string;
      expires_at: string;
    }[];
    const reservationRows = this.db.prepare('SELECT task_id, kind, value FROM reservations').all() as {
      task_id: string;
      kind: string;
      value: string;
    }[];

    const byTaskId = new Map<string, { touchPaths: string[]; capabilities: string[] }>();
    for (const row of reservationRows) {
      const current = byTaskId.get(row.task_id) ?? { touchPaths: [], capabilities: [] };
      if (row.kind === 'touch_path') current.touchPaths.push(row.value);
      if (row.kind === 'capability') current.capabilities.push(row.value);
      byTaskId.set(row.task_id, current);
    }

    return leaseRows
      .filter(row => row.task_id !== excludeTaskId)
      .flatMap(row => {
        const task = taskIndex.get(row.task_id);
        if (!task) return [];
        const reservations = byTaskId.get(row.task_id) ?? {
          touchPaths: task.touchPaths,
          capabilities: task.capabilities,
        };
        return [{
          taskId: row.task_id,
          title: task.title,
          touchPaths: [...new Set(reservations.touchPaths)],
          capabilities: [...new Set(reservations.capabilities)],
          runnerId: row.runner_id,
          expiresAt: row.expires_at,
        }];
      });
  }

  claimTask(task: BacklogTaskSpec, runnerId: string, claimToken: string): BacklogTaskLease | null {
    return this.transaction(() => {
      this.pruneExpiredLeases();
      const existing = this.db.prepare('SELECT task_id FROM leases WHERE task_id = ?').get(task.id) as { task_id: string } | undefined;
      if (existing) return null;

      const lease: BacklogTaskLease = {
        taskId: task.id,
        runnerId,
        claimToken,
        claimedAt: isoNow(),
        heartbeatAt: isoNow(),
        expiresAt: isoNow(this.leaseDurationMs),
      };
      this.db.prepare(`
        INSERT INTO leases (task_id, runner_id, claim_token, claimed_at, heartbeat_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(lease.taskId, lease.runnerId, lease.claimToken, lease.claimedAt, lease.heartbeatAt, lease.expiresAt);

      const insertReservation = this.db.prepare(
        'INSERT INTO reservations (task_id, kind, value) VALUES (?, ?, ?)',
      );
      for (const touchPath of task.touchPaths) {
        insertReservation.run(task.id, 'touch_path', touchPath);
      }
      for (const capability of task.capabilities) {
        insertReservation.run(task.id, 'capability', capability);
      }

      return lease;
    });
  }

  heartbeatClaim(claim: BacklogTaskClaim): void {
    this.transaction(() => {
      this.pruneExpiredLeases();
      this.db.prepare(`
        UPDATE leases
        SET heartbeat_at = ?, expires_at = ?
        WHERE task_id = ? AND runner_id = ? AND claim_token = ?
      `).run(isoNow(), isoNow(this.leaseDurationMs), claim.task.id, claim.lease.runnerId, claim.lease.claimToken);
    });
  }

  releaseClaim(claim: BacklogTaskClaim): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM reservations WHERE task_id = ?').run(claim.task.id);
      this.db.prepare('DELETE FROM leases WHERE task_id = ? AND runner_id = ? AND claim_token = ?').run(
        claim.task.id,
        claim.lease.runnerId,
        claim.lease.claimToken,
      );
    });
  }
}
