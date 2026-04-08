export type BacklogTool = 'claude' | 'qwen' | 'gemini' | 'codex';
export type BacklogMarker = ' ' | '~' | 'x' | '!';
export type BacklogPassType = 'product' | 'ux' | 'code';
export type StructuredOutputMode = 'strict' | 'best-effort';

export interface BacklogRunnerConfigInput {
  projectRoot?: string;
  files: {
    backlog: string;
    inbox: string;
    stop: string;
    patterns: string;
    progress: string;
    archive: string;
    counter: string;
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
  defaults?: {
    tool?: BacklogTool;
    model?: string;
    passModel?: string;
    passes?: boolean;
    passFrequency?: number;
    worktrees?: boolean;
  };
  cleanup?: {
    archiveDoneThreshold?: number;
    progressSectionsToKeep?: number;
  };
  passes?: Partial<Record<BacklogPassType, { offset?: number; promptFile?: string }>>;
}

export interface BacklogRunnerConfig {
  projectRoot: string;
  files: {
    backlog: string;
    inbox: string;
    stop: string;
    patterns: string;
    progress: string;
    archive: string;
    counter: string;
    models?: string;
    runnerLogDir: string;
    runtimeDir: string;
    locksDir: string;
  };
  prompts: Record<BacklogPassType | 'agent', string>;
  validationCommand: string;
  defaults: {
    tool: BacklogTool;
    model?: string;
    passModel?: string;
    passes: boolean;
    passFrequency: number;
    worktrees: boolean;
  };
  cleanup: {
    archiveDoneThreshold: number;
    progressSectionsToKeep: number;
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
  structuredOutputMode?: StructuredOutputMode;
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
    ignoreFailure?: boolean;
  }): Promise<CommandResult>;
  runShell(command: string, options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    ignoreFailure?: boolean;
  }): Promise<CommandResult>;
  which(command: string): Promise<string | null>;
}

export interface LogSink {
  write(line: string): void;
  close(): Promise<void>;
}

export interface BacklogItemClaim {
  lineNumber: number;
  item: string;
}

export interface BacklogQueueCounts {
  ready: number;
  inProgress: number;
  failed: number;
}

export interface StoreCleanupResult {
  archivedCount: number;
  trimmedProgress: boolean;
}

export interface BacklogStore {
  ensureProgressFile(): Promise<void>;
  countReady(): Promise<number>;
  countInProgress(): Promise<number>;
  countFailed(): Promise<number>;
  countDone(): Promise<number>;
  getQueueCounts(): Promise<BacklogQueueCounts>;
  claimNextItem(): Promise<BacklogItemClaim | null>;
  updateItemStatus(item: string, marker: BacklogMarker): Promise<void>;
  resetStaleInProgressItems(): Promise<number>;
  drainInbox(): Promise<{ drained: boolean; skippedDuplicates: number }>;
  getCompletedCount(): Promise<number>;
  incrementCompletedCount(): Promise<number>;
  cleanupIfNeeded(): Promise<StoreCleanupResult>;
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
