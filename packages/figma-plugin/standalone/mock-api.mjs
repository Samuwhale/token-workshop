import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const snapshotFilePath = path.join(__dirname, 'demo-snapshot.json');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadSnapshot() {
  if (!fs.existsSync(snapshotFilePath)) {
    throw new Error(
      `Missing standalone preview snapshot: ${snapshotFilePath}. Run node scripts/capture-preview-snapshot.mjs first.`,
    );
  }

  return JSON.parse(fs.readFileSync(snapshotFilePath, 'utf8'));
}

function createHelpHtml(snapshot) {
  const collections = Array.isArray(snapshot.collectionsResponse?.collections)
    ? snapshot.collectionsResponse.collections
    : [];
  const issueSummary = snapshot.validationResponse?.summary ?? {};

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TokenManager Preview Snapshot</title>
  <style>
    :root {
      --bg: #f3efe7;
      --surface: rgba(255, 252, 246, 0.92);
      --border: #d8d1c3;
      --text: #18212f;
      --muted: #5f6b7a;
      --accent: #0f766e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(15, 118, 110, 0.14), transparent 25%),
        linear-gradient(180deg, #faf7f1 0%, var(--bg) 100%);
    }
    main {
      max-width: 960px;
      margin: 0 auto;
      padding: 40px 24px 64px;
    }
    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 28px;
      box-shadow: 0 18px 50px rgba(24, 33, 47, 0.08);
      backdrop-filter: blur(10px);
    }
    .panel + .panel { margin-top: 16px; }
    h1, h2 {
      margin: 0 0 12px;
      letter-spacing: -0.03em;
    }
    h1 { font-size: clamp(34px, 6vw, 50px); }
    h2 { font-size: 22px; }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
      max-width: 68ch;
    }
    .eyebrow {
      display: inline-block;
      margin-bottom: 12px;
      color: var(--accent);
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .grid {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      margin-top: 16px;
    }
    .metric {
      padding: 18px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.66);
      border: 1px solid var(--border);
    }
    .metric strong {
      display: block;
      font-size: 28px;
      letter-spacing: -0.03em;
      margin-bottom: 6px;
    }
    code {
      font-family: "SF Mono", "Menlo", monospace;
      background: rgba(24, 33, 47, 0.06);
      border-radius: 8px;
      padding: 2px 6px;
    }
    ul {
      margin: 14px 0 0;
      padding-left: 18px;
      color: var(--muted);
    }
    li + li { margin-top: 6px; }
  </style>
</head>
<body>
  <main>
    <section class="panel">
      <div class="eyebrow">Standalone Preview Snapshot</div>
      <h1>Browser demo replaying captured server data.</h1>
      <p>This preview is seeded from a checked-in snapshot captured from <code>${snapshot.sourceServerUrl}</code> on <code>${snapshot.capturedAt}</code>. The Figma bridge is still mocked, but the token library state comes from the live TokenManager API.</p>
      <div class="grid">
        <div class="metric">
          <strong>${collections.length}</strong>
          <span>collections captured</span>
        </div>
        <div class="metric">
          <strong>${issueSummary.total ?? (snapshot.validationResponse?.issues?.length ?? 0)}</strong>
          <span>review items captured</span>
        </div>
      </div>
    </section>
    <section class="panel">
      <h2>How it works</h2>
      <p>Open the harness with no query params and the plugin UI auto-connects to this embedded snapshot. Add <code>?serverUrl=http://localhost:9400</code> when you want the same UI to hit a live local server instead.</p>
      <ul>
        <li>Collections, tokens, review results, history, sync state, and resolver metadata are replayed from the snapshot.</li>
        <li>Selection, variable reads, and style reads still come from the standalone Figma mock bridge.</li>
      </ul>
    </section>
  </main>
