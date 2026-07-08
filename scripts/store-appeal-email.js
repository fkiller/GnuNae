#!/usr/bin/env node
/*
 * Generate or send a Microsoft Store certification appeal email.
 *
 * Dry-run is the default and requires no credentials. Send mode uses Microsoft
 * Graph application credentials and requires explicit confirmation.
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

const DEFAULT_RECIPIENT = 'reportapp@microsoft.com';
const DEFAULT_SENDER = 'wdong@bigdad.us';
const SEND_CONFIRMATION = 'SEND_TO_MICROSOFT_STORE';

function parseArgs(argv) {
  const args = {
    send: false,
    output: 'store-appeal-email.md',
    json: 'store-appeal-email.json',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--send') {
      args.send = true;
    } else if (arg === '--dry-run') {
      args.send = false;
    } else if (arg === '--output' && argv[i + 1]) {
      args.output = argv[++i];
    } else if (arg === '--json' && argv[i + 1]) {
      args.json = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/store-appeal-email.js [--dry-run|--send] [--output file] [--json file]

Environment:
  STORE_APPEAL_RECIPIENT optional; defaults to ${DEFAULT_RECIPIENT}
  STORE_APPEAL_SEND_CONFIRM required for --send; must equal ${SEND_CONFIRMATION}
  MS365_TENANT_ID required for --send
  MS365_CLIENT_ID required for --send
  MS365_CLIENT_SECRET required for --send
  MS365_SENDER_USER optional; defaults to ${DEFAULT_SENDER}
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function request(method, url, { headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function requiredEnv(names) {
  return names.filter((name) => !process.env[name]);
}

function knownSecretValues() {
  return [
    process.env.MS365_CLIENT_SECRET,
  ].filter((value) => value && value.length >= 8);
}

function sanitizeText(text) {
  let sanitized = String(text || '');
  for (const secret of knownSecretValues()) {
    sanitized = sanitized.split(secret).join('[redacted]');
  }
  return sanitized;
}

function buildAppeal() {
  const recipient = process.env.STORE_APPEAL_RECIPIENT || DEFAULT_RECIPIENT;
  const sender = process.env.MS365_SENDER_USER || DEFAULT_SENDER;
  const subject = 'Appeal request: GnuNae Microsoft Store certification failure 10.1.2.10';
  const body = [
    'Hello Microsoft Store certification team,',
    '',
    'I am requesting review of the certification failure for GnuNae.',
    '',
    'Product ID: 9NZJR4NK234Q',
    'Submission ID: 1152921505701360268',
    'Report item: 10.1.2.10 Functionality - Unusable Feature: Login/Sign-up',
    'Observed issue: The reviewer opened the product, attempted login/sign-up, and observed a login failed message.',
    '',
    'Clarification for review:',
    'GnuNae does not provide its own first-party account creation system. The login flow is the OpenAI authentication flow used by the Codex sidebar. A valid OpenAI account with access to Codex/ChatGPT Pro is required for the AI automation features, as described in the Store listing.',
    '',
    'If the reviewer tested without an eligible OpenAI account, or if the test environment blocked the third-party OpenAI sign-in flow, the app can report login failure even though the app package and browser shell are functioning. The product can launch and provide the browser UI, but Codex automation requires successful OpenAI authentication.',
    '',
    'Could you please either:',
    '1. Re-test the login flow using an OpenAI account that has Codex/ChatGPT Pro access, or',
    '2. Provide the exact login failure screen/message and any related test details so we can identify whether this is an app defect, a third-party authentication prerequisite issue, or an environment-specific sign-in block?',
    '',
    'If Microsoft requires additional certification instructions or test-access details through Partner Center for this app category, please let us know the correct secure channel. We will update the certification notes on resubmission to make the account prerequisite and test steps explicit.',
    '',
    'Thank you,',
    'Won Dong',
    'BigDad',
    'wdong@bigdad.us',
    '',
  ].join('\n');

  return { recipient, sender, subject, body };
}

function markdownForAppeal(appeal, mode, sendResult = null) {
  return [
    '# Microsoft Store Appeal Email',
    '',
    `Mode: ${mode}`,
    `From: ${appeal.sender}`,
    `To: ${appeal.recipient}`,
    `Subject: ${appeal.subject}`,
    sendResult ? `Send result: ${sendResult}` : '',
    '',
    '## Body',
    '',
    '```text',
    appeal.body.trimEnd(),
    '```',
    '',
  ].filter((line) => line !== '').join('\n');
}

async function getGraphToken() {
  const missing = requiredEnv(['MS365_TENANT_ID', 'MS365_CLIENT_ID', 'MS365_CLIENT_SECRET']);
  if (missing.length > 0) {
    throw new Error(`Missing Microsoft Graph environment variables: ${missing.join(', ')}`);
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.MS365_CLIENT_ID,
    client_secret: process.env.MS365_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
  }).toString();

  const response = await request(
    'POST',
    `https://login.microsoftonline.com/${encodeURIComponent(process.env.MS365_TENANT_ID)}/oauth2/v2.0/token`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
      body,
    },
  );

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Microsoft Graph token request failed: HTTP ${response.statusCode}\n${sanitizeText(response.body).slice(0, 2000)}`);
  }

  return JSON.parse(response.body).access_token;
}

async function sendAppeal(appeal) {
  if (process.env.STORE_APPEAL_SEND_CONFIRM !== SEND_CONFIRMATION) {
    throw new Error(`Refusing to send email without STORE_APPEAL_SEND_CONFIRM=${SEND_CONFIRMATION}`);
  }

  const token = await getGraphToken();
  const message = {
    message: {
      subject: appeal.subject,
      body: {
        contentType: 'Text',
        content: appeal.body,
      },
      toRecipients: [
        {
          emailAddress: {
            address: appeal.recipient,
          },
        },
      ],
    },
    saveToSentItems: true,
  };

  const response = await request(
    'POST',
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(appeal.sender)}/sendMail`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    },
  );

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Microsoft Graph sendMail failed: HTTP ${response.statusCode}\n${sanitizeText(response.body).slice(0, 2000)}`);
  }

  return `sent via Microsoft Graph HTTP ${response.statusCode}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appeal = buildAppeal();
  let sendResult = null;

  if (args.send) {
    sendResult = await sendAppeal(appeal);
  }

  const mode = args.send ? 'send' : 'dry-run';
  const markdown = markdownForAppeal(appeal, mode, sendResult);
  fs.writeFileSync(path.resolve(args.output), markdown);
  if (args.json) {
    fs.writeFileSync(path.resolve(args.json), JSON.stringify({
      mode,
      sent: Boolean(sendResult),
      sendResult,
      appeal,
    }, null, 2));
  }

  console.log(`Wrote ${args.output}`);
  if (args.json) console.log(`Wrote ${args.json}`);
  if (sendResult) console.log(sendResult);
}

main().catch((error) => {
  console.error(sanitizeText(error.stack || error.message || error));
  process.exit(1);
});
