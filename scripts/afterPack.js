/**
 * electron-builder afterPack hook
 * Copies runtime and codex directories to the packaged app (Windows and macOS)
 * 
 * Note: We handle these copies here instead of extraResources to avoid
 * symlink conflicts (EEXIST errors) when Node.js bin symlinks already exist.
 * 
 * - Windows: Uses resources/runtime/
 * - macOS (all builds): Uses resources/runtime-darwin-{arch}/
 */
const fs = require('fs');
const path = require('path');

exports.default = async function (context) {
    const appOutDir = context.appOutDir;
    const platformName = context.packager.platform.name;
    const isMac = platformName === 'mac';
    const arch = context.arch === 3 ? 'arm64' : 'x64'; // electron-builder arch enum: 3=arm64, 1=x64

    console.log('[afterPack] Platform:', platformName);
    console.log('[afterPack] Targets:', context.targets.map(t => t.name).join(', '));
    console.log('[afterPack] Arch:', arch);

    // Determine resources directory based on platform
    const resourcesDir = isMac
        ? path.join(appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
        : path.join(appOutDir, 'resources');

    // Copy runtime and codex for Windows and all macOS builds
    if (platformName === 'windows' || isMac) {
        console.log('[afterPack] Copying runtime and codex to packaged resources...');

        // Runtime: Windows uses 'runtime', macOS uses 'runtime-darwin-{arch}'
        const runtimeFolder = isMac ? `runtime-darwin-${arch}` : 'runtime';
        const runtimeSrc = path.join(__dirname, '..', 'resources', runtimeFolder);
        const runtimeDest = path.join(resourcesDir, 'runtime');

        if (fs.existsSync(runtimeSrc)) {
            // Remove existing to avoid symlink conflicts
            if (fs.existsSync(runtimeDest)) {
                console.log(`[afterPack] Removing existing ${runtimeDest}`);
                fs.rmSync(runtimeDest, { recursive: true, force: true });
            }
            console.log(`[afterPack] Copying ${runtimeSrc} -> ${runtimeDest}`);
            fs.cpSync(runtimeSrc, runtimeDest, { recursive: true, verbatimSymlinks: true });
        } else {
            console.log(`[afterPack] Warning: ${runtimeSrc} not found`);
        }

        // Codex
        const codexSrc = path.join(__dirname, '..', 'resources', 'codex');
        const codexDest = path.join(resourcesDir, 'codex');

        if (fs.existsSync(codexSrc)) {
            // Remove existing to avoid symlink conflicts
            if (fs.existsSync(codexDest)) {
                console.log(`[afterPack] Removing existing ${codexDest}`);
                fs.rmSync(codexDest, { recursive: true, force: true });
            }
            console.log(`[afterPack] Copying ${codexSrc} -> ${codexDest}`);
            fs.cpSync(codexSrc, codexDest, { recursive: true, verbatimSymlinks: true });
        } else {
            console.log(`[afterPack] Warning: ${codexSrc} not found`);
        }

        console.log('[afterPack] Done copying runtime and codex');
    }
};
