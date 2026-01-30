# GnuNae CI/CD Packaging Documentation

This document describes the complete CI/CD pipeline for building, signing, and distributing GnuNae across all platforms.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Platform-Specific Packaging](#platform-specific-packaging)
   - [macOS Binary (DMG/ZIP)](#1-macos-binary-dmgzip)
   - [Mac App Store (PKG)](#2-mac-app-store-pkg)
   - [Windows Binary (EXE)](#3-windows-binary-exe)
   - [Microsoft Store (APPX)](#4-microsoft-store-appx)
   - [Linux Binary](#5-linux-binary-future)
4. [Environment Variables](#environment-variables)
5. [Local Development Setup](#local-development-setup)
6. [GitHub Actions Workflow](#github-actions-workflow)
7. [Troubleshooting](#troubleshooting)

---

## Overview

GnuNae uses a multi-platform build pipeline that:
- Builds on `macos-latest`, `windows-latest`, and `ubuntu-latest` runners
- Signs binaries using platform-appropriate certificates
- Creates a GitHub Release with all artifacts when a version tag is pushed

### Trigger

The release workflow triggers on version tags:
```
git tag v0.8.14
git push --tags
```

---

## Runtime Installation

GnuNae requires Node.js, npm, and Codex CLI to function. Runtime provisioning differs by platform:

| Aspect | **Windows EXE** | **Windows APPX** | **macOS DMG/ZIP** | **macOS MAS** | **Linux** |
|--------|-----------------|------------------|-------------------|---------------|-----------
| **npm Build** | `pack:win` | `pack:win` | `pack:mac` | `pack:mac-mas` | `pack:linux` |
| **GitHub Actions** | ✅ Yes | ❌ Local only | ✅ Yes | ❌ Local only | ✅ Yes |
| **Output Format** | `.exe` (NSIS) | `.appx` | `.dmg` `.zip` | `.pkg` | `.AppImage` `.deb` |
| **Code Signing** | Azure Trusted Signing | Unsigned (MS Store signs) | Developer ID + Notarization | 3rd Party Mac Developer | GPG |
| **Node.js** | ✅ Embedded | ✅ Embedded | ✅ Embedded | ✅ Embedded | ⬇️ Auto-download |
| **npm** | ✅ Bundled | ✅ Bundled | ✅ Bundled | ✅ Bundled | ⬇️ Bundled with Node |
| **Codex CLI** | ✅ Pre-installed | ✅ Pre-installed | ✅ Pre-installed | ✅ Pre-installed | ⬇️ `npm install` |
| **Storage** | `%LOCALAPPDATA%/GnuNae/` | `%LOCALAPPDATA%/GnuNae/` | App Resources | App Resources | `~/.config/GnuNae/` |

**Legend:** ✅ = Included/Yes, ⬇️ = Downloaded automatically on first run, ❌ = Not included

> [!IMPORTANT]
> **MAS and APPX are NOT built via GitHub Actions.** Build locally and upload manually:
> - **MAS**: `npm run pack:mac-mas` → Upload to App Store Connect via Transporter
> - **APPX**: `npm run pack:win` → Upload to Microsoft Store Partner Center

### How Auto-Install Works

On app startup, `RuntimeManager.ensureRuntime()` checks if runtime is ready:
- **Windows**: Runtime is embedded, no download needed
- **macOS/MAS/Linux**: If not ready, downloads Node.js from nodejs.org and runs `npm install @openai/codex`

The runtime is stored in the user's app data directory (Application Support/AppData), which is accessible in all sandbox environments including MAS.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          GitHub Actions Release Workflow                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │ macOS Runner │    │ Windows      │    │ Linux Runner │                   │
│  │              │    │ Runner       │    │              │                   │
│  ├──────────────┤    ├──────────────┤    ├──────────────┤                   │
│  │ DMG + ZIP    │    │ NSIS         │    │ AppImage     │                   │
│  │ (Developer   │    │ (Azure       │    │ DEB          │                   │
│  │  ID signed + │    │  Trust       │    │ (GPG signed) │                   │
│  │  notarized)  │    │  Signing)    │    │              │                   │
│  └──────────────┘    └──────────────┘    └──────────────┘                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    LOCAL BUILDS ONLY (not in CI/CD)                 │    │
│  │   • MAS/PKG → App Store Connect    • APPX → MS Store Partner Center │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│                         ↓ Upload Artifacts ↓                                 │
│                                                                              │
│                    ┌──────────────────────┐                                  │
│                    │   GitHub Release     │                                  │
│                    │   (all platforms)    │                                  │
│                    └──────────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Platform-Specific Packaging

### 1. macOS Binary (DMG/ZIP)

**Purpose:** Direct distribution via GitHub releases, website download, or homebrew.

**Signing:** Apple Developer ID Application certificate + Notarization

**Output:** `GnuNae-mac-{arch}.dmg`, `GnuNae-mac-{arch}.zip`

#### Certificates Required

| Certificate Type | Description | Where to Get |
|-----------------|-------------|--------------|
| Developer ID Application | Signs the .app bundle | Apple Developer Portal → Certificates |

#### Configuration

**package.json:**
```json
{
  "build": {
    "mac": {
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "notarize": true,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist"
    }
  }
}
```

#### Local Build Command
```bash
npm run pack:mac
# Equivalent to: npm run build && node scripts/load-env.js --mac dmg zip
```

#### Environment Variables

| Variable | Description | GitHub Secret |
|----------|-------------|---------------|
| `APPLE_DEVELOPER_ID_APPLICATION_P12` | Base64-encoded .p12 certificate | ✅ |
| `APPLE_CERTIFICATE_PASSWORD` | Password for .p12 file | ✅ |
| `APPLE_TEAM_ID` | 10-character Apple Team ID | ✅ |
| `APPLE_ID` | Apple ID email (for notarization) | ✅ |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization | ✅ |

#### Special: Embedded Portable Runtime

macOS DMG/ZIP packages include **embedded Node.js and Codex CLI** so users don't need to download anything:

| Component | Build Step | Package Location |
|-----------|------------|------------------|
| Node.js + npm | `npm run download-node-darwin-{arch}` | `resources/runtime-darwin-{arch}/` |
| Codex CLI | `npm run install-codex` | `resources/codex/` |

The `pack:mac` script runs both before packaging:
```bash
npm run download-node-darwin-arm64 && npm run download-node-darwin-x64 && \
npm run install-codex && npm run build && electron-builder --mac dmg zip
```

---

### 2. Mac App Store (PKG)

**Purpose:** Distribution via Mac App Store.

**Signing:** 
- 3rd Party Mac Developer Application (signs the app)
- 3rd Party Mac Developer Installer (signs the pkg)

**Output:** `GnuNae-mac-{arch}.pkg`

#### Certificates Required

| Certificate Type | Description | Where to Get |
|-----------------|-------------|--------------|
| 3rd Party Mac Developer Application | Signs the .app for App Store | Apple Developer Portal |
| 3rd Party Mac Developer Installer | Signs the .pkg installer | Apple Developer Portal |
| Provisioning Profile | Links app to App Store Connect | Apple Developer Portal → Profiles |

#### Configuration

**package.json:**
```json
{
  "build": {
    "mas": {
      "entitlements": "build/entitlements.mas.plist",
      "entitlementsInherit": "build/entitlements.mas.inherit.plist",
      "hardenedRuntime": false,
      "provisioningProfile": "certs/GnuNae.provisionprofile",
      "extendInfo": {
        "ElectronTeamID": "${env.APPLE_TEAM_ID}"
      }
    }
  }
}
```

#### Local Build Command
```bash
npm run pack:mac-mas
# Equivalent to: npm run build && node scripts/load-env.js --mac mas
```

#### Environment Variables

| Variable | Description | GitHub Secret |
|----------|-------------|---------------|
| `APPLE_CERTIFICATE_APPLICATION_P12` | Base64-encoded 3rd Party Mac Developer Application .p12 | ✅ |
| `APPLE_CERTIFICATE_INSTALLER_P12` | Base64-encoded 3rd Party Mac Developer Installer .p12 | ✅ |
| `APPLE_CERTIFICATE_PASSWORD` | Password for .p12 files | ✅ |
| `APPLE_PROVISIONING_PROFILE` | Base64-encoded .provisionprofile | ✅ |
| `APPLE_TEAM_ID` | 10-character Apple Team ID | ✅ |

#### Entitlements

**build/entitlements.mas.plist** (App Store sandbox):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "...">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.network.server</key>
    <true/>
</dict>
</plist>
```

#### Special: Embedded Portable Runtime

MAS packages include **embedded Node.js and Codex CLI** so users don't need to download anything:

| Component | Build Step | Package Location |
|-----------|------------|------------------|
| Node.js + npm | `npm run download-node-darwin-{arch}` | `resources/runtime-darwin-{arch}/` |
| Codex CLI | `npm run install-codex` | `resources/codex/` |

The `pack:mac-mas` script runs both before packaging:
```bash
npm run download-node-darwin-arm64 && npm run download-node-darwin-x64 && \
npm run install-codex && npm run build && electron-builder --mac mas
```

The `afterPack.js` hook copies `node_modules` directories (which electron-builder excludes by default):
```javascript
// scripts/afterPack.js
exports.default = async function(context) {
    // Copies resources/{runtime,codex}/node_modules to packaged app
};
```

At runtime, the app detects MAS builds via `process.mas` and uses embedded resources.

---

### 3. Windows Binary (EXE)

**Purpose:** Direct distribution via GitHub releases, website download.

**Signing:** Azure Trusted Signing (Azure Code Signing)

**Output:** `GnuNae-win-x64.exe` (NSIS installer), portable .exe

#### Prerequisites

1. Azure subscription with Trusted Signing resource
2. Code Signing Account created
3. Certificate Profile created
4. App registration for authentication

#### Configuration

The signing is configured dynamically via CLI flags (not in package.json for security):

**GitHub Actions Command:**
```bash
npx electron-builder --win nsis portable --publish never \
  --config.win.signAndEditExecutable=true \
  --config.win.azureSignOptions.endpoint="https://eus.codesigning.azure.net/" \
  --config.win.azureSignOptions.codeSigningAccountName="$AZURE_CODE_SIGNING_NAME" \
  --config.win.azureSignOptions.certificateProfileName="$AZURE_CERT_PROFILE_NAME" \
  --config.win.azureSignOptions.publisherName="$BUILD_PUBLISHER_NAME"
```

#### Local Build Command
```bash
npm run pack:win
# Includes: download-node, install-codex, build, electron-builder
```

#### Special: Embedded Portable Runtime

Windows packages include **embedded Node.js and Codex CLI** so users don't need to download anything:

| Component | Build Step | Package Location |
|-----------|------------|------------------|
| Node.js + npm | `npm run download-node` | `resources/runtime/` |
| Codex CLI | `npm run install-codex` | `resources/codex/` |

The `pack:win` script runs both before packaging:
```bash
npm run download-node && npm run install-codex && npm run build && electron-builder
```

The `afterPack.js` hook copies `node_modules` directories (which electron-builder excludes by default):
```javascript
// scripts/afterPack.js
exports.default = async function(context) {
    // Copies resources/{runtime,codex}/node_modules to packaged app
};
```

At runtime, the embedded runtime is migrated to `%LOCALAPPDATA%/GnuNae/` for stability (avoids temp folder deletion issues with portable apps).

#### Environment Variables

| Variable | Description | GitHub Secret |
|----------|-------------|---------------|
| `AZURE_TENANT_ID` | Azure Active Directory tenant ID | ✅ |
| `AZURE_CLIENT_ID` | App registration client ID | ✅ |
| `AZURE_CLIENT_SECRET` | App registration client secret | ✅ |
| `AZURE_CODE_SIGNING_NAME` | Code Signing Account name | ✅ |
| `AZURE_CERT_PROFILE_NAME` | Certificate Profile name | ✅ |
| `BUILD_PUBLISHER_NAME` | Publisher CN (e.g., "CN=Company, O=...") | ✅ |

---

### 4. Microsoft Store (APPX)

**Purpose:** Distribution via Microsoft Store.

**Signing:** NOT signed locally - Microsoft Store signs the package during submission.

**Output:** `GnuNae-win-x64.appx`

#### Configuration

**package.json:**
```json
{
  "build": {
    "appx": {
      "identityName": "BigDad.GnuNae",
      "publisher": "${env.MSSTORE_PUBLISHER_CN}",
      "publisherDisplayName": "BigDad",
      "displayName": "GnuNae",
      "applicationId": "GnuNae",
      "backgroundColor": "#0a0a0f"
    }
  }
}
```

#### Local Build Command
```bash
npm run pack:win
# This builds NSIS, Portable, and APPX targets
# Upload the .appx file to MS Store Partner Center
```

#### Environment Variables

| Variable | Description | GitHub Secret |
|----------|-------------|---------------|
| `MSSTORE_PUBLISHER_CN` | Publisher CN from Partner Center (e.g., "CN=12345678-1234-...") | ✅ |
| `CSC_IDENTITY_AUTO_DISCOVERY` | Set to `false` to disable signing | N/A |

#### Getting Publisher CN

1. Go to [Microsoft Partner Center](https://partner.microsoft.com/)
2. Navigate to: Apps → Your App → Product Identity
3. Copy the **Publisher** value (format: `CN=GUID`)

---

### 5. Linux Binary

**Purpose:** Distribution via GitHub releases, package managers.

**Signing:** GPG signature

**Output:** `GnuNae-linux-x64.AppImage`, `GnuNae-linux-x64.deb`

#### Configuration

**package.json:**
```json
{
  "build": {
    "linux": {
      "icon": "assets/gnunae.png",
      "target": ["AppImage", "deb"],
      "category": "Network"
    }
  }
}
```

#### Local Build Command
```bash
npm run pack:linux
```

#### GPG Signing

| Variable | Description | GitHub Secret |
|----------|-------------|---------------|
| `GPG_PRIVATE_KEY` | Base64-encoded GPG private key | ✅ |
| `GPG_KEY` | GPG key ID (e.g., `C90FF75C007E7301`) | Hardcoded in workflow |
| `APPLE_CERTIFICATE_PASSWORD` | Passphrase for GPG key (reused) | ✅ |

#### Creating/Exporting GPG Key

```bash
# Create key (4096-bit RSA, no expiration)
gpg --full-generate-key

# Export for GitHub Secret
gpg --pinentry-mode loopback --armor --export-secret-keys YOUR_KEY_ID | base64 | pbcopy
```

---

## Environment Variables

### Complete Reference

#### Build Configuration
| Variable | Description | Local | GitHub |
|----------|-------------|-------|--------|
| `BUILD_AUTHOR_NAME` | Author name for package.json | `.env.local` | Secret |
| `BUILD_AUTHOR_EMAIL` | Author email for package.json | `.env.local` | Secret |
| `BUILD_PUBLISHER_NAME` | Publisher CN for Windows signing | `.env.local` | Secret |

#### Apple (macOS)
| Variable | Description | Local | GitHub |
|----------|-------------|-------|--------|
| `APPLE_TEAM_ID` | Apple Developer Team ID | `.env.local` | Secret |
| `APPLE_ID` | Apple ID email | `.env.local` | Secret |
| `APPLE_APP_SPECIFIC_PASSWORD` | Notarization password | `.env.local` | Secret |
| `APPLE_DEVELOPER_ID_APPLICATION_P12` | Developer ID cert (base64) | Keychain | Secret |
| `APPLE_CERTIFICATE_APPLICATION_P12` | App Store app cert (base64) | Keychain | Secret |
| `APPLE_CERTIFICATE_INSTALLER_P12` | App Store installer cert (base64) | Keychain | Secret |
| `APPLE_CERTIFICATE_PASSWORD` | .p12 password | `.env.local` | Secret |
| `APPLE_PROVISIONING_PROFILE` | Provisioning profile (base64) | File | Secret |

#### Azure (Windows)
| Variable | Description | Local | GitHub |
|----------|-------------|-------|--------|
| `AZURE_TENANT_ID` | Azure AD tenant ID | `.env.local` | Secret |
| `AZURE_CLIENT_ID` | App registration client ID | `.env.local` | Secret |
| `AZURE_CLIENT_SECRET` | App registration secret | `.env.local` | Secret |
| `AZURE_CODE_SIGNING_NAME` | Code Signing Account name | `.env.local` | Secret |
| `AZURE_CERT_PROFILE_NAME` | Certificate Profile name | `.env.local` | Secret |

#### Microsoft Store
| Variable | Description | Local | GitHub |
|----------|-------------|-------|--------|
| `MSSTORE_PUBLISHER_CN` | Publisher CN from Partner Center | `.env.local` | Secret |

---

## Local Development Setup

### Create `.env.local`

Create `.env.local` in the project root (gitignored):

```bash
# Build Configuration
BUILD_AUTHOR_NAME=Your Name
BUILD_AUTHOR_EMAIL=your@email.com
BUILD_PUBLISHER_NAME=CN=Your Name, O=Your Company, L=City, S=State, C=US

# Apple (macOS builds)
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_ID=your@apple.id
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_CERTIFICATE_PASSWORD=your_p12_password

# Azure Trusted Signing (Windows builds)
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_SECRET=your_client_secret
AZURE_CODE_SIGNING_NAME=YourCodeSigningAccount
AZURE_CERT_PROFILE_NAME=YourCertProfile

# Microsoft Store (APPX builds)
MSSTORE_PUBLISHER_CN=CN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### macOS: Import Certificates

1. Export certificates from Apple Developer Portal as .p12
2. Double-click to import into Keychain
3. For local builds, macOS will use Keychain certificates automatically

### Windows: Azure CLI Login

For local Windows builds with Azure signing:
```powershell
az login
az account set --subscription "Your Subscription"
```

---

## GitHub Actions Workflow

### Secrets Configuration

In your GitHub repository, go to **Settings → Secrets and variables → Actions** and add:

#### Build Secrets
- `BUILD_AUTHOR_NAME`
- `BUILD_AUTHOR_EMAIL`
- `BUILD_PUBLISHER_NAME`

#### Apple Secrets
- `APPLE_TEAM_ID`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_DEVELOPER_ID_APPLICATION_P12` (base64)
- `APPLE_CERTIFICATE_APPLICATION_P12` (base64)
- `APPLE_CERTIFICATE_INSTALLER_P12` (base64)
- `APPLE_PROVISIONING_PROFILE` (base64)

#### Azure Secrets
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_CODE_SIGNING_NAME`
- `AZURE_CERT_PROFILE_NAME`

#### Microsoft Store Secrets
- `MSSTORE_PUBLISHER_CN`

### Base64 Encoding Certificates

```bash
# macOS/Linux
base64 -i certificate.p12 -o certificate.p12.base64
cat certificate.p12.base64

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("certificate.p12"))
```

---

## Troubleshooting

### macOS: "Your application has been modified"
- Ensure `hardenedRuntime: true` in build config
- Check notarization completed successfully

### macOS: App Store rejection - Non-public APIs (PCRE2)

**Error:** `Your app uses or references the following non-public or deprecated APIs: rg` with PCRE2 symbols

**Cause:** If `@openai/codex` is in `dependencies`, it gets bundled into the app's `node_modules/`. The package includes `rg` (ripgrep) binary which statically links PCRE2 library - Apple considers these non-public APIs.

**Solution:** `@openai/codex` is in `devDependencies` (not `dependencies`), so it's NOT bundled in the app.
- macOS installs Codex CLI at runtime to `~/Library/Application Support/GnuNae/codex/`
- Windows uses `resources/codex/` via `extraResources`
- The app only spawns Codex as an external CLI, never imports it as a module

If you see this error, ensure `@openai/codex` is NOT in `dependencies` in package.json.

### macOS: App Store rejection - China Legal (ChatGPT/OpenAI)

**Error:** `Your app appears to be associated with ChatGPT, which does not have requisite permits to operate in China`

**Cause:** Chinese regulations require DST (Deep Synthesis Technologies) permits for ChatGPT/OpenAI services.

**Solution:** Exclude China from App Store availability:
- In App Store Connect → Pricing and Availability → Deselect "China mainland"

This is the standard approach for ChatGPT-integrated apps.

### macOS: General App Store sandbox issues
- Verify sandbox entitlements in `entitlements.mas.plist`
- Ensure no hardened runtime entitlements in MAS build

### Windows: "node_modules not found in packaged app"
- The `afterPack.js` hook copies node_modules after packaging
- Run `npm run download-node && npm run install-codex` before building

### Windows: APPX build fails with "Publisher pattern" error
- Ensure `MSSTORE_PUBLISHER_CN` environment variable is set
- Format must be: `CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`

### Windows: Azure signing fails
- Verify Azure CLI is logged in: `az login`
- Check app registration has signing permissions
- Ensure certificate profile is active

---

## Release Checklist

1. [ ] Update version in `package.json`
2. [ ] Commit changes
3. [ ] Create and push tag: `git tag v0.x.x && git push --tags`
4. [ ] Monitor GitHub Actions workflow
5. [ ] Verify GitHub Release created with all artifacts
6. [ ] Upload APPX to Microsoft Store Partner Center
7. [ ] Upload PKG to App Store Connect via Transporter
