/**
 * deploy-mas.js
 * 
 * Automated Mac App Store deployment script.
 * Builds MAS .pkg files for both architectures and uploads them
 * to App Store Connect via `xcrun altool` using API Key authentication.
 * 
 * Usage: node scripts/deploy-mas.js
 *        npm run deploy:mas
 * 
 * Prerequisites:
 *   1. App Store Connect API Key (.p8) placed in:
 *      ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8
 *   2. .env.local must contain:
 *      - ASC_API_KEY_ID=<your key id>
 *      - ASC_API_ISSUER_ID=<your issuer id>
 *   3. 3rd Party Mac Developer certificates in Keychain
 *   4. Provisioning profile at certs/GnuNae.provisionprofile
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const RELEASE_DIR = path.join(ROOT_DIR, 'release');
const ENV_LOCAL_PATH = path.join(ROOT_DIR, '.env.local');

// ── Helpers ──────────────────────────────────────────────────

function log(emoji, msg) {
    console.log(`\n${emoji}  ${msg}`);
}

function run(cmd, opts = {}) {
    console.log(`   $ ${cmd}`);
    try {
        execSync(cmd, {
            stdio: 'inherit',
            cwd: ROOT_DIR,
            env: { ...process.env },
            ...opts,
        });
    } catch (err) {
        console.error(`\n❌ Command failed: ${cmd}`);
        process.exit(1);
    }
}

function loadEnvLocal() {
    if (!fs.existsSync(ENV_LOCAL_PATH)) {
        console.error('❌ .env.local not found. Cannot load API credentials.');
        process.exit(1);
    }
    const content = fs.readFileSync(ENV_LOCAL_PATH, 'utf8');
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
            const key = trimmed.substring(0, eqIndex).trim();
            let value = trimmed.substring(eqIndex + 1).trim();
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            if (!process.env[key]) {
                process.env[key] = value;
            }
        }
    }
}

function findPkgFilesRecursive(dir) {
    if (!fs.existsSync(dir)) return [];
    let results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(findPkgFilesRecursive(fullPath));
        } else if (entry.name.endsWith('.pkg')) {
            results.push(fullPath);
        }
    }
    return results;
}

function findPkgFiles() {
    return findPkgFilesRecursive(RELEASE_DIR);
}

function findAltool() {
    // altool is inside Xcode.app, but xcrun can't find it if xcode-select
    // points to CommandLineTools. Check known Xcode locations first.
    const xcodePaths = [
        '/Applications/Xcode.app/Contents/Developer/usr/bin/altool',
        '/Applications/Xcode-beta.app/Contents/Developer/usr/bin/altool',
    ];

    for (const p of xcodePaths) {
        if (fs.existsSync(p)) return p;
    }

    // Fall back to xcrun (works if xcode-select points to Xcode.app)
    try {
        const result = execSync('xcrun --find altool 2>/dev/null', { encoding: 'utf8' }).trim();
        if (result && fs.existsSync(result)) return result;
    } catch (_) {}

    return null;
}

function validateApiKeySetup() {
    const keyId = process.env.ASC_API_KEY_ID;
    const issuerId = process.env.ASC_API_ISSUER_ID;

    if (!keyId || !issuerId) {
        console.error('❌ Missing App Store Connect API credentials in .env.local:');
        if (!keyId) console.error('   - ASC_API_KEY_ID');
        if (!issuerId) console.error('   - ASC_API_ISSUER_ID');
        console.error('\n   Add them to .env.local:');
        console.error('   ASC_API_KEY_ID=YOUR_KEY_ID');
        console.error('   ASC_API_ISSUER_ID=YOUR_ISSUER_ID');
        process.exit(1);
    }

    // Check for .p8 key file in known locations
    const keyFileName = `AuthKey_${keyId}.p8`;
    const searchPaths = [
        path.join(process.env.HOME, '.appstoreconnect', 'private_keys', keyFileName),
        path.join(process.env.HOME, '.private_keys', keyFileName),
        path.join(process.env.HOME, 'private_keys', keyFileName),
        path.join(ROOT_DIR, 'private_keys', keyFileName),
    ];

    const found = searchPaths.find(p => fs.existsSync(p));
    if (!found) {
        console.error(`❌ API Key file not found: ${keyFileName}`);
        console.error('   xcrun altool searches these directories:');
        searchPaths.forEach(p => console.error(`   - ${p}`));
        console.error('\n   Download the .p8 from App Store Connect → Integrations → API Keys');
        console.error(`   and save it as: ${searchPaths[0]}`);
        process.exit(1);
    }

    log('🔑', `API Key found: ${found}`);
    return { keyId, issuerId };
}

function validateAltool() {
    const altoolPath = findAltool();
    if (!altoolPath) {
        console.error('❌ altool not found!');
        console.error('   altool requires the full Xcode.app (not just Command Line Tools).');
        console.error('   Install Xcode from the Mac App Store, then either:');
        console.error('   a) Run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer');
        console.error('   b) Or the script will use the direct path automatically.');
        process.exit(1);
    }
    log('🔧', `altool found: ${altoolPath}`);
    return altoolPath;
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
    console.log('╔═══════════════════════════════════════════════════╗');
    console.log('║     Mac App Store — Automated Deploy Pipeline     ║');
    console.log('╚═══════════════════════════════════════════════════╝');

    // Check we're on macOS
    if (process.platform !== 'darwin') {
        console.error('❌ MAS builds can only be done on macOS.');
        process.exit(1);
    }

    // Load environment
    loadEnvLocal();

    // Validate API key setup before doing anything expensive
    const { keyId, issuerId } = validateApiKeySetup();
    const altoolPath = validateAltool();

    // Read version
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
    log('📦', `Version: ${pkg.version}`);

    // ── Step 1: Build ────────────────────────────────────────
    log('⬇️ ', 'Step 1/4: Downloading Node.js runtime (arm64)...');
    run('npm run download-node-darwin-arm64');

    log('📥', 'Step 2/4: Installing Codex CLI...');
    run('npm run install-codex');

    log('🔨', 'Step 3/4: Building app...');
    run('npm run build');

    // ── Step 2: Package ──────────────────────────────────────
    // Only arm64 is uploaded to App Store — Apple warns about x64-only
    // binaries missing arm64 (ITMS-91167). Intel Mac users can use the
    // DMG/ZIP downloads from the website instead.
    log('📦', 'Step 4/5: Packaging MAS .pkg (arm64)...');

    // Clean previous MAS builds (search recursively)
    const existingPkgs = findPkgFiles();
    if (existingPkgs.length > 0) {
        console.log('   Cleaning previous .pkg files...');
        existingPkgs.forEach(f => {
            fs.unlinkSync(f);
            console.log(`   Removed: ${f}`);
        });
    }

    run('node scripts/load-env.js --mac mas --arm64');

    // ── Step 3: Upload ───────────────────────────────────────
    log('🚀', 'Step 5/5: Uploading to App Store Connect...');

    const pkgFiles = findPkgFiles();
    if (pkgFiles.length === 0) {
        console.error('❌ No .pkg files found in release/ after build.');
        console.error('   Check build output for errors.');
        process.exit(1);
    }

    console.log(`   Found ${pkgFiles.length} .pkg file(s):`);
    pkgFiles.forEach(f => console.log(`   - ${path.basename(f)}`));

    let uploadErrors = 0;
    for (const pkgFile of pkgFiles) {
        const basename = path.basename(pkgFile);
        console.log(`\n   Uploading ${basename}...`);

        const result = spawnSync(altoolPath, [
            '--upload-app',
            '--type', 'macos',
            '--file', pkgFile,
            '--apiKey', keyId,
            '--apiIssuer', issuerId,
        ], {
            stdio: 'inherit',
            cwd: ROOT_DIR,
        });

        if (result.status !== 0) {
            console.error(`   ❌ Failed to upload ${basename}`);
            uploadErrors++;
        } else {
            console.log(`   ✅ ${basename} uploaded successfully!`);
        }
    }

    // ── Summary ──────────────────────────────────────────────
    console.log('\n╔═══════════════════════════════════════════════════╗');
    if (uploadErrors === 0) {
        console.log('║  ✅ All .pkg files uploaded to App Store Connect! ║');
        console.log('╚═══════════════════════════════════════════════════╝');
        console.log('\n   Next steps:');
        console.log('   1. Go to App Store Connect → TestFlight');
        console.log('   2. Wait for build processing (5-30 minutes)');
        console.log('   3. Submit for review when ready');
    } else {
        console.log(`║  ⚠️  ${uploadErrors} upload(s) failed!                     ║`);
        console.log('╚═══════════════════════════════════════════════════╝');
        process.exit(1);
    }
}

main().catch(err => {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
});
