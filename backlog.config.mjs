export default {
  "preset": "balanced",
  "validation": {
    "default": "bash scripts/backlog/validate.sh",
    "profiles": {
      "docs": "bash scripts/backlog/validate-docs.sh",
      "core": "pnpm --filter @tokenmanager/core build",
      "server": "pnpm --filter @tokenmanager/server build",
      "plugin": "pnpm preview:build",
      "backlog": "pnpm --filter backlog-runner build"
    },
    "routing": [
      {
        "profile": "docs",
        "pathPrefixes": [
          "AGENTS.md",
          "README.md",
          "docs",
          ".claude",
          "backlog/tasks"
        ]
      },
      {
        "profile": "core",
        "pathPrefixes": [
          "packages/core"
        ]
      },
      {
        "profile": "server",
        "pathPrefixes": [
          "packages/server"
        ]
      },
      {
        "profile": "plugin",
        "pathPrefixes": [
          "packages/figma-plugin"
        ]
      },
      {
        "profile": "backlog",
        "pathPrefixes": [
          "packages/backlog-runner",
          "scripts/backlog",
          "backlog.config.mjs",
          "README.md"
        ]
      }
    ]
  },
  "classification": {
    "backlogRuntimePaths": [
      "packages/backlog-runner/"
    ],
    "uiPathPrefixes": [
      "packages/figma-plugin/src/ui",
      "packages/figma-plugin/standalone"
    ]
  },
  "workspaceBootstrap": {
    "installCommand": "pnpm install --frozen-lockfile",
    "repairCommand": "pnpm backlog:doctor --repair"
  },
  "workspace": {
    "workers": 2,
    "useWorktrees": true
  },
  "discovery": {
    "enabled": true,
    "promptDir": "./scripts/backlog/passes",
    "passes": {
      "workspace-config": {
        "description": "Audit repo-level workspace, build, lint, and TypeScript configuration for clarity and maintainability.",
        "runner": {
          "tool": "codex",
          "model": "gpt-5.4"
        },
        "heuristics": {
          "includePaths": [
            "package.json",
            "pnpm-workspace.yaml",
            "turbo.json",
            "tsconfig.json",
            "tsconfig.*",
            "eslint.config.*",
            "packages/*/package.json",
            "scripts/**"
          ],
          "excludePaths": [
            "node_modules/**",
            ".git/**",
            ".turbo/**",
            ".backlog-runner/**",
            "backlog/**"
          ],
          "capabilities": [
            "read",
            "search",
            "repo-config",
            "task-proposal"
          ]
        }
      },
      "plugin-ui-surface": {
        "description": "Inspect the Figma plugin UI code paths for maintainability, constrained-window UX, and clean feature ownership.",
        "runner": {
          "tool": "codex",
          "model": "gpt-5.4"
        },
        "heuristics": {
          "includePaths": [
            "packages/**",
            "demo/**"
          ],
          "excludePaths": [
            "packages/backlog-runner/**",
            "node_modules/**",
            ".git/**",
            ".turbo/**",
            ".backlog-runner/**",
            "backlog/**"
          ],
          "capabilities": [
            "read",
            "search",
            "ui-review",
            "task-proposal"
          ]
        }
      },
      "preview-dev-flow": {
        "description": "Review the local preview and standalone harness flow so agents and operators can run the repo reliably.",
        "runner": {
          "tool": "codex",
          "model": "gpt-5.4"
        },
        "heuristics": {
          "includePaths": [
            "README.md",
            "package.json",
            "scripts/**",
            "demo/**",
            "packages/**",
            ".playwright-mcp/**"
          ],
          "excludePaths": [
            "packages/backlog-runner/**",
            "node_modules/**",
            ".git/**",
            ".turbo/**",
            ".backlog-runner/**",
            "backlog/**"
          ],
          "capabilities": [
            "read",
            "search",
            "dev-workflow",
            "task-proposal"
          ]
        }
      },
      "docs-and-prompts": {
        "description": "Check operator-facing docs, backlog task specs, and prompt/config files for drift, ambiguity, and repo-local ownership.",
        "runner": {
          "tool": "claude",
          "model": "opus"
        },
        "heuristics": {
          "includePaths": [
            "AGENTS.md",
            "README.md",
            "docs/**",
            ".claude/**",
            "backlog.config.mjs",
            "scripts/backlog/**",
            "backlog/tasks/**"
          ],
          "excludePaths": [
            "node_modules/**",
            ".git/**",
            ".turbo/**",
            ".backlog-runner/**",
            "backlog.md",
            "backlog/inbox.jsonl"
          ],
          "capabilities": [
            "read",
            "search",
            "docs-review",
            "prompt-review",
            "task-proposal"
          ]
        }
      }
    }
  }
};
