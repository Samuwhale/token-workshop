import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
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
    tool?: BacklogTool;
    workers: number;
    model?: string;
    passes: boolean;
    worktrees: boolean;
  },
): string {
  const tool = overrides.tool ?? 'per-runner config';
  const model = overrides.model?.trim() || 'per-runner config';
  return [
    'Selected options',
    SUMMARY_DIVIDER,
    `Tool override:  ${tool}`,
    `Workers:        ${overrides.workers}`,
    `Model override: ${model}`,
    `Passes:         ${overrides.passes ? 'enabled' : 'disabled'}`,
    `Worktrees:      ${overrides.worktrees ? 'enabled' : 'disabled'}`,
    SUMMARY_DIVIDER,
  ].join('\n');
}

function hasExplicitOverrides(overrides: RunOverrides): boolean {
  return Boolean(
    overrides.tool !== undefined ||
    overrides.workers !== undefined ||
    overrides.model !== undefined ||
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

      const defaultTool = previous.tool;
      output.write('Global tool override options:\n');
      TOOLS.forEach((tool, index) => {
        const marker = tool === defaultTool ? ' (selected)' : '';
        output.write(`  ${index + 1}. ${tool}${marker}\n`);
      });
      const toolAnswer = await rl.question(`Tool [1-${TOOLS.length} or name, blank keeps per-runner config] (${defaultTool ?? 'per-runner config'}): `);
      const trimmedToolAnswer = toolAnswer.trim();
      const nextTool = trimmedToolAnswer ? resolveToolChoice(trimmedToolAnswer, defaultTool ?? TOOLS[0]) : undefined;

      const defaultWorkers = previous.workers ?? config.defaults.workers;
      const workersAnswer = await rl.question(`Workers [1-${MAX_INTERACTIVE_WORKERS}] (${defaultWorkers}): `);
      const nextWorkers = resolveWorkerChoice(workersAnswer, defaultWorkers);

      const defaultModel = previous.model;
      const modelAnswer = await rl.question(`Model override (blank keeps per-runner config) (${defaultModel ?? 'per-runner config'}): `);
      const nextModel = modelAnswer.trim() || undefined;

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
        passes: nextPasses,
        worktrees: nextWorktrees,
        interactive: true,
      };

      output.write(`\n${summarizeRunOverrides({
        tool: nextTool,
        workers: nextWorkers,
        model: nextModel,
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
