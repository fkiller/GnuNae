# AGENTS.md

This file is the maintenance baseline for Codex agents working in this repository.
It is based on the current source, `package.json`, build scripts, Electron entry
points, and GitHub Actions workflows. When this file conflicts with code or CI,
trust code and CI first, then update this file in the same PR.

## Project Overview

GnuNae is an Electron desktop browser with a React renderer and a Codex-powered
sidebar for browser automation through Playwright MCP.

- Main process: `src/electron/main.ts`
  - Single Electron main entry from `package.json` (`dist/electron/main.js` after build).
  - Owns BrowserWindows, BrowserViews, tab/session state, menus, tray behavior,
    IPC handlers, Codex CLI spawning, Docker sandbox routing, external browser
    CDP sessions, terminal processes, task scheduling, and runtime setup.
- Preload: `src/electron/preload.ts`
  - Exposes the renderer API as `window.electronAPI` through `contextBridge`.
  - Renderer-to-main calls must go through this bridge and matching
    `ipcMain.handle` channels in `main.ts`.
- Renderer: `src/ui/`
  - Vite + React app. `src/ui/index.tsx` selects one of three modes from URL
    params: full app (`App.tsx`), chat-only external browser mode
    (`ChatModeApp.tsx`), or standalone settings (`Settings`).
- Shared services: `src/core/`
  - Settings, data store, auth, Docker/runtime management, external browser
    detection, shortcuts, tasks, tray, and schema types.
- Docker sandbox: `docker/`
  - Playwright-based container image with Codex CLI, Playwright MCP, VNC/noVNC,
    and an API server used by Virtual Mode.

The app supports Native mode, where Codex CLI runs on the host, and Virtual
Mode, where Codex runs in a Docker/Podman container and connects to an Electron
or external browser through CDP.

## Source Of Truth And Documentation Freshness

Treat these files as authoritative before older notes:

- `package.json` and `package-lock.json` for package manager, scripts, package
  targets, app identity, and electron-builder configuration.
- `src/electron/main.ts`, `src/electron/preload.ts`, `src/ui/index.tsx`, and
  `src/core/*` for current runtime behavior.
- `.github/workflows/*.yml` for current CI, release, Docker, and store upload
  automation.
- `scripts/*.js`, `build/entitlements*.plist`, `build/appx/*`, `docker/*`, and
  `resources/*/package*.json` for packaging and runtime details.

Existing docs may be historical. Do not assume `README.md`,
`docs/CI_CD_PACKAGING.md`, `docs/PERIODIC_MAINTENANCE.md`, or signing notes are
fully current until checked against code and workflows. If a stale doc conflicts
with source truth, mention the conflict and prefer marking it historical,
stale, or superseded instead of deleting it.

## Package Manager And Commands

The repository uses npm. `package-lock.json` is present; no pnpm or Yarn config
is present.

Install:

```bash
npm ci
npm install
```

Development:

```bash
npm run dev            # Vite dev server on port 5173 plus Electron
npm run dev:ui         # Vite dev server only
npm run dev:electron   # tsc for Electron/main, then electron .
npm run start          # Launch Electron directly, expects a prior build
```

Build and typecheck:

```bash
npm run build:electron # Runs tsc for main/preload/core TypeScript
npm run build:ui       # Runs vite build and scripts/build-ui.js
npm run build          # build:electron, then build:ui
```

Docker sandbox:

```bash
npm run build:docker
npm run build:docker:clean
npm run build:all
```

Packaging and release scripts:

```bash
npm run pack:mac
npm run pack:mac-mas
npm run deploy:mas
npm run pack:win
npm run pack:linux
npm run pack:all
```

Tests and lint:

- No `test` script is configured.
- No lint script is configured.
- No standalone renderer typecheck script is configured outside the Vite build.
- There are no unit, integration, or E2E test commands in `package.json`.

## Architecture Boundaries

- Main process code may use Node.js, Electron main APIs, filesystem access,
  child processes, Docker/Podman commands, and dynamic `require()` for native
  modules.
- Renderer code must not call Node or Electron main APIs directly. Add or change
  `window.electronAPI` methods in `preload.ts` and pair them with explicit
  `ipcMain.handle` or event senders in `main.ts`.
- Browser content is rendered in Electron `BrowserView` instances managed by
  `TabManager` in `main.ts`. React renders the app shell around those views.
- Codex CLI configuration is assembled at spawn time with `-c` flags, including
  Playwright MCP CDP endpoint configuration. Do not rely on modifying a global
  `~/.codex/config.toml` for app behavior.
