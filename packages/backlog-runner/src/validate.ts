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

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function validateCommandReadiness(
  config: BacklogRunnerConfig,
): Promise<{ ok: boolean; message: string }> {
  const commandRunner = createCommandRunner();
  const bashScriptMatch = config.validationCommand.match(/^\s*bash\s+([^\s]+)\s*$/);
  if (bashScriptMatch) {
    const scriptPath = bashScriptMatch[1]!;
    const absoluteScriptPath = scriptPath.startsWith('/')
      ? scriptPath
      : `${config.projectRoot}/${scriptPath}`.replace(/\/\.\//g, '/');

    if (!(await fileExists(absoluteScriptPath))) {
      return { ok: false, message: '  ✗ validation command script not found' };
    }

    const syntaxCheck = await commandRunner.run('bash', ['-n', absoluteScriptPath], { ignoreFailure: true });
    if (syntaxCheck.code !== 0) {
      return { ok: false, message: '  ✗ validation command failed bash syntax check' };
    }

    return { ok: true, message: '  ✓ validation command script is present and syntactically valid' };
  }

  const firstToken = config.validationCommand.trim().split(/\s+/)[0];
  if (!firstToken) {
    return { ok: false, message: '  ✗ validation command is empty' };
  }

  const check = await commandRunner.runShell(`command -v ${shellEscape(firstToken)}`, {
    cwd: config.projectRoot,
    ignoreFailure: true,
  });
  if (check.code !== 0) {
    return { ok: false, message: `  ✗ validation command executable '${firstToken}' not found` };
  }

  return { ok: true, message: `  ✓ validation command executable '${firstToken}' is available` };
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
  if (providerValidation.structuredOutputMode) {
    messages.push(
      `  → Structured output: ${providerValidation.structuredOutputMode === 'strict' ? 'strict' : 'best-effort'}`,
    );
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

  const validationCommand = await validateCommandReadiness(config);
  if (!validationCommand.ok) {
    ok = false;
  }
  messages.push(validationCommand.message);

  return { ok, messages, structuredOutputMode: providerValidation.structuredOutputMode };
}
