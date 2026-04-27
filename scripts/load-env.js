/**
 * Load environment variables from .env.local file
 * This script is used before electron-builder to load signing credentials
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const envPath = path.join(__dirname, '..', '.env.local');

if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
            const key = trimmed.substring(0, eqIndex).trim();
            let value = trimmed.substring(eqIndex + 1).trim();
            // Strip surrounding quotes if present (single or double)
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            process.env[key] = value;
            console.log(`  Loaded: ${key}`);
        }
    }
    console.log('Environment variables loaded from .env.local');
    // Debug: show the publisher CN value
    if (process.env.MSSTORE_PUBLISHER_CN) {
        console.log(`  DEBUG MSSTORE_PUBLISHER_CN = "${process.env.MSSTORE_PUBLISHER_CN}"\n`);
    }
} else {
    console.log('No .env.local file found, skipping...\n');
}

// Automatically set a strictly increasing BUILD_VERSION (Unix timestamp) if not provided
// This prevents Apple's ITMS-90189 "Redundant Binary Upload" error when uploading multiple builds for the same app version.
if (!process.env.BUILD_VERSION) {
    process.env.BUILD_VERSION = Math.floor(Date.now() / 1000).toString();
}

// Run electron-builder with the loaded environment
const args = process.argv.slice(2);

// Add config override for appx.publisher if env var is set
// (electron-builder's ${env.X} substitution doesn't work properly for appx.publisher)
if (process.env.MSSTORE_PUBLISHER_CN) {
    args.push(`--config.appx.publisher=${process.env.MSSTORE_PUBLISHER_CN}`);
}

// Pass buildVersion dynamically (Unix timestamp) to prevent Apple's ITMS-90189 error
if (process.env.BUILD_VERSION) {
    args.push(`--config.buildVersion=${process.env.BUILD_VERSION}`);
}

// Ensure MAS builds NEVER attempt to notarize by hiding the credentials from electron-builder.
// MAS builds do not need notarization, but electron-builder can sometimes incorrectly trigger it
// if the mac.notarize=true config leaks into the mas target and the credentials are present in env.
if (args.includes('mas')) {
    delete process.env.APPLE_ID;
    delete process.env.APPLE_APP_SPECIFIC_PASSWORD;
}

const child = spawn('npx', ['electron-builder', ...args], {
    stdio: 'inherit',
    shell: true,
    env: process.env
});

child.on('close', (code) => {
    process.exit(code);
});
