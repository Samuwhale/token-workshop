# Token Workshop Release Checklist

Use this checklist before publishing Token Workshop publicly.

## Codebase

- [ ] Review the full working tree and confirm every changed file belongs in the public release.
- [ ] Run a secret/history review before pushing to the public repo.
- [ ] Replace the Figma manifest placeholder id `token-workshop-local` with the Figma-assigned plugin id in `packages/figma-plugin/manifest.json`.
- [ ] Re-run release validation after replacing the Figma plugin id:
  - [ ] `pnpm build`
  - [ ] `pnpm lint`
  - [ ] `pnpm preview:validate`
  - [ ] `pnpm plugin:release`
  - [ ] `npm pack --dry-run` from `packages/server`
- [ ] Commit the release setup changes.
- [ ] Push `main` to `https://github.com/Samuwhale/token-workshop.git`.

## GitHub

- [x] Create public repo `Samuwhale/token-workshop`.
- [x] Enable GitHub Issues.
- [x] Disable GitHub wiki.
- [x] Enable private vulnerability reporting.
- [x] Set repo homepage to `https://tokenworkshop.spithorst.net`.
- [x] Add repo topics: `design-tokens`, `dtcg`, `figma-plugin`, `token-workshop`.
- [ ] Confirm the PR workflow passes on GitHub after push.
- [ ] Create the first GitHub release after Figma and npm artifacts are final.

## npm

- [x] Confirm `token-workshop` package name is available.
- [x] Confirm npm dry-run package only includes expected files.
- [ ] Log in to npm on this machine.
- [ ] Publish `token-workshop`.
- [ ] Verify `npx token-workshop --dir ./tokens` starts the server from npm.
- [ ] Verify the server listens at `http://localhost:9400`.
- [ ] Verify an empty `./tokens` directory stays empty on first start.

## Figma Community

- [ ] Create the Figma Community plugin listing under Samuel Spithorst's personal profile.
- [ ] Get the Figma-assigned plugin id.
- [ ] Update `packages/figma-plugin/manifest.json` with the assigned id.
- [ ] Build the release zip with `pnpm plugin:release`.
- [ ] Confirm the zip contains only:
  - [ ] `manifest.json`
  - [ ] `dist/code.js`
  - [ ] `dist/ui.html`
- [ ] Upload the release zip to Figma.
- [ ] Confirm `networkAccess.allowedDomains` is restricted to `http://localhost:9400`.
- [ ] Confirm `documentAccess` is set to `dynamic-page`.

## Cloudflare Pages

- [ ] Create a Cloudflare Pages project for this repo.
- [ ] Configure the production branch as `main`.
- [ ] Configure the docs output as the static `docs` directory.
- [ ] Connect `tokenworkshop.spithorst.net`.
- [ ] Confirm HTTPS works at `https://tokenworkshop.spithorst.net`.
- [ ] Confirm these pages work:
  - [ ] `/`
  - [ ] `/setup.html`
  - [ ] `/privacy.html`
  - [ ] `/support.html`
  - [ ] `/security.html`
  - [ ] `/changelog.html`
- [ ] Confirm no analytics scripts are present.

## Real Figma QA

- [ ] Create a clean Figma demo file for listing screenshots and QA.
- [ ] Test first run with the local server running.
- [ ] Test first run with the local server missing.
- [ ] Test an empty workspace.
- [ ] Test importing tokens.
- [ ] Test authoring collections, modes, tokens, aliases, and formulas.
- [ ] Test applying tokens to Figma layers.
- [ ] Test publishing variables and styles.
- [ ] Test health/audit surfaces.
- [ ] Test generator overview and graph views.
- [ ] Test exports.
- [ ] Test git/shared version workflows.
- [ ] Test local network failure recovery.
- [ ] Confirm no telemetry or analytics traffic is sent.

## Community Listing Assets

- [ ] Capture authoring screenshot.
- [ ] Capture applying/publishing screenshot.
- [ ] Capture health/audit screenshot.
- [ ] Capture generators screenshot.
- [ ] Capture export screenshot.
- [ ] Capture git/shared versions screenshot.
- [ ] Write listing copy that positions Token Workshop as a Figma token authoring tool.
- [ ] Include support link to GitHub Issues.
- [ ] Include donation link to GitHub Sponsors.
- [ ] Include privacy note: no telemetry.

## Final Release

- [ ] Publish npm package.
- [ ] Publish Figma Community listing.
- [ ] Publish Cloudflare Pages docs.
- [ ] Push public source.
- [ ] Create GitHub release.
- [ ] Verify public setup from a clean directory:
  - [ ] `mkdir token-workshop-demo`
  - [ ] `cd token-workshop-demo`
  - [ ] `npx token-workshop --dir ./tokens`
  - [ ] Open Token Workshop in Figma
  - [ ] Create or import first tokens
