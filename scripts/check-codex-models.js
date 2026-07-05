#!/usr/bin/env node
/**
 * Verifies that GnuNae's generated Codex model manifest is the single local
 * source of truth and stays aligned with app defaults.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = 'src/core/codex-models.json';
const OFFICIAL_SOURCE = 'https://developers.openai.com/codex/models';

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function fail(message) {
  console.error(`Codex model check failed: ${message}`);
  process.exitCode = 1;
}

const manifest = JSON.parse(read(MANIFEST_PATH));
const constantsText = read('src/ui/constants/codex.ts');
const settingsText = read('src/core/settings.ts');
const mainText = read('src/electron/main.ts');

const models = Array.isArray(manifest.models) ? manifest.models.map((entry) => entry.value) : [];
const deprecated = new Set(Array.isArray(manifest.deprecated) ? manifest.deprecated : []);
const settingsDefaultModel = settingsText.match(/codex:\s*{[\s\S]*?model:\s*'([^']+)'/)?.[1] || '';

if (manifest.sourceUrl !== OFFICIAL_SOURCE) {
  fail(`${MANIFEST_PATH} sourceUrl must be ${OFFICIAL_SOURCE}.`);
}

if (models.length === 0) {
  fail(`${MANIFEST_PATH} does not contain any models.`);
}

if (!manifest.defaultModel || !models.includes(manifest.defaultModel)) {
  fail(`defaultModel (${manifest.defaultModel || 'missing'}) is absent from models.`);
}

for (const model of models) {
  if (deprecated.has(model)) {
    fail(`model list includes deprecated Codex model: ${model}.`);
  }
}

if (settingsDefaultModel !== manifest.defaultModel) {
  fail(`settings default (${settingsDefaultModel || 'missing'}) does not match manifest default (${manifest.defaultModel}).`);
}

if (!constantsText.includes("../../core/codex-models.json")) {
  fail('src/ui/constants/codex.ts must import the generated model manifest.');
}

if (!mainText.includes("../core/codex-models.json")) {
  fail('src/electron/main.ts must import the generated model manifest.');
}

if (!process.exitCode) {
  console.log(`Codex model manifest is aligned with app defaults (${models.join(', ')}; default ${manifest.defaultModel}).`);
}
