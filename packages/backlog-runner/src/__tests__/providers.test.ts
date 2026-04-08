import { describe, expect, it } from 'vitest';
import { claudeProvider } from '../providers/claude.js';
import { normalizeAgentResult } from '../providers/common.js';
import type { CommandResult, CommandRunner } from '../types.js';

function createFakeCommandRunner(
  responses: {
    version?: CommandResult;
    auth?: CommandResult;
    smoke?: CommandResult;
  },
): CommandRunner {
  return {
    async run(command: string, args: string[]): Promise<CommandResult> {
      if (command === 'claude' && args.includes('--version')) {
        return responses.version ?? { code: 0, stdout: '1.0.0', stderr: '' };
      }
      if (command === 'claude' && args[0] === 'auth') {
        return responses.auth ?? { code: 0, stdout: 'Logged in', stderr: '' };
      }
      if (command === 'claude') {
        return responses.smoke ?? {
          code: 0,
          stdout: JSON.stringify({
            structured_output: { status: 'done', item: 'smoke', note: 'ok' },
          }),
          stderr: '',
        };
      }
      return { code: 0, stdout: '', stderr: '' };
    },
    async runShell(): Promise<CommandResult> {
      return { code: 0, stdout: '', stderr: '' };
    },
    async which(command: string): Promise<string | null> {
      return command === 'claude' ? '/usr/bin/claude' : null;
    },
  };
}

describe('provider normalization', () => {
  it('parses Claude structured output envelopes', () => {
    const result = normalizeAgentResult(
      JSON.stringify({
        structured_output: { status: 'done', item: 'claude item', note: 'ok' },
        num_turns: 4,
        duration_ms: 3200,
      }),
      '',
      'strict',
    );

    expect(result).toMatchObject({
      status: 'done',
      item: 'claude item',
      note: 'ok',
      turns: 4,
      durationSeconds: 3,
    });
  });

  it('parses Gemini response payloads', () => {
    const result = normalizeAgentResult(
      JSON.stringify({
        response: '{"status":"failed","item":"gemini item","note":"bad"}',
      }),
      '',
      'best-effort',
    );

    expect(result).toMatchObject({
      status: 'failed',
      item: 'gemini item',
      note: 'bad',
    });
  });

  it('parses raw embedded JSON from mixed output only in best-effort mode', () => {
    const result = normalizeAgentResult(
      'some logs before {"status":"done","item":"raw item","note":"worked"}',
      '',
      'best-effort',
    );

    expect(result).toMatchObject({
      status: 'done',
      item: 'raw item',
      note: 'worked',
    });
  });

  it('rejects embedded JSON in strict mode', () => {
    const result = normalizeAgentResult(
      'some logs before {"status":"done","item":"raw item","note":"worked"}',
      '',
      'strict',
    );

    expect(result).toBeNull();
  });

  it('fails provider validation when smoke output is malformed', async () => {
    const validation = await claudeProvider.validate(
      createFakeCommandRunner({
        smoke: {
          code: 0,
          stdout: 'not json',
          stderr: '',
        },
      }),
      'claude-sonnet-4-6',
    );

    expect(validation.ok).toBe(false);
    expect(validation.messages.join('\n')).toContain('smoke test failed');
  });
});
