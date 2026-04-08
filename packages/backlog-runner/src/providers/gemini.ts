import type { AgentRunRequest, CommandRunner, ToolValidationResult } from '../types.js';
import {
  assertAgentSuccess,
  normalizeAgentResult,
  simpleVersionValidation,
  type ProviderAdapter,
  withTempDir,
  writeTempFile,
} from './common.js';

export const geminiProvider: ProviderAdapter = {
  tool: 'gemini',
  validate(commandRunner: CommandRunner): Promise<ToolValidationResult> {
    return simpleVersionValidation(commandRunner, 'gemini', 'gemini');
  },
  async run(commandRunner, request: AgentRunRequest) {
    return withTempDir('backlog-gemini-', async dir => {
      const policyFile = await writeTempFile(dir, 'policy.md', request.context);
      const result = await commandRunner.run(
        'gemini',
        [
          '--yolo',
          '--prompt',
          'Execute the instructions from stdin.',
          '--output-format',
          'json',
          '--model',
          request.model,
          '--policy',
          policyFile,
        ],
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
