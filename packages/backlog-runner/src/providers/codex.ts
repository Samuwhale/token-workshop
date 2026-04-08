import type { AgentRunRequest, CommandRunner, ToolValidationResult } from '../types.js';
import {
  assertAgentSuccess,
  JSON_SCHEMA,
  normalizeAgentResult,
  simpleVersionValidation,
  type ProviderAdapter,
  readIfExists,
  withTempDir,
  writeTempFile,
} from './common.js';

export const codexProvider: ProviderAdapter = {
  tool: 'codex',
  async validate(commandRunner: CommandRunner, model: string): Promise<ToolValidationResult> {
    const base = await simpleVersionValidation(commandRunner, 'codex', 'codex');
    if (!base.ok) return base;

    return withTempDir('backlog-codex-smoke-', async dir => {
      const schemaFile = await writeTempFile(dir, 'schema.json', JSON_SCHEMA);
      const outputFile = `${dir}/out.json`;
      const smokePrompt = 'Return exactly this JSON object and nothing else: {"status":"done","item":"smoke","note":"ok"}';
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
          '--model',
          model,
          '--output-schema',
          schemaFile,
          '--output-last-message',
          outputFile,
          '-C',
          dir,
        ],
        {
          cwd: dir,
          input: smokePrompt,
          ignoreFailure: true,
        },
      );

      const output = await readIfExists(outputFile);
      const parsed = normalizeAgentResult(output, result.stderr);
      if (parsed?.status === 'done' && parsed.item === 'smoke' && parsed.note === 'ok') {
        return {
          ok: true,
          messages: [...base.messages, '  ✓ codex exec smoke test'],
        };
      }

      return {
        ok: false,
        messages: [...base.messages, '  ✗ codex exec smoke test failed'],
      };
    });
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
          '--model',
          request.model,
          '--output-schema',
          schemaFile,
          '--output-last-message',
          outputFile,
          '-C',
          request.cwd,
        ],
        {
          cwd: request.cwd,
          input: mergedPrompt,
          ignoreFailure: true,
        },
      );

      const output = await readIfExists(outputFile);
      return assertAgentSuccess(normalizeAgentResult(output, result.stderr), {
        ...result,
        stdout: output || result.stdout,
      });
    });
  },
};
