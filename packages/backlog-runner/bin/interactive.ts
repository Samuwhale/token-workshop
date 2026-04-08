import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import type { BacklogRunnerConfig, BacklogTool, RunOverrides } from '../src/types.js';

const TOOLS: BacklogTool[] = ['claude', 'qwen', 'gemini', 'codex'];
const SUMMARY_DIVIDER = '----------------------------------------';

function parseBooleanAnswer(value: string, fallback: boolean): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (['y', 'yes', 'true', '1'].includes(normalized)) return true;
  if (['n', 'no', 'false', '0'].includes(normalized)) return false;
  return fallback;
}

function parseNumberAnswer(value: string, fallback: number): number {
  const normalized = value.trim();
  if (!normalized) return fallback;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

export function summarizeRunOverrides(
  config: BacklogRunnerConfig,
  overrides: {
    tool: BacklogTool;
    model?: string;
    passModel?: string;
    passes: boolean;
    passFrequency: number;
    worktrees: boolean;
  },
): string {
  return [
    'Selected options',
    SUMMARY_DIVIDER,
    `Tool:           ${overrides.tool}`,
    `Model:          ${overrides.model || 'CLI default'}`,
    `Pass model:     ${overrides.passModel || 'same as main model / CLI default'}`,
    `Passes:         ${overrides.passes ? 'enabled' : 'disabled'}`,
    `Pass frequency: ${overrides.passFrequency}`,
    `Worktrees:      ${overrides.worktrees ? 'enabled' : 'disabled'}`,
    SUMMARY_DIVIDER,
  ].join('\n');
}

function hasExplicitOverrides(overrides: RunOverrides): boolean {
  return Boolean(
    overrides.tool !== undefined ||
      overrides.model !== undefined ||
      overrides.passModel !== undefined ||
      overrides.passes !== undefined ||
      overrides.passFrequency !== undefined ||
      overrides.worktrees !== undefined,
  );
}

export function shouldPromptInteractively(command: 'run' | 'validate', overrides: RunOverrides): boolean {
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

      const defaultModel = previous.model ?? config.defaults.model;
      const modelLabel = defaultModel || 'CLI default';
      const modelAnswer = await rl.question(`Model (${modelLabel}): `);
      const nextModel = modelAnswer.trim() || defaultModel;

      const defaultPassModel = previous.passModel ?? config.defaults.passModel;
      const passModelLabel = defaultPassModel || 'same as main model / CLI default';
      const passModelAnswer = await rl.question(`Pass model (${passModelLabel}): `);
      const nextPassModel = passModelAnswer.trim() || defaultPassModel;

      const defaultPasses = previous.passes ?? config.defaults.passes;
      const passesAnswer = await rl.question(`Enable discovery passes? [Y/n] (${defaultPasses ? 'yes' : 'no'}): `);
      const nextPasses = parseBooleanAnswer(passesAnswer, defaultPasses);

      const defaultPassFrequency = previous.passFrequency ?? config.defaults.passFrequency;
      const passFrequencyAnswer = await rl.question(`Pass frequency (${defaultPassFrequency}): `);
      const nextPassFrequency = parseNumberAnswer(passFrequencyAnswer, defaultPassFrequency);

      const defaultWorktrees = previous.worktrees ?? config.defaults.worktrees;
      const worktreesAnswer = await rl.question(`Use git worktrees? [Y/n] (${defaultWorktrees ? 'yes' : 'no'}): `);
      const nextWorktrees = parseBooleanAnswer(worktreesAnswer, defaultWorktrees);

      const nextOverrides: RunOverrides = {
        ...previous,
        tool: nextTool,
        model: nextModel,
        passModel: nextPassModel,
        passes: nextPasses,
        passFrequency: nextPassFrequency,
        worktrees: nextWorktrees,
        interactive: true,
      };

      output.write(`\n${summarizeRunOverrides(config, {
        tool: nextTool,
        model: nextModel,
        passModel: nextPassModel,
        passes: nextPasses,
        passFrequency: nextPassFrequency,
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
