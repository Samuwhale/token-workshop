export type BacklogTool = 'claude' | 'codex';
export type BacklogRunnerLane = 'executor' | 'planner';
export type BacklogPassType = 'product' | 'ux' | 'code';
export type BacklogTaskPriority = 'high' | 'normal' | 'low';
export type BacklogTaskState = 'planned' | 'ready' | 'done' | 'failed' | 'superseded';
export type BacklogTaskKind = 'implementation' | 'research';

export interface BacklogRunnerConfigInput {
  projectRoot?: string;
  files: {
    backlog: string;
    candidateQueue: string;
    taskSpecsDir?: string;
    stop: string;
    runtimeReport?: string;
    patterns: string;
    progress: string;
    stateDb?: string;
    models?: string;
    runnerLogDir?: string;
    runtimeDir?: string;
    locksDir?: string;
  };
  prompts: {
    agent: string;
    planner?: string;
    product: string;
    ux: string;
    code: string;
  };
  validationCommand: string;
  validationProfiles?: Record<string, string>;
  defaults?: {
    tool?: BacklogTool;
    lane?: BacklogRunnerLane;
    model?: string;
    passModel?: string;
    passes?: boolean;
    worktrees?: boolean;
  };
  passes?: Partial<Record<BacklogPassType, { promptFile?: string }>>;
}

export interface BacklogRunnerConfig {
  projectRoot: string;
  files: {
    backlog: string;
    candidateQueue: string;
    taskSpecsDir: string;
    stop: string;
    runtimeReport: string;
    patterns: string;
    progress: string;
    stateDb: string;
    models?: string;
    runnerLogDir: string;
    runtimeDir: string;
    locksDir: string;
  };
  prompts: Record<BacklogPassType | 'agent' | 'planner', string>;
  validationCommand: string;
  validationProfiles: Record<string, string>;
  defaults: {
    tool: BacklogTool;
    lane: BacklogRunnerLane;
    model?: string;
    passModel?: string;
    passes: boolean;
    worktrees: boolean;
  };
  passes: Record<BacklogPassType, { promptFile: string }>;
}

export interface RunOverrides {
  tool?: BacklogTool;
  lane?: BacklogRunnerLane;
  model?: string;
  passModel?: string;
  passes?: boolean;
  worktrees?: boolean;
  interactive?: boolean;
}

export interface ResolvedRunOptions {
  tool: BacklogTool;
  lane: BacklogRunnerLane;
  model?: string;
  passModel?: string;
  passes: boolean;
  worktrees: boolean;
}

export interface AgentResult {
  status: 'done' | 'failed';
  item: string;
  note: string;
  turns?: number;
  durationSeconds?: number;
  costUsd?: number;
  rawOutput: string;
  rawError: string;
}

export interface AgentRunRequest {
  tool: BacklogTool;
  model?: string;
  context: string;
  prompt: string;
  cwd: string;
  maxTurns?: number;
  schema: string;
}

export interface ToolValidationResult {
  ok: boolean;
  messages: string[];
}

export interface ValidationCommandResult {
  ok: boolean;
  code: number;
  summary: string;
  stdout: string;
  stderr: string;
  durationSeconds: number;
}

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  run(command: string, args: string[], options?: {
    cwd?: string;
    input?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    ignoreFailure?: boolean;
  }): Promise<CommandResult>;
  runShell(command: string, options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    ignoreFailure?: boolean;
  }): Promise<CommandResult>;
  which(command: string): Promise<string | null>;
}

export interface LogSink {
  write(line: string): void;
  close(): Promise<void>;
}

export interface BacklogTaskSpec {
  id: string;
  title: string;
  priority: BacklogTaskPriority;
  taskKind: BacklogTaskKind;
  dependsOn: string[];
  touchPaths: string[];
  capabilities: string[];
  validationProfile: string;
  statusNotes: string[];
  state: BacklogTaskState;
  acceptanceCriteria: string[];
  source: 'product-pass' | 'ux-pass' | 'code-pass' | 'task-followup' | 'planner-pass' | 'manual';
  createdAt: string;
  updatedAt: string;
}

export interface BacklogCandidateRecord {
  title: string;
  priority: BacklogTaskPriority;
  touchPaths: string[];
  acceptanceCriteria: string[];
  validationProfile?: string;
  capabilities?: string[];
  context?: string;
  source: Extract<BacklogTaskSpec['source'], 'product-pass' | 'ux-pass' | 'code-pass' | 'task-followup' | 'manual'>;
}

export interface PlannerTaskChild {
  title: string;
  taskKind: BacklogTaskKind;
  priority: BacklogTaskPriority;
  touchPaths: string[];
  acceptanceCriteria: string[];
  validationProfile?: string;
  capabilities?: string[];
  context?: string;
}

