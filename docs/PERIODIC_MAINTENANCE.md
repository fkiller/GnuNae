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
| Codex CLI | `package.json`, `resources/codex/package.json`, `docker/Dockerfile`, `runtime-manager.ts`, `install-codex.js` | Each other |
| Playwright MCP | `package.json`, `resources/codex/package.json`, `docker/Dockerfile`, `runtime-manager.ts`, `install-codex.js` | Each other |
| Playwright Base | `docker/Dockerfile` | `package.json` Playwright |
| Docker Image | `docker-manager.ts` | Auto-synced with app version |
| AI Models | Inspect current code first: static fallbacks, any model registry, Codex CLI cache, and Codex spawn config | OpenAI Codex changelog and Codex CLI releases |
| Electron | `package.json`, `package-lock.json`, Electron API usage in `src/electron/main.ts` | Electron releases and breaking changes |
| MCP SDK | `package.json`, `package-lock.json`, MCP integration points | MCP TypeScript SDK releases |
| Node runtime | `scripts/download-node.js`, `src/core/runtime-manager.ts`, packaged `resources/runtime*` | Node.js release/security updates |
| Release workflows | `.github/workflows/release.yml`, `.github/workflows/docker.yml`, `.github/workflows/ci.yml` | GitHub Actions behavior and store/signing requirements |

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
- Check whether prompt, approval, sandbox, MCP, or auth behavior changed.
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

Docker image is **automatically versioned** via:
- `docker-manager.ts` reads version from `package.json`
- GitHub Actions tags image with `v{semver}` on release

---

## Version Synchronization

### Docker Image Versioning

When you push a version tag, GitHub Actions builds:
```
ghcr.io/fkiller/gnunae/sandbox:0.8.31
ghcr.io/fkiller/gnunae/sandbox:0.8
ghcr.io/fkiller/gnunae/sandbox:latest
```

The app automatically requests the correct version via `docker-manager.ts`:
```typescript
// Reads package.json version and uses matching Docker image
imageName: `ghcr.io/fkiller/gnunae/sandbox:${version}`
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
# - Windows NSIS/portable build and Azure signing
# - Linux AppImage/DEB build
# - Microsoft Store APPX/MSIX build and Partner Center upload
# - GitHub Release creation
# - GHCR sandbox image publication

# 6. Current local-only step when needed:
npm run deploy:mas  # owner macOS machine only, uploads Mac App Store build
```

Do not push release tags, submit store packages, or run `npm run deploy:mas`
without explicit owner release approval.

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Docker image not found | Run `docker pull ghcr.io/fkiller/gnunae/sandbox:latest` |
| Version mismatch | Check all files in "Update Files" section |
| Codex CLI upgrade breaks | Check changelog for breaking changes |
| Playwright browser mismatch | Ensure Dockerfile base matches package.json |
