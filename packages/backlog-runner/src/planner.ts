import path from 'node:path';
import { extractStructuredOutput } from './providers/common.js';
import { createTaskFromPlannerChild } from './task-specs.js';
import type {
  BacklogRunnerConfig,
  BacklogTaskSpec,
  PlannerSupersedeAction,
  PlannerTaskChild,
} from './types.js';

const PLANNER_BATCH_SIZE = 3;

export const PLANNER_SCHEMA_SMOKE_PROMPT = `Return exactly this JSON object and nothing else:
{"status":"done","item":"planner-smoke","note":"ok","action":"supersede","parent_task_ids":["parent-a"],"children":[{"title":"Planner smoke child","task_kind":"research","priority":"normal","touch_paths":["backlog"],"acceptance_criteria":["Emit concrete follow-up backlog tasks."],"validation_profile":null,"capabilities":null,"context":null}]}`;

export const PLANNER_RESULT_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'failed'] },
    item: { type: 'string' },
    note: { type: 'string' },
    action: { type: 'string', enum: ['supersede'] },
    parent_task_ids: {
      type: 'array',
      minItems: 1,
      items: { type: 'string' },
    },
    children: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          task_kind: { type: 'string', enum: ['implementation', 'research'] },
          priority: { type: 'string', enum: ['high', 'normal', 'low'] },
          touch_paths: {
            type: 'array',
            minItems: 1,
            items: { type: 'string' },
          },
          acceptance_criteria: {
            type: 'array',
            minItems: 1,
            items: { type: 'string' },
          },
          validation_profile: { type: ['string', 'null'] },
          capabilities: {
            type: ['array', 'null'],
            items: { type: 'string' },
          },
          context: { type: ['string', 'null'] },
        },
        required: ['title', 'task_kind', 'priority', 'touch_paths', 'acceptance_criteria', 'validation_profile', 'capabilities', 'context'],
        additionalProperties: false,
      },
    },
  },
  required: ['status', 'item', 'note', 'action', 'parent_task_ids', 'children'],
  additionalProperties: false,
});

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+/g, '/').replace(/\/$/, '');
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value.map(item => normalizeWhitespace(String(item))).filter(Boolean);
  return normalized.length > 0 ? normalized : null;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value.map(item => normalizeWhitespace(String(item))).filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

function parsePlannerChild(value: unknown): PlannerTaskChild | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const title = normalizeWhitespace(String(record.title ?? ''));
  const taskKind = normalizeWhitespace(String(record.task_kind ?? '')).toLowerCase();
  const priority = normalizeWhitespace(String(record.priority ?? '')).toLowerCase();
  const touchPaths = stringArray(record.touch_paths)?.map(normalizePath) ?? null;
  const acceptanceCriteria = stringArray(record.acceptance_criteria);
  if (!title || !touchPaths || !acceptanceCriteria) return null;
  if (taskKind !== 'implementation' && taskKind !== 'research') return null;
  if (priority !== 'high' && priority !== 'normal' && priority !== 'low') return null;

  return {
    title,
    taskKind,
    priority,
    touchPaths,
    acceptanceCriteria,
    validationProfile: normalizeWhitespace(String(record.validation_profile ?? '')) || undefined,
    capabilities: optionalStringArray(record.capabilities)?.map(item => item.toLowerCase()),
    context: normalizeWhitespace(String(record.context ?? '')) || undefined,
  };
}

export function plannerBatchSize(): number {
  return PLANNER_BATCH_SIZE;
}

export function plannerResearchTouchPaths(config: BacklogRunnerConfig): string[] {
  return [
    path.relative(config.projectRoot, config.files.candidateQueue),
    path.relative(config.projectRoot, config.files.progress),
    path.relative(config.projectRoot, config.files.patterns),
  ].map(normalizePath);
}

export function parsePlannerSupersedeAction(rawOutput: string, config: BacklogRunnerConfig): PlannerSupersedeAction | null {
  const payload = extractStructuredOutput(rawOutput);
  if (!payload || payload.action !== 'supersede') return null;

  const parentTaskIds = stringArray(payload.parent_task_ids);
  if (!parentTaskIds) return null;
  if (new Set(parentTaskIds).size !== parentTaskIds.length) return null;
  if (!Array.isArray(payload.children) || payload.children.length === 0) return null;

  const children: PlannerTaskChild[] = [];
  for (const child of payload.children) {
    const parsed = parsePlannerChild(child);
    if (!parsed) return null;
    if (parsed.taskKind === 'research') {
      parsed.touchPaths = plannerResearchTouchPaths(config);
      parsed.validationProfile = 'backlog';
      parsed.capabilities = undefined;
    }
    const materialized = createTaskFromPlannerChild(parsed, config.validationProfiles);
    if (!materialized) return null;
    children.push({
      title: materialized.title,
      taskKind: materialized.taskKind,
      priority: materialized.priority,
      touchPaths: materialized.touchPaths,
      acceptanceCriteria: materialized.acceptanceCriteria,
      validationProfile: materialized.validationProfile,
      capabilities: materialized.capabilities,
      context: parsed.context,
    });
  }

  return {
    action: 'supersede',
    parentTaskIds,
    children,
  };
}

export function plannerContextForTasks(tasks: BacklogTaskSpec[]): string {
  return tasks
    .slice(0, PLANNER_BATCH_SIZE)
    .map(task => {
      const notes = task.statusNotes.length > 0 ? task.statusNotes.map(note => `- ${note}`).join('\n') : '- None';
      const criteria = task.acceptanceCriteria.length > 0 ? task.acceptanceCriteria.map(item => `- ${item}`).join('\n') : '- None';
      const notesLabel = task.state === 'failed' ? 'Recovery evidence:' : 'Status notes:';
      return `### ${task.title}
ID: ${task.id}
Priority: ${task.priority}
Task kind: ${task.taskKind}
State: ${task.state}
Acceptance criteria:
${criteria}
${notesLabel}
${notes}`;
    })
    .join('\n\n');
}
