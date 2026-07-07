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

## Documentation Update Rule

Every code, workflow, packaging, runtime, Docker, or user-facing behavior change
must include a documentation impact pass before the work is considered complete.
Update the mapped docs in the same PR, or state explicitly in the PR why each
mapped doc is not applicable.

Documentation map:

- Codex CLI, model selection, model registry, spawn flags, auth, or runtime
  repair: update `docs/codex-model-runtime.md`,
  `docs/PERIODIC_MAINTENANCE.md`, `docs/test-matrix.md`, and user-facing
  notes in `README.md` when behavior changes.
- Native Codex runtime, Node/npm runtime, or packaged runtime files: update
  `docs/CI_CD_PACKAGING.md`, `docs/PERIODIC_MAINTENANCE.md`,
  `docs/test-matrix.md`, and `resources/runtime/README.md` if runtime layout
  changes.
- Docker/Virtual Mode, Dockerfile pins, sandbox API, CDP networking, or Docker
  image tags: update `docs/CI_CD_PACKAGING.md`,
  `docs/PERIODIC_MAINTENANCE.md`, `docs/test-matrix.md`, and
  `docs/codex-model-runtime.md` when Codex behavior is involved.
- Release workflows, store uploads, signing, notarization, package targets, or
  app identity: update `docs/CI_CD_PACKAGING.md`,
  `docs/release-checklist.md`, `docs/maintenance-playbook.md`, and this file.
  Treat these as release-sensitive and get owner review.
- Maintenance automation or issue/PR process: update
  `docs/PERIODIC_MAINTENANCE.md`, `docs/maintenance-playbook.md`,
  `.github/ISSUE_TEMPLATE/maintenance_task.yml`, and this file.
- Renderer UX, settings, shortcuts, task workflows, or user-visible setup:
  update `README.md` and `docs/test-matrix.md`; update feature-specific docs if
  present.

Native and Docker parity rule: any change that affects Codex execution,
supported models, runtime updates, Playwright MCP, browser automation, auth, or
maintenance dependency pins must inspect both Native mode and Docker/Virtual
Mode. If one mode cannot or should not use the same behavior, document the
reason and the fallback path.

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

Use `npm run dev` as a local interactive sanity check when working on renderer
or Electron startup behavior. It is not a CI check because it starts long-running
Vite/Electron processes.

Build and typecheck:

```bash
npm run build:electron # Runs tsc for main/preload/core TypeScript
npm run build:ui       # Runs vite build and scripts/build-ui.js
npm run build          # build:electron, then build:ui
```

`scripts/build-ui.js` copies `src/ui/login.html` and the root `assets/`
directory into `dist/` after Vite completes. Keep that script in mind when
changing login UI, icons, screenshots, or public renderer assets.

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
  Electron 39 marks `BrowserView` as deprecated in favor of `WebContentsView`;
  this is current technical debt, not an instruction to migrate in unrelated
  PRs.
- Codex CLI configuration is assembled at spawn time with `-c` flags, including
  Playwright MCP CDP endpoint configuration. Do not rely on modifying a global
  `~/.codex/config.toml` for app behavior.
- User settings and tasks are stored under Electron `app.getPath('userData')`.
  The Personal Data Store is stored at `~/.gnunae/datastore.json`. Codex CLI
  authentication is read from `~/.codex/auth.json`.

## Current Release Workflow Summary

Current workflows are defined under `.github/workflows/`.

- `release.yml` runs on pushed tags matching `v*`.
  - Matrix build job runs on macOS and Ubuntu.
  - It runs `npm ci`, injects build config, runs `npm run build`, then packages:
    macOS DMG/ZIP with Developer ID signing and notarization, and Linux
    AppImage/DEB with GPG configuration.
  - Direct Windows NSIS/portable GitHub-release artifacts are intentionally not
    built or signed. Windows distribution is handled through Microsoft Store
    APPX/MSIX deployment.
  - A separate `build-msstore` job builds an APPX/MSIX on Windows and uploads it
    to Microsoft Partner Center with the `msstore` CLI.
  - The GitHub Release job creates a non-draft GitHub Release from artifacts
    produced by the matrix build job. It currently depends on `build`, not on
    `build-msstore`.
- `docker.yml` builds the sandbox image on Docker path PRs, selected branch
  pushes, manual dispatch, and `v*` tags. Non-PR runs push to GHCR. The app
  currently requests `ghcr.io/fkiller/gnunae/sandbox:latest` and pulls it before
  sandbox startup; semver, branch, and SHA image tags are traceability unless
  the runtime image selection policy changes.