export interface PlannerSupersedeAction {
  action: 'supersede';
  parentTaskIds: string[];
  children: PlannerTaskChild[];
}

export interface BacklogQueueCounts {
  planned: number;
  ready: number;
  blocked: number;
  inProgress: number;
  failed: number;
  done: number;
}

export interface BacklogDrainResult {
  drained: boolean;
  createdTasks: number;
  skippedDuplicates: number;
  ignoredInvalidLines: number;
}

export interface BacklogSyncResult {
  candidates: BacklogDrainResult;
  counts: BacklogQueueCounts;
}

export interface BacklogTaskLease {
  taskId: string;
  runnerId: string;
  claimToken: string;
  claimedAt: string;
  heartbeatAt: string;
  expiresAt: string;
}

export interface BacklogTaskClaim {
  task: BacklogTaskSpec;
  lease: BacklogTaskLease;
}

export interface TaskLeaseSnapshot {
  taskId: string;
  title: string;
  runnerId: string;
  claimedAt: string;
  heartbeatAt: string;
  expiresAt: string;
}

export interface TaskReservationSnapshot {
  taskId: string;
  title: string;
  touchPaths: string[];
  capabilities: string[];
  runnerId: string;
  expiresAt: string;
}

export interface TaskDependencySnapshot {
  taskId: string;
  title: string;
  state: BacklogTaskState;
}

export interface TaskBlockage {
  taskId: string;
  reason: string;
  retryAt?: string;
}

export interface TaskDeferralOptions {
  category?: 'generic' | 'preflight' | 'remediation';
}

export interface BacklogStore {
  ensureProgressFile(): Promise<void>;
  ensureTaskSpecsReady(): Promise<void>;
  close(): Promise<void>;
  countReady(): Promise<number>;
  countInProgress(): Promise<number>;
  countFailed(): Promise<number>;
  countDone(): Promise<number>;
  getQueueCounts(): Promise<BacklogQueueCounts>;
  claimNextRunnableTask(runnerId: string): Promise<BacklogTaskClaim | null>;
  heartbeatClaim(claim: BacklogTaskClaim): Promise<void>;
  releaseClaim(claim: BacklogTaskClaim): Promise<void>;
  deferClaim(claim: BacklogTaskClaim, note: string, retryAfterMs: number, options?: TaskDeferralOptions): Promise<void>;
  deferTaskById(taskId: string, note: string, retryAfterMs: number, options?: TaskDeferralOptions): Promise<void>;
  appendTaskNote(taskId: string, note: string): Promise<void>;
  completeClaim(claim: BacklogTaskClaim, note: string): Promise<void>;
  failClaim(claim: BacklogTaskClaim, note: string): Promise<void>;
  failTaskById(taskId: string, note: string): Promise<void>;
  rewriteBacklogReport(): Promise<void>;
  drainCandidateQueue(): Promise<BacklogDrainResult>;
  listPlannerCandidates(limit?: number): Promise<BacklogTaskSpec[]>;
  applyPlannerSupersede(
    action: PlannerSupersedeAction,
    options?: { allowedParentTaskIds?: string[] },
  ): Promise<{ parentTaskIds: string[]; childTaskIds: string[] }>;
  getTaskDependencies(taskId: string): Promise<TaskDependencySnapshot[]>;
  getActiveReservations(excludeTaskId?: string): Promise<TaskReservationSnapshot[]>;
  getTaskBlockage(taskId: string): Promise<TaskBlockage | null>;
  getTaskSpec(taskId: string): Promise<BacklogTaskSpec | null>;
  appendProgress(section: string): Promise<void>;
  appendPatterns(section: string): Promise<void>;
}

export interface WorkspaceSession {
  cwd: string;
  teardown(): Promise<void>;
  merge(): Promise<WorkspaceApplyResult>;
}

export interface WorkspaceStrategy {
  setup(): Promise<WorkspaceSession>;
  commitAndPush(message: string, allowedPaths: string[], options?: WorkspaceCommitOptions): Promise<WorkspaceApplyResult>;
}

export interface WorkspaceCommitOptions {
  retryPendingPush?: boolean;
}

export interface WorkspaceApplyResult {
  ok: boolean;
  reason?: string;
  createdCommit?: boolean;
  pushed?: boolean;
  pendingPush?: boolean;
}

export interface WorkspaceRepairResult {
  recovered: boolean;
  deferred: boolean;
  failureReason?: string;
  queuedFollowups: number;
}

export interface RunnerDependencies {
  commandRunner?: CommandRunner;
  sleep?: (ms: number) => Promise<void>;
  createLogSink?: (config: BacklogRunnerConfig) => Promise<LogSink>;
}
