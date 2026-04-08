#!/usr/bin/env node
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const backlogFile = path.join(projectRoot, 'backlog.md');
const progressFile = path.join(projectRoot, 'scripts/backlog/progress.txt');

const READY_MARKER = ' ';
const IN_PROGRESS_MARKER = '~';
const DONE_MARKER = 'x';
const FAILED_MARKER = '!';
const PRIORITY_PATTERN = /\[(HIGH|P0|BUG)\]/;
const TASK_PATTERN = /^- \[([ ~x!])\] (.+)$/;
const PROGRESS_SECTION_PATTERN = /^## \d{4}-\d{2}-\d{2} - (.+)$/;
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'have',
  'has',
  'are',
  'was',
  'were',
  'but',
  'not',
  'you',
  'your',
  'they',
  'them',
  'their',
  'then',
  'than',
  'when',
  'what',
  'where',
  'will',
  'would',
  'should',
  'could',
  'does',
  'dont',
  'through',
  'across',
  'inside',
  'outside',
  'into',
  'only',
  'just',
  'more',
  'less',
  'very',
  'like',
  'current',
  'default',
  'user',
  'users',
  'flow',
  'panel',
  'workspace',
]);

function usage() {
  console.error('Usage: node scripts/backlog/codex-backlog-skill.mjs <snapshot|pick-next|finish> [options]');
  process.exit(1);
}

function splitLines(value) {
  return value.replace(/\r\n/g, '\n').split('\n');
}

async function atomicWrite(filePath, content) {
  const tempFile = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempFile, content, 'utf8');
  await rename(tempFile, filePath);
}

async function readText(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function normalizeTitle(title) {
  return title.replace(/\s+/g, ' ').trim();
}

function tokenize(title) {
  return new Set(
    title
      .replace(PRIORITY_PATTERN, ' ')
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .map(part => part.trim())
      .filter(part => part.length >= 3 && !STOP_WORDS.has(part)),
  );
}

function overlapScore(a, b) {
  let score = 0;
  for (const token of a) {
    if (b.has(token)) score += 1;
  }
  return score;
}

function parseBacklog(content) {
  const lines = splitLines(content);
  let currentArea = '';
  let currentBucket = '';
  const items = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.startsWith('## ')) {
      currentArea = line.slice(3).trim();
      currentBucket = '';
      continue;
    }
    if (line.startsWith('### ')) {
      currentBucket = line.slice(4).trim();
      continue;
    }

    const match = line.match(TASK_PATTERN);
    if (!match) continue;

    const marker = match[1];
    const title = normalizeTitle(match[2]);
    items.push({
      lineNumber: index + 1,
      marker,
      title,
      priority: PRIORITY_PATTERN.test(title),
      area: currentArea,
      bucket: currentBucket,
    });
  }

  return { lines, items };
}

function parseRecentProgress(content, limit = 6) {
  const titles = [];
  for (const line of splitLines(content)) {
    const match = line.match(PROGRESS_SECTION_PATTERN);
    if (!match) continue;
    titles.push(normalizeTitle(match[1]));
  }

  const recentTitles = [];
  const seen = new Set();
  for (let index = titles.length - 1; index >= 0; index -= 1) {
    const title = titles[index];
    if (!title || seen.has(title)) continue;
    seen.add(title);
    recentTitles.push(title);
    if (recentTitles.length >= limit) break;
  }
  return recentTitles;
}

function chooseNextItem(items, recentTitles) {
  const readyItems = items.filter(item => item.marker === READY_MARKER);
  if (readyItems.length === 0) return null;

  const recentTokenSets = recentTitles.map(title => tokenize(title));
  const scored = readyItems.map(item => {
    const itemTokens = tokenize(item.title);
    const locality = recentTokenSets.reduce((best, recent) => Math.max(best, overlapScore(itemTokens, recent)), 0);
    return { item, locality };
  });

  scored.sort((left, right) => {
    if (Number(right.item.priority) !== Number(left.item.priority)) {
      return Number(right.item.priority) - Number(left.item.priority);
    }
    if (right.locality !== left.locality) {
      return right.locality - left.locality;
    }
    return left.item.lineNumber - right.item.lineNumber;
  });

  const top = scored[0];
  if (!top) return null;

  let reason = 'selected first ready item in backlog order';
  if (top.item.priority) {
    reason = 'selected first ready high-priority item';
  } else if (top.locality > 0) {
    reason = 'selected ready item most related to recent work';
  }

  return {
    ...top.item,
    reason,
    localityScore: top.locality,
    recentTitles,
  };
}

