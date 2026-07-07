# GnuNae Periodic Maintenance Guide

> [!IMPORTANT]
> Maintenance source of truth is the current code, `package.json`, scripts,
> Dockerfile, and GitHub Actions workflows. This document must be refreshed as
> part of dependency/runtime/Codex updates. If it conflicts with code or CI,
> trust code and CI first, then update this document in the same PR.

Checklist for periodic dependency, runtime, Codex CLI, model, core library, and
release-flow updates.

## Quick Reference

| Component | Location | Sync With |
|-----------|----------|-----------|
| App Version | `package.json` | All releases |
| Codex CLI | `package.json`, `resources/codex/package.json`, `docker/Dockerfile`, `runtime-manager.ts`, `install-codex.js`, `docs/codex-model-runtime.md` | Native runtime, Docker image, model failure handling |
| Playwright MCP | `package.json`, `resources/codex/package.json`, `docker/Dockerfile`, `runtime-manager.ts`, `install-codex.js`, `docs/codex-model-runtime.md` | Native runtime, Docker image, browser automation |
| Playwright Base | `docker/Dockerfile` | `package.json` Playwright |
| Docker Image | `docker-manager.ts` | Auto-synced with app version |
| AI Models | Inspect current code first: static fallbacks, any model registry, Codex CLI cache, Codex spawn config, Docker API behavior, and `docs/codex-model-runtime.md` | OpenAI Codex docs/changelog, Codex CLI releases, native and Docker runtime pins |
| Electron | `package.json`, `package-lock.json`, Electron API usage in `src/electron/main.ts` | Electron releases and breaking changes |
| MCP SDK | `package.json`, `package-lock.json`, MCP integration points | MCP TypeScript SDK releases |
| Node runtime | `scripts/download-node.js`, `src/core/runtime-manager.ts`, packaged `resources/runtime*` | Node.js release/security updates |
| Release workflows | `.github/workflows/release.yml`, `.github/workflows/docker.yml`, `.github/workflows/ci.yml` | GitHub Actions behavior and store/signing requirements |
| Maintenance watch | `.github/workflows/maintenance-watch.yml`, `scripts/maintenance-watch.js` | Advisory issue only; not deploy automation |
| Store status watch | `.github/workflows/store-status-watch.yml`, `scripts/store-status-watch.js` | Read-only review/status issue only; not deploy automation |
| Website | `docs/index.html`, `docs/CNAME`, GitHub Pages, GitHub Releases | Version, domain, HTTPS, Store/download links |

## Upstream Release Notes To Check

Check upstream "what's new" or release notes before changing versions:

- OpenAI Codex changelog: https://developers.openai.com/codex/changelog
- OpenAI Codex CLI releases: https://github.com/openai/codex/releases
- Playwright release notes: https://playwright.dev/docs/release-notes
- Playwright MCP package: https://www.npmjs.com/package/@playwright/mcp
- Electron releases: https://github.com/electron/electron/releases
- Electron release cadence/support: https://www.electronjs.org/docs/latest/tutorial/electron-timelines
- MCP TypeScript SDK releases: https://github.com/modelcontextprotocol/typescript-sdk/releases
- Node.js releases: https://nodejs.org/en/about/previous-releases
- electron-builder releases: https://github.com/electron-userland/electron-builder/releases
- Microsoft Store Developer CLI: https://github.com/microsoft/msstore-cli

Record the relevant upstream release-note links in the PR body when a version
or runtime change is made.

## Automated Maintenance Watch

Periodic maintenance is part of CI/CD as an advisory scheduled workflow, not as
an automatic deploy step.

`.github/workflows/maintenance-watch.yml` runs weekly and by manual dispatch. It
runs `scripts/maintenance-watch.js`, writes a workflow summary, and creates or
updates a GitHub Issue named `Periodic maintenance watch - YYYY-MM-DD`.

The workflow checks current repository pins against public upstream metadata for
Codex CLI, Playwright MCP, Playwright, Electron, MCP SDK, Node.js,
electron-builder, selected core frontend/build dependencies, Docker base image
pins, GitHub Actions refs, and `www.gnunae.com` website signals.

The workflow must remain non-release automation:

