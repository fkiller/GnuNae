#!/usr/bin/env node
/**
 * Updates GnuNae's OpenAI/Codex maintenance pipeline pins after model releases.
 *
 * This script intentionally does not install packages. It updates the source
 * files that carry the pinned Codex CLI version; callers should refresh lockfiles
 * with npm after it runs.
 */

const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXPLICIT_VERSION_ARG = process.argv.find((arg) => arg.startsWith('--codex-version='));
const CHECK = process.argv.includes('--check');
const CODEX_VERSION = EXPLICIT_VERSION_ARG
  ? EXPLICIT_VERSION_ARG.split('=')[1]
  : process.env.CODEX_VERSION || latestPackageVersion('@openai/codex');

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(CODEX_VERSION)) {
  throw new Error(`Invalid @openai/codex version: ${CODEX_VERSION}`);
}

const MODEL_MANIFEST = readJsonIfExists('src/core/codex-models.json');
const DEFAULT_MODEL = MODEL_MANIFEST?.defaultModel || 'gpt-5.6-sol';
const FALLBACK_MODEL = fallbackModel(MODEL_MANIFEST, DEFAULT_MODEL);

const files = [
  {
    path: 'package.json',
    update(text) {
      const json = JSON.parse(text);
      json.devDependencies = json.devDependencies || {};
      json.devDependencies['@openai/codex'] = CODEX_VERSION;
      return `${JSON.stringify(json, null, 2)}\n`;
    },
  },
  {
    path: 'resources/codex/package.json',
    update(text) {
      const json = JSON.parse(text);
      json.dependencies = json.dependencies || {};
      json.dependencies['@openai/codex'] = CODEX_VERSION;
      return `${JSON.stringify(json, null, 2)}\n`;
    },
  },
  {
    path: 'resources/package.json',
    update(text) {
      const json = JSON.parse(text);
      json.dependencies = json.dependencies || {};
      json.dependencies['@openai/codex'] = CODEX_VERSION;
      return `${JSON.stringify(json, null, 2)}\n`;
    },
  },
  {
    path: 'src/core/runtime-manager.ts',
    update: replaceCodexVersion(/export const CODEX_VERSION = '[^']+';/, `export const CODEX_VERSION = '${CODEX_VERSION}';`),
  },
  {
    path: 'scripts/install-codex.js',
    update: replaceCodexVersion(/const CODEX_VERSION = '[^']+';/, `const CODEX_VERSION = '${CODEX_VERSION}';`),
  },
  {
    path: 'docker/Dockerfile',
    update: replaceCodexVersion(/@openai\/codex@[0-9A-Za-z.+-]+/, `@openai/codex@${CODEX_VERSION}`),
  },
  {
    path: 'src/core/settings.ts',
    update: replaceCodexVersion(/model: '[^']+',/, `model: '${DEFAULT_MODEL}',`),
  },
  {
    path: 'scripts/msstore-certification.js',
    update(text) {
      return text
        .replace(/defaultModel: '[^']+'/g, `defaultModel: '${DEFAULT_MODEL}'`)
        .replace(/fallbackModel: '[^']+'/g, `fallbackModel: '${FALLBACK_MODEL}'`);
    },
  },
  {
    path: 'docs/certification-notes.html',
    update(text) {
      return text
        .replace(/recommended <code>[^<]+<\/code>/g, `recommended <code>${DEFAULT_MODEL}</code>`)
        .replace(/retries with <code>[^<]+<\/code>/g, `retries with <code>${FALLBACK_MODEL}</code>`)
        .replace(/uses <code>[^<]+<\/code> by default/g, `uses <code>${DEFAULT_MODEL}</code> by default`)
        .replace(/falls\s+back to <code>[^<]+<\/code>/g, `falls\n                        back to <code>${FALLBACK_MODEL}</code>`);
    },
  },
  {
    path: 'docs/PERIODIC_MAINTENANCE.md',
    update(text) {
      return text
        .replace(/CODEX_VERSION = '[^']+'/g, `CODEX_VERSION = '${CODEX_VERSION}'`)
        .replace(/@openai\/codex@[0-9A-Za-z.+-]+/g, `@openai/codex@${CODEX_VERSION}`);
    },
  },
];

let changed = false;
for (const entry of files) {
  const filePath = path.join(ROOT, entry.path);
  const before = fs.readFileSync(filePath, 'utf8');
  const after = entry.update(before);
  if (before !== after) {
    changed = true;
    if (CHECK) {
      console.error(`${entry.path} is not aligned with @openai/codex@${CODEX_VERSION}.`);
    } else {
      fs.writeFileSync(filePath, after, 'utf8');
      console.log(`Updated ${entry.path} to @openai/codex@${CODEX_VERSION}`);
    }
  }
}

if (CHECK && changed) {
  process.exit(1);
}

console.log(`OpenAI model pipeline Codex CLI pin is ${changed && CHECK ? 'stale' : 'aligned'} (@openai/codex@${CODEX_VERSION}).`);

function replaceCodexVersion(pattern, replacement) {
  return (text) => {
    if (!pattern.test(text)) {
      throw new Error(`Could not find Codex version pattern ${pattern}`);
    }
    return text.replace(pattern, replacement);
  };
}

function readJsonIfExists(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function fallbackModel(manifest, defaultModel) {
  const models = Array.isArray(manifest?.models) ? manifest.models.map((entry) => entry.value).filter(Boolean) : [];
  return models.find((value) => value !== defaultModel && value.endsWith('-luna'))
    || models.find((value) => value !== defaultModel && value.endsWith('-mini'))
    || models.find((value) => value !== defaultModel && !value.includes('spark'))
    || models.find((value) => value !== defaultModel)
    || 'gpt-5.6-luna';
}

function latestPackageVersion(packageName) {
  return execFileSync('npm', ['view', packageName, 'version'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}