- User settings and tasks are stored under Electron `app.getPath('userData')`.
  The Personal Data Store is stored at `~/.gnunae/datastore.json`. Codex CLI
  authentication is read from `~/.codex/auth.json`.

## Current Release Workflow Summary

Current workflows are defined under `.github/workflows/`.

- `release.yml` runs on pushed tags matching `v*`.
  - Matrix build job runs on macOS, Windows, and Ubuntu.
  - It runs `npm ci`, injects build config, runs `npm run build`, then packages:
    macOS DMG/ZIP with Developer ID signing and notarization, Windows NSIS and
    portable artifacts with Azure Trusted Signing, and Linux AppImage/DEB with
    GPG configuration.
  - A separate `build-msstore` job builds an APPX/MSIX on Windows and uploads it
    to Microsoft Partner Center with the `msstore` CLI.
  - The GitHub Release job creates a non-draft GitHub Release from artifacts
    produced by the matrix build job. It currently depends on `build`, not on
    `build-msstore`.
- `docker.yml` builds the sandbox image on Docker path PRs, selected branch
  pushes, manual dispatch, and `v*` tags. Non-PR runs push to GHCR.
- `dependabot.yml` opens weekly npm dependency updates.
- Mac App Store packaging/upload is not handled by GitHub Actions. The current
  repo script is `npm run deploy:mas`, which must run locally on macOS with
  App Store Connect credentials, certificates, and provisioning profile.

## Store And Release Safety Rules

Do not modify these without explicit owner review:

- Release workflows: `.github/workflows/release.yml`, `.github/workflows/docker.yml`.
- electron-builder identity and targets in `package.json`, including `appId`,
  `productName`, `artifactName`, `mac`, `mas`, `win`, `appx`, `linux`, and
  signing-related config.
- Store identity fields: bundle IDs, AppX/MSIX identity, publisher values,
  product IDs, display names, application IDs, provisioning profile paths, and
  entitlement files.
- Signing and store files: `build/entitlements*.plist`, `build/appx/*`,
  `docs/SIGNING.md`, `scripts/load-env.js`, `scripts/deploy-mas.js`,
  `scripts/inject-build-config.js`, `scripts/afterPack.js`, icon assets, store
  screenshots, and any `certs/`, `.env.local`, `.p8`, `.p12`, or private key
  material.
- Runtime packaging inputs: `scripts/download-node.js`,
  `scripts/install-codex.js`, `resources/runtime*`, `resources/codex`, and
  `docker/Dockerfile`.

Do not push release tags, run store upload commands, change app identity, rotate
signing config, or alter release automation as part of ordinary maintenance.

## Secrets And Store Credentials

Never ask the owner to paste secrets into chat or commit secrets to the repo.
When a task requires signing keys, App Store Connect credentials, Microsoft
Partner Center credentials, Azure signing credentials, or GitHub Actions
secrets:

1. Stop before the credential-dependent step.
2. State exactly which secret or portal access is required.
3. Tell the owner where it must be configured, such as GitHub Actions secrets,
   local `.env.local`, Keychain, Partner Center, or App Store Connect.
4. Document the command that could not be completed and mark the result as
   needs manual confirmation.

## Cloud Verification Limits

Codex Cloud cannot fully verify all desktop and store behavior. When cloud
verification is insufficient, do not claim it passed. Provide a manual checklist
and label the unverified area clearly.

Manual verification is required for signing, notarization, Microsoft Store
submission, Mac App Store submission, app sandbox entitlements, Windows
installer behavior, portable runtime migration, tray/startup behavior, external
browser shortcuts, Docker Desktop host networking, OpenAI/Codex login, and real
browser automation.

## Required Checks Before PR

- Always inspect `git status -sb` and the diff before staging.
- Stage only files that belong to the requested scope.
- For application, script, packaging, or config changes, run `npm run build`.
- For main/preload/core-only changes, `npm run build:electron` is the minimum.
- For renderer changes, run `npm run build:ui` or `npm run build`.
- For Docker changes, run `npm run build:docker` when Docker is available; if
  not available, document that limitation.
- For documentation-only changes, verify the changed docs directly and run the
  safest available repository check if practical.
- Explicitly state that lint/tests are not available unless scripts are added.

## Required PR Summary Format

Use this structure in PR descriptions:

```markdown
## Summary
- ...

## What I inspected
- ...

## Files changed
- ...

## Verification
- `command` - passed
- `command` - failed: reason
- Not run: reason

## Release and store impact
- ...

## Stale docs or conflicts found
- ...

## Manual confirmation needed
- ...

## Recommended next Codex tasks
- ...
```

For release-sensitive PRs, include a clear statement of which signing, store,
identity, entitlement, and workflow files were touched or intentionally avoided.
