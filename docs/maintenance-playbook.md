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

Documentation updates are part of implementation, not follow-up cleanup. Use
the map in `AGENTS.md` before opening a PR. In particular:

- Codex CLI, model, runtime, or Playwright MCP changes must update
  `docs/codex-model-runtime.md` and must inspect both Native and Docker/Virtual
  Mode behavior.
- Dependency maintenance must cover the Dockerfile/image path whenever it
  touches Codex CLI, Playwright MCP, Playwright, browser automation, or runtime
  pins.
- Release/store/signing changes must update release docs and remain
  owner-reviewed.

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
4. `release.yml` builds signed/notarized macOS artifacts, Linux artifacts,
   uploads Microsoft Store APPX/MSIX through the `build-msstore` job, and
   uploads the universal Mac App Store package through the `build-mas` job.
   Direct Windows NSIS/portable GitHub-release artifacts are intentionally
   skipped.
5. `docker.yml` publishes the refreshed `latest` sandbox image to GHCR. Semver,
   branch, and SHA tags are traceability only unless the app changes its image
   selection policy.
6. Codex can inspect workflow status and logs, but cannot view signing or store
   credentials.

Store review/status tracking after release is separate from deployment:

- `.github/workflows/store-status-watch.yml` runs every six hours and by manual
  dispatch. It executes `scripts/store-status-watch.js`, writes a workflow
  summary, and creates or updates one open GitHub Issue named `Store status
  watch`.
- Windows status comes from the Microsoft Store Developer CLI `submission
  status` command against the configured Partner Center product. When the CLI
  includes Partner Center certification report links, the report should preserve
  them for owner review. The workflow pins the MSStore CLI setup step to the
  `v0.3.7` CLI release line; update that pin only after a GitHub Actions
  status-query run succeeds with the newer CLI.
- Mac App Store status comes from the App Store Connect API using the latest
  macOS build processing state and latest macOS App Store version review state.
- The workflow is read-only. It must not build, upload, submit, publish, change
  metadata, rotate secrets, or alter store configuration.

Mac App Store upload is now part of the tag-triggered release workflow. The
local `npm run deploy:mas` command remains available for owner-controlled
macOS uploads, but the normal release path is the `build-mas` GitHub Actions
job with configured Apple signing and App Store Connect secrets.

## Periodic Maintenance Automation

Periodic maintenance is advisory and PR-driven, not deploy-driven.

`.github/workflows/maintenance-watch.yml` runs weekly and on manual dispatch. It
executes `scripts/maintenance-watch.js`, writes a report to the workflow
summary, and creates or updates one open GitHub Issue titled `Periodic
maintenance watch - YYYY-MM-DD`.

For Codex model/runtime updates, `.github/workflows/codex-models.yml` is the
scheduled/on-demand OpenAI model pipeline task. It regenerates the Codex model
manifest, updates `@openai/codex` pins across Native/package/Docker paths,
refreshes lockfiles, validates the alignment checks, and opens a scoped PR.
Manual dispatch can set a specific `codex_version`; scheduled runs use the
latest npm release.

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
When the accepted item changes Codex CLI, Playwright MCP, Playwright, or model
behavior, the PR must update both native runtime pins and Docker image pins, or
explain why one side is intentionally unchanged.

## Store Status Automation

Store status monitoring is advisory and post-submission oriented.

`.github/workflows/store-status-watch.yml` runs every six hours and by manual
dispatch. It checks:

- Microsoft Store Partner Center submission status through `msstore submission
  status`.
- Mac App Store latest build processing state through the App Store Connect
  builds API.
- Mac App Store latest app version review state through the App Store Connect
  app store versions API.

The workflow updates one GitHub Issue named `Store status watch`. Use that issue
to decide whether owner action is needed in Partner Center, TestFlight, or App
Store Connect.

For Windows certification failures, the issue should include any Partner Center
certification report links emitted by `msstore submission status`, even when the
CLI wraps the report URL across multiple table lines. If the first status query
reports a failure without a link, the monitor may run one additional read-only
verbose status query to recover the pending submission id and construct the
Partner Center report URL.

On manual dispatch only, the workflow can also generate a Microsoft Store appeal
email from `scripts/store-appeal-email.js`. The default `appeal_mode` is `none`;
`dry_run` writes the email body to the workflow summary without mail
credentials; `send` posts through Microsoft Graph only when the required
`MS365_*` secrets are configured and `appeal_send_confirmation` is exactly
`SEND_TO_MICROSOFT_STORE`. Scheduled runs must never send appeal email.

Required GitHub Actions secrets for Windows status:

- `MSSTORE_TENANT_ID`
- `MSSTORE_CLIENT_ID`
- `MSSTORE_CLIENT_SECRET`
- `MSSTORE_SELLER_ID`
- `MSSTORE_PRODUCT_ID`

Required GitHub Actions secrets for Mac App Store status:

- `ASC_API_KEY_ID`
- `ASC_API_ISSUER_ID`
- `ASC_API_PRIVATE_KEY_BASE64` or `ASC_API_PRIVATE_KEY`

Optional Mac App Store status secrets:

- `APP_STORE_CONNECT_APP_ID`
- `APP_STORE_CONNECT_BUNDLE_ID`

