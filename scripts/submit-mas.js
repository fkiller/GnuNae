#!/usr/bin/env node
/*
 * Submit the latest processed Mac App Store build for App Review.
 *
 * This script intentionally reuses App Store Connect metadata from the prior
 * macOS App Store version and only updates "What's New" for the new version.
 */

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const ENV_LOCAL_PATH = path.join(ROOT_DIR, '.env.local');
const API_HOST = 'api.appstoreconnect.apple.com';
const API_BASE = `https://${API_HOST}`;
const PLATFORM = 'MAC_OS';
const COMPLETE_SUBMISSION_STATES = new Set(['COMPLETE', 'CANCELED', 'CANCELING']);
const SUBMITTED_SUBMISSION_STATES = new Set(['WAITING_FOR_REVIEW', 'IN_REVIEW', 'UNRESOLVED_ISSUES']);
const EDITABLE_VERSION_STATES = new Set([
  'PREPARE_FOR_SUBMISSION',
  'DEVELOPER_REJECTED',
  'METADATA_REJECTED',
  'REJECTED',
  'INVALID_BINARY',
]);
const LOCALIZATION_COPY_FIELDS = [
  'description',
  'keywords',
  'marketingUrl',
  'promotionalText',
  'supportUrl',
];
const REVIEW_DETAIL_COPY_FIELDS = [
  'contactFirstName',
  'contactLastName',
  'contactPhone',
  'contactEmail',
  'demoAccountName',
  'demoAccountPassword',
  'notes',
];

function parseArgs(argv) {
  const args = {
    dryRun: false,
    submit: true,
    waitMinutes: Number(process.env.MAS_SUBMIT_WAIT_MINUTES || 90),
    version: '',
    whatsNew: process.env.MAS_WHATS_NEW || '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
      args.submit = false;
    } else if (arg === '--no-submit') {
      args.submit = false;
    } else if (arg === '--wait-minutes' && argv[i + 1]) {
      args.waitMinutes = Number(argv[++i]);
    } else if (arg === '--version' && argv[i + 1]) {
      args.version = argv[++i];
    } else if (arg === '--whats-new' && argv[i + 1]) {
      args.whatsNew = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/submit-mas.js [--dry-run] [--no-submit] [--wait-minutes N] [--version X.Y.Z]

Environment:
  ASC_API_KEY_ID
  ASC_API_ISSUER_ID
  ASC_API_PRIVATE_KEY or ASC_API_PRIVATE_KEY_BASE64
  APP_STORE_CONNECT_APP_ID optional
  APP_STORE_CONNECT_BUNDLE_ID optional; defaults to package.json build.appId
  MAS_WHATS_NEW optional override for release notes
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.waitMinutes) || args.waitMinutes <= 0) {
    throw new Error('--wait-minutes must be a positive number');
  }

  return args;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8'));
}

