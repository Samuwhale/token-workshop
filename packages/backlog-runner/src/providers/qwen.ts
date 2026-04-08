import type { AgentRunRequest, CommandRunner, ToolValidationResult } from '../types.js';
import {
  assertAgentSuccess,
  normalizeAgentResult,
  simpleVersionValidation,
  type ProviderAdapter,
} from './common.js';

export const qwenProvider: ProviderAdapter = {
  tool: 'qwen',
  validate(commandRunner: CommandRunner): Promise<ToolValidationResult> {
    return simpleVersionValidation(commandRunner, 'qwen', 'qwen');
  },
  async run(commandRunner, request: AgentRunRequest) {
    const result = await commandRunner.run(
      'qwen',
      [
        '--yolo',
        '--prompt',
        'Execute the instructions from stdin.',
        '--max-session-turns',
        String(request.maxTurns ?? 100),
        '--output-format',
        'json',
        '--model',
        request.model,
        '--append-system-prompt',
        request.context,
      ],
      {
        cwd: request.cwd,
        input: request.prompt,
        ignoreFailure: true,
      },
    );

    return assertAgentSuccess(normalizeAgentResult(result.stdout, result.stderr), result);
  },
};
