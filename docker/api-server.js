/**
 * GnuNae Sandbox API Server
 * 
 * This server runs inside the Docker container and provides:
 * - Health check endpoint
 * - Codex CLI execution
 * - Playwright MCP control
 * - Container status information
 * 
 * Supports three browser modes:
 * - 'headless': Use container's own Chromium browser
 * - 'electron-cdp': Connect to Electron's BrowserView via CDP
 * - 'external-cdp': Connect to external browser via CDP
 */

const http = require('http');
const { spawn, ChildProcess } = require('child_process');
const url = require('url');

// Configuration
const API_PORT = parseInt(process.env.API_PORT || '3000', 10);
const CDP_PORT = parseInt(process.env.CDP_PORT || '9222', 10);
const BROWSER_MODE = process.env.BROWSER_MODE || 'headless';
const EXTERNAL_CDP_ENDPOINT = process.env.EXTERNAL_CDP_ENDPOINT || '';

// Determine the CDP endpoint to use
function getCdpEndpoint() {
    if (BROWSER_MODE === 'headless') {
        // Use container's internal browser
        return `http://127.0.0.1:${CDP_PORT}`;
    } else {
        // Use external CDP endpoint (Electron or external browser)
        return EXTERNAL_CDP_ENDPOINT;
    }
}

// Active processes
let codexProcess = null;
let playwrightMcpProcess = null;

// Server stats
const startTime = Date.now();
let requestCount = 0;

// ========== HEARTBEAT WATCHDOG ==========
// Container will self-terminate if no heartbeat received within timeout
// Uses a grace period to avoid termination on temporary network issues
const HEARTBEAT_TIMEOUT_MS = parseInt(process.env.HEARTBEAT_TIMEOUT || '30000', 10); // 30 seconds default
const HEARTBEAT_GRACE_COUNT = parseInt(process.env.HEARTBEAT_GRACE_COUNT || '3', 10); // 3 missed checks before terminate
let lastHeartbeat = Date.now();
let heartbeatEnabled = false;
let missedHeartbeatCount = 0;

function checkHeartbeat() {
    if (!heartbeatEnabled) return;

    const timeSinceHeartbeat = Date.now() - lastHeartbeat;
    if (timeSinceHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        missedHeartbeatCount++;
        console.log(`[WATCHDOG] Missed heartbeat ${missedHeartbeatCount}/${HEARTBEAT_GRACE_COUNT} (${timeSinceHeartbeat}ms since last)`);

        if (missedHeartbeatCount >= HEARTBEAT_GRACE_COUNT) {
            console.log(`[WATCHDOG] Too many missed heartbeats - Electron app likely crashed`);
            console.log('[WATCHDOG] Self-terminating container...');
            process.exit(0); // Clean exit, --rm flag will remove container
        }
    } else {
        // Reset counter if heartbeat is current
        if (missedHeartbeatCount > 0) {
            console.log(`[WATCHDOG] Heartbeat recovered after ${missedHeartbeatCount} missed checks`);
            missedHeartbeatCount = 0;
        }
    }
}

// Check heartbeat every 10 seconds
const heartbeatChecker = setInterval(checkHeartbeat, 10000);

function receiveHeartbeat() {
    lastHeartbeat = Date.now();
    missedHeartbeatCount = 0; // Reset on successful heartbeat
    if (!heartbeatEnabled) {
        heartbeatEnabled = true;
        console.log(`[WATCHDOG] Heartbeat enabled (timeout: ${HEARTBEAT_TIMEOUT_MS}ms, grace: ${HEARTBEAT_GRACE_COUNT} checks)`);
    }
}
// ========== END HEARTBEAT WATCHDOG ==========

/**
 * Execute Codex CLI with the given prompt
 */
