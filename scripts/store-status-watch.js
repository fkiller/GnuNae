#!/usr/bin/env node
/*
 * Read-only store status monitor for GnuNae.
 *
 * This script checks Microsoft Store and Mac App Store review/status signals
 * and writes a Markdown report plus optional JSON. It must not upload builds,
 * publish submissions, change metadata, rotate secrets, or edit repository
 * files.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = 'store-status-report.md';
const DEFAULT_JSON_OUTPUT = 'store-status-report.json';

const MICROSOFT_DOC_URL = 'https://learn.microsoft.com/en-us/windows/apps/publish/msstore-dev-cli/overview';
const MICROSOFT_COMMANDS_URL = 'https://learn.microsoft.com/en-us/windows/apps/publish/msstore-dev-cli/commands';
const APPLE_API_URL = 'https://developer.apple.com/documentation/appstoreconnectapi';
const APPLE_BUILDS_URL = 'https://developer.apple.com/documentation/appstoreconnectapi/get-v1-builds';
const APPLE_VERSIONS_URL = 'https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-appstoreversions';

function parseArgs(argv) {
  const args = {
    output: DEFAULT_OUTPUT,
    json: '',
    windows: true,
    mac: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output' && argv[i + 1]) {
      args.output = argv[++i];
    } else if (arg === '--json' && argv[i + 1]) {
      args.json = argv[++i];
    } else if (arg === '--no-windows') {
      args.windows = false;
    } else if (arg === '--no-mac') {
      args.mac = false;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/store-status-watch.js [--output file] [--json file] [--no-windows] [--no-mac]

Environment:
  Microsoft Store:
    MSSTORE_TENANT_ID
    MSSTORE_CLIENT_ID
    MSSTORE_CLIENT_SECRET
    MSSTORE_SELLER_ID
    MSSTORE_PRODUCT_ID

  App Store Connect:
    ASC_API_KEY_ID
    ASC_API_ISSUER_ID
    ASC_API_PRIVATE_KEY or ASC_API_PRIVATE_KEY_BASE64
    APP_STORE_CONNECT_APP_ID optional
    APP_STORE_CONNECT_BUNDLE_ID optional; defaults to package.json build.appId
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function markdownTable(headers, rows) {
  const escapeCell = (value) => String(value ?? '')
    .replace(/\r?\n/g, '<br>')
    .replace(/\|/g, '\\|');

  return [
    `| ${headers.map(escapeCell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`),
  ].join('\n');
}

function requiredEnv(names) {
  return names.filter((name) => !process.env[name]);
}

function knownSecretValues() {
  return [
    process.env.MSSTORE_CLIENT_SECRET,
    process.env.ASC_API_PRIVATE_KEY,
    process.env.ASC_API_PRIVATE_KEY_BASE64,
  ].filter((value) => value && value.length >= 8);
}

function stripAnsi(text) {
  return String(text || '').replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

function sanitizeText(text) {
  let sanitized = stripAnsi(text);
  for (const secret of knownSecretValues()) {
    sanitized = sanitized.split(secret).join('[redacted]');
  }
  return sanitized;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  });

  return {
    status: result.status,
    signal: result.signal,
    stdout: sanitizeText(result.stdout),
    stderr: sanitizeText(result.stderr),
    error: result.error ? result.error.message : '',
  };
}

function classifyMicrosoftStatus(value) {
  const normalized = String(value || '').toLowerCase();
  if (!normalized) return 'manual review';
  if (/fail|reject|error|invalid/.test(normalized)) return 'needs attention';
  if (/certification|review|pending|progress|processing|commit|release|submission/.test(normalized)) return 'in review';
  if (/published|in store|complete|completed|live|succeeded|success/.test(normalized)) return 'published';
  return 'needs review';
}

function parseMicrosoftSubmissionStatus(output) {
  const text = String(output || '');
  const match = text.match(/Submission Status\s*=\s*([^\r\n]+)/i);
  if (match) return match[1].trim();
  if (/No Pending Submission/i.test(text)) return 'No pending submission';
  const relevantLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => /submission|status|published|certification|failed|reject/i.test(line));
  return relevantLine || '';
}

function checkMicrosoftStore() {
  const envNames = [
    'MSSTORE_TENANT_ID',
    'MSSTORE_CLIENT_ID',
    'MSSTORE_CLIENT_SECRET',
    'MSSTORE_SELLER_ID',
    'MSSTORE_PRODUCT_ID',
  ];
  const missing = requiredEnv(envNames);
  if (missing.length > 0) {
    return {
      platform: 'Windows Store',
      area: 'Submission status',
      current: 'missing credentials',
      status: 'manual review',
      source: 'msstore CLI',
      notes: `Missing environment variables: ${missing.join(', ')}`,
      raw: '',
    };
  }

  const configure = runCommand('msstore', [
    'reconfigure',
    '--tenantId', process.env.MSSTORE_TENANT_ID,
    '--sellerId', process.env.MSSTORE_SELLER_ID,
    '--clientId', process.env.MSSTORE_CLIENT_ID,
    '--clientSecret', process.env.MSSTORE_CLIENT_SECRET,
  ]);

  if (configure.status !== 0) {
    return {
      platform: 'Windows Store',
      area: 'Submission status',
      current: 'msstore reconfigure failed',
      status: 'needs attention',
      source: 'msstore CLI',
      notes: [configure.stderr, configure.stdout, configure.error].filter(Boolean).join('\n').slice(0, 2000),
      raw: '',
    };
  }

  const status = runCommand('msstore', [
    'submission',
    'status',
    process.env.MSSTORE_PRODUCT_ID,
  ]);
  const output = [status.stdout, status.stderr].filter(Boolean).join('\n');
  const submissionStatus = parseMicrosoftSubmissionStatus(output);

  return {
    platform: 'Windows Store',
    area: 'Submission status',
    current: submissionStatus || 'status unavailable',
    status: status.status === 0 ? classifyMicrosoftStatus(submissionStatus) : 'needs attention',
    source: 'msstore submission status',
    notes: status.status === 0
      ? 'Read-only Partner Center status query.'
      : [status.stderr, status.stdout, status.error].filter(Boolean).join('\n').slice(0, 2000),
    raw: output,
  };
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

function createAppStoreToken() {
  const keyId = process.env.ASC_API_KEY_ID;
  const issuerId = process.env.ASC_API_ISSUER_ID;
  const privateKey = appStorePrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 20 * 60,
    aud: 'appstoreconnect-v1',
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const derSignature = crypto.createSign('SHA256').update(signingInput).sign(privateKey);
  return `${signingInput}.${derToJose(derSignature)}`;
}

function httpGetJson(url, token) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'GnuNae store-status-watch',
      },
      timeout: 15000,
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode}: ${body.slice(0, 1000)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Invalid JSON from ${url}: ${error.message}`));
        }
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error(`Timeout fetching ${url}`));
    });
    request.on('error', reject);
  });
}

function appStoreUrl(pathname, params = {}) {
  const url = new URL(`https://api.appstoreconnect.apple.com${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.append(key, value);
    }
  }
  return url.toString();
}

function classifyAppStoreBuild(state) {
  const normalized = String(state || '').toUpperCase();
  if (!normalized) return 'manual review';
  if (['FAILED', 'INVALID'].includes(normalized)) return 'needs attention';
  if (['PROCESSING'].includes(normalized)) return 'processing';
  if (['VALID'].includes(normalized)) return 'processed';
  return 'needs review';
}

function classifyAppStoreVersion(state) {
  const normalized = String(state || '').toUpperCase();
  if (!normalized) return 'manual review';
  if (['READY_FOR_DISTRIBUTION'].includes(normalized)) return 'published';
  if ([
    'WAITING_FOR_REVIEW',
    'IN_REVIEW',
    'PENDING_APPLE_RELEASE',
    'PENDING_DEVELOPER_RELEASE',
    'PROCESSING_FOR_APP_STORE',
  ].includes(normalized)) return 'in review';
  if ([
    'REJECTED',
    'METADATA_REJECTED',
    'DEVELOPER_REJECTED',
    'REMOVED_FROM_SALE',
  ].includes(normalized)) return 'needs attention';
  if (['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REMOVED_FROM_SALE'].includes(normalized)) return 'manual review';
  return 'needs review';
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function newestByAttribute(items, attributeName) {
  return [...(items || [])].sort((left, right) => {
    const leftTime = Date.parse(left.attributes?.[attributeName] || '') || 0;
    const rightTime = Date.parse(right.attributes?.[attributeName] || '') || 0;
    return rightTime - leftTime;
  })[0] || null;
}

async function checkMacAppStore(packageJson) {
  const bundleId = process.env.APP_STORE_CONNECT_BUNDLE_ID || packageJson.build?.appId || '';
  const missing = requiredEnv(['ASC_API_KEY_ID', 'ASC_API_ISSUER_ID']);
  const privateKey = appStorePrivateKey();
  if (!privateKey) missing.push('ASC_API_PRIVATE_KEY or ASC_API_PRIVATE_KEY_BASE64');

  if (missing.length > 0) {
    return [
      {
        platform: 'Mac App Store',
        area: 'App Store Connect API',
        current: 'missing credentials',
        status: 'manual review',
        source: 'App Store Connect API',
        notes: `Missing environment variables: ${missing.join(', ')}`,
      },
    ];
  }

  try {
    const token = createAppStoreToken();
    let appId = process.env.APP_STORE_CONNECT_APP_ID || '';
    let appName = '';

    if (!appId) {
      const apps = await httpGetJson(appStoreUrl('/v1/apps', {
        'filter[bundleId]': bundleId,
        'limit': '1',
      }), token);
      const app = Array.isArray(apps.data) ? apps.data[0] : null;
      appId = app ? app.id : '';
      appName = app && app.attributes ? app.attributes.name || '' : '';
    }

    if (!appId) {
      return [
        {
          platform: 'Mac App Store',
          area: 'App lookup',
          current: `no app found for ${bundleId}`,
          status: 'needs attention',
          source: 'App Store Connect API',
          notes: 'Set APP_STORE_CONNECT_APP_ID if bundle ID lookup is not available for the API key.',
        },
      ];
    }

    const builds = await httpGetJson(appStoreUrl('/v1/builds', {
      'filter[app]': appId,
      'limit': '5',
      'fields[builds]': 'version,uploadedDate,processingState,expired',
    }), token);
    const latestBuild = newestByAttribute(builds.data, 'uploadedDate');
    const latestBuildAttrs = latestBuild ? latestBuild.attributes || {} : {};

    const versions = await httpGetJson(appStoreUrl(`/v1/apps/${appId}/appStoreVersions`, {
      'filter[platform]': 'MAC_OS',
      'limit': '5',
      'fields[appStoreVersions]': 'versionString,appStoreState,platform,createdDate',
    }), token);
    const latestVersion = newestByAttribute(versions.data, 'createdDate');
    const latestVersionAttrs = latestVersion ? latestVersion.attributes || {} : {};

    return [
      {
        platform: 'Mac App Store',
        area: 'Latest build processing',
        current: latestBuild
          ? `build ${latestBuildAttrs.version || latestBuild.id}: ${latestBuildAttrs.processingState || 'state unknown'}`
          : 'no builds returned',
        status: latestBuild ? classifyAppStoreBuild(latestBuildAttrs.processingState) : 'manual review',
        source: 'App Store Connect API builds',
        notes: latestBuild
          ? `Uploaded: ${formatDate(latestBuildAttrs.uploadedDate) || 'unknown'}; expired: ${latestBuildAttrs.expired === true ? 'yes' : 'no'}${appName ? `; app: ${appName}` : ''}`
          : 'Confirm TestFlight/App Store Connect manually.',
      },
      {
        platform: 'Mac App Store',
        area: 'Latest app version review',
        current: latestVersion
          ? `${latestVersionAttrs.versionString || latestVersion.id}: ${latestVersionAttrs.appStoreState || 'state unknown'}`
          : 'no macOS app versions returned',
        status: latestVersion ? classifyAppStoreVersion(latestVersionAttrs.appStoreState) : 'manual review',
        source: 'App Store Connect API appStoreVersions',
        notes: latestVersion
          ? `Created: ${formatDate(latestVersionAttrs.createdDate) || 'unknown'}; platform: ${latestVersionAttrs.platform || 'unknown'}`
          : 'Confirm App Store version state manually.',
      },
    ];
  } catch (error) {
    return [
      {
        platform: 'Mac App Store',
        area: 'App Store Connect API',
        current: 'query failed',
        status: 'needs attention',
        source: 'App Store Connect API',
        notes: sanitizeText(error.message).slice(0, 2000),
      },
    ];
  }
}

function statusNeedsAttention(status) {
  return ['needs attention', 'needs review', 'manual review'].includes(status);
}

function buildReport(report) {
  const attentionRows = report.rows.filter((row) => statusNeedsAttention(row.status));
  const statusSummary = attentionRows.length
    ? `${attentionRows.length} store status row(s) need review.`
    : 'No failed or manually blocked store status rows were detected.';

  const rowsTable = markdownTable(
    ['Platform', 'Area', 'Current', 'Status', 'Source', 'Notes'],
    report.rows.map((row) => [row.platform, row.area, row.current, row.status, row.source, row.notes])
  );

  const attentionTable = attentionRows.length
    ? markdownTable(
      ['Platform', 'Area', 'Current', 'Status', 'Notes'],
      attentionRows.map((row) => [row.platform, row.area, row.current, row.status, row.notes])
    )
    : '- No store status rows currently need attention.';

  return `# Store Status Watch

Generated: ${report.generatedAt}

Repository version: ${report.packageVersion}

This is a read-only store review/status report. It does not build packages,
upload binaries, publish submissions, change store metadata, sign artifacts, or
rotate secrets.

## Summary

${statusSummary}

## Store Status Signals

${rowsTable}

## Rows Needing Owner Review

${attentionTable}

## Required Human Review

- Confirm Windows certification and publication details in Microsoft Partner
  Center when status is not published or when the CLI reports a failure.
- Confirm Mac App Store/TestFlight build processing and app version review state
  in App Store Connect when status is missing, failed, rejected, or still in
  draft.
- Keep review-status polling separate from release automation. This workflow
  must not submit metadata, publish releases, or modify store configuration.

## Credentials Used

- Microsoft Store: \`MSSTORE_TENANT_ID\`, \`MSSTORE_CLIENT_ID\`,
  \`MSSTORE_CLIENT_SECRET\`, \`MSSTORE_SELLER_ID\`, \`MSSTORE_PRODUCT_ID\`.
- App Store Connect: \`ASC_API_KEY_ID\`, \`ASC_API_ISSUER_ID\`, and either
  \`ASC_API_PRIVATE_KEY_BASE64\` or \`ASC_API_PRIVATE_KEY\`. Optional:
  \`APP_STORE_CONNECT_APP_ID\`, \`APP_STORE_CONNECT_BUNDLE_ID\`.

## References

- [Microsoft Store Developer CLI](${MICROSOFT_DOC_URL})
- [Microsoft Store CLI commands](${MICROSOFT_COMMANDS_URL})
- [App Store Connect API](${APPLE_API_URL})
- [App Store Connect builds endpoint](${APPLE_BUILDS_URL})
- [App Store Connect app store versions endpoint](${APPLE_VERSIONS_URL})
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packageJson = readJson('package.json');
  const rows = [];

  if (args.windows) {
    rows.push(checkMicrosoftStore());
  }

  if (args.mac) {
    rows.push(...await checkMacAppStore(packageJson));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    packageVersion: packageJson.version,
    appId: packageJson.build?.appId || '',
    appxIdentityName: packageJson.build?.appx?.identityName || '',
    rows,
  };

  const markdown = buildReport(report);
  fs.writeFileSync(path.resolve(args.output), markdown, 'utf8');
  console.log(`Wrote ${path.resolve(args.output)}`);

  if (args.json) {
    fs.writeFileSync(path.resolve(args.json), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${path.resolve(args.json)}`);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
