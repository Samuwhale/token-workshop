import type { AgentRunRequest, CommandRunner, ToolValidationResult } from '../types.js';
import {
  assertAgentSuccess,
  JSON_SCHEMA,
  normalizeAgentResult,
  smokeStructuredOutput,
  simpleVersionValidation,
  type ProviderAdapter,
  readIfExists,
  withTempDir,
  writeTempFile,
} from './common.js';

export const codexProvider: ProviderAdapter = {
  tool: 'codex',
  structuredOutputMode: 'strict',
  async validate(commandRunner: CommandRunner, model?: string): Promise<ToolValidationResult> {
    const base = await simpleVersionValidation(commandRunner, 'codex', 'codex');
    if (!base.ok) return base;

    const smoke = await withTempDir('backlog-codex-smoke-', async dir => {
      const schemaFile = await writeTempFile(dir, 'schema.json', JSON_SCHEMA);
      const outputFile = `${dir}/out.json`;
      const smokePrompt = 'Return exactly this JSON object and nothing else: {"status":"done","item":"smoke","note":"ok"}';
      return smokeStructuredOutput(
        async () => {
          const result = await commandRunner.run(
            'codex',
            [
              'exec',
              '-c',
              'approval_policy="never"',
              '--sandbox',
              'danger-full-access',
              '--skip-git-repo-check',
              '--ephemeral',
              '--output-schema',
              schemaFile,
              '--output-last-message',
              outputFile,
              '-C',
              dir,
              ...(model ? ['--model', model] : []),
            ],
            {
              cwd: dir,
              input: smokePrompt,
              ignoreFailure: true,
            },
          );
          const output = await readIfExists(outputFile);
          return { ...result, stdout: output || result.stdout };
        },
        'strict',
        'codex exec',
      );
    });

    return {
      ok: base.ok && smoke.ok,
      messages: [...base.messages, ...smoke.messages],
      structuredOutputMode: smoke.structuredOutputMode,
    };
  },
  async run(commandRunner, request: AgentRunRequest) {
    return withTempDir('backlog-codex-', async dir => {
      const schemaFile = await writeTempFile(dir, 'schema.json', request.schema || JSON_SCHEMA);
      const outputFile = `${dir}/last-message.json`;
      const mergedPrompt = `${request.prompt}\n\n${request.context}`;
      const result = await commandRunner.run(
        'codex',
        [
          'exec',
          '-c',
          'approval_policy="never"',
          '--sandbox',
          'danger-full-access',
          '--skip-git-repo-check',
          '--ephemeral',
          '--output-schema',
          schemaFile,
          '--output-last-message',
          outputFile,
          '-C',
          request.cwd,
          ...(request.model ? ['--model', request.model] : []),
        ],
        {
          cwd: request.cwd,
          input: mergedPrompt,
          ignoreFailure: true,
        },
      );

      const output = await readIfExists(outputFile);
      return assertAgentSuccess(normalizeAgentResult(output, result.stderr, 'strict'), {
        ...result,
        stdout: output || result.stdout,
      }, 'strict');
    });
  },
};
