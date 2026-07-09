#!/usr/bin/env node
/**
 * Prepare and apply Microsoft Store certification notes for the pending
 * submission. This keeps reviewer instructions in the actual Partner Center
 * submission instead of only in repository docs.
 */
const fs = require('fs');
const https = require('https');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const CODEX_MODELS_PATH = path.join(ROOT_DIR, 'src', 'core', 'codex-models.json');
const ENV_LOCAL_PATH = path.join(ROOT_DIR, '.env.local');
const WEBSITE_URL = 'https://www.gnunae.com';
const PRIVACY_URL = 'https://www.gnunae.com/privacy.html';
const SUPPORT_CONTACT = 'contact@gnunae.com';
const HTTP_TIMEOUT_MS = Number(process.env.MSSTORE_API_TIMEOUT_MS || 90000);
const API_RETRIES = Number(process.env.MSSTORE_API_RETRIES || 3);

function loadEnvLocal() {
  if (!fs.existsSync(ENV_LOCAL_PATH)) return;

  for (const line of fs.readFileSync(ENV_LOCAL_PATH, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index < 1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    patchPending: false,
    verifyPackageVersion: false,
    allowVersionMismatch: false,
    writeNotes: '',
    submissionId: process.env.MSSTORE_SUBMISSION_ID || '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--patch-pending') {
      args.patchPending = true;
    } else if (arg === '--verify-package-version') {
      args.verifyPackageVersion = true;
    } else if (arg === '--allow-version-mismatch') {
      args.allowVersionMismatch = true;
    } else if (arg === '--write-notes') {
      args.writeNotes = argv[++i] || '';
    } else if (arg === '--submission-id') {
      args.submissionId = argv[++i] || '';
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printUsage() {
  console.log(`Usage: node scripts/msstore-certification.js [options]

Options:
  --write-notes <path>          Write generated certification notes to a file.
  --patch-pending               Patch the pending Partner Center submission.
  --verify-package-version      Require pending Store package version to match package.json.
  --allow-version-mismatch      Warn instead of failing on Store package version mismatch.
  --submission-id <id>          Patch a specific submission instead of resolving pending submission.
  --dry-run                     Do not write to Partner Center.
  -h, --help                    Show help.
`);
}

function packageJson() {
  return JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
}

function codexModelInfo() {
  const fallback = {
    defaultModel: 'gpt-5.5',
    fallbackModel: 'gpt-5.4-mini',
  };

  try {
    const manifest = JSON.parse(fs.readFileSync(CODEX_MODELS_PATH, 'utf8'));
    const models = Array.isArray(manifest.models) ? manifest.models.map((entry) => entry.value).filter(Boolean) : [];
    const defaultModel = manifest.defaultModel || models[0] || fallback.defaultModel;
    return {
      defaultModel,
      fallbackModel:
        models.find((value) => value !== defaultModel && value.endsWith('-mini')) ||
        models.find((value) => value !== defaultModel && !value.includes('spark')) ||
        models.find((value) => value !== defaultModel) ||
        fallback.fallbackModel,
    };
  } catch {
    return fallback;
  }
}

function expectedWindowsPackageVersion(version) {
  const parts = String(version || '').split('.');
  while (parts.length < 4) parts.push('0');
  return parts.slice(0, 4).join('.');
}

function releaseNotes(version) {
  const { defaultModel, fallbackModel } = codexModelInfo();
  return [
    `Version ${version}`,
    'Improved first-run browser access and OpenAI/Codex sign-in guidance for Microsoft Store certification.',
    `Pins Codex chat to the recommended ${defaultModel} model and retries with ${fallbackModel} if the selected model is unavailable for the signed-in account.`,
    'Clarifies that OpenAI authentication is required only for Codex AI features.',
  ].join('\n');
}

function certificationNotes(version) {
  const optionalAccountNote = (process.env.MSSTORE_CERTIFICATION_TEST_ACCOUNT_NOTE || '').trim();
  const { defaultModel, fallbackModel } = codexModelInfo();
  const lines = [
    `GnuNae ${version} certification notes`,
    '',
    'Primary functionality:',
    'GnuNae is a desktop browser with an optional Codex sidebar for AI-assisted page analysis and web automation.',
    'The browser shell, address bar, tab controls, and navigation can be tested without OpenAI authentication.',
    '',
    'OpenAI/Codex authentication:',
    'GnuNae does not operate a first-party login or sign-up system. The Sign in and Create account buttons open the OpenAI/Codex authentication flow used by the bundled Codex CLI.',
    'Codex AI features require an OpenAI account with ChatGPT Pro/Plus or Codex access. Free OpenAI accounts may not be able to complete full Codex feature testing.',
    `GnuNae pins Codex chat to the recommended ${defaultModel} model instead of relying on the Codex CLI account default. If the selected model is unavailable for the signed-in account, GnuNae retries once with ${fallbackModel}.`,
    '',
    'Recommended certification test path:',
    '1. Launch GnuNae.',
    '2. Choose Browse without Codex on the first-run page, or use the address bar, and verify normal browser navigation.',
    '3. Open the Codex sidebar and select Sign in to start OpenAI authentication.',
    '4. Complete the third-party OpenAI flow with an eligible OpenAI account if Codex AI features must be tested.',
    '5. After successful authentication, enter a prompt such as "Summarize this page" in the Codex sidebar.',
    '',
    'Expected unauthenticated behavior:',
    'If OpenAI sign-in is canceled, unavailable, or attempted with an account that lacks Codex access, GnuNae should keep browser functionality available and show an OpenAI/Codex sign-in message rather than blocking the app.',
    '',
    `Privacy policy: ${PRIVACY_URL}`,
    `Website: ${WEBSITE_URL}`,
    `Support contact: ${SUPPORT_CONTACT}`,
  ];

  if (optionalAccountNote) {
    lines.push(
      '',
      'Certification test account note:',
      optionalAccountNote,
    );
  }

  return `${lines.join('\n')}\n`;
}

function requiredEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}

function request(method, url, headers = {}, body = '') {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      method,
      hostname: parsed.hostname,
      path: `${parsed.pathname}${parsed.search}`,
      headers,
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          body: data,
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(HTTP_TIMEOUT_MS, () => {
      req.destroy(new Error(`${method} ${parsed.hostname}${parsed.pathname} timed out after ${HTTP_TIMEOUT_MS}ms`));
    });
    if (body) req.write(body);
    req.end();
  });
}

