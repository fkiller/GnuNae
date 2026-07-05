# Codex Model And Runtime Handling

This document tracks how GnuNae selects Codex models, how outdated Codex CLI
failures surface, and what Native and Docker mode must do before a model/runtime
change is considered covered.

Code and CI are the source of truth. If this document conflicts with
`src/electron/main.ts`, `src/core/runtime-manager.ts`, `src/ui/constants/codex.ts`,
`docker/Dockerfile`, `docker/api-server.js`, or `.github/workflows/docker.yml`,
trust those files first and update this document in the same PR.

## Current Model Sources

Current committed code uses a static model list:

- Renderer options live in `src/ui/constants/codex.ts`.
- The saved default lives in `src/core/settings.ts`.
- Native Codex execution currently passes `model=gpt-5.4` and
  `model_reasoning_effort=xhigh` from `src/electron/main.ts`.
- Docker/Virtual Mode currently runs `codex exec` without a GnuNae model
  override, so the Codex CLI inside the image chooses its own default.
- Docker image runtime pins live in `docker/Dockerfile`.
- Docker image selection lives in `src/core/docker-manager.ts`; GnuNae uses
  `ghcr.io/fkiller/gnunae/sandbox:latest` and pulls it before sandbox startup,
  falling back to a cached image only when refresh fails after a local image
  already exists.
- Native runtime installation pins live in `src/core/runtime-manager.ts` and
  `scripts/install-codex.js`.

If a dynamic model registry is merged later, update this section with the
registry files, cache compatibility rules, fallback model, and the exact source
order used by the app.

## Current Failure Behavior

Native mode:

1. GnuNae spawns the host Codex CLI with the hardcoded model override.
2. If the selected model is retired, unknown, inaccessible, or requires a newer
   Codex CLI, Codex exits non-zero before useful execution.
3. If the failure text says the configured model or current CLI requires a
   newer Codex CLI, GnuNae upgrades the native app runtime Codex CLI under
   userData, revalidates the executable path, then retries once without
   `model=...`.
4. If the failure is a model-selection/catalog error that does not require a
   newer CLI, GnuNae retries once without `model=...` so the CLI can use its
   own default model.
5. If that default-model retry also fails with model/outdated-CLI text, GnuNae
   upgrades the native app runtime Codex CLI and retries once more without
   `model=...`.
6. Subscription, account access, auth, and billing failures are not treated as
   image/runtime update failures.

Docker/Virtual Mode:

1. The sandbox image contains pinned `@openai/codex` and `@playwright/mcp`
   versions from `docker/Dockerfile`.
2. The container API runs `codex exec --skip-git-repo-check` without an explicit
   model override.
3. Before the container starts, GnuNae pulls
   `ghcr.io/fkiller/gnunae/sandbox:latest`. If the pull fails and no cached
   image exists, Virtual Mode does not start. If a cached image exists, GnuNae
   can start it and the stale-image failure handling below still applies.
4. If the container CLI default model fails because the image has an outdated
   Codex CLI or model catalog, `docker/api-server.js` reports that the sandbox
   image must be updated and suggests `npm run build:docker:clean` for local
   rebuilds.
5. Docker mode does not silently run `npm install -g` inside a live container.
   Container runtime mutation would be temporary and would not fix the pinned
   release image. The durable fix is updating `docker/Dockerfile` and publishing
   a new `latest` sandbox image through CI/CD.

## Required Repair Sequence

When implementing dynamic model selection or runtime repair, cover this sequence
in Native mode:

1. Validate the installed Codex CLI version before trusting model data.
2. If reading Codex CLI model cache, reject cache written by a newer CLI than
   the CLI GnuNae will execute.
3. Prefer running without `model=...` when the user chooses "Codex default" or
   when the saved model is missing from the current compatible model list.
4. If an explicit model fails with "requires newer Codex", "unsupported model",
   "unknown model", "invalid model", "model not found", "deprecated", or model
   access text, clear only the matching saved model and retry once without
   `model=...`.
5. If the no-model retry also fails with outdated-CLI text, update the native
   app runtime Codex CLI, revalidate the executable path/version, reload model
   metadata, and retry once more without `model=...`.
6. If runtime update fails because npm/network/runtime is unavailable, report
   the update failure and stop. Do not keep retrying in a loop.
7. Auth, token refresh, subscription, billing, and account-access failures must
   not delete `~/.codex/auth.json` or mutate account state automatically.

Current committed execution still uses a hardcoded native model override rather
than a saved model setting, so saved-model clearing becomes applicable when the
execution path is wired to the renderer/settings model selection.

For Docker mode, cover the parallel path:

1. Keep Dockerfile Codex CLI, Playwright MCP, and Playwright base-image pins in
   the same dependency maintenance task as the native runtime pins.
2. Build the Docker image on Docker path PRs and publish the `latest` image on
   `main` and approved release tags through `.github/workflows/docker.yml`.
3. If a running sandbox reports outdated Codex/model-catalog failure, tell the
   user to pull or rebuild the sandbox image. Do not claim runtime auto-update
   fixed Docker mode unless the image itself is rebuilt and validated.
4. Verify at least one basic prompt in Native mode and one basic prompt in
   Virtual Mode before release when Codex CLI or model behavior changes.

## Edge Case Matrix

| Case | Native requirement | Docker requirement | Current status |
|------|--------------------|--------------------|----------------|
| Saved/static model retired | Retry once without `model=...`; clear matching saved model only when model settings are wired into execution | Usually unaffected unless image or API passes a model override | Static hardcoded-model retry implemented; saved-model clearing not applicable until execution uses saved models |
| Cache from newer CLI lists unsupported models | Reject cache before showing/using those models | Do not mount host model cache into container unless compatibility is defined | No committed registry |
| CLI too old for explicit model | Update native Codex runtime, revalidate, retry without model | Update Dockerfile/image; running container reports rebuild/pull instruction | Implemented |
| CLI too old for CLI default | Update native Codex runtime, revalidate, retry without model | Update Dockerfile/image; running container reports rebuild/pull instruction | Implemented |
| Account lacks model access | Retry default only if the failure came from an explicit model; otherwise report access/subscription | Report access/subscription; do not rebuild image for account-only failures | Partially classified |
| Auth token expired | Notify re-authentication; do not delete auth during refresh | Notify re-authentication; mounted auth may be refreshing | Partially classified |
| Docker image lags native pins | Maintenance must update Dockerfile and rebuild image | CI must publish refreshed `latest`; client pulls before sandbox start | Maintenance watch checks Docker pins |

## Documentation Checklist

Any PR that changes Codex CLI, models, runtime installation, Codex spawn flags,
or Docker sandbox execution must update or explicitly mark not applicable:

- `AGENTS.md` documentation update rule and source-of-truth summary.
- `docs/PERIODIC_MAINTENANCE.md` version sync and model/runtime checklist.
- `docs/maintenance-playbook.md` operational workflow and stale-doc notes.
- `docs/test-matrix.md` automated and manual Native/Docker checks.
- `docs/CI_CD_PACKAGING.md` when packaging, runtime, Docker image, or release
  behavior changes.
- `README.md` when user-facing setup/configuration changes.
- `.github/ISSUE_TEMPLATE/maintenance_task.yml` if the task scoping fields no
  longer force the right platform coverage.
