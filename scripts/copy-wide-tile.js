#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const srcPath = '/Users/wondong/.gemini/antigravity/brain/0c2ea9e0-eb4f-4ab9-907a-0f5902d43fa9/wide310x150logo_1769187136569.png';
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
