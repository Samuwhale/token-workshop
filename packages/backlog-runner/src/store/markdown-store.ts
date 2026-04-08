import { createHash, randomUUID } from 'node:crypto';
import { access, appendFile, readFile, rename, writeFile } from 'node:fs/promises';
import { lockPath, withLock } from '../locks.js';
import type {
  BacklogDrainResult,
  BacklogItemClaim,
  BacklogMarker,
  BacklogRunnerConfig,
  BacklogStore,
  StoreCleanupResult,
} from '../types.js';

const PRIORITY_PATTERN = /^- \[ \] \[(HIGH|P0|BUG)\]/;
const READY_PATTERN = /^- \[ \]/;
const IN_PROGRESS_PATTERN = /^- \[~\]/;
const FAILED_PATTERN = /^- \[!\]/;
const DONE_PATTERN = /^- \[x\]/;
const CLAIM_TOKEN_PATTERN = /\s*<!-- backlog-claim:([0-9a-f-]+) -->\s*$/i;

type FollowupRecord = {
  title: string;
  context?: string;
  priority?: string;
};

function splitLines(value: string): string[] {
  return value.replace(/\r\n/g, '\n').split('\n');
}

function countMatchingLines(content: string, pattern: RegExp): number {
  return splitLines(content).filter(line => pattern.test(line)).length;
}

function collapseBlankLines(lines: string[]): string[] {
  const next: string[] = [];
  for (const line of lines) {
    if (line === '' && next[next.length - 1] === '') continue;
    next.push(line);
  }
  return next;
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tempFile = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempFile, content, 'utf8');
  await rename(tempFile, filePath);
}

function stripClaimToken(line: string): string {
  return line.replace(CLAIM_TOKEN_PATTERN, '').trimEnd();
}

