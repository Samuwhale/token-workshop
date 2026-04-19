import fs from "node:fs/promises";
import type { FastifyPluginAsync } from "fastify";
import type { CollectionPublishRouting, Token } from "@tokenmanager/core";
import { flattenTokenGroup } from "@tokenmanager/core";
import type {
  FieldChange,
  FieldChangeOperationMetadata,
  SnapshotEntry,
} from "../services/operation-log.js";
import { snapshotPaths } from "../services/operation-log.js";
import { handleRouteError } from "../errors.js";
import type { GitTokenChange as TokenChange } from "../services/git-sync.js";

function readGitLogField(entry: unknown, field: string): string {
  const value =
    entry && typeof entry === "object"
      ? (entry as Record<string, unknown>)[field]
      : undefined;
  return typeof value === "string" ? value : "";
}

export const syncRoutes: FastifyPluginAsync = async (fastify) => {
  const { withLock } = fastify.tokenLock;

  const buildPublishRoutingMaps = async (): Promise<{
    collectionMap: Record<string, string>;
    modeMap: Record<string, string>;
  }> => {
    const state = await fastify.collectionService.loadState();
    const collectionMap: Record<string, string> = {};
    const modeMap: Record<string, string> = {};

    for (const collection of state.collections) {
      if (collection.publishRouting?.collectionName) {
        collectionMap[collection.id] = collection.publishRouting.collectionName;
      }
      if (collection.publishRouting?.modeName) {
        modeMap[collection.id] = collection.publishRouting.modeName;
      }
    }

    return { collectionMap, modeMap };
  };

  fastify.get("/sync/publish-routing", async (_request, reply) => {
    try {
      return buildPublishRoutingMaps();
    } catch (err) {
      return handleRouteError(reply, err, "Failed to load publish routing");
    }
  });

  fastify.put<{
    Params: { id: string };
    Body: CollectionPublishRouting;
  }>("/sync/publish-routing/:id", async (request, reply) => {
    const { id } = request.params;
    const body = request.body || {};
    const bodyKeys = Object.keys(body);
    if (bodyKeys.some((key) => key !== "collectionName" && key !== "modeName")) {
      return reply.status(400).send({
        error: "Only the Figma collection and mode can be updated for publish routing",
      });
    }

    return withLock(async () => {
      try {
        const beforeRoute = await fastify.collectionService.getCollectionPublishRouting(id);
        if (bodyKeys.length === 0) {
          return { ok: true, id, ...beforeRoute, changed: false };
        }

        const patch: Partial<CollectionPublishRouting> = {};
        const changes: FieldChange[] = [];

        if (Object.prototype.hasOwnProperty.call(body, "collectionName")) {
          const nextValue = body.collectionName?.trim() || undefined;
          patch.collectionName = nextValue;
          if (beforeRoute.collectionName !== nextValue) {
            changes.push({
              field: "collectionName",
              label: "Figma collection",
              before: beforeRoute.collectionName,
              after: nextValue,
            });
          }
        }

        if (Object.prototype.hasOwnProperty.call(body, "modeName")) {
          const nextValue = body.modeName?.trim() || undefined;
          patch.modeName = nextValue;
          if (beforeRoute.modeName !== nextValue) {
            changes.push({
              field: "modeName",
              label: "Figma mode",
              before: beforeRoute.modeName,
              after: nextValue,
            });
          }
        }

        if (changes.length === 0) {
          return { ok: true, id, ...beforeRoute, changed: false };
        }

        await fastify.collectionService.updateCollectionPublishRouting(
          id,
          patch,
        );
        const afterRoute = await fastify.collectionService.getCollectionPublishRouting(
          id,
        );
        const rollbackRoute = changes.reduce<Partial<CollectionPublishRouting>>(
          (acc, change) => {
            if (change.field === "collectionName") {
              acc.collectionName = change.before;
            }
            if (change.field === "modeName") {
              acc.modeName = change.before;
            }
            return acc;
          },
          {},
        );
        const metadata: FieldChangeOperationMetadata = {
          kind: "publish-routing",
          collectionId: id,
          before: beforeRoute,
          after: afterRoute,
          changes,
        };
        await fastify.operationLog.record({
          type: "publish-routing",
          description: `Update Figma publish target for "${id}"`,
          resourceId: id,
          affectedPaths: [],
          beforeSnapshot: {},
          afterSnapshot: {},
          rollbackSteps: [
            { action: "write-publish-routing", collectionId: id, routing: rollbackRoute },
          ],
          metadata,
        });

        return { ok: true, id, ...afterRoute, changed: true };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to update publish routing");
      }
    });
  });

  // GET /api/sync/status — git status + isRepo + current branch
  fastify.get("/sync/status", async (_request, reply) => {
    try {
      const isRepo = await fastify.gitSync.isRepo();
      if (!isRepo) {
        return { isRepo: false, branch: null, status: null, remote: null };
      }

      const [status, branch, remote] = await Promise.all([
        fastify.gitSync.status(),
        fastify.gitSync.getCurrentBranch(),
        fastify.gitSync.getRemote(),
      ]);

      return {
        isRepo: true,
        branch,
        remote,
        status: {
          modified: status.modified,
          created: status.created,
          deleted: status.deleted,
          not_added: status.not_added,
          staged: status.staged,
          isClean: status.isClean(),
          ahead: status.ahead,
          behind: status.behind,
        },
      };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to get sync status");
    }
  });

  // POST /api/sync/init — initialize git repo
  fastify.post("/sync/init", async (_request, reply) => {
    try {
      const isRepo = await fastify.gitSync.isRepo();
      if (isRepo) {
        return reply
          .status(409)
          .send({ error: "Git repository already initialized" });
      }
      await fastify.gitSync.init();
      return { ok: true };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to initialize git repo");
    }
  });

  // POST /api/sync/commit — commit with message, optional files array for selective staging
  fastify.post<{ Body: { message: string; files?: string[] } }>(
    "/sync/commit",
    async (request, reply) => {
      const { message, files } = request.body || {};
      if (!message) {
        return reply.status(400).send({ error: "Commit message is required" });
      }

      try {
        const commitHash = await fastify.gitSync.commit(message, files);
        return { ok: true, commit: commitHash, message };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to commit");
      }
    },
  );

  // POST /api/sync/push — push to remote
  fastify.post("/sync/push", async (_request, reply) => {
    try {
      const remote = await fastify.gitSync.getRemote();
      if (!remote) {
        return reply.status(400).send({
          error: "No remote configured",
          detail: "Set a remote URL via POST /api/sync/remote before pushing.",
        });
      }
      await fastify.gitSync.push();
      return { ok: true };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to push");
    }
  });

  // POST /api/sync/pull — pull from remote
  fastify.post("/sync/pull", async (_request, reply) => {
    try {
      const remote = await fastify.gitSync.getRemote();
      if (!remote) {
        return reply.status(400).send({
          error: "No remote configured",
          detail: "Set a remote URL via POST /api/sync/remote before pulling.",
        });
      }
      const result = await fastify.gitSync.pull();
      if (result.conflicts.length > 0) {
        return { ok: true, conflicts: result.conflicts };
      }
      return { ok: true, conflicts: [] };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to pull");
    }
  });

  // GET /api/sync/conflicts — list files with merge conflicts and their parsed regions
  fastify.get("/sync/conflicts", async (_request, reply) => {
    try {
      const conflicts = await fastify.gitSync.getConflicts();
      return { conflicts };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to get conflicts");
    }
  });

  // POST /api/sync/conflicts/resolve — resolve conflicts for specific files
  fastify.post<{
    Body: {
      resolutions: Array<{
        file: string;
        choices: Record<number, "ours" | "theirs">;
      }>;
    };
  }>("/sync/conflicts/resolve", async (request, reply) => {
    try {
      const { resolutions } = request.body ?? {};
      if (!resolutions || !Array.isArray(resolutions)) {
        return reply
          .status(400)
          .send({ error: "resolutions array is required" });
      }
      if (resolutions.length === 0) {
        return reply
          .status(400)
          .send({ error: "resolutions array must not be empty" });
      }
      // Validate each resolution element has the required {file, choices} shape
      for (let i = 0; i < resolutions.length; i++) {
        const r = resolutions[i] as unknown;
        if (typeof r !== "object" || r === null || Array.isArray(r)) {
          return reply
            .status(400)
            .send({ error: `resolutions[${i}] must be an object` });
        }
        const res = r as Record<string, unknown>;
        if (typeof res.file !== "string" || res.file.trim() === "") {
          return reply.status(400).send({
            error: `resolutions[${i}].file must be a non-empty string`,
          });
        }
        if (
          typeof res.choices !== "object" ||
          res.choices === null ||
          Array.isArray(res.choices)
        ) {
          return reply
            .status(400)
            .send({ error: `resolutions[${i}].choices must be an object` });
        }
        for (const [key, val] of Object.entries(
          res.choices as Record<string, unknown>,
        )) {
          if (val !== "ours" && val !== "theirs") {
            return reply.status(400).send({
              error: `resolutions[${i}].choices["${key}"] must be "ours" or "theirs"`,
            });
          }
        }
      }
      // Validate, resolve, and stage all files atomically (with rollback on failure).
      // resolveAllConflicts throws BadRequestError (400) for invalid inputs.
      await fastify.gitSync.resolveAllConflicts(resolutions);
      // Finalize merge if no conflicts remain
      await fastify.gitSync.finalizeMerge();
      return { ok: true };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to resolve conflicts");
    }
  });

  // POST /api/sync/conflicts/abort — abort the current merge
  fastify.post("/sync/conflicts/abort", async (_request, reply) => {
    try {
      await fastify.gitSync.abortMerge();
      return { ok: true };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to abort merge");
    }
  });

  // GET /api/sync/log — recent commits
  fastify.get<{
    Querystring: { limit?: string; offset?: string; search?: string };
  }>("/sync/log", async (request, reply) => {
    try {
      const raw = parseInt(request.query.limit ?? "", 10);
      const limit = isNaN(raw) || raw < 1 ? 20 : Math.min(raw, 100);
      const rawOffset = parseInt(request.query.offset ?? "0", 10);
      const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;
      const search = request.query.search?.trim() || undefined;
      // Fetch one extra to determine if there are more results
      const log = await fastify.gitSync.log(limit + 1, offset, search);
      const all = log.all;
      const hasMore = all.length > limit;
      const data = all.slice(0, limit).map((entry) => ({
        hash: readGitLogField(entry, "hash"),
        date: readGitLogField(entry, "date"),
        message: readGitLogField(entry, "message"),
        author: readGitLogField(entry, "author_name"),
      }));
      // total is not cheaply available from git log; use -1 as sentinel when unknown
      const total = hasMore ? -1 : offset + data.length;
      return { data, total, hasMore, limit, offset };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to get log");
    }
  });

  // GET /api/sync/log/:hash/tokens — token-level diff for a specific commit
  fastify.get<{ Params: { hash: string } }>(
    "/sync/log/:hash/tokens",
    async (request, reply) => {
      const { hash } = request.params;
      // Validate hash is safe (hex characters only)
      if (!/^[0-9a-f]{4,40}$/i.test(hash)) {
        return reply.status(400).send({ error: "Invalid commit hash" });
      }

      try {
        const fileDiffs = await fastify.gitSync.getTokenFileDiffs(hash);
        const changes = fileDiffs.flatMap((diff) => diff.changes);
        return { hash, changes, fileCount: fileDiffs.length };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to get commit diff");
      }
    },
  );

  // GET /api/sync/compare — token-level diff between two arbitrary commits
  // Query params: from=<hash>&to=<hash>
  fastify.get<{ Querystring: { from: string; to: string } }>(
    "/sync/compare",
    async (request, reply) => {
      const { from, to } = request.query;
      if (!from || !to) {
        return reply
          .status(400)
          .send({ error: "Missing required query params: from, to" });
      }
      if (!/^[0-9a-f]{4,40}$/i.test(from) || !/^[0-9a-f]{4,40}$/i.test(to)) {
        return reply.status(400).send({ error: "Invalid commit hash" });
      }
      try {
        const fileDiffs = await fastify.gitSync.diffBetweenCommits(from, to);
        const changes = fileDiffs.flatMap((diff) => diff.changes);
        return { from, to, changes, fileCount: fileDiffs.length };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to compare commits");
      }
    },
  );

  // POST /api/sync/log/:hash/restore — restore tokens to their state before this commit
  // Body: { tokens?: Array<{ path: string; collectionId: string }> }
  // If tokens is omitted, restores ALL changed tokens in the commit.
  fastify.post<{
    Params: { hash: string };
    Body: { tokens?: Array<{ path: string; collectionId: string }> };
  }>("/sync/log/:hash/restore", async (request, reply) => {
    const { hash } = request.params;
    if (!/^[0-9a-f]{4,40}$/i.test(hash)) {
      return reply.status(400).send({ error: "Invalid commit hash" });
    }

    try {
      const fileDiffs = await fastify.gitSync.getTokenFileDiffs(hash);
      const diffByCollection = new Map(
        fileDiffs.map((diff) => [diff.collectionId, diff]),
      );

      // Determine which tokens to restore
      const requested = request.body?.tokens;
      const toRestore: Array<{
        path: string;
        collectionId: string;
        token: Token | null;
      }> = [];

      if (requested && requested.length > 0) {
        // Restore specific tokens
        for (const { path: tokenPath, collectionId } of requested) {
          const diff = diffByCollection.get(collectionId);
          if (!diff) continue;

          const changed = diff.changes.some(
            (change) => change.path === tokenPath,
          );
          if (changed) {
            toRestore.push({
              path: tokenPath,
              collectionId,
              token: diff.beforeTokens.get(tokenPath) ?? null,
            });
          }
        }
      } else {
        // Restore all changed tokens
        for (const diff of fileDiffs) {
          for (const change of diff.changes) {
            toRestore.push({
              path: change.path,
              collectionId: diff.collectionId,
              token: diff.beforeTokens.get(change.path) ?? null,
            });
          }
        }
      }

      if (toRestore.length === 0) {
        return reply.status(400).send({ error: "No tokens to restore" });
      }

      // Acquire token lock for the entire snapshot-restore-snapshot cycle
      return await withLock(async () => {
        // Snapshot current state for undo (operation-log)
        const allPaths = toRestore.map((r) => r.path);
        const allCollections = [
          ...new Set(toRestore.map((r) => r.collectionId)),
        ];
        const beforeSnapshot: Record<string, SnapshotEntry> = {};
        for (const collectionId of allCollections) {
          const pathsInCollection = toRestore
            .filter((r) => r.collectionId === collectionId)
            .map((r) => r.path);
          const snap = await snapshotPaths(
            fastify.tokenStore,
            collectionId,
            pathsInCollection,
          );
          Object.assign(beforeSnapshot, snap);
        }

        // Group by collection and restore
        const byCollection = new Map<
          string,
          Array<{ path: string; token: Token | null }>
        >();
        for (const { path: p, collectionId, token } of toRestore) {
          let list = byCollection.get(collectionId);
          if (!list) {
            list = [];
            byCollection.set(collectionId, list);
          }
          list.push({ path: p, token });
        }
        for (const [collectionId, items] of byCollection) {
          await fastify.tokenStore.restoreSnapshot(collectionId, items);
        }

        // Snapshot after state
        const afterSnapshot: Record<string, SnapshotEntry> = {};
        for (const collectionId of allCollections) {
          const pathsInSet = toRestore
            .filter((r) => r.collectionId === collectionId)
            .map((r) => r.path);
          const snap = await snapshotPaths(
            fastify.tokenStore,
            collectionId,
            pathsInSet,
          );
          Object.assign(afterSnapshot, snap);
        }

        // Record in operation log
        const isSingle = toRestore.length === 1;
        const description = isSingle
          ? `Restore ${toRestore[0].path} from commit ${hash.slice(0, 7)}`
          : `Restore ${toRestore.length} tokens from commit ${hash.slice(0, 7)}`;
        const opEntry = await fastify.operationLog.record({
          type: "version-restore",
          description,
          resourceId: allCollections.join(", "),
          affectedPaths: allPaths,
          beforeSnapshot,
          afterSnapshot,
        });

        return {
          ok: true,
          restored: toRestore.length,
          operationId: opEntry.id,
          paths: allPaths,
        };
      });
    } catch (err) {
      return handleRouteError(reply, err, "Failed to restore tokens");
    }
  });

  // POST /api/sync/remote — set remote URL
  fastify.post<{ Body: { url: string } }>(
    "/sync/remote",
    async (request, reply) => {
      const { url } = request.body || {};
      if (!url || typeof url !== "string") {
        return reply.status(400).send({ error: "Remote URL is required" });
      }

      const trimmed = url.trim();
      // Accept HTTPS, SSH (git@host:path), git://, and file:// remote URLs
      const validPatterns = [
        /^https?:\/\/.+/, // https://github.com/user/repo.git
        /^git@[\w.-]+:.+/, // git@github.com:user/repo.git
        /^ssh:\/\/.+/, // ssh://git@github.com/user/repo.git
        /^git:\/\/.+/, // git://github.com/repo.git
        /^file:\/\/.+/, // file:///path/to/repo
      ];
      if (!validPatterns.some((p) => p.test(trimmed))) {
        return reply.status(400).send({
          error:
            "Invalid remote URL format. Expected an HTTPS, SSH, or git:// URL (e.g. https://github.com/user/repo.git or git@github.com:user/repo.git).",
        });
      }

      try {
        await fastify.gitSync.setRemote(trimmed);
        return { ok: true, remote: trimmed };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to set remote");
      }
    },
  );

  // GET /api/sync/branches — list branches
  fastify.get("/sync/branches", async (_request, reply) => {
    try {
      const branches = await fastify.gitSync.getBranches();
      const current = await fastify.gitSync.getCurrentBranch();
      return { branches, current };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to list branches");
    }
  });

  // POST /api/sync/checkout — checkout branch
  fastify.post<{ Body: { branch: string; create?: boolean } }>(
    "/sync/checkout",
    async (request, reply) => {
      const { branch, create } = request.body || {};
      if (!branch) {
        return reply.status(400).send({ error: "Branch name is required" });
      }

      try {
        if (create) {
          await fastify.gitSync.createBranch(branch);
        } else {
          await fastify.gitSync.checkout(branch);
        }
        return { ok: true, branch, created: !!create };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to checkout branch");
      }
    },
  );

  // GET /api/sync/push/preview — token-level diff of what push would send + commit list
  fastify.get("/sync/push/preview", async (_request, reply) => {
    try {
      const isRepo = await fastify.gitSync.isRepo();
      if (!isRepo)
        return reply.status(400).send({ error: "Not a git repository" });

      const { commits, fileDiffs } = await fastify.gitSync.getPushPreview();
      const changes = fileDiffs.flatMap((diff) => diff.changes);
      return { commits, changes, fileCount: fileDiffs.length };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to compute push preview");
    }
  });

  // GET /api/sync/pull/preview — token-level diff of what pull would bring in + commit list
  fastify.get("/sync/pull/preview", async (_request, reply) => {
    try {
      const isRepo = await fastify.gitSync.isRepo();
      if (!isRepo)
        return reply.status(400).send({ error: "Not a git repository" });

      const { commits, fileDiffs } = await fastify.gitSync.getPullPreview();
      const changes = fileDiffs.flatMap((diff) => diff.changes);
      return { commits, changes, fileCount: fileDiffs.length };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to compute pull preview");
    }
  });

  // GET /api/sync/diff/tokens — token-level diff of uncommitted working tree changes vs HEAD
  fastify.get("/sync/diff/tokens", async (_request, reply) => {
    try {
      const isRepo = await fastify.gitSync.isRepo();
      if (!isRepo)
        return reply.status(400).send({ error: "Not a git repository" });

      const fileDiffs = await fastify.gitSync.getWorkingTreeTokenDiff();
      const changes = fileDiffs.flatMap((diff) => diff.changes);
      return { changes, fileCount: fileDiffs.length };
    } catch (err) {
      return handleRouteError(reply, err, "Failed to compute token diff");
    }
  });

  // GET /api/sync/diff/tokens/since?timestamp=<unix-ms>
  // Returns token paths from files modified after the given timestamp. No git required.
  fastify.get<{ Querystring: { timestamp?: string } }>(
    "/sync/diff/tokens/since",
    async (request, reply) => {
      try {
        const ts = Number(request.query.timestamp);
        if (!Number.isFinite(ts) || ts < 0) {
          return reply.status(400).send({
            error:
              "timestamp query param must be a non-negative number (Unix ms)",
          });
        }
        const changes: TokenChange[] = [];
        let fileCount = 0;
        const collectionIds = await fastify.collectionService.listCollectionIds();
        for (const name of collectionIds) {
          const collection = await fastify.tokenStore.getCollection(name);
          if (!collection?.filePath) continue;
          let mtime: number;
          try {
            const stat = await fs.stat(collection.filePath);
            mtime = stat.mtimeMs;
          } catch {
            continue;
          }
          if (mtime > ts) {
            fileCount++;
            for (const [path, token] of flattenTokenGroup(collection.tokens)) {
              changes.push({
                path,
                collectionId: name,
                type: token.$type || "unknown",
                status: "modified",
                after: token.$value,
              });
            }
          }
        }
        return { changes, fileCount };
      } catch (err) {
        return handleRouteError(
          reply,
          err,
          "Failed to compute token diff by timestamp",
        );
      }
    },
  );

  // GET /api/sync/diff — compute two-way diff between local HEAD and remote
  fastify.get("/sync/diff", async (_request, reply) => {
    try {
      const isRepo = await fastify.gitSync.isRepo();
      if (!isRepo)
        return reply.status(400).send({ error: "Not a git repository" });
      const diff = await fastify.gitSync.computeUnifiedDiff();
      return diff;
    } catch (err) {
      return handleRouteError(reply, err, "Failed to compute diff");
    }
  });

  // POST /api/sync/apply-diff — apply direction choices from unified diff
  fastify.post<{ Body: { choices: Record<string, "push" | "pull" | "skip"> } }>(
    "/sync/apply-diff",
    async (request, reply) => {
      try {
        const { choices } = request.body ?? {};
        if (!choices)
          return reply.status(400).send({ error: "choices is required" });
        const result = await fastify.gitSync.applyDiffChoices(choices, {
          tokenStore: fastify.tokenStore,
          collectionsStore: fastify.collectionsStore,
          reloadCollectionsWorkspace: () =>
            fastify.collectionService.reloadTokenStorageFromState(),
          generatorService: fastify.generatorService,
          resolverStore: fastify.resolverStore,
        });
        const hasFailures =
          result.pullFailedFiles.length > 0 ||
          result.pullCommitFailed ||
          result.pushCommitFailed ||
          result.pushFailed;
        return { ok: true, applied: !hasFailures, ...result };
      } catch (err) {
        return handleRouteError(reply, err, "Failed to apply diff");
      }
    },
  );
};
