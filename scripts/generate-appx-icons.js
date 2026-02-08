/**
 * Generate APPX unplated icon assets for Windows Store
 * These icons will show with transparency on the taskbar
 * 
 * Naming convention: Square44x44Logo.altform-unplated_targetsize-{size}.png
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sourceIcon = path.join(__dirname, '..', 'assets', 'gnunae.png');
const outputDir = path.join(__dirname, '..', 'build', 'appx');

// Target sizes for unplated taskbar icons
// 44 is the primary taskbar size, but Windows may use others
const targetSizes = [16, 24, 32, 44, 48, 256];

async function generateUnplatedIcons() {
    console.log('Generating unplated APPX icons...');
    console.log('Source:', sourceIcon);
    console.log('Output:', outputDir);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate Square44x44Logo.altform-unplated_targetsize-XX.png
    // This naming convention is what Windows expects for unplated icons
    for (const size of targetSizes) {
        const outputFile = path.join(
            outputDir,
            `Square44x44Logo.altform-unplated_targetsize-${size}.png`
        );

        await sharp(sourceIcon)
            .resize(size, size, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
            })
            .png()
            .toFile(outputFile);

        console.log(`  Created: Square44x44Logo.altform-unplated_targetsize-${size}.png`);
    }

    console.log('Done! Unplated icons generated.');
    console.log('');
    console.log('These icons tell Windows to display the app icon WITHOUT a background plate on the taskbar.');
}

generateUnplatedIcons().catch(console.error);