- It does not run when `npm run deploy:mas` is executed locally.
- It does not run as part of the tag-triggered release workflow unless invoked
  separately.
- It does not push tags, sign, notarize, package release artifacts, upload to
  stores, edit files, open bump PRs, or read secrets.
- It does not update `docs/index.html` automatically; website version and
  download-link changes still require a scoped PR.
- It should create maintenance work for Codex/owner review; deployment remains
  owner-approved and tag-driven or manual only.

## Automated Store Status Watch

Store review tracking is part of CI/CD as a read-only scheduled workflow, not as
an automatic deploy or submission step.

`.github/workflows/store-status-watch.yml` runs every six hours and by manual
dispatch. It runs `scripts/store-status-watch.js`, writes a workflow summary,
and creates or updates one GitHub Issue named `Store status watch`.

The workflow pins the MSStore Developer CLI setup step to the `v0.3.7` CLI
release line, matching the locally validated status-query version. Do not move
the workflow back to `latest` unless `msstore submission status` is validated in
GitHub Actions with the newer CLI.

The workflow checks:

- Microsoft Store Partner Center submission status through `msstore submission
  status`, including Partner Center certification report links when the CLI
  includes them in failure output. If a failed status omits the report link,
  the script makes one additional read-only verbose status query to recover the
  pending submission id and construct the Partner Center report URL.
- Mac App Store latest build processing state through the App Store Connect
  builds API.
- Mac App Store latest app version review state through the App Store Connect
  app store versions API.

Manual dispatch can also set `appeal_mode=dry_run` to generate a Microsoft
Store certification appeal email summary from `scripts/store-appeal-email.js`.
Actual `appeal_mode=send` requires dedicated Microsoft Graph `MS365_*` secrets
and `appeal_send_confirmation=SEND_TO_MICROSOFT_STORE`. Scheduled runs must
never send appeal email.

The scheduled status path must remain read-only. Manual appeal send mode is
outbound email only and must not alter Store configuration:

- It does not run when `npm run deploy:mas` is executed locally.
- It does not push tags, sign, notarize, package release artifacts, upload to
  stores, submit store metadata, publish submissions, edit files, or rotate
  secrets.
- It may read GitHub Actions secrets for store APIs, but it must never print
  secret values.
- Missing App Store Connect API credentials should produce a manual-review row,
  not a store submission attempt.

`Store Status Watch` manual dispatch can also run with
`certification_dry_run=true`. Use it after a certification failure to run
`scripts/msstore-certification.js` in GitHub Actions, preview certification
notes, and dry-run the pending submission lookup. It must not upload packages,
publish submissions, or mutate Partner Center metadata.

---

## Maintenance Checklist

### 1. Check Outdated Packages

```bash
npm outdated --json
```

### 2. Update Files (in order)

#### A. Main package.json
- `@openai/codex`
- `@playwright/mcp`
- `@modelcontextprotocol/sdk`
- `playwright`
- `electron`, `electron-builder`
- Other dependencies

#### B. resources/codex/package.json
Sync **exact** versions (no `^` caret) with main package.json:
- `@openai/codex`
- `@playwright/mcp`

#### B2. src/core/runtime-manager.ts
Update the pinned version constants (used for dynamic installation at runtime):
```typescript
export const CODEX_VERSION = '0.118.0';
export const PLAYWRIGHT_MCP_VERSION = '0.0.70';
```

#### B3. scripts/install-codex.js
Update the pinned version constants (must match runtime-manager.ts):
```javascript
const CODEX_VERSION = '0.118.0';
const PLAYWRIGHT_MCP_VERSION = '0.0.70';
```

#### C. docker/Dockerfile
```dockerfile
# Line 9: Match Playwright version
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

# Lines 57-58: Pin versions
RUN npm install -g \
    @openai/codex@0.118.0 \
    @playwright/mcp@0.0.70 \
```

Docker is not optional for Codex/runtime maintenance. When `@openai/codex`,
`@playwright/mcp`, Playwright, Codex model behavior, or Playwright MCP behavior
changes, update and verify the Docker path in the same task:

- `docker/Dockerfile` global package pins and Playwright base image.
- `docker/api-server.js` and `docker/api-server.ts` if execution or failure
  classification changes.
