#!/usr/bin/env node
/**
 * Cross-platform build script for UI assets
 * Copies login.html and assets after Vite build
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

// Source and destination paths
const sources = [
    { src: 'src/ui/login.html', dest: 'dist/ui/login.html', isDir: false },
    { src: 'assets', dest: 'dist/assets', isDir: true },
];

/**
 * Recursively copy a directory
 */
function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * Copy a file, creating parent directories if needed
 */
function copyFile(src, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
}

// Run the copy operations
console.log('Copying UI assets...');

for (const item of sources) {
    const srcPath = path.join(projectRoot, item.src);
    const destPath = path.join(projectRoot, item.dest);

    if (!fs.existsSync(srcPath)) {
        console.warn(`Warning: Source not found: ${item.src}`);
        continue;
    }

    try {
        if (item.isDir) {
            copyDir(srcPath, destPath);
            console.log(`  Copied directory: ${item.src} -> ${item.dest}`);
        } else {
            copyFile(srcPath, destPath);
            console.log(`  Copied file: ${item.src} -> ${item.dest}`);
        }
    } catch (err) {
        console.error(`Error copying ${item.src}:`, err.message);
        process.exit(1);
    }
}

console.log('UI assets copied successfully!');
