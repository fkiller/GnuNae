import { app, BrowserWindow, BrowserView, ipcMain, session, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { AuthService } from '../core/auth';

// Enable Chrome DevTools Protocol for Playwright MCP integration
// Bound to localhost only for security
app.commandLine.appendSwitch('remote-debugging-port', '9222');
app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');

/**
 * Ensure Playwright MCP is configured in the global Codex config.
 * Adds the playwright MCP server entry if not present.
 * Does NOT remove other MCPs - we use the prompt to guide Codex to use Playwright.
 */
function ensurePlaywrightMcpConfig(): void {
    const codexConfigDir = path.join(os.homedir(), '.codex');
    const codexConfigPath = path.join(codexConfigDir, 'config.toml');

    // Ensure .codex directory exists
    if (!fs.existsSync(codexConfigDir)) {
        fs.mkdirSync(codexConfigDir, { recursive: true });
    }

    // Read existing config or start with empty
    let configContent = '';
    if (fs.existsSync(codexConfigPath)) {
        configContent = fs.readFileSync(codexConfigPath, 'utf-8');
    }

    // Check if playwright MCP is already configured
    if (configContent.includes('[mcp_servers.playwright]')) {
        console.log('[Config] Playwright MCP already configured');
        return;
    }

    // Add Playwright MCP configuration with extended timeout
    const playwrightConfig = `

# GnuNae Playwright MCP - Auto-configured
[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest", "--cdp-endpoint", "http://127.0.0.1:9222"]
startup_timeout_sec = 30
`;

    const newConfig = configContent.trimEnd() + playwrightConfig;
    fs.writeFileSync(codexConfigPath, newConfig, 'utf-8');
    console.log('[Config] Added Playwright MCP to Codex config:', codexConfigPath);
}

// Read package.json for app info
const packageJson = require('../../package.json');
const APP_NAME = packageJson.productName || 'GnuNae';
const APP_VERSION = packageJson.version || '0.0.1';

let codexProcess: ChildProcess | null = null;

let mainWindow: BrowserWindow | null = null;
let browserView: BrowserView | null = null;
let authService: AuthService;

const SIDEBAR_WIDTH = 380;
const TOPBAR_HEIGHT = 50;

// OpenAI/ChatGPT OAuth URLs
const OPENAI_AUTH_URL = 'https://chatgpt.com/auth/login';
const CHATGPT_DOMAIN = 'chatgpt.com';

// Set app name for macOS menu bar
app.setName(APP_NAME);

// Create custom menu for macOS
function createMenu(): void {
    const isMac = process.platform === 'darwin';

    const template: Electron.MenuItemConstructorOptions[] = [
        // App menu (macOS only)
        ...(isMac ? [{
            label: APP_NAME,
            submenu: [
                {
                    label: `About ${APP_NAME}`,
                    click: () => {
                        const { dialog } = require('electron');
                        dialog.showMessageBox({
                            type: 'info',
                            title: `About ${APP_NAME}`,
                            message: APP_NAME,
                            detail: `Version ${APP_VERSION}\n\nAI-powered browser with Codex sidebar for intelligent web automation.\n\n© 2024 Won Dong`,
                        });
                    }
                },
                { type: 'separator' as const },
                { role: 'services' as const },
                { type: 'separator' as const },
                { role: 'hide' as const },
                { role: 'hideOthers' as const },
                { role: 'unhide' as const },
                { type: 'separator' as const },
                { role: 'quit' as const }
            ] as Electron.MenuItemConstructorOptions[]
        }] : []),
        // File menu
        {
            label: 'File',
            submenu: [
                isMac ? { role: 'close' as const } : { role: 'quit' as const }
            ]
        },
        // Edit menu
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' as const },
                { role: 'redo' as const },
                { type: 'separator' as const },
                { role: 'cut' as const },
                { role: 'copy' as const },
                { role: 'paste' as const },
                { role: 'selectAll' as const }
            ]
        },
        // View menu
        {
            label: 'View',
            submenu: [
                { role: 'reload' as const },
                { role: 'forceReload' as const },
                { role: 'toggleDevTools' as const },
                { type: 'separator' as const },
                { role: 'resetZoom' as const },
                { role: 'zoomIn' as const },
                { role: 'zoomOut' as const },
                { type: 'separator' as const },
                { role: 'togglefullscreen' as const }
            ]
        },
        // Window menu
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' as const },
                { role: 'zoom' as const },
                ...(isMac ? [
                    { type: 'separator' as const },
                    { role: 'front' as const }
                ] : [
                    { role: 'close' as const }
                ])
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

function createWindow(): void {
    // Initialize auth service
    authService = new AuthService();

    // Create the main window
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 15, y: 15 },
    });

    // Create the BrowserView for web content
    browserView = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false, // Disable sandbox to allow WebAuthn/passkeys
            webSecurity: true,
            allowRunningInsecureContent: false,
        },
    });

    mainWindow.setBrowserView(browserView);
    updateLayout();

    // Playwright MCP connects via CDP (remote-debugging-port=9222)


    // Load the UI
    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(path.join(__dirname, '../ui/index.html'));
    }

    // Uncomment to debug: mainWindow.webContents.openDevTools({ mode: 'detach' });

    // Check auth and load appropriate page
    if (authService.isAuthenticated()) {
        // User is authenticated, load default page
        browserView.webContents.loadURL('https://www.google.com');
    } else {
        // User not authenticated, load login page
        browserView.webContents.loadFile(path.join(__dirname, '../ui/login.html'));
    }

    // Handle resize
    mainWindow.on('resize', updateLayout);

    // Track URL changes and detect successful login
    browserView.webContents.on('did-navigate', async (_, url) => {
        console.log('[Main] Navigated to:', url);
        mainWindow?.webContents.send('browser:url-updated', url);

        // Check if user landed on ChatGPT main page (not auth pages)
        if (url.includes(CHATGPT_DOMAIN) && !url.includes('/auth')) {
            console.log('[Main] On ChatGPT, checking auth...');
            const success = await authService.extractTokenFromCookies(browserView!.webContents.session);
            if (success) {
                console.log('[Main] Auth successful, notifying UI');
                mainWindow?.webContents.send('auth:status-changed', true);
            }
        }
    });

    // Also check on page finish loading (catches SPA navigations)
    browserView.webContents.on('did-finish-load', async () => {
        const url = browserView?.webContents.getURL() || '';
        if (url.includes(CHATGPT_DOMAIN) && !url.includes('/auth')) {
            console.log('[Main] Page finished loading on ChatGPT, checking auth...');
            const success = await authService.extractTokenFromCookies(browserView!.webContents.session);
            if (success && !authService.isAuthenticated()) {
                // Re-load to get fresh state
            }
            if (success) {
                mainWindow?.webContents.send('auth:status-changed', true);
            }
        }
    });

    browserView.webContents.on('did-navigate-in-page', (_, url) => {
        mainWindow?.webContents.send('browser:url-updated', url);
    });

    // Track page title changes
    browserView.webContents.on('page-title-updated', (_, title) => {
        mainWindow?.webContents.send('browser:title-updated', title);
    });

    // Track loading state
    browserView.webContents.on('did-start-loading', () => {
        mainWindow?.webContents.send('browser:loading', true);
    });

    browserView.webContents.on('did-stop-loading', () => {
        mainWindow?.webContents.send('browser:loading', false);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        browserView = null;
    });
}

