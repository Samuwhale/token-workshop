import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AgentResult, AgentRunRequest, BacklogTool, CommandResult, CommandRunner, ToolValidationResult } from '../types.js';

export const JSON_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'failed'] },
    item: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['status', 'item', 'note'],
  additionalProperties: false,
});

export function isRateLimited(output: string): boolean {
  return /usage limit|rate.?limit|out of credits|overloaded|capacity|too many requests|529|claude\.ai\/upgrade|quota exceeded|resource exhausted|429|model is (currently )?overloaded|exceeded rate limits|temporarily unavailable|service unavailable|server busy|model overloaded|try again later|request limit|maximum.*requests|insufficient balance|insufficient funds|account balance/i.test(
    output,
  );
}

export function isAuthFailure(output: string): boolean {
  return /authentication|permission denied|insufficient.*permission|forbidden|403|401|invalid.*token|invalid.*key|api[_ -]?key.*invalid|unauthorized|not authorized|access denied/i.test(
    output,
  );
}

function maybeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function extractPayload(candidate: Record<string, unknown>): Record<string, unknown> | null {
  if (
    typeof candidate.status === 'string' &&
    typeof candidate.item === 'string' &&
    typeof candidate.note === 'string'
  ) {
    return candidate;
  }

  const structured = asObject(candidate.structured_output);
  if (structured) {
    return structured;
  }

  return null;
}

export function extractStructuredOutput(output: string): Record<string, unknown> | null {
  const parsedWhole = asObject(maybeParseJson(output));
  const wholePayload = parsedWhole ? extractPayload(parsedWhole) : null;
  return wholePayload;
}

function summarizeFailure(commandResult: CommandResult): string {
  const combined = [commandResult.stdout, commandResult.stderr]
    .join('\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  return combined.slice(-6).join(' | ') || 'no output';
}

export function normalizeAgentResult(
  stdout: string,
  stderr: string,
): AgentResult | null {
  const candidate = extractStructuredOutput(stdout);
  if (!candidate) return null;

  const status = candidate.status;
  const item = candidate.item;
  const note = candidate.note;
  if ((status !== 'done' && status !== 'failed') || typeof item !== 'string' || typeof note !== 'string') {
    return null;
  }

  const root = asObject(maybeParseJson(stdout)) ?? {};
  const turns = typeof root.num_turns === 'number' ? root.num_turns : undefined;
  const durationMs = typeof root.duration_ms === 'number' ? root.duration_ms : undefined;
  const costUsd = typeof root.total_cost_usd === 'number' ? root.total_cost_usd : undefined;

  return {
    status,
    item,
    note,
    turns,
    durationSeconds: durationMs ? Math.floor(durationMs / 1000) : undefined,
    costUsd,
    rawOutput: stdout,
    rawError: stderr,
  };
}

export interface ProviderAdapter {
  readonly tool: BacklogTool;
  validate(commandRunner: CommandRunner, model?: string): Promise<ToolValidationResult>;
  run(commandRunner: CommandRunner, request: AgentRunRequest): Promise<AgentResult>;
}

export async function simpleVersionValidation(
  commandRunner: CommandRunner,
  command: string,
  prettyName: string,
): Promise<ToolValidationResult> {
  const found = await commandRunner.which(command);
  if (!found) {
    return {
      ok: false,
      messages: [`  ✗ '${command}' CLI not found`],
    };
  }

  const version = await commandRunner.run(command, ['--version'], { ignoreFailure: true });
  const label = version.stdout.trim() || version.stderr.trim() || 'unknown';
  return {
    ok: true,
    messages: [`  ✓ ${prettyName} ${label}`],
  };
}

export async function checkCommandAuth(
  commandRunner: CommandRunner,
  command: string,
  args: string[],
  okPattern: RegExp,
): Promise<{ ok: boolean; message: string }> {
  const result = await commandRunner.run(command, args, { ignoreFailure: true });
  const combined = `${result.stdout}\n${result.stderr}`.trim();
  if (result.code === 0 && (!combined || okPattern.test(combined) || !isAuthFailure(combined))) {
    return { ok: true, message: `  ✓ ${command} auth ready` };
  }

  if (isAuthFailure(combined)) {
    return { ok: false, message: `  ✗ ${command} auth check failed` };
  }

  return { ok: false, message: `  ✗ ${command} auth status unavailable` };
}

export async function smokeStructuredOutput(
  run: () => Promise<CommandResult>,
  label: string,
): Promise<ToolValidationResult> {
  const result = await run();
  const parsed = normalizeAgentResult(result.stdout, result.stderr);
  if (parsed?.status === 'done' && parsed.item === 'smoke' && parsed.note === 'ok') {
    return {
      ok: true,
      messages: [`  ✓ ${label} smoke test (strict structured output)`],
    };
  }

  if (isAuthFailure(`${result.stdout}\n${result.stderr}`)) {
    return {
      ok: false,
      messages: [`  ✗ ${label} smoke test failed: authentication/permission error`],
    };
  }

  return {
    ok: false,
    messages: [`  ✗ ${label} smoke test failed: ${summarizeFailure(result)}`],
  };
}

export async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function writeTempFile(dir: string, name: string, content: string): Promise<string> {
  const filePath = path.join(dir, name);
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

export async function readIfExists(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

export function assertAgentSuccess(
  result: AgentResult | null,
  commandResult: CommandResult,
): AgentResult {
  if (result) return result;
  const combined = `${commandResult.stdout} ${commandResult.stderr}`.trim();
  if (isAuthFailure(combined)) {
    throw new Error('Authentication/permission error');
  }
  if (isRateLimited(combined)) {
    throw new Error('Rate limit hit');
  }
  throw new Error('Agent did not return valid strict structured output');
}
