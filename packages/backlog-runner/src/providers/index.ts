import type { AgentRunRequest, BacklogTool, CommandRunner, ToolValidationResult } from '../types.js';
import { claudeProvider } from './claude.js';
import { codexProvider } from './codex.js';
import type { ProviderAdapter } from './common.js';

const PROVIDERS: Record<BacklogTool, ProviderAdapter> = {
  claude: claudeProvider,
  codex: codexProvider,
};

export function getProvider(tool: BacklogTool): ProviderAdapter {
  return PROVIDERS[tool];
}

export async function validateProvider(
  tool: BacklogTool,
  commandRunner: CommandRunner,
  model?: string,
): Promise<ToolValidationResult> {
  return getProvider(tool).validate(commandRunner, model);
}

export async function runProvider(
  commandRunner: CommandRunner,
  request: AgentRunRequest,
) {
  return getProvider(request.tool).run(commandRunner, request);
}
