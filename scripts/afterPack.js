/**
 * electron-builder afterPack hook
 * Copies node_modules directories that are ignored by default (Windows and macOS)
 * 
 * Note: @openai/codex is in devDependencies, not bundled in the app.
 * - Windows: Uses resources/runtime/ via extraResources
 * - macOS (all builds): Uses resources/runtime-darwin-{arch}/ via extraResources
 */
const fs = require('fs');
const path = require('path');

exports.default = async function (context) {
    const appOutDir = context.appOutDir;
    const resourcesDir = path.join(appOutDir, 'resources');
    const platformName = context.packager.platform.name;
    const isMac = platformName === 'mac';
    const arch = context.arch === 3 ? 'arm64' : 'x64'; // electron-builder arch enum: 3=arm64, 1=x64

    console.log('[afterPack] Platform:', platformName);
    console.log('[afterPack] Targets:', context.targets.map(t => t.name).join(', '));
    console.log('[afterPack] Arch:', arch);

    // Copy node_modules for Windows and all macOS builds
    if (platformName === 'windows' || isMac) {
        console.log('[afterPack] Copying node_modules to packaged resources...');

        // Runtime source: Windows uses 'runtime', macOS uses 'runtime-darwin-{arch}'
        const runtimeFolder = isMac ? `runtime-darwin-${arch}` : 'runtime';
        const runtimeSrc = path.join(__dirname, '..', 'resources', runtimeFolder, 'node_modules');
        const runtimeDest = path.join(resourcesDir, 'runtime', 'node_modules');

        if (fs.existsSync(runtimeSrc)) {
            console.log(`[afterPack] Copying ${runtimeSrc} -> ${runtimeDest}`);
            fs.cpSync(runtimeSrc, runtimeDest, { recursive: true });
        } else {
            console.log(`[afterPack] Note: ${runtimeSrc} not found (may not be needed)`);
        }

        const codexSrc = path.join(__dirname, '..', 'resources', 'codex', 'node_modules');
        const codexDest = path.join(resourcesDir, 'codex', 'node_modules');

        if (fs.existsSync(codexSrc)) {
            console.log(`[afterPack] Copying ${codexSrc} -> ${codexDest}`);
            fs.cpSync(codexSrc, codexDest, { recursive: true });
        } else {
            console.log(`[afterPack] Warning: ${codexSrc} not found`);
        }

        console.log('[afterPack] Done copying node_modules');
    }
};
