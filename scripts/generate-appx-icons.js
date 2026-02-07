/**
 * Generate APPX unplated icon assets for Windows Store
 * These icons will show with transparency on the taskbar
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sourceIcon = path.join(__dirname, '..', 'assets', 'gnunae.png');
const outputDir = path.join(__dirname, '..', 'build', 'appx');

// Target sizes for unplated taskbar icons
const targetSizes = [16, 24, 32, 48, 256];

async function generateUnplatedIcons() {
    console.log('Generating unplated APPX icons...');
    console.log('Source:', sourceIcon);
    console.log('Output:', outputDir);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const size of targetSizes) {
        const outputFile = path.join(
            outputDir,
            `Square44x44Logo.targetsize-${size}_altform-unplated.png`
        );

        await sharp(sourceIcon)
            .resize(size, size, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
            })
            .png()
            .toFile(outputFile);

        console.log(`  Created: Square44x44Logo.targetsize-${size}_altform-unplated.png`);
    }

    // Also create targetsize without altform for consistency
    for (const size of targetSizes) {
        const outputFile = path.join(
            outputDir,
            `Square44x44Logo.targetsize-${size}.png`
        );

        await sharp(sourceIcon)
            .resize(size, size, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .png()
            .toFile(outputFile);

        console.log(`  Created: Square44x44Logo.targetsize-${size}.png`);
    }

    console.log('Done!');
}

generateUnplatedIcons().catch(console.error);
