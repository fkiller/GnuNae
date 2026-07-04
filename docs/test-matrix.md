# GnuNae Test Matrix

This matrix documents the checks currently available in the repository and the
checks that should be added or performed manually for maintenance and release
work.

## Existing Checks Discovered

Package install and builds:

- `npm ci` - clean install from `package-lock.json`.
- `npm install` - local install/update path.
- `npm run build:electron` - runs `tsc` for Electron main, preload, and shared
  core TypeScript under `src`, excluding `src/ui/**/*`.
- `npm run build:ui` - runs `vite build` and `node scripts/build-ui.js`.
- `npm run build` - runs `build:electron` and `build:ui`.
- `npm run dev` - starts Vite and Electron for local interactive smoke testing.
  It is not suitable as an unattended CI check because it is long-running.
- `npm run build:docker` - builds `gnunae/sandbox:latest` from `docker/`.
- `npm run build:docker:clean` - no-cache Docker sandbox build.

Release and packaging checks:

- `npm run pack:mac` - downloads macOS runtimes, installs Codex, builds, and
  invokes electron-builder for DMG/ZIP.
- `npm run pack:mac-mas` - downloads macOS runtimes, installs Codex, builds, and
  invokes electron-builder for Mac App Store target.
- `npm run deploy:mas` - local macOS-only Mac App Store build and upload script.
- `npm run pack:win` - downloads Windows runtime, installs Codex, builds, and
  invokes electron-builder for the Windows Store APPX target.
- `npm run pack:linux` - builds and invokes electron-builder for Linux targets.
- `.github/workflows/release.yml` - tag-triggered multi-platform release,
  signing, notarization, Microsoft Store upload, and GitHub Release creation.
  It publishes macOS and Linux artifacts to GitHub Releases; direct Windows
  NSIS/portable artifacts are intentionally skipped because Windows
  distribution uses Microsoft Store APPX/MSIX deployment.
- `.github/workflows/docker.yml` - Docker image build/push workflow.
- `.github/workflows/ci.yml` - non-release PR/push build matrix for Windows,
  macOS, and Linux. It runs `npm ci` and `npm run build`; it does not sign,
  package, notarize, or upload store artifacts.

Dependency automation:

- `.github/dependabot.yml` - weekly npm dependency update PRs.
- `.github/workflows/maintenance-watch.yml` - weekly/manual advisory scan that
  creates or updates a GitHub Issue for dependency, runtime, Codex CLI,
  Playwright MCP, Electron, Node.js, Docker base image, and GitHub Actions
  review, plus GitHub Pages website version/domain/download-link signals. It
  does not deploy or update files.
- `.github/workflows/store-status-watch.yml` - six-hour/manual read-only store
  status scan that creates or updates a GitHub Issue for Microsoft Store
  submission status and Mac App Store build/app-version review state. It does
  not build, upload, submit, publish, or modify store metadata.

## Missing Checks

- No `npm test` script.
- No lint script.
- No formatter script.
- No standalone renderer typecheck command outside Vite build.
- No unit tests for `src/core` services.
- No IPC contract tests for `preload.ts` and `main.ts`.
- No Electron smoke test that launches the app and verifies the first window.
- No renderer component tests.
- No browser automation E2E tests.
- No Docker API integration test in the app test suite.
- No automated signing/notarization dry-run for PRs.
- No automated Microsoft Store or Mac App Store package validation outside
  release or owner-local flows. Store status monitoring is read-only and does
  not replace install/update/sandbox validation.

## Recommended Quick PR Checks

For documentation-only PRs:

- Inspect changed Markdown files.
- Run `git diff --check` if whitespace risk exists.
- Run `npm run build` when practical, especially if docs describe build or
  release behavior.

For app code PRs:

- Local: `npm ci`
- Local: `npm run build:electron`
- Local: `npm run build:ui`
- Local: prefer `npm run build` as the standard combined check.
- Local interactive: `npm run dev` when the change affects renderer behavior,
  Electron startup, BrowserView layout, or Settings/Chat mode ergonomics.
- GitHub: confirm `CI` passes on Windows, macOS, and Linux.

For Docker changes:

- `npm run build:docker` when Docker is available.
- If Docker is unavailable in the environment, document that limitation.

