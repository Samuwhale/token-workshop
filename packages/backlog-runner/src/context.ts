import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { BacklogRunnerConfig, BacklogTaskClaim, TaskDependencySnapshot, TaskReservationSnapshot } from './types.js';

const EXECUTION_PROGRESS_SECTIONS = 2;
const EXECUTION_PROGRESS_CHARS = 3_500;
const DISCOVERY_PROGRESS_SECTIONS = 3;
const DISCOVERY_PROGRESS_CHARS = 4_500;
const EXECUTION_PATTERN_ENTRIES = 10;
const DISCOVERY_PATTERN_ENTRIES = 14;
const PATTERN_CHAR_BUDGET = 6_000;
const BACKLOG_ITEM_LIMIT = 24;
const BACKLOG_CHAR_BUDGET = 5_000;

type PatternEntry = {
  text: string;
  score: number;
  index: number;
};

type BacklogTaskRecord = {
  section: string;
  status: 'open' | 'in-progress' | 'done' | 'failed';
  title: string;
};

async function readFileIfExists(filePath: string, fallback: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function trimToBudget(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 15)).trimEnd()}\n… [truncated]`;
}

function normalizeWord(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9/_-]+/g, '');
}

function addWords(target: Set<string>, value: string): void {
  for (const fragment of value.split(/[^a-zA-Z0-9/_-]+/g)) {
    const word = normalizeWord(fragment);
    if (!word || word.length < 4) continue;
    target.add(word);
  }
}

function keywordSetForTask(config: BacklogRunnerConfig, claim: BacklogTaskClaim): Set<string> {
  const keywords = new Set<string>();
  addWords(keywords, claim.task.title);
  addWords(keywords, claim.task.validationProfile);
  for (const note of claim.task.statusNotes) addWords(keywords, note);
  for (const criterion of claim.task.acceptanceCriteria) addWords(keywords, criterion);
  for (const capability of claim.task.capabilities) addWords(keywords, capability);
  for (const touchPath of claim.task.touchPaths) {
    addWords(keywords, touchPath);
    addWords(keywords, path.posix.basename(touchPath));
    for (const segment of touchPath.split('/')) {
      addWords(keywords, segment);
    }
  }
  addWords(keywords, path.relative(config.projectRoot, config.files.progress));
  return keywords;
}

function keywordSetForDiscovery(backlogContent: string): Set<string> {
  const keywords = new Set<string>();
  for (const match of backlogContent.matchAll(/^##\s+(.+)$/gm)) {
    addWords(keywords, match[1] ?? '');
  }
  for (const match of backlogContent.matchAll(/^- \[[ ~x!]\]\s+(.+)$/gm)) {
    addWords(keywords, match[1] ?? '');
  }
  return keywords;
}

function parsePatternEntries(content: string): string[] {
  const entries: string[] = [];
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith('- ')) {
      if (current.length > 0) entries.push(current.join('\n').trim());
      current = [line];
      continue;
    }
    if (current.length > 0) {
      if (!line.trim() && current[current.length - 1] === '') continue;
      current.push(line);
    }
  }

  if (current.length > 0) entries.push(current.join('\n').trim());
  return entries.filter(Boolean);
}

function scorePattern(text: string, keywords: Set<string>): number {
  const haystack = normalizeWord(text);
  let score = 0;
  for (const keyword of keywords) {
    if (!keyword) continue;
    if (haystack.includes(keyword)) score += keyword.length >= 8 ? 3 : 2;
  }
  return score;
}

function renderPatternDigest(entries: PatternEntry[], maxEntries: number): string {
  const selected = entries.slice(0, maxEntries);
  const lines: string[] = [];
  let used = 0;

  for (const entry of selected) {
    const next = entry.text.trim();
    if (!next) continue;
    if (used + next.length > PATTERN_CHAR_BUDGET && lines.length > 0) break;
    lines.push(next);
    used += next.length;
  }

  if (lines.length === 0) return '- None';
  const omitted = Math.max(0, entries.length - lines.length);
  const suffix = omitted > 0 ? `\n- … ${omitted} additional patterns omitted` : '';
  return `${lines.join('\n')}${suffix}`;
}

function selectPatternDigest(content: string, keywords: Set<string>, maxEntries: number): string {
  const parsed = parsePatternEntries(content);
  const scored = parsed.map((text, index) => ({
    text,
    index,
    score: scorePattern(text, keywords),
  }));

  const matched = scored
    .filter(entry => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const fallback = scored.filter(entry => entry.score === 0).sort((left, right) => left.index - right.index);
  return renderPatternDigest([...matched, ...fallback], maxEntries);
}

function parseProgressSections(content: string): string[] {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  return normalized
    .split(/^## /gm)
    .map(section => section.trim())
    .filter(Boolean)
    .map(section => `## ${section}`);
}

