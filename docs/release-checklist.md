# GnuNae Release Checklist

This checklist describes the current known release process from repository
inspection. Treat `package.json`, `.github/workflows/release.yml`,
`.github/workflows/docker.yml`, `scripts/*`, and electron-builder config as the
source of truth.

## Current Known Release Process

1. Prepare release changes on a normal branch and merge after review.
2. Bump `package.json` version intentionally. The `postversion` script runs
   `git push && git push --tags`.
3. Push a tag matching `v*`.
4. `.github/workflows/release.yml` starts on the tag. For owner-approved
   store deployment from the selected branch without moving an existing release
   tag, manually dispatch `release.yml` with `release_mode=stores-only` to run
   both MAS and Microsoft Store jobs, or `release_mode=msstore-only` for a
   Microsoft Store-only resubmission after a certification issue.
5. The matrix `build` job runs on macOS and Ubuntu:
   - `npm ci`
   - `node scripts/inject-build-config.js`
   - `npm run build`
   - macOS DMG/ZIP packaging with Developer ID signing and notarization.
   - Linux AppImage/DEB packaging with GPG configuration.
   - Uploads release artifacts.
6. Direct Windows NSIS/portable GitHub-release artifacts are intentionally not
   built, signed, or uploaded. Windows distribution uses Microsoft Store
   deployment.
7. The `build-msstore` job runs on Windows:
   - Configures Microsoft Store Developer CLI.
   - Runs `npm ci`, build config injection, runtime download, Codex install,
     and `npm run build`.
   - Builds APPX, verifies the manifest version against `package.json`, renames
     APPX to MSIX for the CLI, and uploads to Partner Center with
     `msstore publish`.
   - Adds certification notes before publishing. The Partner Center API may
     still show the copied previous package version before ingestion, so the
     built manifest check is the release-time package-version gate.
8. The `build-mas` job runs on macOS:
   - Imports the 3rd Party Mac Developer Application and Installer
     certificates into a temporary keychain.
   - Installs the Mac App Store provisioning profile.
   - Runs `npm run deploy:mas`, which builds the universal MAS package and
     uploads it to App Store Connect with the App Store Connect API key.
9. The `release` job downloads matrix build artifacts and creates a GitHub
   Release with generated notes.
10. `.github/workflows/docker.yml` also runs for `v*` tags and publishes the
   sandbox image to GHCR.
11. `npm run deploy:mas` remains available for owner-controlled local macOS
   uploads, but the normal tag release path is GitHub Actions.
12. `.github/workflows/store-status-watch.yml` can be manually dispatched after
    Store upload/submission. It reads Microsoft Store and App Store Connect
    status and updates the `Store status watch` GitHub Issue. It does not upload
    packages or submit store metadata. Manual dispatch can also generate a
    Microsoft Store appeal email in dry-run mode, or send it only when dedicated
    Microsoft Graph mail secrets and an explicit send confirmation input are
    present.

Important current behavior: the GitHub Release job depends on `build`, not on
`build-msstore` or `build-mas`. Store upload failure may require separate review
even if the GitHub Release is created.

Codex Cloud note: local `.env.local` and GitHub Actions secrets may both be
configured, but Codex Cloud cannot read either. End-to-end signed/store release
validation happens by triggering GitHub Actions and inspecting logs/status, not
by exposing secret values to Codex.

## Pre-release Checks

- Confirm the release issue or checklist is owner-approved.
- Confirm no unrelated changes are included.
- Confirm `package.json` version is the intended release version.
- Review the latest `Maintenance Watch` issue. Resolve or explicitly defer any
  release-blocking Codex CLI, Playwright MCP, Playwright, Electron, MCP SDK,
  Node.js runtime, Docker base image, electron-builder, or GitHub Actions
  finding before tagging.
- Review the latest `Store status watch` issue. Before a new tag, any existing
  Store submission still in review, rejected, or failed should be understood and
  intentionally allowed to proceed.
