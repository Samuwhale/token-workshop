import Fastify from "fastify";
import cors from "@fastify/cors";
import { watch } from "chokidar";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const _require = createRequire(import.meta.url);
const _pkgPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "package.json",
);
const { version: SERVER_VERSION } = _require(_pkgPath) as { version: string };
import { getHttpStatusCode, getErrorMessage } from "./errors.js";
import { tokenRoutes } from "./routes/tokens.js";
import { setRoutes } from "./routes/sets.js";
import { collectionRoutes } from "./routes/themes.js";
import { syncRoutes } from "./routes/sync.js";
import { exportRoutes } from "./routes/export.js";
import { healthRoutes } from "./routes/health.js";
import { sseRoutes } from "./routes/sse.js";
import { lintRoutes } from "./routes/lint.js";
import { docsRoutes } from "./routes/docs.js";
import { TokenStore } from "./services/token-store.js";
import { GitSync } from "./services/git-sync.js";
import { RecipeService } from "./services/recipe-service.js";
import { OperationLog } from "./services/operation-log.js";
import { recipeRoutes } from "./routes/recipes.js";
import { operationRoutes } from "./routes/operations.js";
import { resolverRoutes } from "./routes/resolvers.js";
import { ResolverStore } from "./services/resolver-store.js";
import { ManualSnapshotStore } from "./services/manual-snapshot.js";
import { snapshotRoutes } from "./routes/snapshots.js";
import { PromiseChainLock } from "./utils/promise-chain-lock.js";
import { RateLimiter } from "./services/rate-limiter.js";
import {
  createCollectionsStore,
  type CollectionsStore,
} from "./routes/themes.js";
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
    // 'null' origin is sent by the Figma plugin iframe (sandboxed iframe with no inherited origin)
    origin: [
      "https://www.figma.com",
      "https://figma.com",
      /^https:\/\/.*\.figma\.com$/,
      "null",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
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
      reply
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

  const tokenStore = new TokenStore(config.tokenDir);
  await tokenStore.initialize();

  const gitSync = new GitSync(config.tokenDir);

  const recipeService = new RecipeService(config.tokenDir);
  await recipeService.initialize();

  const operationLog = new OperationLog(config.tokenDir);

  const resolverStore = new ResolverStore(config.tokenDir);
  await resolverStore.initialize();

  // Reuse the lock that lives inside TokenStore — watcher callbacks and route handlers
  // all serialize through the same chain, preventing watcher loadSet() from overwriting
  // in-flight route-handler mutations.
  const tokenLock = tokenStore.lock;

  const collectionsStore = createCollectionsStore(config.tokenDir);

  // Replay any snapshot restore that was interrupted by a previous crash
  await manualSnapshots.recoverPendingRestore(
    tokenStore,
    collectionsStore,
    resolverStore,
    recipeService,
  );

  // Event bus for SSE with sequence IDs and replay support
  const eventBus = new EventBus();
  tokenStore.onChange((event) => eventBus.push(event));

  const emitWorkspaceFileEvent = (
    type: "workspace-file-changed" | "workspace-file-removed",
    resourceType: "collections" | "recipes" | "resolver",
    setName: string,
  ) => {
    eventBus.push({ type, resourceType, setName });
  };

  const recipesFilePath = path.join(config.tokenDir, "$recipes.json");
  const workspaceWatcher = watch(
    [collectionsStore.filePath, recipesFilePath],
    {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200 },
    },
  );

  const reloadCollectionsFromDisk = async () => {
    try {
      const result = await collectionsStore.reloadFromDisk();
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
        setName: "$collections",
        message,
      });
    }
  };

  const reloadRecipesFromDisk = async () => {
    try {
      const result = await recipeService.reloadFromDisk();
      if (result === "changed") {
        emitWorkspaceFileEvent(
          "workspace-file-changed",
          "recipes",
          "$recipes",
        );
      } else if (result === "removed") {
        emitWorkspaceFileEvent(
          "workspace-file-removed",
          "recipes",
          "$recipes",
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        "[RecipeService] Failed to reload recipes from disk:",
        err,
      );
      tokenStore.emitEvent({
        type: "file-load-error",
        setName: "$recipes",
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
    if (filePath === recipesFilePath) {
      if (recipeService.consumeWriteGuard(filePath)) return;
      void tokenLock.withLock(() => reloadRecipesFromDisk());
    }
  });

  workspaceWatcher.on("change", (filePath) => {
    if (filePath === collectionsStore.filePath) {
      if (collectionsStore.consumeWriteGuard(filePath)) return;
      void reloadCollectionsFromDisk();
      return;
    }
    if (filePath === recipesFilePath) {
      if (recipeService.consumeWriteGuard(filePath)) return;
      void tokenLock.withLock(() => reloadRecipesFromDisk());
    }
  });

  workspaceWatcher.on("unlink", (filePath) => {
    if (filePath === collectionsStore.filePath) {
      if (collectionsStore.consumeWriteGuard(filePath)) return;
      void reloadCollectionsFromDisk();
      return;
    }
    if (filePath === recipesFilePath) {
      if (recipeService.consumeWriteGuard(filePath)) return;
      void tokenLock.withLock(() => reloadRecipesFromDisk());
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
  fastify.decorate("recipeService", recipeService);
  fastify.decorate("operationLog", operationLog);
  fastify.decorate("resolverStore", resolverStore);
  fastify.decorate("manualSnapshots", manualSnapshots);
  fastify.decorate("eventBus", eventBus);

  // Forward resolver load errors to the SSE event stream
  resolverStore.onLoadError((name, message) => {
    tokenStore.emitEvent({
      type: "file-load-error",
      setName: `resolver:${name}`,
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

  // Auto-run recipes when a source token is updated.
  // Wrapped in tokenLock.withLock() so recipe writes are serialized against
  // route-handler mutations — without it, concurrent route writes and recipe
  // writes race on tokenStore state and operation-log snapshots.
  // Safe to call withLock() from inside a synchronous emit that itself fires
  // inside an active lock: the promise-chain mutex simply queues this run after
  // the current holder finishes (no re-entrancy / deadlock risk).
  tokenStore.onChange((event) => {
    if (event.type === "token-updated" && event.tokenPath) {
      const tokenPath = event.tokenPath;
      tokenLock
        .withLock(() =>
          recipeService.runForSourceToken(tokenPath, tokenStore),
        )
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          console.warn("[Recipe] Auto-run failed:", err);
          tokenStore.emitEvent({
            type: "recipe-error",
            setName: "",
            message,
          });
          // Record the failure persistently so clients connecting later can see it
          operationLog
            .record({
              type: "recipe-auto-run-error",
              description: `Recipe auto-run failed for "${tokenPath}": ${message}`,
              setName: "",
              affectedPaths: [tokenPath],
              beforeSnapshot: {},
              afterSnapshot: {},
            })
            .catch((logErr) => {
              console.error(
                "[OperationLog] Failed to record recipe error:",
                logErr,
              );
            });
        });
    }
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
  await fastify.register(setRoutes, { prefix: "/api" });
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
  await fastify.register(recipeRoutes, { prefix: "/api" });
  await fastify.register(operationRoutes, { prefix: "/api" });
  await fastify.register(resolverRoutes, { prefix: "/api" });
  await fastify.register(snapshotRoutes, { prefix: "/api" });
  await fastify.register(docsRoutes);

  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(
      `TokenManager server running at http://${config.host}:${config.port}`,
    );
    console.log(`Token directory: ${config.tokenDir}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  return fastify;
}

// Type augmentation
declare module "fastify" {
  interface FastifyInstance {
    tokenStore: TokenStore;
    tokenLock: PromiseChainLock;
    resolverLock: PromiseChainLock;
    gitSync: GitSync;
    recipeService: RecipeService;
    operationLog: OperationLog;
    resolverStore: ResolverStore;
    manualSnapshots: ManualSnapshotStore;
    collectionsStore: CollectionsStore;
    eventBus: EventBus;
  }
}
