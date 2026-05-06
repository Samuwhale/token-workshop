# Token Workshop

Token Workshop is an open-source Figma token authoring tool. It pairs a Figma plugin with a local server so designers can create, edit, apply, audit, export, and version design tokens while keeping token files on their own machine.

- Docs: https://tokenworkshop.spithorst.net
- Source: https://github.com/Samuwhale/token-workshop
- Support: https://github.com/Samuwhale/token-workshop/issues
- Donations: https://github.com/sponsors/Samuwhale

## Public Setup

Install Node.js 20 or newer, then start the local server from the directory that should contain your token files:

```bash
npx token-workshop --dir ./tokens
```

The server listens at `http://localhost:9400`. Empty token directories stay empty until you create or import tokens.

Open the Token Workshop plugin in Figma after the server is running. The plugin connects to the local server automatically.

## Development

This repo is a pnpm/Turbo monorepo with three packages:

- `@token-workshop/core`: shared token engine and DTCG utilities
- `@token-workshop/figma-plugin`: Figma plugin UI and sandbox code
- `token-workshop`: local server and public npm CLI

Install dependencies:

```bash
pnpm install
```

Run the full local preview stack:

```bash
pnpm preview
```

That command:

1. Builds the plugin once so the standalone harness has a fresh `ui.html`.
2. Starts the plugin watch build.
3. Starts the local API server against `demo/tokens`.
4. Starts the standalone browser harness with a mocked Figma bridge.

Preview URLs:

- Harness UI: http://localhost:3200
- Direct plugin UI: http://localhost:3200/dist/ui.html
- Demo token docs: http://localhost:9400/docs
- Health check: http://localhost:9400/api/health

## Useful Commands

```bash
pnpm build
pnpm lint
pnpm preview
pnpm preview:capture
pnpm preview -- --dir ./tokens
pnpm preview -- --server-port 9410 --ui-port 3205
pnpm preview:validate
pnpm plugin:release
pnpm docs:preview
```

- `pnpm preview` uses the checked-in captured snapshot data.
- `pnpm preview:capture` refreshes the standalone snapshot and demo token files from the live local server at `http://localhost:9400`.
- `pnpm preview -- --dir ./tokens` points the local server at a real token workspace.
- `pnpm preview:validate` runs a connected headless preview check against the demo token workspace.
- `pnpm plugin:release` builds and zips the Figma plugin release artifact.
- `pnpm docs:preview` serves the static docs site locally.

## License

Token Workshop is released under the MIT License.