- Confirm `package-lock.json` is in sync.
- Confirm `package.json` keeps Windows packaging APPX-only unless the owner
  explicitly re-enables standalone NSIS/portable distribution.
- Confirm Codex CLI and Playwright MCP versions are intentionally synchronized
  across `package.json`, `resources/codex/package.json`, `scripts/install-codex.js`,
  `src/core/runtime-manager.ts`, and `docker/Dockerfile`.
- Confirm Docker base image version matches the Playwright version policy.
- For Codex model/runtime changes, confirm `docs/codex-model-runtime.md`
  matches current Native and Docker behavior, including stale-model,
  outdated-CLI, CLI-default, and Docker-image failure paths.
- Run `npm ci`.
- Run `npm run build`.
- Confirm GitHub `CI` passes on Windows, macOS, and Linux for the PR before the
  release candidate is tagged.
- Run `npm run build:docker` if Docker is available.
- Smoke-test the built app locally with `npm run start`.
- Verify Native mode with a real Codex login.
- Verify Virtual Mode with Docker if the release touches Docker, CDP, runtime,
  or Codex execution.
- If Codex CLI/model behavior changed, verify one Native prompt and one Virtual
  Mode prompt after the runtime/image updates.
- Verify external browser chat mode if shortcuts, browser detection, CDP, or
  tray behavior changed.
- Confirm release notes and website/store-facing claims match the actual build.
- Confirm `docs/index.html` `gnunae-version` metadata and `CURRENT_VERSION`
  fallback match the release tag.
- Confirm `www.gnunae.com` download links match current distribution:
  Microsoft Store for Windows, Mac App Store for default macOS download, and
  latest GitHub Release AppImage for Linux.

## Windows Store Checks

- Confirm `package.json` AppX identity fields are unchanged unless owner-approved.
- Confirm `MSSTORE_PUBLISHER_CN`, `MSSTORE_TENANT_ID`, `MSSTORE_CLIENT_ID`,
  `MSSTORE_CLIENT_SECRET`, `MSSTORE_SELLER_ID`, and `MSSTORE_PRODUCT_ID` are
  configured as GitHub Actions secrets.
- Optionally configure `MSSTORE_CERTIFICATION_TEST_ACCOUNT_NOTE` as a GitHub
  Actions secret when Microsoft needs a secure reviewer-account note for
  OpenAI/Codex feature testing.
- These Microsoft Store secrets are consumed by `release.yml`; Codex Cloud can
  verify whether the workflow passed or failed, but cannot inspect their values.
- Confirm `build/appx/*` assets are present and intentionally current.
- Confirm the release workflow APPX publisher override is still present.
- After tag workflow runs, inspect `build-msstore` logs.
- Confirm the Windows package version verified by
  `scripts/msstore-certification.js` matches the current `package.json` version
  as a four-part APPX/MSIX version.
- Before resubmitting after a certification failure, manually run
  `Store Status Watch` with `certification_dry_run=true` on the release branch
  to verify the generated notes and cloud Partner Center credential path in
  dry-run mode.
- Confirm the package was uploaded to Partner Center and that certification
  notes were applied before `msstore submission publish`.
- Confirm Partner Center validation, age rating, listing, screenshots, pricing,
  and availability before submission.
- Manually run `Store Status Watch` after upload/submission and confirm the
  issue shows the expected Microsoft Store status.
- For certification failures, use `Store Status Watch` `appeal_mode=dry_run` to
  review any generated appeal email before sending. Actual send mode requires
  dedicated `MS365_TENANT_ID`, `MS365_CLIENT_ID`, `MS365_CLIENT_SECRET`, and
  optionally `MS365_SENDER_USER` GitHub Actions secrets with Graph `Mail.Send`
  application permission and owner approval of the exact email content.
- Manually smoke-test the Store package when available.

## Mac App Store Checks

- Confirm `package.json` `mas` config, entitlements, provisioning profile path,
  and `ElectronTeamID` behavior are unchanged unless owner-approved.
- Confirm `build/entitlements.mas.plist` and
  `build/entitlements.mas.inherit.plist` are correct for sandboxed MAS builds.