</body>
</html>`;
}

function sendJson(res, statusCode, payload, method) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  res.end(body);
}

function sendHtml(res, statusCode, html, method) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  res.end(html);
}

function sendMethodNotAllowed(res, allowed, method) {
  res.writeHead(405, {
    Allow: allowed.join(', '),
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}

export async function handleMockApiRequest(req, res, url) {
  const snapshot = loadSnapshot();
  const method = req.method ?? 'GET';
  const { pathname } = url;

  if (pathname === '/help') {
    if (method !== 'GET' && method !== 'HEAD') {
      sendMethodNotAllowed(res, ['GET', 'HEAD'], method);
      return true;
    }
    sendHtml(res, 200, createHelpHtml(snapshot), method);
    return true;
  }

  if (!pathname.startsWith('/api/')) {
    return false;
  }

  if (pathname === '/api/health') {
    if (method !== 'GET' && method !== 'HEAD') {
      sendMethodNotAllowed(res, ['GET', 'HEAD'], method);
      return true;
    }
    sendJson(res, 200, clone(snapshot.health), method);
    return true;
  }

  if (pathname === '/api/collections') {
    if (method !== 'GET' && method !== 'HEAD') {
      sendMethodNotAllowed(res, ['GET', 'HEAD'], method);
      return true;
    }
    sendJson(res, 200, clone(snapshot.collectionsResponse), method);
    return true;
  }

  if (pathname.startsWith('/api/tokens/')) {
    if (pathname === '/api/tokens/validate') {
      if (method !== 'POST' && method !== 'HEAD') {
        sendMethodNotAllowed(res, ['POST', 'HEAD'], method);
        return true;
      }
      sendJson(res, 200, clone(snapshot.validationResponse), method);
      return true;
    }

    if (pathname === '/api/tokens/lint') {
      if (method !== 'POST' && method !== 'HEAD') {
        sendMethodNotAllowed(res, ['POST', 'HEAD'], method);
        return true;
      }
      sendJson(res, 200, clone(snapshot.lintResponse), method);
      return true;
    }

    if (pathname === '/api/tokens/deprecated-usage') {
      if (method !== 'GET' && method !== 'HEAD') {
        sendMethodNotAllowed(res, ['GET', 'HEAD'], method);
        return true;
      }
      sendJson(res, 200, clone(snapshot.deprecatedUsageResponse), method);
      return true;
    }

    if (pathname === '/api/tokens/deprecated-usage/replace') {
      if (method !== 'POST' && method !== 'HEAD') {
        sendMethodNotAllowed(res, ['POST', 'HEAD'], method);
        return true;
      }
      sendJson(res, 200, { ok: true, updated: 0, operationId: null }, method);
      return true;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      sendMethodNotAllowed(res, ['GET', 'HEAD'], method);
      return true;
    }

    const collectionId = decodeURIComponent(pathname.slice('/api/tokens/'.length));
    const tokens = snapshot.tokensByCollectionId?.[collectionId];
    if (!tokens) {
      sendJson(res, 404, { error: `Unknown collection "${collectionId}"` }, method);
      return true;
    }
    sendJson(res, 200, { tokens: clone(tokens) }, method);
    return true;
  }

  if (pathname === '/api/operations') {
    if (method !== 'GET' && method !== 'HEAD') {
      sendMethodNotAllowed(res, ['GET', 'HEAD'], method);
      return true;
    }
    sendJson(res, 200, clone(snapshot.operationsResponse), method);
    return true;
  }

  if (pathname === '/api/operations/path-renames') {
    if (method !== 'GET' && method !== 'HEAD') {
      sendMethodNotAllowed(res, ['GET', 'HEAD'], method);
      return true;
    }
    sendJson(res, 200, clone(snapshot.pathRenamesResponse), method);
    return true;
  }

  const operationDiffMatch = pathname.match(/^\/api\/operations\/([^/]+)\/diff$/u);
  if (operationDiffMatch) {
    if (method !== 'GET' && method !== 'HEAD') {
      sendMethodNotAllowed(res, ['GET', 'HEAD'], method);
      return true;
    }
    sendJson(res, 200, { diffs: [], metadataChanges: [] }, method);
    return true;
  }

  const operationRollbackMatch = pathname.match(/^\/api\/operations\/([^/]+)\/rollback$/u);
  if (operationRollbackMatch) {
    if (method !== 'POST' && method !== 'HEAD') {
      sendMethodNotAllowed(res, ['POST', 'HEAD'], method);
      return true;
    }
    sendJson(res, 200, { ok: true, restoredPaths: [], rollbackEntryId: null }, method);
    return true;
  }

  if (pathname === '/api/sync/status') {
    if (method !== 'GET' && method !== 'HEAD') {
      sendMethodNotAllowed(res, ['GET', 'HEAD'], method);
      return true;
    }
    sendJson(res, 200, clone(snapshot.syncStatus), method);
    return true;
  }

  if (pathname === '/api/sync/publish-routing') {
    if (method !== 'GET' && method !== 'HEAD') {
      sendMethodNotAllowed(res, ['GET', 'HEAD'], method);
      return true;
    }
    sendJson(res, 200, clone(snapshot.publishRouting), method);
    return true;
  }

  const publishRoutingMatch = pathname.match(/^\/api\/sync\/publish-routing\/([^/]+)$/u);
  if (publishRoutingMatch) {
    if (method !== 'PUT' && method !== 'HEAD') {
      sendMethodNotAllowed(res, ['PUT', 'HEAD'], method);
      return true;
    }
    const collectionId = decodeURIComponent(publishRoutingMatch[1]);
    const collectionName = snapshot.publishRouting?.collectionMap?.[collectionId];
    const modeName = snapshot.publishRouting?.modeMap?.[collectionId];
    sendJson(
      res,
      200,
      {
        ok: true,
        id: collectionId,
        ...(collectionName ? { collectionName } : {}),
        ...(modeName ? { modeName } : {}),
        changed: false,
      },
      method,
    );
    return true;
  }

  if (pathname === '/api/resolvers') {
    if (method !== 'GET' && method !== 'HEAD') {
      sendMethodNotAllowed(res, ['GET', 'HEAD'], method);
      return true;
    }
    sendJson(res, 200, clone(snapshot.resolvers), method);
    return true;
  }

  const resolverResolveMatch = pathname.match(/^\/api\/resolvers\/([^/]+)\/resolve$/u);
  if (resolverResolveMatch) {
    if (method !== 'POST' && method !== 'HEAD') {
      sendMethodNotAllowed(res, ['POST', 'HEAD'], method);
      return true;
    }
    sendJson(res, 200, { tokens: {}, diagnostics: [] }, method);
    return true;
  }

  sendJson(res, 404, { error: 'Mock API route not found' }, method);
  return true;
}
