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
4. `.github/workflows/release.yml` starts on the tag.
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
   - Builds APPX, renames APPX to MSIX for the CLI, and uploads to Partner
     Center with `msstore publish`.
8. The `release` job downloads matrix build artifacts and creates a GitHub
   Release with generated notes.
9. `.github/workflows/docker.yml` also runs for `v*` tags and publishes the
   sandbox image to GHCR.
10. Mac App Store upload is local, not GitHub Actions: run `npm run deploy:mas`
   on owner-controlled macOS hardware with required certificates, provisioning
   profile, and App Store Connect API key.

Important current behavior: the GitHub Release job depends on `build`, not on
`build-msstore`. Microsoft Store upload failure may require separate review even
if the GitHub Release is created.

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
- Confirm `package-lock.json` is in sync.
- Confirm `package.json` keeps Windows packaging APPX-only unless the owner
  explicitly re-enables standalone NSIS/portable distribution.
- Confirm Codex CLI and Playwright MCP versions are intentionally synchronized
  across `package.json`, `resources/codex/package.json`, `scripts/install-codex.js`,
  `src/core/runtime-manager.ts`, and `docker/Dockerfile`.
- Confirm Docker base image version matches the Playwright version policy.
- Run `npm ci`.
- Run `npm run build`.
- Confirm GitHub `CI` passes on Windows, macOS, and Linux for the PR before the
  release candidate is tagged.
- Run `npm run build:docker` if Docker is available.
- Smoke-test the built app locally with `npm run start`.
- Verify Native mode with a real Codex login.
- Verify Virtual Mode with Docker if the release touches Docker, CDP, runtime,
  or Codex execution.
- Verify external browser chat mode if shortcuts, browser detection, CDP, or
  tray behavior changed.
- Confirm release notes and website/store-facing claims match the actual build.

## Windows Store Checks

- Confirm `package.json` AppX identity fields are unchanged unless owner-approved.
- Confirm `MSSTORE_PUBLISHER_CN`, `MSSTORE_TENANT_ID`, `MSSTORE_CLIENT_ID`,
  `MSSTORE_CLIENT_SECRET`, `MSSTORE_SELLER_ID`, and `MSSTORE_PRODUCT_ID` are
  configured as GitHub Actions secrets.
- These Microsoft Store secrets are consumed by `release.yml`; Codex Cloud can
  verify whether the workflow passed or failed, but cannot inspect their values.
- Confirm `build/appx/*` assets are present and intentionally current.
- Confirm the release workflow APPX publisher override is still present.
- After tag workflow runs, inspect `build-msstore` logs.
- Confirm the package was uploaded to Partner Center.
- Confirm Partner Center validation, age rating, listing, screenshots, pricing,
  and availability before submission.
- Manually smoke-test the Store package when available.

## Mac App Store Checks

- Confirm `package.json` `mas` config, entitlements, provisioning profile path,
  and `ElectronTeamID` behavior are unchanged unless owner-approved.
- Confirm `build/entitlements.mas.plist` and
  `build/entitlements.mas.inherit.plist` are correct for sandboxed MAS builds.
- Confirm `certs/GnuNae.provisionprofile` exists locally and is current.
- Confirm 3rd Party Mac Developer Application and Installer certificates are in
  Keychain.
- Confirm `.env.local` contains `APPLE_TEAM_ID`, `APPLE_CERTIFICATE_PASSWORD`,
  `ASC_API_KEY_ID`, and `ASC_API_ISSUER_ID`.
- Confirm App Store Connect API key file exists at
  `~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8`.
- Run `npm run deploy:mas` only on owner-approved macOS hardware.
- This is the current local-only release step. If the goal is full Cloud
  release automation, create a separate owner-reviewed PR to move MAS packaging
  and upload into GitHub Actions.
- Confirm the uploaded build appears in App Store Connect/TestFlight.
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
- New tab, close tab, switch tab, navigation, back, forward, and reload work.
- Settings open in full app and standalone/chat contexts.
- Codex CLI runtime status is correct.
- Codex login flow completes with a real account.
- Native mode can run a basic browser-reading prompt.
- Virtual Mode can create a Docker sandbox and run a basic prompt.
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
- Confirm Docker image tags exist in GHCR for the exact version and expected
  major/minor or latest tags.
- Confirm no standalone Windows EXE artifacts were published to the GitHub
  Release.
- Confirm macOS artifacts are signed and notarized.
- Confirm Linux artifacts are present and downloadable.
- Confirm Microsoft Partner Center received the MSIX upload.
- Confirm Mac App Store/TestFlight processing result after local upload.
- Download artifacts from public release links and run at least one smoke test.
- Update website/download links or store listing text if needed.
- Open follow-up issues for any manual checks that failed or were skipped.
