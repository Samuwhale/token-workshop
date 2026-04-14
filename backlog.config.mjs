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
      "plugin-ui-surface": {
        "description": "Inspect the Figma plugin UI for small-window clarity, hierarchy, clutter, and clean feature ownership.",
        "runner": {
          "tool": "claude",
          "model": "opus"
        },
        "heuristics": {
          "includePaths": [
            "packages/figma-plugin/src/ui/**",
            "packages/figma-plugin/src/shared/**",
            "packages/figma-plugin/standalone/**",
            "demo/**"
          ],
          "excludePaths": [
            "packages/figma-plugin/src/plugin/**",
            "packages/server/**",
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
      "token-authoring-workflows": {
        "description": "Inspect token authoring flows across the plugin UI for coherence, maintainability, and unnecessary interaction cost.",
        "runner": {
          "tool": "claude",
          "model": "opus"
        },
        "heuristics": {
          "includePaths": [
            "packages/figma-plugin/src/ui/**",
            "packages/figma-plugin/src/shared/**",
            "packages/server/src/routes/**",
            "packages/server/src/services/**"
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
            "workflow-review",
            "task-proposal"
          ]
        }
      },
      "plugin-runtime-sync": {
        "description": "Inspect the plugin runtime, Figma bridge, and sync logic for maintainability, correctness, and ownership boundaries.",
        "runner": {
          "tool": "codex",
          "model": "gpt-5.4"
        },
        "heuristics": {
          "includePaths": [
            "packages/figma-plugin/src/plugin/**",
            "packages/figma-plugin/src/shared/**",
            "packages/server/src/routes/**",
            "packages/server/src/services/**"
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
            "plugin-runtime",
            "task-proposal"
          ]
        }
      },
      "server-integration": {
        "description": "Inspect API routes and services that back the plugin so product-facing server work stays clear, reliable, and well-scoped.",
        "runner": {
          "tool": "codex",
          "model": "gpt-5.4"
        },
        "heuristics": {
          "includePaths": [
            "packages/server/**",
            "packages/core/**",
            "packages/figma-plugin/src/shared/**"
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
            "backend-review",
            "integration-review",
            "task-proposal"
          ]
        }
      },
      "preview-dev-flow": {
        "description": "Review the local preview and standalone harness flow so plugin work stays easy to run, inspect, and iterate on.",
        "runner": {
          "tool": "codex",
          "model": "gpt-5.4"
        },
        "heuristics": {
          "includePaths": [
            "README.md",
            "package.json",
            "scripts/agent-preview.mjs",
            "demo/**",
            "packages/figma-plugin/standalone/**",
            "packages/server/**",
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
      }
    }
  }
};