async function partnerCenterToken() {
  requiredEnv(['MSSTORE_TENANT_ID', 'MSSTORE_CLIENT_ID', 'MSSTORE_CLIENT_SECRET']);

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.MSSTORE_CLIENT_ID,
    client_secret: process.env.MSSTORE_CLIENT_SECRET,
    resource: 'https://manage.devcenter.microsoft.com',
  }).toString();

  const response = await request(
    'POST',
    `https://login.microsoftonline.com/${encodeURIComponent(process.env.MSSTORE_TENANT_ID)}/oauth2/token`,
    {
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': Buffer.byteLength(body),
    },
    body,
  );

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Partner Center token request failed: HTTP ${response.statusCode}\n${response.body.slice(0, 1000)}`);
  }

  return JSON.parse(response.body).access_token;
}

async function apiJson(method, pathname, token, body) {
  const serialized = body ? JSON.stringify(body) : '';
  let lastError;

  for (let attempt = 1; attempt <= API_RETRIES; attempt += 1) {
    try {
      const response = await request(
        method,
        `https://manage.devcenter.microsoft.com/v1.0/my${pathname}`,
        {
          authorization: `Bearer ${token}`,
          ...(serialized ? {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(serialized),
          } : {}),
        },
        serialized,
      );

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return response.body ? JSON.parse(response.body) : {};
      }

      lastError = new Error(`${method} ${pathname} failed: HTTP ${response.statusCode}\n${response.body.slice(0, 2000)}`);

      if (![408, 429, 500, 502, 503, 504].includes(response.statusCode)) {
        lastError.nonRetryable = true;
        throw lastError;
      }

      if (attempt === API_RETRIES) {
        throw lastError;
      }
    } catch (error) {
      lastError = error;
      if (lastError.nonRetryable || attempt === API_RETRIES) throw lastError;
    }

    const delayMs = attempt * 5000;
    console.warn(`[msstore-certification] Warning: ${method} ${pathname} attempt ${attempt} failed; retrying in ${delayMs / 1000}s.`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw lastError;
}

function pendingSubmissionIdFromMsstoreStatus(productId) {
  const result = spawnSync(
    'msstore',
    ['submission', 'status', productId, '--verbose'],
    {
      encoding: 'utf8',
      timeout: HTTP_TIMEOUT_MS,
      windowsHide: true,
    },
  );
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');

  if (result.error && result.error.code === 'ENOENT') {
    console.warn('[msstore-certification] Warning: msstore CLI not found for pending submission fallback.');
    return '';
  }

  if (result.error) {
    console.warn(`[msstore-certification] Warning: msstore status fallback failed: ${result.error.message}`);
  }

  const urlMatch = output.match(/\/submissions\/([0-9]+)/i);
  if (urlMatch) return urlMatch[1];

  const fieldMatch = output.match(/(?:submissionId|submission\s+id|id)\s*[:=]\s*([0-9]{8,})/i);
  return fieldMatch ? fieldMatch[1] : '';
}

async function resolvePendingSubmissionId(token, options) {
  if (options.submissionId) return options.submissionId;

  const productId = process.env.MSSTORE_PRODUCT_ID;

  try {
    const app = await apiJson(
      'GET',
      `/applications/${encodeURIComponent(productId)}`,
      token,
    );
    const pendingId = app.pendingApplicationSubmission && app.pendingApplicationSubmission.id;
    if (pendingId) return pendingId;
  } catch (error) {
    console.warn(`[msstore-certification] Warning: app-level pending submission lookup failed: ${error.message}`);
  }

  const statusId = pendingSubmissionIdFromMsstoreStatus(productId);
  if (statusId) return statusId;

  throw new Error('No pending Microsoft Store submission found to patch.');
}

