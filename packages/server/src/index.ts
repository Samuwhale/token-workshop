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

export interface ServerConfig {
  tokenDir: string;
  port: number;
  host: string;
}

export async function startServer(config: ServerConfig) {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, {
    origin: ['https://www.figma.com', 'https://figma.com', /^https:\/\/.*\.figma\.com$/, 'null'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  // Initialize services
  const tokenStore = new TokenStore(config.tokenDir);
  await tokenStore.initialize();

  const gitSync = new GitSync(config.tokenDir);

  // Decorate fastify with services
  fastify.decorate('tokenStore', tokenStore);
  fastify.decorate('gitSync', gitSync);

  // Ensure the file watcher is closed on server shutdown
  fastify.addHook('onClose', async () => {
    await tokenStore.shutdown();
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
    gitSync: GitSync;
  }
}
