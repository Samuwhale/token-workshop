import type { AgentRunRequest, CommandRunner, ToolValidationResult } from '../types.js';
import {
  assertAgentSuccess,
  normalizeAgentResult,
  smokeStructuredOutput,
  simpleVersionValidation,
  type ProviderAdapter,
  withTempDir,
  writeTempFile,
} from './common.js';

export const geminiProvider: ProviderAdapter = {
  tool: 'gemini',
  structuredOutputMode: 'best-effort',
  async validate(commandRunner: CommandRunner, model?: string): Promise<ToolValidationResult> {
    const base = await simpleVersionValidation(commandRunner, 'gemini', 'gemini');
    if (!base.ok) return base;

    const smoke = await withTempDir('backlog-gemini-smoke-', async dir => {
      const policyFile = await writeTempFile(dir, 'policy.md', 'Return only the requested JSON object.');
      return smokeStructuredOutput(
        () =>
          commandRunner.run(
            'gemini',
            [
              '--yolo',
              '--prompt',
              'Execute the instructions from stdin.',
              '--output-format',
              'json',
              ...(model ? ['--model', model] : []),
              '--policy',
              policyFile,
            ],
            {
              cwd: dir,
              input: 'Return exactly this JSON object and nothing else: {"status":"done","item":"smoke","note":"ok"}',
              ignoreFailure: true,
            },
          ),
        'best-effort',
        'gemini',
      );
    });

    return {
      ok: base.ok && smoke.ok,
      messages: [
        ...base.messages,
        '  ⚠ gemini CLI uses best-effort JSON parsing (no schema-enforced structured output)',
        ...smoke.messages,
      ],
      structuredOutputMode: 'best-effort',
    };
  },
  async run(commandRunner, request: AgentRunRequest) {
    return withTempDir('backlog-gemini-', async dir => {
      const policyFile = await writeTempFile(dir, 'policy.md', request.context);
      const args = [
        '--yolo',
        '--prompt',
        'Execute the instructions from stdin.',
        '--output-format',
        'json',
      ];
      if (request.model) {
        args.push('--model', request.model);
      }
      args.push('--policy', policyFile);
      const result = await commandRunner.run(
        'gemini',
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
    });
  },
};
