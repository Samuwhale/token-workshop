import { access, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  BacklogRunnerConfig,
  BacklogRunnerConfigInput,
  ResolvedRunOptions,
  RunOverrides,
} from './types.js';

const DEFAULT_MODEL_MAP = {
  default: { claude: 'claude-opus-4-6', qwen: 'qwen-coder-plus-latest', gemini: 'gemini-2.5-pro', codex: 'gpt-5.4' },
  sonnet: { claude: 'claude-sonnet-4-6', qwen: 'qwen-coder-plus-latest', gemini: 'gemini-2.5-pro', codex: 'gpt-5.4' },
  opus: { claude: 'claude-opus-4-6', qwen: 'qwen-coder-plus-latest', gemini: 'gemini-2.5-pro', codex: 'gpt-5.4' },
  qwen: { claude: 'claude-sonnet-4-6', qwen: 'qwen-coder-plus-latest', gemini: 'gemini-2.5-pro', codex: 'gpt-5.4' },
  'qwen-max': { claude: 'claude-sonnet-4-6', qwen: 'qwen-coder-plus-latest', gemini: 'gemini-2.5-pro', codex: 'gpt-5.4' },
  gemini: { claude: 'claude-sonnet-4-6', qwen: 'qwen-coder-plus-latest', gemini: 'gemini-2.5-pro', codex: 'gpt-5.4' },
  'gemini-pro': { claude: 'claude-sonnet-4-6', qwen: 'qwen-coder-plus-latest', gemini: 'gemini-2.5-pro', codex: 'gpt-5.4' },
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

  return {
    projectRoot,
    files: {
      backlog: resolvePath(baseDir, config.files.backlog),
      inbox: resolvePath(baseDir, config.files.inbox),
      stop: resolvePath(baseDir, config.files.stop),
      patterns: resolvePath(baseDir, config.files.patterns),
      progress: resolvePath(baseDir, config.files.progress),
      archive: resolvePath(baseDir, config.files.archive),
      counter: resolvePath(baseDir, config.files.counter),
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
    defaults: {
      tool: config.defaults?.tool ?? 'claude',
      model: config.defaults?.model ?? 'claude-sonnet-4-6',
      passModel: config.defaults?.passModel ?? '',
      passes: config.defaults?.passes ?? true,
      passFrequency: config.defaults?.passFrequency ?? 10,
      worktrees: config.defaults?.worktrees ?? true,
    },
    cleanup: {
      archiveDoneThreshold: config.cleanup?.archiveDoneThreshold ?? 20,
      progressSectionsToKeep: config.cleanup?.progressSectionsToKeep ?? 30,
    },
    passes: {
      product: {
        offset: config.passes?.product?.offset ?? 3,
        promptFile: resolvePath(baseDir, config.passes?.product?.promptFile ?? config.prompts.product),
      },
      ux: {
        offset: config.passes?.ux?.offset ?? 7,
        promptFile: resolvePath(baseDir, config.passes?.ux?.promptFile ?? config.prompts.ux),
      },
      code: {
        offset: config.passes?.code?.offset ?? 0,
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
}

export async function assertConfigFilesExist(config: BacklogRunnerConfig): Promise<void> {
  const requiredFiles = [
    config.files.backlog,
    config.files.patterns,
    config.prompts.agent,
    config.prompts.product,
    config.prompts.ux,
    config.prompts.code,
  ];

  for (const file of requiredFiles) {
    await access(file);
  }
}

type ModelsFileShape = {
  aliases?: Record<string, Partial<Record<'claude' | 'qwen' | 'gemini' | 'codex', string>>>;
  model_crosswalk?: Record<string, Partial<Record<'claude' | 'qwen' | 'gemini' | 'codex', string>>>;
};

export async function resolveModelAlias(
  config: BacklogRunnerConfig,
  alias: string,
  tool: ResolvedRunOptions['tool'],
): Promise<string> {
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
    passFrequency: overrides.passFrequency ?? config.defaults.passFrequency,
    worktrees: overrides.worktrees ?? config.defaults.worktrees,
  };
}
