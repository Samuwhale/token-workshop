import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  BacklogRunnerConfig,
  BacklogRunnerConfigInput,
  ResolvedRunOptions,
  RunOverrides,
} from './types.js';

const DEFAULT_MODEL_MAP = {
  default: { claude: 'claude-opus-4-6', codex: 'gpt-5.4' },
  sonnet: { claude: 'claude-sonnet-4-6', codex: 'gpt-5.4' },
  opus: { claude: 'claude-opus-4-6', codex: 'gpt-5.4' },
} as const;

function resolvePath(baseDir: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(baseDir, value);
}

export function defineBacklogRunnerConfig(config: BacklogRunnerConfigInput): BacklogRunnerConfigInput {
  return config;
}

export function normalizeBacklogRunnerConfig(config: BacklogRunnerConfigInput, configFilePath?: string): BacklogRunnerConfig {
  const baseDir = configFilePath ? path.dirname(configFilePath) : (config.projectRoot ?? process.cwd());
  const projectRoot = resolvePath(baseDir, config.projectRoot ?? '.');
  const runnerLogDir = resolvePath(baseDir, config.files.runnerLogDir ?? path.dirname(config.files.progress));
  const runtimeDir = resolvePath(baseDir, config.files.runtimeDir ?? '.backlog-runner');
  const locksDir = resolvePath(baseDir, config.files.locksDir ?? path.join(runtimeDir, 'locks'));
  const candidateQueue = resolvePath(baseDir, config.files.candidateQueue ?? path.join('backlog', 'inbox.jsonl'));
  const taskSpecsDir = resolvePath(baseDir, config.files.taskSpecsDir ?? path.join('backlog', 'tasks'));
  const stateDb = resolvePath(baseDir, config.files.stateDb ?? path.join(runtimeDir, 'state.sqlite'));

  return {
    projectRoot,
    files: {
      backlog: resolvePath(baseDir, config.files.backlog),
      candidateQueue,
      taskSpecsDir,
      stop: resolvePath(baseDir, config.files.stop),
      patterns: resolvePath(baseDir, config.files.patterns),
      progress: resolvePath(baseDir, config.files.progress),
      stateDb,
      models: config.files.models ? resolvePath(baseDir, config.files.models) : undefined,
      runnerLogDir,
      runtimeDir,
      locksDir,
    },
    prompts: {
      agent: resolvePath(baseDir, config.prompts.agent),
      product: resolvePath(baseDir, config.prompts.product),
      ux: resolvePath(baseDir, config.prompts.ux),
      code: resolvePath(baseDir, config.prompts.code),
    },
    validationCommand: config.validationCommand,
    validationProfiles: {
      repo: config.validationCommand,
      ...(config.validationProfiles ?? {}),
    },
    defaults: {
      tool: config.defaults?.tool ?? 'claude',
      model: config.defaults?.model ?? 'default',
      passModel: config.defaults?.passModel ?? 'sonnet',
      passes: config.defaults?.passes ?? true,
      worktrees: config.defaults?.worktrees ?? true,
    },
    passes: {
      product: {
        promptFile: resolvePath(baseDir, config.passes?.product?.promptFile ?? config.prompts.product),
      },
      ux: {
        promptFile: resolvePath(baseDir, config.passes?.ux?.promptFile ?? config.prompts.ux),
      },
      code: {
        promptFile: resolvePath(baseDir, config.passes?.code?.promptFile ?? config.prompts.code),
      },
    },
  };
}

export async function loadBacklogRunnerConfig(configPath: string): Promise<BacklogRunnerConfig> {
  const absoluteConfigPath = path.resolve(configPath);
  const module = await import(pathToFileURL(absoluteConfigPath).href);
  const raw = (module.default ?? module.config ?? module) as BacklogRunnerConfigInput;
  return normalizeBacklogRunnerConfig(raw, absoluteConfigPath);
}

export async function ensureConfigReady(config: BacklogRunnerConfig): Promise<void> {
  await mkdir(config.files.runtimeDir, { recursive: true });
  await mkdir(config.files.runnerLogDir, { recursive: true });
  await mkdir(config.files.locksDir, { recursive: true });
  await mkdir(config.files.taskSpecsDir, { recursive: true });
  await mkdir(path.dirname(config.files.candidateQueue), { recursive: true });
}

type ModelsFileShape = {
  aliases?: Record<string, Partial<Record<'claude' | 'codex', string>>>;
  model_crosswalk?: Record<string, Partial<Record<'claude' | 'codex', string>>>;
};

export async function resolveModelAlias(
  config: BacklogRunnerConfig,
  alias: string | undefined,
  tool: ResolvedRunOptions['tool'],
): Promise<string | undefined> {
  if (!alias?.trim()) {
    return undefined;
  }

  const fallback = DEFAULT_MODEL_MAP[alias as keyof typeof DEFAULT_MODEL_MAP]?.[tool];
  const modelsFile = config.files.models;

  if (modelsFile) {
    try {
      const content = await readFile(modelsFile, 'utf8');
      const parsed = JSON.parse(content) as ModelsFileShape;
      const fromAlias = parsed.aliases?.[alias]?.[tool];
      if (fromAlias) return fromAlias;
      const crosswalk = parsed.model_crosswalk?.[alias]?.[tool];
      if (crosswalk) return crosswalk;
    } catch {
      // fall through to built-in defaults
    }
  }

  return fallback ?? alias;
}

export async function resolveRunOptions(
  config: BacklogRunnerConfig,
  overrides: RunOverrides = {},
): Promise<ResolvedRunOptions> {
  const tool = overrides.tool ?? config.defaults.tool;
  const model = await resolveModelAlias(config, overrides.model ?? config.defaults.model, tool);
  const rawPassModel = overrides.passModel ?? config.defaults.passModel;
  const passModel = rawPassModel
    ? await resolveModelAlias(config, rawPassModel, tool)
    : model;

  return {
    tool,
    model,
    passModel,
    passes: overrides.passes ?? config.defaults.passes,
    worktrees: overrides.worktrees ?? config.defaults.worktrees,
  };
}
