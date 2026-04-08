export type BacklogTool = 'claude' | 'codex';
export type BacklogPassType = 'product' | 'ux' | 'code';
export type BacklogTaskPriority = 'high' | 'normal' | 'low';
export type BacklogTaskState = 'planned' | 'ready' | 'done' | 'failed';

export interface BacklogRunnerConfigInput {
  projectRoot?: string;
  files: {
    backlog: string;
    inbox: string;
    taskSpecsDir?: string;
    followups?: string;
    stop: string;
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
    product: string;
    ux: string;
    code: string;
  };
  validationCommand: string;
  validationProfiles?: Record<string, string>;
  defaults?: {
    tool?: BacklogTool;
    model?: string;
    passModel?: string;
    passes?: boolean;
    passFrequency?: number;
    worktrees?: boolean;
  };
  passes?: Partial<Record<BacklogPassType, { offset?: number; promptFile?: string }>>;
}

export interface BacklogRunnerConfig {
  projectRoot: string;
  files: {
    backlog: string;
    inbox: string;
    taskSpecsDir: string;
    followups: string;
    stop: string;
    patterns: string;
    progress: string;
    stateDb: string;
    models?: string;
    runnerLogDir: string;
    runtimeDir: string;
    locksDir: string;
  };
  prompts: Record<BacklogPassType | 'agent', string>;
  validationCommand: string;
  validationProfiles: Record<string, string>;
  defaults: {
    tool: BacklogTool;
    model?: string;
    passModel?: string;
    passes: boolean;
    passFrequency: number;
    worktrees: boolean;
  };
  passes: Record<BacklogPassType, { offset: number; promptFile: string }>;
}

export interface RunOverrides {
  tool?: BacklogTool;
  model?: string;
  passModel?: string;
  passes?: boolean;
  passFrequency?: number;
  worktrees?: boolean;
  interactive?: boolean;
}

export interface ResolvedRunOptions {
  tool: BacklogTool;
  model?: string;
  passModel?: string;
  passes: boolean;
  passFrequency: number;
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
  dependsOn: string[];
  touchPaths: string[];
  capabilities: string[];
  validationProfile: string;
  statusNotes: string[];
  state: BacklogTaskState;
  acceptanceCriteria: string[];
  source: 'legacy-backlog' | 'inbox' | 'followup' | 'manual';
  createdAt: string;
  updatedAt: string;
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
  inbox: BacklogDrainResult;
  followups: BacklogDrainResult;
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
  completeClaim(claim: BacklogTaskClaim, note: string): Promise<void>;
  failClaim(claim: BacklogTaskClaim, note: string): Promise<void>;
  failTaskById(taskId: string, note: string): Promise<void>;
  rewriteBacklogReport(): Promise<void>;
  drainInbox(): Promise<BacklogDrainResult>;
  drainFollowups(filePath?: string): Promise<BacklogDrainResult>;
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
  merge(message: string): Promise<WorkspaceApplyResult>;
}

export interface WorkspaceStrategy {
  setup(): Promise<WorkspaceSession>;
  commitAndPush(message: string): Promise<WorkspaceApplyResult>;
}

export interface WorkspaceApplyResult {
  ok: boolean;
  reason?: string;
}

export interface RunnerDependencies {
  commandRunner?: CommandRunner;
  sleep?: (ms: number) => Promise<void>;
  createLogSink?: (config: BacklogRunnerConfig) => Promise<LogSink>;
}
