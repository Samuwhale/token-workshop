import type { FastifyInstance } from "fastify";

const SECTIONS: ReadonlyArray<{
  id: string;
  title: string;
  summary: string;
  items: readonly string[];
}> = [
  {
    id: "overview",
    title: "Overview",
    summary:
      "TokenManager is a local Figma plugin workspace for authoring, reviewing, syncing, and exporting DTCG design tokens.",
    items: [
      "Collections are the primary authoring container. Modes belong to collections, and every token value is a mode value.",
      "The plugin keeps designer workflows first while giving developers clear places for exports, audit checks, version history, and git sync.",
      "Use the library views to author tokens, the canvas tools to inspect Figma usage, and the publish tools to push selected changes back into Figma.",
    ],
  },
  {
    id: "setup",
    title: "Setup",
    summary:
      "Run the local server against a token directory, then point the Figma plugin at that server URL.",
    items: [
      "Start the server with the token directory you want to manage. The default development server uses port 9400.",
      "Open the plugin settings and confirm the server URL. A connected workspace should show collections, health status, and sync actions.",
      "If the plugin goes offline, check that the server is still running and that the configured token directory is readable.",
    ],
  },
  {
    id: "library",
    title: "Library",
    summary:
      "The library is where designers create and maintain collections, modes, groups, and token values.",
    items: [
      "Create collections for token families or governance boundaries, then add modes that match the Figma variable modes designers expect.",
      "When a collection has multiple modes, edit all mode values side by side. Use literal values or alias references in each mode field.",
      "Use rename, move, duplicate, batch edit, and review actions from the token list to keep large libraries consistent.",
    ],
  },
  {
    id: "canvas",
    title: "Canvas",
    summary:
      "Canvas tools connect authored tokens to the selected Figma layers designers are actively working on.",
    items: [
      "Inspect a selection to see bound variables, current values, eligible token matches, and missing coverage.",
      "Apply tokens directly to supported Figma properties, or use quick apply when selecting a token is faster than editing a layer manually.",
      "Use coverage and repair flows to find raw values, broken bindings, and places where design decisions should become reusable tokens.",
    ],
  },
  {
    id: "sync",
    title: "Sync",
    summary:
      "Publishing turns authored tokens into Figma variables and styles while preserving reviewable changes.",
    items: [
      "Review what will be created, updated, or removed before publishing a collection to Figma.",
      "Map TokenManager collections and modes to the matching Figma variable collections and modes.",
      "Use readiness checks before publishing when you need to catch invalid values, missing modes, or risky changes.",
    ],
  },
  {
    id: "export",
    title: "Export",
    summary:
      "Export tools package tokens for codebases and platform-specific design system pipelines.",
    items: [
      "Choose an export format such as CSS, SCSS, JSON, TypeScript, Tailwind, Android, iOS Swift, Dart, or CSS-in-JS.",
      "Use presets to keep platform options repeatable, including path filters, output naming, and selector settings.",
      "Validate exported output before handoff so developers receive the same collection and mode structure designers authored.",
    ],
  },
  {
    id: "versions",
    title: "Versions",
    summary:
      "History tools make token changes inspectable and recoverable during active design system work.",
    items: [
      "Use recent activity to review operations, affected token paths, and rollback options.",
      "Create manual checkpoints before broad edits or publish operations.",
      "Use git sync when the token directory is shared with a repository and changes need developer review.",
    ],
  },
  {
    id: "settings",
    title: "Settings",
    summary:
      "Settings collect workspace preferences and maintenance actions that should stay out of the primary authoring flow.",
    items: [
      "Update the server URL, display preferences, lint rule configuration, export defaults, and publish behavior from settings.",
      "Import or export plugin preferences when moving between Figma files or local workspaces.",
      "Use maintenance actions carefully; they can affect storage, bindings, and generated output.",
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    summary:
      "Most problems start with connection state, invalid token data, or a mismatch between authored collections and Figma variables.",
    items: [
      "Offline state: verify the local server is running, the plugin server URL is correct, and the browser can reach the health endpoint.",
      "Sync failure: review readiness checks, mode mappings, and the publish preview before retrying.",
      "Import or export failure: confirm the selected file format, collection target, and token path filters.",
    ],
  },
];

const CSS = `
  :root {
    --bg: #f7f8fa;
    --surface: #ffffff;
    --surface-muted: #f1f3f5;
    --border: #e5e7eb;
    --text: #111827;
    --text-muted: #6b7280;
    --accent: #2563eb;
    --accent-soft: rgba(37, 99, 235, 0.08);
    --shadow: 0 18px 40px rgba(17, 24, 39, 0.06);
  }

  * {
    box-sizing: border-box;
  }

  html {
    scroll-behavior: smooth;
  }

  body {
    margin: 0;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.55;
  }

  a {
    color: var(--accent);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  .page {
    max-width: 1080px;
    margin: 0 auto;
    padding: 36px 24px 64px;
  }

  .hero {
    display: grid;
    gap: 24px;
    grid-template-columns: minmax(0, 1.4fr) minmax(260px, 0.8fr);
    align-items: start;
    margin-bottom: 32px;
  }

  .nav-card,
  .section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  h1 {
    margin: 0 0 12px;
    font-size: 38px;
    line-height: 1.05;
  }

  .lead {
    margin: 0;
    max-width: 62ch;
    color: var(--text-muted);
    font-size: 16px;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 20px;
    color: var(--text-muted);
    font-size: 14px;
  }

  .meta strong {
    color: var(--text);
  }

  .nav-card {
    padding: 18px;
    position: sticky;
    top: 24px;
    box-shadow: var(--shadow);
  }

  .nav-card h2 {
    margin: 0 0 14px;
    font-size: 16px;
  }

  .nav-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  .nav-list a {
    display: block;
    padding: 10px 12px;
    border-radius: 6px;
    background: var(--surface-muted);
    color: var(--text);
    font-weight: 500;
  }

  .nav-list a:hover {
    background: var(--accent-soft);
    text-decoration: none;
  }

  .section-grid {
    display: grid;
    gap: 14px;
  }

  .section {
    padding: 22px;
    scroll-margin-top: 24px;
  }

  .section h2 {
    margin: 0 0 8px;
    font-size: 22px;
  }

  .section p {
    margin: 0 0 12px;
    color: var(--text-muted);
  }

  .section ul {
    margin: 0;
    padding-left: 20px;
    color: var(--text);
  }

  .section li + li {
    margin-top: 8px;
  }

  .footer-note {
    margin-top: 16px;
    color: var(--text-muted);
    font-size: 14px;
  }

  @media (max-width: 860px) {
    .hero {
      grid-template-columns: 1fr;
    }

    .nav-card {
      position: static;
    }
  }
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHelpPage(): string {
  const navigation = SECTIONS.map(
    (section) => `
      <li>
        <a href="#${escapeHtml(section.id)}">${escapeHtml(section.title)}</a>
      </li>`,
  ).join("");

  const sections = SECTIONS.map(
    (section) => `
      <section id="${escapeHtml(section.id)}" class="section">
        <h2>${escapeHtml(section.title)}</h2>
        <p>${escapeHtml(section.summary)}</p>
        <ul>
          ${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </section>`,
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TokenManager Help</title>
  <style>${CSS}</style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div>
        <h1>TokenManager Help</h1>
        <p class="lead">
          Practical guidance for using TokenManager as a Figma-native design token workspace, from authoring collections to publishing variables and exporting code-ready tokens.
        </p>
        <div class="meta">
          <span><strong>Audience:</strong> Figma designers and design system teams</span>
          <span><strong>Also useful:</strong> <a href="/docs">Token documentation</a></span>
        </div>
      </div>
      <aside class="nav-card" aria-label="On this page">
        <h2>Sections</h2>
        <ul class="nav-list">
          ${navigation}
        </ul>
      </aside>
    </section>

    <div class="section-grid">
      ${sections}
    </div>

    <p class="footer-note">
      Need the generated collection and token reference instead? Open <a href="/docs">token documentation</a>.
    </p>
  </main>
</body>
</html>`;
}

export async function helpRoutes(fastify: FastifyInstance) {
  fastify.get("/help", async (_request, reply) => {
    reply.header("Content-Type", "text/html; charset=utf-8");
    return renderHelpPage();
  });
}