function appendClaimToken(line: string, claimToken: string): string {
  return `${stripClaimToken(line)} <!-- backlog-claim:${claimToken} -->`;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function itemSignature(line: string): string {
  const normalized = stripClaimToken(line)
    .replace(/^- \[.\] (?:\[(?:HIGH|P0|BUG)\] )?/, '')
    .replace(/\s+\(Context: .+\)$/, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return createHash('sha1').update(normalized).digest('hex');
}

function parseClaimToken(line: string): string | null {
  return line.match(CLAIM_TOKEN_PATTERN)?.[1] ?? null;
}

function parseFollowupRecord(line: string): FollowupRecord | null {
  try {
    const value = JSON.parse(line) as Partial<FollowupRecord>;
    return typeof value.title === 'string' ? (value as FollowupRecord) : null;
  } catch {
    return null;
  }
}

function followupToBacklogLine(record: FollowupRecord): string | null {
  const title = normalizeWhitespace(record.title);
  if (!title) {
    return null;
  }

  const context = typeof record.context === 'string' ? normalizeWhitespace(record.context) : '';
  const priority = typeof record.priority === 'string' ? record.priority.toLowerCase() : 'normal';
  const prefix = priority === 'high' ? '- [ ] [HIGH] ' : '- [ ] ';

  return context ? `${prefix}${title} (Context: ${context})` : `${prefix}${title}`;
}

export class MarkdownBacklogStore implements BacklogStore {
  constructor(private readonly config: BacklogRunnerConfig) {}

  private get backlogLock(): string {
    return lockPath(this.config, 'backlog');
  }

  async ensureProgressFile(): Promise<void> {
    try {
      await access(this.config.files.progress);
    } catch {
      await writeFile(
        this.config.files.progress,
        `# Backlog Progress Log\nStarted: ${new Date().toString()}\n---\n`,
        'utf8',
      );
    }
  }

  private async readBacklog(): Promise<string> {
    return readFile(this.config.files.backlog, 'utf8');
  }

  private async writeBacklog(content: string): Promise<void> {
    await atomicWrite(this.config.files.backlog, content);
  }

  private async mergeReadyItems(
    readyLines: string[],
  ): Promise<{ skippedDuplicates: number }> {
    const backlogContent = await this.readBacklog();
    const backlogLines = splitLines(backlogContent);
    const existingSignatures = new Set(
      backlogLines
        .filter(line => /^- \[[ ~x!]\]/.test(line))
        .map(itemSignature),
    );

    let skippedDuplicates = 0;
    const uniqueReadyLines = readyLines.filter(line => {
      const signature = itemSignature(line);
      if (existingSignatures.has(signature)) {
        skippedDuplicates += 1;
        return false;
      }
      existingSignatures.add(signature);
      return true;
    });

    const priorityItems = uniqueReadyLines.filter(line => PRIORITY_PATTERN.test(line));
    const otherItems = uniqueReadyLines.filter(line => !PRIORITY_PATTERN.test(line));

    if (priorityItems.length > 0) {
      const firstReadyIndex = backlogLines.findIndex(line => READY_PATTERN.test(line));
      if (firstReadyIndex === -1) {
        backlogLines.push('', ...priorityItems);
      } else {
        backlogLines.splice(firstReadyIndex, 0, ...priorityItems);
      }
    }

    if (otherItems.length > 0) {
      backlogLines.push('', ...otherItems);
    }

    await this.writeBacklog(collapseBlankLines(backlogLines).join('\n'));
    return { skippedDuplicates };
  }

  async countReady(): Promise<number> {
    return countMatchingLines(await this.readBacklog(), READY_PATTERN);
  }

  async countInProgress(): Promise<number> {
    return countMatchingLines(await this.readBacklog(), IN_PROGRESS_PATTERN);
  }

  async countFailed(): Promise<number> {
    return countMatchingLines(await this.readBacklog(), FAILED_PATTERN);
  }

  async countDone(): Promise<number> {
    return countMatchingLines(await this.readBacklog(), DONE_PATTERN);
  }

  async getQueueCounts() {
    const content = await this.readBacklog();
    return {
      ready: countMatchingLines(content, READY_PATTERN),
      inProgress: countMatchingLines(content, IN_PROGRESS_PATTERN),
      failed: countMatchingLines(content, FAILED_PATTERN),
    };
  }

  async claimNextItem(): Promise<BacklogItemClaim | null> {
    return withLock(this.backlogLock, 30, async () => {
      const content = await this.readBacklog();
      const lines = splitLines(content);
      let index = lines.findIndex(line => PRIORITY_PATTERN.test(line));
      if (index === -1) {
        index = lines.findIndex(line => READY_PATTERN.test(line));
      }

      if (index === -1) {
        return null;
      }

      const line = lines[index]!;
      const claimToken = randomUUID();
      const item = stripClaimToken(line).replace(/^- \[ \] /, '');
      lines[index] = appendClaimToken(line.replace(/^- \[ \]/, '- [~]'), claimToken);
      await this.writeBacklog(lines.join('\n'));
      return { lineNumber: index + 1, item, claimToken };
    });
  }

  async updateItemStatus(claim: BacklogItemClaim, marker: BacklogMarker): Promise<void> {
    if (!claim.item) return;

    await withLock(this.backlogLock, 30, async () => {
      const content = await this.readBacklog();
      const lines = splitLines(content);
      const claimedLine = lines[claim.lineNumber - 1];
      let index =
        claimedLine && parseClaimToken(claimedLine) === claim.claimToken
          ? claim.lineNumber - 1
          : lines.findIndex(line => parseClaimToken(line) === claim.claimToken);
      if (index === -1 && claimedLine) {
        const claimedItem = stripClaimToken(claimedLine).replace(/^- \[[ ~x!]\] /, '');
        if (claimedItem === claim.item) {
          index = claim.lineNumber - 1;
        }
      }
      if (index === -1) {
        const matchingIndexes = lines
          .map((line, candidateIndex) => ({ line, candidateIndex }))
          .filter(({ line }) => stripClaimToken(line).replace(/^- \[[ ~x!]\] /, '') === claim.item)
          .map(({ candidateIndex }) => candidateIndex);
        if (matchingIndexes.length === 1) {
          index = matchingIndexes[0]!;
        }
      }
      if (index === -1) return;
      lines[index] = stripClaimToken(lines[index]!).replace(/^- \[[ ~x!]\]/, `- [${marker}]`);
      await this.writeBacklog(lines.join('\n'));
    });
  }

  async resetStaleInProgressItems(): Promise<number> {
    return withLock(this.backlogLock, 30, async () => {
      const content = await this.readBacklog();
      const count = countMatchingLines(content, IN_PROGRESS_PATTERN);
      if (count === 0) return 0;
      const next = content.replace(/^- \[~\]/gm, '- [ ]');
      await this.writeBacklog(next);
      return count;
    });
  }

  async drainInbox(): Promise<BacklogDrainResult> {
    return withLock(this.backlogLock, 5, async () => {
      let inboxContent = '';
      try {
        inboxContent = await readFile(this.config.files.inbox, 'utf8');
      } catch {
        return { drained: false, skippedDuplicates: 0, ignoredInvalidLines: 0 };
      }

      if (!/\S/.test(inboxContent)) {
        return { drained: false, skippedDuplicates: 0, ignoredInvalidLines: 0 };
      }

      const normalizedInboxLines = splitLines(inboxContent)
        .map(line =>
          line
            .replace(/^- \[(HIGH|P0|BUG)\] /, '- [ ] [$1] ')
            .replace(/^- \[!\] /, '- [ ] '),
        )
        .filter(Boolean);
      const readyLines = normalizedInboxLines.filter(line => READY_PATTERN.test(line));
      const ignoredInvalidLines = normalizedInboxLines.length - readyLines.length;
      const { skippedDuplicates } = await this.mergeReadyItems(readyLines);
      await atomicWrite(this.config.files.inbox, '');
      return { drained: true, skippedDuplicates, ignoredInvalidLines };
    });
  }

  async drainFollowups(filePath = this.config.files.followups): Promise<BacklogDrainResult> {
    return withLock(this.backlogLock, 5, async () => {
      let content = '';
      try {
        content = await readFile(filePath, 'utf8');
      } catch {
        return { drained: false, skippedDuplicates: 0, ignoredInvalidLines: 0 };
      }

      if (!/\S/.test(content)) {
        return { drained: false, skippedDuplicates: 0, ignoredInvalidLines: 0 };
      }

      let ignoredInvalidLines = 0;
      const readyLines = splitLines(content)
        .map(line => line.trim())
        .filter(Boolean)
        .flatMap(line => {
          const record = parseFollowupRecord(line);
          if (!record) {
            ignoredInvalidLines += 1;
            return [];
          }

          const backlogLine = followupToBacklogLine(record);
          if (!backlogLine) {
            ignoredInvalidLines += 1;
            return [];
          }

          return [backlogLine];
        });

      const { skippedDuplicates } = await this.mergeReadyItems(readyLines);
      await atomicWrite(filePath, '');
      return { drained: true, skippedDuplicates, ignoredInvalidLines };
    });
  }

  async getCompletedCount(): Promise<number> {
    try {
      const value = await readFile(this.config.files.counter, 'utf8');
      return Number.parseInt(value.trim(), 10) || 0;
    } catch {
      return 0;
    }
  }

  async incrementCompletedCount(): Promise<number> {
    return withLock(this.backlogLock, 30, async () => {
      const current = await this.getCompletedCount();
      const next = current + 1;
      await writeFile(this.config.files.counter, `${next}\n`, 'utf8');
      return next;
    });
  }

  async cleanupIfNeeded(): Promise<StoreCleanupResult> {
    return withLock(this.backlogLock, 30, async () => {
      const backlogContent = await this.readBacklog();
      const doneCount = countMatchingLines(backlogContent, DONE_PATTERN);
      if (doneCount <= this.config.cleanup.archiveDoneThreshold) {
        return { archivedCount: 0, trimmedProgress: false };
      }

      const lines = splitLines(backlogContent);
      const doneLines = lines.filter(line => DONE_PATTERN.test(line));
      const remainingLines = collapseBlankLines(lines.filter(line => !DONE_PATTERN.test(line)));

      let archiveHeader = '# Backlog Archive\nCompleted items removed from backlog.md to keep it lean.\n';
      try {
        archiveHeader = await readFile(this.config.files.archive, 'utf8');
      } catch {
        // use default header
      }
      const archiveContent = archiveHeader.trimEnd() +
        `\n\n## Archived ${new Date().toISOString().slice(0, 10)} (${doneCount} items)\n` +
        `${doneLines.join('\n')}\n`;

      await atomicWrite(this.config.files.archive, archiveContent);
      await this.writeBacklog(remainingLines.join('\n'));

      const progressContent = await readFile(this.config.files.progress, 'utf8');
      const sections = [...progressContent.matchAll(/^## /gm)].map(match => match.index ?? 0);
      let trimmedProgress = false;
      if (sections.length > this.config.cleanup.progressSectionsToKeep) {
        const keepIndex = sections[sections.length - this.config.cleanup.progressSectionsToKeep]!;
        const prefix = splitLines(progressContent).slice(0, 3).join('\n');
        const suffix = progressContent.slice(keepIndex);
        await atomicWrite(this.config.files.progress, `${prefix}\n${suffix}`.replace(/\n{3,}/g, '\n\n'));
        trimmedProgress = true;
      }

      return { archivedCount: doneCount, trimmedProgress };
    });
  }

  async appendProgress(section: string): Promise<void> {
    await appendFile(this.config.files.progress, section, 'utf8');
  }

  async appendPatterns(section: string): Promise<void> {
    await appendFile(this.config.files.patterns, section, 'utf8');
  }
}

export function createMarkdownBacklogStore(config: BacklogRunnerConfig): BacklogStore {
  return new MarkdownBacklogStore(config);
}
