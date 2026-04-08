#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { promptForRunOverrides, shouldPromptInteractively } from './interactive.js';
import { loadBacklogRunnerConfig } from '../src/config.js';
import { runBacklogRunner, syncBacklogRunner } from '../src/scheduler.js';
import { validateBacklogRunner } from '../src/validate.js';
import type { BacklogTool, RunOverrides } from '../src/types.js';

function usage(): never {
  console.error('Usage: backlog-runner <run|validate|sync> --config backlog.config.mjs [--tool TOOL] [--model MODEL] [--pass-model MODEL] [--passes true|false] [--worktrees true|false] [--interactive|--no-interactive]');
  process.exit(1);
  throw new Error('unreachable');
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (['true', '1', 'yes'].includes(value)) return true;
  if (['false', '0', 'no'].includes(value)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

async function main() {
  const [command] = process.argv.slice(2);
  if (!command || (command !== 'run' && command !== 'validate' && command !== 'sync')) {
    usage();
  }

  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      config: { type: 'string' },
      tool: { type: 'string' },
      model: { type: 'string' },
      'pass-model': { type: 'string' },
      passes: { type: 'string' },
      worktrees: { type: 'string' },
      interactive: { type: 'boolean' },
      'no-interactive': { type: 'boolean' },
    },
    allowPositionals: true,
  });

  if (!values.config) {
    usage();
  }

  const config = await loadBacklogRunnerConfig(values.config);
  let overrides: RunOverrides = {
    tool: values.tool as BacklogTool | undefined,
    model: values.model,
    passModel: values['pass-model'],
    passes: parseBoolean(values.passes),
    worktrees: parseBoolean(values.worktrees),
    interactive: values['no-interactive'] ? false : values.interactive ? true : undefined,
  };

  if (shouldPromptInteractively(command, overrides)) {
    overrides = await promptForRunOverrides(config, overrides);
  }

  if (command === 'sync') {
    const result = await syncBacklogRunner(config);
    console.log('Backlog sync complete');
    console.log('');
    if (result.candidates.drained) {
      console.log(`Candidate planner: ${result.candidates.createdTasks} created · ${result.candidates.skippedDuplicates} duplicates · ${result.candidates.ignoredInvalidLines} invalid`);
    }
    console.log(
      `Queue: ${result.counts.ready} ready · ${result.counts.blocked} blocked · ${result.counts.planned} planned · ${result.counts.inProgress} in-progress · ${result.counts.failed} failed · ${result.counts.done} done`,
    );
    return;
  }

  if (command === 'validate') {
    const result = await validateBacklogRunner(config, overrides);
    console.log(`Validating backlog runner setup for tool: ${overrides.tool ?? config.defaults.tool}`);
    console.log('');
    for (const message of result.messages) {
      console.log(message);
    }
    process.exit(result.ok ? 0 : 1);
  }

  await runBacklogRunner(config, overrides);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