For dependency updates:

- `npm ci`
- `npm run build`
- `npm run build:docker` if Docker-related packages or Dockerfile changed.
- Review the latest `Maintenance Watch` issue and the upstream release notes it
  links before selecting versions.
- Manual app smoke checks on at least Windows or macOS before release.

## Recommended Full Validation Checks

Run these before larger merges or release candidates:

- `npm ci`
- `npm run build`
- `npm run build:docker`
- Launch the app locally with `npm run start` after build.
- Verify native Codex runtime detection in Settings.
- Verify Codex login flow can start and complete with a real account.
- Verify one basic prompt in Native mode against a normal web page.
- Verify Virtual Mode can create a Docker sandbox and run a basic prompt.
- Verify tab creation, tab switching, navigation, and back/forward/reload.
- Verify PDS request and PDS store flows.
- Verify task creation, favorite/running/scheduled UI, and one scheduled task
  execution path.
- Verify Bottom Panel output and terminal behavior.
- Verify external browser detection, shortcut creation, and chat mode.
- Verify settings persistence after restart.

## Recommended Release Candidate Checks

- Confirm version in `package.json` and any related runtime/version docs.
- Confirm the latest `Maintenance Watch` issue has no unresolved
  release-blocking dependency, runtime, Codex CLI, Playwright MCP, Electron,
  Node.js, Docker, or GitHub Actions finding.
- Confirm Codex CLI, Playwright MCP, Playwright, Docker base image, and bundled
  runtime versions are intentionally synchronized.
- Run `npm ci` and `npm run build` on a clean checkout.
- Run `npm run build:docker` and confirm the app version expects the matching
  GHCR sandbox image tag.
- Create a release candidate tag only when owner-approved.
- Monitor all `release.yml` jobs on the tag.
- Monitor `docker.yml` on the tag.
- Manually dispatch `Store Status Watch` after Store upload/submission and
  inspect the `Store status watch` issue.
- Treat GitHub Actions as the Cloud end-to-end path for signed/notarized macOS
  direct-download artifacts, Linux artifacts, Microsoft Store upload, and Docker
  image publication. Codex can inspect logs but cannot inspect secret values.
- Download and smoke-test GitHub Release artifacts.
- Verify Linux artifacts launch.
- Verify macOS DMG/ZIP signature and notarization status.
- Confirm Microsoft Store upload result in Partner Center and in the `Store
  status watch` issue.
- Run `npm run deploy:mas` locally on owner macOS hardware for Mac App Store
  upload when needed.
- Confirm Mac App Store/TestFlight processing and app version review status in
  App Store Connect and in the `Store status watch` issue when API secrets are
  configured.

## Manual Windows Checks

These cannot be fully verified in Codex Cloud:

- Windows CDP binding behavior, including the default `127.0.0.1` path and
  Virtual Mode `0.0.0.0` behavior.
- Windows firewall prompts or absence of prompts.
- Microsoft Store APPX/MSIX packaging and Partner Center submission state. The
  store status workflow can report Partner Center status, but cannot install or
  validate the package.
- Microsoft Store install/update/uninstall behavior.
- Tray menu, run-in-background, launch-at-startup, and hidden startup.
- External browser shortcuts for Chrome, Edge, Brave, Opera, and related icons.
- Docker Desktop `host.docker.internal` behavior.
- Real Codex CLI login, token refresh, and OpenAI account capability.

## Manual macOS Checks

These cannot be fully verified in Codex Cloud:

- Developer ID signing and notarization on downloaded DMG/ZIP.
- Gatekeeper launch behavior on a clean machine.
- Mac App Store entitlements, sandbox behavior, provisioning profile, and
  App Store Connect upload. The store status workflow can report build/review
  state when API secrets are configured, but cannot validate sandbox behavior.
- `npm run deploy:mas` on macOS with full Xcode, certificates, `.p8` API key,
  and provisioning profile.
- Runtime bundling for arm64 and x64 macOS builds.
- External browser `.app` shortcut bundles and icons.
- Tray/menu bar behavior and hidden startup.
- Docker Desktop `host.docker.internal` behavior.
- Real Codex CLI login, token refresh, and browser automation against external
  browsers.
