import type { AgentRunRequest, CommandRunner, ToolValidationResult } from '../types.js';
import {
  assertAgentSuccess,
  checkCommandAuth,
  JSON_SCHEMA,
  normalizeAgentResult,
  smokeStructuredOutput,
  simpleVersionValidation,
  type ProviderAdapter,
  withTempDir,
  writeTempFile,
} from './common.js';

const PROVIDER_SMOKE_TIMEOUT_MS = 2 * 60 * 1000;
const PROVIDER_RUN_TIMEOUT_MS = 30 * 60 * 1000;

export const claudeProvider: ProviderAdapter = {
  tool: 'claude',
  async validate(commandRunner: CommandRunner, model?: string): Promise<ToolValidationResult> {
    const base = await simpleVersionValidation(commandRunner, 'claude', 'claude');
    if (!base.ok) return base;

    const auth = await checkCommandAuth(commandRunner, 'claude', ['auth', 'status', '--text'], /logged in|authenticated/i);
    const smoke = await withTempDir('backlog-claude-smoke-', async dir => {
      const contextFile = await writeTempFile(dir, 'context.md', 'Return exactly the requested JSON.');
      return smokeStructuredOutput(
        () =>
          commandRunner.run(
            'claude',
            [
              '--dangerously-skip-permissions',
              '--print',
              '--no-session-persistence',
              '--max-turns',
              '3',
              '--output-format',
              'json',
              '--json-schema',
              JSON_SCHEMA,
              ...(model ? ['--model', model] : []),
              '--append-system-prompt-file',
              contextFile,
            ],
            {
              cwd: dir,
              input: 'Return exactly this JSON object and nothing else: {"status":"done","item":"smoke","note":"ok"}',
              timeoutMs: PROVIDER_SMOKE_TIMEOUT_MS,
              ignoreFailure: true,
            },
          ),
        'claude',
      );
    });

    return {
      ok: base.ok && auth.ok && smoke.ok,
      messages: [...base.messages, auth.message, ...smoke.messages],
    };
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
          timeoutMs: PROVIDER_RUN_TIMEOUT_MS,
          ignoreFailure: true,
        },
      );

      return assertAgentSuccess(normalizeAgentResult(result.stdout, result.stderr), result);
    });
  },
};
