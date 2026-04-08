import { describe, expect, it } from 'vitest';
import { normalizeAgentResult } from '../providers/common.js';

describe('provider normalization', () => {
  it('parses Claude structured output envelopes', () => {
    const result = normalizeAgentResult(
      JSON.stringify({
        structured_output: { status: 'done', item: 'claude item', note: 'ok' },
        num_turns: 4,
        duration_ms: 3200,
      }),
      '',
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
    );

    expect(result).toMatchObject({
      status: 'failed',
      item: 'gemini item',
      note: 'bad',
    });
  });

  it('parses raw embedded JSON from mixed output', () => {
    const result = normalizeAgentResult(
      'some logs before {"status":"done","item":"raw item","note":"worked"}',
      '',
    );

    expect(result).toMatchObject({
      status: 'done',
      item: 'raw item',
      note: 'worked',
    });
  });
});