function patchListings(submission, version) {
  const listings = submission.listings || {};

  for (const listing of Object.values(listings)) {
    const base = listing.baseListing;
    if (!base) continue;

    if (!base.privacyPolicy) base.privacyPolicy = PRIVACY_URL;
    if (!base.supportContact) base.supportContact = SUPPORT_CONTACT;
    if (!base.websiteUrl) base.websiteUrl = WEBSITE_URL;
    base.releaseNotes = releaseNotes(version);
  }
}

function updateRequestFromSubmission(submission) {
  return {
    applicationCategory: submission.applicationCategory,
    pricing: submission.pricing,
    visibility: submission.visibility,
    targetPublishMode: submission.targetPublishMode,
    targetPublishDate: submission.targetPublishDate,
    listings: submission.listings,
    hardwarePreferences: submission.hardwarePreferences || [],
    automaticBackupEnabled: Boolean(submission.automaticBackupEnabled),
    canInstallOnRemovableMedia: Boolean(submission.canInstallOnRemovableMedia),
    isGameDvrEnabled: Boolean(submission.isGameDvrEnabled),
    gamingOptions: submission.gamingOptions || [],
    hasExternalInAppProducts: Boolean(submission.hasExternalInAppProducts),
    meetAccessibilityGuidelines: Boolean(submission.meetAccessibilityGuidelines),
    notesForCertification: submission.notesForCertification || '',
    applicationPackages: (submission.applicationPackages || []).map((pkg) => {
      const requestPackage = {
        fileName: pkg.fileName,
        fileStatus: pkg.fileStatus,
        minimumDirectXVersion: pkg.minimumDirectXVersion || 'None',
        minimumSystemRam: pkg.minimumSystemRam || 'None',
      };
      if (pkg.id) requestPackage.id = pkg.id;
      return requestPackage;
    }),
    packageDeliveryOptions: submission.packageDeliveryOptions,
    enterpriseLicensing: submission.enterpriseLicensing,
    allowMicrosoftDecideAppAvailabilityToFutureDeviceFamilies:
      submission.allowMicrosoftDecideAppAvailabilityToFutureDeviceFamilies,
    allowTargetFutureDeviceFamilies: submission.allowTargetFutureDeviceFamilies,
    trailers: submission.trailers || [],
  };
}

function verifyPackageVersion(submission, expectedVersion, allowMismatch) {
  const versions = (submission.applicationPackages || [])
    .map((pkg) => pkg.version)
    .filter(Boolean);

  if (versions.length === 0) {
    const message = 'Pending submission has no package version to verify yet.';
    if (allowMismatch) {
      console.warn(`[msstore-certification] Warning: ${message}`);
      return;
    }
    throw new Error(message);
  }

  if (!versions.includes(expectedVersion)) {
    const message = `Expected Windows package version ${expectedVersion}, found ${versions.join(', ')}`;
    if (allowMismatch) {
      console.warn(`[msstore-certification] Warning: ${message}`);
      return;
    }
    throw new Error(message);
  }

  console.log(`[msstore-certification] Package version verified: ${expectedVersion}`);
}

async function patchPendingSubmission(options, version, notes) {
  requiredEnv(['MSSTORE_PRODUCT_ID']);

  const token = await partnerCenterToken();
  const pendingId = await resolvePendingSubmissionId(token, options);

  const submissionPath = `/applications/${encodeURIComponent(process.env.MSSTORE_PRODUCT_ID)}/submissions/${encodeURIComponent(pendingId)}`;
  const submission = await apiJson('GET', submissionPath, token);
  const expectedVersion = expectedWindowsPackageVersion(version);

  if (options.verifyPackageVersion) {
    verifyPackageVersion(submission, expectedVersion, options.allowVersionMismatch);
  }

  patchListings(submission, version);
  submission.notesForCertification = notes;

  console.log(`[msstore-certification] Pending submission: ${pendingId}`);
  console.log(`[msstore-certification] Current status: ${submission.status || 'unknown'}`);
  console.log(`[msstore-certification] Certification notes length: ${notes.length}`);
  console.log(`[msstore-certification] Expected Windows package version: ${expectedVersion}`);

  if (options.dryRun) {
    console.log('[msstore-certification] Dry run; Partner Center submission was not updated.');
    return;
  }

  const body = updateRequestFromSubmission(submission);
  await apiJson('PUT', submissionPath, token, body);
  console.log('[msstore-certification] Partner Center certification notes updated.');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  loadEnvLocal();

  const pkg = packageJson();
  const version = pkg.version;
  const notes = certificationNotes(version);

  if (options.writeNotes) {
    const outputPath = path.resolve(options.writeNotes);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, notes, 'utf8');
    console.log(`[msstore-certification] Wrote notes: ${outputPath}`);
  }

  if (options.patchPending) {
    await patchPendingSubmission(options, version, notes);
  }

  if (!options.writeNotes && !options.patchPending) {
    console.log(notes);
  }
}

main().catch((error) => {
  console.error(`[msstore-certification] ${error.message}`);
  process.exit(1);
});