- The Docker image is part of Codex/runtime maintenance. Codex CLI,
  Playwright MCP, and Playwright updates must consider both native runtime pins
  and Dockerfile/image pins.
- `ci.yml` runs `npm ci` and `npm run build` on Windows, macOS, and Linux for
  PRs and selected pushes. It is a non-release build check and does not sign,
  notarize, package, or upload store artifacts.
- `maintenance-watch.yml` runs weekly and on manual dispatch. It generates an
  advisory maintenance report and creates or updates a GitHub Issue. It checks
  dependency/runtime pins plus GitHub Pages website signals for
  `www.gnunae.com`, including Pages source/CNAME/HTTPS, website version
  metadata, latest release tag, Store links, and release assets. It does not
  deploy, sign, notarize, push tags, submit store packages, or read secrets.
- `store-status-watch.yml` runs every six hours and on manual dispatch. It
  generates a read-only Microsoft Store / Mac App Store status report and
  creates or updates a GitHub Issue named `Store status watch`. It can read
  store API credentials from GitHub Actions secrets, but it must not build,
  upload, submit, publish, change metadata, rotate secrets, or modify store
  configuration. When `msstore submission status` emits Partner Center
  certification report links, the report should preserve those links for owner
  review even if the CLI table wraps them across lines. If a failed status omits
  a report link, the script may run one additional read-only verbose status
  query to recover the pending submission id. The workflow pins the MSStore CLI
  setup action to the `v0.3.7` CLI release line because that is the local-good
  status-query version; update the pin only after validating `submission
  status` in GitHub Actions.
- `dependabot.yml` opens weekly npm dependency updates.
- Mac App Store packaging/upload is handled by the tag-triggered `build-mas`
  workflow job when required GitHub Actions secrets are configured. The
  `npm run deploy:mas` script remains available for owner-controlled local
  macOS uploads with App Store Connect credentials, certificates, and
  provisioning profile.

## Store And Release Safety Rules

Do not modify these without explicit owner review:

- Release workflows: `.github/workflows/release.yml`, `.github/workflows/docker.yml`.
- Store status workflow: `.github/workflows/store-status-watch.yml`.
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
This local checkout may have `.env.local` populated, and GitHub Actions secrets
may also be configured, but Codex Cloud cannot read either directly. Treat
GitHub Actions as the credential boundary for Cloud validation: Codex can push
workflow changes and inspect pass/fail logs, but it cannot view secret values.
When a task requires signing keys, App Store Connect credentials, Microsoft
Partner Center credentials, Azure signing credentials, or GitHub Actions
secrets:

1. Stop before the credential-dependent step.
2. State exactly which secret or portal access is required.
3. Tell the owner where it must be configured, such as GitHub Actions secrets,
   local `.env.local`, Keychain, Partner Center, or App Store Connect.
4. Document the command that could not be completed and mark the result as
   needs manual confirmation.

For store status monitoring, Codex may add or update workflow logic that reads
secrets already configured in GitHub Actions, but must never print secret
values. Mac App Store status polling requires `ASC_API_KEY_ID`,
`ASC_API_ISSUER_ID`, and either `ASC_API_PRIVATE_KEY_BASE64` or
`ASC_API_PRIVATE_KEY`.

## Cloud Verification Limits

Codex Cloud cannot fully verify all desktop and store behavior. When cloud
verification is insufficient, do not claim it passed. Provide a manual checklist
and label the unverified area clearly.

Manual verification is required for signing, notarization, Microsoft Store
submission, Mac App Store submission, app sandbox entitlements, Windows Store
install/update behavior, tray/startup behavior, external browser shortcuts,
Docker Desktop host networking, OpenAI/Codex login, and real browser
automation.

`store-status-watch.yml` can confirm current review/status values from Store
APIs when credentials are configured, but it does not replace manual portal
review, TestFlight/App Store Connect checks, or Store package install testing.

## Required Checks Before PR

- Always inspect `git status -sb` and the diff before staging.
- Stage only files that belong to the requested scope.
- For application, script, packaging, or config changes, run `npm run build`.
- For main/preload/core-only changes, `npm run build:electron` is the minimum.
- For renderer changes, run `npm run build:ui` or `npm run build`.
- For Docker changes, run `npm run build:docker` when Docker is available; if
  not available, document that limitation.
- For store status monitor changes, run `node --check scripts/store-status-watch.js`
  and at least one safe local report generation path.
- For documentation-only changes, verify the changed docs directly and run the
  safest available repository check if practical.
- For PRs, expect GitHub `CI` to run `npm ci` and `npm run build` across
  Windows, macOS, and Linux. If it does not run, document why before merge.
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

## Native and Docker impact
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