function loadEnvLocal() {
  if (!fs.existsSync(ENV_LOCAL_PATH)) return;

  const content = fs.readFileSync(ENV_LOCAL_PATH, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;

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

function appStorePrivateKey() {
  if (process.env.ASC_API_PRIVATE_KEY_BASE64) {
    return Buffer.from(process.env.ASC_API_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
  }
  if (process.env.ASC_API_PRIVATE_KEY) {
    return process.env.ASC_API_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  if (process.env.ASC_API_PRIVATE_KEY_PATH && fs.existsSync(process.env.ASC_API_PRIVATE_KEY_PATH)) {
    return fs.readFileSync(process.env.ASC_API_PRIVATE_KEY_PATH, 'utf8');
  }
  return '';
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function derToJose(signature, byteLength = 32) {
  let offset = 0;
  if (signature[offset++] !== 0x30) {
    throw new Error('Invalid ECDSA signature: expected sequence');
  }

  const sequenceLength = signature[offset++];
  if (sequenceLength + offset !== signature.length) {
    throw new Error('Invalid ECDSA signature length');
  }

  if (signature[offset++] !== 0x02) {
    throw new Error('Invalid ECDSA signature: expected r integer');
  }
  const rLength = signature[offset++];
  let r = signature.slice(offset, offset + rLength);
  offset += rLength;

  if (signature[offset++] !== 0x02) {
    throw new Error('Invalid ECDSA signature: expected s integer');
  }
  const sLength = signature[offset++];
  let s = signature.slice(offset, offset + sLength);

  if (r.length > byteLength) r = r.slice(r.length - byteLength);
  if (s.length > byteLength) s = s.slice(s.length - byteLength);

  const rPad = Buffer.concat([Buffer.alloc(byteLength - r.length), r]);
  const sPad = Buffer.concat([Buffer.alloc(byteLength - s.length), s]);
  return base64Url(Buffer.concat([rPad, sPad]));
}

function createToken() {
  const keyId = process.env.ASC_API_KEY_ID;
  const issuerId = process.env.ASC_API_ISSUER_ID;
  const privateKey = appStorePrivateKey();
  const missing = [];

  if (!keyId) missing.push('ASC_API_KEY_ID');
  if (!issuerId) missing.push('ASC_API_ISSUER_ID');
  if (!privateKey) missing.push('ASC_API_PRIVATE_KEY or ASC_API_PRIVATE_KEY_BASE64');
  if (missing.length > 0) {
    throw new Error(`Missing App Store Connect credentials: ${missing.join(', ')}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 20 * 60,
    aud: 'appstoreconnect-v1',
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signature = crypto.createSign('SHA256').update(signingInput).sign(privateKey);
  return `${signingInput}.${derToJose(signature)}`;
}

class ApiError extends Error {
  constructor(method, pathname, statusCode, body) {
    super(`${method} ${pathname} failed with HTTP ${statusCode}: ${body.slice(0, 1200)}`);
    this.method = method;
    this.pathname = pathname;
    this.statusCode = statusCode;
    this.body = body;
  }
}

function apiUrl(pathname, params = {}) {
  const url = new URL(`${API_BASE}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.append(key, value);
    }
  }
  return url;
}

function requestJson(method, pathname, token, body = null, params = {}) {
  const url = apiUrl(pathname, params);
  const payload = body ? JSON.stringify(body) : '';

  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method,
      hostname: API_HOST,
      path: `${url.pathname}${url.search}`,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'GnuNae mas-submit',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout: 30000,
    }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new ApiError(method, `${url.pathname}${url.search}`, response.statusCode, responseBody));
          return;
        }
        if (!responseBody) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(responseBody));
        } catch (error) {
          reject(new Error(`Invalid JSON from ${method} ${url.pathname}: ${error.message}`));
        }
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error(`Timeout calling ${method} ${url.pathname}`));
    });
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

async function getAll(token, pathname, params = {}) {
  const items = [];
  let nextUrl = apiUrl(pathname, params).toString();

  while (nextUrl) {
    const parsed = new URL(nextUrl);
    const result = await requestJson('GET', `${parsed.pathname}${parsed.search}`, token);
    if (Array.isArray(result.data)) {
      items.push(...result.data);
    }
    nextUrl = result.links && result.links.next ? result.links.next : '';
  }

  return items;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message) {
  console.log(`[mas-submit] ${message}`);
}

function nonEmptyObject(attributes, keys) {
  const result = {};
  for (const key of keys) {
    if (attributes[key] !== undefined && attributes[key] !== null && attributes[key] !== '') {
      result[key] = attributes[key];
    }
  }
  return result;
}

