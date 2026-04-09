import type { AgentRunRequest, CommandRunner, ToolValidationResult } from '../types.js';
import {
  assertAgentSuccess,
  JSON_SCHEMA,
  normalizeAgentResult,
  type ProviderValidationOptions,
  smokeStructuredOutput,
  simpleVersionValidation,
  type ProviderAdapter,
  readIfExists,
  withTempDir,
  writeTempFile,
} from './common.js';

const PROVIDER_SMOKE_TIMEOUT_MS = 2 * 60 * 1000;
const PROVIDER_RUN_TIMEOUT_MS = 30 * 60 * 1000;

export const codexProvider: ProviderAdapter = {
  tool: 'codex',
  async validate(commandRunner: CommandRunner, options: ProviderValidationOptions = {}): Promise<ToolValidationResult> {
    const { model, smokeTests = [] } = options;
    const base = await simpleVersionValidation(commandRunner, 'codex', 'codex');
    if (!base.ok) return base;

    const smokeCases = [
      {
        label: 'codex exec',
        schema: JSON_SCHEMA,
        prompt: 'Return exactly this JSON object and nothing else: {"status":"done","item":"smoke","note":"ok"}',
      },
      ...smokeTests,
    ];
    const smokeResults: ToolValidationResult[] = [];
    for (const testCase of smokeCases) {
      smokeResults.push(await withTempDir('backlog-codex-smoke-', async dir => {
        const schemaFile = await writeTempFile(dir, 'schema.json', testCase.schema);
        const outputFile = `${dir}/out.json`;
        return smokeStructuredOutput(
          async () => {
            const result = await commandRunner.run(
              'codex',
              [
                'exec',
                '--dangerously-bypass-approvals-and-sandbox',
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
                input: testCase.prompt,
                timeoutMs: PROVIDER_SMOKE_TIMEOUT_MS,
                ignoreFailure: true,
              },
            );
            const output = await readIfExists(outputFile);
            return { ...result, stdout: output || result.stdout };
          },
          testCase.label,
          testCase,
        );
      }));
    }

    return {
      ok: base.ok && smokeResults.every(result => result.ok),
      messages: [...base.messages, ...smokeResults.flatMap(result => result.messages)],
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
          '--dangerously-bypass-approvals-and-sandbox',
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
          timeoutMs: PROVIDER_RUN_TIMEOUT_MS,
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
