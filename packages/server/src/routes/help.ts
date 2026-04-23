import type { FastifyInstance } from "fastify";

const SECTIONS: ReadonlyArray<{
  id: string;
  title: string;
  body: string;
}> = [
  {
    id: "overview",
    title: "Overview",
    body:
      "This is placeholder documentation for TokenManager. It will become the main reference for how the plugin works, but the detailed guidance is still being written.",
  },
  {
    id: "setup",
    title: "Setup",
    body:
      "This section will explain how to connect the plugin to the local TokenManager server, verify the workspace, and recover from common startup problems.",
  },
  {
    id: "library",
    title: "Library",
    body:
      "This section will cover collection management, token authoring, multi-mode values, editing workflows, and how the library views map to Figma mental models.",
  },
  {
    id: "canvas",
    title: "Canvas",
    body:
      "This section will describe selection inspection, coverage analysis, repair flows, and how to use TokenManager while working directly on Figma frames and layers.",
  },
  {
    id: "sync",
    title: "Sync",
    body:
      "This section will explain publishing and syncing tokens with Figma variables and styles, including what each sync stage does and when to use it.",
  },
  {
    id: "export",
    title: "Export",
    body:
      "This section will document export formats, platform presets, output structure, and how to generate token files for downstream codebases.",
  },
  {
    id: "versions",
    title: "Versions",
    body:
      "This section will cover history, change review, and the version-oriented parts of the workflow that designers and developers use together.",
  },
  {
    id: "settings",
    title: "Settings",
    body:
      "This section will describe workspace preferences, server connection options, import and export of plugin settings, and maintenance or recovery actions.",
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    body:
      "This section will list the most common issues, including offline server states, sync failures, import problems, and what to check before escalating.",
  },
];

const CSS = `
  :root {
    --bg: #f5f6f8;
    --surface: #ffffff;
    --surface-muted: #f9fafb;
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
    background: linear-gradient(180deg, #f8fafc 0%, var(--bg) 220px);
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
    padding: 40px 24px 64px;
  }

  .hero {
    display: grid;
    gap: 24px;
    grid-template-columns: minmax(0, 1.4fr) minmax(260px, 0.8fr);
    align-items: start;
    margin-bottom: 32px;
  }

  .hero-card,
  .nav-card,
  .section-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 18px;
    box-shadow: var(--shadow);
  }

  .hero-card {
    padding: 28px;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 16px;
  }

  h1 {
    margin: 0 0 12px;
    font-size: clamp(32px, 5vw, 46px);
    line-height: 1.05;
    letter-spacing: -0.03em;
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
    padding: 22px;
    position: sticky;
    top: 24px;
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
    border-radius: 10px;
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
    gap: 16px;
  }

  .section-card {
    padding: 24px;
    scroll-margin-top: 24px;
  }

  .section-card h2 {
    margin: 0 0 10px;
    font-size: 22px;
    letter-spacing: -0.02em;
  }

  .section-card p {
    margin: 0;
    color: var(--text-muted);
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

function renderHelpPage(): string {
  const navigation = SECTIONS.map(
    (section) => `
      <li>
        <a href="#${section.id}">${section.title}</a>
      </li>`,
  ).join("");

  const sections = SECTIONS.map(
    (section) => `
      <section id="${section.id}" class="section-card">
        <h2>${section.title}</h2>
        <p>${section.body}</p>
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
      <div class="hero-card">
        <div class="pill">Placeholder documentation</div>
        <h1>TokenManager Help</h1>
        <p class="lead">
          This page is the initial documentation entry point for the plugin. The final reference content is still in progress, so the sections below are intentionally lightweight placeholders.
        </p>
        <div class="meta">
          <span><strong>Status:</strong> Draft structure only</span>
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
