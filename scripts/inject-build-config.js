/**
 * inject-build-config.js
 * 
 * Pre-build script that injects personal information into package.json
 * from either environment variables (CI) or a local .env.local file.
 * 
 * Usage: node scripts/inject-build-config.js
 * 
 * Environment variables (for CI or from .env.local):
 *   - BUILD_AUTHOR_NAME
 *   - BUILD_AUTHOR_EMAIL
 *   - BUILD_PUBLISHER_NAME
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const ENV_LOCAL_PATH = path.join(ROOT_DIR, '.env.local');

function loadEnvLocal() {
    if (!fs.existsSync(ENV_LOCAL_PATH)) return false;

    const content = fs.readFileSync(ENV_LOCAL_PATH, 'utf8');
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;

        const key = trimmed.substring(0, eqIndex);
        const value = trimmed.substring(eqIndex + 1);

        // Only set if not already in environment (env vars take priority)
        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
    return true;
}

function getConfig() {
    // Try to load .env.local for local builds
    const hasEnvLocal = loadEnvLocal();

    // Check for required env vars (from CI or .env.local)
    if (process.env.BUILD_AUTHOR_NAME && process.env.BUILD_PUBLISHER_NAME) {
        console.log(`[inject-build-config] Using ${hasEnvLocal ? '.env.local' : 'environment variables'}`);
        return {
            authorName: process.env.BUILD_AUTHOR_NAME,
            authorEmail: process.env.BUILD_AUTHOR_EMAIL || '',
            publisherName: process.env.BUILD_PUBLISHER_NAME,
        };
    }

    // No config found - check if placeholders exist
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    if (pkg.author?.name?.includes('__')) {
        console.error('[inject-build-config] ERROR: No config found!');
        console.error('  Either set BUILD_AUTHOR_NAME/BUILD_PUBLISHER_NAME env vars');
        console.error('  or create .env.local with these values');
        process.exit(1);
    }

    // No placeholders - package.json already has real values
    console.log('[inject-build-config] No placeholders found, skipping injection');
    return null;
}

function injectConfig() {
    const config = getConfig();
    if (!config) return;

    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));

    // Inject author info
    if (pkg.author) {
        pkg.author.name = config.authorName;
        pkg.author.email = config.authorEmail;
    }

    // Inject publisher info for Windows signing
    if (pkg.build?.win?.azureSignOptions) {
        pkg.build.win.azureSignOptions.publisherName = config.publisherName;
    }

    // Inject publisher info for AppX
    if (pkg.build?.appx) {
        pkg.build.appx.publisher = config.publisherName;
    }

    fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkg, null, 2) + '\n');
    console.log('[inject-build-config] Successfully injected config into package.json');
}

injectConfig();