function updateLayout(): void {
    if (!mainWindow || !browserView) return;

    const bounds = mainWindow.getBounds();
    const contentBounds = mainWindow.getContentBounds();

    browserView.setBounds({
        x: 0,
        y: TOPBAR_HEIGHT,
        width: contentBounds.width - SIDEBAR_WIDTH,
        height: contentBounds.height - TOPBAR_HEIGHT,
    });
}

// IPC Handlers
function setupIpcHandlers(): void {
    // UI handlers - toggle BrowserView for overlays
    ipcMain.handle('ui:hide-browser', () => {
        if (browserView && mainWindow) {
            mainWindow.removeBrowserView(browserView);
        }
        return { success: true };
    });

    ipcMain.handle('ui:show-browser', () => {
        if (browserView && mainWindow) {
            mainWindow.setBrowserView(browserView);
            updateLayout();
        }
        return { success: true };
    });

    // Settings handlers
    ipcMain.handle('settings:get', () => {
        const { settingsService } = require('../core/settings');
        return settingsService.getAll();
    });

    ipcMain.handle('settings:update', (_, settings) => {
        const { settingsService } = require('../core/settings');
        settingsService.update(settings);
        return { success: true };
    });

    // Auth handlers
    ipcMain.handle('auth:is-authenticated', () => {
        return authService.isAuthenticated();
    });

    ipcMain.handle('auth:get-user', () => {
        return authService.getEmail();
    });

    ipcMain.handle('auth:start-google-login', async () => {
        if (!browserView) return { success: false };

        // Navigate to OpenAI login page which offers Google sign-in
        await browserView.webContents.loadURL(OPENAI_AUTH_URL);
        return { success: true };
    });

    ipcMain.handle('auth:logout', async () => {
        authService.clearToken();

        // Clear cookies
        if (browserView) {
            await browserView.webContents.session.clearStorageData({
                storages: ['cookies'],
            });
        }

        // Navigate back to login page
        browserView?.webContents.loadFile(path.join(__dirname, '../ui/login.html'));
        mainWindow?.webContents.send('auth:status-changed', false);

        return { success: true };
    });

    ipcMain.handle('auth:show-login', async () => {
        browserView?.webContents.loadFile(path.join(__dirname, '../ui/login.html'));
        return { success: true };
    });

    // Manual auth check - called by UI when it suspects user might be logged in
    ipcMain.handle('auth:check-now', async () => {
        if (!browserView) return { authenticated: false };
        console.log('[Main] Manual auth check requested');
        const success = await authService.extractTokenFromCookies(browserView.webContents.session);
        return { authenticated: success };
    });

    // Navigate to URL
    ipcMain.handle('browser:navigate', async (_, url: string) => {
        if (!browserView) return { success: false, error: 'No browser view' };

        try {
            let targetUrl = url;
            if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
                targetUrl = 'https://' + url;
            }
            await browserView.webContents.loadURL(targetUrl);
            return { success: true, url: targetUrl };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    });

    // Go back
    ipcMain.handle('browser:go-back', async () => {
        if (browserView?.webContents.canGoBack()) {
            browserView.webContents.goBack();
            return { success: true };
        }
        return { success: false, error: 'Cannot go back' };
    });

    // Go forward
    ipcMain.handle('browser:go-forward', async () => {
        if (browserView?.webContents.canGoForward()) {
            browserView.webContents.goForward();
            return { success: true };
        }
        return { success: false, error: 'Cannot go forward' };
    });

    // Reload
    ipcMain.handle('browser:reload', async () => {
        browserView?.webContents.reload();
        return { success: true };
    });

    // Get current URL
    ipcMain.handle('browser:get-url', async () => {
        return browserView?.webContents.getURL() || '';
    });

    // Get page content
    ipcMain.handle('browser:get-content', async () => {
        if (!browserView) return '';
        try {
            return await browserView.webContents.executeJavaScript('document.body.innerHTML');
        } catch {
            return '';
        }
    });

    // Execute JavaScript in the page
    ipcMain.handle('browser:execute-js', async (_, script: string) => {
        if (!browserView) return { success: false, error: 'No browser view' };
        try {
            const result = await browserView.webContents.executeJavaScript(script);
            return { success: true, result };
        } catch (error) {
            return { success: false, error: String(error) };
        }
    });

    // Execute Codex CLI with prompt
    ipcMain.handle('codex:execute', async (_, prompt: string) => {
        console.log('[Main] Executing Codex with prompt:', prompt.substring(0, 50) + '...');

        // Kill any existing Codex process
        if (codexProcess) {
            codexProcess.kill();
            codexProcess = null;
        }

        // Get page snapshot to include in prompt
        let pageContext = '';
        if (browserView) {
            try {
                const url = browserView.webContents.getURL();
                const title = browserView.webContents.getTitle();

                // Get page text content
                const pageContent = await browserView.webContents.executeJavaScript(`
                    (function() {
                        const elements = [];
                        document.querySelectorAll('a, button, input, h1, h2, h3, p, li, span, div').forEach(el => {
                            const text = el.innerText?.trim();
                            if (text && text.length > 0 && text.length < 500) {
                                elements.push(text);
                            }
                        });
                        return [...new Set(elements)].slice(0, 100).join('\\n');
                    })()
                `);

                pageContext = `\n\nCurrent page: ${url}\nTitle: ${title}\n\nPage content:\n${pageContent}\n\n---\nBased on the above page content: `;
            } catch (e) {
                console.log('[Main] Failed to get page snapshot:', e);
            }
        }

        return new Promise((resolve) => {
            let output = '';
            let errorOutput = '';

            // Get prePrompt from settings
            const { settingsService } = require('../core/settings');
            const prePrompt = settingsService.get('codex')?.prePrompt || '';

            // Combine: prePrompt + pageContext + user prompt
            const fullPrompt = (prePrompt ? prePrompt + '\n\n---\n\n' : '') + pageContext + prompt;

            // Use local Codex CLI from node_modules
            // Config is read from ~/.codex/config.toml (update there for MCP settings)
            const isWindows = process.platform === 'win32';
            const codexBinName = isWindows ? 'codex.cmd' : 'codex';
            const codexBin = path.join(__dirname, '../../node_modules/.bin', codexBinName);

            codexProcess = spawn(codexBin, ['exec'], {
                shell: isWindows ? process.env.ComSpec || 'cmd.exe' : true,
                cwd: path.join(__dirname, '../..'),
                env: {
                    ...process.env,
                    // UTF-8 encoding for proper Korean/Unicode support
                    PYTHONIOENCODING: 'utf-8',
                    PYTHONUTF8: '1',
                    LANG: 'en_US.UTF-8',
                    // Ensure Windows can find executables
                    ...(isWindows && {
                        ComSpec: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
                        SystemRoot: process.env.SystemRoot || 'C:\\Windows',
                        // Windows UTF-8 code page
                        CHCP: '65001',
                    }),
                },
            });

            // Write prompt to stdin
            if (codexProcess.stdin) {
                codexProcess.stdin.write(fullPrompt);
                codexProcess.stdin.end();
            }

            codexProcess.stdout?.on('data', (data: Buffer) => {
                const chunk = data.toString('utf8');
                output += chunk;
                console.log('[Codex stdout]', chunk);
                // Send streaming output to renderer
                mainWindow?.webContents.send('codex:output', { type: 'stdout', data: chunk });
            });

            codexProcess.stderr?.on('data', (data: Buffer) => {
                const chunk = data.toString('utf8');
                errorOutput += chunk;
                console.log('[Codex stderr]', chunk);
                mainWindow?.webContents.send('codex:output', { type: 'stderr', data: chunk });
            });

            codexProcess.on('close', (code) => {
                console.log('[Main] Codex process exited with code:', code);
                mainWindow?.webContents.send('codex:complete', { code, output, errorOutput });
                codexProcess = null;
                resolve({ success: code === 0, output, errorOutput, code });
            });

            codexProcess.on('error', (err) => {
                console.error('[Main] Codex spawn error:', err);
                mainWindow?.webContents.send('codex:error', { error: err.message });
                codexProcess = null;
                resolve({ success: false, error: err.message });
            });
        });
    });

    // Stop running Codex process
    ipcMain.handle('codex:stop', async () => {
        if (codexProcess) {
            codexProcess.kill();
            codexProcess = null;
            return { success: true };
        }
        return { success: false, error: 'No running process' };
    });
}

app.whenReady().then(() => {
    // Ensure Codex is configured with Playwright MCP
    ensurePlaywrightMcpConfig();

    createMenu();
    createWindow();
    setupIpcHandlers();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
