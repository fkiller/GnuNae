import { BrowserView } from 'electron';
import * as http from 'http';

let browserViewRef: BrowserView | null = null;
let server: http.Server | null = null;

const MCP_PORT = 3847;

// Tool definitions for MCP
const TOOLS = [
    {
        name: 'browser_navigate',
        description: 'Navigate to a URL in the browser',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'URL to navigate to' }
            },
            required: ['url']
        }
    },
    {
        name: 'browser_snapshot',
        description: 'Get a text snapshot of the current page (accessibility tree)',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'browser_click',
        description: 'Click an element on the page',
        inputSchema: {
            type: 'object',
            properties: {
                selector: { type: 'string', description: 'CSS selector of element to click' },
                text: { type: 'string', description: 'Text content of element to click (alternative to selector)' }
            }
        }
    },
    {
        name: 'browser_type',
        description: 'Type text into an input field',
        inputSchema: {
            type: 'object',
            properties: {
                selector: { type: 'string', description: 'CSS selector of input field' },
                text: { type: 'string', description: 'Text to type' }
            },
            required: ['text']
        }
    },
    {
        name: 'browser_fill_form',
        description: 'Fill form fields with values',
        inputSchema: {
            type: 'object',
            properties: {
                fields: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            selector: { type: 'string' },
                            value: { type: 'string' }
                        }
                    },
                    description: 'Array of {selector, value} pairs to fill'
                }
            },
            required: ['fields']
        }
    },
    {
        name: 'browser_scroll',
        description: 'Scroll the page',
        inputSchema: {
            type: 'object',
            properties: {
                direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction' },
                amount: { type: 'number', description: 'Pixels to scroll (default 500)' }
            }
        }
    }
];

// Execute tool on BrowserView
async function executeTool(name: string, args: Record<string, any>): Promise<any> {
    if (!browserViewRef) {
        return { error: 'No browser view available' };
    }

    const webContents = browserViewRef.webContents;

    try {
        switch (name) {
            case 'browser_navigate': {
                let url = args.url;
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    url = 'https://' + url;
                }
                await webContents.loadURL(url);
                return { success: true, url, title: webContents.getTitle() };
            }

            case 'browser_snapshot': {
                // Get simplified accessibility tree / text content
                const snapshot = await webContents.executeJavaScript(`
          (function() {
            const result = [];
            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
              null
            );
            
            let node;
            while (node = walker.nextNode()) {
              if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent?.trim();
                if (text && text.length > 0) {
                  result.push(text);
                }
              } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node;
                const tag = el.tagName.toLowerCase();
                
                // Include interactive elements with their attributes
                if (['a', 'button', 'input', 'select', 'textarea', 'label'].includes(tag)) {
                  const info = { tag };
                  if (el.id) info.id = el.id;
                  if (el.name) info.name = el.name;
                  if (el.type) info.type = el.type;
                  if (el.placeholder) info.placeholder = el.placeholder;
                  if (el.value) info.value = el.value;
                  if (el.href) info.href = el.href;
                  if (el.innerText) info.text = el.innerText.substring(0, 100);
                  result.push(info);
                }
              }
            }
            return result.slice(0, 200); // Limit size
          })()
        `);
                return {
                    url: webContents.getURL(),
                    title: webContents.getTitle(),
                    content: snapshot
                };
            }

            case 'browser_click': {
                const { selector, text } = args;
                let clickScript: string;

                if (selector) {
                    clickScript = `document.querySelector('${selector}')?.click()`;
                } else if (text) {
                    clickScript = `
            Array.from(document.querySelectorAll('button, a, [role="button"]'))
              .find(el => el.innerText.includes('${text.replace(/'/g, "\\'")}'))
              ?.click()
          `;
                } else {
                    return { error: 'Need selector or text to click' };
                }

                await webContents.executeJavaScript(clickScript);
                return { success: true, clicked: selector || text };
            }

            case 'browser_type': {
                const { selector, text } = args;
                const typeScript = selector
                    ? `
            const el = document.querySelector('${selector}');
            if (el) {
              el.focus();
              el.value = '${text.replace(/'/g, "\\'")}';
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          `
                    : `
            const el = document.activeElement;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
              el.value = '${text.replace(/'/g, "\\'")}';
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          `;

                await webContents.executeJavaScript(typeScript);
                return { success: true, typed: text };
            }

            case 'browser_fill_form': {
                const { fields } = args;
                for (const field of fields) {
                    await webContents.executeJavaScript(`
            const el = document.querySelector('${field.selector}');
            if (el) {
              el.value = '${field.value.replace(/'/g, "\\'")}';
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          `);
                }
                return { success: true, filled: fields.length };
            }

            case 'browser_scroll': {
                const { direction, amount = 500 } = args;
                const scrollAmount = direction === 'up' ? -amount : amount;
                await webContents.executeJavaScript(`window.scrollBy(0, ${scrollAmount})`);
                return { success: true, scrolled: scrollAmount };
            }

            default:
                return { error: `Unknown tool: ${name}` };
        }
    } catch (error) {
        return { error: String(error) };
    }
}

// Handle MCP JSON-RPC requests
async function handleMcpRequest(body: any): Promise<any> {
    const { method, params, id } = body;

    switch (method) {
        case 'initialize':
            return {
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    serverInfo: { name: 'electron-browser-mcp', version: '1.0.0' }
                }
            };

        case 'tools/list':
            return {
                jsonrpc: '2.0',
                id,
                result: { tools: TOOLS }
            };

        case 'tools/call':
            const { name, arguments: args } = params;
            const result = await executeTool(name, args || {});
            return {
                jsonrpc: '2.0',
                id,
                result: {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                }
            };

        default:
            return {
                jsonrpc: '2.0',
                id,
                error: { code: -32601, message: `Method not found: ${method}` }
            };
    }
}

// Start MCP HTTP server
export function startMcpServer(browserView: BrowserView): void {
    browserViewRef = browserView;

    server = http.createServer(async (req, res) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        if (req.method === 'POST' && req.url === '/mcp') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const request = JSON.parse(body);
                    const response = await handleMcpRequest(request);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(response));
                } catch (error) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: String(error) }));
                }
            });
        } else {
            res.writeHead(404);
            res.end('Not found');
        }
    });

    server.listen(MCP_PORT, () => {
        console.log(`[MCP] Electron Browser MCP server running on http://localhost:${MCP_PORT}/mcp`);
    });
}

// Update BrowserView reference if it changes
export function updateBrowserView(browserView: BrowserView): void {
    browserViewRef = browserView;
}

// Stop server
export function stopMcpServer(): void {
    if (server) {
        server.close();
        server = null;
    }
}
