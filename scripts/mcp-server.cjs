#!/usr/bin/env node
/**
 * MCP Server using official SDK - Stdio transport
 * Forwards browser commands to Electron app via HTTP
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const ELECTRON_URL = 'http://localhost:3847';

// Helper to call Electron MCP server
async function callElectron(tool, args) {
    const request = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: tool, arguments: args }
    };

    try {
        const response = await fetch(`${ELECTRON_URL}/mcp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });
        const data = await response.json();
        return data.result?.content?.[0]?.text || JSON.stringify(data);
    } catch (error) {
        return `Error: ${error.message}`;
    }
}

// Create server
const server = new McpServer({
    name: 'electron-browser',
    version: '1.0.0',
});

// Register tools using zod schemas
server.tool(
    'browser_navigate',
    'Navigate to a URL in the Electron browser',
    { url: z.string().describe('URL to navigate to') },
    async ({ url }) => {
        const result = await callElectron('browser_navigate', { url });
        return { content: [{ type: 'text', text: result }] };
    }
);

server.tool(
    'browser_snapshot',
    'Get a text snapshot of the current page in Electron browser',
    {},
    async () => {
        const result = await callElectron('browser_snapshot', {});
        return { content: [{ type: 'text', text: result }] };
    }
);

server.tool(
    'browser_click',
    'Click an element on the page',
    {
        selector: z.string().optional().describe('CSS selector of element to click'),
        text: z.string().optional().describe('Text content of element to click')
    },
    async ({ selector, text }) => {
        const result = await callElectron('browser_click', { selector, text });
        return { content: [{ type: 'text', text: result }] };
    }
);

server.tool(
    'browser_type',
    'Type text into an input field',
    {
        selector: z.string().optional().describe('CSS selector of input field'),
        text: z.string().describe('Text to type')
    },
    async ({ selector, text }) => {
        const result = await callElectron('browser_type', { selector, text });
        return { content: [{ type: 'text', text: result }] };
    }
);

server.tool(
    'browser_scroll',
    'Scroll the page up or down',
    {
        direction: z.enum(['up', 'down']).describe('Scroll direction'),
        amount: z.number().optional().describe('Pixels to scroll (default 500)')
    },
    async ({ direction, amount }) => {
        const result = await callElectron('browser_scroll', { direction, amount: amount || 500 });
        return { content: [{ type: 'text', text: result }] };
    }
);

// Start server with stdio transport
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch(console.error);
