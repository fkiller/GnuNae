#!/usr/bin/env node
/**
 * Fetches the official Codex models page and converts the recommended models
 * into src/core/codex-models.json, the app's local model manifest.
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const tls = require('tls');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_URL = 'https://developers.openai.com/codex/models';
const OUTPUT = path.join(ROOT, 'src/core/codex-models.json');
const CHECK = process.argv.includes('--check');

function proxyFor(url) {
  const target = new URL(url);
  const proxy = target.protocol === 'https:'
    ? process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
    : process.env.HTTP_PROXY || process.env.http_proxy;
  return proxy ? new URL(proxy) : null;
}

function readResponseBody(res, url, resolve, reject) {
  if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
    res.resume();
    resolve(fetchText(new URL(res.headers.location, url).toString()));
    return;
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    res.resume();
    reject(new Error(`HTTP ${res.statusCode} from ${url}`));
    return;
  }
  let body = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => resolve(body));
}

function fetchViaProxy(url, proxy) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const connect = http.request({
      host: proxy.hostname,
      port: proxy.port || 8080,
      method: 'CONNECT',
      path: `${target.hostname}:443`,
      headers: { host: `${target.hostname}:443` },
    });

    connect.once('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`Proxy CONNECT ${res.statusCode} for ${target.hostname}`));
        return;
      }

      const secureSocket = tls.connect({ socket, servername: target.hostname }, () => {
        const request = [
          `GET ${target.pathname}${target.search} HTTP/1.1`,
          `Host: ${target.hostname}`,
          'User-Agent: GnuNae-codex-model-updater',
          'Connection: close',
          '',
          '',
        ].join('\r\n');
        secureSocket.write(request);
      });

      let raw = '';
      secureSocket.setEncoding('utf8');
      secureSocket.on('data', (chunk) => { raw += chunk; });
      secureSocket.once('error', reject);
      secureSocket.once('end', () => {
        const [headerText, ...bodyParts] = raw.split('\r\n\r\n');
        const statusCode = Number.parseInt(headerText.match(/^HTTP\/\d(?:\.\d)?\s+(\d+)/)?.[1] || '0', 10);
        const location = headerText.match(/\r\nlocation:\s*([^\r\n]+)/i)?.[1];
        if (statusCode >= 300 && statusCode < 400 && location) {
          resolve(fetchText(new URL(location, url).toString()));
        } else if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`HTTP ${statusCode || 'unknown'} from ${url}`));
        } else {
          resolve(bodyParts.join('\r\n\r\n'));
        }
      });
    });

    connect.once('error', reject);
    connect.end();
  });
}

function fetchText(url) {
  const proxy = proxyFor(url);
  if (proxy && new URL(url).protocol === 'https:') {
    return fetchViaProxy(url, proxy);
  }
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'GnuNae-codex-model-updater' } }, (res) => {
      readResponseBody(res, url, resolve, reject);
    }).on('error', reject);
  });
}

function labelFor(model) {
  return model
    .split('-')
    .map((part) => part === 'gpt' ? 'GPT' : part.charAt(0).toUpperCase() + part.slice(1))
    .join('-');
}

function extractRecommendedModels(html) {
  const normalized = html.replace(/<[^>]+>/g, '\n').replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
  const section = normalized.match(/Recommended models([\s\S]*?)Other models/i)?.[1] || '';
  const models = [...section.matchAll(/codex\s+-m\s+([a-z0-9.-]+)/gi)].map((match) => match[1]);
  return [...new Set(models)];
}

function extractDeprecatedModels(html) {
  const normalized = html.replace(/<[^>]+>/g, '\n').replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
  const section = normalized.match(/Deprecated Codex models([\s\S]*?)Configuring models/i)?.[1] || '';
  return [...new Set([...section.matchAll(/`?([a-z0-9.-]+)`?/gi)]
    .map((match) => match[1])
    .filter((value) => /^gpt-[a-z0-9.-]+$/.test(value)))];
}

async function main() {
  const html = await fetchText(SOURCE_URL);
  const recommended = extractRecommendedModels(html);
  if (!recommended.length) {
    throw new Error(`No recommended Codex models found at ${SOURCE_URL}`);
  }

  const manifest = {
    sourceUrl: SOURCE_URL,
    defaultModel: recommended[0],
    models: recommended.map((value) => ({ value, label: labelFor(value) })),
    deprecated: extractDeprecatedModels(html),
    updatedAt: new Date().toISOString().slice(0, 10),
  };

  const next = `${JSON.stringify(manifest, null, 2)}\n`;
  const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
  if (CHECK) {
    if (current !== next) {
      console.error('Codex model manifest is stale. Run `npm run update:codex-models`.');
      process.exit(1);
    }
    console.log(`Codex model manifest is current (${recommended.join(', ')}).`);
    return;
  }

  fs.writeFileSync(OUTPUT, next, 'utf8');
  console.log(`Wrote ${path.relative(ROOT, OUTPUT)} from ${SOURCE_URL}: ${recommended.join(', ')}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
