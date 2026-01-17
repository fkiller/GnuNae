/**
 * electron-builder afterPack hook
 * Copies node_modules directories that are ignored by default
 */
const fs = require('fs');
const path = require('path');

exports.default = async function (context) {
    const appOutDir = context.appOutDir;
    const resourcesDir = path.join(appOutDir, 'resources');

    console.log('[afterPack] Copying node_modules to packaged resources...');

    // Copy resources/runtime/node_modules
    const runtimeSrc = path.join(__dirname, '..', 'resources', 'runtime', 'node_modules');
    const runtimeDest = path.join(resourcesDir, 'runtime', 'node_modules');

    if (fs.existsSync(runtimeSrc)) {
        console.log(`[afterPack] Copying ${runtimeSrc} -> ${runtimeDest}`);
        fs.cpSync(runtimeSrc, runtimeDest, { recursive: true });
    } else {
        console.log(`[afterPack] Warning: ${runtimeSrc} not found`);
    }

    // Copy resources/codex/node_modules
    const codexSrc = path.join(__dirname, '..', 'resources', 'codex', 'node_modules');
    const codexDest = path.join(resourcesDir, 'codex', 'node_modules');

    if (fs.existsSync(codexSrc)) {
        console.log(`[afterPack] Copying ${codexSrc} -> ${codexDest}`);
        fs.cpSync(codexSrc, codexDest, { recursive: true });
    } else {
        console.log(`[afterPack] Warning: ${codexSrc} not found`);
    }

    console.log('[afterPack] Done copying node_modules');
};