function executeCodex(prompt, options, onData, onError, onComplete) {
    // Kill existing process if any
    if (codexProcess) {
        codexProcess.kill('SIGTERM');
        codexProcess = null;
    }

    const args = ['exec', '--skip-git-repo-check'];
    if (options.model) {
        args.push('--model', options.model);
    }

    const env = {
        ...process.env,
        ...(options.env || {}),
    };

    // Build full prompt with mode instructions and pre-prompt
    let fullPrompt = '';

    if (options.mode === 'ask') {
        fullPrompt += `You are in READ-ONLY mode. Do not click, type, or modify anything.\n\n`;
    } else if (options.mode === 'agent') {
        fullPrompt += `Confirm before critical actions (payments, final submissions).\n\n`;
    }

    if (options.prePrompt) {
        fullPrompt += options.prePrompt + '\n\n';
    }

    fullPrompt += prompt;

    codexProcess = spawn('codex', args, {
        cwd: options.workDir || '/workspace',
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Send prompt via stdin
    if (codexProcess.stdin) {
        codexProcess.stdin.write(fullPrompt);
        codexProcess.stdin.end();
    }

    // Handle output
    if (codexProcess.stdout) {
        codexProcess.stdout.on('data', (data) => {
            onData(data.toString('utf8'));
        });
    }

    if (codexProcess.stderr) {
        codexProcess.stderr.on('data', (data) => {
            onError(data.toString('utf8'));
        });
    }

    codexProcess.on('close', (code) => {
        onComplete(code);
        codexProcess = null;
    });

    codexProcess.on('error', (err) => {
        onError(`Process error: ${err.message}`);
        onComplete(1);
        codexProcess = null;
    });

    return codexProcess;
}

/**
 * Start Playwright MCP server
 */
function startPlaywrightMcp() {
    if (playwrightMcpProcess) {
        console.log('[API] Playwright MCP already running');
        return;
    }

    const cdpEndpoint = getCdpEndpoint();
    console.log(`[API] Starting Playwright MCP with CDP endpoint: ${cdpEndpoint}`);

    playwrightMcpProcess = spawn('npx', [
        '@playwright/mcp@latest',
        '--cdp-endpoint',
        cdpEndpoint,
    ], {
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (playwrightMcpProcess.stdout) {
        playwrightMcpProcess.stdout.on('data', (data) => {
            console.log('[Playwright MCP]', data.toString('utf8'));
        });
    }

    if (playwrightMcpProcess.stderr) {
        playwrightMcpProcess.stderr.on('data', (data) => {
            console.error('[Playwright MCP Error]', data.toString('utf8'));
        });
    }

    playwrightMcpProcess.on('close', (code) => {
        console.log('[API] Playwright MCP exited with code:', code);
        playwrightMcpProcess = null;
    });
}

/**
 * Parse JSON body from request
 */
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                reject(err);
            }
        });
        req.on('error', reject);
    });
}

/**
 * Send JSON response
 */
function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(data));
}

/**
 * Handle API requests
 */
