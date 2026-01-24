/**
 * Script to create Wide310x150Logo.png from the original gnunae.png
 * by centering the logo on a 310x150 transparent canvas
 * 
 * This uses Node.js Canvas or can be run with sips for proper padding
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const assetsDir = path.join(__dirname, '..', 'assets');
const sourceLogo = path.join(assetsDir, 'gnunae.png');
const outputFile = path.join(assetsDir, 'Wide310x150Logo.png');

// Target dimensions
const targetWidth = 310;
const targetHeight = 150;

// First, resize the original to fit within 150x150 (maintaining aspect ratio)
const tempResized = path.join(assetsDir, '.temp-resized.png');

try {
    // Resize original to 150x150 max (fits within height)
    execSync(`sips -Z 140 "${sourceLogo}" --out "${tempResized}"`, { stdio: 'inherit' });

    // Now pad to 310x150 (adds horizontal padding)
    execSync(`sips -p ${targetHeight} ${targetWidth} "${tempResized}" --out "${outputFile}"`, { stdio: 'inherit' });

    // Clean up temp file
    if (fs.existsSync(tempResized)) {
        fs.unlinkSync(tempResized);
    }

    console.log('✅ Created Wide310x150Logo.png');
    console.log('   Location:', outputFile);
    console.log('   Dimensions: 310x150 with centered logo');
} catch (err) {
    console.error('Error creating wide logo:', err.message);
    process.exit(1);
}
