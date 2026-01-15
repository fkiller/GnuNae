/**
 * inject-build-config.js
 * 
 * Pre-build script that injects personal information into package.json
 * from either environment variables (CI) or a local config file.
 * 
 * Usage: node scripts/inject-build-config.js
 * 
 * Environment variables (for CI):
 *   - BUILD_AUTHOR_NAME
 *   - BUILD_AUTHOR_EMAIL
 *   - BUILD_PUBLISHER_NAME
 * 
 * Local config file: build-config.local.json (git-ignored)
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const LOCAL_CONFIG_PATH = path.join(ROOT_DIR, 'build-config.local.json');

function getConfig() {
    // Priority 1: Environment variables (CI mode)
    if (process.env.BUILD_AUTHOR_NAME && process.env.BUILD_PUBLISHER_NAME) {
        console.log('[inject-build-config] Using environment variables');
        return {
            authorName: process.env.BUILD_AUTHOR_NAME,
            authorEmail: process.env.BUILD_AUTHOR_EMAIL || '',
            publisherName: process.env.BUILD_PUBLISHER_NAME,
        };
    }

    // Priority 2: Local config file
    if (fs.existsSync(LOCAL_CONFIG_PATH)) {
        console.log('[inject-build-config] Using build-config.local.json');
        const config = JSON.parse(fs.readFileSync(LOCAL_CONFIG_PATH, 'utf8'));
        return {
            authorName: config.authorName,
            authorEmail: config.authorEmail || '',
            publisherName: config.publisherName,
        };
    }

    // No config found - check if placeholders exist
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    if (pkg.author?.name?.includes('__')) {
        console.error('[inject-build-config] ERROR: No config found!');
        console.error('  Either set BUILD_AUTHOR_NAME/BUILD_PUBLISHER_NAME env vars');
        console.error('  or create build-config.local.json from build-config.example.json');
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