If App Store Connect API credentials are absent, the workflow reports Mac status
as manual review instead of submitting anything or failing release automation.

Required GitHub Actions secrets for Microsoft Store appeal email send mode:

- `MS365_TENANT_ID`
- `MS365_CLIENT_ID`
- `MS365_CLIENT_SECRET`

Optional appeal email secret:

- `MS365_SENDER_USER` (defaults to `wdong@bigdad.us` when omitted)

The Microsoft Graph app registration used for appeal email must have `Mail.Send`
application permission with admin consent. Keep this separate from Azure signing
credentials unless the owner explicitly approves sharing that credential scope.

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

- `release.yml` is tag-triggered on `v*`, not a normal PR CI workflow. It can
  also be manually dispatched with `release_mode=stores-only` for
  owner-approved MAS plus Microsoft Store deployment from a selected branch, or
  `release_mode=msstore-only` for Microsoft Store-only resubmission, without
  moving an existing release tag.
- `release.yml` builds app artifacts for macOS and Linux, then creates a GitHub
  Release from those artifacts.
- The same workflow has a separate `build-msstore` job that builds APPX/MSIX,
  creates a no-commit Microsoft Store draft, patches certification notes with
  `scripts/msstore-certification.js`, verifies the built APPX/MSIX manifest
  version against `package.json`, and publishes the draft to Partner Center.
  Partner Center submission reads before ingestion can still show the copied
  previous package version, so the API package-version read is advisory during
  release submission.
- The same workflow has a separate `build-mas` job that builds and uploads the
  universal Mac App Store package to App Store Connect.
- The GitHub Release job currently depends on the matrix `build` job, not on
  `build-msstore` or `build-mas`.
- `docker.yml` runs for Docker path PRs, selected branch pushes, manual
  dispatch, and `v*` tags. Non-PR runs push sandbox images to GHCR.
- `maintenance-watch.yml` runs weekly and by manual dispatch. It creates or
  updates an advisory GitHub Issue and never performs release or store actions.
- `store-status-watch.yml` runs every six hours and by manual dispatch. It
  reads store review/status state and updates an advisory GitHub Issue, but it
  never builds, uploads, submits, publishes, or changes store metadata.
- `store-status-watch.yml` manual dispatch can run with
  `certification_dry_run=true`. That path validates the certification-note
  script in GitHub Actions and performs a dry-run Partner Center read for the
  pending Microsoft Store submission. It does not upload packages, publish
  submissions, or change store metadata.
- `dependabot.yml` opens weekly npm dependency updates grouped by dependency
  type.

Current implication: ordinary app PRs should receive the non-release `CI` build
matrix, while release signing, notarization, store upload, and Docker image
publication remain tag-driven workflows.

## Build Script Notes

`npm run build:ui` runs Vite and then `scripts/build-ui.js`. The helper copies
`src/ui/login.html` and the root `assets/` directory into `dist/`, and injects
the current `package.json` version into copied static UI files. Renderer build
changes that affect login UI, public assets, screenshots, icons, or media must
account for both Vite output and this copy step.

## Stale Or Conflicting Docs Found

Committed docs that need caution:

- `docs/PERIODIC_MAINTENANCE.md` previously described a release flow with local
  packaging and manual store upload after tagging. Current `release.yml`
  performs GitHub Release packaging, Microsoft Store upload, and Mac App Store
  upload on `v*` tags.
- `docs/PERIODIC_MAINTENANCE.md` also had stale model-update guidance that
  treated `src/ui/constants/codex.ts` and a hardcoded `main.ts` model as the
  whole model source. Future maintenance must first inspect the current code:
  static fallback lists, any merged model registry, Codex CLI model cache, and
  OpenAI Codex changelog can all affect the correct update path.
- `docs/codex-model-runtime.md` records the current Codex model/runtime failure
  behavior. It documents the native retry/update sequence for model and
  outdated-CLI failures, while Docker mode pulls the rolling `latest` sandbox
  image before startup and reports outdated sandbox-image failures when the
  image itself must be rebuilt/published.
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
- Earlier local model-registry work has not been observed in the current
  committed code path. If a model registry is reintroduced, update
  `docs/codex-model-runtime.md`, `docs/PERIODIC_MAINTENANCE.md`, and this
  playbook in the same PR.

## Handling Stale Documentation

For stale docs, prefer a small follow-up PR that:

- Adds a top notice stating whether the file is historical, partially stale, or
  superseded.
- Links to the current source-of-truth file.
- Preserves useful historical context.
- Updates commands only after verifying them against code and workflows.
- Avoids changing signing or store configuration in the same PR.

## Recommended Next PRs

1. Add smoke tests for native model/outdated-CLI retry handling and Docker
   outdated-image messaging.
2. Add smoke tests or scripted checks for preload IPC contracts, settings
   persistence, task scheduling logic, and Docker API client behavior.
3. Add a manual release-candidate checklist issue template for Windows Store,
   Mac App Store, notarization, installers, Docker image tags, and runtime
   bundling.
4. Add a lightweight release-candidate issue template that links the latest
   `Store status watch` issue and separates Store portal action from CI logs.
5. Expand maintenance automation later to open scoped draft PRs after the owner
   is comfortable with the advisory issue flow. Keep release and store actions
   owner-approved and tag/manual only.
