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
- `release.yml` builds app artifacts for macOS, Windows, and Linux, then creates
  a GitHub Release from those artifacts.
- The same workflow has a separate `build-msstore` job that builds APPX/MSIX
  and uploads to Microsoft Partner Center.
- The GitHub Release job currently depends on the matrix `build` job, not on
  `build-msstore`.
- `docker.yml` runs for Docker path PRs, selected branch pushes, manual
  dispatch, and `v*` tags. Non-PR runs push sandbox images to GHCR.
- `dependabot.yml` opens weekly npm dependency updates grouped by dependency
  type.

Current implication: ordinary app PRs do not appear to have a required app build
workflow unless one is added later. Codex should run local safe checks and
document the gap.

## Stale Or Conflicting Docs Found

Committed docs that need caution:

- `docs/PERIODIC_MAINTENANCE.md` describes a release flow with local packaging
  and manual store upload after tagging. Current `release.yml` already performs
  GitHub Release packaging and Microsoft Store upload on `v*` tags, while Mac
  App Store remains local through `npm run deploy:mas`.
- `docs/CI_CD_PACKAGING.md` mostly matches the current workflow, but some
  Microsoft Store sections still describe local `pack:win` plus manual upload.
  Later sections correctly describe the automated `build-msstore` job. Verify
  against `release.yml` before following it.
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

1. Add a minimal PR CI workflow for non-release validation, likely `npm ci` and
   `npm run build`, without changing release automation.
2. Add a PR template and issue templates that capture platform impact,
   release-sensitive files, manual checks, and verification commands.
3. Refresh or mark stale `docs/PERIODIC_MAINTENANCE.md` and
   `docs/CI_CD_PACKAGING.md` based on the current workflows.
4. Decide whether the local uncommitted model-registry work should become a
   separate owner-reviewed feature PR.
5. Add smoke tests or scripted checks for preload IPC contracts, settings
   persistence, task scheduling logic, and Docker API client behavior.
6. Add a manual release-candidate checklist issue template for Windows Store,
   Mac App Store, notarization, installers, Docker image tags, and runtime
   bundling.
7. Add dependency update guidance for Codex CLI, Playwright MCP, Playwright base
   image, Electron, and runtime bundles.
