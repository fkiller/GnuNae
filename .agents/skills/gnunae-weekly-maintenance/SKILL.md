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
2. **Workspace Isolation & Final `main` Branch Convergence**:
   - **NEVER** modify or stage dirty files in the root workspace (`/Users/wondong/Projects/GnuNae`).
   - All maintenance, package changes, builds, and version bumps must occur inside an isolated worktree at `.worktrees/weekly-maintenance` based on `origin/main`.
   - **Upon completion**, all changes must be merged/pushed into `origin/main`, the temporary worktree (`.worktrees/weekly-maintenance`) and any temporary/merged branches must be cleaned up, and the root workspace (`/Users/wondong/Projects/GnuNae`) must be checked out on `main` and fast-forwarded to `origin/main`.
3. **Explicit Model Addition & Decommission Tracking**:
   - Whenever `src/core/codex-models.json` is checked or updated against `https://developers.openai.com/codex/models`, you **MUST** compare the before/after model manifest and explicitly record:
     - **Added models (`추가된 모델`)**: Newly added active models (or `none` / `없음` if unchanged).
     - **Decommissioned / Deprecated models (`폐기/Decommission된 모델`)**: Models removed from the active `models` list or newly added to `deprecated` (or `none` / `없음` if unchanged).
   - This model addition/decommission summary **MUST** be included in `README.md` (`## Version History`), the git commit/tag message, and the handoff report (`docs/handoff/reports/YYYY-MM-DD-weekly-maintenance-v<NEW_VER>.md`).
4. **Store & Credential Safety**:
   - Never print or leak secret keys or API tokens.
   - Mac App Store uploads must verify `releaseType=AFTER_APPROVAL`.
   - Microsoft Store submissions must verify that the built APPX filename is present as `PendingUpload` and matches the package version before draft publishing.
5. **Scheduled Execution**:
   - Due date state is recorded in `~/.gnunae/maintenance-state.json`.
   - Execution schedule is controlled externally by the user or task scheduler. When invoked, maintenance proceeds immediately without blocking on an elapsed interval.

---

## Quick Execution (Automated Runner)

To execute the entire weekly cycle automatically:

```bash
cd /Users/wondong/Projects/GnuNae
./scripts/run-weekly-maintenance.sh
```

Or run with flags:
- `./scripts/run-weekly-maintenance.sh --dry-run`: Run dependency checks, model sync, and builds without pushing commits, tags, or triggering releases.
- `./scripts/run-weekly-maintenance.sh --check-due`: Check if maintenance is due (exits 0 if up to date, 1 if due).

---

## Detailed Step-by-Step Procedure

If executing or debugging steps manually within the agent session:

### Step 1: Preflight & Environment Check
1. Read `~/.gnunae/maintenance-state.json`.
2. Verify GitHub CLI authentication: `gh auth status`.

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
1. Sync upstream recommended Codex models from `https://developers.openai.com/codex/models`:
   ```bash
   npm run update:codex-models
   ```
2. Check upstream `@openai/codex` CLI version:
   ```bash
   npm view @openai/codex version
   ```
3. Run the model pipeline updater (always run this so changes in `src/core/codex-models.json` or `@openai/codex` version propagate across settings, certification notes, and docs):
   ```bash
   npm run update:openai-model-pipeline -- --codex-version=<TARGET_VERSION>
   ```
4. If `@openai/codex` version changed, refresh lockfiles:
   ```bash
   npm install --package-lock-only --ignore-scripts
   npm --prefix resources/codex install --package-lock-only --ignore-scripts
   npm --prefix resources install --package-lock-only --ignore-scripts
   ```
5. Run model alignment and validation (including upstream source verification):
   ```bash
   npm ci
   npm run check:codex-models
   npm run check:codex-models-source
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

### Step 5: Version Bump, Documentation Sync & Release Tagging
1. If updates are present (or periodic maintenance release is due):
   ```bash
   npm --ignore-scripts --no-git-tag-version version patch
   NEW_VER=$(node -p "require('./package.json').version")
   ```
2. Synchronize documentation and website metadata:
   - Prepend a `### v${NEW_VER} (YYYY-MM-DD)` entry under `## Version History` in `README.md`, explicitly listing **added models** and **decommissioned/deprecated models** alongside the active model catalog and pinned `@openai/codex` CLI reference.
   - Ensure `docs/codex-model-runtime.md`, `docs/PERIODIC_MAINTENANCE.md`, and `docs/handoff/README.md` reflect the current `NEW_VER` and `@openai/codex` pin.
   - Update website download links and version badge in `docs/index.html` to match `v${NEW_VER}`.
3. Commit and push:
   ```bash
   git add package.json package-lock.json resources/ README.md docs/
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
2. Generate handoff report at `docs/handoff/reports/YYYY-MM-DD-weekly-maintenance-v<NEW_VER>.md` following `docs/handoff/RUN-REPORT-TEMPLATE.md`, including the dedicated **Model Catalog Changes (Added / Decommissioned)** section.
3. Push report to `origin/main`.
4. Remove `.worktrees/weekly-maintenance`, delete temporary/merged branches (`maintenance/auto-weekly`), and fast-forward the root workspace (`/Users/wondong/Projects/GnuNae`) on `main` to `origin/main`.
