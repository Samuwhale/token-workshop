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
    const args = [
      '--yolo',
      '--prompt',
      'Execute the instructions from stdin.',
      '--max-session-turns',
      String(request.maxTurns ?? 100),
      '--output-format',
      'json',
    ];
    if (request.model) {
      args.push('--model', request.model);
    }
    args.push('--append-system-prompt', request.context);

    const result = await commandRunner.run(
      'qwen',
      args,
      {
        cwd: request.cwd,
        input: request.prompt,
        ignoreFailure: true,
      },
    );

    return assertAgentSuccess(normalizeAgentResult(result.stdout, result.stderr), result);
  },
};
