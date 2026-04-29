import Fastify from "fastify";
import cors from "@fastify/cors";
import { watch } from "chokidar";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { isAllowedCorsOrigin } from "./cors.js";

const _require = createRequire(import.meta.url);

function readServerVersion(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  for (const relativePath of ["../package.json", "../../package.json"]) {
    try {
      const pkg = _require(path.join(moduleDir, relativePath)) as { version?: unknown };
      if (typeof pkg.version === "string" && pkg.version.length > 0) {
        return pkg.version;
      }
    } catch {
      // Source runs from src/, compiled output runs from dist/src/.
    }
  }
  return "0.0.0";
}

const SERVER_VERSION = readServerVersion();
import { getHttpStatusCode, getErrorMessage } from "./errors.js";
import { tokenRoutes } from "./routes/tokens.js";
import { collectionStructureRoutes } from "./routes/collection-structure.js";
import { collectionRoutes } from "./routes/collections.js";
import { syncRoutes } from "./routes/sync.js";
import { exportRoutes } from "./routes/export.js";
import { healthRoutes } from "./routes/health.js";
import { sseRoutes } from "./routes/sse.js";
import { lintRoutes } from "./routes/lint.js";
import { docsRoutes } from "./routes/docs.js";
import { helpRoutes } from "./routes/help.js";
import { TokenStore } from "./services/token-store.js";
import { GitSync } from "./services/git-sync.js";
import { TokenGeneratorService } from "./services/token-generator-service.js";
import { OperationLog } from "./services/operation-log.js";
import { generatorRoutes } from "./routes/generators.js";
import { operationRoutes } from "./routes/operations.js";
import { resolverRoutes } from "./routes/resolvers.js";
import { ResolverStore } from "./services/resolver-store.js";
import { ManualSnapshotStore } from "./services/manual-snapshot.js";
import { snapshotRoutes } from "./routes/snapshots.js";
import { PromiseChainLock } from "./utils/promise-chain-lock.js";
import { RateLimiter } from "./services/rate-limiter.js";
import {
  createCollectionStore,
  type CollectionStore,
} from "./services/collection-store.js";
import { CollectionService } from "./services/collection-service.js";
import { LintConfigStore } from "./services/lint.js";
import { EventBus } from "./services/event-bus.js";

export interface ServerConfig {
  tokenDir: string;
  port: number;
  host: string;
}

