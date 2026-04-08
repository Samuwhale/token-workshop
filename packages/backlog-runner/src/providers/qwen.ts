import type { AgentRunRequest, CommandRunner, ToolValidationResult } from '../types.js';
import {
  assertAgentSuccess,
  normalizeAgentResult,
  smokeStructuredOutput,
  simpleVersionValidation,
  type ProviderAdapter,
} from './common.js';

export const qwenProvider: ProviderAdapter = {
  tool: 'qwen',
  structuredOutputMode: 'best-effort',
  async validate(commandRunner: CommandRunner, model?: string): Promise<ToolValidationResult> {
    const base = await simpleVersionValidation(commandRunner, 'qwen', 'qwen');
    if (!base.ok) return base;

    const smoke = await smokeStructuredOutput(
      () =>
        commandRunner.run(
          'qwen',
          [
            '--yolo',
            '--prompt',
            'Execute the instructions from stdin.',
            '--max-session-turns',
            '1',
            '--output-format',
            'json',
            ...(model ? ['--model', model] : []),
            '--append-system-prompt',
            'Return only the requested JSON object.',
          ],
          {
            input: 'Return exactly this JSON object and nothing else: {"status":"done","item":"smoke","note":"ok"}',
            ignoreFailure: true,
          },
        ),
      'best-effort',
      'qwen',
    );

    return {
      ok: base.ok && smoke.ok,
      messages: [
        ...base.messages,
        '  ⚠ qwen CLI uses best-effort JSON parsing (no schema-enforced structured output)',
        ...smoke.messages,
      ],
      structuredOutputMode: 'best-effort',
    };
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

    return assertAgentSuccess(
      normalizeAgentResult(result.stdout, result.stderr, 'best-effort'),
      result,
      'best-effort',
    );
  },
};
