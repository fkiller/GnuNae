#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'assets', 'Wide310x150Logo.png');
const destDir = path.join(__dirname, '..', 'build', 'appx');
const destPath = path.join(destDir, 'Wide310x150Logo.png');

// Ensure destination directory exists
if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
}

// Copy the file
fs.copyFileSync(srcPath, destPath);
console.log('Successfully copied Wide310x150Logo.png');
console.log('Source:', srcPath);
console.log('Destination:', destPath);

// Verify the copy
const stats = fs.statSync(destPath);
console.log('File size:', stats.size, 'bytes');