export async function startServer(config: ServerConfig) {
  const fastify = Fastify({
    logger: true,
    bodyLimit: 5 * 1024 * 1024 /* 5 MB */,
  });

  await fastify.register(cors, {
    // Figma sends a literal 'null' origin from the sandboxed plugin iframe,
    // while the local standalone harness runs from localhost/loopback origins.
    origin(origin, callback) {
      callback(null, isAllowedCorsOrigin(origin));
    },
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
  });

  // Global error handler — catches unhandled rejections from any route handler
  // that lacks its own try-catch, ensuring a consistent JSON error envelope
  // instead of an empty 500 or an unhandled rejection crash.
  fastify.setErrorHandler((err, _request, reply) => {
    const statusCode = getHttpStatusCode(err) ?? 500;
    const msg = getErrorMessage(err);
    if (statusCode >= 500) {
      fastify.log.error(err);
    }
    reply.status(statusCode).send({ error: msg });
  });

  // Rate-limit mutation endpoints (POST/PUT/PATCH/DELETE) to prevent runaway UI
  // loops or external scripts from overwhelming the file system with rapid writes.
  // GET/HEAD/OPTIONS requests are exempt — reads are cheap and SSE streams must
  // stay open indefinitely. Uses a sliding-window counter per client IP.
  const rateLimiter = new RateLimiter({ max: 200, windowMs: 60_000 });
  fastify.addHook("onRequest", async (request, reply) => {
    const result = rateLimiter.check(request.method, request.ip);
    if (result) {
      return reply
        .header("Retry-After", String(result.retryAfterSec))
        .status(429)
        .send({
          statusCode: 429,
          error: "Too Many Requests",
          message: `Rate limit exceeded: max 200 write requests per minute. Retry after ${result.retryAfterSec}s.`,
        });
    }
  });

  // Initialize services
  const manualSnapshots = new ManualSnapshotStore(config.tokenDir);

  const collectionsStore = createCollectionStore(config.tokenDir);
  const initialCollectionState = await collectionsStore.loadState();

  const tokenStore = new TokenStore(config.tokenDir);
  await tokenStore.initialize(
    initialCollectionState.collections.map((collection) => collection.id),
  );

  const gitSync = new GitSync(config.tokenDir);

  const generatorService = new TokenGeneratorService(config.tokenDir);
  await generatorService.initialize();

  const operationLog = new OperationLog(config.tokenDir);

  const resolverStore = new ResolverStore(config.tokenDir);
  await resolverStore.initialize();

  // Reuse the lock that lives inside TokenStore — watcher callbacks and route handlers
  // all serialize through the same chain, preventing watcher loadCollection() from overwriting
  // in-flight route-handler mutations.
  const tokenLock = tokenStore.lock;

  const lintConfigStore = new LintConfigStore(config.tokenDir);
  const collectionService = new CollectionService(
    tokenStore,
    collectionsStore,
    resolverStore,
    resolverStore.lock,
    lintConfigStore,
    generatorService,
  );

  // Replay any snapshot restore that was interrupted by a previous crash
  await manualSnapshots.recoverPendingRestore(
    collectionService,
    resolverStore,
    generatorService,
    lintConfigStore,
  );

  // Event bus for SSE with sequence IDs and replay support
  const eventBus = new EventBus();
  tokenStore.onChange((event) => eventBus.push(event));

  const emitWorkspaceFileEvent = (
    type: "workspace-file-changed" | "workspace-file-removed",
    resourceType: "collections" | "generators" | "resolver",
    collectionId: string,
  ) => {
    eventBus.push({ type, resourceType, collectionId });
  };

  const generatorsFilePath = path.join(config.tokenDir, "$generators.json");
  const workspaceWatcher = watch(
    [collectionsStore.filePath, generatorsFilePath],
    {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200 },
    },
  );

  const reloadCollectionsFromDisk = async () => {
    try {
      const result = await collectionsStore.reloadFromDisk();
      if (result === "changed" || result === "removed") {
        await tokenLock.withLock(() => collectionService.reloadTokenStorageFromState());
      }
      if (result === "changed") {
        emitWorkspaceFileEvent("workspace-file-changed", "collections", "$collections");
      } else if (result === "removed") {
        emitWorkspaceFileEvent("workspace-file-removed", "collections", "$collections");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[Collections] Failed to reload collections from disk:", err);
      tokenStore.emitEvent({
        type: "file-load-error",
        collectionId: "$collections",
        message,
      });
    }
  };

  const reloadGeneratorsFromDisk = async (removed = false) => {
    try {
      await generatorService.reloadFromDisk();
      emitWorkspaceFileEvent(
        removed ? "workspace-file-removed" : "workspace-file-changed",
        "generators",
        "$generators",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[TokenGeneratorService] Failed to reload generators from disk:", err);
      tokenStore.emitEvent({
        type: "file-load-error",
        collectionId: "$generators",
        message,
      });
    }
  };

  workspaceWatcher.on("add", (filePath) => {
    if (filePath === collectionsStore.filePath) {
      if (collectionsStore.consumeWriteGuard(filePath)) return;
      void reloadCollectionsFromDisk();
      return;
    }
    if (filePath === generatorsFilePath) {
      void tokenLock.withLock(() => reloadGeneratorsFromDisk());
    }
  });

  workspaceWatcher.on("change", (filePath) => {
    if (filePath === collectionsStore.filePath) {
      if (collectionsStore.consumeWriteGuard(filePath)) return;
      void reloadCollectionsFromDisk();
      return;
    }
    if (filePath === generatorsFilePath) {
      void tokenLock.withLock(() => reloadGeneratorsFromDisk());
    }
  });

  workspaceWatcher.on("unlink", (filePath) => {
    if (filePath === collectionsStore.filePath) {
      if (collectionsStore.consumeWriteGuard(filePath)) return;
      void reloadCollectionsFromDisk();
      return;
    }
    if (filePath === generatorsFilePath) {
      void tokenLock.withLock(() => reloadGeneratorsFromDisk(true));
    }
  });

  workspaceWatcher.on("error", (err) => {
    fastify.log.warn({ err }, "Workspace watcher error");
  });

  // Decorate fastify with services
  fastify.decorate("tokenStore", tokenStore);
  fastify.decorate("tokenLock", tokenLock);
  fastify.decorate("resolverLock", resolverStore.lock);
  fastify.decorate("collectionsStore", collectionsStore);
  fastify.decorate("gitSync", gitSync);
  fastify.decorate("generatorService", generatorService);
  fastify.decorate("operationLog", operationLog);
  fastify.decorate("resolverStore", resolverStore);
  fastify.decorate("manualSnapshots", manualSnapshots);
  fastify.decorate("lintConfigStore", lintConfigStore);
  fastify.decorate("collectionService", collectionService);
  fastify.decorate("eventBus", eventBus);

  // Forward resolver load errors to the SSE event stream
  resolverStore.onLoadError((name, message) => {
    tokenStore.emitEvent({
      type: "file-load-error",
      collectionId: `resolver:${name}`,
      message,
    });
  });
  resolverStore.onChange(({ type, name }) => {
    emitWorkspaceFileEvent(
      type === "removed" ? "workspace-file-removed" : "workspace-file-changed",
      "resolver",
      `resolver:${name}`,
    );
  });

  // Ensure the file watchers are closed on server shutdown
  fastify.addHook("onClose", async () => {
    await tokenStore.shutdown();
    await resolverStore.shutdown();
    await workspaceWatcher.close();
  });

  // Register routes
  await fastify.register(healthRoutes, {
    prefix: "/api",
    version: SERVER_VERSION,
  });
  await fastify.register(tokenRoutes, { prefix: "/api" });
  await fastify.register(collectionStructureRoutes, { prefix: "/api" });
  await fastify.register(collectionRoutes, {
    prefix: "/api",
    tokenDir: config.tokenDir,
  });
  await fastify.register(syncRoutes, { prefix: "/api" });
  await fastify.register(exportRoutes, { prefix: "/api" });
  await fastify.register(sseRoutes, { prefix: "/api" });
  await fastify.register(lintRoutes, {
    prefix: "/api",
    tokenDir: config.tokenDir,
  });
  await fastify.register(generatorRoutes, { prefix: "/api" });
  await fastify.register(operationRoutes, { prefix: "/api" });
  await fastify.register(resolverRoutes, { prefix: "/api" });
  await fastify.register(snapshotRoutes, { prefix: "/api" });
  await fastify.register(docsRoutes);
  await fastify.register(helpRoutes);

  await fastify.listen({ port: config.port, host: config.host });
  console.log(
    `TokenManager server running at http://${config.host}:${config.port}`,
  );
  console.log(`Token directory: ${config.tokenDir}`);

  return fastify;
}

// Type augmentation
declare module "fastify" {
  interface FastifyInstance {
    tokenStore: TokenStore;
    tokenLock: PromiseChainLock;
    resolverLock: PromiseChainLock;
    gitSync: GitSync;
    generatorService: TokenGeneratorService;
    operationLog: OperationLog;
    resolverStore: ResolverStore;
    manualSnapshots: ManualSnapshotStore;
    collectionsStore: CollectionStore;
    lintConfigStore: LintConfigStore;
    collectionService: CollectionService;
    eventBus: EventBus;
  }
}