async function readRecentSections(progressFile: string, maxSections: number, maxChars: number): Promise<string> {
  const content = await readFileIfExists(progressFile, '');
  const sections = parseProgressSections(content);
  if (sections.length === 0) return 'No prior session entries.';
  return trimToBudget(sections.slice(-maxSections).join('\n\n'), maxChars);
}

function parseBacklogTasks(content: string): BacklogTaskRecord[] {
  const tasks: BacklogTaskRecord[] = [];
  let section = 'General';

  for (const line of content.replace(/\r\n/g, '\n').split('\n')) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      section = heading[1] ?? section;
      continue;
    }

    const task = line.match(/^- \[([ ~x!])\]\s+(.+)$/);
    if (!task) continue;
    const marker = task[1] ?? ' ';
    tasks.push({
      section,
      status: marker === 'x' ? 'done' : marker === '!' ? 'failed' : marker === '~' ? 'in-progress' : 'open',
      title: task[2] ?? '',
    });
  }

  return tasks;
}

function renderBacklogDigest(content: string): string {
  const tasks = parseBacklogTasks(content);
  if (tasks.length === 0) {
    const trimmed = content.trim();
    return trimmed ? trimToBudget(trimmed, BACKLOG_CHAR_BUDGET) : 'Backlog unavailable.';
  }

  const counts = {
    open: tasks.filter(task => task.status === 'open').length,
    inProgress: tasks.filter(task => task.status === 'in-progress').length,
    done: tasks.filter(task => task.status === 'done').length,
    failed: tasks.filter(task => task.status === 'failed').length,
  };
  const bySection = new Map<string, number>();
  for (const task of tasks) {
    if (task.status !== 'open' && task.status !== 'in-progress') continue;
    bySection.set(task.section, (bySection.get(task.section) ?? 0) + 1);
  }

  const openItems = tasks
    .filter(task => task.status === 'open' || task.status === 'in-progress')
    .slice(0, BACKLOG_ITEM_LIMIT)
    .map(task => `- [${task.status === 'in-progress' ? '~' : ' '}] ${task.section}: ${task.title}`);

  const summaryLines = [
    `Queue summary: ${counts.open} open · ${counts.inProgress} in-progress · ${counts.done} done · ${counts.failed} failed`,
    `Active sections: ${[...bySection.entries()].sort((left, right) => right[1] - left[1]).slice(0, 6).map(([name, count]) => `${name} (${count})`).join(' · ') || 'none'}`,
    '',
    'Top open items:',
    ...(openItems.length > 0 ? openItems : ['- None']),
  ];

  if (tasks.length > BACKLOG_ITEM_LIMIT) {
    summaryLines.push(`- … ${tasks.length - BACKLOG_ITEM_LIMIT} additional backlog items omitted`);
  }
  return trimToBudget(summaryLines.join('\n'), BACKLOG_CHAR_BUDGET);
}

