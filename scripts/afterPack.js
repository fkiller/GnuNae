/**
 * electron-builder afterPack hook
 * Copies node_modules directories that are ignored by default (Windows only)
 * 
 * Note: @openai/codex is in devDependencies, not bundled in the app.
 * - Windows: Uses resources/codex/ via extraResources
 * - macOS: Installs at runtime to ~/Library/Application Support/
 */
const fs = require('fs');
const path = require('path');

exports.default = async function (context) {
    const appOutDir = context.appOutDir;
    const resourcesDir = path.join(appOutDir, 'resources');

    console.log('[afterPack] Platform:', context.packager.platform.name);
    console.log('[afterPack] Targets:', context.targets.map(t => t.name).join(', '));

    // Copy resources/runtime/node_modules and resources/codex/node_modules (Windows only)
    // macOS downloads and installs at runtime
    if (context.packager.platform.name === 'windows') {
        console.log('[afterPack] Copying node_modules to packaged resources...');

        const runtimeSrc = path.join(__dirname, '..', 'resources', 'runtime', 'node_modules');
        const runtimeDest = path.join(resourcesDir, 'runtime', 'node_modules');

        if (fs.existsSync(runtimeSrc)) {
            console.log(`[afterPack] Copying ${runtimeSrc} -> ${runtimeDest}`);
            fs.cpSync(runtimeSrc, runtimeDest, { recursive: true });
        } else {
            console.log(`[afterPack] Warning: ${runtimeSrc} not found`);
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
