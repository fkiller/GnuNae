#!/usr/bin/env node
/**
 * Cross-platform Node.js Portable Downloader
 * Downloads Node.js LTS and extracts to specified directory
 * 
 * Usage:
 *   node scripts/download-node.js [--target <dir>] [--version <ver>]
 * 
 * Options:
 *   --target   Target directory (default: resources/runtime)
 *   --version  Node.js version (default: 22.21.1)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const os = require('os');

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const result = {
        target: null,
        version: '22.21.1',
        platform: null,  // Override platform (darwin, win32, linux)
        arch: null       // Override arch (x64, arm64)
    };

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--target' && args[i + 1]) {
            result.target = args[++i];
        } else if (args[i] === '--version' && args[i + 1]) {
            result.version = args[++i];
        } else if (args[i] === '--platform' && args[i + 1]) {
            result.platform = args[++i];
        } else if (args[i] === '--arch' && args[i + 1]) {
            result.arch = args[++i];
        }
    }

    return result;
}

const config = parseArgs();
const NODE_VERSION = config.version;
// Allow overriding platform/arch for cross-platform downloads
const PLATFORM = config.platform || os.platform(); // 'win32', 'darwin', 'linux'
const ARCH = config.arch || (os.arch() === 'arm64' ? 'arm64' : 'x64');

// Platform-specific settings (generated dynamically based on ARCH)
function getPlatformConfig(platform, arch) {
    const configs = {
        win32: {
            ext: 'zip',
            folder: `node-v${NODE_VERSION}-win-${arch}`,
            url: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-${arch}.zip`,
            nodeExe: 'node.exe',
            npmCmd: 'npm.cmd'
        },
        darwin: {
            ext: 'tar.gz',
            folder: `node-v${NODE_VERSION}-darwin-${arch}`,
            url: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-${arch}.tar.gz`,
            nodeExe: 'bin/node',
            npmCmd: 'bin/npm'
        },
        linux: {
            ext: 'tar.gz',
            folder: `node-v${NODE_VERSION}-linux-${arch}`,
            url: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${arch}.tar.gz`,
            nodeExe: 'bin/node',
            npmCmd: 'bin/npm'
        }
    };
    return configs[platform];
}

const platformConfig = getPlatformConfig(PLATFORM, ARCH);
if (!platformConfig) {
    console.error(`Unsupported platform: ${PLATFORM}`);
    process.exit(1);
}

const PROJECT_ROOT = path.join(__dirname, '..');
// If platform/arch override is specified, use a platform-specific target dir
const DEFAULT_TARGET = (config.platform || config.arch)
    ? path.join(PROJECT_ROOT, 'resources', `runtime-${PLATFORM}-${ARCH}`)
    : path.join(PROJECT_ROOT, 'resources', 'runtime');
const TARGET_DIR = config.target ? path.resolve(config.target) : DEFAULT_TARGET;
const RESOURCES_DIR = path.dirname(TARGET_DIR);
const TEMP_FILE = path.join(RESOURCES_DIR, `node-v${NODE_VERSION}.${platformConfig.ext}`);

console.log('='.repeat(50));
console.log('GnuNae Node.js Portable Downloader');
console.log('='.repeat(50));
console.log(`Platform: ${PLATFORM} (${ARCH})`);
console.log(`Version: ${NODE_VERSION}`);
console.log(`URL: ${platformConfig.url}`);
console.log(`Target: ${TARGET_DIR}`);
console.log('');

// Create resources directory if needed
if (!fs.existsSync(RESOURCES_DIR)) {
    fs.mkdirSync(RESOURCES_DIR, { recursive: true });
    console.log('Created resources directory');
}

// Check if already downloaded
const nodeExePath = path.join(TARGET_DIR, platformConfig.nodeExe);
if (fs.existsSync(nodeExePath)) {
    console.log('Node.js portable already exists. Checking version...');
    try {
        const version = execSync(`"${nodeExePath}" --version`, { encoding: 'utf8' }).trim();
        if (version === `v${NODE_VERSION}`) {
            console.log(`Already have Node.js ${version}. Skipping download.`);
            process.exit(0);
        }
        console.log(`Existing version ${version} differs from target v${NODE_VERSION}. Redownloading...`);
    } catch (e) {
        console.log('Could not verify existing version. Redownloading...');
    }
    fs.rmSync(TARGET_DIR, { recursive: true, force: true });
}

// Download function with progress
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading ${url}...`);

        const file = fs.createWriteStream(dest);
        let downloadedBytes = 0;
        let totalBytes = 0;
        let lastPercent = -1;

        const request = https.get(url, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                fs.unlinkSync(dest);
                return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(dest);
                reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                return;
            }

            totalBytes = parseInt(response.headers['content-length'], 10) || 0;
            console.log(`File size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

            response.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                if (totalBytes > 0) {
                    const percent = Math.floor((downloadedBytes / totalBytes) * 100);
                    if (percent !== lastPercent && percent % 10 === 0) {
                        process.stdout.write(`\rDownloading: ${percent}%`);
                        lastPercent = percent;
                    }
                }
            });

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                console.log('\nDownload complete!');
                resolve();
            });
        });

        request.on('error', (err) => {
            file.close();
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            reject(err);
        });
    });
}

// Extract archive
function extractArchive(archivePath, destPath) {
    console.log(`Extracting to ${destPath}...`);

    const tempExtract = path.join(RESOURCES_DIR, 'node-temp-extract');
    if (fs.existsSync(tempExtract)) {
        fs.rmSync(tempExtract, { recursive: true, force: true });
    }
    fs.mkdirSync(tempExtract, { recursive: true });

    if (PLATFORM === 'win32') {
        // Windows: Use tar.exe (Windows 10+) or PowerShell
        let extracted = false;

        // Method 1: tar.exe (Windows 10 build 17063+)
        try {
            console.log('Extracting with tar...');
            execSync(`tar -xf "${archivePath}" -C "${tempExtract}"`, { stdio: 'inherit' });
            extracted = true;
        } catch (e) {
            console.log('tar failed, trying PowerShell...');
        }

        // Method 2: PowerShell .NET ZipFile
        if (!extracted) {
            try {
                const psScript = `
                    Add-Type -AssemblyName System.IO.Compression.FileSystem
                    [System.IO.Compression.ZipFile]::ExtractToDirectory('${archivePath.replace(/\\/g, '\\\\')}', '${tempExtract.replace(/\\/g, '\\\\')}')
                `;
                execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript}"`, { stdio: 'inherit' });
                extracted = true;
            } catch (e) {
                throw new Error('All Windows extraction methods failed');
            }
        }
    } else {
        // macOS/Linux: Use tar
        execSync(`tar -xzf "${archivePath}" -C "${tempExtract}"`, { stdio: 'inherit' });
    }

    // Move extracted folder to final destination
    const extractedFolder = path.join(tempExtract, platformConfig.folder);
    if (!fs.existsSync(extractedFolder)) {
        throw new Error(`Expected folder not found: ${extractedFolder}`);
    }

    if (fs.existsSync(destPath)) {
        fs.rmSync(destPath, { recursive: true, force: true });
    }
    fs.renameSync(extractedFolder, destPath);
    fs.rmSync(tempExtract, { recursive: true, force: true });

    console.log('Extraction complete!');
}

// Main execution
async function main() {
    try {
        // Download
        await downloadFile(platformConfig.url, TEMP_FILE);

        // Extract
        extractArchive(TEMP_FILE, TARGET_DIR);

        // Clean up
        fs.unlinkSync(TEMP_FILE);
        console.log('Cleaned up temporary files.');

        // Verify
        console.log('');
        console.log('Verifying installation...');

        const nodePath = path.join(TARGET_DIR, platformConfig.nodeExe);
        const npmPath = path.join(TARGET_DIR, platformConfig.npmCmd);

        if (!fs.existsSync(nodePath)) {
            throw new Error(`node executable not found at ${nodePath}`);
        }
        if (!fs.existsSync(npmPath)) {
            throw new Error(`npm not found at ${npmPath}`);
        }

        const nodeVersion = execSync(`"${nodePath}" --version`, { encoding: 'utf8' }).trim();

        // For npm, we need to set up environment
        let npmVersion;
        if (PLATFORM === 'win32') {
            npmVersion = execSync(`"${npmPath}" --version`, { encoding: 'utf8' }).trim();
        } else {
            // On Unix, npm script needs node in PATH
            const env = { ...process.env, PATH: `${path.join(TARGET_DIR, 'bin')}:${process.env.PATH}` };
            npmVersion = execSync(`"${npmPath}" --version`, { encoding: 'utf8', env }).trim();
        }

        console.log('');
        console.log('='.repeat(50));
        console.log('SUCCESS!');
        console.log('='.repeat(50));
        console.log(`Node.js: ${nodeVersion}`);
        console.log(`npm: v${npmVersion}`);
        console.log(`Location: ${TARGET_DIR}`);
        console.log('');

    } catch (error) {
        console.error('');
        console.error('ERROR:', error.message);
        process.exit(1);
    }
}

main();