export async function buildExecutionContext(
  config: BacklogRunnerConfig,
  cwd: string,
  claim: BacklogTaskClaim,
  dependencies: TaskDependencySnapshot[],
  reservations: TaskReservationSnapshot[],
): Promise<string> {
  const [patternsContent, recent] = await Promise.all([
    readFileIfExists(config.files.patterns, ''),
    readRecentSections(config.files.progress, EXECUTION_PROGRESS_SECTIONS, EXECUTION_PROGRESS_CHARS),
  ]);
  const keywords = keywordSetForTask(config, claim);
  const validationCommand = config.validationProfiles[claim.task.validationProfile] ?? config.validationCommand;
  const dependencySection = dependencies.length === 0
    ? '- None'
    : dependencies.map(dep => `- ${dep.title} (${dep.taskId}) — ${dep.state}`).join('\n');
  const reservationSection = reservations.length === 0
    ? '- None'
    : reservations.map(reservation => {
        const touchPaths = reservation.touchPaths.length > 0 ? reservation.touchPaths.join(', ') : '(none)';
        const capabilities = reservation.capabilities.length > 0 ? reservation.capabilities.join(', ') : '(none)';
        return `- ${reservation.title} (${reservation.taskId}) — touch_paths: ${touchPaths}; capabilities: ${capabilities}; lease expires: ${reservation.expiresAt}`;
      }).join('\n');
  const acceptanceCriteria = claim.task.acceptanceCriteria.length > 0
    ? claim.task.acceptanceCriteria.map(item => `- ${item}`).join('\n')
    : `- ${claim.task.title}`;

  return `## Relevant Patterns
${selectPatternDigest(patternsContent, keywords, EXECUTION_PATTERN_ENTRIES)}

## Recent Session Digest
${recent}

## Assigned Task
ID: ${claim.task.id}
Title: ${claim.task.title}
Priority: ${claim.task.priority}
Validation profile: ${claim.task.validationProfile}

Allowed touch_paths:
${claim.task.touchPaths.map(item => `- ${item}`).join('\n') || '- None'}

Capabilities:
${claim.task.capabilities.map(item => `- ${item}`).join('\n') || '- None'}

Dependencies:
${dependencySection}

Acceptance criteria:
${acceptanceCriteria}

Status notes:
${claim.task.statusNotes.map(item => `- ${item}`).join('\n') || '- None'}

## Active Reservations
${reservationSection}

## Validation Command
Run this exact command before reporting success:
${validationCommand}

## Follow-up Queue
If this work reveals another backlog item or context that a later run should keep, append one JSON object per line to:
${path.posix.normalize(path.relative(cwd, config.files.followups).split(path.sep).join('/'))}

Schema:
{"title":"Standalone backlog item title","context":"Optional concise context for the future run","priority":"normal|high"}

## Stop Rules
- Do not modify backlog.md directly; it is generated from backlog/tasks and runtime state.
- Stay inside the declared touch_paths. If the task needs broader scope, stop and queue a follow-up instead of freelancing.
- Do not start adjacent cleanup just because it is nearby; adjacent discoveries become follow-up tasks.
- Do not change another active task's reserved files or subsystem surface.`;
}

export async function buildDiscoveryContext(
  config: BacklogRunnerConfig,
): Promise<string> {
  const [patternsContent, recent, backlogContent] = await Promise.all([
    readFileIfExists(config.files.patterns, ''),
    readRecentSections(config.files.progress, DISCOVERY_PROGRESS_SECTIONS, DISCOVERY_PROGRESS_CHARS),
    readFileIfExists(config.files.backlog, 'Backlog unavailable.'),
  ]);
  const keywords = keywordSetForDiscovery(backlogContent);

  return `## Relevant Patterns
${selectPatternDigest(patternsContent, keywords, DISCOVERY_PATTERN_ENTRIES)}

## Recent Session Digest
${recent}

## Backlog Digest
${renderBacklogDigest(backlogContent)}

## Planner Flow
Discovery passes write free-form candidates to backlog-inbox.md.
The planner step converts those entries into backlog/tasks/*.yaml and only runnable task specs are eligible for execution.
Do not modify backlog.md directly.`;
}

export async function inspectBacklogState(
  config: BacklogRunnerConfig,
): Promise<{
  generatedReport: boolean;
  hasLegacyTasks: boolean;
  taskSpecCount: number;
}> {
  const [backlogContent, taskSpecEntries] = await Promise.all([
    readFileIfExists(config.files.backlog, ''),
    readdir(config.files.taskSpecsDir, { withFileTypes: true }).catch(() => []),
  ]);
  const taskSpecCount = taskSpecEntries.filter(entry => entry.isFile() && /\.ya?ml$/i.test(entry.name)).length;

  return {
    generatedReport: backlogContent.includes('<!-- This file is generated by packages/backlog-runner'),
    hasLegacyTasks: /^- \[[ ~x!]\]\s+/m.test(backlogContent),
    taskSpecCount,
  };
}