- Confirm `APPLE_TEAM_ID`, `APPLE_CERTIFICATE_APPLICATION_P12`,
  `APPLE_CERTIFICATE_INSTALLER_P12`, `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_PROVISIONING_PROFILE`, `ASC_API_KEY_ID`, `ASC_API_ISSUER_ID`, and
  either `ASC_API_PRIVATE_KEY_BASE64` or `ASC_API_PRIVATE_KEY` are configured as
  GitHub Actions secrets. `APP_STORE_CONNECT_APP_ID` may be set for status
  lookup when bundle ID lookup is not sufficient.
- After tag workflow runs, inspect `build-mas` logs.
- Confirm the `build-mas` job produced and uploaded a universal MAS package.
- Confirm the uploaded build appears in App Store Connect/TestFlight.
- Manually run `Store Status Watch` after upload/submission and confirm the
  issue shows expected TestFlight build processing and App Store version review
  state.
- Confirm App Store availability excludes regions that require unavailable
  permits for OpenAI/ChatGPT-backed functionality, if applicable.

## Signing, Notarization, And Store Cautions

- Do not commit `.env.local`, `certs/`, `.p8`, `.p12`, private keys, or generated
  secret material.
- Do not paste secrets into issues, PRs, or chat.
- Do not change app IDs, bundle IDs, AppX identity, publisher values, product
  IDs, entitlement files, signing scripts, or release workflows without explicit
  owner review.
- Do not run `npm run deploy:mas`, push release tags, or submit store builds as
  part of normal maintenance.
- Treat `scripts/load-env.js`, `scripts/deploy-mas.js`,
  `scripts/inject-build-config.js`, and `scripts/afterPack.js` as release
  sensitive.
- If signing, notarization, or store upload fails because credentials are
  unavailable, document the missing credential and mark the check as needs
  manual confirmation.

## Manual Verification Checklist

- App launches on Windows, macOS, and Linux artifacts where applicable.
- First window opens with tab bar, address bar, browser area, and Codex panel.
- When signed out, the first-run page allows browser navigation without OpenAI
  sign-in and explains that Codex AI features require OpenAI/Codex access.
- New tab, close tab, switch tab, navigation, back, forward, and reload work.
- Settings open in full app and standalone/chat contexts.
- Codex CLI runtime status is correct.
- Codex login flow completes with a real account.
- Native mode can run a basic browser-reading prompt.
- Virtual Mode can create a Docker sandbox and run a basic prompt.
- Codex model/runtime failure handling matches `docs/codex-model-runtime.md`
  for any changed behavior.
- PDS request and store markers work.
- Task creation, scheduling, running, stopping, and blocked state work.
- Bottom Panel output and terminal work.
- External browser detection and chat mode work.
- Microsoft Store Windows package installs, launches, updates, and uninstalls.
- macOS DMG/ZIP installs and passes Gatekeeper.
- Microsoft Store package validation passes.
- Mac App Store/TestFlight build processes successfully.

## Post-release Checks

- Confirm GitHub Release exists with expected artifacts and release notes.
- Confirm the GHCR Docker image `ghcr.io/fkiller/gnunae/sandbox:latest` was
  refreshed by the approved release or main-branch Docker workflow. Treat
  semver/branch/SHA tags as traceability only.
- Confirm no standalone Windows EXE artifacts were published to the GitHub
  Release.
- Confirm macOS artifacts are signed and notarized.
- Confirm Linux artifacts are present and downloadable.
- Confirm Microsoft Partner Center received the MSIX upload.
- Confirm Mac App Store/TestFlight processing result after the `build-mas`
  upload.
- Confirm the latest `Store status watch` issue reflects the expected Microsoft
  Store and Mac App Store status.
- Download artifacts from public release links and run at least one smoke test.
- Update website/download links or store listing text if needed.
- Confirm `www.gnunae.com` renders the new release version after GitHub Pages
  publishes `docs/`.
- Open follow-up issues for any manual checks that failed or were skipped.