function replaceMarker(lines, lineNumber, expectedMarker, nextMarker) {
  const index = lineNumber - 1;
  const line = lines[index];
  if (!line) {
    throw new Error(`Line ${lineNumber} not found in backlog`);
  }
  const match = line.match(TASK_PATTERN);
  if (!match) {
    throw new Error(`Line ${lineNumber} is not a backlog task`);
  }
  if (match[1] !== expectedMarker) {
    throw new Error(`Line ${lineNumber} expected [${expectedMarker}] but found [${match[1]}]`);
  }
  lines[index] = line.replace(`- [${expectedMarker}]`, `- [${nextMarker}]`);
}

function parseFlag(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

async function snapshot() {
  const backlog = parseBacklog(await readText(backlogFile));
  const recentTitles = parseRecentProgress(await readText(progressFile));
  const selected = chooseNextItem(backlog.items, recentTitles);
  const counts = backlog.items.reduce(
    (acc, item) => {
      if (item.marker === READY_MARKER) acc.ready += 1;
      if (item.marker === IN_PROGRESS_MARKER) acc.inProgress += 1;
      if (item.marker === FAILED_MARKER) acc.failed += 1;
      if (item.marker === DONE_MARKER) acc.done += 1;
      return acc;
    },
    { ready: 0, inProgress: 0, failed: 0, done: 0 },
  );

  const readyItems = backlog.items
    .filter(item => item.marker === READY_MARKER)
    .slice(0, 12)
    .map(item => ({
      lineNumber: item.lineNumber,
      title: item.title,
      priority: item.priority,
      area: item.area,
      bucket: item.bucket,
    }));

  console.log(
    JSON.stringify(
      {
        counts,
        recentTitles,
        selected,
        readyItems,
      },
      null,
      2,
    ),
  );
}

async function pickNext() {
  const backlogContent = await readText(backlogFile);
  const backlog = parseBacklog(backlogContent);
  const recentTitles = parseRecentProgress(await readText(progressFile));
  const selected = chooseNextItem(backlog.items, recentTitles);
  if (!selected) {
    console.log(JSON.stringify({ ok: false, reason: 'no ready backlog item found' }, null, 2));
    return;
  }

  replaceMarker(backlog.lines, selected.lineNumber, READY_MARKER, IN_PROGRESS_MARKER);
  await atomicWrite(backlogFile, backlog.lines.join('\n'));

  console.log(
    JSON.stringify(
      {
        ok: true,
        selected,
      },
      null,
      2,
    ),
  );
}

async function finish(args) {
  const itemTitle = parseFlag(args, '--item');
  const status = parseFlag(args, '--status');
  if (!itemTitle || !status) {
    usage();
  }

  const nextMarker = status === 'done' ? DONE_MARKER : status === 'failed' ? FAILED_MARKER : null;
  if (!nextMarker) {
    throw new Error(`Unsupported finish status: ${status}`);
  }

  const backlogContent = await readText(backlogFile);
  const backlog = parseBacklog(backlogContent);
  const selected = backlog.items.find(item => item.marker === IN_PROGRESS_MARKER && item.title === normalizeTitle(itemTitle));
  if (!selected) {
    throw new Error(`No in-progress backlog item found for: ${itemTitle}`);
  }

  replaceMarker(backlog.lines, selected.lineNumber, IN_PROGRESS_MARKER, nextMarker);
  await atomicWrite(backlogFile, backlog.lines.join('\n'));

  console.log(
    JSON.stringify(
      {
        ok: true,
        item: selected.title,
        lineNumber: selected.lineNumber,
        status,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command) usage();

  if (command === 'snapshot') {
    await snapshot();
    return;
  }

  if (command === 'pick-next') {
    await pickNext();
    return;
  }

  if (command === 'finish') {
    await finish(args);
    return;
  }

  usage();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
