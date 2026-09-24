---
name: gnunae-weekly-maintenance
description: Autonomous weekly maintenance and release routine for GnuNae. Inspects upstream Codex CLI and model pipelines, runs builds and parity checks in Native and Virtual modes, bumps patch version, monitors GitHub Release, Docker GHCR, Microsoft Store, and Mac App Store pipelines, updates store monitoring issues, and writes comprehensive handoff run reports under standing maintenance authorization.
---

# GnuNae Weekly Maintenance & Release Routine

This skill encapsulates the full weekly maintenance lifecycle for the GnuNae repository.
It is authorized to run autonomously from start to finish without pausing for interactive confirmation.

## Core Rules & Invariants

1. **Standing Maintenance Authorization**:
   - The agent is pre-authorized to complete the full routine: dependency review, model catalog sync, packaging, patch version bump, git commit/tag push, CI/CD monitoring, and store submission verification.
   - Do NOT stop for step-by-step confirmation. Proceed through the entire lifecycle and produce a final report.
2. **Workspace Isolation**:
   - **NEVER** modify or stage dirty files in the root workspace (`/Users/wondong/Projects/GnuNae`).
   - All maintenance, package changes, builds, and version bumps must occur inside an isolated worktree at `.worktrees/weekly-maintenance` based on `origin/main`.
3. **Store & Credential Safety**:
   - Never print or leak secret keys or API tokens.
   - Mac App Store uploads must verify `releaseType=AFTER_APPROVAL`.
   - Microsoft Store submissions must verify that the built APPX filename is present as `PendingUpload` and matches the package version before draft publishing.
4. **Catch-up & Due Date Awareness**:
   - Due date state is recorded in `~/.gnunae/maintenance-state.json`.
   - If the scheduled run was missed because the system was offline, catch up immediately upon startup/trigger.

---

## Quick Execution (Automated Runner)

To execute the entire weekly cycle automatically:

```bash
cd /Users/wondong/Projects/GnuNae
./scripts/run-weekly-maintenance.sh
```

Or run with flags:
- `./scripts/run-weekly-maintenance.sh --force`: Run immediately even if 7 days have not elapsed.
- `./scripts/run-weekly-maintenance.sh --dry-run`: Run dependency checks, model sync, and builds without pushing commits, tags, or triggering releases.
- `./scripts/run-weekly-maintenance.sh --check-due`: Check if maintenance is due (exits 0 if up to date, 1 if due).

---

## Detailed Step-by-Step Procedure

If executing or debugging steps manually within the agent session:

### Step 1: Preflight & Due-Date Check
1. Read `~/.gnunae/maintenance-state.json`.
2. Check if 7 days have elapsed since `last_run_timestamp` or if a catch-up run is needed.
3. Verify GitHub CLI authentication: `gh auth status`.

### Step 2: Worktree Isolation
1. Fetch latest changes and tags:
   ```bash
   git fetch origin main --tags
   ```
2. Prepare or reset `.worktrees/weekly-maintenance`:
   ```bash
   git worktree add -B maintenance/auto-weekly .worktrees/weekly-maintenance origin/main || {
     git -C .worktrees/weekly-maintenance checkout maintenance/auto-weekly
     git -C .worktrees/weekly-maintenance fetch origin main --tags
     git -C .worktrees/weekly-maintenance reset --hard origin/main
     git -C .worktrees/weekly-maintenance clean -fd
   }
   ```
3. Perform all subsequent operations within `WORKTREE_DIR=.worktrees/weekly-maintenance`.

### Step 3: Upstream Sync & Model Pipeline
1. Check upstream `@openai/codex` CLI version:
   ```bash
   npm view @openai/codex version
   ```
2. If upstream has a newer version than `package.json`:
   ```bash
   npm run update:openai-model-pipeline -- --codex-version=<NEW_VERSION>
   npm install --package-lock-only --ignore-scripts
   npm --prefix resources/codex install --package-lock-only --ignore-scripts
   npm --prefix resources install --package-lock-only --ignore-scripts
   ```
3. Run model alignment and validation:
   ```bash
   npm ci
   npm run check:codex-models
   npm run check:openai-model-pipeline -- --codex-version=<TARGET_VERSION>
   ```

### Step 4: App Build & Docker Parity
1. Build electron main, preload, core, and UI:
   ```bash
   npm run build
   ```
2. Check Docker daemon and build sandbox container:
   ```bash
   docker info >/dev/null 2>&1 && npm run build:docker || echo "Docker daemon not running; skipping container build."
   ```

### Step 5: Version Bump & Release Tagging
1. If updates are present (or periodic maintenance release is due):
   ```bash
   npm --ignore-scripts --no-git-tag-version version patch
   NEW_VER=$(node -p "require('./package.json').version")
   ```
2. Update website download links and version badge in `docs/index.html` to match `NEW_VER`.
3. Commit and push:
   ```bash
   git add package.json package-lock.json resources/ docs/index.html
   git commit -m "chore(release): v${NEW_VER} weekly maintenance and model pipeline update"
   git push origin maintenance/auto-weekly:main
   git tag "v${NEW_VER}"
   git push origin "v${NEW_VER}"
   ```

### Step 6: CI/CD Pipeline Monitoring
1. Monitor GitHub Actions release workflows:
   ```bash
   gh run list --branch "v${NEW_VER}" --limit 5
   ```
2. Follow and verify:
   - `release.yml`: Matrix build (macOS DMG/ZIP, Linux AppImage/DEB), `build-mas` (Mac App Store altool upload & review submission), and `build-msstore` (Windows APPX packaging, certification notes update, and publish).
   - `docker.yml`: Docker image build and push to GHCR (`ghcr.io/fkiller/gnunae/sandbox:latest` and `v${NEW_VER}`).
3. Verify GitHub Release assets:
   ```bash
   gh release view "v${NEW_VER}"
   ```

### Step 7: Store Status & Monitoring Issue
1. Trigger `store-status-watch.yml` to refresh multi-store tracking:
   ```bash
   gh workflow run store-status-watch.yml
   ```
2. Inspect the latest status reported to GitHub Issue `#48` ("Store status watch").

### Step 8: Handoff Report & State Update
1. Update `~/.gnunae/maintenance-state.json`:
   ```json
   {
     "last_run_timestamp": <CURRENT_TIMESTAMP>,
     "last_run_iso": "<ISO_STRING>",
     "interval_days": 7,
     "next_due_timestamp": <NEXT_TIMESTAMP>,
     "last_status": "SUCCESS",
     "last_version": "v<NEW_VER>"
   }
   ```
2. Generate handoff report at `docs/handoff/reports/YYYY-MM-DD-weekly-maintenance-v<NEW_VER>.md` following `docs/handoff/RUN-REPORT-TEMPLATE.md`.
3. Push report to `origin/main`.
