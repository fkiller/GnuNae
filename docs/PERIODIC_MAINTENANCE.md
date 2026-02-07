# GnuNae Periodic Maintenance Guide

Checklist for periodic dependency updates and version synchronization.

## Quick Reference

| Component | Location | Sync With |
|-----------|----------|-----------|
| App Version | `package.json` | All releases |
| Codex CLI | `package.json`, `resources/codex/package.json`, `docker/Dockerfile` | Each other |
| Playwright MCP | `package.json`, `resources/codex/package.json`, `docker/Dockerfile` | Each other |
| Playwright Base | `docker/Dockerfile` | `package.json` Playwright |
| Docker Image | `docker-manager.ts` | Auto-synced with app version |
| AI Models | `src/ui/constants/codex.ts` | OpenAI releases |

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
Sync versions with main package.json:
- `@openai/codex`
- `@playwright/mcp`

#### C. docker/Dockerfile
```dockerfile
# Line 9: Match Playwright version
FROM mcr.microsoft.com/playwright:v1.58.2-jammy

# Lines 57-58: Pin versions
RUN npm install -g \
    @openai/codex@0.98.0 \
    @playwright/mcp@0.0.64 \
```

#### D. src/ui/constants/codex.ts
Add new AI models as OpenAI releases them.

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

# 4. Push (triggers Docker build on main)
git push && git push --tags

# 5. Build app packages
npm run pack:win
npm run pack:mac

# 6. Upload to stores
# - APPX → MS Store Partner Center
# - PKG → App Store Connect
```

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Docker image not found | Run `docker pull ghcr.io/fkiller/gnunae/sandbox:latest` |
| Version mismatch | Check all files in "Update Files" section |
| Codex CLI upgrade breaks | Check changelog for breaking changes |
| Playwright browser mismatch | Ensure Dockerfile base matches package.json |
