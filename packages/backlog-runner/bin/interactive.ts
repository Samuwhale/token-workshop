import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { resolveModelAlias } from '../src/config.js';
import type { BacklogRunnerConfig, BacklogTool, RunOverrides } from '../src/types.js';

const TOOLS: BacklogTool[] = ['claude', 'codex'];
const MAX_INTERACTIVE_WORKERS = 8;
const SUMMARY_DIVIDER = '----------------------------------------';

function parseBooleanAnswer(value: string, fallback: boolean): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (['y', 'yes', 'true', '1'].includes(normalized)) return true;
  if (['n', 'no', 'false', '0'].includes(normalized)) return false;
  return fallback;
}

export function resolveToolChoice(value: string, fallback: BacklogTool): BacklogTool {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;

  const numeric = Number.parseInt(normalized, 10);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= TOOLS.length) {
    return TOOLS[numeric - 1]!;
  }

  return TOOLS.includes(normalized as BacklogTool) ? (normalized as BacklogTool) : fallback;
}

export function resolveWorkerChoice(value: string, fallback: number, maxWorkers = MAX_INTERACTIVE_WORKERS): number {
  const normalized = value.trim();
  if (!normalized) return fallback;

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  if (parsed < 1 || parsed > maxWorkers) {
    return fallback;
  }
  return parsed;
}

export function summarizeRunOverrides(
  overrides: {
    tool: BacklogTool;
    workers: number;
    model: string;
    passModel: string;
    passes: boolean;
    worktrees: boolean;
  },
): string {
  const model = overrides.model.trim() || 'CLI default';
  const passModel = overrides.passModel.trim() || 'same as main model / CLI default';
  return [
    'Selected options',
    SUMMARY_DIVIDER,
    `Tool:           ${overrides.tool}`,
    `Workers:        ${overrides.workers}`,
    `Model:          ${model}`,
    `Pass model:     ${passModel}`,
    `Passes:         ${overrides.passes ? 'enabled' : 'disabled'}`,
    `Worktrees:      ${overrides.worktrees ? 'enabled' : 'disabled'}`,
    SUMMARY_DIVIDER,
  ].join('\n');
}

function formatModelSetting(rawValue: string | undefined, resolvedValue: string | undefined, fallbackLabel: string): string {
  const normalizedRaw = rawValue?.trim();
  if (!normalizedRaw) {
    return fallbackLabel;
  }
  if (resolvedValue && resolvedValue !== normalizedRaw) {
    return `${normalizedRaw} -> ${resolvedValue}`;
  }
  return resolvedValue ?? normalizedRaw;
}

async function describeModelSettings(
  config: BacklogRunnerConfig,
  tool: BacklogTool,
  model: string | undefined,
  passModel: string | undefined,
): Promise<{ model: string; passModel: string }> {
  const resolvedModel = await resolveModelAlias(config, model, tool);
  const resolvedPassModel = passModel
    ? await resolveModelAlias(config, passModel, tool)
    : resolvedModel;

  return {
    model: formatModelSetting(model, resolvedModel, 'CLI default'),
    passModel: passModel
      ? formatModelSetting(passModel, resolvedPassModel, 'same as main model / CLI default')
      : `same as main model${resolvedModel ? ` -> ${resolvedModel}` : ' / CLI default'}`,
  };
}

function hasExplicitOverrides(overrides: RunOverrides): boolean {
  return Boolean(
    overrides.tool !== undefined ||
    overrides.workers !== undefined ||
    overrides.model !== undefined ||
    overrides.passModel !== undefined ||
    overrides.passes !== undefined ||
    overrides.worktrees !== undefined,
  );
}

export function shouldPromptInteractively(command: 'run' | 'validate' | 'sync', overrides: RunOverrides): boolean {
  if (!input.isTTY || !output.isTTY) return false;
  if (overrides.interactive === false) return false;
  if (overrides.interactive === true) return true;
  if (command !== 'run') return false;
  return !hasExplicitOverrides(overrides);
}

export async function promptForRunOverrides(
  config: BacklogRunnerConfig,
  currentOverrides: RunOverrides,
): Promise<RunOverrides> {
  const rl = createInterface({ input, output });

  try {
    let previous = { ...currentOverrides };

    while (true) {
      output.write('\nBacklog Runner Options\n\n');

      const defaultTool = previous.tool ?? config.defaults.tool;
      output.write('Tool options:\n');
      TOOLS.forEach((tool, index) => {
        const marker = tool === defaultTool ? ' (default)' : '';
        output.write(`  ${index + 1}. ${tool}${marker}\n`);
      });
      const toolAnswer = await rl.question(`Tool [1-${TOOLS.length} or name] (${defaultTool}): `);
      const nextTool = resolveToolChoice(toolAnswer, defaultTool);

      const defaultWorkers = previous.workers ?? config.defaults.workers;
      const workersAnswer = await rl.question(`Workers [1-${MAX_INTERACTIVE_WORKERS}] (${defaultWorkers}): `);
      const nextWorkers = resolveWorkerChoice(workersAnswer, defaultWorkers);

      const defaultModel = previous.model ?? config.defaults.model;
      const defaultPassModel = previous.passModel ?? config.defaults.passModel;
      const describedDefaults = await describeModelSettings(config, nextTool, defaultModel, defaultPassModel);
      const modelLabel = describedDefaults.model;
      const modelAnswer = await rl.question(`Model (${modelLabel}): `);
      const nextModel = modelAnswer.trim() || defaultModel;

      const describedPassDefaults = await describeModelSettings(config, nextTool, nextModel, defaultPassModel);
      const passModelLabel = describedPassDefaults.passModel;
      const passModelAnswer = await rl.question(`Pass model (${passModelLabel}): `);
      const nextPassModel = passModelAnswer.trim() || defaultPassModel;

      const defaultPasses = previous.passes ?? config.defaults.passes;
      const passesAnswer = await rl.question(`Enable discovery passes? [Y/n] (${defaultPasses ? 'yes' : 'no'}): `);
      const nextPasses = parseBooleanAnswer(passesAnswer, defaultPasses);

      const defaultWorktrees = previous.worktrees ?? config.defaults.worktrees;
      const worktreesAnswer = await rl.question(`Use git worktrees? [Y/n] (${defaultWorktrees ? 'yes' : 'no'}): `);
      const nextWorktrees = parseBooleanAnswer(worktreesAnswer, defaultWorktrees);

      const nextOverrides: RunOverrides = {
        ...previous,
        tool: nextTool,
        workers: nextWorkers,
        model: nextModel,
        passModel: nextPassModel,
        passes: nextPasses,
        worktrees: nextWorktrees,
        interactive: true,
      };

      const describedSelections = await describeModelSettings(config, nextTool, nextModel, nextPassModel);

      output.write(`\n${summarizeRunOverrides({
        tool: nextTool,
        workers: nextWorkers,
        model: describedSelections.model,
        passModel: describedSelections.passModel,
        passes: nextPasses,
        worktrees: nextWorktrees,
      })}\n`);

      const confirm = (await rl.question('Press Enter to start, type "edit" to revise, or "cancel" to abort: '))
        .trim()
        .toLowerCase();

      if (!confirm) {
        output.write('\n');
        return nextOverrides;
      }

      if (confirm === 'cancel' || confirm === 'c') {
        throw new Error('Cancelled.');
      }

      previous = nextOverrides;
      output.write('\n');
    }
  } finally {
    rl.close();
  }
}
