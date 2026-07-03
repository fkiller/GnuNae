#!/usr/bin/env node
/**
 * Advisory maintenance scanner for GnuNae.
 *
 * This script reads pinned versions from the repository, checks public upstream
 * metadata where possible, and writes a Markdown report for a GitHub Issue. It
 * does not modify dependencies, push tags, package builds, upload to stores, or
 * read secrets.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = 'maintenance-report.md';
const DEFAULT_JSON_OUTPUT = 'maintenance-report.json';

const RELEASE_NOTES = {
  codex: 'https://developers.openai.com/codex/changelog',
  codexCli: 'https://github.com/openai/codex/releases',
  playwright: 'https://playwright.dev/docs/release-notes',
  playwrightMcp: 'https://www.npmjs.com/package/@playwright/mcp',
  electron: 'https://github.com/electron/electron/releases',
  electronTimeline: 'https://www.electronjs.org/docs/latest/tutorial/electron-timelines',
  mcpSdk: 'https://github.com/modelcontextprotocol/typescript-sdk/releases',
  node: 'https://nodejs.org/en/about/previous-releases',
  electronBuilder: 'https://github.com/electron-userland/electron-builder/releases',
  msstoreCli: 'https://github.com/microsoft/msstore-cli',
};

const WATCH_PACKAGES = [
  { name: '@openai/codex', area: 'Codex CLI package', notes: RELEASE_NOTES.codexCli },
  { name: '@playwright/mcp', area: 'Playwright MCP package', notes: RELEASE_NOTES.playwrightMcp },
  { name: 'playwright', area: 'Playwright package', notes: RELEASE_NOTES.playwright },
  { name: 'electron', area: 'Electron package', notes: RELEASE_NOTES.electron },
  { name: '@modelcontextprotocol/sdk', area: 'MCP TypeScript SDK', notes: RELEASE_NOTES.mcpSdk },
  { name: 'electron-builder', area: 'electron-builder package', notes: RELEASE_NOTES.electronBuilder },
  { name: 'vite', area: 'Vite package', notes: 'https://github.com/vitejs/vite/releases' },
  { name: 'typescript', area: 'TypeScript package', notes: 'https://github.com/microsoft/TypeScript/releases' },
  { name: 'react', area: 'React package', notes: 'https://github.com/facebook/react/releases' },
  { name: 'react-dom', area: 'React DOM package', notes: 'https://github.com/facebook/react/releases' },
];

function parseArgs(argv) {
  const args = { output: DEFAULT_OUTPUT, json: DEFAULT_JSON_OUTPUT };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--output' && argv[i + 1]) {
      args.output = argv[++i];
    } else if (arg === '--json' && argv[i + 1]) {
      args.json = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/maintenance-watch.js [--output <file>] [--json <file>]

Creates an advisory Markdown report for scheduled maintenance. The script reads
the repository and public upstream metadata only; it does not change project
files, dependencies, tags, releases, packages, stores, or secrets.`);
}

function resolveOutput(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function tryReadText(relativePath) {
  try {
    return readText(relativePath);
  } catch {
    return '';
  }
}

function tryExec(command) {
  try {
    return execSync(command, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeVersion(value) {
  const match = String(value || '').match(/\d+(?:\.\d+){0,3}(?:[-+][0-9A-Za-z.-]+)?/);
  return match ? match[0] : '';
}

function versionParts(value) {
  const normalized = normalizeVersion(value);
  if (!normalized) return [];
  return normalized
    .split(/[.-]/)
    .slice(0, 4)
    .map((part) => {
      const number = Number.parseInt(part, 10);
      return Number.isFinite(number) ? number : 0;
    });
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  const length = Math.max(a.length, b.length, 3);

  for (let i = 0; i < length; i++) {
    const ai = a[i] || 0;
    const bi = b[i] || 0;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }

  return 0;
}

function majorVersion(value) {
  const match = String(value || '').match(/v?(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function statusFromVersions(current, latest) {
  if (!current) return 'missing current pin';
  if (!latest) return 'latest unknown';
  const comparison = compareVersions(current, latest);
  if (comparison < 0) return 'update available';
  if (comparison > 0) return 'current newer than latest';
  return 'current';
}

function isAttentionStatus(status) {
  return !['current', 'same major', 'tracking major', 'manual review'].includes(status);
}

function httpGetJson(url, { headers = {}, timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'accept': 'application/json',
        'user-agent': 'GnuNae-maintenance-watch',
        ...headers,
      },
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        const nextUrl = new URL(response.headers.location, url).toString();
        resolve(httpGetJson(nextUrl, { headers, timeoutMs }));
        return;
      }

      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode} from ${url}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Invalid JSON from ${url}: ${error.message}`));
        }
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timed out after ${timeoutMs} ms: ${url}`));
    });

    request.on('error', reject);
  });
}

async function capture(name, warnings, task) {
  try {
    return await task();
  } catch (error) {
    warnings.push(`${name}: ${error.message}`);
    return null;
  }
}

async function npmLatest(packageName, warnings) {
  const encoded = encodeURIComponent(packageName).replace(/^%40/, '@');
  const data = await capture(`npm latest ${packageName}`, warnings, () => (
    httpGetJson(`https://registry.npmjs.org/${encoded}/latest`)
  ));
  return data && data.version ? data.version : '';
}

async function nodeReleaseInfo(currentNodeVersion, warnings) {
  const data = await capture('Node.js release index', warnings, () => (
    httpGetJson('https://nodejs.org/dist/index.json')
  ));
  if (!Array.isArray(data)) {
    return { latestSameMajor: '', latestLts: '' };
  }

  const currentMajor = majorVersion(currentNodeVersion);
  const sorted = [...data].sort((a, b) => compareVersions(b.version, a.version));
  const latestSameMajor = sorted.find((release) => majorVersion(release.version) === currentMajor);
  const latestLts = sorted.find((release) => release.lts);

  return {
    latestSameMajor: latestSameMajor ? normalizeVersion(latestSameMajor.version) : '',
    latestLts: latestLts ? normalizeVersion(latestLts.version) : '',
  };
}

async function githubLatestTag(repo, warnings) {
  const headers = {};
  if (process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const data = await capture(`GitHub tags ${repo}`, warnings, () => (
    httpGetJson(`https://api.github.com/repos/${repo}/tags?per_page=20`, { headers })
  ));

  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }

  const sorted = data
    .map((tag) => tag.name)
    .filter(Boolean)
    .sort((a, b) => compareVersions(b, a));

  return sorted[0] || data[0].name || '';
}

function getPackageVersion(packageJson, packageLock, packageName) {
  const dependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  };
  const spec = dependencies[packageName] || '';
  const lockPath = `node_modules/${packageName}`;
  const locked = packageLock.packages && packageLock.packages[lockPath]
    ? packageLock.packages[lockPath].version
    : packageLock.dependencies && packageLock.dependencies[packageName]
      ? packageLock.dependencies[packageName].version
      : '';

  return {
    spec,
    locked,
    current: locked || normalizeVersion(spec),
  };
}

function parseRuntimePins() {
  const runtimeManager = tryReadText('src/core/runtime-manager.ts');
  const downloadNode = tryReadText('scripts/download-node.js');
  const dockerfile = tryReadText('docker/Dockerfile');

  const runtimeCodex = runtimeManager.match(/CODEX_VERSION\s*=\s*['"]([^'"]+)['"]/);
  const runtimeMcp = runtimeManager.match(/PLAYWRIGHT_MCP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  const runtimeNode = runtimeManager.match(/NODE_VERSION\s*=\s*['"]([^'"]+)['"]/);
  const downloadNodeDefault = downloadNode.match(/version:\s*['"]([^'"]+)['"]/);
  const dockerBase = dockerfile.match(/^FROM\s+mcr\.microsoft\.com\/playwright:v([^- \n]+)-([^\s]+)\s*$/m);
  const dockerCodex = dockerfile.match(/@openai\/codex@([0-9A-Za-z.+-]+)/);
  const dockerMcp = dockerfile.match(/@playwright\/mcp@([0-9A-Za-z.+-]+)/);

  return {
    runtimeCodex: runtimeCodex ? runtimeCodex[1] : '',
    runtimeMcp: runtimeMcp ? runtimeMcp[1] : '',
    runtimeNode: runtimeNode ? runtimeNode[1] : '',
    downloadNodeDefault: downloadNodeDefault ? downloadNodeDefault[1] : '',
    dockerPlaywright: dockerBase ? dockerBase[1] : '',
    dockerPlaywrightImageSuffix: dockerBase ? dockerBase[2] : '',
    dockerCodex: dockerCodex ? dockerCodex[1] : '',
    dockerMcp: dockerMcp ? dockerMcp[1] : '',
  };
}

function parseGitHubActions() {
  const workflowsDir = path.join(ROOT, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) return [];

  const actions = [];
  const files = fs.readdirSync(workflowsDir).filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'));
  const usesPattern = /^\s*uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?)@([^\s#]+)/gm;

  for (const file of files) {
    const text = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
    let match;
    while ((match = usesPattern.exec(text)) !== null) {
      const action = match[1];
      const ref = match[2].replace(/^['"]|['"]$/g, '');
      const [owner, repo] = action.split('/');
      actions.push({ file: `.github/workflows/${file}`, action, repo: `${owner}/${repo}`, ref });
    }
  }

  const byKey = new Map();
  for (const action of actions) {
    const key = `${action.action}@${action.ref}`;
    if (!byKey.has(key)) {
      byKey.set(key, { ...action, files: [] });
    }
    byKey.get(key).files.push(action.file);
  }

  return [...byKey.values()].map((action) => ({
    action: action.action,
    repo: action.repo,
    ref: action.ref,
    files: unique(action.files),
  }));
}

function actionStatus(currentRef, latestTag) {
  if (!latestTag) return 'latest unknown';
  if (/^[0-9a-f]{40}$/i.test(currentRef)) return 'pinned SHA';
  if (currentRef.includes('${{')) return 'dynamic ref';

  const currentMajor = majorVersion(currentRef);
  const latestMajor = majorVersion(latestTag);
  if (currentMajor !== null && latestMajor !== null) {
    if (currentMajor < latestMajor) return 'major update available';
    if (currentMajor > latestMajor) return 'current major newer than latest tag';
    if (/^v?\d+$/.test(currentRef)) return 'tracking major';
  }

  const comparison = compareVersions(currentRef, latestTag);
  if (comparison < 0) return 'update available';
  if (comparison > 0) return 'current newer than latest';
  return 'current';
}

function markdownTable(headers, rows) {
  const escape = (value) => String(value == null ? '' : value)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');

  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n');
}

function formatLink(label, url) {
  return url ? `[${label}](${url})` : label;
}

function buildReport(report) {
  const attentionRows = [
    ...report.packageRows.filter((row) => isAttentionStatus(row.status)),
    ...report.runtimeRows.filter((row) => isAttentionStatus(row.status)),
    ...report.actionRows.filter((row) => isAttentionStatus(row.status)),
  ];

  const summary = [
    `Generated: ${report.generatedAt}`,
    `Commit: ${report.commit || 'unknown'}`,
    `Workflow run: ${report.runUrl || 'local/manual'}`,
    '',
    'This is an advisory maintenance report. It does not deploy, sign, notarize,',
    'submit store packages, push tags, rotate secrets, or change repository files.',
  ].join('\n');

  const attentionSection = attentionRows.length
    ? markdownTable(
      ['Area', 'Current', 'Latest or expected', 'Status', 'Source'],
      attentionRows.map((row) => [row.area, row.current, row.latest, row.status, row.source])
    )
    : 'No automated version deltas were detected. Still review upstream release notes before release candidates.';

  const packageSection = markdownTable(
    ['Package', 'Spec', 'Locked', 'Latest', 'Status', 'Release notes'],
    report.packageRows.map((row) => [
      row.name,
      row.spec,
      row.current,
      row.latest,
      row.status,
      formatLink('notes', row.notes),
    ])
  );

  const runtimeSection = markdownTable(
    ['Area', 'Current', 'Latest or expected', 'Status', 'Source'],
    report.runtimeRows.map((row) => [row.area, row.current, row.latest, row.status, row.source])
  );

  const actionsSection = report.actionRows.length
    ? markdownTable(
      ['Action', 'Current ref', 'Latest tag', 'Status', 'Files'],
      report.actionRows.map((row) => [
        row.action,
        row.current,
        row.latest,
        row.status,
        row.files.join('<br>'),
      ])
    )
    : 'No reusable GitHub Actions were found in `.github/workflows`.';

  const warningsSection = report.warnings.length
    ? report.warnings.map((warning) => `- ${warning}`).join('\n')
    : '- No upstream fetch warnings.';

  return `# Periodic Maintenance Watch

${summary}

## Attention Summary

${attentionSection}

## Package Version Signals

${packageSection}

## Runtime And Packaging Pins

${runtimeSection}

## GitHub Actions Signals

${actionsSection}

## Required Human Review

- Read upstream "what's new" or release notes before changing Codex CLI,
  Playwright MCP, Playwright, Electron, MCP SDK, Node.js, Docker base images,
  electron-builder, GitHub Actions, or store tooling.
- Open narrow PRs for version changes. Do not combine dependency/runtime bumps
  with release workflow or signing changes unless owner-approved.
- Run the standard PR build matrix before merge.
- For release candidates, use the release checklist and owner-approved tag flow.
- Keep Mac App Store upload local through \`npm run deploy:mas\` until a
  separate owner-reviewed PR moves that flow into GitHub Actions.

## Upstream References

- ${formatLink('OpenAI Codex changelog', RELEASE_NOTES.codex)}
- ${formatLink('OpenAI Codex CLI releases', RELEASE_NOTES.codexCli)}
- ${formatLink('Playwright release notes', RELEASE_NOTES.playwright)}
- ${formatLink('Playwright MCP package', RELEASE_NOTES.playwrightMcp)}
- ${formatLink('Electron releases', RELEASE_NOTES.electron)}
- ${formatLink('Electron release timeline', RELEASE_NOTES.electronTimeline)}
- ${formatLink('MCP TypeScript SDK releases', RELEASE_NOTES.mcpSdk)}
- ${formatLink('Node.js releases', RELEASE_NOTES.node)}
- ${formatLink('electron-builder releases', RELEASE_NOTES.electronBuilder)}
- ${formatLink('Microsoft Store CLI', RELEASE_NOTES.msstoreCli)}

## Fetch Warnings

${warningsSection}
`;
}

async function main() {
  const args = parseArgs(process.argv);
  const packageJson = readJson('package.json');
  const packageLock = readJson('package-lock.json');
  const runtimePins = parseRuntimePins();
  const actionPins = parseGitHubActions();
  const warnings = [];

  const latestPackages = new Map();
  for (const packageName of unique(WATCH_PACKAGES.map((pkg) => pkg.name))) {
    latestPackages.set(packageName, await npmLatest(packageName, warnings));
  }

  const nodeCurrent = runtimePins.runtimeNode || runtimePins.downloadNodeDefault;
  const nodeInfo = await nodeReleaseInfo(nodeCurrent, warnings);

  const latestActionTags = new Map();
  for (const action of actionPins) {
    if (!latestActionTags.has(action.repo)) {
      latestActionTags.set(action.repo, await githubLatestTag(action.repo, warnings));
    }
  }

  const packageRows = WATCH_PACKAGES
    .map((pkg) => {
      const current = getPackageVersion(packageJson, packageLock, pkg.name);
      const latest = latestPackages.get(pkg.name) || '';
      return {
        area: pkg.area,
        name: pkg.name,
        spec: current.spec || 'not declared',
        current: current.locked || current.current || 'not declared',
        latest: latest || 'unknown',
        status: current.current ? statusFromVersions(current.current, latest) : 'not declared',
        source: pkg.name,
        notes: pkg.notes,
      };
    })
    .filter((row) => row.spec !== 'not declared');

  const runtimeRows = [
    {
      area: 'RuntimeManager CODEX_VERSION',
      current: runtimePins.runtimeCodex || 'missing',
      latest: latestPackages.get('@openai/codex') || 'unknown',
      status: statusFromVersions(runtimePins.runtimeCodex, latestPackages.get('@openai/codex')),
      source: 'src/core/runtime-manager.ts',
    },
    {
      area: 'Docker Codex CLI',
      current: runtimePins.dockerCodex || 'missing',
      latest: latestPackages.get('@openai/codex') || 'unknown',
      status: statusFromVersions(runtimePins.dockerCodex, latestPackages.get('@openai/codex')),
      source: 'docker/Dockerfile',
    },
    {
      area: 'RuntimeManager PLAYWRIGHT_MCP_VERSION',
      current: runtimePins.runtimeMcp || 'missing',
      latest: latestPackages.get('@playwright/mcp') || 'unknown',
      status: statusFromVersions(runtimePins.runtimeMcp, latestPackages.get('@playwright/mcp')),
      source: 'src/core/runtime-manager.ts',
    },
    {
      area: 'Docker Playwright MCP',
      current: runtimePins.dockerMcp || 'missing',
      latest: latestPackages.get('@playwright/mcp') || 'unknown',
      status: statusFromVersions(runtimePins.dockerMcp, latestPackages.get('@playwright/mcp')),
      source: 'docker/Dockerfile',
    },
    {
      area: 'Docker Playwright base image',
      current: runtimePins.dockerPlaywright
        ? `${runtimePins.dockerPlaywright}-${runtimePins.dockerPlaywrightImageSuffix}`
        : 'missing',
      latest: latestPackages.get('playwright') || 'unknown',
      status: statusFromVersions(runtimePins.dockerPlaywright, latestPackages.get('playwright')),
      source: 'docker/Dockerfile',
    },
    {
      area: 'RuntimeManager NODE_VERSION',
      current: runtimePins.runtimeNode || 'missing',
      latest: nodeInfo.latestSameMajor || 'unknown',
      status: statusFromVersions(runtimePins.runtimeNode, nodeInfo.latestSameMajor),
      source: 'src/core/runtime-manager.ts',
    },
    {
      area: 'download-node.js default Node',
      current: runtimePins.downloadNodeDefault || 'missing',
      latest: runtimePins.runtimeNode || 'RuntimeManager NODE_VERSION missing',
      status: runtimePins.downloadNodeDefault === runtimePins.runtimeNode ? 'current' : 'mismatch',
      source: 'scripts/download-node.js',
    },
    {
      area: 'Latest Node.js LTS line',
      current: nodeCurrent || 'missing',
      latest: nodeInfo.latestLts || 'unknown',
      status: nodeInfo.latestLts && majorVersion(nodeCurrent) !== majorVersion(nodeInfo.latestLts)
        ? 'new LTS major available'
        : 'manual review',
      source: RELEASE_NOTES.node,
    },
  ];

  const actionRows = actionPins.map((action) => {
    const latest = latestActionTags.get(action.repo) || '';
    return {
      area: action.action,
      action: action.action,
      current: action.ref,
      latest: latest || 'unknown',
      status: actionStatus(action.ref, latest),
      files: action.files,
      source: action.files.join(', '),
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || tryExec('git rev-parse --short HEAD'),
    runUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : '',
    packageRows,
    runtimeRows,
    actionRows,
    warnings,
  };

  const markdown = buildReport(report);
  fs.writeFileSync(resolveOutput(args.output), markdown, 'utf8');
  fs.writeFileSync(resolveOutput(args.json), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${args.output}`);
  console.log(`Wrote ${args.json}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