function semanticParts(version) {
  return String(version || '')
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function compareVersions(left, right) {
  const a = semanticParts(left);
  const b = semanticParts(right);
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function newestByCreatedDate(items) {
  return [...items].sort((left, right) => {
    const leftTime = Date.parse(left.attributes?.createdDate || '') || 0;
    const rightTime = Date.parse(right.attributes?.createdDate || '') || 0;
    return rightTime - leftTime;
  })[0] || null;
}

function latestVersionTagBeforeHead() {
  try {
    const currentTag = execSync('git describe --tags --exact-match HEAD', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return execSync(`git describe --tags --abbrev=0 ${currentTag}^`, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_) {
    return '';
  }
}

function commitSubjectsSincePreviousTag() {
  const previousTag = latestVersionTagBeforeHead();
  if (!previousTag) return [];

  try {
    return execSync(`git log ${previousTag}..HEAD --pretty=%s`, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (_) {
    return [];
  }
}

function exactCodexVersion() {
  try {
    const lock = readJson('package-lock.json');
    return lock.packages?.['node_modules/@openai/codex']?.version || '';
  } catch (_) {
    return '';
  }
}

function generateWhatsNew(targetVersion, sourceVersion) {
  const subjects = commitSubjectsSincePreviousTag();
  const joined = subjects.join(' ').toLowerCase();
  const lines = [];
  const codexVersion = exactCodexVersion();

  if (codexVersion || /codex|model|llm|openai/.test(joined)) {
    lines.push(codexVersion
      ? `Updated Codex support to the ${codexVersion} series.`
      : 'Updated Codex model and automation support.');
  }
  if (/intel|x64|universal|apple silicon|mac|mas|app store/.test(joined)) {
    lines.push('Improved compatibility for both Intel and Apple Silicon Macs.');
  }
  if (/runtime|browser|automation|docker|sandbox|sidebar/.test(joined)) {
    lines.push('Improved browser automation reliability.');
  }
  if (/store|release|status|publish|submission|review/.test(joined)) {
    lines.push('Improved the Mac App Store update experience.');
  }

  if (lines.length === 0) {
    lines.push('Improved the GnuNae browser and Codex sidebar experience.');
    lines.push('Includes reliability updates for everyday browser automation.');
  }

  const uniqueLines = [...new Set(lines)].slice(0, 4);
  const sourceText = sourceVersion ? ` from ${sourceVersion}` : '';
  return [
    `GnuNae ${targetVersion} updates the Mac app${sourceText}.`,
    '',
    ...uniqueLines.map((line) => `- ${line}`),
  ].join('\n').slice(0, 3900);
}

async function resolveAppId(token, packageJson) {
  if (process.env.APP_STORE_CONNECT_APP_ID) {
    return process.env.APP_STORE_CONNECT_APP_ID;
  }

  const bundleId = process.env.APP_STORE_CONNECT_BUNDLE_ID || packageJson.build?.appId;
  if (!bundleId) {
    throw new Error('No bundle ID found. Set APP_STORE_CONNECT_APP_ID or APP_STORE_CONNECT_BUNDLE_ID.');
  }

  const apps = await getAll(token, '/v1/apps', {
    'filter[bundleId]': bundleId,
    limit: '1',
  });

  if (!apps[0]) {
    throw new Error(`No App Store Connect app found for bundle ID ${bundleId}`);
  }

  return apps[0].id;
}

async function listMacAppStoreVersions(token, appId) {
  return getAll(token, `/v1/apps/${appId}/appStoreVersions`, {
    'filter[platform]': PLATFORM,
    'fields[appStoreVersions]': 'versionString,appStoreState,platform,createdDate',
    limit: '200',
  });
}

async function getExactMacVersion(token, appId, versionString) {
  const versions = await getAll(token, `/v1/apps/${appId}/appStoreVersions`, {
    'filter[platform]': PLATFORM,
    'filter[versionString]': versionString,
    'fields[appStoreVersions]': 'versionString,appStoreState,platform,createdDate',
    limit: '1',
  });
  return versions[0] || null;
}

async function patchVersionString(token, version, targetVersion) {
  log(`Reusing editable App Store version ${version.attributes?.versionString} and changing it to ${targetVersion}`);
  return requestJson('PATCH', `/v1/appStoreVersions/${version.id}`, token, {
    data: {
      type: 'appStoreVersions',
      id: version.id,
      attributes: {
        versionString: targetVersion,
      },
    },
  });
}

async function findOrCreateAppStoreVersion(token, appId, targetVersion) {
  const exact = await getExactMacVersion(token, appId, targetVersion);
  if (exact) {
    log(`Using existing App Store version ${targetVersion} (${exact.id})`);
    return exact;
  }

  try {
    const created = await requestJson('POST', '/v1/appStoreVersions', token, {
      data: {
        type: 'appStoreVersions',
        attributes: {
          platform: PLATFORM,
          versionString: targetVersion,
        },
        relationships: {
          app: {
            data: {
              type: 'apps',
              id: appId,
            },
          },
        },
      },
    });
    log(`Created App Store version ${targetVersion} (${created.data.id})`);
    return created.data;
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 409) {
      throw error;
    }

    const versions = await listMacAppStoreVersions(token, appId);
    const editable = versions
      .filter((version) => EDITABLE_VERSION_STATES.has(version.attributes?.appStoreState))
      .sort((left, right) => compareVersions(right.attributes?.versionString, left.attributes?.versionString))[0];

    if (!editable) {
      throw error;
    }

    const patched = await patchVersionString(token, editable, targetVersion);
    return patched.data;
  }
}

function previousMacVersion(versions, targetVersion) {
  const candidates = versions
    .filter((version) => version.attributes?.versionString !== targetVersion)
    .filter((version) => compareVersions(version.attributes?.versionString, targetVersion) < 0);
  return newestByCreatedDate(candidates) || newestByCreatedDate(
    versions.filter((version) => version.attributes?.versionString !== targetVersion)
  );
}

async function getVersionLocalizations(token, versionId) {
  return getAll(token, `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`, {
    limit: '200',
  });
}

async function createLocalization(token, versionId, locale, attributes) {
  return requestJson('POST', '/v1/appStoreVersionLocalizations', token, {
    data: {
      type: 'appStoreVersionLocalizations',
      attributes: {
        locale,
        ...attributes,
      },
      relationships: {
        appStoreVersion: {
          data: {
            type: 'appStoreVersions',
            id: versionId,
          },
        },
      },
    },
  });
}

async function patchLocalization(token, localizationId, attributes) {
  return requestJson('PATCH', `/v1/appStoreVersionLocalizations/${localizationId}`, token, {
    data: {
      type: 'appStoreVersionLocalizations',
      id: localizationId,
      attributes,
    },
  });
}

async function syncLocalizations(token, targetVersionId, sourceVersion, whatsNew) {
  const targetLocalizations = await getVersionLocalizations(token, targetVersionId);
  const targetByLocale = new Map(targetLocalizations.map((item) => [item.attributes?.locale, item]));
  let sourceLocalizations = [];

  if (sourceVersion) {
    sourceLocalizations = await getVersionLocalizations(token, sourceVersion.id);
  }

  if (sourceLocalizations.length === 0 && targetLocalizations.length === 0) {
    log('No previous App Store localization was found; creating en-US metadata from package description');
    const pkg = readJson('package.json');
    await createLocalization(token, targetVersionId, 'en-US', {
      description: pkg.description || 'AI-powered browser with a Codex sidebar for intelligent web automation.',
      keywords: 'browser,ai,automation,codex,productivity',
      supportUrl: process.env.APP_STORE_SUPPORT_URL || 'https://www.gnunae.com/privacy.html',
      whatsNew,
    });
    return;
  }

  if (sourceLocalizations.length === 0) {
    for (const target of targetLocalizations) {
      await patchLocalization(token, target.id, { whatsNew });
      log(`Updated What's New for ${target.attributes?.locale || target.id}`);
    }
    return;
  }

  for (const source of sourceLocalizations) {
    const locale = source.attributes?.locale || 'en-US';
    const attributes = {
      ...nonEmptyObject(source.attributes || {}, LOCALIZATION_COPY_FIELDS),
      whatsNew,
    };
    const target = targetByLocale.get(locale);
    if (target) {
      await patchLocalization(token, target.id, attributes);
      log(`Copied metadata and updated What's New for ${locale}`);
    } else {
      await createLocalization(token, targetVersionId, locale, attributes);
      log(`Created localization ${locale} from previous metadata`);
    }
  }
}

async function getReviewDetail(token, versionId) {
  try {
    const result = await requestJson('GET', `/v1/appStoreVersions/${versionId}/appStoreReviewDetail`, token);
    return result.data || null;
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) return null;
    throw error;
  }
}

async function createReviewDetail(token, versionId, attributes) {
  return requestJson('POST', '/v1/appStoreReviewDetails', token, {
    data: {
      type: 'appStoreReviewDetails',
      attributes,
      relationships: {
        appStoreVersion: {
          data: {
            type: 'appStoreVersions',
            id: versionId,
          },
        },
      },
    },
  });
}

async function patchReviewDetail(token, reviewDetailId, attributes) {
  return requestJson('PATCH', `/v1/appStoreReviewDetails/${reviewDetailId}`, token, {
    data: {
      type: 'appStoreReviewDetails',
      id: reviewDetailId,
      attributes,
    },
  });
}

async function syncReviewDetail(token, targetVersionId, sourceVersion) {
  if (!sourceVersion) {
    log('No previous version found for review detail copy; leaving existing review detail unchanged');
    return;
  }

  const sourceDetail = await getReviewDetail(token, sourceVersion.id);
  if (!sourceDetail) {
    log('Previous version has no review detail; leaving existing review detail unchanged');
    return;
  }

  const attributes = nonEmptyObject(sourceDetail.attributes || {}, REVIEW_DETAIL_COPY_FIELDS);
  if (Object.keys(attributes).length === 0) {
    log('Previous review detail has no copyable attributes');
    return;
  }

  const targetDetail = await getReviewDetail(token, targetVersionId);
  if (targetDetail) {
    await patchReviewDetail(token, targetDetail.id, attributes);
    log('Copied App Review contact/details from previous version');
  } else {
    await createReviewDetail(token, targetVersionId, attributes);
    log('Created App Review contact/details from previous version');
  }
}

function buildMatchesPreReleaseVersion(build, includedPreReleaseVersions, targetVersion) {
  const preReleaseId = build.relationships?.preReleaseVersion?.data?.id;
  if (!preReleaseId) return false;
  const preRelease = includedPreReleaseVersions.get(preReleaseId);
  return preRelease?.attributes?.version === targetVersion;
}

async function listBuildsForVersion(token, appId, targetVersion) {
  try {
    const result = await requestJson('GET', '/v1/builds', token, null, {
      'filter[app]': appId,
      'filter[preReleaseVersion.version]': targetVersion,
      include: 'preReleaseVersion',
      sort: '-uploadedDate',
      limit: '10',
    });
    return Array.isArray(result.data) ? result.data : [];
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
  }

  const result = await requestJson('GET', '/v1/builds', token, null, {
    'filter[app]': appId,
    include: 'preReleaseVersion',
    sort: '-uploadedDate',
    limit: '50',
  });
  const preReleaseVersions = new Map((result.included || [])
    .filter((item) => item.type === 'preReleaseVersions')
    .map((item) => [item.id, item]));
  return (result.data || []).filter((build) => buildMatchesPreReleaseVersion(
    build,
    preReleaseVersions,
    targetVersion
  ));
}

async function waitForProcessedBuild(token, appId, targetVersion, waitMinutes) {
  const deadline = Date.now() + waitMinutes * 60 * 1000;
  let lastState = 'not found';

  while (Date.now() < deadline) {
    const builds = await listBuildsForVersion(token, appId, targetVersion);
    const latest = builds.sort((left, right) => {
      const leftTime = Date.parse(left.attributes?.uploadedDate || '') || 0;
      const rightTime = Date.parse(right.attributes?.uploadedDate || '') || 0;
      return rightTime - leftTime;
    })[0];

    if (latest) {
      const state = latest.attributes?.processingState || 'UNKNOWN';
      lastState = `${state} (${latest.id})`;
      log(`Latest ${targetVersion} build state: ${lastState}`);

      if (state === 'VALID') return latest;
      if (state === 'FAILED' || state === 'INVALID') {
        throw new Error(`Uploaded build ${latest.id} processing failed with state ${state}`);
      }
    } else {
      log(`No ${targetVersion} build is visible yet`);
    }

    await sleep(60 * 1000);
  }

  throw new Error(`Timed out after ${waitMinutes} minutes waiting for ${targetVersion} build; last state: ${lastState}`);
}

async function setBuildExportComplianceIfConfigured(token, buildId) {
  const configuredValue = process.env.APP_STORE_USES_NON_EXEMPT_ENCRYPTION || 'false';
  const value = !/^(false|0|no)$/i.test(configuredValue);
  await requestJson('PATCH', `/v1/builds/${buildId}`, token, {
    data: {
      type: 'builds',
      id: buildId,
      attributes: {
        usesNonExemptEncryption: value,
      },
    },
  });
  log(`Set build export compliance usesNonExemptEncryption=${value}`);
}

async function attachBuild(token, versionId, buildId) {
  try {
    await requestJson('PATCH', `/v1/appStoreVersions/${versionId}/relationships/build`, token, {
      data: {
        type: 'builds',
        id: buildId,
      },
    });
    log(`Attached build ${buildId} to App Store version ${versionId}`);
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 409) {
      throw error;
    }
    const current = await requestJson('GET', `/v1/appStoreVersions/${versionId}/relationships/build`, token);
    if (current.data?.id === buildId) {
      log(`Build ${buildId} is already attached`);
      return;
    }
    throw error;
  }
}

async function createReviewSubmission(token, appId) {
  const result = await requestJson('POST', '/v1/reviewSubmissions', token, {
    data: {
      type: 'reviewSubmissions',
      attributes: {
        platform: PLATFORM,
      },
      relationships: {
        app: {
          data: {
            type: 'apps',
            id: appId,
          },
        },
      },
    },
  });
  log(`Created review submission ${result.data.id}`);
  return result.data;
}

async function submissionItems(token, submissionId) {
  return getAll(token, `/v1/reviewSubmissions/${submissionId}/items`, {
    include: 'appStoreVersion',
    limit: '50',
  });
}

async function activeReviewSubmissions(token, appId) {
  const submissions = await getAll(token, `/v1/apps/${appId}/reviewSubmissions`, {
    'filter[platform]': PLATFORM,
    limit: '20',
  });
  return submissions.filter((submission) => !COMPLETE_SUBMISSION_STATES.has(submission.attributes?.state));
}

async function findReusableSubmission(token, appId, targetVersionId) {
  const submissions = await activeReviewSubmissions(token, appId);
  for (const submission of submissions) {
    const items = await submissionItems(token, submission.id);
    const hasTarget = items.some((item) => item.relationships?.appStoreVersion?.data?.id === targetVersionId);
    if (hasTarget) {
      log(`Reusing review submission ${submission.id} already linked to target version`);
      return submission;
    }
    if ((submission.attributes?.state || '') === 'CREATED' && items.length === 0) {
      log(`Reusing empty review submission ${submission.id}`);
      return submission;
    }
  }
  return null;
}

async function getOrCreateReviewSubmission(token, appId, targetVersionId) {
  try {
    return await createReviewSubmission(token, appId);
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 409) {
      throw error;
    }
    const reusable = await findReusableSubmission(token, appId, targetVersionId);
    if (reusable) return reusable;
    throw error;
  }
}

async function addSubmissionItem(token, submissionId, targetVersionId) {
  try {
    await requestJson('POST', '/v1/reviewSubmissionItems', token, {
      data: {
        type: 'reviewSubmissionItems',
        relationships: {
          reviewSubmission: {
            data: {
              type: 'reviewSubmissions',
              id: submissionId,
            },
          },
          appStoreVersion: {
            data: {
              type: 'appStoreVersions',
              id: targetVersionId,
            },
          },
        },
      },
    });
    log(`Added App Store version ${targetVersionId} to review submission ${submissionId}`);
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode !== 409) {
      throw error;
    }
    const items = await submissionItems(token, submissionId);
    const hasTarget = items.some((item) => item.relationships?.appStoreVersion?.data?.id === targetVersionId);
    if (hasTarget) {
      log('Review submission item already exists');
      return;
    }
    throw error;
  }
}

async function submitReviewSubmission(token, submission) {
  if (SUBMITTED_SUBMISSION_STATES.has(submission.attributes?.state)) {
    log(`Review submission ${submission.id} is already ${submission.attributes.state}`);
    return submission;
  }

  try {
    const result = await requestJson('PATCH', `/v1/reviewSubmissions/${submission.id}`, token, {
      data: {
        type: 'reviewSubmissions',
        id: submission.id,
        attributes: {
          submitted: true,
        },
      },
    });
    log(`Submitted review submission ${submission.id}; state=${result.data.attributes?.state || 'unknown'}`);
    return result.data;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const latest = await requestJson('GET', `/v1/reviewSubmissions/${submission.id}`, token);
    if (SUBMITTED_SUBMISSION_STATES.has(latest.data?.attributes?.state)) {
      log(`Review submission ${submission.id} is already ${latest.data.attributes.state}`);
      return latest.data;
    }
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvLocal();

  const packageJson = readJson('package.json');
  const targetVersion = args.version || packageJson.version;

  if (!/^1\.0\.\d+$/.test(targetVersion)) {
    log(`Warning: target version ${targetVersion} is not in the expected 1.0.x Mac App Store version line`);
  }

  const token = createToken();
  const appId = await resolveAppId(token, packageJson);
  log(`App Store Connect app id: ${appId}`);
  log(`Target Mac App Store version: ${targetVersion}`);

  const allVersionsBefore = await listMacAppStoreVersions(token, appId);
  const sourceVersion = previousMacVersion(allVersionsBefore, targetVersion);
  if (sourceVersion) {
    log(`Previous Mac version for metadata: ${sourceVersion.attributes?.versionString} (${sourceVersion.id})`);
  } else {
    log('No previous Mac version found for metadata copy');
  }

  const targetVersionResource = await findOrCreateAppStoreVersion(token, appId, targetVersion);
  const whatsNew = args.whatsNew || generateWhatsNew(
    targetVersion,
    sourceVersion ? sourceVersion.attributes?.versionString : ''
  );
  log(`What's New:\n${whatsNew}`);

  if (args.dryRun) {
    log('Dry run requested; no App Store metadata or review submission changes were made');
    return;
  }

  await syncLocalizations(token, targetVersionResource.id, sourceVersion, whatsNew);
  await syncReviewDetail(token, targetVersionResource.id, sourceVersion);

  const build = await waitForProcessedBuild(token, appId, targetVersion, args.waitMinutes);
  await setBuildExportComplianceIfConfigured(token, build.id);
  await attachBuild(token, targetVersionResource.id, build.id);

  if (!args.submit) {
    log('Submission disabled by --no-submit; build is attached but not submitted');
    return;
  }

  const submission = await getOrCreateReviewSubmission(token, appId, targetVersionResource.id);
  await addSubmissionItem(token, submission.id, targetVersionResource.id);
  await submitReviewSubmission(token, submission);
}

main().catch((error) => {
  console.error(`[mas-submit] ${error.stack || error.message}`);
  process.exit(1);
});
