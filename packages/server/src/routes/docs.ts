import type { FastifyInstance } from 'fastify';

function hexToLuminance(hex: string): number | null {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const lin = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(hex1: string, hex2: string): number | null {
  const l1 = hexToLuminance(hex1);
  const l2 = hexToLuminance(hex2);
  if (l1 === null || l2 === null) return null;
  const [li, da] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (li + 0.05) / (da + 0.05);
}

interface FlatToken {
  path: string;
  $type: string;
  $value: unknown;
  $description?: string;
}


function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Strip characters that could inject CSS when used inside a style= attribute value. */
function escapeCssValue(s: string): string {
  return s.replace(/[{}<>;"\n\r]/g, '');
}

function renderColorTokens(tokens: FlatToken[]): string {
  return `
    <div class="token-grid color-grid">
      ${tokens.map(t => {
        const hex = typeof t.$value === 'string' && t.$value.startsWith('#') ? t.$value.slice(0, 7) : '';
        const cr = hex ? contrastRatio(hex, '#ffffff') : null;
        const crDark = hex ? contrastRatio(hex, '#000000') : null;
        const textColor = cr !== null && crDark !== null && cr > crDark ? '#ffffff' : '#000000';
        return `
          <div class="swatch-card">
            <div class="swatch" style="background:${escapeCssValue(String(t.$value))};color:${textColor}">
              <span class="swatch-label">${escapeHtml(t.path.split('.').pop() ?? t.path)}</span>
            </div>
            <div class="swatch-info">
              <div class="token-path">${escapeHtml(t.path)}</div>
              <div class="token-value">${escapeHtml(String(t.$value))}</div>
              ${cr !== null ? `<div class="contrast-info">on white: ${cr.toFixed(1)}:1 ${cr >= 4.5 ? '✓AA' : ''} ${cr >= 7 ? '✓AAA' : ''}</div>` : ''}
              ${t.$description ? `<div class="token-desc">${escapeHtml(t.$description)}</div>` : ''}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function renderTypographyTokens(tokens: FlatToken[]): string {
  return `
    <div class="token-list">
      ${tokens.map(t => {
        const val = typeof t.$value === 'object' && t.$value !== null
          ? (t.$value as Record<string, unknown>)
          : null;
        const style = val
          ? `font-family:${val['fontFamily'] ?? 'inherit'};font-size:${val['fontSize'] ?? 16}px;font-weight:${val['fontWeight'] ?? 400};line-height:${val['lineHeight'] ?? 1.5};letter-spacing:${val['letterSpacing'] ?? 0}px`
          : '';
        return `
          <div class="typo-row">
            <div class="typo-specimen" style="${escapeHtml(style)}">The quick brown fox</div>
            <div class="token-meta">
              <div class="token-path">${escapeHtml(t.path)}</div>
              <div class="token-value">${escapeHtml(JSON.stringify(t.$value))}</div>
              ${t.$description ? `<div class="token-desc">${escapeHtml(t.$description)}</div>` : ''}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function renderSpacingTokens(tokens: FlatToken[]): string {
  return `
    <div class="spacing-list">
      ${tokens.map(t => {
        const px = parseFloat(String(t.$value));
        const safeSize = isNaN(px) ? 8 : Math.max(2, Math.min(px, 200));
        return `
          <div class="spacing-row">
            <div class="spacing-box" style="width:${safeSize}px;height:20px;background:var(--accent)"></div>
            <div class="token-meta">
              <span class="token-path">${escapeHtml(t.path)}</span>
              <span class="token-value">${escapeHtml(String(t.$value))}</span>
              ${t.$description ? `<span class="token-desc">${escapeHtml(t.$description)}</span>` : ''}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function renderGenericTokens(tokens: FlatToken[]): string {
  return `
    <table class="token-table">
      <thead><tr><th>Path</th><th>Value</th><th>Description</th></tr></thead>
      <tbody>
        ${tokens.map(t => `
          <tr>
            <td class="token-path">${escapeHtml(t.path)}</td>
            <td class="token-value">${escapeHtml(String(t.$value))}</td>
            <td class="token-desc">${escapeHtml(t.$description ?? '')}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

const CSS = `
  :root { --bg:#f9fafb; --surface:#fff; --border:#e5e7eb; --text:#111827; --text-muted:#6b7280; --accent:#6366f1; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:system-ui,sans-serif; background:var(--bg); color:var(--text); padding:2rem; line-height:1.5; }
  a { color:var(--accent); text-decoration:none; } a:hover { text-decoration:underline; }
  h1 { font-size:1.75rem; font-weight:700; margin-bottom:0.5rem; }
  h2 { font-size:1.25rem; font-weight:600; margin:2rem 0 1rem; padding-bottom:0.5rem; border-bottom:1px solid var(--border); }
  h3 { font-size:1rem; font-weight:600; margin:1.5rem 0 0.75rem; text-transform:capitalize; color:var(--text-muted); }
  .breadcrumb { font-size:0.85rem; color:var(--text-muted); margin-bottom:1.5rem; }
  .set-list { display:flex; flex-direction:column; gap:0.5rem; }
  .set-card { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:1rem 1.25rem; display:flex; align-items:center; justify-content:space-between; }
  .set-card .badge { background:var(--bg); border:1px solid var(--border); border-radius:4px; padding:0.2rem 0.5rem; font-size:0.75rem; color:var(--text-muted); }
  .color-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:1rem; }
  .swatch-card { border-radius:8px; overflow:hidden; border:1px solid var(--border); background:var(--surface); }
  .swatch { height:80px; display:flex; align-items:flex-end; padding:0.5rem; }
  .swatch-label { font-size:0.75rem; font-weight:600; text-shadow:0 1px 2px rgba(0,0,0,0.3); }
  .swatch-info { padding:0.5rem 0.75rem; font-size:0.72rem; display:flex; flex-direction:column; gap:0.2rem; }
  .contrast-info { color:var(--text-muted); font-size:0.68rem; }
  .typo-row { background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:1rem; margin-bottom:0.75rem; display:grid; grid-template-columns:1fr auto; gap:1rem; align-items:center; }
  .typo-specimen { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .token-meta { text-align:right; font-size:0.72rem; color:var(--text-muted); }
  .spacing-list { display:flex; flex-direction:column; gap:0.5rem; }
  .spacing-row { display:flex; align-items:center; gap:1rem; background:var(--surface); border:1px solid var(--border); border-radius:6px; padding:0.5rem 0.75rem; }
  .spacing-box { border-radius:3px; flex-shrink:0; }
  .token-table { width:100%; border-collapse:collapse; background:var(--surface); border:1px solid var(--border); border-radius:8px; overflow:hidden; font-size:0.8rem; }
  .token-table th { background:var(--bg); padding:0.6rem 0.75rem; text-align:left; font-weight:600; border-bottom:1px solid var(--border); }
  .token-table td { padding:0.6rem 0.75rem; border-bottom:1px solid var(--border); vertical-align:top; }
  .token-table tr:last-child td { border-bottom:none; }
  .token-path { font-family:monospace; font-size:0.8em; color:var(--accent); }
  .token-value { font-family:monospace; font-size:0.8em; }
  .token-desc { color:var(--text-muted); font-size:0.8em; }
  .token-list { display:flex; flex-direction:column; gap:0.5rem; }
`;

function renderSetPage(setName: string, tokens: FlatToken[]): string {
  const byType: Record<string, FlatToken[]> = {};
  for (const t of tokens) {
    if (!byType[t.$type]) byType[t.$type] = [];
    byType[t.$type].push(t);
  }

  const sections = Object.entries(byType).map(([type, toks]) => {
    let content = '';
    if (type === 'color') content = renderColorTokens(toks);
    else if (type === 'typography') content = renderTypographyTokens(toks);
    else if (type === 'dimension' || type === 'spacing' || type === 'number') content = renderSpacingTokens(toks);
    else content = renderGenericTokens(toks);
    return `<h3>${escapeHtml(type)} (${toks.length})</h3>${content}`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(setName)} — Token Docs</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="breadcrumb"><a href="/docs">← All sets</a></div>
  <h1>${escapeHtml(setName)}</h1>
  <p style="color:var(--text-muted);margin-bottom:1.5rem">${tokens.length} tokens</p>
  ${sections || '<p style="color:var(--text-muted)">No tokens in this set.</p>'}
</body>
</html>`;
}

function renderIndexPage(sets: { name: string; count: number }[]): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Token Documentation</title>
  <style>${CSS}</style>
</head>
<body>
  <h1>Token Documentation</h1>
  <p style="color:var(--text-muted);margin-bottom:1.5rem">Auto-generated style guide for all token sets.</p>
  <div class="set-list">
    ${sets.map(s => `
      <a href="/docs/${encodeURIComponent(s.name)}" class="set-card">
        <span>${escapeHtml(s.name)}</span>
        <span class="badge">${s.count} tokens</span>
      </a>`).join('')}
  </div>
</body>
</html>`;
}

export async function docsRoutes(fastify: FastifyInstance) {
  // GET /docs — index of all sets
  fastify.get('/docs', async (_request, reply) => {
    const allSets = await fastify.tokenStore.getSets();
    const setInfos: { name: string; count: number }[] = [];
    for (const name of allSets) {
      const flat = await fastify.tokenStore.getFlatTokensForSet(name);
      setInfos.push({ name, count: Object.keys(flat).length });
    }
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return renderIndexPage(setInfos);
  });

  // GET /docs/:set — style guide for a specific set
  fastify.get<{ Params: { set: string } }>('/docs/:set', async (request, reply) => {
    const { set } = request.params;
    const tokenSet = await fastify.tokenStore.getSet(set);
    if (!tokenSet) {
      reply.status(404).header('Content-Type', 'text/html; charset=utf-8');
      return `<!DOCTYPE html><html><body><h1>Set "${escapeHtml(set)}" not found</h1><p><a href="/docs">Back</a></p></body></html>`;
    }
    const flatRecord = await fastify.tokenStore.getFlatTokensForSet(set);
    const flat: FlatToken[] = Object.entries(flatRecord).map(([path, t]) => ({
      path,
      $type: t.$type || 'string',
      $value: t.$value,
      $description: t.$description,
    }));
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return renderSetPage(set, flat);
  });
}
