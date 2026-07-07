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
- `npm run build:docker` - builds the sandbox image from `docker/` and tags it
  as `gnunae/sandbox:latest` and `ghcr.io/fkiller/gnunae/sandbox:latest`.
- `npm run build:docker:clean` - no-cache Docker sandbox build with the same
  tags.

Release and packaging checks:

- `npm run pack:mac` - downloads macOS runtimes, installs Codex, builds, and
  invokes electron-builder for DMG/ZIP.
- `npm run pack:mac-mas` - downloads macOS arm64/x64 runtimes, installs Codex,
  builds, and invokes electron-builder for the universal Mac App Store target.
- `npm run deploy:mas` - macOS-only universal Mac App Store build and upload
  script used by the tag-triggered `build-mas` workflow job and by optional
  owner-local uploads.
- `npm run pack:win` - downloads Windows runtime, installs Codex, builds, and
  invokes electron-builder for the Windows Store APPX target.
- `npm run pack:linux` - builds and invokes electron-builder for Linux targets.
- `.github/workflows/release.yml` - tag-triggered multi-platform release,
  signing, notarization, Microsoft Store upload, Mac App Store upload, and
  GitHub Release creation. It publishes macOS and Linux artifacts to GitHub
  Releases; direct Windows NSIS/portable artifacts are intentionally skipped
  because Windows distribution uses Microsoft Store APPX/MSIX deployment.
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
  submission status, Microsoft certification report links when present, and Mac
  App Store build/app-version review state. It pins the MSStore CLI setup step
  to the locally validated `v0.3.7` CLI release line and may run one additional
  verbose Microsoft status query to construct a certification report link after
  a failed status. It does not build, upload, submit, publish, or modify store
  metadata. Manual dispatch can additionally generate a Microsoft Store appeal
  email dry-run; send mode requires dedicated Microsoft Graph mail secrets and
  explicit send confirmation.
- `.github/workflows/store-status-watch.yml` manual dispatch with
  `certification_dry_run=true` - read-only Microsoft Store certification-note
  validation. It checks `scripts/msstore-certification.js`, generates the notes
  preview, and performs a dry-run Partner Center read of the pending submission
  without uploading, publishing, or changing metadata.
- `.github/workflows/release.yml` - tag-triggered release workflow. Its
  `build-msstore` job builds APPX/MSIX, creates a no-commit Partner Center
  draft, patches certification notes through `scripts/msstore-certification.js`,
  verifies the pending Store package version against `package.json`, and then
  publishes the draft.

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
- No automated stale-model or outdated-Codex CLI failure test for Native mode.
- No automated outdated Docker sandbox Codex CLI/model-catalog failure test.
- No automated signing/notarization dry-run for PRs.
- No automated Microsoft Store install/update validation or Mac App Store
  sandbox/TestFlight validation outside release and store status flows. Store
  status monitoring is read-only and does not replace install/update/sandbox
  validation.

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

For Codex CLI, model, runtime, or Playwright MCP changes:

- `npm run build`
- `npm run build:docker` when Docker is available.
- Verify `docs/codex-model-runtime.md` still matches actual Native and Docker
  behavior.
- Manually verify one basic Native prompt and one basic Virtual Mode prompt
  before release when the change affects execution behavior.

For dependency updates:

- `npm ci`
- `npm run build`
- `npm run build:docker` if Docker-related packages or Dockerfile changed.
- Treat Codex CLI, Playwright MCP, and Playwright updates as Docker-related
  unless explicitly proven otherwise.
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
- For Codex model/runtime changes, verify the documented failure path in
  `docs/codex-model-runtime.md`: stale explicit model, no-model default, and
  outdated Docker image messaging where practical.
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
- Run `npm run build:docker` and confirm the app expects
  `ghcr.io/fkiller/gnunae/sandbox:latest`, then pulls it before sandbox start.
- Create a release candidate tag only when owner-approved.
- Monitor all `release.yml` jobs on the tag.
- Monitor `docker.yml` on the tag.
- Manually dispatch `Store Status Watch` after Store upload/submission and
  inspect the `Store status watch` issue.
- Manually dispatch `Store Status Watch` with `certification_dry_run=true`
  before resubmitting a failed Windows Store package to verify cloud
  credentials, generated certification notes, and pending package-version
  detection.
- Treat GitHub Actions as the Cloud end-to-end path for signed/notarized macOS
  direct-download artifacts, Linux artifacts, Microsoft Store upload, Mac App
  Store upload, and Docker image publication. Codex can inspect logs but cannot
  inspect secret values.
- Download and smoke-test GitHub Release artifacts.
- Verify Linux artifacts launch.
- Verify macOS DMG/ZIP signature and notarization status.
- Confirm Microsoft Store upload result in Partner Center and in the `Store
  status watch` issue, including certification notes and the package version
  verified by `scripts/msstore-certification.js`.
- Confirm the `build-mas` job uploaded the universal Mac App Store package.
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
- First-run Microsoft Store behavior when signed out: browser navigation should
  work without OpenAI sign-in, and Codex should clearly explain the OpenAI
  account requirement.
- Tray menu, run-in-background, launch-at-startup, and hidden startup.
- External browser shortcuts for Chrome, Edge, Brave, Opera, and related icons.
- Docker Desktop `host.docker.internal` behavior.
- Real Codex CLI login, token refresh, and OpenAI account capability.

## Manual macOS Checks

These cannot be fully verified in Codex Cloud:

- Developer ID signing and notarization on downloaded DMG/ZIP.
- Gatekeeper launch behavior on a clean machine.
- Mac App Store entitlements, sandbox behavior, provisioning profile, and
  TestFlight/App Store Connect processing. The release workflow can upload the
  package and the store status workflow can report build/review state when API
  secrets are configured, but neither can validate sandbox behavior.
- Optional owner-local `npm run deploy:mas` on macOS with full Xcode,
  certificates, `.p8` API key, and provisioning profile.
- Runtime bundling for arm64/x64 direct macOS builds and the universal Mac App
  Store build.
- External browser `.app` shortcut bundles and icons.
- Tray/menu bar behavior and hidden startup.
- Docker Desktop `host.docker.internal` behavior.
- Real Codex CLI login, token refresh, and browser automation against external
  browsers.
