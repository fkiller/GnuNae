# GnuNae Maintenance Playbook

This playbook describes how future work should move through Codex Cloud,
GitHub Issues, pull requests, GitHub Actions, and owner-controlled release
steps.

## Documentation Freshness

Code and CI are the source of truth. Before using existing docs as instructions,
compare them with `package.json`, `.github/workflows/*.yml`, `scripts/*`,
`src/electron/main.ts`, `src/electron/preload.ts`, `src/ui/index.tsx`,
`src/core/*`, `docker/*`, and electron-builder configuration.

If documentation conflicts with code or CI:

- Trust code and CI.
- Record the conflict in the task or PR.
- Prefer marking stale docs as historical, stale, or superseded.
- Do not delete old documentation unless it is obviously obsolete and low risk.
- If the conflict involves signing, store identity, entitlements, workflow
  releases, or secrets, stop and request owner review.

## Intended Future Workflow

GitHub Issue → Codex task → PR → GitHub Actions → owner review → merge →
release candidate → store submission.

Expected flow:

1. Owner writes or approves a GitHub Issue with scope, acceptance criteria,
   platform impact, release sensitivity, and known manual checks.
2. Codex works from the issue, inspects source truth, makes a narrow change, and
   opens a PR.
3. GitHub Actions provide available automated checks.
4. Owner reviews behavior, screenshots, logs, and any release-sensitive diff.
5. After merge, release candidates are cut intentionally by tag or owner-run
   packaging commands.
6. Store submissions remain owner-controlled unless a workflow is explicitly
   designed and reviewed for that purpose.

## Cloud And GitHub End-to-end Flow

For normal PRs, the Cloud/GitHub validation path is:

1. Codex opens or updates a PR.
2. GitHub `CI` runs `npm ci` and `npm run build` on Windows, macOS, and Linux.
3. Codex inspects failing logs and fixes repo-owned failures.
4. Owner performs manual desktop checks that CI cannot cover.

For release candidates, the Cloud/GitHub path is the tag-driven release flow:

1. Owner approves the release candidate and tag.
2. A `v*` tag triggers `release.yml` and `docker.yml`.
3. GitHub Actions consumes configured secrets without exposing their values to
   Codex Cloud.
4. `release.yml` builds signed/notarized macOS artifacts, Linux artifacts, and
   uploads Microsoft Store APPX/MSIX through the `build-msstore` job. Direct
   Windows NSIS/portable GitHub-release artifacts are intentionally skipped.
5. `docker.yml` publishes the matching sandbox image to GHCR.
6. Codex can inspect workflow status and logs, but cannot view signing or store
   credentials.

Current local-only release step:

- Mac App Store upload still runs through `npm run deploy:mas` on an
  owner-controlled macOS machine with Xcode, certificates, provisioning profile,
  `.env.local`, and the App Store Connect `.p8` key. Moving this into GitHub
  Actions should be a separate owner-reviewed release-engineering PR.

## Periodic Maintenance Automation

Periodic maintenance is advisory and PR-driven, not deploy-driven.

`.github/workflows/maintenance-watch.yml` runs weekly and on manual dispatch. It
executes `scripts/maintenance-watch.js`, writes a report to the workflow
summary, and creates or updates one open GitHub Issue titled `Periodic
maintenance watch - YYYY-MM-DD`.

The report checks repository pins and public upstream metadata for:

- npm dependencies and dev dependencies that matter to the desktop/runtime
  stack.
- Codex CLI, Playwright MCP, Playwright, Electron, MCP SDK, Node.js runtime,
  electron-builder, and React/Vite/TypeScript versions.
- Runtime pins in `src/core/runtime-manager.ts`.
- Portable Node default in `scripts/download-node.js`.
- Docker base image and globally installed Codex/Playwright MCP pins in
  `docker/Dockerfile`.
- Reusable GitHub Actions refs under `.github/workflows`.
- GitHub Pages website health for `www.gnunae.com`: `docs/CNAME`, Pages
  source branch/path, HTTPS certificate state, homepage version metadata,
  latest GitHub Release tag, Store links, and release asset names used by
  download links.

The workflow is intentionally limited:

- It does not deploy.
- It does not push tags.
- It does not edit files or open dependency bump PRs by itself.
- It does not sign, notarize, package release artifacts, upload to stores, or
  read secret values.
- It does not edit the website automatically. When the report flags a website
  version or download-link mismatch, open a scoped PR against `docs/`.

Use the generated issue to scope narrow Codex tasks. Each accepted maintenance
item should become its own PR unless the coupling is explicitly documented.

## How To Scope Codex Tasks

Good Codex tasks should have one primary outcome. Include:

- A short problem statement.
- The user-visible behavior expected after the change.
- Files or areas likely involved, if known.
- Platforms affected: Windows, macOS, Linux, Docker, Microsoft Store, Mac App
  Store, or all.
- Required verification commands.
- Manual checks that cannot run in cloud.
- Whether release-sensitive files are allowed to change.

Keep separate issues for unrelated concerns. Do not combine dependency updates,
store packaging, UI redesign, Docker changes, and behavior fixes in one task
unless the coupling is unavoidable and documented.

## When Codex Should Stop

Codex should stop and request owner intervention when:

- A task requires secrets, signing certificates, provisioning profiles, store
  account access, App Store Connect, Microsoft Partner Center, Azure signing,
  or private keys.
- The proposed change modifies app identity, bundle IDs, AppX identity,
  publisher data, product IDs, entitlements, signing config, release workflows,
  or store upload behavior without explicit owner approval.
- A local or cloud environment cannot reproduce required OS behavior, such as
  notarization, Store validation, installer behavior, tray/startup integration,
  external browser shortcuts, or Docker Desktop host networking.
- Existing docs conflict with code in a release-sensitive area.
- The issue acceptance criteria are ambiguous enough that a reasonable
  implementation could affect user data, billing, accounts, or irreversible
  browser actions.
- Verification fails for reasons outside the repo, such as unavailable
  credentials or missing platform capabilities.

When stopping, Codex should report the exact blocker, what was already checked,
what remains unverified, and the safest owner action.

## Existing CI And Release Workflows

Interpret workflows from `.github/workflows`, not from older docs alone.

- `release.yml` is tag-triggered on `v*`, not a normal PR CI workflow.
- `release.yml` builds app artifacts for macOS and Linux, then creates a GitHub
  Release from those artifacts.
- The same workflow has a separate `build-msstore` job that builds APPX/MSIX
  and uploads to Microsoft Partner Center.
- The GitHub Release job currently depends on the matrix `build` job, not on
  `build-msstore`.
- `docker.yml` runs for Docker path PRs, selected branch pushes, manual
  dispatch, and `v*` tags. Non-PR runs push sandbox images to GHCR.
- `maintenance-watch.yml` runs weekly and by manual dispatch. It creates or
  updates an advisory GitHub Issue and never performs release or store actions.
- `dependabot.yml` opens weekly npm dependency updates grouped by dependency
  type.

Current implication: ordinary app PRs should receive the non-release `CI` build
matrix, while release signing, notarization, store upload, and Docker image
publication remain tag-driven workflows.

## Build Script Notes

`npm run build:ui` runs Vite and then `scripts/build-ui.js`. The helper copies
`src/ui/login.html` and the root `assets/` directory into `dist/`, so renderer
build changes that affect login UI, public assets, screenshots, icons, or media
must account for both Vite output and this copy step.

## Stale Or Conflicting Docs Found

Committed docs that need caution:

- `docs/PERIODIC_MAINTENANCE.md` describes a release flow with local packaging
  and manual store upload after tagging. Current `release.yml` already performs
  GitHub Release packaging and Microsoft Store upload on `v*` tags, while Mac
  App Store remains local through `npm run deploy:mas`.
- `docs/PERIODIC_MAINTENANCE.md` also had stale model-update guidance that
  treated `src/ui/constants/codex.ts` and a hardcoded `main.ts` model as the
  whole model source. Future maintenance must first inspect the current code:
  static fallback lists, any merged model registry, Codex CLI model cache, and
  OpenAI Codex changelog can all affect the correct update path.
- `docs/CI_CD_PACKAGING.md` mostly matches the current workflow, but some
  Microsoft Store sections still describe local `pack:win` plus manual upload.
  Later sections correctly describe the automated `build-msstore` job. Verify
  against `release.yml` before following it.
- `docs/CI_CD_PACKAGING.md` also omitted several Microsoft Store secrets used by
  `release.yml` (`MSSTORE_TENANT_ID`, `MSSTORE_CLIENT_ID`,
  `MSSTORE_CLIENT_SECRET`) in one secrets table.
- `README.md` describes the main app and package scripts but its workflow list
  is incomplete because it omits `docker.yml` and Dependabot.
- `docs/SIGNING.md` contains concrete certificate details and should be treated
  as owner-reviewed signing documentation before reuse or modification.

Local audit note:

- Untracked `.claude/` guidance files were present locally and mirror older
  agent guidance. No committed file explicitly named Antigravity was found in
  this pass. If legacy Antigravity or Claude notes are committed later, treat
  root `AGENTS.md` and current code/CI as the maintenance baseline.
- Untracked local model-registry work was present during this audit. It was not
  included in this documentation PR and needs owner confirmation before future
  Cloud tasks rely on it.

## Handling Stale Documentation

For stale docs, prefer a small follow-up PR that:

- Adds a top notice stating whether the file is historical, partially stale, or
  superseded.
- Links to the current source-of-truth file.
- Preserves useful historical context.
- Updates commands only after verifying them against code and workflows.
- Avoids changing signing or store configuration in the same PR.

## Recommended Next PRs

1. Decide whether the local uncommitted model-registry work should become a
   separate owner-reviewed feature PR.
2. Add smoke tests or scripted checks for preload IPC contracts, settings
   persistence, task scheduling logic, and Docker API client behavior.
3. Add a manual release-candidate checklist issue template for Windows Store,
   Mac App Store, notarization, installers, Docker image tags, and runtime
   bundling.
4. Decide whether to move Mac App Store upload into GitHub Actions. Treat this
   as release-sensitive because it touches Apple credentials, certificates,
   provisioning profiles, and store submission behavior.
5. Expand maintenance automation later to open scoped draft PRs after the owner
   is comfortable with the advisory issue flow. Keep release and store actions
   owner-approved and tag/manual only.
