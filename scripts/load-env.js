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
            const value = trimmed.substring(eqIndex + 1).trim();
            process.env[key] = value;
            console.log(`  Loaded: ${key}`);
        }
    }
    console.log('Environment variables loaded from .env.local\n');
} else {
    console.log('No .env.local file found, skipping...\n');
}

// Run electron-builder with the loaded environment
const args = process.argv.slice(2);
const child = spawn('npx', ['electron-builder', ...args], {
    stdio: 'inherit',
    shell: true,
    env: process.env
});

child.on('close', (code) => {
    process.exit(code);
});
