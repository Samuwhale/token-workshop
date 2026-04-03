import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const _require = createRequire(import.meta.url);
const _pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const { version: SERVER_VERSION } = _require(_pkgPath) as { version: string };
import { tokenRoutes } from './routes/tokens.js';
import { setRoutes } from './routes/sets.js';
import { themeRoutes } from './routes/themes.js';
import { syncRoutes } from './routes/sync.js';
import { exportRoutes } from './routes/export.js';
import { healthRoutes } from './routes/health.js';
import { sseRoutes } from './routes/sse.js';
import { lintRoutes } from './routes/lint.js';
import { docsRoutes } from './routes/docs.js';
import { TokenStore } from './services/token-store.js';
import { GitSync } from './services/git-sync.js';
import { GeneratorService } from './services/generator-service.js';
import { OperationLog } from './services/operation-log.js';
import { generatorRoutes } from './routes/generators.js';
import { operationRoutes } from './routes/operations.js';
import { resolverRoutes } from './routes/resolvers.js';
import { ResolverStore } from './services/resolver-store.js';
import { ManualSnapshotStore } from './services/manual-snapshot.js';
import { snapshotRoutes } from './routes/snapshots.js';
import { TokenLock } from './services/token-lock.js';
import { createDimensionsStore, type DimensionsStore } from './routes/themes.js';
import { EventBus } from './services/event-bus.js';

export interface ServerConfig {
  tokenDir: string;
  port: number;
  host: string;
}

export async function startServer(config: ServerConfig) {
  const fastify = Fastify({ logger: true, bodyLimit: 5 * 1024 * 1024 /* 5 MB */ });

  await fastify.register(cors, {
    // 'null' origin is sent by the Figma plugin iframe (sandboxed iframe with no inherited origin)
    origin: ['https://www.figma.com', 'https://figma.com', /^https:\/\/.*\.figma\.com$/, 'null'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  // Initialize services
  const manualSnapshots = new ManualSnapshotStore(config.tokenDir);

  const tokenStore = new TokenStore(config.tokenDir);
  await tokenStore.initialize();

  // Replay any snapshot restore that was interrupted by a previous crash
  await manualSnapshots.recoverPendingRestore(tokenStore);

  const gitSync = new GitSync(config.tokenDir);

  const generatorService = new GeneratorService(config.tokenDir);
  await generatorService.initialize();

  const operationLog = new OperationLog(config.tokenDir);

  const resolverStore = new ResolverStore(config.tokenDir);
  await resolverStore.initialize();

  const tokenLock = new TokenLock();

  const dimensionsStore = createDimensionsStore(config.tokenDir);

  // Event bus for SSE with sequence IDs and replay support
  const eventBus = new EventBus();
  tokenStore.onChange((event) => eventBus.push(event));

  // Decorate fastify with services
  fastify.decorate('tokenStore', tokenStore);
  fastify.decorate('tokenLock', tokenLock);
  fastify.decorate('dimensionsStore', dimensionsStore);
  fastify.decorate('gitSync', gitSync);
  fastify.decorate('generatorService', generatorService);
  fastify.decorate('operationLog', operationLog);
  fastify.decorate('resolverStore', resolverStore);
  fastify.decorate('manualSnapshots', manualSnapshots);
  fastify.decorate('eventBus', eventBus);

  // Forward resolver load errors to the SSE event stream
  resolverStore.onLoadError((name, message) => {
    tokenStore.emitEvent({ type: 'file-load-error', setName: `resolver:${name}`, message });
  });

  // Auto-run generators when a source token is updated
  tokenStore.onChange((event) => {
    if (event.type === 'token-updated' && event.tokenPath) {
      const tokenPath = event.tokenPath;
      generatorService
        .runForSourceToken(tokenPath, tokenStore)
        .catch(err => {
          const message = err instanceof Error ? err.message : String(err);
          console.warn('[Generator] Auto-run failed:', err);
          tokenStore.emitEvent({ type: 'generator-error', setName: '', message });
          // Record the failure persistently so clients connecting later can see it
          operationLog.record({
            type: 'generator-auto-run-error',
            description: `Generator auto-run failed for "${tokenPath}": ${message}`,
            setName: '',
            affectedPaths: [tokenPath],
            beforeSnapshot: {},
            afterSnapshot: {},
          }).catch(logErr => {
            console.error('[OperationLog] Failed to record generator error:', logErr);
          });
        });
    }
  });

  // Ensure the file watchers are closed on server shutdown
  fastify.addHook('onClose', async () => {
    await tokenStore.shutdown();
    await resolverStore.shutdown();
  });

  // Register routes
  await fastify.register(healthRoutes, { prefix: '/api', version: SERVER_VERSION });
  await fastify.register(tokenRoutes, { prefix: '/api' });
  await fastify.register(setRoutes, { prefix: '/api' });
  await fastify.register(themeRoutes, { prefix: '/api', tokenDir: config.tokenDir });
  await fastify.register(syncRoutes, { prefix: '/api' });
  await fastify.register(exportRoutes, { prefix: '/api' });
  await fastify.register(sseRoutes, { prefix: '/api' });
  await fastify.register(lintRoutes, { prefix: '/api', tokenDir: config.tokenDir });
  await fastify.register(generatorRoutes, { prefix: '/api' });
  await fastify.register(operationRoutes, { prefix: '/api' });
  await fastify.register(resolverRoutes, { prefix: '/api' });
  await fastify.register(snapshotRoutes, { prefix: '/api' });
  await fastify.register(docsRoutes);

  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`TokenManager server running at http://${config.host}:${config.port}`);
    console.log(`Token directory: ${config.tokenDir}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  return fastify;
}

// Type augmentation
declare module 'fastify' {
  interface FastifyInstance {
    tokenStore: TokenStore;
    tokenLock: TokenLock;
    gitSync: GitSync;
    generatorService: GeneratorService;
    operationLog: OperationLog;
    resolverStore: ResolverStore;
    manualSnapshots: ManualSnapshotStore;
    dimensionsStore: DimensionsStore;
    eventBus: EventBus;
  }
}
