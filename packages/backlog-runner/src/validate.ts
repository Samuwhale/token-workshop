import { access } from 'node:fs/promises';
import { ensureConfigReady, resolveRunOptions } from './config.js';
import { createCommandRunner } from './process.js';
import { validateProvider } from './providers/index.js';
import type { BacklogRunnerConfig, RunOverrides, ToolValidationResult } from './types.js';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function validateBacklogRunner(
  config: BacklogRunnerConfig,
  overrides: RunOverrides = {},
): Promise<ToolValidationResult> {
  await ensureConfigReady(config);
  const commandRunner = createCommandRunner();
  const runOptions = await resolveRunOptions(config, overrides);
  const providerValidation = await validateProvider(runOptions.tool, commandRunner, runOptions.model);

  const messages = [...providerValidation.messages];
  messages.push(`  → Model: ${runOptions.model ?? 'CLI default'}`);
  if (runOptions.passModel !== runOptions.model) {
    messages.push(`  → Pass model: ${runOptions.passModel ?? 'CLI default'}`);
  }

  const requiredFiles = [
    ['backlog.md', config.files.backlog],
    ['patterns.md', config.files.patterns],
    ['agent prompt', config.prompts.agent],
    ['product pass prompt', config.prompts.product],
    ['ux pass prompt', config.prompts.ux],
    ['code pass prompt', config.prompts.code],
  ] as const;

  let ok = providerValidation.ok;
  for (const [label, filePath] of requiredFiles) {
    if (await fileExists(filePath)) {
      messages.push(`  ✓ ${label} found`);
    } else {
      ok = false;
      messages.push(`  ✗ ${label} not found`);
    }
  }

  if (config.files.models) {
    messages.push((await fileExists(config.files.models)) ? '  ✓ models.json found' : '  ⚠ models.json not found');
  }

  return { ok, messages };
}