async function handleRequest(req, res) {
    requestCount++;

    const parsedUrl = url.parse(req.url || '/', true);
    const path = parsedUrl.pathname || '/';
    const method = req.method || 'GET';

    console.log(`[API] ${method} ${path}`);

    // CORS preflight
    if (method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
    }

    try {
        // Health check
        if (path === '/health' && method === 'GET') {
            sendJson(res, 200, {
                status: 'healthy',
                uptime: Date.now() - startTime,
                requestCount,
                codexRunning: codexProcess !== null,
                playwrightMcpRunning: playwrightMcpProcess !== null,
                browserMode: BROWSER_MODE,
                cdpEndpoint: getCdpEndpoint(),
            });
            return;
        }

        // Get status
        if (path === '/status' && method === 'GET') {
            sendJson(res, 200, {
                uptime: Date.now() - startTime,
                requestCount,
                codexRunning: codexProcess !== null,
                playwrightMcpRunning: playwrightMcpProcess !== null,
                browserMode: BROWSER_MODE,
                cdpEndpoint: getCdpEndpoint(),
                apiPort: API_PORT,
                vncEnabled: process.env.VNC_ENABLED === 'true',
                heartbeatEnabled,
                lastHeartbeat: Date.now() - lastHeartbeat,
            });
            return;
        }

        // Heartbeat - keeps container alive
        if (path === '/heartbeat' && method === 'POST') {
            receiveHeartbeat();
            sendJson(res, 200, {
                success: true,
                timeout: HEARTBEAT_TIMEOUT_MS,
                message: 'Heartbeat received'
            });
            return;
        }

        // Execute Codex prompt
        if (path === '/codex/execute' && method === 'POST') {
            const body = await parseBody(req);

            if (!body.prompt) {
                sendJson(res, 400, { error: 'prompt is required' });
                return;
            }

            // For streaming response
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
            });

            executeCodex(
                body.prompt,
                {
                    mode: body.mode,
                    model: body.model,
                    workDir: body.workDir,
                    prePrompt: body.prePrompt,
                    env: body.env,
                },
                (data) => {
                    res.write(`data: ${JSON.stringify({ type: 'stdout', data })}\n\n`);
                },
                (error) => {
                    res.write(`data: ${JSON.stringify({ type: 'stderr', data: error })}\n\n`);
                },
                (code) => {
                    res.write(`data: ${JSON.stringify({ type: 'exit', code })}\n\n`);
                    res.end();
                }
            );
            return;
        }

        // Stop Codex execution
        if (path === '/codex/stop' && method === 'POST') {
            if (codexProcess) {
                codexProcess.kill('SIGTERM');
                sendJson(res, 200, { success: true, message: 'Codex process stopped' });
            } else {
                sendJson(res, 200, { success: false, message: 'No Codex process running' });
            }
            return;
        }

        // Start Playwright MCP
        if (path === '/playwright/start' && method === 'POST') {
            startPlaywrightMcp();
            sendJson(res, 200, { success: true, message: 'Playwright MCP starting' });
            return;
        }

        // Stop Playwright MCP
        if (path === '/playwright/stop' && method === 'POST') {
            if (playwrightMcpProcess) {
                playwrightMcpProcess.kill('SIGTERM');
                sendJson(res, 200, { success: true, message: 'Playwright MCP stopped' });
            } else {
                sendJson(res, 200, { success: false, message: 'No Playwright MCP running' });
            }
            return;
        }

        // Get CDP endpoint info
        if (path === '/cdp/info' && method === 'GET') {
            sendJson(res, 200, {
                endpoint: getCdpEndpoint(),
                browserMode: BROWSER_MODE,
            });
            return;
        }

        // 404 for unknown routes
        sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
        console.error('[API] Error:', err);
        sendJson(res, 500, { error: err.message || 'Internal server error' });
    }
}

// Create HTTP server
const server = http.createServer(handleRequest);

// Handle server errors
server.on('error', (err) => {
    console.error('[API] Server error:', err);
    process.exit(1);
});

// Start server
server.listen(API_PORT, '0.0.0.0', () => {
    console.log(`[API] GnuNae Sandbox API server listening on port ${API_PORT}`);
    console.log(`[API] Health check: http://localhost:${API_PORT}/health`);
    console.log(`[API] Browser mode: ${BROWSER_MODE}`);
    console.log(`[API] CDP endpoint: ${getCdpEndpoint()}`);
});

// Graceful shutdown
function shutdown() {
    console.log('[API] Shutting down...');

    if (codexProcess) {
        codexProcess.kill('SIGTERM');
    }
    if (playwrightMcpProcess) {
        playwrightMcpProcess.kill('SIGTERM');
    }

    server.close(() => {
        console.log('[API] Server closed');
        process.exit(0);
    });

    // Force exit after 5 seconds
    setTimeout(() => {
        console.log('[API] Force exit');
        process.exit(1);
    }, 5000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
