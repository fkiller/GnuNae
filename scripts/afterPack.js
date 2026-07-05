/**
 * electron-builder afterPack hook
 * Copies runtime and codex directories to the packaged app (Windows and macOS)
 * 
 * Note: We handle these copies here instead of extraResources to avoid
 * symlink conflicts (EEXIST errors) when Node.js bin symlinks already exist.
 * 
 * - Windows: Uses resources/runtime/
 * - macOS direct builds: Uses resources/runtime-darwin-{arch}/
 * - macOS MAS universal builds: Uses both resources/runtime-darwin-* folders
 */
const fs = require('fs');
const path = require('path');

const MAC_RUNTIME_ARCHS = ['arm64', 'x64'];

function getArchName(arch) {
    // electron-builder arch enum: 1=x64, 3=arm64, 4=universal
    if (arch === 3) return 'arm64';
    if (arch === 4) return 'universal';
    return 'x64';
}

function copyReplacing(src, dest) {
    if (!fs.existsSync(src)) {
        console.log(`[afterPack] Warning: ${src} not found`);
        return;
    }

    if (fs.existsSync(dest)) {
        console.log(`[afterPack] Removing existing ${dest}`);
        fs.rmSync(dest, { recursive: true, force: true });
    }

    console.log(`[afterPack] Copying ${src} -> ${dest}`);
    fs.cpSync(src, dest, { recursive: true, verbatimSymlinks: true });
}

exports.default = async function (context) {
    const appOutDir = context.appOutDir;
    const platformName = context.packager.platform.name;
    const isMac = platformName === 'mac';
    const arch = getArchName(context.arch);
    const targetNames = context.targets.map(t => t.name);
    const isMas = isMac && targetNames.includes('mas');

    console.log('[afterPack] Platform:', platformName);
    console.log('[afterPack] Targets:', targetNames.join(', '));
    console.log('[afterPack] Arch:', arch);

    // Determine resources directory based on platform
    const resourcesDir = isMac
        ? path.join(appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
        : path.join(appOutDir, 'resources');

    // Copy runtime and codex for Windows and all macOS builds
    if (platformName === 'windows' || isMac) {
        console.log('[afterPack] Copying runtime and codex to packaged resources...');

        if (isMas) {
            // MAS uses a universal app. Keep both Node runtimes side by side so
            // the app can choose the matching one at launch.
            for (const runtimeArch of MAC_RUNTIME_ARCHS) {
                const runtimeFolder = `runtime-darwin-${runtimeArch}`;
                const runtimeSrc = path.join(__dirname, '..', 'resources', runtimeFolder);
                const runtimeDest = path.join(resourcesDir, runtimeFolder);
                copyReplacing(runtimeSrc, runtimeDest);
            }
        } else {
            // Runtime: Windows uses 'runtime', macOS direct builds use current arch.
            const runtimeFolder = isMac ? `runtime-darwin-${arch}` : 'runtime';
            const runtimeSrc = path.join(__dirname, '..', 'resources', runtimeFolder);
            const runtimeDest = path.join(resourcesDir, 'runtime');
            copyReplacing(runtimeSrc, runtimeDest);
        }

        // Codex
        const codexSrc = path.join(__dirname, '..', 'resources', 'codex');
        const codexDest = path.join(resourcesDir, 'codex');
        copyReplacing(codexSrc, codexDest);

        console.log('[afterPack] Done copying runtime and codex');
    }
};
