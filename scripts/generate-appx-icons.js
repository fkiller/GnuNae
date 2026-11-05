/**
 * Generate Windows ICO and APPX/MSIX icon assets for Microsoft Store and Windows Taskbar.
 *
 * Ensures:
 * 1. assets/gnunae.ico has valid 32-bit BGRA + 1-bit AND transparency masks (bit=1 for transparent)
 *    for 16..128 and a 256x256 RGBA PNG entry so Windows GDI/Shell never renders a black background.
 * 2. build/appx/ includes:
 *    - Base transparent tiles (StoreLogo, Square44x44Logo, Square150x150Logo, Wide310x150Logo, SmallTile, LargeTile)
 *    - Scale variants (.scale-125, .scale-150, .scale-200, .scale-400) for high-DPI Store & Start Menu rendering
 *      (without duplicating Scale=100 default of the unqualified base PNGs in makepri.exe)
 *    - Taskbar targetsize variants (.targetsize-{size}, _altform-unplated, _altform-lightunplated)
 *      so electron-builder's isScaledAssetsProvided() check (.scale- / .targetsize-) triggers makepri.exe
 *      and both dark & light Windows 10/11 taskbars render unplated transparent icons.
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sourceIcon = path.join(__dirname, '..', 'assets', 'gnunae.png');
const icoOutput = path.join(__dirname, '..', 'assets', 'gnunae.ico');
const outputDir = path.join(__dirname, '..', 'build', 'appx');

const targetSizes = [16, 24, 32, 44, 48, 256];
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const extraScales = [125, 150, 200, 400];

const transparentBg = { r: 0, g: 0, b: 0, alpha: 0 };

async function renderSquarePngBuffer(size) {
    return sharp(sourceIcon)
        .resize(size, size, {
            fit: 'contain',
            background: transparentBg,
        })
        .png()
        .toBuffer();
}

async function renderWidePngBuffer(width, height) {
    const logoSize = Math.round(height * 0.88);
    const resizedLogo = await sharp(sourceIcon)
        .resize(logoSize, logoSize, {
            fit: 'contain',
            background: transparentBg,
        })
        .png()
        .toBuffer();

    return sharp({
        create: {
            width,
            height,
            channels: 4,
            background: transparentBg,
        },
    })
        .composite([{ input: resizedLogo, gravity: 'center' }])
        .png()
        .toBuffer();
}

async function createBmpIcoEntry(size) {
    const { data } = await sharp(sourceIcon)
        .resize(size, size, {
            fit: 'contain',
            background: transparentBg,
        })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const headerSize = 40;
    const xorSize = size * size * 4;
    const andRowStride = Math.ceil(size / 32) * 4;
    const andSize = andRowStride * size;
    const buf = Buffer.alloc(headerSize + xorSize + andSize, 0);

    // BITMAPINFOHEADER (biHeight = size * 2 for XOR + AND masks)
    buf.writeUInt32LE(headerSize, 0);
    buf.writeInt32LE(size, 4);
    buf.writeInt32LE(size * 2, 8);
    buf.writeUInt16LE(1, 12); // biPlanes
    buf.writeUInt16LE(32, 14); // biBitCount
    buf.writeUInt32LE(0, 16); // BI_RGB
    buf.writeUInt32LE(xorSize + andSize, 20);

    // Bottom-up rows for both XOR (BGRA) and 1-bit AND mask (bit=1 means transparent)
    for (let y = 0; y < size; y++) {
        const srcRow = size - 1 - y;
        for (let x = 0; x < size; x++) {
            const srcIdx = (srcRow * size + x) * 4;
            const r = data[srcIdx];
            const g = data[srcIdx + 1];
            const b = data[srcIdx + 2];
            const a = data[srcIdx + 3];

            const dstIdx = headerSize + (y * size + x) * 4;
            if (a === 0) {
                buf[dstIdx] = 0;
                buf[dstIdx + 1] = 0;
                buf[dstIdx + 2] = 0;
                buf[dstIdx + 3] = 0;
            } else {
                buf[dstIdx] = b;
                buf[dstIdx + 1] = g;
                buf[dstIdx + 2] = r;
                buf[dstIdx + 3] = a;
            }

            // In Windows ICO AND mask, 1 = transparent, 0 = opaque
            if (a < 128) {
                const byteIdx = headerSize + xorSize + y * andRowStride + (x >> 3);
                const bitMask = 0x80 >> (x & 7);
                buf[byteIdx] |= bitMask;
            }
        }
    }

    return buf;
}

async function generateWindowsIco() {
    console.log('Generating assets/gnunae.ico with valid alpha & AND masks...');
    const entries = [];
    for (const size of icoSizes) {
        if (size === 256) {
            const pngBuf = await renderSquarePngBuffer(256);
            entries.push({ size, data: pngBuf });
        } else {
            const bmpBuf = await createBmpIcoEntry(size);
            entries.push({ size, data: bmpBuf });
        }
    }

    const dirHeaderSize = 6 + entries.length * 16;
    const totalSize = dirHeaderSize + entries.reduce((acc, e) => acc + e.data.length, 0);
    const icoBuf = Buffer.alloc(totalSize, 0);

    icoBuf.writeUInt16LE(0, 0); // Reserved
    icoBuf.writeUInt16LE(1, 2); // Type = 1 (ICO)
    icoBuf.writeUInt16LE(entries.length, 4);

    let dataOffset = dirHeaderSize;
    entries.forEach((entry, idx) => {
        const entryOffset = 6 + idx * 16;
        icoBuf[entryOffset] = entry.size === 256 ? 0 : entry.size;
        icoBuf[entryOffset + 1] = entry.size === 256 ? 0 : entry.size;
        icoBuf[entryOffset + 2] = 0; // Palette count
        icoBuf[entryOffset + 3] = 0; // Reserved
        icoBuf.writeUInt16LE(1, entryOffset + 4); // Color planes
        icoBuf.writeUInt16LE(32, entryOffset + 6); // Bits per pixel
        icoBuf.writeUInt32LE(entry.data.length, entryOffset + 8);
        icoBuf.writeUInt32LE(dataOffset, entryOffset + 12);

        entry.data.copy(icoBuf, dataOffset);
        dataOffset += entry.data.length;
    });

    fs.writeFileSync(icoOutput, icoBuf);
    console.log(`  Created: ${path.relative(process.cwd(), icoOutput)} (${icoSizes.join(', ')}px)`);
}

async function generateAppxIcons() {
    console.log('Generating APPX icon assets in build/appx/...');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Remove existing PNGs in build/appx to avoid duplicate resource qualifiers in makepri.exe
    for (const existing of fs.readdirSync(outputDir)) {
        if (existing.endsWith('.png')) {
            fs.unlinkSync(path.join(outputDir, existing));
        }
    }

    // 1. Base square tiles (default Scale=100 in priconfig.xml)
    const baseSquares = [
        { name: 'StoreLogo.png', size: 50 },
        { name: 'Square44x44Logo.png', size: 44 },
        { name: 'Square150x150Logo.png', size: 150 },
        { name: 'SmallTile.png', size: 71 },
        { name: 'LargeTile.png', size: 310 },
    ];
    for (const tile of baseSquares) {
        const buf = await renderSquarePngBuffer(tile.size);
        fs.writeFileSync(path.join(outputDir, tile.name), buf);
    }

    // 2. Base wide tile (310x150)
    const wideBase = await renderWidePngBuffer(310, 150);
    fs.writeFileSync(path.join(outputDir, 'Wide310x150Logo.png'), wideBase);
    fs.writeFileSync(path.join(__dirname, '..', 'assets', 'Wide310x150Logo.png'), wideBase);

    // 3. Scale variants (.scale-125..400) for StoreLogo, Square44x44Logo, Square150x150Logo, Wide310x150Logo
    const scaledSquareBases = [
        { prefix: 'StoreLogo', base: 50 },
        { prefix: 'Square44x44Logo', base: 44 },
        { prefix: 'Square150x150Logo', base: 150 },
    ];
    for (const item of scaledSquareBases) {
        for (const scale of extraScales) {
            const px = Math.round((item.base * scale) / 100);
            const buf = await renderSquarePngBuffer(px);
            fs.writeFileSync(path.join(outputDir, `${item.prefix}.scale-${scale}.png`), buf);
        }
    }
    for (const scale of extraScales) {
        const w = Math.round((310 * scale) / 100);
        const h = Math.round((150 * scale) / 100);
        const buf = await renderWidePngBuffer(w, h);
        fs.writeFileSync(path.join(outputDir, `Wide310x150Logo.scale-${scale}.png`), buf);
    }

    // 4. Taskbar targetsize variants (plated, unplated dark, and lightunplated)
    // Note: Using Square44x44Logo.targetsize-{size}*.png ensures electron-builder's
    // isScaledAssetsProvided() (which checks for ".scale-" or ".targetsize-") runs makepri.exe
    // with zero duplicate resource candidate collisions.
    for (const size of targetSizes) {
        const buf = await renderSquarePngBuffer(size);
        const variants = [
            `Square44x44Logo.targetsize-${size}.png`,
            `Square44x44Logo.targetsize-${size}_altform-unplated.png`,
            `Square44x44Logo.targetsize-${size}_altform-lightunplated.png`,
        ];
        for (const filename of variants) {
            fs.writeFileSync(path.join(outputDir, filename), buf);
        }
    }

    // 5. Also refresh assets/gnunae-71.png, gnunae-150.png, gnunae-300.png with transparent background
    for (const sz of [71, 150, 300]) {
        const buf = await renderSquarePngBuffer(sz);
        fs.writeFileSync(path.join(__dirname, '..', 'assets', `gnunae-${sz}.png`), buf);
    }

    console.log('Done! Generated transparent ICO and APPX icon assets.');
}

async function main() {
    await generateWindowsIco();
    await generateAppxIcons();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