- `.github/workflows/docker.yml` if image build/publish behavior changes.
- `docs/codex-model-runtime.md` if model/runtime fallback behavior changes.

#### D. AI models and Codex capabilities
Do not assume the model list is static. Inspect current code first.

If the active branch uses only static model constants:
- Update `src/ui/constants/codex.ts`.
- Update the default in `src/core/settings.ts`.
- Update Codex spawn defaults in `src/electron/main.ts`.
- Verify Settings and Codex sidebar dropdowns still render valid defaults.

If the active branch has a model registry such as `src/core/model-registry.ts`
or `config/models.json`:
- Treat `src/ui/constants/codex.ts` as a fallback list unless code says
  otherwise.
- Update bundled/remote registry data and fallback constants together.
- Verify the registry source order, default model, reasoning effort, minimum
  Codex CLI version, and stale-model migration behavior.
- Check Codex CLI's own model cache behavior before hardcoding new assumptions.

For both paths:
- Read the OpenAI Codex changelog and Codex CLI release notes.
- Check whether a new model requires a newer `@openai/codex` version.
- Check Native mode and Docker/Virtual Mode separately. Native may use packaged
  or userData runtime; Docker uses the Codex CLI baked into the sandbox image.
- Check whether prompt, approval, sandbox, MCP, or auth behavior changed.
- Update `docs/codex-model-runtime.md` with any changed fallback, retry,
  runtime-update, or Docker image-update behavior.
- Document any model access or subscription limitations as needs manual
  confirmation if code cannot prove them.

#### E. README.md
Add version history entry.

#### F. package.json version
```bash
npm version patch  # or minor/major
```

### 3. Verify Build

```bash
npm install
npm run build
```

For PRs, confirm GitHub `CI` passes on Windows, macOS, and Linux. For release
candidates, monitor the tag-triggered release and Docker workflows.

### 4. Docker Image

Docker image delivery currently uses one rolling runtime tag:
`ghcr.io/fkiller/gnunae/sandbox:latest`.

`docker-manager.ts` requests that tag and pulls it before each sandbox start.
Release semver, branch, and SHA image tags may still be published by CI for
traceability, but the desktop client does not request those tags today.

For dependency maintenance, the Docker image must be updated with native runtime
changes. A Codex CLI update is incomplete until:

- `docker/Dockerfile` pins are updated to the intended Codex CLI and
  Playwright MCP versions.
- `npm run build:docker` passes locally when Docker is available, or the PR
  documents why Docker was unavailable.
- `.github/workflows/docker.yml` is expected to run on Docker path PRs and on
  release tags.
- The release candidate checks confirm the GHCR `latest` sandbox image was
  published from `main` or the approved `v*` release tag.

---

## Version Synchronization

### Docker Image Update Policy

When you push an approved release tag, GitHub Actions builds and publishes the
runtime image:
```
ghcr.io/fkiller/gnunae/sandbox:latest
```

The app automatically requests and refreshes that tag via `docker-manager.ts`:
```typescript
imageName: 'ghcr.io/fkiller/gnunae/sandbox:latest'
```

---

## Release Workflow

```bash
# 1. Make all updates (dependencies, docs)
# 2. Commit changes
git add .
git commit -m "v0.8.31: Dependency upgrades"

# 3. Bump version
npm version patch

# 4. Push with tags when owner-approved
git push && git push --tags

# 5. GitHub Actions handles:
# - macOS DMG/ZIP build, signing, and notarization
# - Windows Store APPX/MSIX build and Partner Center upload
# - Linux AppImage/DEB build
# - Microsoft Store APPX/MSIX build and Partner Center upload
# - Mac App Store universal package build and App Store Connect upload
# - GitHub Release creation
# - GHCR sandbox image publication
```

Do not push release tags, submit store packages, or run `npm run deploy:mas`
without explicit owner release approval.

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Docker image not found | Run `docker pull ghcr.io/fkiller/gnunae/sandbox:latest` |
| Stale Docker image | Confirm `.github/workflows/docker.yml` published `latest`; clients pull this tag before sandbox start |
| Codex CLI upgrade breaks | Check changelog for breaking changes |
| Playwright browser mismatch | Ensure Dockerfile base matches package.json |
