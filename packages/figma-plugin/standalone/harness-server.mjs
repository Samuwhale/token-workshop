import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleMockApiRequest } from './mock-api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, '..');
const distRoot = path.join(pluginRoot, 'dist');

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function resolvePathWithinBase(baseDir, requestedPath) {
  const relativePath = requestedPath.replace(/^\/+/, '');
  const candidate = path.resolve(baseDir, relativePath);
  const relativeCandidate = path.relative(baseDir, candidate);
  if (
    relativeCandidate === '' ||
    relativeCandidate === '.' ||
    relativeCandidate === '..' ||
    relativeCandidate.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeCandidate)
  ) {
    return null;
  }
  return candidate;
}

function resolveRequestPath(urlPathname) {
  if (urlPathname === '/' || urlPathname === '/harness') {
    return path.join(__dirname, 'harness.html');
  }

  if (urlPathname.startsWith('/dist/')) {
    return resolvePathWithinBase(distRoot, urlPathname.slice('/dist/'.length));
  }

  const standalonePath = resolvePathWithinBase(__dirname, urlPathname);
  if (standalonePath && fs.existsSync(standalonePath)) {
    return standalonePath;
  }

  return null;
}

function isReadableFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function createHarnessServer(host, port) {
  return http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }

    const url = new URL(req.url, `http://${host}:${port}`);
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }

    if (pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === '/help' || pathname.startsWith('/api/')) {
      const handled = await handleMockApiRequest(req, res, url);
      if (handled) {
        return;
      }
    }

    if (
      pathname === '/dist/ui.html' &&
      !url.searchParams.has('serverUrl') &&
      (req.method === 'GET' || req.method === 'HEAD')
    ) {
      const redirectUrl = new URL(req.url, `http://${host}:${port}`);
      redirectUrl.searchParams.set('serverUrl', `http://${host}:${port}`);
      res.writeHead(302, { Location: redirectUrl.toString() });
      res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end('Method not allowed');
      return;
    }

    const filePath = resolveRequestPath(pathname);
    if (!filePath || !isReadableFile(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end('Failed to read file');
    });
    stream.pipe(res);
  });
}

export function startHarnessServer({ host = '127.0.0.1', port = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const server = createHarnessServer(host, port);

    const onError = (error) => {
      reject(error);
    };

    server.on('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to resolve standalone harness address')));
        return;
      }

      resolve({
        server,
        host,
        port: address.port,
        origin: `http://${host}:${address.port}`,
      });
    });
  });
}
