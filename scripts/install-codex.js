#!/usr/bin/env node
/**
 * Install Codex CLI locally using embedded/downloaded Node.js
 * 
 * Usage:
 *   node scripts/install-codex.js [--target <dir>] [--node-path <dir>]
 * 
 * Options:
 *   --target     Target directory for codex module (default: resources/codex)
 *   --node-path  Path to Node.js installation (default: resources/runtime)
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const os = require('os');

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const result = {
        target: null,
        nodePath: null
    };

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--target' && args[i + 1]) {
            result.target = args[++i];
        } else if (args[i] === '--node-path' && args[i + 1]) {
            result.nodePath = args[++i];
        }
    }

    return result;
}

const config = parseArgs();
const PLATFORM = os.platform();
const PROJECT_ROOT = path.join(__dirname, '..');
const DEFAULT_NODE_PATH = path.join(PROJECT_ROOT, 'resources', 'runtime');
const DEFAULT_TARGET = path.join(PROJECT_ROOT, 'resources', 'codex');

const NODE_PATH = config.nodePath ? path.resolve(config.nodePath) : DEFAULT_NODE_PATH;
const TARGET_DIR = config.target ? path.resolve(config.target) : DEFAULT_TARGET;

// Platform-specific paths
const nodeExe = PLATFORM === 'win32'
    ? path.join(NODE_PATH, 'node.exe')
    : path.join(NODE_PATH, 'bin', 'node');
const npmCmd = PLATFORM === 'win32'
    ? path.join(NODE_PATH, 'npm.cmd')
    : path.join(NODE_PATH, 'bin', 'npm');

console.log('='.repeat(50));
console.log('GnuNae Codex CLI Installer');
console.log('='.repeat(50));
console.log(`Platform: ${PLATFORM}`);
console.log(`Node.js path: ${NODE_PATH}`);
console.log(`Target directory: ${TARGET_DIR}`);
console.log('');

// Verify Node.js exists
if (!fs.existsSync(nodeExe)) {
    console.error(`ERROR: Node.js not found at ${nodeExe}`);
    console.error('Please run "npm run download-node" first.');
    process.exit(1);
}

// Get Node.js version
try {
    const nodeVersion = execSync(`"${nodeExe}" --version`, { encoding: 'utf8' }).trim();
    console.log(`Using Node.js: ${nodeVersion}`);
} catch (e) {
    console.error('ERROR: Failed to verify Node.js installation');
    process.exit(1);
}

// Ensure target directory exists
if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
}

// Create package.json if it doesn't exist (needed for npm install)
const packageJsonPath = path.join(TARGET_DIR, 'package.json');
if (!fs.existsSync(packageJsonPath)) {
    console.log('Creating package.json...');
    fs.writeFileSync(packageJsonPath, JSON.stringify({
        name: 'gnunae-runtime',
        version: '1.0.0',
        private: true,
        description: 'GnuNae embedded runtime dependencies'
    }, null, 2));
}

// Check if Codex is already installed
const codexPath = PLATFORM === 'win32'
    ? path.join(TARGET_DIR, 'node_modules', '.bin', 'codex.cmd')
    : path.join(TARGET_DIR, 'node_modules', '.bin', 'codex');

if (fs.existsSync(codexPath)) {
    console.log('Codex CLI already installed. Checking version...');
    try {
        // Build environment with embedded node in PATH
        const env = { ...process.env };
        if (PLATFORM === 'win32') {
            env.PATH = `${NODE_PATH};${env.PATH}`;
        } else {
            env.PATH = `${path.join(NODE_PATH, 'bin')}:${env.PATH}`;
        }

        const codexVersion = execSync(`"${codexPath}" --version`, {
            encoding: 'utf8',
            env,
            cwd: TARGET_DIR
        }).trim();
        console.log(`Current Codex version: ${codexVersion}`);
        console.log('Updating to latest...');
    } catch (e) {
        console.log('Could not get current version, will reinstall.');
    }
}

// Install @openai/codex
console.log('');
console.log('Installing @openai/codex...');

try {
    // Build environment with embedded node in PATH
    const env = { ...process.env };
    if (PLATFORM === 'win32') {
        env.PATH = `${NODE_PATH};${env.PATH}`;
    } else {
        env.PATH = `${path.join(NODE_PATH, 'bin')}:${env.PATH}`;
    }

    // Use the embedded npm to install codex
    const npmArgs = ['install', '@openai/codex@latest', '--save'];

    console.log(`Running: npm ${npmArgs.join(' ')}`);

    const result = spawnSync(npmCmd, npmArgs, {
        cwd: TARGET_DIR,
        env,
        stdio: 'inherit',
        shell: PLATFORM === 'win32'
    });

    if (result.status !== 0) {
        throw new Error(`npm install failed with exit code ${result.status}`);
    }

    // Verify installation
    if (!fs.existsSync(codexPath)) {
        throw new Error('Codex CLI not found after installation');
    }

    // Get installed version
    const codexVersion = execSync(`"${codexPath}" --version`, {
        encoding: 'utf8',
        env,
        cwd: TARGET_DIR
    }).trim();

    console.log('');
    console.log('='.repeat(50));
    console.log('SUCCESS!');
    console.log('='.repeat(50));
    console.log(`Codex CLI: ${codexVersion}`);
    console.log(`Location: ${codexPath}`);
    console.log('');

} catch (error) {
    console.error('');
    console.error('ERROR:', error.message);
    process.exit(1);
}
