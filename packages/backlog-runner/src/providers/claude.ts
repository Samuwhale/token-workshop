import type { AgentRunRequest, CommandRunner, ToolValidationResult } from '../types.js';
import {
  assertAgentSuccess,
  JSON_SCHEMA,
  normalizeAgentResult,
  simpleVersionValidation,
  type ProviderAdapter,
  withTempDir,
  writeTempFile,
} from './common.js';

export const claudeProvider: ProviderAdapter = {
  tool: 'claude',
  validate(commandRunner: CommandRunner): Promise<ToolValidationResult> {
    return simpleVersionValidation(commandRunner, 'claude', 'claude');
  },
  async run(commandRunner, request: AgentRunRequest) {
    return withTempDir('backlog-claude-', async dir => {
      const contextFile = await writeTempFile(dir, 'context.md', request.context);
      const args = [
        '--dangerously-skip-permissions',
        '--print',
        '--no-session-persistence',
        '--max-turns',
        String(request.maxTurns ?? 100),
        '--output-format',
        'json',
        '--json-schema',
        request.schema || JSON_SCHEMA,
      ];
      if (request.model) {
        args.push('--model', request.model);
      }
      args.push('--append-system-prompt-file', contextFile);
      const result = await commandRunner.run(
        'claude',
        args,
        {
          cwd: request.cwd,
          input: request.prompt,
          ignoreFailure: true,
        },
      );

      return assertAgentSuccess(normalizeAgentResult(result.stdout, result.stderr), result);
    });
  },
};
